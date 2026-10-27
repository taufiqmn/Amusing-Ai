// Taufiq Studio engine: a deterministic canvas renderer. renderFrame(ctx, W, H, project, t, res) draws
// exactly one frame for time t, so preview, scrubbing and export all use the same code.
// Nothing here touches the network or the DOM except creating a canvas for film grain.

export const ASPECTS = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1] };
export function sizeFor(aspect, shortSide = 720) {
  const [a, b] = ASPECTS[aspect] || ASPECTS["16:9"];
  const k = shortSide / Math.min(a, b);
  return [Math.round((a * k) / 2) * 2, Math.round((b * k) / 2) * 2];
}

const SANS = '-apple-system,"SF Pro Display","Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif';
const SERIF = '"Iowan Old Style","Palatino Linotype",Georgia,"Times New Roman",serif';

/* ---------------- moods ("taste") ---------------- */
export const MOODS = {
  cinematic: { name: "Cinematic", dark: true, bg: ["#06121a", "#0e2a33", "#1b1013"], text: "#f3ecdf", accent: "#e8a24a", accent2: "#2fb5b0", font: SERIF, weight: 500, track: 0.07, letterbox: true, grain: 0.09, vignette: 0.6, tint: ["#ff9a3c", 0.07], speed: 0.8, card: "rgba(255,255,255,.07)", cardText: "#f3ecdf" },
  documentary: { name: "Documentary", dark: true, bg: ["#15130f", "#2a2419", "#12100c"], text: "#efe6d4", accent: "#d9b36c", accent2: "#8fa88a", font: SERIF, weight: 500, track: 0.03, letterbox: false, grain: 0.1, vignette: 0.45, tint: ["#c9a56a", 0.06], speed: 0.85, card: "rgba(255,255,255,.07)", cardText: "#efe6d4" },
  saas_light: { name: "SaaS light", dark: false, bg: ["#f7f8ff", "#eceeff", "#fbf3ff"], text: "#12142b", accent: "#5b5bf6", accent2: "#a855f7", font: SANS, weight: 700, track: -0.02, letterbox: false, grain: 0, vignette: 0, tint: null, speed: 1, card: "#ffffff", cardText: "#12142b" },
  saas_dark: { name: "SaaS dark", dark: true, bg: ["#0a0b1a", "#15122f", "#1d1042"], text: "#f5f6ff", accent: "#7c83ff", accent2: "#22d3ee", font: SANS, weight: 700, track: -0.02, letterbox: false, grain: 0.02, vignette: 0.25, tint: null, speed: 1, card: "rgba(255,255,255,.07)", cardText: "#f5f6ff" },
  neon: { name: "Neon", dark: true, bg: ["#07030f", "#14041f", "#041420"], text: "#ffffff", accent: "#ff2bd6", accent2: "#21f0ff", font: SANS, weight: 800, track: -0.01, letterbox: false, grain: 0.03, vignette: 0.4, tint: ["#ff2bd6", 0.04], speed: 1.15, card: "rgba(255,255,255,.07)", cardText: "#ffffff" },
  warm: { name: "Warm", dark: true, bg: ["#2a120a", "#4a1d0f", "#7a3417"], text: "#fff4e3", accent: "#ffc46b", accent2: "#ff7a59", font: SANS, weight: 700, track: -0.01, letterbox: false, grain: 0.05, vignette: 0.35, tint: ["#ffb347", 0.06], speed: 0.95, card: "rgba(255,255,255,.1)", cardText: "#fff4e3" },
  minimal: { name: "Minimal", dark: false, bg: ["#ffffff", "#f5f5f3", "#ffffff"], text: "#0b0b0b", accent: "#0b0b0b", accent2: "#6b6b6b", font: SANS, weight: 600, track: -0.03, letterbox: false, grain: 0, vignette: 0, tint: null, speed: 0.95, card: "#ffffff", cardText: "#0b0b0b" },
  energetic: { name: "Energetic", dark: false, bg: ["#ffe14d", "#ffb02e", "#ff7a2e"], text: "#111111", accent: "#e11d48", accent2: "#111111", font: SANS, weight: 900, track: -0.03, letterbox: false, grain: 0, vignette: 0, tint: null, speed: 1.35, card: "#ffffff", cardText: "#111111" },
  corporate: { name: "Corporate", dark: true, bg: ["#0b2545", "#13315c", "#1d4e89"], text: "#f4f8ff", accent: "#8dd3ff", accent2: "#ffd166", font: SANS, weight: 700, track: -0.01, letterbox: false, grain: 0, vignette: 0.2, tint: null, speed: 0.95, card: "rgba(255,255,255,.09)", cardText: "#f4f8ff" },
};

export const TRANSITIONS = { cut: "Cut", fade: "Dissolve", slide: "Slide", zoom: "Zoom", wipe: "Wipe", dip: "Dip to black" };
const TDUR = { cut: 0, fade: 0.6, slide: 0.55, zoom: 0.7, wipe: 0.6, dip: 0.8 };

export const PRESETS = {
  title: { name: "Cinematic title", group: "Story", fields: ["text", "sub"], hint: "Big title with a slow reveal" },
  kinetic: { name: "Kinetic text", group: "Story", fields: ["text"], hint: "Words pop in one by one. Use *stars* around a word to highlight it" },
  quote: { name: "Quote", group: "Story", fields: ["text", "sub"], hint: "Words fade in, with a name underneath" },
  stat: { name: "Big number", group: "Story", fields: ["text", "stat"], hint: "A number that counts up, like 50% faster" },
  lower: { name: "Lower third", group: "Story", fields: ["text", "sub"], hint: "Name and role bar, best on a photo" },
  image: { name: "Photo + caption", group: "Story", fields: ["text"], hint: "Slow zoom on a photo" },
  logos: { name: "Logo wall", group: "Story", fields: ["text"], hint: "A row of logos popping in" },
  footage: { name: "Video clip", group: "Story", fields: ["text"], hint: "Your own video, with an optional caption" },
  saas_hero: { name: "SaaS hero", group: "SaaS", fields: ["text", "sub", "items"], hint: "Headline, subtitle, button and an app window" },
  saas_features: { name: "SaaS features", group: "SaaS", fields: ["text", "items"], hint: "Feature cards. One per line: Title: details" },
  saas_dashboard: { name: "SaaS dashboard", group: "SaaS", fields: ["text"], hint: "App screen with live charts and a clicking cursor" },
  saas_steps: { name: "SaaS steps", group: "SaaS", fields: ["text", "items"], hint: "How it works in numbered steps" },
  saas_cta: { name: "SaaS call to action", group: "SaaS", fields: ["text", "sub", "items"], hint: "Final headline, button and website" },
};

