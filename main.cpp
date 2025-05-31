#include "autolykos2_cuda_miner.h"
#include "stratum_client.h"
#include "utils.h"
#include <iostream>
#include <fstream>
#include <nlohmann/json.hpp>
#include <curl/curl.h>
#include <thread>
#include <chrono>
#include <string>
#include <vector>
#include <stdexcept>
#include <cstring>
#include <cstdint>

using json = nlohmann::json;

// Helper for cURL response data
size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    ((std::string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

// Converts a hex string to a std::vector<uint8_t>
std::vector<uint8_t> hex_to_bytes(const std::string& hex) {
    std::vector<uint8_t> bytes;
    if (hex.length() % 2 != 0)
        throw std::runtime_error("Hex string has odd length");
    for (size_t i = 0; i < hex.length(); i += 2) {
        uint8_t byte = (uint8_t)strtol(hex.substr(i, 2).c_str(), nullptr, 16);
        bytes.push_back(byte);
    }
    return bytes;
}

// Query the node REST API for a reward block candidate
bool get_block_candidate(const std::string& host, int port, json& candidate) {
    std::string url = "http://" + host + ":" + std::to_string(port) + "/mining/rewardBlockCandidate";
    CURL* curl = curl_easy_init();
    if (!curl) return false;
    std::string readBuffer;

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);
    CURLcode res = curl_easy_perform(curl);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) return false;
    try {
        candidate = json::parse(readBuffer);
        return true;
    } catch (...) {
        return false;
    }
}

// Helper to extract 76-byte header from candidate JSON (placeholder: you may need real block header logic)
std::vector<uint8_t> get_header_bytes_from_candidate(const json& candidate) {
    // For demo: powHash is NOT the block header, but using as a placeholder
    // Replace with correct block header serialization for production mining
    std::string powHash_hex = candidate["powHash"];
    auto bytes = hex_to_bytes(powHash_hex);
    if (bytes.size() < 76) {
        // Pad to 76 bytes if needed
        bytes.resize(76, 0);
    } else if (bytes.size() > 76) {
        bytes.resize(76);
    }
    return bytes;
}

// Helper to get target_hi from requiredDifficulty (32 bytes -> upper 4 bytes big-endian)
uint32_t get_target_hi(const json& candidate) {
    std::string target_hex = candidate["requiredDifficulty"];
    auto target_bytes = hex_to_bytes(target_hex);
    if (target_bytes.size() < 4) throw std::runtime_error("Target too small");
    // Upper 4 bytes (big-endian)
    return (target_bytes[0] << 24) | (target_bytes[1] << 16) | (target_bytes[2] << 8) | (target_bytes[3]);
}

int main(int argc, char** argv) {
    // Load config
    json config;
    std::ifstream cfg("config.json");
    if (!cfg.is_open()) {
        std::cerr << "[ERROR] Cannot open config.json" << std::endl;
        return 1;
    }
    cfg >> config;
    cfg.close();

    int cuda_device_id = 0;

    // ---- CUDA Initialization ----
    std::cout << "[MAIN] Initializing CUDA device " << cuda_device_id << std::endl;
    if (!autolykos2_cuda_init(cuda_device_id)) {
        std::cerr << "[ERROR] CUDA initialization failed. Check device and memory." << std::endl;
        return 1;
    }
    std::cout << "[MAIN] CUDA initialized!" << std::endl;

    std::string mode = config["mode"];
    if (mode == "pool") {
        std::cout << "[MAIN] Ergo Miner Starting in pool mode" << std::endl;
        std::string pool_host = config["pool"]["host"];
        int pool_port = config["pool"]["port"];
        std::string address = config["address"];

        StratumClient stratum(pool_host, pool_port, address);
        if (!stratum.connect_and_mine()) {
            std::cerr << "[ERROR] Stratum mining failed to start" << std::endl;
            return 1;
        }
    } else if (mode == "solo") {
        std::cout << "[MAIN] Ergo Miner Starting in solo mode" << std::endl;
        std::string solo_host = config["solo"]["host"];
        int solo_port = config["solo"]["port"];
        std::string address = config["address"];

        int prev_height = -1;
        while (true) {
            json candidate;
            if (!get_block_candidate(solo_host, solo_port, candidate)) {
                std::cerr << "[SOLO] Failed to fetch block candidate, retrying..." << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(3));
                continue;
            }

            int height = candidate["height"];
            // Debug: print candidate
            // std::cout << "[DEBUG] Candidate: " << candidate.dump(2) << std::endl;
            auto header_bytes = get_header_bytes_from_candidate(candidate);
            uint64_t start_nonce = 0;
            uint32_t nonce_count = 0x100000; // Try a reasonable chunk (can adjust as needed)
            uint32_t target_hi = get_target_hi(candidate);

            uint32_t found_nonce = 0;
            bool found = false;

            if (height != prev_height) {
                std::cout << "[SOLO] New block candidate: height " << height << std::endl;
                // TODO: Build dataset for this block if required (implement autolykos2_cuda_generate_dataset if needed)
                prev_height = height;
            }

            bool success = autolykos2_cuda_mine(
                header_bytes.data(),
                start_nonce,
                nonce_count,
                target_hi,
                &found_nonce,
                &found
            );

            if (success && found) {
                std::cout << "[SOLO] Solution found! Nonce: " << found_nonce << std::endl;
                // TODO: Submit solution via REST API (implement this as needed)
            } else if (success) {
                std::cout << "[SOLO] No solution found in nonce range." << std::endl;
            } else {
                std::cerr << "[SOLO] Mining kernel failed." << std::endl;
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(500)); // Adjust polling as needed
        }
    } else {
        std::cerr << "[ERROR] Unknown mining mode in config: " << mode << std::endl;
        return 1;
    }

    autolykos2_cuda_cleanup();
    return 0;
}
