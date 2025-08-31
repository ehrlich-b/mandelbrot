import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Listen for console messages (including errors)
  page.on('console', msg => {
    console.log(`CONSOLE [${msg.type()}]: ${msg.text()}`);
  });
  
  // Navigate to the app
  await page.goto('http://localhost:3000');
  
  // Wait a moment for shaders to compile
  await page.waitForTimeout(2000);
  
  // Take a screenshot to see current state
  await page.screenshot({ path: 'debug-current-state.png' });
  
  await browser.close();
})();