import { test, expect } from '@playwright/test';
import * as fs from 'fs';

/**
 * Test perturbation colors with histogram equalization
 */
test('compare perturbation colors with histogram equalization', async ({ page }, testInfo) => {
  testInfo.setTimeout(120000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const centerX = -0.7436438870371587;
  const centerY = 0.13182590420531197;
  const scale = 1e-8;

  // First: without histogram equalization
  await page.evaluate(({ cx, cy, s }) => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: cx,
      centerY: cy,
      scale: s,
      maxIterations: 500
    });
  }, { cx: centerX, cy: centerY, s: scale });

  await page.waitForTimeout(3000);
  const screenshotNoHist = await page.screenshot();
  fs.writeFileSync('test-results/perturb-color-no-hist.png', screenshotNoHist);

  // Enable histogram equalization via checkbox
  const histCheckbox = page.locator('text=Histogram Equalization').locator('xpath=../input');
  await histCheckbox.check();

  await page.waitForTimeout(1000);
  const screenshotWithHist = await page.screenshot();
  fs.writeFileSync('test-results/perturb-color-with-hist.png', screenshotWithHist);

  // Test with higher color scale using slider
  await histCheckbox.uncheck();
  await page.waitForTimeout(500);

  // Find color scale slider and adjust it
  const colorScaleSlider = page.locator('text=Color Scale').locator('xpath=../input[type="range"]');
  await colorScaleSlider.fill('5');

  await page.waitForTimeout(1000);
  const screenshotHighScale = await page.screenshot();
  fs.writeFileSync('test-results/perturb-color-high-scale.png', screenshotHighScale);

  console.log('Screenshots saved - compare:');
  console.log('  test-results/perturb-color-no-hist.png');
  console.log('  test-results/perturb-color-with-hist.png');
  console.log('  test-results/perturb-color-high-scale.png');
});
