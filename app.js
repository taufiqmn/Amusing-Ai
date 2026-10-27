// Amusing AI: the app. By Md Taufiqur Rahman. MIT License.
import { Gyan } from "./gyan.js";
import { CATALOG, KINDS, DEFAULT_ID, VISION_ID, LEGACY, byId, isVision, isReasoning, isQwen3, shortName, fitLabel, gb } from "./models.js";
import { parseTable, normalizeSpec, chartSVG, chartTableHTML, attachChartHover, svgToPng, extractChart, esc } from "./charts.js";
import { Comfy, checkWorkflow } from "./comfy.js";

const $ = (id) => document.getElementById(id);
const el = { app: $("app"), log: $("log"), hero: $("hero"), heroCard: $("heroCard"), input: $("input"), send: $("send"), stop: $("stop"),
  title: $("title"), pill: $("pill"), pillText: $("pillText"), list: $("chatList"), toast: $("toast"), file: $("file"), imgFile: $("imgFile"),
  attachRow: $("attachRow"), attachBtn: $("attachBtn") };

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
  raw(k) { try { return localStorage.getItem(k) || ""; } catch (_) { return ""; } },
  setRaw(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
};
let chats = store.get("gyan.chats", []);
const saved = store.get("gyan.settings", {});
let settings = Object.assign({ model: DEFAULT_ID, style: "friendly", length: "short", comfyUrl: "http://127.0.0.1:8188", genImg: false, genVid: false }, saved);
if (saved.tier && !saved.model) settings.model = LEGACY[saved.tier] || DEFAULT_ID;
if (!byId(settings.model) || isVision(settings.model)) settings.model = DEFAULT_ID;
let profile = Object.assign({ name: "", email: "", job: "", done: false }, store.get("gyan.profile", {}));

let current = null;          // active chat id (null = a new chat that has no messages yet)
let ai = null;
let activeId = settings.model; // model actually loaded
let state = "idle";          // idle | loading | ready | unsupported
let supportInfo = { ok: true, reason: "" };
let progress = { value: 0, text: "", error: false };
let busy = false;
let onboarding = false;
let pendingImg = null;

/* ---------- prompts: short, human replies by default ---------- */
const LENGTHS = {
  short:  { name: "Short and human", note: "A line or two, like a text message. Tap \"Explain in detail\" for more." },
  normal: { name: "Balanced", note: "A short, clear paragraph." },
  detail: { name: "Always detailed", note: "Full explanations every time." },
};
const STYLES = {
  friendly: { name: "Friendly assistant", note: "Clear, simple answers", flavor: "" },
  tutor:    { name: "Patient tutor", note: "Explains with tiny examples", flavor: "You enjoy teaching and use tiny examples." },
  coder:    { name: "Coding helper", note: "Short, correct code", flavor: "You are an expert programmer." },
  writer:   { name: "Writing helper", note: "Drafts, rewrites and polishes text", flavor: "You are a skilled writer and editor." },
};
const SHORT_SYS = "You are Amusing, a friendly person chatting by text. Reply the way a real person would: one or two short, casual sentences. Answer first, with no intro or filler (no \"Sure!\", no \"Great question\"). Never mention being an AI. No lists, headings or markdown unless asked. If asked for code, give only the code. Do not explain unless asked; the user can tap \"Explain in detail\" for that.";
const NORMAL_SYS = "You are Amusing, a helpful assistant. Answer clearly in one short paragraph.";
const DETAIL_SYS = "You are Amusing, a helpful assistant. Explain thoroughly but plainly: start with a one-line answer, then give clear reasons or steps with a small example. Use short paragraphs or a short list.";
const CHART_HINT = " If the user asks for a chart or graph, reply with one short sentence and then a fenced block exactly like this:\n```chart\n{\"type\":\"bar\",\"title\":\"Title\",\"labels\":[\"A\",\"B\"],\"values\":[1,2]}\n```\ntype can be bar, line or donut. Values must be plain numbers.";
const SHOTS = [
  ["capital of japan?", "Tokyo."],
  ["why do cats purr?", "Usually they're happy or relaxed, but sometimes it's how they calm themselves down."],
  ["how do i reverse a string in python", "s[::-1]"],
  ["what should i cook tonight?", "Pasta's easy. Garlic, olive oil, chili flakes, done in 15 minutes."],
];
const PARAMS = { short: { max_tokens: 90, temperature: 0.7 }, normal: { max_tokens: 400, temperature: 0.7 }, detail: { max_tokens: 1024, temperature: 0.6 } };
const SUGGESTIONS = ["Explain something simply", "Help me write an email", "Give me a study plan", "Teach me a coding concept"];
const JOBS = ["Student", "Developer", "Teacher", "Designer", "Business", "Other"];

