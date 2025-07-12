/**
 * WebGL Liquid Glass Effect
 * Creates a dynamic liquid glass background using WebGL shaders
 */

class LiquidGlassEffect {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.animationId = null;
        this.startTime = Date.now();
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetMouseX = 0;
        this.targetMouseY = 0;
        
        this.init();
    }

    init() {
        // Initialize WebGL context
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            console.warn('WebGL not supported, falling back to canvas background');
            this.fallbackBackground();
            return;
        }

        // Set up canvas
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Mouse tracking
        document.addEventListener('mousemove', (e) => {
            this.targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
            this.targetMouseY = -((e.clientY / window.innerHeight) * 2 - 1);
        });

        // Initialize shaders and start animation
        this.initShaders();
        this.createGeometry();
        this.animate();
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    initShaders() {
        // Vertex shader
        const vertexShaderSource = `
            attribute vec4 a_position;
            varying vec2 v_uv;
            
            void main() {
                gl_Position = a_position;
                v_uv = (a_position.xy + 1.0) * 0.5;
            }
        `;

        // Fragment shader with liquid glass effect
        const fragmentShaderSource = `
            precision mediump float;
            
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec2 u_mouse;
            varying vec2 v_uv;
            
            // Noise function
            float noise(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }
            
            // Smooth noise
            float smoothNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                
                float a = noise(i);
                float b = noise(i + vec2(1.0, 0.0));
                float c = noise(i + vec2(0.0, 1.0));
                float d = noise(i + vec2(1.0, 1.0));
                
                vec2 u = f * f * (3.0 - 2.0 * f);
                
                return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
            }
            
            // Fractal noise
            float fractalNoise(vec2 p) {
                float value = 0.0;
                float amplitude = 0.5;
                float frequency = 1.0;
                
                for (int i = 0; i < 4; i++) {
                    value += amplitude * smoothNoise(p * frequency);
                    amplitude *= 0.5;
                    frequency *= 2.0;
                }
                
                return value;
            }
            
            // Liquid distortion
            vec2 liquidDistortion(vec2 uv, float time) {
                float noise1 = fractalNoise(uv * 3.0 + time * 0.1);
                float noise2 = fractalNoise(uv * 5.0 - time * 0.15);
                
                vec2 distortion = vec2(
                    sin(uv.y * 8.0 + time * 0.3 + noise1 * 2.0) * 0.02,
                    sin(uv.x * 6.0 + time * 0.4 + noise2 * 2.0) * 0.02
                );
                
                // Mouse interaction
                vec2 mouseInfluence = (u_mouse - uv) * 0.1;
                float mouseDistance = length(u_mouse - uv);
                float mouseEffect = exp(-mouseDistance * 3.0) * 0.05;
                
                distortion += mouseInfluence * mouseEffect;
                
                return uv + distortion;
            }
            
            // Glass refraction effect
            vec3 glassEffect(vec2 uv, float time) {
                vec2 distortedUV = liquidDistortion(uv, time);
                
                // Create multiple layers of liquid movement
                float wave1 = sin(distortedUV.x * 10.0 + time * 0.5) * 0.5 + 0.5;
                float wave2 = sin(distortedUV.y * 8.0 + time * 0.3) * 0.5 + 0.5;
                float wave3 = sin((distortedUV.x + distortedUV.y) * 6.0 + time * 0.7) * 0.5 + 0.5;
                
                // Combine waves
                float combined = (wave1 + wave2 + wave3) / 3.0;
                
                // Create glass-like gradient
                vec3 color1 = vec3(0.4, 0.35, 0.8); // Purple
                vec3 color2 = vec3(0.2, 0.5, 0.9);  // Blue
                vec3 color3 = vec3(0.6, 0.4, 0.9);  // Light purple
                
                vec3 finalColor = mix(color1, color2, combined);
                finalColor = mix(finalColor, color3, wave3 * 0.3);
                
                // Add depth and transparency
                float depth = smoothstep(0.0, 1.0, combined);
                finalColor *= (0.3 + depth * 0.7);
                
                return finalColor;
            }
            
            // Bubble effect
            float bubbleEffect(vec2 uv, float time) {
                float bubbles = 0.0;
                
                for (int i = 0; i < 8; i++) {
                    float fi = float(i);
                    vec2 bubblePos = vec2(
                        sin(time * 0.3 + fi * 0.8) * 0.3,
                        fract(time * 0.1 + fi * 0.2) * 2.0 - 1.0
                    );
                    
                    float bubbleSize = 0.02 + sin(time * 0.4 + fi) * 0.01;
                    float dist = length(uv - bubblePos);
                    
                    if (dist < bubbleSize) {
                        bubbles += (1.0 - dist / bubbleSize) * 0.3;
                    }
                }
                
                return bubbles;
            }
            
            void main() {
                vec2 uv = v_uv;
                float time = u_time * 0.001;
                
                // Create liquid glass effect
                vec3 glassColor = glassEffect(uv, time);
                
                // Add bubble highlights
                float bubbles = bubbleEffect(uv, time);
                glassColor += vec3(bubbles * 0.5);
                
                // Add subtle vignette
                float vignette = 1.0 - length(uv - 0.5) * 0.8;
                glassColor *= vignette;
                
                // Final color with transparency
                gl_FragColor = vec4(glassColor, 0.8);
            }
        `;

        // Create and compile shaders
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        // Create program
        this.program = this.createProgram(vertexShader, fragmentShader);
        
        // Get uniform locations
        this.uniforms = {
            time: this.gl.getUniformLocation(this.program, 'u_time'),
            resolution: this.gl.getUniformLocation(this.program, 'u_resolution'),
            mouse: this.gl.getUniformLocation(this.program, 'u_mouse')
        };
        
        // Get attribute locations
        this.attributes = {
            position: this.gl.getAttribLocation(this.program, 'a_position')
        };
    }

    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }

    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Program linking error:', this.gl.getProgramInfoLog(program));
            this.gl.deleteProgram(program);
            return null;
        }
        
        return program;
    }

    createGeometry() {
        // Create a full-screen quad
        const vertices = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1
        ]);

        this.vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    }

    animate() {
        const currentTime = Date.now() - this.startTime;
        
        // Smooth mouse movement
        this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
        this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;
        
        // Clear canvas
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
        // Use shader program
        this.gl.useProgram(this.program);
        
        // Set uniforms
        this.gl.uniform1f(this.uniforms.time, currentTime);
        this.gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        this.gl.uniform2f(this.uniforms.mouse, this.mouseX, this.mouseY);
        
        // Set up vertex attributes
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.enableVertexAttribArray(this.attributes.position);
        this.gl.vertexAttribPointer(this.attributes.position, 2, this.gl.FLOAT, false, 0, 0);
        
        // Enable blending for transparency
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        
        // Draw
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        
        // Continue animation
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    fallbackBackground() {
        // CSS fallback for browsers without WebGL support
        this.canvas.style.background = `
            linear-gradient(135deg, 
                rgba(102, 126, 234, 0.3) 0%, 
                rgba(118, 75, 162, 0.3) 100%
            )
        `;
        
        // Add some CSS animation as fallback
        this.canvas.style.animation = 'backgroundShift 10s ease-in-out infinite alternate';
        
        // Add keyframes if not already present
        if (!document.querySelector('#liquid-glass-fallback-styles')) {
            const style = document.createElement('style');
            style.id = 'liquid-glass-fallback-styles';
            style.textContent = `
                @keyframes backgroundShift {
                    0% { 
                        background: linear-gradient(135deg, 
                            rgba(102, 126, 234, 0.3) 0%, 
                            rgba(118, 75, 162, 0.3) 100%
                        );
                    }
                    100% { 
                        background: linear-gradient(135deg, 
                            rgba(118, 75, 162, 0.3) 0%, 
                            rgba(102, 126, 234, 0.3) 100%
                        );
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.gl) {
            this.gl.deleteProgram(this.program);
            this.gl.deleteBuffer(this.vertexBuffer);
        }
    }
}

// Initialize the effect when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('liquidGlassCanvas');
    if (canvas) {
        window.liquidGlassEffect = new LiquidGlassEffect(canvas);
    }
});

// Handle page visibility changes to pause/resume animation
document.addEventListener('visibilitychange', () => {
    if (window.liquidGlassEffect) {
        if (document.hidden) {
            window.liquidGlassEffect.destroy();
        } else {
            // Reinitialize when page becomes visible again
            const canvas = document.getElementById('liquidGlassCanvas');
            if (canvas) {
                window.liquidGlassEffect = new LiquidGlassEffect(canvas);
            }
        }
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LiquidGlassEffect;
} 