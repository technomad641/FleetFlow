import assert from "node:assert/strict";
import { createSimulation, step, setPolicy, triggerSurge } from "./simulation.js";
import { summarize } from "./metrics.js";
import { DEFAULT_NETWORK, GAUNTLET_NETWORK } from "./network.js";
import { POLICIES } from "./policies.js";

function run(state, ticks) {
  for (let i = 0; i < ticks; i += 1) step(state);
  return state;
}

export default function runSimulationTests() {
  // Determinism: identical seed and config replay identically.
  const a = run(createSimulation({ networkDef: DEFAULT_NETWORK, seed: 3 }), 200);
  const b = run(createSimulation({ networkDef: DEFAULT_NETWORK, seed: 3 }), 200);
  assert.deepEqual(summarize(a), summarize(b));

  // A different seed gives a different run (the whole snapshot diverges, even
  // if the raw created-count happens to coincide).
  const c = run(createSimulation({ networkDef: DEFAULT_NETWORK, seed: 99 }), 200);
  assert.notDeepEqual(summarize(a), summarize(c));

  // Conservation: every packet created is either delivered or still active.
  const cons = run(createSimulation({ networkDef: DEFAULT_NETWORK, seed: 7 }), 150);
  const s = summarize(cons);
  assert.equal(s.created, s.delivered + s.active);

  // Drain: stop demand and the network empties, delivering everything.
  const drain = createSimulation({ networkDef: DEFAULT_NETWORK, seed: 12, demandRate: 1.2 });
  run(drain, 100);
  drain.config.demandRate = 0;
  run(drain, 400);
  const drained = summarize(drain);
  assert.equal(drained.active, 0, "network should fully drain");
  assert.equal(drained.backlog, 0);
  assert.equal(drained.inTransit, 0);
  assert.equal(drained.created, drained.delivered);

  // Surge: a spike produces meaningfully more demand than a quiet stretch.
  const surge = createSimulation({ networkDef: DEFAULT_NETWORK, seed: 4, demandRate: 1.0 });
  run(surge, 50);
  const beforeQuiet = surge.created;
  run(surge, 50);
  const quietDelta = surge.created - beforeQuiet;
  triggerSurge(surge, 50);
  const beforeSurge = surge.created;
  run(surge, 50);
  const surgeDelta = surge.created - beforeSurge;
  assert.ok(surgeDelta > quietDelta, `surge ${surgeDelta} not above quiet ${quietDelta}`);

  // Policy matters, and balanced is strictly better under congestion. On the
  // exact same heavy demand stream, greedy funnels onto the capacity-capped
  // central hub and backs up; balanced spreads the load and holds throughput.
  // This is the simulator's whole thesis, pinned as a test.
  const g = createSimulation({ networkDef: DEFAULT_NETWORK, seed: 8, demandRate: 5.0 });
  setPolicy(g, "greedy");
  run(g, 400);
  const bal = createSimulation({ networkDef: DEFAULT_NETWORK, seed: 8, demandRate: 5.0 });
  setPolicy(bal, "balanced");
  run(bal, 400);
  const gs = summarize(g);
  const bs = summarize(bal);
  assert.ok(gs.backlog > bs.backlog * 5, `greedy backlog ${gs.backlog} should dwarf balanced ${bs.backlog}`);
  assert.ok(bs.delivered > gs.delivered, "balanced should deliver more under congestion");
  assert.ok(bs.onTimePct > gs.onTimePct + 20, "balanced should be far more on-time");

  // The optimal policy (whole-path, congestion-priced routing) is a valid router
  // and holds under congestion where greedy collapses. On the Atlas network it
  // matches balanced rather than beating it: backpressure makes one-hop sensing
  // sufficient here. That honest result is documented in scripts/benchmark.mjs.
  const opt = createSimulation({ networkDef: DEFAULT_NETWORK, seed: 42, demandRate: 6.0 });
  setPolicy(opt, "optimal");
  run(opt, 600);
  const grd = createSimulation({ networkDef: DEFAULT_NETWORK, seed: 42, demandRate: 6.0 });
  setPolicy(grd, "greedy");
  run(grd, 600);
  const os = summarize(opt);
  const gg = summarize(grd);
  assert.ok(os.onTimePct > 90, `optimal should hold on-time, got ${os.onTimePct}`);
  assert.ok(gg.onTimePct < 60, "greedy should collapse under the same load");
  assert.ok(os.delivered > gg.delivered, "optimal should outdeliver greedy");

  // Optimal picks a progressing lane and returns null at the destination.
  const fresh = createSimulation({ networkDef: DEFAULT_NETWORK, seed: 1 });
  assert.ok(POLICIES.optimal.choose(fresh.network, fresh, "SRC-W", "DST-2"));
  assert.equal(POLICIES.optimal.choose(fresh.network, fresh, "DST-2", "DST-2"), null);

  // Phase 2b: on the deeper Gauntlet network the optimizer wins decisively.
  // Balanced floods the fat-but-slow overflow lanes (it scores load, not transit
  // time) and misses most deadlines; greedy refuses the overflow and collapses
  // under load; only optimal stays both fast and on-time.
  const demand = 4.5;
  const gOpt = createSimulation({ networkDef: GAUNTLET_NETWORK, seed: 42, demandRate: demand, slaTicks: 14 });
  setPolicy(gOpt, "optimal");
  run(gOpt, 700);
  const gBal = createSimulation({ networkDef: GAUNTLET_NETWORK, seed: 42, demandRate: demand, slaTicks: 14 });
  setPolicy(gBal, "balanced");
  run(gBal, 700);
  const gGrd = createSimulation({ networkDef: GAUNTLET_NETWORK, seed: 42, demandRate: demand, slaTicks: 14 });
  setPolicy(gGrd, "greedy");
  run(gGrd, 700);
  const gos = summarize(gOpt);
  const gbs = summarize(gBal);
  const ggs = summarize(gGrd);
  assert.ok(gos.onTimePct > gbs.onTimePct + 8, `optimal on-time ${gos.onTimePct} should beat balanced ${gbs.onTimePct}`);
  assert.ok(gos.avgLatency < gbs.avgLatency, "optimal should be faster than balanced on Gauntlet");
  assert.ok(ggs.backlog > gos.backlog * 10, "greedy should collapse where optimal holds");
}
