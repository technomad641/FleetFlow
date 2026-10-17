// Routing policy benchmark. Runs every policy on the exact same seeded demand
// across a sweep of demand rates, for each network, and prints a markdown table.
// Because the simulation is deterministic, this is a fair head-to-head: any
// difference is the routing decision, nothing else.
//
// Run: bun scripts/benchmark.mjs   (or: node scripts/benchmark.mjs)
import { createSimulation, step, setPolicy } from "../src/sim/simulation.js";
import { summarize } from "../src/sim/metrics.js";
import { NETWORK_LIST } from "../src/sim/network.js";
import { POLICY_LIST } from "../src/sim/policies.js";

const SWEEPS = {
  atlas: [3.0, 4.0, 5.0, 6.0],
  gauntlet: [2.0, 3.0, 4.0, 5.0],
};
const TICKS = 700;
const SEED = 42;

function runOne(net, policyId, rate) {
  const sim = createSimulation({
    networkDef: net,
    seed: SEED,
    demandRate: rate,
    slaTicks: net.sla,
  });
  setPolicy(sim, policyId);
  for (let i = 0; i < TICKS; i += 1) step(sim);
  return summarize(sim);
}

function pad(s, w) {
  s = String(s);
  return s + " ".repeat(Math.max(0, w - s.length));
}

console.log(`Fleet Flow routing benchmark — seed ${SEED}, ${TICKS} ticks\n`);

for (const net of NETWORK_LIST) {
  console.log(`## ${net.name} network (SLA ${net.sla} ticks)\n`);
  for (const rate of SWEEPS[net.id] ?? [3.0, 4.0, 5.0]) {
    console.log(`### Demand ${rate.toFixed(1)} pkg/tick per source\n`);
    console.log(
      "| " + pad("Policy", 12) + " | " + pad("Delivered", 9) + " | " + pad("Backlog", 7) +
        " | " + pad("Throughput", 10) + " | " + pad("On-time", 7) + " | " + pad("Latency", 7) + " |"
    );
    console.log(
      "| " + "-".repeat(12) + " | " + "-".repeat(9) + " | " + "-".repeat(7) + " | " +
        "-".repeat(10) + " | " + "-".repeat(7) + " | " + "-".repeat(7) + " |"
    );
    for (const policy of POLICY_LIST) {
      const s = runOne(net, policy.id, rate);
      console.log(
        "| " + pad(policy.label, 12) + " | " + pad(s.delivered, 9) + " | " + pad(s.backlog, 7) +
          " | " + pad(s.throughput.toFixed(2), 10) + " | " + pad(`${s.onTimePct.toFixed(0)}%`, 7) +
          " | " + pad(s.avgLatency.toFixed(1), 7) + " |"
      );
    }
    console.log("");
  }
}
