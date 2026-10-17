import assert from "node:assert/strict";
import { createSimulation } from "./simulation.js";
import { DEFAULT_NETWORK, hopsBetween } from "./network.js";
import { POLICIES } from "./policies.js";

function freshState() {
  return createSimulation({ networkDef: DEFAULT_NETWORK, seed: 5 });
}

export default function runPolicyTests() {
  const state = freshState();
  const net = state.network;

  // Every policy only ever picks a lane that makes progress toward the dest.
  for (const policy of Object.values(POLICIES)) {
    const laneId = policy.choose(net, state, "SRC-W", "DST-2");
    assert.ok(laneId, `${policy.id} returned no lane`);
    const lane = net.lanes.find((l) => l.id === laneId);
    assert.ok(
      hopsBetween(net, lane.to, "DST-2") < hopsBetween(net, "SRC-W", "DST-2"),
      `${policy.id} chose a non-progressing lane`
    );
  }

  // At the destination there is nothing to choose.
  assert.equal(POLICIES.greedy.choose(net, state, "DST-2", "DST-2"), null);

  // greedy is deterministic.
  assert.equal(
    POLICIES.greedy.choose(net, state, "SRC-W", "DST-1"),
    POLICIES.greedy.choose(net, state, "SRC-W", "DST-1")
  );

  // round-robin cycles through the progress-making lanes.
  const rr = freshState();
  const first = POLICIES.roundRobin.choose(rr.network, rr, "SRC-W", "DST-1");
  const second = POLICIES.roundRobin.choose(rr.network, rr, "SRC-W", "DST-1");
  assert.notEqual(first, second); // SRC-W has two 2-hop routes to DST-1

  // The behavioral contrast: when one shortest-path lane is congested, greedy
  // still takes it (blind) while balanced routes around it. SRC-W can reach
  // DST-1 via HUB-N or HUB-C, both one hop closer.
  const loaded = freshState();
  const congested = loaded.lanes.get("SRC-W->HUB-C");
  for (let i = 0; i < 40; i += 1) congested.contents.push({ id: -1, enterTick: 0 });
  for (let i = 0; i < 20; i += 1) loaded.nodes.get("HUB-C").queue.push(-1);

  const greedyPick = POLICIES.greedy.choose(loaded.network, loaded, "SRC-W", "DST-1");
  const balancedPick = POLICIES.balanced.choose(loaded.network, loaded, "SRC-W", "DST-1");
  assert.equal(greedyPick, "SRC-W->HUB-C", "greedy should stay on the congested shortcut");
  assert.equal(balancedPick, "SRC-W->HUB-N", "balanced should route around congestion");
}
