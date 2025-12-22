import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('perturbation verbose debug', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);

  // Capture all console messages
  const logs: string[] = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    logs.push(`[PAGE ERROR] ${err.message}`);
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Check initial state
  const initialState = await page.evaluate(async () => {
    const viewer = (window as any).mandelbrot;
    const pr = viewer?.perturbationRenderer;

    // Check if WASM module loaded
    let wasmAvailable = false;
    try {
      const refOrbit = (window as any).getReferenceOrbit?.();
      wasmAvailable = refOrbit?.isAvailable?.() ?? false;
    } catch (e) {
      // ignore
    }

    return {
      viewerExists: !!viewer,
      perturbRendererExists: !!pr,
      prInitialized: pr?.initialized ?? 'no prop',
      isAvailable: pr?.isAvailable?.() ?? 'method missing',
      currentOrbit: pr?.getCurrentOrbit?.() ?? null,
      wasmAvailable,
    };
  });
  console.log('Initial state:', JSON.stringify(initialState, null, 2));

  // Now set deep zoom
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.7436438870,
      centerY: 0.1318259043,
      scale: 1e-6,
      maxIterations: 500
    });
  });

  // Wait and observe console output
  await page.waitForTimeout(5000);

  // Check state after zoom
  const afterZoomState = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const pr = viewer?.perturbationRenderer;
    const orbit = pr?.getCurrentOrbit?.();

    return {
      isAvailable: pr?.isAvailable?.() ?? 'method missing',
      hasOrbit: !!orbit,
      orbitLength: orbit?.length ?? null,
      orbitEscapeIter: orbit?.escapeIteration ?? null,
      viewport: viewer?.getViewport?.() ?? null,
    };
  });
  console.log('After zoom state:', JSON.stringify(afterZoomState, null, 2));

  // Print all console logs
  console.log('\n--- Browser Console Logs ---');
  for (const log of logs) {
    console.log(log);
  }
  console.log('--- End Console Logs ---\n');

  // Check HUD for precision mode
  const hudText = await page.evaluate(() => {
    const hud = document.querySelector('.hud');
    return hud?.textContent ?? '';
  });
  console.log('HUD text:', hudText);

  // Take screenshot
  const screenshot = await page.screenshot();
  fs.writeFileSync('test-results/perturb-verbose-debug.png', screenshot);
  console.log('Screenshot saved, size:', screenshot.length, 'bytes');

  // Verify perturbation was attempted
  expect(afterZoomState.isAvailable).toBe(true);
});
