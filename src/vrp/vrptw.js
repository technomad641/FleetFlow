// Vehicle Routing Problem with Time Windows (VRPTW). The capacitated problem,
// plus every customer has a hard delivery window [ready, due] and a service
// duration, and the depot has a working day [depotReady, depotDue]. Travel time
// equals distance (the Solomon convention). A vehicle may arrive early and wait,
// but must begin service no later than `due`, and must be back at the depot by
// depotDue. The objective is hierarchical: fewest vehicles first, then least
// distance, with every window respected.
//
// VRPTW is NP-hard and, unlike plain CVRP, the visit ORDER changes feasibility,
// so Clarke-Wright savings does not apply cleanly. The classic construction
// heuristic is Solomon's I1 sequential insertion (1987): grow one route at a
// time, repeatedly inserting the unrouted customer whose best feasible insertion
// is most "worth it", until nothing else fits, then open a new route. We follow
// it with a time-feasible 2-opt that only accepts a reversal if the route stays
// on time.
//
// Routes use the same representation as the CVRP solver: an ordered list of
// point indices into [depot, ...customers], depot = index 0, customer k = k+1.
import { distanceMatrix, points } from "./instance.js";
import { routeDistance } from "./solver.js";

export const VRPTW_SOLVERS = [
  { id: "tw-cvrp", label: "Ignore windows" },
  { id: "tw-i1", label: "Insertion (I1)" },
  { id: "tw-opt", label: "I1 + 2-opt" },
];

const EPS = 1e-6;

// Schedule a single route against the clock. Returns, for each stop, the time
// service begins, plus the depot return time, total waiting, the worst lateness
// (0 when on time), how many stops are served late, and whether the whole route
// is feasible (capacity is checked by the caller; this is purely temporal).
export function routeSchedule(route, instance, dist) {
  const cust = instance.customers;
  const depotReady = instance.depotReady ?? 0;
  const depotDue = instance.depotDue ?? Infinity;

  let time = depotReady;
  let prev = 0;
  let waiting = 0;
  let lateness = 0;
  let lateStops = 0;
  let feasible = true;
  const begins = [];

  for (const idx of route) {
    const c = cust[idx - 1];
    const arrive = time + dist[prev][idx];
    const ready = c.ready ?? 0;
    const due = c.due ?? Infinity;
    const begin = Math.max(arrive, ready);
    if (arrive < ready) waiting += ready - arrive;
    if (begin > due + EPS) {
      feasible = false;
      lateStops += 1;
      lateness = Math.max(lateness, begin - due);
    }
    begins.push(begin);
    time = begin + (c.service ?? 0);
    prev = idx;
  }

  const returnTime = time + dist[prev][0];
  if (returnTime > depotDue + EPS) {
    feasible = false;
    lateness = Math.max(lateness, returnTime - depotDue);
  }

  return {
    begins,
    returnTime,
    waiting,
    lateness,
    lateStops,
    feasible,
    distance: routeDistance(route, dist),
  };
}

function routeLoad(route, instance) {
  return route.reduce((s, idx) => s + instance.customers[idx - 1].demand, 0);
}

// Insert `u` into `route` at `pos` (0 = before the first stop, route.length =
// after the last) and return a new array. Pure.
function withInsertion(route, pos, u) {
  return route.slice(0, pos).concat([u], route.slice(pos));
}

