<div align="center">

# Fleet Flow

### A live fulfillment network, routed in real time.

Build a network of fulfillment centers and lanes, pour demand through it, and watch throughput, backlog, and bottlenecks form in front of you. Then change the routing policy and watch the same network either hold or collapse.

<br />

[**▶ Live demo**](https://technomad641.github.io/FleetFlow/) &nbsp;·&nbsp; [Design doc](DESIGN.md)

<br />

![tests](https://img.shields.io/badge/tests-5%20suites%20passing-3fb950)
![bundle](https://img.shields.io/badge/bundle-51KB%20gzipped-eeeeee)
![deps](https://img.shields.io/badge/runtime%20deps-react%20only-cccccc)
![license](https://img.shields.io/badge/license-MIT-black)

<br />

![Fleet Flow demo: balanced routing holds the network, then Greedy under a surge chokes the central hub and it turns red](docs/assets/demo.gif)

<sub>Balanced routing keeps the network flowing. Switch to Greedy under a demand surge and the central hub turns red and backs up. Red is the only color on screen, and it always means congestion.</sub>

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

## The two states

<table>
<tr>
<td width="50%"><img src="docs/assets/balanced.jpg" alt="Balanced routing: the network flows, everything stays white, on-time 100%" /></td>
<td width="50%"><img src="docs/assets/collapse.jpg" alt="Greedy routing under a surge: the central hub glows red, backlog explodes" /></td>
</tr>
<tr>
<td align="center"><strong>Balanced</strong> — the network flows, on-time holds at 100%.</td>
<td align="center"><strong>Greedy + surge</strong> — the central hub chokes and the arteries turn red.</td>
</tr>
</table>

## Does smarter routing help? A benchmark

`bun run bench` runs every policy on the exact same seeded demand across a sweep of load levels. Because the simulation is deterministic, any difference is the routing decision and nothing else. At demand 6.0 pkg/tick per source (600 ticks, Atlas network):

| Policy | Delivered | Backlog | Throughput | On-time | Avg latency |
| --- | --- | --- | --- | --- | --- |
| Greedy (shortest path) | 5,299 | 1,973 | 8.9 | **14%** | 88.5 |
| Round-robin | 6,521 | 746 | 11.2 | **45%** | 39.3 |
| Balanced (congestion-aware) | 7,247 | 17 | 12.5 | **100%** | 11.0 |
| Optimal (whole-path) | 7,234 | 17 | 12.4 | **100%** | 11.5 |

Two honest takeaways:

1. **Congestion-awareness is the whole game.** The policies blind to load (greedy, round-robin) collapse under pressure, delivering a third less and missing most of their deadlines. The congestion-aware policies hold at 100% on-time with almost no backlog.
2. **The whole-path optimizer matches balanced here rather than beating it.** On a network this shallow, backpressure propagates fast enough that a one-hop congestion-aware heuristic already sees everything the optimizer sees. The optimizer's extra machinery (an all-pairs cheapest-path recompute each tick over congestion-priced edges) only earns its keep when congestion hides deeper in the network, or in sharper transients. Building the thing, measuring it, and knowing when a simpler policy already suffices is the point. A deeper adversarial topology where the optimizer wins decisively is the next milestone (see Roadmap).

## Features

- **Real-time discrete-event simulation** of a fulfillment network: sources emit bursty (Poisson) demand, hubs route it, sinks consume it.
- **Four routing policies** you can switch live: greedy (shortest path), balanced (congestion-aware), optimal (whole-path, congestion-priced), and round-robin.
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
    policies.js     greedy / balanced / optimal / round-robin routing
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

- **Phase 2a (done)** — a whole-path, congestion-priced optimal router added as a fourth policy, plus a deterministic benchmark harness (`bun run bench`). See the benchmark above.
- **Phase 2b** — a "Gauntlet" network: a deeper, adversarial topology where one-hop balancing is provably suboptimal and the whole-path optimizer wins decisively.
- **Phase 2c** — a separate "Dispatch" mode: classic vehicle routing (CVRP / VRPTW) with Clarke-Wright construction and local search, benchmarked against real CVRPLIB instances (Augerat, Solomon).
- **Phase 3** — real road distances and maps, richer network editing, shareable scenarios via URL.
- Light theme, saved scenarios, and a guided tour.

## Tech stack

React 18 + Vite, Canvas 2D, a zero-dependency test runner. No animation or state libraries: the simulation and the rendering are hand-built, which is the point.

## License

MIT © 2026 Rajat Singh
