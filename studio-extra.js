// Amusing Studio extras: export, voiceover editor, taste file, settings and the guide bot.
import * as C from "./studio-core.js";
import { renderFrame, sizeFor, totalDuration } from "./engine.js";
import { parseTaste, teachRule, DEFAULT_TASTE, fitToDuration, lengthsFromSegments } from "./director.js";
import { slice, tightenPauses, gain, analyze, recordMic } from "./audioedit.js";
import { creditsText } from "./assets.js";
import { DEFAULT_ID } from "./models.js";

const { st, $, esc, fmt, toast, errMsg, slug } = C;
const download = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

export function initExtras(api) {
  /* ---------------- export ---------------- */
  let exporting = null;
  $("exportBtn").onclick = () => { C.pause(); api.setPenMode(false); resetExport(); $("expQ").value = C.lsRaw("ts.q", "720"); $("exportDlg").showModal(); };
  function resetExport() { $("expOut").innerHTML = ""; $("expActions").hidden = true; $("expBar").hidden = true; $("expStatus").textContent = ""; $("expGo").disabled = false; $("expStop").hidden = true; }
  $("expGo").onclick = async () => {
    if (!st.project || exporting) return; resetExport(); const q = +$("expQ").value; C.lsSetRaw("ts.q", String(q));
    if (typeof MediaRecorder === "undefined") { $("expStatus").textContent = "This browser cannot record video. Use a recent Chrome, Edge or Safari."; return; }
    const [W, H] = sizeFor(st.project.aspect, q), T = C.total(); const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const res = { images: st.res.images, videos: st.res.videos, preview: false, makeCanvas: st.res.makeCanvas };
    const hasAudio = !!st.audio || scenes().some((s) => (s.elements || []).some((e) => e.kind === "video"));
    const mimes = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]; const mime = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const stream = c.captureStream(30); let dest = null; if (hasAudio) { dest = C.exportTap(); if (dest) dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); }
    let rec; try { rec = new MediaRecorder(stream, Object.assign({ videoBitsPerSecond: q >= 1080 ? 10e6 : 6e6 }, mime ? { mimeType: mime } : {})); } catch (e) { C.exportUntap(); $("expStatus").textContent = "Could not start recording: " + errMsg(e); return; }
    const chunks = []; rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    let stopped = false, aborted = false; $("expGo").disabled = true; $("expStop").hidden = false; $("expBar").hidden = false; $("expFill").style.width = "2%";
    exporting = { stop: () => { aborted = true; stopped = true; } };
    const done = new Promise((ok) => { rec.onstop = ok; });
    C.seek(0, { keepPlaying: false }); C.ensureAudio(); const ac = C.audioContext(); if (ac && ac.state === "suspended") await ac.resume(); C.applyClipVolumes();
    rec.start(250); const t0 = performance.now(); C.startVoice(0);
    await new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000; if (stopped || t >= T + 0.25) return resolve();
        C.syncVideos(Math.min(t, T - 0.001), true); renderFrame(g, W, H, st.project, Math.min(t, T - 0.001), res);
        $("expFill").style.width = Math.max(2, Math.round((t / T) * 100)) + "%"; $("expStatus").textContent = document.hidden ? "Keep this tab visible, recording pauses in the background." : `Recording ${fmt(t)} of ${fmt(T)}`; requestAnimationFrame(tick);
      }; requestAnimationFrame(tick);
    });
    rec.stop(); C.stopVoice(); await done; C.exportUntap(); C.syncVideos(0, false); exporting = null; $("expStop").hidden = true; $("expGo").disabled = false; $("expBar").hidden = true;
    if (aborted) { $("expStatus").textContent = "Stopped."; return; }
    const type = (rec.mimeType || mime || "video/webm").split(";")[0]; const blob = new Blob(chunks, { type }); const ext = type.includes("mp4") ? "mp4" : "webm";
    if (!blob.size) { $("expStatus").textContent = "The recording came out empty. Try again with this tab in front."; return; }
    const url = URL.createObjectURL(blob); const v = document.createElement("video"); v.src = url; v.controls = true; v.className = "media"; $("expOut").replaceChildren(v);
    $("expDl").href = url; $("expDl").download = slug(st.project.name) + "." + ext; $("expActions").hidden = false; $("expStatus").textContent = `Done: ${(blob.size / 1e6).toFixed(1)} MB ${ext.toUpperCase()}${ext === "webm" ? ". WebM plays in Chrome, Edge, Firefox and most editors; use a converter if you need MP4." : ""}`;
    const cr = creditsText(st.project); const cl = $("expCredits"); if (cr) { cl.hidden = false; cl.href = URL.createObjectURL(new Blob([cr], { type: "text/plain" })); cl.download = slug(st.project.name) + "-credits.txt"; } else cl.hidden = true;
    C.draw();
  };
  const scenes = () => (st.project ? st.project.scenes : []);
  $("expStop").onclick = () => exporting && exporting.stop();
  $("exportDlg").addEventListener("close", () => exporting && exporting.stop());

  /* ---------------- voiceover editor ---------------- */
  let work = null, undoStack = [], rec = null, preview = null;
  const cloneAudio = (a) => (a ? Object.assign({}, a) : null);
  function drawVoice() {
    const cv = $("vWave"), g = cv.getContext("2d"); cv.width = cv.clientWidth || 500; const W = cv.width, Hh = cv.height; g.clearRect(0, 0, W, Hh);
    if (!work) { g.fillStyle = "rgba(255,255,255,.4)"; g.font = "13px sans-serif"; g.fillText("No voiceover yet", 14, Hh / 2); return; }
    g.fillStyle = "rgba(94,234,160,.18)"; work.speech.forEach((s) => g.fillRect((s.start / work.duration) * W, 0, ((s.end - s.start) / work.duration) * W, Hh));
    g.fillStyle = "rgba(122,162,255,.9)"; const pk = work.peaks, n = pk.length, mid = Hh / 2; for (let x = 0; x < W; x += 2) { const v = pk[Math.min(n - 1, Math.floor((x / W) * n))] || 0; const h = Math.max(1, v * (Hh - 8) * (work.gain || 1)); g.fillRect(x, mid - h / 2, 1.4, Math.min(h, Hh)); }
  }
  function refreshVoice() {
    $("vInfo").textContent = work ? `${work.name} · ${fmt(work.duration)} (${work.duration.toFixed(1)} s) · ${work.speech.length} spoken parts` : "No voiceover yet. Add a file or record one.";
    $("vUndo").disabled = !undoStack.length; $("vPlay").disabled = !work; $("vTrim").disabled = !work; $("vTight").disabled = !work || !work.speech.length; $("vVol").value = work && work.gain != null ? work.gain : 1; $("vVolT").textContent = Math.round(($("vVol").value) * 100) + "%"; drawVoice();
  }
  function setWork(a) { if (work) undoStack.push(cloneAudio(work)); work = a; refreshVoice(); }
  $("voiceBtn").onclick = () => { C.pause(); work = cloneAudio(st.audio); undoStack = []; $("vRecNote").textContent = ""; $("vStart").value = 0; $("vEnd").value = 0; $("voiceDlg").showModal(); refreshVoice(); };
  const pickFile = () => new Promise((ok) => { const i = $("audioFile"); i.onchange = () => { const f = i.files[0]; i.value = ""; ok(f || null); }; i.click(); });
  $("vAdd").onclick = async () => { const f = await pickFile(); if (!f) return; try { const a = await C.loadAudioFile(f); setWork(a); } catch (_) { toast("Could not read that audio file."); } };
  $("vRec").onclick = async () => {
    if (rec) { const r = rec; rec = null; $("vRec").textContent = "Record"; $("vRecNote").textContent = "Processing..."; try { const blob = await r.stop(); const a = await C.loadAudioFile(new File([blob], "My recording")); a.name = "My recording"; setWork(a); $("vRecNote").textContent = ""; } catch (e) { $("vRecNote").textContent = "Could not use that recording."; } return; }
    try { rec = await recordMic(); $("vRec").textContent = "Stop"; $("vRecNote").textContent = "Recording... speak now, then press Stop."; } catch (e) { $("vRecNote").textContent = errMsg(e); }
  };
  $("vPlay").onclick = () => {
    if (preview) { try { preview.stop(); } catch (_) {} preview = null; $("vPlay").textContent = "Listen"; return; }
    const ac = C.ensureAudio(); if (!ac || !work) return; ac.resume(); const s = ac.createBufferSource(); s.buffer = work.buffer; const g = ac.createGain(); g.gain.value = work.gain == null ? 1 : work.gain; s.connect(g); g.connect(ac.destination); s.onended = () => { preview = null; $("vPlay").textContent = "Listen"; }; s.start(); preview = s; $("vPlay").textContent = "Stop";
  };
  $("vTrim").onclick = () => { if (!work) return; const a = Math.max(0, +$("vStart").value || 0), b = Math.max(0, +$("vEnd").value || 0); if (a + b >= work.duration - 0.3) return toast("That would cut everything."); if (!a && !b) return toast("Type how many seconds to cut."); const nb = slice(work.buffer, a, work.duration - b); const out = Object.assign(analyze(nb), { name: work.name, blob: null, gain: work.gain }); setWork(out); $("vStart").value = 0; $("vEnd").value = 0; };
  $("vTight").onclick = () => { if (!work) return; const nb = tightenPauses(work.buffer, work.speech); const out = Object.assign(analyze(nb), { name: work.name, blob: null, gain: work.gain }); const saved = work.duration - out.duration; setWork(out); toast(saved > 0.1 ? `Shortened by ${saved.toFixed(1)} s` : "No long pauses found"); };
  $("vVol").oninput = () => { if (!work) return; work.gain = +$("vVol").value; $("vVolT").textContent = Math.round(work.gain * 100) + "%"; drawVoice(); };
  $("vUndo").onclick = () => { if (!undoStack.length) return; work = undoStack.pop(); refreshVoice(); };
  $("vDone").onclick = () => { if (preview) { try { preview.stop(); } catch (_) {} preview = null; } if (rec) { rec.stop().catch(() => {}); rec = null; $("vRec").textContent = "Record"; } st.audio = work; C.schedulePersist(); api.setProjectUI(); api.renderTimeline(); $("voiceDlg").close(); toast(work ? "Voiceover updated" : "Voiceover removed"); };
  $("voiceDlg").addEventListener("close", () => { if (preview) { try { preview.stop(); } catch (_) {} preview = null; $("vPlay").textContent = "Listen"; } });
  $("splitBtn").onclick = () => { if (!st.audio || !st.project) return; const p = st.project; if (!lengthsFromSegments(p, st.audio.speech, st.audio.duration)) fitToDuration(p, st.audio.duration, totalDuration); C.changed({ panel: true }); toast("Scene lengths now match your voice"); };

  /* ---------------- taste file ---------------- */
  const showTaste = () => { $("tasteText").value = st.tasteText; const w = parseTaste($("tasteText").value).warnings; $("tasteWarn").textContent = w.join(". "); };
  $("tasteBtn").onclick = () => { showTaste(); $("tasteDlg").showModal(); $("app").classList.remove("open"); };
  $("tasteText").addEventListener("input", () => { $("tasteWarn").textContent = parseTaste($("tasteText").value).warnings.join(". "); });
  $("teachGo").onclick = () => { const r = $("teachIn").value.trim(); if (!r) return; $("tasteText").value = teachRule($("tasteText").value, r); $("teachIn").value = ""; $("tasteWarn").textContent = parseTaste($("tasteText").value).warnings.join(". "); toast("Rule added. Press Save to keep it."); };
  $("tasteSave").onclick = () => { st.tasteText = $("tasteText").value; st.taste = parseTaste(st.tasteText); C.lsSetRaw("ts.taste", st.tasteText); $("tasteDlg").close(); toast("Taste saved. New videos will follow it."); };
  $("tasteReset").onclick = () => { if (confirm("Go back to the default taste?")) { $("tasteText").value = DEFAULT_TASTE; $("tasteWarn").textContent = ""; } };

  /* ---------------- settings ---------------- */
  $("settingsBtn").onclick = () => { $("keyPexels").value = st.settings.pexelsKey || ""; $("keyPixabay").value = st.settings.pixabayKey || ""; $("setAi").checked = !!st.settings.ai; $("aiStatus").textContent = st.ai ? "AI helper is ready." : ""; $("setDlg").showModal(); $("app").classList.remove("open"); };
  $("keyPexels").onchange = () => { st.settings.pexelsKey = $("keyPexels").value.trim(); C.saveSettings(); };
  $("keyPixabay").onchange = () => { st.settings.pixabayKey = $("keyPixabay").value.trim(); C.saveSettings(); };
  $("setAi").onchange = async () => {
    const on = $("setAi").checked; st.settings.ai = on; C.saveSettings(); const s = $("aiStatus"); if (!on) { s.textContent = "Off."; return; } if (st.ai) { s.textContent = "AI helper is ready."; return; }
    try {
      s.textContent = "Checking your device..."; const { Gyan } = await import("./gyan.js"); const sup = await Gyan.support(); if (!sup.ok) throw new Error(sup.reason);
      const g = new Gyan({ model: DEFAULT_ID, onProgress: (p) => { s.textContent = `Downloading the AI (first time only): ${Math.round((p.progress || 0) * 100)}%`; } }); await g.load(); st.ai = g; s.textContent = "AI helper is ready.";
    } catch (e) { st.settings.ai = false; $("setAi").checked = false; C.saveSettings(); s.className = "hint err"; s.textContent = "Could not start the AI: " + errMsg(e) + " The Studio still works with its built-in planner."; }
  };
  $("saveFile").onclick = () => { if (!st.project) return toast("Make a video first."); download(slug(st.project.name) + ".amusing.json", new Blob([JSON.stringify({ app: "amusing-studio", version: 1, exportedAt: new Date().toISOString(), project: st.project })], { type: "application/json" })); toast("Saved. Voiceover and video clips are not inside the file."); };
  $("delAll").onclick = async () => { if (!confirm("Delete all your videos from this device?")) return; for (const p of await C.idbAll("projects")) await C.idbDel("projects", p.id); api.newProject(); toast("All videos deleted"); };

  initGuide(api);
}

