/**
 * Enhanced WebGL Renderer with Double-Double Precision Support
 * 
 * Extends the standard WebGL renderer to support deep zoom using double-double
 * arithmetic when standard float64 precision becomes insufficient.
 */

import vertexShaderSource from './shaders/vertex.glsl';
import fragmentShaderSource from './shaders/fragment.glsl';
import fragmentShaderDDSource from './shaders/fragment-dd.glsl';
import { 
  DoubleDouble, 
  ddFromNumber, 
  ddToNumber, 
  ddFromString
} from '../math/dd.js';
import { RenderParams } from './WebGLRenderer.js';

export interface DDRenderParams extends RenderParams {
  // Enhanced precision coordinates
  centerXDD?: DoubleDouble;
  centerYDD?: DoubleDouble;
  scaleDD?: DoubleDouble;
  
  // Automatic precision switching
  useAutoPrecision?: boolean;
  precisionThreshold?: number;  // Scale below which to use DD arithmetic
}

/**
 * Precision management utilities
 */
export class PrecisionManager {
  private static readonly DD_THRESHOLD = 5e-6;       // When to switch to DD arithmetic (activate at 1e-6 and smaller)
  
  /**
   * Determine if double-double precision is needed based on zoom scale
   */
  static needsHighPrecision(scale: number): boolean {
    const needs = scale < this.DD_THRESHOLD;
    return needs;
  }
  
  /**
   * Convert regular numbers to DD with error checking
   */
  static numberToDD(x: number): DoubleDouble {
    if (!isFinite(x)) {
      return ddFromNumber(x);
    }
    
    // For very small or very large numbers, preserve precision
    if (Math.abs(x) < 1e-300 || Math.abs(x) > 1e300) {
      return ddFromNumber(x);
    }
    
    return ddFromNumber(x);
  }
  
  /**
   * Decompose a number into high and low parts for DD precision
   */
  static splitNumber(x: number): DoubleDouble {
    // For numbers that can't be exactly represented in double precision,
    // try to extract more precision
    const str = x.toPrecision(17);
    return ddFromString(str);
  }
}

export class WebGLRendererDD {
  private gl: WebGL2RenderingContext | null = null;
  private standardProgram: WebGLProgram | null = null;
  private ddProgram: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  
  // Debug tracking
  private lastDDState = false;
  
  // Uniforms for both programs
  private standardUniforms: Record<string, WebGLUniformLocation | null> = {};
  private ddUniforms: Record<string, WebGLUniformLocation | null> = {};
  
  // Progressive rendering state
  private previousFrameTexture: WebGLTexture | null = null;
  private frameBuffer: WebGLFramebuffer | null = null;
  private lastTransform: { 
    centerX: number; 
    centerY: number; 
    scale: number;
    centerXDD?: DoubleDouble;
    centerYDD?: DoubleDouble;
    scaleDD?: DoubleDouble;
  } | null = null;
  