/* ---------- helpers ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function md(t) {
  const h = esc(t).replace(/```(\w*)\n?([\s\S]*?)(```|$)/g, (m, l, c) => `<pre><code>${c.replace(/\n$/, "")}</code></pre>`);
  return h.split(/(<pre>[\s\S]*?<\/pre>)/).map((p) => (p.startsWith("<pre>") ? p :
    p.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>"))).join("");
}
let toastTimer;
function toast(msg) { el.toast.textContent = msg; el.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2800); }
const getChat = (id) => chats.find((c) => c.id === id);
const errMsg = (e) => (e && e.message ? e.message : String(e));
function persist() {
  if (store.set("gyan.chats", chats)) return true;
  // Storage full: drop saved pictures, oldest chats first, then retry.
  for (const c of [...chats].sort((a, b) => a.updated - b.updated)) {
    let changed = false;
    for (const m of c.messages) if (m.img) { delete m.img; changed = true; }
    if (changed && store.set("gyan.chats", chats)) { toast("Storage was full, so I removed some old pictures."); return true; }
  }
  toast("Couldn't save: your browser storage is full or blocked.");
  return false;
}
const saveSettings = () => store.set("gyan.settings", settings);
const saveProfile = () => store.set("gyan.profile", profile);
function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const downloadJSON = (name, obj) => downloadBlob(name, new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
const dateStr = () => new Date().toISOString().slice(0, 10);
const slug = (s) => (s || "chat").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "chat";
const isDark = () => !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function shrinkImage(file, max = 768) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        const s = Math.min(1, max / Math.max(w, h));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        const g = c.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

/* ---------- reply cleanup: keep it short and human ---------- */
const stripThink = (t) => t.replace(/<think>[\s\S]*?<\/think>/g, "");
function trimToSentence(t) {
  const m = t.match(/^[\s\S]*[.!?](?=\s|$)/);
  return m && m[0].length > 20 ? m[0].trim() : t.replace(/[\s,;:]+$/, "") + "…";
}
function limitSentences(t, n) {
  const parts = t.split(/(?<=[.!?])\s+(?=[A-Z"'(\d])/);
  return parts.length > n ? parts.slice(0, n).join(" ") : t;
}
function finalize(full, finish, mode) {
  let t = stripThink(full).trim();
  if (!t) return "";
  const code = t.includes("```");
  if (finish === "length" && !code) t = trimToSentence(t);
  if (mode === "short" && !code && !/\n\s*([-*]|\d+\.)\s/.test(t)) t = limitSentences(t, 3);
  return t;
}

/* ---------- charts in the page ---------- */
function chartCard(spec) {
  const card = document.createElement("div"); card.className = "chart-card";
  const host = document.createElement("div"); host.className = "chart-host";
  const actions = document.createElement("div"); actions.className = "chart-actions";
  const det = document.createElement("details");
  const sum = document.createElement("summary"); sum.textContent = "Table";
  const tbl = document.createElement("div"); tbl.className = "tbl"; tbl.innerHTML = chartTableHTML(spec);
  det.append(sum, tbl);
  const png = document.createElement("button"); png.textContent = "Save picture";
  png.onclick = () => svgToPng(chartSVG(spec, { theme: isDark() ? "dark" : "light" }), 2)
    .then((b) => downloadBlob("amusing-chart.png", b)).catch(() => toast("Couldn't make the picture."));
  actions.append(det, png);
  card.append(host, actions);
  const draw = () => { const dark = isDark(); card.classList.toggle("dark", dark); host.innerHTML = chartSVG(spec, { theme: dark ? "dark" : "light" }); attachChartHover(host); };
  card._redraw = draw; draw();
  return card;
}

/* ---------- messages ---------- */
function copyBtn(getText) {
  const cp = document.createElement("button"); cp.className = "copy"; cp.textContent = "⧉"; cp.title = "Copy";
  cp.onclick = async () => { try { await navigator.clipboard.writeText(getText()); toast("Copied"); } catch (_) { toast("Copy not allowed here"); } };
  return cp;
}
function addBubble(m) {
  const d = document.createElement("div");
  const isUser = m.role === "user";
  d.className = "msg " + (isUser ? "user" : "ai") + (m.chart ? " wide" : "") + (m.kind === "media" ? " big" : "");
  if (m.img) { const im = document.createElement("img"); im.className = "pic"; im.alt = isUser ? "Your picture" : "Created picture"; im.src = m.img; d.appendChild(im); }
  const body = document.createElement("div"); body.className = "body";
  if (isUser) body.textContent = m.kind === "explain" ? "Explain in detail" : m.content || "";
  else body.innerHTML = m.content ? md(m.content) : "";
  if (isUser && !body.textContent) body.style.display = "none";
  if (!isUser && !m.content) body.style.display = "none";
  d.appendChild(body); d._body = body; d.dataset.raw = m.content || "";
  if (m.chart) { try { d.appendChild(chartCard(m.chart)); } catch (_) {} }
  if (!isUser && m.studio) {
    const a = document.createElement("a"); a.className = "btn primary"; a.style.cssText = "display:inline-block;margin-top:10px;text-decoration:none";
    a.href = "studio.html?prompt=" + encodeURIComponent(String(m.studio).slice(0, 600)); a.textContent = m.kind === "media" ? "Make it in Studio" : "Open Amusing Studio";
    d.appendChild(a);
  }
  if (!isUser && m.content) d.appendChild(copyBtn(() => d.dataset.raw));
  el.log.appendChild(d); el.log.scrollTop = el.log.scrollHeight;
  return d;
}
function renderMessages() {
  el.log.innerHTML = "";
  const c = current && getChat(current);
  el.title.textContent = c ? c.title : "New chat";
  if (c) c.messages.forEach(addBubble);
  if (c && c.messages.length && (state === "idle" || state === "unsupported")) {
    const d = document.createElement("div"); d.className = "msg ai"; d.dataset.status = "1";
    if (state === "idle") {
      d.innerHTML = '<div class="body">Start the AI to continue this chat.</div>';
      const b = document.createElement("button"); b.className = "btn primary"; b.style.marginTop = "10px"; b.textContent = "Start";
      b.onclick = () => loadAI(true); d.appendChild(b);
    } else d.innerHTML = '<div class="body">This device can\'t run the AI, but you can still read your chats.</div>';
    el.log.appendChild(d);
  }
  renderHero(); renderList(); refreshExplain();
}
function refreshExplain() {
  el.log.querySelectorAll(".explain").forEach((b) => b.remove());
  const c = current && getChat(current);
  if (!c || busy || state !== "ready") return;
  const last = c.messages[c.messages.length - 1];
  if (!last || last.role !== "assistant" || last.kind || last.detail || !last.content) return;
  const bubbles = el.log.querySelectorAll(".msg:not([data-status])");
  const bub = bubbles[bubbles.length - 1];
  if (!bub) return;
  const b = document.createElement("button"); b.className = "explain"; b.textContent = "Explain in detail";
  b.onclick = explainLast; bub.appendChild(b);
}

/* ---------- sidebar list ---------- */
function renderList() {
  const sorted = [...chats].sort((a, b) => b.updated - a.updated);
  el.list.innerHTML = sorted.length ? "" : '<div class="empty-list">No chats yet. Your conversations are saved here, on this device.</div>';
  sorted.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "chat-item" + (c.id === current ? " active" : "");
    row.style.animationDelay = Math.min(i * 30, 240) + "ms";
    row.innerHTML = '<button class="t"></button><button class="x" aria-label="Delete chat" title="Delete">×</button>';
    row.querySelector(".t").textContent = c.title;
    row.querySelector(".t").onclick = () => { openChat(c.id); closeMenu(); };
    row.querySelector(".x").onclick = (e) => { e.stopPropagation(); deleteChat(c.id); };
    el.list.appendChild(row);
  });
}
function newChat() { if (busy) return; current = null; clearAttach(); renderMessages(); if (state === "ready") el.input.focus(); }
function openChat(id) { if (busy) return; current = id; renderMessages(); }
function deleteChat(id) {
  if (busy) return;
  chats = chats.filter((c) => c.id !== id); persist();
  if (current === id) current = null;
  renderMessages(); toast("Chat deleted");
}

/* ---------- hero: welcome, onboarding, loading ---------- */
function setPill() {
  const map = { idle: ["", "Not started"], loading: ["busy", "Starting..."], unsupported: ["", "Not supported"], ready: ["ready", "Ready · " + shortName(activeId)] };
  const [cls, text] = map[state];
  el.pill.className = "pill " + cls; el.pillText.textContent = text;
}
function updateProgressUI() {
  const f = $("pfill"); if (!f) return;
  const ready = state === "ready";
  const pct = ready ? 100 : Math.round(progress.value * 100);
  f.style.width = pct + "%";
  const pp = $("ppct"), pt = $("ptext");
  if (pp) pp.textContent = ready ? "Ready" : pct + "%";
  if (pt) pt.textContent = ready ? "Your AI is ready ✓" : progress.text;
}
function renderHero() {
  const c = current && getChat(current);
  const hasMsgs = !!(c && c.messages.length);
  let view = null;
  if (onboarding && (state === "loading" || state === "ready")) view = "onboarding";
  else if (state === "loading") view = "loading";
  else if (!hasMsgs) view = state === "unsupported" ? "unsupported" : state === "idle" ? "idle" : "ready";
  el.hero.classList.toggle("hide", view === null);
  if (view === null) return;
  const card = el.heroCard;
  if (view === "onboarding" && card.dataset.view === "onboarding") { updateProgressUI(); return; } // never wipe what the person is typing
  card.dataset.view = view;
  card.className = "hero-card" + (view === "onboarding" ? " wide" : "");
  const nm = profile.name ? esc(profile.name) : "";
  if (view === "unsupported") {
    card.innerHTML = `<div class="logo">A</div><h2>Almost there</h2><p>This browser or device can't run Amusing AI yet.</p><div class="small err">${esc(supportInfo.reason)}</div>
      <p class="small" style="margin-top:14px">Try the latest Chrome or Edge on a laptop or desktop, or a recent iPhone/Mac with Safari 26+.</p>`;
  } else if (view === "idle") {
    card.innerHTML = `<div class="logo">A</div><h2>${nm ? "Welcome back, " + nm : "Hi, I'm Amusing"}</h2>
      <p>A free AI that runs privately on your own device.<br>No account. No bill.</p>
      <button class="btn primary" id="startBtn">Start</button>
      <p class="small" style="margin-top:16px">The first start downloads the AI once (roughly 1 GB for the default model). After that it opens fast.</p>
      <p class="small" style="margin-top:4px">Amusing AI &middot; by Md Taufiqur Rahman</p>
      ${progress.error ? `<div class="small err" style="margin-top:8px">${esc(progress.text)}</div>` : ""}`;
    $("startBtn").onclick = () => loadAI(true);
  } else if (view === "loading") {
    card.innerHTML = `<div class="logo">G</div><h2>Getting ready</h2><p>Setting up ${esc(shortName(loadingId))}. This happens once.</p>
      <div class="progress"><i id="pfill" style="width:${Math.round(progress.value * 100)}%"></i></div>
      <div class="small"><b id="ppct"></b> &middot; <span id="ptext"></span></div>`;
    updateProgressUI();
  } else if (view === "onboarding") {
    card.innerHTML = `<div class="logo">G</div><h2>Nice to meet you</h2>
      <p>Your AI is setting up. While you wait, tell me a little about you. <b>Everything here is optional.</b></p>
      <div class="progress thin"><i id="pfill"></i></div>
      <div class="small"><b id="ppct"></b> &middot; <span id="ptext"></span></div>
      <div class="field"><label for="obName">Name <i>Optional</i></label><input id="obName" autocomplete="given-name" placeholder="What should I call you?" value="${esc(profile.name)}"></div>
      <div class="field"><label for="obEmail">Email <i>Optional</i></label><input id="obEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(profile.email)}"><div class="hint err" id="obErr"></div></div>
      <div class="field"><label for="obJob">What do you do? <i>Optional</i></label><input id="obJob" placeholder="Student, developer, teacher..." value="${esc(profile.job)}"></div>
      <div class="chips left" style="margin-top:8px">${JOBS.map((j) => `<button class="chip sm" data-job="${j}">${j}</button>`).join("")}</div>
      <div class="hint" style="margin-top:10px">Saved only on this device. You can change or delete it anytime in Settings.</div>
      <div class="btn-row"><button class="btn primary" id="obSave">Continue</button><button class="btn link" id="obSkip">Skip</button></div>`;
    card.querySelectorAll("[data-job]").forEach((b) => (b.onclick = () => { $("obJob").value = b.dataset.job === "Other" ? "" : b.dataset.job; $("obJob").focus(); }));
    $("obSave").onclick = () => {
      const email = $("obEmail").value.trim();
      if (email && !validEmail(email)) { $("obErr").textContent = "That email doesn't look right. Fix it or leave it empty."; return; }
      profile = { name: $("obName").value.trim().slice(0, 40), email, job: $("obJob").value.trim().slice(0, 60), done: true };
      saveProfile(); finishOnboarding(true);
    };
    $("obSkip").onclick = () => { profile.done = true; saveProfile(); finishOnboarding(false); };
    updateProgressUI();
  } else {
    card.innerHTML = `<div class="logo">G</div><h2>${nm ? "Hi " + nm + ", what can I help with?" : "What can I help with?"}</h2><p>Type below, or try one of these.</p>
      <div class="chips">${SUGGESTIONS.map((s) => `<button class="chip">${esc(s)}</button>`).join("")}</div>`;
    card.querySelectorAll(".chip").forEach((b) => (b.onclick = () => { el.input.value = b.textContent; sendMsg(); }));
  }
}
function finishOnboarding(saved) {
  onboarding = false;
  renderHero();
  if (saved && profile.name) toast("Nice to meet you, " + profile.name + "!");
}
function setComposer() {
  const on = state === "ready" && !busy;
  el.input.disabled = state !== "ready";
  el.send.disabled = !on;
  el.attachBtn.disabled = busy;
  el.input.placeholder = state !== "ready" ? "Start the AI to begin chatting" : pendingImg ? "Ask about this picture" : "Message Amusing";
}

/* ---------- loading models ---------- */
let loadingId = DEFAULT_ID;
async function loadAI(userStarted, id = settings.model) {
  if (state === "loading") return;
  loadingId = id;
  state = "loading"; progress = { value: 0, text: "Preparing...", error: false };
  if (userStarted && !profile.done) onboarding = true;
  setPill(); setComposer(); renderMessages();
  try {
    if (ai) { try { await ai.unload(); } catch (_) {} }
    ai = new Gyan({ model: id, onProgress: (p) => {
      progress = { value: Math.max(0, Math.min(1, p.progress || 0)), text: String(p.text || "").slice(0, 120), error: false };
      updateProgressUI();
    } });
    await ai.load();
    activeId = id; state = "ready"; store.set("gyan.started", true);
    if (userStarted && !onboarding) toast("Ready. Everything runs on your device.");
  } catch (e) {
    ai = null; state = supportInfo.ok ? "idle" : "unsupported"; onboarding = false;
    progress = { value: 0, text: "Could not start: " + errMsg(e), error: true };
  }
  setPill(); setComposer(); renderMessages();
  if (state === "ready" && !onboarding) el.input.focus();
}
async function switchToVision() {
  if (!confirm("To look at pictures, Amusing needs its picture model (a few GB to download, needs a decent GPU). Download and switch now?")) return false;
  await loadAI(true, VISION_ID);
  return state === "ready" && isVision(activeId);
}

/* ---------- building a request ---------- */
function personaContext() {
  let s = "";
  if (profile.name) s += ` The user's name is ${profile.name}; use it only now and then.`;
  if (profile.job) s += ` About them: ${profile.job}.`;
  return s;
}
function llmHistory(c) {
  return c.messages.filter((m) => (!m.kind || m.kind === "explain") && typeof m.content === "string" && m.content)
    .map((m) => ({ role: m.role, content: m.content, img: m.img, kind: m.kind }));
}
function buildRequest(c, mode, userMsg) {
  const vlm = isVision(activeId), reasoning = isReasoning(activeId);
  const wantChart = !vlm && userMsg.kind !== "explain" && /\b(chart|graph|plot|pie|donut|bar chart|line chart)\b/i.test(userMsg.content || "");
  let sys = mode === "detail" ? DETAIL_SYS : mode === "normal" ? NORMAL_SYS : SHORT_SYS;
  const flavor = STYLES[settings.style] && STYLES[settings.style].flavor;
  if (flavor) sys += " " + flavor;
  sys += personaContext();
  if (wantChart) sys += CHART_HINT;
  const hist = llmHistory(c).slice(vlm ? -4 : -16);
  let messages;
  if (vlm) {
    const last = hist.length - 1;
    messages = hist.map((m, i) => {
      if (i === last && m.role === "user") {
        let img = m.img;
        if (!img && m.kind === "explain") { for (let j = i - 1; j >= 0 && !img; j--) if (hist[j].role === "user" && hist[j].img) img = hist[j].img; }
        const text = `${sys}\n\n${m.kind === "explain" ? "Explain your last answer in detail." : m.content}`;
        return { role: "user", content: img ? [{ type: "text", text }, { type: "image_url", image_url: { url: img } }] : text };
      }
      return { role: m.role, content: m.img ? "[picture] " + m.content : m.content };
    });
  } else if (reasoning) {
    messages = hist.map((m, i) => ({ role: m.role, content: i === hist.length - 1 && m.role === "user" ? `${sys}\n\n${m.content}` : m.content }));
  } else {
    const shots = mode === "short" && !wantChart ? SHOTS.flatMap(([u, a]) => [{ role: "user", content: u }, { role: "assistant", content: a }]) : [];
    messages = [{ role: "system", content: sys }, ...shots, ...hist.map((m) => ({ role: m.role, content: m.content }))];
  }
  const params = Object.assign({}, PARAMS[mode]);
  if (reasoning) params.max_tokens = 1500;
  else if (wantChart) params.max_tokens = Math.max(params.max_tokens, 400);
  return { messages, params };
}

function paint(out, full) {
  const thinking = /<think>/.test(full) && !/<\/think>/.test(full);
  const vis = stripThink(full).replace(/```chart[\s\S]*$/i, "").trim();
  if (vis && !thinking) { out._body.style.display = ""; out._body.innerHTML = md(vis); }
  else { out._body.style.display = ""; out._body.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>'; }
  el.log.scrollTop = el.log.scrollHeight;
}

/* ---------- one chat turn (send, or explain) ---------- */
async function runTurn(c, userMsg, mode) {
  busy = true; setComposer();
  el.send.style.display = "none"; el.stop.style.display = "";
  el.log.querySelectorAll(".explain").forEach((b) => b.remove());
  c.messages.push(userMsg); c.updated = Date.now();
  persist(); renderHero(); renderList();
  el.title.textContent = c.title;
  addBubble(userMsg);
  const out = addBubble({ role: "assistant", content: "" });
  paint(out, "");
  el.pill.className = "pill busy"; el.pillText.textContent = "Thinking...";
  let text = "", failed = null;
  try {
    const { messages, params } = buildRequest(c, mode, userMsg);
    const req = { messages, stream: true, temperature: params.temperature, max_tokens: params.max_tokens };
    if (isQwen3(activeId)) req.extra_body = { enable_thinking: false };
    const stream = await ai.chat.completions.create(req);
    let full = "", finish = null;
    for await (const chunk of stream) {
      const ch = chunk.choices && chunk.choices[0];
      if (!ch) continue;
      full += (ch.delta && ch.delta.content) || "";
      if (ch.finish_reason) finish = ch.finish_reason;
      paint(out, full);
    }
    text = finalize(full, finish, mode);
  } catch (e) { failed = e; }

  if (failed) {
    out.classList.add("err"); out._body.textContent = "Sorry, I couldn't answer that: " + errMsg(failed);
  } else if (!text) {
    out.remove();
  } else {
    let spec = null;
    const ex = extractChart(text);
    spec = ex.spec; text = ex.text.replace(/```chart[\s\S]*$/i, "").trim();
    const m = { role: "assistant", content: text }; if (mode === "detail") m.detail = true; if (spec) m.chart = spec;
    c.messages.push(m); c.updated = Date.now();
    out._body.innerHTML = md(text); out._body.style.display = text ? "" : "none"; out.dataset.raw = text;
    if (spec) { out.classList.add("wide"); out.appendChild(chartCard(spec)); }
    if (text) out.appendChild(copyBtn(() => out.dataset.raw));
    persist();
  }
  busy = false; el.send.style.display = ""; el.stop.style.display = "none";
  setPill(); setComposer(); renderList(); refreshExplain();
  el.log.scrollTop = el.log.scrollHeight;
  el.input.focus();
}

