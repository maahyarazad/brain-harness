// Maze generation and pathfinding on the graphics card (specs/005-.../research.md R5). GLSL ES 1.00.
// The generators and solvers are sequential (each step picks from what the last one left), so they stay on the
// processor as the oracle. The graphics card draws: the cells in one pass from a small grid texture, and the walls,
// the path and the two markers with the shared shape builders (shapes.js).

/**
 * The cells of the box. uCells is cols x rows: red = 255 for a cell the generator has not reached yet, green = 255
 * for a cell the solver has visited. Row 0 of the grid is the top row.
 */
export const CELLS = `
uniform sampler2D uCells;
uniform vec3 uBase;       // the empty box
uniform vec3 uUncarved;   // a cell not yet reached while generating
uniform vec4 uVisited;    // the solver's visited color and its opacity over the box
varying vec2 vUv;
void main() {
  vec4 s = texture2D(uCells, vec2(vUv.x, 1.0 - vUv.y));
  vec3 color = uBase;
  if (s.r > 0.5) color = uUncarved;
  else if (s.g > 0.5) color = mix(uBase, uVisited.rgb, uVisited.a);
  gl_FragColor = vec4(color, 1.0);
}`;

export const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;
