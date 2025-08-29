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

// HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Color palette based on scheme
vec3 getColor(float mu, int scheme) {
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
    } else {
        // Default to classic
        float hue = mod(mu * 0.1, 1.0);
        return hsv2rgb(vec3(hue, 0.8, 0.9));
    }
}

// Mandelbrot iteration with smooth coloring
float mandelbrot(vec2 c) {
    vec2 z = vec2(0.0);
    int iterations = 0;
    float escapeRadius = 256.0;
    float escapeRadius2 = escapeRadius * escapeRadius;
    
    for (int i = 0; i < 8192; i++) {
        if (i >= u_maxIterations) break;
        
        float x2 = z.x * z.x;
        float y2 = z.y * z.y;
        
        if (x2 + y2 > escapeRadius2) {
            // Smooth coloring formula
            float mu = float(iterations) - log2(log2(x2 + y2) * 0.5);
            return mu;
        }
        
        float xy = z.x * z.y;
        z = vec2(x2 - y2 + c.x, xy + xy + c.y);
        iterations++;
    }
    
    // Point is in the set
    return -1.0;
}

void main() {
    // Convert screen coordinates to complex plane
    vec2 aspectRatio = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 uv = (v_texCoord - 0.5) * aspectRatio;
    vec2 c = u_center + uv * u_scale;
    
    float mu = mandelbrot(c);
    
    if (mu < 0.0) {
        // Point is in the Mandelbrot set - use black
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        // Point escaped - color based on iteration count
        vec3 color = getColor(mu, u_colorScheme);
        fragColor = vec4(color, 1.0);
    }
}