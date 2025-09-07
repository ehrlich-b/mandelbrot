# TODO.md - Implementation Roadmap

## ✅ **COMPLETED - Initial Foundation** 

### Critical Path - MVP Renderer ✅
- [x] **WebGL2 Basic Renderer** [HIGH]
  - [x] Vertex/fragment shader pipeline
  - [x] Mandelbrot computation in GLSL
  - [x] Smooth coloring implementation
  - [x] Basic zoom to float64 limits
  
- [x] **Pan/Zoom Controls** [HIGH]
  - [x] Mouse wheel zoom
  - [x] Click and drag pan
  - [x] Touch gestures (pinch/pan)
  - [x] Keyboard navigation
  - [x] Inertial scrolling

- [x] **Vanilla TypeScript UI** [HIGH]
  - [x] Canvas component
  - [x] FPS counter
  - [x] Coordinates display
  - [x] Zoom level indicator
  - [x] Basic controls panel

- [x] **State Management** [MEDIUM]
  - [x] Simple store setup (no external deps)
  - [x] Viewport state
  - [x] Render settings
  - [x] LocalStorage persistence

## ✅ **COMPLETED - Core Functionality**

### Performance Optimization ✅
- [x] Add requestAnimationFrame time budgeting
- [x] Implement adaptive quality degradation under load  
- [x] Fixed mouse wheel zoom direction (intuitive behavior)
- [x] WebGL2 renderer with 60+ FPS performance

### Enhanced UI/UX ✅ 
- [x] Add preset bookmark buttons (4 locations working)
- [x] Fixed canvas attachment to root element
- [x] Functional zoom in/out buttons
- [x] Color scheme selector working
- [x] HUD displays coordinates, FPS, render time, quality level

### Testing & Visual Validation ✅
- [x] Visual regression tests with screenshots
- [x] `make visual-test` command for quick verification
- [x] Mandelbrot set rendering correctly verified
- [x] All zoom scales working with auto-adjusting iterations

## ✅ **COMPLETED - Enhanced Features**

### Critical Issues ✅
- [x] **ESLint Configuration** - ABANDONED in favor of TypeScript strict checking
  - [x] ESLint config exists but not used (TypeScript preferred)
  - [x] Linting pipeline replaced with `npm run typecheck`
  
### Enhanced Rendering ✅
- [x] **Progressive Rendering**
  - [x] Screen-space reprojection from previous frame
  - [x] Blue-noise stochastic sampling for quality  
  - [x] Interleaved scanlines for faster initial render
  - [x] Multi-stage progressive refinement system
  
### Advanced UI Features ✅
- [x] **Fullscreen Mode**
  - [x] Fullscreen toggle button
  - [x] Hide/fade controls in fullscreen
  - [x] ESC key to exit fullscreen
  - [x] Dynamic button text updates
  
- [x] **Mobile Experience**
  - [x] Enhanced touch gesture handling with double-tap zoom
  - [x] Mobile-responsive controls layout with breakpoints  
  - [x] Touch-optimized button sizes (44px minimum)
  - [x] Mobile-first CSS with proper media queries

### Advanced Color System ✅
- [x] **Multiple Color Palettes** 
  - [x] 11 built-in palettes (Classic, Sunset, Ocean, Fire, Monochrome, Twilight, Forest, Neon, Ice, Copper, Spectrum)
  - [x] Smooth HSV/RGB color transitions
  - [x] Interactive palette editor UI
  - [x] Color offset and scale controls
  
- [x] **Enhanced Coloring**
  - [x] Smooth iteration coloring with distance estimation
  - [x] Histogram equalization with power curve approximation
  - [x] Anti-aliasing toggle with quality control

## 🔁 **Deep Zoom Strategy — Updated, Realistic Plan**

We will pursue a hybrid approach that delivers reliable deep zoom without chasing dead ends:

