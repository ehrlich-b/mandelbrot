export class Controls {
  private element!: HTMLDivElement;
  
  // Event callbacks
  public onReset?: () => void;
  public onColorSchemeChange?: (scheme: number) => void;
  public onIterationChange?: (iterations: number) => void;
  public onLoadBookmark?: (index: number) => void;
  public onZoomIn?: () => void;
  public onZoomOut?: () => void;

  init(): void {
    this.element = document.createElement('div');
    this.element.className = 'controls';
    
    this.element.innerHTML = `
      <button id="reset-btn">Reset View</button>
      <button id="zoom-in-btn">Zoom In (+)</button>
      <button id="zoom-out-btn">Zoom Out (-)</button>
      
      <div class="palette-selector">
        <label>Color Scheme:</label>
        <select id="color-scheme">
          <option value="0">Classic</option>
          <option value="1">Sunset</option>
          <option value="2">Ocean</option>
          <option value="3">Fire</option>
          <option value="4">Monochrome</option>
        </select>
      </div>
      
      <div class="iteration-control">
        <label>Max Iterations:</label>
        <input type="range" id="iterations" min="64" max="4096" value="256" step="64">
        <span id="iterations-value">256</span>
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

  dispose(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}