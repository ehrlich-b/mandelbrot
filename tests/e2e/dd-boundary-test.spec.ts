import { test, expect } from '@playwright/test';

/**
 * DD Shader at boundary locations - should show fractal detail
 */
test.describe('DD Shader at Interesting Locations', () => {

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('DD:') || text.includes('Precision')) {
        console.log(`[Browser] ${msg.type()}: ${text}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  // Seahorse valley - classic deep zoom location
  test('seahorse valley at deep zoom', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        // Seahorse valley coordinates
        centerX: -0.7453,
        centerY: 0.1127,
        scale: 1e-6,
        maxIterations: 1000
      });
    });

    await page.waitForTimeout(3000);

    const info = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('Precision:', info);

    await page.screenshot({ path: 'test-results/dd-seahorse.png' });

    // First run creates baseline
    await expect(page).toHaveScreenshot('dd-seahorse.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Elephant valley
  test('elephant valley at deep zoom', async ({ page }) => {
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        // Elephant valley coordinates
        centerX: 0.275,
        centerY: 0.0,
        scale: 1e-6,
        maxIterations: 1000
      });
    });

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/dd-elephant.png' });

    await expect(page).toHaveScreenshot('dd-elephant.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Compare standard vs DD at same location
  test('standard vs DD comparison', async ({ page }) => {
    const location = {
      centerX: -0.75,
      centerY: 0.1,
      maxIterations: 500
    };

    // First render at standard precision (scale 0.01)
    await page.evaluate((loc) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        ...loc,
        scale: 0.01
      });
    }, location);

    await page.waitForTimeout(2000);

    const standardInfo = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('Standard precision:', standardInfo);
    expect(standardInfo.currentPrecision).toBe('standard');

    await page.screenshot({ path: 'test-results/compare-standard.png' });

    // Now zoom to DD territory
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setViewport({
        scale: 1e-6
      });
    });

    await page.waitForTimeout(3000);

    const ddInfo = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log('DD precision:', ddInfo);
    expect(ddInfo.currentPrecision).toBe('dd');

    await page.screenshot({ path: 'test-results/compare-dd.png' });
  });
});
