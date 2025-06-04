#pragma once

#include <string>
#include <vector>
#include <atomic>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <nlohmann/json.hpp>
#include <fstream>

// Mining job info
struct PoolJob {
    std::string job_id;
    std::string header;
    std::string target;
    uint32_t height = 0;
    double difficulty = 1.0;  // Store pool difficulty
    std::vector<uint8_t> share_target_bytes; // Store pool share target as 32-byte little-endian
    std::atomic<bool> active{false};
    std::mutex mtx;
    std::condition_variable cv;
};

class StratumClient {
public:
    StratumClient(const std::string& host,
                  int port,
                  bool ssl,
                  const std::string& worker,
                  const std::string& password,
                  const std::string& address);
    ~StratumClient();

    // Main mining loop (blocks until exit)
    void run();

    // Used by GPU thread to get current job
    PoolJob& getCurrentJob();

    // Used to signal threads to exit
    void stop();

private:
    // Connection and protocol helpers
    bool connect();
    void subscribe();
    void authorize();
    void listen();
    void handle_message(const nlohmann::json& msg);
    void send_json(const nlohmann::json& j);

    // Mining helpers
    void mining_thread();

    // Submission helpers
    void submit_share(const std::string& nonce_hex, const std::string& pow_hash);

    // Logging
    void logline(const std::string& msg);

    // Member variables
    std::string host_;
    int port_;
    bool ssl_;
    std::ofstream miner_log_;
    std::string worker_;
    std::string password_;
    std::string address_;

    int sock_;
    std::atomic<bool> running_;
    std::thread listener_;
    std::thread miner_;

    PoolJob current_job_;
};
