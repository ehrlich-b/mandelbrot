#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_scale;
uniform int u_maxIterations;
uniform int u_colorScheme;
uniform float u_colorOffset;
uniform float u_colorScale;

// Progressive rendering uniforms
uniform int u_progressiveMode;     // 0=full, 1=reprojection, 2=stochastic, 3=interleaved, 4=adaptive
uniform int u_progressiveStage;    // Current stage (0-4)
uniform sampler2D u_previousTexture;  // Previous frame texture
uniform vec3 u_previousTransform;  // Previous centerX, centerY, scale

// Anti-aliasing uniforms
uniform bool u_antiAliasing;       // Enable anti-aliasing
uniform float u_aaQuality;         // Quality level (1.0 = 4x, 2.0 = 9x supersampling)

// Histogram equalization uniforms
uniform bool u_histogramEqualization; // Enable histogram equalization
uniform sampler2D u_histogramTexture;  // Precomputed histogram data
uniform float u_totalPixels;           // Total pixels for normalization

// HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Histogram equalization approximation
float histogramEqualize(float mu) {
    if (!u_histogramEqualization) {
        return mu;
    }
    
    // Simple smooth histogram equalization without hard cutoffs
    float normalized = clamp(mu / float(u_maxIterations), 0.0, 1.0);
    
    // Apply square root transformation for better distribution
    float equalized = pow(normalized, 0.6); // Slightly less aggressive than 0.5
    
    // Add subtle S-curve for contrast without sharp edges
    equalized = equalized * equalized * (3.0 - 2.0 * equalized);
    
    return equalized * float(u_maxIterations);
}

// Color palette based on scheme
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

// High-quality pseudorandom function
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Multiple octaves of noise for better distribution
float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(random(i + vec2(0.0,0.0)), 
                   random(i + vec2(1.0,0.0)), u.x),
               mix(random(i + vec2(0.0,1.0)), 
                   random(i + vec2(1.1,1.0)), u.x), u.y);
}

// Blue noise approximation using multiple frequency layers
float blueNoise(vec2 coord) {
    vec2 st = coord * u_resolution * 0.01; // Scale for appropriate frequency
    float n = 0.0;
    float amplitude = 1.0;
    
    // Layer multiple noise octaves with decreasing amplitude
    for (int i = 0; i < 4; i++) {
        n += noise(st) * amplitude;
        st *= 2.0; // Double frequency
        amplitude *= 0.5; // Half amplitude
    }
    
    // Apply blue noise characteristics - suppress low frequencies
    float highFreqComponent = noise(coord * u_resolution * 0.1);
    return mix(n, highFreqComponent, 0.7);
}

// Blue noise pattern for stochastic sampling with progressive stages
bool shouldSampleStochastic(vec2 coord, int stage) {
    float blueNoiseValue = blueNoise(coord);
    
    // Progressive sampling thresholds - start sparse, fill in over stages
    float threshold = 0.5; // Default 50% sampling
    if (stage == 0) {
        threshold = 0.25; // 25% coverage in first stage
    } else if (stage == 1) {
        threshold = 0.5; // 50% total coverage in second stage 
    } else if (stage == 2) {
        threshold = 0.75; // 75% total coverage in third stage
    } else {
        threshold = 1.0; // Full coverage in final stage
    }
    
    return blueNoiseValue < threshold;
}

// Progressive interleaved sampling pattern
bool shouldSampleInterleaved(vec2 coord, int stage) {
    ivec2 pixel = ivec2(coord * u_resolution);
    
    // Progressive interleaved patterns for faster initial render
    if (stage == 0) {
        // Stage 0: Every 4th scanline (25% coverage)
        return pixel.y % 4 == 0;
    } else if (stage == 1) {
        // Stage 1: Fill in every other remaining scanline (50% total coverage)
        return (pixel.y % 4 == 0) || (pixel.y % 4 == 2);
    } else if (stage == 2) {
        // Stage 2: Fill in remaining scanlines (75% total coverage)
        return (pixel.y % 4 != 3);
    } else if (stage == 3) {
        // Stage 3: Fill all remaining pixels (100% coverage)
        return true;
    }
    
    // Fallback: checkerboard pattern
    return (pixel.x + pixel.y) % 2 == 1;
}

// Screen-space reprojection
vec4 reprojectPrevious(vec2 coord) {
    // Calculate the transformation from current to previous frame
    vec2 prevCenter = u_previousTransform.xy;
    float prevScale = u_previousTransform.z;
    
    // Transform current coordinate to previous frame's coordinate system
    vec2 aspectRatio = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 currentUV = (coord - 0.5) * aspectRatio;
    vec2 currentWorld = u_center + currentUV * u_scale;
    
    // Convert to previous frame's screen space
    vec2 prevWorld = currentWorld - prevCenter;
    vec2 prevUV = prevWorld / prevScale;
    vec2 prevCoord = prevUV / aspectRatio + 0.5;
    
    // Check if the coordinate is within the previous frame
    if (prevCoord.x >= 0.0 && prevCoord.x <= 1.0 && 
        prevCoord.y >= 0.0 && prevCoord.y <= 1.0) {
        return texture(u_previousTexture, prevCoord);
    }
    
    return vec4(0.0); // No valid reprojection
}

