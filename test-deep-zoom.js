// Quick test to verify deep zoom functionality
// This can be run in the browser console

console.log('Testing Deep Zoom Functionality...');

// Access the viewer instance (exposed in main.ts)
const viewer = window.mandelbrot;

if (!viewer) {
  console.error('Mandelbrot viewer not found! Make sure the app is loaded.');
} else {
  console.log('✓ Viewer found');
  
  // Test 1: Navigate to 1e-6 scale where user reported fuzziness
  console.log('Test 1: Testing 1e-6 scale (where fuzziness was reported)...');
  viewer.setViewport({
    centerX: -0.7533,
    centerY: 0.1138,
    scale: 0.000001,  // 1e-6
    maxIterations: 1000
  });
  
  setTimeout(() => {
    console.log('=== Test Results ===');
    
    const viewport = viewer.getViewport();
    console.log('Viewport:', {
      centerX: viewport.centerX,
      centerY: viewport.centerY, 
      scale: viewport.scale
    });
    
    const precisionInfo = viewer.renderer.getPrecisionInfo();
    console.log('Precision:', precisionInfo);
    
    if (precisionInfo.currentPrecision === 'dd') {
      console.log('✅ SUCCESS: DD precision active at 1e-6!');
    } else {
      console.log('❌ PROBLEM: Still using standard precision at 1e-6');
      console.log('   This explains the fuzziness!');
    }
    
    // Test 2: Try even deeper
    console.log('\nTest 2: Going deeper to 1e-9...');
    viewer.setViewport({ scale: 0.000000001 }); // 1e-9
  }, 1000);
}