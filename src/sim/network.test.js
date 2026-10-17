import assert from "node:assert/strict";
import { createNetwork, hopsBetween, DEFAULT_NETWORK, NODE_KIND } from "./network.js";

const TINY = {
  nodes: [
    { id: "A", kind: NODE_KIND.SOURCE, x: 0, y: 0 },
    { id: "B", kind: NODE_KIND.HUB, x: 0.5, y: 0 },
    { id: "C", kind: NODE_KIND.SINK, x: 1, y: 0 },
  ],
  lanes: [
    { from: "A", to: "B" },
    { from: "B", to: "C" },
  ],
};

export default function runNetworkTests() {
  const net = createNetwork(TINY);

  // Outgoing adjacency is built correctly.
  assert.equal(net.outgoing.get("A").length, 1);
  assert.equal(net.outgoing.get("C").length, 0);
  assert.deepEqual(net.sources, ["A"]);
  assert.deepEqual(net.sinks, ["C"]);

  // Hop distances via BFS.
  assert.equal(hopsBetween(net, "A", "C"), 2);
  assert.equal(hopsBetween(net, "B", "C"), 1);
  assert.equal(hopsBetween(net, "A", "A"), 0);
  assert.equal(hopsBetween(net, "C", "A"), Infinity); // directed, no way back

  // Defaults are applied.
  assert.equal(net.lanes[0].capacity, 6);
  assert.equal(net.lanes[0].transit, 6);
  assert.equal(net.lanes[0].id, "A->B");

  // Validation.
  assert.throws(() => createNetwork({ nodes: TINY.nodes, lanes: [{ from: "A", to: "Z" }] }));
  assert.throws(() => createNetwork({ nodes: TINY.nodes, lanes: [{ from: "A", to: "A" }] }));

  // The default network is well formed: every sink is reachable from every
  // source. If this breaks, packets would queue forever with no route.
  const atlas = createNetwork(DEFAULT_NETWORK);
  for (const source of atlas.sources) {
    for (const sink of atlas.sinks) {
      assert.ok(
        hopsBetween(atlas, source, sink) < Infinity,
        `${sink} unreachable from ${source}`
      );
    }
  }
}
