/**
 * bigfloat.c - Minimal arbitrary precision library for Mandelbrot
 *
 * Fixed-point representation optimized for Mandelbrot computation.
 * Values are stored as sign + integer part (4 bits) + fractional limbs.
 *
 * Target: <50KB WASM, sufficient precision for 10^-300+ zoom
 */

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <math.h>

// Configuration
#define BF_LIMB_BITS 32
#define BF_MAX_LIMBS 128  // Up to 4096 bits of precision

typedef uint32_t limb_t;
typedef uint64_t dlimb_t;  // Double-width for multiplication

/**
 * BigFloat structure
 * Fixed-point: 4 bits integer, rest fractional
 * Limbs are little-endian (limbs[0] is least significant)
 */
typedef struct {
    limb_t limbs[BF_MAX_LIMBS];
    int32_t nlimbs;  // Number of active limbs
    int8_t sign;     // 1 = positive, -1 = negative, 0 = zero
} BigFloat;

// Scratch space for multiplication (avoid malloc in hot path)
static limb_t scratch[BF_MAX_LIMBS * 2 + 2];

/**
 * Initialize to zero
 */
void bf_zero(BigFloat *r, int nlimbs) {
    memset(r->limbs, 0, nlimbs * sizeof(limb_t));
    r->nlimbs = nlimbs;
    r->sign = 0;
}

/**
 * Copy a to r
 */
void bf_copy(BigFloat *r, const BigFloat *a) {
    memcpy(r->limbs, a->limbs, a->nlimbs * sizeof(limb_t));
    r->nlimbs = a->nlimbs;
    r->sign = a->sign;
}

/**
 * Set from double (limited precision, for initialization)
 */
void bf_set_d(BigFloat *r, double d, int nlimbs) {
    bf_zero(r, nlimbs);

    if (d == 0.0) {
        return;
    }

    r->sign = d < 0 ? -1 : 1;
    d = d < 0 ? -d : d;

    // Extract integer part (stored in high bits of top limb)
    int int_part = (int)d;
    d -= int_part;

    // Integer part in top 4 bits of highest limb
    r->limbs[nlimbs - 1] = ((limb_t)int_part) << 28;

    // Fractional part
    for (int i = nlimbs - 1; i >= 0 && d > 0; i--) {
        d *= (double)(1ULL << 32);
        limb_t limb = (limb_t)d;
        d -= limb;

        if (i == nlimbs - 1) {
            // Don't overwrite integer part
            r->limbs[i] |= (limb >> 4);
        } else {
            r->limbs[i] = limb;
        }
    }
}

/**
 * Convert to double (lossy, for output)
 */
double bf_to_d(const BigFloat *a) {
    if (a->sign == 0) return 0.0;

    double result = 0.0;
    double scale = 1.0;

    // Start from most significant limb
    for (int i = a->nlimbs - 1; i >= 0; i--) {
        if (i == a->nlimbs - 1) {
            // Integer part
            result = (double)(a->limbs[i] >> 28);
            // Upper fractional part
            result += (double)(a->limbs[i] & 0x0FFFFFFF) / (double)(1 << 28);
        } else {
            scale /= (double)(1ULL << 32);
            result += (double)a->limbs[i] * scale;
        }
    }

    return a->sign < 0 ? -result : result;
}

/**
 * Compare magnitudes (ignoring sign)
 * Returns: -1 if |a| < |b|, 0 if |a| == |b|, 1 if |a| > |b|
 */
static int bf_cmp_mag(const BigFloat *a, const BigFloat *b) {
    int n = a->nlimbs;

    for (int i = n - 1; i >= 0; i--) {
        if (a->limbs[i] < b->limbs[i]) return -1;
        if (a->limbs[i] > b->limbs[i]) return 1;
    }
    return 0;
}

/**
 * Add magnitudes: r = |a| + |b|
 * Assumes r has enough space
 */
static void bf_add_mag(BigFloat *r, const BigFloat *a, const BigFloat *b) {
    int n = a->nlimbs;
    dlimb_t carry = 0;

    for (int i = 0; i < n; i++) {
        dlimb_t sum = (dlimb_t)a->limbs[i] + (dlimb_t)b->limbs[i] + carry;
        r->limbs[i] = (limb_t)sum;
        carry = sum >> 32;
    }

    // Handle overflow (shouldn't happen in Mandelbrot range)
    // Overflow means |z| > 16, which escapes anyway
}

