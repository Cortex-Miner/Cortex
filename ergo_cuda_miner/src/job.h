#ifndef JOB_H
#define JOB_H

#include <string>
#include <vector>

struct Job {
    std::string job_id;
    std::vector<uint8_t> header_hash;   // Raw header (32 bytes)
    std::vector<uint8_t> share_target;  // Target (32 bytes)
    int height = 0;
    int version = 0;
    std::string nbits;
    bool clean_jobs = false;
};

#endif // JOB_H
