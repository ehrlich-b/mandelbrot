import { test } from '@playwright/test';

test('debug mode 4 - DD iteration count visualization', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // First: Standard precision baseline with debug mode 4
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-5,  // Standard precision
      maxIterations: 1000
    });
    viewer.setDebugMode(4);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/mode4-1e-5.png' });
  console.log('1. Mode 4 at 1e-5 (STANDARD): Should show iteration count gradient');

  // DD precision scale
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({ scale: 1e-6 });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/mode4-1e-6.png' });
  console.log('2. Mode 4 at 1e-6 (DD): Compare to baseline');

  // Also check with debug mode 0 (normal) at 1e-5 to see expected fractal
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
    viewer.setViewport({ scale: 1e-5 });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/normal-1e-5.png' });
  console.log('3. Normal at 1e-5: Expected fractal detail');

  // Normal at 1e-6 (broken?)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({ scale: 1e-6 });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/normal-1e-6.png' });
  console.log('4. Normal at 1e-6: Should show fractal, currently broken');

});
