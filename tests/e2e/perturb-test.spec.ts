import { test } from '@playwright/test';
import * as fs from 'fs';

test('perturbation mode test', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Check if perturbation renderer initialized
  const perturbAvailable = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    return viewer?.perturbationRenderer?.isAvailable?.() ?? false;
  });
  console.log('Perturbation available:', perturbAvailable);

  // Set to deep zoom (below PERTURBATION_THRESHOLD of 5e-6)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.7436438870,
      centerY: 0.1318259043,
      scale: 1e-6,
      maxIterations: 500
    });
  });
  
  // Wait for render
  await page.waitForTimeout(3000);

  // Take screenshot
  const screenshot = await page.screenshot();
  fs.writeFileSync('test-results/perturb-deep-zoom.png', screenshot);
  console.log('Screenshot size:', screenshot.length, 'bytes');

  // Check precision mode from HUD
  const hudText = await page.evaluate(() => {
    const hud = document.querySelector('.hud');
    return hud?.textContent ?? '';
  });
  console.log('HUD text:', hudText);
});