- Above ~5e-6 scale: Standard GPU shader (fast path)
- ~5e-6 down to ~1e-10 (conservative target): GPU double-double (DD) path using pixel-index based coordinates
- Beyond ~1e-10: CPU fallback (Web Workers) with arbitrary precision; optional perturbation to accelerate

### Why this plan
- WebGL varyings are single-precision; interpolated UVs can lose significance at extreme scales. We avoid this by computing per-fragment pixel offsets from `gl_FragCoord` and converting to DD before applying scale.
- DD arithmetic in GLSL remains useful when inputs are well-conditioned (exact pixel indices + DD center/scale).
- True “infinite” zoom requires arbitrary precision and often perturbation; that belongs on the CPU in workers.

### ✅ **COMPLETED DZ‑1 — GPU DD Hardening (target: ~1e-10)** 
- [x] Shader: generate coordinates from `gl_FragCoord` (avoid interpolated `v_texCoord` for DD path)
  - [x] Compute integer pixel index from `gl_FragCoord.xy`
  - [x] Normalize to plane units with resolution/aspect in DD
  - [x] c = centerDD + scaleDD * pixelOffsetDD
- [x] Single source of truth for DD GLSL
  - [x] Inline/include `dd-arithmetic.glsl` only; remove duplicated helpers
  - [x] Ensure split constant is `4097.0` (single-precision split)
- [x] Uniforms/precision wiring
  - [x] Always set `u_center_dd`, `u_scale_dd`, `u_use_dd_precision` when DD active
  - [x] Keep `highp` where applicable (WebGL2)
- [x] Observability + tests
  - [x] HUD/console shows STANDARD ↔ DD switches
  - [x] Playwright check: zoom past threshold; assert switch + non-flat image
  - [x] Disable progressive noise during DD validation (progressive disabled)
- ✅ **COMPLETED — Acceptance (DZ‑1 — Deep Zoom DD Precision Working)**
  - [x] Precision switching logic verified working (5e-6 threshold)  
  - [x] DD coordinate calculation fixed: Full DD precision from pixel coordinates to complex plane
  - [x] DD arithmetic functions implemented correctly (dd_div, dd_mul, dd_add, etc.)
  - [x] Deep zoom test results: 72% → 1% pixel difference (major improvement)
  - [x] DD precision now working correctly for scales down to 1e-10 and beyond

### Milestone DZ‑2 — CPU Fallback (target: >1e-10 reliably)
- [ ] Worker pool + tiling
  - [ ] Tile scheduler with progressive updates
  - [ ] Transfer results via `ImageData`/`Uint32Array`
- [ ] Arbitrary precision math
  - [ ] Choose library: BigFloat/BigInt (e.g., decimal/big.js to start; later WASM MPFR if needed)
  - [ ] Deterministic iteration + smooth coloring
- [ ] Integration
  - [ ] Auto-switch below GPU DD floor (e.g., 1e-10)
  - [ ] Show “CPU mode” indicator; keep interaction responsive
- [ ] Acceptance (DZ‑2)
  - [ ] Render a canonical deep target (e.g., ~1e-14) within reasonable time on desktop
  - [ ] Visual parity when switching GPU→CPU at threshold (no jumps)

### Milestone DZ‑3 — Perturbation (optional accelerator)
- [ ] Compute high‑precision reference orbit on CPU
- [ ] Per-pixel delta orbits in lower precision
- [ ] Rebase/checkpointing for long zooms
- [ ] Acceptance: 5–20x speedup over naive CPU at extreme depths

### Documentation & Polish
- [ ] Document shader DD math and coordinate generation strategy
- [ ] Update troubleshooting with precision limits and mode indicators
- [ ] Performance profiling notes (GPU vs CPU thresholds)

## ✅ **Current Status: Deep Zoom DD Precision Working**

What works now ✅
- Precision manager switches to DD below `5e-6` threshold
- DD shader compiles and runs with full DD arithmetic implementation
- DD coordinate calculation preserves precision from `gl_FragCoord` through complex plane
- Deep zoom rendering produces accurate results (1% pixel difference vs 72% before fix)
- HUD/console correctly shows STANDARD ↔ DD precision switches
- Full end-to-end DD precision pipeline operational

