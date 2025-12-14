/**
 * Tile-based rendering system types
 *
 * The tile system divides the viewport into cacheable chunks.
 * Each tile contains raw iteration data (palette-agnostic) for maximum reuse.
 */

/**
 * Tile coordinates in the tile grid
 * Level 0 = most zoomed out (whole Mandelbrot set fits in a few tiles)
 * Higher levels = more zoomed in
 */
export interface TileCoord {
  x: number;      // Tile X index (0 at left edge of complex plane)
  y: number;      // Tile Y index (0 at top edge of complex plane)
  level: number;  // Zoom level (0 = most zoomed out)
}

/**
 * Tile state in the rendering pipeline
 */
export type TileStatus =
  | 'pending'     // Queued for rendering
  | 'rendering'   // Currently being computed
  | 'complete'    // Ready to display
  | 'error';      // Failed to render

/**
 * Precision mode for tile computation
 */
export type TilePrecision = 'standard' | 'dd' | 'arbitrary';

/**
 * A rendered tile with iteration data
 */
export interface Tile {
  // Coordinates
  coord: TileCoord;

  // Complex plane bounds (for cache key and compositor)
  centerReal: number;
  centerImag: number;
  scale: number;  // Size of tile in complex plane units

  // High precision coordinates (for DD/arbitrary precision)
  centerRealStr?: string;
  centerImagStr?: string;
  scaleStr?: string;

  // Render parameters
  maxIterations: number;
  precision: TilePrecision;

  // Iteration data (palette-agnostic)
  // Each value is smooth iteration count (-1 for interior points)
  iterations: Float32Array;

  // Metadata
  status: TileStatus;
  renderTime: number;     // ms to compute
  lastAccessed: number;   // For LRU eviction
  size: number;           // Tile size in pixels (256 or 512)
}

/**
 * Configuration for the tile system
 */
export interface TileConfig {
  /** Tile size in pixels (default: 256) */
  tileSize: number;

  /** Maximum tiles in L1 GPU cache (default: 64) */
  l1CacheSize: number;

  /** Maximum tiles in L2 RAM cache (default: 256) */
  l2CacheSize: number;

  /** Enable L3 IndexedDB cache (default: true) */
  useL3Cache: boolean;

  /** Maximum tiles in L3 disk cache (default: 2048) */
  l3CacheSize: number;

  /** Number of worker threads (default: navigator.hardwareConcurrency - 1) */
  workerCount: number;

  /** Maximum concurrent tile renders (default: 4) */
  maxConcurrentRenders: number;
}

/**
 * Default configuration
 */
export const DEFAULT_TILE_CONFIG: TileConfig = {
  tileSize: 256,
  l1CacheSize: 64,
  l2CacheSize: 256,
  useL3Cache: true,
  l3CacheSize: 2048,
  workerCount: Math.max(2, (navigator.hardwareConcurrency || 4) - 1),
  maxConcurrentRenders: 4,
};

/**
 * Viewport information for tile calculations
 */
export interface TileViewport {
  centerX: number;
  centerY: number;
  scale: number;  // Width of viewport in complex plane units
  width: number;  // Canvas width in pixels
  height: number; // Canvas height in pixels
  maxIterations: number;

  // High precision coordinates (optional)
  centerXStr?: string;
  centerYStr?: string;
  scaleStr?: string;
}

/**
 * Request for a tile to be rendered
 */
export interface TileRequest {
  coord: TileCoord;
  viewport: TileViewport;
  priority: 'visible' | 'prefetch';
  precision: TilePrecision;
}

/**
 * Tile with GPU texture reference
 * Used in L1 cache for fast compositing
 */
export interface GPUTile extends Tile {
  texture: WebGLTexture;
  textureValid: boolean;
}

/**
 * Statistics about tile rendering
 */
export interface TileStats {
  totalTiles: number;
  visibleTiles: number;
  cachedTiles: number;
  pendingTiles: number;
  renderingTiles: number;
  cacheHitRate: number;
  averageRenderTime: number;
  memoryUsage: number;  // bytes
}

/**
 * Calculate tile coordinate from complex plane position and zoom level
 */
export function complexToTile(
  real: number,
  imag: number,
  level: number,
  _config: TileConfig = DEFAULT_TILE_CONFIG
): TileCoord {
  // At level 0, the whole Mandelbrot set (-2.5 to 1, -1.5 to 1.5) fits in ~4x3 tiles
  // Each level doubles the resolution
  const tilesPerUnit = Math.pow(2, level) / 4; // 4 = base scale factor

  // Offset so tile (0,0) is at center of Mandelbrot set
  const offsetReal = real + 0.75;  // Center around -0.75
  const offsetImag = imag;

  const x = Math.floor(offsetReal * tilesPerUnit);
  const y = Math.floor(offsetImag * tilesPerUnit);

  return { x, y, level };
}

/**
 * Calculate complex plane bounds for a tile
 */
export function tileToComplex(
  coord: TileCoord,
  _config: TileConfig = DEFAULT_TILE_CONFIG
): { centerReal: number; centerImag: number; scale: number } {
  const tilesPerUnit = Math.pow(2, coord.level) / 4;
  const tileScale = 1 / tilesPerUnit;

  // Reverse the offset
  const centerReal = (coord.x + 0.5) * tileScale - 0.75;
  const centerImag = (coord.y + 0.5) * tileScale;

  return { centerReal, centerImag, scale: tileScale };
}

/**
 * Calculate which tiles are visible in the viewport
 */
export function getVisibleTiles(
  viewport: TileViewport,
  config: TileConfig = DEFAULT_TILE_CONFIG
): TileCoord[] {
  // Calculate appropriate zoom level for this viewport
  // We want tiles to be roughly tileSize pixels on screen
  const pixelsPerComplexUnit = viewport.width / viewport.scale;
  const level = Math.max(0, Math.floor(Math.log2(pixelsPerComplexUnit / config.tileSize * 4)));

  // Calculate tile bounds
  const tilesPerUnit = Math.pow(2, level) / 4;

  // Viewport bounds in complex plane
  const aspect = viewport.height / viewport.width;
  const halfWidth = viewport.scale / 2;
  const halfHeight = halfWidth * aspect;

  const left = viewport.centerX - halfWidth;
  const right = viewport.centerX + halfWidth;
  const top = viewport.centerY + halfHeight;
  const bottom = viewport.centerY - halfHeight;

  // Convert to tile coordinates with offset
  const minX = Math.floor((left + 0.75) * tilesPerUnit);
  const maxX = Math.ceil((right + 0.75) * tilesPerUnit);
  const minY = Math.floor(bottom * tilesPerUnit);
  const maxY = Math.ceil(top * tilesPerUnit);

  // Generate tile list
  const tiles: TileCoord[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      tiles.push({ x, y, level });
    }
  }

  return tiles;
}

/**
 * Generate a cache key for a tile
 */
export function getTileKey(coord: TileCoord, maxIterations: number): string {
  return `${coord.level}_${coord.x}_${coord.y}_${maxIterations}`;
}

/**
 * Calculate memory usage for a tile
 */
export function getTileMemoryUsage(size: number): number {
  // Float32Array: 4 bytes per pixel
  return size * size * 4;
}
