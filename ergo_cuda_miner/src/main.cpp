
#include <iostream>
#include <fstream>
#include <sstream>
#include <thread>
#include <chrono>
#include <curl/curl.h>
#include <nlohmann/json.hpp>
#include "stratum_client.h"

using json = nlohmann::json;

// ---------- Structs ----------
struct GpuStats {
    float temp;
    float util;
    float power;
};

struct NonceRange {
    uint64_t start;
    uint64_t end;
    double confidence;
};

// ---------- Helpers ----------
std::string read_file(const std::string& filename) {
    std::ifstream f(filename);
    std::stringstream buffer;
    buffer << f.rdbuf();
    return buffer.str();
}

static size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* s) {
    s->append((char*)contents, size * nmemb);
    return size * nmemb;
}

std::string http_get(const std::string& url) {
    CURL* curl = curl_easy_init();
    std::string response;
    if (curl) {
        curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 5L);
        curl_easy_perform(curl);
        curl_easy_cleanup(curl);
    }
    return response;
}

std::string http_post(const std::string& url, const std::string& body) {
    CURL* curl = curl_easy_init();
    std::string response;
    if (curl) {
        struct curl_slist* headers = nullptr;
        headers = curl_slist_append(headers, "Content-Type: application/json");
        curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 5L);
        curl_easy_perform(curl);
        curl_easy_cleanup(curl);
    }
    return response;
}

void log_nonce_range(int gpu, uint64_t start, uint64_t end, double conf) {
    std::ofstream log("logs/nonces.jsonl", std::ios::app);
    json entry = {
        {"ts", time(0)},
        {"gpu", gpu},
        {"nonceStart", start},
        {"nonceEnd", end},
        {"confidence", conf}
    };
    log << entry.dump() << "\n";
    log.close();
}

GpuStats fetch_gpu_stats(int index) {
    std::string apiServer = "http://localhost:4201";
    std::string endpoint = apiServer + "/api/gpu/stats";
    std::string raw = http_get(endpoint);
    auto parsed = json::parse(raw);
    auto g = parsed["gpus"][index];
    return { g["temp"], g["util"], g["power"] };
}

NonceRange get_nonce_range_from_ai(int gpuIndex, uint64_t currentNonce, int height, double difficulty) {
    std::string aiServer = "http://localhost:7000";
    GpuStats stats = fetch_gpu_stats(gpuIndex);
    json req = {
        {"gpuIndex", gpuIndex},
        {"currentNonce", currentNonce},
        {"gpuStats", {
            {"temp", stats.temp},
            {"util", stats.util},
            {"power", stats.power}
        }},
        {"jobMetadata", {
            {"height", height},
            {"difficulty", std::to_string(difficulty)}
        }}
    };

    std::string response = http_post(aiServer + "/recommend/nonce", req.dump());
    auto parsed = json::parse(response);
    return { parsed["nonceStart"], parsed["nonceEnd"], parsed["confidence"] };
}

// Stub - replace with your real GPU miner
bool mine_autolykos_gpu(const std::string& header, const std::string& target,
                        uint64_t start, uint64_t end,
                        std::string& foundNonce, std::string& powHash) {
    return false;
}

// ---------- Main ----------
int main() {
    std::cout << "[MAIN] Starting POOL mining mode...\n";

    json cfg = json::parse(read_file("config.json"));
    std::string minerAddress = cfg["address"];
    std::string workerName = cfg["pool"]["worker"];
    std::string poolHost = cfg["pool"]["host"];
    int poolPort = cfg["pool"]["port"];
    bool useSSL = cfg["pool"]["ssl"];
    std::string fullWorker = minerAddress + "." + workerName;

    std::cout << "[DEBUG] address: " << minerAddress
              << ", pool host: " << poolHost
              << ", port: " << poolPort
              << ", worker: " << fullWorker << "\n";

    StratumClient client(poolHost, poolPort, useSSL, fullWorker, "x", minerAddress);
    client.run();

    return 0;
}
