#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2 u_resolution;

// Standard precision uniforms (for compatibility)
uniform vec2 u_center;
uniform float u_scale;

// Double-double precision uniforms
// Center coordinates as DD: (centerX.hi, centerX.lo, centerY.hi, centerY.lo)
uniform vec4 u_center_dd;
// Scale as DD: (scale.hi, scale.lo)
uniform vec2 u_scale_dd;
// Flag to enable DD mode when scale is very small
uniform bool u_use_dd_precision;

uniform int u_maxIterations;
uniform int u_colorScheme;
uniform float u_colorOffset;
uniform float u_colorScale;

// Progressive rendering uniforms
uniform int u_progressiveMode;
uniform int u_progressiveStage;
uniform sampler2D u_previousTexture;
uniform vec3 u_previousTransform;

// Anti-aliasing uniforms
uniform bool u_antiAliasing;
uniform float u_aaQuality;

// Histogram equalization uniforms
uniform bool u_histogramEqualization;

// Progressive rendering helper functions
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(random(i + vec2(0.0,0.0)),
                   random(i + vec2(1.0,0.0)), u.x),
               mix(random(i + vec2(0.0,1.0)),
                   random(i + vec2(1.0,1.0)), u.x), u.y);
}

float blueNoise(vec2 coord) {
    vec2 st = coord * u_resolution * 0.01;
    float n = 0.0;
    float amplitude = 1.0;
    for (int i = 0; i < 4; i++) {
        n += noise(st) * amplitude;
        st *= 2.0;
        amplitude *= 0.5;
    }
    float highFreqComponent = noise(coord * u_resolution * 0.1);
    return mix(n, highFreqComponent, 0.7);
}

bool shouldSampleStochastic(vec2 coord, int stage) {
    float blueNoiseValue = blueNoise(coord);
    float threshold = 0.5;
    if (stage == 0) threshold = 0.25;
    else if (stage == 1) threshold = 0.5;
    else if (stage == 2) threshold = 0.75;
    else threshold = 1.0;
    return blueNoiseValue < threshold;
}

bool shouldSampleInterleaved(vec2 coord, int stage) {
    ivec2 pixel = ivec2(coord * u_resolution);
    if (stage == 0) return pixel.y % 4 == 0;
    else if (stage == 1) return (pixel.y % 4 == 0) || (pixel.y % 4 == 2);
    else if (stage == 2) return (pixel.y % 4 != 3);
    else return true;
}

// Double-Double Arithmetic from dd-arithmetic.glsl (unified source)
const float DD_EPS = 5.96046448e-08;  // 2^-24, single-precision machine epsilon in GLSL
const float DD_SPLIT = 4097.0;        // 2^12 + 1 for 24-bit mantissa (correct for GLSL single precision)

vec2 dd_fast_two_sum(float a, float b) {
    // Fast Two-Sum (Dekker): REQUIRES |a| >= |b|
    // Break into separate statements to prevent GLSL compiler optimization
    float s = a + b;
    float b_virtual = s - a;      // Virtual b that was actually added
    float e = b - b_virtual;      // Error = difference from actual b
    return vec2(s, e);
}

vec2 dd_two_sum(float a, float b) {
    // Knuth Two-Sum algorithm
    // Break into separate statements to prevent GLSL compiler optimization
    float s = a + b;
    float v = s - a;
    float a_prime = s - v;        // Reconstruct 'a' from s and v
    float b_prime = b - v;        // Error in 'b'
    float err_a = a - a_prime;    // Error in 'a'
    float e = err_a + b_prime;    // Total error
    return vec2(s, e);
}

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

vec2 dd_from_float(float x) {
    return vec2(x, 0.0);
}

vec2 dd_normalize(vec2 dd) {
    float s = dd.x + dd.y;
    float e = dd.y - (s - dd.x);
    return vec2(s, e);
}

float dd_to_float(vec2 dd) {
    return dd.x + dd.y;
}

vec2 dd_add(vec2 a, vec2 b) {
    // Robust DD addition (Joldes et al./Shewchuk algorithm)
    // Avoids the |a| >= |b| invariant violation in dd_normalize
    vec2 s = dd_two_sum(a.x, b.x);
    vec2 t = dd_two_sum(a.y, b.y);

    s.y += t.x;                      // Add High-Low to Low-High
    s = dd_fast_two_sum(s.x, s.y);   // Renormalize High

    s.y += t.y;                      // Add Low-Low
    s = dd_fast_two_sum(s.x, s.y);   // Renormalize High again

    return s;
}

