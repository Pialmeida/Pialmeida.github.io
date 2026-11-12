// Live lattice-Boltzmann simulation: flow past a cylinder cooling a heated wall.
//
//   Flow:        D2Q9 BGK, half-way bounce-back (cylinder + no-slip bottom wall)
//   Temperature: D2Q5 BGK passive scalar (double-distribution thermal LBM),
//                anti-bounce-back Dirichlet on the heated plate, adiabatic elsewhere
//
// Vorticity is drawn in cool tones and temperature in warm tones on a coarse grid,
// scaled up with nearest-neighbour sampling for a pixel look. The HUD shows the
// plate-averaged Nusselt number. Move the pointer over the hero to stir the flow.
(() => {
  const canvas = document.getElementById('flow');
  if (!canvas) return;
  const hero = canvas.closest('.hero');
  const hud = document.getElementById('flow-hud');
  const toggle = document.getElementById('flow-toggle');
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // D2Q9 flow lattice: rest, E, S, W, N, SE, SW, NW, NE  (y grows downward)
  const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
  const EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
  const WT = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
  const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
  // D2Q5 thermal lattice (cs^2 = 1/3)
  const TX = [0, 1, 0, -1, 0];
  const TY = [0, 0, 1, 0, -1];
  const TWT = [1 / 3, 1 / 6, 1 / 6, 1 / 6, 1 / 6];
  const TOPP = [0, 3, 4, 1, 2];

  const U0 = 0.1;    // inflow velocity (lattice units)
  const RE = 120;    // Reynolds number on cylinder diameter
  const PR = 0.7;    // Prandtl number (air)
  const T_WALL = 1;  // heated plate; inflow is T = 0

  const CYL = 1, WALL = 2, HOT = 3;   // solid cell types

  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const BG = rgb('#0b1220');
  const COOL_NEG = ['#14304d', '#1f5a80', '#3a93b8', '#8be6f2'].map(rgb); // clockwise
  const COOL_POS = ['#1d2a55', '#34418a', '#5f6cc4', '#a9b2ff'].map(rgb); // counter-clockwise
  const WARM = ['#3b1e2c', '#7a2d35', '#c4513a', '#ec8a3c', '#ffc95e'].map(rgb);
  const T_BANDS = [0.05, 0.14, 0.3, 0.5, 0.72];
  const C_CYL = rgb('#e8e6df'), C_WALL = rgb('#3a4558'), C_HOT = rgb('#ff7a45');

  let W, H, N, D, f, f2, t, t2, ux, uy, T, solid, img, omega, omegaT, feqIn;
  let heatStart = 0, nu = 0, nuAvg = 0;
  let steps = 0, warmup = 0, running = !reduceMotion, visible = true;
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, active: false, has: false };

  const feq = (i, r, u, v) => {
    const eu = EX[i] * u + EY[i] * v;
    return WT[i] * r * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * (u * u + v * v));
  };

  function init() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const narrow = rect.width < 700;
    const cell = narrow ? 6 : 7;
    W = Math.max(80, Math.min(220, Math.round(rect.width / cell)));
    H = Math.max(40, Math.min(170, Math.round(W * rect.height / rect.width)));
    N = W * H;
    canvas.width = W;
    canvas.height = H;
    img = ctx.createImageData(W, H);

    f = new Float32Array(9 * N); f2 = new Float32Array(9 * N);
    t = new Float32Array(5 * N); t2 = new Float32Array(5 * N);
    ux = new Float32Array(N); uy = new Float32Array(N); T = new Float32Array(N);
    solid = new Uint8Array(N);

    // Cylinder in the lower part of the channel so its wake sweeps the plate.
    // Offset half a cell vertically so shedding is not perfectly symmetric.
    const r = Math.max(4, Math.round(Math.min(H * 0.085, W * 0.07)));
    D = 2 * r;
    const cx = Math.round(W * (narrow ? 0.3 : 0.5));
    const cy = Math.round(H * 0.68) + 0.5;
    heatStart = Math.max(1, cx - r);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) solid[y * W + x] = CYL;
    for (let x = 0; x < W; x++) solid[(H - 1) * W + x] = x >= heatStart ? HOT : WALL;

    const nuK = Math.max(0.008, (U0 * D) / RE);
    omega = 1 / (3 * nuK + 0.5);
    omegaT = 1 / (3 * (nuK / PR) + 0.5);
    feqIn = EX.map((_, i) => feq(i, 1, U0, 0));

    // Uniform cold flow plus a transverse kick behind the cylinder, so the
    // von Karman street forms in seconds instead of waiting for round-off to grow.
    t.fill(0); T.fill(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const v = 0.5 * U0 * Math.exp(-((x - cx - 3 * r) ** 2 + (y - cy) ** 2) / (r * r));
        for (let i = 0; i < 9; i++) f[i * N + idx] = feq(i, 1, U0, v);
        ux[idx] = U0; uy[idx] = v;
      }
    }

    steps = 0; nuAvg = 0;
    warmup = 2100;
    return true;
  }

  // One fused pull-stream + collide step for both lattices.
  function step() {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const s = solid[idx];
        if (s) { ux[idx] = 0; uy[idx] = 0; T[idx] = s === HOT ? T_WALL : T[idx]; continue; }

        if (x === 0 || y === 0) {
          // Inflow and top far-field: uniform, cold.
          for (let i = 0; i < 9; i++) f2[i * N + idx] = feqIn[i];
          for (let i = 0; i < 5; i++) t2[i * N + idx] = 0;
          ux[idx] = U0; uy[idx] = 0; T[idx] = 0;
          continue;
        }
        if (x === W - 1) {
          // Outflow: zero-gradient, copy the neighbouring column.
          for (let i = 0; i < 9; i++) f2[i * N + idx] = f2[i * N + idx - 1];
          for (let i = 0; i < 5; i++) t2[i * N + idx] = t2[i * N + idx - 1];
          ux[idx] = ux[idx - 1]; uy[idx] = uy[idx - 1]; T[idx] = T[idx - 1];
          continue;
        }

        // --- Flow (D2Q9) ---
        let rho = 0, mx = 0, my = 0;
        for (let i = 0; i < 9; i++) {
          const src = idx - EX[i] - EY[i] * W;
          const fi = solid[src] ? f[OPP[i] * N + idx] : f[i * N + src];  // bounce-back
          f2[i * N + idx] = fi;
          rho += fi; mx += EX[i] * fi; my += EY[i] * fi;
        }
        const u = mx / rho, v = my / rho;
        ux[idx] = u; uy[idx] = v;
        const usq = 1.5 * (u * u + v * v);
        for (let i = 0; i < 9; i++) {
          const eu = EX[i] * u + EY[i] * v;
          const k = i * N + idx;
          f2[k] += omega * (WT[i] * rho * (1 + 3 * eu + 4.5 * eu * eu - usq) - f2[k]);
        }

        // --- Temperature (D2Q5 passive scalar) ---
        let temp = 0;
        for (let i = 0; i < 5; i++) {
          const src = idx - TX[i] - TY[i] * W;
          const ss = solid[src];
          let ti;
          if (ss === HOT) ti = -t[TOPP[i] * N + idx] + 2 * TWT[i] * T_WALL;  // anti-bounce-back
          else if (ss) ti = t[TOPP[i] * N + idx];                            // adiabatic
          else ti = t[i * N + src];
          t2[i * N + idx] = ti;
          temp += ti;
        }
        T[idx] = temp;
        for (let i = 0; i < 5; i++) {
          const k = i * N + idx;
          t2[k] += omegaT * (TWT[i] * temp * (1 + 3 * (TX[i] * u + TY[i] * v)) - t2[k]);
        }
      }
    }
    let swap = f; f = f2; f2 = swap;
    swap = t; t = t2; t2 = swap;
    steps++;
  }

  // Plate-averaged Nusselt number on cylinder diameter: Nu_D = D * <dT/dn> / (T_wall - T_in),
  // with the wall half a cell below the first fluid row.
  function nusselt() {
    let sum = 0, n = 0;
    const row = (H - 2) * W;
    for (let x = heatStart; x < W - 1; x++) { sum += (T_WALL - T[row + x]) / 0.5; n++; }
    return n ? (D * sum) / n / T_WALL : 0;
  }

  // Push fluid around the pointer by relaxing nearby cells toward the pointer's velocity.
  function stir() {
    if (!pointer.active) return;
    const R = 4;
    const sp = Math.hypot(pointer.vx, pointer.vy);
    const scale = sp > 0.15 ? 0.15 / sp : 1;
    const vx = pointer.vx * scale, vy = pointer.vy * scale;
    for (let y = Math.max(1, Math.floor(pointer.y - R)); y <= Math.min(H - 2, pointer.y + R); y++) {
      for (let x = Math.max(1, Math.floor(pointer.x - R)); x <= Math.min(W - 2, pointer.x + R); x++) {
        const idx = y * W + x;
        if (solid[idx] || (x - pointer.x) ** 2 + (y - pointer.y) ** 2 > R * R) continue;
        let rho = 0;
        for (let i = 0; i < 9; i++) rho += f[i * N + idx];
        const u = 0.5 * ux[idx] + 0.5 * vx, v = 0.5 * uy[idx] + 0.5 * vy;
        for (let i = 0; i < 9; i++) f[i * N + idx] = feq(i, rho, u, v);
      }
    }
    pointer.vx *= 0.6; pointer.vy *= 0.6;
  }

  function render() {
    const data = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const s = solid[idx];
        let c = BG;
        if (s === CYL) c = C_CYL;
        else if (s === HOT) c = C_HOT;
        else if (s === WALL) c = C_WALL;
        else if (x === W - 1) {
          const q = (idx - 1) * 4;
          c = [data[q], data[q + 1], data[q + 2]];
        } else if (x > 0 && y > 0) {
          // Temperature wins where the fluid is warm; vorticity shows elsewhere.
          const temp = T[idx];
          let band = -1;
          while (band < 4 && temp >= T_BANDS[band + 1]) band++;
          if (band >= 0) c = WARM[band];
          else {
            const curl = (uy[idx + 1] - uy[idx - 1]) - (ux[idx + W] - ux[idx - W]);
            // Log-spaced bands with a dead zone, so the background stays flat.
            const level = Math.min(4, Math.floor(Math.log2(1 + Math.abs(curl) * 250)));
            if (level > 0) c = (curl > 0 ? COOL_POS : COOL_NEG)[level - 1];
          }
        }
        const p = idx * 4;
        data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function updateHud() {
    nu = nusselt();
    nuAvg = nuAvg ? nuAvg + 0.1 * (nu - nuAvg) : nu;
    if (hud) hud.textContent =
      `LBM D2Q9+D2Q5 · Re ${RE} · Pr ${PR} · Nu_D ${nuAvg.toFixed(1)} · t = ${steps.toLocaleString()}`;
  }

  let frameCount = 0;
  function frame() {
    if (visible && (running || warmup > 0)) {
      if (warmup > 0) {
        // Spin up the wake quickly; under reduced motion, compute silently and show one frame.
        const n = reduceMotion ? 200 : 12;
        for (let k = 0; k < n; k++) step();
        warmup = Math.max(0, warmup - n);
        if (!reduceMotion || warmup === 0) render();
      } else {
        stir();
        for (let k = 0; k < 3; k++) step();
        render();
      }
      if (frameCount++ % 8 === 0 || warmup === 0) updateHud();
    }
    requestAnimationFrame(frame);
  }

  hero.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (pointer.has) { pointer.vx = (x - pointer.x) * 0.08; pointer.vy = (y - pointer.y) * 0.08; }
    pointer.x = x; pointer.y = y; pointer.has = true; pointer.active = true;
  });
  hero.addEventListener('pointerleave', () => { pointer.active = false; pointer.has = false; });

  if (toggle) {
    const sync = () => {
      toggle.textContent = running ? 'Pause' : 'Play';
      toggle.setAttribute('aria-pressed', String(!running));
    };
    toggle.addEventListener('click', () => { running = !running; sync(); });
    sync();
  }

  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(canvas);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  let lastWidth = window.innerWidth, resizeTimer;
  window.addEventListener('resize', () => {
    // Ignore height-only changes (mobile URL bar) so the simulation doesn't restart on scroll.
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (init()) render(); }, 200);
  });

  if (init()) { render(); requestAnimationFrame(frame); }
})();
