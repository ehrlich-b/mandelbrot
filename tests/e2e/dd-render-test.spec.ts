import { test, expect } from '@playwright/test';

/**
 * DD Shader Rendering Tests - Uses screenshots for validation
 * (gl.readPixels doesn't work with preserveDrawingBuffer: false)
 */
test.describe('DD Shader Rendering', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('DD:') || text.includes('Precision') || text.includes('debug')) {
        console.log(`[Browser] ${msg.type()}: ${text}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('debug mode 1: DD path is taken (solid red)', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(1);  // Solid red if DD path is taken
      viewer.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 1e-7,
        maxIterations: 100
      });
    });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/dd-mode-1-red.png' });

    // Verify using screenshot comparison (first run creates baseline)
    await expect(page).toHaveScreenshot('dd-mode-1-should-be-red.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('debug mode 2: coordinate offsets as colors', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(2);  // Shows coordinate offsets as RGB
      viewer.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 1e-7,
        maxIterations: 100
      });
    });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/dd-mode-2-coords.png' });

    // Should show a gradient - not solid black or solid color
    await expect(page).toHaveScreenshot('dd-mode-2-coords.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('debug mode 4: iteration counts as colors', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(4);  // Shows iteration count as color
      viewer.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 1e-7,
        maxIterations: 100
      });
    });

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/dd-mode-4-iters.png' });

    await expect(page).toHaveScreenshot('dd-mode-4-iters.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('normal DD render at deep zoom', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);  // Normal rendering
      viewer.setViewport({
        centerX: -0.5,
        centerY: 0,
        scale: 1e-7,
        maxIterations: 500
      });
    });

    await page.waitForTimeout(3000);

    // Check precision
    const info = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('Precision info:', info);
    expect(info.currentPrecision).toBe('dd');

    await page.screenshot({ path: 'test-results/dd-normal-render.png' });

    // The screenshot should NOT be solid black - should show Mandelbrot detail
    await expect(page).toHaveScreenshot('dd-normal-render.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