async function sendMsg() {
  let text = el.input.value.trim();
  const img = pendingImg;
  if ((!text && !img) || busy || state !== "ready") return;
  if (img && !isVision(activeId)) { if (!(await switchToVision())) return; }
  if (!text && img) text = "What's in this picture?";
  el.input.value = ""; autosize(); clearAttach();
  let c = current && getChat(current);
  if (!c) {
    const t = text.length > 40 ? text.slice(0, 40) + "..." : text;
    c = { id: uid(), title: t, messages: [], created: Date.now(), updated: Date.now() };
    chats.push(c); current = c.id;
  }
  onboarding = false;
  const msg = { role: "user", content: text }; if (img) msg.img = img;
  if (!img) {
    const intent = detectIntent(text);
    if (intent) { await handleIntent(c, msg, intent, text); return; }
  }
  await runTurn(c, msg, settings.length);
}

/* ---------- editing / video / image requests -> Amusing Studio ---------- */
const VIDEO_WORDS = "video|reel|promo|trailer|animation|motion graphics?|intro|outro|voice-?over|footage|clip|short film|ad";
function detectIntent(t) {
  const l = t.toLowerCase();
  if (/\b(edit|trim|cut|fix|cleanup|clean up|retouch|remove background)\b.{0,30}\b(video|voice|audio|photo|picture|image|clip|footage|recording|podcast)\b/.test(l)) return "edit";
  if (new RegExp("\\b(make|create|generate|build|produce|design|animate|render)\\b.{0,40}\\b(" + VIDEO_WORDS + ")\\b").test(l)) return "video";
  if (/\b(make|create|generate|draw|design)\b.{0,30}\b(image|picture|poster|banner|thumbnail|wallpaper|cover|flyer|card)\b/.test(l)) return "image";
  return null;
}
function studioUrl(text) { return "studio.html?prompt=" + encodeURIComponent(text.slice(0, 600)); }
async function handleIntent(c, msg, intent, text) {
  c.messages.push(msg);
  let reply;
  if (intent === "image") {
    try {
      const { renderFrame, sizeFor } = await import("./engine.js");
      const { storyboardFromPrompt, detectKind, DEFAULT_TASTE, parseTaste } = await import("./director.js");
      const subject = text.replace(/^(please\s+)?(can you\s+)?(make|create|generate|draw|design)\s+(me\s+)?(an?\s+|the\s+)?(image|picture|poster|banner|thumbnail|wallpaper|cover|flyer|card)\s*(of|for|about|with|showing|saying)?\s*/i, "").replace(/[.!?]+$/, "").trim() || "Hello";
      const title = subject.charAt(0).toUpperCase() + subject.slice(1, 70);
      const kind = detectKind(text);
      const taste = parseTaste(DEFAULT_TASTE);
      const project = storyboardFromPrompt(title, taste, { kind: "generic", aspect: "16:9", name: "Poster" });
      project.scenes = [{ id: "p1", type: "title", text: title, sub: "Made with Amusing AI", dur: 4, transition: "cut", mood: kind === "cinematic" ? "cinematic" : "neon", elements: [], items: [] }];
      const [w, h] = sizeFor("16:9", 720);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      renderFrame(cv.getContext("2d"), w, h, project, 3.2, {});
      const data = cv.toDataURL("image/jpeg", 0.88);
      reply = { role: "assistant", kind: "media", content: "Here is a designed graphic with your words. It is not an AI photo. For real AI pictures, turn on Image generation in Settings. You can restyle this in Studio.", img: data, studio: text };
    } catch (e) { console.error("poster", e); reply = { role: "assistant", kind: "studio", content: "I couldn't draw that here, but Studio can.", studio: text }; }
  } else if (intent === "video") {
    reply = { role: "assistant", kind: "studio", content: "Videos are made in Amusing Studio. I'll send your idea there, and it will build a first draft you can change.", studio: text };
  } else {
    reply = { role: "assistant", kind: "studio", content: "Editing happens in Amusing Studio. You can change voice, photos and video there, and circle with the pen to show where.", studio: text };
  }
  c.messages.push(reply); c.updated = Date.now();
  if (c.messages.length <= 2) c.title = text.length > 40 ? text.slice(0, 40) + "..." : text;
  persist(); renderMessages();
}
async function explainLast() {
  const c = current && getChat(current);
  if (!c || busy || state !== "ready") return;
  const last = c.messages[c.messages.length - 1];
  if (!last || last.role !== "assistant") return;
  await runTurn(c, { role: "user", kind: "explain", content: "Explain that in detail." }, "detail");
}

