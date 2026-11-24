// games/werbinich/images.js – freiwilliges Bild zum Charakter.
// Wege rein: Strg+V (kopiertes Bild oder Bildlink), Hineinziehen, Datei wählen, Bildlink eintippen.
// Bilder werden auf diesem Gerät verkleinert und als JPEG gespeichert (klein genug für die Datenbank).
// Lässt eine Seite das Umwandeln nicht zu, wird nur der https-Link gespeichert.
import { ICON, toast, openSheet } from '../../core/ui.js';

const SIDE = 480; // längste Kante in Pixeln
const MAX_DATA = 190000; // Zeichen im data:-Link (die Regeln erlauben 200000)
const MAX_LINK = 2000;
const LOAD_MS = 12000;

let cur = null; // { el, api, ctl } – der gerade offene Auswahl-Bildschirm
let bound = false;

export function pickImageHTML() {
  return `<div class="pick-img">
    <p class="pick-img-label">Bild <em>(freiwillig)</em></p>
    <p class="hint">Bei Google suchen, Rechtsklick aufs Bild → „Bild kopieren“, dann hier mit Strg+V einfügen. Hineinziehen geht auch.</p>
    <div class="row-wrap">
      <button class="btn secondary" type="button" data-action="wbi:img-search">${ICON.image} Bei Google suchen</button>
      <label class="btn ghost file-btn">Datei wählen<input type="file" accept="image/*" data-input="img-file" hidden></label>
      <button class="btn ghost" type="button" data-action="wbi:img-link">Bildlink einfügen</button>
      <button class="btn ghost danger" type="button" data-action="wbi:img-remove" data-slot="img-remove" hidden>Bild entfernen</button>
    </div>
    <p class="hint" data-slot="img-status" aria-live="polite"></p>
  </div>`;
}

/**
 * ctl: { get(), set(img|null), editing(), name(), topic() }
 */
export function bindPickImage(el, api, ctl) {
  cur = { el, api, ctl };
  if (!bound) {
    bound = true;
    document.addEventListener('paste', onPaste);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
  }
  const file = el.querySelector('[data-input="img-file"]');
  if (file) {
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (f) useBlob(f);
    });
  }
}

const active = () => (cur && cur.el.isConnected && cur.ctl.editing() ? cur : null);

function status(text) {
  const c = cur;
  const out = c && c.el.querySelector('[data-slot="img-status"]');
  if (out) out.textContent = text;
}

const isImageLink = (t) => (/^https:\/\/\S+$/i.test(t) && t.length <= 4000) || /^data:image\/[a-z+.-]+;base64,[a-z0-9+/=\s]+$/i.test(t);

function srcFromHTML(html) {
  const m = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html || '');
  return m ? m[1].replace(/&amp;/g, '&').trim() : '';
}

function imageFile(dt) {
  if (!dt) return null;
  const files = [...(dt.files || [])].filter((f) => /^image\//.test(f.type));
  if (files.length) return files[0];
  const items = [...(dt.items || [])].filter((i) => i.kind === 'file' && /^image\//.test(i.type));
  return items.length ? items[0].getAsFile() : null;
}

function onPaste(e) {
  const c = active();
  if (!c) return;
  const dt = e.clipboardData;
  const file = imageFile(dt);
  if (file) {
    e.preventDefault();
    useBlob(file);
    return;
  }
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  if (typing) return; // in Name oder Hinweis wird normal eingefügt
  const text = ((dt && dt.getData('text/plain')) || '').trim();
  const src = isImageLink(text) ? text : srcFromHTML(dt && dt.getData('text/html'));
  if (src && isImageLink(src)) {
    e.preventDefault();
    useLink(src);
  }
}

function onDragOver(e) {
  if (!active() || !e.dataTransfer) return;
  const types = [...(e.dataTransfer.types || [])];
  if (types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
}

function onDrop(e) {
  if (!active() || !e.dataTransfer) return;
  const dt = e.dataTransfer;
  const file = imageFile(dt);
  const link = srcFromHTML(dt.getData('text/html')) || (dt.getData('text/uri-list') || '').split('\n').find((l) => l && !l.startsWith('#')) || '';
  if (!file && !isImageLink(link.trim())) return;
  e.preventDefault();
  if (file) useBlob(file);
  else useLink(link.trim());
}

function loadImg(src, cors) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('timeout')), LOAD_MS);
    if (cors) img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('load'));
    };
    img.src = src;
  });
}

/** Auf höchstens SIDE Pixel verkleinern und als JPEG ausgeben. Wirft bei „fremden“ Bildern (Canvas gesperrt). */
function toJpeg(img) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('empty');
  const k = Math.min(1, SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; // durchsichtige PNGs nicht schwarz werden lassen
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  for (const q of [0.82, 0.7, 0.58, 0.45, 0.32]) {
    const out = canvas.toDataURL('image/jpeg', q);
    if (out.length <= MAX_DATA) return out;
  }
  throw new Error('big');
}

export async function blobToJpeg(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return toJpeg(await loadImg(url, false));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function useBlob(blob) {
  const c = active();
  if (!c) return;
  if (blob.size > 25 * 1024 * 1024) return toast('Das Bild ist zu groß (über 25 MB).');
  status('Bild wird vorbereitet …');
  try {
    const out = await blobToJpeg(blob);
    if (active() === c) c.ctl.set(out);
  } catch {
    toast('Mit diesem Bild klappt es nicht. Probier ein anderes.');
  } finally {
    status('');
  }
}

async function useLink(raw) {
  const c = active();
  if (!c) return;
  const url = String(raw || '').replace(/\s+/g, '');
  if (!isImageLink(url)) return toast('Das ist kein Bildlink. Er muss mit https:// anfangen.');
  status('Bild wird geladen …');
  try {
    let out;
    try {
      // Erlaubt die Seite es, wird das Bild selbst gespeichert – dann hängt nichts mehr an der fremden Seite.
      out = toJpeg(await loadImg(url, true));
    } catch {
      if (url.startsWith('data:')) throw new Error('bad');
      await loadImg(url, false);
      if (url.length > MAX_LINK) throw new Error('long');
      out = url;
    }
    if (active() === c) c.ctl.set(out);
  } catch {
    toast('Das Bild ließ sich nicht laden. Tipp: Rechtsklick aufs Bild → „Bild kopieren“ und hier mit Strg+V einfügen.');
  } finally {
    status('');
  }
}

export const imageActions = {
  'wbi:img-search': () => {
    const c = cur;
    const name = c ? String(c.ctl.name() || '').trim() : '';
    if (!name) return toast('Schreib zuerst den Namen auf den Zettel.');
    window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(name), '_blank', 'noopener,noreferrer');
  },
  'wbi:img-link': () => {
    if (!active()) return;
    openSheet({
      title: 'Bildlink einfügen',
      body: `<form class="stack" data-sheet-form="img-link" novalidate>
        <label class="field"><span>Link zum Bild</span>
          <input name="url" type="url" inputmode="url" placeholder="https://…" autocomplete="off" required></label>
        <p class="hint">Bei Google: Rechtsklick aufs Bild → „Bildadresse kopieren“. Einfacher ist meist „Bild kopieren“ und dann Strg+V.</p>
        <button class="btn primary" type="submit">Übernehmen</button></form>`,
      onSubmit(form, sheet) {
        const url = String(form.url.value || '').trim();
        if (!url) return toast('Füg zuerst einen Link ein.');
        sheet.close();
        useLink(url);
      },
    });
  },
  'wbi:img-remove': () => {
    const c = active();
    if (c) c.ctl.set(null);
  },
};
