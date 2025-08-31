// 🎯 MASTER TEST GUIDE FOR DEEP ZOOM DEBUGGING
// =============================================
// 
// This guide contains all the tests to systematically identify
// and diagnose the deep zoom rendering issues you're experiencing.
//
// INSTRUCTIONS:
// 1. Open browser console  
// 2. Copy/paste each test section individually
// 3. Report what you see for each test
// 4. Note the debug colors that appear

console.log(`
🎯 MASTER DEEP ZOOM DEBUGGING GUIDE
===================================

You've reported:
1. "Big stripy patches" at some zoom levels
2. "Super fucked up" rendering when switching to DD precision
3. DD precision IS activating (we see the switch messages)

Let's systematically identify all the issues!

🎨 DEBUG COLOR LEGEND:
======================
🟦 Cyan = Bad coordinates detected in DD mode
🟣 Magenta = NaN/Infinity values detected  
🟡 Yellow = DD shader but standard precision flag
🟠 Orange = Bad input coordinates to DD arithmetic
🔴 Red = Bad magnitude calculation in DD arithmetic
🟣 Purple = Suspiciously early escape (< 5 iterations)
🍃 Mint = Bad magnitude-to-float conversion
💡 Light Yellow = Arithmetic produced NaN
🖤 Black = Interior points (normal)
🌈 Normal Colors = Everything working correctly!

🧪 TEST SEQUENCE:
================
Run these tests IN ORDER and report results:
`);

// Test 1: Quick validation
console.log(`
📋 TEST 1: QUICK VALIDATION
---------------------------
Copy and paste this code to start:`);

function test1_validation() {
    const viewer = window.mandelbrot;
    if (!viewer) {
        console.error('❌ Viewer not found!');
        return false;
    }
    
    console.log('✅ Viewer found');
    console.log('📊 Current state:');
    
    const viewport = viewer.getViewport();
    const precision = viewer.renderer.getPrecisionInfo();
    
    console.log(`   Scale: ${viewport.scale.toExponential()}`);
    console.log(`   Precision: ${precision.currentPrecision} (${precision.effectiveDigits} digits)`);
    console.log(`   Iterations: ${viewport.maxIterations}`);
    
    return true;
}

// Expose the test functions globally
window.test1_validation = test1_validation;

console.log(`
// Run this:
test1_validation()

// Then proceed to Test 2...
`);

// Test 2: Systematic zoom levels  
console.log(`
📋 TEST 2: SYSTEMATIC ZOOM LEVELS
---------------------------------
This will test many zoom levels automatically.
Copy and paste this entire block:`);

const masterZoomTest = `
// SYSTEMATIC ZOOM TEST - Copy this entire block
const zoomLevels = [
    { scale: 0.01, name: "Normal zoom" },
    { scale: 0.001, name: "1K zoom" },
    { scale: 0.0001, name: "10K zoom" },
    { scale: 0.00001, name: "100K zoom - approaching problems" },
    { scale: 0.000001, name: "1M zoom - USER STRIPE ZONE" },
    { scale: 0.0000005, name: "2M zoom - deeper stripe zone?" },
    { scale: 1e-7, name: "10M zoom - approaching DD" },
    { scale: 5e-8, name: "20M zoom - just above DD threshold" },
    { scale: 1e-8, name: "100M zoom - AT DD THRESHOLD" },
    { scale: 5e-9, name: "200M zoom - DD territory" },
    { scale: 1e-9, name: "1B zoom - deep DD" },
    { scale: 1e-10, name: "10B zoom - very deep DD" },
    { scale: 1e-11, name: "100B zoom - ultra deep DD" },
];

let currentTest = 0;
function runMasterTest() {
    if (currentTest >= zoomLevels.length) {
        console.log('🏁 MASTER TEST COMPLETE');
        console.log('📋 Now run Test 3 for targeted analysis...');
        return;
    }
    
    const test = zoomLevels[currentTest];
    console.log(\`\\n🧪 MASTER TEST \${currentTest + 1}/\${zoomLevels.length}: \${test.name}\`);
    console.log(\`   Scale: \${test.scale.toExponential()}\`);
    
    window.mandelbrot.setViewport({
        centerX: -0.7533,
        centerY: 0.1138,
        scale: test.scale,
        maxIterations: 1000
    });
    
    setTimeout(() => {
        const precision = window.mandelbrot.renderer.getPrecisionInfo();
        console.log(\`   Precision: \${precision.currentPrecision} (\${precision.effectiveDigits} digits)\`);
        console.log(\`   
   👀 REPORT WHAT YOU SEE:
   • Normal fractal detail? ✅
   • Stripy patterns? 🟫 
   • Solid colors? ⬛
   • Debug colors? 🎨
   • Garbled/corrupt? 💥
   • Other artifacts? 🤔\`);
        
        currentTest++;
        setTimeout(runMasterTest, 2000);
    }, 1000);
}

// Start the master test
console.log('🚀 Starting master zoom test...');
runMasterTest();
`;