Key Technical Achievements ✅
- **Fixed critical coordinate precision loss**: Now does pixel-to-complex calculation entirely in DD precision
- **Added missing DD division**: Implemented `dd_div()` function in GLSL shader
- **String coordinate support**: Deep zoom tests use string coordinates to preserve precision
- **Verified DD arithmetic**: All DD functions working correctly in both TypeScript and GLSL

What's next
- CPU fallback for arbitrarily deep zoom beyond DD limits (optional)
- Performance optimizations and polish

## ✅ **COMPLETED - Milestone 1: Advanced Rendering**

### Rendering Quality ✅
- [x] **Progressive Rendering** [HIGH]
  - [x] Screen-space reprojection
  - [x] Blue-noise sampling  
  - [x] Interleaved scanlines
  - [x] Adaptive refinement stages
  
- [x] **Anti-Aliasing** [MEDIUM]  
  - [x] Anti-aliasing toggle control
  - [x] Configurable quality levels
  - [x] Smooth edge rendering
  
- [x] **Color System** [HIGH]
  - [x] 11 built-in palettes
  - [x] Smooth iteration coloring with distance estimation
  - [x] Histogram equalization
  - [x] Interactive palette editor UI

### Performance
- [ ] **Web Workers** [HIGH]
  - [ ] OffscreenCanvas setup
  - [ ] Comlink integration
  - [ ] Compute/render separation
  
- [ ] **Tile Cache** [MEDIUM]
  - [ ] LRU memory cache
  - [ ] IndexedDB persistence
  - [ ] Tile invalidation
  - [ ] Zoom pyramid

## 🚀 Milestone 2: Deep Zoom Execution (Weeks 5–8)

### DZ‑1 — GPU DD Hardening
- [ ] `gl_FragCoord`-based coordinate generation for DD path
- [ ] Unify DD GLSL to single source; correct split const (4097.0)
- [ ] Deterministic e2e asserting STANDARD → DD switch and non‑flat image
- [ ] Acceptance: stable visuals around ~1e-9 to ~1e-10

### DZ‑2 — CPU Fallback (Arbitrary Precision)
- [ ] Worker pool + tiling; progressive updates
- [ ] Choose BigFloat/BigInt lib (JS first; swap to WASM if needed)
- [ ] Auto-switch below DD floor; UI indicator
- [ ] Acceptance: render ~1e-14 region within reasonable time

### DZ‑3 — Perturbation Accelerator (Optional)
- [ ] Reference orbit in high precision; per‑pixel delta orbits
- [ ] Rebase/checkpoint system
- [ ] Acceptance: 5–20x speedup at extreme depths

### Deep Zoom UI
- [ ] Precision indicator + zoom depth meter
- [ ] Performance warnings when falling back to CPU
- [ ] Optional reference‑orbit debug overlay (post DZ‑3)

## 🎨 Milestone 3: Advanced Features (Week 9-12)

### Interesting Areas Finder
- [ ] **Heuristics Engine**
  - [ ] Entropy calculation
  - [ ] Curvature detection
  - [ ] Period analysis
  - [ ] Ridge detection
  
- [ ] **Minibrot Scanner**
  - [ ] Period detection algorithm
  - [ ] Cardioid/bulb detection
  - [ ] Automatic centering
  - [ ] Classification system
  
- [ ] **UI Integration**
  - [ ] Discovery panel
  - [ ] Thumbnail previews
  - [ ] Ranked suggestions
  - [ ] Auto-exploration mode

### Export System
- [ ] **Poster Renderer** [HIGH]
  - [ ] CLI tool setup
  - [ ] Playwright integration
  - [ ] Tile stitching
  - [ ] 16-bit quantization
  
