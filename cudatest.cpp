#include <iostream>
#include <cuda_runtime.h>

int main() {
    int deviceCount = 0;
    cudaGetDeviceCount(&deviceCount);
    std::cout << "Detected CUDA devices: " << deviceCount << std::endl;

    cudaDeviceProp prop;
    cudaGetDeviceProperties(&prop, 0);
    std::cout << "Name: " << prop.name << ", Compute Cap: " << prop.major << "." << prop.minor << std::endl;
}
