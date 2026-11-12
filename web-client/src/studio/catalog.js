// Metadata for every visualization. Modules are loaded lazily with import().

export const CATEGORIES = [
  { id: "number-patterns", name: "Number patterns" },
  { id: "fractals", name: "Fractals" },
  { id: "simulation", name: "Simulation and emergence" },
  { id: "geometry-dynamics", name: "Geometry and dynamics" },
  { id: "algorithms", name: "Algorithm visualizations" },
];

const e = (id, name, category, glyph, summary, load) => ({ id, name, category, glyph, summary, load });

export const CATALOG = [
  e("collatz-coral", "Collatz coral", "number-patterns", "⟲", "Trace each number's Collatz path back from 1, bending one way on even steps and the other on odd steps.", () => import("./visualizations/collatz/index.js")),
  e("ulam-spiral", "Ulam spiral", "number-patterns", "▦", "Write the integers in a spiral and mark the primes. Unexplained diagonal lines appear.", () => import("./visualizations/ulam/index.js")),
  e("recaman", "Recamán's sequence", "number-patterns", "◠", "Go back n if you can, otherwise forward n. Drawn as arcs it looks like nested rainbows.", () => import("./visualizations/recaman/index.js")),
  e("times-table", "Times-table circle", "number-patterns", "◎", "Connect point k to k × m mod N around a circle. Cardioids and flowers appear.", () => import("./visualizations/timesTable/index.js")),
  e("pascal-mod", "Pascal's triangle mod n", "number-patterns", "△", "Color each entry of Pascal's triangle by its remainder. Mod 2 gives the Sierpiński triangle.", () => import("./visualizations/pascalMod/index.js")),
  e("mandelbrot", "Mandelbrot set", "fractals", "✺", "Repeat z → z² + c and color each point c by how fast it escapes.", () => import("./visualizations/mandelbrot/index.js")),
  e("julia", "Julia set", "fractals", "❋", "The same rule with c fixed, coloring each starting point z by how fast it escapes.", () => import("./visualizations/julia/index.js")),
  e("chaos-game", "Chaos game", "fractals", "⁂", "Jump a fraction of the way toward a random corner, again and again.", () => import("./visualizations/chaosGame/index.js")),
  e("l-system", "L-system", "fractals", "⚘", "Rewrite a string with simple rules, then draw it with turtle graphics.", () => import("./visualizations/lsystem/index.js")),
  e("barnsley-fern", "Barnsley fern", "fractals", "❦", "Pick one of four affine transforms at random, apply it, repeat. A fern appears.", () => import("./visualizations/barnsley/index.js")),
  e("game-of-life", "Game of Life", "simulation", "▣", "Grid cells live or die by how many neighbors they have.", () => import("./visualizations/life/index.js")),
  e("elementary-ca", "Elementary cellular automaton", "simulation", "▤", "A row of cells where each next row follows from 3-cell neighborhoods. Rule 30, Rule 110…", () => import("./visualizations/elementaryCA/index.js")),
  e("gray-scott", "Reaction–diffusion", "simulation", "◍", "Two simulated chemicals react and spread into stripes, spots and coral (Gray–Scott).", () => import("./visualizations/grayScott/index.js")),
  e("boids", "Boids", "simulation", "➤", "Separation, alignment and cohesion produce a realistic flock.", () => import("./visualizations/boids/index.js")),
  e("langtons-ant", "Langton's ant", "simulation", "✳", "An ant turns by the color of its cell. After chaos, it builds a highway.", () => import("./visualizations/langton/index.js")),
  e("dla", "Diffusion-limited aggregation", "simulation", "❄", "Random walkers stick when they touch the cluster, growing frost and lightning shapes.", () => import("./visualizations/dla/index.js")),
  e("lorenz", "Lorenz attractor", "geometry-dynamics", "∞", "A 3-D butterfly traced by a chaotic weather model. Two close starts drift apart.", () => import("./visualizations/lorenz/index.js")),
  e("double-pendulum", "Double pendulum", "geometry-dynamics", "⚲", "Two linked pendulums swing chaotically and trace wild paths.", () => import("./visualizations/doublePendulum/index.js")),
  e("voronoi", "Voronoi and Delaunay", "geometry-dynamics", "⬡", "Split the plane by nearest seed point, and connect neighboring seeds.", () => import("./visualizations/voronoi/index.js")),
  e("fourier-epicycles", "Fourier epicycles", "geometry-dynamics", "◴", "Chains of rotating circles redraw an outline. More circles, sharper drawing.", () => import("./visualizations/fourier/index.js")),
  e("phyllotaxis", "Phyllotaxis", "geometry-dynamics", "✿", "Place each point at a fixed angle from the last. At the golden angle, a sunflower.", () => import("./visualizations/phyllotaxis/index.js")),
  e("sorting", "Sorting algorithms", "algorithms", "▁▃▅", "Watch bubble, insertion, selection, quick, merge and heap sort rearrange an array.", () => import("./visualizations/sorting/index.js")),
  e("maze", "Maze generation and pathfinding", "algorithms", "⌗", "Build a maze with DFS, Prim's or Wilson's algorithm, then solve it with A*, Dijkstra or BFS.", () => import("./visualizations/maze/index.js")),
];

export function findEntry(id) {
  return CATALOG.find((x) => x.id === id) ?? null;
}