/* ---------------- guide bot ---------------- */
function initGuide(api) {
  const STEPS = [
    { sel: "#prompt", mode: "simple", text: "Start here. Describe your video in your own words: a promo for your app, a cinematic intro, a quick explainer. You can also open Chat and ask for a video, and it will send your idea here." },
    { sel: "#attachAudio", mode: "simple", text: "Optional: add your voiceover. I will match the scene lengths to your voice and you can trim it or cut the long pauses later." },
    { sel: "#attachRef", mode: "simple", text: "Optional: add a picture or video you like. I copy its colours and its pace, not its content." },
    { sel: "#makeBtn", mode: "simple", text: "Press this and I will plan the scenes and play your first cut. Not happy? Change a few words and press it again." },
    { sel: "#modeAdv", mode: "simple", text: "Want full control? Switch to Advanced to edit scene by scene." },
    { sel: "#tlScroll", mode: "adv", text: "This is your timeline. Click a scene to edit it, drag its right edge to change its length, and click the ruler to jump around. Your voice shows underneath." },
    { sel: "#instr", mode: "adv", text: "Tell the scene what to do in plain words. For example: neon mood, 3 seconds, add Stripe and Notion logos. I understand the words you type and show what I understood." },
    { sel: "#elemBox", mode: "adv", text: "Logos and photos I find show up here, with their credits. Swap them, adjust a photo, trim a video clip, or upload your own." },
    { sel: "#penBtn", mode: "adv", text: "The pen: turn it on, circle something on the preview, and say what to change. For example circle the headline and say make it red, or change to \"Hello\"." },
    { sel: "#voiceBtn", mode: "adv", text: "Edit your voiceover here: trim it, shorten long pauses, change the volume or record a new take." },
    { sel: "#tasteBtn", mode: "adv", text: "Teach me your taste: pace, mood, transitions and your own rules. New videos follow it." },
    { sel: "#exportBtn", mode: "adv", text: "When you are happy, export. It records in real time, so keep this tab open." },
  ];
  const FAQ = [
    [/logo/, "Type it in the scene box, like: add Stripe and Notion logos. I fetch the logos for free. If I can't find one I make a letter badge, and you can upload your own with Upload logo."],
    [/photo|image|picture|stock|background/, "In the scene box type: photo of a rainy street at night. Or use Find a free photo in Logos and photos. You can upload your own too, and Edit lets you change colours and framing."],
    [/pen|circle|mark|point/, "Press the pen button under the preview, circle or underline what you want to change, then type or say it: make it red, bigger, change to \"Hello\", remove, add Stripe logo. Undo is Ctrl+Z."],
    [/voice|audio|record|mic|speech|sound/, "Use Voiceover (in Advanced) to add a file or record one, trim it, shorten long pauses and change the volume. Then press Fit scenes to my voice."],
    [/video clip|footage|my video|upload video/, "In Advanced choose + Add scene, then Video clip. You can trim where it starts and ends and set its sound level."],
    [/export|download|save|mp4|webm/, "Press Export, pick the quality and Start. It records in real time on your device, so keep the tab open. You get a WebM or MP4 file, plus a credits file if you used stock photos."],
    [/saas|app|software|startup|product|dashboard/, "For software videos describe your product in Simple mode, or in Advanced add SaaS scenes: hero, features, dashboard with a clicking cursor, steps and call to action."],
    [/cinematic|film|mood|style|look|taste|teach|learn/, "Open My taste and rules. Lines like pace: slow or transition: dissolve are applied every time. Type a rule like always use slide transitions and press Add."],
    [/mobile|reel|short|tiktok|vertical|9:16|square/, "Use the shape menu at the top: 9:16 tall for Reels, Shorts and TikTok, 1:1 for square, 16:9 for YouTube."],
    [/undo|mistake|wrong/, "Press Ctrl+Z (Cmd+Z on Mac) or the undo arrow under the preview."],
    [/ai|model|smart/, "In Settings you can turn on the AI helper. It uses the same free in-browser model as Chat and plans your scenes. Without it, the built-in planner still works."],
  ];
  let step = -1; const card = $("guideCard");
  const spot = (sel) => { const el = sel && document.querySelector(sel); const s = $("spot"); if (!el || el.offsetParent === null) { s.hidden = true; return; } el.scrollIntoView({ block: "nearest", behavior: "smooth" }); const r = el.getBoundingClientRect(); s.hidden = false; Object.assign(s.style, { left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" }); };
  const buttons = (list) => { $("guideBtns").innerHTML = list.map(([id, label, cls]) => `<button class="btn ${cls || "soft"} sm" data-g="${id}">${esc(label)}</button>`).join(""); };
  function say(text, btns) { card.hidden = false; $("guideMsg").textContent = text; $("guideStep").textContent = step >= 0 ? `Step ${step + 1} of ${STEPS.length}` : "Here to help"; buttons(btns || [["tour", "Show me around", "primary"]]); }
  function go(i) {
    if (i < 0) i = 0; if (i >= STEPS.length) { end(); say("That is the tour. Ask me anything below, any time.", [["tour", "Replay the tour"]]); return; }
    step = i; const s = STEPS[i]; if (s.mode && s.mode !== st.mode) api.setMode(s.mode);
    setTimeout(() => { say(s.text, [["back", "Back"], ["next", i === STEPS.length - 1 ? "Finish" : "Next", "primary"], ["end", "Stop"]]); spot(s.sel); }, 80);
  }
  function end() { step = -1; $("spot").hidden = true; C.lsSetRaw("ts.toured", "1"); }
  $("guideBtns").onclick = (e) => { const b = e.target.closest("[data-g]"); if (!b) return; const g = b.dataset.g; if (g === "tour") go(0); else if (g === "next") go(step + 1); else if (g === "back") go(step - 1); else if (g === "end") { end(); say("No problem. Ask me anything below.", [["tour", "Show me around"]]); } else if (g === "no") { end(); card.hidden = true; } };
  $("guideFab").onclick = () => { if (card.hidden) say(step >= 0 ? STEPS[step].text : "Hi, I'm your guide. I can show you around or answer questions like how to add a logo or use the pen.", step >= 0 ? [["next", "Next", "primary"], ["end", "Stop"]] : [["tour", "Show me around", "primary"]]); else { card.hidden = true; $("spot").hidden = true; } };
  $("guideClose").onclick = () => { card.hidden = true; $("spot").hidden = true; if (step >= 0) end(); };
  $("guideAsk").onsubmit = (e) => { e.preventDefault(); const q = $("guideQ").value.trim(); if (!q) return; $("guideQ").value = ""; const l = q.toLowerCase(); const hit = FAQ.find(([re]) => re.test(l)); step = -1; $("spot").hidden = true; say(hit ? hit[1] : "I do not know that one yet. Try asking about logos, photos, the pen, voiceover, video clips, export, SaaS videos, shapes, undo or my taste.", [["tour", "Show me around"]]); };
  window.addEventListener("resize", () => { if (step >= 0) spot(STEPS[step].sel); });
  st.hooks.guideSay = (t) => { if (step < 0) say(t, [["tour", "Show me around"], ["no", "Hide"]]); };
  if (!C.lsRaw("ts.toured")) setTimeout(() => {
    if (!card.hidden) return; const tip = document.createElement("button"); tip.className = "guide-tip glass"; tip.textContent = "New here? Tap for a 1-minute tour"; tip.onclick = () => { tip.remove(); go(0); };
    $("guide").appendChild(tip); setTimeout(() => tip.remove(), 12000); $("guideFab").addEventListener("click", () => tip.remove(), { once: true });
  }, 900);
}
