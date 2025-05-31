#ifndef AUTOLYKOS2_CUDA_MINER_H
#define AUTOLYKOS2_CUDA_MINER_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Initialize the Autolykos2 CUDA miner
 * @param device_id CUDA device ID to use
 * @return true on success, false on failure
 */
bool autolykos2_cuda_init(int device_id);

/**
 * Generate the Autolykos2 dataset on GPU
 * @param seed 32-byte seed for dataset generation
 * @return true on success, false on failure
 */
bool autolykos2_cuda_generate_dataset(const uint8_t* seed);

/**
 * Perform Autolykos2 mining
 * @param header 76-byte block header
 * @param start_nonce Starting nonce value
 * @param nonce_count Number of nonces to test
 * @param target_hi Upper 32 bits of target (big-endian)
 * @param found_nonce Output: found nonce if successful
 * @param found Output: true if valid nonce found
 * @return true on success, false on failure
 */
bool autolykos2_cuda_mine(
    const uint8_t* header,
    uint64_t start_nonce,
    uint32_t nonce_count,
    uint32_t target_hi,
    uint32_t* found_nonce,
    bool* found
);

/**
 * Get estimated hashrate
 * @return Estimated hashrate in H/s
 */
uint64_t autolykos2_cuda_get_hashrate();

/**
 * Check if miner is initialized
 * @return true if initialized, false otherwise
 */
bool autolykos2_cuda_is_initialized();

/**
 * Cleanup and free resources
 */
void autolykos2_cuda_cleanup();

#ifdef __cplusplus
}
#endif

#endif // AUTOLYKOS2_CUDA_MINER_H