vec2 dd_sub(vec2 a, vec2 b) {
    return dd_add(a, vec2(-b.x, -b.y));
}

vec2 dd_mul(vec2 a, vec2 b) {
    vec2 p = dd_two_product(a.x, b.x);
    float err2 = a.x * b.y + a.y * b.x;
    return dd_fast_two_sum(p.x, p.y + err2);
}

vec2 dd_sqr(vec2 a) {
    vec2 p = dd_two_product(a.x, a.x);
    float err2 = 2.0 * a.x * a.y;
    return dd_fast_two_sum(p.x, p.y + err2);
}

vec2 dd_div(vec2 a, vec2 b) {
    float q1 = a.x / b.x;
    vec2 prod = dd_mul(dd_from_float(q1), b);
    vec2 diff = dd_sub(a, prod);
    float q2 = diff.x / b.x;
    return dd_fast_two_sum(q1, q2);
}

float dd_compare(vec2 a, vec2 b) {
    if (a.x < b.x) return -1.0;
    if (a.x > b.x) return 1.0;
    if (a.y < b.y) return -1.0;
    if (a.y > b.y) return 1.0;
    return 0.0;
}

// DD constants
const vec2 DD_ZERO = vec2(0.0, 0.0);
const vec2 DD_ONE = vec2(1.0, 0.0);
const vec2 DD_TWO = vec2(2.0, 0.0);

// Complex DD functions
const vec4 COMPLEX_DD_ZERO = vec4(0.0, 0.0, 0.0, 0.0);

vec4 complex_dd_add(vec4 z1, vec4 z2) {
    vec2 re = dd_add(z1.xy, z2.xy);
    vec2 im = dd_add(z1.zw, z2.zw);
    return vec4(re.x, re.y, im.x, im.y);
}

vec4 complex_dd_sqr(vec4 z) {
    vec2 a = z.xy;  
    vec2 b = z.zw;  
    
    vec2 a2 = dd_sqr(a);
    vec2 b2 = dd_sqr(b);
    vec2 ab2 = dd_mul(DD_TWO, dd_mul(a, b));
    
    vec2 re = dd_sub(a2, b2);
    vec2 im = ab2;
    
    return vec4(re.x, re.y, im.x, im.y);
}

vec2 complex_dd_magnitude_squared(vec4 z) {
    vec2 a = z.xy;
    vec2 b = z.zw;
    vec2 a2 = dd_sqr(a);
    vec2 b2 = dd_sqr(b);
    return dd_add(a2, b2);
}

// Include color functions from original fragment shader
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float histogramEqualize(float mu) {
    if (!u_histogramEqualization) {
        return mu;
    }
    
    float normalized = clamp(mu / float(u_maxIterations), 0.0, 1.0);
    float equalized = pow(normalized, 0.6);
    equalized = equalized * equalized * (3.0 - 2.0 * equalized);
    
    return equalized * float(u_maxIterations);
}

