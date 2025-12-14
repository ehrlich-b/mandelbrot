/**
 * TileCompositor - GPU-accelerated tile compositing
 *
 * Takes iteration data from tiles and renders them to the screen
 * with color palettes applied via shader.
 */

import {
  Tile,
  TileCoord,
  TileConfig,
  TileViewport,
  DEFAULT_TILE_CONFIG,
  getTileKey,
  tileToComplex,
} from './types';

// Vertex shader for tile compositing
const COMPOSITOR_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

uniform vec2 u_resolution;
uniform vec4 u_tileBounds; // x, y, width, height in screen pixels

out vec2 v_texCoord;

void main() {
    // Transform from tile local coords (0-1) to screen position
    vec2 screenPos = u_tileBounds.xy + a_position * u_tileBounds.zw;

    // Convert to clip space (-1 to 1)
    vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
    clipPos.y = -clipPos.y; // Flip Y for WebGL

    gl_Position = vec4(clipPos, 0.0, 1.0);
    v_texCoord = a_texCoord;
}
`;

// Fragment shader for applying color palette to iteration data
const COMPOSITOR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_iterationTexture;
uniform float u_maxIterations;
uniform int u_colorScheme;
uniform float u_colorOffset;
uniform float u_colorScale;

out vec4 fragColor;

// Color palette functions (same as main shader)
vec3 palette0(float t) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.1, 0.2)));
}

vec3 palette1(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.0, 0.33, 0.67);
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette2(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d = vec3(0.0, 0.1, 0.2);
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette3(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 0.7, 0.4);
    vec3 d = vec3(0.0, 0.15, 0.2);
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette4(float t) {
    vec3 a = vec3(0.8, 0.5, 0.4);
    vec3 b = vec3(0.2, 0.4, 0.2);
    vec3 c = vec3(2.0, 1.0, 1.0);
    vec3 d = vec3(0.0, 0.25, 0.25);
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette5(float t) {
    vec3 c1 = vec3(0.0, 0.0, 0.2);
    vec3 c2 = vec3(0.0, 0.4, 0.8);
    vec3 c3 = vec3(1.0, 0.9, 0.5);
    vec3 c4 = vec3(1.0, 0.5, 0.0);
    float phase = fract(t * 4.0);
    int segment = int(floor(t * 4.0)) % 4;
    if (segment == 0) return mix(c1, c2, phase);
    if (segment == 1) return mix(c2, c3, phase);
    if (segment == 2) return mix(c3, c4, phase);
    return mix(c4, c1, phase);
}

vec3 palette6(float t) {
    return vec3(t, t, t);
}

vec3 palette7(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(1.0, 1.0, 0.5);
    vec3 d = vec3(0.8, 0.9, 0.3);
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette8(float t) {
    vec3 a = vec3(0.5, 0.5, 0.5);
    vec3 b = vec3(0.5, 0.5, 0.5);
    vec3 c = vec3(2.0, 1.0, 0.0);
    vec3 d = vec3(0.5, 0.2, 0.25);
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette9(float t) {
    vec3 a = vec3(0.66, 0.56, 0.68);
    vec3 b = vec3(0.72, 0.73, 0.48);
    vec3 c = vec3(0.83, 0.51, 1.14);
    vec3 d = vec3(1.97, 1.69, 1.06);
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 palette10(float t) {
    vec3 a = vec3(0.26, 0.45, 0.57);
    vec3 b = vec3(0.23, 0.38, 0.15);
    vec3 c = vec3(0.83, 0.73, 0.58);
    vec3 d = vec3(4.47, 5.15, 3.85);
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 getColor(float t, int scheme) {
    t = fract(t);
    if (scheme == 0) return palette0(t);
    if (scheme == 1) return palette1(t);
    if (scheme == 2) return palette2(t);
    if (scheme == 3) return palette3(t);
    if (scheme == 4) return palette4(t);
    if (scheme == 5) return palette5(t);
    if (scheme == 6) return palette6(t);
    if (scheme == 7) return palette7(t);
    if (scheme == 8) return palette8(t);
    if (scheme == 9) return palette9(t);
    if (scheme == 10) return palette10(t);
    return palette0(t);
}

void main() {
    // Sample iteration value from texture (stored in R channel)
    float mu = texture(u_iterationTexture, v_texCoord).r;

    // Interior points (mu < 0)
    if (mu < 0.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Apply color mapping
    float t = (mu * u_colorScale + u_colorOffset) / u_maxIterations;
    vec3 color = getColor(t, u_colorScheme);

    fragColor = vec4(color, 1.0);
}
`;

