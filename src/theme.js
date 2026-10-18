// Theme model: an explicit light/dark choice plus a "system" option that follows
// the OS. Storage is injected so it unit-tests with a plain in-memory stub and
// tolerates private-mode / disabled storage. Mirrors the sim modules' style.

export const THEME = {
  SYSTEM: "system",
  LIGHT: "light",
  DARK: "dark",
};

// The toggle cycles System -> Light -> Dark -> System.
export const THEME_CYCLE = [THEME.SYSTEM, THEME.LIGHT, THEME.DARK];

const THEME_KEY = "fleetflow.theme";
const VALID = new Set(THEME_CYCLE);

export function normalizeTheme(value) {
  return VALID.has(value) ? value : THEME.SYSTEM;
}

// Collapse the stored preference into the concrete theme to paint.
export function resolveTheme(preference, prefersDark) {
  const normalized = normalizeTheme(preference);
  if (normalized === THEME.SYSTEM) return prefersDark ? THEME.DARK : THEME.LIGHT;
  return normalized;
}

export function nextTheme(preference) {
  const i = THEME_CYCLE.indexOf(normalizeTheme(preference));
  return THEME_CYCLE[(i + 1) % THEME_CYCLE.length];
}

export function themeLabel(preference) {
  switch (normalizeTheme(preference)) {
    case THEME.LIGHT:
      return "Light";
    case THEME.DARK:
      return "Dark";
    default:
      return "System";
  }
}

export function loadTheme(storage) {
  if (!storage) return THEME.SYSTEM;
  try {
    return normalizeTheme(storage.getItem(THEME_KEY));
  } catch {
    return THEME.SYSTEM;
  }
}

export function saveTheme(storage, preference) {
  const normalized = normalizeTheme(preference);
  if (storage) {
    try {
      storage.setItem(THEME_KEY, normalized);
    } catch {
      // ignore (private mode / disabled / quota)
    }
  }
  return normalized;
}
