// blake2b_cuda.cu
#include "blake2b_cuda.cuh"

// Blake2b IV constants (from spec)
__constant__ uint64_t blake2b_IV[8] = {
    0x6A09E667F3BCC908ULL, 0xBB67AE8584CAA73BULL,
    0x3C6EF372FE94F82BULL, 0xA54FF53A5F1D36F1ULL,
    0x510E527FADE682D1ULL, 0x9B05688C2B3E6C1FULL,
    0x1F83D9ABFB41BD6BULL, 0x5BE0CD19137E2179ULL
};

// Sigma (message permutation schedule)
__constant__ uint8_t blake2b_sigma[12][16] = {
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 },
    {14,10, 4, 8, 9,15,13, 6, 1,12, 0, 2,11, 7, 5, 3},
    {11, 8,12, 0, 5, 2,15,13,10,14, 3, 6, 7, 1, 9, 4},
    { 7, 9, 3, 1,13,12,11,14, 2, 6, 5,10, 4, 0,15, 8},
    { 9, 0, 5, 7, 2, 4,10,15,14, 1,11,12, 6, 8, 3,13},
    { 2,12, 6,10, 0,11, 8, 3, 4,13, 7, 5,15,14, 1, 9},
    {12, 5, 1,15,14,13, 4,10, 0, 7, 6, 3, 9, 2, 8,11},
    {13,11, 7,14,12, 1, 3, 9, 5, 0,15, 4, 8, 6, 2,10},
    { 6,15,14, 9,11, 3, 0, 8,12, 2,13, 7, 1, 4,10, 5},
    {10, 2, 8, 4, 7, 6, 1, 5,15,11, 9,14, 3,12,13, 0},
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15},
    {14,10, 4, 8, 9,15,13, 6, 1,12, 0, 2,11, 7, 5, 3}
};

__device__ __forceinline__ uint64_t rotr64(uint64_t x, uint32_t n) {
    return (x >> n) | (x << (64 - n));
}

__device__ void blake2b_compress(
    uint64_t h[8], const uint8_t block[128], const uint64_t t[2], bool last)
{
    uint64_t m[16];
    #pragma unroll
    for (int i = 0; i < 16; i++) {
        m[i] = ((uint64_t*)block)[i];
    }
    uint64_t v[16];
    #pragma unroll
    for (int i = 0; i < 8; i++) {
        v[i] = h[i];
        v[i + 8] = blake2b_IV[i];
    }
    v[12] ^= t[0];
    v[13] ^= t[1];
    if (last) v[14] = ~v[14];

    #pragma unroll
    for (int r = 0; r < 12; ++r) {
        #define G(a,b,c,d,x,y) \
            v[a] = v[a] + v[b] + m[x]; \
            v[d] = rotr64(v[d] ^ v[a], 32); \
            v[c] = v[c] + v[d]; \
            v[b] = rotr64(v[b] ^ v[c], 24); \
            v[a] = v[a] + v[b] + m[y]; \
            v[d] = rotr64(v[d] ^ v[a], 16); \
            v[c] = v[c] + v[d]; \
            v[b] = rotr64(v[b] ^ v[c], 63);

        const uint8_t* s = blake2b_sigma[r];
        G(0,4,8,12,s[0],s[1]);
        G(1,5,9,13,s[2],s[3]);
        G(2,6,10,14,s[4],s[5]);
        G(3,7,11,15,s[6],s[7]);
        G(0,5,10,15,s[8],s[9]);
        G(1,6,11,12,s[10],s[11]);
        G(2,7,8,13,s[12],s[13]);
        G(3,4,9,14,s[14],s[15]);
        #undef G
    }
    #pragma unroll
    for (int i = 0; i < 8; ++i) h[i] ^= v[i] ^ v[i + 8];
}

__device__ void blake2b_cuda(uint8_t* out, const uint8_t* in, size_t inlen) {
    // Only for 32 <= inlen <= 128
    uint64_t h[8];
    for (int i = 0; i < 8; ++i) h[i] = blake2b_IV[i];
    h[0] ^= 0x01010020; // 32 bytes output, 0x01, 0x01, 0x20 (key length 0, fanout 1, depth 1, digest 32)

    uint8_t block[128] = {0};
    for (int i = 0; i < inlen; ++i) block[i] = in[i];

    uint64_t t[2] = { inlen, 0 };
    blake2b_compress(h, block, t, true);

    for (int i = 0; i < 32; ++i) {
        out[i] = ((uint8_t*)h)[i];
    }
}
