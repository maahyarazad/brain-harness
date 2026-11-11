import { createFlock, flockStep } from "./kernel.js";
import { fitAspect, BG } from "../_shared/instance.js";
import { clear } from "../_shared/draw.js";
import { paletteKnob } from "../../core/palettes.js";

const ASPECT = 4 / 3;
const rule = (key, label, def) => ({ key, label, type: "range", min: 0, max: 3, step: 0.05, default: def });

export default {
  id: "boids",
  name: "Boids",
  howItWorks:
    "Each bird follows three rules using only the birds near it: steer away from birds that are too close (separation), match their direction (alignment), and move toward their average position (cohesion). Nobody leads, yet a flock appears. Change the weights to get schools, swarms or scattered loners. Move the pointer over the canvas to attract the flock, or hold Shift to scare it.",
  animated: true,
  random: true,
  interactive: true,
  stepsPerFrame: 1,
  knobs: [
    { key: "count", label: "Boids", type: "range", min: 10, max: 2000, step: 1, default: 300, live: false },
    rule("separation", "Separation", 1.5),
    rule("alignment", "Alignment", 1),
    rule("cohesion", "Cohesion", 1),
    { key: "radius", label: "View radius (px at 800 wide)", type: "range", min: 10, max: 150, step: 1, default: 50 },
    { key: "maxSpeed", label: "Max speed", type: "range", min: 1, max: 8, step: 0.1, default: 3 },
    {
      key: "pointerMode", label: "Pointer", type: "choice", default: "attract",
      options: [{ value: "attract", label: "Attracts (Shift repels)" }, { value: "repel", label: "Repels" }, { value: "off", label: "Off" }],
    },
    paletteKnob("palette", "viridis"),
  ],
  presets: [
    { id: "flock", name: "Flock", values: { separation: 1.5, alignment: 1, cohesion: 1 } },
    { id: "school", name: "Tight school", values: { separation: 1, alignment: 2.5, cohesion: 2, radius: 70 } },
    { id: "swarm", name: "Swarm", values: { separation: 0.5, alignment: 0.1, cohesion: 2.5, maxSpeed: 5 } },
    { id: "loners", name: "Loners", values: { separation: 3, alignment: 0, cohesion: 0 } },
  ],
  create(canvas, config, ctx) {
    const g = canvas.getContext("2d");
    let cfg = config;
    let flock;
    let pointer = null;

    const init = () => (flock = createFlock(cfg.values.count, ASPECT, ctx.rng));

    function render() {
      clear(g, BG);
      const b = fitAspect(canvas.width, canvas.height, ASPECT);
      const s = b.h;
      const size = Math.max(3, s * 0.008);
      const { pos, vel, count } = flock;
      for (let i = 0; i < count; i++) {
        const x = b.x + pos[i * 2] * s, y = b.y + pos[i * 2 + 1] * s;
        const a = Math.atan2(vel[i * 2 + 1], vel[i * 2]);
        g.fillStyle = ctx.color(cfg.values.palette, (a + Math.PI) / (2 * Math.PI));
        g.beginPath();
        g.moveTo(x + Math.cos(a) * size * 1.6, y + Math.sin(a) * size * 1.6);
        g.lineTo(x + Math.cos(a + 2.5) * size, y + Math.sin(a + 2.5) * size);
        g.lineTo(x + Math.cos(a - 2.5) * size, y + Math.sin(a - 2.5) * size);
        g.closePath();
        g.fill();
      }
    }

    init();
    render();
    return {
      update(c, changed = []) {
        cfg = c;
        if (changed.includes("count")) init();
        render();
      },
      step() {
        const v = cfg.values;
        let attractor = null;
        if (pointer && v.pointerMode !== "off") {
          const repel = v.pointerMode === "repel" || pointer.shift;
          attractor = { x: pointer.x, y: pointer.y, strength: repel ? -3 : 1 };
        }
        flockStep(flock, {
          separation: v.separation,
          alignment: v.alignment,
          cohesion: v.cohesion,
          radius: v.radius / 600,
          maxSpeed: v.maxSpeed * 0.0015,
          attractor,
        });
      },
      render,
      reset() {
        init();
        render();
      },
      resize: render,
      destroy() {},
      pointer(ev) {
        const b = fitAspect(canvas.width, canvas.height, ASPECT);
        if (ev.type === "move" || ev.type === "down") {
          pointer = { x: (ev.x - b.x) / b.h, y: (ev.y - b.y) / b.h, shift: ev.shiftKey };
        } else if (ev.type === "leave") {
          pointer = null;
        }
      },
    };
  },
};
