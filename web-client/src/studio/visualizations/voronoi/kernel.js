// Voronoi helpers. Points are in normalized coordinates [0,1]².
import { Delaunay } from "d3-delaunay";

export function randomPoints(n, rng) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([rng(), rng()]);
  return out;
}

/** Polygon centroid (shoelace). */
function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-12) return null;
  return [cx / (3 * a), cy / (3 * a)];
}

/** One Lloyd relaxation step with the Euclidean metric: move each point to its cell's centroid. */
export function lloydStep(points) {
  const voronoi = Delaunay.from(points).voronoi([0, 0, 1, 1]);
  return points.map((p, i) => {
    const poly = voronoi.cellPolygon(i);
    return (poly && centroid(poly)) || p;
  });
}

/** Nearest point index per raster cell using the Manhattan metric. */
export function manhattanRaster(points, w, h) {
  const out = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / w;
      let best = 0, bd = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(points[i][0] - fx) * w + Math.abs(points[i][1] - fy) * h;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      out[y * w + x] = best;
    }
  }
  return out;
}

/** Lloyd step for the Manhattan metric: centroid of each point's raster cells. */
export function manhattanLloyd(points, raster, w, h) {
  const sx = new Float64Array(points.length), sy = new Float64Array(points.length), n = new Float64Array(points.length);
  for (let i = 0; i < raster.length; i++) {
    const k = raster[i];
    sx[k] += ((i % w) + 0.5) / w;
    sy[k] += (Math.floor(i / w) + 0.5) / h;
    n[k]++;
  }
  return points.map((p, k) => (n[k] ? [sx[k] / n[k], sy[k] / n[k]] : p));
}
