import { test } from '@playwright/test';
import * as fs from 'fs';

test('DD at multiple locations', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test at different locations in the Mandelbrot set boundary
  const locations = [
    { name: 'seahorse', x: -0.745, y: 0.113 },
    { name: 'elephant', x: 0.2925, y: 0.0152 },
    { name: 'minibrot1', x: -0.7436438870, y: 0.1318259043 },
    { name: 'spike', x: -1.768778833, y: -0.001738996 },
    { name: 'bulb2edge', x: -1.0, y: 0.0 },
  ];

  console.log('Comparing standard (1e-5) vs DD (1e-6) at various locations:\n');

  for (const loc of locations) {
    // Standard precision
    await page.evaluate((l) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: l.x,
        centerY: l.y,
        scale: 1e-5,
        maxIterations: 1000
      });
    }, loc);
    await page.waitForTimeout(2000);

    const stdScreenshot = await page.screenshot();
    fs.writeFileSync(`test-results/loc-${loc.name}-std.png`, stdScreenshot);

    // DD precision
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setViewport({ scale: 1e-6 });
    });
    await page.waitForTimeout(2000);

    const ddScreenshot = await page.screenshot();
    fs.writeFileSync(`test-results/loc-${loc.name}-dd.png`, ddScreenshot);

    const ratio = stdScreenshot.length / ddScreenshot.length;
    const status = ratio > 2 ? '❌ BROKEN' : ratio < 0.5 ? '✓ GOOD' : '⚠️ SIMILAR';
    console.log(`${loc.name.padEnd(12)}: std=${stdScreenshot.length}, dd=${ddScreenshot.length}, ratio=${ratio.toFixed(2)} ${status}`);
  }
});
