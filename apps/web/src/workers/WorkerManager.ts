import { wrap, type Remote } from 'comlink';
import type { RenderWorker, WorkerRenderResult } from './renderWorker';
import type { RenderParams, ProgressiveRenderParams } from '../render/WebGLRenderer';

export interface WorkerCapabilities {
  offscreenCanvas: boolean;
  webgl2: boolean;
  comlink: boolean;
}

export class WorkerManager {
  private worker: Worker | null = null;
  private renderWorker: Remote<RenderWorker> | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private capabilities: WorkerCapabilities;
  private isInitialized = false;

  constructor() {
    this.capabilities = this.detectCapabilities();
  }

  private detectCapabilities(): WorkerCapabilities {
    const capabilities: WorkerCapabilities = {
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      webgl2: this.checkWebGL2Support(),
      comlink: typeof Worker !== 'undefined',
    };

    console.log('Worker capabilities:', capabilities);
    return capabilities;
  }

  private checkWebGL2Support(): boolean {
    try {
      if (typeof OffscreenCanvas === 'undefined') {
        return false;
      }

      const canvas = new OffscreenCanvas(1, 1);
      const gl = canvas.getContext('webgl2');
      return gl !== null;
    } catch {
      return false;
    }
  }

  get isSupported(): boolean {
    return this.capabilities.offscreenCanvas && 
           this.capabilities.webgl2 && 
           this.capabilities.comlink;
  }

  async init(canvas: HTMLCanvasElement): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('Worker rendering not supported, falling back to main thread');
      return false;
    }

    try {
      // Create OffscreenCanvas from the main canvas
      this.offscreenCanvas = canvas.transferControlToOffscreen();
      
      // Create and initialize worker
      this.worker = new Worker(
        new URL('./renderWorker.ts', import.meta.url),
        { type: 'module' }
      );

      // Wrap worker with Comlink
      this.renderWorker = wrap<RenderWorker>(this.worker);

      // Initialize the render worker with the offscreen canvas
      await this.renderWorker.init(this.offscreenCanvas);

      this.isInitialized = true;
      console.log('Worker manager initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize worker manager:', error);
      this.dispose();
      return false;
    }
  }

  async render(params: RenderParams): Promise<WorkerRenderResult> {
    if (!this.isInitialized || !this.renderWorker) {
      throw new Error('Worker manager not initialized');
    }

    return await this.renderWorker.render(params);
  }

  async renderProgressive(params: ProgressiveRenderParams): Promise<WorkerRenderResult> {
    if (!this.isInitialized || !this.renderWorker) {
      throw new Error('Worker manager not initialized');
    }

    return await this.renderWorker.renderProgressive(params);
  }

  async resize(width: number, height: number): Promise<void> {
    if (!this.isInitialized || !this.renderWorker) {
      throw new Error('Worker manager not initialized');
    }

    await this.renderWorker.resize(width, height);
  }

  dispose(): void {
    if (this.renderWorker) {
      this.renderWorker.dispose();
      this.renderWorker = null;
    }

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.offscreenCanvas = null;
    this.isInitialized = false;
    console.log('Worker manager disposed');
  }
}