// Drawing: one full-screen pass, or instanced geometry. Everything goes through draw().
// Does nothing while the context is lost or the Gpu is disposed.

import { IS_TARGET } from "./program.js";

const QUAD = new Float32Array([-1, -1, 3, -1, -1, 3]); // one triangle that covers the screen

export function createDraw(core, programs) {
  let quad = null;
  let quadGen = -1;

  function quadBuffer() {
    const gl = core.gl;
    if (!quad || quadGen !== core.gen) {
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
      quadGen = core.gen;
    }
    return quad;
  }

  const divisor = (i, d) => {
    if (core.version === 2) core.gl.vertexAttribDivisor(i, d);
    else core.ext.instancing.vertexAttribDivisorANGLE(i, d);
  };

  function drawInstanced(mode, vertexCount, instanceCount) {
    if (core.version === 2) core.gl.drawArraysInstanced(mode, 0, vertexCount, instanceCount);
    else core.ext.instancing.drawArraysInstancedANGLE(mode, 0, vertexCount, instanceCount);
  }

  /**
   * draw(program, uniforms, target, options)
   *  - target: a target, or null for the canvas
   *  - options.viewport [x, y, w, h]; options.clear [r, g, b, a]; options.blend "alpha" | "add"
   *  - options.instanced { vertexCount, instanceCount, mode, attributes: [{ buffer, size, divisor }] }
   *    attributes are bound to locations 0, 1, 2… in the order the program declared them.
   */
  function draw(prog, uniforms = {}, target = null, options = {}) {
    if (core.lost || core.disposed) return;
    const gl = core.gl;
    programs.use(prog);
    // A texture is built the first time it is touched. Do that for every input now, before this pass
    // binds its own framebuffer, so building can never redirect the pass.
    for (const v of Object.values(uniforms)) if (v && v[IS_TARGET]) void v.texture;
    let vw;
    let vh;
    if (target) {
      const fbo = target.fbo;
      if (!fbo) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      vw = target.w;
      vh = target.h;
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      vw = gl.drawingBufferWidth;
      vh = gl.drawingBufferHeight;
    }
    const vp = options.viewport ?? [0, 0, vw, vh];
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    if (options.blend === "alpha") {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else if (options.blend === "add") {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.disable(gl.BLEND);
    }
    if (options.clear) {
      gl.clearColor(options.clear[0], options.clear[1], options.clear[2], options.clear[3] ?? 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    programs.setUniforms(prog, uniforms);

    const inst = options.instanced;
    if (!inst) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer());
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    if (core.version === 1 && !core.ext.instancing) throw new Error("This device cannot draw instanced geometry (ANGLE_instanced_arrays).");
    inst.attributes.forEach((a, i) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buffer.glBuffer);
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, a.size, a.type ?? gl.FLOAT, false, a.stride ?? 0, a.offset ?? 0);
      divisor(i, a.divisor ?? 0);
    });
    drawInstanced(inst.mode ?? gl.TRIANGLES, inst.vertexCount, inst.instanceCount);
    // Leave the attribute state as a plain full-screen pass expects it.
    inst.attributes.forEach((_, i) => {
      divisor(i, 0);
      if (i > 0) gl.disableVertexAttribArray(i);
    });
  }

  return { draw };
}
