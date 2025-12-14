/**
 * BigFloatWasm - TypeScript bindings for arbitrary precision WASM module
 *
 * Provides a clean API for arbitrary precision Mandelbrot computation.
 * Falls back to JavaScript implementation if WASM unavailable.
 */

// Type for the Emscripten module
interface BigFloatModule {
  ccall: (
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[]
  ) => unknown;
  cwrap: (
    name: string,
    returnType: string | null,
    argTypes: string[]
  ) => (...args: unknown[]) => unknown;
  UTF8ToString: (ptr: number) => string;
  stringToUTF8: (str: string, ptr: number, maxLen: number) => void;
  lengthBytesUTF8: (str: string) => number;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPF32: Float32Array;
}

// Wrapped functions
interface WasmFunctions {
  mandelbrotIterate: (cr: string, ci: string, maxIter: number, precLimbs: number) => number;
  allocTile: (size: number) => number;
  freeTile: (ptr: number) => void;
  allocString: (len: number) => number;
  freeString: (ptr: number) => void;
  mandelbrotTile: (
    centerR: number,
    centerI: number,
    scale: number,
    tileSize: number,
    maxIter: number,
    precLimbs: number,
    outPtr: number
  ) => void;
}

/**
 * BigFloatWasm class - manages WASM module lifecycle
 */
export class BigFloatWasm {
  private module: BigFloatModule | null = null;
  private funcs: WasmFunctions | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the WASM module
   */
  async init(): Promise<boolean> {
    if (this.initialized) return true;
    if (this.initPromise) {
      await this.initPromise;
      return this.initialized;
    }

    this.initPromise = this.doInit();
    await this.initPromise;
    return this.initialized;
  }

  private async doInit(): Promise<void> {
    try {
      // Dynamic import of the WASM module
      const createModule = await import('../wasm-out/bigfloat.js');
      this.module = await createModule.default();

      // Wrap functions for easier use
      const mod = this.module;
      this.funcs = {
        mandelbrotIterate: mod.cwrap(
          'wasm_mandelbrot_iterate',
          'number',
          ['number', 'number', 'number', 'number']
        ) as (cr: string, ci: string, maxIter: number, precLimbs: number) => number,

        allocTile: mod.cwrap(
          'wasm_alloc_tile',
          'number',
          ['number']
        ) as (size: number) => number,

        freeTile: mod.cwrap(
          'wasm_free_tile',
          null,
          ['number']
        ) as (ptr: number) => void,

        allocString: mod.cwrap(
          'wasm_alloc_string',
          'number',
          ['number']
        ) as (len: number) => number,

        freeString: mod.cwrap(
          'wasm_free_string',
          null,
          ['number']
        ) as (ptr: number) => void,

        mandelbrotTile: mod.cwrap(
          'wasm_mandelbrot_tile',
          null,
          ['number', 'number', 'number', 'number', 'number', 'number', 'number']
        ) as (
          centerR: number,
          centerI: number,
          scale: number,
          tileSize: number,
          maxIter: number,
          precLimbs: number,
          outPtr: number
        ) => void,
      };

      this.initialized = true;
      console.log('BigFloatWasm initialized');
    } catch (error) {
      console.warn('Failed to initialize WASM module:', error);
      this.initialized = false;
    }
  }

  /**
   * Check if WASM is available
   */
  isAvailable(): boolean {
    return this.initialized && this.module !== null;
  }

  /**
   * Allocate a string in WASM memory and copy content
   */
  private allocString(str: string): number {
    if (!this.module) throw new Error('WASM not initialized');
    const len = this.module.lengthBytesUTF8(str) + 1;
    const ptr = this.funcs!.allocString(len);
    this.module.stringToUTF8(str, ptr, len);
    return ptr;
  }

  /**
   * Compute Mandelbrot iteration count for a single point
   */
  mandelbrotIterate(
    cr: string,
    ci: string,
    maxIter: number,
    precisionLimbs: number = 8
  ): number {
    if (!this.module || !this.funcs) {
      throw new Error('WASM not initialized');
    }

    const crPtr = this.allocString(cr);
    const ciPtr = this.allocString(ci);

    try {
      return this.module.ccall(
        'wasm_mandelbrot_iterate',
        'number',
        ['number', 'number', 'number', 'number'],
        [crPtr, ciPtr, maxIter, precisionLimbs]
      ) as number;
    } finally {
      this.funcs.freeString(crPtr);
      this.funcs.freeString(ciPtr);
    }
  }

  /**
   * Render a tile using arbitrary precision
   */
  renderTile(
    centerR: string,
    centerI: string,
    scale: string,
    tileSize: number,
    maxIter: number,
    precisionLimbs: number = 8
  ): Float32Array {
    if (!this.module || !this.funcs) {
      throw new Error('WASM not initialized');
    }

    const crPtr = this.allocString(centerR);
    const ciPtr = this.allocString(centerI);
    const scalePtr = this.allocString(scale);
    const outPtr = this.funcs.allocTile(tileSize);

    try {
      this.module.ccall(
        'wasm_mandelbrot_tile',
        null,
        ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [crPtr, ciPtr, scalePtr, tileSize, maxIter, precisionLimbs, outPtr]
      );

      // Copy result from WASM memory
      const result = new Float32Array(tileSize * tileSize);
      const heapOffset = outPtr / 4; // Float32 = 4 bytes
      result.set(this.module.HEAPF32.subarray(heapOffset, heapOffset + tileSize * tileSize));

      return result;
    } finally {
      this.funcs.freeString(crPtr);
      this.funcs.freeString(ciPtr);
      this.funcs.freeString(scalePtr);
      this.funcs.freeTile(outPtr);
    }
  }

  /**
   * Get recommended precision limbs for a given scale
   * More limbs = more precision but slower
   */
  static getPrecisionForScale(scale: number): number {
    // Each limb gives ~9.6 decimal digits of precision
    // scale = 1e-N requires about N/9.6 limbs
    const logScale = -Math.log10(scale);
    const limbs = Math.ceil(logScale / 9.6) + 2; // +2 for safety margin
    return Math.max(4, Math.min(128, limbs));
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.module = null;
    this.funcs = null;
    this.initialized = false;
    this.initPromise = null;
  }
}

// Singleton instance
let instance: BigFloatWasm | null = null;

/**
 * Get the shared BigFloatWasm instance
 */
export function getBigFloatWasm(): BigFloatWasm {
  if (!instance) {
    instance = new BigFloatWasm();
  }
  return instance;
}

/**
 * Initialize the shared instance
 */
export async function initBigFloatWasm(): Promise<boolean> {
  return getBigFloatWasm().init();
}
