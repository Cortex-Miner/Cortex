#ifndef BLAKE2B_CUDA_CUH
#define BLAKE2B_CUDA_CUH

#include <stdint.h>
#include <stddef.h>

__device__ void blake2b_cuda(uint8_t* out, const uint8_t* in, size_t inlen);

#endif // BLAKE2B_CUDA_CUH
