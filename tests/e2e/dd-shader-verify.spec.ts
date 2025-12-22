import { test, expect } from '@playwright/test';

test('verify shader reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Set debug mode 6 which should show magenta if shader is updated
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(6);
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-6,
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(1000);

  // Get a pixel color from the center of the screen
  const color = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2');
    if (!gl) return null;

    const pixels = new Uint8Array(4);
    gl.readPixels(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1, 1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );
    return { r: pixels[0], g: pixels[1], b: pixels[2], a: pixels[3] };
  });

  console.log('Center pixel color:', color);

  // Magenta is (255, 0, 255) - red and blue but no green
  if (color) {
    if (color.r > 200 && color.g < 50 && color.b > 200) {
      console.log('✓ SHADER UPDATED - showing magenta');
    } else if (color.r < 50 && color.g > 200 && color.b < 50) {
      console.log('✗ SHADER NOT UPDATED - still showing green');
    } else {
      console.log('? UNEXPECTED COLOR');
    }
  }
});
