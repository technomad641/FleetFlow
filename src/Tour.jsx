import React from "react";
import { TOUR_STEPS } from "./content.js";

// The guided tour card. It only renders the current step and the controls; App
// owns the step index and applies each step's effects to the simulation. The
// card sits at the bottom so the network stays visible while it narrates.
function Tour({ index, onNext, onBack, onExit }) {
  const step = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;
  const last = index === total - 1;

  return (
    <div className="tour" role="dialog" aria-live="polite" aria-label="Guided tour">
      <div className="tour__head">
        <span className="tour__count">
          {index + 1} / {total}
        </span>
        <button className="tour__exit" onClick={onExit} aria-label="End tour">
          End tour
        </button>
      </div>
      <h3 className="tour__title">{step.title}</h3>
      <p className="tour__body">{step.body}</p>
      <div className="tour__nav">
        <button className="btn btn--ghost" onClick={onBack} disabled={index === 0}>
          Back
        </button>
        <div className="tour__dots" aria-hidden="true">
          {TOUR_STEPS.map((_, i) => (
            <span key={i} className={`tour__dot ${i === index ? "is-active" : ""}`} />
          ))}
        </div>
        <button className="btn btn--primary" onClick={onNext}>
          {last ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}

export default Tour;
