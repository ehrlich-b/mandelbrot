import { test } from '@playwright/test';
import * as fs from 'fs';

test('location and scale matrix test', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const locations = [
    { name: 'seahorse', x: -0.745, y: 0.113 },
    { name: 'minibrot', x: -0.7436438870, y: 0.1318259043 },
  ];

  const scales = [4.9e-6, 1e-6];

  console.log('\nLocation × Scale Matrix:\n');
  console.log('Location   | 4.9e-6 (KB) | 1e-6 (KB)  | Ratio');
  console.log('-----------|-------------|------------|------');

  for (const loc of locations) {
    const results: number[] = [];
    for (const scale of scales) {
      await page.evaluate(({ l, s }) => {
        const viewer = (window as any).mandelbrot;
        viewer.setDebugMode(0);
        viewer.setViewport({
          centerX: l.x,
          centerY: l.y,
          scale: s,
          maxIterations: 1000
        });
      }, { l: loc, s: scale });
      await page.waitForTimeout(2000);

      const screenshot = await page.screenshot();
      const scaleName = scale.toExponential(1).replace('+', '');
      fs.writeFileSync(`test-results/matrix-${loc.name}-${scaleName}.png`, screenshot);
      results.push(screenshot.length);
    }
    const ratio = (results[0] / results[1]).toFixed(2);
    const kb1 = (results[0] / 1024).toFixed(0);
    const kb2 = (results[1] / 1024).toFixed(0);
    console.log(`${loc.name.padEnd(10)} | ${kb1.padStart(11)} | ${kb2.padStart(10)} | ${ratio}x`);
  }
});
