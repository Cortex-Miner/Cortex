#include "stratum_client.h"
#include "autolykos2_cuda_miner.h"
#include "autolykos2_cuda_miner.cuh"
#include <iostream>
#include <vector>
#include <cstring>
#include <unistd.h>
#include <arpa/inet.h>
#include <netdb.h>

// Helper: Convert hex string to bytes
static std::vector<uint8_t> hex_to_bytes(const std::string& hex) {
    std::vector<uint8_t> bytes;
    if (hex.length() % 2 != 0) return bytes;
    for (size_t i = 0; i < hex.length(); i += 2) {
        uint8_t byte = static_cast<uint8_t>(strtoul(hex.substr(i, 2).c_str(), nullptr, 16));
        bytes.push_back(byte);
    }
    return bytes;
}

StratumClient::StratumClient(const std::string& host, int port, const std::string& address)
    : host_(host), port_(port), address_(address), sockfd_(-1), last_epoch_(-1), job_id_(0), worker_id_("worker") {}

bool StratumClient::connect_to_pool() {
    struct sockaddr_in server_addr;
    struct hostent* server = gethostbyname(host_.c_str());
    if (!server) {
        std::cerr << "[ERROR] No such host: " << host_ << std::endl;
        return false;
    }

    sockfd_ = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd_ < 0) {
        std::cerr << "[ERROR] Could not create socket." << std::endl;
        return false;
    }

    memset((char*)&server_addr, 0, sizeof(server_addr));
    server_addr.sin_family = AF_INET;
    memcpy((char*)&server_addr.sin_addr.s_addr, (char*)server->h_addr, server->h_length);
    server_addr.sin_port = htons(port_);

    if (connect(sockfd_, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        std::cerr << "[ERROR] Could not connect to pool." << std::endl;
        close(sockfd_);
        sockfd_ = -1;
        return false;
    }
    std::cout << "[POOL] Connected to " << host_ << ":" << port_ << std::endl;
    return true;
}

bool StratumClient::send_json(const nlohmann::json& j) {
    std::string msg = j.dump() + "\n";
    ssize_t sent = send(sockfd_, msg.c_str(), msg.length(), 0);
    return sent == (ssize_t)msg.length();
}

bool StratumClient::recv_json(nlohmann::json& j) {
    std::string line;
    char buf[1024];
    while (true) {
        ssize_t n = recv(sockfd_, buf, sizeof(buf) - 1, 0);
        if (n <= 0) return false;
        buf[n] = 0;
        line += buf;
        size_t pos = line.find('\n');
        if (pos != std::string::npos) {
            std::string json_str = line.substr(0, pos);
            try {
                j = nlohmann::json::parse(json_str);
                return true;
            } catch (...) {
                return false;
            }
        }
    }
    return false;
}

bool StratumClient::connect_and_mine() {
    while (true) {
        if (!connect_to_pool()) {
            sleep(5);
            continue;
        }

        // 1. Stratum subscribe
        nlohmann::json subscribe_req = {
            {"id", ++job_id_},
            {"method", "mining.subscribe"},
            {"params", {"ergo-miner/1.0.0", "Linux"}}
        };
        send_json(subscribe_req);

        // 2. Authorize (login) with wallet address
        nlohmann::json auth_req = {
            {"id", ++job_id_},
            {"method", "mining.authorize"},
            {"params", {address_, "x"}}
        };
        send_json(auth_req);

        while (true) {
            nlohmann::json resp;
            if (!recv_json(resp)) {
                std::cerr << "[ERROR] Connection lost. Reconnecting..." << std::endl;
                close(sockfd_);
                sockfd_ = -1;
                break;
            }

            // Check for job
            if (resp.contains("method") && resp["method"] == "mining.set_target") {
                // Pool is setting the target; ignore (handled in job)
                continue;
            }
            if (resp.contains("method") && resp["method"] == "mining.set_difficulty") {
                // Pool is setting the difficulty; ignore
                continue;
            }
            if (resp.contains("method") && resp["method"] == "mining.notify") {
                auto params = resp["params"];
                if (!params.is_array() || params.size() < 7) continue;

                nlohmann::json job;
                job["job_id"] = params[0];
                job["height"] = params[1];
                job["seed"] = params[2];
                job["header"] = params[3];
                job["target"] = params[4];

                handle_job(job);
            }
        }
    }
    return true;
}

void StratumClient::handle_job(const nlohmann::json& job) {
    int block_height = job.value("height", -1);
    int epoch = block_height / 1024;
    std::string seed_hex = job.value("seed", "");
    std::string header_hex = job.value("header", "");
    std::string target_hex = job.value("target", "");
    std::string job_id = job.value("job_id", "");

    if (seed_hex.length() != 64 || header_hex.length() != 152 || target_hex.length() != 64) {
        std::cerr << "[ERROR] Job data malformed." << std::endl;
        return;
    }
    std::vector<uint8_t> seed = hex_to_bytes(seed_hex);
    std::vector<uint8_t> header = hex_to_bytes(header_hex);
    std::vector<uint8_t> target = hex_to_bytes(target_hex);

    if (epoch != last_epoch_) {
        std::cout << "[STRATUM] New epoch detected (" << epoch << "). Building dataset..." << std::endl;
        if (!autolykos2_cuda_generate_dataset(seed.data())) {
            std::cerr << "[ERROR] Failed to build dataset for epoch " << epoch << std::endl;
            exit(1);
        }
        last_epoch_ = epoch;
        std::cout << "[STRATUM] Dataset ready for epoch " << epoch << std::endl;
    }

    uint64_t start_nonce = 0;
    uint64_t nonce_range = 262144; // 256K nonces per batch
    uint64_t foundNonce = 0;
    uint8_t foundHash[32] = {0};

    std::cout << "[STRATUM] Mining job: height=" << block_height << " epoch=" << epoch << std::endl;

    if (launchMiningKernel(header.data(), target.data(), start_nonce, nonce_range, foundNonce, foundHash)) {
        std::cout << "[STRATUM] Solution found! Nonce: " << std::hex << foundNonce << std::dec << std::endl;
        submit_share(job, foundNonce);
    } else {
        std::cout << "[STRATUM] No solution found in range." << std::endl;
    }
}

bool StratumClient::submit_share(const nlohmann::json& job, uint64_t nonce) {
    std::ostringstream nonce_hex;
    nonce_hex << std::setw(16) << std::setfill('0') << std::hex << nonce;
    nlohmann::json submit_req = {
        {"id", ++job_id_},
        {"method", "mining.submit"},
        {"params", {
            address_,
            job.value("job_id", ""),
            nonce_hex.str(),
            "" // result field, not needed for pool
        }}
    };
    return send_json(submit_req);
}
