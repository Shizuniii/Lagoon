// games/quiz/media.js – Bilder, Videos und Töne für die Quizwand.
//
// Eigene Dateien liegen nur auf dem Gerät des Hosts (IndexedDB). Für ein Spiel werden sie
// verschlüsselt in die Datenbank geladen; den Schlüssel bekommt der Spielstand erst, wenn die
// Frage aufgedeckt wird. So laden alle Geräte vorab, aber niemand sieht oder hört etwas zu früh.
// Links (Bild-, Video-, Ton-Adressen und YouTube) laden die Geräte beim Aufdecken direkt.

import { esc, ICON, makeId, store } from '../../core/ui.js';
import { mediaPos } from './logic.js';

const MB = 1024 * 1024;
export const LIMITS = { image: 25 * MB, gif: 5 * MB, audio: 8 * MB, video: 20 * MB };
export const KIND_LABEL = { image: 'Bild', video: 'Video', audio: 'Ton', youtube: 'YouTube' };

// ---------- Zeit und Größe ----------

/** „1:23“ → 83, „90“ → 90, „1:02:03“ → 3723; leer → 0. */
export function parseTime(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return 0;
  const parts = t.split(':').map((x) => Number(x));
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return NaN;
  return Math.round(parts.reduce((acc, x) => acc * 60 + x, 0) * 10) / 10;
}

export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const s = Math.round(sec * 10) / 10;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const rs = (Number.isInteger(r) ? String(r) : r.toFixed(1)).padStart(Number.isInteger(r) ? 2 : 4, '0');
  return `${m}:${rs}`;
}