interface CompositorUniforms {
  u_resolution: WebGLUniformLocation | null;
  u_tileBounds: WebGLUniformLocation | null;
  u_iterationTexture: WebGLUniformLocation | null;
  u_maxIterations: WebGLUniformLocation | null;
  u_colorScheme: WebGLUniformLocation | null;
  u_colorOffset: WebGLUniformLocation | null;
  u_colorScale: WebGLUniformLocation | null;
}

/**
 * GPU tile cache entry
 */
interface GPUCacheEntry {
  texture: WebGLTexture;
  tile: Tile;
  lastUsed: number;
}

/**
 * TileCompositor renders tiles to the screen
 */
export class TileCompositor {
  private gl: WebGL2RenderingContext | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private config: TileConfig;

  // Shader program
  private program: WebGLProgram | null = null;
  private uniforms: CompositorUniforms = {
    u_resolution: null,
    u_tileBounds: null,
    u_iterationTexture: null,
    u_maxIterations: null,
    u_colorScheme: null,
    u_colorOffset: null,
    u_colorScale: null,
  };

  // Geometry
  private vao: WebGLVertexArrayObject | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  // GPU tile cache (L1)
  private gpuCache = new Map<string, GPUCacheEntry>();
  private gpuCacheOrder: string[] = [];

  constructor(config: Partial<TileConfig> = {}) {
    this.config = { ...DEFAULT_TILE_CONFIG, ...config };
  }

  /**
   * Get the canvas element
   */
  get canvas(): HTMLCanvasElement | null {
    return this._canvas;
  }

