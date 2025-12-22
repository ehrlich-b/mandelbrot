# WASM Build for Mandelbrot Arbitrary Precision
#
# Usage:
#   make          - Build optimized WASM
#   make debug    - Build with debug symbols
#   make clean    - Remove build artifacts

CC = emcc
CFLAGS = -O3 -s WASM=1 -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","lengthBytesUTF8","HEAPF64","HEAP32"]'
EXPORTS = -s EXPORTED_FUNCTIONS='["_wasm_mandelbrot_iterate","_wasm_mandelbrot_tile","_wasm_alloc_tile","_wasm_free_tile","_wasm_alloc_string","_wasm_free_string","_wasm_compute_reference_orbit","_wasm_alloc_orbit","_wasm_free_orbit","_wasm_alloc_int","_wasm_free_int","_malloc","_free"]'
FLAGS = -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=16777216 -s MAXIMUM_MEMORY=536870912
MODULARIZE = -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME='createBigFloatModule'

SRC = bigfloat.c
OUT_DIR = ../wasm-out
OUT = $(OUT_DIR)/bigfloat.js

.PHONY: all debug clean

all: $(OUT_DIR) $(OUT)
	@echo "Build complete: $(OUT)"
	@ls -lh $(OUT_DIR)/bigfloat.*

$(OUT_DIR):
	mkdir -p $(OUT_DIR)

$(OUT): $(SRC)
	$(CC) $(CFLAGS) $(EXPORTS) $(FLAGS) $(MODULARIZE) -o $(OUT) $(SRC)

debug: CFLAGS = -O0 -g -s WASM=1 -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","lengthBytesUTF8","HEAPF64","HEAP32"]' -s ASSERTIONS=2
debug: $(OUT_DIR) $(OUT)
	@echo "Debug build complete"

clean:
	rm -rf $(OUT_DIR)
