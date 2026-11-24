// core/ui.js – gemeinsame Bausteine für Plattform und Spiele.

export const COLORS = ['c-yellow', 'c-pink', 'c-mint', 'c-sky', 'c-orange', 'c-lilac'];

export const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  crown: '<svg class="crown" viewBox="0 0 24 24" fill="currentColor" aria-label="Admin" role="img"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z"/></svg>',
  mic: '<svg class="crown" viewBox="0 0 24 24" fill="currentColor" aria-label="Host" role="img"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 9h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-2.1A7 7 0 0 1 5 12z"/></svg>',
  check: '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  cross: '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 11v9h14v-9"/></svg>',
  dots: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" style="vertical-align:-3px"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  dice: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
  arrow: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  play: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>',
  restart: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>',
  image: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/></svg>',
  video: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3z"/></svg>',
  audio: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  timer: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 3h5"/></svg>',
  eye: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  shield: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/></svg>',
  swap: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h13l-3.5-3.5M20 15H7l3.5 3.5"/></svg>',
  ban: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/></svg>',
  plus: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  left: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/></svg>',
  copy: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>',
  warn: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
};

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const tilt = (key) => (((hash(key) % 7) - 3) * 0.8).toFixed(1);

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('wbi:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('wbi:' + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  del(key) {
    try {
      localStorage.removeItem('wbi:' + key);
    } catch {}
  },
};

export const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const $ = (sel, root = document) => root.querySelector(sel);
export const slot = (root, name) => root.querySelector(`[data-slot="${name}"]`);

export function setHTML(el, html) {
  if (!el || el._html === html) return;
  // Was gerade getippt wird, überlebt das Neuzeichnen – aber nur in dasselbe Feld (gleiches data-keep).
  const kept = [...el.querySelectorAll('[data-keep]')]
    .map((i) => ({ k: i.dataset.keep, v: i.value, f: document.activeElement === i, s: i.selectionStart, e: i.selectionEnd }))
    .filter((x) => x.v || x.f);
  el.innerHTML = html;
  el._html = html;
  kept.forEach((x) => {
    const i = [...el.querySelectorAll('[data-keep]')].find((n) => n.dataset.keep === x.k);
    if (!i) return;
    if (x.v && !i.value) i.value = x.v;
    if (x.f) {
      i.focus({ preventScroll: true });
      try {
        i.setSelectionRange(x.s, x.e);
      } catch {
        /* Zahlenfelder kennen keine Auswahl */
      }
    }
  });
}

export function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export const fmtSeconds = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';
export const fmtPoints = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);

export const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');

/** Klebezettel mit Marker-Schrift. color = CSS-Klasse wie 'c-yellow'. */
/** Nur Bilder, die wir selbst erzeugen (JPEG als data:-Link) oder https-Links – alles andere wird ignoriert. */
export function safeImg(src) {
  if (typeof src !== 'string') return '';
  if (src.length <= 200000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(src)) return src;
  if (src.length <= 2000 && /^https:\/\/[^\s"'<>\\]+$/i.test(src)) return src;
  return '';
}

export function noteHTML({ color = 'c-yellow', key = '', name = null, hint = null, img = null, mystery = false, fit = 40, extra = '', sub = '', cls = '' } = {}) {
  let inner;
  const pic = mystery || name == null ? '' : safeImg(img);
  const f = pic ? Math.round(fit * 0.6) : fit;
  if (mystery) inner = `<div class="note-name"><span data-fit="${Math.round(fit * 1.6)}">?</span></div>`;
  else if (name == null) inner = `<div class="note-name"><span data-fit="${fit}">…</span></div>`;
  else inner = `<div class="note-name"><span data-fit="${f}">${esc(name)}</span></div>`;
  if (pic) inner = `<div class="note-img"><img src="${esc(pic)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false"></div>${inner}`;
  if (hint && !mystery) inner += `<div class="note-hint">${esc(hint)}</div>`;
  if (sub) inner += `<div class="note-sub">${esc(sub)}</div>`;
  const classes = ['note', color, mystery ? 'mystery' : '', !mystery && name == null ? 'pending' : '', pic ? 'has-img' : '', cls].filter(Boolean).join(' ');
  return `<div class="${classes}" style="--tilt:${tilt(key)}deg">${inner}${extra}</div>`;
}

/** Schrift in Zetteln so groß wie möglich, ohne Wörter zu trennen. */
export function fitNotes(root) {
  root.querySelectorAll('.note-name > span[data-fit]').forEach((span) => {
    const box = span.parentElement;
    if (!box.clientWidth || !box.clientHeight) return;
    const key = span.textContent + '|' + box.clientWidth + '|' + box.clientHeight;
    if (span._fitKey === key) return;
    span._fitKey = key;
    span.style.display = 'block';
    span.style.overflowWrap = 'normal';
    let size = Number(span.dataset.fit) || 40;
    span.style.fontSize = size + 'px';
    while (size > 11 && (span.offsetHeight > box.clientHeight || span.scrollWidth > span.clientWidth + 1)) {
      size -= 1.5;
      span.style.fontSize = size + 'px';
    }
    if (span.scrollWidth > span.clientWidth + 1) span.style.overflowWrap = 'anywhere';
  });
}

/** Einzeilige Beschriftungen verkleinern, bis das längste Wort passt (keine Trennung mitten im Wort). */
export function fitWords(root) {
  root.querySelectorAll('[data-fitw]').forEach((el) => {
    const box = el.parentElement;
    if (!box || !box.clientWidth) return;
    const key = el.textContent + '|' + box.clientWidth;
    if (el._fitKey === key) return;
    el._fitKey = key;
    let size = Number(el.dataset.fitw) || 16;
    el.style.fontSize = size + 'px';
    while (size > 9 && el.scrollWidth > el.clientWidth + 1) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  });
}

if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener('loadingdone', () => {
    document.querySelectorAll('[data-fit]').forEach((span) => {
      span._fitKey = null;
    });
    fitNotes(document.body);
    document.querySelectorAll('[data-fitw]').forEach((el) => {
      el._fitKey = null;
    });
    fitWords(document.body);
  });
}

// ---------- Meldungen ----------

export function announce(text) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => {
    live.textContent = text;
  }, 50);
}

