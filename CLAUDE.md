# CLAUDE.md - Architecture & Implementation Guide

## Project Philosophy
Build the world's greatest Mandelbrot viewer with:
- **Performance first**: 60+ FPS interaction is non-negotiable
- **Deep zoom capability**: Arbitrary precision using perturbation theory
- **Beautiful rendering**: Anti-aliasing, smooth coloring, distance estimation
- **Cross-platform**: WebGL2 primary, WebGPU experimental, WASM fallback

## Core Architecture Decisions

### Renderer Strategy
**PRIMARY: WebGL2 Fragment Shaders**
- Universal browser support (iOS, Android, all desktop)
- Hardware acceleration everywhere
- Fragment shaders for parallel pixel computation
- Float textures for cached iteration data

**SECONDARY: WebGPU Compute (Experimental)**
- Behind feature flag `--enable-webgpu`
- Compute shaders for better parallelization
- Fallback to WebGL2 when unavailable

**TERTIARY: WASM + SIMD CPU**
- Correctness testing baseline
- Fallback for restricted environments
- Reference implementation for deep zoom

### Deep Zoom Architecture (Perturbation Theory)

The key to infinite zoom is NOT computing everything in arbitrary precision. Instead:

1. **Reference Orbit**: Compute ONE high-precision orbit at viewport center
2. **Delta Orbits**: For each pixel, compute low-precision delta from reference
3. **Series Approximation**: Skip iterations using Taylor series when possible

```typescript
// Conceptual implementation
interface DeepZoomState {
  referenceOrbit: ComplexBig[];      // High precision reference
  referencePoint: ComplexBig;        // Center coordinates
  seriesCoefficients: Complex64[];   // Taylor series terms
  rebaseCheckpoints: number[];       // Iteration points for rebasing
}

// For each pixel:
// δz₀ = pixel_offset (64-bit float)
// δz_{n+1} = 2·z_n·δz_n + δz_n² + δc
// When |δz| > threshold: rebase to new reference
```

### Progressive Rendering Pipeline

```
Frame 0 (0ms): Screen-space reprojection from previous frame
Frame 1 (16ms): Blue-noise stochastic samples (25% coverage)
Frame 2 (33ms): Fill interleaved scanlines (50% coverage)
Frame 3 (50ms): Adaptive refinement in high-gradient areas
Frame 4+ (66ms+): Supersampling where needed
```

### Performance Budgets

| Operation | Target | Maximum |
|-----------|--------|---------|
| First pixel (cold start) | 50ms | 120ms |
| Motion-to-photon latency | 8ms | 16ms |
| Full viewport (1080p) | 150ms | 300ms |
| Full viewport (4K) | 400ms | 700ms |
| Deep zoom rebase | 20ms | 50ms |

### Memory Architecture

```
TileCache (IndexedDB + LRU)
├── MipPyramid (zoom levels)
│   ├── Level 0: 256x256 tiles
│   ├── Level 1: 512x512 tiles
│   └── Level N: ...
├── IterationData (palette-agnostic)
│   ├── mu values (smooth iteration count)
│   ├── distance estimates
│   └── normal vectors
└── Metadata
    ├── viewport bounds
    ├── max iterations
    └── precision level
```

## Implementation Guidelines

### Adding a New Renderer Backend

1. Implement the `RenderBackend` interface:
```typescript
export interface RenderBackend {
  init(canvas: HTMLCanvasElement): Promise<void>;
  render(params: RenderParams): Promise<RenderResult>;
  renderProgressive?(params: RenderParams, quality: number): Promise<RenderResult>;
  dispose(): void;
  readonly capabilities: RendererCapabilities;
}
```

2. Register in `render/engine.ts`:
```typescript
RenderEngine.registerBackend('mybackend', MyBackend);
```

3. Add feature detection in `render/capabilities.ts`

### Writing Shaders

**GLSL Conventions:**
- Use `precision highp float;` always
- Prefix uniforms with `u_`
- Prefix attributes with `a_`
- Prefix varyings with `v_`
- Complex arithmetic in separate functions
- Document precision loss points

**Required Uniforms:**
```glsl
uniform vec2 u_resolution;    // Viewport size
uniform vec2 u_center;         // Complex plane center
uniform float u_scale;         // Zoom scale
uniform int u_maxIterations;   // Iteration limit
```

