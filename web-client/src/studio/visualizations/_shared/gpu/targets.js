// Textures you can render into, ping-pong pairs, and vertex buffers.
//
// Every target is RGBA, whatever it holds. Single- and two-channel float formats are renderable on
// fewer devices than RGBA, and the extra memory is small at the sizes used here, so "r8", "rg16f",
// "r32f" and the like are accepted as aliases and mapped to RGBA.
//
// A target remembers how it was made. After a context restore it is rebuilt, empty, on first use;
// the module re-initializes its content (specs/005-.../contracts/gpu-toolkit.md, "Context loss").
import { IS_TARGET } from "./program.js";

export const IS_BUFFER = Symbol("gpu.buffer");

const ALIASES = {
  r8: "rgba8", rg8: "rgba8", rgba8: "rgba8",
  r16f: "rgba16f", rg16f: "rgba16f", rgba16f: "rgba16f",
  r32f: "rgba32f", rg32f: "rgba32f", rgba32f: "rgba32f",
};

/** How a format is stored on this context. Throws a readable error for a format the device cannot render to. */
export function formatInfo(core, format) {
  const { gl, version, caps, ext } = core;
  const name = ALIASES[format];
  if (!name) throw new Error(`Unknown target format "${format}"`);
  const v2 = version === 2;
  if (name === "rgba8") {
    return { name, internal: v2 ? gl.RGBA8 : gl.RGBA, type: gl.UNSIGNED_BYTE, readType: gl.UNSIGNED_BYTE, linear: true, Array: Uint8Array };
  }
  if (name === "rgba32f") {
    if (!caps.floatTarget) throw new Error("This device cannot render to 32-bit float textures.");
    return { name, internal: v2 ? gl.RGBA32F : gl.RGBA, type: gl.FLOAT, readType: gl.FLOAT, linear: caps.linearFloat, Array: Float32Array };
  }
  if (!caps.halfFloatTarget) throw new Error("This device cannot render to half-float textures.");
  return {
    name,
    internal: v2 ? gl.RGBA16F : gl.RGBA,
    type: v2 ? gl.HALF_FLOAT : ext.halfFloat.HALF_FLOAT_OES,
    // WebGL 2 can read a half-float attachment as FLOAT. WebGL 1 cannot read half floats at all.
    readType: v2 ? gl.FLOAT : null,
    uploadType: v2 ? gl.FLOAT : null,
    linear: caps.linearHalf,
    Array: Float32Array,
  };
}

export function createTargets(core) {
  const targets = new Set();
  const buffers = new Set();

  function target({ w, h, format = "rgba8", filter = "nearest", wrap = "clamp", data = null, keepData = false }) {
    const info = formatInfo(core, format);
    if (wrap === "repeat" && core.version === 1 && ((w & (w - 1)) !== 0 || (h & (h - 1)) !== 0)) {
      throw new Error('wrap: "repeat" needs power-of-two sizes on WebGL 1; wrap by hand in the shader instead.');
    }
    let tex = null;
    let fbo = null;
    let gen = -1;
    let initial = data;
    let size = { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };

    function build() {
      const gl = core.gl;
      // Building can happen in the middle of a draw (the first use of a texture), so it must leave
      // the bindings as it found them. Otherwise the pass renders into the wrong framebuffer.
      const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
      const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, info.internal, size.w, size.h, 0, gl.RGBA, info.type, initial);
      const f = filter === "linear" && info.linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      const wr = wrap === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
      fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gen = core.gen;
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
      // The content given at creation seeds the first build only, unless the caller asked to keep it.
      if (!keepData) initial = null;
    }

    function ensure() {
      if (core.lost || core.disposed) return false;
      if (!tex || gen !== core.gen) build();
      return true;
    }

    function release() {
      if (tex && gen === core.gen && !core.lost) {
        core.gl.deleteTexture(tex);
        core.gl.deleteFramebuffer(fbo);
      }
      tex = null;
      fbo = null;
    }

    const t = {
      [IS_TARGET]: true,
      info,
      get w() {
        return size.w;
      },
      get h() {
        return size.h;
      },
      get format() {
        return info.name;
      },
      get texture() {
        ensure();
        return tex;
      },
      get fbo() {
        ensure();
        return fbo;
      },
      /** Binds the texture to a texture unit, for use as a sampler. */
      bind(unit) {
        if (!ensure()) return;
        core.gl.activeTexture(core.gl.TEXTURE0 + unit);
        core.gl.bindTexture(core.gl.TEXTURE_2D, tex);
      },
      /** Gives the target new storage of another size (content cleared), returning the old texture so a caller can copy from it. */
      reallocate(nw, nh) {
        const old = ensure() ? { texture: tex, fbo, w: size.w, h: size.h } : null;
        tex = null;
        fbo = null;
        size = { w: Math.max(1, Math.round(nw)), h: Math.max(1, Math.round(nh)) };
        initial = null;
        return old;
      },
      dispose() {
        release();
        targets.delete(t);
      },
    };
    targets.add(t);
    return t;
  }

  function pair(opts) {
    const p = {
      read: target(opts),
      write: target(opts),
      swap() {
        const r = p.read;
        p.read = p.write;
        p.write = r;
      },
      dispose() {
        p.read.dispose();
        p.write.dispose();
      },
    };
    return p;
  }

  function buffer(data, { dynamic = false } = {}) {
    let buf = null;
    let gen = -1;
    let latest = data;
    const usage = () => (dynamic ? core.gl.DYNAMIC_DRAW : core.gl.STATIC_DRAW);
    const b = {
      [IS_BUFFER]: true,
      get glBuffer() {
        if (core.lost || core.disposed) return null;
        if (!buf || gen !== core.gen) {
          buf = core.gl.createBuffer();
          core.gl.bindBuffer(core.gl.ARRAY_BUFFER, buf);
          core.gl.bufferData(core.gl.ARRAY_BUFFER, latest, usage());
          gen = core.gen;
        }
        return buf;
      },
      /** Replaces part of the contents (byteOffset 0 and a longer array resizes it). */
      update(next, byteOffset = 0) {
        const resized = byteOffset === 0 && next.byteLength !== latest.byteLength;
        if (byteOffset === 0) latest = next;
        else {
          // Keep our copy current too, so a rebuild after a context restore uploads the latest data.
          const merged = new latest.constructor(latest);
          merged.set(next, byteOffset / latest.BYTES_PER_ELEMENT);
          latest = merged;
        }
        if (core.lost || core.disposed || !buf || gen !== core.gen) return;
        core.gl.bindBuffer(core.gl.ARRAY_BUFFER, buf);
        if (resized) core.gl.bufferData(core.gl.ARRAY_BUFFER, latest, usage());
        else core.gl.bufferSubData(core.gl.ARRAY_BUFFER, byteOffset, next);
      },
      dispose() {
        if (buf && gen === core.gen && !core.lost) core.gl.deleteBuffer(buf);
        buf = null;
        buffers.delete(b);
      },
    };
    buffers.add(b);
    return b;
  }

  function disposeAll() {
    [...targets].forEach((t) => t.dispose());
    [...buffers].forEach((b) => b.dispose());
  }

  return { target, pair, buffer, disposeAll };
}