/**
 * Subtract magnitudes: r = |a| - |b|
 * Assumes |a| >= |b|
 */
static void bf_sub_mag(BigFloat *r, const BigFloat *a, const BigFloat *b) {
    int n = a->nlimbs;
    int64_t borrow = 0;

    for (int i = 0; i < n; i++) {
        int64_t diff = (int64_t)a->limbs[i] - (int64_t)b->limbs[i] - borrow;
        if (diff < 0) {
            diff += (1LL << 32);
            borrow = 1;
        } else {
            borrow = 0;
        }
        r->limbs[i] = (limb_t)diff;
    }
}

/**
 * Check if zero
 */
static bool bf_is_zero(const BigFloat *a) {
    for (int i = 0; i < a->nlimbs; i++) {
        if (a->limbs[i] != 0) return false;
    }
    return true;
}

/**
 * Addition: r = a + b
 */
void bf_add(BigFloat *r, const BigFloat *a, const BigFloat *b) {
    r->nlimbs = a->nlimbs;

    // Handle zeros
    if (a->sign == 0) {
        bf_copy(r, b);
        return;
    }
    if (b->sign == 0) {
        bf_copy(r, a);
        return;
    }

    // Same sign: add magnitudes
    if (a->sign == b->sign) {
        bf_add_mag(r, a, b);
        r->sign = a->sign;
    }
    // Different signs: subtract magnitudes
    else {
        int cmp = bf_cmp_mag(a, b);
        if (cmp == 0) {
            bf_zero(r, a->nlimbs);
        } else if (cmp > 0) {
            bf_sub_mag(r, a, b);
            r->sign = a->sign;
        } else {
            bf_sub_mag(r, b, a);
            r->sign = b->sign;
        }
    }

    // Check for zero result
    if (bf_is_zero(r)) {
        r->sign = 0;
    }
}

/**
 * Subtraction: r = a - b
 */
void bf_sub(BigFloat *r, const BigFloat *a, const BigFloat *b) {
    BigFloat neg_b;
    bf_copy(&neg_b, b);
    neg_b.sign = -neg_b.sign;
    bf_add(r, a, &neg_b);
}

/**
 * Schoolbook multiplication (for small precision)
 * r = a * b, with proper fixed-point alignment
 */
static void bf_mul_schoolbook(BigFloat *r, const BigFloat *a, const BigFloat *b) {
    int n = a->nlimbs;

    // Clear scratch
    memset(scratch, 0, (2 * n + 2) * sizeof(limb_t));

    // Multiply all limbs
    for (int i = 0; i < n; i++) {
        dlimb_t carry = 0;
        for (int j = 0; j < n; j++) {
            dlimb_t prod = (dlimb_t)a->limbs[i] * (dlimb_t)b->limbs[j];
            dlimb_t sum = scratch[i + j] + prod + carry;
            scratch[i + j] = (limb_t)sum;
            carry = sum >> 32;
        }
        scratch[i + n] += (limb_t)carry;
    }

    // Fixed-point: result is 2n limbs, we need to extract middle n limbs
    // Our format: 4 bits integer + (32*n - 4) bits fraction
    // After multiplication: 8 bits integer + 2*(32*n - 4) bits fraction
    // We need to shift right by (32*n - 4) bits = n limbs - 4 bits

    // Copy upper n limbs, shifted by 4 bits to realign
    for (int i = 0; i < n; i++) {
        dlimb_t combined = ((dlimb_t)scratch[n + i] << 4);
        if (n + i > 0) {
            combined |= (scratch[n + i - 1] >> 28);
        }
        r->limbs[i] = (limb_t)combined;
    }

    r->nlimbs = n;
    r->sign = (a->sign == b->sign) ? 1 : -1;
    if (a->sign == 0 || b->sign == 0) r->sign = 0;

    if (bf_is_zero(r)) {
        r->sign = 0;
    }
}

/**
 * Karatsuba multiplication threshold
 * Below this, schoolbook is faster
 */
