import { test } from '@playwright/test';

test('test at guaranteed boundary', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // The main cardioid boundary at x=-0.75 has fractal detail at all scales
  // Let's test near the boundary of the period-2 bulb
  const cx = -1.25;  // On the boundary of period-2 bulb
  const cy = 0.0;

  const scales = [1e-6, 1e-7, 1e-8, 1e-9, 1e-10];

  for (const scale of scales) {
    await page.evaluate(({ cx, cy, s }) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: cx,
        centerY: cy,
        scale: s,
        maxIterations: 2000
      });
    }, { cx, cy, s: scale });

    await page.waitForTimeout(2500);
    const scaleName = scale.toExponential(0).replace('+', '');
    await page.screenshot({ path: `test-results/boundary-${scaleName}.png` });
    console.log(`Scale ${scale} saved`);
  }
});
