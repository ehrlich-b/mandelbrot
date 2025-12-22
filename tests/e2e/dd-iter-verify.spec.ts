import { test } from '@playwright/test';

test('verify iteration variation at deep zoom', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test at seahorse valley boundary where we expect fractal detail
  const cx = -0.745;
  const cy = 0.113;

  const scales = [1e-6, 1e-8, 1e-10];

  for (const scale of scales) {
    await page.evaluate(({ cx, cy, s }) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(4);  // Iteration count visualization
      viewer.setViewport({
        centerX: cx,
        centerY: cy,
        scale: s,
        maxIterations: 500
      });
    }, { cx, cy, s: scale });

    await page.waitForTimeout(2000);
    const scaleName = scale.toExponential(0).replace('+', '');
    await page.screenshot({ path: `test-results/iter-debug-${scaleName}.png` });
    console.log(`Iter debug at ${scale}`);
  }
});
