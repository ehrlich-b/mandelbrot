import { test } from '@playwright/test';

test('test at user location', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Precision') || text.includes('DD:')) {
      console.log(`[Browser] ${text}`);
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // User's exact location
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
    viewer.setViewport({
      centerX: -0.7342720,
      centerY: 0.2098246,
      scale: 1.082e-7,
      maxIterations: 1479
    });
  });

  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    return (window as any).mandelbrot.renderer.getPrecisionInfo();
  });
  console.log('Precision info:', info);

  await page.screenshot({ path: 'test-results/user-location.png' });
  console.log('Screenshot saved to test-results/user-location.png');
});
