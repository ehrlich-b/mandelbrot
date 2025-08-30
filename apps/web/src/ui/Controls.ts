export class Controls {
  private element!: HTMLDivElement;
  
  // Event callbacks
  public onReset?: () => void;
  public onColorSchemeChange?: (scheme: number) => void;
  public onIterationChange?: (iterations: number) => void;
  public onLoadBookmark?: (index: number) => void;
  public onZoomIn?: () => void;
  public onZoomOut?: () => void;
  public onFullscreenToggle?: () => void;
  public onProgressiveToggle?: (enabled: boolean) => void;
  public onAntiAliasingToggle?: (enabled: boolean) => void;
  public onHistogramToggle?: (enabled: boolean) => void;
  public onColorOffsetChange?: (offset: number) => void;
  public onColorScaleChange?: (scale: number) => void;
  
  private fullscreenBtn?: HTMLButtonElement;

  init(): void {
    this.element = document.createElement('div');
    this.element.className = 'controls';
    
    this.element.innerHTML = `
      <button id="reset-btn">Reset View</button>
      <button id="zoom-in-btn">Zoom In (+)</button>
      <button id="zoom-out-btn">Zoom Out (-)</button>
      <button id="fullscreen-btn">Fullscreen (F)</button>
      
      <div class="palette-selector">
        <label>Color Scheme:</label>
        <select id="color-scheme">
          <option value="0">Classic</option>
          <option value="1">Sunset</option>
          <option value="2">Ocean</option>
          <option value="3">Fire</option>
          <option value="4">Monochrome</option>
          <option value="5">Twilight</option>
          <option value="6">Forest</option>
          <option value="7">Neon</option>
          <option value="8">Ice</option>
          <option value="9">Copper</option>
          <option value="10">Spectrum</option>
        </select>
      </div>
      
      <div class="iteration-control">
        <label>Max Iterations:</label>
        <input type="range" id="iterations" min="64" max="4096" value="256" step="64">
        <span id="iterations-value">256</span>
      </div>
      
      <div class="palette-editor">
        <label>Palette Editor:</label>
        <div class="palette-controls">
          <div class="color-offset-control">
            <label>Color Offset:</label>
            <input type="range" id="color-offset" min="0" max="10" value="0" step="0.1">
            <span id="color-offset-value">0.0</span>
          </div>
          <div class="color-scale-control">
            <label>Color Scale:</label>
            <input type="range" id="color-scale" min="0.1" max="5" value="1" step="0.1">
            <span id="color-scale-value">1.0</span>
          </div>
        </div>
      </div>
      
      <div class="progressive-toggle">
        <label>
          <input type="checkbox" id="progressive-rendering">
          Progressive Rendering (experimental)
        </label>
      </div>
      
      <div class="antialiasing-toggle">
        <label>
          <input type="checkbox" id="anti-aliasing" checked>
          Anti-Aliasing (smooth edges)
        </label>
      </div>
      
      <div class="histogram-toggle">
        <label>
          <input type="checkbox" id="histogram-equalization">
          Histogram Equalization (enhance contrast)
        </label>
      </div>
      
      <div class="presets">
        <label>Presets:</label>
        <button data-bookmark="0">Home</button>
        <button data-bookmark="1">Seahorse Valley</button>
        <button data-bookmark="2">Spiral Detail</button>
        <button data-bookmark="3">Lightning</button>
      </div>
    `;
    
    document.body.appendChild(this.element);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Reset button
    const resetBtn = this.element.querySelector('#reset-btn') as HTMLButtonElement;
    resetBtn?.addEventListener('click', () => {
      if (this.onReset) this.onReset();
    });

    // Zoom buttons
    const zoomInBtn = this.element.querySelector('#zoom-in-btn') as HTMLButtonElement;
    const zoomOutBtn = this.element.querySelector('#zoom-out-btn') as HTMLButtonElement;
    
    zoomInBtn?.addEventListener('click', () => {
      if (this.onZoomIn) this.onZoomIn();
    });
    
    zoomOutBtn?.addEventListener('click', () => {
      if (this.onZoomOut) this.onZoomOut();
    });

    // Fullscreen button
    this.fullscreenBtn = this.element.querySelector('#fullscreen-btn') as HTMLButtonElement;
    this.fullscreenBtn?.addEventListener('click', () => {
      if (this.onFullscreenToggle) this.onFullscreenToggle();
    });
    
    // Monitor fullscreen state changes
    document.addEventListener('fullscreenchange', () => {
      this.updateFullscreenButton();
    });

    // Color scheme selector
    const colorScheme = this.element.querySelector('#color-scheme') as HTMLSelectElement;
    colorScheme?.addEventListener('change', () => {
      const scheme = parseInt(colorScheme.value);
      if (this.onColorSchemeChange) this.onColorSchemeChange(scheme);
    });

    // Iterations slider
    const iterationsSlider = this.element.querySelector('#iterations') as HTMLInputElement;
    const iterationsValue = this.element.querySelector('#iterations-value') as HTMLSpanElement;
    
    iterationsSlider?.addEventListener('input', () => {
      const iterations = parseInt(iterationsSlider.value);
      iterationsValue.textContent = iterations.toString();
      if (this.onIterationChange) this.onIterationChange(iterations);
    });

    // Color offset slider
    const colorOffsetSlider = this.element.querySelector('#color-offset') as HTMLInputElement;
    const colorOffsetValue = this.element.querySelector('#color-offset-value') as HTMLSpanElement;
    
    colorOffsetSlider?.addEventListener('input', () => {
      const offset = parseFloat(colorOffsetSlider.value);
      colorOffsetValue.textContent = offset.toFixed(1);
      if (this.onColorOffsetChange) this.onColorOffsetChange(offset);
    });

    // Color scale slider
    const colorScaleSlider = this.element.querySelector('#color-scale') as HTMLInputElement;
    const colorScaleValue = this.element.querySelector('#color-scale-value') as HTMLSpanElement;
    
    colorScaleSlider?.addEventListener('input', () => {
      const scale = parseFloat(colorScaleSlider.value);
      colorScaleValue.textContent = scale.toFixed(1);
      if (this.onColorScaleChange) this.onColorScaleChange(scale);
    });

    // Progressive rendering toggle
    const progressiveToggle = this.element.querySelector('#progressive-rendering') as HTMLInputElement;
    progressiveToggle?.addEventListener('change', () => {
      if (this.onProgressiveToggle) {
        this.onProgressiveToggle(progressiveToggle.checked);
      }
    });

    // Anti-aliasing toggle
    const aaToggle = this.element.querySelector('#anti-aliasing') as HTMLInputElement;
    aaToggle?.addEventListener('change', () => {
      if (this.onAntiAliasingToggle) {
        this.onAntiAliasingToggle(aaToggle.checked);
      }
    });

    // Histogram equalization toggle
    const histogramToggle = this.element.querySelector('#histogram-equalization') as HTMLInputElement;
    histogramToggle?.addEventListener('change', () => {
      if (this.onHistogramToggle) {
        this.onHistogramToggle(histogramToggle.checked);
      }
    });

    // Preset bookmark buttons
    const presetButtons = this.element.querySelectorAll('.presets button');
    presetButtons.forEach(button => {
      button.addEventListener('click', () => {
        const bookmarkIndex = parseInt(button.getAttribute('data-bookmark') || '0');
        if (this.onLoadBookmark) {
          this.onLoadBookmark(bookmarkIndex);
        }
      });
    });
  }

  private updateFullscreenButton(): void {
    if (this.fullscreenBtn) {
      const isFullscreen = !!document.fullscreenElement;
      this.fullscreenBtn.textContent = isFullscreen ? 'Exit Fullscreen (ESC)' : 'Fullscreen (F)';
    }
  }

  dispose(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}