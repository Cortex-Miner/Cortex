
# ==== COMPILER & FLAGS ====
CXX = g++-11
NVCC = nvcc
CXXFLAGS = -O3 -std=c++17 -I. -fPIC
NVCCFLAGS = -O3 -arch=compute_86 -code=sm_86 -I. -allow-unsupported-compiler -Xcompiler -fPIC -Xlinker --no-as-needed

# ==== SOURCES & OBJECTS ====
SRCS_CPP = main.cpp stratum_client.cpp utils.cpp dag_generator.cpp nonce_logger.cpp
SRCS_CU = autolykos2_cuda_miner.cu blake2b_cuda.cu
SRCS_C = blake2b.c
OBJS_CPP = $(SRCS_CPP:.cpp=.o)
OBJS_CU = $(SRCS_CU:.cu=.o)
OBJS_C = $(SRCS_C:.c=.o)
DLINK_OBJ = miner_dlink.o

# ==== TARGET ====
TARGET = miner

# ==== LIBRARIES ====
LIBS = -lcurl -lssl -lcrypto -lgmp -L/usr/local/cuda/lib64 -lcudart_static -lcuda -lstdc++fs

# ==== RULES ====

all: $(TARGET)

%.o: %.cu
	$(NVCC) $(NVCCFLAGS) -dc $< -o $@

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

%.o: %.c
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(DLINK_OBJ): $(OBJS_CU)
	$(NVCC) $(NVCCFLAGS) -dlink $(OBJS_CU) -o $@

$(TARGET): $(OBJS_CPP) $(OBJS_CU) $(OBJS_C) $(DLINK_OBJ)
	$(CXX) -o $@ $(OBJS_CPP) $(OBJS_CU) $(OBJS_C) $(DLINK_OBJ) $(LIBS)

clean:
	rm -f *.o $(TARGET) $(DLINK_OBJ)

.PHONY: all clean
