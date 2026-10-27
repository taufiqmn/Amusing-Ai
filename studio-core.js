// Amusing Studio core: shared state, storage, undo, resources, audio and the play loop.
import { renderFrame, loadImages, layout, totalDuration, sizeFor, PRESETS } from "./engine.js";
import { DEFAULT_TASTE, parseTaste, uid } from "./director.js";
import { toWav } from "./audioedit.js";
import { decodeAudio } from "./audio.js";

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return m + ":" + String(Math.floor(s % 60)).padStart(2, "0"); };
export const errMsg = (e) => (e && e.message) || String(e);
export const slug = (s) => String(s || "video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "video";
export function toast(msg) { const t = $("toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 3200); }
export const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
export const lsRaw = (k, d = "") => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } };
export const lsSetRaw = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

/* ---------------- shared state ---------------- */
export const st = {
  project: null, sel: 0, t: 0, playing: false, mode: "simple",
  audio: null,                      // { buffer, duration, peaks, speech, name, blob, gain }
  tasteText: lsRaw("ts.taste", DEFAULT_TASTE), taste: null,
  settings: Object.assign({ pexelsKey: "", pixabayKey: "", ai: false }, lsGet("ts.settings", {})),
  res: { images: {}, videos: {}, preview: true, hits: [], makeCanvas: (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; } },
  media: new Map(),                 // mid -> Blob (user video clips)
  hooks: { renderAll() {}, renderPanel() {}, renderTimeline() {}, afterDraw() {} },
  ai: null,
};
st.taste = parseTaste(st.tasteText);
export const scenes = () => (st.project ? st.project.scenes : []);
export const sc = () => scenes()[st.sel] || null;
export const total = () => (st.project && st.project.scenes.length ? totalDuration(st.project) : 0);
export const saveSettings = () => lsSet("ts.settings", st.settings);

/* ---------------- IndexedDB ---------------- */
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((ok, no) => {
    if (!window.indexedDB) return no(new Error("no idb"));
    const r = indexedDB.open("amusing-studio", 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("projects", { keyPath: "id" }); d.createObjectStore("media", { keyPath: "mid" }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => { try { const d = await db(); return await new Promise((ok, no) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const q = fn(s); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); t.onabort = () => no(t.error); }); } catch (_) { return null; } };
export const idbPut = (store, v) => tx(store, "readwrite", (s) => s.put(v));
export const idbGet = (store, k) => tx(store, "readonly", (s) => s.get(k));
export const idbAll = (store) => tx(store, "readonly", (s) => s.getAll()).then((x) => x || []);
export const idbDel = (store, k) => tx(store, "readwrite", (s) => s.delete(k));

let saveTimer = null;
export function schedulePersist() { clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 800); }
export async function persistNow() {
  const p = st.project; if (!p || !p.scenes.length) return;
  p.updated = Date.now();
  let audioBlob = null; if (st.audio) audioBlob = st.audio.blob || (st.audio.buffer ? toWav(st.audio.buffer) : null);
  await idbPut("projects", { id: p.id, name: p.name || "Untitled", updated: p.updated, aspect: p.aspect, json: JSON.stringify(p), audio: audioBlob, audioName: st.audio && st.audio.name, audioGain: st.audio && st.audio.gain });
  st.hooks.projectsChanged && st.hooks.projectsChanged();
}

/* ---------------- undo / redo ---------------- */
const blobKeys = new Map(); const blobList = [];
const pack = (p) => JSON.stringify(p, (k, v) => { if (typeof v === "string" && v.length > 400 && (k === "src" || k === "orig")) { let i = blobKeys.get(v); if (i == null) { i = blobList.length; blobList.push(v); blobKeys.set(v, i); } return "@@" + i; } return v; });
const unpack = (s) => JSON.parse(s, (k, v) => (typeof v === "string" && v.startsWith("@@") ? blobList[+v.slice(2)] : v));
const hist = { stack: [], idx: -1 };
export function historyReset() { hist.stack = []; hist.idx = -1; blobKeys.clear(); blobList.length = 0; if (st.project) commit(); else updateHistButtons(); }
function updateHistButtons() { const u = $("undoBtn"), r = $("redoBtn"); if (u) u.disabled = hist.idx <= 0; if (r) r.disabled = hist.idx >= hist.stack.length - 1; }
export function commit() {
  if (!st.project) return; const s = pack(st.project); if (s === hist.stack[hist.idx]) return;
  hist.stack = hist.stack.slice(0, hist.idx + 1); hist.stack.push(s); if (hist.stack.length > 40) hist.stack.shift(); hist.idx = hist.stack.length - 1; updateHistButtons();
}
let commitTimer = null; export const scheduleCommit = () => { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 600); };
async function restore() { st.project = unpack(hist.stack[hist.idx]); if (st.sel >= st.project.scenes.length) st.sel = Math.max(0, st.project.scenes.length - 1); await loadResources(); st.hooks.renderAll(); updateHistButtons(); schedulePersist(); if (st.api && st.api.resolveAll) st.api.resolveAll(); }
export async function undo() { clearTimeout(commitTimer); commit(); if (hist.idx > 0) { hist.idx--; await restore(); } }
export async function redo() { if (hist.idx < hist.stack.length - 1) { hist.idx++; await restore(); } }

/** Call after any edit. */
export function changed({ timeline = true, panel = false, typing = false, replace = false } = {}) { fitAspect(); draw(); if (timeline) st.hooks.renderTimeline(); if (panel) st.hooks.renderPanel(); updateTransport(); schedulePersist(); if (replace) { if (hist.idx >= 0) hist.stack[hist.idx] = pack(st.project); } else if (typing) scheduleCommit(); else { clearTimeout(commitTimer); commit(); } }

/* ---------------- resources (pictures + video clips) ---------------- */
export async function loadResources() {
  if (!st.project) return;
  await loadImages(st.project, st.res);
  for (const s of st.project.scenes) for (const e of s.elements || []) {
    if (e.kind !== "video" || !e.mid || st.res.videos[e.mid]) continue;
    const blob = st.media.get(e.mid) || (await idbGet("media", e.mid) || {}).blob; if (!blob) { e.missing = true; continue; } e.missing = false; st.media.set(e.mid, blob);
    await makeVideo(e.mid, blob);
  }
  draw();
}
export function makeVideo(mid, blob) {
  return new Promise((ok) => {
    const v = document.createElement("video"); v.src = URL.createObjectURL(blob); v.preload = "auto"; v.playsInline = true; v.crossOrigin = "anonymous";
    const done = () => { v.onloadeddata = null; ok(v); }; v.onloadeddata = done; v.onerror = done; v.addEventListener("seeked", () => draw());
    st.res.videos[mid] = v; routeVideo(v, 1);
  });
}
export const videoEl = (e) => e && st.res.videos[e.mid];
/** Clips recorded in a browser often report an infinite length until you seek to the end. */
export async function fixDuration(v) {
  if (isFinite(v.duration) && v.duration > 0) return v.duration;
  await new Promise((ok) => { const t = setTimeout(ok, 2500); v.onseeked = () => { clearTimeout(t); ok(); }; v.currentTime = 1e7; });
  const d = v.duration; v.onseeked = null; v.currentTime = 0; await new Promise((ok) => setTimeout(ok, 50)); return d;
}

/* ---------------- audio engine ---------------- */
let actx = null, master = null, voiceGain = null, voiceSrc = null, expDest = null;
export function ensureAudio() {
  if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; actx = new C(); master = actx.createGain(); master.connect(actx.destination); voiceGain = actx.createGain(); voiceGain.connect(master); Object.keys(st.res.videos).forEach((k) => routeVideo(st.res.videos[k], 1)); }
  return actx;
}
const routed = new WeakMap();
function routeVideo(v, vol) {
  if (!actx || routed.has(v)) return;
  try { const src = actx.createMediaElementSource(v); const g = actx.createGain(); g.gain.value = vol; src.connect(g); g.connect(master); routed.set(v, g); } catch (_) {}
}
export function setClipVolume(mid, vol) { const v = st.res.videos[mid]; const g = v && routed.get(v); if (g) g.gain.value = vol; }
export function startVoice(t0) {
  stopVoice(); if (!st.audio || !st.audio.buffer || !ensureAudio()) return;
  if (t0 >= st.audio.duration) return;
  voiceSrc = actx.createBufferSource(); voiceSrc.buffer = st.audio.buffer; voiceGain.gain.value = st.audio.gain == null ? 1 : st.audio.gain; voiceSrc.connect(voiceGain); voiceSrc.start(0, Math.max(0, t0));
}
export function stopVoice() { if (voiceSrc) { try { voiceSrc.stop(); } catch (_) {} try { voiceSrc.disconnect(); } catch (_) {} voiceSrc = null; } }
export function exportTap() { ensureAudio(); if (!actx) return null; expDest = actx.createMediaStreamDestination(); master.connect(expDest); return expDest; }
export function exportUntap() { if (expDest && master) { try { master.disconnect(expDest); } catch (_) {} } expDest = null; }
export const audioContext = () => actx;

