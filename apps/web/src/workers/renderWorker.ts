import { expose } from 'comlink';
import { WebGLRenderer, type RenderParams, type ProgressiveRenderParams } from '../render/WebGLRenderer';

export interface WorkerRenderResult {
  renderTime: number;
  fps: number;
  completed: boolean;
}

export class RenderWorker {
  private renderer: WebGLRenderer | null = null;
  private canvas: OffscreenCanvas | null = null;

  async init(offscreenCanvas: OffscreenCanvas): Promise<void> {
    try {
      this.canvas = offscreenCanvas;
      this.renderer = new WebGLRenderer();
      
      // Cast OffscreenCanvas to HTMLCanvasElement for WebGL2 context
      // OffscreenCanvas supports getContext('webgl2') but types don't match exactly
      await this.renderer.init(offscreenCanvas as any);
      
      console.log('Render worker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize render worker:', error);
      throw error;
    }
  }

  async render(params: RenderParams): Promise<WorkerRenderResult> {
    if (!this.renderer) {
      throw new Error('Render worker not initialized');
    }

    const startTime = performance.now();
    
    try {
      this.renderer.render(params);
      const renderTime = performance.now() - startTime;
      
      return {
        renderTime,
        fps: renderTime > 0 ? 1000 / renderTime : 0,
        completed: true,
      };
    } catch (error) {
      console.error('Render worker render failed:', error);
      throw error;
    }
  }

  async renderProgressive(params: ProgressiveRenderParams): Promise<WorkerRenderResult> {
    if (!this.renderer) {
      throw new Error('Render worker not initialized');
    }

    const startTime = performance.now();
    
    try {
      this.renderer.renderProgressive(params);
      const renderTime = performance.now() - startTime;
      
      return {
        renderTime,
        fps: renderTime > 0 ? 1000 / renderTime : 0,
        completed: true,
      };
    } catch (error) {
      console.error('Render worker progressive render failed:', error);
      throw error;
    }
  }

  async resize(width: number, height: number): Promise<void> {
    if (!this.canvas) {
      throw new Error('Canvas not available');
    }
    
    this.canvas.width = width;
    this.canvas.height = height;
  }

  dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    this.canvas = null;
    console.log('Render worker disposed');
  }
}

// Expose the worker API using Comlink
expose(RenderWorker);