import React, { useEffect, useRef, useState } from "react";
import {
  createSimulation,
  step,
  setPolicy,
  triggerSurge,
  triggerOutage,
} from "./sim/simulation.js";
import { summarize } from "./sim/metrics.js";
import { DEFAULT_NETWORK } from "./sim/network.js";
import { POLICY_LIST } from "./sim/policies.js";
import { drawScene } from "./render/renderer.js";

const BASE_TPS = 10; // simulation ticks per second at 1x speed
const SPEEDS = [0.5, 1, 2, 4];
const BACKLOG_ALERT = 60;

const RENDER_THEME = {
  grid: "rgba(255, 255, 255, 0.05)",
  nodeFill: "rgba(10, 11, 14, 0.94)",
  label: "rgba(214, 219, 230, 0.82)",
};

function makeSim() {
  return createSimulation({ networkDef: DEFAULT_NETWORK, seed: 42, demandRate: 3.0, policyId: "balanced" });
}

export default function App() {
  const canvasRef = useRef(null);
  const simRef = useRef(makeSim());
  const runningRef = useRef(true);
  const speedRef = useRef(1);
  const lastTickRef = useRef(-1);

  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [policyId, setPolicyId] = useState("balanced");
  const [demand, setDemand] = useState(3.0);
  const [view, setView] = useState(() => summarize(simRef.current));

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
    simRef.current = makeSim();
    simRef.current.config.demandRate = demand;
    setPolicy(simRef.current, policyId);
    lastTickRef.current = -1;
    setView(summarize(simRef.current));
  };

  const overloaded = policyId === "greedy" && view.backlog >= BACKLOG_ALERT;

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
        <a
          className="ghlink"
          href="https://github.com/technomad641/FleetFlow"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </header>

      <section className="metrics" aria-label="Network metrics">
        <Metric label="Throughput" value={view.throughput.toFixed(1)} unit="pkg/tick" tone="accent" />
        <Metric label="Backlog" value={view.backlog} unit="waiting" tone={view.backlog >= BACKLOG_ALERT ? "hot" : "default"} />
        <Metric label="In transit" value={view.inTransit} unit="moving" />
        <Metric label="On-time" value={view.onTimePct.toFixed(0)} unit="%" tone={view.onTimePct < 80 ? "hot" : "good"} />
        <Metric label="Delivered" value={view.delivered.toLocaleString()} unit="total" />
        <Metric label="Avg latency" value={view.avgLatency.toFixed(1)} unit="ticks" />
      </section>

      <section className="stage">
        <canvas ref={canvasRef} className="canvas" />
        <div className="banners">
          {view.surging && <div className="banner banner--surge" role="status">Demand surge in progress</div>}
          {view.outageNode && (
            <div className="banner banner--out" role="status">Hub offline: {view.outageNode}</div>
          )}
          {overloaded && (
            <div className="banner banner--hot" role="status">
              Central hub overloaded. Switch routing to <strong>Balanced</strong> and watch it recover.
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
          <div className="segmented segmented--policy" role="group" aria-label="Routing policy">
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
          <button className="btn" onClick={() => triggerOutage(simRef.current, "HUB-C", 90)}>Hub outage</button>
          <button className="btn btn--ghost" onClick={reset}>Reset</button>
        </div>
      </footer>
    </div>
  );
}

function Metric({ label, value, unit, tone = "default" }) {
  return (
    <div className={`metric metric--${tone}`}>
      <span className="metric__label">{label}</span>
      <span className="metric__value">{value}</span>
      <span className="metric__unit">{unit}</span>
    </div>
  );
}
