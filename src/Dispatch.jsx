import React, { useEffect, useMemo, useRef, useState } from "react";
import { randomInstance } from "./vrp/instance.js";
import { solve, SOLVERS } from "./vrp/solver.js";
import { drawDispatch } from "./render/dispatchRenderer.js";

// The Dispatch view: classic capacitated vehicle routing. Pick how many stops
// and how big each truck is, then watch the solver turn one-truck-per-stop into
// a handful of tight loops. The solver selector mirrors the network view's
// policy contrast: naive -> savings -> savings + 2-opt.
export default function Dispatch({ theme }) {
  const [solverId, setSolverId] = useState("opt");
  const [count, setCount] = useState(20);
  const [capacity, setCapacity] = useState(18);
  const [seed, setSeed] = useState(1);

  const instance = useMemo(() => randomInstance({ count, capacity, seed }), [count, capacity, seed]);
  const solution = useMemo(() => solve(instance, solverId), [instance, solverId]);
  const naiveDistance = useMemo(() => solve(instance, "naive").totalDistance, [instance]);
  const improvement = naiveDistance > 0 ? (1 - solution.totalDistance / naiveDistance) * 100 : 0;

  // Refs so the single animation loop always draws the latest solution.
  const canvasRef = useRef(null);
  const instanceRef = useRef(instance);
  const solutionRef = useRef(solution);
  const themeRef = useRef(theme);
  instanceRef.current = instance;
  solutionRef.current = solution;
  themeRef.current = theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    const start = performance.now();

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
      const parent = canvas.parentElement;
      drawDispatch(ctx, {
        instance: instanceRef.current,
        solution: solutionRef.current,
        width: parent.clientWidth,
        height: parent.clientHeight,
        t: (now - start) / 4200, // vehicles loop ~every 4.2s
        theme: themeRef.current,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }, []);

  return (
    <>
      <section className="metrics" aria-label="Dispatch metrics">
        <DMetric label="Total distance" value={solution.totalDistance.toFixed(2)} unit="units" tone="accent" />
        <DMetric label="Vehicles" value={solution.vehicles} unit="routes" />
        <DMetric label="Stops" value={count} unit="customers" />
        <DMetric label="Capacity" value={capacity} unit="per vehicle" />
        <DMetric
          label="vs one-per-stop"
          value={`${improvement.toFixed(0)}%`}
          unit="shorter"
          tone={solverId === "naive" ? "default" : "good"}
        />
        <DMetric label="Solver" value={SOLVERS.find((s) => s.id === solverId)?.label ?? ""} unit="heuristic" small />
      </section>

      <section className="stage">
        <canvas ref={canvasRef} className="canvas" />
      </section>

      <footer className="controls">
        <div className="controls__group">
          <div className="segmented segmented--policy" role="group" aria-label="Solver">
            {SOLVERS.map((s) => (
              <button
                key={s.id}
                className={`segmented__item ${solverId === s.id ? "is-active" : ""}`}
                onClick={() => setSolverId(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="controls__group">
          <label className="field">
            <span className="field__label">Stops</span>
            <input className="slider" type="range" min="6" max="40" step="1" value={count}
              onChange={(e) => setCount(Number(e.target.value))} />
            <span className="field__value">{count}</span>
          </label>
        </div>

        <div className="controls__group">
          <label className="field">
            <span className="field__label">Capacity</span>
            <input className="slider" type="range" min="6" max="30" step="1" value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))} />
            <span className="field__value">{capacity}</span>
          </label>
        </div>

        <div className="controls__group">
          <button className="btn" onClick={() => setSeed((s) => s + 1)}>New layout</button>
        </div>
      </footer>
    </>
  );
}

function DMetric({ label, value, unit, tone = "default", small = false }) {
  return (
    <div className={`metric metric--${tone}`}>
      <span className="metric__label">{label}</span>
      <span className={`metric__value ${small ? "metric__value--sm" : ""}`}>{value}</span>
      <span className="metric__unit">{unit}</span>
    </div>
  );
}
