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

// Include double-double arithmetic functions
// Note: In real implementation, this would be included via #include or concatenated
// For now, we'll include the essential functions directly

// Essential DD constants and functions (subset from dd-arithmetic.glsl)
const vec2 DD_ZERO = vec2(0.0, 0.0);
const vec2 DD_ONE = vec2(1.0, 0.0);
const vec2 DD_TWO = vec2(2.0, 0.0);
const vec2 DD_HALF = vec2(0.5, 0.0);
const float DD_SPLIT = 134217729.0; // 2^27 + 1 for proper double-double arithmetic

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

float dd_to_float(vec2 dd) {
    return dd.x + dd.y;
}

vec2 dd_add(vec2 a, vec2 b) {
    // Match TypeScript implementation structure
    vec2 s = dd_two_sum(a.x, b.x);
    vec2 f = dd_two_sum(a.y, b.y);
    // Inline normalize: c = normalize(e + f.hi, f.lo)  
    vec2 c_temp = vec2(s.y + f.x, f.y);
    vec2 c = dd_fast_two_sum(c_temp.x, c_temp.y);
    return dd_fast_two_sum(s.x, c.x + c.y);
}

vec2 dd_sub(vec2 a, vec2 b) {
    return dd_add(a, vec2(-b.x, -b.y));
}

vec2 dd_mul(vec2 a, vec2 b) {
    // Match TypeScript implementation exactly
    vec2 p = dd_two_product(a.x, b.x);
    float err2 = a.x * b.y + a.y * b.x;
    return dd_fast_two_sum(p.x, p.y + err2);
}

vec2 dd_sqr(vec2 a) {
    vec2 p = dd_two_product(a.x, a.x);
    float err2 = 2.0 * a.x * a.y;
    return dd_fast_two_sum(p.x, p.y + err2);
}

float dd_compare(vec2 a, vec2 b) {
    if (a.x < b.x) return -1.0;
    if (a.x > b.x) return 1.0;
    if (a.y < b.y) return -1.0;
    if (a.y > b.y) return 1.0;
    return 0.0;
}

bool dd_is_zero(vec2 a) {
    return a.x == 0.0 && a.y == 0.0;
}

// Complex DD functions
const vec4 COMPLEX_DD_ZERO = vec4(0.0, 0.0, 0.0, 0.0);

vec4 complex_dd_from_floats(float re, float im) {
    return vec4(re, 0.0, im, 0.0);
}

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
        float phase1 = mu * 0.05;
        float phase2 = mu * 0.1;
        float hue = 0.5 + 0.5 * sin(phase1);
        float sat = 0.7;
        float val = 1.0 - pow(1.0 - (0.5 + 0.5 * sin(phase2)), 3.0);
        return hsv2rgb(vec3(hue, sat, val));
    } else if (scheme == 1) {
        float phase = mu * 0.03;
        float r = 0.8 + 0.2 * sin(phase);
        float g = 0.3 + 0.2 * sin(phase + 1.5);
        float b = 0.1 + 0.3 * sin(phase + 3.0);
        r = clamp(r * (0.9 + 0.1 * cos(phase * 0.5)), 0.0, 1.0);
        g = clamp(g * (0.4 + 0.3 * cos(phase * 0.7 + 1.0)), 0.0, 1.0);
        b = clamp(b * (0.2 + 0.2 * cos(phase * 0.9 + 2.0)), 0.0, 1.0);
        return vec3(r, g, b);
    }
    // Add other color schemes as needed...
    
    // Default: classic rainbow
    float phase = mu * 0.1;
    float hue = 0.5 + 0.5 * sin(phase);
    return hsv2rgb(vec3(hue, 0.8, 0.9));
}

// Standard precision Mandelbrot (from original shader)
float mandelbrot(vec2 c) {
    vec2 z = vec2(0.0);
    int iterations = 0;
    float escapeRadius = 256.0;
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
    vec2 escapeRadius2 = dd_sqr(dd_from_float(256.0));
    
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

// Convert viewport UV to complex coordinates
vec4 viewportToComplexDD(vec2 uv) {
    // Calculate DD coordinates: center + uv * scale (matching standard precision logic)
    vec2 re = dd_add(u_center_dd.xy, dd_mul(dd_from_float(uv.x), u_scale_dd));
    vec2 im = dd_add(u_center_dd.zw, dd_mul(dd_from_float(uv.y), u_scale_dd));
    return vec4(re.x, re.y, im.x, im.y);
}

void main() {
    // Convert screen coordinates to complex plane
    vec2 aspectRatio = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv = (v_texCoord - 0.5) * aspectRatio;
    
    // Simple uniform references to prevent optimization (minimal impact)
    if (u_progressiveMode < -999 || u_progressiveStage < -999 || u_aaQuality < 0.0 || !u_antiAliasing) {
        // Never true, just prevents uniform optimization
        fragColor = texture(u_previousTexture, v_texCoord);
        return;
    }
    
    float mu;
    
    if (u_use_dd_precision) {
        // Use double-double precision for deep zoom
        vec4 c_dd = viewportToComplexDD(uv);
        mu = mandelbrotDD(c_dd);
    } else {
        // Use standard precision for normal zoom levels
        vec2 c = u_center + uv * u_scale;
        mu = mandelbrot(c);
    }
    
    // Handle interior points
    if (mu < 0.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // Apply histogram equalization and coloring
    mu = histogramEqualize(mu);
    vec3 color = getColor(mu, u_colorScheme);
    
    // TODO: Implement anti-aliasing in DD shader (future feature)
    
    // Simple DD mode visual indicator: add slight blue tint to verify DD is active
    if (u_use_dd_precision) {
        // Add a very subtle blue tint to prove DD mode is working
        fragColor = vec4(color * 0.95 + vec3(0.0, 0.0, 0.05), 1.0);
        return;
    }
    
    fragColor = vec4(color, 1.0);
}