import { parseRules, expandLSystem, turtleSegments } from "../../../studio/visualizations/lsystem/kernel.js";
test("Koch depth 1", () => {
  const { rules } = parseRules("F=F+F--F+F");
  expect(expandLSystem("F", rules, 1).string).toBe("F+F--F+F");
});
test("several rules and arrow syntax", () => {
  const r = parseRules("X -> X+YF+\nY=-FX-Y");
  expect(r.ok).toBe(true);
  expect(r.rules).toEqual({ X: "X+YF+", Y: "-FX-Y" });
});
test("unbalanced brackets are an error", () => {
  const r = parseRules("F=F[");
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/brackets/);
});
test("garbage lines are an error", () => expect(parseRules("hello world").ok).toBe(false));
test("expansion stops before the size limit", () => {
  const { rules } = parseRules("F=FF");
  const r = expandLSystem("F", rules, 30, 1000);
  expect(r.capped).toBe(true);
  expect(r.string.length).toBeLessThanOrEqual(1000);
  expect(r.depthReached).toBe(9);
});
test("turtle draws F, skips f, honours brackets", () => {
  const s = turtleSegments("F[+F]f-F", 90);
  expect(s.length / 4).toBe(3);
});
