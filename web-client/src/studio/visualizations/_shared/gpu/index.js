// The shared GPU toolkit (specs/005-navier-stokes-fluid-performance/contracts/gpu-toolkit.md).
//
//   import { openGpu } from "../_shared/gpu/index.js";
//   create(canvas, config, ctx) {
//     const gpu = openGpu(canvas, { need: ["floatTarget"], ctx });
//     return gpu ? createGpuInstance(canvas, gpu, config, ctx) : createProcessorInstance(canvas, config, ctx);
//   }
//
// openGpu returns null when the processor path must be used: forced off, no WebGL, or a missing
// capability. A module that gets null has not touched its canvas and then asks for a "2d" context
// as it always did.
import { gpuMode, probeGpu, acquireContext, enableExtensions, resetProbeCache } from "./context.js";
import { createPrograms, IS_TARGET } from "./program.js";
import { createTargets } from "./targets.js";
import { createDraw } from "./draw.js";
import { createPalettes } from "./palette.js";

export { gpuMode, probeGpu, resetProbeCache };

const COPY = `uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;

const safe = (fn) => {
  try {
    fn();
  } catch (err) {
    // A listener must not stop the others, or the shell's own cleanup.
    console.error(err);
  }
};

function createGpu(canvas, gl, caps, { ctx, onUnrecovered, unrecoveredMs }) {
  const core = {
    canvas,
    gl,
    caps,
    version: caps.version,
    ctx,
    gen: 0, // bumped on every context restore; GPU objects older than this are rebuilt on first use
    lost: false,
    disposed: false,
    ext: enableExtensions(gl, caps.version),
  };
  const programs = createPrograms(core);
  const targets = createTargets(core);
  const { draw } = createDraw(core, programs);
  const paletteTexture = createPalettes(targets);

  const lostListeners = new Set();
  const restoredListeners = new Set();
  let timer = null;

  function onContextLost(event) {
    event.preventDefault(); // lets the browser restore the context
    if (core.disposed) return;
    core.lost = true;
    [...lostListeners].forEach((cb) => safe(cb));
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!core.lost || core.disposed) return;
      if (onUnrecovered) safe(onUnrecovered);
      else ctx?.requestRestart?.({ forceProcessor: true });
    }, unrecoveredMs);
  }

  function onContextRestored() {
    if (core.disposed) return;
    clearTimeout(timer);
    core.gen += 1;
    core.ext = enableExtensions(gl, caps.version); // extensions are per context and were lost with it
    core.lost = false;
    [...restoredListeners].forEach((cb) => safe(cb));
  }

  canvas.addEventListener("webglcontextlost", onContextLost, false);
  canvas.addEventListener("webglcontextrestored", onContextRestored, false);

  const copy = programs.program("toolkit:copy", COPY);

  function resize(subject, w, h, { keep = false } = {}) {
    if (subject.read && subject.write) {
      resize(subject.read, w, h, { keep });
      resize(subject.write, w, h, { keep: false });
      return;
    }
    const nw = Math.max(1, Math.round(w));
    const nh = Math.max(1, Math.round(h));
    if (subject.w === nw && subject.h === nh) return;
    const old = subject.reallocate(nw, nh);
    if (!old) return; // lost: the target is rebuilt, empty, on first use
    if (keep) {
      const source = {
        [IS_TARGET]: true,
        bind(unit) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, old.texture);
        },
      };
      draw(copy, { uTex: source }, subject); // resamples, so the picture survives a new size
    }
    gl.deleteTexture(old.texture);
    gl.deleteFramebuffer(old.fbo);
  }

  function upload(target, data, region) {
    if (core.lost || core.disposed) return;
    const type = target.info.uploadType === undefined ? target.info.type : target.info.uploadType;
    if (type === null) throw new Error("Uploading to a half-float target is not supported on WebGL 1.");
    const r = region ?? { x: 0, y: 0, w: target.w, h: target.h };
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, r.w, r.h, gl.RGBA, type, data);
  }

  /** Reads pixels into `out`. `target` may be `{ w, h, fbo: null }` to read the canvas. */
  function readback(target, out, region) {
    if (core.lost || core.disposed) return out;
    const type = target.info ? target.info.readType : gl.UNSIGNED_BYTE;
    if (type === null) throw new Error("Reading a half-float target needs WebGL 2.");
    const r = region ?? { x: 0, y: 0, w: target.w, h: target.h };
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo ?? null);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.readPixels(r.x, r.y, r.w, r.h, gl.RGBA, type, out);
    return out;
  }

  /** Waits until everything queued has been executed. Used to time the real cost of a frame. */
  function finish() {
    if (core.lost || core.disposed) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }

  function dispose() {
    if (core.disposed) return;
    core.disposed = true;
    clearTimeout(timer);
    canvas.removeEventListener("webglcontextlost", onContextLost, false);
    canvas.removeEventListener("webglcontextrestored", onContextRestored, false);
    if (!core.lost) {
      programs.dispose();
      targets.disposeAll();
    }
    lostListeners.clear();
    restoredListeners.clear();
    // Browsers cap live contexts and silently lose the oldest. Give this one back at once.
    try {
      core.ext.loseContext?.loseContext();
    } catch {
      /* already lost */
    }
  }

  return {
    canvas,
    gl,
    version: caps.version,
    caps,
    ctx,
    program: programs.program,
    target: targets.target,
    pair: targets.pair,
    buffer: targets.buffer,
    draw,
    resize,
    upload,
    readback,
    finish,
    paletteTexture,
    isLost: () => core.lost,
    onLost(cb) {
      lostListeners.add(cb);
      return () => lostListeners.delete(cb);
    },
    onRestored(cb) {
      restoredListeners.add(cb);
      return () => restoredListeners.delete(cb);
    },
    dispose,
  };
}

/**
 * The GPU path for a module's canvas, or null (use the processor path).
 * options: { need: ["floatTarget", …], ctx, onUnrecovered, unrecoveredMs }
 * If the context is lost and not restored within `unrecoveredMs` (3 s), `onUnrecovered` is called,
 * or, without one, ctx.requestRestart({ forceProcessor: true }).
 */
export function openGpu(canvas, { need = [], ctx = null, onUnrecovered = null, unrecoveredMs = 3000 } = {}) {
  if (!canvas || gpuMode(ctx) === "off") return null;
  const caps = probeGpu({ need });
  if (!caps.ok) return null;
  const gl = acquireContext(canvas, caps);
  if (!gl) return null;
  return createGpu(canvas, gl, caps, { ctx, onUnrecovered, unrecoveredMs });
}
