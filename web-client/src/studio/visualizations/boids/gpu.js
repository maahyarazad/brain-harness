// Boids on the graphics card. The processor path (index.js) is the fallback and the oracle (flockStep): the
// graphics card finds the same neighbors and applies the same rules, so velocities after a step agree to float
// precision, and a flock looks the same although a long run drifts (FR-035: the "looks the same" group).
import { createFlock } from "./kernel.js";
import { ROW, STEP, BOID_VERTEX, BOID_FRAGMENT, FILL } from "./shaders.js";
import { fitAspect, BG_RGB } from "../_shared/instance.js";
import { createRng } from "../../core/rng.js";

const NOTICE = "The graphics card was reset, so the picture restarted.";

export function createBoidsGpu(canvas, gpu, config, ctx, { ASPECT }) {
  let cfg = config;
  let count;
  let rows;
  let state; // ping-pong pair, float32
  let indices; // one float per boid, an instance attribute
  let pointer = null;
  const corners = gpu.buffer(new Float32Array([0, 1, 2]));
  const P = {
    step: gpu.program("boids:step", STEP),
    boids: gpu.program("boids:draw", BOID_FRAGMENT, { vertex: BOID_VERTEX, attributes: ["aCorner", "aIndex"] }),
    fill: gpu.program("boids:fill", FILL),
  };

  function init(rng = ctx.rng) {
    const flock = createFlock(cfg.values.count, ASPECT, rng);
    count = flock.count;
    rows = Math.ceil(count / ROW);
    const data = new Float32Array(ROW * rows * 4);
    for (let i = 0; i < count; i++) {
      data[i * 4] = flock.pos[i * 2];
      data[i * 4 + 1] = flock.pos[i * 2 + 1];
      data[i * 4 + 2] = flock.vel[i * 2];
      data[i * 4 + 3] = flock.vel[i * 2 + 1];
    }
    if (!state) state = gpu.pair({ w: ROW, h: rows, format: "rgba32f" });
    else gpu.resize(state, ROW, rows);
    gpu.upload(state.read, data);
    const idx = new Float32Array(count);
    for (let i = 0; i < count; i++) idx[i] = i;
    if (!indices) indices = gpu.buffer(idx);
    else indices.update(idx);
  }

  function render() {
    if (gpu.isLost()) return;
    const b = fitAspect(canvas.width, canvas.height, ASPECT);
    const s = b.h;
    gpu.draw(P.fill, { uColor: BG_RGB.map((c) => c / 255) }, null);
    gpu.draw(
      P.boids,
      {
        uState: state.read,
        uPalette: gpu.paletteTexture(ctx.palette(cfg.values.palette)),
        uTexel: [1 / ROW, 1 / rows],
        uCanvas: [canvas.width, canvas.height],
        uBox: [b.x, b.y, s],
        uSize: Math.max(3, s * 0.008),
      },
      null,
      {
        instanced: {
          vertexCount: 3,
          instanceCount: count,
          attributes: [
            { buffer: corners, size: 1, divisor: 0 },
            { buffer: indices, size: 1, divisor: 1 },
          ],
        },
      }
    );
  }

  /** Positions and velocities as flat arrays, like the processor path's flock. */
  function readState() {
    const px = gpu.readback(state.read, new Float32Array(ROW * rows * 4));
    const pos = new Float32Array(count * 2);
    const vel = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      pos[i * 2] = px[i * 4];
      pos[i * 2 + 1] = px[i * 4 + 1];
      vel[i * 2] = px[i * 4 + 2];
      vel[i * 2 + 1] = px[i * 4 + 3];
    }
    return { count, pos, vel };
  }

  init();
  render();

  gpu.onRestored(() => {
    ctx.reportNotice(NOTICE);
    init(createRng(cfg.seed)); // the opening flock of this seed, so the restart is the same picture every time
    render();
  });

  return {
    path: "gpu",
    update(c, changed = []) {
      cfg = c;
      if (changed.includes("count")) init();
      render();
    },
    step() {
      if (gpu.isLost()) return;
      const v = cfg.values;
      let attractor = null;
      if (pointer && v.pointerMode !== "off") {
        const repel = v.pointerMode === "repel" || pointer.shift;
        attractor = { x: pointer.x, y: pointer.y, strength: repel ? -3 : 1 };
      }
      const radius = v.radius / 600; // the processor path's conversions, unchanged
      // The processor path's neighbor grid (see shaders.js): cells of the view radius, at least 0.01.
      const cell = Math.max(radius, 0.01);
      const cols = Math.max(1, Math.ceil(ASPECT / cell));
      const cellRows = Math.max(1, Math.ceil(1 / cell));
      gpu.draw(
        P.step,
        {
          uState: state.read,
          uTexel: [1 / ROW, 1 / rows],
          uCount: count,
          uAspect: ASPECT,
          uGrid: [cell, cols, cellRows],
          uSeparation: v.separation,
          uAlignment: v.alignment,
          uCohesion: v.cohesion,
          uRadius2: radius * radius,
          uMaxSpeed: v.maxSpeed * 0.0015,
          uAttractor: attractor ? [attractor.x, attractor.y, attractor.strength] : [0, 0, 0],
          uAttract: attractor ? 1 : 0,
        },
        state.write
      );
      state.swap();
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
      const b = fitAspect(canvas.width, canvas.height, ASPECT);
      if (ev.type === "move" || ev.type === "down") {
        pointer = { x: (ev.x - b.x) / b.h, y: (ev.y - b.y) / b.h, shift: ev.shiftKey };
      } else if (ev.type === "leave") {
        pointer = null;
      }
    },
    ...(import.meta.env.MODE !== "production" ? { __debug: { readState, gpu, finish: () => gpu.finish() } } : {}),
  };
}
