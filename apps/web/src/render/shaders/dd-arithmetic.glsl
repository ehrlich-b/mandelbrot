/**
 * Double-Double Arithmetic in GLSL
 * 
 * Emulates 128-bit precision arithmetic using pairs of floats in WebGL2.
 * Based on algorithms from Shewchuk, Dekker, and QD library.
 * 
 * Note: GLSL uses IEEE 754 single-precision (32-bit) floats, so we get
 * approximately 64-bit effective precision (not full 128-bit).
 * For true 128-bit precision, WebGPU with double precision would be needed.
 */

// Double-double number represented as a vec2: (hi, lo)
// Maintains the invariant that |lo| <= 0.5 * ulp(hi)

// Constants
const float DD_EPS = 5.96046448e-08;  // 2^-24, single-precision machine epsilon in GLSL
const float DD_SPLIT = 4097.0;        // 2^12 + 1 for 24-bit mantissa

/**
 * Fast two-sum algorithm by Knuth/Møller
 * Requires |a| >= |b|
 */
vec2 dd_fast_two_sum(float a, float b) {
    float s = a + b;
    float e = b - (s - a);
    return vec2(s, e);
}

/**
 * Two-sum algorithm by Shewchuk
 * Works for arbitrary a, b
 */
vec2 dd_two_sum(float a, float b) {
    float s = a + b;
    float v = s - a;
    float e = (a - (s - v)) + (b - v);
    return vec2(s, e);
}

/**
 * Two-product algorithm adapted for single precision
 * Computes a * b as exact sum of two floats
 */
vec2 dd_two_product(float a, float b) {
    float c = DD_SPLIT * a;
    float abig = c - a;
    float ahi = c - abig;
    float alo = a - ahi;
    
    float d = DD_SPLIT * b;
    float bbig = d - b;
    float bhi = d - bbig;
    float blo = b - bhi;
    
    float p = a * b;
    float err = ((ahi * bhi - p) + ahi * blo + alo * bhi) + alo * blo;
    
    return vec2(p, err);
}

/**
 * Create a double-double from a single float
 */
vec2 dd_from_float(float x) {
    return vec2(x, 0.0);
}

/**
 * Normalize a double-double to maintain invariants
 */
vec2 dd_normalize(vec2 dd) {
    float s = dd.x + dd.y;
    float e = dd.y - (s - dd.x);
    return vec2(s, e);
}

/**
 * Convert double-double to single float (with precision loss)
 */
float dd_to_float(vec2 dd) {
    return dd.x + dd.y;
}

/**
 * Add two double-doubles
 */
vec2 dd_add(vec2 a, vec2 b) {
    vec2 s = dd_two_sum(a.x, b.x);
    vec2 f = dd_two_sum(a.y, b.y);
    vec2 c = dd_normalize(vec2(s.y + f.x, f.y));
    return dd_fast_two_sum(s.x, c.x + c.y);
}

/**
 * Subtract two double-doubles
 */
vec2 dd_sub(vec2 a, vec2 b) {
    return dd_add(a, vec2(-b.x, -b.y));
}

/**
 * Multiply two double-doubles
 */
vec2 dd_mul(vec2 a, vec2 b) {
    vec2 p = dd_two_product(a.x, b.x);
    float err2 = a.x * b.y + a.y * b.x;
    return dd_fast_two_sum(p.x, p.y + err2);
}

/**
 * Square a double-double
 */
vec2 dd_sqr(vec2 a) {
    vec2 p = dd_two_product(a.x, a.x);
    float err2 = 2.0 * a.x * a.y;
    return dd_fast_two_sum(p.x, p.y + err2);
}

/**
 * Divide two double-doubles (approximate)
 */
vec2 dd_div(vec2 a, vec2 b) {
    float q1 = a.x / b.x;
    vec2 prod = dd_mul(vec2(q1, 0.0), b);
    vec2 diff = dd_sub(a, prod);
    float q2 = diff.x / b.x;
    return dd_fast_two_sum(q1, q2);
}

/**
 * Compare two double-doubles
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
float dd_compare(vec2 a, vec2 b) {
    if (a.x < b.x) return -1.0;
    if (a.x > b.x) return 1.0;
    if (a.y < b.y) return -1.0;
    if (a.y > b.y) return 1.0;
    return 0.0;
}

/**
 * Check if a double-double is zero
 */
bool dd_is_zero(vec2 a) {
    return a.x == 0.0 && a.y == 0.0;
}

// Common double-double constants
const vec2 DD_ZERO = vec2(0.0, 0.0);
const vec2 DD_ONE = vec2(1.0, 0.0);
const vec2 DD_TWO = vec2(2.0, 0.0);
const vec2 DD_HALF = vec2(0.5, 0.0);

/**
 * Square root using Newton-Raphson iteration
 */
vec2 dd_sqrt(vec2 a) {
    if (dd_compare(a, DD_ZERO) < 0.0) {
        return vec2(sqrt(-1.0), 0.0); // NaN
    }
    
    if (dd_is_zero(a)) {
        return DD_ZERO;
    }
    
    // Initial approximation
    vec2 x = dd_from_float(sqrt(a.x));
    
    // Newton-Raphson: x_{n+1} = 0.5 * (x_n + a/x_n)
    for (int i = 0; i < 3; i++) {
        vec2 quotient = dd_div(a, x);
        vec2 sum = dd_add(x, quotient);
        x = dd_mul(DD_HALF, sum);
    }
    
    return x;
}

