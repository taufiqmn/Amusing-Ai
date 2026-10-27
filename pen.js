// The pen: you circle or underline something on the preview and say what to change.
// pickTarget() finds what you marked (using where the renderer drew things). penEdit() understands the note.
// This is rule based, so it understands a clear set of requests and tells you plainly when it did not understand.

import { parseInstruction } from "./director.js";

const COLORS = { red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#facc15", orange: "#f97316", purple: "#a855f7", pink: "#ec4899", white: "#ffffff", black: "#111111", gold: "#e8a24a", teal: "#14b8a6", cyan: "#22d3ee", gray: "#9ca3af", grey: "#9ca3af", navy: "#1e3a8a" };
export function colorIn(l) { for (const [n, h] of Object.entries(COLORS)) if (new RegExp("\\b" + n + "\\b").test(l)) return h; const m = l.match(/#[0-9a-f]{6}\b/); return m ? m[0] : null; }

export const ROLE_NAMES = { text: "the headline", sub: "the subtitle", item: "a card", button: "the button", el: "a logo or photo", window: "the app window", number: "the big number" };

/** bbox and hits are in canvas pixels. bbox may be a point (w and h near 0). */
export function pickTarget(hits, bbox, sceneId) {
  const list = (hits || []).filter((h) => !sceneId || h.scene === sceneId); let best = null, bestScore = 0;
  const b = { x: bbox.x, y: bbox.y, w: Math.max(bbox.w, 8), h: Math.max(bbox.h, 8) };
  for (const h of list) {
    const ix = Math.max(0, Math.min(b.x + b.w, h.x + h.w) - Math.max(b.x, h.x)), iy = Math.max(0, Math.min(b.y + b.h, h.y + h.h) - Math.max(b.y, h.y)); const inter = ix * iy; if (inter <= 0) continue;
    const score = inter / Math.min(b.w * b.h, h.w * h.h) + (h.role === "window" ? -0.4 : 0.1); // prefer small things over the big window behind them
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best;
}

function pendingLogo(scene, name, at) {
  const e = { kind: "logo", name, auto: false, status: "pending", src: "", pos: "top-right" };
  if (at != null && scene.elements[at]) scene.elements[at] = e; else scene.elements.push(e);
}

/** Apply a note to a scene. Returns {notes, changed, logos, image}. */
export function penEdit(scene, target, note) {
  const raw = String(note || "").trim(); const l = raw.toLowerCase(); const notes = []; let changed = false; scene.elements = scene.elements || []; scene.style = scene.style || {}; scene.items = scene.items || [];
  const role = target ? target.role : null; const q = raw.match(/["“]([^"”]{1,160})["”]/);
  const remove = /\b(remove|delete|hide|get rid of|take out|erase|clear)\b/.test(l);
  let textDone = false;

  if (remove) {
    if (role === "text") { scene.text = ""; notes.push("Removed the headline"); changed = true; }
    else if (role === "sub") { scene.sub = ""; notes.push("Removed the subtitle"); changed = true; }
    else if (role === "item" && target.i != null) { scene.items.splice(target.i, 1); notes.push("Removed that card"); changed = true; }
    else if (role === "button") { scene.items[0] = ""; notes.push("Removed the button text"); changed = true; }
    else if (role === "el" && target.idx >= 0) { scene.elements.splice(target.idx, 1); notes.push("Removed that logo or photo"); changed = true; }
    else if (role === "window") notes.push("The app window belongs to this style. Choose another style to drop it.");
    else notes.push("Circle the thing you want removed.");
    return { notes, changed, logos: [], image: null };
  }

  // new words for the marked thing
  let newText = q ? q[1].trim() : null;
  if (!newText) { const m = raw.match(/\b(?:change|replace|rewrite|rename|make it say|should say|say|write|text)\b[^"“]*?\b(?:to|with|says?|into|:)\s+(.+)$/i); if (m && !/^(bigger|smaller|red|blue|green|yellow|orange|purple|pink|white|black)\b/i.test(m[1])) newText = m[1].trim().replace(/[.]+$/, "");
    if (!newText) { const m2 = raw.match(/\b(?:say|says|write|type|read|reads)\s+(.+)$/i); if (m2) newText = m2[1].trim().replace(/[.]+$/, ""); } }
  if (newText) {
    if (role === "sub") scene.sub = newText;
    else if (role === "item" && target.i != null) scene.items[target.i] = newText;
    else if (role === "button") scene.items[0] = newText;
    else if (role === "number") { const n = parseFloat(newText); if (!isNaN(n)) scene.stat = Object.assign({}, scene.stat, { value: n }); else scene.stat = Object.assign({}, scene.stat, { label: newText }); }
    else if (role === "el") { /* handled below as a logo request */ newText = null; }
    else scene.text = newText;
    if (newText) { notes.push("Text changed to “" + newText.slice(0, 40) + "”"); changed = true; textDone = true; }
  }

  if (/\b(bigger|larger|increase|enlarge|make it big|zoom in)\b/.test(l)) { scene.style.scale = Math.min(2, (scene.style.scale || 1) * 1.2); notes.push("Text bigger"); changed = true; }
  else if (/\b(smaller|reduce|shrink|decrease|zoom out)\b/.test(l)) { scene.style.scale = Math.max(0.5, (scene.style.scale || 1) / 1.2); notes.push("Text smaller"); changed = true; }

  const col = colorIn(l);
  if (col) {
    if (/\b(background|backdrop)\b/.test(l)) { scene.style.bg = col; notes.push("Background colour"); }
    else if (/\b(button|accent|line|highlight|underline|ring|chart)\b/.test(l) || role === "button") { scene.style.accent = col; notes.push("Accent colour"); }
    else { scene.style.text = col; notes.push("Text colour"); }
    changed = true;
  }
  if (/\b(reset|undo) (colou?rs?|size)\b/.test(l)) { scene.style = {}; notes.push("Back to the original colours and size"); changed = true; }

  // the rest (length, mood, transition, style, logos, photos) is the same language as the scene box
  const r = parseInstruction(raw, scene); const p = Object.assign({}, r.patch);
  if (textDone) { delete p.text; delete p.sub; }
  if (role === "el" && !r.logos.length && !r.image && p.text) delete p.text;
  if (Object.keys(p).length) { Object.assign(scene, p); changed = true; r.notes.filter((n) => !/^Text:/.test(n)).forEach((n) => notes.push(n)); }
  if (r.logos.length) {
    r.logos.forEach((n, k) => pendingLogo(scene, n, role === "el" && k === 0 && target.idx >= 0 && scene.elements[target.idx] && scene.elements[target.idx].kind === "logo" ? target.idx : null));
    notes.push("Logo: " + r.logos.join(", ")); changed = true;
  }
  if (r.image) { scene.elements = scene.elements.filter((e) => !(e.kind === "image")); scene.elements.push({ kind: "image", role: "bg", query: r.image, name: r.image, auto: false, status: "pending", src: "" }); notes.push("Photo: " + r.image); changed = true; }
  if (!changed) {
    if (/\b(move|shift|left|right|up|down|drag)\b/.test(l)) notes.push("I can't move things yet. I can change the words, size, colour, length, mood, transition, logos and photos.");
    else notes.push("I didn't understand that. Try: change to “new words”, bigger, red, remove, add Stripe logo, 4 seconds.");
  }
  return { notes, changed, logos: r.logos, image: r.image };
}
