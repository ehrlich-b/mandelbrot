/**
 * Complex Double-Double Arithmetic
 * 
 * Complex number operations using double-double precision for both real and imaginary parts.
 * Enables deep zoom into the Mandelbrot set with 128-bit effective precision per component.
 */

import {
  DoubleDouble,
  ddAdd,
  ddSub,
  ddMul,
  ddDiv,
  ddNeg,
  ddSqr,
  ddSqrt,
  ddFromNumber,
  ddToNumber,
  ddToString,
  ddCompare,
  ddEquals,
  ddIsZero,
  ddIsFinite,
  DD_ZERO,
  DD_ONE,
  DD_TWO
} from './dd.js';

/**
 * Complex number with double-double precision
 */
export interface ComplexDD {
  readonly re: DoubleDouble;  // Real part
  readonly im: DoubleDouble;  // Imaginary part
}

/**
 * Create a complex DD from two regular numbers
 */
export function complexDDFromNumbers(re: number, im: number = 0): ComplexDD {
  return {
    re: ddFromNumber(re),
    im: ddFromNumber(im)
  };
}

/**
 * Create a complex DD from two double-doubles
 */
export function complexDDFromDD(re: DoubleDouble, im: DoubleDouble): ComplexDD {
  return { re, im };
}

/**
 * Convert complex DD to regular complex number (with precision loss)
 */
export function complexDDToNumbers(z: ComplexDD): { re: number; im: number } {
  return {
    re: ddToNumber(z.re),
    im: ddToNumber(z.im)
  };
}

/**
 * Convert complex DD to string representation
 */
export function complexDDToString(z: ComplexDD, precision: number = 16): string {
  const re = ddToString(z.re, precision);
  const im = ddToString(z.im, precision);
  
  if (ddIsZero(z.im)) {
    return re;
  }
  
  const imSign = ddCompare(z.im, DD_ZERO) >= 0 ? '+' : '';
  return `${re}${imSign}${im}i`;
}

/**
 * Add two complex DD numbers
 * (a + bi) + (c + di) = (a + c) + (b + d)i
 */
export function complexDDAdd(z1: ComplexDD, z2: ComplexDD): ComplexDD {
  return {
    re: ddAdd(z1.re, z2.re),
    im: ddAdd(z1.im, z2.im)
  };
}

/**
 * Subtract two complex DD numbers
 * (a + bi) - (c + di) = (a - c) + (b - d)i
 */
export function complexDDSub(z1: ComplexDD, z2: ComplexDD): ComplexDD {
  return {
    re: ddSub(z1.re, z2.re),
    im: ddSub(z1.im, z2.im)
  };
}

/**
 * Multiply two complex DD numbers
 * (a + bi)(c + di) = (ac - bd) + (ad + bc)i
 */
export function complexDDMul(z1: ComplexDD, z2: ComplexDD): ComplexDD {
  const ac = ddMul(z1.re, z2.re);
  const bd = ddMul(z1.im, z2.im);
  const ad = ddMul(z1.re, z2.im);
  const bc = ddMul(z1.im, z2.re);
  
  return {
    re: ddSub(ac, bd),
    im: ddAdd(ad, bc)
  };
}

/**
 * Divide two complex DD numbers
 * (a + bi) / (c + di) = ((ac + bd) + (bc - ad)i) / (c² + d²)
 */
export function complexDDDiv(z1: ComplexDD, z2: ComplexDD): ComplexDD {
  const c2 = ddSqr(z2.re);
  const d2 = ddSqr(z2.im);
  const denom = ddAdd(c2, d2);
  
  const ac = ddMul(z1.re, z2.re);
  const bd = ddMul(z1.im, z2.im);
  const bc = ddMul(z1.im, z2.re);
  const ad = ddMul(z1.re, z2.im);
  
  const numRe = ddAdd(ac, bd);
  const numIm = ddSub(bc, ad);
  
  return {
    re: ddDiv(numRe, denom),
    im: ddDiv(numIm, denom)
  };
}

/**
 * Negate a complex DD number
 */
export function complexDDNeg(z: ComplexDD): ComplexDD {
  return {
    re: ddNeg(z.re),
    im: ddNeg(z.im)
  };
}

/**
 * Complex conjugate
 * conj(a + bi) = a - bi
 */
export function complexDDConj(z: ComplexDD): ComplexDD {
  return {
    re: z.re,
    im: ddNeg(z.im)
  };
}

/**
 * Square a complex DD number
 * (a + bi)² = (a² - b²) + 2abi
 */
export function complexDDSqr(z: ComplexDD): ComplexDD {
  const a2 = ddSqr(z.re);
  const b2 = ddSqr(z.im);
  const ab2 = ddMul(DD_TWO, ddMul(z.re, z.im));
  
  return {
    re: ddSub(a2, b2),
    im: ab2
  };
}

/**
 * Magnitude squared of a complex DD number
 * |a + bi|² = a² + b²
 */
export function complexDDMagnitudeSquared(z: ComplexDD): DoubleDouble {
  const a2 = ddSqr(z.re);
  const b2 = ddSqr(z.im);
  return ddAdd(a2, b2);
}

/**
 * Magnitude of a complex DD number
 * |a + bi| = √(a² + b²)
 */
export function complexDDMagnitude(z: ComplexDD): DoubleDouble {
  return ddSqrt(complexDDMagnitudeSquared(z));
}

/**
 * Check if two complex DD numbers are equal
 */
export function complexDDEquals(z1: ComplexDD, z2: ComplexDD): boolean {
  return ddEquals(z1.re, z2.re) && ddEquals(z1.im, z2.im);
}