### Color Palette System

Palettes are keyframed gradients with multiple interpolation modes:

```typescript
interface Palette {
  keyframes: ColorStop[];
  interpolation: 'rgb' | 'hsv' | 'lab' | 'oklch';
  cyclic: boolean;
  histogram?: HistogramParams;
}
```

**Smooth Coloring Formula:**
```
mu = iterations - log2(log2(|z|²))
color = palette.sample(mu)
```

### Testing Requirements

**Unit Tests (Vitest):**
- Complex arithmetic operations
- Perturbation formulas
- Color interpolation
- Tile cache operations

**Visual Tests (Playwright):**
- Golden image comparison (< 1.5 RMS per channel)
- Known coordinates render correctly
- Zoom in/out maintains continuity
- Color palettes apply correctly

**Performance Tests:**
- Measure frame times with Performance API
- Assert 60 FPS during interaction
- Memory usage stays bounded
- Cache hit rates > 80% on zoom-out

### Code Quality Standards

1. **TypeScript Strict Mode**: No `any`, explicit types
2. **No Magic Numbers**: Use named constants
3. **Error Boundaries**: Graceful fallbacks for all failures
4. **Accessibility**: Keyboard navigation, screen reader support
5. **Documentation**: JSDoc for public APIs

### Git Workflow

1. Branch naming: `feature/`, `fix/`, `perf/`, `docs/`
2. Commit format: `type(scope): message`
3. PR requires: passing tests, performance benchmark, visual diff

## Performance Optimization Checklist

- [ ] Use `requestAnimationFrame` with time budgeting
- [ ] Offload computation to Web Workers
- [ ] Implement tile-based rendering for interruption
- [ ] Use `OffscreenCanvas` where available
- [ ] Batch GPU state changes
- [ ] Reuse buffers and textures
- [ ] Implement LOD system for zoom levels
- [ ] Profile with Chrome DevTools Performance tab
- [ ] Test on low-end devices (budget phones)
- [ ] Monitor memory with `performance.memory`

## Security Considerations

1. **No eval() or Function() constructor**
2. **Validate all viewport parameters**
3. **Limit maximum iterations (prevent DoS)**
4. **Sanitize palette imports**
5. **Use Content Security Policy**
6. **No external dependencies for core rendering**

## Debugging Tools

```typescript
// Enable debug mode
window.MANDELBROT_DEBUG = {
  showTileBounds: true,
  showRenderStats: true,
  logGLCalls: true,
  forceCPURenderer: false,
  disableCache: false,
  slowMotion: 1.0,  // Multiplier for animations
};
```

## Known Limitations & Workarounds

1. **iOS Safari WebGL limitations**: Max texture size 4096x4096
   - Solution: Use smaller tiles on iOS

2. **Chrome Android power throttling**: Reduces FPS when not plugged in
   - Solution: Detect and adjust quality dynamically

3. **Firefox BigInt performance**: 10x slower than Chrome
   - Solution: Use WASM arbitrary precision library

4. **Safari WebGL2 missing features**: No compute shaders
   - Solution: Fragment shader workarounds

## Future Architecture Considerations

1. **WebAssembly SIMD**: Will improve CPU fallback by 4-8x
2. **WebGPU Adoption**: Expected 80% support by 2026
3. **SharedArrayBuffer**: For true parallel workers (requires COOP/COEP)
4. **WebCodecs**: For video export of zoom sequences
5. **WebXR**: For VR mandelbrot exploration

## Definition of Done

A feature is complete when:
1. ✅ Renders correctly at all zoom levels
2. ✅ Maintains 60 FPS during interaction
3. ✅ Passes visual regression tests
4. ✅ Works on mobile (touch + gestures)
5. ✅ Gracefully handles errors
6. ✅ Memory usage is bounded
7. ✅ Accessibility features work
8. ✅ Documentation updated

## Claude Code Instructions

### Critical Rules
1. **NEVER commit changes** - Only stage files when explicitly asked to commit
2. **When asked to "reanchor"** - Always re-read ALL anchor documents (CLAUDE.md, TODO.md, package.json, etc.) even if you think you remember them
3. **Anchor documents** - Collectively refers to: CLAUDE.md, TODO.md, package.json, README.md, and any other project configuration files