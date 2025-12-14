/**
 * Tile rendering worker
 *
 * Renders Mandelbrot tiles in a background thread.
 * Supports:
 * - Standard precision (float64 CPU)
 * - DD precision (double-double CPU)
 * - Arbitrary precision (WASM bigfloat)
 */

import type {
  WorkerRequest,
  WorkerResponse,
  WorkerCapabilities,
  TileRenderParams,
  TilePrecisionMode
} from './types';

let workerId = -1;
let workerCapabilities: WorkerCapabilities | null = null;
let currentTaskId: number | null = null;
let cancelled = false;

// WASM module state
let wasmModule: BigFloatModule | null = null;
let wasmInitPromise: Promise<void> | null = null;

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
  HEAPF32: Float32Array;
}

/**
 * Initialize WASM module
 */
async function initWasm(): Promise<boolean> {
  if (wasmModule) return true;
  if (wasmInitPromise) {
    await wasmInitPromise;
    return wasmModule !== null;
  }

  wasmInitPromise = (async () => {
    try {
      // Dynamic import of the WASM module
      const createModule = await import('../wasm-out/bigfloat.js');
      wasmModule = await createModule.default();
      console.log(`Worker ${workerId}: WASM module loaded`);
    } catch (error) {
      console.warn(`Worker ${workerId}: Failed to load WASM module:`, error);
      wasmModule = null;
    }
  })();

  await wasmInitPromise;
  return wasmModule !== null;
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  switch (message.type) {
    case 'init':
      workerId = message.workerId;
      workerCapabilities = message.capabilities;

      // Try to load WASM module
      const wasmLoaded = await initWasm();
      if (workerCapabilities) {
        workerCapabilities.wasmBigFloat = wasmLoaded;
      }

      console.log(`Worker ${workerId} initialized with capabilities:`, workerCapabilities);
      respond({ type: 'ready', workerId });
      break;

    case 'render-tile':
      currentTaskId = message.id;
      cancelled = false;
      await renderTile(message.id, message.params);
      break;

    case 'cancel':
      if (currentTaskId === message.id) {
        cancelled = true;
      }
      break;

    case 'set-reference-orbit':
      // For future perturbation theory implementation
      break;

    case 'terminate':
      self.close();
      break;
  }
};

function respond(message: WorkerResponse): void {
  self.postMessage(message);
}

/**
 * Determine precision mode from params
 */
function getPrecisionMode(params: TileRenderParams): TilePrecisionMode {
  if (params.precisionMode) {
    return params.precisionMode;
  }
  return params.useDD ? 'dd' : 'standard';
}

/**
 * Render a single tile
 */
