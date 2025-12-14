/**
 * TileRenderer - Orchestrates tile-based Mandelbrot rendering
 *
 * Provides a simple interface for MandelbrotViewer to use tile-based rendering.
 * Coordinates TileManager (computation), TileCompositor (display), and
 * FrameReprojector (instant pan/zoom feedback).
 */

import { TileManager } from './TileManager';
import { TileCompositor } from './TileCompositor';
import { FrameReprojector } from './FrameReprojector';
import { Tile, TileConfig, TileViewport, TileStats, DEFAULT_TILE_CONFIG } from './types';

export interface TileRenderParams {
  centerX: number;
  centerY: number;
  scale: number;
  maxIterations: number;
  width: number;
  height: number;
  colorScheme: number;
  colorOffset: number;
  colorScale: number;
  // High precision coordinates (optional)
  centerXStr?: string;
  centerYStr?: string;
  scaleStr?: string;
}

export interface TileRenderStats extends TileStats {
  frameTime: number;
  tilesRendered: number;
  tilesPending: number;
  reprojected: boolean;
}

/**
 * TileRenderer provides the main interface for tile-based rendering
 */
export class TileRenderer {
  private manager: TileManager;
  private compositor: TileCompositor;
  private reprojector: FrameReprojector;
  private config: TileConfig;
  private initialized = false;
  private _canvas: HTMLCanvasElement | null = null;

  // Render state
  private _lastViewport: TileViewport | null = null;
  private availableTiles: Tile[] = [];
  private pendingCount = 0;
  private frameStartTime = 0;
  private lastReprojected = false;

  // Reprojection settings
  private reprojectionEnabled = true;

  // Callbacks
  private onTileReadyCallback: (() => void) | null = null;

  constructor(config: Partial<TileConfig> = {}) {
    this.config = { ...DEFAULT_TILE_CONFIG, ...config };
    this.manager = new TileManager(this.config);
    this.compositor = new TileCompositor(this.config);
    this.reprojector = new FrameReprojector();
  }

  /**
   * Get the canvas element
   */
  get canvas(): HTMLCanvasElement | null {
    return this._canvas;
  }

  /**
   * Get the last rendered viewport
   */
  get lastViewport(): TileViewport | null {
    return this._lastViewport;
  }

  /**
   * Initialize the tile renderer
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (this.initialized) return;

    this._canvas = canvas;

    // Initialize manager and compositor
    await this.manager.init();
    await this.compositor.init(canvas);

    // Initialize reprojector with compositor's GL context
    const gl = canvas.getContext('webgl2');
    if (gl) {
      this.reprojector.init(gl);
    } else {
      console.warn('Could not get GL context for reprojector');
      this.reprojectionEnabled = false;
    }

    // Listen for tile completions to trigger re-renders
    this.manager.onTileComplete(() => {
      if (this.onTileReadyCallback) {
        this.onTileReadyCallback();
      }
    });

    this.initialized = true;
    console.log('TileRenderer initialized');
  }

  /**
   * Set callback for when new tiles are ready
   * This allows the viewer to request a new frame
   */
  onTileReady(callback: () => void): void {
    this.onTileReadyCallback = callback;
  }

  /**
   * Render the current viewport using tiles
   */
  render(params: TileRenderParams): void {
    if (!this.initialized) {
      console.warn('TileRenderer not initialized');
      return;
    }

    this.frameStartTime = performance.now();
    this.lastReprojected = false;

    // Build viewport
    const viewport: TileViewport = {
      centerX: params.centerX,
      centerY: params.centerY,
      scale: params.scale,
      width: params.width,
      height: params.height,
      maxIterations: params.maxIterations,
      centerXStr: params.centerXStr,
      centerYStr: params.centerYStr,
      scaleStr: params.scaleStr,
    };

    // Check if we should use reprojection for instant feedback
    const reprojectionViewport = {
      centerX: params.centerX,
      centerY: params.centerY,
      scale: params.scale,
      width: params.width,
      height: params.height,
    };

    const shouldReproject = this.reprojectionEnabled &&
      this.reprojector.shouldReproject(reprojectionViewport);

    // Request tiles for this viewport
    const { available, pending } = this.manager.requestTiles(viewport);
    this.availableTiles = available;
    this.pendingCount = pending.length;

    // If we have pending tiles and can reproject, do reprojection first
    if (shouldReproject && pending.length > 0) {
      // Reprojection provides instant visual feedback
      this.reprojector.reproject(reprojectionViewport);
      this.lastReprojected = true;

      // Then composite available tiles on top (will blend/override)
      if (available.length > 0) {
        this.compositor.composite(available, viewport, {
          colorScheme: params.colorScheme,
          colorOffset: params.colorOffset,
          colorScale: params.colorScale,
        });
      }
    } else {
      // No reprojection needed - just composite tiles
      this.compositor.composite(available, viewport, {
        colorScheme: params.colorScheme,
        colorOffset: params.colorOffset,
        colorScale: params.colorScale,
      });
    }

    // Save this frame for future reprojection
    if (this.reprojectionEnabled && available.length > 0) {
      this.reprojector.saveFrame(reprojectionViewport);
    }

    // Store viewport for stats
    this._lastViewport = viewport;

    // Prefetch nearby tiles
    this.manager.prefetchTiles(viewport);
  }

  /**
   * Enable or disable reprojection
   */
  setReprojectionEnabled(enabled: boolean): void {
    this.reprojectionEnabled = enabled;
    if (!enabled) {
      this.reprojector.clearFrame();
    }
  }

  /**
   * Check if all visible tiles are complete
   */
  isComplete(): boolean {
    return this.pendingCount === 0;
  }

  /**
   * Get render statistics
   */
  getStats(): TileRenderStats {
    const managerStats = this.manager.getStats();
    const compositorStats = this.compositor.getCacheStats();

    return {
      ...managerStats,
      frameTime: performance.now() - this.frameStartTime,
      tilesRendered: this.availableTiles.length,
      tilesPending: this.pendingCount,
      memoryUsage: managerStats.memoryUsage + compositorStats.memoryUsage,
      reprojected: this.lastReprojected,
    };
  }

  /**
   * Cancel all pending renders (e.g., on rapid viewport change)
   */
  cancelPending(): void {
    this.manager.cancelAll();
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.manager.clearCaches();
    this.compositor.clearCache();
  }

  /**
   * Get the WebGL context (for compatibility with existing code)
   */
  getGL(): WebGL2RenderingContext | null {
    return this.compositor.canvas
      ? (this.compositor.canvas.getContext('webgl2') as WebGL2RenderingContext)
      : null;
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.manager.dispose();
    this.compositor.dispose();
    this.reprojector.dispose();
    this.initialized = false;
    this._canvas = null;
    console.log('TileRenderer disposed');
  }
}
