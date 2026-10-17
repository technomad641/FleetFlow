// The network model: nodes (fulfillment centers) and lanes (directed links
// between them). Coordinates are normalized to [0, 1] so the renderer can scale
// them to any canvas size. Everything here is pure data plus derived lookups.
//
// Node kinds:
//   source - demand originates here (inbound docks / vendors)
//   hub    - routes work onward (sortation centers)
//   sink   - demand is consumed here (delivery stations / customers)

export const NODE_KIND = {
  SOURCE: "source",
  HUB: "hub",
  SINK: "sink",
};

// Build a network from a plain definition, validating references and attaching
// derived structures the simulation and policies need:
//   - outgoing[nodeId]  -> lanes leaving the node
//   - hopDistance[a][b] -> fewest lanes from a to b (Infinity if unreachable)
export function createNetwork(def) {
  const nodes = def.nodes.map((n) => ({
    capacity: 8,
    ...n,
  }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const lanes = def.lanes.map((l, index) => {
    if (!nodeById.has(l.from)) throw new Error(`lane ${index}: unknown from "${l.from}"`);
    if (!nodeById.has(l.to)) throw new Error(`lane ${index}: unknown to "${l.to}"`);
    if (l.from === l.to) throw new Error(`lane ${index}: self-loop on "${l.from}"`);
    return { id: `${l.from}->${l.to}`, capacity: 6, transit: 6, ...l };
  });

  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const lane of lanes) outgoing.get(lane.from).push(lane);

  const sources = nodes.filter((n) => n.kind === NODE_KIND.SOURCE).map((n) => n.id);
  const sinks = nodes.filter((n) => n.kind === NODE_KIND.SINK).map((n) => n.id);

  return {
    nodes,
    lanes,
    nodeById,
    outgoing,
    sources,
    sinks,
    hopDistance: computeHopDistances(nodes, outgoing),
  };
}

// Breadth-first shortest-hop distance from every node to every other node.
// Policies use this to know which next hop actually makes progress toward a
// packet's destination.
function computeHopDistances(nodes, outgoing) {
  const dist = new Map();
  for (const start of nodes) {
    const table = new Map(nodes.map((n) => [n.id, Infinity]));
    table.set(start.id, 0);
    const queue = [start.id];
    while (queue.length > 0) {
      const current = queue.shift();
      const d = table.get(current);
      for (const lane of outgoing.get(current)) {
        if (table.get(lane.to) === Infinity) {
          table.set(lane.to, d + 1);
          queue.push(lane.to);
        }
      }
    }
    dist.set(start.id, table);
  }
  return dist;
}

export function hopsBetween(network, fromId, toId) {
  return network.hopDistance.get(fromId)?.get(toId) ?? Infinity;
}

// A deliberately asymmetric reference network: two inbound sources feed three
// hubs, which fan out to three delivery sinks. The central hub is the tempting
// shortcut (every destination is reachable through it), but its service rate is
// capped. A congestion-blind policy funnels everything onto it and backs up
// under a surge, while a balanced policy pushes Station 1 traffic up through the
// North hub and Station 3 traffic down through the South hub, keeping flow. That
// contrast is the demo.
//
// Node `capacity` is packets served per tick; lane `capacity` is packets that
// may enter per tick; lane `transit` is ticks to cross.
export const DEFAULT_NETWORK = {
  id: "atlas",
  name: "Atlas Network",
  nodes: [
    { id: "SRC-W", name: "West Dock", kind: NODE_KIND.SOURCE, x: 0.08, y: 0.3, capacity: 20 },
    { id: "SRC-E", name: "East Dock", kind: NODE_KIND.SOURCE, x: 0.08, y: 0.72, capacity: 20 },
    { id: "HUB-N", name: "North Sort", kind: NODE_KIND.HUB, x: 0.42, y: 0.16, capacity: 8 },
    { id: "HUB-C", name: "Central Sort", kind: NODE_KIND.HUB, x: 0.42, y: 0.5, capacity: 9 },
    { id: "HUB-S", name: "South Sort", kind: NODE_KIND.HUB, x: 0.42, y: 0.84, capacity: 8 },
    { id: "DST-1", name: "Station 1", kind: NODE_KIND.SINK, x: 0.88, y: 0.22, capacity: 20 },
    { id: "DST-2", name: "Station 2", kind: NODE_KIND.SINK, x: 0.88, y: 0.5, capacity: 20 },
    { id: "DST-3", name: "Station 3", kind: NODE_KIND.SINK, x: 0.88, y: 0.78, capacity: 20 },
  ],
  lanes: [
    { from: "SRC-W", to: "HUB-N", capacity: 8, transit: 5 },
    { from: "SRC-W", to: "HUB-C", capacity: 8, transit: 4 },
    { from: "SRC-E", to: "HUB-C", capacity: 8, transit: 4 },
    { from: "SRC-E", to: "HUB-S", capacity: 8, transit: 5 },
    { from: "HUB-N", to: "HUB-C", capacity: 4, transit: 3 },
    { from: "HUB-S", to: "HUB-C", capacity: 4, transit: 3 },
    { from: "HUB-N", to: "DST-1", capacity: 6, transit: 5 },
    { from: "HUB-C", to: "DST-1", capacity: 4, transit: 6 },
    { from: "HUB-C", to: "DST-2", capacity: 7, transit: 5 },
    { from: "HUB-C", to: "DST-3", capacity: 4, transit: 6 },
    { from: "HUB-S", to: "DST-3", capacity: 6, transit: 5 },
  ],
};
