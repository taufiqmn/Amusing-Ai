// Amusing Studio: screen wiring (timeline, scene panel, simple mode, pen, projects).
import * as C from "./studio-core.js";
import { MOODS, PRESETS, TRANSITIONS, layout, totalDuration } from "./engine.js";
import { applyInstruction, storyboardFromPrompt, fitToDuration, lengthsFromSegments, sceneLen, uid, detectKind, aiStoryboardPrompt, sanitizeScenes } from "./director.js";
import { fetchLogo, searchPhotos, pickPhoto, importImageUrl, fileToElement } from "./assets.js";
import { analyzeReference } from "./reference.js";
import { penEdit, pickTarget, ROLE_NAMES } from "./pen.js";
import { FILTERS, adjustDataURL } from "./imageops.js";
import { initExtras } from "./studio-extra.js";

const { st, $, esc, fmt, toast, errMsg, sc, scenes } = C;

/* ---------------- small helpers ---------------- */
const deb = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const DEFAULTS = {
  title: { text: "Your title" }, kinetic: { text: "Say it with *motion*" }, quote: { text: "A line worth remembering", sub: "Someone wise" },
  stat: { text: "", stat: { value: 50, suffix: "%", prefix: "", label: "faster" } }, lower: { text: "Your name", sub: "Your role" }, image: { text: "A short caption" },
  logos: { text: "Trusted by teams everywhere" }, footage: { text: "" },
  saas_hero: { text: "Meet your product", sub: "One line about what it does", items: ["Get started free"] },
  saas_features: { text: "Why people love it", items: ["Fast: Done in seconds", "Secure: Your data stays yours", "Simple: Set up in minutes"] },
  saas_dashboard: { text: "See it in action" }, saas_steps: { text: "How it works", items: ["Sign up: Free in 30 seconds", "Connect: Bring your tools", "Go: Watch it work"] },
  saas_cta: { text: "Start free today", sub: "yourproduct.com", items: ["Start free"] },
};
const EXAMPLES = [
  "A promo for my app Flowly, a task manager that saves teams 5 hours a week. Features: boards, time tracking and chat. Works with Slack and Notion logos.",
  "A cinematic film about a lone traveler crossing the desert. The sun rises slowly. Silence is her only guide. She keeps walking.",
  "3 facts about sleep that will surprise you. You dream every night. Your brain cleans itself while you sleep. Naps under 20 minutes help.",
];

function ensureProject() {
  if (!st.project) {
    st.project = { id: uid(), name: "", aspect: $("aspect").value, mood: st.taste.mood, letterbox: st.taste.letterbox, scenes: [], created: Date.now(), updated: Date.now() };
    C.historyReset();
  }
  return st.project;
}
const blank = () => ({ id: uid(), elements: [], text: "", sub: "", items: [] });

/* ---------------- render everything ---------------- */
function renderAll() {
  C.fitAspect(); setProjectUI(); renderTimeline(); renderPanel(); C.draw(); C.updateTransport(); placePen();
}
function setProjectUI() {
  const P = st.project, has = !!(P && P.scenes.length);
  $("pname").value = P ? P.name || "" : ""; if (P) $("aspect").value = P.aspect;
  $("toAdv").hidden = !has; $("splitBtn").hidden = !st.audio; $("voiceBtn").textContent = st.audio ? "Voiceover" : "Add voiceover";
  $("audioNote").textContent = st.audio ? `${st.audio.name} · ${C.fmt(st.audio.duration)} · ${st.audio.speech.length} spoken parts` : "Optional. I match the scene lengths to your voice.";
  const looks = [["auto", st.ref ? "From my reference" : "Let the Studio choose"], ...Object.entries(MOODS).map(([k, m]) => [k, m.name])];
  const cur = $("look").value; $("look").innerHTML = looks.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join(""); $("look").value = looks.some(([k]) => k === cur) ? cur : "auto";
}
function setMode(m) {
  st.mode = m; $("studio").dataset.mode = m; $("simplePanel").hidden = m !== "simple"; $("scenePanel").hidden = m !== "adv";
  $("modeSimple").classList.toggle("on", m === "simple"); $("modeAdv").classList.toggle("on", m === "adv"); setTimeout(() => { placePen(); renderTimeline(); }, 30);
  if (m === "adv") renderPanel();
}

