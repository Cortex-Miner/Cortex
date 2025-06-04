
#ifndef NONCE_LOGGER_H
#define NONCE_LOGGER_H

#include <string>

struct GpuStats {
    float temp;
    float util;
    float power;
};

struct JobMetadata {
    int height;
    std::string difficulty;
};

void log_nonce_attempt(
    int gpu,
    uint64_t nonceStart,
    uint64_t nonceEnd,
    bool accepted,
    const GpuStats& stats,
    const JobMetadata& job
);

#endif
