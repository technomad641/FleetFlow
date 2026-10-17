// Deterministic pseudo-random number generator. The whole simulation is a pure
// function of (seed, config, ticks), so a given seed always replays the exact
// same run. That reproducibility is what makes the engine testable and what lets
// two routing policies be compared on identical demand.
//
// mulberry32: a tiny, fast, well-distributed 32-bit PRNG. Good enough for a
// simulation; not for cryptography.

export function createRng(seed = 1) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9; // avoid the all-zero fixed point

  function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    // A float in [0, 1).
    float: next,
    // An integer in [min, max] inclusive.
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // A uniformly chosen element of a non-empty array.
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
    // Number of events in one unit of time for a Poisson process with mean
    // `lambda` (Knuth's algorithm). This is how demand arrives: bursty, not
    // evenly spaced, like real orders.
    poisson(lambda) {
      if (lambda <= 0) return 0;
      const limit = Math.exp(-lambda);
      let k = 0;
      let product = next();
      while (product > limit) {
        k += 1;
        product *= next();
      }
      return k;
    },
  };
}