#define KARATSUBA_THRESHOLD 16

/**
 * Karatsuba multiplication for large precision
 * Recursive: T(n) = 3*T(n/2) + O(n) = O(n^1.585)
 */
static void bf_mul_karatsuba(BigFloat *r, const BigFloat *a, const BigFloat *b, int depth);

/**
 * Multiplication: r = a * b
 */
void bf_mul(BigFloat *r, const BigFloat *a, const BigFloat *b) {
    if (a->nlimbs <= KARATSUBA_THRESHOLD) {
        bf_mul_schoolbook(r, a, b);
    } else {
        bf_mul_karatsuba(r, a, b, 0);
    }
}

/**
 * Square: r = a^2
 * Slightly optimized: can skip some multiplications due to symmetry
 */
void bf_sqr(BigFloat *r, const BigFloat *a) {
    int n = a->nlimbs;

    // Clear scratch
    memset(scratch, 0, (2 * n + 2) * sizeof(limb_t));

    // Exploit symmetry: aij = aji, so count each pair once and double
    for (int i = 0; i < n; i++) {
        // Diagonal term: a[i] * a[i]
        dlimb_t diag = (dlimb_t)a->limbs[i] * (dlimb_t)a->limbs[i];
        dlimb_t sum = scratch[2*i] + (limb_t)diag;
        scratch[2*i] = (limb_t)sum;
        dlimb_t carry = (sum >> 32) + (diag >> 32);
        scratch[2*i + 1] += (limb_t)carry;
        if (carry >> 32) scratch[2*i + 2] += 1;

        // Off-diagonal terms (doubled)
        for (int j = i + 1; j < n; j++) {
            dlimb_t prod = (dlimb_t)a->limbs[i] * (dlimb_t)a->limbs[j];
            // Double it (shift left by 1)
            dlimb_t prod_hi = prod >> 63;
            prod <<= 1;

            sum = scratch[i + j] + (limb_t)prod;
            scratch[i + j] = (limb_t)sum;
            carry = (sum >> 32) + (prod >> 32) + prod_hi;

            int k = i + j + 1;
            while (carry && k < 2 * n + 2) {
                sum = scratch[k] + carry;
                scratch[k] = (limb_t)sum;
                carry = sum >> 32;
                k++;
            }
        }
    }

    // Extract result (same as mul)
    for (int i = 0; i < n; i++) {
        dlimb_t combined = ((dlimb_t)scratch[n + i] << 4);
        if (n + i > 0) {
            combined |= (scratch[n + i - 1] >> 28);
        }
        r->limbs[i] = (limb_t)combined;
    }

    r->nlimbs = n;
    r->sign = (a->sign != 0) ? 1 : 0;

    if (bf_is_zero(r)) {
        r->sign = 0;
    }
}

/**
 * Compare to double: is |a|^2 > threshold?
 * For Mandelbrot escape: |z|^2 > 4
 * This avoids computing the square root
 */
bool bf_escaped(const BigFloat *re, const BigFloat *im, double threshold) {
    // Quick check using top limbs only (approximate)
    int n = re->nlimbs;
    if (n == 0) return false;

    // Get approximate magnitude squared
    double re_d = bf_to_d(re);
    double im_d = bf_to_d(im);
    double mag_sq = re_d * re_d + im_d * im_d;

    return mag_sq > threshold;
}

/**
 * Parse decimal string to BigFloat
 * Format: [-]digits[.digits]
 */
void bf_from_str(BigFloat *r, const char *str, int nlimbs) {
    bf_zero(r, nlimbs);

    const char *p = str;
    bool negative = false;

    // Skip whitespace
    while (*p == ' ') p++;

    // Sign
    if (*p == '-') {
        negative = true;
        p++;
    } else if (*p == '+') {
        p++;
    }

    // Integer part
    double int_part = 0;
    while (*p >= '0' && *p <= '9') {
        int_part = int_part * 10 + (*p - '0');
        p++;
    }

    // Fractional part - use string arithmetic for precision
    double frac = 0;
    double frac_scale = 0.1;
    if (*p == '.') {
        p++;
        while (*p >= '0' && *p <= '9') {
            frac += (*p - '0') * frac_scale;
            frac_scale *= 0.1;
            p++;
        }
    }

    // For now, use double conversion (limited precision)
    // TODO: Implement proper string-to-bigfloat for deep zoom
    bf_set_d(r, int_part + frac, nlimbs);
    if (negative) r->sign = -r->sign;
}

