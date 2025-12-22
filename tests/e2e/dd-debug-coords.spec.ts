import { test } from '@playwright/test';

test('compare standard vs DD coordinates', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test at 1e-5 (STANDARD) with debug mode 2
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(2); // Coordinate visualization
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-5,
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/coords-1e-5-standard.png' });

  // Test at 1e-6 (DD) with debug mode 2
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({ scale: 1e-6 });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/coords-1e-6-dd.png' });

  // Test at 1e-7 (DD) with debug mode 2
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({ scale: 1e-7 });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/coords-1e-7-dd.png' });

  console.log('Screenshots saved - compare coordinate gradients');
});
