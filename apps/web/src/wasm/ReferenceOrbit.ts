/**
 * ReferenceOrbit - Manages reference orbit computation for perturbation theory
 *
 * Perturbation theory key insight:
 * Instead of computing z_{n+1} = z_n² + c at arbitrary precision for every pixel,
 * we compute ONE reference orbit Z_n at the center, then compute deltas:
 *   δ_{n+1} = 2·Z_n·δ_n + δ_n² + δc
 *
 * The deltas (δ) can be computed at float64 precision - much faster!
 */

// Type for the Emscripten module
interface BigFloatModule {
  ccall: (
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[]
  ) => unknown;
  UTF8ToString: (ptr: number) => string;
  stringToUTF8: (str: string, ptr: number, maxLen: number) => void;
  lengthBytesUTF8: (str: string) => number;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  // Optional - may or may not be exported depending on build
  HEAPF64?: Float64Array;
  HEAP32?: Int32Array;
  // Alternative memory access
  asm?: { memory?: WebAssembly.Memory };
  wasmMemory?: WebAssembly.Memory;
}

/**
 * Reference orbit data
 */
export interface ReferenceOrbitData {
  // Reference point coordinates (string for full precision)
  centerReal: string;
  centerImag: string;

  // Orbit values (float64, may lose precision at extreme zoom)
  orbitReal: Float64Array;
  orbitImag: Float64Array;

  // Metadata
  length: number; // Actual iterations computed
  escapeIteration: number; // -1 if didn't escape, otherwise iteration when |Z| > threshold
  maxIterations: number;
  precisionLimbs: number;
}

/**
 * ReferenceOrbit class - computes and manages reference orbits
 */
export class ReferenceOrbit {
  private module: BigFloatModule | null = null;
  private initialized = false;
  private initPromise: Promise<boolean> | null = null;

  // Current reference orbit (cached)
  private currentOrbit: ReferenceOrbitData | null = null;

  /**
   * Get Float64 view of WASM memory
   * Note: The module exports HEAPF64 directly after we patched bigfloat.js
   */
  private getHEAPF64(): Float64Array {
    if (!this.module || !this.module.HEAPF64) {
      throw new Error('WASM not initialized or HEAPF64 not available');
    }
    return this.module.HEAPF64;
  }

  /**
   * Get Int32 view of WASM memory
   * Note: The module exports HEAP32 directly after we patched bigfloat.js
   */
  private getHEAP32(): Int32Array {
    if (!this.module || !this.module.HEAP32) {
      throw new Error('WASM not initialized or HEAP32 not available');
    }
    return this.module.HEAP32;
  }

