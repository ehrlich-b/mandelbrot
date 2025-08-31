// Deep Zoom Test - Run in browser console after app loads

console.log('🔬 Deep Zoom Test Starting...');

const viewer = window.mandelbrot;

if (!viewer) {
  console.error('❌ Mandelbrot viewer not found!');
} else {
  console.log('✅ Viewer found');
  
  // Test progression of scales to see precision switching
  const testScales = [
    { scale: 0.1, name: "Normal zoom" },
    { scale: 0.00001, name: "1e-5 (should still be standard)" }, 
    { scale: 0.000001, name: "1e-6 (YOUR PROBLEM SCALE)" },
    { scale: 0.0000001, name: "1e-7 (should switch to DD)" },
    { scale: 0.00000001, name: "1e-8 (definitely DD)" }
  ];
  
  let testIndex = 0;
  
  function runNextTest() {
    if (testIndex >= testScales.length) {
      console.log('🏁 All tests complete!');
      return;
    }
    
    const test = testScales[testIndex];
    console.log(`\n🧪 Test ${testIndex + 1}: ${test.name} (${test.scale})`);
    
    viewer.setViewport({
      centerX: -0.7533,
      centerY: 0.1138,
      scale: test.scale,
      maxIterations: 1000
    });
    
    setTimeout(() => {
      const precision = viewer.renderer.getPrecisionInfo();
      const icon = precision.currentPrecision === 'dd' ? '🔬' : '📐';
      console.log(`${icon} Precision: ${precision.currentPrecision} (${precision.effectiveDigits} digits)`);
      
      if (test.scale === 0.000001) {
        if (precision.currentPrecision === 'dd') {
          console.log('✅ SUCCESS: 1e-6 now uses DD precision!');
        } else {
          console.log('❌ STILL BROKEN: 1e-6 still using standard precision');
        }
      }
      
      testIndex++;
      setTimeout(runNextTest, 500);
    }, 500);
  }
  
  runNextTest();
}