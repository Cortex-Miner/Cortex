#include "stratum_client.h"
#include "autolykos2_cuda_miner.h"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <cstring>
#include <netdb.h>
#include <unistd.h>
#include <thread>
#include <vector>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

StratumClient::StratumClient(const std::string& host,
                             int port,
                             bool ssl,
                             const std::string& worker,
                             const std::string& password,
                             const std::string& address)
    : host_(host),
      port_(port),
      ssl_(ssl),
      worker_(worker),
      password_(password),
      address_(address),
      sock_(-1),
      running_(false)
{
    current_job_.active = false;
}

StratumClient::~StratumClient() {
    stop();
}

void StratumClient::run() {
    running_ = true;
    while (running_) {
        if (!connect()) {
            std::cout << "[ERROR] Could not connect to pool. Retrying in 10 seconds...\n";
            sleep(10);
            continue;
        }

        // Immediately send subscribe and authorize, as done by real miners
        subscribe();
        authorize();
        std::cout << "[DEBUG] Sent subscribe and authorize" << std::endl;

        listener_ = std::thread(&StratumClient::listen, this);
        miner_ = std::thread(&StratumClient::mining_thread, this);

        listener_.join();
        miner_.join();

        close(sock_);
        sock_ = -1;

        if (running_) {
            std::cout << "[ERROR] Connection lost. Reconnecting in 10 seconds...\n";
            sleep(10);
        }
    }
}

bool StratumClient::connect() {
    if (sock_ > 0) {
        close(sock_);
        sock_ = -1;
    }
    struct addrinfo hints{}, *res;
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    char portstr[6];
    snprintf(portstr, sizeof(portstr), "%d", port_);
    int err = getaddrinfo(host_.c_str(), portstr, &hints, &res);
    if (err != 0) {
        std::cout << "[STRATUM] getaddrinfo error: " << gai_strerror(err) << std::endl;
        return false;
    }
    sock_ = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (sock_ < 0) {
        std::cout << "[STRATUM] socket error: " << strerror(errno) << std::endl;
        freeaddrinfo(res);
        return false;
    }
    if (::connect(sock_, res->ai_addr, res->ai_addrlen) < 0) {
        std::cout << "[STRATUM] connect() error: " << strerror(errno) << std::endl;
        close(sock_);
        sock_ = -1;
        freeaddrinfo(res);
        return false;
    }
    freeaddrinfo(res);
    std::cout << "[STRATUM] Connected to pool " << host_ << ":" << port_ << std::endl;
    return true;
}

void StratumClient::send_json(const json& j) {
    std::string data = j.dump() + "\n";
    std::cout << "[STRATUM] SENT: " << data;
    send(sock_, data.c_str(), data.size(), 0);
}

void StratumClient::subscribe() {
    json subscribe = {
        {"id", 1},
        {"method", "mining.subscribe"},
        {"params", json::array()}
    };
    send_json(subscribe);
}

void StratumClient::authorize() {
    std::string fullWorker = worker_;
    // Always build address.worker for pools like WoolyPooly, SigmaNa⁠uts
    if (worker_.find('.') == std::string::npos) {
        fullWorker = address_ + "." + worker_;
    }
    json authorize = {
        {"id", 2},
        {"method", "mining.authorize"},
        {"params", {fullWorker, password_}}
    };
    send_json(authorize);
}

void StratumClient::listen() {
    std::cout << "[STRATUM] Entered listen()" << std::endl;
    char buffer[4096];
    std::string line;
    while (running_) {
        ssize_t n = recv(sock_, buffer, sizeof(buffer), 0);
        if (n <= 0) {
            std::cout << "[STRATUM] Socket closed or error." << std::endl;
            running_ = false;
            break;
        }
        for (ssize_t i = 0; i < n; ++i) {
            if (buffer[i] == '\n') {
                std::cout << "[STRATUM RAW LINE] " << line << std::endl;
                try {
                    auto msg = json::parse(line);
                    handle_message(msg);
                } catch (const std::exception& e) {
                    std::cerr << "[STRATUM JSON ERROR] " << e.what() << " (input: " << line << ")" << std::endl;
                }
                line.clear();
            } else {
                line += buffer[i];
            }
        }
    }
}

void StratumClient::handle_message(const json& msg) {
    std::cout << "[STRATUM DEBUG] handle_message called with: " << msg.dump() << std::endl;

    if (msg.contains("method") && msg["method"] == "mining.notify") {
        if (!msg.contains("params") || !msg["params"].is_array()) {
            std::cerr << "[ERROR] mining.notify has no params array!" << std::endl;
            return;
        }
        const auto& params = msg["params"];
        std::cout << "[STRATUM DEBUG] notify params: " << params.dump() << std::endl;

        std::lock_guard<std::mutex> lock(current_job_.mtx);

        current_job_.job_id = (params.size() > 0 && params[0].is_string()) ? params[0].get<std::string>() : "";
        // Height: int or string
        if (params.size() > 1 && !params[1].is_null()) {
            if (params[1].is_string()) {
                try { current_job_.height = std::stoul(params[1].get<std::string>()); }
                catch (...) { current_job_.height = 0; }
            } else if (params[1].is_number_integer() || params[1].is_number_unsigned()) {
                current_job_.height = params[1].get<uint32_t>();
            } else {
                current_job_.height = 0;
            }
        } else {
            current_job_.height = 0;
        }
        current_job_.header = (params.size() > 2 && params[2].is_string()) ? params[2].get<std::string>() : "";
        current_job_.target = (params.size() > 6 && params[6].is_string()) ? params[6].get<std::string>() : "";

        if (current_job_.header.empty() || current_job_.target.empty()) {
            std::cerr << "[ERROR] Job data malformed: header or target missing." << std::endl;
            current_job_.active = false;
            return;
        }

        current_job_.active = true;
        current_job_.cv.notify_all();

        std::stringstream ss;
        ss << "[STRATUM] New job received: "
           << "job_id=" << current_job_.job_id
           << ", height=" << current_job_.height
           << ", header.length=" << current_job_.header.size()
           << ", target.length=" << current_job_.target.size();
        std::cout << ss.str() << std::endl;
    }
}

void StratumClient::mining_thread() {
    // Your mining kernel logic...
}

void StratumClient::submit_share(const std::string& nonce_hex, const std::string& pow_hash) {
    std::string fullWorker = worker_;
    if (worker_.find('.') == std::string::npos) {
        fullWorker = address_ + "." + worker_;
    }
    json submit = {
        {"id", 4},
        {"method", "mining.submit"},
        {"params", {fullWorker, current_job_.job_id, nonce_hex, pow_hash}}
    };
    send_json(submit);
    std::cout << "[STRATUM] Submitted share: nonce=" << nonce_hex << std::endl;
}

void StratumClient::stop() {
    running_ = false;
    if (sock_ > 0) close(sock_);
    current_job_.cv.notify_all();
}

PoolJob& StratumClient::getCurrentJob() {
    return current_job_;
}
