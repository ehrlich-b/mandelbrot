import { test } from '@playwright/test';

test('DD iteration count analysis', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Set to seahorse valley at DD scale
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

  // Use mode 4 to visualize iteration counts
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(4);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/iter-analysis-mode4.png' });

  // Check what the mandelbrotDD returns
  // Add a debug mode that shows whether points escape or not
  console.log('Mode 4 visualization shows iteration count (red=few, green=many)');
  console.log('If all pixels are the same color, all have same iteration count');

  // Normal render
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/iter-analysis-normal.png' });

  // Get file info
  const fs = require('fs');
  const mode4Size = fs.statSync('test-results/iter-analysis-mode4.png').size;
  const normalSize = fs.statSync('test-results/iter-analysis-normal.png').size;
  console.log(`Mode 4 size: ${mode4Size} bytes`);
  console.log(`Normal size: ${normalSize} bytes`);

  // If mode 4 shows very low variation (small file), it means all pixels
  // have similar iteration counts - could be interior (all hit maxIter)
  // or all escape at same iteration
  if (mode4Size < 60000) {
    console.log('⚠️ Mode 4 shows uniform iterations - possible interior point or precision issue');
  }
});
