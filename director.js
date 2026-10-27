// Taufiq Studio "director": turns plain words into scene edits and storyboards.
// Pure functions (no DOM, no network). The optional AI model only refines what these rules already do.

import { MOODS, PRESETS, TRANSITIONS } from "./engine.js";

export const uid = () => "s" + Math.random().toString(36).slice(2, 9);

/* ---------------- the taste file ---------------- */
export const DEFAULT_TASTE = `# Taste settings (one per line, "key: value")
pace: medium            # slow, medium or fast
mood: cinematic         # cinematic, documentary, saas_light, saas_dark, neon, warm, minimal, energetic, corporate
saas mood: saas_dark    # mood used for software / app videos
transition: fade        # cut, fade, slide, zoom, wipe, dip
scene length: 3.6       # average seconds per scene (the pace sets it if you leave this out)
letterbox: on           # black cinema bars on cinematic moods

# Editing knowledge (the AI reads this; the settings above are applied by rules)
- Hook in the first 3 seconds: start on the strongest line, not on a logo.
- One idea per scene. If a scene needs two sentences, split it into two scenes.
- Cinematic: slow dissolves, long holds (4 to 7 s), warm highlights and teal shadows, film grain, 2.39:1 bars.
- Fast social: a new visual every 1.5 to 3 s, kinetic text, hard cuts or slides, big contrast.
- Motion: ease out when something enters, ease in-out when it moves, stagger items 60 to 120 ms.
- Typography: max 7 words per kinetic line, one highlight word per scene, two fonts at most.
- Colour: one main accent and one support accent. Keep text contrast high.
- SaaS promo: show the product within 5 s, 3 features at most, one dashboard shot with a cursor click, end on a clear call to action.
- Transitions: dissolve for time passing, slide for energy, dip to black for a new chapter.
- Audio: cut on the breath, duck music 12 dB under voice, add a whoosh on slides.
`;

