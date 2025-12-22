import { test } from '@playwright/test';

test('trace DD uniform values', async ({ page }) => {
  // Collect console messages
  const logs: string[] = [];
  page.on('console', msg => {
    logs.push(msg.text());
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Instrument the renderer to log uniform values
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const renderer = viewer.renderer;
    const originalRender = renderer.render.bind(renderer);

    renderer.render = function(params: any) {
      console.log('=== RENDER PARAMS ===');
      console.log('scale:', params.scale);
      console.log('centerX:', params.centerX);
      console.log('centerY:', params.centerY);
      console.log('useAutoPrecision:', params.useAutoPrecision);
      console.log('debugMode:', params.debugMode);

      // Check if DD should be used
      const DD_THRESHOLD = 5e-6;
      const needsDD = params.useAutoPrecision !== false && params.scale < DD_THRESHOLD;
      console.log('needsDD:', needsDD);

      return originalRender(params);
    };
  });

  // Set to DD scale
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    viewer.setDebugMode(0);  // Normal rendering
    viewer.setViewport({
      centerX: -0.745,
      centerY: 0.113,
      scale: 1e-6,  // Should trigger DD mode
      maxIterations: 1000
    });
  });

  // Wait for render cycle
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/trace-1e-6.png' });

  // Print all collected logs
  console.log('\n=== CONSOLE OUTPUT ===');
  for (const log of logs) {
    if (log.includes('RENDER') || log.includes('scale') || log.includes('DD') || log.includes('Precision')) {
      console.log(log);
    }
  }

  // Get final state
  const state = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const vp = viewer.getViewport();
    const precision = viewer.renderer.getPrecisionInfo();
    return { viewport: vp, precision };
  });

  console.log('\n=== FINAL STATE ===');
  console.log('Viewport scale:', state.viewport.scale);
  console.log('Precision:', state.precision);
});
