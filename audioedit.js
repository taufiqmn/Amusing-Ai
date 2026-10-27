// Voiceover editing on decoded audio. Every function returns a new AudioBuffer and leaves the old one alone, so Undo is free.

import { findSpeech, peaks } from "./audio.js";

function make(src, length) { return new AudioBuffer({ numberOfChannels: src.numberOfChannels, length: Math.max(1, length), sampleRate: src.sampleRate }); }

export function slice(buf, start, end) {
  const sr = buf.sampleRate; const a = Math.max(0, Math.floor(start * sr)), b = Math.min(buf.length, Math.ceil(end * sr)); const out = make(buf, b - a);
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b), c); return out;
}
export function gain(buf, g) {
  const out = make(buf, buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = new Float32Array(s.length); for (let i = 0; i < s.length; i++) { const v = s[i] * g; d[i] = v > 1 ? 1 : v < -1 ? -1 : v; } out.copyToChannel(d, c); }
  return out;
}
/** Shorten long silences. Speech keeps `pad` seconds around it; each gap becomes at most `keep` seconds. */
export function tightenPauses(buf, segments, { keep = 0.3, pad = 0.08 } = {}) {
  if (!segments.length) return buf; const sr = buf.sampleRate; const parts = [];
  segments.forEach((s, i) => { const a = Math.max(0, s.start - pad), b = Math.min(buf.duration, s.end + pad); parts.push([a, b]); if (i < segments.length - 1) parts.push(keep); });
  let len = 0; for (const p of parts) len += Array.isArray(p) ? Math.floor((p[1] - p[0]) * sr) : Math.floor(p * sr);
  const out = make(buf, len);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c), dst = new Float32Array(len); let o = 0;
    for (const p of parts) { if (Array.isArray(p)) { const a = Math.floor(p[0] * sr), b = Math.min(src.length, Math.floor(p[1] * sr)); dst.set(src.subarray(a, b), o); o += b - a; } else o += Math.floor(p * sr); }
    out.copyToChannel(dst, c);
  }
  return out;
}
export function analyze(buf) { const d = buf.getChannelData(0); return { buffer: buf, duration: buf.duration, peaks: peaks(d, 800), speech: findSpeech(d, buf.sampleRate).segments }; }

/** Record from the microphone. Call stop() to get the audio blob. */
export async function recordMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser cannot record audio.");
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch (_) { throw new Error("Microphone access was blocked. Allow it in the address bar and try again."); }
  const rec = new MediaRecorder(stream); const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data); rec.start();
  return { stop: () => new Promise((ok) => { rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); ok(new Blob(chunks, { type: rec.mimeType || "audio/webm" })); }; rec.stop(); }) };
}

/** AudioBuffer -> 16-bit WAV blob (used to keep an edited voiceover in the saved project). */
export function toWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length; const bytes = n * ch * 2; const ab = new ArrayBuffer(44 + bytes); const v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + bytes, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, bytes, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c)); let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
  return new Blob([ab], { type: "audio/wav" });
}
