// Deep dive test for DD precision issues
// Focus on the "super fucked up" rendering in DD territory

console.log('🔬 DOUBLE-DOUBLE PRECISION INVESTIGATION');
console.log('========================================');

const viewer = window.mandelbrot;
if (!viewer) {
    console.error('❌ No viewer found!');
    throw new Error('Viewer not available');
}

// Test scales around and deep into DD territory
const ddTests = [
    // Transition zone testing
    { scale: 1.1e-8, name: "Just above DD threshold (should be standard)" },
    { scale: 1.0e-8, name: "Exactly at DD threshold (borderline)" },
    { scale: 0.9e-8, name: "Just below DD threshold (should be DD)" },
    { scale: 0.5e-8, name: "Clearly in DD territory" },
    
    // Progressive depth testing
    { scale: 1e-9, name: "10x deeper into DD" },
    { scale: 1e-10, name: "100x deeper into DD" },
    { scale: 1e-11, name: "1000x deeper into DD" },
    { scale: 1e-12, name: "10000x deeper into DD" },
    
    // Edge case testing
    { scale: 1e-15, name: "Extremely deep DD (precision limits?)" },
    { scale: 1e-20, name: "Ridiculously deep DD (should break?)" },
];

let testIndex = 0;

function analyzeDDRendering(scale) {
    // Try to detect common DD precision issues
    console.log(`   
   🔍 DD ANALYSIS CHECKLIST:
   Scale: ${scale.toExponential()}
   
   COORDINATE ISSUES:
   • Are coordinates reasonable? (should be near -0.75, 0.11)
   • Cyan pixels = bad coordinate detection 🟦
   • Coordinates way outside expected range? 📍
   
   ARITHMETIC ISSUES:
   • Magenta pixels = NaN/Infinity detection 🟣  
   • All pixels same color = arithmetic failure ⬛
   • Pixelated/blocky = precision loss 🟦
   
   ITERATION ISSUES:
   • Does detail scale correctly with zoom? 🔍
   • Iteration count appropriate for zoom level? 🔢
   • Escape detection working? 🏃
   
   DD-SPECIFIC:
   • Yellow pixels = DD shader logic error 🟡
   • Regular patterns = DD split constant issues 📐
   • Smooth vs choppy transitions = DD addition/multiplication ➕
   
   Visual artifacts to report:
   • Garbage/random pixels = DD arithmetic totally broken 💥
   • Repeating patterns = DD constants wrong 🔄
   • Banding = DD precision insufficient 📊
   • Blocky = DD coordinate conversion issues 🧱`);
}

function runDDTest() {
    if (testIndex >= ddTests.length) {
        console.log('\n🏁 DD PRECISION TESTS COMPLETE');
        console.log(`
📋 SUMMARY QUESTIONS FOR USER:
1. At what scale did rendering first become "fucked up"?
2. What type of "fucked up" - garbage pixels, patterns, or solid colors?
3. Did any deep scales render correctly, or all broken?
4. Were there any debug colors (cyan, magenta, yellow)?
5. Did the artifacts change as you went deeper, or consistent?

🔧 This will help identify whether the issue is:
   • DD arithmetic implementation (wrong constants, etc)
   • DD coordinate conversion (precision loss in conversion)
   • DD iteration logic (escape detection, smooth coloring)
   • DD uniform passing (shader not getting right values)
`);
        return;
    }
    
    const test = ddTests[testIndex];
    
    console.log(`\n🧪 DD TEST ${testIndex + 1}/${ddTests.length}: ${test.name}`);
    console.log(`   Scale: ${test.scale.toExponential()}`);
    
    viewer.setViewport({
        centerX: -0.7533,
        centerY: 0.1138,
        scale: test.scale,
        maxIterations: 1500 // Higher iterations for DD precision
    });
    
    setTimeout(() => {
        const precision = viewer.renderer.getPrecisionInfo();
        const expectedDD = test.scale < 1e-8;
        const precisionCorrect = (expectedDD && precision.currentPrecision === 'dd') || 
                                (!expectedDD && precision.currentPrecision === 'standard');
        
        console.log(`   Precision: ${precision.currentPrecision} (${precision.effectiveDigits} digits) ${precisionCorrect ? '✅' : '❌'}`);
        
        analyzeDDRendering(test.scale);
        
        testIndex++;
        setTimeout(runDDTest, 3000); // Long pause for detailed analysis
        
    }, 1200);
}

console.log('🚀 Starting DD precision investigation...');
console.log('ℹ️  Pay special attention to debug colors and artifact patterns');
runDDTest();