vec3 getColor(float mu, int scheme) {
    mu = histogramEqualize(mu);
    mu = mu * u_colorScale + u_colorOffset;
    
    if (scheme == 0) {
        // Classic rainbow - continuous smooth gradient
        float phase1 = mu * 0.05;
        float phase2 = mu * 0.1;
        float hue = 0.5 + 0.5 * sin(phase1);
        float sat = 0.7;
        float val = 1.0 - pow(1.0 - (0.5 + 0.5 * sin(phase2)), 3.0);
        return hsv2rgb(vec3(hue, sat, val));
    } else if (scheme == 1) {
        // Sunset - continuous smooth gradient using sine waves to eliminate banding
        float phase = mu * 0.03;
        
        // Create smooth continuous color transitions using trigonometric functions
        float r = 0.8 + 0.2 * sin(phase);
        float g = 0.3 + 0.2 * sin(phase + 1.5);
        float b = 0.1 + 0.3 * sin(phase + 3.0);
        
        // Adjust for sunset palette feel
        r = clamp(r * (0.9 + 0.1 * cos(phase * 0.5)), 0.0, 1.0);
        g = clamp(g * (0.4 + 0.3 * cos(phase * 0.7 + 1.0)), 0.0, 1.0);
        b = clamp(b * (0.2 + 0.2 * cos(phase * 0.9 + 2.0)), 0.0, 1.0);
        
        return vec3(r, g, b);
    } else if (scheme == 2) {
        // Ocean - continuous smooth gradient using sine waves
        float phase = mu * 0.04;
        
        // Create smooth ocean color transitions
        float r = 0.0 + 0.1 * sin(phase + 3.0);
        float g = 0.4 + 0.4 * sin(phase + 1.0);
        float b = 0.7 + 0.3 * sin(phase);
        
        // Adjust for ocean feel with wave-like variations
        r = clamp(r * (0.2 + 0.1 * cos(phase * 0.4)), 0.0, 1.0);
        g = clamp(g * (0.8 + 0.2 * cos(phase * 0.6 + 2.0)), 0.0, 1.0);
        b = clamp(b * (0.9 + 0.1 * cos(phase * 0.8 + 1.0)), 0.0, 1.0);
        
        return vec3(r, g, b);
    } else if (scheme == 3) {
        // Fire - continuous smooth gradient using sine waves
        float phase = mu * 0.02;
        
        // Create smooth fire color transitions
        float r = 0.6 + 0.4 * sin(phase + 0.5);
        float g = 0.3 + 0.4 * sin(phase + 2.0);
        float b = 0.0 + 0.3 * sin(phase + 4.0);
        
        // Adjust for fire feel with flickering variations
        r = clamp(r * (0.9 + 0.1 * cos(phase * 0.8)), 0.0, 1.0);
        g = clamp(g * (0.7 + 0.3 * cos(phase * 1.2 + 1.0)), 0.0, 1.0);
        b = clamp(b * (0.4 + 0.2 * cos(phase * 1.5 + 2.0)), 0.0, 1.0);
        
        return vec3(r, g, b);
    } else if (scheme == 4) {
        // Monochrome - continuous smooth gradient
        float phase = mu * 0.1;
        float intensity = 0.5 + 0.5 * sin(phase);
        return vec3(intensity);
    } else if (scheme == 5) {
        // Twilight - continuous smooth gradient using sine waves
        float phase = mu * 0.025;
        
        // Create smooth twilight color transitions
        float r = 0.4 + 0.4 * sin(phase + 1.0);
        float g = 0.1 + 0.2 * sin(phase + 2.5);
        float b = 0.6 + 0.3 * sin(phase);
        
        // Adjust for twilight purple/pink feel
        r = clamp(r * (0.7 + 0.3 * cos(phase * 0.6)), 0.0, 1.0);
        g = clamp(g * (0.4 + 0.2 * cos(phase * 0.8 + 1.5)), 0.0, 1.0);
        b = clamp(b * (0.8 + 0.2 * cos(phase * 0.4 + 0.5)), 0.0, 1.0);
        
        return vec3(r, g, b);
    } else if (scheme == 6) {
        // Forest - continuous smooth gradient using sine waves
        float phase = mu * 0.04;
        
        // Create smooth forest color transitions
        float r = 0.1 + 0.3 * sin(phase + 2.0);
        float g = 0.5 + 0.4 * sin(phase);
        float b = 0.1 + 0.2 * sin(phase + 4.0);
        
        // Adjust for forest natural feel
        r = clamp(r * (0.4 + 0.3 * cos(phase * 0.5 + 1.0)), 0.0, 1.0);
        g = clamp(g * (0.8 + 0.2 * cos(phase * 0.7)), 0.0, 1.0);
        b = clamp(b * (0.3 + 0.2 * cos(phase * 0.9 + 2.0)), 0.0, 1.0);
        
        return vec3(r, g, b);
    } else if (scheme == 7) {
        // Neon - continuous smooth gradient using sine waves
        float phase = mu * 0.06;
        
        // Create smooth neon color transitions
        float r = 0.5 + 0.5 * sin(phase + 1.5);
        float g = 0.5 + 0.5 * sin(phase);
        float b = 0.5 + 0.5 * sin(phase + 3.0);
        
        // Adjust for vibrant neon feel
        r = clamp(r * (0.8 + 0.2 * cos(phase * 0.8 + 2.0)), 0.0, 1.0);
        g = clamp(g * (0.9 + 0.1 * cos(phase * 1.0)), 0.0, 1.0);
        b = clamp(b * (0.7 + 0.3 * cos(phase * 0.6 + 1.0)), 0.0, 1.0);
        
        return vec3(r, g, b);
    } else if (scheme == 8) {
        // Ice - continuous smooth gradient using sine waves
        float phase = mu * 0.035;
        
        // Create smooth ice color transitions
        float r = 0.3 + 0.3 * sin(phase + 4.0);
        float g = 0.4 + 0.4 * sin(phase + 2.0);
        float b = 0.6 + 0.4 * sin(phase);
        
        // Adjust for cool ice feel
        r = clamp(r * (0.6 + 0.4 * cos(phase * 0.4)), 0.0, 1.0);
        g = clamp(g * (0.7 + 0.3 * cos(phase * 0.5 + 1.0)), 0.0, 1.0);
        b = clamp(b * (0.9 + 0.1 * cos(phase * 0.6 + 0.5)), 0.0, 1.0);
        
        return vec3(r, g, b);
    } else if (scheme == 9) {
        // Copper - continuous smooth gradient using sine waves
        float phase = mu * 0.028;
        
        // Create smooth copper color transitions
        float r = 0.6 + 0.4 * sin(phase);
        float g = 0.3 + 0.3 * sin(phase + 1.0);
        float b = 0.1 + 0.2 * sin(phase + 2.0);
        
        // Adjust for copper metallic feel
        r = clamp(r * (0.8 + 0.2 * cos(phase * 0.3)), 0.0, 1.0);
        g = clamp(g * (0.5 + 0.3 * cos(phase * 0.5 + 1.5)), 0.0, 1.0);
        b = clamp(b * (0.3 + 0.2 * cos(phase * 0.7 + 3.0)), 0.0, 1.0);
        
        return vec3(r, g, b);
    } else if (scheme == 10) {
        // Spectrum - continuous smooth rainbow transitions
        float phase = mu * 0.08;
        float hue = 0.5 + 0.5 * sin(phase);
        float sat = 0.8 + 0.2 * sin(phase * 0.25);
        float val = 0.7 + 0.3 * cos(phase * 0.375);
        return hsv2rgb(vec3(hue, sat, val));
    } else {
        // Default classic - continuous smooth rainbow
        float phase = mu * 0.1;
        float hue = 0.5 + 0.5 * sin(phase);
        return hsv2rgb(vec3(hue, 0.8, 0.9));
    }
}