  // Performance tracking
  private renderCallback?: (stats: { 
    renderTime: number; 
    fps: number; 
    precision: 'standard' | 'dd';
    effectiveDigits: number;
  }) => void;
  private frameCount = 0;
  private lastRenderTime = 0;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      alpha: false,
    });

    if (!gl) {
      throw new Error('WebGL2 not supported. Please use a modern browser.');
    }

    this.gl = gl;
    
    // Enable required extensions
    const extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    if (!extColorBufferFloat) {
      console.warn('EXT_color_buffer_float not supported, may affect quality');
    }

    await this.setupShaders();
    this.setupGeometry();
    this.setupUniforms();
    this.setupProgressive();
    
    console.log('WebGL2 renderer with DD precision initialized');
  }

  private compileShader(source: string, type: number): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      const shaderType = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      gl.deleteShader(shader);
      throw new Error(`${shaderType} shader compilation failed: ${info}`);
    }

    return shader;
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl!;
    
    const vertexShader = this.compileShader(vertexSource, gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(fragmentSource, gl.FRAGMENT_SHADER);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create shader program');

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      throw new Error(`Shader program linking failed: ${info}`);
    }

    // Clean up shaders - they're now linked into the program
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
  }

  private async setupShaders(): Promise<void> {
    // Create both standard and DD precision programs
    this.standardProgram = this.createProgram(vertexShaderSource, fragmentShaderSource);
    this.ddProgram = this.createProgram(vertexShaderSource, fragmentShaderDDSource);
  }

  private setupGeometry(): void {
    const gl = this.gl!;
    
    // Full-screen quad vertices
    const vertices = new Float32Array([
      -1, -1,  // bottom-left
       1, -1,  // bottom-right
      -1,  1,  // top-left
       1,  1,  // top-right
    ]);

    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Failed to create vertex buffer');
    
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    this.vertexBuffer = buffer;
  }

  private setupUniformsForProgram(program: WebGLProgram): Record<string, WebGLUniformLocation | null> {
    const gl = this.gl!;
    
    const uniformNames = [
      'u_resolution',
      'u_center', 
      'u_scale',
      'u_center_dd',    // DD precision center (vec4)
      'u_scale_dd',     // DD precision scale (vec2)
      'u_use_dd_precision', // Flag to enable DD mode
      'u_maxIterations',
      'u_colorScheme',
      'u_colorOffset',
      'u_colorScale',
      'u_progressiveMode',
      'u_progressiveStage',
      'u_previousTexture',
      'u_previousTransform',
      'u_antiAliasing',
      'u_aaQuality',
      'u_histogramEqualization',
    ];

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    
    for (const name of uniformNames) {
      uniforms[name] = gl.getUniformLocation(program, name);
      if (uniforms[name] === null) {
        // Only warn for uniforms that should exist in both shaders
        const ddOnlyUniforms = ['u_center_dd', 'u_scale_dd', 'u_use_dd_precision'];
        if (!ddOnlyUniforms.includes(name)) {
          console.warn(`Uniform ${name} not found in shader`);
        }
      }
    }
    
    return uniforms;
  }

  private setupUniforms(): void {
    this.standardUniforms = this.setupUniformsForProgram(this.standardProgram!);
    this.ddUniforms = this.setupUniformsForProgram(this.ddProgram!);
  }

  private setupProgressive(): void {
    const gl = this.gl!;
    
    // Create texture for previous frame
    this.previousFrameTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.previousFrameTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Create framebuffer for offscreen rendering
    this.frameBuffer = gl.createFramebuffer();
  }

  private setupVertexAttributes(program: WebGLProgram): void {
    const gl = this.gl!;
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  }

  private setStandardUniforms(params: DDRenderParams, uniforms: Record<string, WebGLUniformLocation | null>): void {
    const gl = this.gl!;

    if (uniforms.u_resolution) {
      gl.uniform2f(uniforms.u_resolution, this.canvas!.width, this.canvas!.height);
    }
    if (uniforms.u_center) {
      gl.uniform2f(uniforms.u_center, params.centerX, params.centerY);
    }
    if (uniforms.u_scale) {
      gl.uniform1f(uniforms.u_scale, params.scale);
    }
    if (uniforms.u_maxIterations) {
      gl.uniform1i(uniforms.u_maxIterations, params.maxIterations);
    }
    if (uniforms.u_colorScheme) {
      gl.uniform1i(uniforms.u_colorScheme, params.colorScheme);
    }
    if (uniforms.u_colorOffset) {
      gl.uniform1f(uniforms.u_colorOffset, params.colorOffset);
    }
    if (uniforms.u_colorScale) {
      gl.uniform1f(uniforms.u_colorScale, params.colorScale);
    }
    if (uniforms.u_antiAliasing) {
      gl.uniform1i(uniforms.u_antiAliasing, params.antiAliasing ? 1 : 0);
    }
    if (uniforms.u_aaQuality) {
      gl.uniform1f(uniforms.u_aaQuality, params.aaQuality || 2.0);
    }
    if (uniforms.u_histogramEqualization) {
      gl.uniform1i(uniforms.u_histogramEqualization, params.histogramEqualization ? 1 : 0);
    }
  }

  private setDDUniforms(params: DDRenderParams, uniforms: Record<string, WebGLUniformLocation | null>): void {
    const gl = this.gl!;

    // Set DD-specific uniforms (always set them when using DD precision)
    if (uniforms.u_center_dd) {
      const centerXDD = params.centerXDD || PrecisionManager.numberToDD(params.centerX);
      const centerYDD = params.centerYDD || PrecisionManager.numberToDD(params.centerY);
      gl.uniform4f(uniforms.u_center_dd, centerXDD.hi, centerXDD.lo, centerYDD.hi, centerYDD.lo);
    }
    
    if (uniforms.u_scale_dd) {
      // PRECISION FIX: Convert scale to proper DD representation
      const scaleDD = params.scaleDD || PrecisionManager.numberToDD(params.scale);
      gl.uniform2f(uniforms.u_scale_dd, scaleDD.hi, scaleDD.lo);
    }
    
    if (uniforms.u_use_dd_precision) {
      const useDD = params.useAutoPrecision !== false && 
                   PrecisionManager.needsHighPrecision(params.scale);
      gl.uniform1i(uniforms.u_use_dd_precision, useDD ? 1 : 0);
    }
  }

  render(params: DDRenderParams): void {
    if (!this.gl) return;

    const startTime = performance.now();
    const gl = this.gl;

    // Determine which program to use
    const needsDD = params.useAutoPrecision !== false && 
                   PrecisionManager.needsHighPrecision(params.scale);
    
    const program = needsDD ? this.ddProgram : this.standardProgram;
    const uniforms = needsDD ? this.ddUniforms : this.standardUniforms;
    
    // Debug logging for precision switching
    if (needsDD !== this.lastDDState) {
      console.log(`Precision switch: ${needsDD ? 'STANDARD → DD' : 'DD → STANDARD'} (scale: ${params.scale.toExponential()})`);
      this.lastDDState = needsDD;
    }
    
    if (!program) {
      console.error('Shader program not available');
      return;
    }

    // Update viewport
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    gl.useProgram(program);

    // Setup vertex attributes
    this.setupVertexAttributes(program);

    // Set standard uniforms
    this.setStandardUniforms(params, uniforms);
    
    // Set DD-specific uniforms if using DD program
    if (needsDD) {
      this.setDDUniforms(params, uniforms);
    }

    // Draw the full-screen quad
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Update transform state
    this.lastTransform = {
      centerX: params.centerX,
      centerY: params.centerY,
      scale: params.scale,
      centerXDD: params.centerXDD,
      centerYDD: params.centerYDD,
      scaleDD: params.scaleDD
    };

    // Calculate performance stats
    const renderTime = performance.now() - startTime;
    this.frameCount++;
    
    const now = performance.now();
    const fps = this.lastRenderTime > 0 ? 1000 / (now - this.lastRenderTime) : 0;
    this.lastRenderTime = now;

    if (this.renderCallback) {
      const precision = needsDD ? 'dd' : 'standard';
      const effectiveDigits = needsDD ? 32 : 15; // Approximate significant digits
      
      this.renderCallback({ renderTime, fps, precision, effectiveDigits });
    }
  }

  /**
   * Convert coordinates to high precision for deep zoom
   */
  setHighPrecisionCoordinates(centerX: string, centerY: string, scale: string): DDRenderParams {
    const centerXDD = ddFromString(centerX);
    const centerYDD = ddFromString(centerY);
    const scaleDD = ddFromString(scale);
    
    return {
      centerX: ddToNumber(centerXDD),
      centerY: ddToNumber(centerYDD),
      scale: ddToNumber(scaleDD),
      centerXDD,
      centerYDD,
      scaleDD,
      useAutoPrecision: true,
      maxIterations: 1000,
      colorScheme: 0,
      colorOffset: 0,
      colorScale: 1,
      width: this.canvas?.width || 800,
      height: this.canvas?.height || 600
    };
  }

  /**
   * Get current precision information
   */
  getPrecisionInfo(): {
    currentPrecision: 'standard' | 'dd';
    needsHighPrecision: boolean;
    effectiveDigits: number;
    scale: number;
  } {
    const scale = this.lastTransform?.scale || 1.0;
    const needsHighPrecision = PrecisionManager.needsHighPrecision(scale);
    
    return {
      currentPrecision: needsHighPrecision ? 'dd' : 'standard',
      needsHighPrecision,
      effectiveDigits: needsHighPrecision ? 32 : 15,
      scale
    };
  }

  getLastTransform(): { centerX: number; centerY: number; scale: number } | null {
    if (!this.lastTransform) return null;
    return {
      centerX: this.lastTransform.centerX,
      centerY: this.lastTransform.centerY,
      scale: this.lastTransform.scale
    };
  }

  setRenderCallback(callback: (stats: { 
    renderTime: number; 
    fps: number; 
    precision: 'standard' | 'dd';
    effectiveDigits: number;
  }) => void): void {
    this.renderCallback = callback;
  }

  dispose(): void {
    if (this.gl) {
      if (this.vertexBuffer) {
        this.gl.deleteBuffer(this.vertexBuffer);
      }
      if (this.standardProgram) {
        this.gl.deleteProgram(this.standardProgram);
      }
      if (this.ddProgram) {
        this.gl.deleteProgram(this.ddProgram);
      }
      if (this.previousFrameTexture) {
        this.gl.deleteTexture(this.previousFrameTexture);
      }
      if (this.frameBuffer) {
        this.gl.deleteFramebuffer(this.frameBuffer);
      }
    }
    
    this.gl = null;
    this.standardProgram = null;
    this.ddProgram = null;
    this.vertexBuffer = null;
    this.standardUniforms = {};
    this.ddUniforms = {};
    this.canvas = null;
    this.renderCallback = undefined;
    this.previousFrameTexture = null;
    this.frameBuffer = null;
    this.lastTransform = null;
  }
}