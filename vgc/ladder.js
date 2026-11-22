// RNADy-Bot's ladder history page (/vgc/ladder/, /pt/vgc/ladder/): renders the rating chart, the sample table and the
// A/B table from /vgc/data/ladder.json (an anonymized snapshot: aggregates only). Vanilla JS, inline SVG, same-origin
// fetch, no libraries. The language comes from <html lang>; headers and prose live in the pages, numbers and the
// {en, pt} texts in the JSON.
(() => {
  'use strict';
  const LANG = document.documentElement.lang.startsWith('pt') ? 'pt' : 'en';
  const T = {
    en: {
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      day: (m, d) => `${m} ${d}`, full: (m, d, y) => `${m} ${d}, ${y}`,
      updated: d => `Updated ${d}`, sets: 'sets', interim: 'Interim', final: 'Final',
      peak: 'Peak rating', latest: 'Latest rating', bar500: 'Top 500 cutoff', bar100: 'Top 100 cutoff',
      peakOn: d => `reached ${d}`, latestOn: d => `after ${d}'s last set`, asOf: d => `ladder list on ${d}`,
      control: 'Control', variant: 'Variant', record: (w, l) => `${w} won, ${l} lost`,
      failed: 'The ladder data could not be loaded.',
      chartTitle: 'RNADy-Bot rating over time',
      chartDesc: (n, a, b, p, s) => `Line chart of the account rating after each of ${n} sets, from ${a} to ${b}. It starts near 1000, peaks at ${p}, and ends at ${s}. Dashed lines mark the top 500 and top 100 cutoffs.`,
      peakLabel: p => `Peak ${p}`, lbl500: '#500', lbl100: '#100',
      clear: 'no clear difference', better: 'variant better', worse: 'variant worse',
      effect: 'variant − control', na: 'n/a', dash: '–',
    },
    pt: {
      months: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
      day: (m, d) => `${d} ${m}`, full: (m, d, y) => `${d} ${m} ${y}`,
      updated: d => `Atualizado em ${d}`, sets: 'séries', interim: 'Parcial', final: 'Final',
      peak: 'Rating máximo', latest: 'Rating atual', bar500: 'Corte do top 500', bar100: 'Corte do top 100',
      peakOn: d => `atingido em ${d}`, latestOn: d => `após a última série de ${d}`, asOf: d => `lista da ladder em ${d}`,
      control: 'Controle', variant: 'Variante', record: (w, l) => `${w} vitórias, ${l} derrotas`,
      failed: 'Não foi possível carregar os dados da ladder.',
      chartTitle: 'Rating do RNADy-Bot ao longo do tempo',
      chartDesc: (n, a, b, p, s) => `Gráfico de linha do rating da conta após cada uma de ${n} séries, de ${a} a ${b}. Começa perto de 1000, chega ao máximo de ${p} e termina em ${s}. Linhas tracejadas marcam os cortes do top 500 e do top 100.`,
      peakLabel: p => `Máx. ${p}`, lbl500: '#500', lbl100: '#100',
      clear: 'sem diferença clara', better: 'variante melhor', worse: 'variante pior',
      effect: 'variante − controle', na: 'n/d', dash: '–',
    },
  }[LANG];

  const NS = 'http://www.w3.org/2000/svg';
  const MINUS = '−';
  const el = (tag, attrs = {}, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else e.setAttribute(k, v); }
    for (const k of kids) if (k != null) e.append(k);
    return e;
  };
  const pct = x => (x == null ? T.na : (x * 100).toLocaleString(LANG, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');
  const signed = x => (x > 0 ? '+' : x < 0 ? MINUS : '') + Math.abs(Math.round(x));
  const ci = c => (c ? `[${signed(c[0])}, ${signed(c[1])}]` : '');
  const parse = s => { const [d, t = '00:00'] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [hh, mm] = t.split(':').map(Number); return Date.UTC(y, m - 1, dd, hh, mm); };
  const dayLabel = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return T.day(T.months[m - 1], d); };
  const fullLabel = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return T.full(T.months[m - 1], d, y); };
  const range = (a, b) => (a.slice(0, 10) === b.slice(0, 10) ? dayLabel(a) : `${dayLabel(a)} ${T.dash} ${dayLabel(b)}`);
  const perf = p => (p ? `${p.elo} [${p.ci95[0]}, ${p.ci95[1]}]` : T.na);
  const text = o => (o && (o[LANG] || o.en)) || '';

  function stats(d) {
    const a = d.account, ul = document.getElementById('ladder-stats');
    const card = (title, value, note) => h('li', {}, h('h3', {}, title), h('p', { class: 'vgc-hard-stat pixel' }, String(value)), h('p', {}, note));
    ul.replaceChildren(
      card(T.peak, a.peak, T.peakOn(fullLabel(a.peak_at))),
      card(T.latest, a.latest, T.latestOn(fullLabel(a.latest_at))),
      card(T.bar500, d.bars.top500, T.asOf(fullLabel(d.bars.as_of))),
      card(T.bar100, d.bars.top100, T.asOf(fullLabel(d.bars.as_of))));
    document.getElementById('ladder-updated').textContent = T.updated(fullLabel(d.updated));
  }

  function chart(d) {
    const box = document.getElementById('ladder-chart');
    const pts = d.series.points.map(([t, r]) => [parse(t), r]);
    const W = Math.max(300, Math.floor(box.clientWidth || 900)), Ht = W < 560 ? 300 : 400;
    const m = { l: 44, r: 12, t: 26, b: 28 };
    const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
    const lo = Math.floor(Math.min(...pts.map(p => p[1])) / 100) * 100;
    const hi = Math.ceil(Math.max(d.bars.top100 || 0, ...pts.map(p => p[1])) / 50) * 50 + 20;
    const X = t => m.l + (t - x0) / (x1 - x0) * (W - m.l - m.r);
    const Y = r => Ht - m.b - (r - lo) / (hi - lo) * (Ht - m.t - m.b);
    const svg = el('svg', { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, role: 'img', 'aria-labelledby': 'lc-title lc-desc', class: 'lc' });
    svg.append(el('title', { id: 'lc-title' }, T.chartTitle),
      el('desc', { id: 'lc-desc' }, T.chartDesc(pts.length, fullLabel(d.series.points[0][0]), fullLabel(d.series.points.at(-1)[0]), d.account.peak, d.account.latest)));
    // horizontal grid + y labels
    for (let r = lo; r <= hi; r += 100) {
      svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(r), y2: Y(r), class: 'lc-grid' }), el('text', { x: m.l - 6, y: Y(r) + 4, class: 'lc-tick', 'text-anchor': 'end' }, r));
    }
    // sample bands, labelled when wide enough
    d.samples.forEach((s, i) => {
      const a = Math.max(x0, parse(s.start)), b = Math.min(x1, parse(s.end));
      if (i % 2 === 0) svg.append(el('rect', { x: X(a), y: m.t, width: Math.max(1, X(b) - X(a)), height: Ht - m.t - m.b, class: 'lc-band' }));
      if (X(b) - X(a) >= 24) svg.append(el('text', { x: (X(a) + X(b)) / 2, y: m.t - 9, class: 'lc-tick', 'text-anchor': 'middle' }, s.id));
    });
    // x ticks: one per day, thinned to fit
    const d0 = new Date(x0), days = [];
    for (let t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()) + 864e5; t <= x1; t += 864e5) days.push(t);
    const step = Math.ceil(days.length / Math.max(1, Math.floor((W - m.l - m.r) / 64)));
    days.forEach((t, i) => { if (i % step) return; svg.append(el('text', { x: X(t), y: Ht - 8, class: 'lc-tick', 'text-anchor': 'middle' }, dayLabel(new Date(t).toISOString())));
      svg.append(el('line', { x1: X(t), x2: X(t), y1: Ht - m.b, y2: Ht - m.b + 4, class: 'lc-axis' })); });
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Ht - m.b, y2: Ht - m.b, class: 'lc-axis' }));
    // cutoffs
    [[d.bars.top500, T.lbl500, 'lc-b500'], [d.bars.top100, T.lbl100, 'lc-b100']].forEach(([v, lab, cls]) => {
      if (v == null) return;
      svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: `lc-bar ${cls}` }), el('text', { x: W - m.r - 2, y: Y(v) - 5, class: 'lc-lab', 'text-anchor': 'end' }, `${lab} ≈ ${v}`));
    });
    // the rating line
    svg.append(el('polyline', { points: pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' '), class: 'lc-line' }));
    const pk = pts.reduce((a, p) => (p[1] > a[1] ? p : a));
    svg.append(el('circle', { cx: X(pk[0]), cy: Y(pk[1]), r: 4, class: 'lc-peak' }),
      el('text', { x: X(pk[0]) + (X(pk[0]) > W - 120 ? -8 : 8), y: Y(pk[1]) - 8, class: 'lc-lab', 'text-anchor': X(pk[0]) > W - 120 ? 'end' : 'start' }, T.peakLabel(pk[1])));
    box.replaceChildren(svg);
  }

  function samples(d) {
    const rows = d.samples.map(s => {
      const live = s.status !== 'final';
      const tr = h('tr', live ? { class: 'row-interim' } : {});
      const th = h('th', { scope: 'row' }, s.id);
      if (live) th.append(h('span', { class: 'tag' }, T.interim));
      const pe = s.performance_elo;
      tr.append(th, h('td', {}, range(s.start, s.end)), h('td', {}, text(s.bot)),
        h('td', { class: 'num' }, String(s.sets) + (live ? ` / ${s.target_sets}` : '')),
        h('td', { class: 'num' }, pct(s.win_rate)),
        h('td', { class: 'num' }, pe ? `${pe.elo} [${pe.ci95[0]}, ${pe.ci95[1]}]` : T.na));
      return tr;
    });
    document.getElementById('ladder-samples').replaceChildren(...rows);
  }

  function ab(d) {
    const rows = d.samples.filter(s => s.ab).map(s => {
      const [c, v] = s.ab.arms, adj = s.ab.adjusted_effect, live = s.status !== 'final';
      const th = h('th', { scope: 'row' }, s.id);
      if (live) th.append(h('span', { class: 'tag' }, T.interim));
      let verdict = T.na;
      if (adj && adj.ci95) verdict = adj.ci95[0] > 0 ? T.better : adj.ci95[1] < 0 ? T.worse : T.clear;
      const arm = a => h('td', { class: 'num' }, `${pct(a.win_rate)} · ${a.performance_elo ? a.performance_elo.elo : T.na}`, h('br'), h('span', { class: 'sub' }, `${a.sets} ${T.sets}`));
      const tr = h('tr', live ? { class: 'row-interim' } : {});
      tr.append(th, h('td', { class: 'desc' }, text(v.bot)),
        h('td', { class: 'num' }, adj ? `${signed(adj.variant_minus_control_elo)} ${ci(adj.ci95)}` : T.na), h('td', {}, verdict), arm(c), arm(v));
      if (live) tr.children[3].append(document.createTextNode(` (${text(s.interim_label)})`));
      return tr;
    });
    document.getElementById('ladder-ab').replaceChildren(...rows);
  }

  async function main() {
    const status = document.getElementById('ladder-status');
    try {
      const res = await fetch('/vgc/data/ladder.json');
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      stats(d); samples(d); ab(d); chart(d);
      status.hidden = true;
      let w = document.getElementById('ladder-chart').clientWidth, tm;
      window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(() => { const nw = document.getElementById('ladder-chart').clientWidth; if (nw !== w) { w = nw; chart(d); } }, 150); });
    } catch (e) {
      status.textContent = T.failed; status.hidden = false;
    }
  }
  main();
})();
