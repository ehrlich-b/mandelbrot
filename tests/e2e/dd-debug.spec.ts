import { test, expect } from '@playwright/test';

/**
 * DD Shader Debug Tests
 *
 * These tests use the debug mode to diagnose DD shader issues.
 * Run with: npx playwright test tests/e2e/dd-debug.spec.ts --headed
 */
test.describe('DD Shader Debug', () => {

  test.beforeEach(async ({ page }) => {
    // Capture console logs
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('DD:') || text.includes('Precision') || text.includes('debug')) {
        console.log(`[Browser Console] ${msg.type()}: ${text}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('debug mode 6: UNCONDITIONAL green at start of main()', async ({ page }) => {
    // Set debug mode 6 and trigger DD mode
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(6);
      viewer.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 1e-7, // Deep enough to trigger DD
        maxIterations: 100
      });
    });

    await page.waitForTimeout(1000);

    // Take screenshot for visual inspection and save to test-results
    await page.screenshot({ path: 'test-results/debug-mode-6.png' });
    console.log('Screenshot saved to test-results/debug-mode-6.png');

    // Use toHaveScreenshot - first run creates baseline
    await expect(page).toHaveScreenshot('debug-mode-6-green.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('debug mode 5: verify shader is running (solid blue)', async ({ page }) => {
    // Set debug mode 5 (solid blue - runs BEFORE DD check)
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(5);
      viewer.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 1e-7, // Deep enough to trigger DD
        maxIterations: 100
      });
    });

    await page.waitForTimeout(1500);

    // Sample pixel - should be blue (0, 0, 255)
    const pixelColor = await page.evaluate(() => {
      const canvas = document.getElementById('mandelbrot-canvas') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2');
      if (!gl) return { error: 'No WebGL2' };

      const pixel = new Uint8Array(4);
      gl.readPixels(400, 300, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
    });

    console.log('Debug mode 5 pixel (should be blue):', pixelColor);
    expect(pixelColor.b).toBeGreaterThan(200);  // Should be blue
    expect(pixelColor.r).toBeLessThan(50);       // Not red
    expect(pixelColor.g).toBeLessThan(50);       // Not green
  });

  test('debug mode 1: verify DD path is taken (solid red)', async ({ page }) => {
    // Set debug mode 1 (solid red - runs INSIDE DD check)
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(1);
      viewer.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 1e-7, // Deep enough to trigger DD
        maxIterations: 100
      });
    });

    await page.waitForTimeout(1500);

    // Check precision is DD
    const precisionInfo = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('Precision info:', precisionInfo);
    expect(precisionInfo.currentPrecision).toBe('dd');

    // Sample pixel - should be red (255, 0, 0) if DD path is taken
    const pixelColor = await page.evaluate(() => {
      const canvas = document.getElementById('mandelbrot-canvas') as HTMLCanvasElement;
      const gl = canvas.getContext('webgl2');
      if (!gl) return { error: 'No WebGL2' };

      const pixel = new Uint8Array(4);
      gl.readPixels(400, 300, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
    });

    console.log('Debug mode 1 pixel (should be red if DD active):', pixelColor);

    // If this is black, the DD path is not being taken
    // If this is red, the DD path IS being taken but something else is wrong
    if (pixelColor.r === 0 && pixelColor.g === 0 && pixelColor.b === 0) {
      console.log('DIAGNOSIS: DD path is NOT being taken - u_use_dd_precision may be false');
    } else if (pixelColor.r > 200) {
      console.log('DIAGNOSIS: DD path IS being taken correctly');
    }

    expect(pixelColor.r).toBeGreaterThan(200);  // Should be red
  });

  test('debug mode 2: should show coordinate offsets', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(2);
      viewer.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 1e-7,
        maxIterations: 100
      });
    });

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('dd-debug-mode-2-coords.png');
  });

  test('debug mode 4: should show iteration counts as colors', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(4);
      viewer.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 1e-7,
        maxIterations: 100
      });
    });

    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('dd-debug-mode-4-iterations.png');
  });

  test('standard vs DD: compare same location at different scales', async ({ page }) => {
    // First, render at standard precision (scale 0.01)
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);  // Normal rendering
      viewer.setViewport({
        centerX: -0.75,
        centerY: 0.1,
        scale: 0.01,
        maxIterations: 500
      });
    });
    await page.waitForTimeout(1500);

    const standardPrecision = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('Standard precision check:', standardPrecision);
    expect(standardPrecision.currentPrecision).toBe('standard');

    await expect(page).toHaveScreenshot('compare-standard-precision.png');

    // Now zoom to DD territory
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setViewport({
        scale: 1e-7  // Keep same center, just zoom in
      });
    });
    await page.waitForTimeout(1500);

    const ddPrecision = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('DD precision check:', ddPrecision);
    expect(ddPrecision.currentPrecision).toBe('dd');

    await expect(page).toHaveScreenshot('compare-dd-precision.png');
  });
});
