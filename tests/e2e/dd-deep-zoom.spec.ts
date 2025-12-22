import { test, expect } from '@playwright/test';

/**
 * DD Shader at very deep zoom levels - tests extended precision
 */
test.describe('DD Shader Deep Zoom', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Precision')) {
        console.log(`[Browser] ${text}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('scale 1e-8 at boundary location', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: -0.7453,
        centerY: 0.1127,
        scale: 1e-8,  // Very deep zoom
        maxIterations: 2000
      });
    });

    await page.waitForTimeout(4000);

    const info = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('Scale 1e-8 precision:', info);
    expect(info.currentPrecision).toBe('dd');

    await page.screenshot({ path: 'test-results/dd-scale-1e-8.png' });

    await expect(page).toHaveScreenshot('dd-scale-1e-8.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('scale 1e-9 at boundary location', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: -0.7453,
        centerY: 0.1127,
        scale: 1e-9,  // Extremely deep zoom
        maxIterations: 3000
      });
    });

    await page.waitForTimeout(5000);

    const info = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('Scale 1e-9 precision:', info);
    expect(info.currentPrecision).toBe('dd');

    await page.screenshot({ path: 'test-results/dd-scale-1e-9.png' });

    await expect(page).toHaveScreenshot('dd-scale-1e-9.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('scale 1e-10 - pushing DD limits', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: -0.7453,
        centerY: 0.1127,
        scale: 1e-10,  // Near DD precision limit
        maxIterations: 4000
      });
    });

    await page.waitForTimeout(6000);

    const info = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('Scale 1e-10 precision:', info);
    expect(info.currentPrecision).toBe('dd');

    await page.screenshot({ path: 'test-results/dd-scale-1e-10.png' });

    await expect(page).toHaveScreenshot('dd-scale-1e-10.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
