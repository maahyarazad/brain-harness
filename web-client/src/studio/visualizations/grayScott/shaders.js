// Gray–Scott reaction–diffusion on the graphics card (specs/005-.../research.md R5). GLSL ES 1.00.
// State is a W x H float32 texture: red = U, green = V. One draw is one Euler step of the kernel in
// kernel.js (9-point Laplacian on a wrapping grid, results clamped to 0..1), and the module makes 8 of them
// per step, exactly as the processor path does.

export const STEP = `
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uFeed;
uniform float uKill;
uniform float uDu;
uniform float uDv;
varying vec2 vUv;

vec2 at(float dx, float dy) {
  return texture2D(uState, fract(vUv + vec2(dx, dy) * uTexel)).rg; // fract wraps the edges
}

void main() {
  vec2 c = texture2D(uState, vUv).rg;
  vec2 lap = 0.2 * (at(0.0, -1.0) + at(0.0, 1.0) + at(-1.0, 0.0) + at(1.0, 0.0))
           + 0.05 * (at(-1.0, -1.0) + at(1.0, -1.0) + at(-1.0, 1.0) + at(1.0, 1.0))
           - c;
  float uvv = c.r * c.g * c.g;
  float nu = c.r + uDu * lap.r - uvv + uFeed * (1.0 - c.r);
  float nv = c.g + uDv * lap.g + uvv - (uKill + uFeed) * c.g;
  gl_FragColor = vec4(clamp(nu, 0.0, 1.0), clamp(nv, 0.0, 1.0), 0.0, 1.0);
}`;

/** V through the palette, as paintImage() does: index = round(clamp((v - 0.02) * 3, 0, 1) * 255). */
export const DISPLAY = `
uniform sampler2D uState;
uniform sampler2D uPalette;
varying vec2 vUv;
void main() {
  float v = texture2D(uState, vec2(vUv.x, 1.0 - vUv.y)).g; // row 0 of the grid is the top row
  float t = clamp((v - 0.02) * 3.0, 0.0, 1.0);
  float k = floor(t * 255.0 + 0.5);
  gl_FragColor = vec4(texture2D(uPalette, vec2((k + 0.5) / 256.0, 0.5)).rgb, 1.0);
}`;

/** Paints the whole canvas one color: the studio background, behind a picture that does not fill the canvas. */
export const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;
