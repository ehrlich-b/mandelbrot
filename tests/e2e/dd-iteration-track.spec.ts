import { test } from '@playwright/test';
import * as fs from 'fs';

test('DD iteration tracking', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Set to DD scale
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-6,
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(1000);

  // Test iteration-tracking debug modes
  const modes = [
    { mode: 17, name: 'c_diff', desc: 'c offset from center' },
    { mode: 20, name: 'z_2iter', desc: 'z after 2 iterations vs center' },
    { mode: 22, name: 'z_5iter', desc: 'z after 5 iterations vs center' },
    { mode: 23, name: 'z_10iter', desc: 'z after 10 iterations vs center' },
    { mode: 21, name: 'z_lo_5', desc: 'LO parts of z after 5 iterations' },
    { mode: 4, name: 'iter_count', desc: 'Full iteration count' },
  ];

  console.log('\\nTracking when variation is lost in DD iteration:\\n');

  for (const m of modes) {
    await page.evaluate((mode) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(mode);
    }, m.mode);
    await page.waitForTimeout(500);

    const screenshot = await page.screenshot();
    fs.writeFileSync(`test-results/iter-mode${m.mode}-${m.name}.png`, screenshot);

    const variation = screenshot.length > 60000 ? '✓ HAS VARIATION' : screenshot.length > 50000 ? '⚠️ LOW VAR' : '✗ UNIFORM';
    console.log(`Mode ${m.mode.toString().padStart(2)} (${m.name.padEnd(10)}): ${screenshot.length.toString().padStart(6)} bytes  ${variation}  - ${m.desc}`);
  }
});
