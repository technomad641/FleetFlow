import React, { useEffect, useRef, useState } from "react";
import {
  createSimulation,
  step,
  setPolicy,
  triggerSurge,
  triggerOutage,
} from "./sim/simulation.js";
import { summarize } from "./sim/metrics.js";
import { NETWORKS, NETWORK_LIST } from "./sim/network.js";
import { POLICY_LIST } from "./sim/policies.js";
import { drawScene } from "./render/renderer.js";
import Intro from "./Intro.jsx";
import Tour from "./Tour.jsx";
import { TOUR_STEPS } from "./content.js";
import { encodeScenario, decodeScenario, hasScenario } from "./shareState.js";

const BASE_TPS = 10; // simulation ticks per second at 1x speed
const SPEEDS = [0.5, 1, 2, 4];
const BACKLOG_ALERT = 60;
const INTRO_KEY = "fleetflow.introSeen";

function introSeen() {
  try {
    return localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, "1");
  } catch {
    // ignore (private mode / disabled storage)
  }
}

const RENDER_THEME = {
  grid: "rgba(255, 255, 255, 0.05)",
  nodeFill: "rgba(10, 11, 14, 0.94)",
  label: "rgba(214, 219, 230, 0.82)",
};

function makeSim(networkId, policyId) {
  const net = NETWORKS[networkId];
  return createSimulation({
    networkDef: net,
    seed: 42,
    demandRate: net.demand,
    slaTicks: net.sla,
    policyId,
  });
}