- [ ] **Batch Export**
  - [ ] Parameter files
  - [ ] Queue system
  - [ ] Progress tracking
  
- [ ] **Animation Export**
  - [ ] Keyframe system
  - [ ] Smooth interpolation
  - [ ] Video encoding (WebCodecs)

## 🔬 Milestone 4: WebGPU Path (Week 13-16)

### WebGPU Implementation
- [ ] **Compute Shaders**
  - [ ] WGSL kernels
  - [ ] Workgroup optimization
  - [ ] Memory layout
  
- [ ] **Feature Detection**
  - [ ] Capability queries
  - [ ] Graceful fallback
  - [ ] Performance comparison
  
- [ ] **Hybrid Rendering**
  - [ ] Backend selection
  - [ ] Resource sharing
  - [ ] Synchronization

## 🌟 Milestone 5: Polish & Ship (Week 17-20)

### Testing Suite
- [ ] **Unit Tests**
  - [ ] Math operations
  - [ ] Color functions
  - [ ] State management
  - [ ] Cache logic
  
- [ ] **Visual Tests**
  - [ ] Golden images
  - [ ] Regression detection
  - [ ] Cross-browser checks
  
- [ ] **Performance Tests**
  - [ ] FPS benchmarks
  - [ ] Memory profiling
  - [ ] Load testing

### Documentation
- [ ] **User Guide**
  - [ ] Getting started
  - [ ] Advanced features
  - [ ] Troubleshooting
  
- [ ] **API Docs**
  - [ ] TypeDoc setup
  - [ ] Code examples
  - [ ] Architecture diagrams

### Production
- [ ] **Optimization**
  - [ ] Bundle size
  - [ ] Code splitting
  - [ ] Tree shaking
  - [ ] Asset optimization
  
- [ ] **Deployment**
  - [ ] CI/CD pipeline
  - [ ] CDN setup
  - [ ] Error tracking
  - [ ] Analytics

## 🔮 Future Ideas (Post-Launch)

### Advanced Mathematics
- [ ] Julia set explorer
- [ ] Burning Ship fractal
- [ ] Newton fractals
- [ ] Lyapunov fractals
- [ ] 3D Mandelbulb

### Platform Extensions
- [ ] Desktop app (Tauri/Electron)
- [ ] Mobile app (React Native)
- [ ] VR mode (WebXR)
- [ ] Cloud rendering API
- [ ] Distributed computing

### Creative Tools
- [ ] Formula editor
- [ ] Shader playground
- [ ] Music visualizer
- [ ] AI-guided exploration
- [ ] Social sharing

### Professional Features
- [ ] RAW export formats
- [ ] Color management (ICC)
- [ ] Print preparation
- [ ] Watermarking
- [ ] Licensing system

## 🐛 Known Issues

1. **iOS Safari texture limits** - Need tile size detection
2. **Firefox BigInt performance** - Consider WASM fallback
3. **Android Chrome throttling** - Add quality auto-adjust
4. **Edge WebGL2 bugs** - Shader workarounds needed

## 📝 Notes

### Performance Targets
- Cold start: < 120ms to first frame
- Interaction: 60+ FPS minimum
- Deep zoom: < 100ms rebase
- Memory: < 500MB for typical session

### Quality Metrics
- No visible banding in gradients
- No iteration artifacts at boundaries  
- Smooth transitions during zoom
- Consistent colors across tiles

### Browser Support Matrix
- Chrome 90+ ✅
- Firefox 85+ ✅  
- Safari 15+ ✅
- Edge 90+ ✅
- Chrome Android ✅
- Safari iOS ⚠️ (restrictions)

## 🏃 Sprint Planning

**Week 1-2**: Core renderer + controls
**Week 3-4**: Quality + performance 
**Week 5-8**: Deep zoom mathematics
**Week 9-12**: Advanced features
**Week 13-16**: WebGPU experimental
**Week 17-20**: Polish and launch

---

*Last updated: Project start*
*Next review: End of Week 2*