export const fmtSize = (bytes) =>
  bytes >= MB ? `${(bytes / MB).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// ---------- Links erkennen ----------

export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Startzeit aus einem YouTube-Link (?t=90, &t=1m30s, &start=90). */
export function youtubeStart(url) {
  const m = String(url || '').match(/[?&#](?:t|start)=([0-9hms]+)/);
  if (!m) return 0;
  const v = m[1];
  if (/^\d+$/.test(v)) return Number(v);
  const h = /(\d+)h/.exec(v);
  const mi = /(\d+)m/.exec(v);
  const s = /(\d+)s/.exec(v);
  return (h ? Number(h[1]) * 3600 : 0) + (mi ? Number(mi[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
}

export function linkKind(url) {
  if (youtubeId(url)) return 'youtube';
  const path = String(url || '').split(/[?#]/)[0].toLowerCase();
  if (/\.(mp3|ogg|oga|wav|m4a|aac|flac|opus)$/.test(path)) return 'audio';
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return 'video';
  if (/\.(png|jpe?g|gif|webp|avif|svg|bmp)$/.test(path)) return 'image';
  return null;
}

export const isHttps = (url) => /^https:\/\/\S+$/i.test(String(url || '').trim());

// ---------- Dateien auf diesem Gerät (IndexedDB) ----------

const DB_NAME = 'spieleabend';
const DB_STORE = 'quizMedia';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Der Speicher für Mediendateien ist nicht verfügbar.'));
    });
  }
  return dbPromise;
}

const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function os(mode) {
  const db = await openDb();
  return db.transaction(DB_STORE, mode).objectStore(DB_STORE);
}

export async function putFile({ blob, name, mime, id = null }) {
  const rec = { id: id || 'f' + makeId(), name: String(name || 'Datei').slice(0, 120), mime: mime || blob.type || 'application/octet-stream', size: blob.size, blob, createdAt: Date.now() };
  await done((await os('readwrite')).put(rec));
  return { id: rec.id, name: rec.name, mime: rec.mime, size: rec.size };
}

export async function getFile(id) {
  if (!id) return null;
  try {
    return (await done((await os('readonly')).get(id))) || null;
  } catch {
    return null;
  }
}

export async function deleteFiles(ids) {
  if (!ids || !ids.length) return;
  const store = await os('readwrite');
  await Promise.all(ids.map((id) => done(store.delete(id)).catch(() => {})));
}

export async function allFileIds() {
  try {
    return await done((await os('readonly')).getAllKeys());
  } catch {
    return [];
  }
}

export function kindOfFile(file) {
  const t = String(file.type || '');
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  return linkKind(file.name || '');
}

async function shrinkImage(file, maxSide = 1600, quality = 0.86) {
  let bmp = null;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= 700 * 1024) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const encode = (type) => new Promise((res) => canvas.toBlob(res, type, quality));
  let blob = await encode('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
  return blob && blob.size < file.size ? blob : file;
}

/** Datei für ein Quiz vorbereiten: Bilder werden verkleinert, zu große Dateien abgelehnt. */
export async function prepareFile(file) {
  const kind = kindOfFile(file);
  if (!kind) throw new Error('Diese Datei kann die Quizwand nicht zeigen. Erlaubt sind Bilder, Videos und Töne.');
  if (kind === 'image') {
    const animated = /gif|svg/.test(file.type);
    if (file.size > (animated ? LIMITS.gif : LIMITS.image)) throw new Error(`Das Bild ist zu groß (höchstens ${fmtSize(animated ? LIMITS.gif : LIMITS.image)}).`);
    const blob = animated ? file : await shrinkImage(file);
    return { kind, blob, name: file.name, mime: blob.type || file.type };
  }
  if (file.size > LIMITS[kind]) {
    throw new Error(`${kind === 'audio' ? 'Die Tondatei' : 'Das Video'} ist zu groß (höchstens ${fmtSize(LIMITS[kind])}). Kürz es oder nimm einen YouTube-Link.`);
  }
  return { kind, blob: file, name: file.name, mime: file.type || (kind === 'audio' ? 'audio/mpeg' : 'video/mp4') };
}

// ---------- Base64 ----------

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function blobToB64(blob) {
  return toB64(new Uint8Array(await blob.arrayBuffer()));
}

// ---------- Übertragung im Spiel ----------

const CHUNK = 400 * 1024; // Zeichen pro Datenbank-Eintrag

/** Host: eine Datei verschlüsselt hochladen. Gibt den (geheimen) Schlüssel zurück. */
async function uploadOne(api, roomId, rec, onBytes) {
  const plain = new Uint8Array(await rec.blob.arrayBuffer());
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const mid = makeId();
  const data = toB64(enc);
  const n = Math.ceil(data.length / CHUNK);
  await api.b.write(`media/${roomId}/files/${mid}`, { n, size: enc.length, done: false });
  for (let i = 0; i < n; i++) {
    await api.b.write(`media/${roomId}/chunks/${mid}/${i}`, data.slice(i * CHUNK, (i + 1) * CHUNK));
    if (onBytes) onBytes(Math.min(data.length, (i + 1) * CHUNK) * 0.75);
  }
  await api.b.write(`media/${roomId}/files/${mid}/done`, true);
  return { mid, key: toB64(raw), iv: toB64(iv), mime: rec.mime };
}

const mapKey = (roomId) => `quizMedia:${roomId}`;
export const loadMediaMap = (roomId) => store.get(mapKey(roomId), {}) || {};
export const forgetMediaMap = (roomId) => store.del(mapKey(roomId));

/**
 * Host: alle eigenen Dateien eines Quiz für diesen Raum hochladen (im Hintergrund, schon in der Lobby).
 * `first` = Datei, die gerade gebraucht wird – sie kommt zuerst dran.
 */
export async function uploadQuizMedia(api, roomId, fileIds, { onProgress, first = () => null, cancelled = () => false } = {}) {
  const map = loadMediaMap(roomId);
  const todo = fileIds.filter((id) => !(map[id] && map[id].mid));
  const total = fileIds.length;
  let ready = total - todo.length;
  const missing = [];
  onProgress && onProgress({ ready, total, busy: todo.length > 0, missing });
  while (todo.length) {
    if (cancelled()) return map;
    const want = first();
    const idx = want && todo.includes(want) ? todo.indexOf(want) : 0;
    const id = todo.splice(idx, 1)[0];
    const rec = await getFile(id);
    if (!rec) missing.push(id); // Datei liegt nicht (mehr) auf diesem Gerät
    if (rec) {
      try {
        map[id] = await uploadOne(api, roomId, rec);
        store.set(mapKey(roomId), map);
      } catch (err) {
        console.error(err);
        onProgress && onProgress({ ready, total, busy: true, missing, error: 'Eine Datei konnte nicht hochgeladen werden. Prüf deine Verbindung.' });
        todo.push(id);
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
    }
    ready++;
    onProgress && onProgress({ ready, total, busy: todo.length > 0, missing });
  }
  return map;
}

// Geräte der Mitspielenden: vorab laden (verschlüsselt), beim Aufdecken entschlüsseln.
const M = { roomId: null, off: null, meta: {}, data: new Map(), urls: new Map(), local: null };

export function startPrefetch(api, roomId) {
  if (M.roomId === roomId) return;
  stopPrefetch();
  M.roomId = roomId;
  M.off = api.b.watch(`media/${roomId}/files`, (files) => {
    M.meta = files || {};
    Object.entries(M.meta).forEach(([mid, f]) => {
      if (f && f.done && !M.data.has(mid)) prefetch(api, roomId, mid);
    });
  });
}

export function stopPrefetch() {
  if (M.off) M.off();
  M.urls.forEach((u) => URL.revokeObjectURL(u));
  Object.assign(M, { roomId: null, off: null, meta: {}, data: new Map(), urls: new Map(), local: null });
}

/** Host: eigene Dateien direkt vom Gerät nehmen statt aus der Datenbank. */
export function useLocalFiles(lookup) {
  M.local = lookup;
}

/** Verschlüsselte Daten laden und merken. Schlägt es fehl, wird nichts gemerkt – der nächste Versuch lädt neu. */
function prefetch(api, roomId, mid) {
  const p = fetchData(api, roomId, mid);
  M.data.set(mid, p);
  p.catch(() => {
    if (M.data.get(mid) === p) M.data.delete(mid);
  });
  return p;
}

async function fetchData(api, roomId, mid) {
  const chunks = await api.b.read(`media/${roomId}/chunks/${mid}`);
  const list = Array.isArray(chunks) ? chunks : Object.keys(chunks || {}).sort((a, b) => a - b).map((k) => chunks[k]);
  const n = M.meta[mid] && M.meta[mid].n;
  if (!list.length || (n && list.length !== n)) throw new Error('Mediendatei unvollständig');
  return list.join('');
}

function waitDone(api, roomId, mid) {
  return new Promise((resolve) => {
    if (M.meta[mid] && M.meta[mid].done) return resolve();
    const off = api.b.watch(`media/${roomId}/files/${mid}/done`, (v) => {
      if (v) {
        off();
        resolve();
      }
    });
  });
}

/** Adresse zum Abspielen einer eigenen Datei (entschlüsselt, nur im Speicher dieses Geräts). */
export async function urlForFile(api, roomId, file) {
  if (!file || !file.mid) return null;
  if (M.urls.has(file.mid)) return M.urls.get(file.mid);
  let blob = null;
  if (M.local) blob = await M.local(file.mid);
  if (!blob) {
    if (!M.data.has(file.mid)) {
      await waitDone(api, roomId, file.mid);
      if (!M.data.has(file.mid)) prefetch(api, roomId, file.mid);
    }
    const data = await M.data.get(file.mid);
    const key = await crypto.subtle.importKey('raw', fromB64(file.key), 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, key, fromB64(data));
    blob = new Blob([plain], { type: file.mime || '' });
  }
  const url = URL.createObjectURL(blob);
  M.urls.set(file.mid, url);
  return url;
}

// ---------- Darstellung ----------

function ytSrc(m, native) {
  const id = youtubeId(m.src);
  const p = new URLSearchParams({ enablejsapi: '1', rel: '0', playsinline: '1', modestbranding: '1', controls: native ? '1' : '0' });
  if (Number(m.start) > 0) p.set('start', String(Math.floor(m.start)));
  if (Number(m.end) > 0) p.set('end', String(Math.ceil(m.end)));
  if (typeof location !== 'undefined' && /^https?:/.test(location.origin)) p.set('origin', location.origin);
  return `https://www.youtube-nocookie.com/embed/${id}?${p}`;
}