/* ---------------- timeline ---------------- */
function renderTimeline() {
  const P = st.project, lanes = $("lanes"), ruler = $("ruler"), inner = $("tlInner"), wave = $("wave");
  if (!P || !P.scenes.length) { lanes.innerHTML = '<div class="small" style="padding:16px">No scenes yet. Use + Add scene, or switch to Simple and describe your video.</div>'; ruler.innerHTML = ""; wave.hidden = true; inner.style.width = "100%"; return; }
  const L = layout(P), k = C.pps(), T = L.total; inner.style.width = Math.max(T * k + 60, $("tlScroll").clientWidth - 2) + "px";
  const step = k >= 120 ? 1 : k >= 60 ? 2 : k >= 30 ? 5 : 10; let rh = ""; for (let s = 0; s <= T + step; s += step) rh += `<i style="left:${s * k}px">${fmt(s)}</i>`; ruler.innerHTML = rh;
  lanes.innerHTML = L.items.map((it, i) => {
    const s = it.scene, p = PRESETS[s.type] || PRESETS.title; const w = Math.max(30, s.dur * k - 3); const txt = (s.text || s.sub || (s.items && s.items[0]) || "").replace(/\*/g, "");
    return `<div class="blk ${p.group === "SaaS" ? "saas" : ""} ${i === st.sel ? "sel" : ""}" data-i="${i}" style="left:${it.start * k}px;width:${w}px;top:${(i % 2) * 48}px" title="${esc(p.name)}: ${esc(txt)}${i && s.transition !== "cut" ? " (" + esc(TRANSITIONS[s.transition] || "") + " in)" : ""}"><b>${i && s.transition !== "cut" ? "\u25C6 " : ""}${i + 1}. ${esc(p.name)}</b><span>${esc(txt)}</span><i class="rz" data-rz="${i}"></i></div>`;
  }).join("");
  if (st.audio) {
    const wv = wave; wv.hidden = false; const W = Math.max(40, Math.round(st.audio.duration * k)); wv.width = W; wv.style.width = W + "px"; const g = wv.getContext("2d"); g.clearRect(0, 0, W, wv.height);
    g.fillStyle = "rgba(94,234,160,.16)"; st.audio.speech.forEach((s) => g.fillRect(s.start * k, 0, (s.end - s.start) * k, wv.height));
    const pk = st.audio.peaks, n = pk.length; g.fillStyle = "rgba(122,162,255,.85)"; const mid = wv.height / 2;
    for (let x = 0; x < W; x += 2) { const v = pk[Math.min(n - 1, Math.floor((x / W) * n))] || 0; const h = Math.max(1, v * (wv.height - 6)); g.fillRect(x, mid - h / 2, 1.4, h); }
  } else wave.hidden = true;
  C.updateTransport();
}
function selectScene(i, { seekTo = true } = {}) {
  st.sel = Math.max(0, Math.min(scenes().length - 1, i)); renderTimeline(); renderPanel();
  if (seekTo && st.project) { const L = layout(st.project); if (!st.playing) C.seek(L.items[st.sel].start + 0.05); }
}
$("lanes").addEventListener("pointerdown", (e) => {
  const rz = e.target.closest("[data-rz]"), blk = e.target.closest(".blk"); if (!blk) return; const i = +blk.dataset.i;
  if (rz) {
    e.preventDefault(); const s = scenes()[i], x0 = e.clientX, d0 = s.dur; const mv = (ev) => { s.dur = Math.min(30, Math.max(1.2, d0 + (ev.clientX - x0) / C.pps())); renderTimeline(); C.draw(); renderPanelLength(); };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); C.changed(); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); return;
  }
  selectScene(i);
});
$("ruler").addEventListener("pointerdown", (e) => {
  const r = $("ruler"); const at = (ev) => { const b = r.getBoundingClientRect(); C.seek((ev.clientX - b.left) / C.pps()); }; at(e);
  const mv = (ev) => { at(ev); const k = C.activeIndex(); if (k !== st.sel && !st.playing) { st.sel = k; renderPanel(); renderTimeline(); } }; const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
});
$("zoomIn").onclick = () => { st.zoom = Math.min(220, C.pps() * 1.4); renderTimeline(); };
$("zoomOut").onclick = () => { st.zoom = Math.max(14, C.pps() / 1.4); renderTimeline(); };

