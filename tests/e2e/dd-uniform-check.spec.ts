import { test } from '@playwright/test';

test('check DD uniform values', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Set viewport to DD precision scale
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

  // Get the actual uniform values from the renderer
  const uniforms = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const gl = viewer.renderer.gl;
    const program = viewer.renderer.ddProgram;

    // Get uniform locations
    const centerDDLoc = gl.getUniformLocation(program, 'u_center_dd');
    const scaleDDLoc = gl.getUniformLocation(program, 'u_scale_dd');
    const useDDLoc = gl.getUniformLocation(program, 'u_use_dd_precision');
    const centerLoc = gl.getUniformLocation(program, 'u_center');
    const scaleLoc = gl.getUniformLocation(program, 'u_scale');

    // We can't read uniform values from WebGL directly, but we can check from the params
    const vp = viewer.getViewport();
    const prec = viewer.renderer.getPrecisionInfo();

    return {
      viewport: vp,
      precision: prec,
      hasUniformLocations: {
        u_center_dd: centerDDLoc !== null,
        u_scale_dd: scaleDDLoc !== null,
        u_use_dd_precision: useDDLoc !== null,
        u_center: centerLoc !== null,
        u_scale: scaleLoc !== null
      }
    };
  });

  console.log('Uniform check:', JSON.stringify(uniforms, null, 2));

  // Now let's trace what happens during render
  // Add console logging to the renderer
  await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    const originalRender = viewer.renderer.render.bind(viewer.renderer);

    viewer.renderer.render = function(params: any) {
      console.log('DD Render params:', {
        centerX: params.centerX,
        centerY: params.centerY,
        scale: params.scale,
        useAutoPrecision: params.useAutoPrecision
      });
      return originalRender(params);
    };

    // Trigger a re-render
    viewer.setViewport({ maxIterations: 1001 });
  });

  await page.waitForTimeout(1000);
});
