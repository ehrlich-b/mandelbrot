// Debug color test for DD renderer
// Copy and paste this into browser console

console.log('🎨 Debug Color Test - Checking DD rendering');

const viewer = window.mandelbrot;
if (!viewer) {
  console.log('❌ No viewer found');
} else {
  console.log('📱 Testing DD precision at 1e-6...');
  
  viewer.setViewport({
    centerX: -0.7533,
    centerY: 0.1138,
    scale: 0.000001, // 1e-6
    maxIterations: 500
  });
  
  setTimeout(() => {
    const precision = viewer.renderer.getPrecisionInfo();
    console.log(`🔬 Current precision: ${precision.currentPrecision}`);
    console.log(`📏 Scale: ${precision.scale}`);
    
    console.log('🎨 Look at the screen now:');
    console.log('   🟦 Cyan = Bad coordinates in DD mode');
    console.log('   🟣 Magenta = NaN/Infinity values');
    console.log('   🟡 Yellow = DD shader but standard precision flag');
    console.log('   🖤 Black = Interior points (normal)');
    console.log('   🌈 Colors = Working correctly!');
    
    if (precision.currentPrecision === 'dd') {
      console.log('✅ DD precision is active - look for colors above');
    } else {
      console.log('❌ Still standard precision');
    }
  }, 1000);
}