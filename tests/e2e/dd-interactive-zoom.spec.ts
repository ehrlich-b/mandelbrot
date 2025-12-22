import { test } from '@playwright/test';

test('simulate interactive zoom to deep level', async ({ page }) => {
  page.on('console', msg => {
    if (msg.text().includes('Precision')) console.log(`[Browser] ${msg.text()}`);
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Zoom in incrementally like a user would
  const canvas = page.locator('#mandelbrot-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('No canvas');

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // Zoom in 50 times (simulating scroll wheel)
  for (let i = 0; i < 50; i++) {
    await page.mouse.move(centerX, centerY);
    await page.mouse.wheel(0, -200); // Scroll up = zoom in (larger delta)
    await page.waitForTimeout(100);
  }

  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/interactive-zoom-deep.png' });

  // Check the final scale
  const info = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    return {
      scale: viewer.getViewport().scale,
      precision: viewer.renderer.getPrecisionInfo().currentPrecision
    };
  });
  console.log('After 20 zooms:', info);
});
