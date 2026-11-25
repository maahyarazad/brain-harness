// Recamán's sequence on the graphics card (specs/005-.../research.md R5). GLSL ES 1.00.
// The sequence itself is sequential (each term depends on the earlier ones; at most 2,000 of them), so the kernel
// computes it on the processor. Each jump is an arc, a half circle or half ellipse stroked with its own color. Up
// to 2,000 canvas strokes a frame become one instanced draw: each arc is one quad over its half of the ellipse, and
// the fragment shader draws the outline from the distance to the ellipse, cut off along the axis like the end of a
// canvas stroke.

export const ARC_VERTEX = `
attribute float aCorner;
attribute vec4 aArc;     // center x, center y, radius x, radius y (pixels)
attribute float aSide;   // +1 for the half above the axis, -1 for the half below
attribute vec4 aColor;
uniform vec2 uCanvas;
uniform float uHalf;     // half the line width
varying vec2 vP;         // pixel position relative to the center
varying vec2 vRadius;
varying float vSide;
varying vec4 vColor;
void main() {
  float c = aCorner;
  float u = (c == 1.0 || c == 4.0 || c == 5.0) ? 1.0 : 0.0;
  float v = (c == 2.0 || c == 3.0 || c == 5.0) ? 1.0 : 0.0;
  float pad = uHalf + 1.0;
  float x = mix(aArc.x - aArc.z - pad, aArc.x + aArc.z + pad, u);
  float top = aSide > 0.0 ? aArc.y - aArc.w - pad : aArc.y - pad;
  float bottom = aSide > 0.0 ? aArc.y + pad : aArc.y + aArc.w + pad;
  float y = mix(top, bottom, v);
  vP = vec2(x - aArc.x, y - aArc.y);
  vRadius = aArc.zw;
  vSide = aSide;
  vColor = aColor;
  gl_Position = vec4(x / uCanvas.x * 2.0 - 1.0, 1.0 - y / uCanvas.y * 2.0, 0.0, 1.0);
}`;

export const ARC_FRAGMENT = `
uniform float uHalf;
varying vec2 vP;
varying vec2 vRadius;
varying float vSide;
varying vec4 vColor;
void main() {
  vec2 q = vP / vRadius;
  float L = max(length(q), 0.000001);
  // Distance to the ellipse, to first order: how far L is from 1, divided by how fast L changes per pixel.
  float slope = length(q / (vRadius * L));
  float dist = (L - 1.0) / max(slope, 0.000001);
  float coverage = clamp(0.5 - (abs(dist) - uHalf), 0.0, min(1.0, 2.0 * uHalf)); // a line thinner than a pixel covers only its width
  coverage *= clamp(0.5 - vSide * vP.y, 0.0, 1.0); // only the half on this side of the axis
  if (coverage <= 0.0) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * coverage);
}`;

export const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;
