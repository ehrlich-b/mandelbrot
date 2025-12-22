import { test } from '@playwright/test';

test('debug mode 2 at deep zoom', async ({ page }) => {
  page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test debug mode 2 (coordinate visualization) at 1e-9
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(2);  // Show coordinate offsets as colors
    viewer.setViewport({
      centerX: -0.7342720,
      centerY: 0.2098246,
      scale: 1e-9,
      maxIterations: 1000
    });
  });

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/debug2-scale-1e-9.png' });
  console.log('Debug mode 2 at 1e-9 saved');

  // Also test at 1e-10
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({ scale: 1e-10 });
  });

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/debug2-scale-1e-10.png' });
  console.log('Debug mode 2 at 1e-10 saved');
});
