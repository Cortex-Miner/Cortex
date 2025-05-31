#include <stdint.h>
#include <stdio.h>
#include <inttypes.h>     // <-- Add this for PRIu64
#include "blake2b_cuda.cuh"
#include "utils.h"        // <-- Use the shared inline here!

// REMOVE isHashLessThanTarget from here!
// It's now in utils.h

__global__ void mine_kernel(
    const uint8_t* header,
    const uint8_t* target,
    uint64_t nonce_start,
    uint64_t nonce_range,
    uint64_t* found_nonce,
    int* found_flag,
    uint8_t* output_hash
) {
    uint64_t thread_id = blockIdx.x * blockDim.x + threadIdx.x;
    uint64_t total_threads = gridDim.x * blockDim.x;
    uint64_t nonce = nonce_start + thread_id;

    while (nonce < nonce_start + nonce_range) {
        if (*found_flag) return;

        uint8_t input[40];
        for (int i = 0; i < 32; i++) input[i] = header[i];
        for (int i = 0; i < 8; i++) input[32 + i] = (nonce >> (8 * i)) & 0xFF;

        uint8_t hash[32];
        blake2b_gpu(hash, input, 40);

        if (isHashLessThanTarget(hash, target)) {
            if (atomicExch(found_flag, 1) == 0) {
                *found_nonce = nonce;
                for (int i = 0; i < 32; i++) output_hash[i] = hash[i];
                // Use PRIu64 for portable printf of uint64_t
                printf("[GPU] Valid nonce found: %" PRIu64 "\n", (uint64_t)nonce);
            }
            return;
        }

        nonce += total_threads;
    }
}

