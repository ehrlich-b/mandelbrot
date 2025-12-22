import { test } from '@playwright/test';

test('check for errors', async ({ page }) => {
  // Collect console messages
  const consoleLogs: string[] = [];
  const consoleErrors: string[] = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', error => {
    consoleErrors.push(`PAGE ERROR: ${error.message}`);
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Get error div content
  const errorContent = await page.evaluate(() => {
    const errorDiv = document.querySelector('.error');
    if (!errorDiv) return null;
    return errorDiv.innerHTML;
  });

  if (errorContent) {
    console.log('=== ERROR DIV CONTENT ===');
    console.log(errorContent);
  }

  // Check canvas visibility
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.getElementById('mandelbrot-canvas') as HTMLCanvasElement;
    if (!canvas) return { found: false };
    const style = window.getComputedStyle(canvas);
    return {
      found: true,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      zIndex: style.zIndex,
      position: style.position,
      width: canvas.offsetWidth,
      height: canvas.offsetHeight,
      boundingRect: canvas.getBoundingClientRect()
    };
  });

  console.log('=== CANVAS INFO ===');
  console.log(canvasInfo);

  if (consoleErrors.length > 0) {
    console.log('=== CONSOLE ERRORS ===');
    consoleErrors.forEach(e => console.log(e));
  }

  // Take full page screenshot
  await page.screenshot({ path: 'test-results/error-page.png', fullPage: true });
  console.log('Full page screenshot saved to test-results/error-page.png');
});
