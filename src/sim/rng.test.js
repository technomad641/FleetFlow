import assert from "node:assert/strict";
import { createRng } from "./rng.js";

export default function runRngTests() {
  // Same seed replays the exact same sequence.
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 10; i += 1) assert.equal(a.float(), b.float());

  // Different seeds diverge.
  const c = createRng(42);
  const d = createRng(43);
  assert.notEqual(c.float(), d.float());

  // Seed 0 is remapped and still produces usable values (no stuck-at-zero).
  const zero = createRng(0);
  const v = zero.float();
  assert.ok(v >= 0 && v < 1);

  // float stays in [0, 1).
  const r = createRng(7);
  for (let i = 0; i < 1000; i += 1) {
    const f = r.float();
    assert.ok(f >= 0 && f < 1, `float out of range: ${f}`);
  }

  // int is inclusive on both ends and never escapes the range.
  const ri = createRng(9);
  let sawMin = false;
  let sawMax = false;
  for (let i = 0; i < 2000; i += 1) {
    const n = ri.int(3, 6);
    assert.ok(n >= 3 && n <= 6);
    if (n === 3) sawMin = true;
    if (n === 6) sawMax = true;
  }
  assert.ok(sawMin && sawMax, "int should reach both bounds");

  // pick returns an element of the array.
  const rp = createRng(11);
  const arr = ["x", "y", "z"];
  for (let i = 0; i < 100; i += 1) assert.ok(arr.includes(rp.pick(arr)));

  // Poisson sample mean converges to lambda.
  const rpo = createRng(123);
  const lambda = 2.0;
  const samples = 20000;
  let total = 0;
  for (let i = 0; i < samples; i += 1) total += rpo.poisson(lambda);
  const mean = total / samples;
  assert.ok(Math.abs(mean - lambda) < 0.1, `poisson mean ${mean} off from ${lambda}`);

  // Poisson of a non-positive rate is zero.
  assert.equal(createRng(1).poisson(0), 0);
}
