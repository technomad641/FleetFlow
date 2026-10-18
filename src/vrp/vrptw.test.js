import assert from "node:assert/strict";
import { distanceMatrix, points, randomVrptwInstance, hasTimeWindows } from "./instance.js";
import { routeSchedule, solomonI1, twoOptRouteTW, solveVrptw } from "./vrptw.js";

// Depot at origin, two customers straight up the y-axis. Travel time = distance.
const LINE = {
  depot: { x: 0, y: 0, demand: 0 },
  customers: [
    { x: 0, y: 10, demand: 1, ready: 0, due: 100, service: 5 }, // A (index 1)
    { x: 0, y: 20, demand: 1, ready: 0, due: 100, service: 5 }, // B (index 2)
  ],
  capacity: 10,
  depotReady: 0,
  depotDue: 1000,
  kind: "vrptw",
};

// Distance and lateness both depend on visit order; the shorter-is-not-safer
// case. Depot, a near customer with a tight early deadline, a far one that is
// loose. Both orders travel the same distance (colinear), but one is late.
const ORDER = {
  depot: { x: 0, y: 0, demand: 0 },
  customers: [
    { x: 5, y: 0, demand: 1, ready: 0, due: 12, service: 2 }, // B near, early (index 1)
    { x: 50, y: 0, demand: 1, ready: 0, due: 200, service: 2 }, // A far, loose (index 2)
  ],
  capacity: 10,
  depotReady: 0,
  depotDue: 1000,
  kind: "vrptw",
};

function covers(routes, n) {
  const seen = routes.flat().sort((a, b) => a - b);
  const expected = Array.from({ length: n }, (_, i) => i + 1);
  return JSON.stringify(seen) === JSON.stringify(expected);
}

export default function runVrptwTests() {
  // hasTimeWindows discriminates VRPTW from CVRP instances.
  assert.ok(hasTimeWindows(LINE));
  assert.ok(!hasTimeWindows({ customers: [{ x: 0, y: 0, demand: 1 }] }));

  const lineDist = distanceMatrix(points(LINE));

  // Schedule math: leave at 0, reach A at 10 (begin 10, depart 15), reach B at
  // 25 (begin 25, depart 30), return at 50. No waiting, on time.
  const s = routeSchedule([1, 2], LINE, lineDist);
  assert.deepEqual(s.begins, [10, 25]);
  assert.equal(s.returnTime, 50);
  assert.equal(s.waiting, 0);
  assert.equal(s.lateStops, 0);
  assert.ok(s.feasible);

  // Early arrival waits for the window to open.
  const waits = routeSchedule([1, 2], { ...LINE, customers: [{ ...LINE.customers[0], ready: 30 }, LINE.customers[1]] }, lineDist);
  assert.equal(waits.begins[0], 30); // waited from arrival 10 to ready 30
  assert.equal(waits.waiting, 20);

  // A missed deadline is caught: tighten B's window so 25 > due.
  const late = routeSchedule([1, 2], { ...LINE, customers: [LINE.customers[0], { ...LINE.customers[1], due: 20 }] }, lineDist);
  assert.ok(!late.feasible);
  assert.equal(late.lateStops, 1);
  assert.equal(late.lateness, 5);

  // Order matters: both orders are the same distance, but only B-then-A is on time.
  const orderDist = distanceMatrix(points(ORDER));
  const bThenA = routeSchedule([1, 2], ORDER, orderDist); // near-early first
  const aThenB = routeSchedule([2, 1], ORDER, orderDist); // far-loose first
  assert.ok(Math.abs(bThenA.distance - aThenB.distance) < 1e-9, "colinear: equal distance");
  assert.ok(bThenA.feasible, "B-then-A respects the early window");
  assert.ok(!aThenB.feasible, "A-then-B misses B's deadline");

  // I1 finds the on-time order on the ORDER instance (one vehicle, no lateness).
  const orderSolved = solveVrptw(ORDER, "tw-i1");
  assert.ok(orderSolved.feasible, "I1 must produce a feasible schedule");
  assert.equal(orderSolved.maxLateness, 0);
  assert.equal(orderSolved.vehicles, 1);
  assert.deepEqual(orderSolved.routes[0], [1, 2]);

  // A constructed random instance is feasible by design, so I1 must deliver
  // every customer on time, respect capacity, use fewer trucks than one-per-stop,
  // and 2-opt must not regress distance or break feasibility.
  const inst = randomVrptwInstance({ count: 20, capacity: 50, seed: 3 });
  const n = inst.customers.length;

  const i1 = solveVrptw(inst, "tw-i1");
  assert.ok(covers(i1.routes, n), "I1 must visit every customer once");
  assert.ok(i1.capacityOk, "I1 must respect capacity");
  assert.ok(i1.feasible, "I1 must be on time on a feasible instance");
  assert.equal(i1.lateStops, 0);
  assert.ok(i1.vehicles < n, "I1 must beat one-truck-per-stop on vehicle count");

  const opt = solveVrptw(inst, "tw-opt");
  assert.ok(covers(opt.routes, n));
  assert.ok(opt.feasible, "2-opt must preserve feasibility");
  assert.ok(opt.totalDistance <= i1.totalDistance + 1e-9, "2-opt must not regress distance");

  // twoOptRouteTW on a single route never regresses and stays feasible.
  const dist = distanceMatrix(points(inst));
  for (const r of i1.routes) {
    const before = routeSchedule(r, inst, dist);
    const after = routeSchedule(twoOptRouteTW(r, inst, dist), inst, dist);
    assert.ok(after.feasible, "2-opt route stays feasible");
    assert.ok(after.distance <= before.distance + 1e-9, "2-opt route never longer");
  }

  // Ignoring windows (the CVRP baseline scheduled against the clock) is allowed
  // to be late; I1 is not. On this instance the baseline is one-per-stop.
  const ignore = solveVrptw(inst, "tw-cvrp");
  assert.equal(ignore.vehicles, n, "default CVRP baseline is one-per-stop");
}