/**
 * Karatsuba implementation
 */
static void bf_mul_karatsuba(BigFloat *r, const BigFloat *a, const BigFloat *b, int depth) {
    // For now, fall back to schoolbook
    // Full Karatsuba requires more complex memory management
    bf_mul_schoolbook(r, a, b);
}

// ============================================================
// Mandelbrot-specific functions
// ============================================================

/**
 * Single Mandelbrot iteration: z = z^2 + c
 * Updates zr, zi in place
 */
void mandelbrot_step(BigFloat *zr, BigFloat *zi,
                     const BigFloat *cr, const BigFloat *ci,
                     BigFloat *tmp1, BigFloat *tmp2) {
    // zr_new = zr^2 - zi^2 + cr
    // zi_new = 2*zr*zi + ci

    // tmp1 = zr^2
    bf_sqr(tmp1, zr);

    // tmp2 = zi^2
    bf_sqr(tmp2, zi);

    // zi_new = 2*zr*zi + ci
    // First: tmp = zr * zi
    BigFloat prod;
    bf_mul(&prod, zr, zi);
    // Double it (shift left by 1 bit)
    dlimb_t carry = 0;
    for (int i = 0; i < prod.nlimbs; i++) {
        dlimb_t val = ((dlimb_t)prod.limbs[i] << 1) | carry;
        prod.limbs[i] = (limb_t)val;
        carry = val >> 32;
    }
    // Add ci
    bf_add(zi, &prod, ci);

    // zr_new = zr^2 - zi^2 + cr
    bf_sub(tmp1, tmp1, tmp2);  // tmp1 = zr^2 - zi^2
    bf_add(zr, tmp1, cr);       // zr = tmp1 + cr
}

/**
 * Complete Mandelbrot iteration
 * Returns iteration count (or max_iter if didn't escape)
 */
int mandelbrot_iterate(const char *cr_str, const char *ci_str,
                       int max_iter, int precision_limbs) {
    BigFloat cr, ci, zr, zi, tmp1, tmp2;

    // Parse coordinates
    bf_from_str(&cr, cr_str, precision_limbs);
    bf_from_str(&ci, ci_str, precision_limbs);

    // Initialize z = 0
    bf_zero(&zr, precision_limbs);
    bf_zero(&zi, precision_limbs);
    tmp1.nlimbs = precision_limbs;
    tmp2.nlimbs = precision_limbs;

    // Iterate
    for (int i = 0; i < max_iter; i++) {
        // Check escape
        if (bf_escaped(&zr, &zi, 4.0)) {
            return i;
        }

        // z = z^2 + c
        mandelbrot_step(&zr, &zi, &cr, &ci, &tmp1, &tmp2);
    }

    return max_iter;
}

/**
 * Batch iteration for a tile
 * More efficient: reuses memory, vectorizes where possible
 */
