import { test } from '@playwright/test';

test('zoom precision test - simulates many zoom steps', async ({ page }) => {
  page.on('console', msg => {
    if (msg.text().includes('Precision')) console.log(`[Browser] ${msg.text()}`);
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Simulate 30 zoom-in operations programmatically
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    for (let i = 0; i < 30; i++) {
      // Get current viewport
      const vp = viewer.getViewport();
      // Zoom in by factor of 2
      viewer.setViewport({
        scale: vp.scale / 2
      });
    }
  });

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/zoom-precision-30x.png' });

  const info = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    return {
      scale: viewer.getViewport().scale,
      centerX: viewer.getViewport().centerX,
      centerY: viewer.getViewport().centerY,
      precision: viewer.renderer.getPrecisionInfo().currentPrecision
    };
  });
  console.log('After 30 zooms (2^30 = billion x):', info);
});
