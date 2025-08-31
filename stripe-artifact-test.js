// Targeted test for stripe artifacts the user reported
// Focus on the problematic zones

console.log('🟫 STRIPE ARTIFACT INVESTIGATION');
console.log('================================');

const viewer = window.mandelbrot;
if (!viewer) {
    console.error('❌ No viewer found!');
    throw new Error('Viewer not available');
}

// Test different iteration counts at problem scales
const stripeTests = [
    { scale: 1e-6, iterations: 256, name: "Low iterations at stripe zone" },
    { scale: 1e-6, iterations: 512, name: "Medium iterations at stripe zone" },
    { scale: 1e-6, iterations: 1000, name: "High iterations at stripe zone" },
    { scale: 1e-6, iterations: 2048, name: "Very high iterations at stripe zone" },
    
    { scale: 5e-7, iterations: 1000, name: "Slightly deeper than stripe zone" },
    { scale: 2e-6, iterations: 1000, name: "Slightly shallower than stripe zone" },
    
    // Test different locations
    { scale: 1e-6, iterations: 1000, centerX: -0.5, centerY: 0, name: "Stripe test at main bulb" },
    { scale: 1e-6, iterations: 1000, centerX: -1.25, centerY: 0, name: "Stripe test at period-2 bulb" },
];

let testIndex = 0;

function runStripeTest() {
    if (testIndex >= stripeTests.length) {
        console.log('\n🏁 STRIPE TESTS COMPLETE');
        console.log('Ask user: Did any of these eliminate or change the stripes?');
        return;
    }
    
    const test = stripeTests[testIndex];
    
    console.log(`\n🧪 STRIPE TEST ${testIndex + 1}: ${test.name}`);
    console.log(`   Scale: ${test.scale.toExponential()}`);
    console.log(`   Iterations: ${test.iterations}`);
    console.log(`   Location: (${test.centerX || -0.7533}, ${test.centerY || 0.1138})`);
    
    viewer.setViewport({
        centerX: test.centerX || -0.7533,
        centerY: test.centerY || 0.1138,
        scale: test.scale,
        maxIterations: test.iterations
    });
    
    setTimeout(() => {
        const precision = viewer.renderer.getPrecisionInfo();
        console.log(`   Precision: ${precision.currentPrecision} (${precision.effectiveDigits} digits)`);
        console.log(`   
   👀 STRIPE ANALYSIS:
   • Are there horizontal/vertical stripes? 📏
   • Are they regular/periodic? 🔄
   • Do they change with iterations? 🔢
   • Are they related to coordinate precision? 📍
   • Different pattern than before? 🆚`);
        
        testIndex++;
        setTimeout(runStripeTest, 2500); // Longer pause for analysis
        
    }, 1000);
}

console.log('🚀 Starting stripe artifact tests...');
runStripeTest();