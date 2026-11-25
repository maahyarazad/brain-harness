// Thick line segments and discs, drawn as instanced quads (specs/005-.../research.md R5, task T066).
//
// WebGL lines are always one pixel wide, so a thick line is a quad. Each quad is made a little bigger than the
// shape and the fragment shader works out, from the distance to the shape's center line or center point, how
// much of each pixel the shape covers. That gives the same smooth edges the 2D canvas draws, round or square or
// flat ends, and a color with its own alpha.
//
// All positions and sizes are in canvas pixels with the origin at the top left and y down, as the 2D canvas
// code in the modules uses them. GLSL ES 1.00, so it works on WebGL 2 and WebGL 1 (WebGL 1 through
// ANGLE_instanced_arrays, which the toolkit's draw() already handles).

/**
 * The vertex shader of a segment. By default the two ends come from one vec4 attribute in pixels. A module with
 * its own source of ends (the Lorenz attractor projects 3-D points) passes `attributes` (declarations),
 * `declarations` (uniforms and helpers) and `endpoints` (GLSL that sets `vec2 a` and `vec2 b`, in pixels).
 */
export const segmentVertex = (
  colored,
  { attributes = "attribute vec4 aSegment;   // x0, y0, x1, y1 in pixels", declarations = "", endpoints = "vec2 a = aSegment.xy;\n  vec2 b = aSegment.zw;" } = {}
) => `
attribute float aCorner;   // 0..5: two triangles of a quad
${attributes}
${declarations}
${colored ? "attribute vec4 aColor;     // one color per segment (rgba, 0..1)\nvarying vec4 vColor;" : ""}
uniform vec2 uCanvas;
uniform float uHalf;       // half the line width
uniform float uCap;        // 0 flat, 1 square, 2 round
varying vec2 vLocal;       // pixels along the segment from its start, and across it
varying float vLength;
void main() {
  ${endpoints}
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 0.0 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float pad = uHalf + 1.0;          // room for the cap and for the soft edge
  // corner 0..5 -> (u, v) in {0,1}: 0 1 2 / 3 4 5 are the two triangles of the quad
  float c = aCorner;
  float u = (c == 1.0 || c == 4.0 || c == 5.0) ? 1.0 : 0.0;
  float v = (c == 2.0 || c == 3.0 || c == 5.0) ? 1.0 : 0.0;
  float along = mix(-pad, len + pad, u);
  float across = mix(-pad, pad, v);
  vec2 px = a + dir * along + nrm * across;
  vLocal = vec2(along, across);
  vLength = len;
  ${colored ? "vColor = aColor;" : ""}
  gl_Position = vec4(px.x / uCanvas.x * 2.0 - 1.0, 1.0 - px.y / uCanvas.y * 2.0, 0.0, 1.0);
}`;

/** The fragment shader of a segment: the same for every source of ends. */
export const segmentFragment = (colored) => `
uniform float uHalf;
uniform float uCap;
uniform vec4 uColor;
${colored ? "varying vec4 vColor;" : ""}
varying vec2 vLocal;
varying float vLength;
void main() {
  float x = vLocal.x;
  float y = abs(vLocal.y);
  float dist; // signed distance to the shape's edge, negative inside
  if (uCap > 1.5) {
    float ax = x < 0.0 ? -x : (x > vLength ? x - vLength : 0.0);
    dist = sqrt(ax * ax + y * y) - uHalf;                     // round ends
  } else if (uCap > 0.5) {
    dist = max(max(-x, x - vLength) - uHalf, y - uHalf);      // square ends, a half-width past each end
  } else {
    dist = max(max(-x, x - vLength), y - uHalf);              // flat ends
  }
  // Coverage of a pixel by a line 2 * uHalf wide: it rises across one pixel at the edge and, for a line thinner than
  // a pixel, tops out at the line's width, as a canvas does (0.5 wide covers at most half a pixel).
  float coverage = clamp(0.5 - dist, 0.0, min(1.0, 2.0 * uHalf));
  if (coverage <= 0.0) discard;
  vec4 base = ${colored ? "vColor * uColor" : "uColor"};
  gl_FragColor = vec4(base.rgb, base.a * coverage);
}`;

