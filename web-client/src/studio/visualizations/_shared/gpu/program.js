// Shader programs: compiled lazily, once per name, rebuilt after a context restore.
// Shaders are GLSL ES 1.00 (no #version line), which WebGL 1 and WebGL 2 both accept
// (specs/005-.../research.md R1).

/** Full-screen triangle; provides vUv in 0..1. */
export const DEFAULT_VERTEX = `attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const numbered = (src) =>
  src
    .split("\n")
    .map((l, i) => `${String(i + 1).padStart(4)}: ${l}`)
    .join("\n");

/** Marks a value that draw() should bind as a texture. Set by targets.js. */
export const IS_TARGET = Symbol("gpu.target");

export function createPrograms(core) {
  const records = new Map();

  function prefix(stage) {
    const lines = [];
    if (stage === "fragment") {
      lines.push("#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;", "#else", "precision mediump float;", "#endif");
      // Shaders that filter half-float textures read four texels and mix them by hand when the
      // hardware cannot filter them (WebGL 1 without OES_texture_half_float_linear).
      if (!core.caps.linearHalf) lines.push("#define MANUAL_FILTER");
    }
    return lines.length ? lines.join("\n") + "\n" : "";
  }

  function compile(type, stage, src, name) {
    const gl = core.gl;
    const sh = gl.createShader(type);
    const full = prefix(stage) + src;
    gl.shaderSource(sh, full);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`Shader "${name}" (${stage}) failed to compile:\n${log}\n${numbered(full)}`);
    }
    return sh;
  }

  function build(rec) {
    const gl = core.gl;
    const vs = compile(gl.VERTEX_SHADER, "vertex", rec.vertex, rec.name);
    const fs = compile(gl.FRAGMENT_SHADER, "fragment", rec.fragment, rec.name);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    rec.attributes.forEach((a, i) => gl.bindAttribLocation(program, i, a));
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Shader "${rec.name}" failed to link:\n${log}`);
    }
    rec.program = program;
    rec.locations = new Map();
    rec.gen = core.gen;
  }

  /** Same name, same program: the first source wins. Compiles on first use. */
  function program(name, fragment, { vertex = DEFAULT_VERTEX, attributes = ["aPosition"] } = {}) {
    let rec = records.get(name);
    if (!rec) {
      rec = { name, fragment, vertex, attributes, program: null, locations: new Map(), gen: -1 };
      records.set(name, rec);
    }
    return rec;
  }

  /** Makes sure the program exists on the current context, then makes it current. */
  function use(rec) {
    const gl = core.gl;
    if (!rec.program || rec.gen !== core.gen) build(rec);
    gl.useProgram(rec.program);
    return rec.program;
  }

  function location(rec, name) {
    if (!rec.locations.has(name)) rec.locations.set(name, core.gl.getUniformLocation(rec.program, name));
    return rec.locations.get(name);
  }

  /**
   * Sets uniforms on the current program. Numbers are floats; `{ int: n }` is an integer; arrays of
   * 2, 3 or 4 are vectors; longer arrays are float arrays; a target is bound to the next texture unit.
   */
  function setUniforms(rec, uniforms) {
    const gl = core.gl;
    let unit = 0;
    for (const [name, v] of Object.entries(uniforms)) {
      const loc = location(rec, name);
      if (loc === null) continue; // the compiler removed an unused uniform
      if (typeof v === "number") gl.uniform1f(loc, v);
      else if (typeof v === "boolean") gl.uniform1f(loc, v ? 1 : 0);
      else if (v && v[IS_TARGET]) {
        v.bind(unit);
        gl.uniform1i(loc, unit);
        unit += 1;
      } else if (v && typeof v === "object" && "int" in v) gl.uniform1i(loc, v.int);
      else if (Array.isArray(v) || ArrayBuffer.isView(v)) {
        if (v.length === 1) gl.uniform1f(loc, v[0]);
        else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
        else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
        else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
        else gl.uniform1fv(loc, v);
      }
    }
  }

  function dispose() {
    for (const rec of records.values()) {
      if (rec.program) core.gl.deleteProgram(rec.program);
      rec.program = null;
    }
    records.clear();
  }

  return { program, use, setUniforms, dispose };
}
