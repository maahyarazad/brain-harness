// Double pendulum. State [θ1, ω1, θ2, ω2], angles from straight down (radians).

export function pendulumDeriv([t1, w1, t2, w2], { m1, m2, l1, l2, g }) {
  const d = t1 - t2;
  const den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
  const a1 =
    (-g * (2 * m1 + m2) * Math.sin(t1) - m2 * g * Math.sin(t1 - 2 * t2) -
      2 * Math.sin(d) * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * Math.cos(d))) / (l1 * den);
  const a2 =
    (2 * Math.sin(d) * (w1 * w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + w2 * w2 * l2 * m2 * Math.cos(d))) /
    (l2 * den);
  return [w1, a1, w2, a2];
}

export function pendulumRK4(s, p, dt) {
  const add = (a, k, f) => a.map((v, i) => v + f * k[i]);
  const k1 = pendulumDeriv(s, p);
  const k2 = pendulumDeriv(add(s, k1, dt / 2), p);
  const k3 = pendulumDeriv(add(s, k2, dt / 2), p);
  const k4 = pendulumDeriv(add(s, k3, dt), p);
  return s.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export function energy([t1, w1, t2, w2], { m1, m2, l1, l2, g }) {
  const T = 0.5 * m1 * l1 * l1 * w1 * w1 + 0.5 * m2 * (l1 * l1 * w1 * w1 + l2 * l2 * w2 * w2 + 2 * l1 * l2 * w1 * w2 * Math.cos(t1 - t2));
  const V = -(m1 + m2) * g * l1 * Math.cos(t1) - m2 * g * l2 * Math.cos(t2);
  return T + V;
}