const DISC_VERTEX = `
attribute float aCorner;
attribute vec3 aDisc;      // x, y, radius in pixels
uniform vec2 uCanvas;
uniform float uHalf;       // half the line width of a ring (0 for a disc)
varying vec2 vOffset;
varying float vRadius;
void main() {
  float c = aCorner;
  float u = (c == 1.0 || c == 4.0 || c == 5.0) ? 1.0 : 0.0;
  float v = (c == 2.0 || c == 3.0 || c == 5.0) ? 1.0 : 0.0;
  float pad = aDisc.z + uHalf + 1.0;
  vec2 offset = vec2(mix(-pad, pad, u), mix(-pad, pad, v));
  vec2 px = aDisc.xy + offset;
  vOffset = offset;
  vRadius = aDisc.z;
  gl_Position = vec4(px.x / uCanvas.x * 2.0 - 1.0, 1.0 - px.y / uCanvas.y * 2.0, 0.0, 1.0);
}`;

const DISC_FRAGMENT = `
uniform vec4 uColor;
varying vec2 vOffset;
varying float vRadius;
void main() {
  float coverage = clamp(0.5 - (length(vOffset) - vRadius), 0.0, 1.0);
  if (coverage <= 0.0) discard;
  gl_FragColor = vec4(uColor.rgb, uColor.a * coverage);
}`;

// The six corners of a quad's two triangles; the vertex shaders turn each number into a corner of the quad.
const RING_FRAGMENT = `
uniform vec4 uColor;
uniform float uHalf;
varying vec2 vOffset;
varying float vRadius;
void main() {
  float coverage = clamp(0.5 - (abs(length(vOffset) - vRadius) - uHalf), 0.0, min(1.0, 2.0 * uHalf));
  if (coverage <= 0.0) discard;
  gl_FragColor = vec4(uColor.rgb, uColor.a * coverage);
}`;

const CORNERS = new Float32Array([0, 1, 2, 3, 4, 5]);

/**
 * Builders bound to one Gpu from openGpu().
 *
 *   const shapes = createShapes(gpu);
 *   shapes.segments(buffer, { count, width, color: [r, g, b, a], cap: "round" | "square" | "flat", canvas: [w, h], target?, blend?, colors? })
 *     `colors` is an optional buffer of 4 floats (r, g, b, a) per segment; `color` then multiplies it (use it for an overall opacity).
 *   shapes.discs(buffer, { count, color, canvas, target?, blend? })
 *   shapes.rings(buffer, { count, width, color, canvas, target?, blend? })
 *
 * `buffer` is a gpu.buffer(Float32Array): 4 floats per segment (x0, y0, x1, y1) or 3 per disc (x, y, radius).
 * Colors are 0..1. Blending defaults to "alpha". Several buffers with different colors are several calls.
 */
export function createShapes(gpu) {
  const corners = gpu.buffer(CORNERS);
  const programs = {
    segments: gpu.program("shapes:segments", segmentFragment(false), { vertex: segmentVertex(false), attributes: ["aCorner", "aSegment"] }),
    coloredSegments: gpu.program("shapes:segments-colored", segmentFragment(true), { vertex: segmentVertex(true), attributes: ["aCorner", "aSegment", "aColor"] }),
    discs: gpu.program("shapes:discs", DISC_FRAGMENT, { vertex: DISC_VERTEX, attributes: ["aCorner", "aDisc"] }),
    rings: gpu.program("shapes:rings", RING_FRAGMENT, { vertex: DISC_VERTEX, attributes: ["aCorner", "aDisc"] }),
  };
  const CAPS = { flat: 0, square: 1, round: 2 };

  function run(program, buffer, size, uniforms, { count, color = [1, 1, 1, 1], canvas, target = null, blend = "alpha", viewport, colors = null }) {
    if (!count) return;
    const attributes = [
      { buffer: corners, size: 1, divisor: 0 },
      { buffer, size, divisor: 1 },
    ];
    if (colors) attributes.push({ buffer: colors, size: 4, divisor: 1 });
    gpu.draw(program, { ...uniforms, uColor: color, uCanvas: canvas }, target, {
      blend,
      viewport,
      instanced: {
        vertexCount: 6,
        instanceCount: count,
        attributes,
      },
    });
  }

  return {
    segments(buffer, options) {
      run(options.colors ? programs.coloredSegments : programs.segments, buffer, 4, { uHalf: options.width / 2, uCap: CAPS[options.cap ?? "round"] }, options);
    },
    discs(buffer, options) {
      run(programs.discs, buffer, 3, {}, options);
    },
    /** Circle outlines: 3 floats per ring (x, y, radius), drawn `width` pixels thick. */
    rings(buffer, options) {
      run(programs.rings, buffer, 3, { uHalf: options.width / 2 }, options);
    },
  };
}
