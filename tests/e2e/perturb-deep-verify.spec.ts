import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('perturbation at very deep zoom (1e-10)', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Set to very deep zoom
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.7436438870371587,  // More precise coordinates
      centerY: 0.13182590420531197,
      scale: 1e-10,  // VERY deep zoom - 10 billion x magnification
      maxIterations: 1000
    });
  });

  // Wait for render
  await page.waitForTimeout(5000);

  // Check state
  const state = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const pr = viewer?.perturbationRenderer;
    const orbit = pr?.getCurrentOrbit?.();
    const hud = document.querySelector('.hud')?.textContent ?? '';

    return {
      hasOrbit: !!orbit,
      orbitLength: orbit?.length ?? null,
      precisionFromHUD: hud.includes('PERTURB') ? 'PERTURB' : hud.includes('STANDARD') ? 'STANDARD' : 'UNKNOWN',
      viewport: viewer?.getViewport?.(),
    };
  });
  console.log('State at 1e-10:', JSON.stringify(state, null, 2));

  // Take screenshot
  const screenshot = await page.screenshot();
  fs.writeFileSync('test-results/perturb-1e-10.png', screenshot);
  console.log('Screenshot saved, size:', screenshot.length, 'bytes');

  // Verify perturbation mode is active
  expect(state.precisionFromHUD).toBe('PERTURB');
  expect(state.hasOrbit).toBe(true);
});