void mandelbrot_tile(
    const char *center_r_str,
    const char *center_i_str,
    const char *scale_str,
    int tile_size,
    int max_iter,
    int precision_limbs,
    float *iterations_out  // Output: tile_size * tile_size floats
) {
    BigFloat center_r, center_i, scale;
    BigFloat cr, ci, zr, zi, tmp1, tmp2;
    BigFloat pixel_offset;

    // Parse center and scale
    bf_from_str(&center_r, center_r_str, precision_limbs);
    bf_from_str(&center_i, center_i_str, precision_limbs);
    bf_from_str(&scale, scale_str, precision_limbs);

    // For each pixel
    for (int py = 0; py < tile_size; py++) {
        for (int px = 0; px < tile_size; px++) {
            // Calculate c for this pixel
            // c = center + (pixel - tile_size/2) / tile_size * scale
            double px_norm = ((double)px - tile_size * 0.5) / tile_size;
            double py_norm = ((double)py - tile_size * 0.5) / tile_size;

            // For now, approximate pixel offset with double
            // TODO: Full precision pixel offset calculation
            bf_copy(&cr, &center_r);
            bf_copy(&ci, &center_i);

            bf_set_d(&pixel_offset, px_norm, precision_limbs);
            BigFloat tmp;
            bf_mul(&tmp, &pixel_offset, &scale);
            bf_add(&cr, &cr, &tmp);

            bf_set_d(&pixel_offset, py_norm, precision_limbs);
            bf_mul(&tmp, &pixel_offset, &scale);
            bf_add(&ci, &ci, &tmp);

            // Initialize z = 0
            bf_zero(&zr, precision_limbs);
            bf_zero(&zi, precision_limbs);

            // Iterate
            int iter;
            for (iter = 0; iter < max_iter; iter++) {
                if (bf_escaped(&zr, &zi, 4.0)) {
                    break;
                }
                mandelbrot_step(&zr, &zi, &cr, &ci, &tmp1, &tmp2);
            }

            // Store result with smooth coloring approximation
            if (iter < max_iter) {
                // Smooth coloring: mu = iter - log2(log2(|z|))
                double zr_d = bf_to_d(&zr);
                double zi_d = bf_to_d(&zi);
                double mag_sq = zr_d * zr_d + zi_d * zi_d;
                double log_zn = 0.5 * log(mag_sq);
                double nu = log(log_zn / log(2.0)) / log(2.0);
                iterations_out[py * tile_size + px] = (float)(iter + 1 - nu);
            } else {
                iterations_out[py * tile_size + px] = (float)max_iter;
            }
        }
    }
}

// ============================================================
// Reference Orbit Computation (for Perturbation Theory)
// ============================================================

/**
 * Compute a reference orbit at arbitrary precision
 * Stores orbit as float64 pairs for GPU consumption
 *
 * @param cr_str, ci_str  Reference point coordinates (string)
 * @param max_iter        Maximum iterations
 * @param precision_limbs Precision for computation
 * @param orbit_re_out    Output: real parts of orbit (max_iter+1 doubles)
 * @param orbit_im_out    Output: imag parts of orbit (max_iter+1 doubles)
 * @param escape_iter     Output: iteration at which orbit escaped (-1 if didn't)
 *
 * Returns: actual number of iterations computed
 */
int compute_reference_orbit(
    const char *cr_str,
    const char *ci_str,
    int max_iter,
    int precision_limbs,
    double *orbit_re_out,
    double *orbit_im_out,
    int *escape_iter
) {
    BigFloat cr, ci, zr, zi, tmp1, tmp2;

    // Parse reference point coordinates
    bf_from_str(&cr, cr_str, precision_limbs);
    bf_from_str(&ci, ci_str, precision_limbs);

    // Initialize z = 0
    bf_zero(&zr, precision_limbs);
    bf_zero(&zi, precision_limbs);
    tmp1.nlimbs = precision_limbs;
    tmp2.nlimbs = precision_limbs;

    // Store initial point
    orbit_re_out[0] = 0.0;
    orbit_im_out[0] = 0.0;
    *escape_iter = -1;

    // Iterate and store orbit
    for (int i = 0; i < max_iter; i++) {
        // z = z^2 + c
        mandelbrot_step(&zr, &zi, &cr, &ci, &tmp1, &tmp2);

        // Convert to double and store
        double zr_d = bf_to_d(&zr);
        double zi_d = bf_to_d(&zi);
        orbit_re_out[i + 1] = zr_d;
        orbit_im_out[i + 1] = zi_d;

        // Check escape
        double mag_sq = zr_d * zr_d + zi_d * zi_d;
        if (mag_sq > 1e16) {  // Use large escape for reference (ensures we have enough orbit)
            *escape_iter = i + 1;
            return i + 1;
        }
    }

    return max_iter;
}

/**
 * Compute a reference orbit and also return Z² values
 * Used for series approximation (future optimization)
 */
