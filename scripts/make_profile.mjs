// Builds the animated profile SVGs in assets/profile/ and the README.
// Run: node scripts/make_profile.mjs
// Everything is plain ASCII rendered in an embedded JetBrains Mono (OFL),
// because GitHub serves README SVGs as <img> and blocks external fonts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets/profile');
mkdirSync(out, { recursive: true });

const font = (w) => readFileSync(join(root, `scripts/fonts/jetbrains-mono-latin-${w}-normal.woff2`)).toString('base64');
const FONT_400 = `@font-face{font-family:JB;font-weight:400;src:url(data:font/woff2;base64,${font(400)}) format('woff2')}`;
const FONT_700 = `@font-face{font-family:JB;font-weight:700;src:url(data:font/woff2;base64,${font(700)}) format('woff2')}`;

const C = {
  bg: '#0b0d10', panel: '#0f1216', line: '#232831', text: '#d7dae0', dim: '#6b7380',
  gold: '#f5c451', goldDim: '#a87b22', green: '#3fb950', blue: '#58a6ff', red: '#ff7b72',
};
const CW = 0.6; // JetBrains Mono advance, in em

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (x, y, s, attrs = '') => `<text x="${x}" y="${y}" ${attrs} xml:space="preserve">${esc(s)}</text>`;
const lines = (x, y, lh, rows, attrs = '') => rows.map((r, i) => text(x, +(y + i * lh).toFixed(1), r, attrs)).join('');

// Frame-flip animation: frame i is visible for [i*dt, (i+1)*dt) of every loop.
function flipbook(id, frames, dur, render) {
  const n = frames.length, dt = dur / n;
  const css = `@keyframes ${id}{0%{opacity:1}${(99.9 / n).toFixed(4)}%,100%{opacity:0}}`
    + `.${id}{opacity:0;animation:${id} ${dur}s step-end infinite}`
    + `@media (prefers-reduced-motion:reduce){.${id}{animation:none}.${id}0{opacity:1}}`;
  const body = frames.map((f, i) =>
    `<g class="${id} ${id}${i}" style="animation-delay:${(-(n - i) * dt).toFixed(3)}s">${render(f, i)}</g>`).join('');
  return { css, body };
}

