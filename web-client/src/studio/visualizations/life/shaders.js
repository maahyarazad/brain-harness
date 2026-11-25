// Game of Life on the graphics card (specs/005-.../research.md R5): GLSL ES 1.00, so it compiles on
// WebGL 2 and WebGL 1. State is an 8-bit RGBA texture: the red channel is 255 for a live cell, 0 for a
// dead one. The step is exact: a neighbor count is a sum of at most eight 0/1 floats, and the rule is
// looked up in a 9 x 1 texture by that integer, so the result matches lifeStep() in kernel.js bit for bit.

/** One generation. uRule has the birth flag in red and the survive flag in green at texel n (n = live neighbors, 0..8). */
export const STEP = `
uniform sampler2D uState;
uniform sampler2D uRule;
uniform vec2 uTexel;
uniform float uWrap;
varying vec2 vUv;

float cell(vec2 offset) {
  vec2 uv = vUv + offset * uTexel;
  if (uWrap > 0.5) {
    uv = fract(uv);
  } else if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0; // off the edge: dead
  }
  return step(0.5, texture2D(uState, uv).r);
}

void main() {
  float n = cell(vec2(-1.0, -1.0)) + cell(vec2(0.0, -1.0)) + cell(vec2(1.0, -1.0))
          + cell(vec2(-1.0, 0.0)) + cell(vec2(1.0, 0.0))
          + cell(vec2(-1.0, 1.0)) + cell(vec2(0.0, 1.0)) + cell(vec2(1.0, 1.0));
  float alive = step(0.5, texture2D(uState, vUv).r);
  vec2 rule = texture2D(uRule, vec2((n + 0.5) / 9.0, 0.5)).rg;
  gl_FragColor = vec4(alive > 0.5 ? rule.g : rule.r, 0.0, 0.0, 1.0);
}`;

/**
 * The grid on the canvas, with the colors the processor path uses (a live cell is palette entry 200, a dead
 * one is the background plus a little). Row 0 of a cell grid is its top row, so the texture is flipped.
 */
export const DISPLAY = `
uniform sampler2D uState;
uniform vec3 uAlive;
uniform vec3 uDead;
varying vec2 vUv;
void main() {
  float alive = step(0.5, texture2D(uState, vec2(vUv.x, 1.0 - vUv.y)).r);
  gl_FragColor = vec4(mix(uDead, uAlive, alive), 1.0);
}`;

export const CLEAR = `
varying vec2 vUv;
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`;

/** Paints the whole canvas one color: the studio background, behind a picture that does not fill the canvas. */
export const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;
