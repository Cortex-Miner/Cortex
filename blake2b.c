#include "blake2b.h"
#include <stdint.h>
#include <string.h>

static const uint64_t blake2b_IV[8] = {
    0x6a09e667f3bcc908ULL, 0xbb67ae8584caa73bULL,
    0x3c6ef372fe94f82bULL, 0xa54ff53a5f1d36f1ULL,
    0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL,
    0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL
};

#define ROTR64(x, n) (((x) >> (n)) | ((x) << (64 - (n))))

static const uint8_t blake2b_sigma[12][16] = {
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15 },
    {14,10, 4, 8, 9,15,13, 6, 1,12, 0, 2,11, 7, 5, 3 },
    {11, 8,12, 0, 5, 2,15,13,10,14, 3, 6, 7, 1, 9, 4 },
    { 7, 9, 3, 1,13,12,11,14, 2, 6, 5,10, 4, 0,15, 8 },
    { 9, 0, 5, 7, 2, 4,10,15,14, 1,11,12, 6, 8, 3,13 },
    { 2,12, 6,10, 0,11, 8, 3, 4,13, 7, 5,15,14, 1, 9 },
    {12, 5, 1,15,14,13, 4,10, 0, 7, 6, 3, 9, 2, 8,11 },
    {13,11, 7,14,12, 1, 3, 9, 5, 0,15, 4, 8, 6, 2,10 },
    { 6,15,14, 9,11, 3, 0, 8,12, 2,13, 7, 1, 4,10, 5 },
    {10, 2, 8, 4, 7, 6, 1, 5,15,11, 9,14, 3,12,13, 0 },
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15 },
    {14,10, 4, 8, 9,15,13, 6, 1,12, 0, 2,11, 7, 5, 3 }
};

static void blake2b_compress(
    uint64_t h[8],
    const uint8_t block[128],
    uint64_t t,
    int last
) {
    uint64_t v[16], m[16];
    int i, r;

    for (i = 0; i < 8; i++) v[i] = h[i];
    for (i = 0; i < 8; i++) v[i + 8] = blake2b_IV[i];

    v[12] ^= t;
    v[14] ^= (last) ? ~0ULL : 0ULL;

    for (i = 0; i < 16; i++) {
        m[i] = ((uint64_t*)block)[i];
    }

    for (r = 0; r < 12; r++) {
        #define G(a, b, c, d, x, y) \
            v[a] = v[a] + v[b] + m[x]; \
            v[d] = ROTR64(v[d] ^ v[a], 32); \
            v[c] = v[c] + v[d]; \
            v[b] = ROTR64(v[b] ^ v[c], 24); \
            v[a] = v[a] + v[b] + m[y]; \
            v[d] = ROTR64(v[d] ^ v[a], 16); \
            v[c] = v[c] + v[d]; \
            v[b] = ROTR64(v[b] ^ v[c], 63);

        G(0, 4, 8,12, blake2b_sigma[r][ 0], blake2b_sigma[r][ 1]);
        G(1, 5, 9,13, blake2b_sigma[r][ 2], blake2b_sigma[r][ 3]);
        G(2, 6,10,14, blake2b_sigma[r][ 4], blake2b_sigma[r][ 5]);
        G(3, 7,11,15, blake2b_sigma[r][ 6], blake2b_sigma[r][ 7]);
        G(0, 5,10,15, blake2b_sigma[r][ 8], blake2b_sigma[r][ 9]);
        G(1, 6,11,12, blake2b_sigma[r][10], blake2b_sigma[r][11]);
        G(2, 7, 8,13, blake2b_sigma[r][12], blake2b_sigma[r][13]);
        G(3, 4, 9,14, blake2b_sigma[r][14], blake2b_sigma[r][15]);

        #undef G
    }

    for (i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
}

int blake2b(void* out, size_t outlen, const void* in, size_t inlen, const void* key, size_t keylen) {
    // Only supporting outlen 32/64, keylen 0 for mining (simplifies logic)
    if ((outlen != 32 && outlen != 64) || keylen != 0) return -1;

    uint64_t h[8];
    memcpy(h, blake2b_IV, sizeof(h));
    h[0] ^= 0x01010000 ^ (uint64_t)outlen;

    uint8_t block[128] = {0};
    uint64_t t = 0;

    // Single block (inputs are always 40 bytes in mining)
    memcpy(block, in, inlen);
    blake2b_compress(h, block, inlen, 1);

    for (int i = 0; i < 8 && (i * 8 < outlen); i++) {
        uint64_t word = h[i];
        for (int j = 0; j < 8 && (i * 8 + j) < outlen; j++) {
            ((uint8_t*)out)[i * 8 + j] = (word >> (8 * j)) & 0xFF;
        }
    }

    return 0;
}
