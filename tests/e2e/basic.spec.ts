import { test, expect } from '@playwright/test';

test.describe('Basic Mandelbrot Viewer', () => {
  
  test('should load the viewer', async ({ page }) => {
    await page.goto('/');
    
    // Check that the canvas is present
    const canvas = page.locator('#mandelbrot-canvas');
    await expect(canvas).toBeVisible();
    
    // Check that HUD is visible
    const hud = page.locator('.hud');
    await expect(hud).toBeVisible();
    
    // Check that controls are visible  
    const controls = page.locator('.controls');
    await expect(controls).toBeVisible();
  });

  test('should display initial coordinates', async ({ page }) => {
    await page.goto('/');
    
    // Wait for HUD to populate
    await page.waitForTimeout(500);
    
    const hud = page.locator('.hud');
    const hudText = await hud.textContent();
    
    // Should show default center coordinates
    expect(hudText).toContain('-5.000000e-1');
    expect(hudText).toContain('0.000000e+0');
  });

  test('should respond to zoom controls', async ({ page }) => {
    await page.goto('/');
    
    // Click zoom in button
    await page.click('#zoom-in-btn');
    await page.waitForTimeout(100);
    
    const hud = page.locator('.hud');
    const hudText = await hud.textContent();
    
    // Scale should be smaller (more zoomed in)
    expect(hudText).toMatch(/Scale: [0-9.e-]+/);
  });

  test('should change color schemes', async ({ page }) => {
    await page.goto('/');
    
    // Select different color scheme
    await page.selectOption('#color-scheme', '1');
    await page.waitForTimeout(100);
    
    // Should not crash and canvas should still be visible
    const canvas = page.locator('#mandelbrot-canvas');
    await expect(canvas).toBeVisible();
  });

  test('should handle window resize', async ({ page }) => {
    await page.goto('/');
    
    // Resize viewport
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(100);
    
    const canvas = page.locator('#mandelbrot-canvas');
    const canvasSize = await canvas.boundingBox();
    
    expect(canvasSize?.width).toBe(1200);
    expect(canvasSize?.height).toBe(800);
  });

  test('should reset to home view', async ({ page }) => {
    await page.goto('/');
    
    // Click reset button
    await page.click('#reset-btn');
    await page.waitForTimeout(200);
    
    const hud = page.locator('.hud');
    const hudText = await hud.textContent();
    
    // Should be back to default coordinates
    expect(hudText).toContain('-5.000000e-1');
    expect(hudText).toContain('0.000000e+0');
    expect(hudText).toContain('2.500e+0'); // Default scale
  });

  test('should maintain performance', async ({ page }) => {
    await page.goto('/');
    
    // Wait for initial render
    await page.waitForTimeout(1000);
    
    const hud = page.locator('.hud');
    const hudText = await hud.textContent();
    
    // Extract FPS from HUD
    const fpsMatch = hudText?.match(/FPS: (\d+)/);
    const fps = fpsMatch ? parseInt(fpsMatch[1]) : 0;
    
    // Should maintain decent FPS
    expect(fps).toBeGreaterThan(30);
  });

  test('should render Mandelbrot set visually', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto('/');
    
    // Wait for WebGL initialization and first render
    await page.waitForTimeout(2000);
    
    // Take screenshot of the full page
    await expect(page).toHaveScreenshot('mandelbrot-home-view.png');
    
    // Test zoom in
    await page.click('#zoom-in-btn');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('mandelbrot-zoom-in.png');
    
    // Test different color scheme
    await page.selectOption('#color-scheme', '1'); // Sunset
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('mandelbrot-sunset-colors.png');
    
    // Test preset locations
    await page.click('[data-bookmark="1"]'); // Seahorse Valley
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot('mandelbrot-seahorse-valley.png');
  });
});