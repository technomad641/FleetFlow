import assert from "node:assert/strict";
import {
  THEME,
  normalizeTheme,
  resolveTheme,
  nextTheme,
  themeLabel,
  loadTheme,
  saveTheme,
} from "./theme.js";

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

export default function runThemeTests() {
  assert.equal(normalizeTheme("light"), THEME.LIGHT);
  assert.equal(normalizeTheme("neon"), THEME.SYSTEM);
  assert.equal(normalizeTheme(undefined), THEME.SYSTEM);

  assert.equal(resolveTheme(THEME.LIGHT, true), THEME.LIGHT);
  assert.equal(resolveTheme(THEME.DARK, false), THEME.DARK);
  assert.equal(resolveTheme(THEME.SYSTEM, true), THEME.DARK);
  assert.equal(resolveTheme(THEME.SYSTEM, false), THEME.LIGHT);
  assert.equal(resolveTheme("garbage", true), THEME.DARK);

  assert.equal(nextTheme(THEME.SYSTEM), THEME.LIGHT);
  assert.equal(nextTheme(THEME.LIGHT), THEME.DARK);
  assert.equal(nextTheme(THEME.DARK), THEME.SYSTEM);

  assert.equal(themeLabel(THEME.DARK), "Dark");
  assert.equal(themeLabel("garbage"), "System");

  // Storage round-trips and tolerates missing / hostile storage.
  assert.equal(loadTheme(null), THEME.SYSTEM);
  assert.equal(saveTheme(null, THEME.DARK), THEME.DARK);

  const storage = memoryStorage();
  assert.equal(loadTheme(storage), THEME.SYSTEM);
  assert.equal(saveTheme(storage, THEME.LIGHT), THEME.LIGHT);
  assert.equal(loadTheme(storage), THEME.LIGHT);
  assert.equal(saveTheme(storage, "garbage"), THEME.SYSTEM);

  const hostile = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(loadTheme(hostile), THEME.SYSTEM);
  assert.equal(saveTheme(hostile, THEME.DARK), THEME.DARK);
}
