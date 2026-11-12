// Physics sanity checks for js/fluid.js, run headless in Node with a minimal DOM stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../../js/fluid.js', import.meta.url), 'utf8');

/** Load the solver into a sandbox sized like a hero of the given CSS size. */
function loadSim({ width, height, textRight = width * 0.55 }) {
  const noop = () => {};
  const canvas = {
    width: 0, height: 0,
    getBoundingClientRect: () => ({ width, height, left: 0, top: 0, right: width, bottom: height }),
    getContext: () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: noop,
    }),
    closest: () => ({
      addEventListener: noop,
      querySelector: () => ({ getBoundingClientRect: () => ({ right: textRight }) }),
    }),
  };
  const window = {
    __FLUID_DEBUG__: {},
    innerWidth: width,
    matchMedia: () => ({ matches: false }),
    addEventListener: noop,
  };
  const context = {
    window,
    document: { getElementById: id => (id === 'flow' ? canvas : null), addEventListener: noop, hidden: false },
    IntersectionObserver: class { observe() {} },
    requestAnimationFrame: noop, // tests drive the solver directly
  };
  vm.runInNewContext(SOURCE, context);
  return window.__FLUID_DEBUG__.sim;
}

function run(sim, n, onStep) {
  for (let k = 0; k < n; k++) { sim.step(); if (onStep) onStep(sim); }
}

test('solver stays finite and temperature stays bounded', () => {
  const sim = loadSim({ width: 1440, height: 760 });
  run(sim, 3000);
  for (const field of [sim.ux, sim.uy, sim.T]) {
    for (const v of field) assert.ok(Number.isFinite(v), 'non-finite value in field');
  }
  const Tmin = Math.min(...sim.T), Tmax = Math.max(...sim.T);
  assert.ok(Tmin > -0.05, `temperature undershoot ${Tmin}`);
  assert.ok(Tmax <= 1 + 1e-6, `temperature overshoot ${Tmax}`);
  const umax = Math.max(...sim.ux.map(Math.abs), ...sim.uy.map(Math.abs));
  assert.ok(umax < 0.3, `velocity too large for low-Mach LBM: ${umax}`);
});

test('cylinder sheds vortices (wake velocity oscillates)', () => {
  const sim = loadSim({ width: 1440, height: 760 });
  const { cx, cy, r } = sim.geom;
  const probe = Math.round(cy) * sim.W + Math.min(sim.W - 3, Math.round(cx + 4 * r));
  run(sim, 2500);
  let signChanges = 0, prev = 0, peak = 0;
  run(sim, 4000, s => {
    if (s.steps % 25) return;
    const v = s.uy[probe];
    peak = Math.max(peak, Math.abs(v));
    if (prev && Math.sign(v) !== Math.sign(prev) && Math.abs(v) > 0.005) signChanges++;
    if (Math.abs(v) > 0.005) prev = v;
  });
  assert.ok(peak > 0.02, `wake too weak, peak |uy| = ${peak}`);
  assert.ok(signChanges >= 3, `expected periodic shedding, saw ${signChanges} sign changes`);
});

test('mean flow stays near the inflow speed over a long run (no slow momentum drift)', () => {
  // The top and outflow boundaries are plain zero-gradient copies, which are weakly
  // reflecting; without the sponge zone near those edges, momentum slowly leaks into the
  // domain over a long run and the mean flow drifts well past U0, distorting the shedding
  // before it eventually destabilizes outright.
  const sim = loadSim({ width: 1440, height: 760 });
  const meanUx = () => sim.ux.reduce((a, b) => a + b, 0) / sim.ux.length;
  run(sim, 4000); // past the initial transient, into the periodic shedding regime
  const early = meanUx();
  run(sim, 8000);
  const late = meanUx();
  for (const m of [early, late])
    assert.ok(Math.abs(m - sim.U0) < 0.015, `mean flow drifted from U0=${sim.U0}: ${m}`);
  assert.ok(Math.abs(late - early) < 0.01, `mean flow still drifting: ${early} -> ${late}`);
});

test('heated plate gives a plausible Nusselt number', () => {
  const sim = loadSim({ width: 1440, height: 760 });
  run(sim, 5000);
  const nu = sim.nusselt();
  assert.ok(nu > 1 && nu < 20, `Nu_D out of plausible range: ${nu}`);
});

test('cylinder sits clear of the hero text on wide screens', () => {
  for (const [width, textRight] of [[1024, 644], [1440, 810], [1920, 1044]]) {
    const sim = loadSim({ width, height: 760, textRight });
    const { cx, r } = sim.geom;
    const leftEdgePx = ((cx - r) / sim.W) * width;
    assert.ok(leftEdgePx > textRight, `${width}px: cylinder at ${leftEdgePx}px overlaps text ending at ${textRight}px`);
  }
});

test('phone-sized hero still builds a sensible grid', () => {
  const sim = loadSim({ width: 390, height: 760 });
  assert.ok(sim.W >= 60 && sim.H >= 40);
  const { cx, r } = sim.geom;
  assert.ok(cx - r > 2 && cx + r < sim.W - 2, 'cylinder must fit inside the domain');
  run(sim, 1500);
  for (const v of sim.T) assert.ok(Number.isFinite(v));
});
