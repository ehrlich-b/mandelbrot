import { test } from '@playwright/test';

test('debug mode 4 at deep zoom', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test debug mode 4 (iteration counts) at various scales
  const scales = [1e-7, 1e-8, 1e-9, 1e-10];

  for (const scale of scales) {
    await page.evaluate((s) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(4);  // Show iteration counts
      viewer.setViewport({
        centerX: -0.7342720,
        centerY: 0.2098246,
        scale: s,
        maxIterations: 1000
      });
    }, scale);

    await page.waitForTimeout(2000);
    const scaleName = scale.toExponential(0).replace('+', '');
    await page.screenshot({ path: `test-results/debug4-${scaleName}.png` });
    console.log(`Debug mode 4 at ${scale} saved`);
  }
});
