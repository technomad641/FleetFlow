// Read-only views over simulation state: the headline numbers for the dashboard
// and the per-node / per-lane load fractions the renderer uses for color. These
// are pure derivations, so they never change the simulation.

export function summarize(state) {
  let backlog = 0;
  for (const node of state.nodes.values()) backlog += node.queue.length;

  let inTransit = 0;
  for (const lane of state.lanes.values()) inTransit += lane.contents.length;

  const window = state.throughputWindow;
  const throughput =
    window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : 0;

  return {
    tick: state.tick,
    created: state.created,
    delivered: state.delivered,
    active: state.packets.size,
    backlog,
    inTransit,
    // Packets delivered per tick, averaged over the recent window.
    throughput,
    onTimePct: state.delivered > 0 ? (state.onTime / state.delivered) * 100 : 100,
    avgLatency: state.delivered > 0 ? state.latencySum / state.delivered : 0,
    surging: state.scenario.surge > 0,
    outageNode: state.scenario.outage > 0 ? state.scenario.outageNode : null,
  };
}

// Load fraction in [0, 1+] per node (queue vs capacity) and per lane (packets in
// transit vs carrying capacity). Clamped for color only in the renderer.
export function networkLoad(state) {
  const nodes = new Map();
  for (const node of state.network.nodes) {
    const queue = state.nodes.get(node.id).queue.length;
    // Scale against several ticks of service, so a node reads as congested (and
    // tips into the alert color) only when work is genuinely piling up faster
    // than it can clear, not just because one tick of demand is waiting.
    nodes.set(node.id, queue / Math.max(1, node.capacity * 2.5));
  }

  const lanes = new Map();
  for (const lane of state.network.lanes) {
    const inTransit = state.lanes.get(lane.id).contents.length;
    lanes.set(lane.id, inTransit / Math.max(1, lane.capacity * lane.transit));
  }

  return { nodes, lanes };
}
