import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('perturbation zoom sequence test', async ({ page }, testInfo) => {
  testInfo.setTimeout(180000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const centerX = -0.7436438870371587;
  const centerY = 0.13182590420531197;

  // Test zoom sequence from 1e-5 to 1e-12
  const scales = [1e-5, 5e-6, 1e-6, 5e-7, 1e-7, 5e-8, 1e-8, 1e-9, 1e-10, 1e-11, 1e-12];

  for (let i = 0; i < scales.length; i++) {
    const scale = scales[i];

    await page.evaluate(({ cx, cy, s }) => {
      const viewer = (window as any).mandelbrot;
      viewer.setViewport({
        centerX: cx,
        centerY: cy,
        scale: s,
        maxIterations: 500
      });
    }, { cx: centerX, cy: centerY, s: scale });

    // Wait for orbit computation and render
    await page.waitForTimeout(2000);

    // Get state
    const state = await page.evaluate(() => {
      const viewer = (window as any).mandelbrot;
      const hud = document.querySelector('.hud')?.textContent ?? '';
      const pr = viewer?.perturbationRenderer;

      return {
        scale: viewer?.viewport?.scale,
        precision: hud.includes('PERTURB') ? 'PERTURB' : hud.includes('STANDARD') ? 'STANDARD' : 'UNKNOWN',
        hasOrbit: !!pr?.getCurrentOrbit?.(),
        orbitLength: pr?.getCurrentOrbit?.()?.length ?? null,
      };
    });

    console.log(`Scale ${scale.toExponential()}: precision=${state.precision}, orbit=${state.hasOrbit}, len=${state.orbitLength}`);

    // Take screenshot
    const screenshot = await page.screenshot();
    const filename = `test-results/zoom-seq-${i.toString().padStart(2, '0')}-${scale.toExponential()}.png`;
    fs.writeFileSync(filename, screenshot);
  }

  console.log('Zoom sequence complete - check screenshots for continuity');
});
