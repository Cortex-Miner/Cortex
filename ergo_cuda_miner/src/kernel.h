#ifndef KERNEL_H
#define KERNEL_H

#include <stdint.h>

__global__ void mine_kernel(
    const uint8_t* header,
    const uint8_t* target,
    uint64_t nonce_start,
    uint64_t nonce_range,
    uint64_t* found_nonce,
    int* found_flag,
    uint8_t* output_hash
);

#endif









