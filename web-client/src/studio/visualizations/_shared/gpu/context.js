// WebGL context selection and capability probing (specs/005-.../contracts/gpu-toolkit.md).
//
// A canvas keeps the first context type it is given: after getContext("webgl2"), getContext("2d")
// returns null, and the reverse. So a module cannot "try the GPU, then fall back to 2D" on the
// same canvas. The path is chosen first, on a throwaway canvas (probeGpu), and only then is the
// real canvas given its context.

/** Options for the real context. preserveDrawingBuffer keeps toBlob / captureStream / drawImage
 *  working after an await, when an unpreserved buffer would already be cleared. */
export const CONTEXT_OPTIONS = Object.freeze({
  preserveDrawingBuffer: true,
  antialias: false,
  alpha: false,
  depth: false,
  stencil: false,
  powerPreference: "high-performance",
});

/** "off" forces the processor path: ?gpu=off, globalThis.__VIZ_GPU__ = "off", or ctx.gpuForced = "off". */
export function gpuMode(ctx) {
  if (globalThis.__VIZ_GPU__ === "off") return "off";
  if (ctx?.gpuForced === "off") return "off";
  try {
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("gpu") === "off") return "off";
  } catch {
    /* no location: not forced */
  }
  return "auto";
}

/**
 * Tests and development can force WebGL 1 (to exercise the older-hardware path) with __VIZ_GL_VERSION__ = 1.
 * Compiled out of production builds, where MODE is "production".
 */
const forcedVersion = () => {
  if (import.meta.env.MODE === "production") return null;
  return globalThis.__VIZ_GL_VERSION__ === 1 || globalThis.__VIZ_GL_VERSION__ === 2 ? globalThis.__VIZ_GL_VERSION__ : null;
};

/**
 * A real WebGL context, not something that merely answers getContext. The test canvas stub in this
 * project returns a fake 2D object for every context type, and a real context has all of these.
 */
export function isRealGl(gl) {
  try {
    return (
      Boolean(gl) &&
      typeof gl.getExtension === "function" &&
      typeof gl.createShader === "function" &&
      typeof gl.getParameter === "function" &&
      typeof gl.getParameter(gl.VERSION) === "string"
    );
  } catch {
    return false;
  }
}

/** Is a RGBA texture with this format and type usable as a render target on this context? */
function renderable(gl, internalFormat, type) {
  const tex = gl.createTexture();
  const fb = gl.createFramebuffer();
  let ok = false;
  try {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 2, 2, 0, gl.RGBA, type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE && gl.getError() === gl.NO_ERROR;
  } catch {
    ok = false;
  }
  while (gl.getError() !== gl.NO_ERROR) {
    /* drain any error left by an unsupported format */
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fb);
  gl.deleteTexture(tex);
  return ok;
}

/** Turns on every extension this toolkit can use. Extensions are per context, so the real context calls this too. */
export function enableExtensions(gl, version) {
  const get = (n) => gl.getExtension(n);
  if (version === 2) {
    return {
      colorBufferFloat: get("EXT_color_buffer_float"),
      colorBufferHalfFloat: get("EXT_color_buffer_half_float"),
      floatLinear: get("OES_texture_float_linear"),
      loseContext: get("WEBGL_lose_context"),
    };
  }
  return {
    floatTexture: get("OES_texture_float"),
    colorBufferFloat: get("WEBGL_color_buffer_float"),
    halfFloat: get("OES_texture_half_float"),
    colorBufferHalfFloat: get("EXT_color_buffer_half_float"),
    floatLinear: get("OES_texture_float_linear"),
    halfFloatLinear: get("OES_texture_half_float_linear"),
    instancing: get("ANGLE_instanced_arrays"),
    loseContext: get("WEBGL_lose_context"),
  };
}

function capsOf(gl, version) {
  const ext = enableExtensions(gl, version);
  let floatTarget;
  let halfFloatTarget;
  let linearHalf;
  let instancing;
  if (version === 2) {
    floatTarget = Boolean(ext.colorBufferFloat) && renderable(gl, gl.RGBA32F, gl.FLOAT);
    halfFloatTarget = Boolean(ext.colorBufferFloat || ext.colorBufferHalfFloat) && renderable(gl, gl.RGBA16F, gl.HALF_FLOAT);
    linearHalf = true; // half-float textures are filterable in core WebGL 2
    instancing = true;
  } else {
    floatTarget = Boolean(ext.floatTexture && ext.colorBufferFloat) && renderable(gl, gl.RGBA, gl.FLOAT);
    halfFloatTarget = Boolean(ext.halfFloat && ext.colorBufferHalfFloat) && renderable(gl, gl.RGBA, ext.halfFloat.HALF_FLOAT_OES);
    linearHalf = Boolean(ext.halfFloatLinear);
    instancing = Boolean(ext.instancing);
  }
  let renderer = "";
  try {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    /* the renderer name is for the measurements only */
  }
  return {
    version,
    floatTarget,
    halfFloatTarget,
    linearHalf,
    linearFloat: Boolean(ext.floatLinear),
    instancing,
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    renderer,
    lose: ext.loseContext,
  };
}

const baseCache = new Map(); // forced version (or "auto") → capabilities, or null if there is no WebGL
const resultCache = new Map(); // "version|need" → the object probeGpu returns

export function resetProbeCache() {
  baseCache.clear();
  resultCache.clear();
}

function readBase(forced) {
  const order = forced ? [forced] : [2, 1];
  for (const version of order) {
    let gl = null;
    try {
      gl = document.createElement("canvas").getContext(version === 2 ? "webgl2" : "webgl");
    } catch {
      gl = null;
    }
    if (!isRealGl(gl)) continue;
    const { lose, ...caps } = capsOf(gl, version);
    // Give the context slot back: browsers cap live contexts, and this one was only a probe.
    try {
      lose?.loseContext();
    } catch {
      /* ignore */
    }
    return caps;
  }
  return null;
}

/**
 * What this browser can do: { ok, version, floatTarget, halfFloatTarget, linearHalf, linearFloat,
 * instancing, maxTexture, renderer }. `ok` is true when a context could be made and every name in
 * `need` is true. Cached for the page, per (forced version, need).
 */
export function probeGpu({ need = [] } = {}) {
  const forced = forcedVersion();
  const baseKey = String(forced ?? "auto");
  const key = `${baseKey}|${[...need].sort().join(",")}`;
  const hit = resultCache.get(key);
  if (hit) return hit;
  if (!baseCache.has(baseKey)) baseCache.set(baseKey, readBase(forced));
  const base = baseCache.get(baseKey);
  const result = base
    ? { ...base, ok: need.every((n) => base[n] === true), missing: need.filter((n) => base[n] !== true) }
    : { ok: false, version: 0, floatTarget: false, halfFloatTarget: false, linearHalf: false, linearFloat: false, instancing: false, maxTexture: 0, renderer: "", missing: need };
  resultCache.set(key, result);
  return result;
}

/** The real context for the module's canvas, or null. Only called after probeGpu said ok. */
export function acquireContext(canvas, caps) {
  let gl = null;
  try {
    gl = canvas.getContext(caps.version === 2 ? "webgl2" : "webgl", CONTEXT_OPTIONS);
  } catch {
    gl = null;
  }
  return isRealGl(gl) ? gl : null;
}
