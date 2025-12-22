#version 300 es
precision highp float;

/**
 * Perturbation Theory Mandelbrot Shader
 *
 * Key insight: Instead of computing z_{n+1} = z_n² + c at arbitrary precision,
 * we compute ONE reference orbit Z_n at the center, then for each pixel
 * compute the delta (difference from reference) using float64 arithmetic:
 *
 *   δ_{n+1} = 2·Z_n·δ_n + δ_n² + δc
 *
 * This is MUCH faster because deltas stay small (float64 is sufficient).
 */

in vec2 v_texCoord;
out vec4 fragColor;

// Standard uniforms
uniform vec2 u_resolution;
uniform int u_maxIterations;
uniform int u_colorScheme;
uniform float u_colorOffset;
uniform float u_colorScale;

// Perturbation uniforms
uniform sampler2D u_referenceOrbit;    // RGBA32F: (Z.re, Z.im, |Z|², 0) per iteration
uniform int u_orbitTextureWidth;       // Width of orbit texture
uniform int u_orbitTextureHeight;      // Height of orbit texture
uniform int u_orbitLength;             // Actual length of orbit
uniform int u_referenceEscapeIter;     // When reference escaped (-1 if didn't)

// Reference point and viewport
uniform vec2 u_referencePoint;         // Reference point (center of viewport)
uniform vec2 u_pixelDelta;             // Complex delta per pixel
uniform vec2 u_viewOffset;             // Offset from reference point to current viewport center

// Glitch detection threshold
uniform float u_glitchThreshold;       // Typically 1e-3 to 1e-6

// Progressive rendering
uniform int u_progressiveMode;
uniform int u_progressiveStage;
uniform sampler2D u_previousTexture;

// Histogram equalization
uniform bool u_histogramEqualization;

// ============================================================
// Helper functions
// ============================================================

// Read reference orbit value at iteration n
vec4 getOrbitValue(int n) {
    if (n < 0 || n > u_orbitLength) {
        return vec4(0.0);
    }

    int x = n % u_orbitTextureWidth;
    int y = n / u_orbitTextureWidth;

    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(float(u_orbitTextureWidth), float(u_orbitTextureHeight));
    return texture(u_referenceOrbit, uv);
}

// Progressive sampling helpers
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

// ============================================================
// Coloring
// ============================================================

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float histogramEqualize(float mu) {
    if (!u_histogramEqualization) return mu;
    float normalized = clamp(mu / float(u_maxIterations), 0.0, 1.0);
    float equalized = pow(normalized, 0.6);
    equalized = equalized * equalized * (3.0 - 2.0 * equalized);
    return equalized * float(u_maxIterations);
}

