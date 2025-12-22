import { test } from '@playwright/test';
import * as fs from 'fs';

test('debug mode screenshot', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // First take normal render
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-6,
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(1000);
  const normal = await page.screenshot();
  fs.writeFileSync('test-results/verify-normal.png', normal);
  console.log('Normal render:', normal.length, 'bytes');

  // Then set debug mode 6
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    console.log('Setting debug mode 6');
    viewer.setDebugMode(6);
  });
  await page.waitForTimeout(1000);
  const debug6 = await page.screenshot();
  fs.writeFileSync('test-results/verify-debug6.png', debug6);
  console.log('Debug mode 6:', debug6.length, 'bytes');

  // Check if setDebugMode exists
  const hasMethod = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    return typeof viewer.setDebugMode === 'function';
  });
  console.log('Has setDebugMode:', hasMethod);
});
