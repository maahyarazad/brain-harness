import { lorenzRK4, project } from "./kernel.js";
import { BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

const DT = 0.005;
const DEFAULT_VIEW = { yaw: 0.6, pitch: 0.3 };

const num = (key, label, min, max, step, def, extra = {}) => ({ key, label, type: "range", min, max, step, default: def, ...extra });

export default {
  id: "lorenz",
  name: "Lorenz attractor",
  howItWorks:
    "Three equations from a simplified weather model, with parameters σ, ρ and β, move a point through 3-D space. The point never settles and never repeats, tracing a butterfly. Two points that start a tiny distance apart follow each other for a while and then go completely different ways: the butterfly effect. Watch the distance between them grow. Drag to rotate the view.",
  animated: true,
  random: false,
  interactive: true,
  stepsPerFrame: 3,
  defaultView: DEFAULT_VIEW,
  validateView(view) {
    const out = { ...DEFAULT_VIEW };
    for (const k of ["yaw", "pitch"]) if (Number.isFinite(view?.[k])) out[k] = view[k];
    out.pitch = Math.max(-1.5, Math.min(1.5, out.pitch));
    return { value: out, replaced: [] };
  },
  knobs: [
    num("sigma", "σ (sigma)", 0, 30, 0.1, 10),
    num("rho", "ρ (rho)", 0, 60, 0.1, 28),
    num("beta", "β (beta)", 0, 8, 0.001, 2.667),
    num("x0", "Start x", -20, 20, 0.1, 1, { group: "Starting point", live: false }),
    num("y0", "Start y", -20, 20, 0.1, 1, { group: "Starting point", live: false }),
    num("z0", "Start z", 0, 50, 0.1, 1, { group: "Starting point", live: false }),
    num("separation", "Second start offset", 0.000000001, 1, 0.000000001, 0.00001, { scale: "log", group: "Starting point", live: false }),
    num("trail", "Trail length", 100, 20000, 1, 4000, { scale: "log" }),
    paletteKnob("palette", "twilight"),
  ],
  presets: [
    { id: "classic", name: "Classic butterfly", values: { sigma: 10, rho: 28, beta: 2.667 } },
    { id: "periodic", name: "Large ρ (60)", values: { sigma: 10, rho: 60, beta: 2.667 } },
    { id: "settles", name: "Settles (ρ = 14)", values: { rho: 14 } },
  ],
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let view = { ...(config.view ?? DEFAULT_VIEW) };
    let a, b, trailA, trailB, head, len, steps;
    let drag = null;

    function init() {
      const { x0, y0, z0, separation, trail } = cfg.values;
      a = [x0, y0, z0];
      b = [x0 + separation, y0, z0];
      trailA = new Float32Array(trail * 3);
      trailB = new Float32Array(trail * 3);
      head = 0;
      len = 0;
      steps = 0;
    }

    function drawTrail(trail, color, w, h, s) {
      const n = trailA.length / 3;
      g.strokeStyle = color;
      g.beginPath();
      for (let k = 0; k < len; k++) {
        const i = (head - len + k + n) % n;
        const [px, py] = project([trail[i * 3], trail[i * 3 + 1], trail[i * 3 + 2]], view.yaw, view.pitch);
        const X = w / 2 + px * s, Y = h / 2 + py * s;
        if (k === 0) g.moveTo(X, Y);
        else g.lineTo(X, Y);
      }
      g.stroke();
    }

    function render() {
      const { width: w, height: h } = canvas;
      clear(g, BG);
      const s = Math.min(w, h) / 64;
      g.lineWidth = Math.max(1, ctx.dpr);
      g.globalAlpha = 0.85;
      drawTrail(trailA, ctx.color(cfg.values.palette, 0.25), w, h, s);
      drawTrail(trailB, ctx.color(cfg.values.palette, 0.7), w, h, s);
      g.globalAlpha = 1;
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      ctx.reportStats({ time: (steps * DT).toFixed(1), distance: dist < 0.001 ? dist.toExponential(1) : dist.toFixed(3) });
    }

    function push() {
      const n = trailA.length / 3;
      trailA.set(a, head * 3);
      trailB.set(b, head * 3);
      head = (head + 1) % n;
      len = Math.min(n, len + 1);
    }

    init();
    render();
    return {
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
      destroy() {},
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
      },
    };
  },
};
