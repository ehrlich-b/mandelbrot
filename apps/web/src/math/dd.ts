/**
 * Double-Double Arithmetic Implementation
 * 
 * Provides 128-bit effective precision arithmetic using pairs of IEEE 754 doubles.
 * Based on algorithms from Shewchuk, Dekker, and QD library.
 * 
 * A double-double number is represented as (hi, lo) where:
 * - hi + lo = the intended value
 * - |lo| ≤ 0.5 * ulp(hi) (usually much smaller)
 * - hi is the "significant" part
 */

/**
 * Double-double number representation
 * Maintains the invariant that |lo| <= 0.5 * ulp(hi)
 */
export interface DoubleDouble {
  readonly hi: number;  // High-order component
  readonly lo: number;  // Low-order component
}

// Constants
export const DD_EPS = 1.23259516440783e-32;  // 2^-106, double-double machine epsilon
export const DD_MIN = 2.0041683600089728e-292; // Minimum normalized double-double
export const DD_MAX = 1.79769313486231570815e+308; // Maximum double-double

/**
 * Fast two-sum algorithm by Knuth/Møller
 * Requires |a| >= |b|
 */
function fastTwoSum(a: number, b: number): DoubleDouble {
  const s = a + b;
  const e = b - (s - a);
  return { hi: s, lo: e };
}

/**
 * Two-sum algorithm by Shewchuk
 * Works for arbitrary a, b
 */
function twoSum(a: number, b: number): DoubleDouble {
  const s = a + b;
  const v = s - a;
  const e = (a - (s - v)) + (b - v);
  return { hi: s, lo: e };
}

/**
 * Two-product algorithm by Dekker
 * Computes a * b as exact sum of two doubles
 */
function twoProduct(a: number, b: number): DoubleDouble {
  // Split factor for 53-bit mantissa
  const SPLIT = 134217729.0; // 2^27 + 1
  
  const c = SPLIT * a;
  const abig = c - a;
  const ahi = c - abig;
  const alo = a - ahi;
  
  const d = SPLIT * b;
  const bbig = d - b;
  const bhi = d - bbig;
  const blo = b - bhi;
  
  const p = a * b;
  const err = ((ahi * bhi - p) + ahi * blo + alo * bhi) + alo * blo;
  
  return { hi: p, lo: err };
}

/**
 * Create a double-double from a single double
 * NOTE: This is for CPU-side DD arithmetic where both hi and lo are float64.
 * For GLSL (where hi and lo are float32), use ddFromNumberForGLSL().
 */
export function ddFromNumber(x: number): DoubleDouble {
  return { hi: x, lo: 0.0 };
}

/**
 * Create a double-double from a float64 for use in GLSL shaders.
 *
 * CRITICAL: In GLSL, uniforms are float32. When we pass a DD as vec2/vec4,
 * each component is truncated to float32. This function properly splits
 * a float64 into two float32 values such that hi + lo ≈ original.
 *
 * This gives us ~48 bits of mantissa precision (vs 24 for float32 alone).
 */
export function ddFromNumberForGLSL(x: number): DoubleDouble {
  // Math.fround() rounds to float32 precision
  const hi = Math.fround(x);
  // The difference captures what was lost in the rounding
  const lo = Math.fround(x - hi);
  return { hi, lo };
}

/**
 * Create a double-double from two doubles (hi, lo)
 * Automatically normalizes to maintain invariants
 */
export function ddFromPair(hi: number, lo: number): DoubleDouble {
  return ddNormalize({ hi, lo });
}

/**
 * Create a double-double from a string
 * Supports decimal notation and scientific notation
 */
export function ddFromString(str: string): DoubleDouble {
  const trimmed = str.trim();
  
  // Handle special cases
  if (trimmed === 'Infinity' || trimmed === '+Infinity') {
    return { hi: Infinity, lo: 0.0 };
  }
  if (trimmed === '-Infinity') {
    return { hi: -Infinity, lo: 0.0 };
  }
  if (trimmed === 'NaN') {
    return { hi: NaN, lo: NaN };
  }
  
  // Parse as regular number first
  const approx = parseFloat(trimmed);
  if (isNaN(approx)) {
    return { hi: NaN, lo: NaN };
  }
  
  // For simple cases, return single-precision result
  if (!isFinite(approx) || Math.abs(approx) < 1e-300 || Math.abs(approx) > 1e300) {
    return { hi: approx, lo: 0.0 };
  }
  
  // TODO: Implement full decimal string parsing for maximum precision
  // For now, return double precision approximation
  return { hi: approx, lo: 0.0 };
}

/**
 * Normalize a double-double to maintain invariants
 * Ensures |lo| <= 0.5 * ulp(hi)
 */
export function ddNormalize(dd: DoubleDouble): DoubleDouble {
  const { hi, lo } = dd;
  
  // Handle special cases
  if (!isFinite(hi)) {
    return { hi, lo: isFinite(lo) ? 0.0 : lo };
  }
  
  // Quick two-sum to renormalize
  const s = hi + lo;
  const e = lo - (s - hi);
  
  return { hi: s, lo: e };
}

/**
 * Convert double-double to regular double (with precision loss)
 */
export function ddToNumber(dd: DoubleDouble): number {
  return dd.hi + dd.lo;
}

/**
 * Convert double-double to string representation
 */
