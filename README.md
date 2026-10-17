<div align="center">

# Fleet Flow

### A live fulfillment network, routed in real time.

Build a network of fulfillment centers and lanes, pour demand through it, and watch throughput, backlog, and bottlenecks form in front of you. Then change the routing policy and watch the same network either hold or collapse.

<br />

![tests](https://img.shields.io/badge/tests-5%20suites%20passing-4ade80)
![bundle](https://img.shields.io/badge/bundle-51KB%20gzipped-38bdf8)
![deps](https://img.shields.io/badge/runtime%20deps-react%20only-8b5cf6)
![license](https://img.shields.io/badge/license-MIT-black)

<br />

<!-- A recorded demo clip goes here once the UI QA pass is done. -->
<em>Live demo and recording coming with the first deploy.</em>

</div>

---

## The idea

Every destination in the network is reachable through one central hub. It is the shortest path to almost everywhere, so a routing policy that only minimizes distance funnels everything onto it. The hub has a fixed service rate. Under a demand surge it chokes, backlog explodes, and on-time delivery falls off a cliff.

A congestion-aware policy makes a different call: push some traffic the "longer" way through the north and south hubs, which have spare capacity, and the network keeps flowing.

Same network. Same demand. The routing decision is the difference between holding and collapsing. That decision, made thousands of times a second across a real fulfillment network, is the problem this simulates.

The contrast is pinned as a test. On an identical heavy demand stream:

| Routing policy | Backlog | Throughput | On-time |
| --- | --- | --- | --- |
| Greedy (shortest path) | **509** waiting | 9.0 pkg/tick (choked) | **47%** |
| Balanced (congestion-aware) | **12** waiting | 10.1 pkg/tick | **100%** |

## Features

- **Real-time discrete-event simulation** of a fulfillment network: sources emit bursty (Poisson) demand, hubs route it, sinks consume it.
- **Three routing policies** you can switch live: greedy, balanced, and round-robin.
- **Scenario injection**: fire a demand surge or take a hub offline and watch the network react and recover.
- **Live instrumentation**: throughput, backlog, in-transit, on-time rate, delivered total, average latency.
- **Deterministic and reproducible**: the entire run is a pure function of its seed, so a scenario replays identically and two policies can be compared on the exact same demand.
- **60fps canvas rendering** decoupled from the simulation tick, with smooth interpolation.

## Quick start

Requires [Bun](https://bun.sh) or Node 18+.

```bash
bun install
bun run dev        # http://localhost:5173
```

With npm:

```bash
npm install
npm run dev
```

Other scripts:

```bash
bun run test       # run the simulation test suites
bun run build      # run tests, then build to dist/ (a red test fails the build)
bun run preview    # serve the production build
```

## How it works

The simulation advances one tick at a time. Each tick, in order:

1. **Demand** — every source emits a Poisson-distributed batch of packets, each addressed to a random delivery station.
2. **Dispatch** — each node pushes queued packets onto outgoing lanes, up to its service rate. Lanes have a per-tick intake cap, so a full lane applies backpressure and backlog builds at the node behind it.
3. **Advance** — packets that have crossed their lane's transit time arrive at the next node, and are either delivered (at their destination) or re-queued for the next hop.
4. **Accounting** — throughput window, latency, and on-time counters update.

A **routing policy** is just a function: given a packet at a node, which outgoing lane sends it closer to its destination? Every policy only considers lanes that reduce the hop distance to the destination, so routing always terminates. They differ only in how they choose among those lanes, and that is the whole story.

The **renderer** is a pure drawing pass over simulation state. It runs at the display refresh rate and interpolates packet positions between sim ticks using a fractional tick value, so motion is smooth even though the simulation steps at a fixed, slower rate.

## Architecture

A thin orchestrator (`App.jsx`) wires together pure, testable modules. Everything that makes a decision lives in a pure module with no DOM and no clock, so it can be unit-tested directly.

```
src/
  sim/
    rng.js          seeded PRNG + Poisson demand (deterministic)
    network.js      node/lane model, BFS hop distances, the reference network
    policies.js     greedy / balanced / round-robin routing
    simulation.js   the tick engine: demand -> dispatch -> advance -> accounting
    metrics.js      read-only dashboard + load views
    *.test.js       one suite per module
  render/
    renderer.js     canvas drawing pass (pure, reads state, never mutates)
  App.jsx           orchestrator: render loop, controls, dashboard
```

### Testing

There is no Jest or Vitest. Each `*.test.js` default-exports a zero-argument function that runs `node:assert` checks and throws on failure; `scripts/run-tests.mjs` runs them all, and `bun run build` runs the suite before building, so a red test fails the build.

The suites cover the things that actually matter for a simulation: RNG determinism and Poisson distribution, network validation and reachability, that every policy routes toward the destination, that the engine conserves packets and fully drains when demand stops, and that balanced strictly beats greedy under congestion.

## Roadmap

- **Phase 2** — a real vehicle-routing optimizer (VRP / VRPTW) plugged in as a routing policy, benchmarked against standard instances (Augerat, Solomon). The policy interface already exists; the optimizer is just a smarter `choose`.
- **Phase 3** — real road distances and maps, richer network editing, shareable scenarios via URL.
- Light theme, saved scenarios, and a guided tour.

## Tech stack

React 18 + Vite, Canvas 2D, a zero-dependency test runner. No animation or state libraries: the simulation and the rendering are hand-built, which is the point.

## License

MIT © 2026 Rajat Singh
