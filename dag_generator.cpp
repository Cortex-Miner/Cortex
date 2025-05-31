// dag_generator.cpp
#include "dag_generator.h"
#include "blake2b.h"
#include <vector>
#include <array>
#include <cstring>

std::vector<std::array<uint8_t, 32>> generate_full_dag() {
    std::vector<std::array<uint8_t, 32>> dag;
    dag.reserve(256);

    for (uint32_t i = 0; i < 256; ++i) {
        std::array<uint8_t, 4> input{};
        input[0] = i & 0xFF;
        input[1] = (i >> 8) & 0xFF;
        input[2] = (i >> 16) & 0xFF;
        input[3] = (i >> 24) & 0xFF;

        std::array<uint8_t, 32> output{};
        blake2b(output.data(), 32, input.data(), input.size(), nullptr, 0);
        dag.push_back(output);
    }

    return dag;
}
