import assert from "node:assert/strict";
import { REAL_INSTANCES, REAL_INSTANCE_MAP } from "./instances.js";
import { solve } from "./solver.js";
import { solveVrptw } from "./vrptw.js";
import { hasTimeWindows } from "./instance.js";

function covers(routes, n) {
  const seen = routes.flat().sort((a, b) => a - b);
  const expected = Array.from({ length: n }, (_, i) => i + 1);
  return JSON.stringify(seen) === JSON.stringify(expected);
}

function capacityOk(routes, instance) {
  return routes.every(
    (r) => r.reduce((s, idx) => s + instance.customers[idx - 1].demand, 0) <= instance.capacity
  );
}

// These are canonical benchmarks with published best-known solutions (BKS). We
// do not claim to match BKS — the heuristics are construction-grade — but every
// solution must be VALID (covers all customers once, respects capacity, and for
// VRPTW respects every time window) and land in a sane band around BKS. A result
// far below BKS would mean a bug (impossible to beat the optimum); far above
// would mean the heuristic is broken.
export default function runInstancesTests() {
  assert.equal(REAL_INSTANCES.length, 3);
  assert.ok(REAL_INSTANCE_MAP["augerat-a-n32-k5"]);
  assert.ok(REAL_INSTANCE_MAP["solomon-c101"]);
  assert.ok(REAL_INSTANCE_MAP["solomon-r101"]);

  // Augerat A-n32-k5: CVRP, BKS 784 / 5 vehicles, rounded (EUC_2D) distances.
  const aug = REAL_INSTANCE_MAP["augerat-a-n32-k5"];
  assert.equal(aug.customers.length, 31);
  assert.equal(aug.roundDistances, true);
  assert.ok(!hasTimeWindows(aug));
  const augSolved = solve(aug, "opt");
  assert.ok(covers(augSolved.routes, 31), "Augerat: every customer once");
  assert.ok(capacityOk(augSolved.routes, aug), "Augerat: capacity respected");
  assert.ok(augSolved.totalDistance >= aug.bks.distance - 1, "cannot beat the optimum");
  assert.ok(
    augSolved.totalDistance <= aug.bks.distance * 1.35,
    `Augerat within 35% of BKS, got ${augSolved.totalDistance.toFixed(0)} vs ${aug.bks.distance}`
  );
  assert.ok(augSolved.vehicles >= aug.bks.vehicles, "cannot use fewer than the min trucks");

  // Solomon C101 and R101: VRPTW, 100 customers each. Every window must hold.
  for (const id of ["solomon-c101", "solomon-r101"]) {
    const inst = REAL_INSTANCE_MAP[id];
    assert.equal(inst.customers.length, 100);
    assert.ok(hasTimeWindows(inst), `${id} has time windows`);

    const solved = solveVrptw(inst, "tw-opt");
    assert.ok(covers(solved.routes, 100), `${id}: every customer once`);
    assert.ok(solved.capacityOk, `${id}: capacity respected`);
    assert.ok(solved.feasible, `${id}: all windows met`);
    assert.equal(solved.lateStops, 0, `${id}: no late deliveries`);
    assert.ok(
      solved.totalDistance >= inst.bks.distance * 0.9,
      `${id}: distance not implausibly low (got ${solved.totalDistance.toFixed(0)}, BKS ${inst.bks.distance})`
    );
    assert.ok(
      solved.totalDistance <= inst.bks.distance * 1.5,
      `${id}: within 50% of BKS (got ${solved.totalDistance.toFixed(0)}, BKS ${inst.bks.distance})`
    );
    assert.ok(
      solved.vehicles <= inst.bks.vehicles + 6,
      `${id}: vehicle count in range (got ${solved.vehicles}, BKS ${inst.bks.vehicles})`
    );

    // The CVRP baseline ignores windows: it should be able to serve everyone,
    // but on these tight-window instances it is expected to run late.
    const ignore = solveVrptw(inst, "tw-cvrp", solve({ ...inst }, "opt").routes);
    assert.ok(covers(ignore.routes, 100), `${id}: baseline covers all`);
  }
}