export function parseTaste(text) {
  const taste = { pace: "medium", mood: "cinematic", saasMood: "saas_dark", transition: "fade", sceneLen: null, letterbox: true, notes: [], warnings: [] };
  for (const raw of String(text || "").split(/\r?\n/)) {
    if (/^\s*#/.test(raw)) continue;
    const line = raw.replace(/\s+#.*$/, "").trim(); if (!line) continue;
    const m = line.match(/^([a-z][a-z ]{1,20}?)\s*:\s*(.+)$/i);
    if (!m || /^[-*]/.test(line)) { if (/^[-*]/.test(line)) taste.notes.push(line.replace(/^[-*]\s*/, "")); continue; }
    const key = m[1].toLowerCase().trim(); const val = m[2].replace(/\s+#.*$/, "").trim().toLowerCase();
    if (key === "pace") { if (["slow", "medium", "fast"].includes(val)) taste.pace = val; else taste.warnings.push("pace should be slow, medium or fast"); }
    else if (key === "mood") { if (MOODS[val]) taste.mood = val; else taste.warnings.push("unknown mood: " + val); }
    else if (key === "saas mood") { if (MOODS[val]) taste.saasMood = val; else taste.warnings.push("unknown saas mood: " + val); }
    else if (key === "transition") { if (TRANSITIONS[val]) taste.transition = val; else taste.warnings.push("unknown transition: " + val); }
    else if (key === "scene length") { const n = parseFloat(val); if (n >= 1 && n <= 15) taste.sceneLen = n; else taste.warnings.push("scene length should be 1 to 15 seconds"); }
    else if (key === "letterbox") taste.letterbox = !/^(off|no|false|0)$/.test(val);
    else taste.notes.push(line);
  }
  return taste;
}
/** Add a plain rule the person typed ("always use slide transitions") to the taste file. */
export function teachRule(tasteText, rule) {
  const r = String(rule || "").trim().replace(/\s+/g, " ").slice(0, 200); if (!r) return tasteText;
  const l = r.toLowerCase(); let t = tasteText.replace(/\s+$/, "") + "\n";
  const set = (key, val) => { const re = new RegExp("^" + key + "\\s*:.*$", "mi"); if (re.test(t)) t = t.replace(re, `${key}: ${val}`); else t = `${key}: ${val}\n` + t; };
  let applied = false;
  const mood = moodIn(l); const tr = transitionIn(l);
  if (/\b(slow|calm|relaxed)\b/.test(l) && /pace|cut|edit|tempo|rhythm/.test(l)) { set("pace", "slow"); applied = true; }
  else if (/\b(fast|quick|snappy|punchy)\b/.test(l) && /pace|cut|edit|tempo|rhythm/.test(l)) { set("pace", "fast"); applied = true; }
  if (tr && /transition|always|use|prefer/.test(l)) { set("transition", tr); applied = true; }
  if (mood && /mood|look|style|always|use|prefer|colou?r/.test(l)) { set(/saas|app|software/.test(l) ? "saas mood" : "mood", mood); applied = true; }
  if (/no (letterbox|black bars)|without (letterbox|bars)/.test(l)) { set("letterbox", "off"); applied = true; }
  t += "- " + r + "\n";
  return t;
}

/* ---------------- reading an instruction ---------------- */
const MOOD_WORDS = [
  [/\b(cinematic|film(ic)?|movie|trailer)\b/, "cinematic"], [/\bdocumentary\b/, "documentary"],
  [/\b(saas light|light mode|clean white|bright|white)\b/, "saas_light"], [/\b(saas dark|dark mode|dark|night)\b/, "saas_dark"],
  [/\b(neon|cyber(punk)?|futuristic|glow(ing)?|synthwave)\b/, "neon"], [/\b(warm|golden|cozy|sunset)\b/, "warm"],
  [/\b(minimal(ist)?|simple|mono(chrome)?)\b/, "minimal"], [/\b(energetic|hype|punchy|youtube|vibrant|playful)\b/, "energetic"], [/\b(corporate|professional|business|formal)\b/, "corporate"],
];
const TRANS_WORDS = [[/\b(dip to black|fade to black|dip)\b/, "dip"], [/\b(dissolve|crossfade|cross-fade|fade)\b/, "fade"], [/\b(slide|push)\b/, "slide"], [/\bzoom(ing)?\b/, "zoom"], [/\bwipe\b/, "wipe"], [/\b(hard cut|cut)\b/, "cut"]];
const TYPE_WORDS = [
  [/\bsaas hero\b|\bhero (scene|shot|screen)\b|\bproduct intro\b/, "saas_hero"], [/\b(feature|benefit)s?( cards?| scene| list)?\b/, "saas_features"], [/\b(dashboard|app screen|ui demo|product demo|app demo)\b/, "saas_dashboard"],
  [/\b(how it works|steps?( scene)?|process|workflow)\b/, "saas_steps"], [/\b(cta|call to action|call-to-action|outro|sign ?up scene|get started)\b/, "saas_cta"],
  [/\b(logo (wall|row|grid)|logos? (wall|row|grid)|trusted by|client logos|partner logos)\b/, "logos"],
  [/\b(kinetic|typography|pop(ping)? words?|word by word)\b/, "kinetic"], [/\bquote\b/, "quote"], [/\b(big number|counter|count ?up|stat(istic)?s?|percent(age)?)\b/, "stat"],
  [/\b(lower ?third|name ?tag|name bar)\b/, "lower"], [/\b(photo scene|image scene|full photo|photo only|just a photo|b-?roll)\b/, "image"], [/\b(title|intro|opening|headline scene)\b/, "title"],
];
function moodIn(l) { const m = MOOD_WORDS.find(([re]) => re.test(l)); return m ? m[1] : null; }
function transitionIn(l) { const m = TRANS_WORDS.find(([re]) => re.test(l)); return m ? m[1] : null; }
const STOP = new Set(["the", "a", "an", "our", "my", "your", "their", "this", "that", "company", "brand", "company's", "some", "more", "new", "its", "his", "her", "and", "with", "of", "for", "also", "then", "too", "logo", "logos", "scene", "here", "there", "it", "make", "set", "turn", "change", "switch", "give", "want", "need", "please", "replace", "remove", "wall", "row", "grid", "show", "is", "be", "to", "in", "on"]);
const LEAD = /^(?:please\s+)?(?:add|insert|put|show|include|use|place|display|bring in|with|plus|also|and|then)\s+/i;

function cleanName(s) {
  let w = s.replace(LEAD, "").replace(LEAD, "").replace(/[“”"]/g, "").trim();
  w = w.split(/\s+/).filter((x) => x && !STOP.has(x.toLowerCase())).join(" ").replace(/^[,;:\s]+|[,;:\s]+$/g, "");
  return w.length >= 2 && w.length <= 30 ? w : "";
}
export function findLogoRequests(text) {
  const out = []; const add = (n) => { const c = cleanName(n); if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c); };
  const t = String(text || "");
  // "logo of X", "logos for X, Y and Z", "logos: X, Y"
  for (const m of t.matchAll(/\blogos?\s*(?:of|for|from|:|-)\s*([^.;\n]+)/gi)) m[1].split(/,|\band\b|&|\+/i).forEach(add);
  // "X logo", "X, Y and Z logos"
  for (const m of t.matchAll(/([^.;\n]*?)\blogos?\b/gi)) {
    const before = m[1]; if (/\b(?:of|for|from)\s*$|[:\-]\s*$/i.test(before)) continue;
    if (/^\s*(wall|row|grid)\b/i.test(t.slice(m.index + m[0].length))) continue;
    const seg = before.split(/\b(?:add|insert|put|show|include|with|use|place|display|plus|then)\b/i).pop();
    seg.split(/,|\band\b|&|\+/i).forEach(add);
  }
  return out.slice(0, 8);
}
export function findImageRequest(text) {
  const t = String(text || "");
  const m = t.match(/\b(?:photos?|images?|pictures?|footage|b-?roll|background|backdrop)\s*(?:of|showing|with|:|-)\s*([^.,;\n]{3,60})/i);
  if (!m) return null; const q = m[1].replace(/\b(?:and|with|then|add|use)\b.*$/i, "").trim(); return q.length >= 3 ? q : null;
}

/**
 * Read one scene's instruction. Returns what changed in plain terms.
 * @returns {{patch:object, logos:string[], image:(string|null), notes:string[]}}
 */
export function parseInstruction(text, scene = {}) {
  const raw = String(text || ""); const l = raw.replace(/"[^"]*"|\u201C[^\u201D]*\u201D/g, " ").toLowerCase(); const patch = {}; const notes = [];
  const typeHit = TYPE_WORDS.find(([re]) => re.test(l)); if (typeHit) { patch.type = typeHit[1]; notes.push("Style: " + PRESETS[typeHit[1]].name); }
  const mood = moodIn(l); if (mood) { patch.mood = mood; notes.push("Mood: " + MOODS[mood].name); }
  const tr = transitionIn(l); if (tr) { patch.transition = tr; notes.push("Transition: " + TRANSITIONS[tr]); }
  const d = l.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/);
  if (d) { patch.dur = Math.min(12, Math.max(1.2, parseFloat(d[1]))); notes.push("Length: " + patch.dur + "s"); }
  else if (/\b(longer|slower|more time)\b/.test(l)) { patch.dur = Math.min(12, (scene.dur || 3.6) + 1.5); notes.push("Longer"); }
  else if (/\b(shorter|quicker|speed (it )?up|snappier|make it faster)\b/.test(l)) { patch.dur = Math.max(1.2, (scene.dur || 3.6) - 1); notes.push("Shorter"); }
  const q = [...raw.matchAll(/["“]([^"“”]{2,200})["”]/g)].map((m) => m[1].trim());
  if (q[0]) { patch.text = q[0]; notes.push("Text: " + q[0].slice(0, 40)); if (q[1]) patch.sub = q[1]; }
  else {
    const s = raw.match(/\b(?:says?|reads?|headline|title|caption|text)\s*[:\-]\s*([^\n]+?)(?:\s*(?:,|;|\.)\s*(?:add|with|use|make|and add)\b.*)?$/i);
    if (s && s[1].trim().length > 1) { patch.text = s[1].trim().replace(/[.]+$/, ""); notes.push("Text: " + patch.text.slice(0, 40)); }
  }
  const li = raw.match(/\b(?:features?|steps?|items?|points?|bullets?|list|buttons?)\s*[:\-]\s*([^\n]+)/i);
  if (li) { const parts = li[1].split(/\s*(?:;|\|)\s*|\s*,\s*(?![^()]*\))|\s+\band\b\s+/i).map((x) => x.trim()).filter(Boolean).slice(0, 5); if (parts.length) { patch.items = parts; notes.push(parts.length + " items"); } }
  const typ = patch.type || scene.type;
  const st = raw.match(/(\d+(?:[.,]\d+)?)\s*(%|k\b|m\b|x\b|\+)?\s*([a-z][a-z \-]{2,40})?/i);
  if ((typ === "stat" || /%/.test(raw)) && st) {
    const v = parseFloat(st[1].replace(",", ".")); const suf = (st[2] || "").toLowerCase();
    if (!/seconds?|secs?|s$/.test((st[3] || "").trim().toLowerCase().split(" ")[0] || "") || suf) { patch.stat = { value: v, suffix: suf === "k" ? "K" : suf === "m" ? "M" : suf, prefix: "", label: (st[3] || scene.text || "").trim() }; if (!patch.type && typ !== "stat") patch.type = "stat"; notes.push("Number: " + v + (patch.stat.suffix || "")); }
  }
  const logos = findLogoRequests(raw); if (logos.length) notes.push("Logos: " + logos.join(", "));
  const image = findImageRequest(raw); if (image) notes.push("Photo: " + image);
  return { patch, logos, image, notes };
}

/** Apply an instruction to a scene in place. Asset elements are added as "pending"; the page fills them in. */
export function applyInstruction(scene, text) {
  const r = parseInstruction(text, scene);
  Object.assign(scene, r.patch);
  scene.instruction = text;
  if (!r.notes.length && String(text).trim().split(/\s+/).length <= 14 && String(text).trim() && !scene.text) { scene.text = String(text).trim().replace(/^["“]|["”]$/g, ""); r.notes.push("Used as the headline"); }
  scene.elements = scene.elements || [];
  const want = new Set(r.logos.map((n) => n.toLowerCase()));
  scene.elements = scene.elements.filter((e) => !(e.kind === "logo" && e.auto && !want.has((e.name || "").toLowerCase())));
  for (const n of r.logos) if (!scene.elements.some((e) => e.kind === "logo" && (e.name || "").toLowerCase() === n.toLowerCase())) scene.elements.push({ kind: "logo", name: n, auto: true, status: "pending", src: "", pos: "top-right" });
  if (r.image) {
    const cur = scene.elements.find((e) => e.kind === "image" && e.auto);
    if (!cur || cur.query !== r.image) { scene.elements = scene.elements.filter((e) => !(e.kind === "image" && e.auto)); scene.elements.push({ kind: "image", role: "bg", query: r.image, name: r.image, auto: true, status: "pending", src: "" }); }
  } else scene.elements = scene.elements.filter((e) => !(e.kind === "image" && e.auto && e.status !== "ok"));
  if (r.patch.type === "logos" && !r.logos.length && !scene.text) scene.text = "Trusted by teams everywhere";
  return r;
}

/* ---------------- storyboard from a prompt ---------------- */
const PACE = { slow: 5, medium: 3.6, fast: 2.4 };
const BASE = { title: 4.2, kinetic: 0.9, quote: 5, stat: 3.8, lower: 3.5, image: 4, logos: 4, saas_hero: 4.8, saas_features: 5, saas_dashboard: 5.5, saas_steps: 5, saas_cta: 3.8 };
export function sceneLen(type, taste) {
  const avg = taste.sceneLen || PACE[taste.pace] || 3.6; const k = avg / 3.6;
  if (type === "kinetic") return Math.max(1.6, Math.min(5, avg * 0.9));
  return Math.max(2, Math.min(9, (BASE[type] || 3.6) * k));
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function sentences(t) { return String(t).split(/(?<=[.!?।])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 1); }

export function detectKind(prompt) {
  const l = prompt.toLowerCase();
  if (/\b(cinematic|film|trailer|documentary|brand film|teaser|poem|journey|short story)\b/.test(l)) return "cinematic";
  if (/\b(saas|app|software|startup|platform|dashboard|crm|tool|manager|tracker|planner|product|website|assistant|subscription|workspace|teams?|business|service|api|plugin|extension)\b/.test(l)) return "saas";
  if (/\b(story|travel|intro)\b/.test(l)) return "cinematic";
  return "generic";
}
export function productName(prompt) {
  const q = prompt.match(/["“]([^"”]{2,30})["”]/); if (q) return q[1].trim();
  const n = prompt.match(/\b(?:called|named|for|about|introducing)\s+([A-Z][\w.\-]{1,24}(?:\s+[A-Z][\w.\-]{1,24})?)/); if (n) return n[1];
  const c = prompt.match(/(?:^|[^.!?]\s)([A-Z][a-z]{2,}[A-Z]?[a-z]*)\b/g); if (c) { const w = c.map((x) => x.trim()).find((x) => !/^(Make|Create|Build|Show|Give|Write|Generate|Promo|Video|Animation|Saas|Intro|Please)$/i.test(x)); if (w) return w; }
  return "";
}
function splitList(s) { return s.split(/\s*(?:;|,|\band\b|&)\s*/i).map((x) => x.trim()).filter((x) => x.length > 2).slice(0, 4); }

export function storyboardFromPrompt(prompt, taste, opts = {}) {
  const P = String(prompt || "").trim() || "A short video";
  const kind = opts.kind || detectKind(P); const aspect = opts.aspect || "16:9";
  const mood = opts.mood || (kind === "saas" ? taste.saasMood : taste.mood);
  const tr = taste.transition; const mk = (type, extra = {}) => Object.assign({ id: uid(), type, dur: sceneLen(type, taste), transition: tr, elements: [], text: "", sub: "", items: [] }, extra);
  const scenes = [];
  if (kind === "saas") {
    const name = productName(P) || "Your Product";
    const after = P.match(/\b(?:called|named)\s+\S+(?:\s+[A-Z]\S+)?[,:\-]?\s*(.+)$/i) || P.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[,:\\-]?\\s*(?:a|an|the)?\\s*(.+)$", "i"));
    let desc = after ? after[1].replace(/[.!?]+$/, "") : ""; if (desc.length > 90 || !desc) desc = sentences(P).find((s) => s.length < 90 && !s.includes(name)) || "Everything your team needs, in one place";
    const feat = (P.match(/\b(?:features?|includes?|with|offers?|lets you|helps you)\s*[:\-]?\s*([^.]+)/i) || [])[1]; let items = feat ? splitList(feat) : [];
    const defaults = ["Fast: Get results in seconds", "Secure: Your data stays yours", "Simple: Set up in minutes"]; items = items.length >= 2 ? items.map((x) => cap(x)) : defaults;
    const num = P.match(/(\d+(?:[.,]\d+)?)\s*(%|x|k\b|hours?|minutes?|\+)?\s*([a-z][a-z \-]{3,30})?/i);
    scenes.push(mk("saas_hero", { text: "Meet " + name, sub: cap(desc), items: ["Get started free"], mood }));
    scenes.push(mk("saas_features", { text: "Why teams love " + name, items: items.slice(0, 3), mood }));
    scenes.push(mk("saas_dashboard", { text: "See it in action", mood }));
    if (num && /%|x|k|hour|minute|\+/i.test(num[0])) scenes.push(mk("stat", { text: "", stat: (() => { const unit = (num[2] || "").toLowerCase(); const isWord = /^(hour|minute)/.test(unit); return { value: parseFloat(num[1].replace(",", ".")), suffix: isWord ? "" : unit.replace(/^k$/, "K").replace(/^m$/, "M"), prefix: "", label: ((isWord ? unit + " " : "") + (num[3] || "")).trim() }; })(), mood }));
    const lg = findLogoRequests(P); if (lg.length) scenes.push(mk("logos", { text: "Works with the tools you use", elements: lg.map((n) => ({ kind: "logo", name: n, auto: false, status: "pending", src: "", pos: "top-right" })), mood }));
    scenes.push(mk("saas_steps", { text: "How it works", items: ["Sign up: Free in 30 seconds", "Connect: Bring your tools", "Go: Watch it work"], mood }));
    scenes.push(mk("saas_cta", { text: "Try " + name + " free", sub: name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com", items: ["Start free"], mood }));
  } else {
    const ss = sentences(P); const lines = ss.length > 1 ? ss : [P];
    const first = lines[0].replace(/^(make|create|build|generate)\s+(me\s+)?(a|an)\s+(short\s+)?(cinematic\s+)?(video|film|intro|promo|trailer)\s+(about|for|of|on)\s+/i, "");
    scenes.push(mk("title", { text: cap(first.replace(/[.!?]+$/, "")).slice(0, 80), sub: "", mood, dur: sceneLen("title", taste) }));
    const body = lines.slice(ss.length > 1 ? 1 : 0, 7);
    body.forEach((s, i) => { const t = s.replace(/[.!?]+$/, ""); if (ss.length === 1) return; scenes.push(mk(t.length > 70 || i % 3 === 2 ? "quote" : "kinetic", { text: cap(t), mood, dur: sceneLen(t.length > 70 ? "quote" : "kinetic", taste) })); });
    if (ss.length === 1) scenes.push(mk("kinetic", { text: cap(first.replace(/[.!?]+$/, "")), mood }));
  }
  scenes.forEach((s, i) => { if (i === 0) s.transition = "cut"; });
  const project = { id: uid(), name: opts.name || (kind === "saas" ? (productName(P) || "SaaS") + " promo" : cap(P).slice(0, 36)), aspect, mood, letterbox: taste.letterbox, scenes, created: Date.now(), updated: Date.now() };
  return project;
}

/** Stretch or shrink scene lengths so the whole video is about `target` seconds (for a voiceover). */
export function fitToDuration(project, target, totalFn) {
  if (!(target > 1) || !project.scenes.length) return project;
  for (let i = 0; i < 6; i++) {
    const cur = totalFn(project); if (Math.abs(cur - target) < 0.05) break;
    const k = target / cur; project.scenes.forEach((s) => { s.dur = Math.min(30, Math.max(1.2, s.dur * k)); });
  }
  return project;
}
/** Use real speech segments (from the voiceover) as scene lengths when the counts match closely. */
export function lengthsFromSegments(project, segments, duration) {
  const n = project.scenes.length; if (!segments || !segments.length || n < 1) return false;
  let segs = segments.map((s) => ({ ...s }));
  while (segs.length > n) { let k = 0, best = Infinity; for (let i = 0; i < segs.length - 1; i++) { const g = segs[i + 1].start - segs[i].end; if (g < best) { best = g; k = i; } } segs[k].end = segs[k + 1].end; segs.splice(k + 1, 1); }
  if (segs.length < n) return false;
  const bounds = segs.map((s, i) => (i === 0 ? 0 : (segs[i - 1].end + s.start) / 2)); bounds.push(duration);
  project.scenes.forEach((s, i) => { s.dur = Math.max(1.2, bounds[i + 1] - bounds[i]); });
  return true;
}

/* ---------------- optional AI helper ---------------- */
export function aiStoryboardPrompt(prompt, taste, kind) {
  const types = Object.keys(PRESETS).filter((k) => k !== "footage").join(", ");
  return `You plan short videos as scenes. Reply with JSON only: {"name":"short title","scenes":[{"type":"one of: ${types}","text":"headline, max 8 words","sub":"optional, max 14 words","items":["optional short strings"],"dur":seconds between 2 and 7}]}.
Use ${kind === "saas" ? "saas_hero first, then saas_features (3 items like \"Fast: details\"), saas_dashboard, saas_steps, and saas_cta last" : "title first, then kinetic and quote scenes, and a title or quote last"}. 4 to 7 scenes. One idea per scene. Pace: ${taste.pace}.
Style notes from the editor: ${taste.notes.slice(0, 12).join(" ")}
Video idea: ${prompt}`;
}
/** Check whatever the AI sent back. Anything odd is dropped or clamped. Returns a scenes array or null. */
export function sanitizeScenes(obj, taste, mood) {
  const arr = obj && Array.isArray(obj.scenes) ? obj.scenes : null; if (!arr) return null;
  const clean = (x, n) => String(x == null ? "" : x).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
  const out = [];
  for (const s of arr.slice(0, 9)) {
    if (!s || typeof s !== "object" || !PRESETS[s.type] || s.type === "footage") continue;
    const items = Array.isArray(s.items) ? s.items.map((i) => clean(i, 80)).filter(Boolean).slice(0, 5) : [];
    out.push({ id: uid(), type: s.type, text: clean(s.text, 120), sub: clean(s.sub, 140), items, dur: Math.min(9, Math.max(2, Number(s.dur) || sceneLen(s.type, taste))), transition: taste.transition, elements: [], mood });
  }
  if (out.length < 2) return null; out[0].transition = "cut"; return out;
}