export default function App() {
  // Initialize from a shared-scenario URL if present, else defaults.
  const search = typeof window !== "undefined" ? window.location.search : "";
  const initialRef = useRef(null);
  if (!initialRef.current) {
    initialRef.current = decodeScenario(search, { network: "atlas", policy: "balanced", speed: 1 });
  }
  const initial = initialRef.current;

  const canvasRef = useRef(null);
  const simRef = useRef(null);
  if (!simRef.current) {
    const s = makeSim(initial.network, initial.policy);
    s.config.demandRate = initial.demand;
    simRef.current = s;
  }
  const runningRef = useRef(true);
  const speedRef = useRef(initial.speed);
  const lastTickRef = useRef(-1);

  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(initial.speed);
  const [networkId, setNetworkId] = useState(initial.network);
  const [policyId, setPolicyId] = useState(initial.policy);
  const [demand, setDemand] = useState(initial.demand);
  const [view, setView] = useState(() => summarize(simRef.current));
  const [showIntro, setShowIntro] = useState(() => !introSeen() && !hasScenario(search));
  const [tourIndex, setTourIndex] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const [copied, setCopied] = useState(false);

  // Single animation loop: a fixed-timestep accumulator advances the sim, and
  // every frame renders with interpolation for smoothness.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const sizeToParent = () => {
      const parent = canvas.parentElement;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeToParent();
    const resize = new ResizeObserver(sizeToParent);
    resize.observe(canvas.parentElement);

    const frame = (now) => {
      const dt = Math.min(250, now - last);
      last = now;
      const sim = simRef.current;
      const interval = 1000 / (BASE_TPS * speedRef.current);

      if (runningRef.current) {
        acc += dt;
        let steps = 0;
        while (acc >= interval && steps < 8) {
          step(sim);
          acc -= interval;
          steps += 1;
        }
      } else {
        acc = 0;
      }

      const alpha = runningRef.current ? Math.min(1, acc / interval) : 0;
      const rect = canvas.parentElement;
      drawScene(ctx, sim, {
        width: rect.clientWidth,
        height: rect.clientHeight,
        tickFloat: sim.tick + alpha,
        theme: RENDER_THEME,
      });

      // Refresh the dashboard at the sim rate, not the frame rate.
      if (sim.tick !== lastTickRef.current) {
        lastTickRef.current = sim.tick;
        setView(summarize(sim));
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }, []);

  // Keep the URL in sync with the current view, so the address bar is always a
  // shareable link to exactly what is on screen. A pristine default view keeps a
  // clean URL (and the first-run intro); any customization dirties it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDefault =
      networkId === "atlas" &&
      policyId === "balanced" &&
      speed === 1 &&
      demand === NETWORKS.atlas.demand;
    if (isDefault) {
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      const qs = encodeScenario({ network: networkId, policy: policyId, demand, speed });
      window.history.replaceState(null, "", `?${qs}`);
    }
  }, [networkId, policyId, demand, speed]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (blocked / insecure context): no-op
    }
  };

  const toggleRun = () => {
    const next = !running;
    setRunning(next);
    runningRef.current = next;
  };

  const changeSpeed = (s) => {
    setSpeed(s);
    speedRef.current = s;
  };

  const changePolicy = (id) => {
    setPolicy(simRef.current, id);
    setPolicyId(id);
  };

  const changeDemand = (value) => {
    const rate = Number(value);
    setDemand(rate);
    simRef.current.config.demandRate = rate;
  };

  const reset = () => {
    simRef.current = makeSim(networkId, policyId);
    simRef.current.config.demandRate = demand;
    lastTickRef.current = -1;
    setView(summarize(simRef.current));
  };

  const changeNetwork = (id) => {
    const net = NETWORKS[id];
    simRef.current = makeSim(id, policyId);
    setNetworkId(id);
    setDemand(net.demand);
    lastTickRef.current = -1;
    setView(summarize(simRef.current));
  };

  // Guided tour: apply a step's settings, then let the viewer read and advance.
  const applyStep = (i) => {
    const s = TOUR_STEPS[i];
    if (s.network) changeNetwork(s.network);
    if (s.policy) changePolicy(s.policy);
    if (s.demand != null) changeDemand(s.demand);
    if (s.surge) triggerSurge(simRef.current, 400);
    if (s.calm) simRef.current.scenario.surge = 0;
    setRunning(true);
    runningRef.current = true;
    setHighlight(s.highlight ?? null);
  };

  const exitTour = () => {
    setTourIndex(null);
    setHighlight(null);
  };

  const startTour = () => {
    setShowIntro(false);
    markIntroSeen();
    setTourIndex(0);
    applyStep(0);
  };

  const nextStep = () => {
    if (tourIndex >= TOUR_STEPS.length - 1) {
      exitTour();
      return;
    }
    const n = tourIndex + 1;
    setTourIndex(n);
    applyStep(n);
  };

  const prevStep = () => {
    if (tourIndex <= 0) return;
    const n = tourIndex - 1;
    setTourIndex(n);
    applyStep(n);
  };

  const exploreSolo = () => {
    setShowIntro(false);
    markIntroSeen();
  };

  // Nudge the viewer toward a better policy when the current one is backing the
  // network up. Optimal is the best answer on both maps, so it never triggers.
  const overloaded = policyId !== "optimal" && view.backlog >= BACKLOG_ALERT;
  const outageTarget = NETWORKS[networkId].outageTarget;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <div>
            <h1 className="brand__name">Fleet Flow</h1>
            <p className="brand__tag">A live fulfillment network, routed in real time.</p>
          </div>
        </div>
        <div className={`segmented segmented--network ${highlight === "network" ? "is-tour" : ""}`} role="group" aria-label="Network">
          {NETWORK_LIST.map((net) => (
            <button
              key={net.id}
              className={`segmented__item ${networkId === net.id ? "is-active" : ""}`}
              onClick={() => changeNetwork(net.id)}
              title={net.id === "gauntlet" ? "Deeper network where whole-path routing wins" : "Balanced beats greedy here"}
            >
              {net.name}
            </button>
          ))}
        </div>
        <div className="topbar__actions">
          <button className="btn btn--sm" onClick={copyLink}>{copied ? "Copied!" : "Copy link"}</button>
          <button className="btn btn--sm" onClick={startTour}>Guided tour</button>
          <button className="btn btn--icon" onClick={() => setShowIntro(true)} aria-label="About and legend" title="About & legend">?</button>
          <a
            className="ghlink"
            href="https://github.com/technomad641/FleetFlow"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </header>

      <section className="metrics" aria-label="Network metrics">
        <Metric id="throughput" label="Throughput" value={view.throughput.toFixed(1)} unit="pkg/tick" tone="accent" highlight={highlight} />
        <Metric id="backlog" label="Backlog" value={view.backlog} unit="waiting" tone={view.backlog >= BACKLOG_ALERT ? "hot" : "default"} highlight={highlight} />
        <Metric id="inTransit" label="In transit" value={view.inTransit} unit="moving" highlight={highlight} />
        <Metric id="onTime" label="On-time" value={view.onTimePct.toFixed(0)} unit="%" tone={view.onTimePct < 80 ? "hot" : "good"} highlight={highlight} />
        <Metric id="delivered" label="Delivered" value={view.delivered.toLocaleString()} unit="total" highlight={highlight} />
        <Metric id="latency" label="Avg latency" value={view.avgLatency.toFixed(1)} unit="ticks" highlight={highlight} />
      </section>

      <section className={`stage ${highlight === "stage" ? "is-tour" : ""}`}>
        <canvas ref={canvasRef} className="canvas" />
        <div className="banners">
          {view.surging && <div className="banner banner--surge" role="status">Demand surge in progress</div>}
          {view.outageNode && (
            <div className="banner banner--out" role="status">Hub offline: {view.outageNode}</div>
          )}
          {overloaded && (
            <div className="banner banner--hot" role="status">
              {NETWORKS[networkId].overloadHint}
            </div>
          )}
        </div>
      </section>

      <footer className="controls">
        <div className="controls__group">
          <button className="btn btn--primary" onClick={toggleRun}>
            {running ? "Pause" : "Play"}
          </button>
          <div className="segmented" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={`segmented__item ${speed === s ? "is-active" : ""}`}
                onClick={() => changeSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <div className="controls__group">
          <label className="field">
            <span className="field__label">Demand</span>
            <input
              className="slider"
              type="range"
              min="0.5"
              max="6"
              step="0.1"
              value={demand}
              onChange={(e) => changeDemand(e.target.value)}
            />
            <span className="field__value">{demand.toFixed(1)}</span>
          </label>
        </div>

        <div className="controls__group">
          <div className={`segmented segmented--policy ${highlight === "policy" ? "is-tour" : ""}`} role="group" aria-label="Routing policy">
            {POLICY_LIST.map((p) => (
              <button
                key={p.id}
                className={`segmented__item ${policyId === p.id ? "is-active" : ""}`}
                onClick={() => changePolicy(p.id)}
                title={p.tagline}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="controls__group">
          <button className="btn" onClick={() => triggerSurge(simRef.current, 90)}>Surge</button>
          <button className="btn" onClick={() => triggerOutage(simRef.current, outageTarget, 90)}>Hub outage</button>
          <button className="btn btn--ghost" onClick={reset}>Reset</button>
        </div>
      </footer>

      {showIntro && (
        <Intro
          dismissible={introSeen()}
          onExplore={exploreSolo}
          onTour={startTour}
          onClose={() => setShowIntro(false)}
        />
      )}
      {tourIndex != null && (
        <Tour index={tourIndex} onNext={nextStep} onBack={prevStep} onExit={exitTour} />
      )}
    </div>
  );
}

function Metric({ id, label, value, unit, tone = "default", highlight = null }) {
  return (
    <div className={`metric metric--${tone} ${highlight === id ? "is-tour" : ""}`}>
      <span className="metric__label">{label}</span>
      <span className="metric__value">{value}</span>
      <span className="metric__unit">{unit}</span>
    </div>
  );
}
