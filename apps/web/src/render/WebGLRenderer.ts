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
    ];

    for (const name of uniformNames) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
      if (this.uniforms[name] === null) {
        console.warn(`Uniform ${name} not found in shader`);
      }
    }
  }

  render(params: RenderParams): void {
    if (!this.gl || !this.program) return;

    const startTime = performance.now();
    const gl = this.gl;

    // Resize if needed
    if (this.canvas!.width !== params.width || this.canvas!.height !== params.height) {
      this.canvas!.width = params.width;
      this.canvas!.height = params.height;
      gl.viewport(0, 0, params.width, params.height);
    }

    gl.useProgram(this.program);

    // Set uniforms
    if (this.uniforms.u_resolution) {
      gl.uniform2f(this.uniforms.u_resolution, params.width, params.height);
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
    }
    
    this.gl = null;
    this.program = null;
    this.vertexBuffer = null;
    this.uniforms = {};
    this.canvas = null;
    this.renderCallback = undefined;
  }
}