// ---------- spinning ASCII coin ----------
function coinFrames(cols, rows, cellW, cellH, n) {
  const R = Math.min(cols * cellW, rows * cellH) / 2 - 3, T = 8, tilt = 0.32;
  const ramp = ' .:-=+*#%@';
  // 5x5 "M" engraved on both faces
  const M = ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'];
  const inM = (x, y) => {
    const gx = Math.floor((x / (R * 1.05) + 0.5) * 5), gy = Math.floor((y / (R * 1.05) + 0.5) * 5);
    return gx >= 0 && gx < 5 && gy >= 0 && gy < 5 && M[gy][gx] === 'X';
  };
  const L = (() => { const v = [-0.35, -0.45, -0.82]; const m = Math.hypot(...v); return v.map((c) => c / m); })();
  const frames = [];
  for (let f = 0; f < n; f++) {
    const th = (f / n) * Math.PI * 2;
    const [ct, st, cx, sx] = [Math.cos(th), Math.sin(th), Math.cos(tilt), Math.sin(tilt)];
    // world = Rx(tilt) * Ry(th) * obj  ->  obj = Ry(-th) * Rx(-tilt) * world
    const toObj = ([x, y, z]) => {
      const y1 = cx * y + sx * z, z1 = -sx * y + cx * z;
      return [ct * x - st * z1, y1, st * x + ct * z1];
    };
    const toWorld = ([x, y, z]) => {
      const x1 = ct * x + st * z, z1 = -st * x + ct * z;
      return [x1, cx * y - sx * z1, sx * y + cx * z1];
    };
    const bright = [], dim = [];
    for (let r = 0; r < rows; r++) {
      let b = '', d = '';
      for (let c = 0; c < cols; c++) {
        const wx = (c - cols / 2 + 0.5) * cellW, wy = (r - rows / 2 + 0.5) * cellH;
        const o = toObj([wx, wy, -500]), dir = toObj([0, 0, 1]);
        let best = Infinity, nrm = null, cap = false, hit = null;
        for (const zc of [-T, T]) {
          if (Math.abs(dir[2]) < 1e-9) continue;
          const s = (zc - o[2]) / dir[2];
          const p = [o[0] + s * dir[0], o[1] + s * dir[1]];
          if (s > 0 && s < best && p[0] ** 2 + p[1] ** 2 <= R * R) { best = s; nrm = [0, 0, Math.sign(zc)]; cap = true; hit = p; }
        }
        const a = dir[0] ** 2 + dir[1] ** 2;
        if (a > 1e-9) {
          const bq = 2 * (o[0] * dir[0] + o[1] * dir[1]), cq = o[0] ** 2 + o[1] ** 2 - R * R, disc = bq * bq - 4 * a * cq;
          if (disc >= 0) {
            const s = (-bq - Math.sqrt(disc)) / (2 * a), z = o[2] + s * dir[2];
            if (s > 0 && s < best && Math.abs(z) <= T) {
              best = s; cap = false; const px = o[0] + s * dir[0], py = o[1] + s * dir[1];
              nrm = [px / R, py / R, 0];
            }
          }
        }
        if (!nrm) { b += ' '; d += ' '; continue; }
        const nw = toWorld(nrm);
        let lum = 0.15 + 0.95 * Math.max(0, nw[0] * L[0] + nw[1] * L[1] + nw[2] * L[2]);
        if (cap) {
          const rr = Math.hypot(hit[0], hit[1]) / R;
          if (rr > 0.86) lum *= 0.72;
          else if (inM(nrm[2] > 0 ? -hit[0] : hit[0], hit[1])) lum *= 0.42;
        } else lum *= 0.8;
        const ch = ramp[Math.max(1, Math.min(ramp.length - 1, Math.round(lum * (ramp.length - 1))))];
        const isB = lum > 0.62;
        b += isB ? ch : ' '; d += isB ? ' ' : ch;
      }
      bright.push(b); dim.push(d);
    }
    frames.push({ bright, dim });
  }
  return frames;
}

