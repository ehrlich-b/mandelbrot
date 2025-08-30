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
    
    // Approximation using power curve to simulate equalization
    // This creates a more even distribution across the palette
    float normalized = mu / float(u_maxIterations);
    float equalized = pow(normalized, 0.5); // Square root for more uniform distribution
    
    // Apply some contrast enhancement
    equalized = smoothstep(0.0, 1.0, equalized * 1.2 - 0.1);
    
    return equalized * float(u_maxIterations);
}

// Color palette based on scheme
vec3 getColor(float mu, int scheme) {
    // Apply histogram equalization if enabled
    mu = histogramEqualize(mu);
    mu = mu * u_colorScale + u_colorOffset;
    
    if (scheme == 0) {
        // Classic rainbow
        float hue = mod(mu * 0.05, 1.0);
        float sat = 0.7;
        float val = 1.0 - pow(1.0 - mod(mu * 0.1, 1.0), 3.0);
        return hsv2rgb(vec3(hue, sat, val));
    } else if (scheme == 1) {
        // Sunset
        float t = mod(mu * 0.03, 1.0);
        vec3 sunset1 = vec3(1.0, 0.5, 0.0);
        vec3 sunset2 = vec3(1.0, 0.0, 0.5);
        vec3 sunset3 = vec3(0.2, 0.0, 0.5);
        
        if (t < 0.5) {
            return mix(sunset1, sunset2, t * 2.0);
        } else {
            return mix(sunset2, sunset3, (t - 0.5) * 2.0);
        }
    } else if (scheme == 2) {
        // Ocean
        float t = mod(mu * 0.04, 1.0);
        vec3 ocean1 = vec3(0.0, 0.1, 0.4);
        vec3 ocean2 = vec3(0.0, 0.5, 0.7);
        vec3 ocean3 = vec3(0.0, 0.9, 1.0);
        
        if (t < 0.5) {
            return mix(ocean1, ocean2, t * 2.0);
        } else {
            return mix(ocean2, ocean3, (t - 0.5) * 2.0);
        }
    } else if (scheme == 3) {
        // Fire
        float t = mod(mu * 0.02, 1.0);
        vec3 fire1 = vec3(0.1, 0.0, 0.0);
        vec3 fire2 = vec3(1.0, 0.0, 0.0);
        vec3 fire3 = vec3(1.0, 1.0, 0.0);
        vec3 fire4 = vec3(1.0, 1.0, 1.0);
        
        if (t < 0.33) {
            return mix(fire1, fire2, t * 3.0);
        } else if (t < 0.66) {
            return mix(fire2, fire3, (t - 0.33) * 3.0);
        } else {
            return mix(fire3, fire4, (t - 0.66) * 3.0);
        }
    } else if (scheme == 4) {
        // Monochrome
        float intensity = mod(mu * 0.1, 1.0);
        return vec3(intensity);
    } else if (scheme == 5) {
        // Twilight - Purple to pink gradient
        float t = mod(mu * 0.025, 1.0);
        vec3 twilight1 = vec3(0.15, 0.0, 0.4);   // Deep purple
        vec3 twilight2 = vec3(0.5, 0.1, 0.8);    // Purple
        vec3 twilight3 = vec3(0.9, 0.3, 0.7);    // Pink
        vec3 twilight4 = vec3(1.0, 0.8, 0.9);    // Light pink
        
        if (t < 0.33) {
            return mix(twilight1, twilight2, t * 3.0);
        } else if (t < 0.66) {
            return mix(twilight2, twilight3, (t - 0.33) * 3.0);
        } else {
            return mix(twilight3, twilight4, (t - 0.66) * 3.0);
        }
    } else if (scheme == 6) {
        // Forest - Natural greens
        float t = mod(mu * 0.04, 1.0);
        vec3 forest1 = vec3(0.0, 0.1, 0.0);      // Dark green
        vec3 forest2 = vec3(0.1, 0.4, 0.1);      // Forest green
        vec3 forest3 = vec3(0.3, 0.7, 0.2);      // Bright green
        vec3 forest4 = vec3(0.7, 0.9, 0.3);      // Yellow-green
        
        if (t < 0.33) {
            return mix(forest1, forest2, t * 3.0);
        } else if (t < 0.66) {
            return mix(forest2, forest3, (t - 0.33) * 3.0);
        } else {
            return mix(forest3, forest4, (t - 0.66) * 3.0);
        }
    } else if (scheme == 7) {
        // Neon - Vibrant cyberpunk colors
        float t = mod(mu * 0.06, 1.0);
        vec3 neon1 = vec3(0.0, 0.0, 0.2);        // Dark blue
        vec3 neon2 = vec3(0.0, 1.0, 1.0);        // Cyan
        vec3 neon3 = vec3(1.0, 0.0, 1.0);        // Magenta
        vec3 neon4 = vec3(1.0, 1.0, 0.0);        // Yellow
        
        if (t < 0.33) {
            return mix(neon1, neon2, t * 3.0);
        } else if (t < 0.66) {
            return mix(neon2, neon3, (t - 0.33) * 3.0);
        } else {
            return mix(neon3, neon4, (t - 0.66) * 3.0);
        }
    } else if (scheme == 8) {
        // Ice - Cool blues and whites
        float t = mod(mu * 0.035, 1.0);
        vec3 ice1 = vec3(0.05, 0.05, 0.2);       // Dark blue
        vec3 ice2 = vec3(0.1, 0.3, 0.6);         // Ice blue
        vec3 ice3 = vec3(0.4, 0.7, 0.9);         // Light blue
        vec3 ice4 = vec3(0.9, 0.95, 1.0);        // White
        
        if (t < 0.33) {
            return mix(ice1, ice2, t * 3.0);
        } else if (t < 0.66) {
            return mix(ice2, ice3, (t - 0.33) * 3.0);
        } else {
            return mix(ice3, ice4, (t - 0.66) * 3.0);
        }
    } else if (scheme == 9) {
        // Copper - Warm metallic tones
        float t = mod(mu * 0.028, 1.0);
        vec3 copper1 = vec3(0.1, 0.05, 0.0);     // Dark brown
        vec3 copper2 = vec3(0.5, 0.2, 0.1);      // Brown
        vec3 copper3 = vec3(0.9, 0.4, 0.2);      // Copper
        vec3 copper4 = vec3(1.0, 0.8, 0.6);      // Light copper
        
        if (t < 0.33) {
            return mix(copper1, copper2, t * 3.0);
        } else if (t < 0.66) {
            return mix(copper2, copper3, (t - 0.33) * 3.0);
        } else {
            return mix(copper3, copper4, (t - 0.66) * 3.0);
        }
    } else if (scheme == 10) {
        // Spectrum - Full rainbow with smooth transitions
        float hue = mod(mu * 0.08, 1.0);
        float sat = 0.8 + 0.2 * sin(mu * 0.02);
        float val = 0.7 + 0.3 * cos(mu * 0.03);
        return hsv2rgb(vec3(hue, sat, val));
    } else {
        // Default to classic
        float hue = mod(mu * 0.1, 1.0);
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
    vec2 dz = vec2(1.0, 0.0); // Derivative for distance estimation
    int iterations = 0;
    float escapeRadius = 256.0;
    float escapeRadius2 = escapeRadius * escapeRadius;
    
    for (int i = 0; i < 8192; i++) {
        if (i >= u_maxIterations) break;
        
        float x2 = z.x * z.x;
        float y2 = z.y * z.y;
        float r2 = x2 + y2;
        
        if (r2 > escapeRadius2) {
            // Enhanced smooth coloring with better normalization
            float log_zn = log(r2) * 0.5;
            float nu = log(log_zn / log(2.0)) / log(2.0);
            float mu = float(iterations) + 1.0 - nu;
            
            // Optional: Add distance estimation component
            float r = sqrt(r2);
            float dr = length(dz);
            float de = 2.0 * r * log(r) / dr; // Distance estimation
            
            // Return smooth iteration count (distance info could be used for shading)
            return max(0.0, mu);
        }
        
        // Derivative update for distance estimation: dz = 2*z*dz + 1
        dz = vec2(2.0 * (z.x * dz.x - z.y * dz.y) + 1.0, 
                  2.0 * (z.x * dz.y + z.y * dz.x));
        
        // Main iteration: z = z^2 + c
        float xy = z.x * z.y;
        z = vec2(x2 - y2 + c.x, xy + xy + c.y);
        iterations++;
    }
    
    // Interior smoothing for points in the set
    float r2 = dot(z, z);
    if (r2 < 4.0) {
        // Use potential function for interior points
        float potential = log(r2) * 0.5;
        return -1.0 - potential * 0.1; // Slightly negative for interior
    }
    
    return -1.0; // Deep interior
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