// Standard precision Mandelbrot (from original shader)
float mandelbrot(vec2 c) {
    vec2 z = vec2(0.0);
    int iterations = 0;
    float escapeRadius = 4.0;
    float escapeRadius2 = escapeRadius * escapeRadius;
    
    for (int i = 0; i < 8192; i++) {
        if (i >= u_maxIterations) break;
        
        float x2 = z.x * z.x;
        float y2 = z.y * z.y;
        float r2 = x2 + y2;
        
        if (r2 > escapeRadius2) {
            float log_zn = log(r2) * 0.5;
            float nu = log(log_zn / log(2.0)) / log(2.0);
            float mu = float(iterations) + 1.0 - nu;
            return max(0.0, mu);
        }
        
        float xy = z.x * z.y;
        z = vec2(x2 - y2 + c.x, xy + xy + c.y);
        iterations++;
    }
    
    return -1.0; // Interior point
}

// Double-double precision Mandelbrot
float mandelbrotDD(vec4 c) {
    vec4 z = COMPLEX_DD_ZERO;
    vec2 escapeRadius2 = dd_sqr(dd_from_float(4.0));
    
    for (int i = 0; i < 8192; i++) {
        if (i >= u_maxIterations) break;
        
        vec2 r2 = complex_dd_magnitude_squared(z);
        
        if (dd_compare(r2, escapeRadius2) > 0.0) {
            // Convert back to single precision for smooth coloring
            float r_single = dd_to_float(r2);
            float log_zn = log(r_single) * 0.5;
            float nu = log(log_zn / log(2.0)) / log(2.0);
            float mu = float(i) + 1.0 - nu;
            return max(0.0, mu);
        }
        
        // z = z^2 + c
        z = complex_dd_add(complex_dd_sqr(z), c);
    }
    
    return -1.0; // Interior point
}

