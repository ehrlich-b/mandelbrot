/**
 * TileManager - Manages tile lifecycle, caching, and rendering coordination
 *
 * Implements a multi-tier cache:
 * - L2: In-memory LRU cache (fast)
 * - L3: IndexedDB persistent cache (slow but large)
 *
 * L1 (GPU texture cache) is managed by TileCompositor.
 */

import {
  Tile,
  TileCoord,
  TileConfig,
  TileViewport,
  TileRequest,
  TileStats,
  TilePrecision,
  DEFAULT_TILE_CONFIG,
  getTileKey,
  getVisibleTiles,
  tileToComplex,
} from './types';
import { WorkerPool, TileRenderParams, TileRenderResult } from '../workers';
import { TileCache } from './TileCache';
import { ViewportPredictor, PredictedViewport, PrefetchDirection } from './ViewportPredictor';

/**
 * LRU Cache for tiles
 */
class TileLRUCache {
  private cache = new Map<string, Tile>();
  private accessOrder: string[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): Tile | undefined {
    const tile = this.cache.get(key);
    if (tile) {
      // Move to end (most recently used)
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.accessOrder.push(key);
      tile.lastAccessed = performance.now();
    }
    return tile;
  }

  set(key: string, tile: Tile): void {
    // If key exists, just update
    if (this.cache.has(key)) {
      this.cache.set(key, tile);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.accessOrder.push(key);
      return;
    }

    // Evict if at capacity
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift()!;
      this.cache.delete(oldestKey);
    }

    // Add new tile
    this.cache.set(key, tile);
    this.accessOrder.push(key);
    tile.lastAccessed = performance.now();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }

  values(): IterableIterator<Tile> {
    return this.cache.values();
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }
}

/**
 * TileManager coordinates tile rendering and caching
 */
export class TileManager {
  private config: TileConfig;
  private workerPool: WorkerPool | null = null;
  private l2Cache: TileLRUCache;
  private l3Cache: TileCache | null = null;
  private pendingRequests = new Map<string, TileRequest>();
  private renderingTiles = new Map<string, Promise<Tile>>();
  private l3Lookups = new Map<string, Promise<Tile | null>>();
  private listeners: ((tile: Tile) => void)[] = [];
  private initialized = false;

  // Predictive prefetch
  private predictor = new ViewportPredictor();
  private prefetchKeys = new Set<string>(); // Track prefetch requests for cancellation
  private prefetchEnabled = true;

  // Stats tracking
  private stats: TileStats = {
    totalTiles: 0,
    visibleTiles: 0,
    cachedTiles: 0,
    pendingTiles: 0,
    renderingTiles: 0,
    cacheHitRate: 0,
    averageRenderTime: 0,
    memoryUsage: 0,
  };
  private cacheHits = 0;
  private cacheMisses = 0;
  private l3Hits = 0;
  private renderTimes: number[] = [];

  constructor(config: Partial<TileConfig> = {}) {
    this.config = { ...DEFAULT_TILE_CONFIG, ...config };
    this.l2Cache = new TileLRUCache(this.config.l2CacheSize);
  }

  /**
   * Initialize the tile manager and worker pool
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize worker pool
    this.workerPool = new WorkerPool(this.config.workerCount);
    await this.workerPool.init();

    // Initialize L3 cache if enabled
    if (this.config.useL3Cache) {
      this.l3Cache = new TileCache(this.config.l3CacheSize);
      try {
        await this.l3Cache.init();
        console.log('L3 IndexedDB cache initialized');

        // Schedule periodic cleanup
        this.scheduleL3Cleanup();
      } catch (error) {
        console.warn('Failed to initialize L3 cache, continuing without persistence:', error);
        this.l3Cache = null;
      }
    }

    this.initialized = true;
    console.log('TileManager initialized with config:', this.config);
  }

  /**
   * Schedule periodic L3 cache cleanup
   */
  private scheduleL3Cleanup(): void {
    // Run cleanup every 5 minutes
    setInterval(() => {
      this.l3Cache?.cleanup().catch(console.error);
    }, 5 * 60 * 1000);
  }

  /**
   * Get configuration
   */
  getConfig(): TileConfig {
    return { ...this.config };
  }

