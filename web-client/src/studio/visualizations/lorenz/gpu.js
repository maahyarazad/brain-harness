// The Lorenz attractor on the graphics card. The two RK4 integrations stay on the processor (each step needs the
// last, and it is the oracle), so the trails hold the same points as the processor path's. What moves to the
// graphics card is the drawing: the trails are 3-D point rings in vertex buffers, rotated and projected in the
// vertex shader, and drawn as one instanced call each instead of up to 20,000 canvas lineTo calls.
import { lorenzRK4 } from "./kernel.js";
import { TRAIL_VERTEX, TRAIL_FRAGMENT, FILL } from "./shaders.js";
import { BG_RGB } from "../_shared/instance.js";

export function createLorenzGpu(canvas, gpu, config, ctx, { DT, DEFAULT_VIEW }) {
  let cfg = config;
  let view = { ...(config.view ?? DEFAULT_VIEW) };
  let a, b, trailA, trailB, head, len, steps;
  let dirty = true;
  let drag = null;
  const fill = gpu.program("lorenz:fill", FILL);
  const trail = gpu.program("lorenz:trail", TRAIL_FRAGMENT, { vertex: TRAIL_VERTEX, attributes: ["aCorner", "aP0", "aP1"] });
  const corners = gpu.buffer(new Float32Array([0, 1, 2, 3, 4, 5]));
  // Every point is stored twice, n apart, so the ring's window from oldest to newest is always one run of the buffer.
  let ringA = gpu.buffer(new Float32Array(6), { dynamic: true });
  let ringB = gpu.buffer(new Float32Array(6), { dynamic: true });

  function init() {
    const { x0, y0, z0, separation, trail: n } = cfg.values;
    a = [x0, y0, z0];
    b = [x0 + separation, y0, z0];
    trailA = new Float32Array(n * 3 * 2);
    trailB = new Float32Array(n * 3 * 2);
    head = 0;
    len = 0;
    steps = 0;
    dirty = true;
  }

  const size = () => trailA.length / 6;

  function push() {
    const n = size();
    for (const [buffer, p] of [[trailA, a], [trailB, b]]) {
      buffer.set(p, head * 3);
      buffer.set(p, (head + n) * 3);
    }
    head = (head + 1) % n;
    len = Math.min(n, len + 1);
    dirty = true;
  }

  function drawTrail(ring, color, w, h) {
    if (len < 2) return;
    const n = size();
    const oldest = (head - len + n) % n; // the window oldest..newest is contiguous from here in the doubled buffer
    const s = Math.min(w, h) / 64;
    gpu.draw(
      trail,
      {
        uCanvas: [w, h],
        uHalf: Math.max(1, ctx.dpr) / 2,
        uCap: 2, // round ends join the pieces smoothly
        uColor: color,
        uView: [view.yaw, view.pitch],
        uFrame: [w / 2, h / 2, s],
      },
      null,
      {
        blend: "alpha",
        instanced: {
          vertexCount: 6,
          instanceCount: len - 1,
          attributes: [
            { buffer: corners, size: 1, divisor: 0 },
            { buffer: ring, size: 3, stride: 12, offset: oldest * 12, divisor: 1 },
            { buffer: ring, size: 3, stride: 12, offset: (oldest + 1) * 12, divisor: 1 },
          ],
        },
      }
    );
  }

  function render() {
    if (gpu.isLost()) return;
    const { width: w, height: h } = canvas;
    if (dirty) {
      ringA.update(trailA);
      ringB.update(trailB);
      dirty = false;
    }
    gpu.draw(fill, { uColor: BG_RGB.map((c) => c / 255) }, null);
    // The processor path strokes each trail at 85% opacity as one path, so overlaps do not darken. Mixing the
    // 85% into an opaque color gives the same look here, where the pieces overlap at their joints.
    const lut = ctx.palette(cfg.values.palette);
    const mix = (t) => {
      const k = Math.round(t * 255) * 3;
      return [0, 1, 2].map((c) => (0.85 * lut[k + c]) / 255 + (0.15 * BG_RGB[c]) / 255).concat(1);
    };
    drawTrail(ringA, mix(0.25), w, h);
    drawTrail(ringB, mix(0.7), w, h);
    const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    ctx.reportStats({ time: (steps * DT).toFixed(1), distance: dist < 0.001 ? dist.toExponential(1) : dist.toFixed(3) });
  }

  /** The trails oldest first, as the processor path draws them, and the current points. */
  function readState() {
    const n = size();
    const ordered = (buf) => {
      const out = new Float32Array(len * 3);
      for (let k = 0; k < len; k++) {
        const i = (head - len + k + n) % n;
        out.set(buf.subarray(i * 3, i * 3 + 3), k * 3);
      }
      return out;
    };
    return { a: [...a], b: [...b], trailA: ordered(trailA), trailB: ordered(trailB), len, steps, view: { ...view } };
  }

  init();
  render();

  gpu.onRestored(() => {
    // The buffers are empty again. The trails are on the processor, so nothing is lost: send them again.
    dirty = true;
    render();
  });

  return {
    path: "gpu",
    update(c, changed = []) {
      const restart = changed.some((k) => ["x0", "y0", "z0", "separation", "trail"].includes(k));
      cfg = c;
      if (c.view) view = { ...c.view };
      if (restart) init();
      render();
    },
    step() {
      const p = cfg.values;
      a = lorenzRK4(a, p, DT);
      b = lorenzRK4(b, p, DT);
      push();
      steps++;
    },
    render,
    reset() {
      init();
      render();
    },
    resize: render,
    destroy() {
      gpu.dispose();
    },
    pointer(ev) {
      if (ev.type === "down") drag = { x: ev.x, y: ev.y, yaw: view.yaw, pitch: view.pitch };
      else if (ev.type === "move" && drag) {
        view = {
          yaw: drag.yaw + (ev.x - drag.x) * 0.01,
          pitch: Math.max(-1.5, Math.min(1.5, drag.pitch + (ev.y - drag.y) * 0.01)),
        };
        render();
      } else if (ev.type === "up" && drag) {
        drag = null;
        ctx.setView({ ...view });
      } else if (ev.type === "key" && ev.key.startsWith("Arrow")) {
        const d = 0.1;
        view = {
          yaw: view.yaw + (ev.key === "ArrowLeft" ? -d : ev.key === "ArrowRight" ? d : 0),
          pitch: Math.max(-1.5, Math.min(1.5, view.pitch + (ev.key === "ArrowUp" ? -d : ev.key === "ArrowDown" ? d : 0))),
        };
        ctx.setView({ ...view });
        render();
        return true;
      }
      return undefined;
    },
    ...(import.meta.env.MODE !== "production" ? { __debug: { readState, gpu, finish: () => gpu.finish() } } : {}),
  };
}
