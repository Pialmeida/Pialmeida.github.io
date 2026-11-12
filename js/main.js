// Small site behaviours: theme toggle, mobile nav, pixel icons, footer year.
(() => {
  const root = document.documentElement;

  // ---- Theme toggle ----------------------------------------------------
  const themeBtn = document.querySelector('.theme-toggle');
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  themeBtn?.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
  });

  // ---- Mobile nav ------------------------------------------------------
  const navBtn = document.querySelector('.nav-toggle');
  const links = document.getElementById('nav-links');
  const setNav = open => {
    navBtn.setAttribute('aria-expanded', String(open));
    links.classList.toggle('open', open);
  };
  navBtn?.addEventListener('click', () => setNav(navBtn.getAttribute('aria-expanded') !== 'true'));
  links?.addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });

  // ---- Pixel icons -----------------------------------------------------
  // '#' = ink (currentColor), 'a' = accent, 'b' = warm accent, '.' = empty
  const ICONS = {
    mountain: [
      '.......bb....',
      '......#bbb...',
      '......#......',
      '.....###.....',
      '....##a##....',
      '...##aaa##...',
      '..##.....##..',
      '.##...#...##.',
      '##...###...##',
      '#############',
    ],
    ball: [
      '....####....',
      '..##.a..##..',
      '.#...a....#.',
      '.#..a...aa#.',
      '#...a.aa...#',
      '#..aaa.....#',
      '#.a...a....#',
      '#a.....a...#',
      '.#......a.#.',
      '.#.......a#.',
      '..##....##..',
      '....####....',
    ],
    d20: [
      '.....##.....',
      '...##aa##...',
      '.##.a..a.##.',
      '#..a....a..#',
      '#.a..b...a.#',
      '#a..bb....a#',
      '#aaaaaaaaaa#',
      '#.a......a.#',
      '#..a....a..#',
      '.##.a..a.##.',
      '...##aa##...',
      '.....##.....',
    ],
    pad: [
      '..##########..',
      '.#..........#.',
      '#..#......b..#',
      '#.###....a.b.#',
      '#..#......a..#',
      '#....####....#',
      '.#..#....#..#.',
      '..##......##..',
    ],
    cylinder: [
      '..................',
      '....###.....aa....',
      '...#####...a..a...',
      '..#######...aa..b.',
      '..#######......b.b',
      '..#######.bb....b.',
      '...#####.b..b.....',
      '....###...bb...aa.',
      '..............a..a',
      '...............aa.',
    ],
    wave: [
      '..................',
      '.a....a.....a.....',
      'a.a..a.a...a.a..a.',
      '...aa...a.a...aa.a',
      '.........a........',
      '....b.........b...',
      '...b.b.......b.b..',
      '..b...b.....b...b.',
      '########b###b#####',
      '#########b#b######',
    ],
    tree: [
      '........#.........',
      '.......###........',
      '......#...#.......',
      '.....#.....#......',
      '....a.......a.....',
      '...a.a.....a.a....',
      '..b...b...b...b...',
      '.b.b.b.b.b.b.b.b..',
      '..................',
      '..a....b....a.....',
    ],
    cells: [
      '..................',
      '..###.......aaa...',
      '.#.b.#.....a.b.a..',
      '.#...#.###.a...a..',
      '..###.#...#.aaa...',
      '......#.b.#.......',
      '...aaa.#..#..###..',
      '..a.b.a.###.#.b.#.',
      '..a...a.....#...#.',
      '...aaa.......###..',
    ],
    chip: [
      '...#.#.#.#.#.#....',
      '..############....',
      '#.#..........#.#..',
      '..#.aaaa.....#....',
      '#.#.a..a.bb..#.#..',
      '..#.aaaa.bb..#....',
      '#.#..........#.#..',
      '..############....',
      '...#.#.#.#.#.#....',
      '..................',
    ],
    trophy: [
      '#.########.#',
      '#.#bbbbbb#.#',
      '.##bbbbbb##.',
      '...#bbbb#...',
      '....#bb#....',
      '.....##.....',
      '....####....',
      '...######...',
    ],
    star: [
      '.....##.....',
      '....#bb#....',
      '#####bb#####',
      '.#bbbbbbbb#.',
      '..#bbbbbb#..',
      '.#bbb##bbb#.',
      '.#b##..##b#.',
      '.##......##.',
    ],
    scroll: [
      '.##########.',
      '#.#.......##',
      '.##.aaaa..#.',
      '..#.......#.',
      '..#.aaaaa.#.',
      '..#.......#.',
      '.##########.',
      '#.......#.#.',
    ],
  };

  const FILL = { '#': 'var(--ink)', a: 'var(--accent)', b: 'var(--warm)' };
  document.querySelectorAll('[data-pixel]').forEach(el => {
    const map = ICONS[el.dataset.pixel];
    if (!map) return;
    const w = Math.max(...map.map(r => r.length)), h = map.length;
    let rects = '';
    map.forEach((row, y) => [...row].forEach((ch, x) => {
      if (FILL[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${FILL[ch]}"/>`;
    }));
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" role="presentation">${rects}</svg>`;
  });

  // ---- Footer year -----------------------------------------------------
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
