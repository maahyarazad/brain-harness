import { SOURCES, UNIFORMS, LIMITS } from "../../../studio/visualizations/fluid/shaders.js";

// The shaders are plain data, so what they promise can be checked without a GPU. Whether they
// compile and compute the right thing is checked in the GPU test project.

describe("fluid shader sources", () => {
  test("every program has a main(), declares what it writes, and has no #version line (GLSL ES 1.00)", () => {
    for (const [name, src] of Object.entries(SOURCES)) {
      expect(src, name).toMatch(/void main\s*\(\s*\)/);
      expect(src, name).toContain("gl_FragColor");
      expect(src, name).not.toMatch(/#version/);
      expect(src, name).not.toMatch(/texelFetch|texture\(|\bin\s+vec|\bout\s+vec/); // WebGL 2 only syntax
      expect(src, name).not.toMatch(/\bprecision\b/); // the toolkit adds it
    }
  });

  test("every uniform the instance sets is declared in its shader", () => {
    for (const [name, uniforms] of Object.entries(UNIFORMS)) {
      for (const u of uniforms) expect(SOURCES[name], `${name}.${u}`).toMatch(new RegExp(`uniform\\s+\\w+\\s+${u}\\s*;`));
    }
  });

  test("every declared uniform is listed, so a rename cannot leave a stale name behind", () => {
    for (const [name, uniforms] of Object.entries(UNIFORMS)) {
      const declared = [...SOURCES[name].matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]);
      expect(declared.sort(), name).toEqual([...uniforms].sort());
    }
  });

  test("the advection pass divides by a divisor (dissipation) and filters by hand when it must", () => {
    expect(SOURCES.advect).toContain("/ uDivisor");
    expect(SOURCES.advect).toContain("#ifdef MANUAL_FILTER");
  });

  test("the walls reflect the flow in the divergence pass", () => {
    expect(SOURCES.divergence).toMatch(/-here\.x/);
    expect(SOURCES.divergence).toMatch(/-here\.y/);
  });

  test("velocity and dye are clamped, so an extreme setting cannot run away", () => {
    for (const name of ["splat", "vorticity", "gradient", "advect"]) expect(SOURCES[name], name).toMatch(/clamp\(/);
    expect(LIMITS.velocity).toBeGreaterThan(0);
    expect(LIMITS.dye).toBeGreaterThan(0);
  });

  test("the display rolls strong ink off instead of clipping it", () => {
    expect(SOURCES.display).toContain("exp(");
  });
});
