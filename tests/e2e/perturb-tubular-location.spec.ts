import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('test tubular.png location', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Location from tubular.png
  const centerX = -0.4810790;
  const centerY = 0.6093955;
  const scale = 1.246e-13;

  await page.evaluate(({ cx, cy, s }) => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: cx,
      centerY: cy,
      scale: s,
      maxIterations: 2500
    });
  }, { cx: centerX, cy: centerY, s: scale });

  // Wait for orbit computation
  await page.waitForTimeout(5000);

  const state = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const pr = viewer?.perturbationRenderer;
    const orbit = pr?.getCurrentOrbit?.();

    return {
      viewport: viewer?.getViewport?.(),
      hasOrbit: !!orbit,
      orbitLength: orbit?.length ?? null,
      orbitCenter: orbit ? { re: orbit.centerReal, im: orbit.centerImag } : null,
    };
  });

  console.log('State:', JSON.stringify(state, null, 2));

  // Take screenshot
  const screenshot = await page.screenshot();
  fs.writeFileSync('test-results/tubular-location-test.png', screenshot);
  console.log('Screenshot saved');
});
