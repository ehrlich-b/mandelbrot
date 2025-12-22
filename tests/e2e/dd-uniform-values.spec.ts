import { test } from '@playwright/test';

test('verify DD uniform values', async ({ page }) => {
  // Collect console messages
  page.on('console', msg => {
    if (msg.text().includes('DD:') || msg.text().includes('Precision')) {
      console.log(msg.text());
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Instrument the setDDUniforms method to log values
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const renderer = viewer.renderer;
    const originalSetDD = renderer.setDDUniforms.bind(renderer);

    renderer.setDDUniforms = function(params: any, uniforms: any) {
      console.log('DD: setDDUniforms called');
      console.log('DD: params.scale =', params.scale);
      console.log('DD: params.centerX =', params.centerX);
      console.log('DD: params.centerY =', params.centerY);

      // Calculate DD values
      const fround = Math.fround;
      const scaleHi = fround(params.scale);
      const scaleLo = fround(params.scale - scaleHi);
      console.log('DD: scale_dd = (', scaleHi, ',', scaleLo, ')');

      const centerXHi = fround(params.centerX);
      const centerXLo = fround(params.centerX - centerXHi);
      console.log('DD: centerX_dd = (', centerXHi, ',', centerXLo, ')');

      return originalSetDD(params, uniforms);
    };
  });

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
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: 'test-results/dd-uniforms-test.png' });

  console.log('\nCheck the console output above to verify DD uniforms are correct');
});
