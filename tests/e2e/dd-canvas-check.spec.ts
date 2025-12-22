import { test, expect } from '@playwright/test';

test('verify canvas is rendering', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Check if canvas exists
  const canvas = await page.locator('canvas');
  const canvasCount = await canvas.count();
  console.log(`Found ${canvasCount} canvas element(s)`);

  // Get canvas dimensions
  const dimensions = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return null;
    return {
      width: canvas.width,
      height: canvas.height,
      styleWidth: canvas.style.width,
      styleHeight: canvas.style.height,
      offsetWidth: canvas.offsetWidth,
      offsetHeight: canvas.offsetHeight
    };
  });
  console.log('Canvas dimensions:', dimensions);

  // Check if mandelbrot viewer exists
  const viewerExists = await page.evaluate(() => {
    return !!(window as any).mandelbrot;
  });
  console.log('Mandelbrot viewer exists:', viewerExists);

  // Get viewport info
  const viewport = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    if (!viewer) return null;
    return viewer.getViewport();
  });
  console.log('Viewport:', viewport);

  // Take screenshot of just the canvas element
  if (canvasCount > 0) {
    await canvas.first().screenshot({ path: 'test-results/canvas-only.png' });
    console.log('Canvas-only screenshot saved');
  }

  // Set viewport and take canvas screenshot
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    if (viewer) {
      viewer.setViewport({
        centerX: -0.745,
        centerY: 0.113,
        scale: 1e-5,
        maxIterations: 1000
      });
    }
  });
  await page.waitForTimeout(2000);

  if (canvasCount > 0) {
    await canvas.first().screenshot({ path: 'test-results/canvas-1e-5.png' });
    console.log('Canvas at 1e-5 screenshot saved');
  }

  // Now at DD scale
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    if (viewer) {
      viewer.setViewport({ scale: 1e-6 });
    }
  });
  await page.waitForTimeout(2000);

  if (canvasCount > 0) {
    await canvas.first().screenshot({ path: 'test-results/canvas-1e-6.png' });
    console.log('Canvas at 1e-6 screenshot saved');
  }
});