  /**
   * Request tiles for a viewport
   * Returns immediately available tiles and queues missing ones
   */
  requestTiles(viewport: TileViewport): { available: Tile[]; pending: TileCoord[] } {
    // Track viewport for prediction
    this.predictor.update(viewport.centerX, viewport.centerY, viewport.scale);

    // Check for direction change and cancel stale prefetch
    if (this.predictor.hasDirectionChanged()) {
      this.cancelStalePrefetch();
    }

    const visibleCoords = getVisibleTiles(viewport, this.config);
    const available: Tile[] = [];
    const pending: TileCoord[] = [];

    // Determine precision based on scale
    const precision = this.getPrecisionForScale(viewport.scale);

    for (const coord of visibleCoords) {
      const key = getTileKey(coord, viewport.maxIterations);
      const cached = this.l2Cache.get(key);

      if (cached && cached.status === 'complete') {
        // L2 cache hit
        this.cacheHits++;
        available.push(cached);
      } else if (this.l3Lookups.has(key) || this.renderingTiles.has(key) || this.pendingRequests.has(key)) {
        // Already looking up, rendering, or pending
        pending.push(coord);
      } else {
        // Cache miss - check L3 first, then render if not found
        this.cacheMisses++;
        pending.push(coord);

        // Start L3 lookup if available
        if (this.l3Cache) {
          this.startL3Lookup(coord, viewport, precision);
        } else {
          // No L3 cache, queue for rendering immediately
          this.queueTileRequest({
            coord,
            viewport,
            priority: 'visible',
            precision,
          });
        }
      }
    }

    // Update stats
    this.stats.visibleTiles = visibleCoords.length;
    this.stats.cachedTiles = this.l2Cache.size;
    this.stats.pendingTiles = this.pendingRequests.size;
    this.stats.renderingTiles = this.renderingTiles.size;
    this.stats.cacheHitRate =
      this.cacheHits + this.cacheMisses > 0
        ? this.cacheHits / (this.cacheHits + this.cacheMisses)
        : 0;

    return { available, pending };
  }

  /**
   * Start async L3 cache lookup
   */
  private startL3Lookup(coord: TileCoord, viewport: TileViewport, precision: TilePrecision): void {
    const key = getTileKey(coord, viewport.maxIterations);

    const lookupPromise = this.l3Cache!.get(coord, viewport.maxIterations)
      .then((tile) => {
        this.l3Lookups.delete(key);

        if (tile) {
          // L3 hit! Promote to L2 and notify
          this.l3Hits++;
          this.l2Cache.set(key, tile);
          this.notifyListeners(tile);
          return tile;
        }

        // L3 miss - queue for rendering
        this.queueTileRequest({
          coord,
          viewport,
          priority: 'visible',
          precision,
        });
        return null;
      })
      .catch((error) => {
        console.error('L3 lookup error:', error);
        this.l3Lookups.delete(key);

        // Fall back to rendering
        this.queueTileRequest({
          coord,
          viewport,
          priority: 'visible',
          precision,
        });
        return null;
      });

    this.l3Lookups.set(key, lookupPromise);
  }

  /**
   * Queue a tile for rendering
   */
  private queueTileRequest(request: TileRequest): void {
    const key = getTileKey(request.coord, request.viewport.maxIterations);

    // Don't queue if already pending or rendering
    if (this.pendingRequests.has(key) || this.renderingTiles.has(key)) {
      return;
    }

    this.pendingRequests.set(key, request);
    this.processQueue();
  }

  /**
   * Process the request queue
   */
  private processQueue(): void {
    if (!this.workerPool || this.renderingTiles.size >= this.config.maxConcurrentRenders) {
      return;
    }

    // Get pending requests sorted by priority (visible first)
    const pending = Array.from(this.pendingRequests.values());
    pending.sort((a, b) => {
      if (a.priority === 'visible' && b.priority !== 'visible') return -1;
      if (a.priority !== 'visible' && b.priority === 'visible') return 1;
      return 0;
    });

    // Process up to maxConcurrentRenders
    const toProcess = pending.slice(
      0,
      this.config.maxConcurrentRenders - this.renderingTiles.size
    );

    for (const request of toProcess) {
      const key = getTileKey(request.coord, request.viewport.maxIterations);
      this.pendingRequests.delete(key);
      this.startTileRender(request);
    }
  }

