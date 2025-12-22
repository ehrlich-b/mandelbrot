import { test } from '@playwright/test';

test('check page structure', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Get the full page HTML structure
  const htmlStructure = await page.evaluate(() => {
    const body = document.body;
    function getStructure(el: Element, depth = 0): string {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const classes = el.className ? `.${el.className.split(' ').join('.')}` : '';
      let result = '  '.repeat(depth) + `<${tag}${id}${classes}>`;
      if (tag === 'canvas') {
        const canvas = el as HTMLCanvasElement;
        result += ` [${canvas.width}x${canvas.height}]`;
      }
      result += '\n';
      for (const child of el.children) {
        result += getStructure(child, depth + 1);
      }
      return result;
    }
    return getStructure(body);
  });

  console.log('Page structure:\n', htmlStructure);

  // Check renderer type
  const rendererInfo = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    if (!viewer) return null;
    return {
      hasRenderer: !!viewer.renderer,
      rendererType: viewer.renderer?.constructor?.name,
      hasCanvas: !!viewer.canvas,
      canvasTag: viewer.canvas?.tagName,
    };
  });
  console.log('Renderer info:', rendererInfo);

  // Get canvas via viewer directly
  const canvasViaViewer = await page.evaluate(() => {
    const viewer = (window as any).mandelbrot;
    if (!viewer || !viewer.canvas) return null;
    const canvas = viewer.canvas as HTMLCanvasElement;
    return {
      exists: true,
      width: canvas.width,
      height: canvas.height,
      id: canvas.id,
      className: canvas.className,
    };
  });
  console.log('Canvas via viewer:', canvasViaViewer);
});