/**
 * Feste HTML-Hülle für ein Medium. Sie ändert sich während einer Frage nicht – so läuft die
 * Wiedergabe beim Neuzeichnen einfach weiter. native = eigene Bedienelemente (z. B. bei der Lösung).
 */
export function mediaHTML(m, { key, native = false, label = 'zur Frage' } = {}) {
  if (!m || !m.kind) return '';
  const k = esc(key);
  const src = m.src ? `src="${esc(m.src)}"` : '';
  const mid = m.file && m.file.mid ? `data-mid="${esc(m.file.mid)}"` : '';
  if (m.kind === 'image') {
    return `<figure class="qmedia image" data-mkey="${k}"><img data-mel ${src} ${mid} alt="Bild ${esc(label)}" referrerpolicy="no-referrer" decoding="async"></figure>`;
  }
  if (m.kind === 'youtube') {
    if (!youtubeId(m.src)) return '';
    return `<div class="qmedia youtube" data-mkey="${k}" data-native="${native ? 1 : 0}"><iframe data-mel src="${esc(ytSrc(m, native))}" title="Video ${esc(label)}"
      allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" loading="eager"></iframe></div>`;
  }
  const tag = m.kind === 'video' ? 'video' : 'audio';
  return `<div class="qmedia ${m.kind}" data-mkey="${k}" data-native="${native ? 1 : 0}">
    <${tag} data-mel ${src} ${mid} preload="auto" playsinline ${native ? 'controls' : ''}></${tag}>
    ${m.kind === 'audio' && !native ? `<div class="audio-card">${ICON.audio}<span data-mstate>Gleich geht es los</span></div>` : ''}
    ${native ? '' : `<button class="media-tap" type="button" data-media-tap hidden>${ICON.play} Zum Abspielen tippen</button>`}</div>`;
}