// ---------- hero ----------
function hero() {
  const W = 846, H = 380, fs = 12, cw = fs * CW;
  const coin = coinFrames(30, 15, 6, 11, 36);
  const flip = flipbook('c', coin, 3.6, (f) =>
    lines(76, 104, 11, f.dim, `font-size="10" fill="${C.goldDim}"`) + lines(76, 104, 11, f.bright, `font-size="10" fill="${C.gold}"`));
  const tips = ['ship it, then explain it', 'make the money make sense', 'build something worth sharing'];
  const tipFlip = flipbook('t', tips, 12, (s) => text(48, 351, `try "${s}"`, `fill="${C.dim}"`));

  const cmd = 'whoami --verbose';
  const typeDur = 1.2;
  const row = (y, label, value, color = C.text) =>
    text(330, y, label, `fill="${C.dim}"`) + text(400, y, value, `fill="${color}"`);
  const panel = [
    `<rect x="22" y="66" width="802" height="256" rx="8" fill="${C.panel}" stroke="${C.line}"/>`,
    text(36, 72, ' trustlessmike ', `fill="${C.gold}" font-size="11" style="paint-order:stroke" stroke="${C.panel}" stroke-width="6"`),
    `<line x1="310" y1="84" x2="310" y2="306" stroke="${C.line}"/>`,
    flip.body,
    text(48, 288, 'Malik', `fill="${C.text}" font-weight="700" font-size="15"`),
    text(48, 306, 'Detroit, MI  ·  just do it.', `fill="${C.dim}" font-size="11"`),
    text(330, 104, 'Financial advisor turned builder.', `fill="${C.text}" font-weight="700"`),
    text(330, 124, 'Games, apps and money tools, built in public.', `fill="${C.dim}"`),
    row(162, 'stack', 'Swift · TypeScript · Solana · three.js'),
    row(182, '', 'Python · Cloudflare · Claude Code'),
    row(214, 'now', 'Open Champions: preserving Champions:', C.text),
    row(234, '', 'Return to Arms, byte by byte'),
    row(266, 'find', 'malikontech.com', C.blue),
    row(286, '', 'x.com/malikontech · @MalikonTech', C.blue),
  ].join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="A terminal window. Typing whoami opens a panel for Malik, Detroit, with a spinning ASCII gold coin stamped M. Financial advisor turned builder of games, apps and money tools. Stack: Swift, TypeScript, Solana, three.js, Python. Now: Open Champions.">
<title>Malik · TrustlessMike</title>
<style>${FONT_400}${FONT_700}
text{font-family:JB,ui-monospace,SFMono-Regular,Menlo,monospace;font-size:${fs}px}
${flip.css}${tipFlip.css}
@keyframes type{to{transform:translateX(${(cmd.length * cw).toFixed(1)}px)}}
.cover{animation:type ${typeDur}s steps(${cmd.length}) .4s both}
@keyframes show{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.panel{animation:show .5s ease-out ${typeDur + 0.6}s both}
@keyframes blink{50%{opacity:0}}
.cur{animation:blink 1s step-end infinite}
@media (prefers-reduced-motion:reduce){.cover,.panel{animation:none}.cover{transform:translateX(${(cmd.length * cw).toFixed(1)}px)}}
</style>
<rect x="5" y="0" width="836" height="376" rx="12" fill="${C.bg}" stroke="${C.line}"/>
<circle cx="26" cy="17" r="5.5" fill="#ff5f57"/><circle cx="44" cy="17" r="5.5" fill="#febc2e"/><circle cx="62" cy="17" r="5.5" fill="#28c840"/>
${text(423, 21, 'malik@detroit: ~/trustlessmike', `fill="${C.dim}" font-size="11" text-anchor="middle"`)}
<line x1="5" y1="34" x2="841" y2="34" stroke="${C.line}"/>
${text(22, 54, '$', `fill="${C.green}"`)}${text(22 + 2 * cw, 54, cmd, `fill="${C.text}"`)}
<g class="cover"><rect x="${(22 + 2 * cw).toFixed(1)}" y="42" width="${(cmd.length * cw + 4).toFixed(1)}" height="16" fill="${C.bg}"/><rect class="cur" x="${(22 + 2 * cw).toFixed(1)}" y="43" width="${cw.toFixed(1)}" height="14" fill="${C.text}" opacity=".8"/></g>
<g class="panel">${panel}
<rect x="22" y="332" width="802" height="30" rx="6" fill="none" stroke="${C.line}"/>
${text(34, 351, '>', `fill="${C.gold}"`)}${tipFlip.body}
${text(812, 351, 'est. 2026', `fill="${C.dim}" font-size="11" text-anchor="end"`)}
</g>
</svg>`;
}

// ---------- tiles ----------
// art: { cols, rows, frames: string[][], dur, color }
function tile({ file, w, title, sub, tag, art, label }) {
  const H = 140, fs = 10, lh = 11;
  const id = 'f';
  const fb = flipbook(id, art.frames, art.dur, (rows) => lines(16, 26, lh, rows, `fill="${art.color}"`));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(label)}">
<title>${esc(title)}: ${esc(sub)}</title>
<style>${FONT_400}text{font-family:JB,ui-monospace,SFMono-Regular,Menlo,monospace;font-size:${fs}px}${fb.css}</style>
<rect x="5" y="2" width="${w - 10}" height="${H - 6}" rx="12" fill="${C.bg}" stroke="${C.line}"/>
${fb.body}
${tag ? text(w - 18, 22, tag, `fill="${C.dim}" text-anchor="end"`) : ''}
${text(16, 112, title, `fill="${C.text}" font-size="13"`)}
${text(16, 126, sub, `fill="${C.dim}"`)}
</svg>`;
  writeFileSync(join(out, file), svg);
}

// deterministic noise so rebuilds diff cleanly
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);