/** Keep clip volumes in sync with the elements. */
export function applyClipVolumes() { for (const s of scenes()) for (const e of s.elements || []) if (e.kind === "video") setClipVolume(e.mid, e.vol == null ? 1 : e.vol); }

/** Make each video clip show the right frame for time t. */
export function syncVideos(t, playing) {
  if (!st.project) return; const L = layout(st.project);
  for (const it of L.items) {
    const el = (it.scene.elements || []).find((e) => e.kind === "video"); const v = el && st.res.videos[el.mid]; if (!v || v.readyState < 1) continue;
    const lt = t - it.start; const active = lt >= -0.02 && lt < it.scene.dur; const inn = el.trimIn || 0; const out = el.trimOut || v.duration || inn + it.scene.dur;
    if (!active) { if (!v.paused) v.pause(); continue; }
    const target = Math.min(Math.max(inn, inn + Math.max(0, lt)), Math.max(inn, out - 0.05)); setClipVolume(el.mid, el.vol == null ? 1 : el.vol);
    if (playing) { if (Math.abs(v.currentTime - target) > 0.35) v.currentTime = target; if (v.paused && lt < it.scene.dur && target < out - 0.06) v.play().catch(() => {}); if (target >= out - 0.06 && !v.paused) v.pause(); }
    else { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - target) > 0.04) v.currentTime = target; }
  }
}

