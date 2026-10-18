// Capacitated Vehicle Routing Problem (CVRP) instances. A depot plus a set of
// customers, each with a location (normalized to [0,1] for the renderer) and a
// demand. A fleet of identical vehicles, each with the same capacity, must start
// and end at the depot and together serve every customer exactly once without
// any vehicle exceeding its capacity. The objective is to minimize total travel
// distance. CVRP is NP-hard; the solver uses heuristics (see solver.js).
//
// This is the "Dispatch" counterpart to the live network simulation: the same
// taste for routing, a different and more classic optimization problem.
import { createRng } from "../sim/rng.js";

export function euclid(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Distance matrix for points indexed [depot, ...customers]. Index 0 is the depot.
export function distanceMatrix(points) {
  const n = points.length;
  const d = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dist = euclid(points[i], points[j]);
      d[i][j] = dist;
      d[j][i] = dist;
    }
  }
  return d;
}

export function points(instance) {
  return [instance.depot, ...instance.customers];
}

// A reproducible random instance: a central depot and `count` customers drawn in
// a few loose clusters (so routes have visible structure), each with a small
// integer demand. Seeded, so the same seed always yields the same layout.
export function randomInstance({ count = 14, capacity = 18, seed = 1 } = {}) {
  const rng = createRng(seed);
  const depot = { x: 0.5, y: 0.5, demand: 0 };
  const clusterCount = Math.max(2, Math.round(count / 5));
  const clusters = Array.from({ length: clusterCount }, () => ({
    x: 0.14 + rng.float() * 0.72,
    y: 0.14 + rng.float() * 0.72,
  }));

  const clamp = (v) => Math.min(0.95, Math.max(0.05, v));
  const customers = [];
  for (let i = 0; i < count; i += 1) {
    const c = rng.pick(clusters);
    customers.push({
      x: clamp(c.x + (rng.float() - 0.5) * 0.24),
      y: clamp(c.y + (rng.float() - 0.5) * 0.24),
      demand: 1 + rng.int(0, 3),
    });
  }
  return { depot, customers, capacity, seed };
}