int compute_reference_orbit_extended(
    const char *cr_str,
    const char *ci_str,
    int max_iter,
    int precision_limbs,
    double *orbit_re_out,
    double *orbit_im_out,
    double *orbit_z2_re_out,  // Z² real parts
    double *orbit_z2_im_out,  // Z² imaginary parts
    int *escape_iter
) {
    BigFloat cr, ci, zr, zi, tmp1, tmp2;
    BigFloat z2r, z2i;

    bf_from_str(&cr, cr_str, precision_limbs);
    bf_from_str(&ci, ci_str, precision_limbs);

    bf_zero(&zr, precision_limbs);
    bf_zero(&zi, precision_limbs);
    tmp1.nlimbs = precision_limbs;
    tmp2.nlimbs = precision_limbs;
    z2r.nlimbs = precision_limbs;
    z2i.nlimbs = precision_limbs;

    orbit_re_out[0] = 0.0;
    orbit_im_out[0] = 0.0;
    orbit_z2_re_out[0] = 0.0;
    orbit_z2_im_out[0] = 0.0;
    *escape_iter = -1;

    for (int i = 0; i < max_iter; i++) {
        // Compute z² before the step for series approximation
        bf_sqr(&z2r, &zr);
        bf_sqr(&z2i, &zi);
        // z² = zr² - zi² + 2i*zr*zi (but we store the full z² complex)

        // z = z^2 + c
        mandelbrot_step(&zr, &zi, &cr, &ci, &tmp1, &tmp2);

        double zr_d = bf_to_d(&zr);
        double zi_d = bf_to_d(&zi);
        orbit_re_out[i + 1] = zr_d;
        orbit_im_out[i + 1] = zi_d;

        // Store Z² = zr² - zi², 2*zr*zi (complex square)
        double z2r_d = bf_to_d(&z2r);
        double z2i_d = bf_to_d(&z2i);
        orbit_z2_re_out[i + 1] = z2r_d - z2i_d;  // Real part of Z²
        orbit_z2_im_out[i + 1] = 2.0 * orbit_re_out[i] * orbit_im_out[i];  // Imag part

        double mag_sq = zr_d * zr_d + zi_d * zi_d;
        if (mag_sq > 1e16) {
            *escape_iter = i + 1;
            return i + 1;
        }
    }

    return max_iter;
}

// Export functions for WASM
#ifdef __EMSCRIPTEN__
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE
int wasm_mandelbrot_iterate(const char *cr, const char *ci, int max_iter, int prec) {
    return mandelbrot_iterate(cr, ci, max_iter, prec);
}

EMSCRIPTEN_KEEPALIVE
int wasm_compute_reference_orbit(
    const char *cr_str,
    const char *ci_str,
    int max_iter,
    int precision_limbs,
    double *orbit_re,
    double *orbit_im,
    int *escape_iter
) {
    return compute_reference_orbit(
        cr_str, ci_str, max_iter, precision_limbs,
        orbit_re, orbit_im, escape_iter
    );
}

EMSCRIPTEN_KEEPALIVE
double* wasm_alloc_orbit(int max_iter) {
    return (double*)malloc((max_iter + 1) * sizeof(double));
}

EMSCRIPTEN_KEEPALIVE
void wasm_free_orbit(double* ptr) {
    free(ptr);
}

EMSCRIPTEN_KEEPALIVE
int* wasm_alloc_int() {
    return (int*)malloc(sizeof(int));
}

EMSCRIPTEN_KEEPALIVE
void wasm_free_int(int* ptr) {
    free(ptr);
}

EMSCRIPTEN_KEEPALIVE
void wasm_mandelbrot_tile(
    const char *center_r, const char *center_i, const char *scale,
    int tile_size, int max_iter, int precision_limbs,
    float *out
) {
    mandelbrot_tile(center_r, center_i, scale, tile_size, max_iter, precision_limbs, out);
}

EMSCRIPTEN_KEEPALIVE
float* wasm_alloc_tile(int tile_size) {
    return (float*)malloc(tile_size * tile_size * sizeof(float));
}

EMSCRIPTEN_KEEPALIVE
void wasm_free_tile(float* ptr) {
    free(ptr);
}

EMSCRIPTEN_KEEPALIVE
char* wasm_alloc_string(int len) {
    return (char*)malloc(len + 1);
}

EMSCRIPTEN_KEEPALIVE
void wasm_free_string(char* ptr) {
    free(ptr);
}
#endif