console.log(masterZoomTest);

console.log(`
📋 TEST 3: DEBUG COLOR ANALYSIS  
-------------------------------
After Test 2, if you see ANY debug colors, copy this:`);

const debugColorTest = `
// DEBUG COLOR ANALYSIS - Copy this block
console.log('🎨 DEBUG COLOR ANALYSIS');
console.log('Looking for specific debug colors at problem scales...');

const debugTests = [
    { scale: 1e-6, name: "At stripe zone" },
    { scale: 1e-8, name: "At DD threshold" }, 
    { scale: 1e-9, name: "In DD territory" },
    { scale: 1e-11, name: "Deep DD territory" },
];

let debugIndex = 0;
function runDebugTest() {
    if (debugIndex >= debugTests.length) {
        console.log('🏁 DEBUG COLOR TEST COMPLETE');
        return;
    }
    
    const test = debugTests[debugIndex];
    console.log(\`\\n🎨 DEBUG TEST \${debugIndex + 1}: \${test.name}\`);
    
    window.mandelbrot.setViewport({
        centerX: -0.7533,
        centerY: 0.1138, 
        scale: test.scale,
        maxIterations: 1500
    });
    
    setTimeout(() => {
        console.log(\`
   🔍 DEBUG COLOR CHECKLIST:
   🟠 Orange pixels? = Bad DD input coordinates
   🔴 Red pixels? = Bad DD magnitude calculation  
   🟣 Purple pixels? = Early escape detection
   🍃 Mint pixels? = Bad magnitude conversion
   💡 Light yellow pixels? = DD arithmetic NaN
   🟦 Cyan pixels? = Coordinate bounds issues
   🟣 Magenta pixels? = General NaN/Infinity
   🟡 Yellow pixels? = Shader logic errors
   
   Report which colors you see!\`);
        
        debugIndex++;
        setTimeout(runDebugTest, 3000);
    }, 1500);
}

runDebugTest();
`;

console.log(debugColorTest);

console.log(`
📋 WHAT TO REPORT:
=================
For each test, tell me:

1. STRIPES: Describe the stripe patterns
   • Horizontal, vertical, or diagonal?
   • Regular spacing or irregular?
   • Do they change with iterations?
   • What zoom levels show stripes?

2. DD ISSUES: Describe the "fucked up" rendering  
   • What does it look like? Random pixels? Patterns?
   • Any debug colors visible?
   • Does it get worse with deeper zoom?
   • Is it consistent or does it change?

3. TRANSITIONS: What happens at precision switches?
   • Sudden change in rendering quality?
   • Different types of artifacts?
   • Smooth transition or jarring?

4. DEBUG COLORS: Which debug colors appear and when?
   • This tells us exactly what's broken!

🎯 NEXT STEPS:
=============
Based on your reports, I'll:
1. Fix the specific DD arithmetic issues
2. Address coordinate precision problems  
3. Fix stripe artifacts
4. Optimize the precision threshold
5. Add proper error handling

Ready? Start with test1_validation() and let me know what you find!
`);

window.masterZoomTest = masterZoomTest;
window.debugColorTest = debugColorTest;