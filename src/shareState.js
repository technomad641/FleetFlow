// Shareable scenarios. The current view (network, policy, demand, speed) is
// encoded into URL query params so a configured state can be linked directly:
// open the link and the simulator starts exactly there. Decoding is defensive
// and always falls back to a valid state, so a hand-edited or stale URL can
// never break the app. Pure and injected, like the sim modules, so it is tested
// without a browser.
import { NETWORKS } from "./sim/network.js";
import { POLICIES } from "./sim/policies.js";

export const SHARE_SPEEDS = [0.5, 1, 2, 4];

export function encodeScenario({ network, policy, demand, speed }) {
  const params = new URLSearchParams();
  params.set("net", network);
  params.set("policy", policy);
  params.set("demand", String(demand));
  params.set("speed", String(speed));
  return params.toString();
}

// Accepts a query string (e.g. window.location.search) or a URLSearchParams.
// Every field is validated against what actually exists; anything unknown,
// missing, or out of range falls back to the provided defaults.
export function decodeScenario(search, fallback) {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search || new URLSearchParams();

  const network = NETWORKS[params.get("net")] ? params.get("net") : fallback.network;
  const policy = POLICIES[params.get("policy")] ? params.get("policy") : fallback.policy;

  let demand = Number(params.get("demand"));
  if (!Number.isFinite(demand) || demand < 0.5 || demand > 6) {
    demand = NETWORKS[network].demand;
  } else {
    demand = Math.round(demand * 10) / 10; // snap to the slider's 0.1 step
  }

  let speed = Number(params.get("speed"));
  if (!SHARE_SPEEDS.includes(speed)) speed = fallback.speed;

  return { network, policy, demand, speed };
}

// True when a URL already carries a scenario, so the app can skip the first-run
// intro for someone who followed a shared link straight to a specific view.
export function hasScenario(search) {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return Boolean(params && params.get("net"));
}
