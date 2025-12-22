import { test } from '@playwright/test';
import * as fs from 'fs';

test('compare working vs broken DD scales', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Working scale (4.9e-6)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 4.9e-6,
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(2000);
  const working = await page.screenshot();
  fs.writeFileSync('test-results/dd-scale-working.png', working);
  console.log('Working (4.9e-6):', working.length, 'bytes');

  // Broken scale (1e-6) 
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({ scale: 1e-6 });
  });
  await page.waitForTimeout(2000);
  const broken = await page.screenshot();
  fs.writeFileSync('test-results/dd-scale-broken.png', broken);
  console.log('Broken (1e-6):', broken.length, 'bytes');
  
  console.log('Ratio:', (working.length / broken.length).toFixed(2) + 'x');
});