/* ---------------- scene panel ---------------- */
function fillSelects() {
  $("fType").innerHTML = ["Story", "SaaS"].map((g) => `<optgroup label="${g === "SaaS" ? "SaaS animation" : "Cinematic and story"}">${Object.entries(PRESETS).filter(([, p]) => p.group === g).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join("")}</optgroup>`).join("");
  $("fTrans").innerHTML = Object.entries(TRANSITIONS).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
  $("addType").innerHTML = '<option value="">+ Add scene</option>' + Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join("") ;
  $("adjFilter").innerHTML = Object.entries(FILTERS).map(([k, f]) => `<option value="${k}">${esc(f.name)}</option>`).join("");
}
function renderPanelLength() { const s = sc(); if (!s) return; $("fDur").value = s.dur; $("durText").textContent = s.dur.toFixed(1) + "s"; }
function renderPanel() {
  const s = sc(), n = scenes().length; const dis = !s;
  $("scenePanel").querySelectorAll("input,textarea,select,button").forEach((x) => { if (!/^(spPrev|spNext)$/.test(x.id)) x.disabled = dis; });
  $("spTitle").textContent = s ? `Scene ${st.sel + 1} of ${n}` : "No scene yet";
  if (!s) { $("elemList").innerHTML = ""; $("understood").innerHTML = '<div class="tip">Add a scene from the timeline, or describe your video in Simple mode.</div>'; $("adjBox").hidden = true; return; }
  const p = PRESETS[s.type] || PRESETS.title; $("typeHint").textContent = p.hint || "";
  document.querySelectorAll("[data-f]").forEach((el) => (el.hidden = !p.fields.includes(el.dataset.f)));
  $("instr").value = s.instruction || ""; $("fText").value = s.text || ""; $("fSub").value = s.sub || ""; $("fItems").value = (s.items || []).join("\n");
  const stt = s.stat || {}; $("fStatV").value = stt.value == null ? "" : stt.value; $("fStatS").value = stt.suffix || ""; $("fStatL").value = stt.label || "";
  $("fType").value = s.type; $("fTrans").value = s.transition || "cut"; $("fTrans").disabled = st.sel === 0;
  const moods = [["", "Same as the video"], ...Object.entries(MOODS).map(([k, m]) => [k, m.name])]; if (st.project.customMood) moods.push(["custom", "From my reference"]);
  $("fMood").innerHTML = moods.map(([k, n2]) => `<option value="${k}">${esc(n2)}</option>`).join(""); $("fMood").value = s.mood || ""; renderPanelLength();
  renderElements(); renderAdj();
}
const busyEls = new WeakSet(); let selEl = -1;
function renderElements() {
  const s = sc(); if (!s) return; const els = s.elements || [];
  $("elemList").innerHTML = els.length ? els.map((e, i) => {
    const th = e.kind === "video" ? `<div class="th" style="background:#334">&#9654;</div>` : e.src ? `<div class="th ${e.kind === "image" ? "photo" : ""}" style="background-image:url('${e.src.replace(/'/g, "%27")}')"></div>` : `<div class="th" style="background:${e.color || "#667"}">${esc(e.mono || (e.name || "?").slice(0, 2).toUpperCase())}</div>`;
    const status = busyEls.has(e) ? "Searching..." : e.missing ? '<span class="err">Clip not on this device. Add it again.</span>' : e.kind === "video" ? "Your video clip" : e.status === "ok" ? (e.own ? "Your file" : "Ready" + (e.credit ? " (credit saved)" : "")) : e.status === "mono" ? "Not found, using a letter badge" : e.status === "none" ? '<span class="err">No photo found. Try other words or upload your own.</span>' : "Waiting...";
    const label = e.kind === "logo" ? `Logo: ${e.name}` : e.kind === "video" ? `Clip: ${e.name}` : `Photo: ${e.query || e.name || "your photo"}`;
    return `<div class="el ${i === selEl ? "sel" : ""}" data-i="${i}">${th}<div class="meta"><b>${esc(label)}</b><span>${status}</span></div>${e.kind !== "logo" ? `<button data-edit="${i}">Edit</button>` : ""}<button data-del="${i}" aria-label="Remove">&times;</button></div>`;
  }).join("") : '<div class="hint">None yet. Type something like "add Stripe logo" or "photo of a rainy street" above, or upload your own.</div>';
  const cur = els[selEl]; $("cands").innerHTML = cur && cur.cands && cur.kind === "image" ? cur.cands.map((c, i) => `<button data-cand="${i}" style="background-image:url('${esc(c.thumb)}')" title="${esc(c.title)}"><small>${esc(c.source)}</small></button>`).join("") : "";
}
$("elemList").addEventListener("click", (e) => {
  const d = e.target.closest("[data-del]"), ed = e.target.closest("[data-edit]"), s = sc(); if (!s) return;
  if (d) { s.elements.splice(+d.dataset.del, 1); selEl = -1; C.loadResources(); C.changed({ panel: true }); }
  else if (ed) { selEl = +ed.dataset.edit; renderElements(); renderAdj(); }
});
$("cands").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-cand]"), s = sc(); const el = s && s.elements[selEl]; if (!b || !el) return; const c = el.cands[+b.dataset.cand];
  try { $("photoNote").textContent = "Downloading..."; el.src = await importImageUrl(c.full); el.credit = c.credit; el.status = "ok"; delete el.orig; delete el.adj; $("photoNote").textContent = ""; await C.loadResources(); C.changed({ panel: true }); }
  catch (_) { try { el.src = await importImageUrl(c.thumb); el.credit = c.credit; el.status = "ok"; await C.loadResources(); C.changed({ panel: true }); $("photoNote").textContent = ""; } catch (e2) { $("photoNote").textContent = "That one could not be downloaded. Pick another."; } }
});

async function resolvePending(s) {
  const opts = () => ({ pexelsKey: st.settings.pexelsKey, pixabayKey: st.settings.pixabayKey });
  for (const e of s.elements || []) {
    if (e.status !== "pending" || busyEls.has(e)) continue; busyEls.add(e); if (sc() === s) renderElements();
    try {
      if (e.kind === "logo") { const r = await fetchLogo(e.name); Object.assign(e, { src: r.src, mono: r.mono, color: r.color, credit: r.credit, status: r.ok ? "ok" : "mono" }); }
      else if (e.kind === "image") {
        const { results } = await searchPhotos(e.query || e.name, opts()); e.cands = results.slice(0, 12).map((c) => ({ thumb: c.thumb, full: c.full, credit: c.credit, title: c.title, source: c.source }));
        const p = results.length ? await pickPhoto(results) : { ok: false }; if (p.ok) { e.src = p.src; e.credit = p.cand.credit; e.status = "ok"; } else e.status = "none";
      }
    } catch (_) { e.status = e.kind === "logo" ? "mono" : "none"; }
    busyEls.delete(e);
  }
  await C.loadResources(); if (sc() === s) renderElements(); C.changed({ timeline: false, replace: true });
}
const resolveAll = () => scenes().forEach((s) => resolvePending(s));

