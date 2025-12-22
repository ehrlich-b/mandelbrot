import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('perturbation continuity test', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Test at seahorse valley - just ABOVE perturbation threshold (standard mode)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.7436438870,
      centerY: 0.1318259043,
      scale: 6e-6,  // Just above 5e-6 threshold - should use STANDARD
      maxIterations: 500
    });
  });
  await page.waitForTimeout(2000);

  let hudText = await page.evaluate(() => document.querySelector('.hud')?.textContent ?? '');
  console.log('At 6e-6 scale:', hudText.includes('STANDARD') ? 'STANDARD' : hudText.includes('PERTURB') ? 'PERTURB' : 'UNKNOWN');

  const screenshot1 = await page.screenshot();
  fs.writeFileSync('test-results/continuity-6e-6-standard.png', screenshot1);

  // Test at seahorse valley - just BELOW perturbation threshold (perturbation mode)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.7436438870,
      centerY: 0.1318259043,
      scale: 4e-6,  // Just below 5e-6 threshold - should use PERTURB
      maxIterations: 500
    });
  });
  await page.waitForTimeout(3000);  // Extra time for orbit computation

  hudText = await page.evaluate(() => document.querySelector('.hud')?.textContent ?? '');
  console.log('At 4e-6 scale:', hudText.includes('STANDARD') ? 'STANDARD' : hudText.includes('PERTURB') ? 'PERTURB' : 'UNKNOWN');

  const screenshot2 = await page.screenshot();
  fs.writeFileSync('test-results/continuity-4e-6-perturb.png', screenshot2);

  // Deeper zoom
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.7436438870,
      centerY: 0.1318259043,
      scale: 1e-6,
      maxIterations: 500
    });
  });
  await page.waitForTimeout(2000);

  const screenshot3 = await page.screenshot();
  fs.writeFileSync('test-results/continuity-1e-6-perturb.png', screenshot3);

  console.log('Screenshots saved for continuity comparison');
});