/* ---------- pictures to ask about ---------- */
function renderAttach() {
  el.attachRow.innerHTML = "";
  el.attachRow.hidden = !pendingImg;
  if (pendingImg) {
    const chip = document.createElement("div"); chip.className = "attach-chip";
    const im = document.createElement("img"); im.src = pendingImg; im.alt = "Picture to ask about";
    const x = document.createElement("button"); x.textContent = "×"; x.title = "Remove picture"; x.setAttribute("aria-label", "Remove picture");
    x.onclick = () => { clearAttach(); };
    chip.append(im, x); el.attachRow.appendChild(chip);
  }
  setComposer();
}
function clearAttach() { pendingImg = null; renderAttach(); }
async function attachImage(file) {
  try { pendingImg = await shrinkImage(file, 768); renderAttach(); el.input.focus(); }
  catch (_) { toast("I couldn't open that picture."); }
}

/* ---------- save / open chat files ---------- */
function cleanMessage(m) {
  if (!m || (m.role !== "user" && m.role !== "assistant")) return null;
  const out = { role: m.role, content: typeof m.content === "string" ? m.content : "" };
  if (m.kind === "explain" || m.kind === "chart" || m.kind === "media" || m.kind === "studio") out.kind = m.kind;
  if (typeof m.studio === "string" && m.studio) out.studio = m.studio.slice(0, 600);
  if (m.detail === true) out.detail = true;
  if (typeof m.img === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(m.img) && m.img.length < 600000) out.img = m.img;
  if (m.chart) { try { out.chart = normalizeSpec(m.chart); } catch (_) {} }
  return out.content || out.img || out.chart ? out : null;
}
function exportOne() {
  const c = current && getChat(current);
  if (!c) return toast("Nothing to save yet. Send a message first.");
  downloadJSON(`gyan-${slug(c.title)}-${dateStr()}.json`, { app: "gyan", version: 2, exportedAt: new Date().toISOString(), chats: [c] });
  toast("Chat saved to a file");
}
function exportAll() {
  if (!chats.length) return toast("No chats to save yet.");
  downloadJSON(`gyan-all-chats-${dateStr()}.json`, { app: "gyan", version: 2, exportedAt: new Date().toISOString(), chats });
  toast("All chats saved to a file");
}
function importFile(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      const incoming = Array.isArray(data.chats) ? data.chats : data.messages ? [data] : [];
      let added = 0, first = null;
      for (const raw of incoming) {
        const msgs = (Array.isArray(raw.messages) ? raw.messages : []).map(cleanMessage).filter(Boolean);
        if (!msgs.length) continue;
        const id = typeof raw.id === "string" && raw.id ? raw.id : uid();
        const title = String(raw.title || msgs.find((m) => m.content) && msgs.find((m) => m.content).content || "Chat").slice(0, 60);
        const chat = { id, title, messages: msgs, created: Number(raw.created) || Date.now(), updated: Number(raw.updated) || Date.now() };
        const ex = getChat(id);
        if (ex) { if (chat.updated > ex.updated) { Object.assign(ex, chat); added++; first = first || id; } }
        else { chats.push(chat); added++; first = first || id; }
      }
      if (!added) return toast("No new chats found in that file.");
      persist(); current = first; renderMessages();
      toast(added === 1 ? "Chat loaded. Continue where you left off." : added + " chats loaded");
    } catch (_) { toast("That doesn't look like an Amusing chat file."); }
  };
  r.readAsText(file);
}

