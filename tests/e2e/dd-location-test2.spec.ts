import { test } from '@playwright/test';
import * as fs from 'fs';

test('test different locations at deep zoom', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const locations = [
    { name: 'seahorse', x: -0.745, y: 0.113 },
    { name: 'minibrot', x: -0.7436438870, y: 0.1318259043 },
    { name: 'spiral', x: -0.761574, y: -0.0847596 },
  ];

  console.log('\nComparing locations at 1e-6 scale (DD mode):\n');

  for (const loc of locations) {
    await page.evaluate((l) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: l.x,
        centerY: l.y,
        scale: 1e-6,
        maxIterations: 1000
      });
    }, loc);
    await page.waitForTimeout(2000);

    const screenshot = await page.screenshot();
    fs.writeFileSync(`test-results/loc-${loc.name}-1e-6.png`, screenshot);
    const padded = loc.name.padEnd(10);
    console.log(`${padded}: ${screenshot.length} bytes at 1e-6`);
  }
});
