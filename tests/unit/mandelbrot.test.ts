import { describe, it, expect } from 'vitest';

// Test basic Mandelbrot math functions that could be extracted
describe('Mandelbrot Mathematics', () => {
  
  it('should calculate zoom level correctly', () => {
    const calculateZoomLevel = (scale: number) => Math.log2(2.5 / scale);
    
    expect(calculateZoomLevel(2.5)).toBe(0); // No zoom
    expect(calculateZoomLevel(1.25)).toBe(1); // 2x zoom
    expect(calculateZoomLevel(0.625)).toBe(2); // 4x zoom
  });

  it('should auto-adjust iterations based on zoom', () => {
    const calculateIterations = (scale: number) => {
      const zoomLevel = Math.log2(2.5 / scale);
      return Math.min(8192, Math.max(256, Math.floor(256 + zoomLevel * 50)));
    };

    expect(calculateIterations(2.5)).toBe(256); // Base level
    expect(calculateIterations(1.25)).toBe(306); // Zoomed in
    expect(calculateIterations(0.001)).toBeGreaterThan(1000); // Deep zoom
  });

  it('should convert screen coordinates to complex plane', () => {
    const screenToComplex = (
      screenX: number,
      screenY: number,
      canvasWidth: number,
      canvasHeight: number,
      centerX: number,
      centerY: number,
      scale: number
    ) => {
      const aspectRatio = canvasWidth / canvasHeight;
      const u = (screenX / canvasWidth - 0.5) * aspectRatio;
      const v = (screenY / canvasHeight - 0.5);
      
      return {
        x: centerX + u * scale,
        y: centerY + v * scale,
      };
    };

    const result = screenToComplex(400, 300, 800, 600, -0.5, 0, 2.5);
    
    expect(result.x).toBeCloseTo(-0.5); // Center of screen maps to center
    expect(result.y).toBeCloseTo(0);
  });

  it('should calculate distance between touches', () => {
    const getTouchDistance = (
      x1: number,
      y1: number,
      x2: number,
      y2: number
    ) => {
      const dx = x1 - x2;
      const dy = y1 - y2;
      return Math.sqrt(dx * dx + dy * dy);
    };

    expect(getTouchDistance(0, 0, 3, 4)).toBe(5); // 3-4-5 triangle
    expect(getTouchDistance(0, 0, 0, 0)).toBe(0); // Same point
  });
});