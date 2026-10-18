// CVRP solver. Three levels, so the Dispatch view can show the same kind of
// contrast the live simulation does (naive vs smart vs optimized):
//
//   naive         - one vehicle per customer. The trivial, terrible baseline.
//   savings        - Clarke-Wright parallel savings: merge routes whose endpoints
//                    are cheap to join, respecting capacity. The classic CVRP
//                    construction heuristic.
//   savings + 2-opt - run 2-opt within each route to undo crossings.
//
// Point indices are into [depot, ...customers], so index 0 is always the depot
// and customer k is index k+1. A "route" is the ordered list of customer point
// indices between the depot at each end.
import { distanceMatrix, points } from "./instance.js";

export const SOLVERS = [
  { id: "naive", label: "One per stop" },
  { id: "savings", label: "Savings" },
  { id: "opt", label: "Savings + 2-opt" },
];

export function routeDistance(route, dist) {
  let total = 0;
  let prev = 0; // depot
  for (const idx of route) {
    total += dist[prev][idx];
    prev = idx;
  }
  return total + dist[prev][0]; // back to depot
}

export function solutionDistance(routes, dist) {
  return routes.reduce((sum, r) => sum + routeDistance(r, dist), 0);
}

// One vehicle per customer.
export function naive(instance) {
  return instance.customers.map((_, i) => [i + 1]);
}

// Clarke-Wright parallel savings.
export function clarkeWright(instance, dist) {
  const n = instance.customers.length;
  const demandOf = (idx) => instance.customers[idx - 1].demand;

  const routes = [];
  const routeOf = new Map(); // point index -> its route array
  const load = new Map(); // route array -> total demand
  for (let i = 1; i <= n; i += 1) {
    const r = [i];
    routes.push(r);
    routeOf.set(i, r);
    load.set(r, demandOf(i));
  }

  const savings = [];
  for (let i = 1; i <= n; i += 1) {
    for (let j = i + 1; j <= n; j += 1) {
      savings.push([dist[0][i] + dist[0][j] - dist[i][j], i, j]);
    }
  }
  savings.sort((a, b) => b[0] - a[0]);

  for (const [, i, j] of savings) {
    const ri = routeOf.get(i);
    const rj = routeOf.get(j);
    if (ri === rj) continue;
    if (load.get(ri) + load.get(rj) > instance.capacity) continue;

    // i and j must each be at an end of their route to be joined.
    const iStart = ri[0] === i;
    const iEnd = ri[ri.length - 1] === i;
    const jStart = rj[0] === j;
    const jEnd = rj[rj.length - 1] === j;
    if (!(iStart || iEnd) || !(jStart || jEnd)) continue;

    // Orient so the new route reads ...i, j...
    const left = iEnd ? ri : [...ri].reverse();
    const right = jStart ? rj : [...rj].reverse();
    const merged = left.concat(right);
    const newLoad = load.get(ri) + load.get(rj);

    routes.splice(routes.indexOf(rj), 1);
    load.delete(rj);
    ri.length = 0;
    for (const x of merged) ri.push(x);
    load.set(ri, newLoad);
    for (const x of merged) routeOf.set(x, ri);
  }

  return routes.map((r) => [...r]);
}

// 2-opt within a single route: repeatedly reverse a segment when doing so
// shortens the depot-anchored tour, until no improving move remains.
export function twoOptRoute(route, dist) {
  if (route.length < 3) return [...route];
  const tour = [0, ...route, 0];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < tour.length - 2; i += 1) {
      for (let k = i + 1; k < tour.length - 1; k += 1) {
        const a = tour[i - 1];
        const b = tour[i];
        const c = tour[k];
        const d = tour[k + 1];
        if (dist[a][c] + dist[b][d] + 1e-9 < dist[a][b] + dist[c][d]) {
          let lo = i;
          let hi = k;
          while (lo < hi) {
            const tmp = tour[lo];
            tour[lo] = tour[hi];
            tour[hi] = tmp;
            lo += 1;
            hi -= 1;
          }
          improved = true;
        }
      }
    }
  }
  return tour.slice(1, -1);
}

export function optimize(routes, dist) {
  return routes.map((r) => twoOptRoute(r, dist));
}

// Solve and return the routes plus the metrics the UI needs.
export function solve(instance, solverId = "opt") {
  const dist = distanceMatrix(points(instance), instance.roundDistances);
  let routes;
  if (solverId === "naive") {
    routes = naive(instance);
  } else {
    routes = clarkeWright(instance, dist);
    if (solverId === "opt") routes = optimize(routes, dist);
  }
  return {
    routes,
    dist,
    totalDistance: solutionDistance(routes, dist),
    vehicles: routes.length,
  };
}
