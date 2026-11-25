// Elementary cellular automaton on the graphics card (specs/005-.../research.md R5). GLSL ES 1.00.
// A row is a W x 1 texture (red = 255 for a live cell). Each step renders the next row from the previous
// one with the rule's 8 answers in an 8 x 1 table texture, then copies it into the history texture, a ring
// of H rows. Every value is 0 or 1 and the table index is a small integer, so the result is exact.

/** The next row. uTable texel i holds the answer for the pattern (left << 2 | center << 1 | right) = i. */
export const NEXT_ROW = `
uniform sampler2D uPrev;
uniform sampler2D uTable;
uniform float uTexel;
varying vec2 vUv;

float live(float u) {
  return step(0.5, texture2D(uPrev, vec2(fract(u), 0.5)).r); // fract wraps the edges, as the kernel's wrap = true
}

void main() {
  float l = live(vUv.x - uTexel + 1.0);
  float c = live(vUv.x);
  float r = live(vUv.x + uTexel);
  float index = l * 4.0 + c * 2.0 + r;
  float answer = texture2D(uTable, vec2((index + 0.5) / 8.0, 0.5)).r;
  gl_FragColor = vec4(answer, 0.0, 0.0, 1.0);
}`;

/** Copies the one row into a row of the history (the draw's viewport picks which). */
export const COPY_ROW = `
uniform sampler2D uSrc;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uSrc, vec2(vUv.x, 0.5)); }`;

/**
 * The grid on the canvas. Screen row y (0 = top) shows ring row (filled - H + y) mod H once the screen is
 * full, and ring row y before that. uColors holds one color per screen row, worked out on the processor with
 * the same expression the processor path uses, so rounding cannot differ.
 */
export const DISPLAY = `
uniform sampler2D uHist;
uniform sampler2D uColors;
uniform vec3 uBg;
uniform float uFilled;
uniform float uRows;
varying vec2 vUv;
void main() {
  float y = floor((1.0 - vUv.y) * uRows);
  float ring = uFilled <= uRows ? y : mod(uFilled - uRows + y, uRows);
  float live = step(0.5, texture2D(uHist, vec2(vUv.x, (ring + 0.5) / uRows)).r);
  vec3 color = texture2D(uColors, vec2((y + 0.5) / uRows, 0.5)).rgb;
  gl_FragColor = vec4(mix(uBg, color, live), 1.0);
}`;

/** Paints the whole canvas one color: the studio background, behind a picture that does not fill the canvas. */
export const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;
