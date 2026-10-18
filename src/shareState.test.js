import assert from "node:assert/strict";
import { encodeScenario, decodeScenario, hasScenario } from "./shareState.js";
import { NETWORKS } from "./sim/network.js";

const FALLBACK = { network: "atlas", policy: "balanced", speed: 1 };

export default function runShareStateTests() {
  // A valid scenario round-trips exactly.
  const scenario = { network: "gauntlet", policy: "optimal", demand: 3.5, speed: 2 };
  const decoded = decodeScenario(encodeScenario(scenario), FALLBACK);
  assert.deepEqual(decoded, scenario);

  // Garbage falls back to a fully valid state, never throws.
  const junk = decodeScenario("net=zzz&policy=hack&demand=999&speed=7", FALLBACK);
  assert.equal(junk.network, "atlas");
  assert.equal(junk.policy, "balanced");
  assert.equal(junk.speed, 1);
  assert.equal(junk.demand, NETWORKS.atlas.demand);

  // Empty query is all defaults.
  const empty = decodeScenario("", FALLBACK);
  assert.deepEqual(empty, { network: "atlas", policy: "balanced", speed: 1, demand: NETWORKS.atlas.demand });

  // An unknown network makes demand fall back to the resolved network's default.
  const d = decodeScenario("net=gauntlet", FALLBACK);
  assert.equal(d.network, "gauntlet");
  assert.equal(d.demand, NETWORKS.gauntlet.demand);

  // Demand is clamped to the slider range and snapped to its step.
  assert.equal(decodeScenario("net=atlas&demand=0.1", FALLBACK).demand, NETWORKS.atlas.demand);
  assert.equal(decodeScenario("net=atlas&demand=4.24", FALLBACK).demand, 4.2);

  // A URLSearchParams works just like a string.
  const viaParams = decodeScenario(new URLSearchParams("net=gauntlet&policy=greedy&demand=2&speed=4"), FALLBACK);
  assert.deepEqual(viaParams, { network: "gauntlet", policy: "greedy", demand: 2, speed: 4 });

  // hasScenario detects a link that carries a view.
  assert.equal(hasScenario("net=atlas"), true);
  assert.equal(hasScenario(""), false);
  assert.equal(hasScenario("foo=bar"), false);
}
