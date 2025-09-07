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

// Double-Double Arithmetic from dd-arithmetic.glsl (unified source)
const float DD_EPS = 5.96046448e-08;  // 2^-24, single-precision machine epsilon in GLSL
const float DD_SPLIT = 4097.0;        // 2^12 + 1 for 24-bit mantissa (correct for GLSL single precision)

vec2 dd_fast_two_sum(float a, float b) {
    float s = a + b;
    float e = b - (s - a);
    return vec2(s, e);
}

vec2 dd_two_sum(float a, float b) {
    float s = a + b;
    float v = s - a;
    float e = (a - (s - v)) + (b - v);
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
    vec2 s = dd_two_sum(a.x, b.x);
    vec2 f = dd_two_sum(a.y, b.y);
    vec2 c = dd_normalize(vec2(s.y + f.x, f.y));
    return dd_fast_two_sum(s.x, c.x + c.y);
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

void main() {
    float mu;
    
    if (u_use_dd_precision) {
        // Use double-double precision for deep zoom with gl_FragCoord-based coordinates
        vec4 c_dd = pixelToComplexDD();
        mu = mandelbrotDD(c_dd);
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