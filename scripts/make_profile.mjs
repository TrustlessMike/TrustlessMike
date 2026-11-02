// Builds the animated profile SVGs in assets/profile/ and the README.
// Run: node scripts/make_profile.mjs   (tile art comes from scripts/prep_images.sh)
// GitHub serves README SVGs as <img>, which blocks external fonts and images,
// so the font (JetBrains Mono, OFL, ASCII subset) and the art are embedded.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets/profile');
mkdirSync(out, { recursive: true });

const b64 = (p) => readFileSync(join(root, p)).toString('base64');
const face = (w) => `@font-face{font-family:JB;font-weight:${w};src:url(data:font/woff2;base64,${b64(`scripts/fonts/jbm-${w}.woff2`)}) format('woff2')}`;
const FONTS = face(400) + face(700);
const BASE_CSS = `${FONTS}text{font-family:JB,ui-monospace,SFMono-Regular,Menlo,monospace}`;
const NO_MOTION = (sel) => `@media (prefers-reduced-motion:reduce){${sel}{animation:none!important}}`;

const C = {
  bg: '#0a0b0d', panel: '#0e1013', info: '#0d0f12', line: '#22262d', text: '#e6e8eb', soft: '#b4bac3', dim: '#7d8590',
  gold: '#f2c14e', green: '#3fb950', blue: '#58a6ff', red: '#ff5c5c',
};
const GOLD = ['#7a5418', '#b8862e', '#e3aa3e', '#ffd36b', '#fff4d1'];
const BLUE = ['#0f2a4a', '#1d4f86', '#3b82c4', '#7cc0ff', '#e2f1ff'];
const CW = 0.6; // JetBrains Mono advance, in em

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (x, y, s, attrs = '') => `<text x="${x}" y="${y}" ${attrs} xml:space="preserve">${esc(s)}</text>`;
const f1 = (n) => +n.toFixed(1);

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

// ---------- ASCII raster ----------
// shade(x, y) returns null (empty) or a brightness in [0, 1] for a world point;
// each cell averages a 3x3 grid of samples so silhouettes anti-alias.
const RAMP = ' .,-:;=+*ox%#@';
function raster(cols, rows, cw, ch, shade, overlay) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      let sum = 0, hits = 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const v = shade((c - cols / 2 + (sx + 0.5) / 3) * cw, (r - rows / 2 + (sy + 0.5) / 3) * ch);
        if (v !== null) { sum += v; hits++; }
      }
      if (hits < 3) { row.push(null); continue; }
      const lum = Math.min(1, 1.08 * Math.max(0, sum / hits) ** 0.8) * (0.55 + 0.45 * hits / 9);
      row.push({ ch: RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(lum * (RAMP.length - 1))))], tone: Math.min(4, Math.floor(lum * 5)) });
    }
    cells.push(row);
  }
  if (overlay) overlay(cells);
  return cells;
}

// One <text> per frame; each row skips its leading blanks and groups runs by tone.
function cellsToSvg(cells, x0, y0, cw, ch, cls) {
  const fs = f1(cw / CW);
  let s = '';
  cells.forEach((row, r) => {
    const first = row.findIndex(Boolean);
    if (first < 0) return;
    let last = row.length - 1;
    while (!row[last]) last--;
    let line = '', tone = -1, run = '';
    const flush = () => { if (run) line += tone < 0 ? run : `<tspan class="${cls}${tone}">${esc(run)}</tspan>`; run = ''; };
    for (let c = first; c <= last; c++) {
      const cell = row[c];
      if (!cell) { run += ' '; continue; }
      if (cell.tone !== tone) { flush(); tone = cell.tone; }
      run += cell.ch;
    }
    flush();
    s += `<tspan x="${f1(x0 + first * cw)}" y="${f1(y0 + r * ch)}">${line}</tspan>`;
  });
  return `<text font-size="${fs}" font-weight="700" xml:space="preserve">${s}</text>`;
}
const toneCss = (cls, colors) => colors.map((c, i) => `.${cls}${i}{fill:${c}}`).join('');

