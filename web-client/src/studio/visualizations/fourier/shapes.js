// Built-in outlines, roughly in [-1, 1]².
const sample = (n, f) => Array.from({ length: n }, (_, i) => f((2 * Math.PI * i) / n));

export const SHAPES = {
  heart: () => sample(200, (t) => [(16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]),
  star: () => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.4 : 1;
      const a = -Math.PI / 2 + (Math.PI * i) / 5;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return pts;
  },
  square: () => [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]],
  flower: () => sample(300, (t) => {
    const r = 0.55 + 0.4 * Math.cos(5 * t);
    return [r * Math.cos(t), r * Math.sin(t)];
  }),
  trefoil: () => sample(300, (t) => [(Math.sin(t) + 2 * Math.sin(2 * t)) / 3, (Math.cos(t) - 2 * Math.cos(2 * t)) / 3]),
};

export const SHAPE_OPTIONS = [
  { value: "heart", label: "Heart" },
  { value: "star", label: "Star" },
  { value: "square", label: "Square" },
  { value: "flower", label: "Flower" },
  { value: "trefoil", label: "Trefoil" },
  { value: "custom", label: "Your drawing" },
];
