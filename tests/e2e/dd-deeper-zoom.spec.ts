import { test } from '@playwright/test';

test('zoom deeper at user location', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Precision') || text.includes('DD:') || text.includes('error')) {
      console.log(`[Browser] ${text}`);
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Start at user's location and zoom deeper
  const scales = [1e-7, 5e-8, 1e-8, 5e-9, 1e-9, 1e-10];

  for (const scale of scales) {
    console.log(`\n=== Scale ${scale} ===`);

    await page.evaluate((s) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: -0.7342720,
        centerY: 0.2098246,
        scale: s,
        maxIterations: 2000
      });
    }, scale);

    await page.waitForTimeout(2000);

    const scaleName = scale.toExponential(0).replace('+', '');
    await page.screenshot({ path: `test-results/deeper-${scaleName}.png` });
  }
});