let toastTimer = null;
export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

// ---------- Blätter & Dialoge ----------

const openSheets = new Set();

export function openSheet({ title, body, wide = false, onAction = () => {}, onSubmit = () => {}, onClose = () => {}, onInput = null }) {
  const layer = document.getElementById('layer');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-sa="close" aria-label="Schließen">${ICON.close}</button></div>
    ${body}</div>`;
  const lastFocus = document.activeElement;
  let closed = false;
  const api = {
    el: overlay,
    close() {
      if (closed) return;
      closed = true;
      overlay.remove();
      openSheets.delete(api);
      document.removeEventListener('keydown', onKey);
      onClose();
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    },
  };
  const onKey = (e) => {
    if (e.key === 'Escape') api.close();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) return api.close();
    const btn = e.target.closest('[data-sa]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.sa === 'close') return api.close();
    onAction(btn.dataset.sa, btn, api);
  });
  overlay.addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit(e.target, api);
  });
  if (onInput) overlay.addEventListener('input', (e) => onInput(e.target, api));
  document.addEventListener('keydown', onKey);
  layer.appendChild(overlay);
  openSheets.add(api);
  fitNotes(overlay);
  const first = overlay.querySelector('[data-autofocus]') || overlay.querySelector('.sheet-head .icon-btn');
  if (first) first.focus({ preventScroll: true });
  return api;
}

export function closeSheets() {
  [...openSheets].forEach((s) => s.close());
}

export function confirmDialog({ title, text, ok = 'Ja', cancel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title,
      body: `<p class="lead">${esc(text)}</p><div class="sheet-actions">
        <button class="btn ${danger ? 'secondary danger' : 'primary'}" data-sa="ok" data-autofocus>${esc(ok)}</button>
        <button class="btn ghost" data-sa="cancel">${esc(cancel)}</button></div>`,
      onAction(name, btn, api) {
        answered = true;
        api.close();
        resolve(name === 'ok');
      },
      onClose() {
        if (!answered) resolve(false);
      },
    });
  });
}

// ---------- Ton, Vibration, Bildschirm an ----------

let audioCtx = null;
export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio, { passive: true });
}

const SOUNDS = {
  turn: [
    [660, 0, 0.4],
    [880, 0.15, 0.4],
  ],
  open: [[990, 0, 0.18]],
  buzz: [
    [220, 0, 0.22],
    [330, 0.02, 0.2],
  ],
  right: [
    [784, 0, 0.25],
    [1046, 0.12, 0.35],
  ],
  wrong: [
    [330, 0, 0.3],
    [247, 0.16, 0.4],
  ],
};

export function sound(kind = 'turn') {
  if (!store.get('sound', true) || !audioCtx) return;
  const t = audioCtx.currentTime;
  (SOUNDS[kind] || SOUNDS.turn).forEach(([freq, delay, len]) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = kind === 'buzz' ? 'square' : 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(kind === 'buzz' ? 0.08 : 0.2, t + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + len);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t + delay);
    osc.stop(t + delay + len + 0.05);
  });
}

export function vibrate(pattern) {
  const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
  if (navigator.vibrate && touched) navigator.vibrate(pattern);
}

let wakeLock = null;
let wakeBusy = false;
let wakeWanted = false;
export async function keepScreenOn(want) {
  wakeWanted = !!want;
  if (wakeBusy || !('wakeLock' in navigator)) return;
  wakeBusy = true;
  try {
    const shouldHold = wakeWanted && document.visibilityState === 'visible';
    if (shouldHold && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } else if (!shouldHold && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  } finally {
    wakeBusy = false;
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => keepScreenOn(wakeWanted));
}

/**
 * Takt, der auch weiterläuft, wenn das Fenster verdeckt oder minimiert ist. Browser bremsen normale
 * Timer dort auf einmal pro Sekunde (Chrome nach 5 Minuten sogar auf einmal pro Minute) – Timer in
 * einem Web Worker bremsen sie nicht. Gibt eine Funktion zum Anhalten zurück.
 */
export function steadyInterval(fn, ms) {
  try {
    const src = 'let t=null;onmessage=(e)=>{clearInterval(t);t=null;if(e.data>0)t=setInterval(()=>postMessage(0),e.data)};';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    let revoked = false;
    worker.onmessage = () => {
      if (!revoked) {
        revoked = true;
        URL.revokeObjectURL(url);
      }
      fn();
    };
    worker.onerror = () => {
      // Worker geht nicht (z. B. gesperrt) – normaler Timer als Ersatz
      worker.terminate();
      if (!fallback) fallback = setInterval(fn, ms);
    };
    let fallback = null;
    worker.postMessage(ms);
    return () => {
      worker.postMessage(0);
      worker.terminate();
      if (fallback) clearInterval(fallback);
    };
  } catch {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}

/** Datei zum Herunterladen anbieten (für Quiz-Export). */
export function downloadFile(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
