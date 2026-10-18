import assert from "node:assert/strict";
import {
  solve,
  naive,
  clarkeWright,
  optimize,
  routeDistance,
  solutionDistance,
} from "./solver.js";
import { distanceMatrix, points, randomInstance } from "./instance.js";

// Two tight clusters on the axes; capacity 3 forces exactly two routes of three.
// The optimal solution is obvious: serve each axis as one route (total 12).
const AXES = {
  depot: { x: 0, y: 0, demand: 0 },
  customers: [
    { x: 0, y: 1, demand: 1 },
    { x: 0, y: 2, demand: 1 },
    { x: 0, y: 3, demand: 1 },
    { x: 1, y: 0, demand: 1 },
    { x: 2, y: 0, demand: 1 },
    { x: 3, y: 0, demand: 1 },
  ],
  capacity: 3,
};

function covers(routes, n) {
  const seen = routes.flat().sort((a, b) => a - b);
  const expected = Array.from({ length: n }, (_, i) => i + 1);
  return JSON.stringify(seen) === JSON.stringify(expected);
}

function loadOk(routes, instance) {
  return routes.every(
    (r) => r.reduce((s, idx) => s + instance.customers[idx - 1].demand, 0) <= instance.capacity
  );
}

export default function runSolverTests() {
  const dist = distanceMatrix(points(AXES));

  // routeDistance is depot-anchored at both ends.
  assert.equal(routeDistance([1, 2, 3], dist), 6); // 1 + 1 + 1 + back 3

  // Naive: one route per customer, and the worst distance.
  const n0 = naive(AXES);
  assert.equal(n0.length, 6);
  assert.ok(covers(n0, 6));
  assert.equal(solutionDistance(n0, dist), 24);

  // Savings covers everyone, respects capacity, and beats naive.
  const cw = clarkeWright(AXES, dist);
  assert.ok(covers(cw, 6), "savings must visit every customer once");
  assert.ok(loadOk(cw, AXES), "savings must respect capacity");
  assert.equal(cw.length, 2, "savings should find two routes");
  assert.ok(solutionDistance(cw, dist) < 24);

  // 2-opt never makes a route longer.
  const opt = optimize(cw, dist);
  assert.ok(solutionDistance(opt, dist) <= solutionDistance(cw, dist) + 1e-9);

  // On this instance the heuristic reaches the known optimum (12).
  const solved = solve(AXES, "opt");
  assert.ok(solved.totalDistance <= 12 + 1e-6, `expected ~12, got ${solved.totalDistance}`);
  assert.equal(solved.vehicles, 2);

  // 2-opt actually removes a crossing when one exists. Four points on a square,
  // given to the solver in a crossing order, should become the convex loop (4).
  const square = {
    depot: { x: 0, y: 0, demand: 0 },
    customers: [
      { x: 0, y: 1, demand: 1 },
      { x: 1, y: 1, demand: 1 },
      { x: 1, y: 0, demand: 1 },
    ],
    capacity: 10,
  };
  const sqDist = distanceMatrix(points(square));
  const crossing = [1, 3, 2]; // (0,1)->(1,0)->(1,1): crosses
  const fixed = optimize([crossing], sqDist);
  assert.ok(solutionDistance(fixed, sqDist) < routeDistance(crossing, sqDist));

  // On a larger random instance, the ordering holds: naive > savings >= opt,
  // everyone is covered, and capacity is respected.
  const inst = randomInstance({ count: 24, capacity: 16, seed: 7 });
  const d = distanceMatrix(points(inst));
  const rNaive = solutionDistance(naive(inst), d);
  const cwR = clarkeWright(inst, d);
  const rSavings = solutionDistance(cwR, d);
  const rOpt = solutionDistance(optimize(cwR, d), d);
  assert.ok(covers(cwR, 24));
  assert.ok(loadOk(cwR, inst));
  assert.ok(rSavings < rNaive, "savings should beat naive");
  assert.ok(rOpt <= rSavings + 1e-9, "2-opt should not regress");
}
