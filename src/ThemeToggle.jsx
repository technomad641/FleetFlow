import React from "react";
import { THEME, themeLabel } from "./theme.js";

// A single control that cycles System -> Light -> Dark. The current choice is
// announced so it is never icon-only to assistive tech. Icons use currentColor,
// so they follow the theme.
const ICON = {
  [THEME.SYSTEM]: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" strokeLinecap="round" />
    </svg>
  ),
  [THEME.LIGHT]: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
    </svg>
  ),
  [THEME.DARK]: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinejoin="round" />
    </svg>
  ),
};

function ThemeToggle({ preference, onCycle }) {
  const label = themeLabel(preference);
  return (
    <button
      type="button"
      className="btn btn--icon"
      onClick={onCycle}
      aria-label={`Theme: ${label}. Activate to change.`}
      title={`Theme: ${label}`}
    >
      {ICON[preference] || ICON[THEME.SYSTEM]}
    </button>
  );
}

export default ThemeToggle;
