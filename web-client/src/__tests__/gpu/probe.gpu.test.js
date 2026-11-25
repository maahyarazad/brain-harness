// Spike (task T004): does this browser give WebGL2 and an exact float32 render target?
// Deliberately independent of the GPU toolkit, so a failure here means the environment,
// not our code. The toolkit's own tests are in toolkit.gpu.test.js.
import { describe, expect, test } from "vitest";

describe("headless browser WebGL", () => {
  test("provides WebGL2 with float render targets", () => {
    const gl = document.createElement("canvas").getContext("webgl2");
    expect(gl, "getContext('webgl2') returned null").not.toBeNull();
    expect(gl.getExtension("EXT_color_buffer_float")).toBeTruthy();
    expect(gl.getExtension("EXT_color_buffer_half_float")).toBeTruthy();
  });

  test("round-trips a float32 value exactly through a render target", () => {
    const gl = document.createElement("canvas").getContext("webgl2");
    gl.getExtension("EXT_color_buffer_float");
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, 4, 0, gl.RGBA, gl.FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    expect(gl.checkFramebufferStatus(gl.FRAMEBUFFER)).toBe(gl.FRAMEBUFFER_COMPLETE);
    gl.clearColor(0.1234567, 0.5, 0.25, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
    expect(Math.abs(px[0] - 0.1234567)).toBeLessThan(1e-7);
    expect(px[1]).toBe(0.5);
    expect(px[2]).toBe(0.25);
  });

  test("also provides WebGL1 with half-float render targets (the 'older hardware' path)", () => {
    const gl = document.createElement("canvas").getContext("webgl");
    expect(gl).not.toBeNull();
    expect(gl.getExtension("OES_texture_half_float")).toBeTruthy();
    expect(gl.getExtension("EXT_color_buffer_half_float")).toBeTruthy();
  });
});
