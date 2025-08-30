import { WebGLRenderer, type RenderParams, type ProgressiveRenderParams } from './WebGLRenderer';
import { WorkerManager, type WorkerCapabilities } from '../workers/WorkerManager';

export interface HybridRenderResult {
  renderTime: number;
  fps: number;
  completed: boolean;
  usedWorker: boolean;
}

export interface HybridRendererOptions {
  preferWorker: boolean;
  fallbackToMainThread: boolean;
  workerTimeout: number; // ms
}

export class HybridRenderer {
  private mainThreadRenderer: WebGLRenderer | null = null;
  private workerManager: WorkerManager | null = null;
  private useWorker = false;
  private isInitialized = false;
  private options: HybridRendererOptions;
  private renderCallback?: (stats: { renderTime: number; fps: number }) => void;

  constructor(options: Partial<HybridRendererOptions> = {}) {
    this.options = {
      preferWorker: true,
      fallbackToMainThread: true,
      workerTimeout: 5000, // 5 second timeout
      ...options,
    };
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    console.log('Initializing hybrid renderer...');

    // Always create main thread renderer as fallback
    this.mainThreadRenderer = new WebGLRenderer();
    
    try {
      // Try to initialize worker first if preferred
      if (this.options.preferWorker) {
        this.workerManager = new WorkerManager();
        
        if (this.workerManager.isSupported) {
          console.log('Attempting worker initialization...');
          
          // Create a clone of the canvas for worker
          const workerCanvas = canvas.cloneNode(true) as HTMLCanvasElement;
          workerCanvas.width = canvas.width;
          workerCanvas.height = canvas.height;
          
          const workerInitialized = await this.workerManager.init(workerCanvas);
          
          if (workerInitialized) {
            this.useWorker = true;
            console.log('Using Web Worker rendering');
          } else {
            console.log('Worker initialization failed, using main thread');
            this.workerManager.dispose();
            this.workerManager = null;
          }
        } else {
          console.log('Worker not supported, using main thread');
          this.workerManager = null;
        }
      }

      // Initialize main thread renderer if not using worker or as fallback
      if (!this.useWorker) {
        await this.mainThreadRenderer.init(canvas);
        console.log('Using main thread rendering');
      }

    } catch (error) {
      console.error('Worker initialization failed:', error);
      
      if (this.options.fallbackToMainThread) {
        console.log('Falling back to main thread rendering');
        this.useWorker = false;
        
        if (this.workerManager) {
          this.workerManager.dispose();
          this.workerManager = null;
        }
        
        await this.mainThreadRenderer.init(canvas);
      } else {
        throw error;
      }
    }

    this.isInitialized = true;
    console.log(`Hybrid renderer initialized (using ${this.useWorker ? 'worker' : 'main thread'})`);
  }

  async render(params: RenderParams): Promise<HybridRenderResult> {
    if (!this.isInitialized) {
      throw new Error('Hybrid renderer not initialized');
    }

    const startTime = performance.now();

    try {
      if (this.useWorker && this.workerManager) {
        const result = await this.workerManager.render(params);
        
        // Notify callback if set
        if (this.renderCallback) {
          this.renderCallback({ renderTime: result.renderTime, fps: result.fps });
        }
        
        return {
          ...result,
          usedWorker: true,
        };
      } else if (this.mainThreadRenderer) {
        this.mainThreadRenderer.render(params);
        const renderTime = performance.now() - startTime;
        const fps = renderTime > 0 ? 1000 / renderTime : 0;
        
        // Notify callback if set
        if (this.renderCallback) {
          this.renderCallback({ renderTime, fps });
        }
        
        return {
          renderTime,
          fps,
          completed: true,
          usedWorker: false,
        };
      } else {
        throw new Error('No renderer available');
      }
    } catch (error) {
      console.error('Render failed:', error);
      
      // Try fallback if worker failed
      if (this.useWorker && this.options.fallbackToMainThread && this.mainThreadRenderer) {
        console.log('Worker render failed, falling back to main thread');
        this.useWorker = false;
        
        if (this.workerManager) {
          this.workerManager.dispose();
          this.workerManager = null;
        }
        
        return this.render(params); // Retry with main thread
      }
      
      throw error;
    }
  }

  async renderProgressive(params: ProgressiveRenderParams): Promise<HybridRenderResult> {
    if (!this.isInitialized) {
      throw new Error('Hybrid renderer not initialized');
    }

    const startTime = performance.now();

    try {
      if (this.useWorker && this.workerManager) {
        const result = await this.workerManager.renderProgressive(params);
        
        // Notify callback if set
        if (this.renderCallback) {
          this.renderCallback({ renderTime: result.renderTime, fps: result.fps });
        }
        
        return {
          ...result,
          usedWorker: true,
        };
      } else if (this.mainThreadRenderer) {
        this.mainThreadRenderer.renderProgressive(params);
        const renderTime = performance.now() - startTime;
        const fps = renderTime > 0 ? 1000 / renderTime : 0;
        
        // Notify callback if set
        if (this.renderCallback) {
          this.renderCallback({ renderTime, fps });
        }
        
        return {
          renderTime,
          fps,
          completed: true,
          usedWorker: false,
        };
      } else {
        throw new Error('No renderer available');
      }
    } catch (error) {
      console.error('Progressive render failed:', error);
      
      // Try fallback if worker failed
      if (this.useWorker && this.options.fallbackToMainThread && this.mainThreadRenderer) {
        console.log('Worker progressive render failed, falling back to main thread');
        this.useWorker = false;
        
        if (this.workerManager) {
          this.workerManager.dispose();
          this.workerManager = null;
        }
        
        return this.renderProgressive(params); // Retry with main thread
      }
      
      throw error;
    }
  }

  setRenderCallback(callback: (stats: { renderTime: number; fps: number }) => void): void {
    this.renderCallback = callback;
    
    // Also set on main thread renderer if available
    if (this.mainThreadRenderer) {
      this.mainThreadRenderer.setRenderCallback(callback);
    }
  }

  getLastTransform(): { centerX: number; centerY: number; scale: number } | null {
    // For now, only main thread renderer supports this
    if (this.mainThreadRenderer) {
      return this.mainThreadRenderer.getLastTransform();
    }
    return null;
  }

  get isUsingWorker(): boolean {
    return this.useWorker;
  }

  get capabilities(): WorkerCapabilities | null {
    return this.workerManager?.['capabilities'] || null;
  }

  dispose(): void {
    if (this.workerManager) {
      this.workerManager.dispose();
      this.workerManager = null;
    }
    
    if (this.mainThreadRenderer) {
      this.mainThreadRenderer.dispose();
      this.mainThreadRenderer = null;
    }
    
    this.isInitialized = false;
    this.useWorker = false;
    this.renderCallback = undefined;
    
    console.log('Hybrid renderer disposed');
  }
}