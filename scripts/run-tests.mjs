// Zero-dependency test runner. Each suite is a module that default-exports a
// function running node:assert checks and throwing on failure. `npm run build`
// runs this first, so a red test fails the build. To add a suite, create
// src/**/<name>.test.js and register it below.
import runRngTests from "../src/sim/rng.test.js";
import runNetworkTests from "../src/sim/network.test.js";
import runPolicyTests from "../src/sim/policies.test.js";
import runSimulationTests from "../src/sim/simulation.test.js";
import runMetricsTests from "../src/sim/metrics.test.js";
import runShareStateTests from "../src/shareState.test.js";
import runVrpInstanceTests from "../src/vrp/instance.test.js";
import runSolverTests from "../src/vrp/solver.test.js";
import runVrptwTests from "../src/vrp/vrptw.test.js";
import runInstancesTests from "../src/vrp/instances.test.js";
import runThemeTests from "../src/theme.test.js";

const testSuites = [
  ["rng", runRngTests],
  ["network", runNetworkTests],
  ["policies", runPolicyTests],
  ["simulation", runSimulationTests],
  ["metrics", runMetricsTests],
  ["shareState", runShareStateTests],
  ["vrp-instance", runVrpInstanceTests],
  ["vrp-solver", runSolverTests],
  ["vrptw", runVrptwTests],
  ["real-instances", runInstancesTests],
  ["theme", runThemeTests],
];

let failures = 0;
for (const [name, run] of testSuites) {
  try {
    run();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${name}`);
    console.error(error.stack || error.message);
  }
}

if (failures > 0) {
  console.error(`\n${failures} suite(s) failed`);
  process.exit(1);
}
console.log(`\n${testSuites.length} suite(s) passed`);
