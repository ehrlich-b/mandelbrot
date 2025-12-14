/**
 * FrameReprojector - GPU-accelerated frame reprojection for instant pan/zoom
 *
 * When the viewport changes, instead of waiting for new tiles to render,
 * we warp the previous frame to approximate the new view. This gives
 * instant visual feedback while tiles load in the background.
 *
 * The reprojection is a simple 2D texture warp based on viewport transform.
 */

// Vertex shader for fullscreen quad
const REPROJECTION_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_texCoord;

void main() {
    gl_Position = vec4(a_position * 2.0 - 1.0, 0.0, 1.0);
    v_texCoord = a_position;
}
`;

// Fragment shader for reprojection
const REPROJECTION_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_previousFrame;
uniform vec2 u_resolution;

// Previous viewport
uniform vec2 u_prevCenter;
uniform float u_prevScale;

// Current viewport
uniform vec2 u_currCenter;
uniform float u_currScale;

// Blend factor (0 = full reprojection, 1 = full new frame)
uniform float u_blendFactor;

// New frame texture (tiles composited)
uniform sampler2D u_newFrame;
uniform bool u_hasNewFrame;

out vec4 fragColor;

void main() {
    vec2 pixelCoord = v_texCoord * u_resolution;
    float aspect = u_resolution.y / u_resolution.x;

    // Convert current pixel to complex plane coordinates
    vec2 offset = (pixelCoord - u_resolution * 0.5) / u_resolution.x;
    vec2 complexCoord = u_currCenter + offset * u_currScale;

    // Find where this complex coordinate was in the previous frame
    vec2 prevOffset = (complexCoord - u_prevCenter) / u_prevScale * u_resolution.x;
    vec2 prevPixel = prevOffset + u_resolution * 0.5;
    vec2 prevTexCoord = prevPixel / u_resolution;

    // Check if this pixel was visible in the previous frame
    bool wasVisible = prevTexCoord.x >= 0.0 && prevTexCoord.x <= 1.0 &&
                      prevTexCoord.y >= 0.0 && prevTexCoord.y <= 1.0;

    // Sample previous frame with bilinear filtering
    vec4 reprojectedColor = vec4(0.0);
    if (wasVisible) {
        reprojectedColor = texture(u_previousFrame, prevTexCoord);
    }

    // Sample new frame if available
    vec4 newColor = vec4(0.0);
    if (u_hasNewFrame) {
        newColor = texture(u_newFrame, v_texCoord);
    }

    // Blend based on availability
    if (!wasVisible) {
        // Pixel wasn't in previous frame - use new frame or black
        if (u_hasNewFrame) {
            fragColor = newColor;
        } else {
            // Edge fill with dark color (will be replaced by tiles)
            fragColor = vec4(0.05, 0.05, 0.1, 1.0);
        }
    } else if (u_hasNewFrame && u_blendFactor > 0.0) {
        // Blend between reprojected and new
        fragColor = mix(reprojectedColor, newColor, u_blendFactor);
    } else {
        // Just use reprojected
        fragColor = reprojectedColor;
    }
}
`;

interface ReprojectionUniforms {
  u_previousFrame: WebGLUniformLocation | null;
  u_resolution: WebGLUniformLocation | null;
  u_prevCenter: WebGLUniformLocation | null;
  u_prevScale: WebGLUniformLocation | null;
  u_currCenter: WebGLUniformLocation | null;
  u_currScale: WebGLUniformLocation | null;
  u_blendFactor: WebGLUniformLocation | null;
  u_newFrame: WebGLUniformLocation | null;
  u_hasNewFrame: WebGLUniformLocation | null;
}

export interface ViewportParams {
  centerX: number;
  centerY: number;
  scale: number;
  width: number;
  height: number;
}

/**
 * FrameReprojector handles GPU-based frame warping
 */
export class FrameReprojector {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private uniforms: ReprojectionUniforms = {
    u_previousFrame: null,
    u_resolution: null,
    u_prevCenter: null,
    u_prevScale: null,
    u_currCenter: null,
    u_currScale: null,
    u_blendFactor: null,
    u_newFrame: null,
    u_hasNewFrame: null,
  };

  // Geometry
  private vao: WebGLVertexArrayObject | null = null;
  private positionBuffer: WebGLBuffer | null = null;

  // Frame storage
  private previousFrameTexture: WebGLTexture | null = null;
  private previousViewport: ViewportParams | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private renderTexture: WebGLTexture | null = null;

  private initialized = false;

  /**
   * Initialize with a WebGL2 context
   */
  init(gl: WebGL2RenderingContext): void {
    if (this.initialized) return;

    this.gl = gl;
    this.createShaderProgram();
    this.createGeometry();
    this.createFramebuffer();

    this.initialized = true;
    console.log('FrameReprojector initialized');
  }

  private createShaderProgram(): void {
    const gl = this.gl!;

    // Vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, REPROJECTION_VERTEX_SHADER);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      throw new Error('Reprojection vertex shader error: ' + gl.getShaderInfoLog(vertexShader));
    }

    // Fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, REPROJECTION_FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      throw new Error('Reprojection fragment shader error: ' + gl.getShaderInfoLog(fragmentShader));
    }

    // Program
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error('Reprojection program link error: ' + gl.getProgramInfoLog(this.program));
    }

    // Get uniform locations
    this.uniforms = {
      u_previousFrame: gl.getUniformLocation(this.program, 'u_previousFrame'),
      u_resolution: gl.getUniformLocation(this.program, 'u_resolution'),
      u_prevCenter: gl.getUniformLocation(this.program, 'u_prevCenter'),
      u_prevScale: gl.getUniformLocation(this.program, 'u_prevScale'),
      u_currCenter: gl.getUniformLocation(this.program, 'u_currCenter'),
      u_currScale: gl.getUniformLocation(this.program, 'u_currScale'),
      u_blendFactor: gl.getUniformLocation(this.program, 'u_blendFactor'),
      u_newFrame: gl.getUniformLocation(this.program, 'u_newFrame'),
      u_hasNewFrame: gl.getUniformLocation(this.program, 'u_hasNewFrame'),
    };

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }

  private createGeometry(): void {
    const gl = this.gl!;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Fullscreen quad
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

    gl.bindVertexArray(null);
  }

  private createFramebuffer(): void {
    const gl = this.gl!;

    // Create texture for storing previous frame
    this.previousFrameTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.previousFrameTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create framebuffer for capturing current frame
    this.framebuffer = gl.createFramebuffer();
    this.renderTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.renderTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /**
   * Save the current frame for reprojection
   */
  saveFrame(viewport: ViewportParams): void {
    if (!this.gl || !this.previousFrameTexture) return;

    const gl = this.gl;

    // Copy current framebuffer to texture
    gl.bindTexture(gl.TEXTURE_2D, this.previousFrameTexture);
    gl.copyTexImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      0,
      0,
      viewport.width,
      viewport.height,
      0
    );

    this.previousViewport = { ...viewport };
  }

  /**
   * Check if we can reproject (have a previous frame)
   */
  canReproject(): boolean {
    return this.previousViewport !== null;
  }

  /**
   * Get the previous viewport
   */
  getPreviousViewport(): ViewportParams | null {
    return this.previousViewport;
  }

  /**
   * Reproject the previous frame to current viewport
   */
  reproject(
    currentViewport: ViewportParams,
    newFrameTexture: WebGLTexture | null = null,
    blendFactor = 0.0
  ): void {
    if (!this.gl || !this.program || !this.previousViewport) return;

    const gl = this.gl;
    const prev = this.previousViewport;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Set uniforms
    gl.uniform2f(this.uniforms.u_resolution, currentViewport.width, currentViewport.height);
    gl.uniform2f(this.uniforms.u_prevCenter, prev.centerX, prev.centerY);
    gl.uniform1f(this.uniforms.u_prevScale, prev.scale);
    gl.uniform2f(this.uniforms.u_currCenter, currentViewport.centerX, currentViewport.centerY);
    gl.uniform1f(this.uniforms.u_currScale, currentViewport.scale);
    gl.uniform1f(this.uniforms.u_blendFactor, blendFactor);

    // Bind previous frame texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.previousFrameTexture);
    gl.uniform1i(this.uniforms.u_previousFrame, 0);

    // Bind new frame texture if available
    if (newFrameTexture) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, newFrameTexture);
      gl.uniform1i(this.uniforms.u_newFrame, 1);
      gl.uniform1i(this.uniforms.u_hasNewFrame, 1);
    } else {
      gl.uniform1i(this.uniforms.u_hasNewFrame, 0);
    }

    // Draw fullscreen quad
    gl.viewport(0, 0, currentViewport.width, currentViewport.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);
  }

  /**
   * Calculate how much the viewport has changed (for deciding if reprojection is useful)
   * Returns a value 0-1 where 0 = no change, 1 = complete change
   */
  getViewportChangeRatio(currentViewport: ViewportParams): number {
    if (!this.previousViewport) return 1.0;

    const prev = this.previousViewport;

    // Calculate pan distance relative to viewport size
    const panX = Math.abs(currentViewport.centerX - prev.centerX) / currentViewport.scale;
    const panY = Math.abs(currentViewport.centerY - prev.centerY) / currentViewport.scale;
    const panRatio = Math.min(1.0, Math.sqrt(panX * panX + panY * panY));

    // Calculate zoom ratio
    const zoomRatio = Math.abs(Math.log(currentViewport.scale / prev.scale));
    const normalizedZoom = Math.min(1.0, zoomRatio / 2.0); // 2x zoom = full change

    // Combine
    return Math.min(1.0, panRatio + normalizedZoom);
  }

  /**
   * Check if reprojection would be useful for this viewport change
   */
  shouldReproject(currentViewport: ViewportParams): boolean {
    const change = this.getViewportChangeRatio(currentViewport);
    // Reproject if we have something to show and change isn't too drastic
    return this.canReproject() && change < 0.9;
  }

  /**
   * Clear saved frame (e.g., on major state change)
   */
  clearFrame(): void {
    this.previousViewport = null;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

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

    if (this.previousFrameTexture) {
      gl.deleteTexture(this.previousFrameTexture);
      this.previousFrameTexture = null;
    }

    if (this.renderTexture) {
      gl.deleteTexture(this.renderTexture);
      this.renderTexture = null;
    }

    if (this.framebuffer) {
      gl.deleteFramebuffer(this.framebuffer);
      this.framebuffer = null;
    }

    this.gl = null;
    this.initialized = false;
    this.previousViewport = null;

    console.log('FrameReprojector disposed');
  }
}
