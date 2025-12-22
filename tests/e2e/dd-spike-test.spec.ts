import { test } from '@playwright/test';

test('test at spike tip boundary', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // The "spike" tip of the Mandelbrot set at x = -2 has fractal detail at every scale
  // Actually, let's use a mini-Mandelbrot location where there's guaranteed detail
  // Mini-brot at: -1.7685959609491892, 0.001724703819329438

  const locations = [
    { name: 'spike-tip', cx: -1.768, cy: 0.0017 },
    { name: 'seahorse-boundary', cx: -0.745, cy: 0.113 },
    { name: 'elephant-boundary', cx: 0.275, cy: 0.006 },
  ];

  for (const loc of locations) {
    console.log(`\n=== Testing ${loc.name} ===`);

    for (const scale of [1e-8, 1e-9, 1e-10]) {
      await page.evaluate(({ cx, cy, s }) => {
        const viewer = (window as any).mandelbrot;
        viewer.setDebugMode(0);  // Normal render
        viewer.setViewport({
          centerX: cx,
          centerY: cy,
          scale: s,
          maxIterations: 2000
        });
      }, { cx: loc.cx, cy: loc.cy, s: scale });

      await page.waitForTimeout(2000);
      const scaleName = scale.toExponential(0).replace('+', '');
      await page.screenshot({ path: `test-results/${loc.name}-${scaleName}.png` });
    }
  }
});