const ytCmd = (iframe, func, args = []) => {
  try {
    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  } catch {
    /* noch nicht geladen */
  }
};

/**
 * Wiedergabe abgleichen. play = { state: 'play'|'pause', pos, at } aus dem Spielstand (oder null = noch nicht gestartet).
 * ctx = { api, roomId, now, onReady(key), onEnd }
 */
export function syncMedia(root, m, key, play, ctx) {
  if (!root || !m) return;
  const box = root.querySelector(`.qmedia[data-mkey="${key}"]`);
  if (!box) return;
  const el = box.querySelector('[data-mel]');
  if (!el) return;
  const native = box.dataset.native === '1';

  // eigene Datei: Adresse erst holen
  if (el.dataset.mid && !el.getAttribute('src')) {
    if (!el.dataset.loading) {
      el.dataset.loading = '1';
      box.classList.add('loading');
      urlForFile(ctx.api, ctx.roomId, m.file)
        .then((url) => {
          if (!url) return;
          el.src = url;
          box.classList.remove('loading');
          syncMedia(root, m, key, play, ctx);
        })
        .catch((err) => {
          console.warn('Medium konnte nicht geladen werden, neuer Versuch gleich', err);
          box.classList.add('failed');
          // nach kurzer Pause erneut versuchen (z. B. wenn das Internet kurz weg war)
          setTimeout(() => {
            delete el.dataset.loading;
            box.classList.remove('failed');
          }, 3000);
        });
    }
    return;
  }

  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    const ready = () => {
      if (box.dataset.ready) return;
      box.dataset.ready = '1';
      ctx.onReady && ctx.onReady(key);
    };
    if (m.kind === 'image') {
      if (el.complete && el.naturalWidth) ready();
      el.addEventListener('load', ready);
    } else if (m.kind === 'youtube') {
      el.addEventListener('load', () => {
        setTimeout(() => {
          box.dataset.loaded = '1';
          ready();
          delete box.dataset.applied;
          syncMedia(root, m, key, box.__play || play, ctx);
        }, 600);
      });
    } else {
      if (el.readyState >= 3) ready();
      el.addEventListener('canplay', ready);
      el.addEventListener('loadedmetadata', () => {
        const start = Number(m.start) || 0;
        if (start && el.currentTime < start && el.paused) el.currentTime = start;
      });
      el.addEventListener('timeupdate', () => {
        const end = Number(m.end) || 0;
        if (end && el.currentTime >= end && !el.paused) el.pause();
      });
      const state = box.querySelector('[data-mstate]');
      const label = () => state && (state.textContent = el.paused ? (el.currentTime > (Number(m.start) || 0) + 0.2 ? 'Pausiert' : 'Gleich geht es los') : 'Läuft');
      el.addEventListener('play', () => {
        box.classList.add('playing');
        label();
      });
      el.addEventListener('pause', () => {
        box.classList.remove('playing');
        label();
      });
      const tap = box.querySelector('[data-media-tap]');
      if (tap) {
        tap.addEventListener('click', () => {
          tap.hidden = true;
          const p = box.__play;
          if (p && p.state === 'play') {
            el.currentTime = mediaPos(p, ctx.now(), Number(m.start) || 0);
            el.play().catch(() => (tap.hidden = false));
          }
        });
      }
    }
  }
  if (native || m.kind === 'image') return;
  box.__play = play;

  const start = Number(m.start) || 0;
  const end = Number(m.end) || 0;
  if (m.kind === 'youtube') {
    if (!box.dataset.loaded) return;
    const sig = play ? `${play.state}:${play.at}` : 'none';
    if (box.dataset.applied === sig) return;
    box.dataset.applied = sig;
    if (!play) return;
    const target = mediaPos(play, ctx.now(), start);
    if (play.state === 'play' && (!end || target < end)) {
      ytCmd(el, 'seekTo', [target, true]);
      ytCmd(el, 'playVideo');
    } else {
      ytCmd(el, 'pauseVideo');
      ytCmd(el, 'seekTo', [Math.min(target, end || target), true]);
    }
    return;
  }

  if (!play) {
    if (!el.paused) el.pause();
    return;
  }
  const target = mediaPos(play, ctx.now(), start);
  const over = end && target >= end;
  if (play.state === 'play' && !over) {
    if (el.readyState >= 1 && Math.abs(el.currentTime - target) > 0.4) el.currentTime = target;
    if (el.paused) {
      el.play().catch((err) => {
        if (err && err.name === 'NotAllowedError') {
          const tap = box.querySelector('[data-media-tap]');
          if (tap) tap.hidden = false;
        }
      });
    }
  } else {
    if (!el.paused) el.pause();
    if (el.readyState >= 1 && Math.abs(el.currentTime - Math.min(target, end || target)) > 0.3) el.currentTime = Math.min(target, end || target);
  }
}

/** Kleine Vorschau im Editor (mit eigenen Bedienelementen). */
export async function previewHTML(media) {
  if (!media || !media.kind) return '';
  const start = Number(media.start) || 0;
  const end = Number(media.end) || 0;
  const frag = media.kind === 'audio' || media.kind === 'video' ? (start || end ? `#t=${start}${end ? ',' + end : ''}` : '') : '';
  if (media.file) {
    const rec = await getFile(media.file);
    if (!rec) return '<p class="hint">Die Datei ist auf diesem Gerät nicht mehr da.</p>';
    const url = URL.createObjectURL(rec.blob);
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    return mediaHTML({ ...media, src: url + frag, file: null }, { key: 'preview', native: true, label: 'zur Frage' });
  }
  return mediaHTML({ ...media, src: media.kind === 'youtube' ? media.src : media.src + frag }, { key: 'preview', native: true });
}
