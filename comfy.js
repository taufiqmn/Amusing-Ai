// Gyan <-> ComfyUI bridge. Lets the app create images and videos with the person's OWN ComfyUI
// (FLUX, Qwen-Image, Wan, LTX... whatever workflow they exported). Nothing is sent to any server of ours.

export class ComfyError extends Error {}

const IMG = /\.(png|jpe?g|webp|bmp)$/i;
const VID = /\.(mp4|webm|mov|mkv|gif)$/i;
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", bmp: "image/bmp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska" };
const ext = (f) => (String(f).split(".").pop() || "").toLowerCase();
export const mediaKind = (filename) => (VID.test(filename) && !/\.gif$/i.test(filename) ? "video" : IMG.test(filename) || /\.gif$/i.test(filename) ? "image" : "other");

/** Accept JSON text or an object. Must be ComfyUI's API format ("Save (API Format)"). */
export function checkWorkflow(input) {
  let wf = input;
  if (typeof input === "string") {
    if (!input.trim()) throw new ComfyError("Paste your ComfyUI workflow first (Settings, Create images & videos).");
    try { wf = JSON.parse(input); } catch (_) { throw new ComfyError("That workflow is not valid JSON. Export it from ComfyUI with 'Save (API Format)'."); }
  }
  if (!wf || typeof wf !== "object" || Array.isArray(wf)) throw new ComfyError("That workflow is not in the right format.");
  if (Array.isArray(wf.nodes) || Array.isArray(wf.links)) {
    throw new ComfyError("That is the editor format. In ComfyUI turn on Dev mode in settings, then use 'Save (API Format)'.");
  }
  const nodes = Object.values(wf);
  if (!nodes.length || !nodes.every((n) => n && typeof n === "object" && typeof n.class_type === "string")) {
    throw new ComfyError("That does not look like an API-format workflow. Use 'Save (API Format)' in ComfyUI.");
  }
  return wf;
}

/** Put the prompt into the workflow ({{prompt}} placeholders first, else the first text-encode node) and randomize seeds. */
export function fillWorkflow(wfIn, prompt, { randomSeed = true } = {}) {
  const wf = JSON.parse(JSON.stringify(wfIn));
  let replaced = 0;
  for (const node of Object.values(wf)) {
    const inputs = node.inputs || {};
    for (const [k, v] of Object.entries(inputs)) {
      if (typeof v === "string" && v.includes("{{prompt}}")) { inputs[k] = v.split("{{prompt}}").join(prompt); replaced++; }
      else if (randomSeed && (k === "seed" || k === "noise_seed") && typeof v === "number") inputs[k] = Math.floor(Math.random() * 2 ** 48);
    }
  }
  if (!replaced) {
    const enc = Object.values(wf).filter((n) => /TextEncode/i.test(n.class_type) && n.inputs && typeof n.inputs.text === "string");
    const pick = enc.find((n) => /positive/i.test((n._meta && n._meta.title) || "")) || enc[0];
    if (!pick) throw new ComfyError("Type {{prompt}} where the prompt text goes in your workflow, then paste it again.");
    pick.inputs.text = prompt;
    replaced = 1;
  }
  return { workflow: wf, replaced };
}

function describeNodeErrors(body) {
  try {
    const j = JSON.parse(body);
    const bits = [];
    if (j.error && j.error.message) bits.push(j.error.message);
    for (const ne of Object.values(j.node_errors || {})) {
      for (const e of ne.errors || []) bits.push(`${ne.class_type}: ${e.message}${e.details ? " (" + e.details + ")" : ""}`);
    }
    return bits.slice(0, 3).join("; ") || body.slice(0, 200);
  } catch (_) { return body.slice(0, 200); }
}

export class Comfy {
  constructor(base = "http://127.0.0.1:8188", { fetch: f } = {}) {
    this.base = String(base || "").trim().replace(/\/+$/, "") || "http://127.0.0.1:8188";
    this.f = f || ((...a) => fetch(...a));
    this.clientId = "gyan-" + Math.random().toString(36).slice(2, 10);
    this.lastPromptId = null;
  }

  async ping() {
    try {
      const r = await this.f(`${this.base}/system_stats`);
      if (!r.ok) return { ok: false, reason: `ComfyUI answered with an error (${r.status}).` };
      const j = await r.json().catch(() => ({}));
      const dev = j && j.devices && j.devices[0];
      return { ok: true, name: dev ? dev.name : "ComfyUI" };
    } catch (_) {
      return { ok: false, reason: `Can't reach ComfyUI at ${this.base}. Is it running? Start it with --enable-cors-header "*" so this page is allowed to talk to it.` };
    }
  }