// Enhanced Mandelbrot iteration with improved smooth coloring
float mandelbrot(vec2 c) {
    vec2 z = vec2(0.0);
    int iterations = 0;
    float escapeRadius = 4.0; // Standard escape radius
    float escapeRadius2 = escapeRadius * escapeRadius;
    
    for (int i = 0; i < 8192; i++) {
        if (i >= u_maxIterations) break;
        
        float x2 = z.x * z.x;
        float y2 = z.y * z.y;
        float r2 = x2 + y2;
        
        if (r2 > escapeRadius2) {
            // Simple smooth coloring
            float log_zn = log(r2) * 0.5;
            float nu = log(log_zn / log(2.0)) / log(2.0);
            float mu = float(iterations) + 1.0 - nu;
            return max(0.0, mu);
        }
        
        // Basic mandelbrot iteration: z = z^2 + c
        z = vec2(x2 - y2 + c.x, 2.0 * z.x * z.y + c.y);
        iterations++;
    }
    
    return -1.0; // Interior point
}

// Gradient-based edge detection for adaptive anti-aliasing
float detectEdge(vec2 c) {
    vec2 aspectRatio = vec2(u_resolution.x / u_resolution.y, 1.0);
    float pixelSize = u_scale / min(u_resolution.x, u_resolution.y);
    
    // Sample neighboring points
    float center = mandelbrot(c);
    float right = mandelbrot(c + vec2(pixelSize, 0.0));
    float up = mandelbrot(c + vec2(0.0, pixelSize));
    float left = mandelbrot(c + vec2(-pixelSize, 0.0));
    float down = mandelbrot(c + vec2(0.0, -pixelSize));
    
    // Calculate gradients
    float gradX = abs(right - left);
    float gradY = abs(up - down);
    
    // Return gradient magnitude
    return sqrt(gradX * gradX + gradY * gradY);
}

// Anti-aliased Mandelbrot computation
vec3 mandelbrotAA(vec2 c) {
    if (!u_antiAliasing) {
        float mu = mandelbrot(c);
        if (mu < 0.0) {
            return vec3(0.0, 0.0, 0.0);
        } else {
            return getColor(mu, u_colorScheme);
        }
    }
    
    // Check if anti-aliasing is needed
    float edgeStrength = detectEdge(c);
    float threshold = 2.0; // Adjust sensitivity
    
    if (edgeStrength < threshold) {
        // No edge detected, use single sample
        float mu = mandelbrot(c);
        if (mu < 0.0) {
            return vec3(0.0, 0.0, 0.0);
        } else {
            return getColor(mu, u_colorScheme);
        }
    }
    
    // Edge detected, apply supersampling
    vec2 aspectRatio = vec2(u_resolution.x / u_resolution.y, 1.0);
    float pixelSize = u_scale / min(u_resolution.x, u_resolution.y);
    float subPixelSize = pixelSize / u_aaQuality;
    
    vec3 colorSum = vec3(0.0);
    float sampleCount = 0.0;
    
    // 4x supersampling pattern
    for (float i = -0.5; i <= 0.5; i += 1.0/u_aaQuality) {
        for (float j = -0.5; j <= 0.5; j += 1.0/u_aaQuality) {
            vec2 samplePos = c + vec2(i * subPixelSize, j * subPixelSize);
            float mu = mandelbrot(samplePos);
            
            if (mu < 0.0) {
                colorSum += vec3(0.0, 0.0, 0.0);
            } else {
                colorSum += getColor(mu, u_colorScheme);
            }
            sampleCount += 1.0;
        }
    }
    
    return colorSum / sampleCount;
}

void main() {
    // Convert screen coordinates to complex plane
    vec2 aspectRatio = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv = (v_texCoord - 0.5) * aspectRatio;
    vec2 c = u_center + uv * u_scale;
    
    // Handle progressive rendering modes (when enabled)
    if (u_progressiveMode > 0) {
        if (u_progressiveMode == 1) { // Reprojection mode
            vec4 reprojected = reprojectPrevious(v_texCoord);
            if (reprojected.a > 0.0) {
                fragColor = reprojected;
                return;
            }
        }
        
        // Determine if we should compute this pixel based on progressive mode
        bool shouldCompute = true;
        
        if (u_progressiveMode == 2) { // Stochastic sampling
            shouldCompute = shouldSampleStochastic(v_texCoord, u_progressiveStage);
        } else if (u_progressiveMode == 3) { // Interleaved sampling
            shouldCompute = shouldSampleInterleaved(v_texCoord, u_progressiveStage);
        }
        
        if (!shouldCompute) {
            // For pixels we're not computing, use previous frame or black
            if (u_progressiveStage > 0) {
                fragColor = texture(u_previousTexture, v_texCoord);
            } else {
                // Black for unsampled pixels in first stage
                fragColor = vec4(0.0, 0.0, 0.0, 1.0);
            }
            return;
        }
    }
    
    // Anti-aliased Mandelbrot computation
    vec3 color = mandelbrotAA(c);
    fragColor = vec4(color, 1.0);
}