  /**
   * Start rendering a tile
   */
  private startTileRender(request: TileRequest): void {
    const key = getTileKey(request.coord, request.viewport.maxIterations);
    const complexBounds = tileToComplex(request.coord, this.config);

    // Create render parameters for worker
    const renderParams: TileRenderParams = {
      tile: request.coord,
      viewport: {
        centerX: complexBounds.centerReal,
        centerY: complexBounds.centerImag,
        scale: complexBounds.scale,
        centerXStr: request.viewport.centerXStr,
        centerYStr: request.viewport.centerYStr,
        scaleStr: request.viewport.scaleStr,
      },
      tileSize: this.config.tileSize,
      maxIterations: request.viewport.maxIterations,
      colorScheme: 0, // We store raw iterations, not colors
      antiAliasing: false, // AA done at composite time
      useDD: request.precision === 'dd',
      precisionMode: request.precision,
      precisionLimbs: this.getPrecisionLimbs(complexBounds.scale),
    };

    // Create pending tile
    const pendingTile: Tile = {
      coord: request.coord,
      centerReal: complexBounds.centerReal,
      centerImag: complexBounds.centerImag,
      scale: complexBounds.scale,
      maxIterations: request.viewport.maxIterations,
      precision: request.precision,
      iterations: new Float32Array(0), // Will be filled by worker
      status: 'rendering',
      renderTime: 0,
      lastAccessed: performance.now(),
      size: this.config.tileSize,
    };

    // Add to L2 cache as pending
    this.l2Cache.set(key, pendingTile);

    // Start render and track promise
    const renderPromise = this.workerPool!.renderTile(renderParams)
      .then((result: TileRenderResult) => {
        // Update tile with result
        const tile: Tile = {
          ...pendingTile,
          iterations: result.iterations,
          status: 'complete',
          renderTime: result.renderTime,
          lastAccessed: performance.now(),
        };

        // Update L2 cache
        this.l2Cache.set(key, tile);

        // Store in L3 cache (async, fire and forget)
        if (this.l3Cache) {
          this.l3Cache.set(tile).catch((error) => {
            console.warn('Failed to store tile in L3 cache:', error);
          });
        }

        // Track render time
        this.renderTimes.push(result.renderTime);
        if (this.renderTimes.length > 100) {
          this.renderTimes.shift();
        }
        this.stats.averageRenderTime =
          this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;

        // Notify listeners
        this.notifyListeners(tile);

        return tile;
      })
      .catch((error) => {
        console.error(`Tile render error for ${key}:`, error);
        const errorTile: Tile = {
          ...pendingTile,
          status: 'error',
        };
        this.l2Cache.set(key, errorTile);
        return errorTile;
      })
      .finally(() => {
        this.renderingTiles.delete(key);
        // Process more tiles
        this.processQueue();
      });

    this.renderingTiles.set(key, renderPromise);
  }

  /**
   * Get a specific tile from cache
   */
  getTile(coord: TileCoord, maxIterations: number): Tile | undefined {
    const key = getTileKey(coord, maxIterations);
    return this.l2Cache.get(key);
  }

  /**
   * Cancel all pending and in-progress renders
   */
  cancelAll(): void {
    this.pendingRequests.clear();
    this.workerPool?.cancelAll();
    // Note: rendering tiles will complete and be cached, we just won't queue more
  }

  /**
   * Clear all caches
   * @param includeL3 - Also clear persistent L3 cache (default: false)
   */
  clearCaches(includeL3 = false): void {
    this.cancelAll();
    this.l2Cache.clear();
    this.l3Lookups.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.l3Hits = 0;
    this.renderTimes = [];
    this.predictor.clear();
    this.prefetchKeys.clear();

    if (includeL3 && this.l3Cache) {
      this.l3Cache.clear().catch(console.error);
    }

    console.log(`TileManager caches cleared${includeL3 ? ' (including L3)' : ''}`);
  }

