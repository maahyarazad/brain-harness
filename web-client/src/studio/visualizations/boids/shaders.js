// Boids on the graphics card (specs/005-.../research.md R5). GLSL ES 1.00.
// State is a float32 texture, 64 boids per row: (x, y) is the position and (z, w) the velocity, in world
// units (the box is [0, aspect] x [0, 1], wrapping). One draw updates every boid from all the others.
// The processor path finds neighbors through a grid of cells at least as wide as the view radius and looks in
// the 3 x 3 cells around a boid. Its grid is ceil(width / cell) cells across, so the last column is narrower
// and, across the wrapping edge, a boid inside the radius can sit more than one cell away and go unseen. That is
// how the processor path behaves, so this shader accepts exactly the boids its 3 x 3 lookup accepts: the two
// paths then see the same neighbors and the same flock.

export const ROW = 64;
export const MAX_BOIDS = 2048;

/** The next positions and velocities: the rules of flockStep() in kernel.js. */
export const STEP = `
uniform sampler2D uState;
uniform vec2 uTexel;       // 1 / texture size
uniform float uCount;
uniform float uAspect;
uniform vec3 uGrid;        // cell size, columns, rows of the processor path's neighbor grid
uniform float uSeparation;
uniform float uAlignment;
uniform float uCohesion;
uniform float uRadius2;
uniform float uMaxSpeed;
uniform vec3 uAttractor;   // x, y, strength
uniform float uAttract;    // 1 when there is an attractor
varying vec2 vUv;

/** The cell a position is in, as the processor path buckets it. */
vec2 cellOf(vec2 p) {
  return vec2(min(uGrid.y - 1.0, floor(p.x / uGrid.x)), min(uGrid.z - 1.0, floor(p.y / uGrid.x)));
}

vec2 uvOf(float j) {
  return (vec2(mod(j, ${ROW}.0), floor(j / ${ROW}.0)) + 0.5) * uTexel;
}

void main() {
  vec2 fc = floor(gl_FragCoord.xy);
  float i = fc.y * ${ROW}.0 + fc.x;
  vec4 me = texture2D(uState, vUv);
  if (i >= uCount) { gl_FragColor = me; return; }
  vec2 p = me.xy;
  vec2 v = me.zw;
  float sepR2 = uRadius2 * 0.25;
  vec2 myCell = cellOf(p);
  vec2 align = vec2(0.0);
  vec2 center = vec2(0.0);
  vec2 sep = vec2(0.0);
  float n = 0.0;
  for (int jj = 0; jj < ${MAX_BOIDS}; jj++) {
    float j = float(jj);
    if (j >= uCount) break;
    if (j == i) continue;
    vec4 o = texture2D(uState, uvOf(j));
    vec2 apart = mod(cellOf(o.xy) - myCell + vec2(uGrid.y, uGrid.z), vec2(uGrid.y, uGrid.z)); // cells away, wrapping
    if (!((apart.x < 1.5 || apart.x > uGrid.y - 1.5) && (apart.y < 1.5 || apart.y > uGrid.z - 1.5))) continue;
    vec2 d = o.xy - p;
    if (d.x > uAspect * 0.5) d.x -= uAspect; else if (d.x < -uAspect * 0.5) d.x += uAspect;
    if (d.y > 0.5) d.y -= 1.0; else if (d.y < -0.5) d.y += 1.0;
    float d2 = dot(d, d);
    if (d2 > uRadius2) continue;
    n += 1.0;
    align += o.zw;
    center += d;
    if (d2 < sepR2 && d2 > 0.0) sep -= d / d2;
  }
  if (n > 0.0) {
    v += (align / n - v) * 0.05 * uAlignment;
    v += (center / n) * 0.002 * uCohesion;
    v += sep * 0.0000015 * uSeparation;
  }
  if (uAttract > 0.5) {
    vec2 d = uAttractor.xy - p;
    float dist = sqrt(dot(d, d)) + 0.05;
    v += (d / dist) * 0.0002 * uAttractor.z;
  }
  float sp = sqrt(dot(v, v));
  float lo = uMaxSpeed * 0.3;
  if (sp > uMaxSpeed) v = v / sp * uMaxSpeed;
  else if (sp < lo && sp > 0.0) v = v / sp * lo;
  vec2 world = vec2(uAspect, 1.0);
  gl_FragColor = vec4(mod(p + v + world, world), v);
}`;

/** One triangle per boid, pointing along its velocity, colored by heading. */
export const BOID_VERTEX = `
attribute float aCorner; // 0 = tip, 1 and 2 = the back corners
attribute float aIndex;  // which boid
uniform sampler2D uState;
uniform sampler2D uPalette;
uniform vec2 uTexel;
uniform vec2 uCanvas;    // pixels
uniform vec3 uBox;       // left, top, scale (the box height) in pixels
uniform float uSize;
varying vec3 vColor;

void main() {
  vec2 uv = (vec2(mod(aIndex, ${ROW}.0), floor(aIndex / ${ROW}.0)) + 0.5) * uTexel;
  vec4 s = texture2D(uState, uv);
  float a = atan(s.w, s.z);
  float angle = aCorner < 0.5 ? a : (aCorner < 1.5 ? a + 2.5 : a - 2.5);
  float radius = aCorner < 0.5 ? uSize * 1.6 : uSize;
  vec2 px = vec2(uBox.x + s.x * uBox.z, uBox.y + s.y * uBox.z) + vec2(cos(angle), sin(angle)) * radius;
  gl_Position = vec4(px.x / uCanvas.x * 2.0 - 1.0, 1.0 - px.y / uCanvas.y * 2.0, 0.0, 1.0);
  float t = clamp((a + 3.14159265358979) / 6.28318530717959, 0.0, 1.0);
  float k = floor(t * 255.0 + 0.5);
  vColor = texture2D(uPalette, vec2((k + 0.5) / 256.0, 0.5)).rgb;
}`;

export const BOID_FRAGMENT = `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;

/** Paints the whole canvas one color: the studio background, behind a picture that does not fill the canvas. */
export const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;
