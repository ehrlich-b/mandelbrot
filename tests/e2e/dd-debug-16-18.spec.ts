import { test } from '@playwright/test';
import * as fs from 'fs';

test('DD debug modes 16-18 analysis', async ({ page }) => {
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

  const modes = [
    { mode: 2, name: 'coord_offset', desc: 'Normalized coordinate offset (KNOWN WORKING)' },
    { mode: 16, name: 'lo_part', desc: 'LO part of real coordinate directly' },
    { mode: 17, name: 'diff_normalized', desc: 'Difference from center (normalized)' },
    { mode: 18, name: '5_iterations', desc: 'Magnitude after 5 iterations' },
    { mode: 4, name: 'iter_count', desc: 'Iteration count to escape' },
    { mode: 0, name: 'normal', desc: 'Normal rendering' },
  ];

  const results: { mode: number; name: string; size: number }[] = [];

  for (const m of modes) {
    await page.evaluate((mode) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(mode);
    }, m.mode);
    await page.waitForTimeout(500);

    const screenshot = await page.screenshot();
    fs.writeFileSync(`test-results/dd16-mode${m.mode}-${m.name}.png`, screenshot);
    results.push({ mode: m.mode, name: m.name, size: screenshot.length });
    console.log(`Mode ${m.mode} (${m.name}): ${screenshot.length} bytes - ${m.desc}`);
  }

  console.log('\n=== ANALYSIS ===');
  console.log('Mode 2 (known working) should show gradient');
  console.log('Mode 16 shows raw LO part - should also show gradient if DD captures variation');
  console.log('Mode 17 shows diff from center - should show gradient');
  console.log('Mode 18 shows orbit after 5 iterations - should show variation if iteration works');
  console.log('If 16/17 show gradient but 18/4/0 are uniform, the bug is in DD iteration');

  const sortedResults = [...results].sort((a, b) => b.size - a.size);
  console.log('\nSorted by size:');
  for (const r of sortedResults) {
    console.log(`  ${r.size.toString().padStart(8)} bytes: mode ${r.mode} (${r.name})`);
  }
});
