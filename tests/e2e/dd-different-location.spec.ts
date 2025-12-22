import { test } from '@playwright/test';
import * as fs from 'fs';

test('test DD at different locations', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Test locations known to have interesting structure at deep zoom
  const locations = [
    { name: 'seahorse_valley', x: -0.745, y: 0.113 },
    { name: 'elephant_valley', x: 0.2925, y: 0.0152 },
    { name: 'spiral', x: -0.7436438870371587, y: 0.1318259043124106 },
    { name: 'main_cardioid_cusp', x: 0.25, y: 0.0 },
    { name: 'main_cardioid_edge', x: -0.75, y: 0.0 },
  ];

  for (const loc of locations) {
    console.log(`\n=== Testing ${loc.name} ===`);

    // Test at standard precision (1e-5)
    await page.evaluate(({ x, y }) => {
      const viewer = (window as any).mandelbrot;
      viewer.setDebugMode(0);
      viewer.setViewport({
        centerX: x,
        centerY: y,
        scale: 1e-5,
        maxIterations: 1000
      });
    }, loc);
    await page.waitForTimeout(2000);

    const stdScreenshot = await page.screenshot();
    fs.writeFileSync(`test-results/loc-${loc.name}-1e-5.png`, stdScreenshot);
    console.log(`  1e-5 (standard): ${stdScreenshot.length} bytes`);

    // Test at DD precision (1e-6)
    await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      viewer.setViewport({ scale: 1e-6 });
    });
    await page.waitForTimeout(2000);

    const ddScreenshot = await page.screenshot();
    fs.writeFileSync(`test-results/loc-${loc.name}-1e-6.png`, ddScreenshot);
    console.log(`  1e-6 (DD): ${ddScreenshot.length} bytes`);

    const ratio = stdScreenshot.length / ddScreenshot.length;
    if (ratio > 3) {
      console.log(`  ⚠️ SIGNIFICANT DROP (${ratio.toFixed(2)}x) - DD may be broken at this location`);
    } else if (ratio < 0.5) {
      console.log(`  ✓ DD showing MORE detail than standard`);
    }
  }
});
