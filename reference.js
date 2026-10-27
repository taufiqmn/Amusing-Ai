// Learn the look of a reference picture or video: colours, brightness, aspect ratio and (for video) how fast the cuts are.
// It does not copy the edit. It gives the Studio a palette and a pace to start from.

const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const hex = ([r, g, b]) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Pure: pixels is RGBA Uint8ClampedArray. */
export function palette(pixels, k = 5) {
  const buckets = new Map(); let L = 0, n = 0;
  for (let i = 0; i < pixels.length; i += 4) { if (pixels[i + 3] < 200) continue; const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]; const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); const e = buckets.get(key) || [0, 0, 0, 0]; e[0] += r; e[1] += g; e[2] += b; e[3]++; buckets.set(key, e); L += lum([r, g, b]); n++; }
  const all = [...buckets.values()].map((e) => ({ c: [e[0] / e[3], e[1] / e[3], e[2] / e[3]], n: e[3] })).sort((a, b) => b.n - a.n);
  const out = []; for (const e of all) { if (out.every((o) => dist(o.c, e.c) > 55)) out.push(e); if (out.length >= k) break; }
  return { colors: out.map((o) => o.c), avgLum: n ? L / n : 0.5 };
}

/** Pure: turn a palette into a mood the renderer understands. */
export function moodFromPalette({ colors, avgLum }) {
  const dark = avgLum < 0.55; const cs = colors.length ? colors : [[20, 20, 30]];
  const byLum = [...cs].sort((a, b) => lum(a) - lum(b)); const bySat = [...cs].sort((a, b) => sat(b) * (0.3 + lum(b)) - sat(a) * (0.3 + lum(a)));
  const accent = bySat[0], accent2 = bySat[1] || bySat[0];
  const base = [byLum[0], byLum[Math.floor(byLum.length / 2)], byLum[byLum.length - 1]];
  const bg = dark ? base.map((c) => hex(mix(c, [8, 8, 14], 0.62))) : base.map((c) => hex(mix(c, [255, 255, 255], 0.82)));
  return { name: "From reference", dark, bg, text: dark ? "#f5f2ea" : "#111111", accent: hex(accent), accent2: hex(accent2), card: dark ? "rgba(255,255,255,.08)" : "#ffffff", cardText: dark ? "#f5f2ea" : "#111111", letterbox: false, grain: 0.03, vignette: dark ? 0.3 : 0, tint: null, speed: 1, track: -0.01, weight: 700 };
}
export function paceFromShotLength(avg) { return avg < 2.5 ? "fast" : avg < 5 ? "medium" : "slow"; }
export function nearestAspect(w, h) { const r = w / h; return r > 1.3 ? "16:9" : r < 0.75 ? "9:16" : "1:1"; }

function pixelsOf(source, w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(source, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; }

export async function analyzeReference(file) {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Could not read that picture.")); i.src = url; });
      const pal = palette(pixelsOf(img, 64, 64)); return { kind: "image", aspect: nearestAspect(img.naturalWidth, img.naturalHeight), mood: moodFromPalette(pal), colors: pal.colors.map(hex), pace: null };
    }
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.src = url; v.playsInline = true;
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error("This browser could not open that video. Try an MP4 or WebM.")); });
      const dur = v.duration; if (!isFinite(dur) || dur <= 0) throw new Error("Could not read the video length.");
      const N = Math.min(40, Math.max(8, Math.round(dur))); const frames = []; let all = [];
      for (let i = 0; i < N; i++) {
        v.currentTime = Math.min(dur - 0.05, (i + 0.5) * (dur / N)); await new Promise((ok) => { const t = setTimeout(ok, 1500); v.onseeked = () => { clearTimeout(t); ok(); }; });
        const px = pixelsOf(v, 32, 18); frames.push(px); if (i % 3 === 0) all = all.concat([...pixelsOf(v, 24, 24)].slice(0));
      }
      let cuts = 0; for (let i = 1; i < frames.length; i++) { let d = 0; for (let j = 0; j < frames[i].length; j += 4) d += Math.abs(frames[i][j] - frames[i - 1][j]) + Math.abs(frames[i][j + 1] - frames[i - 1][j + 1]) + Math.abs(frames[i][j + 2] - frames[i - 1][j + 2]); d /= (frames[i].length / 4) * 3 * 255; if (d > 0.16) cuts++; }
      const avgShot = dur / (cuts + 1); const pal = palette(Uint8ClampedArray.from(all));
      return { kind: "video", aspect: nearestAspect(v.videoWidth, v.videoHeight), duration: dur, avgShot, pace: paceFromShotLength(avgShot), mood: moodFromPalette(pal), colors: pal.colors.map(hex), note: `About ${cuts + 1} shots in ${Math.round(dur)}s (checked ${N} moments, so quick cuts can be missed).` };
    }
    throw new Error("Use a picture or a video as the reference.");
  } finally { URL.revokeObjectURL(url); }
}
