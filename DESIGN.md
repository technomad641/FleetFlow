# Logistics Network Simulator — Design Doc

- **Working name:** TBD (candidates: Cascade, Backhaul, FleetFlow)
- **Owner:** Rajat Singh (technomad641)
- **Date:** 2026-10-17
- **Status:** Design locked, pre-build
- **Origin:** gstack `/office-hours` session. Replaces ScreenCueTime, which was killed as undifferentiated.

## 1. Why this exists

Two goals, in priority order:

1. **A flagship portfolio piece** that shows Meta/Google-grade engineering and the one thing only this builder can credibly show: scaling real fulfillment operations (3 years at Amazon fulfillment, L5 SDE, transshipment + damage-grading optimization for NA).
2. **A real open-source project with traction** (stars, users), with an optional path to a product.

A portfolio project is a weak *primary* signal for a 5-year L5 (the interview loop decides the offer). Its real job is to be the best system-design talking point and proof-of-taste the candidate can walk in with. This design optimizes for that first, product upside second.

## 2. What it is

An interactive, in-browser simulation of a fulfillment / logistics network. You build a network of nodes (fulfillment centers) and lanes, generate demand, and watch work flow through it in real time: throughput, backlog, utilization, cost. Inject a demand spike or kill a node and watch the network respond.

**Phase 2 (later):** a real vehicle-routing optimization engine plugs in as the network's routing policy. You see the before/after: naive routing collapses under load, optimized routing holds flat. That contrast is the signature demo and the moat (only someone who lived the real problem builds it convincingly).

## 3. Who it's for

- **Primary (portfolio):** engineers and hiring managers at big tech who see it in 30 seconds and get it.
- **Secondary (OSS):** people who build interactive explainers / systems-teaching content; ops-curious devs; eventually SMB logistics/ops planners.

## 4. v1 scope — 4 weekends, simulator only

**In:**
- Deterministic, seeded discrete-event sim core (pure, tested module).
- Network model: nodes (capacity, inventory, queue), lanes (transit time, capacity), demand process (seeded Poisson arrivals).
- Two simple routing policies (nearest, round-robin) so there is a contrast to show.
- Canvas-based animated visualization: flowing packets, node load, bottleneck highlighting, 60fps with hundreds of packets on screen.
- Live metrics dashboard: throughput, backlog, in-transit, on-time %, utilization.
- Controls: play/pause/speed, spawn demand, add/remove node, toggle policy.
- Scenarios: "demand surge", "node outage".
- Apple-grade UI polish: design tokens, light/dark, motion, reduced-motion (reuse ScreenCueTime Phase 1 work).
- README with animated demo, deployed live (GitHub Pages or Vercel).

**Out (v1):**
- The real VRP optimizer (Phase 2).
- Road-distance data / real maps.
- Multi-commodity flows, pricing models, persistence, accounts, any backend.

## 5. Architecture

Reuse the ScreenCueTime philosophy: thin orchestrator + pure, tested modules.

- **React 18 + Vite** (known stack, fast, reuse the Apple-UI work and the zero-dep test runner).
- **`sim/` pure engine:** entities, fixed-timestep tick loop, seeded RNG, a routing-policy interface, metrics. Zero DOM. Fully unit-tested with the existing `*.test.js` + `run-tests.mjs` pattern.
- **`render/` Canvas 2D renderer:** render loop decoupled from the sim tick (sim at a fixed rate, e.g. 10Hz; render at 60fps with interpolation).
- **`App` orchestrator:** wires controls, sim, renderer, dashboard.
- **Routing policy as a pluggable interface** so the Phase 2 optimizer drops in without touching the engine.

## 6. The signature demo (the "wow")

A one-screen scene: a network under rising demand. Hit "surge" and watch backlog build and nodes glow red. Toggle from naive to smart routing and watch it recover. Later, "smart" becomes the real optimizer. This is the 20-second clip for the README and the story told in interviews.

## 7. Risks and mitigations

- **Canvas perf with many packets** → cap entities, object pooling, profile early.
- **Scope creep in the sim model** → single commodity, minimal inventory model, refuse VRP variants in v1.
- **"Beautiful" eats time** → reserve all of Weekend 4 for polish + README + deploy.
- **Determinism vs smooth animation** → decouple fixed sim tick from interpolated render.
- **OR learning tax** is deferred to Phase 2, deliberately outside the 4-weekend window.

## 8. Plan — 4 weekends

- **W1:** Sim core (pure, tested): entities, tick loop, seeded demand, dumb routing, metrics. Headless, console-verified.
- **W2:** Canvas renderer + render loop; nodes, lanes, animated packets, smooth at 60fps.
- **W3:** Controls + dashboard + scenarios (surge, outage); second routing policy for the contrast.
- **W4:** UI polish (tokens, dark/light, motion), README + animated demo, deploy, ship.

A genuinely impressive, star-worthy artifact exists at the end of W3. W4 is what makes it look like a 10k-star repo.

## 9. Success metrics

- **Portfolio:** a 20s demo clip + a README that reads like a flagship repo; a crisp system-design story ("how I'd scale this to N nodes").
- **OSS:** first 100 stars; a Show HN post that lands.
- **Signal:** can go three levels deep on the sim engine (and the coming optimizer) in any interview.

## 10. Roadmap beyond v1

- **Phase 2:** VRP / VRPTW optimizer plugged in as a routing policy; benchmark numbers (Augerat for CVRP, Solomon for time windows).
- **Phase 3:** road distances / maps; richer network models; scenario sharing via URL.
- **Phase 4:** optional product direction (SMB ops planning) if traction appears.
