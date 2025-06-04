#include "utils.h"
#include <gmp.h>
#include <cstring>
#include <vector>
#include <string>

std::vector<uint8_t> decimal_to_target_bytes(const std::string& decimal) {
    mpz_t num;
    mpz_init(num);
    mpz_set_str(num, decimal.c_str(), 10);

    std::vector<uint8_t> target(32, 0);
    size_t count = 0;
    mpz_export(target.data(), &count, 1, 1, 1, 0, num);

    // Pad leading zeros if needed
    if (count < 32) {
        size_t diff = 32 - count;
        std::vector<uint8_t> padded(32, 0);
        memcpy(padded.data() + diff, target.data(), count);
        target = padded;
    }

    mpz_clear(num);
    return target;
}