export function ddToString(dd: DoubleDouble, precision: number = 32): string {
  if (!isFinite(dd.hi)) {
    return dd.hi.toString();
  }
  
  if (dd.hi === 0.0 && dd.lo === 0.0) {
    return '0.0';
  }
  
  // Simple implementation - return high part with more precision
  // TODO: Implement full decimal conversion
  return ddToNumber(dd).toPrecision(precision);
}

/**
 * Add two double-doubles
 */
export function ddAdd(a: DoubleDouble, b: DoubleDouble): DoubleDouble {
  const { hi: s, lo: e } = twoSum(a.hi, b.hi);
  const f = twoSum(a.lo, b.lo);
  const c = ddNormalize({ hi: e + f.hi, lo: f.lo });
  return fastTwoSum(s, c.hi + c.lo);
}

/**
 * Subtract two double-doubles
 */
export function ddSub(a: DoubleDouble, b: DoubleDouble): DoubleDouble {
  return ddAdd(a, ddNeg(b));
}

/**
 * Multiply two double-doubles
 */
export function ddMul(a: DoubleDouble, b: DoubleDouble): DoubleDouble {
  const { hi: p, lo: err } = twoProduct(a.hi, b.hi);
  const err2 = a.hi * b.lo + a.lo * b.hi;
  return fastTwoSum(p, err + err2);
}

/**
 * Divide two double-doubles
 */
export function ddDiv(a: DoubleDouble, b: DoubleDouble): DoubleDouble {
  const q1 = a.hi / b.hi;
  const prod = ddMul({ hi: q1, lo: 0.0 }, b);
  const diff = ddSub(a, prod);
  const q2 = diff.hi / b.hi;
  return fastTwoSum(q1, q2);
}

/**
 * Negate a double-double
 */
export function ddNeg(a: DoubleDouble): DoubleDouble {
  return { hi: -a.hi, lo: -a.lo };
}

/**
 * Absolute value of a double-double
 */
export function ddAbs(a: DoubleDouble): DoubleDouble {
  return a.hi < 0 ? ddNeg(a) : a;
}

/**
 * Square a double-double
 */
export function ddSqr(a: DoubleDouble): DoubleDouble {
  const { hi: p, lo: err } = twoProduct(a.hi, a.hi);
  const err2 = 2.0 * a.hi * a.lo;
  return fastTwoSum(p, err + err2);
}

/**
 * Compare two double-doubles
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function ddCompare(a: DoubleDouble, b: DoubleDouble): number {
  if (a.hi < b.hi) return -1;
  if (a.hi > b.hi) return 1;
  if (a.lo < b.lo) return -1;
  if (a.lo > b.lo) return 1;
  return 0;
}

/**
 * Check if two double-doubles are equal
 */
export function ddEquals(a: DoubleDouble, b: DoubleDouble): boolean {
  return a.hi === b.hi && a.lo === b.lo;
}

/**
 * Check if a double-double is zero
 */
export function ddIsZero(a: DoubleDouble): boolean {
  return a.hi === 0.0 && a.lo === 0.0;
}

/**
 * Check if a double-double is finite
 */
export function ddIsFinite(a: DoubleDouble): boolean {
  return isFinite(a.hi) && isFinite(a.lo);
}

/**
 * Check if a double-double is NaN
 */
export function ddIsNaN(a: DoubleDouble): boolean {
  return isNaN(a.hi) || isNaN(a.lo);
}

// Common constants as double-doubles
export const DD_ZERO = ddFromNumber(0.0);
export const DD_ONE = ddFromNumber(1.0);
export const DD_TWO = ddFromNumber(2.0);
export const DD_HALF = ddFromNumber(0.5);

/**
 * Square root using Newton-Raphson iteration
 */
export function ddSqrt(a: DoubleDouble): DoubleDouble {
  if (ddCompare(a, DD_ZERO) < 0) {
    return { hi: NaN, lo: NaN };
  }
  
  if (ddIsZero(a)) {
    return DD_ZERO;
  }
  
  // Initial approximation
  let x = ddFromNumber(Math.sqrt(a.hi));
  
  // Newton-Raphson: x_{n+1} = 0.5 * (x_n + a/x_n)
  for (let i = 0; i < 4; i++) {
    const quotient = ddDiv(a, x);
    const sum = ddAdd(x, quotient);
    x = ddMul(DD_HALF, sum);
  }
  
  return x;
}

/**
 * Natural logarithm (base e)
 */
export function ddLog(a: DoubleDouble): DoubleDouble {
  if (ddCompare(a, DD_ZERO) <= 0) {
    return { hi: -Infinity, lo: 0.0 };
  }
  
  // Use built-in log for approximation
  // TODO: Implement high-precision logarithm
  return ddFromNumber(Math.log(ddToNumber(a)));
}

/**
 * Exponential function
 */
export function ddExp(a: DoubleDouble): DoubleDouble {
  // Use built-in exp for approximation
  // TODO: Implement high-precision exponential
  return ddFromNumber(Math.exp(ddToNumber(a)));
}

/**
 * Power function: a^b
 */
export function ddPow(a: DoubleDouble, b: DoubleDouble): DoubleDouble {
  // Handle special cases
  if (ddIsZero(b)) return DD_ONE;
  if (ddIsZero(a) && ddCompare(b, DD_ZERO) > 0) return DD_ZERO;
  
  // Use exp(b * ln(a))
  return ddExp(ddMul(b, ddLog(a)));
}