function hexDump(cols, rows, n) {
  const all = [];
  for (let i = 0; i < rows + n; i++) {
    const bytes = Array.from({ length: 8 }, () => Math.floor(rnd() * 256));
    const hex = bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const asc = bytes.map((b) => (b > 32 && b < 127 && b !== 60 && b !== 62 && b !== 38 ? String.fromCharCode(b) : '.')).join('');
    all.push(`0x${(0x4a000 + i * 8).toString(16).toUpperCase()}  ${hex}  |${asc}|`);
  }
  const sword = ['      /\\', '      ||', '      ||', '      ||', '    o==o', '      ||', '      ()'];
  return Array.from({ length: n }, (_, f) =>
    Array.from({ length: rows }, (_, r) => pad(all[f + r], cols - 14) + pad(sword[r] || '', 14)));
}

function bars(cols, rows, n) {
  const k = Math.floor(cols / 3);
  let h = Array.from({ length: k }, () => 2 + rnd() * 3);
  const frames = [];
  for (let f = 0; f < n; f++) {
    h = h.map((v, i) => Math.max(1, Math.min(rows - 1, v + (rnd() - 0.45) * 1.4 + (i / k) * 0.08)));
    frames.push(Array.from({ length: rows }, (_, r) =>
      h.map((v) => (rows - r <= Math.round(v) ? '## ' : r === rows - 1 ? '__ ' : '   ')).join('')));
  }
  return frames;
}

function stacking(rows, n) {
  const frames = [];
  const blocks = 5, cyc = n;
  for (let f = 0; f < cyc; f++) {
    const grid = Array.from({ length: rows }, () => ' '.repeat(28));
    const set = (r, c, s) => { if (r >= 0 && r < rows) grid[r] = grid[r].slice(0, c) + s + grid[r].slice(c + s.length); };
    const stepsPer = Math.floor(cyc / (blocks + 1));
    const landed = Math.min(blocks, Math.floor(f / stepsPer));
    for (let b = 0; b < landed; b++) set(rows - 1 - b, 6 + (b % 2), '[ $ $ $ ]');
    if (landed < blocks) set(Math.min(rows - 1 - landed, f % stepsPer), 6 + (landed % 2), '[ $ $ $ ]');
    set(Math.max(0, rows - 1 - landed), 20, landed === blocks ? '<- stack' : '');
    frames.push(grid);
  }
  return frames;
}

function lootBox(n) {
  const closed = ['', '   _________', '  |___[$]___|', '  |    |    |', '  |____|____|'];
  const open = ['    _____', '   /____/|', '  |  $$$  |', '  |    |  |', '  |____|__|'];
  return Array.from({ length: n }, (_, f) => {
    const o = f >= n / 2;
    const base = (o ? open : closed).map((s) => pad(s, 28));
    const g = [''].concat(base);
    if (o) for (let k = 0; k < 6; k++) {
      const r = Math.floor(rnd() * 2), c = 15 + Math.floor(rnd() * 12);
      g[r] = pad(g[r] || '', 28); g[r] = g[r].slice(0, c) + '*+.'[k % 3] + g[r].slice(c + 1);
    }
    return g;
  });
}

function transfer(n) {
  const track = 18;
  return Array.from({ length: n }, (_, f) => {
    const p = f % track;
    const line = '-'.repeat(p) + '$' + '-'.repeat(track - 1 - p);
    return ['', ' send            settle', '', ` [A] ${line}> [B]`, '', p < track - 2 ? '  routing ...' : '  settled on solana  ok'];
  });
}

function duel(n) {
  const a = ['  o          o', ' /|\\_      _/|\\', ' / \\        / \\'];
  const b = ['   o        o', '  /|\\_ ** _/|\\', '  / \\      / \\'];
  const c = ['    o      o', '   /|\\_X X/|\\', '   / \\    / \\'];
  const seq = [a, a, b, c, c, b];
  return Array.from({ length: n }, (_, f) => ['', ...seq[f % seq.length], '', '  ' + '#'.repeat(24)]);
}

function typing(n) {
  const cmd = 'hermes run ship-it';
  const out = ['  agent  hermes   ready', '  plan   3 steps', '  done   12.4s  ok'];
  return Array.from({ length: n }, (_, f) => {
    const t = Math.min(cmd.length, f);
    const r = ['> ' + cmd.slice(0, t) + (f % 2 ? '_' : ' ')];
    const shown = Math.max(0, Math.min(3, Math.floor((f - cmd.length) / 3)));
    return r.concat(out.slice(0, shown));
  });
}

