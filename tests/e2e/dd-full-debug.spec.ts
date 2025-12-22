import { test } from '@playwright/test';
import * as fs from 'fs';

test('full DD debug analysis', async ({ page }) => {
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
  await page.waitForTimeout(2000);

  const tests = [
    { mode: 0, name: 'normal', desc: 'Normal DD render - SHOULD show fractal' },
    { mode: 2, name: 'coords', desc: 'Coordinate visualization - should show gradient' },
    { mode: 4, name: 'iter_count', desc: 'Iteration count - should vary if coords vary' },
    { mode: 10, name: 'c_magnitude', desc: '|c|² magnitude' },
    { mode: 15, name: 'first_iter', desc: 'z after first iteration = c' },
  ];

  const results: { mode: number; name: string; size: number }[] = [];

  for (const t of tests) {
    await page.evaluate((mode) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(mode);
    }, t.mode);
    await page.waitForTimeout(500);

    const filename = `test-results/debug-full-${t.mode}-${t.name}.png`;
    const screenshot = await page.screenshot();
    fs.writeFileSync(filename, screenshot);
    results.push({ mode: t.mode, name: t.name, size: screenshot.length });
    console.log(`Mode ${t.mode} (${t.name}): ${screenshot.length} bytes - ${t.desc}`);
  }

  console.log('\n=== SIZE COMPARISON ===');
  results.sort((a, b) => b.size - a.size);
  for (const r of results) {
    console.log(`  ${r.size.toString().padStart(8)} bytes: mode ${r.mode} (${r.name})`);
  }

  // Now compare to standard precision
  console.log('\n=== STANDARD PRECISION COMPARISON ===');
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);
    viewer.setViewport({ scale: 1e-5 });  // Standard precision
  });
  await page.waitForTimeout(2000);

  const stdScreenshot = await page.screenshot();
  fs.writeFileSync('test-results/debug-full-standard.png', stdScreenshot);
  console.log(`Standard (1e-5): ${stdScreenshot.length} bytes - reference`);
});
