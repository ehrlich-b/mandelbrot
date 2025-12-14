/**
 * Arbitrary Precision Module
 *
 * Provides arbitrary precision Mandelbrot computation using:
 * 1. WASM (preferred, fast)
 * 2. JavaScript fallback (slower but always available)
 */

export { BigFloatWasm, getBigFloatWasm, initBigFloatWasm } from './BigFloatWasm';
export { BigFloatJS, getBigFloatJS } from './BigFloatJS';
export {
  ReferenceOrbit,
  getReferenceOrbit,
  initReferenceOrbit,
  type ReferenceOrbitData,
} from './ReferenceOrbit';

import { BigFloatWasm, getBigFloatWasm } from './BigFloatWasm';
import { getBigFloatJS } from './BigFloatJS';

/**
 * Unified interface for arbitrary precision computation
 */
export interface ArbitraryPrecisionRenderer {
  renderTile(
    centerR: string,
    centerI: string,
    scale: string,
    tileSize: number,
    maxIter: number,
    precisionLimbs?: number
  ): Float32Array;

  mandelbrotIterate(
    cr: string,
    ci: string,
    maxIter: number,
    precisionLimbs?: number
  ): number;
}

/**
 * Get the best available arbitrary precision renderer
 * Tries WASM first, falls back to JS
 */
export async function getArbitraryPrecisionRenderer(): Promise<ArbitraryPrecisionRenderer> {
  const wasm = getBigFloatWasm();
  const initialized = await wasm.init();

  if (initialized && wasm.isAvailable()) {
    console.log('Using WASM arbitrary precision');
    return {
      renderTile: (centerR, centerI, scale, tileSize, maxIter, precLimbs = 8) =>
        wasm.renderTile(centerR, centerI, scale, tileSize, maxIter, precLimbs),
      mandelbrotIterate: (cr, ci, maxIter, precLimbs = 8) =>
        wasm.mandelbrotIterate(cr, ci, maxIter, precLimbs),
    };
  }

  console.log('WASM unavailable, using JavaScript fallback');
  const js = getBigFloatJS();
  return {
    renderTile: (centerR, centerI, scale, tileSize, maxIter, precLimbs = 8) =>
      js.renderTile(centerR, centerI, scale, tileSize, maxIter, precLimbs),
    mandelbrotIterate: (cr, ci, maxIter, precLimbs = 8) =>
      js.mandelbrotIterate(cr, ci, maxIter, precLimbs),
  };
}

/**
 * Calculate required precision limbs for a given scale
 */
export function getPrecisionForScale(scale: number): number {
  return BigFloatWasm.getPrecisionForScale(scale);
}