// ---------- 3D helpers ----------
const norm = (v) => { const m = Math.hypot(...v) || 1; return v.map((c) => c / m); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function rotator(yaw, pitch) {
  const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
  return {
    // world = Rx(pitch) * Ry(yaw) * obj
    toWorld: ([x, y, z]) => { const x1 = cy * x + sy * z, z1 = -sy * x + cy * z; return [x1, cp * y - sp * z1, sp * y + cp * z1]; },
    toObj: ([x, y, z]) => { const y1 = cp * y + sp * z, z1 = -sp * y + cp * z; return [cy * x - sy * z1, y1, sy * x + cy * z1]; },
  };
}
// The camera looks down +z; y grows downward on screen.
const KEY = norm([-0.45, -0.6, -0.66]), FILL = norm([0.7, 0.2, -0.4]), HALF = norm([KEY[0], KEY[1], KEY[2] - 1]);
const light = (n, gloss = 48) => {
  const d = Math.max(0, dot(n, KEY)), f = Math.max(0, dot(n, FILL)), sp = Math.max(0, dot(n, HALF)) ** gloss;
  return 0.06 + 0.72 * d + 0.16 * f + 0.9 * sp;
};

// ---------- spinning coin ----------
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const M_PATH = [[-0.4, 0.36], [-0.4, -0.36], [0, 0.1], [0.4, -0.36], [0.4, 0.36]];
const mDist = (u, v) => Math.min(...M_PATH.slice(1).map((b, i) => segDist(u, v, ...M_PATH[i], ...b)));

// Height field of a coin face in units of R: raised rim, beaded ring, embossed M.
function faceHeight(u, v) {
  const r = Math.hypot(u, v);
  if (r > 0.86) return 1;
  let h = 0;
  const a = Math.atan2(v, u), bead = Math.abs(((a / (Math.PI * 2)) * 36 % 1 + 1) % 1 - 0.5);
  if (Math.abs(r - 0.76) < 0.028 && bead < 0.22) h = 0.7;
  const d = mDist(u, v);
  if (d < 0.075) h = Math.max(h, 0.8);
  else if (d < 0.105) h = Math.max(h, 0.8 * (0.105 - d) / 0.03);
  return h;
}

function coinFrames({ cols, rows, cw, ch, R, T, n }) {
  return Array.from({ length: n }, (_, f) => {
    const th = (f / n) * Math.PI * 2;
    const rot = rotator(th, 0.3 + 0.06 * Math.sin(th));
    const dir = rot.toObj([0, 0, 1]);
    return raster(cols, rows, cw, ch, (wx, wy) => {
      const o = rot.toObj([wx, wy, -500]);
      let best = Infinity, n0 = null;
      for (const zc of [-T, T]) {
        if (Math.abs(dir[2]) < 1e-9) continue;
        const s = (zc - o[2]) / dir[2], px = o[0] + s * dir[0], py = o[1] + s * dir[1];
        if (s > 0 && s < best && px * px + py * py <= R * R) {
          best = s;
          // the back face reads mirrored, as a real coin would
          const sg = Math.sign(zc), u = (sg > 0 ? -px : px) / R, v = py / R, e = 0.012;
          const gx = (faceHeight(u + e, v) - faceHeight(u - e, v)) / (2 * e), gy = (faceHeight(u, v + e) - faceHeight(u, v - e)) / (2 * e);
          // a slightly domed face spreads the light across it instead of one flat tone
          n0 = norm([sg * gx * 0.05 + 0.42 * px / R, -gy * 0.05 + 0.42 * py / R, sg]);
          n0.flat = faceHeight(u, v);
        }
      }
      const a = dir[0] ** 2 + dir[1] ** 2;
      if (a > 1e-9) {
        const bq = 2 * (o[0] * dir[0] + o[1] * dir[1]), cq = o[0] ** 2 + o[1] ** 2 - R * R, disc = bq * bq - 4 * a * cq;
        if (disc >= 0) {
          const s = (-bq - Math.sqrt(disc)) / (2 * a), z = o[2] + s * dir[2];
          if (s > 0 && s < best && Math.abs(z) <= T) {
            best = s;
            const px = o[0] + s * dir[0], py = o[1] + s * dir[1], phi = Math.atan2(py, px);
            const k = 0.45 * Math.sin(phi * 90); // reeded edge
            n0 = norm([Math.cos(phi) - k * Math.sin(phi), Math.sin(phi) + k * Math.cos(phi), 0]);
            n0.edge = true;
          }
        }
      }
      if (!n0) return null;
      let l = light(rot.toWorld(n0), n0.edge ? 20 : 60);
      if (n0.edge) l *= 0.85;
      else if (n0.flat === 0) l *= 0.68; // the field sits a touch lower than the relief
      return l;
    });
  });
}

// ---------- spinning globe with payment arcs ----------
// scripts/land-mask.txt: 180x90 equirectangular land mask (2 degree cells) from Natural Earth 110m
const LAND = readFileSync(join(root, 'scripts/land-mask.txt'), 'utf8').trim().split('\n');
const isLand = (lat, lon) => LAND[Math.min(89, Math.floor((90 - lat) / 2))][Math.min(179, Math.floor((lon + 180) / 2))] === '1';
const ll = (lat, lon) => { const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180; return [Math.cos(a) * Math.sin(b), -Math.sin(a), -Math.cos(a) * Math.cos(b)]; };
function slerp(a, b, t) {
  const w = Math.acos(Math.max(-1, Math.min(1, dot(a, b)))), s = Math.sin(w);
  return a.map((_, i) => (Math.sin((1 - t) * w) * a[i] + Math.sin(t * w) * b[i]) / s);
}
function globeFrames({ cols, rows, cw, ch, R, n }) {
  const home = ll(42.33, -83.05);
  const routes = [ll(6.52, 3.38), ll(-23.55, -46.63), ll(19.43, -99.13), ll(51.5, -0.12)];
  return Array.from({ length: n }, (_, f) => {
    const rot = rotator(-(f / n) * Math.PI * 2 + 1.2, 0.38);
    return raster(cols, rows, cw, ch, (wx, wy) => {
      const d2 = wx * wx + wy * wy;
      if (d2 > R * R) return null;
      const wz = -Math.sqrt(R * R - d2), nw = [wx / R, wy / R, wz / R];
      const p = rot.toObj(nw);
      const lat = (Math.asin(-p[1]) * 180) / Math.PI, lon = (Math.atan2(p[0], -p[2]) * 180) / Math.PI;
      const diff = Math.max(0, dot(nw, KEY));
      if (isLand(lat, lon)) return 0.32 + 0.68 * diff;
      return 0.05 + 0.13 * diff; // ocean
    }, (cells) => {
      const put = (w, chr) => {
        if (w[2] > 0.08 && w[0] ** 2 + w[1] ** 2 < 1) return; // behind the globe
        const c = Math.round(w[0] * R / cw + cols / 2 - 0.5), r = Math.round(w[1] * R / ch + rows / 2 - 0.5);
        if (cells[r] && c >= 0 && c < cols) cells[r][c] = { ch: chr, tone: 9 };
      };
      routes.forEach((to, k) => {
        const head = ((f / n) * 2 + k / routes.length) % 1;
        for (let i = 0; i <= 40; i++) {
          const t = i / 40, lift = 1 + 0.22 * Math.sin(Math.PI * t);
          const w = rot.toWorld(slerp(home, to, t).map((c) => c * lift));
          if (t <= head && t > head - 0.35) put(w, t > head - 0.04 ? '@' : t > head - 0.15 ? '*' : '.');
        }
        put(rot.toWorld(to), 'o');
      });
      put(rot.toWorld(home), '@');
    });
  });
}

// ---------- hero ----------
function hero() {
  const W = 846, H = 400;
  const fs = 8, cw = fs * CW, ch = 8.3, cols = 48, rows = 28;
  const cx = 184, cy = 210;
  const coin = coinFrames({ cols, rows, cw, ch, R: 104, T: 9, n: 48 });
  const x0 = cx - (cols / 2) * cw, y0 = cy - (rows / 2) * ch + ch * 0.75;
  const flip = flipbook('c', coin, 4.8, (cells) => cellsToSvg(cells, x0, y0, cw, ch, 'g'));
  const tips = ['ship it, then explain it', 'make the money make sense', 'build something worth sharing', 'open source the boring parts'];
  const tipFlip = flipbook('t', tips, 16, (s) => text(52, 377, `try "${s}"`, `fill="${C.dim}" font-size="11.5"`));

  const cmd = 'whoami', typeAt = 0.3, typeDur = 0.5, panelAt = typeAt + typeDur + 0.25;
  const RX = 356, VX = 440;
  const rows_ = [
    ['building', 'Open Champions: Return to Arms, preserved', C.text],
    ['shipped', 'Jam · Stack · Kashout · Wickett · Art of Battle', C.text],
    ['stack', 'Swift · TypeScript · Solana · three.js · Python', C.text],
    ['find me', 'malikontech.com · x.com/malikontech · @MalikonTech', C.blue],
  ];
  const stagger = (i) => `style="animation-delay:${(panelAt + 0.15 + i * 0.07).toFixed(2)}s"`;
  const right = [
    `<g class="up" ${stagger(0)}>${text(RX, 116, 'Malik', `fill="${C.text}" font-size="24" font-weight="700"`)}${text(RX + 86, 116, 'TrustlessMike', `fill="${C.dim}" font-size="13"`)}</g>`,
    `<g class="up" ${stagger(1)}>${text(RX, 142, 'Financial advisor turned builder.', `fill="${C.text}" font-size="13.5"`)}${text(RX, 161, 'Games, apps and money tools, built in public from Detroit.', `fill="${C.dim}" font-size="11.5"`)}</g>`,
    `<g class="up" ${stagger(2)}><line x1="${RX}" y1="180" x2="806" y2="180" stroke="${C.line}" stroke-dasharray="2 4"/></g>`,
    ...rows_.map(([k, v, col], i) => `<g class="up" ${stagger(3 + i)}>${text(RX, 206 + i * 24, k, `fill="${C.gold}" font-size="11"`)}${text(VX, 206 + i * 24, v, `fill="${col}" font-size="11.5"`)}</g>`),
    `<g class="up" ${stagger(8)}><circle class="pulse" cx="${RX + 4}" cy="316" r="3.5" fill="${C.green}"/>${text(RX + 16, 320, 'shipping weekly · videos every week on YouTube and TikTok', `fill="${C.dim}" font-size="11"`)}</g>`,
  ].join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="A terminal window. Typing whoami opens a panel for Malik, TrustlessMike, with a spinning 3D gold coin drawn in ASCII and stamped M. Financial advisor turned builder of games, apps and money tools in Detroit. Building Open Champions. Shipped Jam, Stack, Kashout, Wickett, Art of Battle. Stack: Swift, TypeScript, Solana, three.js, Python.">
<title>Malik · TrustlessMike</title>
<defs>
<radialGradient id="glow"><stop offset="0" stop-color="${C.gold}" stop-opacity=".16"/><stop offset=".6" stop-color="${C.gold}" stop-opacity=".04"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>
<linearGradient id="win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14161a"/><stop offset=".086" stop-color="${C.bg}"/></linearGradient>
<linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.gold}" stop-opacity=".75"/><stop offset=".5" stop-color="${C.gold}" stop-opacity=".25"/><stop offset="1" stop-color="${C.gold}" stop-opacity=".6"/></linearGradient>
</defs>
<style>${BASE_CSS}
${toneCss('g', GOLD)}${flip.css}${tipFlip.css}
@keyframes type{to{transform:translateX(${f1(cmd.length * 12 * CW)}px)}}
.cover{animation:type ${typeDur}s steps(${cmd.length}) ${typeAt}s both}
@keyframes gone{to{opacity:0}}
.cur1{animation:gone .01s ${panelAt}s both}
@keyframes show{from{opacity:0}to{opacity:1}}
.panel{animation:show .45s ease-out ${panelAt}s both}
@keyframes up{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.up{animation:up .45s cubic-bezier(.2,.7,.2,1) both}
@keyframes blink{50%{opacity:0}}
.cur{animation:blink 1.1s step-end infinite}
@keyframes breathe{50%{opacity:.55;transform:scale(.94)}}
.glow{transform-origin:${cx}px ${cy}px;animation:breathe 4.8s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
.pulse{animation:pulse 1.8s ease-in-out infinite}
${NO_MOTION('.cover,.cur1,.panel,.up,.cur,.glow,.pulse')}
@media (prefers-reduced-motion:reduce){.cover{transform:translateX(${f1(cmd.length * 12 * CW)}px)}.cur1{opacity:0}}
</style>
<rect x="5.5" y=".5" width="835" height="395" rx="12" fill="url(#win)" stroke="${C.line}"/>
<circle cx="25" cy="17" r="5.5" fill="#ff5f57"/><circle cx="43" cy="17" r="5.5" fill="#febc2e"/><circle cx="61" cy="17" r="5.5" fill="#28c840"/>
${text(423, 21, 'malik@detroit: ~/trustlessmike', `fill="${C.dim}" font-size="11" text-anchor="middle"`)}
<line x1="6" y1="34.5" x2="840" y2="34.5" stroke="${C.line}"/>
${text(22, 58, '$', `fill="${C.green}" font-size="12"`)}${text(22 + 2 * 12 * CW, 58, cmd, `fill="${C.text}" font-size="12"`)}
<g class="cover"><rect x="${f1(22 + 2 * 12 * CW)}" y="46" width="${f1(cmd.length * 12 * CW + 4)}" height="16" fill="${C.bg}"/><rect class="cur1" x="${f1(22 + 2 * 12 * CW)}" y="47" width="${f1(12 * CW)}" height="14" fill="${C.text}" opacity=".85"/></g>
<g class="panel">
<rect x="22.5" y="74.5" width="801" height="266" rx="10" fill="${C.panel}" stroke="url(#frame)"/>
<rect x="36" y="68" width="${f1(13 * 11 * CW + 12)}" height="14" fill="${C.bg}"/>
${text(42, 79, 'trustlessmike', `fill="${C.gold}" font-size="11" font-weight="700"`)}
<circle class="glow" cx="${cx}" cy="${cy}" r="150" fill="url(#glow)"/>
${flip.body}
<line x1="334.5" y1="96" x2="334.5" y2="320" stroke="${C.line}"/>
${right}
</g>
<g class="panel">
<rect x="22.5" y="356.5" width="801" height="30" rx="7" fill="none" stroke="${C.line}"/>
${text(34, 377, '>', `fill="${C.gold}" font-size="12" font-weight="700"`)}
<rect class="cur" x="46" y="366" width="1.6" height="14" fill="${C.text}"/>
${tipFlip.body}
${text(812, 377, 'Detroit, MI', `fill="${C.dim}" font-size="11" text-anchor="end"`)}
</g>
</svg>`;
}

// ---------- tiles ----------
const TILE_H = 150, ART_H = 102;
let tileIndex = 0;
function tile({ file, w, title, sub, tag, art, label, extra = '' }) {
  const i = tileIndex++, aw = w - 10, cxA = 5 + aw / 2, cyA = 2 + ART_H / 2;
  const artBody = art.image
    ? `<g class="kb"><image href="data:image/webp;base64,${b64(`assets/art/${art.image}.webp`)}" x="5" y="2" width="${aw}" height="${ART_H}" preserveAspectRatio="xMidYMid slice"/></g>`
    : art.body;
  const tagW = tag.length * 8.5 * CW + 14;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${TILE_H}" viewBox="0 0 ${w} ${TILE_H}" role="img" aria-label="${esc(label)}">
<title>${esc(title)}: ${esc(sub)}</title>
<defs>
<clipPath id="card"><rect x="5" y="2" width="${aw}" height="${TILE_H - 6}" rx="12"/></clipPath>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<style>${BASE_CSS}${art.css || ''}
@keyframes kb{from{transform:scale(1)}to{transform:scale(1.05)}}
.kb{transform-origin:${cxA}px ${cyA}px;animation:kb 9s ease-in-out ${-i * 1.3}s infinite alternate}
@keyframes sheen{0%,62%{transform:translateX(${-w}px) skewX(-18deg)}100%{transform:translateX(${w * 1.6}px) skewX(-18deg)}}
.sheen{animation:sheen 7s cubic-bezier(.4,0,.2,1) ${(i * 0.7).toFixed(1)}s infinite}
${NO_MOTION('.kb,.sheen')}
@media (prefers-reduced-motion:reduce){.sheen{opacity:0}}
</style>
<g clip-path="url(#card)">
<rect x="5" y="2" width="${aw}" height="${TILE_H - 6}" fill="${C.info}"/>
${artBody}
${extra}
<rect class="sheen" x="0" y="2" width="${Math.round(w * 0.35)}" height="${ART_H}" fill="url(#sheen)"/>
<line x1="5" y1="${2 + ART_H + 0.5}" x2="${w - 5}" y2="${2 + ART_H + 0.5}" stroke="${C.line}"/>
</g>
<rect x="5.5" y="2.5" width="${aw - 1}" height="${TILE_H - 7}" rx="11.5" fill="none" stroke="${C.line}"/>
${text(17, 125, title, `fill="${C.text}" font-size="12.5" font-weight="700"`)}
${text(17, 140, sub, `fill="${C.dim}" font-size="9.5"`)}
<rect x="${f1(w - 17 - tagW)}" y="114.5" width="${f1(tagW)}" height="15" rx="7.5" fill="none" stroke="${C.line}"/>
${text(f1(w - 17 - tagW / 2), 125, tag, `fill="${C.soft}" font-size="8.5" text-anchor="middle"`)}
</svg>`;
  writeFileSync(join(out, file), svg);
}

// deterministic noise so rebuilds diff cleanly
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Scrolling hex dumps either side of the Open Champions mark
function hexColumn(x, n) {
  const ln = Array.from({ length: n }, (_, i) => {
    const bytes = Array.from({ length: 6 }, () => Math.floor(rnd() * 256).toString(16).padStart(2, '0').toUpperCase());
    return `${(0x4a000 + i * 6).toString(16).toUpperCase()}  ${bytes.join(' ')}`;
  });
  const doubled = ln.concat(ln);
  return `<g class="scroll">${doubled.map((s, i) => text(x, 12 + i * 10, s, `fill="${C.gold}" font-size="8"`)).join('')}</g>`;
}
const HEX_ROWS = 20;
const champions = {
  image: 'open-champions',
  css: `@keyframes scroll{to{transform:translateY(-${HEX_ROWS * 10}px)}}.scroll{animation:scroll 14s linear infinite;opacity:.32}${NO_MOTION('.scroll')}`,
};
const championsExtra = `<defs><radialGradient id="vig" cx=".5" cy=".5" r=".7"><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient><clipPath id="art"><rect x="5" y="2" width="413" height="${ART_H}"/></clipPath></defs><g clip-path="url(#art)">${hexColumn(18, HEX_ROWS)}${hexColumn(290, HEX_ROWS)}</g>`
  + `<rect x="5" y="2" width="413" height="${ART_H}" fill="url(#vig)" />`;

function globeArt(aw) {
  const fs = 6, cw = fs * CW, ch = 6.2, cols = 28, rows = 15, R = 43, gx = 68, gy = 2 + ART_H / 2;
  const frames = globeFrames({ cols, rows, cw, ch, R, n: 48 });
  const x0 = gx - (cols / 2) * cw, y0 = gy - (rows / 2) * ch + ch * 0.75;
  const fb = flipbook('w', frames, 8, (cells) => cellsToSvg(cells, x0, y0, cw, ch, 'b'));
  const legend = ['DTW', '-> LOS', '-> GRU', '-> MEX', '-> LHR'].map((s, i) =>
    text(136, 34 + i * 13, s, `fill="${i ? C.soft : C.gold}" font-size="8.5"${i ? '' : ' font-weight="700"'}`)).join('');
  return {
    css: toneCss('b', BLUE) + `.b9{fill:${C.gold}}` + fb.css,
    body: `<rect x="5" y="2" width="${aw}" height="${ART_H}" fill="#060d17"/><radialGradient id="halo"><stop offset=".6" stop-color="#3b82c4" stop-opacity=".22"/><stop offset="1" stop-color="#3b82c4" stop-opacity="0"/></radialGradient><circle cx="${gx}" cy="${gy}" r="${R + 10}" fill="url(#halo)"/>${fb.body}${legend}`,
  };
}

const playBadge = `<circle cx="27" cy="82" r="12" fill="#000" fill-opacity=".55" stroke="#fff" stroke-opacity=".5"/><path d="M23.5 76.5v11l9-5.5z" fill="#fff"/>`;

const tiles = [
  { file: 'tile-open-champions.svg', w: 423, title: 'Open Champions', sub: 'Preserving Champions: Return to Arms', tag: 'preservation',
    art: champions, extra: championsExtra, label: 'Open Champions: a gold C and sword mark between scrolling hex dumps. Reverse-engineering and preservation of Champions: Return to Arms.' },
  { file: 'tile-jam.svg', w: 423, title: 'Jam', sub: 'Real-world asset platform', tag: 'showcase',
    art: { image: 'jam' }, label: 'Jam: real-world asset platform.' },
  { file: 'tile-stack.svg', w: 211, title: 'Stack', sub: 'iOS crypto onboarding', tag: 'iOS',
    art: { image: 'stack' }, label: 'Stack: iOS crypto onboarding and portfolio discovery.' },
  { file: 'tile-kashout.svg', w: 211, title: 'Kashout', sub: 'SwiftUI rewards app', tag: 'MIT',
    art: { image: 'kashout' }, label: 'Kashout: open-source SwiftUI rewards-app prototype.' },
  { file: 'tile-wickett.svg', w: 211, title: 'Wickett', sub: 'Global payments on Solana', tag: 'MIT',
    art: globeArt(201), label: 'Wickett: an ASCII globe spins while payments arc out from Detroit. Global-payments prototype with Solana settlement.' },
  { file: 'tile-art-of-battle.svg', w: 211, title: 'Art of Battle', sub: 'First-person melee', tag: 'ISC',
    art: { image: 'art-of-battle' }, label: 'Art of Battle: first-person melee browser game.' },
  { file: 'tile-opencontroller.svg', w: 211, title: 'OpenController', sub: 'Desktop UI for agent CLIs', tag: 'MIT',
    art: { image: 'opencontroller' }, label: 'OpenController: desktop interface for OpenClaw and Hermes.' },
  { file: 'tile-vibe-guild.svg', w: 211, title: 'Vibe Guild', sub: 'A hall for makers', tag: 'MIT',
    art: { image: 'vibe-guild' }, label: 'Vibe Guild: a guild hall for games, apps and their makers.' },
  { file: 'tile-dispo-spinner.svg', w: 211, title: 'Dispo Spinner', sub: 'Animated wheel component', tag: 'MIT',
    art: { image: 'dispo-spinner' }, label: 'Dispo Spinner: customizable animated wheel component.' },
  { file: 'tile-malikontech.svg', w: 211, title: 'Malik on Tech', sub: 'New videos every week', tag: 'video',
    art: { image: 'malikontech' }, extra: playBadge, label: 'Malik on Tech: new videos every week at malikontech.com.' },
];

writeFileSync(join(out, 'hero.svg'), hero());
for (const t of tiles) tile(t);

// ---------- README ----------
const P = 'assets/profile';
const link = (href, file, w, alt) => `<a href="${href}"><img src="${P}/${file}" width="${w}" alt="${esc(alt)}"></a>`;
const gh = (r) => `https://github.com/TrustlessMike/${r}`;
const alt = Object.fromEntries(tiles.map((t) => [t.file, t.label]));
const readme = `<img src="${P}/hero.svg" width="100%" alt="A terminal window. Typing whoami opens a panel for Malik, TrustlessMike, with a spinning 3D gold coin drawn in ASCII. Financial advisor turned builder of games, apps and money tools in Detroit.">

<p align="center"><a href="https://malikontech.com">malikontech.com</a> &nbsp;·&nbsp; <a href="https://x.com/malikontech">@malikontech</a> &nbsp;·&nbsp; <a href="https://www.youtube.com/@MalikonTech">YouTube</a> &nbsp;·&nbsp; <a href="https://www.tiktok.com/@malikontech">TikTok</a> &nbsp;·&nbsp; <a href="https://www.instagram.com/malikontechnology">Instagram</a></p>

<p align="center">${[
  ['https://github.com/Open-Champions/champions-return-to-arms-re', 'tile-open-champions.svg', 423],
  [gh('Jam'), 'tile-jam.svg', 423],
  [gh('stack-app'), 'tile-stack.svg', 211],
  [gh('Kashout'), 'tile-kashout.svg', 211],
  [gh('Wickett'), 'tile-wickett.svg', 211],
  [gh('art-of-battle'), 'tile-art-of-battle.svg', 211],
  [gh('opencontroller'), 'tile-opencontroller.svg', 211],
  [gh('vibe-guild'), 'tile-vibe-guild.svg', 211],
  [gh('dispo-spinner'), 'tile-dispo-spinner.svg', 211],
  ['https://malikontech.com', 'tile-malikontech.svg', 211],
].map(([h, f, w]) => link(h, f, w, alt[f])).join('')}</p>

<p align="center"><sub>Each project documents its current scope and limitations. Clear bug reports and focused contributions are welcome.</sub></p>
`;
writeFileSync(join(root, 'README.md'), readme);
console.log('wrote hero.svg,', tiles.length, 'tiles and README.md');
