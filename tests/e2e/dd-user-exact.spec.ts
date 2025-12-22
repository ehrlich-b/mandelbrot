import { test } from '@playwright/test';

test('user exact location', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // User's exact location
  const cx = -0.6656005;
  const cy = 0.3539433;
  const scale = 1.456e-8;

  // Normal render
  await page.evaluate(({ cx, cy, s }) => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
    viewer.setViewport({ centerX: cx, centerY: cy, scale: s, maxIterations: 1623 });
  }, { cx, cy, s: scale });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/user-exact-normal.png' });

  // Debug mode 2 - coordinates
  await page.evaluate(() => {
    (window as any).mandelbrot.setDebugMode(2);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/user-exact-coords.png' });

  // Debug mode 4 - iterations
  await page.evaluate(() => {
    (window as any).mandelbrot.setDebugMode(4);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/user-exact-iters.png' });
});