/* ---------- model picker ---------- */
function renderModels(cached = new Set()) {
  $("modelList").innerHTML = ["chat", "coding", "reasoning", "vision"].map((k) =>
    `<div class="mgroup"><b>${esc(KINDS[k])}</b>${CATALOG.filter((m) => m.kind === k).map((m) => {
      const using = m.id === activeId && state === "ready";
      const badge = using ? '<span class="badge use">In use</span>' : cached.has(m.id) ? '<span class="badge ok">On this device</span>' : "";
      return `<button class="mrow ${m.id === activeId ? "on" : ""}" data-id="${esc(m.id)}"><div class="info"><b>${esc(m.name)} <span>· ${esc(m.maker)}</span></b><span>${esc(m.note)} · ${gb(m.mb)} GPU memory · ${fitLabel(m.mb)}</span></div>${badge}</button>`;
    }).join("")}</div>`).join("");
}
async function openModels() {
  renderModels(); $("models").showModal(); closeMenu();
  const have = await Promise.all(CATALOG.map((m) => Gyan.cached(m.id).then((v) => (v ? m.id : null)).catch(() => null)));
  if ($("models").open) renderModels(new Set(have.filter(Boolean)));
}
function pickModel(id) {
  if (busy) return toast("Wait for the answer to finish first.");
  const m = byId(id); if (!m) return;
  if (id === activeId && state === "ready") { toast("Already using " + m.name); return; }
  if (m.mb >= 4000 && !confirm(`${m.name} needs a strong GPU and a big download. Continue?`)) return;
  $("models").close();
  if (!isVision(id)) { settings.model = id; saveSettings(); }
  toast("Switching to " + m.name + "...");
  loadAI(true, id);
}