// Solomon I1 sequential insertion.
//
//   c11(i,u,j) = d[i][u] + d[u][j] - mu * d[i][j]     spatial detour of inserting u
//   c12(i,u,j) = b'_j - b_j                            how far u pushes the next stop back
//   c1  = alpha1 * c11 + alpha2 * c12                  insertion cost (best position per u)
//   c2  = lambda * d[0][u] - c1                        "worth it": favour far, cheap-to-insert
//
// Each route seeds with the farthest unrouted customer, then repeatedly inserts
// the customer with the best (max) c2 at its best (min c1) feasible position.
// A position is feasible only if the resulting route breaks no time window or
// capacity. alpha1 + alpha2 = 1.
export function solomonI1(instance, dist, params = {}) {
  const { mu = 1, lambda = 2, alpha1 = 1, alpha2 = 0 } = params;
  const n = instance.customers.length;
  const unrouted = new Set(Array.from({ length: n }, (_, i) => i + 1));
  const routes = [];

  while (unrouted.size) {
    // Seed with the farthest unrouted customer from the depot.
    let seed = -1;
    let far = -Infinity;
    for (const u of unrouted) {
      if (dist[0][u] > far) {
        far = dist[0][u];
        seed = u;
      }
    }
    let route = [seed];
    unrouted.delete(seed);
    let load = instance.customers[seed - 1].demand;

    for (;;) {
      const oldSched = routeSchedule(route, instance, dist);
      let pickU = -1;
      let pickPos = -1;
      let pickC2 = -Infinity;

      for (const u of unrouted) {
        if (load + instance.customers[u - 1].demand > instance.capacity) continue;

        let bestC1 = Infinity;
        let bestPos = -1;
        for (let pos = 0; pos <= route.length; pos += 1) {
          const cand = withInsertion(route, pos, u);
          const sched = routeSchedule(cand, instance, dist);
          if (!sched.feasible) continue;

          const prev = pos === 0 ? 0 : route[pos - 1];
          const next = pos === route.length ? 0 : route[pos];
          const c11 = dist[prev][u] + dist[u][next] - mu * dist[prev][next];

          // Push-forward: how much later the stop after u now begins. For the
          // depot (u inserted last) it is the change in return time.
          const oldNextBegin = pos === route.length ? oldSched.returnTime : oldSched.begins[pos];
          const newNextBegin = pos === route.length ? sched.returnTime : sched.begins[pos + 1];
          const c12 = newNextBegin - oldNextBegin;

          const c1 = alpha1 * c11 + alpha2 * c12;
          if (c1 < bestC1) {
            bestC1 = c1;
            bestPos = pos;
          }
        }

        if (bestPos < 0) continue; // u has no feasible position in this route
        const c2 = lambda * dist[0][u] - bestC1;
        if (c2 > pickC2) {
          pickC2 = c2;
          pickU = u;
          pickPos = bestPos;
        }
      }

      if (pickU < 0) break; // nothing else fits: close this route
      route = withInsertion(route, pickPos, pickU);
      load += instance.customers[pickU - 1].demand;
      unrouted.delete(pickU);
    }

    routes.push(route);
  }

  return routes;
}

// Time-feasible intra-route 2-opt: reverse a segment only when the route stays
// feasible and gets shorter. Reversal changes visit order, so (unlike CVRP
// 2-opt) feasibility must be re-checked, not assumed.
export function twoOptRouteTW(route, instance, dist) {
  if (route.length < 3) return [...route];
  let best = [...route];
  let bestDist = routeSchedule(best, instance, dist).distance;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i += 1) {
      for (let k = i + 1; k < best.length; k += 1) {
        const cand = best
          .slice(0, i)
          .concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const sched = routeSchedule(cand, instance, dist);
        if (sched.feasible && sched.distance + EPS < bestDist) {
          best = cand;
          bestDist = sched.distance;
          improved = true;
        }
      }
    }
  }
  return best;
}

function naiveRoutes(instance) {
  return instance.customers.map((_, i) => [i + 1]);
}

// Solve a VRPTW instance and return routes plus the metrics the UI needs.
//
//   tw-cvrp  - run the plain distance solver, ignoring windows, then schedule it.
//              Usually shorter, and usually LATE: the honest baseline that shows
//              what ignoring the clock costs.
//   tw-i1    - Solomon I1 insertion (time-window feasible).
//   tw-opt   - I1 followed by time-feasible 2-opt.
export function solveVrptw(instance, solverId = "tw-opt", cvrpRoutes) {
  const dist = distanceMatrix(points(instance));
  let routes;
  if (solverId === "tw-cvrp") {
    // Caller passes the distance-only routes (from solver.js) to schedule here.
    routes = cvrpRoutes ?? naiveRoutes(instance);
  } else {
    routes = solomonI1(instance, dist);
    if (solverId === "tw-opt") {
      routes = routes.map((r) => twoOptRouteTW(r, instance, dist));
    }
  }

  const schedules = routes.map((r) => routeSchedule(r, instance, dist));
  const capacityOk = routes.every((r) => routeLoad(r, instance) <= instance.capacity);
  const totalDistance = schedules.reduce((s, x) => s + x.distance, 0);
  const maxLateness = schedules.reduce((m, x) => Math.max(m, x.lateness), 0);
  const lateStops = schedules.reduce((s, x) => s + x.lateStops, 0);
  const waiting = schedules.reduce((s, x) => s + x.waiting, 0);
  const makespan = schedules.reduce((m, x) => Math.max(m, x.returnTime), 0);
  const feasible = capacityOk && schedules.every((x) => x.feasible);

  return {
    routes,
    dist,
    schedules,
    totalDistance,
    vehicles: routes.length,
    feasible,
    capacityOk,
    maxLateness,
    lateStops,
    waiting,
    makespan,
  };
}