/**
 * Check if a complex DD number is zero
 */
export function complexDDIsZero(z: ComplexDD): boolean {
  return ddIsZero(z.re) && ddIsZero(z.im);
}

/**
 * Check if a complex DD number is finite
 */
export function complexDDIsFinite(z: ComplexDD): boolean {
  return ddIsFinite(z.re) && ddIsFinite(z.im);
}

// Common complex constants
export const COMPLEX_DD_ZERO = complexDDFromNumbers(0, 0);
export const COMPLEX_DD_ONE = complexDDFromNumbers(1, 0);
export const COMPLEX_DD_I = complexDDFromNumbers(0, 1);

/**
 * Complex DD power function: z^n for integer n
 */
export function complexDDPowInt(z: ComplexDD, n: number): ComplexDD {
  if (n === 0) return COMPLEX_DD_ONE;
  if (n === 1) return z;
  if (n === 2) return complexDDSqr(z);
  
  if (n < 0) {
    const reciprocal = complexDDDiv(COMPLEX_DD_ONE, z);
    return complexDDPowInt(reciprocal, -n);
  }
  
  // Binary exponentiation
  let result = COMPLEX_DD_ONE;
  let base = z;
  let exponent = n;
  
  while (exponent > 0) {
    if (exponent % 2 === 1) {
      result = complexDDMul(result, base);
    }
    base = complexDDSqr(base);
    exponent = Math.floor(exponent / 2);
  }
  
  return result;
}

/**
 * Mandelbrot iteration with double-double precision
 * z_{n+1} = z_n^2 + c
 * 
 * Returns the iteration count where |z| exceeds escapeRadius,
 * or maxIterations if it doesn't escape
 */
export function mandelbrotDD(
  c: ComplexDD, 
  maxIterations: number = 1000, 
  escapeRadius: number = 2.0
): { iterations: number; z: ComplexDD; escaped: boolean } {
  let z = COMPLEX_DD_ZERO;
  const escapeRadiusDD = ddFromNumber(escapeRadius);
  const escapeRadius2DD = ddSqr(escapeRadiusDD);
  
  for (let i = 0; i < maxIterations; i++) {
    const magnitudeSquared = complexDDMagnitudeSquared(z);
    
    if (ddCompare(magnitudeSquared, escapeRadius2DD) > 0) {
      return { iterations: i, z, escaped: true };
    }
    
    // z = z^2 + c
    z = complexDDAdd(complexDDSqr(z), c);
  }
  
  return { iterations: maxIterations, z, escaped: false };
}

/**
 * Smooth iteration count for Mandelbrot set with double-double precision
 * Uses the formula: n + 1 - log2(log2(|z|))
 */
export function mandelbrotSmoothDD(
  c: ComplexDD,
  maxIterations: number = 1000,
  escapeRadius: number = 2.0
): number {
  const result = mandelbrotDD(c, maxIterations, escapeRadius);
  
  if (!result.escaped) {
    return maxIterations;
  }
  
  const magnitude = complexDDMagnitude(result.z);
  const logMag = Math.log(ddToNumber(magnitude));
  const logLogMag = Math.log(logMag);
  const smoothness = logLogMag / Math.log(2);
  
  return Math.max(0, result.iterations + 1 - smoothness);
}

/**
 * Derivative computation for distance estimation
 * For z_{n+1} = z_n^2 + c, we have dz_{n+1} = 2*z_n*dz_n + 1
 */
export function mandelbrotDerivativeDD(
  c: ComplexDD,
  maxIterations: number = 1000,
  escapeRadius: number = 2.0
): { z: ComplexDD; dz: ComplexDD; iterations: number; escaped: boolean } {
  let z = COMPLEX_DD_ZERO;
  let dz = COMPLEX_DD_ONE;  // d/dc(c) = 1
  
  const escapeRadiusDD = ddFromNumber(escapeRadius);
  const escapeRadius2DD = ddSqr(escapeRadiusDD);
  
  for (let i = 0; i < maxIterations; i++) {
    const magnitudeSquared = complexDDMagnitudeSquared(z);
    
    if (ddCompare(magnitudeSquared, escapeRadius2DD) > 0) {
      return { z, dz, iterations: i, escaped: true };
    }
    
    // dz = 2*z*dz + 1
    const twozDz = complexDDMul(complexDDFromNumbers(2, 0), complexDDMul(z, dz));
    dz = complexDDAdd(twozDz, COMPLEX_DD_ONE);
    
    // z = z^2 + c
    z = complexDDAdd(complexDDSqr(z), c);
  }
  
  return { z, dz, iterations: maxIterations, escaped: false };
}

/**
 * Distance estimation for Mandelbrot set boundary
 * Uses the formula: |z| * ln(|z|) / |dz|
 */
export function mandelbrotDistanceDD(
  c: ComplexDD,
  maxIterations: number = 1000,
  escapeRadius: number = 2.0
): number {
  const result = mandelbrotDerivativeDD(c, maxIterations, escapeRadius);
  
  if (!result.escaped) {
    return 0;  // Interior point
  }
  
  const zMag = complexDDMagnitude(result.z);
  const dzMag = complexDDMagnitude(result.dz);
  
  const zMagNum = ddToNumber(zMag);
  const dzMagNum = ddToNumber(dzMag);
  
  if (dzMagNum === 0) {
    return 0;  // Avoid division by zero
  }
  
  return (2 * zMagNum * Math.log(zMagNum)) / dzMagNum;
}