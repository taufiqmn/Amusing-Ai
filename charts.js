// Gyan charts: a small, dependency-free SVG chart maker (bar, line, donut).
// Colors come from the validated reference palette (blue, orange, aqua, yellow, ...), light and dark.
// The SVG is self-contained (no CSS variables) so it can be exported as a PNG.

export const PALETTE = {
  light: { surface: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7",
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] },
  dark: { surface: "#1a1a19", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835",
    series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"] },
};

const FONT = 'font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif"';
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = (n) => Math.round(n * 10) / 10;
const trunc = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s);

export function parseNumber(s) {
  const t = String(s == null ? "" : s).trim().replace(/[$€£₹৳%\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (t === "") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
export const fullNum = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return r1(n / 1e9) + "B";
  if (a >= 1e6) return r1(n / 1e6) + "M";
  if (a >= 1e4) return r1(n / 1e3) + "k";
  return String(Math.round(n * 100) / 100);
}

/** Turn pasted rows like "Jan, 12" (or with a header row and several number columns) into labels + series. */
export function parseTable(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("Add at least two rows, like: Jan, 12");
  const split = (l) => {
    let parts;
    if (l.includes("\t")) parts = l.split("\t");
    else if (l.includes(";")) parts = l.split(";");
    else if (l.includes(",")) parts = l.split(",");
    else if (/[:=]/.test(l)) parts = l.split(/[:=]/);
    else { const m = l.match(/^(.*\S)\s+(\S+)$/); parts = m ? [m[1], m[2]] : [l]; }
    return parts.map((s) => s.trim());
  };
  const rows = lines.map(split);
  let header = null;
  const firstVals = rows[0].slice(1);
  if (firstVals.length && firstVals.every((v) => Number.isNaN(parseNumber(v)))) header = rows.shift();
  const nS = Math.max(...rows.map((r) => r.length)) - 1;
  if (nS < 1 || rows.length < 1) throw new Error("Each row needs a label and a number, like: Jan, 12");
  const labels = [];
  const series = Array.from({ length: nS }, (_, i) => ({
    name: header && header[i + 1] ? header[i + 1] : nS > 1 ? `Series ${i + 1}` : "Value", values: [],
  }));
  for (const r of rows) {
    labels.push(r[0] || "");
    for (let i = 0; i < nS; i++) {
      const n = parseNumber(r[i + 1]);
      if (Number.isNaN(n)) throw new Error(`"${r[i + 1] == null ? "" : r[i + 1]}" is not a number (row "${r[0]}").`);
      series[i].values.push(n);
    }
  }
  return { labels, series };
}

/** Validate and clean a chart spec: { type, title, labels, values } or { labels, series:[{name, values}] }. */
export function normalizeSpec(spec) {
  if (!spec || typeof spec !== "object") throw new Error("No chart data.");
  const type = spec.type === "pie" ? "donut" : ["bar", "line", "donut"].includes(spec.type) ? spec.type : "bar";
  const labels = (Array.isArray(spec.labels) ? spec.labels : []).map(String);
  let series = spec.series;
  if (!series && Array.isArray(spec.values)) series = [{ name: spec.name || "Value", values: spec.values }];
  if (!Array.isArray(series) || !series.length || !labels.length) throw new Error("A chart needs labels and values.");
  series = series.slice(0, 8).map((s, i) => {
    const vals = Array.isArray(s.values) ? s.values : [];
    if (vals.length !== labels.length) throw new Error("Labels and values don't match in length.");
    const nums = vals.map((v) => (typeof v === "number" ? v : parseNumber(v)));
    if (nums.some((n) => !Number.isFinite(n))) throw new Error("All values must be numbers.");
    return { name: String(s.name == null ? `Series ${i + 1}` : s.name), values: nums };
  });
  let L = labels;
  const cap = type === "donut" ? 40 : 30;
  if (L.length > cap) { L = L.slice(0, cap); series.forEach((s) => (s.values = s.values.slice(0, cap))); }
  if (type === "donut") {
    const s = series[0];
    if (s.values.some((v) => v < 0)) throw new Error("Donut charts need positive numbers.");
    let pairs = L.map((l, i) => [l, s.values[i]]).filter((p) => p[1] > 0).sort((a, b) => b[1] - a[1]);
    if (!pairs.length) throw new Error("Donut charts need at least one number above zero.");
    if (pairs.length > 6) {
      const rest = pairs.slice(5).reduce((a, p) => a + p[1], 0);
      pairs = pairs.slice(0, 5).concat([["Other", rest]]);
    }
    return { type, title: String(spec.title || "").slice(0, 80), labels: pairs.map((p) => p[0]), series: [{ name: s.name, values: pairs.map((p) => p[1]) }] };
  }
  return { type, title: String(spec.title || "").slice(0, 80), labels: L, series };
}

function niceScale(min, max, isLine) {
  let lo = Math.min(0, min), hi = Math.max(0, max);
  if (isLine && min > 0 && (max - min) / max < 0.4) lo = min;
  if (lo === hi) hi = lo + 1;
  const rough = (hi - lo) / 5;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const k0 = Math.floor(lo / step), k1 = Math.ceil(hi / step);
  const ticks = [];
  for (let k = k0; k <= k1; k++) ticks.push(parseFloat((k * step).toPrecision(12)));
  return { lo: ticks[0], hi: ticks[ticks.length - 1], ticks };
}

function barPath(x, w, yBase, yVal, rad) {
  const h = Math.abs(yVal - yBase);
  if (h < 0.5) return "";
  const r = Math.min(rad, w / 2, h);
  const up = yVal < yBase;
  const x2 = x + w;
  if (up) {
    return `M${r1(x)} ${r1(yBase)}L${r1(x)} ${r1(yVal + r)}Q${r1(x)} ${r1(yVal)} ${r1(x + r)} ${r1(yVal)}L${r1(x2 - r)} ${r1(yVal)}Q${r1(x2)} ${r1(yVal)} ${r1(x2)} ${r1(yVal + r)}L${r1(x2)} ${r1(yBase)}Z`;
  }
  return `M${r1(x)} ${r1(yBase)}L${r1(x)} ${r1(yVal - r)}Q${r1(x)} ${r1(yVal)} ${r1(x + r)} ${r1(yVal)}L${r1(x2 - r)} ${r1(yVal)}Q${r1(x2)} ${r1(yVal)} ${r1(x2)} ${r1(yVal - r)}L${r1(x2)} ${r1(yBase)}Z`;
}

function arcPath(cx, cy, R, r, a0, a1) {
  const p = (a, rad) => `${r1(cx + rad * Math.cos(a))} ${r1(cy + rad * Math.sin(a))}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(a0, R)}A${R} ${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, r)}A${r} ${r} 0 ${large} 0 ${p(a0, r)}Z`;
}

/** Build a self-contained SVG string for a chart spec. Throws a friendly Error if the spec is invalid. */
export function chartSVG(input, { theme = "light", width = 640, height = 340 } = {}) {
  const spec = normalizeSpec(input);
  const P = PALETTE[theme] || PALETTE.light;
  const ns = spec.series.length, n = spec.labels.length;
  const out = [];
  let top = spec.title ? 54 : 24;

  const summary = `${spec.type === "donut" ? "Donut" : spec.type === "line" ? "Line" : "Bar"} chart${spec.title ? ": " + spec.title : ""}. ` +
    spec.labels.slice(0, 8).map((l, i) => `${l} ${spec.series.map((s) => fullNum(s.values[i])).join(", ")}`).join("; ");

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(summary)}" ${FONT}>`);
  out.push(`<rect width="${width}" height="${height}" fill="${P.surface}"/>`);
  if (spec.title) out.push(`<text x="16" y="28" font-size="15" font-weight="600" fill="${P.ink}">${esc(trunc(spec.title, 70))}</text>`);

  // Legend: always for 2+ series; swatch carries the color, text stays in ink.
  if (spec.type !== "donut" && ns >= 2) {
    let lx = 16; const ly = spec.title ? 46 : 18;
    spec.series.forEach((s, i) => {
      out.push(`<rect x="${lx}" y="${ly - 9}" width="10" height="10" rx="2" fill="${P.series[i]}"/>`);
      out.push(`<text x="${lx + 15}" y="${ly}" font-size="12" fill="${P.ink2}">${esc(trunc(s.name, 18))}</text>`);
      lx += 15 + Math.min(18, s.name.length) * 6.4 + 18;
    });
    top = spec.title ? 74 : 44;
  }

  if (spec.type === "donut") {
    const vals = spec.series[0].values, total = vals.reduce((a, b) => a + b, 0);
    const cy = (height + (spec.title ? 30 : 0)) / 2, cx = 160, R = Math.min(110, (height - (spec.title ? 70 : 30)) / 2), r = R * 0.62;
    let a = -Math.PI / 2;
    vals.forEach((v, i) => {
      const sweep = Math.min((v / total) * Math.PI * 2, Math.PI * 2 - 0.0001);
      const col = spec.labels[i] === "Other" && i === vals.length - 1 && vals.length > 1 ? P.muted : P.series[i % 8];
      const pct = Math.round((v / total) * 1000) / 10;
      out.push(`<path class="hit" d="${arcPath(cx, cy, R, r, a, a + sweep)}" fill="${col}" stroke="${P.surface}" stroke-width="2" data-tip="${esc(`${spec.labels[i]}\n${fullNum(v)} (${pct}%)`)}"/>`);
      a += sweep;
    });
    out.push(`<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="22" font-weight="600" fill="${P.ink}">${esc(compact(total))}</text>`);
    out.push(`<text x="${cx}" y="${cy + 24}" text-anchor="middle" font-size="11" fill="${P.muted}">Total</text>`);
    const rowH = 26, ly0 = cy - (vals.length * rowH) / 2 + 14;
    vals.forEach((v, i) => {
      const y = ly0 + i * rowH, col = spec.labels[i] === "Other" && i === vals.length - 1 && vals.length > 1 ? P.muted : P.series[i % 8];
      out.push(`<rect x="320" y="${r1(y - 10)}" width="12" height="12" rx="3" fill="${col}"/>`);
      out.push(`<text x="340" y="${r1(y)}" font-size="13" fill="${P.ink}">${esc(trunc(spec.labels[i], 22))}</text>`);
      out.push(`<text x="${width - 20}" y="${r1(y)}" text-anchor="end" font-size="13" fill="${P.ink2}">${esc(fullNum(v))} · ${Math.round((v / total) * 100)}%</text>`);
    });
    out.push("</svg>");
    return out.join("");
  }

  // Bar / line share axes.
  const plot = { x: 52, y: top, w: width - 52 - 16, h: height - top - 38 };
  const all = spec.series.flatMap((s) => s.values);
  const sc = niceScale(Math.min(...all), Math.max(...all), spec.type === "line");
  const Y = (v) => plot.y + plot.h * (1 - (v - sc.lo) / (sc.hi - sc.lo));
  sc.ticks.forEach((t) => {
    out.push(`<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${r1(Y(t))}" y2="${r1(Y(t))}" stroke="${P.grid}" stroke-width="1"/>`);
    out.push(`<text x="${plot.x - 8}" y="${r1(Y(t) + 4)}" text-anchor="end" font-size="11" fill="${P.muted}">${esc(compact(t))}</text>`);
  });
  const y0 = Y(0);
  out.push(`<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${r1(y0)}" y2="${r1(y0)}" stroke="${P.axis}" stroke-width="1"/>`);

  const band = plot.w / n;
  const maxLen = Math.min(14, Math.max(...spec.labels.map((l) => l.length)));
  const step = Math.max(1, Math.ceil((maxLen * 5.8 + 8) / band));
  const cut = Math.max(3, Math.min(14, Math.floor((band * step) / 5.8) - 1));
  spec.labels.forEach((l, i) => {
    if (i % step === 0) out.push(`<text x="${r1(plot.x + band * (i + 0.5))}" y="${plot.y + plot.h + 18}" text-anchor="middle" font-size="11" fill="${P.muted}">${esc(trunc(l, cut))}</text>`);
  });

  const tipFor = (i) => (ns === 1 ? `${spec.labels[i]}: ${fullNum(spec.series[0].values[i])}`
    : spec.labels[i] + "\n" + spec.series.map((s) => `${s.name}: ${fullNum(s.values[i])}`).join("\n"));

  if (spec.type === "bar") {
    const gap = 2, barW = Math.max(3, Math.min(36, (band * 0.72 - (ns - 1) * gap) / ns));
    const groupW = barW * ns + (ns - 1) * gap;
    for (let i = 0; i < n; i++) {
      const x0 = plot.x + band * (i + 0.5) - groupW / 2;
      spec.series.forEach((s, si) => {
        const v = s.values[i], x = x0 + si * (barW + gap);
        const d = barPath(x, barW, y0, Y(v), 4);
        if (d) out.push(`<path d="${d}" fill="${P.series[si]}"/>`);
        if (ns === 1 && n <= 8) {
          const ty = v >= 0 ? Y(v) - 6 : Y(v) + 14;
          out.push(`<text x="${r1(x + barW / 2)}" y="${r1(ty)}" text-anchor="middle" font-size="11" fill="${P.ink2}">${esc(compact(v))}</text>`);
        }
      });
    }
  } else {
    spec.series.forEach((s, si) => {
      const pts = s.values.map((v, i) => `${r1(plot.x + band * (i + 0.5))} ${r1(Y(v))}`);
      out.push(`<path d="M${pts.join("L")}" fill="none" stroke="${P.series[si]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
      if (n <= 14) s.values.forEach((v, i) => out.push(`<circle cx="${r1(plot.x + band * (i + 0.5))}" cy="${r1(Y(v))}" r="4" fill="${P.series[si]}" stroke="${P.surface}" stroke-width="2"/>`));
      if (ns <= 4) {
        const li = n - 1, lv = s.values[li];
        out.push(`<text x="${r1(plot.x + band * (li + 0.5))}" y="${r1(Y(lv) - 10)}" text-anchor="end" font-size="11" fill="${P.ink2}">${esc(compact(lv))}</text>`);
      }
    });
    out.push(`<line class="cross" x1="0" x2="0" y1="${plot.y}" y2="${plot.y + plot.h}" stroke="${P.axis}" stroke-width="1" style="display:none"/>`);
  }
  // Wide invisible hit columns: bigger than the marks, so hover and touch are easy.
  for (let i = 0; i < n; i++) {
    out.push(`<rect class="hit" x="${r1(plot.x + band * i)}" y="${plot.y}" width="${r1(band)}" height="${plot.h}" fill="transparent" data-x="${r1(plot.x + band * (i + 0.5))}" data-tip="${esc(tipFor(i))}"/>`);
  }
  out.push("</svg>");
  return out.join("");
}

/** Accessible table view of the same data. */
export function chartTableHTML(input) {
  const s = normalizeSpec(input);
  const head = `<tr><th></th>${s.series.map((x) => `<th>${esc(x.name)}</th>`).join("")}</tr>`;
  const body = s.labels.map((l, i) => `<tr><td>${esc(l)}</td>${s.series.map((x) => `<td>${esc(fullNum(x.values[i]))}</td>`).join("")}</tr>`).join("");
  return `<table class="ct"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/** Tooltip (and crosshair for line charts) on hover or touch. Browser only. */
export function attachChartHover(host) {
  const svg = host.querySelector("svg");
  if (!svg) return;
  let tip = host.querySelector(".chart-tip");
  if (!tip) { tip = document.createElement("div"); tip.className = "chart-tip"; host.appendChild(tip); }
  const cross = svg.querySelector(".cross");
  const move = (e) => {
    const t = e.target && e.target.closest ? e.target.closest(".hit") : null;
    if (!t) { tip.classList.remove("on"); if (cross) cross.style.display = "none"; return; }
    tip.innerHTML = (t.getAttribute("data-tip") || "").split("\n").map(esc).join("<br>");
    const r = host.getBoundingClientRect();
    tip.style.left = e.clientX - r.left + "px";
    tip.style.top = e.clientY - r.top + "px";
    tip.classList.add("on");
    if (cross && t.getAttribute("data-x")) { const x = t.getAttribute("data-x"); cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.style.display = ""; }
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerdown", move);
  svg.addEventListener("pointerleave", () => { tip.classList.remove("on"); if (cross) cross.style.display = "none"; });
}

/** Export an SVG string as a PNG blob (2x). Browser only. */
export function svgToPng(svg, scale = 2) {
  return new Promise((resolve, reject) => {
    const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    if (!m) return reject(new Error("Could not make PNG"));
    const w = +m[1], h = +m[2];
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w * scale; c.height = h * scale;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make PNG"))), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not make PNG")); };
    img.src = url;
  });
}

/** Pull a ```chart {json}``` block out of a model reply. Returns { text, spec|null }. */
export function extractChart(reply) {
  const m = String(reply || "").match(/```chart\s*([\s\S]*?)```/i);
  if (!m) return { text: reply, spec: null };
  const text = reply.replace(m[0], "").trim();
  try {
    const spec = normalizeSpec(JSON.parse(m[1].trim()));
    return { text, spec };
  } catch (_) { return { text: reply, spec: null }; }
}
