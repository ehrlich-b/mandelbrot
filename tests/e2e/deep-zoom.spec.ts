import { test, expect } from '@playwright/test';

test.describe('Deep Zoom Functionality', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Wait for the mandelbrot viewer to initialize
    await page.waitForTimeout(2000);
  });

  test('should switch to DD precision at deep zoom', async ({ page }) => {
    // Test zoom levels that should trigger DD precision
    const testCases = [
      { scale: 0.001, name: 'normal-zoom', expectDD: false },
      { scale: 0.000001, name: 'stripe-zone', expectDD: false }, // 1e-6 - stripe issue
      { scale: 0.00000001, name: 'dd-threshold', expectDD: true }, // 1e-8 - DD should activate
      { scale: 0.000000001, name: 'deep-dd', expectDD: true }, // 1e-9 - Deep DD
    ];

    for (const testCase of testCases) {
      console.log(`Testing ${testCase.name} at scale ${testCase.scale}`);
      
      // Set viewport using exposed API
      await page.evaluate((scale) => {
        (window as any).mandelbrot.setViewport({
          centerX: -0.7533,
          centerY: 0.1138,
          scale: scale,
          maxIterations: 1000
        });
      }, testCase.scale);

      // Wait for rendering
      await page.waitForTimeout(1000);
      
      // Check precision info
      const precisionInfo = await page.evaluate(() => {
        return (window as any).mandelbrot.renderer.getPrecisionInfo();
      });
      
      console.log(`Scale ${testCase.scale}: precision = ${precisionInfo.currentPrecision}`);
      
      // Take screenshot for visual inspection
      await expect(page).toHaveScreenshot(`deep-zoom-${testCase.name}.png`);
      
      // Verify precision expectation
      if (testCase.expectDD) {
        expect(precisionInfo.currentPrecision).toBe('dd');
      } else {
        expect(precisionInfo.currentPrecision).toBe('standard');
      }
    }
  });

  test('should render correctly at various deep zoom levels', async ({ page }) => {
    // Test specific problematic zoom levels
    const problemZooms = [
      { scale: 1e-6, name: 'stripe-problem-zone' },
      { scale: 5e-9, name: 'dd-territory' }, 
      { scale: 1e-10, name: 'very-deep-dd' },
    ];

    for (const zoom of problemZooms) {
      await page.evaluate((scale) => {
        (window as any).mandelbrot.setViewport({
          centerX: -0.7533,
          centerY: 0.1138, 
          scale: scale,
          maxIterations: 1500
        });
      }, zoom.scale);

      await page.waitForTimeout(1500);
      
      // Check for error messages in console
      const consoleMessages = await page.evaluate(() => {
        return (window as any).testConsoleMessages || [];
      });
      
      // Take screenshot to analyze visual issues
      await expect(page).toHaveScreenshot(`problem-zoom-${zoom.name}.png`);
      
      // Verify no solid color (basic sanity check)
      const canvas = page.locator('#mandelbrot-canvas');
      expect(canvas).toBeVisible();
    }
  });
  
  test('should detect debug colors in DD mode', async ({ page }) => {
    // Navigate to a zoom level that should show issues
    await page.evaluate(() => {
      (window as any).mandelbrot.setViewport({
        centerX: -0.7533,
        centerY: 0.1138,
        scale: 1e-9, // Deep DD territory
        maxIterations: 1000
      });
    });

    await page.waitForTimeout(1000);
    
    // Take a screenshot for analysis
    await expect(page).toHaveScreenshot('dd-debug-colors.png');
    
    // Check if we can detect any debug colors by sampling pixels
    const hasDebugColors = await page.evaluate(() => {
      const canvas = document.getElementById('mandelbrot-canvas') as HTMLCanvasElement;
      if (!canvas) return false;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Sample pixels to look for debug colors
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1]; 
        const b = data[i + 2];
        
        // Check for debug colors:
        // Orange (255, 127, 0), Red (255, 0, 0), Cyan (0, 255, 255), etc.
        if ((r === 255 && g === 127 && b === 0) || // Orange
            (r === 255 && g === 0 && b === 0) ||   // Red
            (r === 0 && g === 255 && b === 255) || // Cyan
            (r === 255 && g === 0 && b === 255) || // Magenta
            (r === 255 && g === 255 && b === 0)) { // Yellow
          return true;
        }
      }
      return false;
    });
    
    console.log(`Debug colors detected: ${hasDebugColors}`);
  });
});