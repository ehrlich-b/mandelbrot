import { test, expect } from '@playwright/test';
import * as fs from 'fs';

/**
 * Simulate interactive zooming behavior
 *
 * This test simulates what happens during mouse-driven zooming:
 * - Small incremental zoom steps (not waiting for orbit recompute)
 * - Panning while zoomed (offset accumulates)
 *
 * The key bug was: fractal appeared "stuck to glass" during panning
 * because the shader assumed screen center = reference orbit center.
 *
 * The fix: u_viewOffset uniform accounts for the drift.
 */
test('simulate interactive zoom and pan', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Start at a known location
  const startX = -0.7436438870371587;
  const startY = 0.13182590420531197;
  let currentX = startX;
  let currentY = startY;
  let currentScale = 1e-6;

  // Set initial viewport
  await page.evaluate(({ cx, cy, s }) => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: cx,
      centerY: cy,
      scale: s,
      maxIterations: 500
    });
  }, { cx: currentX, cy: currentY, s: currentScale });

  await page.waitForTimeout(2000); // Wait for initial orbit

  // Simulate 20 small zoom steps without waiting for orbit recompute
  // This mimics continuous mouse wheel zooming
  console.log('Testing rapid zoom steps...');
  for (let i = 0; i < 20; i++) {
    currentScale *= 0.8; // Zoom in 20% each step

    await page.evaluate(({ cx, cy, s }) => {
      const viewer = (window as any).mandelbrot;
      viewer.setViewport({
        centerX: cx,
        centerY: cy,
        scale: s,
        maxIterations: 500
      });
    }, { cx: currentX, cy: currentY, s: currentScale });

    // Only 50ms between steps - simulating fast wheel scrolling
    await page.waitForTimeout(50);
  }

  // Take screenshot after rapid zoom
  const zoomScreenshot = await page.screenshot();
  fs.writeFileSync('test-results/interactive-rapid-zoom.png', zoomScreenshot);
  console.log(`After rapid zoom: scale=${currentScale.toExponential()}`);

  // Now simulate panning - small offsets without waiting for orbit recompute
  console.log('Testing pan without orbit recompute...');
  const panOffset = currentScale * 0.02; // 2% of viewport per step

  for (let i = 0; i < 10; i++) {
    currentX += panOffset;
    currentY += panOffset * 0.5;

    await page.evaluate(({ cx, cy, s }) => {
      const viewer = (window as any).mandelbrot;
      viewer.setViewport({
        centerX: cx,
        centerY: cy,
        scale: s,
        maxIterations: 500
      });
    }, { cx: currentX, cy: currentY, s: currentScale });

    await page.waitForTimeout(50);
  }

  // Take screenshot after panning
  const panScreenshot = await page.screenshot();
  fs.writeFileSync('test-results/interactive-pan.png', panScreenshot);

  // Get state to verify orbit is still valid
  const state = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const pr = viewer?.perturbationRenderer;
    const orbit = pr?.getCurrentOrbit?.();
    const viewport = viewer?.getViewport?.();

    return {
      viewportCenter: viewport ? { x: viewport.centerX, y: viewport.centerY } : null,
      orbitCenter: orbit ? { x: orbit.centerReal, y: orbit.centerImag } : null,
      scale: viewport?.scale,
      precision: document.querySelector('.hud')?.textContent?.includes('PERTURB') ? 'PERTURB' : 'OTHER',
    };
  });

  console.log('Final state:', JSON.stringify(state, null, 2));

  // Verify we're still in perturbation mode
  expect(state.precision).toBe('PERTURB');

  // The viewport should have drifted from orbit center
  // (this is the scenario that was broken before)
  if (state.viewportCenter && state.orbitCenter) {
    const dx = parseFloat(String(state.viewportCenter.x)) - parseFloat(state.orbitCenter.x);
    const dy = parseFloat(String(state.viewportCenter.y)) - parseFloat(state.orbitCenter.y);
    console.log(`Drift from orbit center: dx=${dx.toExponential()}, dy=${dy.toExponential()}`);
  }

  // Visual check: the screenshot should show coherent fractal detail,
  // not "psychedelic blobs" or scrambled pixels
  console.log('Check test-results/interactive-*.png for visual verification');
});