/* ---------------- canvas + transport ---------------- */
const cv = () => $("cv");
export function fitAspect() {
  if (!st.project || !cv()) return; const [w, h] = sizeFor(st.project.aspect, 720); const c = cv();
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; st.hooks.placePen && st.hooks.placePen(); }
}
export function draw() {
  const c = cv(); if (!c) return; const g = c.getContext("2d"); const wrap = $("cvWrap");
  const has = !!(st.project && st.project.scenes.length); wrap.classList.toggle("has", has);
  if (!has) { g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height); return; }
  st.res.preview = !st.playing || true; renderFrame(g, c.width, c.height, st.project, st.t, st.res); st.hooks.afterDraw();
}
export function updateTransport() {
  const T = total(); $("timeText").textContent = fmt(st.t) + " / " + fmt(T);
  $("scrub").value = T ? Math.round((st.t / T) * 1000) : 0; $("scrub").disabled = !T; $("playBtn").disabled = !T; $("penBtn").disabled = !T; $("exportBtn").disabled = !T;
  const ph = $("playhead"); if (ph) { ph.style.left = st.t * pps() + "px"; }
  $("playIcon").innerHTML = st.playing ? '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
}
export const pps = () => st.zoom || 60;
let raf = 0, startAt = 0;
export function play() {
  const T = total(); if (!T) return; if (st.t >= T - 0.05) st.t = 0; ensureAudio(); if (actx && actx.state === "suspended") actx.resume();
  applyClipVolumes(); st.playing = true; startAt = performance.now() - st.t * 1000; startVoice(st.t); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); updateTransport();
}
function loop() {
  if (!st.playing) return; const T = total(); st.t = (performance.now() - startAt) / 1000;
  if (st.t >= T) { st.t = T; pause(); st.t = Math.max(0, T - 0.001); draw(); updateTransport(); return; }
  syncVideos(st.t, true); draw(); updateTransport(); followPlayhead(); raf = requestAnimationFrame(loop);
}
export function pause() { st.playing = false; cancelAnimationFrame(raf); stopVoice(); syncVideos(st.t, false); updateTransport(); }
export function seek(t, { keepPlaying = true } = {}) {
  if (!keepPlaying && st.playing) pause();
  const T = total(); st.t = Math.min(Math.max(0, t), Math.max(0, T - 0.001));
  if (st.playing && keepPlaying) { startAt = performance.now() - st.t * 1000; startVoice(st.t); } else syncVideos(st.t, false);
  draw(); updateTransport();
}
function followPlayhead() { const sc2 = $("tlScroll"); if (!sc2) return; const x = st.t * pps(); if (x > sc2.scrollLeft + sc2.clientWidth - 40 || x < sc2.scrollLeft) sc2.scrollLeft = Math.max(0, x - 80); }
export const activeIndex = () => { if (!st.project) return 0; const L = layout(st.project); let k = 0; L.items.forEach((it, i) => { if (st.t >= it.start - 1e-6) k = i; }); return k; };

/* ---------------- loading a voiceover ---------------- */
export async function loadAudioFile(file) {
  const a = await decodeAudio(file); a.name = file.name || "voiceover"; a.blob = file; a.gain = 1; return a;
}
export { PRESETS, uid };
