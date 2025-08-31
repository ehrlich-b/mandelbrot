// Comprehensive Zoom Level Test Suite
// This will systematically test zoom levels to identify all rendering artifacts

console.log('🔬 COMPREHENSIVE ZOOM TEST SUITE');
console.log('================================');

const viewer = window.mandelbrot;
if (!viewer) {
    console.error('❌ No viewer found!');
    throw new Error('Viewer not available');
}

// Test configuration
const TEST_CENTER_X = -0.7533;
const TEST_CENTER_Y = 0.1138;
const TEST_ITERATIONS = 1000;

// Systematic zoom levels to test
const zoomTests = [
    // Normal zoom range
    { scale: 1.0, name: "Full view", expected: "standard" },
    { scale: 0.1, name: "10x zoom", expected: "standard" },
    { scale: 0.01, name: "100x zoom", expected: "standard" },
    { scale: 0.001, name: "1,000x zoom", expected: "standard" },
    
    // Approaching DD threshold
    { scale: 0.0001, name: "10K zoom (1e-4)", expected: "standard" },
    { scale: 0.00001, name: "100K zoom (1e-5)", expected: "standard" },
    { scale: 0.000001, name: "1M zoom (1e-6) - USER SAW STRIPES", expected: "standard" },
    
    // Around DD transition (threshold is 1e-8)
    { scale: 5e-8, name: "50M zoom (5e-8) - Just above DD threshold", expected: "standard" },
    { scale: 1e-8, name: "100M zoom (1e-8) - AT DD threshold", expected: "dd" },
    { scale: 5e-9, name: "200M zoom (5e-9) - Into DD territory", expected: "dd" },
    { scale: 1e-9, name: "1B zoom (1e-9) - Deep DD", expected: "dd" },
    
    // Very deep DD territory 
    { scale: 1e-10, name: "10B zoom (1e-10) - Very deep DD", expected: "dd" },
    { scale: 1e-11, name: "100B zoom (1e-11) - Ultra deep", expected: "dd" },
    { scale: 1e-12, name: "1T zoom (1e-12) - Extreme deep", expected: "dd" },
];

let currentTestIndex = 0;
const testResults = [];

function analyzeScreen() {
    // This is a placeholder - in real implementation we'd analyze the canvas pixels
    // For now, we'll ask the user to report what they see
    return {
        visualAnalysis: "USER_REPORT_NEEDED",
        timestamp: Date.now()
    };
}

function runTest(testIndex) {
    if (testIndex >= zoomTests.length) {
        console.log('\n🏁 ALL TESTS COMPLETE');
        console.log('===================');
        displayResults();
        return;
    }
    
    const test = zoomTests[testIndex];
    const testNum = testIndex + 1;
    
    console.log(`\n🧪 TEST ${testNum}/${zoomTests.length}: ${test.name}`);
    console.log(`   Scale: ${test.scale} (${test.scale.toExponential()})`);
    console.log(`   Expected precision: ${test.expected}`);
    console.log('   -----------------------------------');
    
    // Set the viewport
    viewer.setViewport({
        centerX: TEST_CENTER_X,
        centerY: TEST_CENTER_Y,
        scale: test.scale,
        maxIterations: TEST_ITERATIONS
    });
    
    // Wait for rendering to complete, then analyze
    setTimeout(() => {
        const precision = viewer.renderer.getPrecisionInfo();
        const precisionMatch = precision.currentPrecision === test.expected;
        
        const result = {
            testIndex: testIndex,
            scale: test.scale,
            name: test.name,
            expectedPrecision: test.expected,
            actualPrecision: precision.currentPrecision,
            precisionMatch: precisionMatch,
            effectiveDigits: precision.effectiveDigits,
            analysis: analyzeScreen()
        };
        
        testResults.push(result);
        
        // Report results
        const precisionIcon = precisionMatch ? '✅' : '❌';
        console.log(`   Precision: ${precisionIcon} ${precision.currentPrecision} (expected ${test.expected})`);
        console.log(`   Effective digits: ${precision.effectiveDigits}`);
        console.log(`   
   👀 VISUAL INSPECTION NEEDED:
   Look at the screen NOW and report what you see:
   • Normal fractal detail? ✅
   • Stripy patches? 🟫
   • Solid colors? ⬛
   • Garbled/corrupt? 💥
   • Blocky artifacts? 🟦
   • Other issues? 🤔`);
        
        if (test.name.includes('STRIPES')) {
            console.log('   ⚠️  This is where USER reported stripe artifacts!');
        }
        
        // Pause longer for manual inspection at problem areas
        const pauseTime = (test.scale <= 1e-6) ? 3000 : 1500;
        
        setTimeout(() => {
            runTest(testIndex + 1);
        }, pauseTime);
        
    }, 1000); // Wait for render to complete
}

function displayResults() {
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('=======================');
    
    let precisionErrors = 0;
    let transitionPoints = [];
    
    testResults.forEach((result, i) => {
        const icon = result.precisionMatch ? '✅' : '❌';
        console.log(`${icon} Test ${i+1}: ${result.name} (${result.actualPrecision})`);
        
        if (!result.precisionMatch) {
            precisionErrors++;
        }
        
        // Detect precision transitions
        if (i > 0) {
            const prevResult = testResults[i-1];
            if (prevResult.actualPrecision !== result.actualPrecision) {
                transitionPoints.push({
                    from: prevResult,
                    to: result
                });
            }
        }
    });
    
    console.log(`\n📈 ANALYSIS:`);
    console.log(`   Precision errors: ${precisionErrors}/${testResults.length}`);
    console.log(`   Transition points: ${transitionPoints.length}`);
    
    if (transitionPoints.length > 0) {
        console.log(`\n🔄 PRECISION TRANSITIONS:`);
        transitionPoints.forEach((transition, i) => {
            console.log(`   ${i+1}. ${transition.from.actualPrecision} → ${transition.to.actualPrecision}`);
            console.log(`      At scale ${transition.to.scale.toExponential()}`);
        });
    }
    
    console.log(`\n🔍 NEXT STEPS:`);
    console.log(`   1. Review visual artifacts reported above`);
    console.log(`   2. Identify common patterns in problem zones`);
    console.log(`   3. Focus debugging on transition points`);
    console.log(`   4. Test fixes at specific problem scales`);
}

// Start the test suite
console.log('🚀 Starting comprehensive zoom test...');
console.log('ℹ️  Watch the screen and note visual artifacts at each level');
runTest(0);