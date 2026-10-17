import assert from "node:assert/strict";
import { createSimulation, step } from "./simulation.js";
import { summarize, networkLoad } from "./metrics.js";
import { DEFAULT_NETWORK } from "./network.js";

export default function runMetricsTests() {
  // A fresh simulation reports clean zeros (and a vacuous 100% on-time).
  const fresh = createSimulation({ networkDef: DEFAULT_NETWORK, seed: 2 });
  const s0 = summarize(fresh);
  assert.equal(s0.created, 0);
  assert.equal(s0.delivered, 0);
  assert.equal(s0.active, 0);
  assert.equal(s0.backlog, 0);
  assert.equal(s0.inTransit, 0);
  assert.equal(s0.throughput, 0);
  assert.equal(s0.onTimePct, 100);
  assert.equal(s0.avgLatency, 0);

  // After running, the headline numbers are self-consistent.
  for (let i = 0; i < 120; i += 1) step(fresh);
  const s1 = summarize(fresh);
  assert.ok(s1.created > 0);
  assert.equal(s1.created, s1.delivered + s1.active);
  assert.ok(s1.onTimePct >= 0 && s1.onTimePct <= 100);
  assert.ok(s1.avgLatency >= 0);
  assert.ok(s1.throughput >= 0);

  // networkLoad covers every node and lane with finite, non-negative numbers.
  const load = networkLoad(fresh);
  assert.equal(load.nodes.size, DEFAULT_NETWORK.nodes.length);
  assert.equal(load.lanes.size, DEFAULT_NETWORK.lanes.length);
  for (const v of load.nodes.values()) assert.ok(Number.isFinite(v) && v >= 0);
  for (const v of load.lanes.values()) assert.ok(Number.isFinite(v) && v >= 0);
}
