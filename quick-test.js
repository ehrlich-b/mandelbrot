// Quick browser console test
// Run this in browser console at localhost:3000

console.log('=== DD COORDINATE DEBUG TEST ===');

// Navigate to deep zoom
if (window.mandelbrot) {
    console.log('1. Setting deep zoom viewport...');
    window.mandelbrot.setViewport({
        centerX: -0.7533,
        centerY: 0.1138,
        scale: 1e-6,  // Should trigger DD mode
        maxIterations: 500
    });
    
    setTimeout(() => {
        console.log('2. Deep zoom applied');
        console.log('3. Expected: Color gradient (red left-right, green top-bottom)');
        console.log('4. If solid color: coordinate conversion broken');
        console.log('5. If gradient: coordinates OK, DD computation broken');
        
        // Check canvas pixel data
        const canvas = document.getElementById('mandelbrot-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, 10, 10);
            const pixels = imageData.data;
            
            console.log('Canvas pixels sample:', {
                topLeft: [pixels[0], pixels[1], pixels[2]],
                pixel2: [pixels[4], pixels[5], pixels[6]],
                pixel3: [pixels[8], pixels[9], pixels[10]]
            });
        }
    }, 1500);
} else {
    console.log('ERROR: window.mandelbrot not found');
}