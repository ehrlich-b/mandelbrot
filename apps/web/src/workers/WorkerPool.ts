/**
 * WorkerPool - Manages a pool of web workers for parallel tile rendering
 */

import {
  WorkerRequest,
  WorkerResponse,
  WorkerCapabilities,
  TileRenderParams,
  TileRenderResult,
  detectCapabilities
} from './types';

interface PendingTask {
  id: number;
  params: TileRenderParams;
  resolve: (result: TileRenderResult) => void;
  reject: (error: Error) => void;
  workerId?: number;
}

interface WorkerState {
  worker: Worker;
  id: number;
  busy: boolean;
  currentTaskId: number | null;
}

export class WorkerPool {
  private workers: WorkerState[] = [];
  private pendingTasks: Map<number, PendingTask> = new Map();
  private taskQueue: PendingTask[] = [];
  private nextTaskId = 1;
  private capabilities: WorkerCapabilities;
  private initialized = false;

  constructor(private poolSize?: number) {
    this.capabilities = detectCapabilities();
    this.poolSize = poolSize || Math.max(2, navigator.hardwareConcurrency - 1 || 3);
  }

  /**
   * Initialize the worker pool
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    console.log(`Initializing worker pool with ${this.poolSize} workers`);
    console.log('Capabilities:', this.capabilities);

    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize!; i++) {
      initPromises.push(this.createWorker(i));
    }

    await Promise.all(initPromises);
    this.initialized = true;
    console.log(`Worker pool initialized: ${this.workers.length} workers ready`);
  }

  private async createWorker(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create worker from URL - Vite will handle bundling
      const worker = new Worker(
        new URL('./tile.worker.ts', import.meta.url),
        { type: 'module' }
      );

      const state: WorkerState = {
        worker,
        id,
        busy: false,
        currentTaskId: null
      };

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(state, event.data);
      };

      worker.onerror = (error) => {
        console.error(`Worker ${id} error:`, error);
        // Try to recover by recreating the worker
        this.handleWorkerError(state, error);
      };

      // Send init message
      const initMessage: WorkerRequest = {
        type: 'init',
        workerId: id,
        capabilities: this.capabilities
      };
      worker.postMessage(initMessage);

      // Wait for ready response
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${id} init timeout`));
      }, 5000);

      const readyHandler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'ready') {
          clearTimeout(timeout);
          this.workers.push(state);
          resolve();
        }
      };
      worker.addEventListener('message', readyHandler, { once: true });
    });
  }

  private handleWorkerMessage(state: WorkerState, message: WorkerResponse): void {
    switch (message.type) {
      case 'ready':
        // Already handled in createWorker
        break;

      case 'tile-complete': {
        const task = this.pendingTasks.get(message.id);
        if (task) {
          task.resolve(message.result);
          this.pendingTasks.delete(message.id);
        }
        state.busy = false;
        state.currentTaskId = null;
        this.processQueue();
        break;
      }

      case 'tile-progress': {
        // Could emit progress events here
        break;
      }

      case 'tile-error': {
        const task = this.pendingTasks.get(message.id);
        if (task) {
          task.reject(new Error(message.error));
          this.pendingTasks.delete(message.id);
        }
        state.busy = false;
        state.currentTaskId = null;
        this.processQueue();
        break;
      }

      case 'cancelled': {
        const task = this.pendingTasks.get(message.id);
        if (task) {
          task.reject(new Error('Task cancelled'));
          this.pendingTasks.delete(message.id);
        }
        state.busy = false;
        state.currentTaskId = null;
        this.processQueue();
        break;
      }
    }
  }

  private handleWorkerError(state: WorkerState, _error: ErrorEvent): void {
    // Cancel current task if any
    if (state.currentTaskId !== null) {
      const task = this.pendingTasks.get(state.currentTaskId);
      if (task) {
        task.reject(new Error('Worker crashed'));
        this.pendingTasks.delete(state.currentTaskId);
      }
    }

    // Remove dead worker from pool
    const index = this.workers.indexOf(state);
    if (index >= 0) {
      this.workers.splice(index, 1);
    }

    // Try to create a replacement worker
    this.createWorker(state.id).catch(err => {
      console.error('Failed to recreate worker:', err);
    });
  }

  /**
   * Queue a tile for rendering
   */
  renderTile(params: TileRenderParams): Promise<TileRenderResult> {
    return new Promise((resolve, reject) => {
      const task: PendingTask = {
        id: this.nextTaskId++,
        params,
        resolve,
        reject
      };

      this.taskQueue.push(task);
      this.pendingTasks.set(task.id, task);
      this.processQueue();
    });
  }

  /**
   * Cancel a pending tile render
   */
  cancelTile(taskId: number): void {
    // Remove from queue if not started
    const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
    if (queueIndex >= 0) {
      const task = this.taskQueue.splice(queueIndex, 1)[0];
      task.reject(new Error('Cancelled'));
      this.pendingTasks.delete(taskId);
      return;
    }

    // Send cancel to worker if in progress
    const task = this.pendingTasks.get(taskId);
    if (task && task.workerId !== undefined) {
      const worker = this.workers.find(w => w.id === task.workerId);
      if (worker) {
        const cancelMessage: WorkerRequest = { type: 'cancel', id: taskId };
        worker.worker.postMessage(cancelMessage);
      }
    }
  }

  /**
   * Cancel all pending tiles
   */
  cancelAll(): void {
    // Clear queue
    for (const task of this.taskQueue) {
      task.reject(new Error('Cancelled'));
      this.pendingTasks.delete(task.id);
    }
    this.taskQueue = [];

    // Cancel in-progress tasks
    for (const worker of this.workers) {
      if (worker.currentTaskId !== null) {
        const cancelMessage: WorkerRequest = { type: 'cancel', id: worker.currentTaskId };
        worker.worker.postMessage(cancelMessage);
      }
    }
  }

  private processQueue(): void {
    // Find idle workers and assign tasks
    for (const worker of this.workers) {
      if (!worker.busy && this.taskQueue.length > 0) {
        const task = this.taskQueue.shift()!;
        this.dispatchToWorker(worker, task);
      }
    }
  }

  private dispatchToWorker(worker: WorkerState, task: PendingTask): void {
    worker.busy = true;
    worker.currentTaskId = task.id;
    task.workerId = worker.id;

    const message: WorkerRequest = {
      type: 'render-tile',
      id: task.id,
      params: task.params
    };

    worker.worker.postMessage(message);
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    poolSize: number;
    busyWorkers: number;
    queueLength: number;
    pendingTasks: number;
  } {
    return {
      poolSize: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queueLength: this.taskQueue.length,
      pendingTasks: this.pendingTasks.size
    };
  }

  /**
   * Terminate all workers
   */
  dispose(): void {
    this.cancelAll();

    for (const worker of this.workers) {
      const terminateMessage: WorkerRequest = { type: 'terminate' };
      worker.worker.postMessage(terminateMessage);
      worker.worker.terminate();
    }

    this.workers = [];
    this.initialized = false;
  }
}