/* ---------- settings ---------- */
function renderSettings() {
  $("aboutName").value = profile.name; $("aboutEmail").value = profile.email; $("aboutJob").value = profile.job;
  $("lengthOpts").innerHTML = Object.entries(LENGTHS).map(([k, v]) =>
    `<button class="opt ${settings.length === k ? "on" : ""}" data-len="${k}"><div><b>${v.name}</b><span>${v.note}</span></div></button>`).join("");
  $("styleOpts").innerHTML = Object.entries(STYLES).map(([k, v]) =>
    `<button class="opt ${settings.style === k ? "on" : ""}" data-style="${k}"><div><b>${v.name}</b><span>${v.note}</span></div></button>`).join("");
  $("comfyUrl").value = settings.comfyUrl; $("wfImage").value = store.raw("gyan.wf.image"); $("wfVideo").value = store.raw("gyan.wf.video");
  $("comfyStatus").textContent = ""; $("comfyStatus").className = "hint";
  $("genImg").checked = !!settings.genImg; $("genVid").checked = !!settings.genVid; applyExtras();
}
function applyExtras() {
  const any = settings.genImg || settings.genVid;
  $("openCreate").hidden = !any;
  $("comfySetup").hidden = !any;
  $("wfImageF").hidden = !settings.genImg; $("wfVideoF").hidden = !settings.genVid;
  $("tabImage").hidden = !settings.genImg; $("tabVideo").hidden = !settings.genVid;
  if (createTab === "image" && !settings.genImg && settings.genVid) setCreateTab("video");
  if (createTab === "video" && !settings.genVid && settings.genImg) setCreateTab("image");
}
for (const [id, key] of [["genImg", "genImg"], ["genVid", "genVid"]]) {
  $(id).addEventListener("change", () => { settings[key] = $(id).checked; saveSettings(); applyExtras(); toast($(id).checked ? "Turned on" : "Turned off"); });
}
for (const [id, key] of [["aboutName", "name"], ["aboutEmail", "email"], ["aboutJob", "job"]]) {
  $(id).addEventListener("input", () => { profile[key] = $(id).value.trim().slice(0, key === "job" ? 60 : 40); profile.done = true; saveProfile(); });
}
$("lengthOpts").addEventListener("click", (e) => { const b = e.target.closest("[data-len]"); if (!b) return; settings.length = b.dataset.len; saveSettings(); renderSettings(); toast("Answers: " + LENGTHS[settings.length].name); });
$("styleOpts").addEventListener("click", (e) => { const b = e.target.closest("[data-style]"); if (!b) return; settings.style = b.dataset.style; saveSettings(); renderSettings(); toast("Style: " + STYLES[settings.style].name); });
$("comfyUrl").addEventListener("change", () => { settings.comfyUrl = $("comfyUrl").value.trim() || "http://127.0.0.1:8188"; saveSettings(); });
$("comfyTest").onclick = async () => {
  const s = $("comfyStatus"); s.className = "hint"; s.textContent = "Checking...";
  settings.comfyUrl = $("comfyUrl").value.trim() || "http://127.0.0.1:8188"; saveSettings();
  const r = await new Comfy(settings.comfyUrl).ping();
  s.className = "hint " + (r.ok ? "ok" : "err");
  s.textContent = r.ok ? "Connected to " + r.name + " ✓" : r.reason;
};
for (const [id, kind] of [["wfImage", "image"], ["wfVideo", "video"]]) {
  $(id).addEventListener("change", () => {
    const v = $(id).value.trim(), s = $("comfyStatus");
    if (!v) { store.setRaw("gyan.wf." + kind, ""); s.className = "hint"; s.textContent = ""; return; }
    try { checkWorkflow(v); store.setRaw("gyan.wf." + kind, v); s.className = "hint ok"; s.textContent = (kind === "image" ? "Image" : "Video") + " workflow saved ✓"; }
    catch (e) { s.className = "hint err"; s.textContent = (kind === "image" ? "Image" : "Video") + " workflow: " + errMsg(e); }
  });
}
$("chooseModel").onclick = () => { $("settings").close(); openModels(); };
$("exportAll").onclick = exportAll;
$("importBtn").onclick = () => el.file.click();
$("delChats").onclick = () => { if (confirm("Delete all saved chats on this device?")) { chats = []; current = null; persist(); renderMessages(); toast("All chats deleted"); } };
$("clearProfile").onclick = () => { if (confirm("Forget your name, email and job on this device?")) { profile = { name: "", email: "", job: "", done: true }; saveProfile(); renderSettings(); renderHero(); toast("Your details were removed"); } };
$("delModel").onclick = async () => {
  if (!confirm("Remove the downloaded AI from this device? You can download it again later.")) return;
  const id = activeId;
  try { if (ai) { await ai.unload(); ai = null; } await new Gyan({ model: id }).clearCache(); }
  catch (e) { return toast("Could not remove: " + errMsg(e)); }
  state = supportInfo.ok ? "idle" : "unsupported"; store.set("gyan.started", false);
  progress = { value: 0, text: "", error: false }; setPill(); setComposer(); renderMessages(); toast("Downloaded AI removed");
};

