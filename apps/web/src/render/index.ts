/**
 * Render module exports
 *
 * Provides unified access to all rendering capabilities:
 * - Standard WebGL renderer (float32)
 * - Double-Double precision renderer (DD)
 * - Perturbation theory renderer (deep zoom)
 * - Precision manager for automatic mode selection
 */

// Renderers
export { WebGLRenderer, type RenderParams, type ProgressiveMode } from './WebGLRenderer';
export { WebGLRendererDD, type DDRenderParams } from './WebGLRendererDD';
export {
  PerturbationRenderer,
  getPerturbationRenderer,
  type PerturbationViewport,
} from './PerturbationRenderer';

// Precision management
export {
  PrecisionManager,
  getPrecisionManager,
  initPrecisionManager,
  type PrecisionMode,
  type PrecisionModeInfo,
  type PrecisionThresholds,
  type PrecisionModeChangeEvent,
} from './PrecisionManager';
