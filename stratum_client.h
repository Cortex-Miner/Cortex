#ifndef STRATUM_CLIENT_H
#define STRATUM_CLIENT_H

#include <string>
#include <nlohmann/json.hpp>

class StratumClient {
public:
    StratumClient(const std::string& host, int port, const std::string& address);

    bool connect_and_mine();

private:
    bool connect_to_pool();
    bool send_json(const nlohmann::json& j);
    bool recv_json(nlohmann::json& j);
    void handle_job(const nlohmann::json& job);
    bool submit_share(const nlohmann::json& job, uint64_t nonce);

    std::string host_;
    int port_;
    std::string address_;
    int sockfd_;
    int last_epoch_;
    int job_id_;
    std::string worker_id_;
};

#endif // STRATUM_CLIENT_H
