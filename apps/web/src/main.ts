import { MandelbrotViewer } from './MandelbrotViewer';
import './style.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

const canvas = document.createElement('canvas');
canvas.id = 'mandelbrot-canvas';
root.appendChild(canvas);

const viewer = new MandelbrotViewer(canvas);

console.log('Creating MandelbrotViewer...');
viewer.init().then(() => {
  console.log('Mandelbrot viewer initialized successfully');
  viewer.start();
  console.log('Mandelbrot viewer started');
}).catch(error => {
  console.error('Failed to initialize Mandelbrot viewer:', error);
  root.innerHTML = `
    <div class="error">
      <h1>Failed to load Mandelbrot viewer</h1>
      <p>${error.message}</p>
      <p>Please make sure your browser supports WebGL2.</p>
      <p>Check browser console for more details.</p>
    </div>
  `;
});

// Handle window resize
window.addEventListener('resize', () => {
  viewer.resize();
});

// Expose for debugging
(window as any).mandelbrot = viewer;