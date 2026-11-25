// The double pendulum on the graphics card. The integrator (pendulumRK4) stays on the processor: it is one chaotic
// trajectory and each step needs the last, so it is also the oracle and gives the identical state to the processor
// path. What moves to the graphics card is the drawing: a trail of up to 5,000 segments, each with its own color
// and fade, was 5,000 separate canvas strokes a frame; it is now one instanced draw (shapes.js).
import { pendulumRK4 } from "./kernel.js";
import { createShapes } from "../_shared/gpu/shapes.js";
import { BG_RGB } from "../_shared/instance.js";

const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;

const ROD = [0xd8 / 255, 0xd8 / 255, 0xd8 / 255, 1]; // #d8d8d8
const WHITE = [1, 1, 1, 1];

export function createPendulumGpu(canvas, gpu, config, ctx, { DT, DEG }) {
  let cfg = config;
  let state;
  let trail;
  let time;
  let drag = null;
  const shapes = createShapes(gpu);
  const fill = gpu.program("pendulum:fill", FILL);
  const trailLines = gpu.buffer(new Float32Array(4), { dynamic: true });
  const trailColors = gpu.buffer(new Float32Array(4), { dynamic: true });
  const rods = gpu.buffer(new Float32Array(8), { dynamic: true });
  const bobs = gpu.buffer(new Float32Array(3), { dynamic: true });
  const bob2 = gpu.buffer(new Float32Array(3), { dynamic: true });

  const params = () => {
    const v = cfg.values;
    return { m1: v.m1, m2: v.m2, l1: v.l1, l2: v.l2, g: v.gravity };
  };

  function init() {
    state = [cfg.values.theta1 * DEG, 0, cfg.values.theta2 * DEG, 0];
    trail = [];
    time = 0;
  }

  function geometry() {
    const { width: w, height: h } = canvas;
    const { l1, l2 } = cfg.values;
    const s = (Math.min(w, h) * 0.46) / (l1 + l2);
    const ox = w / 2, oy = h / 2;
    const x1 = ox + Math.sin(state[0]) * l1 * s, y1 = oy + Math.cos(state[0]) * l1 * s;
    const x2 = x1 + Math.sin(state[2]) * l2 * s, y2 = y1 + Math.cos(state[2]) * l2 * s;
    return { ox, oy, x1, y1, x2, y2, s };
  }

  function render() {
    if (gpu.isLost()) return;
    const { width: w, height: h } = canvas;
    const { ox, oy, x1, y1, x2, y2 } = geometry();
    const pal = cfg.values.palette;
    const lut = ctx.palette(pal);
    gpu.draw(fill, { uColor: BG_RGB.map((c) => c / 255) }, null);

    // The trail: segment i joins point i - 1 to point i, colored by its place in the trail and fading in with it.
    const n = trail.length;
    if (n > 1) {
      const lines = new Float32Array((n - 1) * 4);
      const colors = new Float32Array((n - 1) * 4);
      for (let i = 1; i < n; i++) {
        const o = (i - 1) * 4;
        lines[o] = trail[i - 1][0];
        lines[o + 1] = trail[i - 1][1];
        lines[o + 2] = trail[i][0];
        lines[o + 3] = trail[i][1];
        const t = i / n;
        const k = Math.max(0, Math.min(255, Math.round(t * 255))) * 3; // what ctx.color(pal, t, t) picks
        colors[o] = lut[k] / 255;
        colors[o + 1] = lut[k + 1] / 255;
        colors[o + 2] = lut[k + 2] / 255;
        colors[o + 3] = t;
      }
      trailLines.update(lines);
      trailColors.update(colors);
      shapes.segments(trailLines, { count: n - 1, width: Math.max(1, ctx.dpr), color: WHITE, colors: trailColors, cap: "flat", canvas: [w, h] });
    }

    // The two rods. The first bob covers the joint, so two flat-ended segments look like the processor path's one path.
    rods.update(new Float32Array([ox, oy, x1, y1, x1, y1, x2, y2]));
    shapes.segments(rods, { count: 2, width: 2 * ctx.dpr, color: ROD, cap: "flat", canvas: [w, h] });

    const r = (m) => (5 + 3 * Math.sqrt(m)) * ctx.dpr;
    bobs.update(new Float32Array([x1, y1, r(cfg.values.m1)]));
    shapes.discs(bobs, { count: 1, color: WHITE, canvas: [w, h] });
    const k2 = Math.round(0.85 * 255) * 3;
    bob2.update(new Float32Array([x2, y2, r(cfg.values.m2)]));
    shapes.discs(bob2, { count: 1, color: [lut[k2] / 255, lut[k2 + 1] / 255, lut[k2 + 2] / 255, 1], canvas: [w, h] });
    ctx.reportStats({ time: `${time.toFixed(1)} s` });
  }

  init();
  render();

  gpu.onRestored(() => {
    init(); // the buffers are empty again: start from the set angles
    render();
  });

  return {
    path: "gpu",
    update(c, changed = []) {
      cfg = c;
      if (changed.some((k) => k === "theta1" || k === "theta2")) init();
      if (changed.some((k) => k === "l1" || k === "l2")) trail = [];
      render();
    },
    step() {
      state = pendulumRK4(state, params(), DT);
      time += DT;
      const { x2, y2 } = geometry();
      trail.push([x2, y2]);
      const max = cfg.values.trail;
      if (trail.length > max) trail.splice(0, trail.length - max);
    },
    render,
    reset() {
      init();
      render();
    },
    resize() {
      trail = [];
      render();
    },
    destroy() {
      gpu.dispose();
    },
    pointer(ev) {
      const { ox, oy, x1, y1, x2, y2 } = geometry();
      if (ev.type === "down") {
        const d1 = Math.hypot(ev.x - x1, ev.y - y1), d2 = Math.hypot(ev.x - x2, ev.y - y2);
        const near = 30 * ctx.dpr;
        drag = d2 < near ? 2 : d1 < near ? 1 : null;
      } else if (ev.type === "move" && drag) {
        const angle = drag === 1 ? Math.atan2(ev.x - ox, ev.y - oy) : Math.atan2(ev.x - x1, ev.y - y1);
        if (drag === 1) state = [angle, 0, state[2], 0];
        else state = [state[0], 0, angle, 0];
        trail = [];
        time = 0;
        render();
      } else if (ev.type === "up" && drag) {
        drag = null;
        const values = {
          ...cfg.values,
          theta1: Math.round((state[0] / DEG) * 10) / 10,
          theta2: Math.round((state[2] / DEG) * 10) / 10,
        };
        cfg = { ...cfg, values };
        ctx.setValues({ theta1: values.theta1, theta2: values.theta2 });
      }
    },
    ...(import.meta.env.MODE !== "production"
      ? { __debug: { readState: () => ({ state: [...state], trail: trail.map((p) => [...p]), time, geometry: geometry() }), gpu, finish: () => gpu.finish() } }
      : {}),
  };
}
