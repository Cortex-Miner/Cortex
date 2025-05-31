// stratum_tls_client.h
#ifndef STRATUM_TLS_CLIENT_H
#define STRATUM_TLS_CLIENT_H
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <string>
#include <vector>
#include <cstdint>
#include <nlohmann/json.hpp>

struct Job {
    std::string job_id;
    std::vector<uint8_t> header_hash;
    std::vector<uint8_t> target_difficulty;
};

class StratumTLSClient {
public:
    StratumTLSClient(const std::string& host, int port, const std::string& address);
    bool connect_and_handshake();
    bool subscribe_and_authorize();
    bool wait_for_job(Job& job);
    void submit_share(const std::string& job_id, uint64_t nonce, const Job& job);
    void close();

private:
    bool send_json(const nlohmann::json& j);
    bool read_json(nlohmann::json& out);
    std::vector<uint8_t> hex_to_bytes(const std::string& hex);
    std::string bytes_to_hex(const std::vector<uint8_t>& bytes);

    std::string pool_host;
    int pool_port;
    std::string miner_address;

    int server_fd;
    SSL_CTX* ctx;
    SSL* ssl;
};

#endif // STRATUM_TLS_CLIENT_H