// Convert pixel coordinates to complex coordinates with DD precision
// Uses gl_FragCoord to avoid interpolation precision loss
vec4 pixelToComplexDD() {
    // Generate pixel coordinates from gl_FragCoord (exact integers)
    // This avoids precision loss from interpolated v_texCoord
    vec2 pixel = gl_FragCoord.xy;
    
    // CRITICAL FIX: Do ALL coordinate calculation in DD precision from start
    // Convert pixel coordinates to DD immediately
    vec2 pixel_x_dd = dd_from_float(pixel.x);
    vec2 pixel_y_dd = dd_from_float(pixel.y);
    
    // Convert resolution to DD
    vec2 res_x_dd = dd_from_float(u_resolution.x);
    vec2 res_y_dd = dd_from_float(u_resolution.y);
    vec2 half_dd = dd_from_float(0.5);
    
    // Normalize to [0,1], then to [-0.5, 0.5] in DD precision
    vec2 norm_x = dd_sub(dd_div(pixel_x_dd, res_x_dd), half_dd);
    vec2 norm_y = dd_sub(dd_div(pixel_y_dd, res_y_dd), half_dd);
    
    // Apply aspect ratio correction in DD precision
    vec2 aspect_ratio_dd = dd_div(res_x_dd, res_y_dd);
    vec2 norm_x_corrected = dd_mul(norm_x, aspect_ratio_dd);
    // Y doesn't need aspect correction (stays as norm_y)
    
    // Multiply by scale using DD arithmetic to preserve precision
    // This is critical: scale might be 1e-9, so pixel-level precision matters
    vec2 offset_x = dd_mul(norm_x_corrected, u_scale_dd);  
    vec2 offset_y = dd_mul(norm_y, u_scale_dd);
    
    // Add offsets to center using DD addition
    vec2 re = dd_add(u_center_dd.xy, offset_x);
    vec2 im = dd_add(u_center_dd.zw, offset_y);
    
    return vec4(re.x, re.y, im.x, im.y);
}

// Debug mode: 0=normal, 1=show coordinates, 2=show scale magnitude, 3=show iteration progress
uniform int u_debug_mode;

