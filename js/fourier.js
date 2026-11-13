// Live Fourier-descriptor demo for the eyewear-frame-shape project card: a mock
// lens outline and a user-drawn shape, both reconstructed from a slider-controlled
// number of kept Fourier harmonics (lowest frequency magnitude first, same
// "sorted by frequency magnitude" ordering used for the real frame descriptor).
window.FourierDemo = (() => {
  const SAMPLES = 128; // points per closed curve, shared by the lens and any drawn shape

  // A rounded-rectangle "lens" via a superellipse: a believable glasses-lens
  // silhouette, and a clean contrast to a wobblier hand-drawn shape.
  function lensOutline() {
    const a = 114, b = 66, n = 4.2;
    const pts = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t = (i / SAMPLES) * Math.PI * 2;
      const cx = Math.cos(t), sx = Math.sin(t);
      pts.push([
        Math.sign(cx) * Math.pow(Math.abs(cx), 2 / n) * a,
        Math.sign(sx) * Math.pow(Math.abs(sx), 2 / n) * b,
      ]);
    }
    return pts;
  }

  // Discrete Fourier transform of a closed point sequence, treated as complex
  // numbers z_n = x_n + i*y_n. Returns [re, im] coefficient pairs.
  function dft(points) {
    const N = points.length;
    const out = new Array(N);
    for (let k = 0; k < N; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const theta = (2 * Math.PI * k * n) / N;
        const c = Math.cos(theta), s = Math.sin(theta);
        const [x, y] = points[n];
        re += x * c + y * s;
        im += y * c - x * s;
      }
      out[k] = [re / N, im / N];
    }
    return out;
  }

  // DC term plus `count` harmonic pairs (k, N-k), i.e. the lowest-magnitude
  // frequencies first.
  function keptIndices(count, N) {
    const idx = [0];
    const max = Math.min(count, Math.floor((N - 1) / 2));
    for (let h = 1; h <= max; h++) { idx.push(h); idx.push(N - h); }
    return idx;
  }

  function reconstruct(coeffs, count) {
    const N = coeffs.length;
    const idx = keptIndices(count, N);
    const pts = new Array(N);
    for (let n = 0; n < N; n++) {
      let x = 0, y = 0;
      for (const k of idx) {
        const [re, im] = coeffs[k];
        const theta = (2 * Math.PI * k * n) / N;
        const c = Math.cos(theta), s = Math.sin(theta);
        x += re * c - im * s;
        y += re * s + im * c;
      }
      pts[n] = [x, y];
    }
    return pts;
  }

  // Resample an open polyline into N equally arc-length-spaced points around
  // its closed loop (closing it back to the first point), so the DFT above
  // sees a uniformly sampled curve regardless of drawing speed.
  function resampleClosed(points, N) {
    if (points.length < 3) return null;
    const closed = [...points, points[0]];
    const cum = [0];
    for (let i = 1; i < closed.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(closed[i][0] - closed[i - 1][0], closed[i][1] - closed[i - 1][1]));
    }
    const total = cum[cum.length - 1];
    if (total < 10) return null; // a tap or a dot, not a shape
    const out = [];
    let seg = 1;
    for (let k = 0; k < N; k++) {
      const target = (k / N) * total;
      while (seg < cum.length - 1 && cum[seg] < target) seg++;
      const i0 = seg - 1, i1 = seg;
      const segLen = cum[i1] - cum[i0];
      const t = segLen > 0 ? (target - cum[i0]) / segLen : 0;
      out.push([
        closed[i0][0] + t * (closed[i1][0] - closed[i0][0]),
        closed[i0][1] + t * (closed[i1][1] - closed[i0][1]),
      ]);
    }
    return out;
  }

  function centroid(points) {
    let cx = 0, cy = 0;
    for (const [x, y] of points) { cx += x; cy += y; }
    return [cx / points.length, cy / points.length];
  }

  function drawOutline(canvas, points, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length < 2) return;
    const [cx, cy] = centroid(points);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const px = x - cx, py = y - cy;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  function drawHint(canvas, text, color) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = '15px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function init(root) {
    const slider = root.querySelector('[data-role="slider"]');
    const countOut = root.querySelector('[data-role="count"]');
    const lensOriginalC = root.querySelector('[data-role="lens-original"]');
    const lensReconC = root.querySelector('[data-role="lens-recon"]');
    const drawC = root.querySelector('[data-role="draw"]');
    const drawReconC = root.querySelector('[data-role="draw-recon"]');
    const clearBtn = root.querySelector('[data-role="clear"]');
    if (!slider || !lensOriginalC || !lensReconC || !drawC || !drawReconC) return;

    const ink = cssVar('--ink', '#1f2933');
    const accent = cssVar('--accent', '#0b6e70');
    const muted = cssVar('--muted', '#5a606b');

    const lens = lensOutline();
    const lensCoeffs = dft(lens);
    drawOutline(lensOriginalC, lens, ink);

    let drawingRaw = [];
    let isDrawing = false;
    let drawnCoeffs = null;

    function renderLensRecon() {
      drawOutline(lensReconC, reconstruct(lensCoeffs, Number(slider.value)), accent);
    }
    function renderDrawRecon() {
      if (!drawnCoeffs) { drawHint(drawReconC, 'Draw a shape on the left', muted); return; }
      drawOutline(drawReconC, reconstruct(drawnCoeffs, Number(slider.value)), accent);
    }
    function renderAll() {
      countOut.textContent = slider.value;
      renderLensRecon();
      renderDrawRecon();
    }

    slider.addEventListener('input', renderAll);

    // ---- Freehand drawing on the "draw" canvas (mouse, pen and touch alike) ----
    drawC.style.touchAction = 'none';

    function canvasPoint(e) {
      const r = drawC.getBoundingClientRect();
      return [
        (e.clientX - r.left) * (drawC.width / r.width),
        (e.clientY - r.top) * (drawC.height / r.height),
      ];
    }
    function redrawRaw() {
      if (drawingRaw.length < 2) { drawHint(drawC, 'Click and drag to draw', muted); return; }
      const ctx = drawC.getContext('2d');
      ctx.clearRect(0, 0, drawC.width, drawC.height);
      ctx.beginPath();
      drawingRaw.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    function finishDrawing() {
      if (!isDrawing) return;
      isDrawing = false;
      const resampled = resampleClosed(drawingRaw, SAMPLES);
      drawnCoeffs = resampled ? dft(resampled) : null;
      renderDrawRecon();
    }

    drawC.addEventListener('pointerdown', e => {
      isDrawing = true;
      drawingRaw = [canvasPoint(e)];
      drawC.setPointerCapture(e.pointerId);
      redrawRaw();
    });
    drawC.addEventListener('pointermove', e => {
      if (!isDrawing) return;
      drawingRaw.push(canvasPoint(e));
      redrawRaw();
    });
    drawC.addEventListener('pointerup', finishDrawing);
    drawC.addEventListener('pointercancel', finishDrawing);

    clearBtn?.addEventListener('click', () => {
      drawingRaw = [];
      drawnCoeffs = null;
      redrawRaw();
      renderDrawRecon();
    });

    redrawRaw();
    renderAll();
  }

  return { init };
})();
