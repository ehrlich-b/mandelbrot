import { WebGLRenderer } from './render/WebGLRenderer';
import { InputHandler } from './input/InputHandler';
import { HUD } from './ui/HUD';
import { Controls } from './ui/Controls';
import { store, type ViewportState } from './state/store';

export interface RenderStats {
  fps: number;
  renderTime: number;
  lastFrameTime: number;
}

export class MandelbrotViewer {
  private canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private inputHandler: InputHandler;
  private hud: HUD;
  private controls: Controls;
  
  private viewport: ViewportState;

  private stats: RenderStats = {
    fps: 0,
    renderTime: 0,
    lastFrameTime: 0,
  };

  private isRunning = false;
  private animationId: number | null = null;
  private frameBudget = 16; // Target 16ms per frame for 60fps
  private adaptiveQuality = true;
  private frameStartTime = 0;
  private consecutiveSlowFrames = 0;
  private qualityLevel = 1.0; // 1.0 = full quality, 0.5 = half quality, etc.

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer();
    this.inputHandler = new InputHandler(canvas);
    this.hud = new HUD();
    this.controls = new Controls();
    
    // Initialize viewport from store
    this.viewport = store.getViewport();
    
    this.setupEventHandlers();
  }

  async init(): Promise<void> {
    // Load saved state
    store.loadState();
    this.viewport = store.getViewport();
    
    this.resize();
    await this.renderer.init(this.canvas);
    this.hud.init();
    this.controls.init();
    
    this.renderer.setRenderCallback((stats) => {
      this.stats.renderTime = stats.renderTime;
      this.stats.fps = stats.fps;
    });
    
    // Subscribe to store changes
    store.subscribe((viewport) => {
      this.viewport = viewport;
    });

    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      // Add a small delay to ensure the fullscreen transition is complete
      setTimeout(() => {
        this.resize();
      }, 100);
    });
  }

  private setupEventHandlers(): void {
    this.inputHandler.onPan = (dx, dy) => {
      const worldDx = (dx / this.canvas.width) * this.viewport.scale;
      const worldDy = (dy / this.canvas.height) * this.viewport.scale;
      store.setViewport({
        centerX: this.viewport.centerX - worldDx,
        centerY: this.viewport.centerY + worldDy,
      });
    };

    this.inputHandler.onZoom = (factor, centerX, centerY) => {
      this.zoom(factor, centerX, centerY);
    };

    this.inputHandler.onFullscreen = () => {
      this.toggleFullscreen();
    };

    this.controls.onReset = () => {
      store.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 2.5,
        maxIterations: 256,
      });
    };

    this.controls.onColorSchemeChange = (scheme) => {
      store.setViewport({ colorScheme: scheme });
    };

    this.controls.onIterationChange = (iterations) => {
      store.setViewport({ maxIterations: iterations });
    };

    this.controls.onLoadBookmark = (index) => {
      store.loadBookmark(index);
    };

    this.controls.onZoomIn = () => {
      this.zoom(2.0);
    };

    this.controls.onZoomOut = () => {
      this.zoom(0.5);
    };

    this.controls.onFullscreenToggle = () => {
      this.toggleFullscreen();
    };
  }

  private zoom(factor: number, centerX?: number, centerY?: number): void {
    const newScale = this.viewport.scale / factor;
    let newCenterX = this.viewport.centerX;
    let newCenterY = this.viewport.centerY;
    
    if (centerX !== undefined && centerY !== undefined) {
      const rect = this.canvas.getBoundingClientRect();
      const x = centerX - rect.left;
      const y = centerY - rect.top;
      
      const dx = x - this.canvas.width / 2;
      const dy = y - this.canvas.height / 2;
      const worldDx = (dx / this.canvas.width) * this.viewport.scale;
      const worldDy = (dy / this.canvas.height) * this.viewport.scale;
      
      newCenterX += worldDx * (1 - 1 / factor);
      newCenterY -= worldDy * (1 - 1 / factor);
    }
    
    // Auto-adjust iterations based on zoom level
    const zoomLevel = Math.log2(2.5 / newScale);
    const newMaxIterations = Math.min(
      8192,
      Math.max(256, Math.floor(256 + zoomLevel * 50))
    );
    
    store.setViewport({
      centerX: newCenterX,
      centerY: newCenterY,
      scale: newScale,
      maxIterations: newMaxIterations,
    });
  }

  resize(): void {
    let width, height;
    
    if (document.fullscreenElement) {
      // In fullscreen, get the actual available dimensions
      width = document.documentElement.clientWidth;
      height = document.documentElement.clientHeight;
      
    } else {
      width = window.innerWidth;
      height = window.innerHeight;
    }
    
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    
    // The renderer will handle viewport updates in its render method
    
    store.setViewport({
      width: width,
      height: height,
    });
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.renderLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private renderLoop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    this.frameStartTime = now;
    
    // Calculate FPS from previous frame
    if (this.stats.lastFrameTime > 0) {
      const frameTime = now - this.stats.lastFrameTime;
      this.stats.fps = 1000 / frameTime;
      
      // Adaptive quality: degrade if frames are consistently slow
      if (this.adaptiveQuality) {
        if (frameTime > this.frameBudget * 1.5) { // 50% over budget
          this.consecutiveSlowFrames++;
          if (this.consecutiveSlowFrames > 3) {
            this.qualityLevel = Math.max(0.25, this.qualityLevel * 0.9);
          }
        } else {
          this.consecutiveSlowFrames = 0;
          // Gradually restore quality when performance is good
          if (frameTime < this.frameBudget * 0.8) { // 20% under budget
            this.qualityLevel = Math.min(1.0, this.qualityLevel * 1.02);
          }
        }
      }
    }
    this.stats.lastFrameTime = now;

    // Calculate quality-adjusted iterations
    const effectiveIterations = Math.floor(this.viewport.maxIterations * this.qualityLevel);

    const renderStart = performance.now();
    
    this.renderer.render({
      centerX: this.viewport.centerX,
      centerY: this.viewport.centerY,
      scale: this.viewport.scale,
      maxIterations: Math.max(64, effectiveIterations), // Minimum 64 iterations
      width: this.canvas.width,
      height: this.canvas.height,
      colorScheme: this.viewport.colorScheme,
      colorOffset: this.viewport.colorOffset,
      colorScale: this.viewport.colorScale,
    });

    this.stats.renderTime = performance.now() - renderStart;

    this.hud.update({
      centerX: this.viewport.centerX,
      centerY: this.viewport.centerY,
      scale: this.viewport.scale,
      maxIterations: effectiveIterations,
      fps: this.stats.fps,
      renderTime: this.stats.renderTime,
      qualityLevel: this.qualityLevel,
    });

    // Schedule next frame with time budgeting consideration
    const frameTime = performance.now() - this.frameStartTime;
    if (frameTime < this.frameBudget * 0.8) {
      // Frame finished early, schedule immediately
      this.animationId = requestAnimationFrame(this.renderLoop);
    } else {
      // Frame took longer, add small delay to prevent overwhelming
      setTimeout(() => {
        this.animationId = requestAnimationFrame(this.renderLoop);
      }, 1);
    }
  };

  getViewport(): ViewportState {
    return store.getViewport();
  }

  setViewport(viewport: Partial<ViewportState>): void {
    store.setViewport(viewport);
  }

  private toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      // Enter fullscreen - request it on the root element that contains the canvas
      const root = document.getElementById('root');
      if (root) {
        root.requestFullscreen().catch(err => {
          console.warn('Could not enter fullscreen:', err);
        });
      }
    } else {
      // Exit fullscreen
      document.exitFullscreen().catch(err => {
        console.warn('Could not exit fullscreen:', err);
      });
    }
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
    this.inputHandler.dispose();
    this.hud.dispose();
    this.controls.dispose();
  }
}