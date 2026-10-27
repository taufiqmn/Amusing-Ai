// Taufiq Studio assets: brand logos, free stock photos, and the person's own uploads.
// Everything is turned into a self-contained data URL so a project keeps working offline and can be saved to a file.
// No key is needed for the defaults. Pexels / Pixabay work if the person pastes a free key in Studio settings.

const ICONS_CDN = "https://cdn.jsdelivr.net/npm/simple-icons@13/icons/";
const ALIASES = { twitter: "x", "x.com": "x", gmail: "gmail", "google drive": "googledrive", "google maps": "googlemaps", "visual studio code": "visualstudiocode", vscode: "visualstudiocode", "vs code": "visualstudiocode", chatgpt: "openai", "open ai": "openai", "next.js": "nextdotjs", nextjs: "nextdotjs", "node.js": "nodedotjs", nodejs: "nodedotjs", "vue.js": "vuedotjs", vue: "vuedotjs", "react native": "react", "tailwind css": "tailwindcss", tailwind: "tailwindcss", "ms teams": "microsoftteams", teams: "microsoftteams", "paypal": "paypal", "whats app": "whatsapp", "you tube": "youtube", "tik tok": "tiktok", "face book": "facebook", "git hub": "github", "supabase": "supabase", "fiverr": "fiverr", "upwork": "upwork" };
const COLORS = { stripe: "#635BFF", notion: "#111111", vercel: "#000000", github: "#181717", google: "#4285F4", youtube: "#FF0000", slack: "#4A154B", figma: "#F24E1E", shopify: "#7AB55C", spotify: "#1DB954", discord: "#5865F2", netflix: "#E50914", airbnb: "#FF5A5F", dropbox: "#0061FF", react: "#149ECA", supabase: "#3ECF8E", openai: "#412991", meta: "#0866FF", instagram: "#E4405F", whatsapp: "#25D366", tiktok: "#111111", x: "#000000", linkedin: "#0A66C2", paypal: "#003087", fiverr: "#1DBF73", upwork: "#14A800", anthropic: "#D97757", cloudflare: "#F38020", mongodb: "#47A248", postgresql: "#4169E1", docker: "#2496ED", python: "#3776AB", javascript: "#F7DF1E", typescript: "#3178C6", tailwindcss: "#06B6D4", nextdotjs: "#000000", nodedotjs: "#5FA04E", apple: "#000000", amazon: "#FF9900", uber: "#000000", twitch: "#9146FF", reddit: "#FF4500", pinterest: "#BD081C", zoom: "#0B5CFF", asana: "#F06A6A", trello: "#0052CC", jira: "#0052CC", atlassian: "#0052CC", salesforce: "#00A1E0", hubspot: "#FF7A59", mailchimp: "#FFE01B", canva: "#00C4CC", adobe: "#FF0000", firebase: "#FFCA28" };

export const slugFor = (name) => { const n = String(name || "").toLowerCase().trim(); return ALIASES[n] || n.replace(/\+/g, "plus").replace(/&/g, "and").replace(/[^a-z0-9]/g, ""); };
export function monogram(name) {
  const w = String(name || "?").trim().split(/[\s\-_.]+/).filter(Boolean); const mono = (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || "?").slice(0, 2)).toUpperCase();
  let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return { mono, color: `hsl(${h % 360} 62% 48%)` };
}
const toDataURL = (blobOrText, type) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => no(fr.error); fr.readAsDataURL(blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type })); });