function guild(n) {
  return Array.from({ length: n }, (_, f) => {
    const t = (i) => ((f + i) % 3 === 0 ? ')' : (f + i) % 3 === 1 ? '(' : '|');
    return [
      `   ${t(0)}    /\\   /\\    ${t(1)}`,
      `   |   /  \\_/  \\   |`,
      `   |  |  GUILD  |  |`,
      `   |  |  _   _  |  |`,
      `  ~~~~~~| | | |~~~~~~`,
    ];
  });
}

function wheel(n) {
  const cols = 25, rows = 7, cx = 12, cy = 3, rx = 11, ry = 3.4;
  return Array.from({ length: n }, (_, f) => {
    const g = Array.from({ length: rows }, () => Array(cols).fill(' '));
    for (let a = 0; a < 360; a += 4) {
      const t = (a * Math.PI) / 180, x = Math.round(cx + rx * Math.cos(t)), y = Math.round(cy + ry * Math.sin(t));
      if (g[y]) g[y][x] = 'o';
    }
    for (let s = 0; s < 4; s++) {
      const t = (f / n) * Math.PI * 2 + (s * Math.PI) / 4;
      for (let k = 1; k < 10; k++) {
        const x = Math.round(cx + (k / 10) * rx * Math.cos(t)), y = Math.round(cy + (k / 10) * ry * Math.sin(t));
        if (g[y] && g[y][x] === ' ') g[y][x] = '.';
      }
    }
    g[cy][cx] = '@';
    return g.map((r) => r.join('') + (r === g[0] ? '' : ''))
      .map((r, i) => (i === 0 ? r.slice(0, cx) + 'V' + r.slice(cx + 1) : r));
  });
}

function play(n) {
  const tri = ['|\\', '| \\', '|  >', '| /', '|/'];
  return Array.from({ length: n }, (_, f) => {
    const bar = '='.repeat(f) + '>' + ' '.repeat(Math.max(0, n - f - 1));
    return ['', ...tri.map((s) => '  ' + pad(s, 6)), `  [${bar}]`];
  });
}

const tiles = [
  { file: 'tile-open-champions.svg', w: 423, title: 'Open Champions', sub: 'Preserving Champions: Return to Arms', tag: 'reverse-eng',
    art: { frames: hexDump(56, 7, 24), dur: 4.8, color: C.green }, label: 'Open Champions: a scrolling hex dump next to an ASCII sword. Reverse-engineering and preservation of Champions: Return to Arms.' },
  { file: 'tile-jam.svg', w: 423, title: 'Jam', sub: 'Real-world asset platform', tag: 'showcase',
    art: { frames: bars(54, 7, 20), dur: 4, color: C.gold }, label: 'Jam: animated ASCII bars for a real-world asset platform.' },
  { file: 'tile-stack.svg', w: 211, title: 'Stack', sub: 'iOS crypto onboarding', tag: 'iOS',
    art: { frames: stacking(7, 24), dur: 4.8, color: C.gold }, label: 'Stack: coin blocks stacking. iOS crypto onboarding and portfolio discovery.' },
  { file: 'tile-kashout.svg', w: 211, title: 'Kashout', sub: 'SwiftUI rewards app', tag: 'MIT',
    art: { frames: lootBox(10), dur: 2.4, color: C.gold }, label: 'Kashout: an ASCII loot box opening. Open-source SwiftUI rewards-app prototype.' },
  { file: 'tile-wickett.svg', w: 211, title: 'Wickett', sub: 'Global payments on Solana', tag: 'MIT',
    art: { frames: transfer(18), dur: 3, color: C.blue }, label: 'Wickett: a dollar sign travels from A to B and settles on Solana. Global-payments prototype.' },
  { file: 'tile-art-of-battle.svg', w: 211, title: 'Art of Battle', sub: 'First-person melee', tag: 'ISC',
    art: { frames: duel(6), dur: 1.5, color: C.red }, label: 'Art of Battle: two ASCII fighters clash swords. First-person melee browser game.' },
  { file: 'tile-opencontroller.svg', w: 211, title: 'OpenController', sub: 'Desktop UI for agent CLIs', tag: 'MIT',
    art: { frames: typing(30), dur: 4.5, color: C.green }, label: 'OpenController: a command types and an agent reports done. Desktop interface for OpenClaw and Hermes.' },
  { file: 'tile-vibe-guild.svg', w: 211, title: 'Vibe Guild', sub: 'A hall for makers', tag: 'MIT',
    art: { frames: guild(6), dur: 1.2, color: C.gold }, label: 'Vibe Guild: an ASCII guild hall with flickering torches.' },
  { file: 'tile-dispo-spinner.svg', w: 211, title: 'Dispo Spinner', sub: 'Animated wheel component', tag: 'MIT',
    art: { frames: wheel(16), dur: 1.6, color: C.blue }, label: 'Dispo Spinner: an ASCII prize wheel spinning.' },
  { file: 'tile-malikontech.svg', w: 211, title: 'Malik on Tech', sub: 'New videos every week', tag: 'video',
    art: { frames: play(20), dur: 5, color: C.red }, label: 'Malik on Tech: an ASCII play button with a progress bar. Videos at malikontech.com.' },
];