/* ---------- chart maker ---------- */
let chartSpec = null;
function updateChartPreview() {
  const data = $("chartData").value.trim();
  $("chartErr").textContent = ""; chartSpec = null; $("chartPng").disabled = true; $("chartAdd").disabled = true;
  if (!data) { $("chartPreview").innerHTML = ""; return; }
  try {
    const t = parseTable(data);
    chartSpec = normalizeSpec({ type: $("chartType").value, title: $("chartTitle").value.trim(), labels: t.labels, series: t.series });
  } catch (e) { $("chartErr").textContent = errMsg(e); $("chartPreview").innerHTML = ""; return; }
  $("chartPreview").replaceChildren(chartCard(chartSpec));
  $("chartPng").disabled = false; $("chartAdd").disabled = false;
}
for (const id of ["chartData", "chartTitle", "chartType"]) $(id).addEventListener("input", updateChartPreview);
$("chartPng").onclick = () => chartSpec && svgToPng(chartSVG(chartSpec, { theme: isDark() ? "dark" : "light" }), 2)
  .then((b) => downloadBlob("amusing-chart.png", b)).catch(() => toast("Couldn't make the picture."));
$("chartAdd").onclick = () => {
  if (!chartSpec || busy) return;
  let c = current && getChat(current);
  if (!c) { c = { id: uid(), title: chartSpec.title || "Chart", messages: [], created: Date.now(), updated: Date.now() }; chats.push(c); current = c.id; }
  c.messages.push({ role: "assistant", kind: "chart", content: "", chart: chartSpec }); c.updated = Date.now();
  persist(); $("chart").close(); renderMessages(); toast("Chart added to the chat");
};

