export interface HUDData {
  centerX: number;
  centerY: number;
  scale: number;
  maxIterations: number;
  fps: number;
  renderTime: number;
  qualityLevel?: number;
  progressiveMode?: string;
  progressiveStage?: number;
  workerStatus?: 'main-thread' | 'worker' | 'worker-fallback';
}

export class HUD {
  private element!: HTMLDivElement;

  init(): void {
    this.element = document.createElement('div');
    this.element.className = 'hud';
    document.body.appendChild(this.element);
  }

  update(data: HUDData): void {
    if (!this.element) return;

    const zoomLevel = Math.log2(2.5 / data.scale);
    const magnification = Math.pow(2, Math.max(0, zoomLevel));

    const qualityText = data.qualityLevel !== undefined && data.qualityLevel < 1.0 
      ? `<div>Quality: ${Math.round(data.qualityLevel * 100)}%</div>`
      : '';
    
    const progressiveText = data.progressiveMode && data.progressiveMode !== 'full'
      ? `<div>Mode: ${data.progressiveMode} (${data.progressiveStage || 0})</div>`
      : '';
    
    const workerText = data.workerStatus
      ? `<div>Renderer: ${data.workerStatus === 'worker' ? 'Web Worker' : 
          data.workerStatus === 'worker-fallback' ? 'Worker (fallback)' : 'Main Thread'}</div>`
      : '';

    this.element.innerHTML = `
      <div>Center: ${data.centerX.toExponential(6)}, ${data.centerY.toExponential(6)}</div>
      <div>Scale: ${data.scale.toExponential(3)}</div>
      <div>Zoom: ${magnification.toExponential(2)}x</div>
      <div>Iterations: ${data.maxIterations}</div>
      <div>FPS: ${Math.round(data.fps)}</div>
      <div>Render: ${data.renderTime.toFixed(1)}ms</div>
      ${qualityText}
      ${progressiveText}
      ${workerText}
    `;
  }

  dispose(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}