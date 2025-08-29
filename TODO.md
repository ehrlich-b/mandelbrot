# TODO.md - Implementation Roadmap

## 🎯 Current Sprint (Week 1-2)

### Critical Path - MVP Renderer
- [ ] **WebGL2 Basic Renderer** [HIGH]
  - [ ] Vertex/fragment shader pipeline
  - [ ] Mandelbrot computation in GLSL
  - [ ] Smooth coloring implementation
  - [ ] Basic zoom to float64 limits
  
- [ ] **Pan/Zoom Controls** [HIGH]
  - [ ] Mouse wheel zoom
  - [ ] Click and drag pan
  - [ ] Touch gestures (pinch/pan)
  - [ ] Keyboard navigation
  - [ ] Inertial scrolling

- [ ] **React UI Shell** [HIGH]
  - [ ] Canvas component
  - [ ] FPS counter
  - [ ] Coordinates display
  - [ ] Zoom level indicator
  - [ ] Basic controls panel

- [ ] **State Management** [MEDIUM]
  - [ ] Zustand store setup
  - [ ] Viewport state
  - [ ] Render settings
  - [ ] History/undo system

## 📅 Milestone 1: Basic Explorer (Week 3-4)

### Rendering Quality
- [ ] **Progressive Rendering** [HIGH]
  - [ ] Screen-space reprojection
  - [ ] Blue-noise sampling
  - [ ] Interleaved scanlines
  - [ ] Adaptive refinement
  
- [ ] **Anti-Aliasing** [MEDIUM]
  - [ ] Gradient-based detection
  - [ ] Adaptive supersampling
  - [ ] Edge smoothing
  
- [ ] **Color System** [HIGH]
  - [ ] Multiple built-in palettes
  - [ ] Smooth iteration coloring
  - [ ] Histogram equalization
  - [ ] Palette editor UI

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

## 🚀 Milestone 2: Deep Zoom (Week 5-8)

### Arbitrary Precision [CRITICAL]
- [ ] **Double-Double Arithmetic**
  - [ ] DD number type (128-bit effective)
  - [ ] Complex DD operations
  - [ ] GLSL emulation shaders
  
- [ ] **Perturbation Theory**
  - [ ] Reference orbit calculation
  - [ ] Delta orbit computation
  - [ ] Rebase detection
  - [ ] Checkpoint system
  
- [ ] **BigNum Integration**
  - [ ] WASM BigFloat library
  - [ ] Worker-based computation
  - [ ] Precision auto-switching
  
- [ ] **Series Approximation**
  - [ ] Taylor series coefficients
  - [ ] Skip iteration optimization
  - [ ] Error bounds checking

### Deep Zoom UI
- [ ] **Precision Indicator**
  - [ ] Current precision display
  - [ ] Zoom depth meter
  - [ ] Performance warnings
  
- [ ] **Reference Orbit Visualization**
  - [ ] Debug overlay option
  - [ ] Rebase point display
  - [ ] Orbit trajectory

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