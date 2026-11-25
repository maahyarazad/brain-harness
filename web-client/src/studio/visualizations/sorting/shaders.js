// Sorting algorithms on the graphics card (specs/005-.../research.md R5). GLSL ES 1.00.
// The sort itself is a chain of comparisons that each depend on the last, so it stays on the processor (the
// generators in kernel.js). The graphics card draws every bar or dot in one pass from two n x 1 textures:
// the values (16 bits in red and green) and one color per bar (the highlight already folded in).

export const DISPLAY = `
uniform sampler2D uValues;
uniform sampler2D uColors;
uniform vec2 uSize;     // the canvas in pixels
uniform float uN;       // number of bars
uniform float uMax;     // the largest value
uniform float uBarW;    // drawn width of a bar, in pixels
uniform float uDots;    // 1 = dots, 0 = bars
uniform float uRadius;  // dot radius, in pixels
uniform vec3 uBg;
varying vec2 vUv;

float valueAt(float j) {
  vec4 t = texture2D(uValues, vec2((j + 0.5) / uN, 0.5));
  return floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5);
}
vec3 colorAt(float j) { return texture2D(uColors, vec2((j + 0.5) / uN, 0.5)).rgb; }

void main() {
  vec2 p = vec2(vUv.x * uSize.x, (1.0 - vUv.y) * uSize.y); // pixels from the top left, y down
  float bw = uSize.x / uN;
  float i = floor(p.x / bw);
  vec3 color = uBg;
  if (uDots < 0.5) {
    if (i >= 0.0 && i < uN && p.x - i * bw < uBarW) {
      float height = valueAt(i) / uMax * uSize.y * 0.92;
      if (uSize.y - p.y <= height) color = colorAt(i);
    }
  } else {
    // A dot can reach into the neighboring columns when the bars are thinner than the dot.
    for (int k = -2; k <= 2; k++) {
      float j = i + float(k);
      if (j >= 0.0 && j < uN) {
        float height = valueAt(j) / uMax * uSize.y * 0.92;
        vec2 center = vec2(j * bw + bw * 0.5, uSize.y - height);
        if (distance(p, center) <= uRadius) color = colorAt(j); // later bars are drawn over earlier ones
      }
    }
  }
  gl_FragColor = vec4(color, 1.0);
}`;
