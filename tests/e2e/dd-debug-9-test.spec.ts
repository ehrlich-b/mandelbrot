import { test } from '@playwright/test';

test('isolate DD bug: compare debug modes 8 and 9', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // First: Standard precision (1e-5) - baseline, should work
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-5,
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/debug9-baseline-1e-5.png' });
  console.log('1. Baseline (1e-5, STANDARD): Should show fractal detail');

  // DD precision scale (1e-6) - normal rendering (BROKEN)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
    viewer.setViewport({ scale: 1e-6 });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/debug9-normal-1e-6.png' });
  console.log('2. Normal DD (1e-6): Currently broken - solid color');

  // Debug mode 8: STANDARD coords + DD iteration
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(8);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/debug9-mode8-1e-6.png' });
  console.log('3. Mode 8 (standard coords + DD iter): If broken, bug is in mandelbrotDD');

  // Debug mode 9: DD coords + STANDARD iteration
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(9);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/debug9-mode9-1e-6.png' });
  console.log('4. Mode 9 (DD coords + standard iter): If works, confirms DD coords are OK');

  // Summary
  console.log('\n=== DIAGNOSIS ===');
  console.log('If mode 9 shows fractal but mode 8 is broken:');
  console.log('  → Bug is in mandelbrotDD() function or DD arithmetic');
  console.log('If mode 9 is also broken:');
  console.log('  → Bug is in coordinate conversion or DD uniform passing');
});
