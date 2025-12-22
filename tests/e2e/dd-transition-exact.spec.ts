import { test } from '@playwright/test';
import * as fs from 'fs';

test('exact DD transition analysis', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);  // 2 minute timeout
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test scales around the transition point (5e-6)
  const testScales = [
    { scale: 1e-5, expected: 'STANDARD' },  // Above threshold
    { scale: 6e-6, expected: 'STANDARD' },  // Just above threshold
    { scale: 5e-6, expected: 'STANDARD (boundary)' },  // At threshold
    { scale: 4.9e-6, expected: 'DD' },  // Just below threshold
    { scale: 4e-6, expected: 'DD' },  // Below threshold
    { scale: 2e-6, expected: 'DD' },
    { scale: 1e-6, expected: 'DD' },
  ];

  const results: { scale: number; size: number; precision: string }[] = [];

  for (const t of testScales) {
    await page.evaluate((scale) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);  // Normal rendering
      viewer.setViewport({
        centerX: -0.745,
        centerY: 0.113,
        scale: scale,
        maxIterations: 1000
      });
    }, t.scale);
    await page.waitForTimeout(2000);

    // Get precision info
    const precision = await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      return viewer.renderer.getPrecisionInfo();
    });

    const screenshot = await page.screenshot();
    const filename = `test-results/transition-${t.scale.toExponential(0).replace('+', '').replace('-', 'm')}.png`;
    fs.writeFileSync(filename, screenshot);

    results.push({
      scale: t.scale,
      size: screenshot.length,
      precision: precision.currentPrecision
    });

    console.log(`Scale ${t.scale.toExponential(1)}: ${screenshot.length} bytes, precision: ${precision.currentPrecision}`);
  }

  console.log('\n=== ANALYSIS ===');
  console.log('If there is a sharp drop in file size at the DD transition, the bug is in DD mode');
  console.log('');

  // Find the transition point
  for (let i = 1; i < results.length; i++) {
    const prev = results[i-1];
    const curr = results[i];
    if (prev.precision !== curr.precision) {
      console.log(`TRANSITION: ${prev.scale} (${prev.precision}, ${prev.size} bytes) -> ${curr.scale} (${curr.precision}, ${curr.size} bytes)`);
      const ratio = prev.size / curr.size;
      console.log(`Size ratio: ${ratio.toFixed(2)}x`);
      if (ratio > 2) {
        console.log('⚠️  SIGNIFICANT DROP - DD mode is broken!');
      }
    }
  }
});