function afterEdit(s, { panel = true } = {}) { if (s) resolvePending(s); C.loadResources(); C.changed({ panel, typing: true }); }
const onInstr = deb(() => {
  const s = sc(); if (!s) return; const text = $("instr").value; const r = applyInstruction(s, text);
  $("understood").innerHTML = r.notes.length ? r.notes.map((n) => `<span class="u ok">${esc(n)}</span>`).join("") : text.trim() ? '<div class="tip">I did not recognise a command. Try: "neon mood", "4 seconds", "add Stripe logo", "photo of a rainy street", or put the headline in quotes.</div>' : "";
  const keep = $("instr").selectionStart; renderPanel(); $("instr").value = text; try { $("instr").setSelectionRange(keep, keep); } catch (_) {}
  afterEdit(s, { panel: false });
}, 450);
$("instr").addEventListener("input", onInstr);
for (const [id, fn] of [["fText", (s, v) => (s.text = v)], ["fSub", (s, v) => (s.sub = v)], ["fItems", (s, v) => (s.items = v.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6))]]) {
  $(id).addEventListener("input", () => { const s = sc(); if (!s) return; fn(s, $(id).value); C.changed({ typing: true }); });
}
for (const id of ["fStatV", "fStatS", "fStatL"]) $(id).addEventListener("input", () => { const s = sc(); if (!s) return; s.stat = { value: parseFloat($("fStatV").value) || 0, suffix: $("fStatS").value, prefix: "", label: $("fStatL").value }; C.changed({ typing: true }); });
$("fType").onchange = () => { const s = sc(); if (!s) return; s.type = $("fType").value; if (s.type === "logos" && !s.text) s.text = "Trusted by teams everywhere"; C.changed({ panel: true }); };
$("fMood").onchange = () => { const s = sc(); if (!s) return; if ($("fMood").value) s.mood = $("fMood").value; else delete s.mood; C.changed({ panel: true }); };
$("moodAll").onclick = () => { const s = sc(); if (!s) return; const m = s.mood || st.project.mood; st.project.mood = m; scenes().forEach((x) => delete x.mood); C.changed({ panel: true }); toast("Mood applied to every scene"); };
$("fTrans").onchange = () => { const s = sc(); if (!s) return; s.transition = $("fTrans").value; C.changed(); C.seek(layout(st.project).items[st.sel].start + 0.05); };
$("fDur").oninput = () => { const s = sc(); if (!s) return; s.dur = parseFloat($("fDur").value); $("durText").textContent = s.dur.toFixed(1) + "s"; C.changed({ typing: true }); };
$("spPrev").onclick = () => selectScene(st.sel - 1); $("spNext").onclick = () => selectScene(st.sel + 1);
const move = (d) => { const a = scenes(), i = st.sel, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; if (a[0].transition !== "cut") a[0].transition = "cut"; st.sel = j; C.changed({ panel: true }); };
$("spLeft").onclick = () => move(-1); $("spRight").onclick = () => move(1);
$("spDup").onclick = () => { const s = sc(); if (!s) return; const c = JSON.parse(JSON.stringify(s)); c.id = uid(); scenes().splice(st.sel + 1, 0, c); st.sel++; C.changed({ panel: true }); };
$("spDel").onclick = () => { if (!sc() || !confirm("Delete this scene?")) return; scenes().splice(st.sel, 1); st.sel = Math.max(0, Math.min(st.sel, scenes().length - 1)); if (scenes()[0]) scenes()[0].transition = "cut"; C.seek(Math.min(st.t, C.total())); C.changed({ panel: true }); };

function addScene(type, extra = {}) {
  const P = ensureProject(); const s = Object.assign(blank(), { type, dur: sceneLen(type, st.taste), transition: P.scenes.length ? st.taste.transition : "cut" }, JSON.parse(JSON.stringify(DEFAULTS[type] || {})), extra);
  const at = P.scenes.length ? st.sel + 1 : 0; P.scenes.splice(at, 0, s); st.sel = at; if (!P.name) P.name = "My video";
  setMode("adv"); C.loadResources().then(() => { C.changed({ panel: true }); setProjectUI(); C.seek(layout(P).items[at].start + 0.05); });
}
$("addType").onchange = () => { const v = $("addType").value; $("addType").value = ""; if (!v) return; if (v === "footage") $("videoFile").click(); else addScene(v); };