  /**
   * Initialize with WASM module
   */
  async init(): Promise<boolean> {
    if (this.initialized) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<boolean> {
    try {
      const createModule = await import('../wasm-out/bigfloat.js');
      this.module = await createModule.default();

      // Verify memory access is available
      console.log('HEAPF64 available:', !!this.module.HEAPF64);
      console.log('HEAP32 available:', !!this.module.HEAP32);
      console.log('wasmMemory available:', !!this.module.wasmMemory);

      if (!this.module.HEAPF64 || !this.module.HEAP32) {
        console.error('ReferenceOrbit: WASM memory access not available');
        return false;
      }

      this.initialized = true;
      console.log('ReferenceOrbit WASM initialized successfully');
      return true;
    } catch (error) {
      console.warn('ReferenceOrbit: Failed to initialize WASM:', error);
      return false;
    }
  }

  /**
   * Check if WASM is available
   */
  isAvailable(): boolean {
    return this.initialized && this.module !== null;
  }

  /**
   * Allocate string in WASM memory
   */
  private allocString(str: string): number {
    if (!this.module) throw new Error('WASM not initialized');
    const len = this.module.lengthBytesUTF8(str) + 1;
    const ptr = this.module._malloc(len);
    this.module.stringToUTF8(str, ptr, len);
    return ptr;
  }

  /**
   * Compute reference orbit at given center
   */
  computeReferenceOrbit(
    centerReal: string,
    centerImag: string,
    maxIterations: number,
    precisionLimbs: number = 8
  ): ReferenceOrbitData {
    if (!this.module) {
      throw new Error('WASM not initialized');
    }

    const mod = this.module;

    // Allocate input strings
    const crPtr = this.allocString(centerReal);
    const ciPtr = this.allocString(centerImag);

    // Allocate output arrays
    const orbitRePtr = mod._malloc((maxIterations + 1) * 8); // Float64 = 8 bytes
    const orbitImPtr = mod._malloc((maxIterations + 1) * 8);
    const escapeIterPtr = mod._malloc(4); // int = 4 bytes

    try {
      // Call WASM function
      const length = mod.ccall(
        'wasm_compute_reference_orbit',
        'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [crPtr, ciPtr, maxIterations, precisionLimbs, orbitRePtr, orbitImPtr, escapeIterPtr]
      ) as number;

      // Copy results from WASM memory
      const orbitReal = new Float64Array(length + 1);
      const orbitImag = new Float64Array(length + 1);

      const heapF64 = this.getHEAPF64();
      const heapOffsetRe = orbitRePtr / 8;
      const heapOffsetIm = orbitImPtr / 8;
      orbitReal.set(heapF64.subarray(heapOffsetRe, heapOffsetRe + length + 1));
      orbitImag.set(heapF64.subarray(heapOffsetIm, heapOffsetIm + length + 1));

      // Get escape iteration
      const heap32 = this.getHEAP32();
      const escapeIteration = heap32[escapeIterPtr / 4];

      const orbit: ReferenceOrbitData = {
        centerReal,
        centerImag,
        orbitReal,
        orbitImag,
        length,
        escapeIteration,
        maxIterations,
        precisionLimbs,
      };

      // Cache the orbit
      this.currentOrbit = orbit;

      return orbit;
    } finally {
      // Free WASM memory
      mod._free(crPtr);
      mod._free(ciPtr);
      mod._free(orbitRePtr);
      mod._free(orbitImPtr);
      mod._free(escapeIterPtr);
    }
  }

  /**
   * Get current cached reference orbit
   */
  getCurrentOrbit(): ReferenceOrbitData | null {
    return this.currentOrbit;
  }

  /**
   * Check if we need to recompute the reference orbit
   * This happens when the center moves too far from the reference point
   */
  needsRecompute(
    newCenterReal: string,
    newCenterImag: string,
    scale: number
  ): boolean {
    if (!this.currentOrbit) return true;

    // At very deep zoom, float64 parsing loses precision.
    // Compare strings directly for equality first.
    if (this.currentOrbit.centerReal !== newCenterReal ||
        this.currentOrbit.centerImag !== newCenterImag) {
      // Centers are different strings - need to check if difference is significant

      // Parse current and new centers (note: this loses precision at very deep zoom)
      const curRe = parseFloat(this.currentOrbit.centerReal);
      const curIm = parseFloat(this.currentOrbit.centerImag);
      const newRe = parseFloat(newCenterReal);
      const newIm = parseFloat(newCenterImag);

      // If parse gives same value but strings differ, we're at precision limit
      // In this case, check if the string representations differ significantly
      if (curRe === newRe && curIm === newIm) {
        // Float64 can't distinguish them, but strings are different
        // This means we're at very deep zoom where precision matters
        // Recompute to be safe
        return true;
      }

      // If offset from reference is larger than 10% of viewport, recompute
      const dx = Math.abs(newRe - curRe);
      const dy = Math.abs(newIm - curIm);
      const maxOffset = scale * 0.1; // 10% of viewport (more aggressive)

      if (dx > maxOffset || dy > maxOffset) {
        return true;
      }
    }

    // Also recompute if scale changed significantly (more than 2x)
    if (this.lastScale !== undefined) {
      const scaleRatio = scale / this.lastScale;
      if (scaleRatio < 0.5 || scaleRatio > 2.0) {
        this.lastScale = scale; // Update for next comparison
        return true;
      }
    } else {
      // First call - store scale and recompute
      this.lastScale = scale;
      return true;
    }

    // Don't need to recompute - update lastScale for tracking
    this.lastScale = scale;
    return false;
  }

  private lastScale?: number;

  /**
   * Create a WebGL texture from the reference orbit
   * For GPU-based perturbation iteration
   */
  createOrbitTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
    if (!this.currentOrbit) return null;

    const orbit = this.currentOrbit;
    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Pack orbit as RGBA float: (re, im, |Z|², 0)
    // This allows efficient texture lookup in the shader
    const width = Math.min(orbit.length + 1, 8192); // Max texture width
    const height = Math.ceil((orbit.length + 1) / width);
    const data = new Float32Array(width * height * 4);

    for (let i = 0; i <= orbit.length && i < width * height; i++) {
      const re = orbit.orbitReal[i];
      const im = orbit.orbitImag[i];
      data[i * 4 + 0] = re;
      data[i * 4 + 1] = im;
      data[i * 4 + 2] = re * re + im * im; // |Z|² for glitch detection
      data[i * 4 + 3] = 0;
    }

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      width,
      height,
      0,
      gl.RGBA,
      gl.FLOAT,
      data
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return texture;
  }

  /**
   * Create typed arrays suitable for worker transfer
   */
  getTransferableOrbit(): {
    real: Float64Array;
    imag: Float64Array;
    metadata: {
      centerReal: string;
      centerImag: string;
      length: number;
      escapeIteration: number;
    };
  } | null {
    if (!this.currentOrbit) return null;

    return {
      real: this.currentOrbit.orbitReal,
      imag: this.currentOrbit.orbitImag,
      metadata: {
        centerReal: this.currentOrbit.centerReal,
        centerImag: this.currentOrbit.centerImag,
        length: this.currentOrbit.length,
        escapeIteration: this.currentOrbit.escapeIteration,
      },
    };
  }

  /**
   * Clear the cached reference orbit
   */
  clear(): void {
    this.currentOrbit = null;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.clear();
    this.module = null;
    this.initialized = false;
    this.initPromise = null;
  }
}

// Singleton instance
let instance: ReferenceOrbit | null = null;

/**
 * Get the shared ReferenceOrbit instance
 */
export function getReferenceOrbit(): ReferenceOrbit {
  if (!instance) {
    instance = new ReferenceOrbit();
  }
  return instance;
}

/**
 * Initialize the shared instance
 */
export async function initReferenceOrbit(): Promise<boolean> {
  return getReferenceOrbit().init();
}
