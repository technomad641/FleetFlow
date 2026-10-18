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
  return { depot, customers, capacity, seed, kind: "cvrp" };
}

// True when an instance carries time windows (VRPTW), i.e. every customer has a
// due time. CVRP instances have none, so the plain distance solvers apply.
export function hasTimeWindows(instance) {
  return Boolean(instance) && instance.customers.every((c) => Number.isFinite(c.due));
}

// A reproducible VRPTW instance: the capacitated problem plus a hard delivery
// window [ready, due] and a service duration at each customer, and a working
// day [depotReady, depotDue] for the depot. Travel time equals distance (the
// Solomon convention), so coordinates live in a 0..100 space (not [0,1]) to give
// time windows a meaningful scale; the renderer normalizes by bounding box.
//
// Windows are derived from a feasible template so the instance is guaranteed
// solvable: we first build greedy nearest-neighbour routes under capacity,
// schedule them, and set each customer's window around the time the template
// visits it. The template is then a feasible solution by construction, and a
// direct depot->customer->depot trip is feasible for every customer (triangle
// inequality), so even one-truck-per-stop is feasible — the solver's job is to
// cut vehicles and distance while keeping every delivery on time.
export function randomVrptwInstance({
  count = 18,
  capacity = 50,
  seed = 1,
  service = 8,
  slack = 40,
} = {}) {
  const rng = createRng(seed);
  const depot = { x: 50, y: 50, demand: 0 };
  const clusterCount = Math.max(2, Math.round(count / 5));
  const clusters = Array.from({ length: clusterCount }, () => ({
    x: 14 + rng.float() * 72,
    y: 14 + rng.float() * 72,
  }));

  const clamp = (v) => Math.min(95, Math.max(5, v));
  const customers = [];
  for (let i = 0; i < count; i += 1) {
    const c = rng.pick(clusters);
    customers.push({
      x: clamp(c.x + (rng.float() - 0.5) * 24),
      y: clamp(c.y + (rng.float() - 0.5) * 24),
      demand: 1 + rng.int(0, 8),
    });
  }

  const pts = [depot, ...customers];
  const D = (a, b) => euclid(pts[a], pts[b]);

  // Greedy nearest-neighbour template routes under capacity.
  const remaining = new Set(customers.map((_, i) => i + 1));
  const templateRoutes = [];
  while (remaining.size) {
    let cur = 0;
    let load = 0;
    const route = [];
    for (;;) {
      let best = -1;
      let bd = Infinity;
      for (const u of remaining) {
        if (load + customers[u - 1].demand > capacity) continue;
        const d = D(cur, u);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      if (best < 0) break;
      route.push(best);
      remaining.delete(best);
      load += customers[best - 1].demand;
      cur = best;
    }
    if (!route.length) break; // a single customer exceeds capacity: give up cleanly
    templateRoutes.push(route);
  }

  // Derive each customer's window from the template visit time.
  for (const route of templateRoutes) {
    let time = 0;
    let prev = 0;
    for (const u of route) {
      const begin = time + D(prev, u); // template has no earlier windows, so no waiting
      const c = customers[u - 1];
      c.ready = Math.max(0, Math.round(begin - rng.float() * slack));
      c.due = Math.round(begin + slack * (0.5 + rng.float()));
      c.service = service;
      time = begin + service;
      prev = u;
    }
  }

  // A generous working day: the template finishes inside it with margin.
  let maxFinish = 0;
  for (const route of templateRoutes) {
    let time = 0;
    let prev = 0;
    for (const u of route) {
      const begin = Math.max(time + D(prev, u), customers[u - 1].ready);
      time = begin + service;
      prev = u;
    }
    maxFinish = Math.max(maxFinish, time + D(prev, 0));
  }

  return {
    depot,
    customers,
    capacity,
    seed,
    service,
    depotReady: 0,
    depotDue: Math.round(maxFinish * 1.4 + 50),
    kind: "vrptw",
  };
}
