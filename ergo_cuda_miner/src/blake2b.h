#ifndef BLAKE2B_H
#define BLAKE2B_H

#include <stddef.h>
#include <stdint.h>

#define BLAKE2B_OUTBYTES 64

#ifdef __cplusplus
extern "C" {
#endif

// Standard reference API
int blake2b(void *out, size_t outlen, const void *in, size_t inlen, const void *key, size_t keylen);

#ifdef __cplusplus
}
#endif

#endif // BLAKE2B_H
