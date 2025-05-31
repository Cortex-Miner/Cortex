// dag_generator.h
#ifndef DAG_GENERATOR_H
#define DAG_GENERATOR_H

#include <vector>
#include <array>
#include <cstdint>

// Generates a simplified DAG used for Autolykos2 GPU mining
std::vector<std::array<uint8_t, 32>> generate_full_dag();

#endif // DAG_GENERATOR_H
