import { MandelbrotViewer } from './MandelbrotViewer';
import './style.css';

const canvas = document.createElement('canvas');
canvas.id = 'mandelbrot-canvas';
document.body.appendChild(canvas);

const viewer = new MandelbrotViewer(canvas);

viewer.init().then(() => {
  console.log('Mandelbrot viewer initialized');
  viewer.start();
}).catch(error => {
  console.error('Failed to initialize Mandelbrot viewer:', error);
  document.body.innerHTML = `
    <div class="error">
      <h1>Failed to load Mandelbrot viewer</h1>
      <p>${error.message}</p>
      <p>Please make sure your browser supports WebGL2.</p>
    </div>
  `;
});

// Handle window resize
window.addEventListener('resize', () => {
  viewer.resize();
});

// Expose for debugging
(window as any).mandelbrot = viewer;