// The simulation engine. It is a pure function of its state: `step` takes the
// current state, advances it by one tick, and returns it. Given the same seed
// and config, a run always replays identically, so two policies can be compared
// on the exact same stream of demand, and the whole thing is unit-testable with
// no DOM and no clock.
//
// One tick, in order:
//   1. demand    - sources emit Poisson-distributed new packets
//   2. dispatch  - each node pushes queued packets onto outgoing lanes (a node
//                  has a per-tick service rate; lanes have a per-tick intake cap,
//                  so a full lane applies backpressure and backlog builds)
//   3. advance   - packets that have crossed their lane arrive, and are either
//                  delivered (at their destination) or queued at the next node
//   4. accounting - throughput window, latency, on-time counters
import { createRng } from "./rng.js";
import { createNetwork, NODE_KIND } from "./network.js";
import { POLICIES } from "./policies.js";

const THROUGHPUT_WINDOW = 60;
const SURGE_MULTIPLIER = 3;

export function createSimulation({
  networkDef,
  seed = 1,
  demandRate = 2.2,
  policyId = "balanced",
  slaTicks = 34,
} = {}) {
  const network = createNetwork(networkDef);

  const nodes = new Map(
    network.nodes.map((n) => [n.id, { queue: [], rr: 0, delivered: 0, arrivals: 0 }])
  );
  const lanes = new Map(network.lanes.map((l) => [l.id, { contents: [], entered: 0 }]));

  return {
    tick: 0,
    rng: createRng(seed),
    seed,
    network,
    nodes,
    lanes,
    packets: new Map(),
    policyId,
    config: { demandRate, slaTicks },
    nextId: 1,
    created: 0,
    delivered: 0,
    latencySum: 0,
    onTime: 0,
    throughputWindow: [],
    scenario: { surge: 0, outageNode: null, outage: 0 },
  };
}

export function setPolicy(state, policyId) {
  if (POLICIES[policyId]) state.policyId = policyId;
  return state;
}

// Trigger a demand spike for `ticks` ticks (default ~6s at 10 ticks/s).
export function triggerSurge(state, ticks = 60) {
  state.scenario.surge = ticks;
  return state;
}

// Knock a hub offline for `ticks` ticks. Packets pile up at it until it recovers.
export function triggerOutage(state, nodeId, ticks = 60) {
  const node = state.network.nodeById.get(nodeId);
  if (node && node.kind !== NODE_KIND.SINK) {
    state.scenario.outageNode = nodeId;
    state.scenario.outage = ticks;
  }
  return state;
}

function effectiveDemand(state) {
  return state.scenario.surge > 0 ? state.config.demandRate * SURGE_MULTIPLIER : state.config.demandRate;
}

export function step(state) {
  state.tick += 1;
  const { network, rng } = state;

  // 1. Demand: each source emits a bursty batch of packets for random sinks.
  const lambda = effectiveDemand(state);
  for (const sourceId of network.sources) {
    if (state.scenario.outageNode === sourceId && state.scenario.outage > 0) continue;
    const count = rng.poisson(lambda);
    for (let i = 0; i < count; i += 1) {
      const dest = rng.pick(network.sinks);
      const id = state.nextId++;
      state.packets.set(id, {
        id,
        origin: sourceId,
        dest,
        createdTick: state.tick,
        status: "queued",
        at: sourceId,
        hops: 0,
      });
      state.nodes.get(sourceId).queue.push(id);
      state.nodes.get(sourceId).arrivals += 1;
      state.created += 1;
    }
  }

  // 2. Dispatch: nodes push queued packets onto lanes, up to their service rate.
  for (const lane of network.lanes) state.lanes.get(lane.id).entered = 0;

  for (const node of network.nodes) {
    const nodeState = state.nodes.get(node.id);
    if (nodeState.queue.length === 0) continue;
    const down = state.scenario.outageNode === node.id && state.scenario.outage > 0;
    if (down) continue; // offline node processes nothing

    const policy = POLICIES[state.policyId];
    const remaining = [];
    let served = 0;
    for (const packetId of nodeState.queue) {
      const packet = state.packets.get(packetId);
      if (served >= node.capacity) {
        remaining.push(packetId);
        continue;
      }
      const laneId = policy.choose(network, state, node.id, packet.dest);
      const laneDef = laneId ? network.lanes.find((l) => l.id === laneId) : null;
      const laneState = laneId ? state.lanes.get(laneId) : null;
      if (laneState && laneState.entered < laneDef.capacity) {
        laneState.contents.push({ id: packetId, enterTick: state.tick });
        laneState.entered += 1;
        packet.status = "transit";
        packet.at = laneId;
        served += 1;
      } else {
        remaining.push(packetId); // lane full or no route: backpressure
      }
    }
    nodeState.queue = remaining;
  }

  // 3. Advance: packets that have crossed arrive at the lane's far node.
  let deliveredThisTick = 0;
  for (const lane of network.lanes) {
    const laneState = state.lanes.get(lane.id);
    const staying = [];
    for (const item of laneState.contents) {
      if (state.tick - item.enterTick >= lane.transit) {
        const packet = state.packets.get(item.id);
        packet.hops += 1;
        if (lane.to === packet.dest) {
          const latency = state.tick - packet.createdTick;
          state.delivered += 1;
          state.latencySum += latency;
          if (latency <= state.config.slaTicks) state.onTime += 1;
          state.nodes.get(lane.to).delivered += 1;
          state.packets.delete(item.id); // prune: delivered packets leave memory
          deliveredThisTick += 1;
        } else {
          packet.status = "queued";
          packet.at = lane.to;
          state.nodes.get(lane.to).queue.push(item.id);
        }
      } else {
        staying.push(item);
      }
    }
    laneState.contents = staying;
  }

  // 4. Accounting.
  state.throughputWindow.push(deliveredThisTick);
  if (state.throughputWindow.length > THROUGHPUT_WINDOW) state.throughputWindow.shift();
  if (state.scenario.surge > 0) state.scenario.surge -= 1;
  if (state.scenario.outage > 0) {
    state.scenario.outage -= 1;
    if (state.scenario.outage === 0) state.scenario.outageNode = null;
  }

  return state;
}
