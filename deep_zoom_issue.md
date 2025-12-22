# Perturbation Rendering Bug - Help Needed

## The Problem

Perturbation theory rendering is implemented and **works in automated tests** but produces **broken output during interactive zooming**.

**What works:**
- Automated test zooms from 1e-5 to 1e-12 scale with 2 second waits between levels
- Each individual zoom level renders correctly when given time

**What's broken:**
- Interactive zooming (mouse wheel) produces:
  - Hopping/jumping between zoom levels
  - No visual continuity with previous frame
  - Psychedelic blobs instead of Mandelbrot structure
  - Random clipping and orientation shifts

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  MandelbrotViewer.ts                                            │
│  - Owns viewport (centerX, centerY, scale)                      │
│  - Calls renderLoop() on requestAnimationFrame                  │
│  - When scale < 5e-6: uses PerturbationRenderer                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PerturbationRenderer.ts                                        │
│  - computeReferenceOrbit(): calls WASM, uploads to GPU texture  │
│  - render(): runs perturbation shader                           │
│  - needsRecompute(): checks if orbit is still valid             │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌───────────────────────┐           ┌───────────────────────────┐
│  ReferenceOrbit.ts    │           │  fragment-perturbation.glsl│
│  (WASM interface)     │           │  (GPU shader)             │
│  - Computes Z_n at    │           │  - Computes δ_n per pixel │
│    viewport center    │           │  - δ' = 2·Z·δ + δ² + δc   │
│  - Arbitrary precision│           │  - Uses float32           │
└───────────────────────┘           └───────────────────────────┘
```

## Key Files

### 1. MandelbrotViewer.ts - Render Loop Integration

Location: `apps/web/src/MandelbrotViewer.ts`

The perturbation logic is in `renderLoop()` around line 540:

```typescript
private renderLoop(): void {
  // ... viewport setup ...

  const PERTURBATION_THRESHOLD = 5e-6;

  if (this.viewport.scale < PERTURBATION_THRESHOLD &&
      this.perturbationRenderer?.isAvailable()) {

    const centerReal = this.viewport.centerX.toPrecision(17);
    const centerImag = this.viewport.centerY.toPrecision(17);

    const existingOrbit = this.perturbationRenderer.getCurrentOrbit();
    const orbitIsValid = existingOrbit && !this.perturbationRenderer.needsRecompute(
      centerReal, centerImag, this.viewport.scale
    );

    if (orbitIsValid) {
      // Orbit is valid - use perturbation rendering
      const perturbViewport: PerturbationViewport = {
        centerReal,
        centerImag,
        scale: this.viewport.scale,
        maxIterations: this.viewport.maxIterations,
      };

      this.perturbationRenderer.render(perturbViewport, this.colorScheme, {
        glitchThreshold: 1e10,  // Disabled
      });
    } else {
      // Orbit is stale - fall back to standard while recomputing
      this.renderer.render({
        centerX: this.viewport.centerX,
        centerY: this.viewport.centerY,
        scale: this.viewport.scale,
        maxIterations: this.viewport.maxIterations,
      });

      // Trigger async recomputation
      this.computePerturbationOrbit();
    }
  } else {
    // Standard rendering for shallow zoom
    this.renderer.render({ ... });
  }
}
```

### 2. PerturbationRenderer.ts - Orchestrator

Location: `apps/web/src/render/PerturbationRenderer.ts`

```typescript
export class PerturbationRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private orbitTexture: WebGLTexture | null = null;
  private currentOrbit: ReferenceOrbitData | null = null;

  /**
   * Compute reference orbit for given viewport
   */
  async computeReferenceOrbit(viewport: PerturbationViewport): Promise<ReferenceOrbitData> {
    const refOrbit = getReferenceOrbit();

    // Check if we need to recompute
    if (this.currentOrbit && !refOrbit.needsRecompute(
      viewport.centerReal,
      viewport.centerImag,
      viewport.scale
    )) {
      return this.currentOrbit;
    }

    // Compute precision limbs based on scale
    const precisionLimbs = this.getPrecisionLimbs(viewport.scale);

    console.log(`Computing reference orbit: center=(${viewport.centerReal}, ${viewport.centerImag}), ` +
      `scale=${viewport.scale}, maxIter=${viewport.maxIterations}, precision=${precisionLimbs} limbs`);

    const startTime = performance.now();
    this.currentOrbit = refOrbit.computeReferenceOrbit(
      viewport.centerReal,
      viewport.centerImag,
      viewport.maxIterations,
      precisionLimbs
    );
    const elapsed = performance.now() - startTime;
    console.log(`Reference orbit computed in ${elapsed.toFixed(1)}ms, length=${this.currentOrbit.length}`);

    // Upload to GPU texture
    this.uploadOrbitTexture();

    return this.currentOrbit;
  }

  /**
   * Check if orbit needs recomputation for given viewport
   */
  needsRecompute(centerReal: string, centerImag: string, scale: number): boolean {
    return getReferenceOrbit().needsRecompute(centerReal, centerImag, scale);
  }

  /**
   * Render using perturbation theory
   */
  render(viewport: PerturbationViewport, colorScheme: number, options: {...}): void {
    if (!this.gl || !this.program || !this.currentOrbit || !this.orbitTexture) {
      console.warn('PerturbationRenderer not ready');
      return;
    }

    const gl = this.gl;
    gl.useProgram(this.program);

    // Set uniforms
    setUniform('u_resolution', [gl.canvas.width, gl.canvas.height]);
    setUniform('u_maxIterations', viewport.maxIterations);
    setUniform('u_colorScheme', colorScheme);
    setUniform('u_orbitLength', this.currentOrbit.length);
    setUniform('u_referenceEscapeIter', this.currentOrbit.escapeIteration);

    // Reference point (where orbit was computed)
    setUniform('u_referencePoint', [
      parseFloat(viewport.centerReal),
      parseFloat(viewport.centerImag),
    ]);

    // Pixel delta: scale / resolution = complex units per pixel
    const pixelDeltaX = viewport.scale / gl.canvas.width;
    const pixelDeltaY = viewport.scale / gl.canvas.height;
    setUniform('u_pixelDelta', [pixelDeltaX, pixelDeltaY]);

    // Bind orbit texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.orbitTexture);

    // Draw fullscreen triangle
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Upload reference orbit to GPU texture
   * Format: RGBA32F, each texel = (Z.re, Z.im, |Z|², 0)
   */
  private uploadOrbitTexture(): void {
    if (!this.gl || !this.currentOrbit) return;

    const orbitLen = this.currentOrbit.length + 1;
    this.orbitTextureWidth = Math.min(orbitLen, 8192);
    this.orbitTextureHeight = Math.ceil(orbitLen / this.orbitTextureWidth);

    const data = new Float32Array(this.orbitTextureWidth * this.orbitTextureHeight * 4);

    for (let i = 0; i < orbitLen; i++) {
      const re = this.currentOrbit.orbitReal[i];
      const im = this.currentOrbit.orbitImag[i];
      data[i * 4 + 0] = re;
      data[i * 4 + 1] = im;
      data[i * 4 + 2] = re * re + im * im;  // |Z|²
      data[i * 4 + 3] = 0;
    }

    gl.bindTexture(gl.TEXTURE_2D, this.orbitTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F,
      this.orbitTextureWidth, this.orbitTextureHeight, 0,
      gl.RGBA, gl.FLOAT, data);
  }
}
```

### 3. ReferenceOrbit.ts - WASM Interface

Location: `apps/web/src/wasm/ReferenceOrbit.ts`

```typescript
export interface ReferenceOrbitData {
  orbitReal: Float64Array;      // Z_n.re for n = 0..length
  orbitImag: Float64Array;      // Z_n.im for n = 0..length
  length: number;               // Number of iterations before escape (or maxIter)
  escapeIteration: number;      // When reference escaped (-1 if bounded)
  centerReal: string;           // Original center coordinate (string for precision)
  centerImag: string;
  scale: number;                // Scale at which orbit was computed
}

