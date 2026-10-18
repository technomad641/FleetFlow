import React, { useEffect, useMemo, useRef, useState } from "react";
import { randomInstance, randomVrptwInstance, hasTimeWindows } from "./vrp/instance.js";
import { solve, SOLVERS } from "./vrp/solver.js";
import { solveVrptw, VRPTW_SOLVERS } from "./vrp/vrptw.js";
import { REAL_INSTANCES, REAL_INSTANCE_MAP } from "./vrp/instances.js";
import { drawDispatch } from "./render/dispatchRenderer.js";

// The Dispatch view: classic vehicle routing, in two flavours. Pick an instance
// (a random layout you can resize, or a real published benchmark) and watch the
// solver turn one-truck-per-stop into a handful of tight loops.
//
//   CVRP  - capacity only. Solvers: one-per-stop / Clarke-Wright savings / +2-opt.
//   VRPTW - capacity AND a hard delivery window per stop. Solvers: ignore windows
//           (the CVRP route, scheduled against the clock, usually late) /
//           Solomon I1 insertion / I1 + time-feasible 2-opt. A stop served after
//           its window closes is ringed in red.
//
// Real instances carry a best-known solution (BKS) so the solver can be measured
// against it.
const INSTANCE_OPTIONS = [
  { id: "random-cvrp", name: "Random — CVRP", kind: "cvrp" },
  { id: "random-vrptw", name: "Random — VRPTW", kind: "vrptw" },
  ...REAL_INSTANCES.map((i) => ({ id: i.id, name: `${i.name} (${i.kind.toUpperCase()})`, kind: i.kind })),
];

const DEFAULT_SOLVER = { cvrp: "opt", vrptw: "tw-opt" };
const DEFAULT_CAPACITY = { cvrp: 18, vrptw: 50 };

