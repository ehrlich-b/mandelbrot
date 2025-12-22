import { test } from '@playwright/test';

test('debug modes 10-12 - DD coordinate and magnitude analysis', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Set to DD scale
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-6,
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(2000);

  // Mode 10: |c|² after first iteration
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(10);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/mode10-c_magnitude.png' });
  console.log('Mode 10: |c|² - should show ~0.568 (yellowish) for all pixels');

  // Mode 11: c_dd.x (real hi part)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(11);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/mode11-c_hi.png' });
  console.log('Mode 11: c_dd.x (hi part) - should be uniform ~0.255 (purple-ish)');

  // Mode 12: c_dd.y (real lo part) variation
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(12);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/mode12-c_lo.png' });
  console.log('Mode 12: c_dd.y (lo part) - should show GRADIENT if DD coords work');

  // Compare with mode 2 (the working coordinate visualization)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(2);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/mode2-comparison.png' });
  console.log('Mode 2: Coordinate visualization - known to show gradient');
});
