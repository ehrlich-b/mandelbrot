import { test, expect } from '@playwright/test';

/**
 * Test DD shader at transition points
 */
test.describe('DD Transition Debug', () => {

  test('capture screenshots at various scales', async ({ page }) => {
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Precision') || text.includes('DD:')) {
        console.log(`[Browser] ${text}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const scales = [
      1e-5,   // Should be standard precision
      5e-6,   // Transition point
      1e-6,   // DD precision
      5e-7,
      1e-7,
      5e-8,
      1e-8,   // User reports issue here
      5e-9,
      1e-9,
    ];

    for (const scale of scales) {
      console.log(`\n=== Testing scale ${scale} ===`);

      await page.evaluate((s) => {
        const viewer = (window as any).mandelbrot;
        viewer.setDebugMode(0);  // Normal rendering
        viewer.setViewport({
          centerX: -0.7453,  // Seahorse valley
          centerY: 0.1127,
          scale: s,
          maxIterations: 1000
        });
      }, scale);

      await page.waitForTimeout(2000);

      const info = await page.evaluate(() => {
        return (window as any).mandelbrot.renderer.getPrecisionInfo();
      });
      console.log(`Precision: ${info.currentPrecision}, scale: ${info.scale}`);

      const scaleName = scale.toExponential(0).replace('+', '');
      await page.screenshot({ path: `test-results/scale-${scaleName}.png` });
    }
  });
});