  /**
   * Add a listener for tile completion
   */
  onTileComplete(listener: (tile: Tile) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(tile: Tile): void {
    for (const listener of this.listeners) {
      try {
        listener(tile);
      } catch (error) {
        console.error('Tile listener error:', error);
      }
    }
  }

  /**
   * Determine precision mode based on scale
   * Thresholds from CLAUDE.md:
   * - Scale > 5e-6: standard (float32/float64)
   * - Scale 5e-6 → 1e-12: dd (double-double)
   * - Scale < 1e-12: arbitrary (WASM bigfloat)
   */
  private getPrecisionForScale(scale: number): TilePrecision {
    if (scale < 1e-12) {
      return 'arbitrary';
    }
    if (scale < 5e-6) {
      return 'dd';
    }
    return 'standard';
  }

  /**
   * Calculate required precision limbs for a given scale
   * Each limb provides ~9.6 decimal digits of precision
   */
  private getPrecisionLimbs(scale: number): number {
    if (scale >= 1e-12) return 4; // Not needed, but minimum

    // log10(scale) gives negative exponent
    // We need enough limbs to represent that precision + some margin
    const logScale = -Math.log10(scale);
    const limbs = Math.ceil(logScale / 9.6) + 2; // +2 for safety margin
    return Math.max(4, Math.min(64, limbs)); // Clamp to reasonable range
  }

  /**
   * Get statistics
   */
  getStats(): TileStats {
    // Calculate memory usage
    let memoryUsage = 0;
    for (const tile of this.l2Cache.values()) {
      if (tile.iterations) {
        memoryUsage += tile.iterations.byteLength;
      }
    }

    return {
      ...this.stats,
      totalTiles: this.l2Cache.size,
      memoryUsage,
    };
  }

  /**
   * Prefetch tiles based on predicted viewport movement
   */
  prefetchTiles(viewport: TileViewport): void {
    if (!this.prefetchEnabled) return;

    // Deprioritize prefetch during active interaction
    const isInteracting = this.predictor.isUserInteracting();
    if (isInteracting) {
      // Only do minimal prefetch during interaction (immediate neighbors)
      this.prefetchImmediate(viewport);
      return;
    }

    // Get prediction for 100-300ms lookahead
    const prediction = this.predictor.predict(200);
    const direction = this.predictor.getPrefetchDirection();

    if (!prediction || prediction.confidence < 0.3) {
      // Low confidence - fall back to ring prefetch around visible
      this.prefetchRing(viewport);
      return;
    }

    // High confidence - prefetch in predicted direction
    this.prefetchPredicted(viewport, prediction, direction);
  }

  /**
   * Minimal prefetch during interaction (just immediate neighbors)
   */
  private prefetchImmediate(viewport: TileViewport): void {
    const visibleCoords = getVisibleTiles(viewport, this.config);
    const precision = this.getPrecisionForScale(viewport.scale);

    // Only prefetch tiles directly adjacent to visible area
    const prefetchCoords = this.getImmediateNeighbors(visibleCoords);

    // Limit to 4 tiles max during interaction
    const limited = prefetchCoords.slice(0, 4);

    for (const coord of limited) {
      const key = getTileKey(coord, viewport.maxIterations);
      if (!this.l2Cache.has(key) && !this.renderingTiles.has(key) && !this.pendingRequests.has(key)) {
        this.prefetchKeys.add(key);
        this.queueTileRequest({
          coord,
          viewport,
          priority: 'prefetch',
          precision,
        });
      }
    }
  }

  /**
   * Ring prefetch when prediction confidence is low
   */
  private prefetchRing(viewport: TileViewport): void {
    const visibleCoords = getVisibleTiles(viewport, this.config);
    const precision = this.getPrecisionForScale(viewport.scale);
    const prefetchCoords = this.getRingCoords(visibleCoords, 1);

    for (const coord of prefetchCoords) {
      const key = getTileKey(coord, viewport.maxIterations);
      if (!this.l2Cache.has(key) && !this.renderingTiles.has(key) && !this.pendingRequests.has(key)) {
        this.prefetchKeys.add(key);
        this.queueTileRequest({
          coord,
          viewport,
          priority: 'prefetch',
          precision,
        });
      }
    }
  }

  /**
   * Predictive prefetch based on movement direction
   */
  private prefetchPredicted(
    viewport: TileViewport,
    prediction: PredictedViewport,
    direction: PrefetchDirection | null
  ): void {
    const precision = this.getPrecisionForScale(viewport.scale);
    const visibleCoords = getVisibleTiles(viewport, this.config);

    // Build predicted viewport
    const predictedViewport: TileViewport = {
      ...viewport,
      centerX: prediction.centerX,
      centerY: prediction.centerY,
      scale: prediction.scale,
    };

    // Get tiles that will be visible in predicted viewport
    const predictedCoords = getVisibleTiles(predictedViewport, this.config);

    // Find tiles that aren't currently visible but will be
    const currentVisible = new Set(visibleCoords.map(c => getTileKey(c, viewport.maxIterations)));
    const toPrefetch: TileCoord[] = [];

    for (const coord of predictedCoords) {
      const key = getTileKey(coord, viewport.maxIterations);
      if (!currentVisible.has(key)) {
        toPrefetch.push(coord);
      }
    }

    // Also add directional bias - prefetch more in movement direction
    if (direction && (direction.panX !== 0 || direction.panY !== 0)) {
      const directionalCoords = this.getDirectionalCoords(visibleCoords, direction);
      for (const coord of directionalCoords) {
        const key = getTileKey(coord, viewport.maxIterations);
        if (!currentVisible.has(key) && !toPrefetch.some(c => c.x === coord.x && c.y === coord.y)) {
          toPrefetch.push(coord);
        }
      }
    }

    // Handle zoom prefetch
    if (direction?.zooming === 'in') {
      // Prefetch higher detail tiles at center
      const zoomCoords = this.getZoomInCoords(visibleCoords);
      for (const coord of zoomCoords) {
        if (!toPrefetch.some(c => c.x === coord.x && c.y === coord.y && c.level === coord.level)) {
          toPrefetch.push(coord);
        }
      }
    } else if (direction?.zooming === 'out') {
      // Prefetch lower detail tiles (parent level)
      const zoomOutCoords = this.getZoomOutCoords(visibleCoords);
      for (const coord of zoomOutCoords) {
        if (!toPrefetch.some(c => c.x === coord.x && c.y === coord.y && c.level === coord.level)) {
          toPrefetch.push(coord);
        }
      }
    }

    // Limit prefetch count based on confidence
    const maxPrefetch = Math.ceil(16 * prediction.confidence);
    const limited = toPrefetch.slice(0, maxPrefetch);

    for (const coord of limited) {
      const key = getTileKey(coord, viewport.maxIterations);
      if (!this.l2Cache.has(key) && !this.renderingTiles.has(key) && !this.pendingRequests.has(key)) {
        this.prefetchKeys.add(key);
        this.queueTileRequest({
          coord,
          viewport: predictedViewport,
          priority: 'prefetch',
          precision,
        });
      }
    }
  }

  /**
   * Get immediate neighbors of visible tiles
   */
  private getImmediateNeighbors(visibleCoords: TileCoord[]): TileCoord[] {
    if (visibleCoords.length === 0) return [];

    const level = visibleCoords[0].level;
    const visible = new Set(visibleCoords.map(c => `${c.x},${c.y}`));
    const neighbors: TileCoord[] = [];

    for (const coord of visibleCoords) {
      // Check 4-connected neighbors
      const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of offsets) {
        const nx = coord.x + dx;
        const ny = coord.y + dy;
        const key = `${nx},${ny}`;
        if (!visible.has(key) && !neighbors.some(n => n.x === nx && n.y === ny)) {
          neighbors.push({ x: nx, y: ny, level });
        }
      }
    }

    return neighbors;
  }

