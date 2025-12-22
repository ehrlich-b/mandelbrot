import { test } from '@playwright/test';
import * as fs from 'fs';

test('DD iteration analysis modes 19-20', async ({ page }) => {
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
    { mode: 17, name: 'c_diff', desc: 'c offset from center (REFERENCE)' },
    { mode: 19, name: 'c2_diff', desc: 'c² difference from center_c²' },
    { mode: 20, name: 'z2_diff', desc: 'z after 2 iters - difference from center' },
    { mode: 4, name: 'iter_count', desc: 'Full iteration count' },
  ];

  const results: { mode: number; name: string; size: number }[] = [];

  for (const m of modes) {
    await page.evaluate((mode) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(mode);
    }, m.mode);
    await page.waitForTimeout(500);

    const screenshot = await page.screenshot();
    fs.writeFileSync(`test-results/dd19-mode${m.mode}-${m.name}.png`, screenshot);
    results.push({ mode: m.mode, name: m.name, size: screenshot.length });
    console.log(`Mode ${m.mode} (${m.name}): ${screenshot.length} bytes - ${m.desc}`);
  }

  console.log('\n=== KEY INSIGHT ===');
  console.log('Mode 17 shows c varies (gradient expected)');
  console.log('Mode 19 shows c² varies (gradient expected if squaring preserves variation)');
  console.log('Mode 20 shows z_2 varies (gradient expected if full iteration works)');
  console.log('');
  console.log('If 17 has variation but 19/20 dont, the bug is in complex_dd_sqr');
  console.log('If 19 has variation but 20 doesnt, the bug is in complex_dd_add');
});
