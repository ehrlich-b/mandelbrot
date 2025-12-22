import { ProgressiveMode } from './render/WebGLRenderer';
import { WebGLRendererDD } from './render/WebGLRendererDD';
import { getPerturbationRenderer, type PerturbationRenderer } from './render/PerturbationRenderer';
import { TileRenderer } from './tiles';
import { InputHandler } from './input/InputHandler';
import { HUD } from './ui/HUD';
import { Controls } from './ui/Controls';
import { store, type ViewportState } from './state/store';
import {
  ddFromNumberForGLSL,
  ddAdd,
  ddSub,
  ddMul,
  ddDiv,
  ddToNumber
} from './math/dd';

export type RenderMode = 'fullframe' | 'tiled';

export interface RenderStats {
  fps: number;
  renderTime: number;
  lastFrameTime: number;
}

// Threshold for switching to perturbation mode (DD is broken below this)
const PERTURBATION_THRESHOLD = 5e-6;

export class MandelbrotViewer {
  private canvas: HTMLCanvasElement;
  private renderer: WebGLRendererDD;
  private perturbationRenderer: PerturbationRenderer;
  private tileRenderer: TileRenderer | null = null;
  private inputHandler: InputHandler;
  private hud: HUD;
  private controls: Controls;

  private viewport: ViewportState;
  private renderMode: RenderMode = 'fullframe';

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
  private progressiveEnabled = false; // Disabled by default - adds complexity for marginal benefit
  private maxProgressiveStages = 3;
  private progressiveCompleted = false;
  
  // Anti-aliasing state - disabled by default for performance
  private antiAliasingEnabled = false;
  private aaQuality = 2.0;
  
  // Histogram equalization state
  private histogramEqualizationEnabled = false;

  // Debug mode for DD shader diagnostics
  private ddDebugMode = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRendererDD();
    this.perturbationRenderer = getPerturbationRenderer();
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

    // Initialize perturbation renderer for deep zoom
    const gl = this.canvas.getContext('webgl2');
    if (gl) {
      const perturbAvailable = await this.perturbationRenderer.init(gl);
      if (perturbAvailable) {
        console.log('Perturbation renderer initialized - deep zoom enabled');
      } else {
        console.warn('Perturbation renderer failed to initialize - deep zoom may be limited');
      }
    }

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
        // Cancel pending tiles on viewport change for responsiveness
        if (this.renderMode === 'tiled' && this.tileRenderer) {
          this.tileRenderer.cancelPending();
        }
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

  /**
   * Set the render mode (fullframe or tiled)
   */
  async setRenderMode(mode: RenderMode): Promise<void> {
    if (mode === this.renderMode) return;

    this.renderMode = mode;
    console.log(`Render mode: ${mode}`);

    if (mode === 'tiled' && !this.tileRenderer) {
      // Initialize tile renderer on first use
      this.tileRenderer = new TileRenderer();
      await this.tileRenderer.init(this.canvas);

      // Request re-render when tiles complete
      this.tileRenderer.onTileReady(() => {
        // Trigger a re-render on next frame
        if (this.isRunning && this.renderMode === 'tiled') {
          // The render loop will pick up new tiles
        }
      });
    }
  }

  /**
   * Get the current render mode
   */
  getRenderMode(): RenderMode {
    return this.renderMode;
  }

