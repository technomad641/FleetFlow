import assert from "node:assert/strict";
import { euclid, distanceMatrix, points, randomInstance } from "./instance.js";

export default function runVrpInstanceTests() {
  assert.equal(euclid({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);

  const pts = [
    { x: 0, y: 0 },
    { x: 3, y: 4 },
    { x: 0, y: 4 },
  ];
  const d = distanceMatrix(pts);
  assert.equal(d[0][0], 0);
  assert.equal(d[0][1], 5);
  assert.equal(d[1][0], 5); // symmetric
  assert.equal(d[0][2], 4);

  // randomInstance is reproducible and well formed.
  const a = randomInstance({ count: 20, capacity: 15, seed: 3 });
  const b = randomInstance({ count: 20, capacity: 15, seed: 3 });
  assert.deepEqual(a.customers, b.customers);
  assert.equal(a.customers.length, 20);
  assert.equal(a.capacity, 15);
  assert.equal(a.depot.demand, 0);

  // Points places the depot first.
  assert.equal(points(a)[0], a.depot);
  assert.equal(points(a).length, 21);

  // Customers stay in bounds and carry a positive demand within range.
  for (const c of a.customers) {
    assert.ok(c.x >= 0.05 && c.x <= 0.95);
    assert.ok(c.y >= 0.05 && c.y <= 0.95);
    assert.ok(c.demand >= 1 && c.demand <= 4);
  }

  // A different seed gives a different layout.
  const c = randomInstance({ count: 20, capacity: 15, seed: 4 });
  assert.notDeepEqual(a.customers, c.customers);
}
