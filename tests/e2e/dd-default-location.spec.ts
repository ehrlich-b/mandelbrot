import { test } from '@playwright/test';

test('test zoom at default location', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Precision')) {
      console.log(`[Browser] ${text}`);
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test at default location (-0.5, 0) - this is an interior point!
  const scales = [1e-5, 1e-6, 1e-7, 1e-8];

  for (const scale of scales) {
    console.log(`\n=== Scale ${scale} at (-0.5, 0) ===`);

    await page.evaluate((s) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: -0.5,  // DEFAULT - this is INSIDE the Mandelbrot set!
        centerY: 0,
        scale: s,
        maxIterations: 1000
      });
    }, scale);

    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      return (window as any).mandelbrot.renderer.getPrecisionInfo();
    });
    console.log(`Precision: ${info.currentPrecision}`);

    const scaleName = scale.toExponential(0).replace('+', '');
    await page.screenshot({ path: `test-results/default-${scaleName}.png` });
  }
});
