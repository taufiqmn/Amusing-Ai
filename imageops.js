// Photo adjustments. applyAdjust() works on raw pixels so it behaves the same in every browser.

export const FILTERS = {
  none: { name: "Original", bright: 0, contrast: 0, sat: 0, warm: 0, gray: false, fade: 0 },
  vivid: { name: "Vivid", bright: 4, contrast: 18, sat: 35, warm: 0, gray: false, fade: 0 },
  warm: { name: "Warm film", bright: 3, contrast: 8, sat: 8, warm: 28, gray: false, fade: 10 },
  cool: { name: "Cool", bright: 0, contrast: 10, sat: 6, warm: -26, gray: false, fade: 0 },
  mono: { name: "Black and white", bright: 0, contrast: 22, sat: 0, warm: 0, gray: true, fade: 0 },
  fade: { name: "Faded", bright: 8, contrast: -18, sat: -20, warm: 6, gray: false, fade: 28 },
};

export function applyAdjust(px, adj) {
  const a = Object.assign({ bright: 0, contrast: 0, sat: 0, warm: 0, gray: false, fade: 0 }, adj);
  const cf = (259 * (a.contrast + 255)) / (255 * (259 - a.contrast)); const add = a.bright * 2.55; const sk = 1 + a.sat / 100; const wm = a.warm * 0.45; const fd = a.fade / 100;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i] + wm, g = px[i + 1], b = px[i + 2] - wm;
    r = cf * (r + add - 128) + 128; g = cf * (g + add - 128) + 128; b = cf * (b + add - 128) + 128;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (a.gray) { r = g = b = y; } else { r = y + (r - y) * sk; g = y + (g - y) * sk; b = y + (b - y) * sk; }
    if (fd) { r = r * (1 - fd * 0.5) + 255 * fd * 0.18; g = g * (1 - fd * 0.5) + 255 * fd * 0.18; b = b * (1 - fd * 0.5) + 255 * fd * 0.18; }
    px[i] = r < 0 ? 0 : r > 255 ? 255 : r; px[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  return px;
}

/** Re-render a data URL with the adjustments. Returns a new JPEG data URL. */
export async function adjustDataURL(src, adj) {
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Could not open that picture.")); i.src = src; });
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); applyAdjust(d.data, adj); g.putImageData(d, 0, 0);
  return c.toDataURL("image/jpeg", 0.88);
}