class ReferenceOrbitCalculator {
  private currentOrbit: ReferenceOrbitData | null = null;

  /**
   * Check if we need to recompute for new viewport
   */
  needsRecompute(newCenterReal: string, newCenterImag: string, scale: number): boolean {
    if (!this.currentOrbit) return true;

    // Check if center changed
    if (this.currentOrbit.centerReal !== newCenterReal ||
        this.currentOrbit.centerImag !== newCenterImag) {

      // Parse to float64 for distance check
      const curRe = parseFloat(this.currentOrbit.centerReal);
      const curIm = parseFloat(this.currentOrbit.centerImag);
      const newRe = parseFloat(newCenterReal);
      const newIm = parseFloat(newCenterImag);

      const dx = Math.abs(curRe - newRe);
      const dy = Math.abs(curIm - newIm);

      // If float64 can't distinguish, but strings differ - precision limit hit
      if (dx === 0 && dy === 0) {
        return true;  // Beyond float64 precision, definitely recompute
      }

      // If offset > 10% of viewport, recompute
      if (dx > scale * 0.1 || dy > scale * 0.1) {
        return true;
      }
    }

    // Check if scale changed significantly
    const scaleRatio = scale / this.currentOrbit.scale;
    if (scaleRatio < 0.5 || scaleRatio > 2.0) {
      return true;
    }

    return false;
  }

