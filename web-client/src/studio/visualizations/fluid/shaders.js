// GLSL ES 1.00 sources for the fluid simulation (specs/005-.../research.md R3). The same text
// compiles on WebGL 2 and WebGL 1. The toolkit adds the precision line, and MANUAL_FILTER when the
// hardware cannot filter half-float textures.
//
// Grids: velocity is in simulation texels per second; dye is 0..~2 per channel. Every pass reads
// textures by uv and writes one texel, so a pass never reads the texture it writes.
//
// Stability (FR-011): the speed a splat or the vorticity adds is clamped, velocity is clamped after
// each pass that can raise it, dye is clamped, and the step is fixed (see kernel.js DT).

/** Per-pass limits, shared with gpu.js. */
export const LIMITS = Object.freeze({ velocity: 1000, dye: 2 });

/** The studio's canvas background (#0f0f12). */
const BG = "vec3(0.0588, 0.0588, 0.0706)";

const FILTERED = `
#ifdef MANUAL_FILTER
vec4 sampleFiltered(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 st = uv / texel - 0.5;
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec4 a = texture2D(tex, (i + vec2(0.5, 0.5)) * texel);
  vec4 b = texture2D(tex, (i + vec2(1.5, 0.5)) * texel);
  vec4 c = texture2D(tex, (i + vec2(0.5, 1.5)) * texel);
  vec4 d = texture2D(tex, (i + vec2(1.5, 1.5)) * texel);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
#else
vec4 sampleFiltered(sampler2D tex, vec2 uv, vec2 texel) { return texture2D(tex, uv); }
#endif
`;

/** Adds a Gaussian splash at uPoint to uTarget (velocity: a push; dye: ink). */
export const SPLAT = `
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uLimit;
varying vec2 vUv;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 added = exp(-dot(p, p) / uRadius) * uColor;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(clamp(base + added, -uLimit, uLimit), 1.0);
}`;

/** Spin of the velocity field, for the vorticity pass. */
export const CURL = `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float left = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float right = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float up = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  float down = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4(0.5 * (right - left - up + down), 0.0, 0.0, 1.0);
}`;

/** Vorticity confinement: pushes along the gradient of the spin so small swirls are not smoothed away. */
export const VORTICITY = `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uStrength;
uniform float uDt;
uniform float uLimit;
varying vec2 vUv;
void main() {
  float left = texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float up = texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float down = texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float here = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(up) - abs(down), abs(right) - abs(left));
  force /= length(force) + 0.0001;
  force *= uStrength * here;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy + force * uDt;
  gl_FragColor = vec4(clamp(velocity, -uLimit, uLimit), 0.0, 1.0);
}`;

/** How much the flow squeezes together or pulls apart at each cell. The walls reflect the flow. */
export const DIVERGENCE = `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 here = texture2D(uVelocity, vUv).xy;
  vec2 lc = vUv - vec2(uTexel.x, 0.0);
  vec2 rc = vUv + vec2(uTexel.x, 0.0);
  vec2 uc = vUv + vec2(0.0, uTexel.y);
  vec2 dc = vUv - vec2(0.0, uTexel.y);
  float left = texture2D(uVelocity, lc).x;
  float right = texture2D(uVelocity, rc).x;
  float up = texture2D(uVelocity, uc).y;
  float down = texture2D(uVelocity, dc).y;
  if (lc.x < 0.0) left = -here.x;
  if (rc.x > 1.0) right = -here.x;
  if (uc.y > 1.0) up = -here.y;
  if (dc.y < 0.0) down = -here.y;
  gl_FragColor = vec4(0.5 * (right - left + up - down), 0.0, 0.0, 1.0);
}`;

/** Multiplies a texture by a constant: keeps part of last step's pressure as the starting guess. */
export const SCALE = `
uniform sampler2D uTexture;
uniform float uValue;
varying vec2 vUv;
void main() { gl_FragColor = uValue * texture2D(uTexture, vUv); }`;

/** One Jacobi pass of the pressure solve. The edge texels see their own value (no flow through walls). */
export const JACOBI = `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float left = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float up = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float down = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float div = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((left + right + up + down - div) * 0.25, 0.0, 0.0, 1.0);
}`;

/** Subtracts the pressure gradient, which makes the flow incompressible: it cannot pile up or leave gaps. */
export const GRADIENT = `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uLimit;
varying vec2 vUv;
void main() {
  float left = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float up = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float down = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(right - left, up - down);
  gl_FragColor = vec4(clamp(velocity, -uLimit, uLimit), 0.0, 1.0);
}`;

/**
 * Carries a field along the flow (semi-Lagrangian: look where the fluid here came from), then lets
 * it fade: the result is divided by uDivisor = 1 + rate × dt. That is velocity dissipation for the
 * velocity field and density dissipation for the dye.
 */
export const ADVECT = `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uSourceTexel;
uniform float uDt;
uniform float uDivisor;
uniform float uLimit;
varying vec2 vUv;
${FILTERED}
void main() {
  vec2 back = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
  vec4 carried = sampleFiltered(uSource, back, uSourceTexel);
  gl_FragColor = clamp(carried / uDivisor, -uLimit, uLimit);
}`;

/** Draws the ink on the studio's dark background. Strong ink rolls off to a clean color instead of flashing white. */
export const DISPLAY = `
uniform sampler2D uDye;
varying vec2 vUv;
void main() {
  vec3 ink = 1.0 - exp(-2.0 * max(texture2D(uDye, vUv).rgb, 0.0));
  float cover = max(ink.r, max(ink.g, ink.b));
  gl_FragColor = vec4(${BG} * (1.0 - cover) + ink, 1.0);
}`;

export const CLEAR = `
varying vec2 vUv;
void main() { gl_FragColor = vec4(0.0); }`;

/** What each program's uniforms are called, for the shader test and for readers. */
export const UNIFORMS = Object.freeze({
  splat: ["uTarget", "uAspect", "uColor", "uPoint", "uRadius", "uLimit"],
  curl: ["uVelocity", "uTexel"],
  vorticity: ["uVelocity", "uCurl", "uTexel", "uStrength", "uDt", "uLimit"],
  divergence: ["uVelocity", "uTexel"],
  scale: ["uTexture", "uValue"],
  jacobi: ["uPressure", "uDivergence", "uTexel"],
  gradient: ["uPressure", "uVelocity", "uTexel", "uLimit"],
  advect: ["uVelocity", "uSource", "uTexel", "uSourceTexel", "uDt", "uDivisor", "uLimit"],
  display: ["uDye"],
});

export const SOURCES = Object.freeze({
  splat: SPLAT,
  curl: CURL,
  vorticity: VORTICITY,
  divergence: DIVERGENCE,
  scale: SCALE,
  jacobi: JACOBI,
  gradient: GRADIENT,
  advect: ADVECT,
  display: DISPLAY,
  clear: CLEAR,
});
