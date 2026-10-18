import React from "react";
import { INTRO, LEGEND } from "./content.js";

// First-run overlay: the hook, the metaphor, and the legend, with a way straight
// into the guided tour or the sandbox. Also reachable later from the header.
function Intro({ onExplore, onTour, onClose, dismissible }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="About Fleet Flow">
      <div className="intro">
        {dismissible && (
          <button className="intro__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        )}
        <span className="brand__mark intro__mark" aria-hidden="true" />
        <h2 className="intro__title">{INTRO.title}</h2>
        <p className="intro__tagline">{INTRO.tagline}</p>
        <p className="intro__metaphor">{INTRO.metaphor}</p>

        <div className="legend">
          {LEGEND.map((item) => (
            <div className="legend__row" key={item.label}>
              <span className={`legend__swatch legend__swatch--${item.kind}`} aria-hidden="true" />
              <div>
                <span className="legend__label">{item.label}</span>
                <span className="legend__desc">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="intro__actions">
          <button className="btn btn--primary" onClick={onTour}>
            Take the guided tour
          </button>
          <button className="btn" onClick={onExplore}>
            Explore on my own
          </button>
        </div>
      </div>
    </div>
  );
}

export default Intro;
