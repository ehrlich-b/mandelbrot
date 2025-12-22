import { test } from '@playwright/test';

test('debug modes 13-15 - DD arithmetic verification', async ({ page }) => {
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

  // Mode 13: Test (0.5+0.5)^2 = 1.0
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(13);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/mode13-dd-arith.png' });
  console.log('Mode 13: Should be GREEN (g=1.0) if 1²=1 computed correctly');

  // Mode 14: Test complex (1+0i)² = 1+0i
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(14);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/mode14-complex-sqr.png' });
  console.log('Mode 14: Should be GREEN (g=1.0, b=0) if (1+0i)²=1+0i');

  // Mode 15: Show z after one iteration (should equal c)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(15);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/mode15-first-iter.png' });
  console.log('Mode 15: Shows z after first iteration - should show gradient if c varies');

  // Also compare with mode 2 which shows coordinate gradient
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(2);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/mode2-coords-again.png' });
  console.log('Mode 2: Coordinate gradient for comparison');
});
