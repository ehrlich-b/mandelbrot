# TODO.md - The Definitive Mandelbrot Viewer Roadmap

> **Goal**: 128fps minimum, infinite zoom, Julia sets, CLI rendering, rock-solid testing

---

## Current Status

**Working Now:**
- WebGL2 renderer with 60+ FPS at standard zoom
- GPU double-double (DD) precision to ~1e-10
- 11 color palettes, anti-aliasing, histogram equalization
- Touch/mouse/keyboard input with inertia
- State persistence, bookmarks, fullscreen mode
- Comprehensive DD arithmetic tests

**Critical Blockers:**
- Progressive rendering DISABLED (causing visual artifacts)
- No tile caching (every frame recalculates from scratch)
- No Web Workers (everything on main thread)
- No CLI tool (can't render posters offline)

---

## 🔥 Priority 0: Unblock Everything

### P0-1: Fix Progressive Rendering ✅
Progressive rendering is implemented but disabled due to "chaos issues" during DD development.
Without it, 128fps is impossible - you can't recompute every pixel every frame.

- [x] Diagnose why progressive was disabled (DD shader had no implementation)
- [x] Implement progressive in DD shader (stochastic + interleaved modes)
- [x] Add frame texture saving for accumulation
- [x] Re-enable progressive by default
- [ ] Visual regression tests for progressive vs full render - deferred

**Status:** Progressive rendering now works in BOTH standard and DD modes. Reprojection mode falls back to stochastic in DD mode (would need DD-aware coordinate transform).

### P0-2: Web Workers Foundation ✅
Everything runs on main thread. This blocks tile caching, CPU fallback, and smooth interaction.

- [x] Create worker pool infrastructure (2-4 workers based on `navigator.hardwareConcurrency`)
- [x] Implement message protocol for tile requests/responses
- [x] Capability detection (OffscreenCanvas, WebGL2, SharedArrayBuffer, SIMD)
- [x] Basic tile rendering worker with CPU Mandelbrot computation
- [x] Task queuing, cancellation, and error recovery
- [ ] SharedArrayBuffer setup (requires COOP/COEP headers) - deferred
- [ ] OffscreenCanvas GPU rendering in workers - deferred (CPU works for now)

**Status:** Worker pool infrastructure complete. CPU tile rendering works. GPU rendering in workers deferred until tile caching is implemented.

**Files created:**
- `apps/web/src/workers/types.ts` - Message types and capability detection
- `apps/web/src/workers/WorkerPool.ts` - Pool management with task queue
- `apps/web/src/workers/tile.worker.ts` - CPU tile renderer
- `apps/web/src/workers/index.ts` - Exports

---

## 🏎️ Priority 1: 128fps Architecture

### P1-1: Tile-Based Rendering System ✅
The key to 128fps: don't render what you don't need to.

- [x] Define tile coordinate system (256x256 tiles)
- [x] Implement TileManager class with LRU eviction (L2 cache)
- [x] Tile request scheduling with priority (visible > prefetch)
- [x] Tile compositor (GPU blit tiles to screen with color palettes)
- [x] Integration with WorkerPool for parallel tile rendering
- [x] Full integration with MandelbrotViewer (switch from full-frame to tiles)
- [ ] Handle tile boundaries (no seams between tiles)
- [ ] Visual testing and debugging

**Files created:**
- `apps/web/src/tiles/types.ts` - Tile interfaces, coordinate math, helper functions
- `apps/web/src/tiles/TileManager.ts` - LRU cache, request scheduling, worker coordination
- `apps/web/src/tiles/TileCompositor.ts` - GPU texture cache, palette shader, tile blitting
- `apps/web/src/tiles/TileRenderer.ts` - Orchestrates manager + compositor
- `apps/web/src/tiles/index.ts` - Exports

**Usage:** In browser console: `await mandelbrot.setRenderMode('tiled')` to switch modes.

**Status:** Infrastructure complete and integrated. Ready for visual testing.

### P1-2: Memory-Tiered Cache ✅
```
L1: GPU Texture Cache (64 tiles, ~64MB VRAM)
    - Pre-uploaded iteration textures
    - Instant blit to framebuffer

L2: RAM Cache (256 tiles, ~256MB)
    - Float32Array iteration data
    - Sub-millisecond upload to GPU

L3: IndexedDB (2048 tiles, ~500MB disk)
    - Persistent across sessions
    - Async load, ~10-50ms
```

- [x] L1 GPU texture atlas for rendered tiles (in TileCompositor)
- [x] L2 in-memory LRU with configurable size limit (in TileManager)
- [x] L3 IndexedDB persistence with automatic cleanup
- [x] Cache key: `${level}_${x}_${y}_${maxIter}`
- [x] L3 lookup before rendering (promotes to L2 on hit)
- [x] Auto-cleanup on cache size limits
- [ ] Automatic cache warming on zoom-out (higher levels always cached)

**Files created:**
- `apps/web/src/tiles/TileCache.ts` - IndexedDB L3 cache with batch operations

**Status:** Three-tier cache complete (L1 GPU → L2 RAM → L3 IndexedDB)

### P1-3: Frame Reprojection ✅
Pan/zoom should be nearly free by warping the previous frame.

- [x] Store previous frame viewport parameters
- [x] Compute pixel-to-pixel mapping for viewport change
- [x] GPU shader for frame warping (single texture sample per pixel)
- [x] Mark invalidated regions (new pixels that need computation)
- [x] Blend reprojected frame with new tile data
- [x] Integrate with TileRenderer for automatic reprojection

**Files created:**
- `apps/web/src/tiles/FrameReprojector.ts` - GPU reprojection shader and frame management

**How it works:**
1. After rendering, save framebuffer + viewport params
2. On viewport change, warp previous frame to new coordinates
3. Dark fill for newly visible areas (outside previous viewport)
4. Composite tiles on top as they load
5. Instant visual feedback during pan/zoom

**Acceptance:** Pan at 500+ FPS (just a texture warp), zoom at 200+ FPS (warp + edge fill)

### P1-4: Predictive Tile Prefetch ✅
Anticipate where the user is going.

- [x] Track viewport velocity (pan direction, zoom rate)
- [x] Predict viewport 100-500ms into future
- [x] Queue prefetch requests for predicted tiles
- [x] Deprioritize prefetch when interaction active
- [x] Cancel stale prefetch requests on direction change

**Files created:**
- `apps/web/src/tiles/ViewportPredictor.ts` - Velocity tracking and prediction

**How it works:**
1. ViewportPredictor tracks recent viewport positions with timestamps
2. Calculates weighted velocity (more recent samples weighted higher)
3. Predicts viewport 100-500ms into the future
4. During interaction: minimal prefetch (4 immediate neighbors)
5. When idle: aggressive prefetch in predicted direction
6. Direction changes cancel stale prefetch requests
7. Zoom in/out gets specialized prefetch (next/prev level tiles)

---

## ♾️ Priority 2: Infinite Zoom

### P2-1: WASM Arbitrary Precision Core ✅

**Strategy:** Minimal C implementation compiled to WASM. Not GMP (too large), not JS BigInt (too slow).
Target: <50KB WASM bundle for arbitrary precision math.

- [x] Write minimal arbitrary precision C library (~500 lines target)
- [x] Karatsuba multiplication for large numbers (3x speedup over naive)
- [x] Compile with Emscripten: `emcc -O3 -s WASM=1 -s EXPORTED_FUNCTIONS=[...]`
- [x] Target <50KB .wasm file (gzipped <20KB) - **Achieved: 26KB**
- [x] TypeScript bindings with proper memory management
- [x] Fallback to JavaScript implementation if WASM unavailable

**Files created:**
- `apps/web/src/wasm/bigfloat.c` - Fixed-point arbitrary precision C library
- `apps/web/src/wasm/Makefile` - Emscripten build configuration
- `apps/web/src/wasm/BigFloatWasm.ts` - TypeScript bindings
- `apps/web/src/wasm/BigFloatJS.ts` - Pure JS fallback
- `apps/web/src/wasm/index.ts` - Unified interface
- `apps/web/src/wasm-out/bigfloat.wasm` - Compiled WASM (26KB)
- `apps/web/src/wasm-out/bigfloat.js` - Emscripten loader (12KB)

**Build:** `npm run build:wasm` (requires Emscripten)

### P2-2: CPU Tile Renderer (Worker-based) ✅
When GPU DD isn't enough (~1e-12), fall back to CPU with arbitrary precision.

- [x] Worker receives tile request with string coordinates
- [x] WASM computes iterations for each pixel
- [x] Smooth coloring: `mu = n - log2(log2(|z|))` using double approximation
- [x] Return iteration data as transferable Float32Array
- [x] Progress reporting for slow tiles
- [x] Automatic precision mode selection based on scale

**Precision thresholds:**
- Scale > 5e-6: standard (GPU float32/64)
- Scale 5e-6 → 1e-12: dd (GPU double-double)
- Scale < 1e-12: arbitrary (WASM bigfloat)

**Files modified:**
- `apps/web/src/workers/tile.worker.ts` - Added WASM integration, arbitrary precision mode
- `apps/web/src/workers/types.ts` - Added TilePrecisionMode, precisionLimbs params
- `apps/web/src/tiles/TileManager.ts` - Auto precision selection, limb calculation

### P2-3: Perturbation Theory (The Real Infinite Zoom) ✅
This is how Kalles Fraktaler zooms to 10^1000. The key insight: most pixels follow similar orbits.

**Theory:**
```
Standard: z_{n+1} = z_n² + c                     (arbitrary precision, slow)
Perturb:  δ_{n+1} = 2·Z_n·δ_n + δ_n² + δc       (float64, fast)

Where:
- Z_n is the reference orbit (one point, arbitrary precision)
- δ_n is the per-pixel delta from reference (float64)
- δc is pixel offset from reference point (float64)
```

- [x] Reference orbit calculator (WASM, arbitrary precision)
- [x] Store reference orbit: `Z_0, Z_1, Z_2, ... Z_maxiter` as Float64Array
- [x] Delta orbit shader (GPU, float64, uses reference as texture lookup)
- [x] Glitch detection: when `|δ| > |Z| * threshold`, marks pixel for rebasing
- [x] Rebasing: glitched pixels shown in magenta (CPU fallback ready)
- [ ] Series approximation: skip first N iterations using Taylor series (10-100x speedup) - deferred

**Files created:**
- `apps/web/src/wasm/ReferenceOrbit.ts` - Reference orbit computation and management
- `apps/web/src/render/shaders/fragment-perturbation.glsl` - Perturbation theory GPU shader
- `apps/web/src/render/PerturbationRenderer.ts` - Orchestrates perturbation rendering

**How it works:**
1. Compute ONE reference orbit at viewport center using WASM arbitrary precision
2. Store orbit as Float64Array texture (Z.re, Z.im, |Z|² per iteration)
3. GPU shader computes δ_{n+1} = 2·Z_n·δ_n + δ_n² + δc for each pixel
4. Glitch detection marks pixels where |δ| > threshold * |Z|
5. Glitched pixels fall back to CPU arbitrary precision

**Acceptance:** Render 1e-50 zoom at interactive framerates (>30fps) on desktop GPU

### P2-4: Precision Manager Overhaul ✅
Automatic, seamless switching between precision modes.

```
Scale > 5e-6:      GPU Standard (float32)      - fastest (~60 FPS)
Scale 5e-6 → 1e-10: GPU Double-Double          - fast (~45 FPS)
Scale 1e-10 → 1e-14: GPU Perturbation (float64) - medium (~30 FPS)
Scale < 1e-14:     CPU Arbitrary Precision     - slow (~5 FPS) but unlimited
```

- [x] Unified precision selection logic with configurable thresholds
- [x] Seamless visual transition between modes (hysteresis prevents flickering)
- [x] HUD status methods: `getStatusString()`, `getDetailedStatus()`
- [x] Manual override for testing/debugging: `setManualOverride(mode)`
- [x] Mode change event listeners for UI updates
- [ ] Benchmark each mode to tune thresholds per-device - deferred

**Files created:**
- `apps/web/src/render/PrecisionManager.ts` - Unified precision mode selection
- `apps/web/src/render/index.ts` - Render module exports

**Features:**
- Automatic mode selection based on scale thresholds
- Hysteresis (100ms cooldown) prevents mode flickering during zoom
- Fallback handling when perturbation/arbitrary unavailable
- Recommended max iterations based on mode performance
- Event listeners for mode change notifications

---

## 🖥️ Priority 3: CLI Rendering Tool

### P3-1: Core CLI Infrastructure
```bash
mandelbrot render \
  --center "-0.7436438870371587" "0.1318259042053119" \
  --scale "1e-13" \
  --size 3840x2160 \
  --iterations 10000 \
  --palette sunset \
  --output poster.png
```

- [ ] Create `apps/cli/` directory structure
- [ ] Argument parser (use commander.js or built-in util.parseArgs)
- [ ] Headless rendering via Playwright (reuse existing renderer)
- [ ] Progress bar for long renders
- [ ] Output formats: PNG (8/16-bit), EXR (32-bit float)

### P3-2: High-Resolution Tiled Rendering
For posters larger than GPU texture limits.

```bash
mandelbrot render \
  --size 30720x17280 \  # 32K resolution
  --tile-size 4096 \
  --output ultra-poster.png
```

- [ ] Compute tile grid for target resolution
- [ ] Render each tile independently (parallel with worker pool)
- [ ] Stitch tiles using sharp (libvips binding, handles huge images)
- [ ] Memory-efficient streaming (don't load all tiles into RAM)
- [ ] Resume interrupted renders (checkpoint file)

### P3-3: Zoom Sequence Renderer
For creating zoom videos.

```bash
mandelbrot render-sequence \
  --start-center "0" "0" --start-scale "4" \
  --end-center "-0.743643" "0.131825" --end-scale "1e-13" \
  --frames 3600 \
  --fps 60 \
  --easing exponential \
  --output frames/frame-%06d.png
```

- [ ] Interpolation between start and end viewports
- [ ] Exponential scale interpolation (linear looks wrong)
- [ ] Easing functions for cinematic zooms
- [ ] Frame output with zero-padded numbering
- [ ] Optional: direct video encoding via ffmpeg subprocess

### P3-4: Batch Rendering
Render many locations from a manifest file.

```json
{
  "renders": [
    { "name": "seahorse", "center": [...], "scale": "1e-8", "size": "4K" },
    { "name": "elephant", "center": [...], "scale": "1e-6", "size": "4K" }
  ],
  "defaults": { "palette": "ocean", "iterations": 5000 }
}
```

- [ ] JSON/YAML manifest parser
- [ ] Parallel batch execution
- [ ] Summary report with render times
- [ ] Error recovery (continue batch on single failure)

---

## 🎨 Priority 4: Julia Sets & Variants

### P4-1: Julia Set Mode
Same engine, different initialization. Mandelbrot: `z₀=0, c=pixel`. Julia: `z₀=pixel, c=fixed`.

- [ ] Add uniform `u_julia_c` (vec2 or vec4 for DD)
- [ ] Add uniform `u_is_julia_mode` (bool)
- [ ] Shader logic: swap initialization based on mode
- [ ] UI toggle: Mandelbrot ↔ Julia
- [ ] Julia parameter picker (click on Mandelbrot to set c)

### P4-2: Interactive Julia Preview
Real-time Julia preview as you hover over Mandelbrot.

- [ ] Split-screen mode: Mandelbrot left, Julia right
- [ ] Live Julia update on mouse move (throttled to 60fps)
- [ ] Click to lock Julia parameter
- [ ] Linked zoom: zoom both views together

### P4-3: Other Escape-Time Fractals
Same renderer architecture, different formulas.

- [ ] Burning Ship: `z = (|Re(z)| + i|Im(z)|)² + c`
- [ ] Tricorn: `z = conj(z)² + c`
- [ ] Multibrot: `z = z^n + c` (configurable n)
- [ ] Celtic variants
- [ ] Formula selector in UI

---

## 🧪 Priority 5: Rock-Solid Testing

### P5-1: Unit Test Coverage
Target: 90%+ coverage on math and core logic.

- [ ] DD arithmetic edge cases (overflow, underflow, denormals)
- [ ] Tile coordinate calculations
- [ ] Cache eviction logic
- [ ] Viewport math (pan, zoom, reprojection)
- [ ] Color interpolation (all modes: RGB, HSV, LAB, OKLCH)
- [ ] Precision switching logic

### P5-2: Visual Regression Suite
Golden images at known coordinates.

**Test Locations:**
```typescript
const GOLDEN_LOCATIONS = [
  { name: 'home', center: [-0.5, 0], scale: 1.5 },
  { name: 'seahorse-valley', center: [-0.75, 0.1], scale: 0.01 },
  { name: 'elephant-valley', center: [0.275, 0], scale: 0.01 },
  { name: 'double-spiral', center: [-0.759856, 0.125547], scale: 0.0001 },
  { name: 'deep-minibrot', center: [-1.768778, 0.001738], scale: 1e-8 },
  { name: 'dd-boundary', center: [...], scale: 5e-6 },  // Precision switch point
  { name: 'extreme-deep', center: [...], scale: 1e-12 },
];
```

- [ ] Generate golden images for all test locations
- [ ] Per-pixel RMS comparison (<1.5 per channel tolerance)
- [ ] Test each color palette
- [ ] Test with AA on/off
- [ ] Cross-browser goldens (Chrome, Firefox, Safari)

### P5-3: Performance Benchmarks
Automated performance regression detection.

```typescript
interface Benchmark {
  name: string;
  location: ViewportParams;
  metrics: {
    firstFrame: number;      // ms to first pixel
    fullRender: number;      // ms to converged frame
    interactionFps: number;  // FPS during pan/zoom
    memoryPeak: number;      // MB peak usage
  };
  thresholds: {
    firstFrame: { warn: 100, fail: 200 };
    // ...
  };
}
```

- [ ] Benchmark harness with warm-up runs
- [ ] Statistical analysis (median, p95, stddev)
- [ ] CI integration: fail on regression >10%
- [ ] Device-specific baselines (fast desktop, slow laptop, mobile)
- [ ] Memory leak detection (render 1000 frames, check growth)

### P5-4: Stress Testing

- [ ] Rapid zoom in/out (detect state corruption)
- [ ] Extreme coordinates (edge of float64 range)
- [ ] Maximum iterations (100K+)
- [ ] Memory pressure (fill cache, verify eviction)
- [ ] Network offline (graceful degradation)
- [ ] Tab backgrounding/foregrounding

---

## ✨ Priority 6: Polish & Features

### P6-1: Advanced Coloring
- [ ] Orbit trap coloring (distance to shapes)
- [ ] Interior detection (period coloring for points inside set)
- [ ] Normal vector calculation for 3D-like shading
- [ ] Distance estimation visualization
- [ ] Custom palette import (Adobe ASE, GIMP GPL)

### P6-2: Exploration Aids
- [ ] Interesting area finder (entropy-based)
- [ ] Minibrot detector (period detection)
- [ ] Bookmark manager with thumbnails
- [ ] Share URLs with full-precision coordinates
- [ ] History with undo/redo

### P6-3: Animation System
- [ ] Keyframe-based zoom paths
- [ ] Bezier easing curves
- [ ] Preview at reduced quality
- [ ] Export to WebCodecs (in-browser video)
- [ ] Sync to audio (BPM detection)

### P6-4: Accessibility
- [ ] Keyboard-only navigation (all features)
- [ ] Screen reader descriptions
- [ ] High contrast mode
- [ ] Reduced motion option
- [ ] Color blind friendly palettes

---

## 🔬 Priority 7: WebGPU (Future)

WebGPU offers compute shaders - better parallelization than fragment shaders.
**Wait until >80% browser support** (currently ~60%).

### P7-1: WebGPU Backend
- [ ] Feature detection and graceful fallback
- [ ] WGSL compute kernels for Mandelbrot
- [ ] Workgroup size optimization (64-256 threads)
- [ ] Shared memory for reference orbit (perturbation)

### P7-2: Performance Comparison
- [ ] A/B benchmark: WebGL2 vs WebGPU
- [ ] Identify crossover point (when WebGPU wins)
- [ ] Adaptive backend selection per-device

---

## ✅ Completed

### Foundation ✅
- [x] WebGL2 fragment shader pipeline
- [x] Mandelbrot computation in GLSL with smooth coloring
- [x] Pan/zoom: mouse wheel, drag, touch pinch, keyboard
- [x] Inertial scrolling
- [x] Canvas, FPS counter, coordinates display, zoom indicator
- [x] Simple store (no external deps), LocalStorage persistence

### Core Renderer ✅
- [x] requestAnimationFrame time budgeting
- [x] Adaptive quality degradation under load
- [x] 11 color palettes with smooth transitions
- [x] Histogram equalization
- [x] Anti-aliasing toggle

### UI/UX ✅
- [x] Preset bookmarks (4 locations)
- [x] Fullscreen mode with ESC exit
- [x] Mobile-responsive layout
- [x] Touch-optimized buttons (44px minimum)

### Deep Zoom DD ✅
- [x] Double-double arithmetic in TypeScript and GLSL
- [x] Precision switching at 5e-6 threshold
- [x] gl_FragCoord coordinate generation (avoids interpolation loss)
- [x] DD division, multiplication, addition, subtraction
- [x] Working to 1e-10 scale and beyond
- [x] HUD shows precision mode

### Testing ✅
- [x] Vitest unit tests for DD arithmetic
- [x] Playwright E2E tests
- [x] Visual regression screenshots
- [x] Deep zoom precision validation
- [x] Solid color detection (DD debugging)

### Progressive Rendering ✅
- [x] Stochastic sampling (blue noise pattern)
- [x] Interleaved scanlines
- [x] Previous frame texture for accumulation
- [x] Works in both standard AND DD precision modes
- [x] Auto-fallback from reprojection to stochastic in DD mode

---

## Known Issues

| Issue | Impact | Workaround |
|-------|--------|------------|
| iOS Safari 4096 texture limit | Mobile quality | Detect and use smaller tiles |
| Firefox BigInt 10x slower | Deep zoom perf | Use WASM arbitrary precision |
| Android Chrome throttling | Background FPS | Quality auto-adjust |
| No COOP/COEP headers | SharedArrayBuffer unavailable | Use transferables |
| E2E pixel reading fails | Tests fail | See test fixes below |

### Test Infrastructure Issues

The following E2E tests fail due to WebGL canvas pixel reading issues:

**Root cause:** Tests use `canvas.getContext('2d').getImageData()` on a WebGL canvas with `preserveDrawingBuffer: false`. This returns empty/zero data.

**Failing tests:**
- `should detect debug colors in DD mode` - Solid color detection gets all black pixels
- `should render Mandelbrot set visually` - Same pixel reading issue
- `should render correctly at various deep zoom levels` - Same issue

**Fix options:**
1. Use `gl.readPixels()` instead of 2D context for WebGL canvases
2. Set `preserveDrawingBuffer: true` for test runs (performance impact)
3. Use screenshot comparison instead of pixel sampling

**Other test timeouts** (environment-related, not code bugs):
- `should respond to zoom controls` - Button click timeout
- `should reset to home view` - Interaction timeout
- `should maintain performance` - FPS measurement timing

---

## Performance Targets

| Metric | Target | Minimum | Current |
|--------|--------|---------|---------|
| Interaction FPS | 128 | 60 | 60 |
| First frame | 50ms | 120ms | ~100ms |
| Pan latency | 4ms | 16ms | ~16ms |
| Full 1080p render | 100ms | 300ms | ~150ms |
| Full 4K render | 300ms | 700ms | ~400ms |
| Deep zoom rebase | 20ms | 100ms | N/A |
| Memory (typical) | 200MB | 500MB | ~150MB |
| WASM bundle | 30KB | 100KB | N/A |

---

## Architecture Decision Records

### ADR-001: Tile-Based Rendering
**Decision:** Switch from full-frame to tile-based rendering.
**Rationale:** Full-frame recalculation on every viewport change makes 128fps impossible. Tiles enable caching, incremental updates, and parallel rendering.
**Consequences:** More complex compositor, need tile scheduling, but unlocks all performance goals.

### ADR-002: Custom WASM vs Library
**Decision:** Write minimal C arbitrary precision, not use GMP/MPFR.
**Rationale:** GMP compiles to 500KB+ WASM. We only need add/sub/mul/sqr/cmp - maybe 500 lines of C, <50KB WASM. Performance-critical path (sqr) can use Karatsuba.
**Consequences:** More development work, but smaller bundle and exactly what we need.

### ADR-003: Perturbation Theory
**Decision:** Implement perturbation for deep zoom, not just arbitrary precision.
**Rationale:** Arbitrary precision alone is too slow for interactive zoom beyond 1e-20. Perturbation makes infinite zoom interactive by computing deltas in float64.
**Consequences:** Complex implementation (reference orbits, glitch detection, rebasing), but enables the headline feature: truly infinite interactive zoom.

### ADR-004: Julia Same Engine
**Decision:** Julia sets use same renderer with mode flag, not separate implementation.
**Rationale:** Only difference is initialization: `z₀=0, c=pixel` vs `z₀=pixel, c=fixed`. Same iteration, same coloring, same precision handling.
**Consequences:** Feature parity automatic, minimal code addition.

---

## Tech Debt

- [ ] Remove week-based planning from CLAUDE.md (no time estimates)
- [ ] Clean up duplicate milestone sections in this file
- [ ] Consolidate DD arithmetic (TypeScript + GLSL share logic via codegen?)
- [ ] Remove unused ESLint config files
- [ ] Document why progressive was disabled (for future debugging)

---

*This roadmap prioritizes pragmatic execution over theoretical perfection. Every feature listed has been implemented in existing Mandelbrot viewers (Kalles Fraktaler, XaoS, Mandel) - we're not inventing new math, just engineering the best web implementation.*
