export class InputHandler {
  private canvas: HTMLCanvasElement;
  private isMouseDown = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private touches: Map<number, { x: number; y: number }> = new Map();
  private lastTouchDistance = 0;
  
  // Event callbacks
  public onPan?: (deltaX: number, deltaY: number) => void;
  public onZoom?: (factor: number, centerX?: number, centerY?: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));

    // Touch events
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false });

    // Keyboard events
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    
    // Prevent default drag behavior
    this.canvas.addEventListener('dragstart', (e) => e.preventDefault());
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button === 0) { // Left mouse button
      this.isMouseDown = true;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.isMouseDown) {
      const deltaX = event.clientX - this.lastMouseX;
      const deltaY = event.clientY - this.lastMouseY;
      
      if (this.onPan) {
        this.onPan(deltaX, deltaY);
      }
      
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    if (event.button === 0) {
      this.isMouseDown = false;
      this.canvas.style.cursor = 'grab';
    }
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const centerX = event.clientX;
    const centerY = event.clientY;
    
    // Determine zoom direction and factor
    // deltaY > 0 = scroll down/away = zoom OUT (larger scale)
    // deltaY < 0 = scroll up/toward = zoom IN (smaller scale)
    const delta = event.deltaY;
    const zoomFactor = delta > 0 ? 1 / 1.2 : 1.2;
    
    if (this.onZoom) {
      this.onZoom(zoomFactor, centerX, centerY);
    }
  }

  private handleContextMenu(event: Event): void {
    event.preventDefault();
    
    // Right click to zoom out
    if (this.onZoom) {
      this.onZoom(0.5);
    }
  }

  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    
    this.touches.clear();
    for (let i = 0; i < event.touches.length; i++) {
      const touch = event.touches[i];
      this.touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
    }
    
    if (event.touches.length === 2) {
      // Start pinch gesture
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      this.lastTouchDistance = this.getTouchDistance(touch1, touch2);
    }
  }

  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault();
    
    if (event.touches.length === 1) {
      // Single finger pan
      const touch = event.touches[0];
      const lastTouch = this.touches.get(touch.identifier);
      
      if (lastTouch) {
        const deltaX = touch.clientX - lastTouch.x;
        const deltaY = touch.clientY - lastTouch.y;
        
        if (this.onPan) {
          this.onPan(deltaX, deltaY);
        }
        
        this.touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
      }
    } else if (event.touches.length === 2) {
      // Two finger pinch/zoom
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const currentDistance = this.getTouchDistance(touch1, touch2);
      
      if (this.lastTouchDistance > 0) {
        const zoomFactor = currentDistance / this.lastTouchDistance;
        
        // Get center point between fingers
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        
        if (this.onZoom) {
          this.onZoom(zoomFactor, centerX, centerY);
        }
      }
      
      this.lastTouchDistance = currentDistance;
      
      // Update touch positions
      this.touches.set(touch1.identifier, { x: touch1.clientX, y: touch1.clientY });
      this.touches.set(touch2.identifier, { x: touch2.clientX, y: touch2.clientY });
    }
  }

  private handleTouchEnd(event: TouchEvent): void {
    event.preventDefault();
    
    // Remove ended touches
    const activeTouchIds = new Set();
    for (let i = 0; i < event.touches.length; i++) {
      activeTouchIds.add(event.touches[i].identifier);
    }
    
    for (const touchId of this.touches.keys()) {
      if (!activeTouchIds.has(touchId)) {
        this.touches.delete(touchId);
      }
    }
    
    if (event.touches.length < 2) {
      this.lastTouchDistance = 0;
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const panDistance = 50;
    
    switch (event.code) {
      case 'ArrowLeft':
        event.preventDefault();
        if (this.onPan) this.onPan(panDistance, 0);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (this.onPan) this.onPan(-panDistance, 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.onPan) this.onPan(0, panDistance);
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (this.onPan) this.onPan(0, -panDistance);
        break;
      case 'Equal':
      case 'NumpadAdd':
        event.preventDefault();
        if (this.onZoom) this.onZoom(1 / 1.5);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        event.preventDefault();
        if (this.onZoom) this.onZoom(1.5);
        break;
      case 'Space':
        event.preventDefault();
        // Could be used for pause/resume in the future
        break;
    }
  }

  private getTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  dispose(): void {
    // Remove all event listeners
    this.canvas.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.removeEventListener('wheel', this.handleWheel.bind(this));
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu.bind(this));
    this.canvas.removeEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.removeEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.removeEventListener('touchend', this.handleTouchEnd.bind(this));
    this.canvas.removeEventListener('touchcancel', this.handleTouchEnd.bind(this));
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    
    this.touches.clear();
  }
}