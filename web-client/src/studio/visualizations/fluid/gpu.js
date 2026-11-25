// The fluid simulation on the graphics card (specs/005-.../contracts/fluid-simulation.md).
// One step() runs the passes in the order of the contract's table; render() runs the display pass.
import { createRng } from "../../core/rng.js";
import { effectiveLevel } from "../../core/quality.js";
import {
  DT, OPENING_SPLATS, BURST_SPLATS, TAP_PUSH, TAP_RADIUS, DYE_INTENSITY,
  simSize, stepUniforms, initialSplats, burstSplats, strokeColor, lutColorAt,
} from "./kernel.js";
import { SOURCES, LIMITS } from "./shaders.js";

const MAX_STROKES = 10; // the shell never sends more fingers than this
const MAX_PENDING = 512; // a paused fluid still draws, but a runaway stroke cannot queue without end

export const RESET_NOTICE = "The graphics card was reset, so the picture restarted.";
export const LOST_TEXT = "The graphics card stopped responding. Press Restart to start the fluid again.";

export function createFluidInstance(canvas, gpu, config, ctx) {
  let cfg = config;
  let level = effectiveLevel(cfg.values);
  let u = stepUniforms(cfg.values);
  let colorAt = lutColorAt(ctx.palette(cfg.values.palette));
  let pending = [];
  const strokes = new Map(); // pointerId → { x, y, color, moved }
  let strokeCount = 0;
  let steps = 0;
  let destroyed = false;
  let redrawFrame = null;

  const P = Object.fromEntries(Object.entries(SOURCES).map(([name, src]) => [name, gpu.program(`fluid:${name}`, src)]));
  const aspect = () => canvas.width / Math.max(1, canvas.height);
  const texel = (t) => [1 / t.w, 1 / t.h];

  // ---- the fields ----
  let velocity;
  let dye;
  let pressure;
  let divergence;
  let curl;

  function allocate() {
    const g = simSize(level, aspect());
    velocity = gpu.pair({ w: g.sim.w, h: g.sim.h, format: "rgba16f", filter: "linear" });
    dye = gpu.pair({ w: g.dye.w, h: g.dye.h, format: "rgba16f", filter: "linear" });
    pressure = gpu.pair({ w: g.sim.w, h: g.sim.h, format: "rgba16f" });
    divergence = gpu.target({ w: g.sim.w, h: g.sim.h, format: "rgba16f" });
    curl = gpu.target({ w: g.sim.w, h: g.sim.h, format: "rgba16f" });
  }

  /** New grid sizes for a quality level or a new picture shape, keeping the ink and the motion (FR-019). */
  function rebuild() {
    const g = simSize(level, aspect());
    gpu.resize(velocity, g.sim.w, g.sim.h, { keep: true });
    gpu.resize(dye, g.dye.w, g.dye.h, { keep: true });
    gpu.resize(pressure, g.sim.w, g.sim.h, { keep: true });
    gpu.resize(divergence, g.sim.w, g.sim.h);
    gpu.resize(curl, g.sim.w, g.sim.h);
  }

  function clearAll() {
    for (const t of [velocity.read, velocity.write, dye.read, dye.write, pressure.read, pressure.write, divergence, curl]) {
      gpu.draw(P.clear, {}, t);
    }
    pending = [];
  }

  // ---- splashes ----
  const queue = (...splats) => {
    pending.push(...splats);
    if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
  };

  /** Applies every queued splash to the velocity and the dye. */
  function flush() {
    if (!pending.length || gpu.isLost()) return;
    const list = pending;
    pending = [];
    const asp = aspect();
    const base = (u.radius / 100) * (asp > 1 ? asp : 1); // radius is in uv-squared units, widened on wide pictures
    for (const s of list) {
      const radius = base * (s.radiusScale ?? 1);
      const point = [s.x, s.y];
      gpu.draw(P.splat, { uTarget: velocity.read, uAspect: asp, uColor: [s.dx * u.force, s.dy * u.force, 0], uPoint: point, uRadius: radius, uLimit: LIMITS.velocity }, velocity.write);
      velocity.swap();
      gpu.draw(P.splat, { uTarget: dye.read, uAspect: asp, uColor: s.color.map((c) => c * DYE_INTENSITY * (s.gain ?? 1)), uPoint: point, uRadius: radius, uLimit: LIMITS.dye }, dye.write);
      dye.swap();
    }
  }

  function queueOpening() {
    // A fresh generator from the seed, not ctx.rng: reset() does not recreate ctx, and the opening
    // scene must come back identically (FR-005, FR-007).
    queue(...initialSplats(createRng(cfg.seed), OPENING_SPLATS, colorAt));
  }

  // ---- the step ----
  function step() {
    if (destroyed || gpu.isLost()) return;
    flush();
    const simTexel = texel(velocity.read);
    if (u.curl > 0) {
      gpu.draw(P.curl, { uVelocity: velocity.read, uTexel: simTexel }, curl);
      gpu.draw(P.vorticity, { uVelocity: velocity.read, uCurl: curl, uTexel: simTexel, uStrength: u.curl, uDt: DT, uLimit: LIMITS.velocity }, velocity.write);
      velocity.swap();
    }
    gpu.draw(P.divergence, { uVelocity: velocity.read, uTexel: simTexel }, divergence);
    gpu.draw(P.scale, { uTexture: pressure.read, uValue: u.pressure }, pressure.write);
    pressure.swap();
    for (let i = 0; i < u.iterations; i++) {
      gpu.draw(P.jacobi, { uPressure: pressure.read, uDivergence: divergence, uTexel: simTexel }, pressure.write);
      pressure.swap();
    }
    gpu.draw(P.gradient, { uPressure: pressure.read, uVelocity: velocity.read, uTexel: simTexel, uLimit: LIMITS.velocity }, velocity.write);
    velocity.swap();
    gpu.draw(P.advect, { uVelocity: velocity.read, uSource: velocity.read, uTexel: simTexel, uSourceTexel: simTexel, uDt: DT, uDivisor: u.velocityDivisor, uLimit: LIMITS.velocity }, velocity.write);
    velocity.swap();
    gpu.draw(P.advect, { uVelocity: velocity.read, uSource: dye.read, uTexel: simTexel, uSourceTexel: texel(dye.read), uDt: DT, uDivisor: u.densityDivisor, uLimit: LIMITS.dye }, dye.write);
    dye.swap();
    steps += 1;
  }

  function render() {
    if (destroyed || gpu.isLost()) return;
    flush();
    gpu.draw(P.display, { uDye: dye.read }, null);
    ctx.reportStats({ steps });
  }

  /** A pointer event while paused still has to show: draw once on the next frame, however many events came. */
  function scheduleRender() {
    if (redrawFrame !== null || destroyed) return;
    redrawFrame = requestAnimationFrame(() => {
      redrawFrame = null;
      render();
    });
  }

  // ---- input ----
  const toUv = (ev) => ({ x: ev.x / Math.max(1, canvas.width), y: 1 - ev.y / Math.max(1, canvas.height) });
  const inside = (p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

  function begin(ev) {
    const id = ev.pointerId ?? 0;
    if (!strokes.has(id) && strokes.size >= MAX_STROKES) return;
    const p = toUv(ev);
    strokes.set(id, { ...p, color: strokeColor(strokeCount++, colorAt), moved: false });
  }

  function drag(ev) {
    const s = strokes.get(ev.pointerId ?? 0);
    if (!s) return; // a hover, or a stroke that already ended: no ink
    const p = toUv(ev);
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    if (dx * dx + dy * dy < 1e-10) return;
    // A stroke that leaves the picture is cut at the edge, and carries on if it comes back still pressed.
    if (inside(p)) queue({ x: p.x, y: p.y, dx, dy, color: s.color });
    s.x = p.x;
    s.y = p.y;
    s.moved = true;
    scheduleRender();
  }

  function end(ev) {
    const id = ev.pointerId ?? 0;
    const s = strokes.get(id);
    if (!s) return;
    strokes.delete(id);
    if (ev.type === "up" && !s.moved && inside(s)) {
      // A tap: one small splash with a small fixed upward push. It does not touch ctx.rng.
      queue({ x: s.x, y: s.y, dx: 0, dy: TAP_PUSH, color: s.color, radiusScale: TAP_RADIUS });
      scheduleRender();
    }
  }

  function burst() {
    queue(...burstSplats(ctx.rng, BURST_SPLATS, colorAt));
    flush();
    scheduleRender();
  }

  function clear() {
    clearAll();
    scheduleRender();
  }

  function reset() {
    clearAll();
    strokes.clear();
    strokeCount = 0;
    steps = 0;
    queueOpening();
    flush();
    scheduleRender();
  }

  allocate();
  queueOpening();
  flush();
  render();

  gpu.onRestored(() => {
    // The fields are empty again, with the same sizes. Start over from the opening scene.
    ctx.reportNotice(RESET_NOTICE);
    reset();
  });

  /** The graphics context was lost and did not come back in time (FR-017). */
  function handleUnrecovered() {
    ctx.showMessage({ text: LOST_TEXT, actionLabel: "Restart", onAction: () => ctx.requestRestart({}) });
  }

  function readState() {
    flush();
    const grab = (t) => gpu.readback(t, new Float32Array(t.w * t.h * 4));
    return {
      simSize: { w: velocity.read.w, h: velocity.read.h },
      dyeSize: { w: dye.read.w, h: dye.read.h },
      velocity: grab(velocity.read),
      dye: grab(dye.read),
      pressure: grab(pressure.read),
    };
  }

  /** The picture as drawn on the canvas (8-bit RGBA). Works on WebGL 1, where half-float fields cannot be read back. */
  function readCanvas() {
    return gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
  }

  return {
    path: "gpu",
    handleUnrecovered,
    update(c, changed = []) {
      cfg = c;
      u = stepUniforms(c.values);
      if (changed.includes("palette")) colorAt = lutColorAt(ctx.palette(c.values.palette));
      if (changed.includes("quality")) {
        level = effectiveLevel(c.values);
        rebuild();
      }
      scheduleRender();
    },
    step,
    render,
    reset,
    resize() {
      rebuild();
      scheduleRender();
    },
    setQuality(next) {
      level = next;
      rebuild();
      scheduleRender();
    },
    action(id) {
      if (id === "burst") burst();
      else if (id === "clear") clear();
    },
    pointer(ev) {
      switch (ev.type) {
        case "down":
          begin(ev);
          break;
        case "move":
          drag(ev);
          break;
        case "up":
        case "leave":
          end(ev);
          break;
        case "key": {
          const key = String(ev.key ?? "").toLowerCase();
          if (key === "b") {
            burst();
            return true;
          }
          if (key === "c") {
            clear();
            return true;
          }
          return false;
        }
        default:
          break;
      }
      return undefined;
    },
    destroy() {
      destroyed = true;
      if (redrawFrame !== null) cancelAnimationFrame(redrawFrame);
      strokes.clear();
      gpu.dispose();
    },
    ...(import.meta.env.MODE !== "production" ? { __debug: { readState, readCanvas, gpu, finish: () => gpu.finish() } } : {}),
  };
}
