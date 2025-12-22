import { test } from '@playwright/test';
import * as fs from 'fs';

test('DD scale comparison', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const scales = [
    { scale: 4.9e-6, name: 'working' },
    { scale: 1e-6, name: 'broken' },
  ];

  const modes = [
    { mode: 0, name: 'normal' },
    { mode: 4, name: 'iter_count' },
    { mode: 20, name: 'z_2iter' },
    { mode: 23, name: 'z_10iter' },
  ];

  console.log('\\nComparing debug modes at working vs broken scales:\\n');
  console.log('Mode         | Working (4.9e-6) | Broken (1e-6) | Ratio');
  console.log('-------------|------------------|---------------|------');

  for (const m of modes) {
    const results: { scale: number; size: number }[] = [];

    for (const s of scales) {
      await page.evaluate(({ scale, mode }) => {
        const viewer = (window as any).mandelbrot;
        viewer.setDebugMode(mode);
        viewer.setViewport({
          centerX: -0.745,
          centerY: 0.113,
          scale: scale,
          maxIterations: 1000
        });
      }, { scale: s.scale, mode: m.mode });
      await page.waitForTimeout(1500);

      const screenshot = await page.screenshot();
      results.push({ scale: s.scale, size: screenshot.length });
      fs.writeFileSync(`test-results/compare-${s.name}-mode${m.mode}.png`, screenshot);
    }

    const ratio = (results[0].size / results[1].size).toFixed(2);
    console.log(`${m.name.padEnd(12)} | ${results[0].size.toString().padStart(16)} | ${results[1].size.toString().padStart(13)} | ${ratio}x`);
  }
});