export default function Dispatch({ theme }) {
  const [instanceId, setInstanceId] = useState("random-cvrp");
  const [solverId, setSolverId] = useState("opt");
  const [count, setCount] = useState(20);
  const [capacity, setCapacity] = useState(18);
  const [seed, setSeed] = useState(1);

  const instance = useMemo(() => {
    if (instanceId === "random-cvrp") return randomInstance({ count, capacity, seed });
    if (instanceId === "random-vrptw") return randomVrptwInstance({ count, capacity, seed });
    return REAL_INSTANCE_MAP[instanceId];
  }, [instanceId, count, capacity, seed]);

  const isVrptw = hasTimeWindows(instance);
  const isReal = Boolean(instance.bks);
  const solvers = isVrptw ? VRPTW_SOLVERS : SOLVERS;

  // Keep the chosen solver valid when the instance type changes.
  useEffect(() => {
    if (!solvers.some((s) => s.id === solverId)) {
      setSolverId(DEFAULT_SOLVER[isVrptw ? "vrptw" : "cvrp"]);
    }
  }, [isVrptw]); // eslint-disable-line react-hooks/exhaustive-deps

  // The CVRP baseline (distance-only routes) that the "ignore windows" solver
  // schedules against the clock.
  const cvrpBaseline = useMemo(
    () => (isVrptw ? solve(instance, "opt").routes : null),
    [instance, isVrptw]
  );

  const solution = useMemo(() => {
    if (isVrptw) return solveVrptw(instance, solvers.some((s) => s.id === solverId) ? solverId : "tw-opt", cvrpBaseline);
    return solve(instance, solvers.some((s) => s.id === solverId) ? solverId : "opt");
  }, [instance, solverId, isVrptw, cvrpBaseline]); // eslint-disable-line react-hooks/exhaustive-deps

  const naiveDistance = useMemo(() => solve(instance, "naive").totalDistance, [instance]);
  const improvement = naiveDistance > 0 ? (1 - solution.totalDistance / naiveDistance) * 100 : 0;

  // Which stops are served late (VRPTW only): map route-position begins to due times.
  const lateCustomers = useMemo(() => {
    const set = new Set();
    if (!isVrptw || !solution.schedules) return set;
    solution.routes.forEach((route, r) => {
      const begins = solution.schedules[r].begins;
      route.forEach((idx, p) => {
        const due = instance.customers[idx - 1].due;
        if (Number.isFinite(due) && begins[p] > due + 1e-6) set.add(idx);
      });
    });
    return set;
  }, [solution, instance, isVrptw]);

  const served = instance.customers.length;
  const feasible = isVrptw ? solution.feasible : true; // CVRP has no windows to miss
  const onTimePct = isVrptw ? ((served - solution.lateStops) / served) * 100 : 100;
  const bksGap = isReal && solution.totalDistance > 0 ? (solution.totalDistance / instance.bks.distance - 1) * 100 : 0;

  // Refs so the single animation loop always draws the latest solution.
  const canvasRef = useRef(null);
  const instanceRef = useRef(instance);
  const solutionRef = useRef(solution);
  const themeRef = useRef(theme);
  const lateRef = useRef(lateCustomers);
  instanceRef.current = instance;
  solutionRef.current = solution;
  themeRef.current = theme;
  lateRef.current = lateCustomers;

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
        lateCustomers: lateRef.current,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }, []);

  const changeInstance = (id) => {
    const opt = INSTANCE_OPTIONS.find((o) => o.id === id);
    setInstanceId(id);
    setSolverId(DEFAULT_SOLVER[opt.kind]);
    if (id === "random-cvrp" || id === "random-vrptw") setCapacity(DEFAULT_CAPACITY[opt.kind]);
  };

  return (
    <>
      <section className="metrics" aria-label="Dispatch metrics">
        <DMetric label="Total distance" value={solution.totalDistance.toFixed(isReal && !isVrptw ? 0 : 1)} unit="units" tone="accent" />
        <DMetric label="Vehicles" value={solution.vehicles} unit="routes" />
        {isVrptw ? (
          <>
            <DMetric
              label="On-time"
              value={`${onTimePct.toFixed(0)}%`}
              unit={solution.lateStops ? `${solution.lateStops} late` : "all met"}
              tone={solution.lateStops ? "hot" : "good"}
            />
            <DMetric
              label="Max lateness"
              value={solution.maxLateness.toFixed(0)}
              unit="time units"
              tone={solution.maxLateness > 0 ? "hot" : "default"}
            />
          </>
        ) : (
          <>
            <DMetric label="Stops" value={served} unit="customers" />
            <DMetric
              label="vs one-per-stop"
              value={`${improvement.toFixed(0)}%`}
              unit="shorter"
              tone={solverId === "naive" ? "default" : "good"}
            />
          </>
        )}
        {isReal ? (
          <DMetric
            label="vs best-known"
            value={!feasible ? "—" : bksGap <= 0.05 ? "optimal" : `+${bksGap.toFixed(1)}%`}
            unit={!feasible ? "windows missed" : `BKS ${instance.bks.distance}`}
            tone="default"
            small
          />
        ) : (
          <DMetric label={isVrptw ? "Makespan" : "Capacity"} value={isVrptw ? solution.makespan.toFixed(0) : capacity} unit={isVrptw ? "time units" : "per vehicle"} />
        )}
        <DMetric label="Solver" value={solvers.find((s) => s.id === solverId)?.label ?? ""} unit="heuristic" small />
      </section>

      <section className="stage">
        <canvas ref={canvasRef} className="canvas" />
      </section>

      <footer className="controls">
        <div className="controls__group">
          <label className="field">
            <span className="field__label">Instance</span>
            <select className="select" value={instanceId} onChange={(e) => changeInstance(e.target.value)} aria-label="Instance">
              {INSTANCE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="controls__group">
          <div className="segmented segmented--policy" role="group" aria-label="Solver">
            {solvers.map((s) => (
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

        {isReal ? (
          <div className="controls__group">
            <span className="dispatch-note">{instance.source} · BKS {instance.bks.distance} / {instance.bks.vehicles} vehicles</span>
          </div>
        ) : (
          <>
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
                <input className="slider" type="range"
                  min={isVrptw ? 30 : 6} max={isVrptw ? 120 : 30} step={isVrptw ? 5 : 1}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))} />
                <span className="field__value">{capacity}</span>
              </label>
            </div>

            <div className="controls__group">
              <button className="btn" onClick={() => setSeed((s) => s + 1)}>New layout</button>
            </div>
          </>
        )}
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
