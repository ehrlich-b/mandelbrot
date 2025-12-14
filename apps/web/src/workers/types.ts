/**
 * Worker message types and interfaces
 */

// Tile coordinate system
export interface TileCoord {
  x: number;      // Tile X index
  y: number;      // Tile Y index
  level: number;  // Zoom level (0 = most zoomed out)
}

// Viewport in complex plane coordinates
export interface ViewportParams {
  centerX: number;
  centerY: number;
  scale: number;
  // For DD precision (string representation)
  centerXStr?: string;
  centerYStr?: string;
  scaleStr?: string;
}

// Precision modes for tile rendering
export type TilePrecisionMode = 'standard' | 'dd' | 'arbitrary';

// Render parameters for a tile
export interface TileRenderParams {
  tile: TileCoord;
  viewport: ViewportParams;
  tileSize: number;        // Pixels (e.g., 256)
  maxIterations: number;
  colorScheme: number;
  antiAliasing: boolean;
  useDD: boolean;          // Use double-double precision (legacy, prefer precisionMode)
  precisionMode?: TilePrecisionMode;  // Explicit precision selection
  precisionLimbs?: number; // For arbitrary precision: number of 32-bit limbs (4-128)
}

// Result from tile rendering
export interface TileRenderResult {
  tile: TileCoord;
  iterations: Float32Array;  // Raw iteration data (tileSize * tileSize)
  renderTime: number;        // ms
  precision: 'standard' | 'dd' | 'arbitrary';
}

// Messages from main thread to worker
export type WorkerRequest =
  | { type: 'init'; workerId: number; capabilities: WorkerCapabilities }
  | { type: 'render-tile'; id: number; params: TileRenderParams }
  | { type: 'cancel'; id: number }
  | { type: 'set-reference-orbit'; orbit: Float64Array; centerX: string; centerY: string }
  | { type: 'terminate' };

// Messages from worker to main thread
export type WorkerResponse =
  | { type: 'ready'; workerId: number }
  | { type: 'tile-complete'; id: number; result: TileRenderResult }
  | { type: 'tile-progress'; id: number; progress: number }
  | { type: 'tile-error'; id: number; error: string }
  | { type: 'cancelled'; id: number };

// Worker capabilities (detected at init)
export interface WorkerCapabilities {
  offscreenCanvas: boolean;
  webgl2: boolean;
  sharedArrayBuffer: boolean;
  simd: boolean;
  wasm: boolean;           // WebAssembly available
  wasmBigFloat: boolean;   // Our bigfloat WASM module loaded
}

// Detect capabilities in current context
export function detectCapabilities(): WorkerCapabilities {
  return {
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    webgl2: (() => {
      if (typeof OffscreenCanvas === 'undefined') return false;
      try {
        const canvas = new OffscreenCanvas(1, 1);
        return !!canvas.getContext('webgl2');
      } catch {
        return false;
      }
    })(),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    simd: (() => {
      try {
        return WebAssembly.validate(new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
        ]));
      } catch {
        return false;
      }
    })(),
    wasm: typeof WebAssembly !== 'undefined',
    wasmBigFloat: false  // Will be set after attempting to load the module
  };
}
