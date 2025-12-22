import { test } from '@playwright/test';

test('DD detailed diagnostic', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Check if we're getting the correct coordinate values
  const diagnostics = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;

    // Set to DD scale
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-6,
      maxIterations: 1000
    });

    const vp = viewer.getViewport();
    const precision = viewer.renderer.getPrecisionInfo();

    return {
      viewport: vp,
      precision: precision,
      // Get the actual DD uniform values that are being sent
      ddParams: viewer.renderer.getDebugDDParams ? viewer.renderer.getDebugDDParams() : 'no debug method'
    };
  });

  console.log('Viewport:', JSON.stringify(diagnostics.viewport, null, 2));
  console.log('Precision:', JSON.stringify(diagnostics.precision, null, 2));
  console.log('DD Params:', JSON.stringify(diagnostics.ddParams, null, 2));

  // Now let's test the ACTUAL coordinate calculation in JavaScript
  // to verify what values should be passed to the shader
  const jsCalc = await page.evaluate(() => {
    const centerX = -0.745;
    const centerY = 0.113;
    const scale = 1e-6;
    const resX = 1280;
    const resY = 720;

    // Simulate what the shader should compute for corner pixels
    function calculatePixelCoord(pixelX: number, pixelY: number) {
      const normX = (pixelX / resX) - 0.5;
      const normY = (pixelY / resY) - 0.5;
      const aspectRatio = resX / resY;
      const normXCorrected = normX * aspectRatio;

      const offsetX = normXCorrected * scale;
      const offsetY = normY * scale;

      return {
        x: centerX + offsetX,
        y: centerY + offsetY,
        offsetX,
        offsetY
      };
    }

    return {
      topLeft: calculatePixelCoord(0, 0),
      center: calculatePixelCoord(resX/2, resY/2),
      bottomRight: calculatePixelCoord(resX, resY),
      // These are the expected offsets at corners
      expectedMaxOffsetX: (0.5 * (resX / resY)) * scale,
      expectedMaxOffsetY: 0.5 * scale
    };
  });

  console.log('\n=== JS COORDINATE CALCULATION ===');
  console.log('Top-left pixel:', jsCalc.topLeft);
  console.log('Center pixel:', jsCalc.center);
  console.log('Bottom-right pixel:', jsCalc.bottomRight);
  console.log('Expected max X offset:', jsCalc.expectedMaxOffsetX);
  console.log('Expected max Y offset:', jsCalc.expectedMaxOffsetY);

  // Compare with what debug mode 2 shows
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(2);  // Coordinate visualization
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/dd-diag-coords.png' });

  // Now let's test mode 9 at a KNOWN good location that works in standard
  // Let's use the EXACT same viewport at 1e-5 (standard) first
  console.log('\n=== TESTING SAME LOCATION AT STANDARD VS DD ===');

  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);  // Normal rendering
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-5,  // Standard precision
      maxIterations: 1000
    });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/dd-diag-1e-5.png' });

  // Now 1e-6 with mode 9 (DD coords + standard iteration)
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setViewport({ scale: 1e-6 });
    viewer.setDebugMode(9);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/dd-diag-mode9-1e-6.png' });

  // Get viewport after setting 1e-6
  const vp2 = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    return viewer.getViewport();
  });
  console.log('Viewport at 1e-6:', JSON.stringify(vp2, null, 2));
});
