import { test } from '@playwright/test';
import * as fs from 'fs';

test('perturbation debug', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Check perturbation state in detail
  const state = await page.evaluate(async () => {
    const viewer = (window as any).mandelbrot;
    const pr = viewer?.perturbationRenderer;
    
    // Try to get orbit
    const orbit = pr?.getCurrentOrbit?.();
    
    return {
      viewerExists: !!viewer,
      perturbRendererExists: !!pr,
      isAvailable: pr?.isAvailable?.() ?? 'method missing',
      hasOrbit: !!orbit,
      orbitLength: orbit?.length ?? null,
    };
  });
  console.log('State:', JSON.stringify(state, null, 2));

  // Now set deep zoom and wait
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.7436438870,
      centerY: 0.1318259043,
      scale: 1e-6,
      maxIterations: 500
    });
  });
  
  // Wait longer for orbit computation
  await page.waitForTimeout(5000);

  // Check state again
  const state2 = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const pr = viewer?.perturbationRenderer;
    const orbit = pr?.getCurrentOrbit?.();
    
    return {
      isAvailable: pr?.isAvailable?.() ?? 'method missing',
      hasOrbit: !!orbit,
      orbitLength: orbit?.length ?? null,
      viewport: viewer?.viewport,
    };
  });
  console.log('State after zoom:', JSON.stringify(state2, null, 2));

  // Take screenshot
  const screenshot = await page.screenshot();
  fs.writeFileSync('test-results/perturb-debug.png', screenshot);
  console.log('Screenshot size:', screenshot.length, 'bytes');
});
