// Routing policies decide, for a packet sitting at a node, which outgoing lane
// to send it down next. Every policy only ever considers lanes that make
// progress toward the destination (fewer hops remaining), so routing always
// terminates. The policies differ only in how they choose among those lanes,
// and that difference is the whole story of the simulator:
//
//   greedy    - always the shortest path, blind to congestion. Under a surge it
//               funnels everything onto the same lanes and the network backs up.
//   balanced  - shortest path, but steers around loaded lanes and full queues.
//               It holds throughput when greedy collapses.
//   roundRobin - spreads blindly across progress-making lanes, ignoring both
//               path length and load. A naive baseline.
//
// This is where the real optimizer plugs in later (Phase 2): it is just a
// smarter `choose`.
import { hopsBetween } from "./network.js";

// Outgoing lanes whose far end is strictly closer (in hops) to the destination.
function progressLanes(network, nodeId, dest) {
  const here = hopsBetween(network, nodeId, dest);
  return network.outgoing.get(nodeId).filter((lane) => hopsBetween(network, lane.to, dest) < here);
}

// How loaded a lane is right now: packets in transit relative to its carrying
// capacity, plus the backlog waiting at the node it feeds. Range roughly [0, ∞),
// where >1 means congested.
function laneLoad(state, lane) {
  const inTransit = state.lanes.get(lane.id).contents.length;
  const carrying = Math.max(1, lane.capacity * lane.transit);
  const targetQueue = state.nodes.get(lane.to).queue.length;
  return inTransit / carrying + targetQueue / Math.max(1, state.network.nodeById.get(lane.to).capacity * 2);
}

// Time cost of sending one more packet down a lane right now: its transit time,
// plus a convex penalty that climbs steeply as the lane fills, plus the queueing
// delay at the node it feeds. Convex (occupancy squared) is what makes the
// whole-path optimizer flee a near-full lane well before it is actually jammed.
function edgeCost(network, state, lane) {
  const contents = state.lanes.get(lane.id).contents.length;
  const occupancy = contents / Math.max(1, lane.capacity * lane.transit);
  const target = network.nodeById.get(lane.to);
  const queueDelay = state.nodes.get(lane.to).queue.length / Math.max(1, target.capacity);
  return lane.transit * (1 + 6 * occupancy * occupancy) + 4 * queueDelay;
}

// All-pairs cheapest-cost routing table over the current congestion-priced graph
// (Floyd-Warshall). `next.get(from).get(dest)` is the first lane on the cheapest
// path. The network is a DAG (sources -> hubs -> sinks), so every path is finite
// and recomputing each tick is cheap at this size. Cached on state per tick so
// it is built once, not once per packet.
function optimalRouting(network, state) {
  if (state._optimal && state._optimal.tick === state.tick) return state._optimal.next;

  const ids = network.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const INF = Infinity;
  const dist = Array.from({ length: n }, () => new Array(n).fill(INF));
  const hop = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let i = 0; i < n; i += 1) dist[i][i] = 0;

  for (const lane of network.lanes) {
    const a = index.get(lane.from);
    const b = index.get(lane.to);
    const c = edgeCost(network, state, lane);
    if (c < dist[a][b]) {
      dist[a][b] = c;
      hop[a][b] = lane.id;
    }
  }

  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      if (dist[i][k] === INF) continue;
      for (let j = 0; j < n; j += 1) {
        const through = dist[i][k] + dist[k][j];
        if (through < dist[i][j]) {
          dist[i][j] = through;
          hop[i][j] = hop[i][k];
        }
      }
    }
  }

  const next = new Map();
  for (let i = 0; i < n; i += 1) {
    const row = new Map();
    for (let j = 0; j < n; j += 1) {
      if (i !== j && hop[i][j]) row.set(ids[j], hop[i][j]);
    }
    next.set(ids[i], row);
  }

  state._optimal = { tick: state.tick, next };
  return next;
}

export const POLICIES = {
  greedy: {
    id: "greedy",
    label: "Greedy",
    tagline: "Shortest path, blind to congestion",
    choose(network, state, nodeId, dest) {
      const lanes = progressLanes(network, nodeId, dest);
      if (lanes.length === 0) return null;
      let best = lanes[0];
      let bestKey = [hopsBetween(network, best.to, dest), best.id];
      for (const lane of lanes) {
        const key = [hopsBetween(network, lane.to, dest), lane.id];
        if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
          best = lane;
          bestKey = key;
        }
      }
      return best.id;
    },
  },

  balanced: {
    id: "balanced",
    label: "Balanced",
    tagline: "Congestion-aware shortest path",
    choose(network, state, nodeId, dest) {
      const lanes = progressLanes(network, nodeId, dest);
      if (lanes.length === 0) return null;
      let best = null;
      let bestScore = Infinity;
      for (const lane of lanes) {
        // Prefer low load, then short remaining path. The load term dominates,
        // so a congested shortcut loses to a clear detour.
        const score = laneLoad(state, lane) * 2 + hopsBetween(network, lane.to, dest) * 0.1;
        if (score < bestScore || (score === bestScore && lane.id < best.id)) {
          best = lane;
          bestScore = score;
        }
      }
      return best.id;
    },
  },

  optimal: {
    id: "optimal",
    label: "Optimal",
    tagline: "Congestion-priced whole-path routing",
    choose(network, state, nodeId, dest) {
      // Unlike balanced (which scores only the next lane), this follows the
      // cheapest full path to the destination over the current congestion
      // prices, so it avoids hubs that are jammed two hops downstream.
      const next = optimalRouting(network, state);
      return next.get(nodeId)?.get(dest) ?? null;
    },
  },

  roundRobin: {
    id: "roundRobin",
    label: "Round-robin",
    tagline: "Spread blindly across routes",
    choose(network, state, nodeId, dest) {
      const lanes = progressLanes(network, nodeId, dest);
      if (lanes.length === 0) return null;
      const node = state.nodes.get(nodeId);
      const sorted = [...lanes].sort((a, b) => (a.id < b.id ? -1 : 1));
      const chosen = sorted[node.rr % sorted.length];
      node.rr += 1;
      return chosen.id;
    },
  },
};

export const POLICY_LIST = [
  POLICIES.greedy,
  POLICIES.balanced,
  POLICIES.optimal,
  POLICIES.roundRobin,
];