// Complex number with double-double precision: vec4(re.hi, re.lo, im.hi, im.lo)

/**
 * Create complex DD from two floats
 */
vec4 complex_dd_from_floats(float re, float im) {
    return vec4(re, 0.0, im, 0.0);
}

/**
 * Get real part of complex DD
 */
vec2 complex_dd_real(vec4 z) {
    return z.xy;
}

/**
 * Get imaginary part of complex DD
 */
vec2 complex_dd_imag(vec4 z) {
    return z.zw;
}

/**
 * Convert complex DD to regular complex (with precision loss)
 */
vec2 complex_dd_to_vec2(vec4 z) {
    return vec2(dd_to_float(z.xy), dd_to_float(z.zw));
}

/**
 * Add two complex DD numbers
 * (a + bi) + (c + di) = (a + c) + (b + d)i
 */
vec4 complex_dd_add(vec4 z1, vec4 z2) {
    vec2 re = dd_add(z1.xy, z2.xy);
    vec2 im = dd_add(z1.zw, z2.zw);
    return vec4(re.x, re.y, im.x, im.y);
}

/**
 * Subtract two complex DD numbers
 */
vec4 complex_dd_sub(vec4 z1, vec4 z2) {
    vec2 re = dd_sub(z1.xy, z2.xy);
    vec2 im = dd_sub(z1.zw, z2.zw);
    return vec4(re.x, re.y, im.x, im.y);
}

/**
 * Multiply two complex DD numbers
 * (a + bi)(c + di) = (ac - bd) + (ad + bc)i
 */
vec4 complex_dd_mul(vec4 z1, vec4 z2) {
    vec2 a = z1.xy;  // Real part of z1
    vec2 b = z1.zw;  // Imaginary part of z1
    vec2 c = z2.xy;  // Real part of z2
    vec2 d = z2.zw;  // Imaginary part of z2
    
    vec2 ac = dd_mul(a, c);
    vec2 bd = dd_mul(b, d);
    vec2 ad = dd_mul(a, d);
    vec2 bc = dd_mul(b, c);
    
    vec2 re = dd_sub(ac, bd);
    vec2 im = dd_add(ad, bc);
    
    return vec4(re.x, re.y, im.x, im.y);
}

/**
 * Square a complex DD number
 * (a + bi)² = (a² - b²) + 2abi
 */
vec4 complex_dd_sqr(vec4 z) {
    vec2 a = z.xy;  // Real part
    vec2 b = z.zw;  // Imaginary part
    
    vec2 a2 = dd_sqr(a);
    vec2 b2 = dd_sqr(b);
    vec2 ab2 = dd_mul(DD_TWO, dd_mul(a, b));
    
    vec2 re = dd_sub(a2, b2);
    vec2 im = ab2;
    
    return vec4(re.x, re.y, im.x, im.y);
}

/**
 * Magnitude squared of a complex DD number
 * |a + bi|² = a² + b²
 */
vec2 complex_dd_magnitude_squared(vec4 z) {
    vec2 a = z.xy;
    vec2 b = z.zw;
    vec2 a2 = dd_sqr(a);
    vec2 b2 = dd_sqr(b);
    return dd_add(a2, b2);
}

/**
 * Magnitude of a complex DD number
 */
vec2 complex_dd_magnitude(vec4 z) {
    return dd_sqrt(complex_dd_magnitude_squared(z));
}

/**
 * Check if a complex DD number is zero
 */
bool complex_dd_is_zero(vec4 z) {
    return dd_is_zero(z.xy) && dd_is_zero(z.zw);
}

// Complex DD constants
const vec4 COMPLEX_DD_ZERO = vec4(0.0, 0.0, 0.0, 0.0);
const vec4 COMPLEX_DD_ONE = vec4(1.0, 0.0, 0.0, 0.0);

/**
 * Enhanced Mandelbrot iteration with double-double precision
 * Returns smooth iteration count
 */
float mandelbrot_dd(vec4 c, int maxIterations, float escapeRadius) {
    vec4 z = COMPLEX_DD_ZERO;
    vec2 escapeRadius2 = dd_sqr(dd_from_float(escapeRadius));
    
    for (int i = 0; i < 8192; i++) {
        if (i >= maxIterations) break;
        
        vec2 r2 = complex_dd_magnitude_squared(z);
        
        if (dd_compare(r2, escapeRadius2) > 0.0) {
            // Smooth coloring with single precision for performance
            float r = dd_to_float(dd_sqrt(r2));
            float log_zn = log(r * r) * 0.5;
            float nu = log(log_zn / log(2.0)) / log(2.0);
            float mu = float(i) + 1.0 - nu;
            return max(0.0, mu);
        }
        
        // z = z^2 + c
        z = complex_dd_add(complex_dd_sqr(z), c);
    }
    
    return -1.0; // Interior point
}

/**
 * Convert viewport coordinates to complex DD coordinates
 */
vec4 viewport_to_complex_dd(vec2 uv, vec4 center_dd, vec2 scale_dd) {
    // Convert UV coordinates to world coordinates using DD arithmetic
    vec2 re = dd_add(center_dd.xy, dd_mul(dd_from_float(uv.x), scale_dd));
    vec2 im = dd_add(center_dd.zw, dd_mul(dd_from_float(uv.y), scale_dd));
    return vec4(re.x, re.y, im.x, im.y);
}