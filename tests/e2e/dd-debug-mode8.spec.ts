import { test } from '@playwright/test';

test('debug mode 8 - standard coords with DD iteration', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Normal DD render at 1e-6 (broken)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-6,
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/debug8-normal-dd.png' });

  // Debug mode 8 - use standard coords with DD iteration
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(8);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/debug8-standard-coords.png' });

  console.log('Compare: If debug8 shows fractal, issue is in pixelToComplexDD');
  console.log('         If debug8 is also broken, issue is in mandelbrotDD');
});
