import { test } from '@playwright/test';

test('verify precision fix with coordinate debug', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Use debug mode 2 to visualize coordinates at different scales
  const scales = [1e-6, 1e-8, 1e-10, 1e-12];

  for (const scale of scales) {
    await page.evaluate((s) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(2);  // Coordinate visualization
      viewer.setViewport({
        centerX: -0.75,
        centerY: 0.1,
        scale: s,
        maxIterations: 100
      });
    }, scale);

    await page.waitForTimeout(1500);
    const scaleName = scale.toExponential(0).replace('+', '');
    await page.screenshot({ path: `test-results/coord-debug-${scaleName}.png` });
    console.log(`Coord debug at ${scale} saved`);
  }
});
