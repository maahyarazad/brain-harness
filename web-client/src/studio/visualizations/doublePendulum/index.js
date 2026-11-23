import { pendulumRK4 } from "./kernel.js";
import { BG } from "../_shared/instance.js";
import { clear, DEG } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

const DT = 1 / 240;
const num = (key, label, min, max, step, def, extra = {}) => ({ key, label, type: "range", min, max, step, default: def, ...extra });

export default {
  id: "double-pendulum",
  name: "Double pendulum",
  howItWorks:
    "A pendulum hangs from the end of another pendulum. Each one alone swings in a simple, predictable way; joined together they become chaotic, and the slightest change in the starting angles leads to a completely different path. The trail follows the lower bob. Drag either bob to set its starting angle.",
  animated: true,
  random: false,
  interactive: true,
  stepsPerFrame: 4,
  knobs: [
    num("m1", "Mass 1", 0.1, 10, 0.1, 1),
    num("m2", "Mass 2", 0.1, 10, 0.1, 1),
    num("l1", "Arm 1 length", 0.2, 2, 0.05, 1),
    num("l2", "Arm 2 length", 0.2, 2, 0.05, 1),
    num("theta1", "Start angle 1 (°)", -180, 180, 0.1, 120, { live: false }),
    num("theta2", "Start angle 2 (°)", -180, 180, 0.1, -20, { live: false }),
    num("gravity", "Gravity", 1, 20, 0.01, 9.81),
    num("trail", "Trail length", 0, 5000, 1, 1500),
    paletteKnob("palette", "magma"),
  ],
  presets: [
    { id: "chaos", name: "Chaotic", values: { theta1: 120, theta2: -20 } },
    { id: "gentle", name: "Gentle swing", values: { theta1: 20, theta2: 10 } },
    { id: "flip", name: "Upside down", values: { theta1: 179, theta2: 179.5 } },
    { id: "heavy", name: "Heavy top", values: { m1: 6, m2: 1, theta1: 90, theta2: 90 } },
  ],
  sweep: { periodMs: 30000, targets: [{ key: "gravity", mode: "wave", min: 4, max: 16 }] },
  // The catalog card's sample picture (contracts/thumbnail.md).
  thumbnail: { steps: 2400 },
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let state, trail, time;
    let drag = null;

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
      clear(g, BG);
      const { ox, oy, x1, y1, x2, y2 } = geometry();
      const pal = cfg.values.palette;
      g.lineWidth = Math.max(1, ctx.dpr);
      for (let i = 1; i < trail.length; i++) {
        g.strokeStyle = ctx.color(pal, i / trail.length, i / trail.length);
        g.beginPath();
        g.moveTo(trail[i - 1][0], trail[i - 1][1]);
        g.lineTo(trail[i][0], trail[i][1]);
        g.stroke();
      }
      g.strokeStyle = "#d8d8d8";
      g.lineWidth = 2 * ctx.dpr;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      const r = (m) => (5 + 3 * Math.sqrt(m)) * ctx.dpr;
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(x1, y1, r(cfg.values.m1), 0, 2 * Math.PI);
      g.fill();
      g.fillStyle = ctx.color(pal, 0.85);
      g.beginPath();
      g.arc(x2, y2, r(cfg.values.m2), 0, 2 * Math.PI);
      g.fill();
      ctx.reportStats({ time: `${time.toFixed(1)} s` });
    }

    init();
    render();
    return {
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
      destroy() {},
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
    };
  },
};