  /**
   * Compute reference orbit using WASM arbitrary precision
   */
  computeReferenceOrbit(
    centerReal: string,
    centerImag: string,
    maxIterations: number,
    precisionLimbs: number
  ): ReferenceOrbitData {
    // ... WASM calls to compute orbit at arbitrary precision ...
    // Returns Float64Array of orbit values
  }
}
```

### 4. fragment-perturbation.glsl - GPU Shader

Location: `apps/web/src/render/shaders/fragment-perturbation.glsl`

```glsl
#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform int u_maxIterations;
uniform int u_colorScheme;

// Reference orbit texture
uniform sampler2D u_referenceOrbit;
uniform int u_orbitTextureWidth;
uniform int u_orbitTextureHeight;
uniform int u_orbitLength;
uniform int u_referenceEscapeIter;

// Viewport parameters
uniform vec2 u_referencePoint;  // Where the orbit was computed
uniform vec2 u_pixelDelta;      // Complex units per pixel

out vec4 fragColor;

// Complex multiplication
vec2 complex_mul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Complex square
vec2 complex_sqr(vec2 z) {
  return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
}

// Fetch reference orbit value at iteration n
vec4 getOrbitValue(int n) {
  int x = n % u_orbitTextureWidth;
  int y = n / u_orbitTextureWidth;
  vec2 uv = (vec2(x, y) + 0.5) / vec2(u_orbitTextureWidth, u_orbitTextureHeight);
  return texture(u_referenceOrbit, uv);
}

