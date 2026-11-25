// The Lorenz attractor on the graphics card (specs/005-.../research.md R5). The trail is a ring of 3-D points in a
// vertex buffer; the vertex shader rotates each point (yaw around z, then pitch around x) and projects it, exactly
// as project() in kernel.js does, so turning the view costs no work on the processor. The shared segment shader
// (shapes.js) then draws each piece of the trail as a thick line.
import { segmentVertex, segmentFragment } from "../_shared/gpu/shapes.js";

export const TRAIL_VERTEX = segmentVertex(false, {
  attributes: "attribute vec3 aP0;   // a point of the trail\nattribute vec3 aP1;   // the next one",
  declarations: `
uniform vec2 uView;    // yaw, pitch
uniform vec3 uFrame;   // the center of the picture in pixels, and the scale
vec2 projectPoint(vec3 p) {
  float zc = p.z - 25.0;
  float cy = cos(uView.x);
  float sy = sin(uView.x);
  float cp = cos(uView.y);
  float sp = sin(uView.y);
  float x1 = p.x * cy - p.y * sy;
  float y1 = p.x * sy + p.y * cy;
  float z2 = y1 * sp + zc * cp;
  return uFrame.xy + vec2(x1, -z2) * uFrame.z;
}`,
  endpoints: "vec2 a = projectPoint(aP0);\n  vec2 b = projectPoint(aP1);",
});

export const TRAIL_FRAGMENT = segmentFragment(false);

export const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;