writeFileSync(join(out, 'hero.svg'), hero());
for (const t of tiles) tile(t);

// ---------- README ----------
const P = 'assets/profile';
const link = (href, file, w, alt) => `<a href="${href}"><img src="${P}/${file}" width="${w}" alt="${esc(alt)}"></a>`;
const gh = (r) => `https://github.com/TrustlessMike/${r}`;
const readme = `<img src="${P}/hero.svg" width="100%" alt="A terminal window. Typing whoami opens a panel for Malik, Detroit, with a spinning ASCII gold coin stamped M. Financial advisor turned builder of games, apps and money tools.">

<p align="center"><a href="https://malikontech.com">malikontech.com</a> &nbsp;·&nbsp; <a href="https://x.com/malikontech">@malikontech</a> &nbsp;·&nbsp; <a href="https://www.youtube.com/@MalikonTech">YouTube</a> &nbsp;·&nbsp; <a href="https://www.tiktok.com/@malikontech">TikTok</a> &nbsp;·&nbsp; <a href="https://www.instagram.com/malikontechnology">Instagram</a></p>

<p align="center">${[
  link('https://github.com/Open-Champions/champions-return-to-arms-re', 'tile-open-champions.svg', 423, 'Open Champions: reverse-engineering and preservation of Champions: Return to Arms.'),
  link(gh('Jam'), 'tile-jam.svg', 423, 'Jam: real-world asset platform. Public showcase, application source private.'),
  link(gh('stack-app'), 'tile-stack.svg', 211, 'Stack: iOS crypto onboarding and portfolio discovery. Public showcase, prototype source private.'),
  link(gh('Kashout'), 'tile-kashout.svg', 211, 'Kashout: open-source SwiftUI rewards-app prototype. MIT.'),
  link(gh('Wickett'), 'tile-wickett.svg', 211, 'Wickett: global-payments prototype with Solana settlement. MIT.'),
  link(gh('art-of-battle'), 'tile-art-of-battle.svg', 211, 'Art of Battle: first-person melee browser game. ISC.'),
  link(gh('opencontroller'), 'tile-opencontroller.svg', 211, 'OpenController: desktop interface for OpenClaw and Hermes. MIT.'),
  link(gh('vibe-guild'), 'tile-vibe-guild.svg', 211, 'Vibe Guild: a guild hall for games, apps and their makers. MIT.'),
  link(gh('dispo-spinner'), 'tile-dispo-spinner.svg', 211, 'Dispo Spinner: customizable animated wheel component. MIT.'),
  link('https://malikontech.com', 'tile-malikontech.svg', 211, 'Malik on Tech: new videos every week.'),
].join('')}</p>

<p align="center"><sub>Each project documents its current scope and limitations. Clear bug reports and focused contributions are welcome.</sub></p>
`;
writeFileSync(join(root, 'README.md'), readme);
console.log('wrote hero.svg,', tiles.length, 'tiles and README.md');