/* ---------------- uploads: logo, photo, video clip ---------------- */
const pick = (inputId) => new Promise((ok) => { const i = $(inputId); i.onchange = () => { const f = i.files[0]; i.value = ""; ok(f || null); }; i.click(); });
$("addLogo").onclick = async () => { const s = sc(); if (!s) return; const f = await pick("logoFile"); if (!f) return; try { const e = await fileToElement(f, "logo"); e.pos = "top-right"; s.elements.push(e); await C.loadResources(); C.changed({ panel: true }); } catch (x) { toast(errMsg(x)); } };
$("addPhoto").onclick = async () => { const s = sc(); if (!s) return; const f = await pick("photoFile"); if (!f) return; try { const e = await fileToElement(f, "image"); e.role = "bg"; s.elements = s.elements.filter((x) => x.kind !== "image"); s.elements.push(e); selEl = s.elements.length - 1; await C.loadResources(); C.changed({ panel: true }); } catch (x) { toast(errMsg(x)); } };
$("photoGo").onclick = async () => {
  const s = sc(), q = $("photoQ").value.trim(); if (!s || !q) return; $("photoNote").textContent = "Searching free photos...";
  s.elements = s.elements.filter((x) => !(x.kind === "image" && x.status !== "ok")); const e = { kind: "image", role: "bg", query: q, name: q, auto: false, status: "pending", src: "" }; s.elements.push(e); selEl = s.elements.length - 1; renderElements();
  await resolvePending(s); $("photoNote").textContent = e.status === "none" ? "Nothing came back. Check your connection or add a free Pexels/Pixabay key in Settings." : "Pick another from the thumbnails if you like."; renderElements();
};
async function addVideoClip(file) {
  if (!file.type.startsWith("video/")) return toast("Pick a video file.");
  if (file.size > 600e6) toast("That is a big file. It may be slow on this device.");
  const mid = "m" + uid(); st.media.set(mid, file); await C.idbPut("media", { mid, blob: file }); const v = await C.makeVideo(mid, file);
  await C.fixDuration(v);
  if (!isFinite(v.duration) || !v.videoWidth) { toast("This browser could not open that video. Try MP4 (H.264) or WebM."); return; }
  const dur = v.duration, out = Math.min(dur, 30); const el = { kind: "video", mid, name: file.name.replace(/\.\w+$/, ""), trimIn: 0, trimOut: +out.toFixed(2), vol: 1, dur: +dur.toFixed(2), status: "ok", own: true };
  const cur = sc();
  if (cur && cur.type === "footage" && !(cur.elements || []).some((e) => e.kind === "video")) { cur.elements.push(el); cur.dur = Math.max(1.2, out); C.loadResources().then(() => { C.changed({ panel: true }); }); }
  else addScene("footage", { elements: [el], dur: Math.max(1.2, out) });
  C.applyClipVolumes(); if (dur > 30) toast("Using the first 30 seconds. Change the start and end in Edit.");
}
$("videoFile").onchange = () => { const f = $("videoFile").files[0]; $("videoFile").value = ""; if (f) addVideoClip(f); };

/* ---------------- photo and clip tools ---------------- */
function renderAdj() {
  const s = sc(), e = s && s.elements[selEl]; const box = $("adjBox"); if (!e || (e.kind !== "image" && e.kind !== "video")) { box.hidden = true; return; }
  box.hidden = false; box.open = true; const vid = e.kind === "video"; $("adjTitle").textContent = vid ? "Video clip tools" : "Photo tools";
  box.querySelectorAll('[data-adj="photo"]').forEach((x) => (x.hidden = vid)); box.querySelectorAll('[data-adj="video"]').forEach((x) => (x.hidden = !vid)); $("adjFilter").closest(".field").hidden = vid;
  const a = e.adj || {}; $("adjFilter").value = e.filter || "none"; for (const [id, k] of [["adjBright", "bright"], ["adjContrast", "contrast"], ["adjSat", "sat"], ["adjWarm", "warm"]]) { $(id).value = a[k] || 0; $(id + "T").textContent = a[k] || 0; }
  $("adjFx").value = e.fx || 0; $("adjFy").value = e.fy || 0; $("adjZoom").value = e.zoom || 1; $("adjZoomT").textContent = (e.zoom || 1).toFixed(2) + "x";
  if (vid) { $("vidIn").value = e.trimIn || 0; $("vidOut").value = e.trimOut || e.dur || 0; $("vidVol").value = e.vol == null ? 1 : e.vol; $("vidVolT").textContent = Math.round((e.vol == null ? 1 : e.vol) * 100) + "%"; }
}
const curEl = () => { const s = sc(); return s && s.elements[selEl]; };
const reAdjust = deb(async () => {
  const e = curEl(); if (!e || e.kind !== "image" || !e.src) return; const a = Object.assign({}, e.adj);
  const none = !a.bright && !a.contrast && !a.sat && !a.warm && !a.gray && !a.fade; if (!e.orig && none) return; if (!e.orig) e.orig = e.src;
  try { e.src = none ? e.orig : await adjustDataURL(e.orig, a); if (none) delete e.orig; await C.loadResources(); C.changed(); renderElements(); } catch (x) { toast(errMsg(x)); }
}, 200);
$("adjFilter").onchange = () => { const e = curEl(); if (!e) return; e.filter = $("adjFilter").value; e.adj = Object.assign({}, FILTERS[e.filter]); delete e.adj.name; renderAdj(); reAdjust(); };
for (const [id, k] of [["adjBright", "bright"], ["adjContrast", "contrast"], ["adjSat", "sat"], ["adjWarm", "warm"]]) $(id).addEventListener("input", () => { const e = curEl(); if (!e) return; e.adj = Object.assign({}, e.adj, { [k]: +$(id).value }); $(id + "T").textContent = $(id).value; reAdjust(); });
for (const [id, k] of [["adjFx", "fx"], ["adjFy", "fy"], ["adjZoom", "zoom"]]) $(id).addEventListener("input", () => { const e = curEl(); if (!e) return; e[k] = +$(id).value; if (k === "zoom") $("adjZoomT").textContent = e.zoom.toFixed(2) + "x"; e.still = true; C.changed({ timeline: false, typing: true }); });
$("vidIn").onchange = () => { const e = curEl(); if (!e) return; e.trimIn = Math.max(0, Math.min(+$("vidIn").value || 0, (e.trimOut || e.dur) - 0.2)); const s = sc(); s.dur = Math.max(1.2, (e.trimOut || e.dur) - e.trimIn); C.changed({ panel: true }); };
$("vidOut").onchange = () => { const e = curEl(); if (!e) return; e.trimOut = Math.max((e.trimIn || 0) + 0.2, Math.min(+$("vidOut").value || e.dur, e.dur || 9999)); const s = sc(); s.dur = Math.max(1.2, e.trimOut - (e.trimIn || 0)); C.changed({ panel: true }); };
$("vidVol").oninput = () => { const e = curEl(); if (!e) return; e.vol = +$("vidVol").value; $("vidVolT").textContent = Math.round(e.vol * 100) + "%"; C.setClipVolume(e.mid, e.vol); C.scheduleCommit(); C.schedulePersist(); };
$("adjReset").onclick = () => { const e = curEl(); if (!e) return; if (e.orig) { e.src = e.orig; delete e.orig; } delete e.adj; delete e.filter; delete e.fx; delete e.fy; delete e.zoom; delete e.still; C.loadResources().then(() => { C.changed({ panel: true }); }); };

