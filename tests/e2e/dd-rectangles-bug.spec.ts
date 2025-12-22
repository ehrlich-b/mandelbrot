import { test, expect } from '@playwright/test';

/**
 * Test DD rendering at exact scales using setViewport() - NO MOUSE WHEEL
 */
test.describe('DD Rectangular Blocks Bug', () => {

  test('capture at exact scales', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Exact scales to test - using setViewport() ONLY
    const scales = [1e-5, 5e-6, 1e-6, 5e-7, 1e-7, 5e-8, 1e-8];

    for (const scale of scales) {
      // Set EXACT viewport - no mouse interaction
      await page.evaluate((s) => {
        const viewer = (window as any).mandelbrot;
        viewer.setViewport({
          centerX: -0.745,
          centerY: 0.113,
          scale: s,
          maxIterations: 2000
        });
      }, scale);

      // Wait for render
      await page.waitForTimeout(2000);

      // Get actual values
      const info = await page.evaluate(() => {
        const vp = (window as any).mandelbrot.getViewport();
        const prec = (window as any).mandelbrot.renderer.getPrecisionInfo();
        return {
          scale: vp.scale,
          centerX: vp.centerX,
          centerY: vp.centerY,
          precision: prec.currentPrecision
        };
      });

      const name = scale.toExponential(0).replace('+', '').replace('-', 'm');
      console.log(`\nScale ${scale}:`);
      console.log(`  Actual scale: ${info.scale}`);
      console.log(`  Center: (${info.centerX}, ${info.centerY})`);
      console.log(`  Precision: ${info.precision}`);

      await page.screenshot({ path: `test-results/exact-${name}.png` });
    }
  });
});
