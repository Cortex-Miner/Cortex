// autolykos2_cuda_miner.cu

#include "autolykos2_cuda_miner.h"
#include "blake2b_cuda.cuh"
#include <cuda_runtime.h>
#include <device_launch_parameters.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <gmp.h>
#include <string>

// Reference blake2b_sigma table defined in blake2b_cuda.cu
extern __constant__ uint8_t blake2b_sigma[12][16];

#define AUTOLYKOS2_N 26
#define AUTOLYKOS2_K 32
#define AUTOLYKOS2_M (1 << AUTOLYKOS2_N)
#define BLOCK_SIZE 256
#define GRID_SIZE 1024
#define NONCES_PER_ITER (BLOCK_SIZE * GRID_SIZE)
#define NUM_SIZE_32 8
#define K_LEN 64

#define B2B_IV(h) \
    do { \
        ((uint64_t *)(h))[0] = 0x6A09E667F2BDC928ULL; \
        ((uint64_t *)(h))[1] = 0xBB67AE8584CAA73BULL; \
        ((uint64_t *)(h))[2] = 0x3C6EF372FE94F82BULL; \
        ((uint64_t *)(h))[3] = 0xA54FF53A5F1D36F1ULL; \
        ((uint64_t *)(h))[4] = 0x510E527FADE682D1ULL; \
        ((uint64_t *)(h))[5] = 0x9B05688C2B3E6C1FULL; \
        ((uint64_t *)(h))[6] = 0x1F83D9ABFB41BD6BULL; \
        ((uint64_t *)(h))[7] = 0x5BE0CD19137E2179ULL; \
    } while(0)

__device__ __forceinline__ uint32_t cuda_swab32(uint32_t x) {
    return __byte_perm(x, x, 0x0123);
}

__device__ __forceinline__ uint64_t devROTR64(uint64_t b, int offset) {
    return (b >> offset) | (b << (64 - offset));
}

__device__ __forceinline__
void devB2B_MIX(uint64_t* v, uint64_t* m) {
    for (int r = 0; r < 12; ++r) {
        #define G(a,b,c,d,x,y) \
            v[a] = v[a] + v[b] + m[blake2b_sigma[r][x]]; \
            v[d] = devROTR64(v[d] ^ v[a], 32); \
            v[c] = v[c] + v[d]; \
            v[b] = devROTR64(v[b] ^ v[c], 24); \
            v[a] = v[a] + v[b] + m[blake2b_sigma[r][y]]; \
            v[d] = devROTR64(v[d] ^ v[a], 16); \
            v[c] = v[c] + v[d]; \
            v[b] = devROTR64(v[b] ^ v[c], 63);

        const uint8_t* s = blake2b_sigma[r];
        G(0,4,8,12,0,1);
        G(1,5,9,13,2,3);
        G(2,6,10,14,4,5);
        G(3,7,11,15,6,7);
        G(0,5,10,15,8,9);
        G(1,6,11,12,10,11);
        G(2,7,8,13,12,13);
        G(3,4,9,14,14,15);
        #undef G
    }
}

const __constant__ uint64_t ivals[8] = {
    0x6A09E667F2BDC928,
    0xBB67AE8584CAA73B,
    0x3C6EF372FE94F82B,
    0xA54FF53A5F1D36F1,
    0x510E527FADE682D1,
    0x9B05688C2B3E6C1F,
    0x1F83D9ABFB41BD6B,
    0x5BE0CD19137E2179
};

__constant__ uint8_t bound_[32];

void decodeTarget(const std::string& targetStr, uint8_t* targetBytes) {
    mpz_t targetInt;
    mpz_init_set_str(targetInt, targetStr.c_str(), 10);
    uint8_t be_bytes[32] = {0};
    size_t count = 0;
    mpz_export(be_bytes, &count, 1, 1, 0, 0, targetInt);
    for (size_t i = 0; i < 32; ++i) {
        targetBytes[i] = be_bytes[31 - i];
    }
    mpz_clear(targetInt);
}

void cpyBSymbol(const uint8_t *bound) {
    cudaError_t err = cudaMemcpyToSymbol(bound_, bound, 32);
    if (err != cudaSuccess) {
        fprintf(stderr, "CUDA error in cpyBSymbol: %s\n", cudaGetErrorString(err));
    }
}

