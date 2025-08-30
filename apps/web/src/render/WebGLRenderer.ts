import vertexShaderSource from './shaders/vertex.glsl';
import fragmentShaderSource from './shaders/fragment.glsl';

export interface RenderParams {
  centerX: number;
  centerY: number;
  scale: number;
  maxIterations: number;
  width: number;
  height: number;
  colorScheme: number;
  colorOffset: number;
  colorScale: number;
  antiAliasing?: boolean;
  aaQuality?: number;
  histogramEqualization?: boolean;
}

export enum ProgressiveMode {
  FULL = 'full',
  REPROJECTION = 'reprojection',
  STOCHASTIC = 'stochastic',
  INTERLEAVED = 'interleaved',
  ADAPTIVE = 'adaptive'
}

export interface ProgressiveRenderParams extends RenderParams {
  progressiveMode: ProgressiveMode;
  progressiveStage: number;
  qualityLevel: number;
  previousTransform?: {
    centerX: number;
    centerY: number;
    scale: number;
  };
}

export class WebGLRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private canvas: HTMLCanvasElement | null = null;
  private lastRenderTime = 0;
  private frameCount = 0;
  private renderCallback?: (stats: { renderTime: number; fps: number }) => void;
  
  // Progressive rendering state
  private previousFrameTexture: WebGLTexture | null = null;
  private frameBuffer: WebGLFramebuffer | null = null;
  private lastTransform: { centerX: number; centerY: number; scale: number } | null = null;

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

    this.setupShaders();
    this.setupGeometry();
    this.setupUniforms();
    this.setupProgressive();
    
    console.log('WebGL2 renderer initialized');
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

  private setupShaders(): void {
    const gl = this.gl!;
    
    const vertexShader = this.compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

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

    this.program = program;
    gl.useProgram(program);
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

    const positionLocation = gl.getAttribLocation(this.program!, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    this.vertexBuffer = buffer;
  }

  private setupUniforms(): void {
    const gl = this.gl!;
    const program = this.program!;

    const uniformNames = [
      'u_resolution',
      'u_center', 
      'u_scale',
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
      'u_histogramTexture',
      'u_totalPixels',
    ];

    for (const name of uniformNames) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
      if (this.uniforms[name] === null) {
        console.warn(`Uniform ${name} not found in shader`);
      }
    }
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

  renderProgressive(params: ProgressiveRenderParams): void {
    if (!this.gl || !this.program) return;

    const startTime = performance.now();
    const gl = this.gl;

    // Update viewport to match current canvas size
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);

    gl.useProgram(this.program);

    // Set standard uniforms
    if (this.uniforms.u_resolution) {
      gl.uniform2f(this.uniforms.u_resolution, this.canvas!.width, this.canvas!.height);
    }
    if (this.uniforms.u_center) {
      gl.uniform2f(this.uniforms.u_center, params.centerX, params.centerY);
    }
    if (this.uniforms.u_scale) {
      gl.uniform1f(this.uniforms.u_scale, params.scale);
    }
    if (this.uniforms.u_maxIterations) {
      gl.uniform1i(this.uniforms.u_maxIterations, Math.floor(params.maxIterations * params.qualityLevel));
    }
    if (this.uniforms.u_colorScheme) {
      gl.uniform1i(this.uniforms.u_colorScheme, params.colorScheme);
    }
    if (this.uniforms.u_colorOffset) {
      gl.uniform1f(this.uniforms.u_colorOffset, params.colorOffset);
    }
    if (this.uniforms.u_colorScale) {
      gl.uniform1f(this.uniforms.u_colorScale, params.colorScale);
    }

    // Set progressive rendering uniforms
    if (this.uniforms.u_progressiveMode) {
      const modeMap = {
        [ProgressiveMode.FULL]: 0,
        [ProgressiveMode.REPROJECTION]: 1,
        [ProgressiveMode.STOCHASTIC]: 2,
        [ProgressiveMode.INTERLEAVED]: 3,
        [ProgressiveMode.ADAPTIVE]: 4
      };
      gl.uniform1i(this.uniforms.u_progressiveMode, modeMap[params.progressiveMode]);
    }
    if (this.uniforms.u_progressiveStage) {
      gl.uniform1i(this.uniforms.u_progressiveStage, params.progressiveStage);
    }
    
    // Bind previous frame texture if available
    if (this.uniforms.u_previousTexture && this.previousFrameTexture) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.previousFrameTexture);
      gl.uniform1i(this.uniforms.u_previousTexture, 1);
    }
    
    // Set previous transform for reprojection
    if (this.uniforms.u_previousTransform && params.previousTransform) {
      gl.uniform3f(this.uniforms.u_previousTransform, 
        params.previousTransform.centerX,
        params.previousTransform.centerY, 
        params.previousTransform.scale);
    }

    // Set anti-aliasing uniforms
    if (this.uniforms.u_antiAliasing) {
      gl.uniform1i(this.uniforms.u_antiAliasing, params.antiAliasing ? 1 : 0);
    }
    if (this.uniforms.u_aaQuality) {
      gl.uniform1f(this.uniforms.u_aaQuality, params.aaQuality || 2.0);
    }

    // Set histogram equalization uniforms
    if (this.uniforms.u_histogramEqualization) {
      gl.uniform1i(this.uniforms.u_histogramEqualization, params.histogramEqualization ? 1 : 0);
    }

    // Draw the full-screen quad
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Save current frame to texture for next reprojection
    if (params.progressiveMode === ProgressiveMode.REPROJECTION || 
        params.progressiveStage === 0) {
      this.saveFrameTexture();
    }

    // Store current transform
    this.lastTransform = {
      centerX: params.centerX,
      centerY: params.centerY,
      scale: params.scale
    };

    // Calculate performance stats
    const renderTime = performance.now() - startTime;
    this.frameCount++;
    
    const now = performance.now();
    const fps = this.lastRenderTime > 0 ? 1000 / (now - this.lastRenderTime) : 0;
    this.lastRenderTime = now;

    if (this.renderCallback) {
      this.renderCallback({ renderTime, fps });
    }
  }

  render(params: RenderParams): void {
    if (!this.gl || !this.program) return;

    const startTime = performance.now();
    const gl = this.gl;

    // Update viewport to match current canvas size
    // Don't resize the canvas here - let MandelbrotViewer handle that
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);

    gl.useProgram(this.program);

    // Set uniforms
    if (this.uniforms.u_resolution) {
      gl.uniform2f(this.uniforms.u_resolution, this.canvas!.width, this.canvas!.height);
    }
    if (this.uniforms.u_center) {
      gl.uniform2f(this.uniforms.u_center, params.centerX, params.centerY);
    }
    if (this.uniforms.u_scale) {
      gl.uniform1f(this.uniforms.u_scale, params.scale);
    }
    if (this.uniforms.u_maxIterations) {
      gl.uniform1i(this.uniforms.u_maxIterations, params.maxIterations);
    }
    if (this.uniforms.u_colorScheme) {
      gl.uniform1i(this.uniforms.u_colorScheme, params.colorScheme);
    }
    if (this.uniforms.u_colorOffset) {
      gl.uniform1f(this.uniforms.u_colorOffset, params.colorOffset);
    }
    if (this.uniforms.u_colorScale) {
      gl.uniform1f(this.uniforms.u_colorScale, params.colorScale);
    }

    // Set progressive rendering uniforms to safe defaults for regular rendering
    if (this.uniforms.u_progressiveMode) {
      gl.uniform1i(this.uniforms.u_progressiveMode, 0); // FULL mode
    }
    if (this.uniforms.u_progressiveStage) {
      gl.uniform1i(this.uniforms.u_progressiveStage, 0);
    }

    // Set anti-aliasing uniforms
    if (this.uniforms.u_antiAliasing) {
      gl.uniform1i(this.uniforms.u_antiAliasing, params.antiAliasing ? 1 : 0);
    }
    if (this.uniforms.u_aaQuality) {
      gl.uniform1f(this.uniforms.u_aaQuality, params.aaQuality || 2.0);
    }

    // Set histogram equalization uniforms
    if (this.uniforms.u_histogramEqualization) {
      gl.uniform1i(this.uniforms.u_histogramEqualization, params.histogramEqualization ? 1 : 0);
    }

    // Draw the full-screen quad
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Calculate performance stats
    const renderTime = performance.now() - startTime;
    this.frameCount++;
    
    const now = performance.now();
    const fps = this.lastRenderTime > 0 ? 1000 / (now - this.lastRenderTime) : 0;
    this.lastRenderTime = now;

    if (this.renderCallback) {
      this.renderCallback({ renderTime, fps });
    }
  }

  private saveFrameTexture(): void {
    if (!this.gl || !this.previousFrameTexture || !this.canvas) return;
    
    const gl = this.gl;
    
    // Read pixels from current framebuffer
    const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    
    // Update texture with pixel data
    gl.bindTexture(gl.TEXTURE_2D, this.previousFrameTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      this.canvas.width, this.canvas.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, pixels
    );
  }

  getLastTransform(): { centerX: number; centerY: number; scale: number } | null {
    return this.lastTransform;
  }

  setRenderCallback(callback: (stats: { renderTime: number; fps: number }) => void): void {
    this.renderCallback = callback;
  }

  dispose(): void {
    if (this.gl) {
      if (this.vertexBuffer) {
        this.gl.deleteBuffer(this.vertexBuffer);
      }
      if (this.program) {
        this.gl.deleteProgram(this.program);
      }
      if (this.previousFrameTexture) {
        this.gl.deleteTexture(this.previousFrameTexture);
      }
      if (this.frameBuffer) {
        this.gl.deleteFramebuffer(this.frameBuffer);
      }
    }
    
    this.gl = null;
    this.program = null;
    this.vertexBuffer = null;
    this.uniforms = {};
    this.canvas = null;
    this.renderCallback = undefined;
    this.previousFrameTexture = null;
    this.frameBuffer = null;
    this.lastTransform = null;
  }
}