  private setupEventHandlers(): void {
    this.inputHandler.onPan = (dx, dy) => {
      // Use DD arithmetic to preserve precision at deep zoom
      const centerXDD = ddFromNumberForGLSL(this.viewport.centerX);
      const centerYDD = ddFromNumberForGLSL(this.viewport.centerY);
      const scaleDD = ddFromNumberForGLSL(this.viewport.scale);
      const widthDD = ddFromNumberForGLSL(this.canvas.width);
      const heightDD = ddFromNumberForGLSL(this.canvas.height);

      const worldDxDD = ddMul(ddDiv(ddFromNumberForGLSL(dx), widthDD), scaleDD);
      const worldDyDD = ddMul(ddDiv(ddFromNumberForGLSL(dy), heightDD), scaleDD);

      const newCenterXDD = ddSub(centerXDD, worldDxDD);
      const newCenterYDD = ddAdd(centerYDD, worldDyDD);

      store.setViewport({
        centerX: ddToNumber(newCenterXDD),
        centerY: ddToNumber(newCenterYDD),
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

    // Use DD arithmetic for center calculation to preserve precision at deep zoom
    // This prevents "rectangular block" artifacts when scale < 1e-8
    let centerXDD = ddFromNumberForGLSL(this.viewport.centerX);
    let centerYDD = ddFromNumberForGLSL(this.viewport.centerY);

    if (centerX !== undefined && centerY !== undefined) {
      const rect = this.canvas.getBoundingClientRect();
      const x = centerX - rect.left;
      const y = centerY - rect.top;

      const dx = x - this.canvas.width / 2;
      const dy = y - this.canvas.height / 2;

      // Calculate world delta using DD arithmetic
      const scaleDD = ddFromNumberForGLSL(this.viewport.scale);
      const widthDD = ddFromNumberForGLSL(this.canvas.width);
      const heightDD = ddFromNumberForGLSL(this.canvas.height);
      const factorDD = ddFromNumberForGLSL(factor);
      const oneDD = ddFromNumberForGLSL(1.0);

      // worldDx = (dx / width) * scale
      const dxDD = ddFromNumberForGLSL(dx);
      const dyDD = ddFromNumberForGLSL(dy);
      const worldDxDD = ddMul(ddDiv(dxDD, widthDD), scaleDD);
      const worldDyDD = ddMul(ddDiv(dyDD, heightDD), scaleDD);

      // adjustment = (1 - 1/factor)
      const invFactorDD = ddDiv(oneDD, factorDD);
      const adjustmentDD = ddSub(oneDD, invFactorDD);

      // newCenter += worldD * adjustment
      centerXDD = ddAdd(centerXDD, ddMul(worldDxDD, adjustmentDD));
      centerYDD = ddSub(centerYDD, ddMul(worldDyDD, adjustmentDD));
    }

    // Convert back to float64 for storage (DD preserves more precision in calculation)
    const newCenterX = ddToNumber(centerXDD);
    const newCenterY = ddToNumber(centerYDD);

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

    let precisionMode: 'STANDARD' | 'DD' | 'PERTURB' | 'TILED' = 'STANDARD';

    if (this.renderMode === 'tiled' && this.tileRenderer) {
      // Tile-based rendering
      this.tileRenderer.render({
        centerX: this.viewport.centerX,
        centerY: this.viewport.centerY,
        scale: this.viewport.scale,
        maxIterations: Math.max(64, effectiveIterations),
        width: this.canvas.width,
        height: this.canvas.height,
        colorScheme: this.viewport.colorScheme,
        colorOffset: this.viewport.colorOffset,
        colorScale: this.viewport.colorScale,
      });
      precisionMode = 'TILED';
    } else if (this.viewport.scale < PERTURBATION_THRESHOLD && this.perturbationRenderer.isAvailable()) {
      // Deep zoom - use perturbation theory (DD is broken due to float32 epsilon limitation)
      const centerReal = this.viewport.centerX.toPrecision(17);
      const centerImag = this.viewport.centerY.toPrecision(17);
      const perturbViewport = {
        centerReal,
        centerImag,
        scale: this.viewport.scale,
        maxIterations: Math.max(64, effectiveIterations),
      };

      // Check if we have a VALID orbit for the current viewport
      // The orbit is valid if it doesn't need recomputation
      const existingOrbit = this.perturbationRenderer.getCurrentOrbit();
      const orbitIsValid = existingOrbit && !this.perturbationRenderer.needsRecompute(
        centerReal, centerImag, this.viewport.scale
      );

      if (orbitIsValid) {
        // Orbit is valid for current viewport - render with perturbation
        this.perturbationRenderer.render(
          perturbViewport,
          this.viewport.colorScheme,
          {
            histogramEqualization: this.histogramEqualizationEnabled,
            glitchThreshold: 1e10,  // Completely disable glitch detection
          }
        );
        precisionMode = 'PERTURB';
      } else {
        // Orbit is stale or missing - need to recompute
        // Fall back to standard rendering while recomputing
        // (At very deep zoom this may look broken, but at least it's not garbage from wrong orbit)
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
          antiAliasing: false,
          histogramEqualization: this.histogramEqualizationEnabled,
          useAutoPrecision: false, // Use standard only, DD is broken
        });
        precisionMode = 'STANDARD';

        // Trigger orbit recomputation for next frame
        this.perturbationRenderer.computeReferenceOrbit(perturbViewport)
          .catch(err => console.error('Reference orbit computation failed:', err));
      }
    } else {
      // Standard or DD rendering (for scale > PERTURBATION_THRESHOLD)
      // Note: DD mode has limitations - see deep_zoom_issue.md
      const canUseProgressive = this.progressiveEnabled;

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
        useAutoPrecision: true,
        progressiveMode: canUseProgressive && !this.progressiveCompleted ? this.progressiveMode : ProgressiveMode.FULL,
        progressiveStage: this.progressiveStage,
        debugMode: this.ddDebugMode,
      });

      // Advance progressive stage if in progressive mode
      if (canUseProgressive && !this.progressiveCompleted) {
        this.progressiveStage++;
        if (this.progressiveStage >= this.maxProgressiveStages) {
          this.progressiveCompleted = true;
          this.progressiveMode = ProgressiveMode.FULL;
        }
      }

      // Get current precision information
      const precisionInfo = this.renderer.getPrecisionInfo();
      precisionMode = precisionInfo.currentPrecision === 'dd' ? 'DD' : 'STANDARD';
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
      precision: precisionMode,
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

  /**
   * Set DD shader debug mode for diagnostics
   * @param mode 0=normal, 1=pixel coords, 2=DD coords, 3=scale, 4=iteration growth
   */
  setDebugMode(mode: number): void {
    this.ddDebugMode = mode;
    console.log(`DD Debug mode set to ${mode}:`, {
      0: 'Normal rendering',
      1: 'Pixel coordinate visualization',
      2: 'DD coordinate hi-parts visualization',
      3: 'Scale uniform visualization',
      4: 'Iteration growth visualization',
    }[mode] || 'Unknown');
  }

  /**
   * Get current debug mode
   */
  getDebugMode(): number {
    return this.ddDebugMode;
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
    this.tileRenderer?.dispose();
    this.inputHandler.dispose();
    this.hud.dispose();
    this.controls.dispose();
  }
}