/* ---------------- tiny helpers ---------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
export const ease = {
  out: (t) => 1 - Math.pow(1 - clamp(t), 3),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t))),
  inOut: (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  back: (t) => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
const prog = (lt, start, dur) => clamp((lt - start) / Math.max(0.0001, dur));
function rng(seed) { let a = hash(seed) >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h; }
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); if (r < 0) r = 0;
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function hexA(hex, a) {
  if (!hex || hex[0] !== "#") return hex;
  let h = hex.slice(1); if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function hexRgb(h) { h = String(h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixHex(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
const lumHex = (h) => { const [r, g, b] = hexRgb(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
export function moodOf(project, scene) {
  const id = (scene && scene.mood) || project.mood || "cinematic";
  const base = id === "custom" && project.customMood ? Object.assign({}, MOODS.cinematic, project.customMood) : MOODS[id] || MOODS.cinematic;
  const st = scene && scene.style; if (!st || !(st.text || st.accent || st.bg)) return base;
  const o = Object.assign({}, base);
  if (st.text) { o.text = st.text; if (o.cardText) o.cardText = st.text; }
  if (st.accent) { o.accent = st.accent; o.accent2 = mixHex(st.accent, o.dark ? "#ffffff" : "#000000", 0.35); }
  if (st.bg) { o.bg = [st.bg, mixHex(st.bg, "#000000", 0.35), st.bg]; o.dark = lumHex(st.bg) < 0.5; if (!st.text) { o.text = o.dark ? "#f5f5f5" : "#111111"; o.cardText = o.text; } }
  return o;
}

/* ---------------- timeline ---------------- */
export function layout(project) {
  const items = []; let t = 0;
  project.scenes.forEach((s, i) => {
    const prev = items[i - 1];
    const td = i === 0 ? 0 : Math.min(TDUR[s.transition] || 0, s.dur * 0.5, prev.scene.dur * 0.5);
    const start = Math.max(0, t - td);
    items.push({ scene: s, start, end: start + s.dur, td, index: i });
    t = start + s.dur;
  });
  return { items, total: t };
}
export const totalDuration = (project) => layout(project).total;

/* ---------------- text ---------------- */
function setFont(ctx, M, size, weight, family) { ctx.font = `${weight || M.weight} ${Math.round(size)}px ${family || M.font}`; }
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || "").split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean); let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (line && ctx.measureText(test).width > maxW) { out.push(line); line = w; } else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}
/** Fit text into a box by shrinking the font. Returns {size, lines}. */
let FIT_K = 1;
function fit(ctx, M, text, maxW, maxH, start, min, weight, family, lh = 1.12) {
  if (FIT_K !== 1) { maxW *= FIT_K > 1 ? Math.min(FIT_K, 1.2) : 1; maxH *= FIT_K > 1 ? FIT_K : 1; start *= FIT_K; min *= FIT_K; }
  let size = start;
  for (;;) {
    setFont(ctx, M, size, weight, family);
    const lines = wrap(ctx, text.replace(/\*/g, ""), maxW);
    if (size <= min || (lines.length * size * lh <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW * 1.001))) return { size, lines, lh };
    size -= Math.max(2, size * 0.06);
  }
}
function drawChars(ctx, line, cx, y, p, M, { stagger = 0.04, rise = 26, track = M.track } = {}) {
  const chars = [...line]; const size = parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)[1]);
  const spacing = size * track; const widths = chars.map((c) => ctx.measureText(c).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing; let x = cx - total / 2;
  ctx.textAlign = "left"; const n = chars.length;
  chars.forEach((c, i) => {
    const e = ease.out(clamp((p * (1 + stagger * n) - i * stagger) / 1));
    ctx.globalAlpha *= 1; const a = ctx.globalAlpha; ctx.globalAlpha = a * e;
    ctx.fillText(c, x, y + (1 - e) * rise); ctx.globalAlpha = a; x += widths[i];
  });
}

/* ---------------- images ---------------- */
function drawCover(ctx, img, x, y, w, h, scale = 1, px = 0, py = 0) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih) * scale; const dw = iw * k, dh = ih * k;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2 + px * (dw - w) / 2, y + (h - dh) / 2 + py * (dh - h) / 2, dw, dh); ctx.restore();
}
function drawContain(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!iw || !ih) return;
  const k = Math.min(w / iw, h / ih); const dw = iw * k, dh = ih * k; ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function drawEl(S, el, x, y, w, h, tile = true) {
  const { ctx, M, res } = S; const img = res && res.images && res.images[el.src];
  if (tile) { ctx.save(); ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 24 * S.u; ctx.shadowOffsetY = 8 * S.u; ctx.fillStyle = M.dark ? "rgba(255,255,255,.95)" : "#fff"; rr(ctx, x, y, w, h, 22 * S.u); ctx.fill(); ctx.restore(); }
  const pad = tile ? w * 0.18 : 0;
  if (img) drawContain(ctx, img, x + pad, y + pad, w - pad * 2, h - pad * 2);
  else { // monogram fallback
    const c = el.color || M.accent; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.32, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; setFont(ctx, M, Math.min(w, h) * 0.28, 800, SANS);
    ctx.fillText(el.mono || (el.name || "?").slice(0, 2).toUpperCase(), x + w / 2, y + h / 2 + 2); ctx.textBaseline = "alphabetic";
  }
}

