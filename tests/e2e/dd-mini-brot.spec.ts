import { test } from '@playwright/test';

test('mini-mandelbrot at deep zoom', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // A mini-mandelbrot exists at this location - guaranteed fractal detail
  // This is a famous "mini-brot" in the antenna region
  const cx = -1.9407998324;
  const cy = 0.0;

  const scales = [1e-4, 1e-5, 1e-6, 1e-7, 1e-8];

  for (const scale of scales) {
    await page.evaluate(({ cx, cy, s }) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: cx,
        centerY: cy,
        scale: s,
        maxIterations: 5000
      });
    }, { cx, cy, s: scale });

    await page.waitForTimeout(3000);
    const scaleName = scale.toExponential(0).replace('+', '');
    await page.screenshot({ path: `test-results/mini-brot-${scaleName}.png` });
    console.log(`Scale ${scale} saved`);
  }
});