/* ---------- create images and videos (your own ComfyUI) ---------- */
let createTab = "image", createAbort = null, createResult = null;
function setCreateTab(t) {
  createTab = t;
  $("tabImage").classList.toggle("on", t === "image"); $("tabVideo").classList.toggle("on", t === "video");
  $("createNote").textContent = t === "video"
    ? "Video needs a strong GPU and can take several minutes. Uses the video workflow from Settings."
    : "Uses the image workflow from Settings (FLUX, Qwen-Image, SDXL...).";
}
function clearCreateResult() {
  if (createResult && createResult.url) URL.revokeObjectURL(createResult.url);
  createResult = null; $("createOut").innerHTML = ""; $("createActions").hidden = true;
}
async function doCreate() {
  const prompt = $("createPrompt").value.trim();
  if (!prompt) return toast("Describe what to create first.");
  const wf = store.raw("gyan.wf." + createTab);
  if (!wf) { toast("Add a ComfyUI workflow in Settings first."); $("create").close(); renderSettings(); $("settings").showModal(); return; }
  clearCreateResult();
  createAbort = new AbortController();
  $("createGo").disabled = true; $("createStopBtn").style.display = "";
  $("createBar").hidden = false; $("createFill").style.width = "6%"; $("createStatus").className = "small"; $("createStatus").textContent = "Starting...";
  try {
    const r = await new Comfy(settings.comfyUrl).run(wf, { prompt, want: createTab, signal: createAbort.signal,
      onProgress: (p) => { if (p.pct != null) $("createFill").style.width = Math.max(6, Math.round(p.pct * 100)) + "%"; if (p.text) $("createStatus").textContent = p.text; } });
    const url = URL.createObjectURL(r.blob);
    createResult = { blob: r.blob, kind: r.kind, url, filename: r.filename, prompt };
    const media = r.kind === "video" ? document.createElement("video") : document.createElement("img");
    media.className = "media"; media.src = url;
    if (r.kind === "video") { media.controls = true; media.loop = true; media.muted = true; media.autoplay = true; media.playsInline = true; } else media.alt = prompt;
    $("createOut").replaceChildren(media);
    $("createDownload").href = url; $("createDownload").download = r.filename;
    $("createAdd").style.display = r.kind === "image" ? "" : "none";
    $("createActions").hidden = false; $("createStatus").textContent = "Done ✓";
  } catch (e) {
    $("createStatus").className = "small err";
    $("createStatus").textContent = e && e.name === "AbortError" ? "Stopped." : errMsg(e);
  }
  $("createGo").disabled = false; $("createStopBtn").style.display = "none"; $("createBar").hidden = true; createAbort = null;
}
$("createGo").onclick = doCreate;
$("createStopBtn").onclick = () => createAbort && createAbort.abort();
$("tabImage").onclick = () => setCreateTab("image");
$("tabVideo").onclick = () => setCreateTab("video");
$("createAdd").onclick = async () => {
  if (!createResult || createResult.kind !== "image" || busy) return;
  try {
    const img = await shrinkImage(createResult.blob, 768);
    let c = current && getChat(current);
    if (!c) { c = { id: uid(), title: createResult.prompt.slice(0, 40), messages: [], created: Date.now(), updated: Date.now() }; chats.push(c); current = c.id; }
    c.messages.push({ role: "assistant", kind: "media", content: createResult.prompt, img }); c.updated = Date.now();
    persist(); $("create").close(); renderMessages(); toast("Picture added to the chat");
  } catch (_) { toast("Couldn't add the picture."); }
};

/* ---------- wiring ---------- */
function closeMenu() { el.app.classList.remove("open"); }
$("menuBtn").onclick = () => el.app.classList.toggle("open");
$("scrim").onclick = closeMenu;
$("newChat").onclick = () => { newChat(); closeMenu(); };
$("openFile").onclick = () => { el.file.click(); closeMenu(); };
$("saveBtn").onclick = exportOne;
$("openSettings").onclick = () => { renderSettings(); $("settings").showModal(); closeMenu(); };
$("openModels").onclick = openModels;
$("modelList").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) pickModel(b.dataset.id); });
$("openChart").onclick = () => { $("chart").showModal(); closeMenu(); };
$("openCreate").onclick = () => { setCreateTab(createTab); $("create").showModal(); closeMenu(); };
$("openDev").onclick = () => {
  $("snip").textContent =
`<script type="module">
  import { Gyan } from "${location.origin}/gyan.js";

  const ai = new Gyan({ model: "small" });
  const reply = await ai.ask("Explain recursion simply");
  console.log(reply);
<\/script>`;
  $("dev").showModal(); closeMenu();
};
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
el.file.onchange = () => { if (el.file.files[0]) importFile(el.file.files[0]); el.file.value = ""; };
el.attachBtn.onclick = () => el.imgFile.click();
el.imgFile.onchange = () => { const f = el.imgFile.files[0]; el.imgFile.value = ""; if (f) attachImage(f); };
el.input.addEventListener("paste", (e) => {
  const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => x.type && x.type.startsWith("image/"));
  if (f) { e.preventDefault(); attachImage(f); }
});
el.send.onclick = sendMsg;
el.stop.onclick = () => ai && ai.interrupt();
function autosize() { el.input.style.height = "auto"; el.input.style.height = Math.min(el.input.scrollHeight, 160) + "px"; }
el.input.addEventListener("input", autosize);
el.input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMsg(); } });
if (window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const redraw = () => document.querySelectorAll(".chart-card").forEach((c) => c._redraw && c._redraw());
  if (mq.addEventListener) mq.addEventListener("change", redraw);
}

/* ---------- boot ---------- */
(async () => {
  Gyan.prewarm();
  renderMessages(); setPill(); setComposer(); setCreateTab(settings.genImg || !settings.genVid ? "image" : "video"); applyExtras();
  supportInfo = await Gyan.support();
  if (!supportInfo.ok) { state = "unsupported"; setPill(); renderMessages(); return; }
  // Returning visitor: if the AI is already downloaded, start it automatically.
  if (store.get("gyan.started", false)) {
    try { if (await Gyan.cached(settings.model)) loadAI(false, settings.model); } catch (_) {}
  }
})();