  /**
   * Get ring of tiles around visible area
   */
  private getRingCoords(visibleCoords: TileCoord[], rings: number): TileCoord[] {
    if (visibleCoords.length === 0) return [];

    const level = visibleCoords[0].level;
    const visible = new Set(visibleCoords.map(c => `${c.x},${c.y}`));

    // Find bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const coord of visibleCoords) {
      minX = Math.min(minX, coord.x);
      maxX = Math.max(maxX, coord.x);
      minY = Math.min(minY, coord.y);
      maxY = Math.max(maxY, coord.y);
    }

    const ring: TileCoord[] = [];
    for (let r = 1; r <= rings; r++) {
      for (let y = minY - r; y <= maxY + r; y++) {
        for (let x = minX - r; x <= maxX + r; x++) {
          // Only include tiles on the edge of this ring
          const onEdge = x === minX - r || x === maxX + r || y === minY - r || y === maxY + r;
          const key = `${x},${y}`;
          if (onEdge && !visible.has(key) && !ring.some(c => c.x === x && c.y === y)) {
            ring.push({ x, y, level });
          }
        }
      }
    }

    return ring;
  }

  /**
   * Get tiles in movement direction
   */
  private getDirectionalCoords(visibleCoords: TileCoord[], direction: PrefetchDirection): TileCoord[] {
    if (visibleCoords.length === 0) return [];

    const level = visibleCoords[0].level;
    const visible = new Set(visibleCoords.map(c => `${c.x},${c.y}`));

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const coord of visibleCoords) {
      minX = Math.min(minX, coord.x);
      maxX = Math.max(maxX, coord.x);
      minY = Math.min(minY, coord.y);
      maxY = Math.max(maxY, coord.y);
    }

    const directional: TileCoord[] = [];

    // Add 2 rows/columns in movement direction
    for (let depth = 1; depth <= 2; depth++) {
      // Horizontal movement
      if (Math.abs(direction.panX) > 0.3) {
        const targetX = direction.panX > 0 ? maxX + depth : minX - depth;
        for (let y = minY; y <= maxY; y++) {
          const key = `${targetX},${y}`;
          if (!visible.has(key)) {
            directional.push({ x: targetX, y, level });
          }
        }
      }

      // Vertical movement
      if (Math.abs(direction.panY) > 0.3) {
        const targetY = direction.panY > 0 ? maxY + depth : minY - depth;
        for (let x = minX; x <= maxX; x++) {
          const key = `${x},${targetY}`;
          if (!visible.has(key)) {
            directional.push({ x, y: targetY, level });
          }
        }
      }
    }

    return directional;
  }

  /**
   * Get tiles for zoom-in prefetch (higher detail at center)
   */
  private getZoomInCoords(visibleCoords: TileCoord[]): TileCoord[] {
    if (visibleCoords.length === 0) return [];

    // When zooming in, we need tiles at next level (higher detail)
    // Focus on center of current view
    const level = visibleCoords[0].level;
    const nextLevel = level + 1;

    // Find center of visible area
    let sumX = 0, sumY = 0;
    for (const coord of visibleCoords) {
      sumX += coord.x;
      sumY += coord.y;
    }
    const centerX = Math.round(sumX / visibleCoords.length);
    const centerY = Math.round(sumY / visibleCoords.length);

    // Next level tiles corresponding to center (each tile becomes 4 at next level)
    const nextLevelCoords: TileCoord[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const baseX = (centerX + dx) * 2;
        const baseY = (centerY + dy) * 2;
        for (let sy = 0; sy < 2; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            nextLevelCoords.push({ x: baseX + sx, y: baseY + sy, level: nextLevel });
          }
        }
      }
    }

    return nextLevelCoords.slice(0, 16); // Limit to 16 tiles
  }

  /**
   * Get tiles for zoom-out prefetch (lower detail / parent level)
   */
  private getZoomOutCoords(visibleCoords: TileCoord[]): TileCoord[] {
    if (visibleCoords.length === 0) return [];

    const level = visibleCoords[0].level;
    if (level <= 0) return []; // Can't go lower than level 0

    const prevLevel = level - 1;

    // Find parent tiles (each 2x2 group maps to one parent)
    const parentSet = new Set<string>();
    const parents: TileCoord[] = [];

    for (const coord of visibleCoords) {
      const parentX = Math.floor(coord.x / 2);
      const parentY = Math.floor(coord.y / 2);
      const key = `${parentX},${parentY}`;
      if (!parentSet.has(key)) {
        parentSet.add(key);
        parents.push({ x: parentX, y: parentY, level: prevLevel });
      }
    }

    // Also add neighbors of parent tiles
    const parentNeighbors: TileCoord[] = [];
    for (const parent of parents) {
      const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of offsets) {
        const key = `${parent.x + dx},${parent.y + dy}`;
        if (!parentSet.has(key)) {
          parentSet.add(key);
          parentNeighbors.push({ x: parent.x + dx, y: parent.y + dy, level: prevLevel });
        }
      }
    }

    return [...parents, ...parentNeighbors].slice(0, 12);
  }

  /**
   * Cancel stale prefetch requests (called when direction changes)
   */
  private cancelStalePrefetch(): void {
    // Remove prefetch requests from pending queue
    for (const key of this.prefetchKeys) {
      const request = this.pendingRequests.get(key);
      if (request && request.priority === 'prefetch') {
        this.pendingRequests.delete(key);
      }
    }
    this.prefetchKeys.clear();
  }

  /**
   * Enable or disable prefetch
   */
  setPrefetchEnabled(enabled: boolean): void {
    this.prefetchEnabled = enabled;
    if (!enabled) {
      this.cancelStalePrefetch();
    }
  }

  /**
   * Get predictor for debugging
   */
  getPredictor(): ViewportPredictor {
    return this.predictor;
  }

  /**
   * Cleanup and dispose
   */
  dispose(): void {
    this.cancelAll();
    this.workerPool?.dispose();
    this.l2Cache.clear();
    this.l3Lookups.clear();
    this.l3Cache?.dispose();
    this.l3Cache = null;
    this.listeners = [];
    this.predictor.clear();
    this.prefetchKeys.clear();
    this.initialized = false;
    console.log('TileManager disposed');
  }

  /**
   * Get L3 cache statistics
   */
  async getL3Stats(): Promise<{ tileCount: number; totalSize: number } | null> {
    if (!this.l3Cache) return null;
    return this.l3Cache.getStats();
  }
}