  async interrupt() { try { await this.f(`${this.base}/interrupt`, { method: "POST" }); } catch (_) {} }

  /**
   * Run a workflow and return the first result as a Blob.
   * @returns {Promise<{blob:Blob, kind:"image"|"video", filename:string}>}
   */
  async run(workflow, { prompt, want = "image", onProgress = () => {}, signal, timeoutMs = 20 * 60 * 1000, pollMs = 1000, useWs = true } = {}) {
    const { workflow: wf } = fillWorkflow(checkWorkflow(workflow), prompt);
    let ws = null;
    if (useWs && typeof WebSocket !== "undefined") {
      try {
        ws = new WebSocket(this.base.replace(/^http/i, "ws") + "/ws?clientId=" + this.clientId);
        ws.onmessage = (e) => {
          if (typeof e.data !== "string") return;
          try { const m = JSON.parse(e.data); if (m.type === "progress" && m.data && m.data.max) onProgress({ pct: m.data.value / m.data.max, text: `Step ${m.data.value} of ${m.data.max}` }); } catch (_) {}
        };
        ws.onerror = () => {};
      } catch (_) { ws = null; }
    }
    try {
      let res;
      try {
        res = await this.f(`${this.base}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: wf, client_id: this.clientId }), signal });
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        throw new ComfyError(`Can't reach ComfyUI at ${this.base}. Is it running with --enable-cors-header "*"?`);
      }
      if (!res.ok) throw new ComfyError("ComfyUI rejected the workflow: " + describeNodeErrors(await res.text()));
      const { prompt_id: id } = await res.json();
      if (!id) throw new ComfyError("ComfyUI did not return a job id.");
      this.lastPromptId = id;

      const t0 = Date.now();
      let entry = null;
      for (;;) {
        if (signal && signal.aborted) { await this.interrupt(); const e = new Error("Stopped"); e.name = "AbortError"; throw e; }
        if (Date.now() - t0 > timeoutMs) throw new ComfyError("This is taking too long. Check ComfyUI's window for what it is doing.");
        const hr = await this.f(`${this.base}/history/${id}`, { signal });
        if (hr.ok) {
          const h = await hr.json();
          const e = h && h[id];
          if (e && e.status && e.status.status_str === "error") {
            const msg = (e.status.messages || []).map((m) => m[1] && (m[1].exception_message || m[1].message)).filter(Boolean)[0];
            throw new ComfyError("ComfyUI hit an error: " + (msg || "see its window for details").toString().slice(0, 200));
          }
          if (e && e.outputs && Object.keys(e.outputs).length && (!e.status || e.status.completed !== false)) { entry = e; break; }
        }
        onProgress({ text: `Working... ${Math.round((Date.now() - t0) / 1000)}s` });
        await new Promise((r) => setTimeout(r, pollMs));
      }

      const cands = [];
      for (const out of Object.values(entry.outputs)) {
        for (const key of ["images", "gifs", "videos"]) {
          for (const f of out[key] || []) {
            if (!f || !f.filename) continue;
            const kind = mediaKind(f.filename);
            if (kind === "other") continue;
            const realVideo = VID.test(f.filename) && !/\.gif$/i.test(f.filename);
            let score = (f.type === "output" ? 4 : 0);
            if (want === "video" && realVideo) score += 2;
            if (want === "image" && !realVideo) score += 2;
            cands.push({ f, kind, score });
          }
        }
      }
      if (!cands.length) throw new ComfyError("ComfyUI finished but returned no image or video. Does your workflow have a Save Image or Save Video node?");
      cands.sort((a, b) => b.score - a.score);
      const { f, kind } = cands[0];
      const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder || "", type: f.type || "output" });
      const vr = await this.f(`${this.base}/view?${q}`, { signal });
      if (!vr.ok) throw new ComfyError("Could not download the result from ComfyUI.");
      const blob = new Blob([await vr.arrayBuffer()], { type: MIME[ext(f.filename)] || "application/octet-stream" });
      return { blob, kind, filename: f.filename };
    } finally {
      if (ws) { try { ws.close(); } catch (_) {} }
    }
  }
}