async function renderTile(id: number, params: TileRenderParams): Promise<void> {
  const startTime = performance.now();
  const precisionMode = getPrecisionMode(params);

  try {
    let result: Float32Array;

    switch (precisionMode) {
      case 'arbitrary':
        result = await renderTileArbitrary(params);
        break;
      case 'dd':
        result = renderTileDD(params);
        break;
      default:
        result = renderTileStandard(params);
    }

    if (cancelled) {
      respond({ type: 'cancelled', id });
      return;
    }

    const renderTime = performance.now() - startTime;

    respond({
      type: 'tile-complete',
      id,
      result: {
        tile: params.tile,
        iterations: result,
        renderTime,
        precision: precisionMode
      }
    });
  } catch (error) {
    respond({
      type: 'tile-error',
      id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  currentTaskId = null;
}

/**
 * Standard precision Mandelbrot computation (CPU)
 */
function renderTileStandard(params: TileRenderParams): Float32Array {
  const { tile, viewport, tileSize, maxIterations } = params;
  const iterations = new Float32Array(tileSize * tileSize);

  // Calculate tile bounds in complex plane
  const tileWorldSize = viewport.scale / Math.pow(2, tile.level);
  const tileLeft = viewport.centerX + (tile.x - 0.5) * tileWorldSize;
  const tileTop = viewport.centerY + (tile.y - 0.5) * tileWorldSize;
  const pixelSize = tileWorldSize / tileSize;

  for (let py = 0; py < tileSize; py++) {
    if (cancelled) break;

    const cImag = tileTop + py * pixelSize;

    for (let px = 0; px < tileSize; px++) {
      const cReal = tileLeft + px * pixelSize;
      const mu = mandelbrotIterate(cReal, cImag, maxIterations);
      iterations[py * tileSize + px] = mu;
    }

    // Report progress every 16 rows
    if (py % 16 === 0) {
      respond({
        type: 'tile-progress',
        id: currentTaskId!,
        progress: py / tileSize
      });
    }
  }

  return iterations;
}

/**
 * Double-double precision Mandelbrot computation (CPU)
 */
function renderTileDD(params: TileRenderParams): Float32Array {
  const { tile, viewport, tileSize, maxIterations } = params;
  const iterations = new Float32Array(tileSize * tileSize);

  // Use string coordinates if available for precision
  const centerX = viewport.centerXStr
    ? parseFloat(viewport.centerXStr)
    : viewport.centerX;
  const centerY = viewport.centerYStr
    ? parseFloat(viewport.centerYStr)
    : viewport.centerY;
  const scale = viewport.scaleStr
    ? parseFloat(viewport.scaleStr)
    : viewport.scale;

  // Calculate tile bounds
  const tileWorldSize = scale / Math.pow(2, tile.level);
  const tileLeft = centerX + (tile.x - 0.5) * tileWorldSize;
  const tileTop = centerY + (tile.y - 0.5) * tileWorldSize;
  const pixelSize = tileWorldSize / tileSize;

  // For now, use standard precision CPU
  // TODO: Implement proper DD arithmetic
  for (let py = 0; py < tileSize; py++) {
    if (cancelled) break;

    const cImag = tileTop + py * pixelSize;

    for (let px = 0; px < tileSize; px++) {
      const cReal = tileLeft + px * pixelSize;
      const mu = mandelbrotIterate(cReal, cImag, maxIterations);
      iterations[py * tileSize + px] = mu;
    }

    if (py % 16 === 0) {
      respond({
        type: 'tile-progress',
        id: currentTaskId!,
        progress: py / tileSize
      });
    }
  }

  return iterations;
}

/**
 * Arbitrary precision Mandelbrot computation (WASM)
 */
async function renderTileArbitrary(params: TileRenderParams): Promise<Float32Array> {
  const { tile, viewport, tileSize, maxIterations } = params;
  const precisionLimbs = params.precisionLimbs || 8;

  // Ensure WASM is loaded
  if (!wasmModule) {
    const loaded = await initWasm();
    if (!loaded) {
      console.warn('WASM not available, falling back to standard precision');
      return renderTileStandard(params);
    }
  }

  const mod = wasmModule!;

  // Use string coordinates for full precision
  const centerXStr = viewport.centerXStr || viewport.centerX.toString();
  const centerYStr = viewport.centerYStr || viewport.centerY.toString();
  const scaleStr = viewport.scaleStr || viewport.scale.toString();

  // Calculate tile center in string representation
  const scale = parseFloat(scaleStr);
  const tileWorldSize = scale / Math.pow(2, tile.level);

  // For arbitrary precision, we need to calculate tile bounds with full precision
  // For now, use approximate calculation
  const tileCenterX = parseFloat(centerXStr) + (tile.x) * tileWorldSize;
  const tileCenterY = parseFloat(centerYStr) + (tile.y) * tileWorldSize;
  const tileCenterXStr = tileCenterX.toPrecision(17);
  const tileCenterYStr = tileCenterY.toPrecision(17);
  const tileScaleStr = tileWorldSize.toPrecision(17);

  // Allocate strings in WASM memory
  const allocString = (str: string): number => {
    const len = mod.lengthBytesUTF8(str) + 1;
    const ptr = mod._malloc(len);
    mod.stringToUTF8(str, ptr, len);
    return ptr;
  };

  const crPtr = allocString(tileCenterXStr);
  const ciPtr = allocString(tileCenterYStr);
  const scalePtr = allocString(tileScaleStr);

  // Allocate output buffer
  const outPtr = mod._malloc(tileSize * tileSize * 4); // Float32 = 4 bytes

  try {
    // Report start of potentially slow operation
    respond({
      type: 'tile-progress',
      id: currentTaskId!,
      progress: 0
    });

    // Call WASM function
    mod.ccall(
      'wasm_mandelbrot_tile',
      null,
      ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [crPtr, ciPtr, scalePtr, tileSize, maxIterations, precisionLimbs, outPtr]
    );

    // Copy result from WASM memory
    const result = new Float32Array(tileSize * tileSize);
    const heapOffset = outPtr / 4;
    result.set(mod.HEAPF32.subarray(heapOffset, heapOffset + tileSize * tileSize));

    return result;
  } finally {
    // Free WASM memory
    mod._free(crPtr);
    mod._free(ciPtr);
    mod._free(scalePtr);
    mod._free(outPtr);
  }
}

/**
 * Core Mandelbrot iteration with smooth coloring
 */
function mandelbrotIterate(cReal: number, cImag: number, maxIter: number): number {
  let zReal = 0;
  let zImag = 0;
  let zReal2 = 0;
  let zImag2 = 0;
  const escapeRadius2 = 16; // 4^2, using larger radius for smoother coloring

  for (let i = 0; i < maxIter; i++) {
    zImag = 2 * zReal * zImag + cImag;
    zReal = zReal2 - zImag2 + cReal;
    zReal2 = zReal * zReal;
    zImag2 = zImag * zImag;

    const r2 = zReal2 + zImag2;
    if (r2 > escapeRadius2) {
      // Smooth coloring using normalized iteration count
      const logZn = Math.log(r2) * 0.5;
      const nu = Math.log(logZn / Math.LN2) / Math.LN2;
      return Math.max(0, i + 1 - nu);
    }
  }

  return -1; // Interior point
}

// Export for type checking (won't be used at runtime)
export {};