void main() {
    // DEBUG MODE 6: VERIFY SHADER UPDATES - distinctive magenta
    if (u_debug_mode == 6) {
        fragColor = vec4(1.0, 0.0, 1.0, 1.0);  // MAGENTA - confirms shader reload
        return;
    }

    // DEBUG MODE 5: Solid blue - verify shader is running (BEFORE progressive check)
    if (u_debug_mode == 5) {
        fragColor = vec4(0.0, 0.0, 1.0, 1.0);  // SOLID BLUE
        return;
    }

    // DEBUG MODE 7: Show progressive mode value as color
    if (u_debug_mode == 7) {
        float progVal = float(u_progressiveMode) / 5.0;  // Normalize to [0,1] range
        fragColor = vec4(progVal, 0.5, 0.5, 1.0);  // Red channel = progressive mode
        return;
    }

    // Progressive rendering: check if we should compute this pixel
    if (u_progressiveMode > 0 && u_progressiveMode != 1) { // Skip reprojection (mode 1) - not implemented for DD
        bool shouldCompute = true;

        if (u_progressiveMode == 2) { // Stochastic sampling
            shouldCompute = shouldSampleStochastic(v_texCoord, u_progressiveStage);
        } else if (u_progressiveMode == 3) { // Interleaved sampling
            shouldCompute = shouldSampleInterleaved(v_texCoord, u_progressiveStage);
        }

        if (!shouldCompute) {
            // For pixels we're not computing, use previous frame if available, else black
            if (u_progressiveStage > 0) {
                fragColor = texture(u_previousTexture, v_texCoord);
            } else {
                fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            }
            return;
        }
    }

    float mu;

    if (u_use_dd_precision) {
        // DEBUG MODE 1: Pure red - verify DD path is taken
        if (u_debug_mode == 1) {
            fragColor = vec4(1.0, 0.0, 0.0, 1.0);  // SOLID RED
            return;
        }

        // Use double-double precision for deep zoom with gl_FragCoord-based coordinates
        vec4 c_dd = pixelToComplexDD();

        // DEBUG MODE 2: Show c_dd coordinates as colors (detect if all same)
        if (u_debug_mode == 2) {
            // Map c_dd to visible range - shift by center and scale
            float re_offset = dd_to_float(dd_sub(c_dd.xy, u_center_dd.xy));
            float im_offset = dd_to_float(dd_sub(c_dd.zw, u_center_dd.zw));
            // Normalize: at scale 1e-7, max offset is ~1e-7, so scale up
            float norm = 1.0 / (u_scale_dd.x + 1e-30);
            fragColor = vec4(
                re_offset * norm + 0.5,
                im_offset * norm + 0.5,
                0.5,
                1.0
            );
            return;
        }

        // DEBUG MODE 3: Show scale value as color
        if (u_debug_mode == 3) {
            float scale_log = -log(max(u_scale_dd.x, 1e-30)) / 30.0;
            fragColor = vec4(scale_log, 0.5, 0.5, 1.0);
            return;
        }

        // DEBUG MODE 4: Show iteration count as color (before escape check)
        // FIXED: Use same escape radius as mandelbrotDD (16.0) and more iterations
        if (u_debug_mode == 4) {
            vec4 z = COMPLEX_DD_ZERO;
            vec2 escapeRadius2 = dd_from_float(16.0);  // |z|² > 16 means |z| > 4
            int count = 0;
            for (int i = 0; i < 1000; i++) {  // Increased from 100
                if (i >= u_maxIterations) break;
                vec2 r2 = complex_dd_magnitude_squared(z);
                if (dd_compare(r2, escapeRadius2) > 0.0) break;  // Use DD compare
                z = complex_dd_add(complex_dd_sqr(z), c_dd);
                count++;
            }
            float t = float(count) / float(u_maxIterations);
            fragColor = vec4(t, 1.0 - t, 0.0, 1.0);  // Red = few iterations, Green = many
            return;
        }

        // DEBUG MODE 10: Show |z|² after first iteration (should be |c|²)
        if (u_debug_mode == 10) {
            // After first iteration: z = c
            vec4 z = c_dd;
            vec2 r2 = complex_dd_magnitude_squared(z);
            float r2_float = dd_to_float(r2);
            // At center (-0.745, 0.113): |c|² ≈ 0.568
            // Should show gradient across the viewport
            // Normalize to [0, 1] assuming max |c|² around 1
            float t = clamp(r2_float, 0.0, 1.0);
            fragColor = vec4(t, t, 0.0, 1.0);  // Yellow intensity = |c|²
            return;
        }

        // DEBUG MODE 11: Show raw c_dd.x (real hi part) as color
        if (u_debug_mode == 11) {
            // c_dd.x is the hi part of real coordinate
            // Should be around -0.745 for all pixels at this zoom
            // Map [-1, 0] to [0, 1] for visualization
            float t = (c_dd.x + 1.0);  // Maps -1 to 0, 0 to 1
            fragColor = vec4(t, 0.0, 1.0 - t, 1.0);  // Red-blue gradient
            return;
        }

        // DEBUG MODE 12: Show c_dd.y (real lo part) variation
        if (u_debug_mode == 12) {
            // c_dd.y is the lo part - should show variation at deep zoom
            // At scale 1e-6, this should vary by about ±1e-6 across the screen
            // Scale up to make visible
            float lo_scaled = c_dd.y * 1e6 + 0.5;  // Scale and center
            fragColor = vec4(clamp(lo_scaled, 0.0, 1.0), 0.5, 0.5, 1.0);
            return;
        }

        // DEBUG MODE 13: Test DD arithmetic - compute known value
        // Compute (0.5 + 0.5)^2 = 1.0 using DD arithmetic
        if (u_debug_mode == 13) {
            vec2 half_val = dd_from_float(0.5);
            vec2 one = dd_add(half_val, half_val);  // Should be 1.0
            vec2 one_squared = dd_sqr(one);  // Should be 1.0
            float result = dd_to_float(one_squared);
            // Show result as color: green if ~1.0, red if wrong
            fragColor = vec4(abs(result - 1.0) * 10.0, result, 0.0, 1.0);
            return;
        }

        // DEBUG MODE 14: Test complex_dd_sqr with known value
        // (1 + 0i)^2 = 1 + 0i
        if (u_debug_mode == 14) {
            vec4 z = vec4(1.0, 0.0, 0.0, 0.0);  // 1 + 0i in DD
            vec4 z2 = complex_dd_sqr(z);
            float re = dd_to_float(z2.xy);
            float im = dd_to_float(z2.zw);
            // re should be 1.0, im should be 0.0
            fragColor = vec4(abs(re - 1.0) * 10.0, re, abs(im) * 10.0, 1.0);
            return;
        }

        // DEBUG MODE 15: Run ONE iteration and show z
        if (u_debug_mode == 15) {
            vec4 z = COMPLEX_DD_ZERO;
            // z = z^2 + c = 0 + c = c
            z = complex_dd_add(complex_dd_sqr(z), c_dd);
            float re = dd_to_float(z.xy);
            float im = dd_to_float(z.zw);
            // At center (-0.745, 0.113), z should be close to c
            // Map to visible range
            fragColor = vec4((re + 1.0) / 2.0, (im + 0.5) / 1.0, 0.5, 1.0);
            return;
        }

        // DEBUG MODE 16: Show the LO part of c_dd.xy directly
        // This should show variation if DD coords are working
        if (u_debug_mode == 16) {
            // c_dd.y is the lo part of real coordinate
            // At scale 1e-6, the range of lo values should be about ±1e-6
            // Scale to make visible: multiply by 1e6 gives ±1, then add 0.5
            float lo_re = c_dd.y;
            float lo_scaled = lo_re * 1000000.0 + 0.5;
            fragColor = vec4(clamp(lo_scaled, 0.0, 1.0), 0.5, 0.5, 1.0);
            return;
        }

        // DEBUG MODE 17: Compare center pixel to this pixel using bit manipulation
        // Show the difference in floating point representation
        if (u_debug_mode == 17) {
            // Compute the difference from center in DD
            vec2 diff_re = dd_sub(c_dd.xy, u_center_dd.xy);
            vec2 diff_im = dd_sub(c_dd.zw, u_center_dd.zw);
            // The difference should be small but non-zero
            // Scale by 1/scale to normalize
            float diff_re_normalized = dd_to_float(diff_re) / u_scale_dd.x;
            float diff_im_normalized = dd_to_float(diff_im) / u_scale_dd.x;
            // Map [-1, 1] to [0, 1]
            fragColor = vec4(
                diff_re_normalized + 0.5,
                diff_im_normalized + 0.5,
                0.5,
                1.0
            );
            return;
        }

        // DEBUG MODE 18: Show 5 iterations of DD to see if orbit diverges
        if (u_debug_mode == 18) {
            vec4 z = COMPLEX_DD_ZERO;
            for (int i = 0; i < 5; i++) {
                z = complex_dd_add(complex_dd_sqr(z), c_dd);
            }
            vec2 r2 = complex_dd_magnitude_squared(z);
            float mag = sqrt(dd_to_float(r2));
            // After 5 iterations, magnitude could be anywhere from 0 to huge
            // Use log scale for visualization
            float t = log(mag + 1.0) / 5.0;
            fragColor = vec4(clamp(t, 0.0, 1.0), clamp(1.0 - t, 0.0, 1.0), 0.0, 1.0);
            return;
        }

        // DEBUG MODE 19: Test after first iteration: z = c, then show z² offset from c²_center
        if (u_debug_mode == 19) {
            // First iteration: z = 0² + c = c
            vec4 z1 = c_dd;
            // Second iteration: z = c² + c
            vec4 c_squared = complex_dd_sqr(z1);
            vec4 z2 = complex_dd_add(c_squared, c_dd);

            // Compute what c² at center would be
            vec4 center = vec4(u_center_dd.xy, u_center_dd.zw);
            vec4 center_squared = complex_dd_sqr(center);

            // Show the difference in c² between this pixel and center
            vec2 diff_re = dd_sub(c_squared.xy, center_squared.xy);
            vec2 diff_im = dd_sub(c_squared.zw, center_squared.zw);

            // Normalize and display - at scale 1e-6, expect ±1e-6 * 2 * center ≈ ±1.5e-6
            float diff_re_norm = dd_to_float(diff_re) * 1e6 + 0.5;
            float diff_im_norm = dd_to_float(diff_im) * 1e6 + 0.5;

            fragColor = vec4(
                clamp(diff_re_norm, 0.0, 1.0),
                clamp(diff_im_norm, 0.0, 1.0),
                0.5,
                1.0
            );
            return;
        }

        // DEBUG MODE 20: Show difference in z after 2 iterations vs center's z
        if (u_debug_mode == 20) {
            // Compute z after 2 iterations for this pixel
            vec4 z = COMPLEX_DD_ZERO;
            z = complex_dd_add(complex_dd_sqr(z), c_dd);  // z = c
            z = complex_dd_add(complex_dd_sqr(z), c_dd);  // z = c² + c

            // Compute z after 2 iterations for center
            vec4 center = vec4(u_center_dd.xy, u_center_dd.zw);
            vec4 z_center = COMPLEX_DD_ZERO;
            z_center = complex_dd_add(complex_dd_sqr(z_center), center);
            z_center = complex_dd_add(complex_dd_sqr(z_center), center);

            // Show the difference
            vec2 diff_re = dd_sub(z.xy, z_center.xy);
            vec2 diff_im = dd_sub(z.zw, z_center.zw);

            float diff_re_norm = dd_to_float(diff_re) * 1e6 + 0.5;
            float diff_im_norm = dd_to_float(diff_im) * 1e6 + 0.5;

            fragColor = vec4(
                clamp(diff_re_norm, 0.0, 1.0),
                clamp(diff_im_norm, 0.0, 1.0),
                0.5,
                1.0
            );
            return;
        }

        // DEBUG MODE 21: Show z LO parts after 5 iterations
        // If these are zero, DD arithmetic is failing to preserve precision
        if (u_debug_mode == 21) {
            vec4 z = COMPLEX_DD_ZERO;
            for (int i = 0; i < 5; i++) {
                z = complex_dd_add(complex_dd_sqr(z), c_dd);
            }
            // Show the LO parts (z.y and z.w) - these should be non-zero
            float lo_re_scaled = z.y * 1e6 + 0.5;
            float lo_im_scaled = z.w * 1e6 + 0.5;
            fragColor = vec4(
                clamp(lo_re_scaled, 0.0, 1.0),
                clamp(lo_im_scaled, 0.0, 1.0),
                0.5,
                1.0
            );
            return;
        }

        // DEBUG MODE 22: Show z difference from center after 5 iterations
        if (u_debug_mode == 22) {
            vec4 z = COMPLEX_DD_ZERO;
            for (int i = 0; i < 5; i++) {
                z = complex_dd_add(complex_dd_sqr(z), c_dd);
            }

            vec4 center = vec4(u_center_dd.xy, u_center_dd.zw);
            vec4 z_center = COMPLEX_DD_ZERO;
            for (int i = 0; i < 5; i++) {
                z_center = complex_dd_add(complex_dd_sqr(z_center), center);
            }

            vec2 diff_re = dd_sub(z.xy, z_center.xy);
            vec2 diff_im = dd_sub(z.zw, z_center.zw);
            float diff_re_norm = dd_to_float(diff_re) * 1e6 + 0.5;
            float diff_im_norm = dd_to_float(diff_im) * 1e6 + 0.5;

            fragColor = vec4(
                clamp(diff_re_norm, 0.0, 1.0),
                clamp(diff_im_norm, 0.0, 1.0),
                0.5,
                1.0
            );
            return;
        }

        // DEBUG MODE 23: Show z difference from center after 10 iterations
        if (u_debug_mode == 23) {
            vec4 z = COMPLEX_DD_ZERO;
            for (int i = 0; i < 10; i++) {
                z = complex_dd_add(complex_dd_sqr(z), c_dd);
            }

            vec4 center = vec4(u_center_dd.xy, u_center_dd.zw);
            vec4 z_center = COMPLEX_DD_ZERO;
            for (int i = 0; i < 10; i++) {
                z_center = complex_dd_add(complex_dd_sqr(z_center), center);
            }

            vec2 diff_re = dd_sub(z.xy, z_center.xy);
            vec2 diff_im = dd_sub(z.zw, z_center.zw);
            // Use larger scale factor since differences grow with iterations
            float diff_re_norm = dd_to_float(diff_re) * 1e4 + 0.5;
            float diff_im_norm = dd_to_float(diff_im) * 1e4 + 0.5;

            fragColor = vec4(
                clamp(diff_re_norm, 0.0, 1.0),
                clamp(diff_im_norm, 0.0, 1.0),
                0.5,
                1.0
            );
            return;
        }

        // DEBUG MODE 8: Use STANDARD coordinate calculation but DD iteration
        // This tests if the issue is in pixelToComplexDD or mandelbrotDD
        if (u_debug_mode == 8) {
            vec2 aspectRatio = vec2(u_resolution.x / u_resolution.y, 1.0);
            vec2 uv = (v_texCoord - 0.5) * aspectRatio;
            vec2 c_standard = u_center + uv * u_scale;
            // Convert to DD and run DD iteration
            vec4 c_dd_from_standard = vec4(c_standard.x, 0.0, c_standard.y, 0.0);
            mu = mandelbrotDD(c_dd_from_standard);
        }
        // DEBUG MODE 9: Use DD coordinates but STANDARD iteration
        // This tests if DD math is broken
        else if (u_debug_mode == 9) {
            // Convert c_dd back to standard precision and use standard iteration
            vec2 c_from_dd = vec2(dd_to_float(c_dd.xy), dd_to_float(c_dd.zw));
            mu = mandelbrot(c_from_dd);
        } else {
            mu = mandelbrotDD(c_dd);
        }
    } else {
        // Use standard precision for normal zoom levels with interpolated UV
        vec2 aspectRatio = vec2(u_resolution.x / u_resolution.y, 1.0);
        vec2 uv = (v_texCoord - 0.5) * aspectRatio;
        vec2 c = u_center + uv * u_scale;
        mu = mandelbrot(c);
    }

    // Handle interior points
    if (mu < 0.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Apply coloring
    vec3 color = getColor(mu, u_colorScheme);

    fragColor = vec4(color, 1.0);
}