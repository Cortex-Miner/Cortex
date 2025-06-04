
#include "nonce_logger.h"
#include <fstream>
#include <nlohmann/json.hpp>
#include <filesystem>
#include <chrono>
#include <iostream>

namespace fs = std::filesystem;
using json = nlohmann::json;

void log_nonce_attempt(
    int gpu,
    uint64_t nonceStart,
    uint64_t nonceEnd,
    bool accepted,
    const GpuStats& stats,
    const JobMetadata& job
) {
    try {
        json entry = {
            { "gpu", gpu },
            { "nonceStart", nonceStart },
            { "nonceEnd", nonceEnd },
            { "accepted", accepted },
            { "temp", stats.temp },
            { "util", stats.util },
            { "power", stats.power },
            { "height", job.height },
            { "difficulty", job.difficulty }
        };

        fs::create_directories("logs");
        std::ofstream file("logs/nonces.jsonl", std::ios::app);
        file << entry.dump() << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "[Logger Error] " << e.what() << std::endl;
    }
}
