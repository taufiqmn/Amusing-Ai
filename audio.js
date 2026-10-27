// Voiceover helpers. peaks() and findSpeech() are pure so they can be tested without a browser.

export function peaks(data, bins = 600) {
  const out = new Float32Array(bins); const step = Math.max(1, Math.floor(data.length / bins));
  for (let b = 0; b < bins; b++) { let m = 0; const s = b * step, e = Math.min(data.length, s + step); for (let i = s; i < e; i += 8) { const v = Math.abs(data[i]); if (v > m) m = v; } out[b] = m; }
  return out;
}

/** Find where someone is talking. Returns {segments:[{start,end}], threshold}. */
export function findSpeech(data, sampleRate, { win = 0.05, minSilence = 0.35, minSpeech = 0.25 } = {}) {
  const n = Math.max(1, Math.floor(sampleRate * win)); const frames = Math.floor(data.length / n); const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let s = 0; const o = f * n; for (let i = 0; i < n; i++) { const v = data[o + i]; s += v * v; } rms[f] = Math.sqrt(s / n); }
  const sorted = Float32Array.from(rms).sort(); const p95 = sorted[Math.floor(frames * 0.95)] || 0; const p20 = sorted[Math.floor(frames * 0.2)] || 0;
  const threshold = Math.max(p95 * 0.12, p20 * 2.5, 1e-4);
  const segs = []; let start = -1, last = -1;
  for (let f = 0; f < frames; f++) {
    const loud = rms[f] > threshold;
    if (loud) { if (start < 0) start = f; last = f; }
    else if (start >= 0 && (f - last) * win >= minSilence) { segs.push({ start: start * win, end: (last + 1) * win }); start = -1; }
  }
  if (start >= 0) segs.push({ start: start * win, end: (last + 1) * win });
  return { segments: segs.filter((s) => s.end - s.start >= minSpeech), threshold };
}

export async function decodeAudio(fileOrBlob) {
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) throw new Error("This browser cannot read audio.");
  const ctx = new Ctx(); try {
    const buf = await ctx.decodeAudioData(await fileOrBlob.arrayBuffer());
    const data = buf.getChannelData(0);
    return { buffer: buf, duration: buf.duration, peaks: peaks(data, 800), speech: findSpeech(data, buf.sampleRate).segments };
  } finally { if (ctx.close) ctx.close().catch(() => {}); }
}
