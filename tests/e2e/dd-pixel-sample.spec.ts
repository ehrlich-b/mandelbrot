import { test } from '@playwright/test';

test('sample DD pixel colors at specific locations', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Set to DD scale
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-6,
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(2000);

  // Function to sample pixels
  const samplePixels = async (modeName: string) => {
    const colors = await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      // Create a temporary canvas to read pixels
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return null;

      tempCtx.drawImage(canvas, 0, 0);

      const samplePoints = [
        { name: 'top-left', x: 10, y: 10 },
        { name: 'top-right', x: canvas.width - 10, y: 10 },
        { name: 'center', x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) },
        { name: 'bottom-left', x: 10, y: canvas.height - 10 },
        { name: 'bottom-right', x: canvas.width - 10, y: canvas.height - 10 },
      ];

      const results: { name: string; rgba: number[] }[] = [];
      for (const pt of samplePoints) {
        const data = tempCtx.getImageData(pt.x, pt.y, 1, 1).data;
        results.push({ name: pt.name, rgba: [data[0], data[1], data[2], data[3]] });
      }
      return results;
    });

    console.log(`\n=== ${modeName} ===`);
    if (colors) {
      for (const c of colors) {
        console.log(`  ${c.name}: rgba(${c.rgba.join(', ')})`);
      }
    } else {
      console.log('  Failed to sample pixels');
    }
  };

  // Test mode 2 (coordinate visualization - known to work)
  await page.evaluate(() => {
    (window as any).mandelbrot.setDebugMode(2);
  });
  await page.waitForTimeout(500);
  await samplePixels('Mode 2 (coords)');

  // Test mode 10 (|c|² magnitude)
  await page.evaluate(() => {
    (window as any).mandelbrot.setDebugMode(10);
  });
  await page.waitForTimeout(500);
  await samplePixels('Mode 10 (|c|²)');

  // Test mode 11 (c_dd.x hi part)
  await page.evaluate(() => {
    (window as any).mandelbrot.setDebugMode(11);
  });
  await page.waitForTimeout(500);
  await samplePixels('Mode 11 (hi part)');

  // Test mode 12 (c_dd.y lo part)
  await page.evaluate(() => {
    (window as any).mandelbrot.setDebugMode(12);
  });
  await page.waitForTimeout(500);
  await samplePixels('Mode 12 (lo part)');

  // Test mode 4 (iteration count)
  await page.evaluate(() => {
    (window as any).mandelbrot.setDebugMode(4);
  });
  await page.waitForTimeout(500);
  await samplePixels('Mode 4 (iterations)');

  // Test normal mode
  await page.evaluate(() => {
    (window as any).mandelbrot.setDebugMode(0);
  });
  await page.waitForTimeout(500);
  await samplePixels('Mode 0 (normal DD)');
});