__global__ void autolykos2_mining_kernel(
    const uint32_t* dataset,
    const uint8_t* header,
    uint64_t start_nonce,
    uint32_t target_hi,
    uint64_t* d_found_nonce_param,
    uint8_t* d_found_hash_param,
    bool* d_found_flag_param
) {
    uint32_t tid = blockIdx.x * blockDim.x + threadIdx.x;
    uint64_t aux[32] = { 0 };
    uint32_t ind[K_LEN] = { 0 };
    uint32_t r[NUM_SIZE_32 + 1] = { 0 };
    uint8_t j = 0;

    if (tid < NONCES_PER_ITER) {
        uint64_t nonce = start_nonce + tid;
        uint8_t mining_input[84];

        // Copy header
        for (int i = 0; i < 76; i++) mining_input[i] = header[i];

        // Add nonce (little-endian)
        for (int i = 0; i < 8; ++i)
            mining_input[76 + i] = (nonce >> (8 * i)) & 0xFF;

        // First Blake2b hash
        uint8_t hash1[32];
        blake2b_cuda(hash1, mining_input, 84);

        uint64_t tmp;
        ((uint32_t*)(&tmp))[0] = cuda_swab32(((uint32_t*)&nonce)[1]);
        ((uint32_t*)(&tmp))[1] = cuda_swab32(((uint32_t*)&nonce)[0]);
        B2B_IV(aux);
        B2B_IV(aux + 8);
        aux[0] = ivals[0];
        ((uint64_t *)(aux))[12] ^= 40;
        ((uint64_t *)(aux))[13] ^= 0;
        ((uint64_t *)(aux))[14] = ~((uint64_t *)(aux))[14];
        ((uint64_t *)(aux))[16] = ((uint64_t *)hash1)[0];
        ((uint64_t *)(aux))[17] = ((uint64_t *)hash1)[1];
        ((uint64_t *)(aux))[18] = ((uint64_t *)hash1)[2];
        ((uint64_t *)(aux))[19] = ((uint64_t *)hash1)[3];
        ((uint64_t *)(aux))[20] = tmp;
        for (int i = 21; i < 32; ++i) aux[i] = 0;
        devB2B_MIX(aux, aux + 16);

        uint64_t hsh;
        #pragma unroll
        for (j = 0; j < NUM_SIZE_32; j += 2) {
            hsh = ivals[j >> 1];
            hsh ^= ((uint64_t *)(aux))[j >> 1] ^ ((uint64_t *)(aux))[8 + (j >> 1)];
            ((uint32_t*)r)[j] =  ((uint32_t*)(&hsh))[0];
            ((uint32_t*)r)[j + 1] = ((uint32_t*)(&hsh))[1];
        }

        uint32_t n_len = AUTOLYKOS2_M;
        for (int k = 0; k < K_LEN; k++) {
            uint32_t val;
            int byte_idx = (k / 4) * 4;
            if (byte_idx + 3 < 32)
                val = ((uint32_t*)r)[byte_idx / 4];
            else {
                byte_idx = byte_idx % 32;
                val = ((uint32_t*)r)[byte_idx / 4];
            }
            int sub_idx = k % 4;
            uint32_t final_val;
            if (sub_idx == 0) final_val = val;
            else if (sub_idx == 1) final_val = (val << 8) | (val >> 24);
            else if (sub_idx == 2) final_val = (val << 16) | (val >> 16);
            else final_val = (val << 24) | (val >> 8);
            ind[k] = final_val % n_len;
        }

        uint32_t current_sum[NUM_SIZE_32 + 1] = {0};
        for (int k = 0; k < K_LEN; ++k) {
            uint32_t dataset_element = dataset[ind[k]];
            uint64_t temp_sum = (uint64_t)current_sum[0] + dataset_element;
            current_sum[0] = (uint32_t)temp_sum;
            uint32_t carry = temp_sum >> 32;
            for (int i = 1; i < NUM_SIZE_32 + 1; ++i) {
                temp_sum = (uint64_t)current_sum[i] + carry;
                current_sum[i] = (uint32_t)temp_sum;
                carry = temp_sum >> 32;
            }
        }
        uint8_t sum_bytes[32];
        for(int i = 0; i < NUM_SIZE_32; ++i) {
            sum_bytes[i*4] = current_sum[i] & 0xFF;
            sum_bytes[i*4 + 1] = (current_sum[i] >> 8) & 0xFF;
            sum_bytes[i*4 + 2] = (current_sum[i] >> 16) & 0xFF;
            sum_bytes[i*4 + 3] = (current_sum[i] >> 24) & 0xFF;
        }
        uint8_t final_input[40];
        for (int i = 0; i < 32; i++) final_input[i] = hash1[i];
        for (int i = 0; i < 8; i++) final_input[32 + i] = sum_bytes[i];
        uint8_t final_hash[32];
        blake2b_cuda(final_hash, final_input, 40);

        // Compare final_hash with bound_ using 4x uint64_t little-endian words
        bool meets_target = false;
        uint64_t* hash64 = (uint64_t*)final_hash;
        uint64_t* bound64 = (uint64_t*)bound_;
        for (int i = 3; i >= 0; --i) {
            if (hash64[i] < bound64[i]) { meets_target = true; break; }
            if (hash64[i] > bound64[i]) { break; }
        }
        if (meets_target) {
            if (atomicCAS((int*)d_found_flag_param, 0, 1) == 0) {
                *d_found_nonce_param = nonce;
                for (int i = 0; i < 32; ++i) d_found_hash_param[i] = final_hash[i];
            }
        }
    }
}