/* ---------------- background + finish ---------------- */
function bgImage(S) { const e = (S.scene.elements || []).find((x) => x.kind === "image" && x.role !== "logo"); return e ? { el: e, img: S.res && S.res.images && S.res.images[e.src] } : null; }
function drawBg(S, { dim = true } = {}) {
  const { ctx, W, H, M, lt, u, scene } = S; const bi = bgImage(S);
  if (bi && bi.img) {
    const p = lt / Math.max(1, S.dur); const k = (1.04 + 0.1 * p * M.speed) * (bi.el.zoom || 1);
    drawCover(ctx, bi.img, 0, 0, W, H, k, (bi.el.fx || 0) + Math.sin(hash(scene.id) % 7) * 0.4 * p * (bi.el.still ? 0 : 1), (bi.el.fy || 0) + 0.2 * p * (bi.el.still ? 0 : 1));
    if (dim) { const g = ctx.createLinearGradient(0, 0, 0, H); const c = M.dark ? "0,0,0" : "255,255,255"; g.addColorStop(0, `rgba(${c},.35)`); g.addColorStop(0.55, `rgba(${c},.45)`); g.addColorStop(1, `rgba(${c},.75)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    return true;
  }
  const a = (hash(scene.id) % 360) * (Math.PI / 180) + lt * 0.08;
  const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * W * 0.7, H / 2 - Math.sin(a) * H * 0.7, W / 2 + Math.cos(a) * W * 0.7, H / 2 + Math.sin(a) * H * 0.7);
  M.bg.forEach((c, i) => g.addColorStop(i / (M.bg.length - 1 || 1), c)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const R = rng(scene.id + "glow");
  for (let i = 0; i < 3; i++) {
    const cx = (R() * 0.8 + 0.1) * W + Math.sin(lt * 0.4 + i * 2) * W * 0.05, cy = (R() * 0.8 + 0.1) * H + Math.cos(lt * 0.3 + i) * H * 0.05, r = Math.max(W, H) * (0.35 + R() * 0.25);
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); const col = i % 2 ? M.accent2 : M.accent;
    rg.addColorStop(0, hexA(col, M.dark ? 0.2 : 0.14)); rg.addColorStop(1, hexA(col, 0)); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  }
  return false;
}
function finish(S) {
  const { ctx, W, H, M, project, u, res } = S;
  if (M.tint) { ctx.save(); ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = hexA(M.tint[0], Math.min(1, M.tint[1] * 6)); ctx.fillRect(0, 0, W, H); ctx.restore(); }
  if (M.vignette) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${M.vignette * 0.7})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  if (M.grain > 0 && res) {
    if (!res.grainTile) res.grainTile = makeGrain(res);
    if (res.grainTile) { ctx.save(); ctx.globalAlpha = M.grain * 0.8; ctx.globalCompositeOperation = "overlay"; const f = Math.floor(S.lt * 24); const ox = (hash("x" + f) % 256), oy = (hash("y" + f) % 256); const pat = ctx.createPattern(res.grainTile, "repeat"); if (pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix().translate(ox, oy)); ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }
  if (M.letterbox && W / H > 1.2 && project.letterbox !== false) { const bh = Math.max(0, (H - W / 2.39) / 2); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); }
}
function makeGrain(res) {
  try {
    const c = res.makeCanvas ? res.makeCanvas(256, 256) : typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(256, 256) : document.createElement("canvas");
    c.width = 256; c.height = 256; const g = c.getContext("2d"); const id = g.createImageData(256, 256); const R = rng("grain");
    for (let i = 0; i < id.data.length; i += 4) { const v = R() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    g.putImageData(id, 0, 0); return c;
  } catch (_) { return null; }
}

/* ---------------- icons ---------------- */
const ICONS = [
  ["bolt", /fast|speed|quick|instant|auto|power|lightning|performance/i], ["shield", /secur|safe|protect|privacy|trust|compliance/i],
  ["chart", /analytic|report|growth|insight|data|metric|stat|dashboard/i], ["users", /team|collab|people|user|customer|share|community/i],
  ["clock", /time|schedule|save|track|deadline|hour/i], ["sparkle", /ai|smart|magic|generate|create|assist|automat/i],
  ["globe", /global|world|language|web|online|cloud/i], ["lock", /lock|access|login|encrypt|private/i],
  ["mail", /mail|email|message|chat|inbox|notify/i], ["code", /api|code|develop|integrat|plugin|build/i],
];
export function iconFor(text, i = 0) { const m = ICONS.find(([, re]) => re.test(text || "")); return m ? m[0] : ["sparkle", "bolt", "chart", "users", "shield"][i % 5]; }
function drawIcon(ctx, name, cx, cy, r, color) {
  ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = r * 0.16; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const s = r; ctx.beginPath();
  switch (name) {
    case "bolt": ctx.moveTo(s * 0.15, -s * 0.8); ctx.lineTo(-s * 0.45, s * 0.1); ctx.lineTo(0, s * 0.1); ctx.lineTo(-s * 0.15, s * 0.8); ctx.lineTo(s * 0.45, -s * 0.15); ctx.lineTo(0, -s * 0.15); ctx.closePath(); ctx.fill(); break;
    case "shield": ctx.moveTo(0, -s * 0.8); ctx.lineTo(s * 0.65, -s * 0.5); ctx.lineTo(s * 0.55, s * 0.2); ctx.quadraticCurveTo(s * 0.4, s * 0.65, 0, s * 0.85); ctx.quadraticCurveTo(-s * 0.4, s * 0.65, -s * 0.55, s * 0.2); ctx.lineTo(-s * 0.65, -s * 0.5); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.25, 0); ctx.lineTo(-s * 0.05, s * 0.22); ctx.lineTo(s * 0.3, -s * 0.2); ctx.stroke(); break;
    case "chart": [[-0.5, 0.2], [-0.1, -0.2], [0.3, -0.6]].forEach(([x, y]) => { ctx.fillRect(s * (x - 0.13), s * y, s * 0.26, s * (0.8 - y)); }); break;
    case "users": ctx.arc(0, -s * 0.3, s * 0.28, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(0, s * 0.85, s * 0.6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break;
    case "clock": ctx.arc(0, 0, s * 0.7, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(0, 0); ctx.lineTo(s * 0.3, s * 0.2); ctx.stroke(); break;
    case "globe": ctx.arc(0, 0, s * 0.7, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, 0, s * 0.3, s * 0.7, 0, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(s * 0.7, 0); ctx.stroke(); break;
    case "lock": ctx.fillRect(-s * 0.5, -s * 0.05, s, s * 0.7); ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.32, Math.PI, 0); ctx.stroke(); break;
    case "mail": rr(ctx, -s * 0.7, -s * 0.5, s * 1.4, s, s * 0.12); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.45); ctx.lineTo(0, s * 0.1); ctx.lineTo(s * 0.7, -s * 0.45); ctx.stroke(); break;
    case "code": ctx.moveTo(-s * 0.25, -s * 0.5); ctx.lineTo(-s * 0.7, 0); ctx.lineTo(-s * 0.25, s * 0.5); ctx.moveTo(s * 0.25, -s * 0.5); ctx.lineTo(s * 0.7, 0); ctx.lineTo(s * 0.25, s * 0.5); ctx.stroke(); break;
    default: ctx.moveTo(0, -s * 0.8); ctx.quadraticCurveTo(s * 0.1, -s * 0.1, s * 0.8, 0); ctx.quadraticCurveTo(s * 0.1, s * 0.1, 0, s * 0.8); ctx.quadraticCurveTo(-s * 0.1, s * 0.1, -s * 0.8, 0); ctx.quadraticCurveTo(-s * 0.1, -s * 0.1, 0, -s * 0.8); ctx.fill();
  }
  ctx.restore();
}

/* ---------------- SaaS window mock ---------------- */
function drawWindow(S, x, y, w, h, lt, { cursor = false } = {}) {
  const { ctx, M, u, scene } = S; const R = rng(scene.id + "win"); const dk = M.dark;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 50 * u; ctx.shadowOffsetY = 24 * u;
  ctx.fillStyle = dk ? "#12142a" : "#ffffff"; rr(ctx, x, y, w, h, 20 * u); ctx.fill(); ctx.restore();
  ctx.save(); rr(ctx, x, y, w, h, 20 * u); ctx.clip();
  const bar = 40 * u; ctx.fillStyle = dk ? "#1a1d3a" : "#f1f2f8"; ctx.fillRect(x, y, w, bar);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + (22 + i * 22) * u, y + bar / 2, 6 * u, 0, 7); ctx.fill(); });
  const sw = w * 0.2; ctx.fillStyle = dk ? "#161833" : "#f7f8fc"; ctx.fillRect(x, y + bar, sw, h - bar);
  for (let i = 0; i < 6; i++) { const on = i === 1; ctx.fillStyle = on ? hexA(M.accent, 0.9) : dk ? "rgba(255,255,255,.14)" : "rgba(20,20,60,.10)"; rr(ctx, x + sw * 0.12, y + bar + (24 + i * 38) * u, sw * (on ? 0.76 : 0.5 + R() * 0.3), 14 * u, 7 * u); ctx.fill(); }
  const cx0 = x + sw + 22 * u, cw = w - sw - 44 * u, top = y + bar + 22 * u;
  ctx.fillStyle = dk ? "rgba(255,255,255,.85)" : "rgba(18,20,43,.85)"; rr(ctx, cx0, top, cw * 0.32, 18 * u, 9 * u); ctx.fill();
  const kw = (cw - 28 * u) / 3, kh = Math.min(96 * u, (h - bar) * 0.2);
  for (let i = 0; i < 3; i++) {
    const p = ease.out(prog(lt, 0.3 + i * 0.15, 0.7)); const kx = cx0 + i * (kw + 14 * u), ky = top + 36 * u;
    ctx.globalAlpha = p; ctx.fillStyle = dk ? "rgba(255,255,255,.07)" : "#f4f5fb"; rr(ctx, kx, ky, kw, kh, 14 * u); ctx.fill();
    ctx.fillStyle = dk ? "rgba(255,255,255,.4)" : "rgba(18,20,43,.4)"; rr(ctx, kx + 14 * u, ky + 14 * u, kw * 0.4, 9 * u, 4.5 * u); ctx.fill();
    const val = Math.round((R() * 80 + 20) * 100 * p); ctx.fillStyle = dk ? "#fff" : "#12142b"; ctx.textAlign = "left"; setFont(ctx, M, kh * 0.34, 800, SANS); ctx.fillText(val.toLocaleString("en-US"), kx + 14 * u, ky + kh * 0.78); ctx.globalAlpha = 1;
  }
  const chy = top + 36 * u + kh + 20 * u, chh = y + h - chy - 22 * u;
  if (chh > 30 * u) {
    ctx.fillStyle = dk ? "rgba(255,255,255,.05)" : "#f8f9fd"; rr(ctx, cx0, chy, cw, chh, 14 * u); ctx.fill();
    const pts = []; let v = 0.5; const n = 14; for (let i = 0; i < n; i++) { v = clamp(v + (R() - 0.42) * 0.22, 0.1, 0.95); pts.push(v); }
    const drawP = ease.inOut(prog(lt, 0.7, 1.6)); const px = (i) => cx0 + 18 * u + (cw - 36 * u) * (i / (n - 1)), py = (i) => chy + chh - 18 * u - (chh - 36 * u) * pts[i];
    ctx.save(); ctx.beginPath(); ctx.rect(cx0, chy, (cw) * drawP, chh); ctx.clip();
    ctx.beginPath(); pts.forEach((_, i) => (i ? ctx.lineTo(px(i), py(i)) : ctx.moveTo(px(i), py(i)))); ctx.strokeStyle = M.accent; ctx.lineWidth = 4 * u; ctx.lineJoin = "round"; ctx.stroke();
    ctx.lineTo(px(n - 1), chy + chh - 18 * u); ctx.lineTo(px(0), chy + chh - 18 * u); ctx.closePath(); const fg = ctx.createLinearGradient(0, chy, 0, chy + chh); fg.addColorStop(0, hexA(M.accent, 0.35)); fg.addColorStop(1, hexA(M.accent, 0)); ctx.fillStyle = fg; ctx.fill(); ctx.restore();
  }
  ctx.restore();
  return { btn: { x: x + w * 0.78, y: y + bar + 22 * u, w: w * 0.14, h: 30 * u } };
}
function drawCursor(S, x, y, click) {
  const { ctx, u, M } = S; ctx.save(); ctx.translate(x, y); ctx.scale(u * (1 - 0.12 * click), u * (1 - 0.12 * click));
  ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 8; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 30); ctx.lineTo(8, 23); ctx.lineTo(14, 36); ctx.lineTo(20, 33); ctx.lineTo(14, 21); ctx.lineTo(24, 21); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
function pill(S, text, x, y, h, p = 1, { pulse = 0 } = {}) {
  const { ctx, M, u } = S; setFont(ctx, M, h * 0.42, 700, SANS); const w = ctx.measureText(text).width + h * 1.1; const k = 1 + pulse * 0.04;
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(p * k, p * k); ctx.globalAlpha *= clamp(p * 1.5);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, M.accent); g.addColorStop(1, M.accent2);
  ctx.shadowColor = hexA(M.accent, 0.5); ctx.shadowBlur = 30 * u; ctx.shadowOffsetY = 8 * u; ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill(); ctx.shadowColor = "transparent";
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 0, 2); ctx.restore(); ctx.textBaseline = "alphabetic"; return w;
}

/* ---------------- presets ---------------- */
function parseItem(s) { const m = String(s).split(/\s*[:\-–—]\s+/); return { title: m[0], body: m.slice(1).join(" - ") }; }

const DRAW = {
  title(S) {
    const { ctx, W, H, M, lt, u, dur, scene } = S; drawBg(S);
    const z = 1 + 0.035 * (lt / dur) * M.speed; ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    const f = fit(ctx, M, scene.text || "Your title", W * 0.8, H * 0.5, 150 * u, 40 * u, M.weight, M.font, 1.12);
    ctx.fillStyle = M.text; ctx.textBaseline = "alphabetic"; const total = f.lines.length * f.size * f.lh; let y = H / 2 - total / 2 + f.size * 0.9 - (scene.sub ? 30 * u : 0);
    const p = prog(lt, 0.2, 1.4 / M.speed);
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 24 * u;
    f.lines.forEach((l, i) => { setFont(ctx, M, f.size); drawChars(ctx, l, W / 2, y + i * f.size * f.lh, p, M, { stagger: 0.035, rise: f.size * 0.25 }); });
    ctx.shadowColor = "transparent";
    { const mw = Math.max(...f.lines.map((l) => ctx.measureText(l).width)); hit(S, "text", W / 2 - mw / 2, y - f.size, mw, f.lines.length * f.size * f.lh); }
    const lw = ease.outExpo(prog(lt, 0.7, 1)) * Math.min(W * 0.16, 240 * u); ctx.fillStyle = M.accent; ctx.fillRect(W / 2 - lw / 2, y + (f.lines.length - 1) * f.size * f.lh + f.size * 0.35, lw, 3 * u);
    if (scene.sub) { const sp = ease.out(prog(lt, 1.0, 0.8)); ctx.globalAlpha = sp; setFont(ctx, M, 36 * u, 400, SANS); ctx.fillStyle = hexA(M.text, 0.8); ctx.textAlign = "center"; const sl = wrap(ctx, scene.sub, W * 0.7); hit(S, "sub", W * 0.15, y + (f.lines.length - 1) * f.size * f.lh + f.size * 0.35 + 20 * u, W * 0.7, sl.length * 46 * u + 20 * u); sl.forEach((l, i) => ctx.fillText(l, W / 2, y + (f.lines.length - 1) * f.size * f.lh + f.size * 0.35 + 60 * u + i * 46 * u + (1 - sp) * 14 * u)); ctx.globalAlpha = 1; }
    ctx.restore();
  },
  kinetic(S) {
    const { ctx, W, H, M, lt, u, dur, scene } = S; drawBg(S);
    const raw = String(scene.text || "Say it with motion").split(/\s+/).filter(Boolean);
    let hi = raw.findIndex((w) => /^\*.+\*[.,!?]?$/.test(w)); const words = raw.map((w) => w.replace(/\*/g, ""));
    if (hi < 0) hi = words.findIndex((w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w)); if (hi < 0) hi = words.reduce((b, w, i) => (w.length > words[b].length ? i : b), 0);
    const maxW = W * 0.84; let size = 170 * u * FIT_K; let lines;
    for (;;) { setFont(ctx, M, size, 900); lines = []; let cur = []; words.forEach((w, i) => { const test = [...cur, { w, i }]; if (cur.length && ctx.measureText(test.map((x) => x.w).join(" ")).width > maxW) { lines.push(cur); cur = [{ w, i }]; } else cur = test; }); if (cur.length) lines.push(cur); if (size < 36 * u || lines.length * size * 1.08 < H * 0.7) break; size *= 0.92; }
    const lh = size * 1.08; let y = H / 2 - (lines.length * lh) / 2 + size * 0.85;
    hit(S, "text", W * 0.08, y - size * 0.85, W * 0.84, lines.length * lh); const step = clamp((dur - 0.7) / Math.max(1, words.length), 0.16, 0.45 / M.speed);
    setFont(ctx, M, size, 900); const sp = ctx.measureText(" ").width;
    lines.forEach((ln) => {
      const lw = ln.reduce((a, x) => a + ctx.measureText(x.w).width, 0) + sp * (ln.length - 1); let x = W / 2 - lw / 2;
      ln.forEach(({ w, i }) => {
        const ww = ctx.measureText(w).width; const p = prog(lt, 0.15 + i * step, 0.38); const e = ease.back(p);
        if (p > 0) { ctx.save(); ctx.globalAlpha = clamp(p * 3); ctx.translate(x + ww / 2, y - size * 0.3); ctx.scale(lerp(0.55, 1, e), lerp(0.55, 1, e)); ctx.translate(-(x + ww / 2), -(y - size * 0.3)); ctx.fillStyle = i === hi ? M.accent : M.text; ctx.textAlign = "left"; ctx.fillText(w, x, y - (1 - clamp(p)) * 10 * u); if (i === hi) { ctx.fillRect(x, y + size * 0.1, ww * ease.out(prog(lt, 0.15 + i * step + 0.2, 0.4)), 6 * u); } ctx.restore(); }
        x += ww + sp;
      });
      y += lh;
    });
  },
  quote(S) {
    const { ctx, W, H, M, lt, u, scene } = S; drawBg(S);
    const f = fit(ctx, M, scene.text || "A line worth remembering", W * 0.72, H * 0.5, 84 * u, 28 * u, M.weight, M.font, 1.25);
    const total = f.lines.length * f.size * f.lh; let y = H / 2 - total / 2 + f.size;
    hit(S, "text", W * 0.12, y - f.size, W * 0.76, total);
    ctx.fillStyle = hexA(M.accent, 0.9); setFont(ctx, M, 240 * u, 700, SERIF); ctx.textAlign = "left"; ctx.globalAlpha = ease.out(prog(lt, 0, 0.8)); ctx.fillText("“", W * 0.12, y - f.size * 0.3); ctx.globalAlpha = 1;
    setFont(ctx, M, f.size); ctx.fillStyle = M.text; let wi = 0; const startX = W * 0.14;
    f.lines.forEach((l, li) => { let x = startX; l.split(" ").forEach((w) => { const a = ease.out(prog(lt, 0.4 + wi * 0.09, 0.5)); ctx.globalAlpha = a; ctx.fillText(w, x, y + li * f.size * f.lh + (1 - a) * 12 * u); x += ctx.measureText(w + " ").width; wi++; }); });
    ctx.globalAlpha = ease.out(prog(lt, 0.5 + wi * 0.09, 0.6)); if (scene.sub) { setFont(ctx, M, 34 * u, 500, SANS); ctx.fillStyle = M.accent; ctx.fillText("— " + scene.sub, startX, y + f.lines.length * f.size * f.lh + 30 * u); } ctx.globalAlpha = 1;
  },
  stat(S) {
    const { ctx, W, H, M, lt, u, scene } = S; drawBg(S); const st = scene.stat || { value: 50, suffix: "%", prefix: "", label: scene.text || "" };
    const p = ease.outExpo(prog(lt, 0.2, 1.6)); const v = Math.round((Number(st.value) || 0) * p * 10) / 10; const shown = (Number(st.value) % 1 ? v.toFixed(1) : String(Math.round(v)));
    const R = Math.min(W, H) * 0.3; hit(S, "number", W / 2 - R, H / 2 - 20 * u - R, R * 2, R * 2); hit(S, "text", W * 0.15, H / 2 + R + 10 * u, W * 0.7, 110 * u); ctx.lineWidth = 16 * u; ctx.lineCap = "round"; ctx.strokeStyle = hexA(M.text, 0.12); ctx.beginPath(); ctx.arc(W / 2, H / 2 - 20 * u, R, 0, 7); ctx.stroke();
    const frac = st.suffix === "%" ? clamp(Number(st.value) / 100) : 1; const g = ctx.createLinearGradient(W / 2 - R, 0, W / 2 + R, 0); g.addColorStop(0, M.accent); g.addColorStop(1, M.accent2);
    ctx.strokeStyle = g; ctx.beginPath(); ctx.arc(W / 2, H / 2 - 20 * u, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac * p); ctx.stroke();
    ctx.fillStyle = M.text; ctx.textAlign = "center"; setFont(ctx, M, R * 0.7, 900, SANS); ctx.fillText((st.prefix || "") + shown + (st.suffix || ""), W / 2, H / 2 - 20 * u + R * 0.24);
    const lab = ease.out(prog(lt, 0.9, 0.7)); ctx.globalAlpha = lab; setFont(ctx, M, 44 * u, 500, SANS); ctx.fillStyle = hexA(M.text, 0.85); wrap(ctx, st.label || scene.text || "", W * 0.7).forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + R + 40 * u + i * 52 * u + (1 - lab) * 12 * u)); ctx.globalAlpha = 1;
  },
  lower(S) {
    const { ctx, W, H, M, lt, u, scene } = S; const has = drawBg(S, { dim: false });
    if (has) { const g = ctx.createLinearGradient(0, H * 0.55, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.7)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    const p = ease.outExpo(prog(lt, 0.3, 0.8)); const bx = W * 0.07, by = H * 0.74, bh = 130 * u, bw = Math.min(W * 0.62, 900 * u) * p;
    hit(S, "text", bx, by, Math.min(W * 0.62, 900 * u), bh);
    ctx.fillStyle = M.accent; ctx.fillRect(bx, by, 10 * u, bh * p); ctx.save(); ctx.beginPath(); ctx.rect(bx + 10 * u, by, bw, bh); ctx.clip();
    ctx.fillStyle = M.dark ? "rgba(10,12,20,.82)" : "rgba(255,255,255,.92)"; ctx.fillRect(bx + 10 * u, by, bw, bh);
    ctx.fillStyle = M.dark ? "#fff" : "#111"; ctx.textAlign = "left"; setFont(ctx, M, 54 * u, 800, SANS); ctx.fillText(scene.text || "Your name", bx + 40 * u, by + 58 * u);
    ctx.fillStyle = M.accent; setFont(ctx, M, 32 * u, 500, SANS); ctx.fillText(scene.sub || "Your role", bx + 40 * u, by + 102 * u); ctx.restore();
  },
  image(S) {
    const { ctx, W, H, M, lt, u, scene, res } = S; const has = drawBg(S, { dim: false });
    if (!has && res && res.preview) { ctx.fillStyle = hexA(M.text, 0.35); ctx.textAlign = "center"; setFont(ctx, M, 36 * u, 500, SANS); ctx.fillText("Add a photo in the scene panel", W / 2, H / 2); }
    const g = ctx.createLinearGradient(0, H * 0.5, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.72)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (scene.text) { const f = fit(ctx, M, scene.text, W * 0.8, H * 0.22, 74 * u, 28 * u, M.weight, M.font, 1.15); hit(S, "text", W * 0.1, H * 0.84 - f.lines.length * f.size * f.lh, W * 0.8, f.lines.length * f.size * f.lh + 20 * u); const a = ease.out(prog(lt, 0.4, 0.8)); ctx.globalAlpha = a; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; setFont(ctx, M, f.size); f.lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.84 - (f.lines.length - 1 - i) * f.size * f.lh + (1 - a) * 18 * u)); ctx.globalAlpha = 1; }
  },
  logos(S) {
    const { ctx, W, H, M, lt, u, scene } = S; drawBg(S);
    const els = (scene.elements || []).filter((e) => e.kind === "logo").slice(0, 8);
    ctx.fillStyle = M.text; ctx.textAlign = "center"; const f = fit(ctx, M, scene.text || "Trusted by teams everywhere", W * 0.8, H * 0.2, 64 * u, 26 * u, M.weight, M.font, 1.15);
    const a0 = ease.out(prog(lt, 0.1, 0.7)); ctx.globalAlpha = a0; setFont(ctx, M, f.size); f.lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.24 + i * f.size * f.lh)); ctx.globalAlpha = 1;
    const n = Math.max(1, els.length); const cols = W < H ? Math.min(2, n) : Math.min(4, n); const rows = Math.ceil(n / cols); const sz = Math.min((W * 0.8) / cols - 24 * u, (H * 0.5) / rows - 24 * u, 260 * u);
    els.forEach((e, i) => { const r = Math.floor(i / cols), c = i % cols; const inRow = Math.min(cols, n - r * cols); const x = W / 2 - (inRow * (sz + 24 * u) - 24 * u) / 2 + c * (sz + 24 * u); const y = H * 0.38 + r * (sz + 24 * u);
      const p = ease.back(prog(lt, 0.5 + i * 0.18, 0.5)); if (p <= 0) { hit(S, "el", x, y, sz, sz, { idx: scene.elements.indexOf(e) }); return; } hit(S, "el", x, y, sz, sz, { idx: scene.elements.indexOf(e) }); ctx.save(); ctx.translate(x + sz / 2, y + sz / 2); ctx.scale(p, p); ctx.globalAlpha = clamp(p * 2); drawEl(S, e, -sz / 2, -sz / 2, sz, sz); ctx.restore(); });
    hit(S, "text", W * 0.1, H * 0.24 - f.size, W * 0.8, f.lines.length * f.size * f.lh + 10 * u);
    if (!els.length && S.res && S.res.preview) { ctx.fillStyle = hexA(M.text, 0.4); setFont(ctx, M, 34 * u, 500, SANS); ctx.fillText("Type: add Stripe and Notion logos", W / 2, H * 0.55); }
  },
  footage(S) {
    const { ctx, W, H, M, lt, u, scene, res } = S; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const el = (scene.elements || []).find((e) => e.kind === "video"); const v = el && res.videos && res.videos[el.mid];
    if (v && v.readyState >= 2) { const k = (el.zoom || 1); drawCover(ctx, v, 0, 0, W, H, k, el.fx || 0, el.fy || 0); }
    else if (res.preview) { ctx.fillStyle = hexA("#ffffff", 0.45); ctx.textAlign = "center"; setFont(ctx, M, 36 * u, 500, SANS); ctx.fillText(el ? "Loading your clip..." : "Upload a video clip in the scene panel", W / 2, H / 2); }
    if (scene.text) { const g = ctx.createLinearGradient(0, H * 0.6, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.65)"); ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4);
      const f = fit(ctx, M, scene.text, W * 0.8, H * 0.2, 64 * u, 26 * u, M.weight, M.font, 1.15); hit(S, "text", W * 0.1, H * 0.9 - f.lines.length * f.size * f.lh, W * 0.8, f.lines.length * f.size * f.lh + 10 * u);
      const a = ease.out(prog(lt, 0.3, 0.6)); ctx.globalAlpha = a; ctx.fillStyle = M.dark || true ? "#fff" : M.text; ctx.textAlign = "center"; setFont(ctx, M, f.size); f.lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.9 - (f.lines.length - 1 - i) * f.size * f.lh + (1 - a) * 14 * u)); ctx.globalAlpha = 1; }
  },
  saas_hero(S) {
    const { ctx, W, H, M, lt, u, scene } = S; drawBg(S); const land = W >= H;
    const tx = land ? W * 0.07 : W * 0.08, tw = land ? W * 0.42 : W * 0.84, ty = land ? H * 0.28 : H * 0.1;
    const f = fit(ctx, M, scene.text || "Your product, in one line", tw, land ? H * 0.34 : H * 0.2, 96 * u, 34 * u, 800, SANS, 1.08);
    ctx.fillStyle = M.text; ctx.textAlign = "left"; setFont(ctx, M, f.size, 800, SANS); let y = ty + f.size;
    f.lines.forEach((l, li) => { let x = tx; l.split(" ").forEach((w, wi) => { const p = ease.out(prog(lt, 0.15 + (li * 4 + wi) * 0.07, 0.55)); ctx.globalAlpha = p; ctx.fillText(w, x, y + li * f.size * f.lh + (1 - p) * 30 * u); x += ctx.measureText(w + " ").width; }); }); ctx.globalAlpha = 1;
    hit(S, "text", tx, ty, tw, f.lines.length * f.size * f.lh + 10 * u);
    let yy = y + f.lines.length * f.size * f.lh;
    if (scene.sub) { setFont(ctx, M, 34 * u, 400, SANS); const sp = ease.out(prog(lt, 0.7, 0.7)); ctx.globalAlpha = sp; ctx.fillStyle = hexA(M.text, 0.72); wrap(ctx, scene.sub, tw).forEach((l, i) => ctx.fillText(l, tx, yy + 8 * u + i * 44 * u + (1 - sp) * 14 * u)); ctx.globalAlpha = 1; hit(S, "sub", tx, yy, tw, wrap(ctx, scene.sub, tw).length * 44 * u + 8 * u); yy += 8 * u + wrap(ctx, scene.sub, tw).length * 44 * u; }
    const cta = (scene.items && scene.items[0]) || "Get started free"; const pw = pill(S, cta, tx, yy + 28 * u, 76 * u, ease.back(prog(lt, 1.1, 0.5)), { pulse: Math.sin(lt * 4) * 0.5 + 0.5 }); hit(S, "button", tx, yy + 28 * u, pw, 76 * u, { i: 0 });
    const ww = land ? W * 0.44 : W * 0.84, wh = land ? H * 0.62 : H * 0.34; const wx = land ? W * 0.52 : W * 0.08, wy = land ? H * 0.19 : H * 0.58;
    hit(S, "window", wx, wy, ww, wh);
    const e = ease.outExpo(prog(lt, 0.3, 1.2)); ctx.save(); ctx.translate(wx + ww / 2, wy + wh / 2 + Math.sin(lt * 1.6) * 8 * u + (1 - e) * 80 * u); ctx.rotate((land ? -0.035 : 0) * e); ctx.scale(lerp(0.85, 1, e), lerp(0.85, 1, e)); ctx.globalAlpha = e;
    drawWindow(S, -ww / 2, -wh / 2, ww, wh, Math.max(0, lt - 0.4)); ctx.restore();
    const logo = (scene.elements || []).find((x) => x.kind === "logo"); if (logo) { const p = ease.back(prog(lt, 0.3, 0.5)); hit(S, "el", W * 0.07, H * 0.1 - 20 * u, 80 * u, 80 * u, { idx: scene.elements.indexOf(logo) }); ctx.save(); ctx.translate(W * 0.07 + 40 * u, H * 0.1 + 20 * u); ctx.scale(p, p); drawEl(S, logo, -40 * u, -40 * u, 80 * u, 80 * u); ctx.restore(); }
  },
  saas_features(S) {
    const { ctx, W, H, M, lt, u, scene } = S; drawBg(S); const land = W >= H;
    const items = (scene.items && scene.items.length ? scene.items : ["Fast: Done in seconds", "Secure: Your data stays yours", "Smart: Learns how you work"]).slice(0, land ? 4 : 4).map(parseItem);
    const f = fit(ctx, M, scene.text || "Everything you need", W * 0.84, H * 0.16, 78 * u, 30 * u, 800, SANS, 1.1); ctx.fillStyle = M.text; ctx.textAlign = "center"; setFont(ctx, M, f.size, 800, SANS); hit(S, "text", W * 0.08, H * (land ? 0.2 : 0.12) - f.size, W * 0.84, f.lines.length * f.size * f.lh + 10 * u); const tp = ease.out(prog(lt, 0.1, 0.7)); ctx.globalAlpha = tp; f.lines.forEach((l, i) => ctx.fillText(l, W / 2, H * (land ? 0.2 : 0.12) + i * f.size * f.lh + (1 - tp) * 20 * u)); ctx.globalAlpha = 1;
    const n = items.length; const gap = 26 * u; const areaTop = H * (land ? 0.32 : 0.22); const areaH = H * (land ? 0.52 : 0.7);
    const cw = land ? (W * 0.86 - gap * (n - 1)) / n : W * 0.84; const ch = land ? Math.min(areaH, 340 * u) : Math.min(260 * u, (areaH - gap * (n - 1)) / n);
    items.forEach((it, i) => {
      const x = land ? W * 0.07 + i * (cw + gap) : W * 0.08; const y = land ? areaTop + (areaH - ch) / 2 : areaTop + i * (ch + gap);
      hit(S, "item", x, y, cw, ch, { i });
      const p = ease.out(prog(lt, 0.4 + i * 0.22, 0.7)); ctx.save(); ctx.globalAlpha = p; ctx.translate(0, (1 - p) * 50 * u);
      ctx.shadowColor = "rgba(0,0,0,.18)"; ctx.shadowBlur = 36 * u; ctx.shadowOffsetY = 14 * u; ctx.fillStyle = M.card; rr(ctx, x, y, cw, ch, 26 * u); ctx.fill(); ctx.shadowColor = "transparent";
      ctx.strokeStyle = M.dark ? "rgba(255,255,255,.12)" : "rgba(20,20,60,.08)"; ctx.lineWidth = 1.5; ctx.stroke();
      const ic = Math.min(70 * u, ch * 0.3); const g = ctx.createLinearGradient(x, y, x + ic, y + ic); g.addColorStop(0, M.accent); g.addColorStop(1, M.accent2); ctx.fillStyle = g; const ix = x + 28 * u, iy = y + 28 * u; rr(ctx, ix, iy, ic, ic, ic * 0.3); ctx.fill(); drawIcon(ctx, iconFor(it.title + " " + it.body, i), ix + ic / 2, iy + ic / 2, ic * 0.3, "#fff");
      ctx.fillStyle = M.cardText; ctx.textAlign = "left"; setFont(ctx, M, Math.min(44 * u, ch * 0.2), 800, SANS); const tfs = Math.min(44 * u, ch * 0.2), ty = iy + ic + tfs + 14 * u; const tl = wrap(ctx, it.title, cw - 56 * u).slice(0, 2); tl.forEach((l, k) => ctx.fillText(l, x + 28 * u, ty + k * tfs * 1.12));
      if (it.body) { setFont(ctx, M, Math.min(28 * u, ch * 0.13), 400, SANS); ctx.fillStyle = hexA(M.cardText, 0.65); wrap(ctx, it.body, cw - 56 * u).slice(0, land ? 4 : 2).forEach((l, k) => ctx.fillText(l, x + 28 * u, ty + (tl.length - 1) * tfs * 1.12 + 14 * u + Math.min(28 * u, ch * 0.13) * 1.2 + k * 36 * u)); }
      ctx.restore();
    });
  },
  saas_dashboard(S) {
    const { ctx, W, H, M, lt, u, scene, dur } = S; drawBg(S); const land = W >= H;
    if (scene.text) { setFont(ctx, M, 54 * u, 800, SANS); ctx.fillStyle = M.text; ctx.textAlign = "center"; const p = ease.out(prog(lt, 0.1, 0.6)); ctx.globalAlpha = p; ctx.fillText(scene.text, W / 2, H * 0.12 + (1 - p) * 16 * u); ctx.globalAlpha = 1; }
    const ww = land ? W * 0.76 : W * 0.9, wh = land ? H * 0.68 : H * 0.55, wx = (W - ww) / 2, wy = H * 0.19 + (land ? 0 : H * 0.06);
    hit(S, "window", wx, wy, ww, wh); hit(S, "text", W * 0.2, H * 0.04, W * 0.6, 100 * u);
    const e = ease.outExpo(prog(lt, 0.1, 1)); ctx.save(); ctx.translate(W / 2, wy + wh / 2); ctx.scale(lerp(0.82, 1, e), lerp(0.82, 1, e)); ctx.translate(-W / 2, -(wy + wh / 2)); ctx.globalAlpha = e;
    const info = drawWindow(S, wx, wy, ww, wh, lt); ctx.restore();
    const b = info.btn; const t0 = Math.min(2.2, dur * 0.55); const cp = ease.inOut(prog(lt, 0.9, t0 - 0.9)); const sx = wx + ww * 0.55, sy = wy + wh * 0.8, tx = b.x + b.w / 2, ty = b.y + b.h / 2;
    const click = lt > t0 ? clamp(1 - (lt - t0) / 0.25) : 0; if (lt > 0.6) { if (lt > t0) { const rp = prog(lt, t0, 0.7); ctx.strokeStyle = hexA(M.accent, 1 - rp); ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.arc(tx, ty, 10 * u + rp * 60 * u, 0, 7); ctx.stroke(); } drawCursor(S, lerp(sx, tx, cp), lerp(sy, ty, cp), click); }
  },
  saas_steps(S) {
    const { ctx, W, H, M, lt, u, scene } = S; drawBg(S); const land = W >= H;
    const items = (scene.items && scene.items.length ? scene.items : ["Sign up", "Connect your tools", "Watch it work"]).slice(0, 5).map(parseItem); const n = items.length;
    setFont(ctx, M, 66 * u, 800, SANS); ctx.fillStyle = M.text; ctx.textAlign = "center"; const tp = ease.out(prog(lt, 0.1, 0.6)); ctx.globalAlpha = tp; ctx.fillText(scene.text || "How it works", W / 2, H * (land ? 0.2 : 0.12)); ctx.globalAlpha = 1;
    const pos = (i) => land ? [W * 0.14 + (W * 0.72) * (n === 1 ? 0.5 : i / (n - 1)), H * 0.52] : [W * 0.2, H * 0.24 + (H * 0.62) * (n === 1 ? 0.5 : i / (n - 1))];
    const total = 0.5 + n * 0.55;
    for (let i = 0; i < n - 1; i++) { const a = pos(i), b = pos(i + 1); const p = ease.inOut(prog(lt, 0.5 + i * 0.55, 0.55)); ctx.strokeStyle = hexA(M.text, 0.15); ctx.lineWidth = 6 * u; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.strokeStyle = M.accent; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(lerp(a[0], b[0], p), lerp(a[1], b[1], p)); ctx.stroke(); }
    hit(S, "text", W * 0.2, H * (land ? 0.2 : 0.12) - 66 * u, W * 0.6, 90 * u);
    items.forEach((it, i) => { const [x, y] = pos(i); hit(S, "item", x - 60 * u, y - 60 * u, land ? (W * 0.72) / n : W * 0.6, 200 * u, { i }); const p = ease.back(prog(lt, 0.3 + i * 0.55, 0.5)); if (p <= 0) return; ctx.save(); ctx.translate(x, y); ctx.scale(p, p); const r = 54 * u; const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, M.accent); g.addColorStop(1, M.accent2); ctx.fillStyle = g; ctx.shadowColor = hexA(M.accent, 0.5); ctx.shadowBlur = 30 * u; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.shadowColor = "transparent"; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; setFont(ctx, M, 52 * u, 800, SANS); ctx.fillText(String(i + 1), 0, 3); ctx.textBaseline = "alphabetic";
      ctx.fillStyle = M.text; ctx.globalAlpha = clamp(p); if (land) { setFont(ctx, M, 38 * u, 700, SANS); wrap(ctx, it.title, (W * 0.72) / n).forEach((l, k) => ctx.fillText(l, 0, r + 54 * u + k * 44 * u)); if (it.body) { setFont(ctx, M, 26 * u, 400, SANS); ctx.fillStyle = hexA(M.text, 0.65); wrap(ctx, it.body, (W * 0.72) / n).slice(0, 3).forEach((l, k) => ctx.fillText(l, 0, r + 100 * u + k * 34 * u)); } } else { ctx.textAlign = "left"; setFont(ctx, M, 40 * u, 700, SANS); ctx.fillText(it.title, r + 28 * u, 0); if (it.body) { setFont(ctx, M, 28 * u, 400, SANS); ctx.fillStyle = hexA(M.text, 0.65); ctx.fillText(it.body, r + 28 * u, 40 * u); } } ctx.restore(); });
  },
  saas_cta(S) {
    const { ctx, W, H, M, lt, u, scene } = S; drawBg(S);
    const R = rng(scene.id + "dots"); for (let i = 0; i < 28; i++) { const x = R() * W, y0 = R() * H, sp = 14 + R() * 30, r = (2 + R() * 5) * u; const y = (y0 - lt * sp * u + H * 2) % H; ctx.fillStyle = hexA(i % 2 ? M.accent : M.accent2, 0.35); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    const f = fit(ctx, M, scene.text || "Start free today", W * 0.8, H * 0.32, 128 * u, 40 * u, 800, SANS, 1.08); ctx.fillStyle = M.text; ctx.textAlign = "center"; setFont(ctx, M, f.size, 800, SANS);
    const y = H * 0.4 - (f.lines.length - 1) * f.size * f.lh * 0.5; f.lines.forEach((l, i) => { const p = ease.out(prog(lt, 0.15 + i * 0.15, 0.7)); ctx.globalAlpha = p; ctx.fillText(l, W / 2, y + i * f.size * f.lh + (1 - p) * 30 * u); }); ctx.globalAlpha = 1;
    hit(S, "text", W * 0.1, y - f.size, W * 0.8, f.lines.length * f.size * f.lh);
    const label = (scene.items && scene.items[0]) || "Start free"; setFont(ctx, M, 76 * 0.42 * u, 700, SANS); const bw = ctx.measureText(label).width + 76 * u * 1.1; hit(S, "button", W / 2 - bw / 2, y + (f.lines.length - 1) * f.size * f.lh + 70 * u, bw, 76 * u, { i: 0 }); pill(S, label, W / 2 - bw / 2, y + (f.lines.length - 1) * f.size * f.lh + 70 * u, 76 * u, ease.back(prog(lt, 0.8, 0.5)), { pulse: Math.sin(lt * 4) * 0.5 + 0.5 });
    if (scene.sub) { hit(S, "sub", W * 0.3, y + (f.lines.length - 1) * f.size * f.lh + 180 * u, W * 0.4, 60 * u); const p = ease.out(prog(lt, 1.2, 0.6)); ctx.globalAlpha = p; setFont(ctx, M, 36 * u, 500, SANS); ctx.fillStyle = hexA(M.text, 0.75); ctx.fillText(scene.sub, W / 2, y + (f.lines.length - 1) * f.size * f.lh + 220 * u); ctx.globalAlpha = 1; }
  },
};

function overlayElements(S) {
  if (S.scene.type === "logos") return;
  const logos = (S.scene.elements || []).filter((e) => e.kind === "logo"); if (!logos.length || S.scene.type === "saas_hero") return;
  const { ctx, W, H, u, lt } = S; const sz = 120 * u;
  logos.slice(0, 3).forEach((e, i) => { const pos = e.pos || "top-right"; const m = 36 * u; const x = pos.includes("left") ? m + i * (sz + 16 * u) : W - m - sz - i * (sz + 16 * u); const y = pos.includes("bottom") ? H - m - sz : m; hit(S, "el", x, y, sz, sz, { idx: S.scene.elements.indexOf(e) }); const p = ease.back(prog(lt, 0.4 + i * 0.15, 0.5)); if (p <= 0) return; ctx.save(); ctx.translate(x + sz / 2, y + sz / 2); ctx.scale(p, p); ctx.globalAlpha = clamp(p * 2); drawEl(S, e, -sz / 2, -sz / 2, sz, sz); ctx.restore(); });
}

/** Remember where things were drawn so the pen can say "this one". */
function hit(S, role, x, y, w, h, extra) { const hs = S.res && S.res.hits; if (hs && w > 2 && h > 2) hs.push(Object.assign({ role, x, y, w, h, scene: S.scene.id }, extra || {})); }
function drawScene(ctx, W, H, project, scene, lt, res) {
  const M = moodOf(project, scene); const u = Math.min(W, H) / 1080;
  const S = { ctx, W, H, M, lt, u, dur: scene.dur, scene, project, res: res || {} };
  FIT_K = (scene.style && scene.style.scale) || 1;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic";
  (DRAW[scene.type] || DRAW.title)(S); overlayElements(S); finish(S); ctx.restore();
}

export function renderFrame(ctx, W, H, project, t, res = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  if (res.hits) res.hits.length = 0;
  const L = layout(project); if (!L.items.length) return;
  t = clamp(t, 0, Math.max(0, L.total - 1e-3));
  const act = L.items.filter((it) => t >= it.start && t < it.end);
  if (!act.length) return;
  if (act.length === 1) { const a = act[0]; drawScene(ctx, W, H, project, a.scene, t - a.start, res); return; }
  const a = act[0], b = act[act.length - 1]; const p = clamp((t - b.start) / Math.max(0.001, b.td)); const kind = b.scene.transition;
  drawScene(ctx, W, H, project, a.scene, t - a.start, res);
  ctx.save();
  if (kind === "fade") { ctx.globalAlpha = ease.inOut(p); }
  else if (kind === "slide") { ctx.translate((1 - ease.outExpo(p)) * W, 0); }
  else if (kind === "zoom") { const k = lerp(1.25, 1, ease.out(p)); ctx.globalAlpha = clamp(p * 1.6); ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.translate(-W / 2, -H / 2); }
  else if (kind === "wipe") { ctx.beginPath(); ctx.rect(0, 0, W * ease.inOut(p), H); ctx.clip(); }
  else if (kind === "dip") { if (p < 0.5) { ctx.restore(); ctx.save(); ctx.fillStyle = `rgba(0,0,0,${ease.inOut(p * 2)})`; ctx.fillRect(0, 0, W, H); ctx.restore(); return; } ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = ease.inOut((p - 0.5) * 2); }
  drawScene(ctx, W, H, project, b.scene, t - b.start, res);
  ctx.restore();
}

/** Load every picture a project uses. Returns {images:{src:Image}}. Failed ones are skipped (monogram/placeholder used). */
export async function loadImages(project, res = {}) {
  res.images = res.images || {}; const jobs = [];
  for (const s of project.scenes) for (const e of s.elements || []) {
    if (!e.src || res.images[e.src]) continue;
    jobs.push(new Promise((ok) => { const im = new Image(); im.onload = () => { res.images[e.src] = im; ok(); }; im.onerror = () => ok(); im.src = e.src; }));
  }
  await Promise.all(jobs); return res;
}
