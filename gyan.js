/**
 * Gyan Free AI: free, in-browser AI for any website.
 * Created by Md Taufiqur Rahman. MIT License.
 *
 * The model runs on the VISITOR'S OWN GPU (WebGPU) through WebLLM, so there is
 * no server, no API key and no per-request bill. The interface mirrors the
 * OpenAI chat.completions API so it is easy to swap in or out.
 *
 *   import { Gyan } from "./gyan.js";
 *   const ai = new Gyan({ model: "small", onProgress: p => console.log(p.text) });
 *   const reply = await ai.ask("Explain recursion in one paragraph");
 *
 * `model` can be "tiny" | "small" | "medium" or any WebLLM model ID.
 */

const WEBLLM_VERSION = "0.2.86";
const WEBLLM_URL = `https://esm.run/@mlc-ai/web-llm@${WEBLLM_VERSION}`;

// Friendly tiers -> real WebLLM model IDs (checked against web-llm 0.2.86).
// "f16" builds are faster and smaller; "f32" is the fallback for GPUs without shader-f16.
const TIERS = {
  tiny:   { f16: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC", note: "Fastest, smallest download, basic quality" },
  small:  { f16: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", note: "Good balance for most devices" },
  medium: { f16: "Llama-3.2-3B-Instruct-q4f16_1-MLC", f32: "Llama-3.2-3B-Instruct-q4f32_1-MLC", note: "Best quality, needs a decent GPU and a bigger download" },
};

let _webllmPromise = null;
function loadWebLLM() {
  if (!_webllmPromise) _webllmPromise = import(/* @vite-ignore */ WEBLLM_URL);
  return _webllmPromise;
}

/** Turn a tier name or raw model ID into a real, available WebLLM model ID for this GPU. */
function resolveId(model, hasF16, webllm) {
  const t = TIERS[model];
  let id = t ? (hasF16 ? t.f16 : t.f32) : model;
  const has = (x) => webllm.prebuiltAppConfig.model_list.some((m) => m.model_id === x);
  if (!t && !hasF16 && id.includes("q4f16_1")) {
    const alt = id.replace("q4f16_1", "q4f32_1");
    if (has(alt)) id = alt;
    else throw new Error("This model needs a GPU feature your device does not have. Pick a smaller model.");
  }
  if (!has(id)) throw new Error(`Unknown model "${id}". Use "tiny", "small", "medium" or a valid WebLLM model ID.`);
  return id;
}

export class Gyan {
  /**
   * @param {object} [opts]
   * @param {string} [opts.model="small"] tier name or a raw WebLLM model ID
   * @param {(p:{progress:number,text:string})=>void} [opts.onProgress] download/compile progress (0..1)
   * @param {string} [opts.systemPrompt] default system message, added when a call has none
   * @param {boolean} [opts.useWorker=true] run the model in a Web Worker so the page stays smooth
   */
  constructor(opts = {}) {
    this.model = opts.model || "small";
    this.onProgress = opts.onProgress || (() => {});
    this.systemPrompt = opts.systemPrompt || "";
    this.useWorker = opts.useWorker !== false;
    this.engine = null;
    this.modelId = null;
    this._loading = null;

    // OpenAI-style surface: ai.chat.completions.create({ messages, stream, ... })
    this.chat = { completions: { create: (params) => this._create(params) } };
  }

  /** Check whether this browser/device can run Gyan. Never throws. */
  static async support() {
    if (typeof navigator === "undefined" || !navigator.gpu) {
      return { ok: false, f16: false, reason: "WebGPU is not available. Use a recent Chrome, Edge, Safari 26+ or Firefox on a device with a GPU." };
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { ok: false, f16: false, reason: "No compatible GPU adapter was found." };
      return { ok: true, f16: adapter.features.has("shader-f16"), reason: "" };
    } catch (e) {
      return { ok: false, f16: false, reason: "WebGPU failed to start: " + (e && e.message ? e.message : e) };
    }
  }

  /** Start fetching the WebLLM library early (no model download). Saves a few seconds on first start. */
  static prewarm() { return loadWebLLM().catch(() => null); }

  /** Is this model (tier name or ID) already downloaded on this device? Never throws. */
  static async cached(model) {
    try {
      const s = await Gyan.support();
      if (!s.ok) return false;
      const webllm = await loadWebLLM();
      return await webllm.hasModelInCache(resolveId(model, s.f16, webllm));
    } catch (_) { return false; }
  }

  /** Tiers with their note and (if known) the GPU memory they need, read live from WebLLM. */
  static async models() {
    const webllm = await loadWebLLM();
    const list = webllm.prebuiltAppConfig.model_list;
    return Object.entries(TIERS).map(([tier, t]) => {
      const rec = list.find((m) => m.model_id === t.f16);
      return { tier, modelId: t.f16, note: t.note, vramMB: rec ? Math.round(rec.vram_required_MB || 0) || null : null };
    });
  }

  /** Download (first visit only, then cached by the browser) and start the model. Safe to call many times. */
  load() {
    if (this.engine) return Promise.resolve(this);
    if (!this._loading) {
      this._loading = this._load().catch((e) => { this._loading = null; throw e; });
    }
    return this._loading;
  }

  async _load() {
    const sup = await Gyan.support();
    if (!sup.ok) throw new Error(sup.reason);

    const webllm = await loadWebLLM();
    this.modelId = resolveId(this.model, sup.f16, webllm);

    // Ask the browser not to evict the multi-GB model cache. Failure is harmless.
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}

    const cfg = { initProgressCallback: (r) => this.onProgress({ progress: r.progress, text: r.text }) };

    if (this.useWorker && typeof Worker !== "undefined") {
      const code = `import { WebWorkerMLCEngineHandler } from "${WEBLLM_URL}";
        const handler = new WebWorkerMLCEngineHandler();
        self.onmessage = (m) => handler.onmessage(m);`;
      this._workerUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      this._worker = new Worker(this._workerUrl, { type: "module" });
      this.engine = await webllm.CreateWebWorkerMLCEngine(this._worker, this.modelId, cfg);
    } else {
      this.engine = await webllm.CreateMLCEngine(this.modelId, cfg);
    }
    return this;
  }

  async _create(params) {
    await this.load();
    const p = { ...params };
    delete p.model; // the loaded model is always used
    if (this.systemPrompt && !(p.messages || []).some((m) => m.role === "system")) {
      p.messages = [{ role: "system", content: this.systemPrompt }, ...(p.messages || [])];
    }
    return this.engine.chat.completions.create(p);
  }

  /** One-shot helper: returns the reply text. */
  async ask(prompt, opts = {}) {
    const res = await this._create({ messages: [{ role: "user", content: prompt }], ...opts, stream: false });
    return res.choices[0].message.content;
  }

  /** Ask for JSON back and parse it. Small models can still slip, so this throws if parsing fails. */
  async json(prompt, opts = {}) {
    const res = await this._create({
      messages: [{ role: "user", content: prompt + "\nReply with valid JSON only." }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      ...opts,
      stream: false,
    });
    return JSON.parse(res.choices[0].message.content);
  }

  /** Stop the current generation. */
  interrupt() { if (this.engine) this.engine.interruptGenerate(); }

  /** Is the chosen model already downloaded on this device? */
  isCached() { return Gyan.cached(this.model); }

  /** Free GPU memory (keeps the downloaded files). */
  async unload() {
    if (this.engine) { await this.engine.unload(); this.engine = null; this._loading = null; }
    if (this._worker) { this._worker.terminate(); this._worker = null; }
    if (this._workerUrl) { URL.revokeObjectURL(this._workerUrl); this._workerUrl = null; }
  }

  /** Delete the downloaded model files from this device. */
  async clearCache() {
    const webllm = await loadWebLLM();
    const sup = await Gyan.support();
    await webllm.deleteModelAllInfoInCache(resolveId(this.model, sup.f16, webllm));
  }
}

if (typeof window !== "undefined") window.Gyan = Gyan;
export default Gyan;
