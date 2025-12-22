import { test } from '@playwright/test';
import * as fs from 'fs';

test('final DD check', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test at multiple scales
  const scales = [1e-5, 5e-6, 1e-6, 5e-7];

  for (const scale of scales) {
    await page.evaluate((s) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: -0.745,
        centerY: 0.113,
        scale: s,
        maxIterations: 1000
      });
    }, scale);
    await page.waitForTimeout(2000);

    const precision = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });

    const screenshot = await page.screenshot();
    const name = scale.toExponential(0).replace('+', '').replace('-', 'm');
    fs.writeFileSync(`test-results/final-${name}.png`, screenshot);
    console.log(`Scale ${scale.toExponential(0)}: ${screenshot.length} bytes (${precision.currentPrecision})`);
  }
});
