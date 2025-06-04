#ifndef AUTOLYKOS2_CUDA_MINER_CUH
#define AUTOLYKOS2_CUDA_MINER_CUH

#include <stdint.h>

#ifdef __CUDACC__
extern "C" {
#endif

// Host function to launch mining kernel
bool launchMiningKernel(
    const uint8_t* header,
    const uint8_t* target,
    uint64_t nonceStart,
    uint64_t nonceRange,
    uint64_t& foundNonce,
    uint8_t* foundHash
);

// Device-side Blake2b
void blake2b_cuda(uint8_t* out, const uint8_t* in, size_t inlen);

#ifdef __CUDACC__
}
#endif

#endif // AUTOLYKOS2_CUDA_MINER_CUH
