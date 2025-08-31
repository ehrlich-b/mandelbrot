import { WebGLRenderer, ProgressiveMode, type ProgressiveRenderParams } from './render/WebGLRenderer';
import { WebGLRendererDD, type DDRenderParams } from './render/WebGLRendererDD';
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
  private renderer: WebGLRendererDD;
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
  
  // Progressive rendering state
  private progressiveStage = 0;
  private progressiveMode = ProgressiveMode.FULL;
  private progressiveEnabled = false; // Disabled due to chaos issues
  private maxProgressiveStages = 2;
  private progressiveCompleted = false;
  
  // Anti-aliasing state
  private antiAliasingEnabled = true;
  private aaQuality = 2.0;
  
  // Histogram equalization state
  private histogramEqualizationEnabled = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRendererDD();
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
      // Reset progressive rendering when viewport changes significantly
      const prevViewport = this.viewport;
      const centerChanged = Math.abs(viewport.centerX - prevViewport.centerX) > 1e-12 ||
                           Math.abs(viewport.centerY - prevViewport.centerY) > 1e-12;
      const scaleChanged = Math.abs(viewport.scale - prevViewport.scale) > 1e-12;
      const iterationsChanged = viewport.maxIterations !== prevViewport.maxIterations;
      
      if (centerChanged || scaleChanged || iterationsChanged) {
        this.resetProgressiveRendering();
      }
      
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

    this.controls.onProgressiveToggle = (enabled) => {
      this.progressiveEnabled = enabled;
      if (enabled) {
        console.log('Progressive rendering enabled');
        this.resetProgressiveRendering();
      } else {
        console.log('Progressive rendering disabled');
        this.progressiveCompleted = true; // Stop any ongoing progressive rendering
      }
    };

    this.controls.onAntiAliasingToggle = (enabled) => {
      this.antiAliasingEnabled = enabled;
      console.log(`Anti-aliasing ${enabled ? 'enabled' : 'disabled'}`);
    };

    this.controls.onHistogramToggle = (enabled) => {
      this.histogramEqualizationEnabled = enabled;
      console.log(`Histogram equalization ${enabled ? 'enabled' : 'disabled'}`);
    };

    this.controls.onColorOffsetChange = (offset) => {
      store.setViewport({ colorOffset: offset });
    };

    this.controls.onColorScaleChange = (scale) => {
      store.setViewport({ colorScale: scale });
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
      // BUT don't degrade at deep zoom levels where detail is critical
      if (this.adaptiveQuality) {
        const zoomLevel = Math.log2(2.5 / this.viewport.scale);
        const isDeepZoom = zoomLevel > 15; // Scale < ~3e-5
        
        if (frameTime > this.frameBudget * 1.5) { // 50% over budget
          this.consecutiveSlowFrames++;
          if (this.consecutiveSlowFrames > 3 && !isDeepZoom) {
            // Only degrade quality if not at deep zoom levels
            this.qualityLevel = Math.max(0.5, this.qualityLevel * 0.9); // Min 50% instead of 25%
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
    
    // Calculate current frame time for progressive mode decision
    const currentFrameTime = this.stats.lastFrameTime > 0 ? (now - this.stats.lastFrameTime) : 0;
    
    // Determine progressive rendering mode based on performance
    this.updateProgressiveMode(currentFrameTime);

    const renderStart = performance.now();
    
    if (this.progressiveEnabled && !this.progressiveCompleted && this.progressiveMode !== ProgressiveMode.FULL) {
      // Use progressive rendering
      const progressiveParams: ProgressiveRenderParams = {
        centerX: this.viewport.centerX,
        centerY: this.viewport.centerY,
        scale: this.viewport.scale,
        maxIterations: Math.max(64, effectiveIterations),
        width: this.canvas.width,
        height: this.canvas.height,
        colorScheme: this.viewport.colorScheme,
        colorOffset: this.viewport.colorOffset,
        colorScale: this.viewport.colorScale,
        progressiveMode: this.progressiveMode,
        progressiveStage: this.progressiveStage,
        qualityLevel: this.qualityLevel,
        previousTransform: this.renderer.getLastTransform() ?? undefined,
        antiAliasing: this.antiAliasingEnabled,
        aaQuality: this.aaQuality,
        histogramEqualization: this.histogramEqualizationEnabled
      };
      
      this.renderer.renderProgressive(progressiveParams);
      
      // Advance to next progressive stage, but only for first few frames
      if (this.progressiveStage < this.maxProgressiveStages) {
        this.progressiveStage++;
        console.log(`Progressive stage: ${this.progressiveStage}/${this.maxProgressiveStages}`);
      } else {
        // After max stages, mark as completed to prevent further progressive rendering
        this.progressiveCompleted = true;
        this.progressiveMode = ProgressiveMode.FULL;
        console.log('Progressive rendering completed');
      }
    } else {
      // Use traditional full rendering with DD precision support
      this.renderer.render({
        centerX: this.viewport.centerX,
        centerY: this.viewport.centerY,
        scale: this.viewport.scale,
        maxIterations: Math.max(64, effectiveIterations),
        width: this.canvas.width,
        height: this.canvas.height,
        colorScheme: this.viewport.colorScheme,
        colorOffset: this.viewport.colorOffset,
        colorScale: this.viewport.colorScale,
        antiAliasing: this.antiAliasingEnabled,
        aaQuality: this.aaQuality,
        histogramEqualization: this.histogramEqualizationEnabled,
        useAutoPrecision: true, // Enable automatic precision switching
      });
    }

    this.stats.renderTime = performance.now() - renderStart;

    this.hud.update({
      centerX: this.viewport.centerX,
      centerY: this.viewport.centerY,
      scale: this.viewport.scale,
      maxIterations: effectiveIterations,
      fps: this.stats.fps,
      renderTime: this.stats.renderTime,
      qualityLevel: this.qualityLevel,
      progressiveMode: this.progressiveMode,
      progressiveStage: this.progressiveStage,
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

  /**
   * Jump to deep zoom coordinates using high precision
   */
  gotoDeepZoom(centerX: string, centerY: string, scale: string, iterations?: number): void {
    const ddParams = this.renderer.setHighPrecisionCoordinates(centerX, centerY, scale);
    store.setViewport({
      centerX: ddParams.centerX,
      centerY: ddParams.centerY,
      scale: ddParams.scale,
      maxIterations: iterations || Math.min(8192, Math.max(1000, Math.floor(2000 - Math.log10(ddParams.scale) * 100))),
    });
    
    // Log precision info
    const precisionInfo = this.renderer.getPrecisionInfo();
    console.log(`Deep zoom activated: ${precisionInfo.currentPrecision} precision (${precisionInfo.effectiveDigits} digits)`);
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

  private updateProgressiveMode(_frameTime: number): void {
    if (!this.progressiveEnabled) {
      this.progressiveMode = ProgressiveMode.FULL;
      return;
    }

    // Progressive mode selection with clear completion
    if (this.progressiveStage === 0) {
      this.progressiveMode = ProgressiveMode.STOCHASTIC;
    } else if (this.progressiveStage === 1) {
      this.progressiveMode = ProgressiveMode.INTERLEAVED;
    } else {
      // Force completion after 2 stages and stop progressive mode
      this.progressiveMode = ProgressiveMode.FULL;
      this.progressiveEnabled = false; // Auto-disable to prevent loop
    }
  }

  private resetProgressiveRendering(): void {
    this.progressiveStage = 0;
    this.progressiveCompleted = false;
    this.progressiveMode = this.progressiveEnabled ? ProgressiveMode.STOCHASTIC : ProgressiveMode.FULL;
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
    this.inputHandler.dispose();
    this.hud.dispose();
    this.controls.dispose();
  }
}