/* ---------------- transport ---------------- */
$("playBtn").onclick = () => (st.playing ? C.pause() : (setPenMode(false), C.play()));
$("scrub").oninput = () => { const T = C.total(); C.seek((+$("scrub").value / 1000) * T); const k = C.activeIndex(); if (k !== st.sel && !st.playing) { st.sel = k; renderPanel(); renderTimeline(); } };
$("undoBtn").onclick = () => C.undo(); $("redoBtn").onclick = () => C.redo();
document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase(); const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); e.shiftKey ? C.redo() : C.undo(); }
  else if (e.code === "Space" && !typing && C.total()) { e.preventDefault(); $("playBtn").click(); }
  else if (e.key === "Escape" && pen.on) setPenMode(false);
});

/* ---------------- header controls ---------------- */
$("pname").addEventListener("input", () => { if (!st.project) return; st.project.name = $("pname").value; C.schedulePersist(); C.scheduleCommit(); st.hooks.projectsChanged(); });
$("aspect").onchange = () => { if (!st.project) return; st.project.aspect = $("aspect").value; C.changed(); placePen(); };
$("modeSimple").onclick = () => setMode("simple"); $("modeAdv").onclick = () => setMode("adv"); $("toAdv").onclick = () => setMode("adv");
$("menuBtn").onclick = () => $("app").classList.toggle("open"); $("scrim").onclick = () => $("app").classList.remove("open");
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

/* ---------------- simple mode: describe -> video ---------------- */
$("examples").innerHTML = EXAMPLES.map((x, i) => `<button class="chip sm" data-ex="${i}">${esc(x.split(/[.!?]/)[0].slice(0, 54))}...</button>`).join("");
$("examples").onclick = (e) => { const b = e.target.closest("[data-ex]"); if (b) { $("prompt").value = EXAMPLES[+b.dataset.ex]; $("prompt").focus(); } };
$("attachAudio").onclick = async () => {
  const f = await pick("audioFile"); if (!f) return; $("audioNote").textContent = "Reading your voice...";
  try { st.audio = await C.loadAudioFile(f); setProjectUI(); renderTimeline(); C.schedulePersist(); if (st.project && st.project.scenes.length) toast("Voiceover added. Use Fit scenes to my voice in Advanced."); } catch (e) { st.audio = null; $("audioNote").textContent = "Could not read that file. Try MP3, WAV, M4A or WebM."; }
};
$("attachRef").onclick = async () => {
  const f = await pick("refFile"); if (!f) return; $("refNote").textContent = "Looking at your reference...";
  try { const r = await analyzeReference(f); st.ref = r; $("refNote").textContent = `${r.kind === "video" ? "Video" : "Picture"}: ${r.colors.length} main colours${r.pace ? ", " + r.pace + " pace" : ""}. ${r.note || ""}`.trim(); if (r.aspect) { $("aspect").value = r.aspect; if (st.project) st.project.aspect = r.aspect; } setProjectUI(); }
  catch (e) { st.ref = null; $("refNote").textContent = errMsg(e); }
};
async function make() {
  const prompt = $("prompt").value.trim(); if (!prompt) return toast("Describe your video first.");
  $("makeBtn").disabled = true; $("makeNote").className = "hint"; $("makeNote").textContent = "Planning your scenes...";
  try {
    const taste = Object.assign({}, st.taste); if (st.ref && st.ref.pace) taste.pace = st.ref.pace;
    const look = $("look").value, aspect = $("aspect").value, kind = detectKind(prompt); const mood = look !== "auto" ? look : kind === "saas" ? taste.saasMood : taste.mood;
    let p = null;
    if (st.settings.ai && st.ai) { try { $("makeNote").textContent = "The AI is planning your scenes..."; const json = await st.ai.json(aiStoryboardPrompt(prompt, taste, kind), { max_tokens: 900 }); const sc2 = sanitizeScenes(json, taste, look !== "auto" ? look : mood); if (sc2) p = { id: uid(), name: String(json.name || "").slice(0, 40) || prompt.slice(0, 36), aspect, mood, letterbox: taste.letterbox, scenes: sc2, created: Date.now(), updated: Date.now() }; } catch (_) { p = null; } if (!p) $("makeNote").textContent = "The AI answer was not usable, so I used the built-in planner."; }
    if (!p) p = storyboardFromPrompt(prompt, taste, { aspect, mood: look !== "auto" ? look : undefined });
    if (st.ref && look === "auto") { p.customMood = st.ref.mood; p.mood = "custom"; p.scenes.forEach((s) => delete s.mood); }
    if (st.audio) { if (!lengthsFromSegments(p, st.audio.speech, st.audio.duration)) fitToDuration(p, st.audio.duration, totalDuration); }
    C.pause(); st.project = p; st.sel = 0; st.t = 0; C.historyReset(); await C.loadResources(); renderAll(); resolveAll(); C.schedulePersist(); st.hooks.projectsChanged();
    $("makeNote").textContent = `Done: ${p.scenes.length} scenes, ${fmt(totalDuration(p))}. Press play, or edit scene by scene.`; st.hooks.guideSay && st.hooks.guideSay("Your first cut is ready. Press play to watch it. Want to change something? Switch to Advanced, or use the pen on the preview to circle what to change.");
    C.seek(0, { keepPlaying: false }); C.play();
  } catch (e) { $("makeNote").className = "hint err"; $("makeNote").textContent = errMsg(e); }
  $("makeBtn").disabled = false;
}
$("makeBtn").onclick = make;