vec3 getColor(float mu, int scheme) {
    // Apply histogram equalization if enabled
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
        float r = 0.8 + 0.2 * sin(phase);
        float g = 0.3 + 0.2 * sin(phase + 1.5);
        float b = 0.1 + 0.3 * sin(phase + 3.0);
        r = clamp(r * (0.9 + 0.1 * cos(phase * 0.5)), 0.0, 1.0);
        g = clamp(g * (0.4 + 0.3 * cos(phase * 0.7 + 1.0)), 0.0, 1.0);
        b = clamp(b * (0.2 + 0.2 * cos(phase * 0.9 + 2.0)), 0.0, 1.0);
        return vec3(r, g, b);
    } else if (scheme == 2) {
        // Ocean - continuous smooth gradient using sine waves
        float phase = mu * 0.04;
        float r = 0.0 + 0.1 * sin(phase + 3.0);
        float g = 0.4 + 0.4 * sin(phase + 1.0);
        float b = 0.7 + 0.3 * sin(phase);
        r = clamp(r * (0.2 + 0.1 * cos(phase * 0.4)), 0.0, 1.0);
        g = clamp(g * (0.8 + 0.2 * cos(phase * 0.6 + 2.0)), 0.0, 1.0);
        b = clamp(b * (0.9 + 0.1 * cos(phase * 0.8 + 1.0)), 0.0, 1.0);
        return vec3(r, g, b);
    } else if (scheme == 3) {
        // Fire - continuous smooth gradient using sine waves
        float phase = mu * 0.02;
        float r = 0.6 + 0.4 * sin(phase + 0.5);
        float g = 0.3 + 0.4 * sin(phase + 2.0);
        float b = 0.0 + 0.3 * sin(phase + 4.0);
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
        float r = 0.4 + 0.4 * sin(phase + 1.0);
        float g = 0.1 + 0.2 * sin(phase + 2.5);
        float b = 0.6 + 0.3 * sin(phase);
        r = clamp(r * (0.7 + 0.3 * cos(phase * 0.6)), 0.0, 1.0);
        g = clamp(g * (0.4 + 0.2 * cos(phase * 0.8 + 1.5)), 0.0, 1.0);
        b = clamp(b * (0.8 + 0.2 * cos(phase * 0.4 + 0.5)), 0.0, 1.0);
        return vec3(r, g, b);
    } else if (scheme == 6) {
        // Forest - continuous smooth gradient using sine waves
        float phase = mu * 0.04;
        float r = 0.1 + 0.3 * sin(phase + 2.0);
        float g = 0.5 + 0.4 * sin(phase);
        float b = 0.1 + 0.2 * sin(phase + 4.0);
        r = clamp(r * (0.4 + 0.3 * cos(phase * 0.5 + 1.0)), 0.0, 1.0);
        g = clamp(g * (0.8 + 0.2 * cos(phase * 0.7)), 0.0, 1.0);
        b = clamp(b * (0.3 + 0.2 * cos(phase * 0.9 + 2.0)), 0.0, 1.0);
        return vec3(r, g, b);
    } else if (scheme == 7) {
        // Neon - continuous smooth gradient using sine waves
        float phase = mu * 0.06;
        float r = 0.5 + 0.5 * sin(phase + 1.5);
        float g = 0.5 + 0.5 * sin(phase);
        float b = 0.5 + 0.5 * sin(phase + 3.0);
        r = clamp(r * (0.8 + 0.2 * cos(phase * 0.8 + 2.0)), 0.0, 1.0);
        g = clamp(g * (0.9 + 0.1 * cos(phase * 1.0)), 0.0, 1.0);
        b = clamp(b * (0.7 + 0.3 * cos(phase * 0.6 + 1.0)), 0.0, 1.0);
        return vec3(r, g, b);
    } else if (scheme == 8) {
        // Ice - continuous smooth gradient using sine waves
        float phase = mu * 0.035;
        float r = 0.3 + 0.3 * sin(phase + 4.0);
        float g = 0.4 + 0.4 * sin(phase + 2.0);
        float b = 0.6 + 0.4 * sin(phase);
        r = clamp(r * (0.6 + 0.4 * cos(phase * 0.4)), 0.0, 1.0);
        g = clamp(g * (0.7 + 0.3 * cos(phase * 0.5 + 1.0)), 0.0, 1.0);
        b = clamp(b * (0.9 + 0.1 * cos(phase * 0.6 + 0.5)), 0.0, 1.0);
        return vec3(r, g, b);
    } else if (scheme == 9) {
        // Copper - continuous smooth gradient using sine waves
        float phase = mu * 0.028;
        float r = 0.6 + 0.4 * sin(phase);
        float g = 0.3 + 0.3 * sin(phase + 1.0);
        float b = 0.1 + 0.2 * sin(phase + 2.0);
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

// ============================================================
// Perturbation Iteration
// ============================================================

/**
 * Perturbation iteration with glitch detection
 *
 * Formula: δ_{n+1} = 2·Z_n·δ_n + δ_n² + δc
 *
 * Where:
 *   Z_n = reference orbit value at iteration n
 *   δ_n = current delta (pixel's z - reference z)
 *   δc = pixel's c - reference c (constant per pixel)
 *
 * Glitch detection:
 *   When |δ_n| becomes comparable to |Z_n|, the approximation becomes inaccurate.
 *   We detect this and mark the pixel for rebasing (currently shown as special color).
 *
 * Returns: smooth iteration count, or -1.0 for interior, or -2.0 for glitched
 */
float perturbationIterate(vec2 deltaC) {
    // Initial delta is just the offset from reference
    vec2 delta = vec2(0.0);

    float escapeRadius2 = 16.0;  // 4² for escape

    for (int i = 0; i < 8192; i++) {
        if (i >= u_maxIterations) break;
        if (i >= u_orbitLength) break;

        // Get reference orbit value
        vec4 orbitVal = getOrbitValue(i);
        vec2 Z = orbitVal.xy;        // Reference Z_n
        float Z_mag2 = orbitVal.z;   // |Z_n|²

        // Perturbation formula: δ' = 2·Z·δ + δ² + δc
        // Complex multiplication:
        //   2·Z·δ = 2*(Z.re*δ.re - Z.im*δ.im, Z.re*δ.im + Z.im*δ.re)
        //   δ² = (δ.re² - δ.im², 2·δ.re·δ.im)

        vec2 twoZdelta = 2.0 * vec2(
            Z.x * delta.x - Z.y * delta.y,
            Z.x * delta.y + Z.y * delta.x
        );

        vec2 deltaSq = vec2(
            delta.x * delta.x - delta.y * delta.y,
            2.0 * delta.x * delta.y
        );

        delta = twoZdelta + deltaSq + deltaC;

        // Compute full z for this pixel: z = Z + δ
        vec2 z = Z + delta;
        float z_mag2 = z.x * z.x + z.y * z.y;

        // Check escape
        if (z_mag2 > escapeRadius2) {
            // Smooth coloring - same formula as standard shader for color consistency
            float log_zn = log(z_mag2) * 0.5;
            float nu = log(log_zn / log(2.0)) / log(2.0);
            float mu = float(i) + 1.0 - nu;

            // NO scaling - the iteration count IS correct. Use u_colorScale uniform
            // to adjust color spread if needed, not a hardcoded multiplier.
            return max(0.0, mu);
        }

        // Glitch detection: when |δ| > glitchThreshold * |Z|
        // The perturbation approximation becomes unreliable
        float delta_mag2 = delta.x * delta.x + delta.y * delta.y;

        if (Z_mag2 > 0.0 && delta_mag2 > u_glitchThreshold * u_glitchThreshold * Z_mag2) {
            // Glitch detected - mark for rebasing
            // For now, return special value; later implement rebasing
            return -2.0;
        }
    }

    // Didn't escape - interior point
    return -1.0;
}

void main() {
    // Progressive rendering
    if (u_progressiveMode > 0 && u_progressiveMode != 1) {
        bool shouldCompute = true;

        if (u_progressiveMode == 2) {
            shouldCompute = shouldSampleStochastic(v_texCoord, u_progressiveStage);
        } else if (u_progressiveMode == 3) {
            shouldCompute = shouldSampleInterleaved(v_texCoord, u_progressiveStage);
        }

        if (!shouldCompute) {
            if (u_progressiveStage > 0) {
                fragColor = texture(u_previousTexture, v_texCoord);
            } else {
                fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            }
            return;
        }
    }

    // Compute pixel offset from reference (δc)
    // Using gl_FragCoord for exact pixel positions
    vec2 pixel = gl_FragCoord.xy;
    vec2 center = u_resolution * 0.5;
    vec2 pixelOffset = pixel - center;

    // δc = pixel offset in complex plane
    //
    // The standard renderer uses: c = center + (texCoord - 0.5) * aspectRatio * scale
    // Where aspectRatio = (width/height, 1.0)
    //
    // This means for pixel (px, py):
    //   c.x = centerX + (px - width/2) / height * scale
    //   c.y = centerY + (py - height/2) / height * scale
    //
    // So deltaC (offset from center) is:
    //   deltaC.x = (px - width/2) * scale / height
    //   deltaC.y = (py - height/2) * scale / height
    //
    // Since u_pixelDelta.y = scale / height, the formula simplifies to:
    //   deltaC = pixelOffset * u_pixelDelta.y
    //
    // IMPORTANT: u_viewOffset accounts for drift between the reference orbit center
    // and the current viewport center. Without this, the fractal appears "stuck to glass"
    // during panning/zooming until the orbit is recomputed.
    //
    vec2 deltaC = pixelOffset * u_pixelDelta.y + u_viewOffset;

    // Run perturbation iteration
    float mu = perturbationIterate(deltaC);

    // Handle results
    if (mu == -2.0) {
        // Glitched pixel - show in magenta for debugging
        // In production, these would be rebased or computed with full precision
        fragColor = vec4(1.0, 0.0, 1.0, 1.0);
        return;
    }

    if (mu < 0.0) {
        // Interior point
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Apply coloring
    vec3 color = getColor(mu, u_colorScheme);
    fragColor = vec4(color, 1.0);
}
