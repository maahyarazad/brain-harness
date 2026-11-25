// Fourier epicycles on the graphics card. The outline, its transform (the existing kernel) and the trace stay on the
// processor, where they are the oracle: they are computed once and the chain of circles is a short sum per frame.
// What moves to the graphics card is the drawing: up to 512 circle outlines, the faint outline and the trace (up to
// 512 segments) were hundreds of canvas strokes each frame; they are now a few instanced draws (shapes.js).
import { resampleByArcLength, dft, epicyclePoint } from "./kernel.js";
import { SHAPES } from "./shapes.js";
import { createShapes } from "../_shared/gpu/shapes.js";
import { BG_RGB } from "../_shared/instance.js";

const FILL = `
uniform vec3 uColor;
varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;

/** The hint text is drawn on a 2D canvas, which a graphics context cannot do, and drawn from a texture. */
const HINT = `
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y)); }`;

export function createFourierGpu(canvas, gpu, config, ctx, { SAMPLES }) {
  let cfg = config;
  let coeffs = [], outline = [], path = [], step = 0;
  let recording = null;
  let hint = null; // the target holding the hint text, and the size it was made for
  const shapes = createShapes(gpu);
  const fill = gpu.program("fourier:fill", FILL);
  const hintProgram = gpu.program("fourier:hint", HINT);
  const buffers = {
    outline: gpu.buffer(new Float32Array(4), { dynamic: true }),
    path: gpu.buffer(new Float32Array(4), { dynamic: true }),
    recording: gpu.buffer(new Float32Array(4), { dynamic: true }),
    rings: gpu.buffer(new Float32Array(3), { dynamic: true }),
  };

  function init() {
    const raw = cfg.values.shape === "custom" ? cfg.input?.outline : SHAPES[cfg.values.shape]?.();
    if (!raw || raw.length < 3) {
      coeffs = [];
      outline = [];
    } else {
      outline = resampleByArcLength(raw, SAMPLES);
      coeffs = dft(outline);
    }
    path = [];
    step = 0;
  }

  const scale = () => Math.min(canvas.width, canvas.height) * 0.42;
  function toScreen([x, y]) {
    const s = scale();
    return [canvas.width / 2 + x * s, canvas.height / 2 + y * s];
  }

  /** The strip through `points` as segments (x0, y0, x1, y1), optionally closed. */
  function strip(points, closed = false) {
    const n = points.length;
    const count = Math.max(0, closed ? n : n - 1);
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = toScreen(points[i]);
      const b = toScreen(points[(i + 1) % n]);
      data.set([a[0], a[1], b[0], b[1]], i * 4);
    }
    return { data, count };
  }

  function draw(name, points, options, closed = false) {
    const { data, count } = strip(points, closed);
    if (!count) return;
    buffers[name].update(data);
    shapes.segments(buffers[name], { count, canvas: [canvas.width, canvas.height], ...options });
  }

  /** The chain of circles for the first k coefficients at time t: where each is centred and how big, in outline units. */
  function chain(k, t) {
    let x = 0, y = 0;
    const out = [];
    for (let i = 0; i < k; i++) {
      const c = coeffs[i];
      out.push({ x, y, r: c.amp });
      x += c.amp * Math.cos(c.freq * t + c.phase);
      y += c.amp * Math.sin(c.freq * t + c.phase);
    }
    return out;
  }

  function drawHint() {
    const { width: w, height: h } = canvas;
    if (!hint || hint.w !== w || hint.h !== h) {
      if (hint) gpu.resize(hint.target, w, h);
      else hint = { target: gpu.target({ w, h, format: "rgba8", keepData: false }) };
      const flat = document.createElement("canvas");
      flat.width = w;
      flat.height = h;
      const g = flat.getContext("2d", { willReadFrequently: true });
      g.fillStyle = "#bbbbbb";
      g.font = `${14 * ctx.dpr}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.fillText("Draw a closed outline here", w / 2, h / 2);
      gpu.upload(hint.target, new Uint8Array(g.getImageData(0, 0, w, h).data.buffer));
      hint.w = w;
      hint.h = h;
    }
    gpu.draw(hintProgram, { uTex: hint.target }, null, { blend: "alpha" });
  }

  function render() {
    if (gpu.isLost()) return;
    const { width: w, height: h } = canvas;
    const pal = cfg.values.palette;
    const lut = ctx.palette(pal);
    const color = (t, a = 1) => {
      const k = Math.max(0, Math.min(255, Math.round(t * 255))) * 3;
      return [lut[k] / 255, lut[k + 1] / 255, lut[k + 2] / 255, a];
    };
    gpu.draw(fill, { uColor: BG_RGB.map((c) => c / 255) }, null);
    if (recording) {
      draw("recording", recording, { width: 2 * ctx.dpr, color: color(0.8), cap: "round" });
      return;
    }
    if (!coeffs.length) {
      drawHint();
      return;
    }
    const thin = Math.max(1, ctx.dpr);
    draw("outline", outline, { width: thin, color: [1, 1, 1, 0.12], cap: "flat" }, true);

    const k = Math.min(cfg.values.circles, coeffs.length);
    const t = (2 * Math.PI * step) / SAMPLES;
    if (cfg.values.showCircles) {
      const s = scale();
      const rings = chain(k, t).filter((c) => c.r * s > 0.5) // the processor path skips circles under half a pixel;
      if (rings.length) {
        const data = new Float32Array(rings.length * 3);
        rings.forEach((c, i) => {
          const [cx, cy] = toScreen([c.x, c.y]);
          data.set([cx, cy, c.r * s], i * 3);
        });
        buffers.rings.update(data);
        shapes.rings(buffers.rings, { count: rings.length, width: thin, color: [1, 1, 1, 0.25], canvas: [w, h] });
      }
    }
    draw("path", path, { width: 2 * ctx.dpr, color: color(0.85), cap: "round" });
    ctx.reportStats({ circles: k });
  }

  init();
  render();

  gpu.onRestored(() => {
    hint = null; // the texture is empty again
    render();
  });

  return {
    path: "gpu",
    update(c, changed = []) {
      const reinit = changed.includes("shape") || c.input !== cfg.input;
      cfg = c;
      if (reinit) init();
      if (changed.includes("circles")) {
        path = [];
        step = 0;
      }
      render();
    },
    step() {
      if (!coeffs.length) return;
      const t = (2 * Math.PI * step) / SAMPLES;
      path.push(epicyclePoint(coeffs, cfg.values.circles, t));
      step++;
      if (step > SAMPLES) {
        step = 0;
        path = [];
      }
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
      if (cfg.values.shape !== "custom") return;
      const s = scale();
      const p = [(ev.x - canvas.width / 2) / s, (ev.y - canvas.height / 2) / s];
      if (ev.type === "down" && ev.button === 0) {
        recording = [p];
        render();
      } else if (ev.type === "move" && recording) {
        recording.push(p);
        render();
      } else if (ev.type === "up" && recording) {
        const pts = recording;
        recording = null;
        if (pts.length >= 10) {
          const sampled = resampleByArcLength(pts, Math.min(SAMPLES, pts.length));
          const input = { outline: sampled.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]) };
          cfg = { ...cfg, input };
          ctx.setInput(input);
          init();
        } else {
          ctx.reportNotice("Draw a longer outline (hold the button and drag).");
        }
        render();
      }
    },
    ...(import.meta.env.MODE !== "production"
      ? {
          __debug: {
            readState: () => ({
              coeffs: coeffs.length,
              outline: outline.map((p) => [...p]),
              path: path.map((p) => [...p]),
              step,
              recording: recording ? recording.length : 0,
              chain: coeffs.length ? chain(Math.min(cfg.values.circles, coeffs.length), (2 * Math.PI * step) / SAMPLES) : [],
            }),
            gpu,
            finish: () => gpu.finish(),
          },
        }
      : {}),
  };
}
