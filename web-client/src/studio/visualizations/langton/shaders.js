// Langton's ant on the graphics card (specs/005-.../research.md R5). GLSL ES 1.00.
// The ant's step is sequential (each step reads what the last one wrote), so it stays on the processor
// (antStep). The graphics card does the drawing: the grid is an N x N texture whose red channel is the cell's
// state (0 to 11), and a 12 x 1 texture turns a state into its color.

export const DISPLAY = `
uniform sampler2D uGrid;
uniform sampler2D uColors;
uniform float uSize;
uniform vec2 uAnt0;
uniform vec2 uAnt1;
uniform vec2 uAnt2;
uniform vec2 uAnt3;
uniform vec2 uAnt4;
uniform vec2 uAnt5;
uniform vec2 uAnt6;
uniform vec2 uAnt7;
varying vec2 vUv;

bool at(vec2 cell, vec2 ant) { return cell.x == ant.x && cell.y == ant.y; }

void main() {
  vec2 top = vec2(vUv.x, 1.0 - vUv.y); // row 0 of the grid is the top row
  vec2 cell = floor(top * uSize);
  float state = floor(texture2D(uGrid, top).r * 255.0 + 0.5);
  vec3 color = texture2D(uColors, vec2((state + 0.5) / 12.0, 0.5)).rgb;
  if (at(cell, uAnt0) || at(cell, uAnt1) || at(cell, uAnt2) || at(cell, uAnt3)
      || at(cell, uAnt4) || at(cell, uAnt5) || at(cell, uAnt6) || at(cell, uAnt7)) {
    color = vec3(255.0, 60.0, 60.0) / 255.0; // an ant, as in the processor path
  }
  gl_FragColor = vec4(color, 1.0);
}`;

/** Paints the whole canvas one color: the studio background, behind a picture that does not fill the canvas. */
export const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;
