#include <iostream>
#include <fstream>
#include <string>
#include <nlohmann/json.hpp>
#include "job.h"
#include "stratum_client.h"
// Add any other headers your solo mining needs

using json = nlohmann::json;

// Utility: Load config.json
bool load_config(json& config) {
    std::ifstream f("config.json");
    if (!f) {
        std::cerr << "[MAIN] Could not open config.json!\n";
        return false;
    }
    try {
        f >> config;
        return true;
    } catch (std::exception& e) {
        std::cerr << "[MAIN] Error parsing config.json: " << e.what() << std::endl;
        return false;
    }
}

int main(int argc, char* argv[]) {
    json config;
    if (!load_config(config)) return 1;

    std::string mode = config.value("mode", "solo");
    std::string address = config.value("address", "");

    if (mode == "solo") {
        std::cout << "[MAIN] Starting SOLO mining mode...\n";
        // ---- Your solo mining logic here ----
        std::cout << "[MAIN] Solo mining logic goes here.\n";
        // -------------------------------------
        return 0;
    }

    if (mode == "pool") {
        std::cout << "[MAIN] Starting POOL mining mode...\n";
        // Use .value() everywhere to avoid null errors!
        std::string poolHost = config.contains("pool") ? config["pool"].value("host", "") : "";
        int poolPort = config.contains("pool") ? config["pool"].value("port", 3100) : 3100;
        bool ssl = config.contains("pool") ? config["pool"].value("ssl", false) : false;
        std::string worker = config.contains("pool") ? config["pool"].value("worker", "") : "";
        std::string password = config.contains("pool") ? config["pool"].value("password", "") : "";

        // Debug print:
        std::cout << "[DEBUG] address: " << address << ", pool host: " << poolHost
                  << ", port: " << poolPort << ", worker: " << worker << std::endl;

        if (poolHost.empty() || worker.empty() || address.empty()) {
            std::cerr << "[POOL] Invalid pool config in config.json!\n";
            return 1;
        }

        StratumClient client(poolHost, poolPort, ssl, worker, password, address);
        client.run(); // or client.start() -- whichever method launches your mining loop
        return 0;
    }

    std::cerr << "[MAIN] Invalid mode in config.json: " << mode << std::endl;
    return 1;
}
