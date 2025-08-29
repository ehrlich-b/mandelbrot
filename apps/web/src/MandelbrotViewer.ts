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
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    
    store.setViewport({
      width: window.innerWidth,
      height: window.innerHeight,
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
    if (this.stats.lastFrameTime > 0) {
      this.stats.fps = 1000 / (now - this.stats.lastFrameTime);
    }
    this.stats.lastFrameTime = now;

    this.renderer.render({
      centerX: this.viewport.centerX,
      centerY: this.viewport.centerY,
      scale: this.viewport.scale,
      maxIterations: this.viewport.maxIterations,
      width: this.canvas.width,
      height: this.canvas.height,
      colorScheme: this.viewport.colorScheme,
      colorOffset: this.viewport.colorOffset,
      colorScale: this.viewport.colorScale,
    });

    this.hud.update({
      centerX: this.viewport.centerX,
      centerY: this.viewport.centerY,
      scale: this.viewport.scale,
      maxIterations: this.viewport.maxIterations,
      fps: this.stats.fps,
      renderTime: this.stats.renderTime,
    });

    this.animationId = requestAnimationFrame(this.renderLoop);
  };

  getViewport(): ViewportState {
    return store.getViewport();
  }

  setViewport(viewport: Partial<ViewportState>): void {
    store.setViewport(viewport);
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
    this.inputHandler.dispose();
    this.hud.dispose();
    this.controls.dispose();
  }
}