  /**
   * Initialize the compositor with a canvas
   */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    this._canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!this.gl) {
      throw new Error('WebGL2 not supported');
    }

    this.createShaderProgram();
    this.createGeometry();

    console.log('TileCompositor initialized');
  }

  /**
   * Create shader program
   */
  private createShaderProgram(): void {
    const gl = this.gl!;

    // Create vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, COMPOSITOR_VERTEX_SHADER);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      throw new Error(
        'Vertex shader compilation failed: ' + gl.getShaderInfoLog(vertexShader)
      );
    }

    // Create fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, COMPOSITOR_FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      throw new Error(
        'Fragment shader compilation failed: ' + gl.getShaderInfoLog(fragmentShader)
      );
    }

    // Create program
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(
        'Shader program linking failed: ' + gl.getProgramInfoLog(this.program)
      );
    }

    // Get uniform locations
    this.uniforms = {
      u_resolution: gl.getUniformLocation(this.program, 'u_resolution'),
      u_tileBounds: gl.getUniformLocation(this.program, 'u_tileBounds'),
      u_iterationTexture: gl.getUniformLocation(this.program, 'u_iterationTexture'),
      u_maxIterations: gl.getUniformLocation(this.program, 'u_maxIterations'),
      u_colorScheme: gl.getUniformLocation(this.program, 'u_colorScheme'),
      u_colorOffset: gl.getUniformLocation(this.program, 'u_colorOffset'),
      u_colorScale: gl.getUniformLocation(this.program, 'u_colorScale'),
    };

    // Clean up
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }

  /**
   * Create geometry for tile rendering
   */
  private createGeometry(): void {
    const gl = this.gl!;

    // Create VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Position buffer (unit quad)
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLoc = gl.getAttribLocation(this.program!, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture coordinate buffer
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW
    );

    const texCoordLoc = gl.getAttribLocation(this.program!, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  /**
   * Get or create GPU texture for a tile
   */
  private getOrCreateTexture(tile: Tile): WebGLTexture {
    const gl = this.gl!;
    const key = getTileKey(tile.coord, tile.maxIterations);

    // Check cache
    let entry = this.gpuCache.get(key);
    if (entry) {
      entry.lastUsed = performance.now();
      // Move to end of order
      const index = this.gpuCacheOrder.indexOf(key);
      if (index > -1) {
        this.gpuCacheOrder.splice(index, 1);
      }
      this.gpuCacheOrder.push(key);
      return entry.texture;
    }

    // Evict if at capacity
    while (this.gpuCache.size >= this.config.l1CacheSize && this.gpuCacheOrder.length > 0) {
      const oldKey = this.gpuCacheOrder.shift()!;
      const oldEntry = this.gpuCache.get(oldKey);
      if (oldEntry) {
        gl.deleteTexture(oldEntry.texture);
        this.gpuCache.delete(oldKey);
      }
    }

    // Create new texture
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Upload iteration data as R32F texture
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      tile.size,
      tile.size,
      0,
      gl.RED,
      gl.FLOAT,
      tile.iterations
    );

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Cache it
    entry = { texture, tile, lastUsed: performance.now() };
    this.gpuCache.set(key, entry);
    this.gpuCacheOrder.push(key);

    return texture;
  }

  /**
   * Calculate screen bounds for a tile
   */
  private getTileScreenBounds(
    coord: TileCoord,
    viewport: TileViewport
  ): { x: number; y: number; width: number; height: number } {
    const complex = tileToComplex(coord, this.config);
    const tileScale = complex.scale;

    // Convert complex plane coordinates to screen pixels
    const aspect = viewport.height / viewport.width;
    const halfWidth = viewport.scale / 2;
    const halfHeight = halfWidth * aspect;

    // Tile corners in complex plane
    const tileLeft = complex.centerReal - tileScale / 2;
    const tileTop = complex.centerImag + tileScale / 2;

    // Viewport bounds
    const viewLeft = viewport.centerX - halfWidth;
    const viewTop = viewport.centerY + halfHeight;

    // Convert to screen pixels
    const pixelsPerUnit = viewport.width / viewport.scale;

    const screenX = (tileLeft - viewLeft) * pixelsPerUnit;
    const screenY = (viewTop - tileTop) * pixelsPerUnit;
    const screenWidth = tileScale * pixelsPerUnit;
    const screenHeight = tileScale * pixelsPerUnit;

    return { x: screenX, y: screenY, width: screenWidth, height: screenHeight };
  }

  /**
   * Composite tiles onto the screen
   */
  composite(
    tiles: Tile[],
    viewport: TileViewport,
    colorParams: {
      colorScheme: number;
      colorOffset: number;
      colorScale: number;
    }
  ): void {
    const gl = this.gl!;

    // Set viewport
    gl.viewport(0, 0, viewport.width, viewport.height);

    // Clear
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (tiles.length === 0) return;

    // Use program
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Set common uniforms
    gl.uniform2f(this.uniforms.u_resolution, viewport.width, viewport.height);
    gl.uniform1f(this.uniforms.u_maxIterations, viewport.maxIterations);
    gl.uniform1i(this.uniforms.u_colorScheme, colorParams.colorScheme);
    gl.uniform1f(this.uniforms.u_colorOffset, colorParams.colorOffset);
    gl.uniform1f(this.uniforms.u_colorScale, colorParams.colorScale);

    // Enable blending for smooth transitions
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Draw each tile
    for (const tile of tiles) {
      if (tile.status !== 'complete' || tile.iterations.length === 0) {
        continue;
      }

      const texture = this.getOrCreateTexture(tile);
      const bounds = this.getTileScreenBounds(tile.coord, viewport);

      // Skip if completely off-screen
      if (
        bounds.x + bounds.width < 0 ||
        bounds.x > viewport.width ||
        bounds.y + bounds.height < 0 ||
        bounds.y > viewport.height
      ) {
        continue;
      }

      // Bind texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.uniforms.u_iterationTexture, 0);

      // Set tile bounds
      gl.uniform4f(
        this.uniforms.u_tileBounds,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height
      );

      // Draw
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /**
   * Clear GPU cache
   */
  clearCache(): void {
    const gl = this.gl;
    if (!gl) return;

    for (const entry of this.gpuCache.values()) {
      gl.deleteTexture(entry.texture);
    }
    this.gpuCache.clear();
    this.gpuCacheOrder = [];
  }

  /**
   * Get GPU cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; memoryUsage: number } {
    let memoryUsage = 0;
    for (const entry of this.gpuCache.values()) {
      // R32F = 4 bytes per pixel
      memoryUsage += entry.tile.size * entry.tile.size * 4;
    }

    return {
      size: this.gpuCache.size,
      maxSize: this.config.l1CacheSize,
      memoryUsage,
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    this.clearCache();

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }

    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    if (this.positionBuffer) {
      gl.deleteBuffer(this.positionBuffer);
      this.positionBuffer = null;
    }

    if (this.texCoordBuffer) {
      gl.deleteBuffer(this.texCoordBuffer);
      this.texCoordBuffer = null;
    }

    this.gl = null;
    this._canvas = null;

    console.log('TileCompositor disposed');
  }
}