/* ---------------- the pen ---------------- */
const pen = { on: false, strokes: [], drawing: false };
function placePen() {
  const c = $("cv"), p = $("pen"), w = $("cvWrap"); if (!c || !p) return; const r = c.getBoundingClientRect(), wr = w.getBoundingClientRect();
  p.style.left = r.left - wr.left + "px"; p.style.top = r.top - wr.top + "px"; p.style.width = r.width + "px"; p.style.height = r.height + "px";
  if (p.width !== Math.round(r.width) || p.height !== Math.round(r.height)) { p.width = Math.round(r.width); p.height = Math.round(r.height); } redrawPen();
}
function redrawPen() {
  const p = $("pen"), g = p.getContext("2d"); g.clearRect(0, 0, p.width, p.height); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 4; g.strokeStyle = "#ff4d6a"; g.shadowColor = "rgba(255,77,106,.8)"; g.shadowBlur = 8;
  for (const s of pen.strokes) { g.beginPath(); s.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (s.length === 1) g.lineTo(s[0][0] + 0.1, s[0][1]); g.stroke(); }
}
function setPenMode(on) {
  pen.on = on; $("cvWrap").classList.toggle("penning", on); $("penBtn").classList.toggle("on", on); if (on) { C.pause(); placePen(); st.hooks.guideSay && st.hooks.guideSay("Pen is on. Circle or underline the thing you want to change on the preview, then tell me what to do. For example: make it red, change to \"Hello\", bigger, remove, add Stripe logo."); } else closePenPop();
}
function closePenPop() { pen.strokes = []; redrawPen(); $("penPop").hidden = true; $("penNote").value = ""; }
$("penBtn").onclick = () => setPenMode(!pen.on);
const penPt = (e) => { const r = $("pen").getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
$("pen").addEventListener("pointerdown", (e) => { if (!pen.on) return; e.preventDefault(); $("pen").setPointerCapture(e.pointerId); pen.drawing = true; pen.strokes.push([penPt(e)]); redrawPen(); });
$("pen").addEventListener("pointermove", (e) => { if (!pen.drawing) return; pen.strokes[pen.strokes.length - 1].push(penPt(e)); redrawPen(); });
const penEnd = () => { if (!pen.drawing) return; pen.drawing = false; openPenPop(); };
$("pen").addEventListener("pointerup", penEnd); $("pen").addEventListener("pointercancel", penEnd);
function penBox() { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const s of pen.strokes) for (const [x, y] of s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
function penTargetNow() {
  const b = penBox(), p = $("pen"), k = $("cv").width / p.width; const bb = { x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k };
  st.t = Math.min(st.t, Math.max(0, C.total() - 0.001)); C.draw(); const idx = C.activeIndex(); const s = scenes()[idx]; return { idx, s, target: s ? pickTarget(st.res.hits, bb, s.id) : null };
}
function openPenPop() {
  const b = penBox(), pop = $("penPop"), p = $("pen"); pop.hidden = false; const wr = $("cvWrap").getBoundingClientRect(), pr = p.getBoundingClientRect();
  const { target } = penTargetNow(); $("penTarget").textContent = target ? "Marked: " + (ROLE_NAMES[target.role] || "something") : "Marked: this scene";
  const pw = pop.offsetWidth || 300, ph = pop.offsetHeight || 120; let left = pr.left - wr.left + b.x; left = Math.max(8, Math.min(left, wr.width - pw - 8)); let top = pr.top - wr.top + b.y + b.h + 12; if (top + ph > wr.height - 8) top = Math.max(8, pr.top - wr.top + b.y - ph - 12);
  pop.style.left = left + "px"; pop.style.top = top + "px"; $("penNote").focus();
}
function applyPen() {
  const note = $("penNote").value.trim(); if (!note) return toast("Say what should change first.");
  const { idx, s, target } = penTargetNow(); if (!s) return; st.sel = idx; const r = penEdit(s, target, note);
  closePenPop(); toast(r.notes.join(" · ")); if (r.changed) { C.loadResources(); resolvePending(s); renderPanel(); C.changed({ panel: true }); } st.hooks.guideSay && st.hooks.guideSay(r.changed ? "Done: " + r.notes.join(", ") + ". Press Ctrl+Z (or the undo arrow) if you do not like it." : r.notes.join(" "));
}
$("penApply").onclick = applyPen; $("penCancel").onclick = closePenPop; $("penNote").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyPen(); } });
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) { $("penMic").hidden = false; $("penMic").onclick = () => { try { const r = new SR(); r.lang = C.lsRaw("ts.lang", navigator.language || "en-US"); r.interimResults = false; r.onresult = (e) => { $("penNote").value = e.results[0][0].transcript; }; r.onerror = () => toast("Could not hear you. Check microphone permission."); r.start(); toast("Listening..."); } catch (_) {} }; }
window.addEventListener("resize", () => { placePen(); renderTimeline(); });
st.hooks.placePen = placePen; st.hooks.afterDraw = () => {};