void main() {
  // Pixel offset from center of screen
  vec2 pixelOffset = gl_FragCoord.xy - u_resolution * 0.5;

  // deltaC = offset from reference point in complex plane
  // Using pixelDelta.y (scale/height) for both axes preserves aspect ratio
  vec2 deltaC = pixelOffset * u_pixelDelta.y;

  // Initialize delta
  vec2 delta = vec2(0.0);

  // Maximum iterations (bounded by orbit length)
  int maxIter = min(u_maxIterations, u_orbitLength);
  if (u_referenceEscapeIter > 0 && u_referenceEscapeIter < maxIter) {
    maxIter = u_referenceEscapeIter;
  }

  // Perturbation iteration
  for (int i = 0; i < 8192; i++) {
    if (i >= maxIter) break;

    // Fetch reference orbit value: (Z.re, Z.im, |Z|², 0)
    vec4 orbitVal = getOrbitValue(i);
    vec2 Z = orbitVal.xy;

    // Perturbation formula: δ' = 2·Z·δ + δ² + δc
    delta = 2.0 * complex_mul(Z, delta) + complex_sqr(delta) + deltaC;

    // Full coordinate for escape check
    vec2 z = Z + delta;
    float r2 = dot(z, z);

    if (r2 > 16.0) {
      // Smooth iteration count
      float log_zn = log(r2) * 0.5;
      float nu = log(log_zn / log(2.0)) / log(2.0);
      float mu = float(i) + 1.0 - nu;

      // Scale mu to spread colors (perturbation often escapes faster)
      mu = mu * 5.0;

      vec3 color = getColor(mu, u_colorScheme);
      fragColor = vec4(color, 1.0);
      return;
    }
  }

  // Interior point (didn't escape)
  fragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
```

## The Bug

**Symptom:** When zooming interactively with mouse wheel, the image:
1. Jumps/hops between frames
2. Shows completely different fractal structure than expected
3. Has no visual continuity with the previous frame
4. Sometimes shows psychedelic blobs or wrong colors

**But:** When zooming in discrete steps with 2 second pauses (like the automated test), each frame renders correctly.

## Hypotheses

### 1. Race Condition: Stale Orbit Used for New Viewport

The orbit is computed async. When viewport changes rapidly:
1. Frame N: viewport at scale 1e-6, orbit valid, renders correctly
2. Frame N+1: viewport at scale 5e-7, orbit still for 1e-6 scale
3. Render uses old orbit with new viewport → garbage

**Current mitigation:** Check `needsRecompute()` before rendering. If stale, fall back to standard renderer while recomputing.

**Problem:** Standard renderer also looks bad at deep zoom. And the new orbit might complete mid-frame or be used for the wrong viewport.

### 2. Coordinate Drift During Mouse Zoom

Mouse wheel zoom multiplies scale and adjusts center. Float64 accumulation errors could cause:
- Center coordinates that don't match where orbit was computed
- deltaC calculation produces wrong offsets

### 3. u_referencePoint vs Actual Orbit Center

The shader receives `u_referencePoint` as a vec2 (float32). But:
- Orbit was computed at string coordinates like "-0.74364388703715870"
- Uniform is set with `parseFloat(viewport.centerReal)` → loses precision
- deltaC is relative to u_referencePoint, not actual orbit center

At deep zoom, this precision loss could be catastrophic.

### 4. Orbit Texture Not Updated

The orbit texture upload might not complete before render. WebGL is async - texture data might not be on GPU when shader runs.

## Reproduction

```bash
cd /home/behrlich/repos/mandelbrot
npm run dev
# Open http://localhost:5173

# In browser console:
mandelbrot.setViewport({
  centerX: -0.7436438870371587,
  centerY: 0.13182590420531197,
  scale: 1e-5,
  maxIterations: 500
});

# Now use mouse wheel to zoom in continuously
# Watch for hopping, discontinuity, and garbage rendering
```

**Automated test that works:**
```bash
npx playwright test tests/e2e/perturb-zoom-sequence.spec.ts
# This waits 2 seconds between zoom levels and passes
```

## What I've Tried

1. ✅ Fixed deltaC calculation in shader (was completely wrong)
2. ✅ Added `needsRecompute()` checks before rendering
3. ✅ Fixed coordinate precision with `.toPrecision(17)`
4. ✅ Added fallback to standard renderer while orbit recomputes
5. ❌ None of these fixed interactive zooming

## Questions for Investigation

1. **Is the orbit being used before it's ready?** Add more logging to see exactly when orbit is computed vs when render uses it.

2. **Is u_referencePoint matching the actual orbit center?** The uniform is float32, orbit is arbitrary precision. Is precision loss here the issue?

3. **Does the texture upload complete before the draw call?** WebGL is async. Maybe need gl.finish() or explicit sync.

4. **Is the viewport changing between needsRecompute() check and render()?** requestAnimationFrame might allow state changes between.

5. **Should we block rendering until orbit is valid?** Instead of falling back to broken standard renderer, show a loading state.
