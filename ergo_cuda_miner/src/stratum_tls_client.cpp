#include "stratum_client.h"
#include <netdb.h>
#include <unistd.h>
#include <cstring>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <sys/socket.h>
#include <arpa/inet.h>

StratumClient::StratumClient(const std::string& host, int port, const std::string& address)
    : pool_host(host), pool_port(port), miner_address(address), sockfd(-1), extra_nonce1(""), extra_nonce2_size(0) {}

bool StratumClient::connect_and_handshake() {
    struct addrinfo hints{}, *res;
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    std::string port_str = std::to_string(pool_port);
    if (getaddrinfo(pool_host.c_str(), port_str.c_str(), &hints, &res) != 0) {
        std::cerr << "[!] getaddrinfo failed" << std::endl;
        return false;
    }

    sockfd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (sockfd < 0) {
        std::cerr << "[!] Socket creation failed" << std::endl;
        freeaddrinfo(res);
        return false;
    }

    if (connect(sockfd, res->ai_addr, res->ai_addrlen) != 0) {
        std::cerr << "[!] Connection failed" << std::endl;
        freeaddrinfo(res);
        return false;
    }

    freeaddrinfo(res);
    return subscribe_and_authorize();
}

bool StratumClient::send_json(const nlohmann::json& j) {
    std::string msg = j.dump() + "\n";
    return send(sockfd, msg.c_str(), msg.size(), 0) > 0;
}

bool StratumClient::read_json(nlohmann::json& out) {
    char buffer[4096] = {0};
    int bytes = recv(sockfd, buffer, sizeof(buffer) - 1, 0);
    if (bytes <= 0) return false;

    buffer[bytes] = '\0';
    try {
        out = nlohmann::json::parse(buffer);
        return true;
    } catch (...) {
        return false;
    }
}

bool StratumClient::subscribe_and_authorize() {
    nlohmann::json subscribe = {
        {"id", 1},
        {"jsonrpc", "2.0"},
        {"method", "mining.subscribe"},
        {"params", {"ErgoMiner/1.0"}}
    };
    send_json(subscribe);

    nlohmann::json response;
    if (!read_json(response)) return false;
    extra_nonce1 = response["result"][1];
    extra_nonce2_size = response["result"][2];

    nlohmann::json authorize = {
        {"id", 2},
        {"jsonrpc", "2.0"},
        {"method", "mining.authorize"},
        {"params", {miner_address, "x"}}
    };
    send_json(authorize);
    return read_json(response);
}

bool StratumClient::wait_for_job(Job& job) {
    nlohmann::json response;
    if (!read_json(response)) return false;

    if (response.contains("method") && response["method"] == "mining.notify") {
        auto p = response["params"];
        job.job_id = p[0];
        job.header_hash = hex_to_bytes(p[2]);
        job.target_difficulty = hex_to_bytes(p[6]);
        return true;
    }
    return false;
}

void StratumClient::submit_share(const std::string& job_id, uint64_t nonce, const Job& job) {
    std::ostringstream suffix;
    suffix << std::hex << std::setw(extra_nonce2_size * 2) << std::setfill('0') << (nonce & ((1ULL << (extra_nonce2_size * 8)) - 1));

    nlohmann::json share = {
        {"id", 4},
        {"jsonrpc", "2.0"},
        {"method", "mining.submit"},
        {"params", {miner_address, job_id, suffix.str()}}
    };

    send_json(share);
    nlohmann::json response;
    read_json(response);
    std::cout << "[>] Share response: " << response.dump() << std::endl;
}

std::vector<uint8_t> StratumClient::hex_to_bytes(const std::string& hex) {
    std::vector<uint8_t> bytes;
    for (size_t i = 0; i < hex.length(); i += 2) {
        std::string byte_str = hex.substr(i, 2);
        bytes.push_back(static_cast<uint8_t>(strtol(byte_str.c_str(), nullptr, 16)));
    }
    return bytes;
}

void StratumClient::close() {
    if (sockfd != -1) ::close(sockfd);
}