/** Fetch a brand logo (Simple Icons, CC0). Never throws: falls back to a monogram badge. */
export async function fetchLogo(name, { fetchFn = (...a) => fetch(...a), signal } = {}) {
  const slug = slugFor(name); const mg = monogram(name);
  if (slug) {
    try {
      const r = await fetchFn(ICONS_CDN + slug + ".svg", { signal });
      if (r.ok) {
        let svg = await r.text(); if (/<svg/i.test(svg)) {
          const color = COLORS[slug] || "#111111";
          svg = svg.replace(/<svg([^>]*)>/i, (m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, "")} width="256" height="256" fill="${color}">`);
          return { ok: true, src: await toDataURL(svg, "image/svg+xml"), name, credit: `${name} logo via Simple Icons (CC0). The logo is a trademark of its owner.`, ...mg };
        }
      }
    } catch (e) { if (e && e.name === "AbortError") throw e; }
  }
  return { ok: false, src: "", name, ...mg, credit: "" };
}

/* ---------------- stock photos ---------------- */
async function shrink(blob, maxSide = 1600, quality = 0.86) {
  const bmp = await createImageBitmap(blob); const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
  return c.toDataURL("image/jpeg", quality);
}
/** Download a picture and keep it inside the project. Needs the host to allow cross-origin reads. */
export async function importImageUrl(url, { fetchFn = (...a) => fetch(...a), signal, maxSide } = {}) {
  const r = await fetchFn(url, { signal, mode: "cors" }); if (!r.ok) throw new Error("download failed");
  return shrink(await r.blob(), maxSide);
}
const strip = (h) => String(h || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function commons(q, { fetchFn, signal }) {
  const u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280&gsrsearch=" + encodeURIComponent("filetype:bitmap " + q);
  const j = await (await fetchFn(u, { signal })).json(); const pages = Object.values((j.query && j.query.pages) || {});
  return pages.map((p) => { const ii = p.imageinfo && p.imageinfo[0]; if (!ii || !/^image\/(jpeg|png|webp)/.test(ii.mime || "") || (ii.width || 0) < 900) return null; const m = ii.extmetadata || {};
    const lic = strip(m.LicenseShortName && m.LicenseShortName.value) || "see source"; const art = strip(m.Artist && m.Artist.value) || "unknown";
    return { id: "wc" + p.pageid, source: "Wikimedia Commons", thumb: ii.thumburl || ii.url, full: ii.thumburl || ii.url, title: strip(p.title).replace(/^File:/, "").replace(/\.\w+$/, ""), credit: `Photo: ${strip(p.title).replace(/^File:/, "")} by ${art} (${lic}) via Wikimedia Commons`, license: lic, page: ii.descriptionurl }; }).filter(Boolean);
}
async function openverse(q, { fetchFn, signal }) {
  const u = "https://api.openverse.org/v1/images/?page_size=12&mature=false&license_type=commercial&q=" + encodeURIComponent(q);
  const j = await (await fetchFn(u, { signal })).json();
  return (j.results || []).map((x) => ({ id: "ov" + x.id, source: "Openverse", thumb: x.thumbnail || x.url, full: x.thumbnail || x.url, title: x.title || q, credit: `Photo: "${x.title || q}" by ${x.creator || "unknown"} (${String(x.license || "").toUpperCase()} ${x.license_version || ""}) via Openverse`, license: String(x.license || "").toUpperCase(), page: x.foreign_landing_url }));
}
async function pexels(q, key, { fetchFn, signal }) {
  const j = await (await fetchFn("https://api.pexels.com/v1/search?per_page=12&query=" + encodeURIComponent(q), { headers: { Authorization: key }, signal })).json();
  return (j.photos || []).map((x) => ({ id: "px" + x.id, source: "Pexels", thumb: x.src.medium, full: x.src.large2x || x.src.large, title: x.alt || q, credit: `Photo by ${x.photographer} on Pexels`, license: "Pexels License", page: x.url }));
}
async function pixabay(q, key, { fetchFn, signal }) {
  const j = await (await fetchFn(`https://pixabay.com/api/?image_type=photo&per_page=12&safesearch=true&key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`, { signal })).json();
  return (j.hits || []).map((x) => ({ id: "pb" + x.id, source: "Pixabay", thumb: x.webformatURL, full: x.largeImageURL || x.webformatURL, title: x.tags || q, credit: `Photo by ${x.user} on Pixabay`, license: "Pixabay License", page: x.pageURL }));
}
/** Search free stock photos. Sources that fail are skipped. Returns {results, errors}. */
export async function searchPhotos(query, { pexelsKey = "", pixabayKey = "", fetchFn = (...a) => fetch(...a), signal } = {}) {
  const q = String(query || "").trim(); if (!q) return { results: [], errors: [] };
  const jobs = [];
  if (pexelsKey) jobs.push(["Pexels", pexels(q, pexelsKey, { fetchFn, signal })]);
  if (pixabayKey) jobs.push(["Pixabay", pixabay(q, pixabayKey, { fetchFn, signal })]);
  jobs.push(["Wikimedia Commons", commons(q, { fetchFn, signal })], ["Openverse", openverse(q, { fetchFn, signal })]);
  const done = await Promise.allSettled(jobs.map((j) => j[1])); const results = [], errors = [];
  done.forEach((d, i) => { if (d.status === "fulfilled") results.push(...d.value); else errors.push(jobs[i][0]); });
  // keep sources interleaved so the first picks are varied
  const by = {}; results.forEach((r) => (by[r.source] = by[r.source] || []).push(r)); const order = Object.values(by); const mixed = [];
  for (let i = 0; order.some((a) => i < a.length); i++) order.forEach((a) => a[i] && mixed.push(a[i]));
  return { results: mixed, errors };
}
/** Try candidates in order until one can be downloaded. */
export async function pickPhoto(cands, opts = {}) {
  for (const c of cands.slice(0, 6)) { try { const src = await importImageUrl(c.full, opts); return { ok: true, src, cand: c }; } catch (e) { if (e && e.name === "AbortError") throw e; try { const src = await importImageUrl(c.thumb, opts); return { ok: true, src, cand: c }; } catch (e2) { if (e2 && e2.name === "AbortError") throw e2; } } }
  return { ok: false };
}

/* ---------------- the person's own files ---------------- */
export async function fileToElement(file, kind = "image") {
  if (!file) throw new Error("No file");
  const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
  if (!file.type.startsWith("image/") && !isSvg) throw new Error("Pick a picture (PNG, JPG, SVG or WebP).");
  const src = isSvg ? await toDataURL(file) : await shrink(file, kind === "logo" ? 800 : 1920, kind === "logo" ? 0.92 : 0.86);
  let outSrc = src; if (!isSvg && kind === "logo" && file.type === "image/png") outSrc = await shrinkPng(file, 800);
  return { kind, name: file.name.replace(/\.\w+$/, ""), src: outSrc, status: "ok", own: true, credit: "" };
}
async function shrinkPng(blob, maxSide) { const bmp = await createImageBitmap(blob); const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)); const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL("image/png"); }

export function creditsText(project) {
  const seen = new Set(); const lines = [];
  for (const s of project.scenes) for (const e of s.elements || []) if (e.credit && !seen.has(e.credit)) { seen.add(e.credit); lines.push("- " + e.credit); }
  return lines.length ? "Credits\n" + lines.join("\n") + "\n" : "";
}
