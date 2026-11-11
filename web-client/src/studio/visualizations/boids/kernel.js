// Boids: separation, alignment and cohesion, with a uniform-grid spatial hash.
// World is the unit box [0, aspect] × [0, 1], wrapping at the edges.

export function createFlock(count, aspect, rng) {
  const pos = new Float32Array(count * 2);
  const vel = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    pos[i * 2] = rng() * aspect;
    pos[i * 2 + 1] = rng();
    const a = rng() * Math.PI * 2;
    vel[i * 2] = Math.cos(a) * 0.002;
    vel[i * 2 + 1] = Math.sin(a) * 0.002;
  }
  return { count, aspect, pos, vel };
}

/**
 * params: { separation, alignment, cohesion, radius (world units), maxSpeed (world units/step),
 *           attractor: null | { x, y, strength } }
 */
export function flockStep(flock, params) {
  const { count, aspect, pos, vel } = flock;
  const { separation, alignment, cohesion, radius, maxSpeed, attractor } = params;
  const cell = Math.max(radius, 0.01);
  const cols = Math.max(1, Math.ceil(aspect / cell));
  const rows = Math.max(1, Math.ceil(1 / cell));
  const heads = new Int32Array(cols * rows).fill(-1);
  const nextIdx = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const cx = Math.min(cols - 1, Math.floor(pos[i * 2] / cell));
    const cy = Math.min(rows - 1, Math.floor(pos[i * 2 + 1] / cell));
    const c = cy * cols + cx;
    nextIdx[i] = heads[c];
    heads[c] = i;
  }
  const r2 = radius * radius;
  const sepR2 = r2 * 0.25;
  const nv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = pos[i * 2], y = pos[i * 2 + 1];
    let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0;
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const c = ((gy + oy + rows) % rows) * cols + ((gx + ox + cols) % cols);
        for (let j = heads[c]; j >= 0; j = nextIdx[j]) {
          if (j === i) continue;
          let dx = pos[j * 2] - x, dy = pos[j * 2 + 1] - y;
          if (dx > aspect / 2) dx -= aspect; else if (dx < -aspect / 2) dx += aspect;
          if (dy > 0.5) dy -= 1; else if (dy < -0.5) dy += 1;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          n++;
          ax += vel[j * 2];
          ay += vel[j * 2 + 1];
          cx += dx;
          cy += dy;
          if (d2 < sepR2 && d2 > 0) {
            sx -= dx / d2;
            sy -= dy / d2;
          }
        }
      }
    }
    let vx = vel[i * 2], vy = vel[i * 2 + 1];
    if (n > 0) {
      vx += (ax / n - vx) * 0.05 * alignment;
      vy += (ay / n - vy) * 0.05 * alignment;
      vx += (cx / n) * 0.002 * cohesion;
      vy += (cy / n) * 0.002 * cohesion;
      vx += sx * 0.0000015 * separation;
      vy += sy * 0.0000015 * separation;
    }
    if (attractor) {
      const dx = attractor.x - x, dy = attractor.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.05;
      vx += (dx / d) * 0.0002 * attractor.strength;
      vy += (dy / d) * 0.0002 * attractor.strength;
    }
    const sp = Math.sqrt(vx * vx + vy * vy);
    const min = maxSpeed * 0.3;
    if (sp > maxSpeed) {
      vx = (vx / sp) * maxSpeed;
      vy = (vy / sp) * maxSpeed;
    } else if (sp < min && sp > 0) {
      vx = (vx / sp) * min;
      vy = (vy / sp) * min;
    }
    nv[i * 2] = vx;
    nv[i * 2 + 1] = vy;
  }
  for (let i = 0; i < count; i++) {
    vel[i * 2] = nv[i * 2];
    vel[i * 2 + 1] = nv[i * 2 + 1];
    pos[i * 2] = (pos[i * 2] + vel[i * 2] + aspect) % aspect;
    pos[i * 2 + 1] = (pos[i * 2 + 1] + vel[i * 2 + 1] + 1) % 1;
  }
}
