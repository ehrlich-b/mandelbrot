import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test('analyze DD screenshot colors', async ({ page }) => {
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

  // First test STANDARD precision (1e-5) to compare
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
    viewer.setViewport({ scale: 1e-5 });
  });
  await page.waitForTimeout(2000);

  // Take a screenshot and use Playwright's image capabilities
  const screenshot1e5 = await page.screenshot();
  fs.writeFileSync('test-results/analyze-1e-5.png', screenshot1e5);

  // Now test DD precision (1e-6)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({ scale: 1e-6 });
  });
  await page.waitForTimeout(2000);

  const screenshot1e6 = await page.screenshot();
  fs.writeFileSync('test-results/analyze-1e-6.png', screenshot1e6);

  // Compare file sizes - larger = more detail
  const size1e5 = screenshot1e5.length;
  const size1e6 = screenshot1e6.length;

  console.log(`1e-5 (STANDARD) screenshot: ${size1e5} bytes`);
  console.log(`1e-6 (DD) screenshot: ${size1e6} bytes`);
  console.log(`Ratio: ${(size1e5 / size1e6).toFixed(2)}x`);

  if (size1e5 > size1e6 * 3) {
    console.log('⚠️  DD screenshot is much smaller - likely uniform/broken');
  }

  // Use expect with toMatchSnapshot for visual comparison
  // This will fail if the DD version looks different from expected
});