__global__ void generate_dataset_kernel(uint32_t* dataset, const uint8_t* seed, uint32_t start_idx, uint32_t count) {
    uint32_t idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= count) return;
    uint32_t global_idx = start_idx + idx;
    uint8_t input[36];
    for (int i = 0; i < 32; i++) input[i] = seed[i];
    input[32] = global_idx & 0xFF;
    input[33] = (global_idx >> 8) & 0xFF;
    input[34] = (global_idx >> 16) & 0xFF;
    input[35] = (global_idx >> 24) & 0xFF;
    uint8_t hash[32];
    blake2b_cuda(hash, input, 36);
    dataset[global_idx] =
        ((uint32_t)hash[0]) |
        ((uint32_t)hash[1] << 8) |
        ((uint32_t)hash[2] << 16) |
        ((uint32_t)hash[3] << 24);
}

static uint32_t* d_dataset = nullptr;
static uint8_t* d_header = nullptr;
static uint64_t* d_found_nonce = nullptr;
static uint8_t* d_found_hash = nullptr;
static bool* d_found_flag = nullptr;
static uint8_t* d_target_boundary = nullptr;
static uint32_t* h_dataset = nullptr;
static bool miner_initialized = false;

#define CUDA_CHECK_INIT(call) \
    do { \
        cudaError_t err = call; \
        if (err != cudaSuccess) { \
            fprintf(stderr, "CUDA error at %s:%d - %s\n", __FILE__, __LINE__, cudaGetErrorString(err)); \
            return false; \
        } \
    } while(0)

bool autolykos2_cuda_init(int device_id) {
    if (miner_initialized) return true;
    CUDA_CHECK_INIT(cudaSetDevice(device_id));
    size_t dataset_size = AUTOLYKOS2_M * sizeof(uint32_t);
    CUDA_CHECK_INIT(cudaMalloc(&d_dataset, dataset_size));
    CUDA_CHECK_INIT(cudaMalloc(&d_header, 76));
    CUDA_CHECK_INIT(cudaMalloc(&d_found_nonce, sizeof(uint64_t)));
    CUDA_CHECK_INIT(cudaMalloc(&d_found_hash, 32));
    CUDA_CHECK_INIT(cudaMalloc(&d_found_flag, sizeof(bool)));
    CUDA_CHECK_INIT(cudaMalloc(&d_target_boundary, 32));
    h_dataset = (uint32_t*)malloc(dataset_size);
    if (!h_dataset) {
        fprintf(stderr, "Failed to allocate host dataset memory\n");
        return false;
    }
    miner_initialized = true;
    return true;
}

