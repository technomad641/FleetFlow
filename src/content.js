// Narrative content for the intro overlay, the legend, and the guided tour.
// Kept as data so App.jsx stays focused on wiring: the tour steps are plain
// descriptors (which network / policy / demand to set, whether to fire a surge,
// and what to spotlight), and App interprets them against its own handlers.

export const INTRO = {
  title: "Fleet Flow",
  tagline: "Watch a fulfillment network route itself in real time.",
  metaphor:
    "Orders pour in at the docks. Hubs decide where each one goes. The routing policy is the whole difference between a network that flows and one that chokes.",
};

// The visual language, explained once. `kind` maps to a swatch style in CSS.
export const LEGEND = [
  { kind: "source", label: "Dock", desc: "Orders originate here" },
  { kind: "hub", label: "Hub", desc: "Routes shipments onward" },
  { kind: "sink", label: "Station", desc: "Deliveries land here" },
  { kind: "packet", label: "Packet", desc: "One shipment, in transit" },
  { kind: "load", label: "Calm → busy", desc: "Gray brightens to white with load" },
  { kind: "hot", label: "Congested", desc: "Red means it is backing up" },
];

// The guided tour. Each step applies its settings on entry, then waits for the
// viewer to read and click Next. `surge` fires a demand spike; `calm` clears it;
// `highlight` spotlights a region of the UI.
export const TOUR_STEPS = [
  {
    title: "A living network",
    body: "Two docks take in orders, hubs route them, stations receive them. Every moving dot is one shipment. It runs continuously.",
    network: "atlas",
    policy: "balanced",
    highlight: "stage",
  },
  {
    title: "Balanced routing",
    body: "This policy is congestion-aware: it steers shipments around busy lanes. On-time delivery holds at 100%.",
    policy: "balanced",
    highlight: "onTime",
  },
  {
    title: "Now switch to Greedy",
    body: "Greedy always takes the shortest path, blind to load. It looks perfectly fine, for now.",
    policy: "greedy",
    demand: 2.0,
    highlight: "policy",
  },
  {
    title: "Hit a demand surge",
    body: "Orders triple. Greedy funnels everything onto the central hub and it chokes. Red is congestion; the backlog climbs fast.",
    policy: "greedy",
    demand: 2.0,
    surge: true,
    highlight: "stage",
  },
  {
    title: "Switch back and recover",
    body: "Balanced spreads the load across the north and south hubs, and the network drains and recovers.",
    policy: "balanced",
    calm: true,
    highlight: "policy",
  },
  {
    title: "But is simple always enough?",
    body: "Meet the Gauntlet: a deeper network with a fast-but-small Express hub and a slow-but-large Local hub.",
    network: "gauntlet",
    policy: "balanced",
    highlight: "network",
  },
  {
    title: "Balanced struggles here",
    body: "It scores lanes by load, not travel time, so it floods the slow Local lanes. On-time falls to around half.",
    policy: "balanced",
    highlight: "onTime",
  },
  {
    title: "The Optimal router",
    body: "It weighs the whole path, congestion and travel time together: fills the fast lanes, overflows only when it must. Watch on-time jump.",
    policy: "optimal",
    highlight: "onTime",
  },
  {
    title: "Your turn",
    body: "Switch networks and policies, drag demand, fire a surge or a hub outage. See what holds and what breaks.",
    highlight: null,
  },
];
