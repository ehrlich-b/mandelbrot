export class Controls {
  private element!: HTMLDivElement;
  
  // Event callbacks
  public onReset?: () => void;
  public onColorSchemeChange?: (scheme: number) => void;
  public onIterationChange?: (iterations: number) => void;

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
        <button id="preset-home">Home</button>
        <button id="preset-seahorse">Seahorse Valley</button>
        <button id="preset-spiral">Spiral</button>
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

    // Preset buttons would need the viewer instance to set specific coordinates
    // For now, just add placeholders
    const presetButtons = this.element.querySelectorAll('.presets button');
    presetButtons.forEach(button => {
      button.addEventListener('click', () => {
        console.log(`Preset: ${button.id}`);
        // TODO: Implement preset coordinates
      });
    });
  }

  dispose(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}