bool autolykos2_cuda_generate_dataset(const uint8_t* seed) {
    if (!miner_initialized) {
        fprintf(stderr, "Miner not initialized\n");
        return false;
    }
    uint8_t* d_temp_seed = nullptr;
    CUDA_CHECK_INIT(cudaMalloc(&d_temp_seed, 32));
    CUDA_CHECK_INIT(cudaMemcpy(d_temp_seed, seed, 32, cudaMemcpyHostToDevice));
    const uint32_t chunk_size = 1024 * 1024;
    const uint32_t total_elements = AUTOLYKOS2_M;
    for (uint32_t start = 0; start < total_elements; start += chunk_size) {
        uint32_t count = (chunk_size < total_elements - start) ? chunk_size : (total_elements - start);
        dim3 block(BLOCK_SIZE);
        dim3 grid((count + BLOCK_SIZE - 1) / BLOCK_SIZE);
        generate_dataset_kernel<<<grid, block>>>(d_dataset, d_temp_seed, start, count);
        CUDA_CHECK_INIT(cudaGetLastError());
        CUDA_CHECK_INIT(cudaDeviceSynchronize());
        if (start % (chunk_size * 10) == 0) {
            printf("Dataset generation: %.2f%%\n", 100.0f * (start + count) / total_elements);
        }
    }
    CUDA_CHECK_INIT(cudaFree(d_temp_seed));
    printf("Dataset generation completed\n");
    return true;
}

bool autolykos2_cuda_mine(
    const uint8_t* header,
    uint64_t start_nonce,
    uint32_t nonce_count,
    uint32_t target_hi,
    const uint8_t* target_boundary,
    uint64_t* found_nonce,
    uint8_t* found_hash,
    bool* found
) {
    if (!miner_initialized) {
        fprintf(stderr, "Miner not initialized\n");
        return false;
    }
    CUDA_CHECK_INIT(cudaMemcpy(d_header, header, 76, cudaMemcpyHostToDevice));
    cpyBSymbol(target_boundary);

    bool host_found = false;
    CUDA_CHECK_INIT(cudaMemcpy(d_found_flag, &host_found, sizeof(bool), cudaMemcpyHostToDevice));
    dim3 block(BLOCK_SIZE);
    dim3 grid((nonce_count + BLOCK_SIZE - 1) / BLOCK_SIZE);

    autolykos2_mining_kernel<<<grid, block>>>(
        d_dataset,
        d_header,
        start_nonce,
        target_hi,
        d_found_nonce,
        d_found_hash,
        d_found_flag
    );
    CUDA_CHECK_INIT(cudaGetLastError());
    CUDA_CHECK_INIT(cudaDeviceSynchronize());

    CUDA_CHECK_INIT(cudaMemcpy(&host_found, d_found_flag, sizeof(bool), cudaMemcpyDeviceToHost));
    *found = host_found;

    if (host_found) {
        CUDA_CHECK_INIT(cudaMemcpy(found_nonce, d_found_nonce, sizeof(uint64_t), cudaMemcpyDeviceToHost));
        CUDA_CHECK_INIT(cudaMemcpy(found_hash, d_found_hash, 32, cudaMemcpyDeviceToHost));
    }
    return true;
}

void autolykos2_cuda_cleanup() {
    if (!miner_initialized) return;
    if (d_dataset) cudaFree(d_dataset);
    if (d_header) cudaFree(d_header);
    if (d_found_nonce) cudaFree(d_found_nonce);
    if (d_found_hash) cudaFree(d_found_hash);
    if (d_found_flag) cudaFree(d_found_flag);
    if (d_target_boundary) cudaFree(d_target_boundary);
    if (h_dataset) { free(h_dataset); h_dataset = nullptr; }
    d_dataset = nullptr; d_header = nullptr; d_found_nonce = nullptr;
    d_found_flag = nullptr; d_target_boundary = nullptr;
    miner_initialized = false;
}

uint64_t autolykos2_cuda_get_hashrate() {
    return GRID_SIZE * BLOCK_SIZE * 1000;
}
bool autolykos2_cuda_is_initialized() { return miner_initialized; }

bool launchMiningKernel(
    const uint8_t* header,
    const uint8_t* target,
    uint64_t nonceStart,
    uint64_t nonceRange,
    uint64_t& foundNonce,
    uint8_t* foundHash
) {
    if (!miner_initialized) {
        fprintf(stderr, "Miner not initialized\n");
        return false;
    }
    uint64_t found_nonce_64;
    bool found = false;
    bool success = autolykos2_cuda_mine(
        header,
        nonceStart,
        (uint32_t)nonceRange,
        0,
        target,
        &found_nonce_64,
        foundHash,
        &found
    );
    if (success && found) {
        foundNonce = found_nonce_64;
        return true;
    }
    return false;
}