/* ---------------- projects ---------------- */
async function renderProjects() {
  const all = (await C.idbAll("projects")).sort((a, b) => b.updated - a.updated);
  $("projList").innerHTML = all.length ? all.map((p) => `<div class="chat-item ${st.project && st.project.id === p.id ? "active" : ""}" data-id="${esc(p.id)}"><button class="t" data-open="${esc(p.id)}">${esc(p.name || "Untitled")}</button><button class="x" data-rm="${esc(p.id)}" aria-label="Delete">&times;</button></div>`).join("") : '<div class="empty-list">Your videos are saved here, on this device.</div>';
}
st.hooks.projectsChanged = deb(renderProjects, 200);
$("projList").addEventListener("click", async (e) => {
  const o = e.target.closest("[data-open]"), r = e.target.closest("[data-rm]");
  if (o) { const rec = await C.idbGet("projects", o.dataset.open); if (rec) { await openRecord(rec); $("app").classList.remove("open"); } }
  else if (r && confirm("Delete this video from this device?")) { await C.idbDel("projects", r.dataset.rm); if (st.project && st.project.id === r.dataset.rm) newProject(); renderProjects(); }
});
async function openRecord(rec) {
  C.pause(); const p = JSON.parse(rec.json); st.project = p; st.sel = 0; st.t = 0; st.audio = null;
  if (rec.audio) { try { st.audio = await C.loadAudioFile(new File([rec.audio], rec.audioName || "voiceover")); st.audio.gain = rec.audioGain == null ? 1 : rec.audioGain; st.audio.name = rec.audioName || "voiceover"; } catch (_) {} }
  C.historyReset(); await C.loadResources(); setMode(p.scenes.length ? "adv" : "simple"); renderAll(); resolveAll(); renderProjects();
}
function newProject() { C.pause(); st.project = null; st.audio = null; st.ref = null; st.sel = 0; st.t = 0; $("prompt").value = ""; $("makeNote").textContent = ""; $("refNote").textContent = "Optional. A picture or video whose look and pace you like."; C.historyReset(); setMode("simple"); renderAll(); renderProjects(); }
$("newProject").onclick = () => { newProject(); $("app").classList.remove("open"); };
$("saveFile") && null;
$("openProjFile").onclick = async () => {
  const f = await pick("projFile"); if (!f) return;
  try { const j = JSON.parse(await f.text()); const p = j && j.project; if (!p || !Array.isArray(p.scenes) || j.app !== "amusing-studio") throw 0; p.scenes = p.scenes.filter((s) => s && PRESETS[s.type]); if (!p.scenes.length) throw 0; p.id = uid(); p.scenes.forEach((s) => { s.id = s.id || uid(); s.elements = (s.elements || []).filter((e) => e && typeof e === "object"); });
    C.pause(); st.project = p; st.sel = 0; st.t = 0; st.audio = null; C.historyReset(); await C.loadResources(); setMode("adv"); renderAll(); resolveAll(); C.schedulePersist(); renderProjects(); toast("Project opened. Video clips and voiceover are not inside project files, so add them again if needed."); }
  catch (_) { toast("That is not an Amusing Studio project file."); }
};
$("addType").addEventListener("focus", () => { if (!st.project) ensureProject(); });

/* ---------------- boot ---------------- */
st.hooks.renderAll = renderAll; st.hooks.renderPanel = renderPanel; st.hooks.renderTimeline = renderTimeline;
const api = { setMode, make, addScene, afterEdit, renderAll, newProject, openRecord, setPenMode, resolveAll, renderProjects, setProjectUI, renderTimeline, renderPanel };
st.api = api;
fillSelects(); setProjectUI(); renderAll(); renderProjects(); setMode("simple");
initExtras(api);
const qp = new URLSearchParams(location.search);
if (qp.get("prompt")) { $("prompt").value = qp.get("prompt").slice(0, 600); setTimeout(() => st.hooks.guideSay && st.hooks.guideSay("Your idea from Chat is filled in. Press Make my video, or add a voiceover or a reference first."), 600); }
if (qp.has("debug")) window.__studio = { C, st, api };
