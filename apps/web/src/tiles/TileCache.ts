/**
 * TileCache - IndexedDB-backed persistent tile cache (L3)
 *
 * Provides persistent storage for rendered tiles across browser sessions.
 * Uses IndexedDB for async storage with configurable size limits.
 */

import { Tile, TileCoord, getTileKey } from './types';

const DB_NAME = 'mandelbrot-tile-cache';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';
const META_STORE = 'metadata';

/**
 * Serializable tile format for IndexedDB storage
 */
interface StoredTile {
  key: string;
  coord: TileCoord;
  centerReal: number;
  centerImag: number;
  scale: number;
  maxIterations: number;
  precision: string;
  iterations: ArrayBuffer;  // Float32Array stored as ArrayBuffer
  renderTime: number;
  storedAt: number;
  size: number;
}

/**
 * L3 IndexedDB tile cache
 */
export class TileCache {
  private db: IDBDatabase | null = null;
  private maxSize: number;
  private maxTiles: number;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(maxTiles = 2048, maxSizeMB = 500) {
    this.maxTiles = maxTiles;
    this.maxSize = maxSizeMB * 1024 * 1024; // Convert to bytes
  }

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    await this.initPromise;
  }

  private async doInit(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        console.log('TileCache IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create tiles store with key index
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('storedAt', 'storedAt', { unique: false });
          store.createIndex('maxIterations', 'maxIterations', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Get a tile from cache
   */
  async get(coord: TileCoord, maxIterations: number): Promise<Tile | null> {
    if (!this.db) return null;

    const key = getTileKey(coord, maxIterations);

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const stored = request.result as StoredTile | undefined;
        if (!stored) {
          resolve(null);
          return;
        }

        // Convert back to Tile
        const tile: Tile = {
          coord: stored.coord,
          centerReal: stored.centerReal,
          centerImag: stored.centerImag,
          scale: stored.scale,
          maxIterations: stored.maxIterations,
          precision: stored.precision as Tile['precision'],
          iterations: new Float32Array(stored.iterations),
          status: 'complete',
          renderTime: stored.renderTime,
          lastAccessed: performance.now(),
          size: stored.size,
        };

        resolve(tile);
      };

      request.onerror = () => {
        console.error('Failed to get tile from cache:', request.error);
        resolve(null);
      };
    });
  }

  /**
   * Store a tile in cache
   */
  async set(tile: Tile): Promise<void> {
    if (!this.db || tile.status !== 'complete') return;

    const key = getTileKey(tile.coord, tile.maxIterations);

    const stored: StoredTile = {
      key,
      coord: tile.coord,
      centerReal: tile.centerReal,
      centerImag: tile.centerImag,
      scale: tile.scale,
      maxIterations: tile.maxIterations,
      precision: tile.precision,
      iterations: tile.iterations.buffer.slice(0) as ArrayBuffer,  // Copy the ArrayBuffer
      renderTime: tile.renderTime,
      storedAt: Date.now(),
      size: tile.size,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(stored);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to store tile:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Check if a tile exists in cache
   */
  async has(coord: TileCoord, maxIterations: number): Promise<boolean> {
    if (!this.db) return false;

    const key = getTileKey(coord, maxIterations);

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count(IDBKeyRange.only(key));

      request.onsuccess = () => {
        resolve(request.result > 0);
      };

      request.onerror = () => {
        resolve(false);
      };
    });
  }

  /**
   * Delete a tile from cache
   */
  async delete(coord: TileCoord, maxIterations: number): Promise<void> {
    if (!this.db) return;

    const key = getTileKey(coord, maxIterations);

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(key);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ tileCount: number; totalSize: number }> {
    if (!this.db) return { tileCount: 0, totalSize: 0 };

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();

      let tileCount = 0;
      let totalSize = 0;

      countRequest.onsuccess = () => {
        tileCount = countRequest.result;
      };

      // Estimate size by sampling
      const cursorRequest = store.openCursor();
      let sampledCount = 0;
      let sampledSize = 0;

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && sampledCount < 100) {
          const stored = cursor.value as StoredTile;
          sampledSize += stored.iterations.byteLength;
          sampledCount++;
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        // Extrapolate total size from sample
        if (sampledCount > 0) {
          const avgSize = sampledSize / sampledCount;
          totalSize = avgSize * tileCount;
        }
        resolve({ tileCount, totalSize });
      };

      transaction.onerror = () => {
        resolve({ tileCount: 0, totalSize: 0 });
      };
    });
  }

  /**
   * Clean up old tiles to stay within limits
   */
  async cleanup(): Promise<number> {
    if (!this.db) return 0;

    const stats = await this.getStats();
    let deletedCount = 0;

    // Check if we need to clean up
    if (stats.tileCount <= this.maxTiles && stats.totalSize <= this.maxSize) {
      return 0;
    }

    // Delete oldest tiles until we're under limits
    const targetCount = Math.floor(this.maxTiles * 0.8); // Target 80% capacity
    const tilesToDelete = stats.tileCount - targetCount;

    if (tilesToDelete <= 0) return 0;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('storedAt');

      // Get oldest tiles
      const cursorRequest = index.openCursor();
      let deleted = 0;

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && deleted < tilesToDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        deletedCount = deleted;
        console.log(`TileCache cleanup: deleted ${deleted} tiles`);
        resolve(deletedCount);
      };

      transaction.onerror = () => {
        resolve(deletedCount);
      };
    });
  }

  /**
   * Clear all tiles from cache
   */
  async clear(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();

      transaction.oncomplete = () => {
        console.log('TileCache cleared');
        resolve();
      };

      transaction.onerror = () => {
        resolve();
      };
    });
  }

  /**
   * Get multiple tiles at once (batch read)
   */
  async getMany(coords: { coord: TileCoord; maxIterations: number }[]): Promise<Map<string, Tile>> {
    if (!this.db || coords.length === 0) return new Map();

    const results = new Map<string, Tile>();

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      for (const { coord, maxIterations } of coords) {
        const key = getTileKey(coord, maxIterations);
        const request = store.get(key);

        request.onsuccess = () => {
          const stored = request.result as StoredTile | undefined;
          if (stored) {
            const tile: Tile = {
              coord: stored.coord,
              centerReal: stored.centerReal,
              centerImag: stored.centerImag,
              scale: stored.scale,
              maxIterations: stored.maxIterations,
              precision: stored.precision as Tile['precision'],
              iterations: new Float32Array(stored.iterations),
              status: 'complete',
              renderTime: stored.renderTime,
              lastAccessed: performance.now(),
              size: stored.size,
            };
            results.set(key, tile);
          }
        };
      }

      transaction.oncomplete = () => {
        resolve(results);
      };

      transaction.onerror = () => {
        resolve(results);
      };
    });
  }

  /**
   * Store multiple tiles at once (batch write)
   */
  async setMany(tiles: Tile[]): Promise<void> {
    if (!this.db || tiles.length === 0) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      for (const tile of tiles) {
        if (tile.status !== 'complete') continue;

        const key = getTileKey(tile.coord, tile.maxIterations);
        const stored: StoredTile = {
          key,
          coord: tile.coord,
          centerReal: tile.centerReal,
          centerImag: tile.centerImag,
          scale: tile.scale,
          maxIterations: tile.maxIterations,
          precision: tile.precision,
          iterations: tile.iterations.buffer.slice(0) as ArrayBuffer,
          renderTime: tile.renderTime,
          storedAt: Date.now(),
          size: tile.size,
        };
        store.put(stored);
      }

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        resolve();
      };
    });
  }

  /**
   * Close the database connection
   */
  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
    this.initPromise = null;
    console.log('TileCache disposed');
  }
}
