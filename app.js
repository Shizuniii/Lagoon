// app.js – die Plattform "Spieleabend": Gruppe, Startseite mit Spielen, Räume.
// Die Spiele selbst liegen in games/<id>/ und melden sich in games/index.js an.
import {
  COLORS, ICON, esc, hash, store, $, slot, setHTML, fmtDuration, fitNotes, fitWords, toast, openSheet, closeSheets,
  confirmDialog, unlockAudio, sound, noteHTML,
} from './core/ui.js';
import { Backend, isConfigured, isPermissionError } from './core/backend.js';
import { firebaseConfig } from './config.js';
import { GAMES, gameById } from './games/index.js';

export const APP_NAME = 'Spieleabend';
const VERSION = '2.4.1';
const STALE_MS = 15 * 60 * 1000;
const CODE_MIN = 10; // neue Gruppencodes: so lang, dass niemand sie durch Ausprobieren findet

// Für den Vorschlag: 128 Wörter × 128 × 128 × 1000 Zahlen ≈ 2 Milliarden Möglichkeiten
const CODE_WORDS = ('Apfel Anker Biber Blitz Bohne Brezel Buch Burg Dachs Delfin Drache Dose Eule Eimer Elch Erbse Falke Feder Fisch Flamme Floh Fuchs Gabel Gans Geist Gurke Hafen Hai Hamster Hase Hecht Heft Hirsch Honig Hummel Igel Insel Jacke Kaktus Kamel Kekse Kerze Kiwi Koala Kobold Komet Krake Krone Kuchen Lachs Lampe Laterne Lava Leiter Linse Lotse Luchs Mango Marder Maus Melone Mond Motte Muschel Nebel Nudel Oase Otter Panda Papagei Pilz Pinguin Pizza Planet Pudel Quelle Rabe Rakete Riese Robbe Rubin Sattel Schaf Schnecke Segel Socke Sonne Spatz Stern Storch Strudel Tiger Tinte Tukan Turm Ufo Uhu Vulkan Waffel Wal Wiesel Wolke Wombat Wurm Yak Zebra Zimt Zwerg Ziege Zitrone Zunder Ahorn Birke Dattel Eiche Feige Ginster Hafer Ingwer Kresse Lavendel Mohn Nelke Olive Pfeffer Quitte Rettich Salbei Tulpe Veilchen Wacholder').split(' ');
function suggestCode() {
  const r = new Uint32Array(4);
  crypto.getRandomValues(r);
  const w = (i) => CODE_WORDS[r[i] % CODE_WORDS.length];
  return `${w(0)}-${w(1)}-${w(2)}-${100 + (r[3] % 900)}`;
}

// ---------- Zustand ----------

const ctx = {
  boot: 'start', // start | install | config | loading | error | join | ready
  errorKind: null,
  errorText: '',
  dev: false,
  installDone: false,
  b: null,
  uid: null,
  owner: null,
  member: null,
  wasMember: store.get('wasMember', false),
  members: {},
  status: {},
  rooms: undefined, // undefined = noch nicht geladen
  route: { name: 'home' },
  connected: false,
  everConnected: false,
  joinError: '',
  joinDraft: { code: '', name: '' },
  busy: false,
  leavingUntil: 0,
  loadingSince: Date.now(),
  unsubs: [],
  roomId: null,
};

const hasConn = (s) => !!(s && s.conns && Object.keys(s.conns).length);

function isOnline(uid) {
  if (uid === ctx.uid) return ctx.connected;
  return hasConn(ctx.status[uid]);
}

function onlineMap() {
  const map = {};
  Object.keys(ctx.status || {}).forEach((u) => {
    map[u] = isOnline(u);
  });
  map[ctx.uid] = true;
  return map;
}

const myName = () => (ctx.member && ctx.member.name) || store.get('name', '') || 'Ich';
const memberName = (uid) => (ctx.members[uid] && ctx.members[uid].name) || 'Jemand';

function lastSeen(uid) {
  const s = ctx.status[uid];
  return (s && s.lastSeen) || 0;
}

/** Alle, die zu einem Raum gehören (Spielende und Host). */
function roomPeople(room) {
  const ids = new Set(Object.keys((room && room.players) || {}));
  if (room && room.host) ids.add(room.host);
  return [...ids];
}

function roomActive(room) {
  if (!room) return false;
  const now = ctx.b ? ctx.b.now() : Date.now();
  return roomPeople(room).some((u) => isOnline(u) || now - lastSeen(u) < STALE_MS);
}

function myRoomEntry() {
  if (!ctx.rooms) return null;
  const mine = Object.entries(ctx.rooms).filter(([, room]) => {
    const g = gameById(room && room.game);
    return g && g.isIn(room, ctx.uid);
  });
  if (!mine.length) return null;
  const preferred = mine.find(([id]) => id === ctx.roomId);
  if (preferred) return preferred;
  mine.sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  return mine[0];
}

// ---------- Schnittstelle für die Spiele ----------

const api = {
  ctx,
  get uid() {
    return ctx.uid;
  },
  get b() {
    return ctx.b;
  },
  get members() {
    return ctx.members;
  },
  get status() {
    return ctx.status;
  },
  get room() {
    const e = myRoomEntry();
    return e ? e[1] : null;
  },
  get roomId() {
    const e = myRoomEntry();
    return e ? e[0] : null;
  },
  isOnline,
  hasConn,
  onlineMap,
  myName,
  memberName,
  lastSeen,
  rttOf(uid) {
    const s = ctx.status[uid];
    return s && typeof s.rtt === 'number' ? s.rtt : null;
  },
  render: () => scheduleRender(),
  renderNow: () => render(),
  /** Raum atomar ändern (siehe Backend.roomTx), mit Fehlermeldung. */
  async roomTx(roomId, fn) {
    try {
      return await ctx.b.roomTx(roomId, fn);
    } catch (err) {
      console.error(err);
      toast(isPermissionError(err) ? 'Dafür fehlt die Berechtigung.' : 'Das hat nicht geklappt. Prüf deine Verbindung.');
      return { committed: false, value: undefined };
    }
  },
  enterRoom(roomId) {
    ctx.roomId = roomId;
    ctx.route = { name: 'home' };
    scheduleRender();
  },
  /** Kurz merken, dass man selbst gegangen ist (keine "du wurdest entfernt"-Meldung). */
  leaving() {
    ctx.leavingUntil = Date.now() + 4000;
  },
  navigate(route) {
    ctx.route = route;
    try {
      history.pushState({ route }, '');
    } catch {}
    scheduleRender();
  },
  home() {
    ctx.route = { name: 'home' };
    scheduleRender();
  },
  topbar,
  roomColor(room, uid) {
    const p = room && room.players && room.players[uid];
    const idx = p && typeof p.color === 'number' ? p.color : hash(uid);
    return COLORS[idx % COLORS.length];
  },
  personRow,
  onlineMeta,
};

// ---------- Plattform & Installation ----------

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = () => isIOS() || /Android/i.test(navigator.userAgent);

function isStandalone() {
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
  return modes.some((m) => window.matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true;
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  scheduleRender();
});
window.addEventListener('appinstalled', () => {
  ctx.installDone = true;
  deferredPrompt = null;
  scheduleRender();
});
window.addEventListener('popstate', (e) => {
  ctx.route = (e.state && e.state.route) || { name: 'home' };
  closeSheets();
  scheduleRender();
});

function installVariant() {
  if (ctx.installDone) return 'done';
  if (deferredPrompt) return 'prompt';
  if (isIOS()) return 'ios';
  return 'manual';
}

// ---------- Start ----------

async function boot() {
  const params = new URLSearchParams(location.search);
  ctx.dev = params.has('dev') || sessionStorage.getItem('wbi-dev') === '1';
  if (ctx.dev) sessionStorage.setItem('wbi-dev', '1');
  const hashCode = new URLSearchParams(location.hash.slice(1)).get('code');
  if (hashCode) ctx.joinDraft.code = hashCode;

  if ('serviceWorker' in navigator && !ctx.dev) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        // Auch bei lange offener App nach Updates schauen: beim Zurückkehren ins Fenster und alle 30 Minuten
        const check = () => reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
        setInterval(check, 30 * 60 * 1000);
      })
      .catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return; // erste Installation: nichts tun
      if (!myRoomEntry()) {
        reloaded = true;
        location.reload();
      } else {
        toast('Neue Version der App ist da. Öffne die App nach dem Spiel einmal neu, dann ist sie aktiv.');
      }
    });
  }

  if (!isStandalone() && !ctx.dev) {
    ctx.boot = 'install';
    return render();
  }
  if (!isConfigured(firebaseConfig)) {
    ctx.boot = 'config';
    return render();
  }
  ctx.boot = 'loading';
  ctx.loadingSince = Date.now();
  render();
  try {
    ctx.b = new Backend(firebaseConfig);
    ctx.uid = await ctx.b.start();
    ctx.b.onConnection((on) => {
      ctx.connected = on;
      if (on) ctx.everConnected = true;
      updateNetbar();
      scheduleRender();
    });
    ctx.owner = await ctx.b.groupOwner();
    ctx.member = await ctx.b.myMembership();
    if (ctx.member) enterGroup();
    else {
      ctx.boot = 'join';
      render();
    }
  } catch (err) {
    console.error(err);
    const code = String((err && err.code) || '');
    ctx.errorKind = /operation-not-allowed|admin-restricted/.test(code)
      ? 'anon'
      : /network|offline|unavailable/i.test(code + ' ' + (err && err.message))
        ? 'network'
        : 'other';
    ctx.errorText = (err && (err.code || err.message)) || String(err);
    ctx.boot = 'error';
    render();
  }
}

function enterGroup() {
  ctx.boot = 'ready';
  ctx.wasMember = true;
  store.set('wasMember', true);
  const b = ctx.b;
  b.startPresence();
  ctx.unsubs.push(
    b.watch(
      'members',
      (v) => {
        ctx.members = v || {};
        if (!ctx.members[ctx.uid]) return lostMembership();
        ctx.member = ctx.members[ctx.uid];
        scheduleRender();
      },
      (err) => {
        if (isPermissionError(err)) lostMembership();
      }
    ),
    b.watch('status', (v) => {
      ctx.status = v || {};
      GAMES.forEach((g) => g.onStatus && g.onStatus(api));
      scheduleRender();
    }),
    b.watch(
      'rooms',
      (v) => onRooms(v || {}),
      (err) => console.warn('Räume nicht lesbar', err)
    )
  );
  render();
}

function lostMembership() {
  ctx.unsubs.forEach((off) => off && off());
  ctx.unsubs = [];
  ctx.b.stopPresence();
  ctx.rooms = undefined;
  ctx.member = null;
  ctx.boot = 'join';
  ctx.joinError = '';
  GAMES.forEach((g) => g.onReset && g.onReset(api));
  render();
}

function onRooms(next) {
  const before = myRoomEntry();
  ctx.rooms = next;
  const after = myRoomEntry();
  if (before && (!after || after[0] !== before[0])) {
    const [id, prevRoom] = before;
    const stillThere = next[id];
    if (Date.now() > ctx.leavingUntil) {
      toast(stillThere ? 'Du wurdest aus dem Raum entfernt.' : 'Der Raum wurde geschlossen.');
    }
    closeSheets();
    const g = gameById(prevRoom.game);
    if (g && g.onRoom) g.onRoom(api, id, prevRoom, null);
  }
  if (after) {
    const [id, room] = after;
    ctx.roomId = id;
    const prevRoom = before && before[0] === id ? before[1] : null;
    const g = gameById(room.game);
    if (g && g.onRoom) g.onRoom(api, id, prevRoom, room);
  }
  scheduleRender();
}

// ---------- Darstellung ----------

const $app = document.getElementById('app');
let current = { key: null, screen: null, el: null };
let renderQueued = false;

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

const platformScreens = {};
function allScreens() {
  const all = { ...platformScreens };
  GAMES.forEach((g) => Object.assign(all, g.screens));
  return all;
}

function screenName() {
  if (ctx.boot !== 'ready') return ctx.boot === 'start' ? 'loading' : ctx.boot;
  if (ctx.rooms === undefined) return 'loading';
  const entry = myRoomEntry();
  if (entry) {
    const g = gameById(entry[1].game);
    return g ? g.screenFor(api, entry[1], entry[0]) : 'unknown';
  }
  if (ctx.route && ctx.route.game) {
    const g = gameById(ctx.route.game);
    const s = g && g.localScreenFor && g.localScreenFor(api, ctx.route);
    if (s) return s;
  }
  return 'home';
}

function render() {
  renderQueued = false;
  const screens = allScreens();
  const name = screenName();
  const screen = screens[name] || screens.unknown;
  const key = name + ':' + (screen.key ? screen.key(api) : '');
  if (key !== current.key) {
    if (current.screen && current.screen.unmount) current.screen.unmount(current.el, api);
    const el = document.createElement('div');
    el.className = 'view view-' + name.replace(':', '-');
    $app.replaceChildren(el);
    screen.mount(el, api);
    const sameName = current.key && current.key.split(':').slice(0, 2).join(':') === key.split(':').slice(0, 2).join(':');
    current = { key, screen, el };
    if (!sameName) window.scrollTo(0, 0);
  }
  screen.update(current.el, api);
  fitNotes(current.el);
  fitWords(current.el);
  updateTimers();
  updateNetbar();
  GAMES.forEach((g) => g.afterRender && g.afterRender(api));
}

function topbar({ tape = null, back = null, title = null } = {}) {
  let left;
  if (back) {
    left = `<div class="row"><button class="icon-btn" data-action="${esc(back)}" aria-label="Zurück">${ICON.back}</button>${
      title ? `<span class="topbar-title">${esc(title)}</span>` : ''
    }</div>`;
  } else if (tape !== null) left = `<div class="tape" title="${esc(tape)}">${esc(tape)}</div>`;
  else left = `<div class="brand">${APP_NAME}</div>`;
  return `<header class="topbar">${left}<button class="icon-btn" data-action="menu" aria-label="Menü öffnen">${ICON.menu}</button></header>`;
}

function logoNote(small = false) {
  return `<div class="logo-note${small ? ' small' : ''}" aria-hidden="true">${noteHTML({ color: 'c-yellow', key: 'logo', name: APP_NAME, fit: 40 })}</div>`;
}

function personRow(uid, { meta = '', button = false, swatch = true, color = null, name = null, badge = '' } = {}) {
  const label = name || memberName(uid);
  const you = uid === ctx.uid ? ' <span class="person-you">(du)</span>' : '';
  const sw = swatch ? `<span class="swatch ${color || COLORS[hash(uid) % COLORS.length]}"></span>` : '';
  const inner = `${sw}<span class="person-name">${esc(label)}${you}</span>${badge}<span class="person-meta">${meta}</span>`;
  return button
    ? `<li><button class="person" data-action="${esc(button)}" data-uid="${esc(uid)}">${inner}</button></li>`
    : `<li><div class="person">${inner}</div></li>`;
}

function onlineMeta(uid, { ping = false } = {}) {
  if (!isOnline(uid)) return '<span class="dot"></span>offline';
  const rtt = api.rttOf(uid);
  return `<span class="dot on"></span>${ping && rtt != null ? `${rtt} ms` : 'online'}`;
}

function updateTimers() {
  if (!ctx.b) return;
  const now = ctx.b.now();
  document.querySelectorAll('[data-since]').forEach((el) => {
    const since = Number(el.dataset.since);
    el.textContent = since ? fmtDuration(now - since) : '';
  });
  document.querySelectorAll('[data-until]').forEach((el) => {
    const until = Number(el.dataset.until);
    el.textContent = until ? Math.max(0, Math.ceil((until - now) / 1000)) : '';
  });
}

let netTimer = null;
function updateNetbar() {
  const shouldShow = ctx.boot === 'ready' && ctx.everConnected && !ctx.connected;
  let bar = document.getElementById('netbar');
  if (!shouldShow) {
    clearTimeout(netTimer);
    netTimer = null;
    if (bar) bar.remove();
    return;
  }
  if (bar || netTimer) return;
  netTimer = setTimeout(() => {
    netTimer = null;
    if (ctx.connected || document.getElementById('netbar')) return;
    bar = document.createElement('div');
    bar.id = 'netbar';
    bar.className = 'netbar';
    bar.setAttribute('role', 'status');
    bar.textContent = 'Keine Verbindung – die App versucht es weiter.';
    document.body.appendChild(bar);
  }, 2500);
}

// ---------- Plattform-Bildschirme ----------

platformScreens.loading = {
  mount(el) {
    el.innerHTML = `<main class="center-screen">${logoNote()}<div class="spinner" role="status" aria-label="Verbinde"></div><p class="muted" style="text-align:center" data-slot="msg">Verbinde …</p></main>`;
  },
  update(el) {
    if (Date.now() - ctx.loadingSince > 9000) {
      slot(el, 'msg').textContent = 'Das dauert länger als sonst. Prüf deine Internetverbindung.';
    }
  },
};

platformScreens.unknown = {
  mount(el) {
    el.innerHTML = `${topbar()}<main class="screen"><div class="notice warn"><p>Dieses Spiel kennt deine App noch nicht. Lade die App neu, um die neueste Version zu bekommen.</p>
      <button class="btn secondary" data-action="reload">Neu laden</button></div></main>`;
  },
  update() {},
};

platformScreens.install = {
  key: () => installVariant(),
  mount(el) {
    const v = installVariant();
    let body;
    if (v === 'done') {
      body = `<p class="lead">Installiert! Öffne „${APP_NAME}“ jetzt über das neue Symbol${isMobile() ? ' auf deinem Startbildschirm' : ''}.</p>`;
    } else if (v === 'prompt') {
      body = '<button class="btn primary big" data-action="install">App installieren</button>';
    } else if (v === 'ios') {
      body = `<ol class="steps">
        <li>Tippe in Safari unten auf <strong>Teilen</strong> ${ICON.share}.</li>
        <li>Wähle <strong>„Zum Home-Bildschirm“</strong>.</li>
        <li>Öffne die App über das neue Symbol.</li></ol>`;
    } else {
      body = `<ol class="steps">
        <li>Öffne das Browser-Menü ${ICON.dots}</li>
        <li>Wähle <strong>„App installieren“</strong> oder <strong>„Zum Startbildschirm hinzufügen“</strong>.</li>
        <li>Öffne die App über das neue Symbol.</li></ol>
        <p class="small muted">Am zuverlässigsten klappt das mit Chrome oder Edge. In anderen Browsern (z. B. Firefox oder Safari am Mac) geht es nicht immer – nimm dann Chrome oder Edge.</p>`;
    }
    el.innerHTML = `<main class="center-screen">${logoNote()}
      <div class="stack-tight"><h1>Erst installieren, dann mitspielen</h1>
      <p class="lead">${APP_NAME} läuft nur als installierte App. Das dauert zehn Sekunden.</p></div>
      <div class="stack">${body}</div>
      <p class="footer-note">Schon installiert? Dann öffne die App über ihr Symbol.</p></main>`;
  },
  update() {},
};

platformScreens.config = {
  mount(el) {
    el.innerHTML = `<main class="center-screen">${logoNote()}
      <div class="stack"><h1>Firebase fehlt noch</h1>
      <p class="lead">Die App ist noch mit keinem Firebase-Projekt verbunden.</p>
      <p>Trag deine Firebase-Daten in <span class="kbd">config.js</span> ein und lade die Datei neu hoch. Wie das geht, steht in der Anleitung (README).</p></div></main>`;
  },
  update() {},
};

platformScreens.error = {
  key: () => ctx.errorKind,
  mount(el) {
    const texts = {
      anon: ['Anmeldung ist in Firebase noch aus', 'Aktiviere in der Firebase Console unter Security → Authentication die Anmeldemethode „Anonymous“.'],
      network: ['Keine Verbindung', 'Prüf dein Internet und versuch es nochmal.'],
      other: ['Etwas ist schiefgelaufen', 'Versuch es nochmal. Wenn es wieder passiert, schick Shy diese Meldung:'],
    };
    const [title, text] = texts[ctx.errorKind] || texts.other;
    el.innerHTML = `<main class="center-screen">${logoNote()}
      <div class="stack"><h1>${title}</h1><p class="lead">${text}</p>
      ${ctx.errorKind === 'other' ? `<p class="code-box small">${esc(ctx.errorText)}</p>` : ''}
      <button class="btn primary" data-action="reload">Nochmal versuchen</button></div></main>`;
  },
  update() {},
};

platformScreens.join = {
  key: () => (ctx.owner ? 'join' : 'setup'),
  mount(el) {
    const setup = !ctx.owner;
    const intro = setup
      ? 'Du bist die erste Person hier. Leg einen Gruppencode fest – nur wer ihn kennt, kommt rein.'
      : ctx.wasMember
        ? 'Du bist nicht mehr in der Gruppe. Vielleicht wurde der Gruppencode geändert – gib den aktuellen ein.'
        : 'Gib den Gruppencode ein, den du bekommen hast.';
    el.innerHTML = `<main class="center-screen">${logoNote(true)}
      <form class="stack" data-form="${setup ? 'setup' : 'join'}" novalidate>
        <div class="stack-tight"><h1>${setup ? 'Gruppe einrichten' : 'Gruppe beitreten'}</h1><p class="muted">${esc(intro)}</p></div>
        <label class="field"><span>Gruppencode</span>
          <input name="code" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" ${setup ? 'placeholder="z. B. Pizza-Drache-42"' : ''}></label>
        ${setup ? `<div class="row-wrap"><button type="button" class="btn ghost" data-action="suggest-code">${ICON.dice} Code würfeln</button><p class="hint">Mindestens ${CODE_MIN} Zeichen. Am sichersten ist ein gewürfelter Code – ihr müsst ihn euch nicht merken, er steht in der Einladung.</p></div>` : ''}
        <label class="field"><span>Dein Name</span>
          <input name="name" type="text" autocomplete="nickname" maxlength="20"></label>
        <p class="form-error" data-slot="error" role="alert"></p>
        <button class="btn primary big" type="submit" data-slot="submit">${setup ? 'Gruppe einrichten' : 'Beitreten'}</button>
      </form></main>`;
    const form = el.querySelector('form');
    form.code.value = ctx.joinDraft.code || '';
    form.name.value = ctx.joinDraft.name || store.get('name', '');
    form.addEventListener('input', () => {
      ctx.joinDraft = { code: form.code.value, name: form.name.value };
    });
  },
  update(el) {
    slot(el, 'error').textContent = ctx.joinError || '';
    slot(el, 'submit').disabled = ctx.busy;
  },
};

function roomRows(game) {
  const entries = Object.entries(ctx.rooms || {})
    .filter(([, r]) => r && r.game === game.id && roomActive(r))
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
  if (!entries.length) return '';
  return `<ul class="room-list">${entries
    .map(([id, room]) => {
      const s = game.roomSummary(api, room, id);
      return `<li class="room-row"><div class="room-text"><strong>${esc(s.title)}</strong><span>${esc(s.meta)}</span></div>
        <button class="btn secondary" data-action="join-room" data-room="${esc(id)}">${esc(s.joinLabel || 'Beitreten')}</button></li>`;
    })
    .join('')}</ul>`;
}

platformScreens.home = {
  mount(el) {
    el.innerHTML = `${topbar()}<main class="screen home">
      <div class="stack-tight"><h1>Was spielen wir?</h1><p class="muted" data-slot="online"></p></div>
      <section class="games">${GAMES.map(
        (g) => `<article class="game-card" data-game="${g.id}">
          <div class="game-art" aria-hidden="true">${g.art()}</div>
          <div class="game-body">
            <div class="stack-tight"><h2>${esc(g.name)}</h2><p class="muted">${esc(g.tagline)}</p></div>
            <div data-slot="rooms-${g.id}"></div>
            <div class="row-wrap">${g.cardButtons(api)}</div>
          </div></article>`
      ).join('')}</section>
      <section class="section"><h2 class="section-title">In der Gruppe</h2><ul class="people" data-slot="members"></ul></section>
      <div data-slot="owner"></div></main>`;
  },
  update(el) {
    GAMES.forEach((g) => setHTML(slot(el, 'rooms-' + g.id), roomRows(g)));
    const ids = Object.keys(ctx.members).sort((a, b) => {
      const on = Number(isOnline(b)) - Number(isOnline(a));
      return on || String(ctx.members[a].name).localeCompare(String(ctx.members[b].name), 'de');
    });
    const online = ids.filter((u) => isOnline(u)).length;
    slot(el, 'online').textContent = `${online} von ${ids.length} aus der Gruppe sind online.`;
    setHTML(slot(el, 'members'), ids.map((u) => personRow(u, { meta: onlineMeta(u), swatch: false })).join(''));
    setHTML(
      slot(el, 'owner'),
      ctx.owner === ctx.uid ? '<button class="btn secondary block" data-action="invite">Freunde einladen</button>' : ''
    );
  },
};

// ---------- Menü & Gruppe verwalten ----------

function openMenu() {
  const owner = ctx.owner === ctx.uid && ctx.boot === 'ready';
  const soundOn = store.get('sound', true);
  openSheet({
    title: 'Menü',
    body: `${
      ctx.boot === 'ready'
        ? `<form class="stack-tight" data-sheet-form="rename"><label class="field"><span>Dein Name</span>
          <input name="name" maxlength="20" value="${esc(myName())}" autocomplete="nickname"></label>
          <button class="btn secondary" type="submit">Name speichern</button></form>`
        : ''
    }
      <div class="toggle"><span>Töne</span>
        <button class="switch" role="switch" aria-checked="${soundOn}" data-sa="sound" aria-label="Töne"></button></div>
      ${
        owner
          ? `<hr><div class="stack-tight"><h3>Gruppe verwalten</h3><p class="muted small">Das siehst nur du, weil du die Gruppe eingerichtet hast.</p></div>
        <div class="sheet-actions">
          <button class="btn secondary" data-sa="invite">Freunde einladen</button>
          <button class="btn secondary" data-sa="code">Gruppencode ansehen oder ändern</button>
          <button class="btn secondary" data-sa="members">Mitglieder verwalten</button></div>`
          : ''
      }
      ${ctx.boot === 'ready' ? '<hr><button class="btn ghost danger" data-sa="leave-group">Gruppe verlassen</button>' : ''}
      <p class="footer-note">${APP_NAME} ${VERSION}${ctx.uid ? `<br>Geräte-ID: ${esc(ctx.uid)}` : ''}</p>`,
    onAction(action, btn, api2) {
      if (action === 'sound') {
        const on = !store.get('sound', true);
        store.set('sound', on);
        btn.setAttribute('aria-checked', String(on));
        if (on) {
          unlockAudio();
          sound('turn');
        }
      }
      if (action === 'invite') {
        api2.close();
        invite();
      }
      if (action === 'code') {
        api2.close();
        openCode();
      }
      if (action === 'members') {
        api2.close();
        openMembers();
      }
      if (action === 'leave-group') {
        api2.close();
        leaveGroup();
      }
    },
    async onSubmit(form, api2) {
      const name = String(form.name.value || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!name) return toast('Der Name darf nicht leer sein.');
      if (!sameName(name, myName()) && (await nameInUse(name).catch(() => false))) {
        api2.close();
        const keep = await confirmDialog({
          title: `„${name}“ gibt es schon`,
          text: 'In der Gruppe heißt schon jemand so. Ihr könntet euch im Spiel verwechseln.',
          ok: 'Trotzdem nehmen',
          cancel: 'Anderen Namen wählen',
        });
        if (!keep) return openMenu();
      }
      try {
        await ctx.b.rename(name);
        store.set('name', name);
        const entry = myRoomEntry();
        if (entry) {
          const g = gameById(entry[1].game);
          if (g && g.rename) await g.rename(api, entry[0], name);
        }
        api2.close();
        toast('Name gespeichert.');
      } catch {
        toast('Der Name konnte nicht gespeichert werden.');
      }
    },
  });
}

const appUrl = () => location.origin + location.pathname;

async function invite() {
  let code = '';
  try {
    code = (await ctx.b.getCode()) || '';
  } catch {
    /* nur wer die Gruppe eingerichtet hat, sieht den Code */
  }
  const text = `Komm zum ${APP_NAME} 🎲\n1. Öffne den Link und installier die App: ${appUrl()}\n2. Gruppencode: ${code}`;
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Einladung kopiert. Füg sie in WhatsApp oder Discord ein.');
  } catch {
    openSheet({ title: 'Einladung', body: `<p class="muted">Kopier diesen Text und schick ihn deinen Freunden:</p><p class="code-box small" style="white-space:pre-line">${esc(text)}</p>` });
  }
}

async function openCode() {
  let code = '';
  try {
    code = (await ctx.b.getCode()) || '';
  } catch {
    return toast('Den Code kann nur sehen, wer die Gruppe eingerichtet hat.');
  }
  openSheet({
    title: 'Gruppencode',
    body: `<div class="code-box"><span data-code>${esc(code)}</span><button class="btn secondary" data-sa="copy">Kopieren</button></div>
      <hr>
      <form class="stack-tight" data-sheet-form="code">
        <label class="field"><span>Neuer Gruppencode</span>
          <input name="code" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="40"></label>
        <div class="row-wrap"><button type="button" class="btn ghost" data-sa="suggest">${ICON.dice} Code würfeln</button></div>
        <p class="hint">Wer schon in der Gruppe ist, bleibt drin. Neue Leute brauchen ab dann den neuen Code.</p>
        <button class="btn secondary" type="submit">Code ändern</button></form>`,
    async onAction(action, btn, api2) {
      if (action === 'suggest') {
        const input = api2.el.querySelector('input[name="code"]');
        if (input) input.value = suggestCode();
        return;
      }
      if (action === 'copy') {
        try {
          await navigator.clipboard.writeText(code);
          toast('Gruppencode kopiert.');
        } catch {
          toast('Kopieren hat nicht geklappt.');
        }
      }
    },
    async onSubmit(form, api2) {
      const next = form.code.value.trim();
      if (next.length < CODE_MIN) return toast(`Der Code braucht mindestens ${CODE_MIN} Zeichen.`);
      try {
        await ctx.b.changeCode(next);
        api2.close();
        toast('Gruppencode geändert.');
      } catch {
        toast('Der Code konnte nicht geändert werden.');
      }
    },
  });
}

function openMembers() {
  const ids = Object.keys(ctx.members).sort((a, b) => String(ctx.members[a].name).localeCompare(String(ctx.members[b].name), 'de'));
  const rows = ids
    .map((u) => {
      const meta = u === ctx.uid ? 'Gruppe eingerichtet' : `<button class="btn ghost danger" data-sa="remove" data-uid="${esc(u)}">Entfernen</button>`;
      return personRow(u, { meta, swatch: false });
    })
    .join('');
  openSheet({
    title: 'Mitglieder',
    body: `<ul class="people">${rows}</ul><p class="hint">Entfernte Leute kommen nur mit dem Gruppencode wieder rein. Ändere danach den Code, wenn jemand draußen bleiben soll.</p>`,
    async onAction(action, btn, api2) {
      if (action !== 'remove') return;
      const uid = btn.dataset.uid;
      const name = memberName(uid);
      api2.close();
      const ok = await confirmDialog({ title: `${name} entfernen?`, text: `${name} fliegt aus der Gruppe und aus allen Räumen.`, ok: 'Entfernen', danger: true });
      if (!ok) return;
      try {
        for (const [id, room] of Object.entries(ctx.rooms || {})) {
          const g = gameById(room.game);
          if (g && g.isIn(room, uid) && g.kick) await g.kick(api, id, uid, { silent: true });
        }
        await ctx.b.removeMember(uid);
        toast(`${name} ist nicht mehr in der Gruppe.`);
      } catch {
        toast('Das hat nicht geklappt.');
      }
    },
  });
}

async function leaveGroup() {
  const ok = await confirmDialog({ title: 'Gruppe verlassen?', text: 'Du brauchst danach den Gruppencode, um wieder reinzukommen.', ok: 'Verlassen', danger: true });
  if (!ok) return;
  try {
    const entry = myRoomEntry();
    if (entry) {
      const g = gameById(entry[1].game);
      api.leaving();
      if (g && g.leave) await g.leave(api, entry[0], { silent: true });
    }
    await ctx.b.leaveGroup();
    store.set('wasMember', false);
    location.reload();
  } catch {
    toast('Das hat nicht geklappt. Prüf deine Verbindung.');
  }
}

const sameName = (a, b) => String(a || '').trim().toLocaleLowerCase('de') === String(b || '').trim().toLocaleLowerCase('de');

/** Heißt in der Gruppe schon jemand anderes so? (Nur ein Hinweis – blockiert nichts.) */
async function nameInUse(name) {
  let members = ctx.members;
  if (!members || !Object.keys(members).length) members = await ctx.b.read('members').catch(() => null);
  return Object.entries(members || {}).some(([uid, m]) => uid !== ctx.uid && m && sameName(m.name, name));
}

async function warnSameName(name) {
  if (!(await nameInUse(name))) return;
  const ok = await confirmDialog({
    title: `„${name}“ gibt es schon`,
    text: 'In der Gruppe heißt schon jemand so. Nimm am besten einen anderen Namen, sonst verwechselt ihr euch im Spiel.',
    ok: 'Namen ändern',
    cancel: 'So lassen',
  });
  if (ok) openMenu();
}

async function submitJoin(form, setup) {
  const code = form.code.value.trim();
  const name = String(form.name.value || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  ctx.joinDraft = { code: form.code.value, name: form.name.value };
  if (code.length < (setup ? CODE_MIN : 6)) {
    ctx.joinError = setup ? `Der Gruppencode braucht mindestens ${CODE_MIN} Zeichen. Tipp: Code würfeln.` : 'Der Gruppencode ist länger. Prüf, ob du ihn ganz kopiert hast.';
    return render();
  }
  if (!name) {
    ctx.joinError = 'Gib deinen Namen ein.';
    return render();
  }
  ctx.joinError = '';
  ctx.busy = true;
  render();
  try {
    if (setup) await ctx.b.setupGroup(code, name);
    else await ctx.b.joinGroup(code, name);
    store.set('name', name);
    ctx.member = { name };
    if (setup) ctx.owner = ctx.uid;
    ctx.busy = false;
    enterGroup();
    if (setup) toast('Gruppe eingerichtet. Lade jetzt deine Freunde ein.');
    else warnSameName(name).catch(() => {});
  } catch (err) {
    if (!(err && err.kind)) console.error(err);
    ctx.busy = false;
    if (err && err.kind === 'wrong-code') {
      ctx.joinError = 'Der Gruppencode stimmt nicht. Frag nach dem aktuellen Code.';
    } else if (err && err.kind === 'exists') {
      ctx.owner = (await ctx.b.groupOwner().catch(() => null)) || 'unbekannt';
      ctx.joinError = 'Es gibt schon eine Gruppe. Gib ihren Code ein.';
    } else {
      ctx.joinError = 'Das hat nicht geklappt. Prüf deine Verbindung und versuch es nochmal.';
    }
    render();
  }
}

// ---------- Aktionen ----------

async function cleanupStaleRooms(gameId) {
  for (const [id, room] of Object.entries(ctx.rooms || {})) {
    if (room && room.game === gameId && !roomActive(room)) {
      await ctx.b.deleteRoom(id).catch(() => {});
    }
  }
}

const platformActions = {
  reload: () => location.reload(),
  install: async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    if (choice && choice.outcome === 'accepted') ctx.installDone = true;
    render();
  },
  menu: () => openMenu(),
  invite: () => invite(),
  'suggest-code': () => {
    const input = document.querySelector('form[data-form="setup"] input[name="code"]');
    if (!input) return;
    input.value = suggestCode();
    ctx.joinDraft = { ...ctx.joinDraft, code: input.value };
  },
  home: () => {
    if (history.state && history.state.route) history.back();
    else api.home();
  },
  'open-room': async (btn) => {
    const g = gameById(btn.dataset.game);
    if (!g) return;
    cleanupStaleRooms(g.id);
    await g.openRoom(api, btn);
  },
  'join-room': async (btn) => {
    const id = btn.dataset.room;
    const room = ctx.rooms && ctx.rooms[id];
    const g = room && gameById(room.game);
    if (!g) return;
    btn.disabled = true;
    await g.joinRoom(api, id, room);
    btn.disabled = false;
  },
};

function findAction(name) {
  if (platformActions[name]) return platformActions[name];
  for (const g of GAMES) if (g.actions && g.actions[name]) return (btn, e) => g.actions[name](api, btn, e);
  return null;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled || btn.closest('.overlay')) return;
  const fn = findAction(btn.dataset.action);
  if (fn) {
    e.preventDefault();
    fn(btn, e);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.form === 'setup') return submitJoin(form, true);
  if (form.dataset.form === 'join') return submitJoin(form, false);
  for (const g of GAMES) if (g.forms && g.forms[form.dataset.form]) return g.forms[form.dataset.form](api, form);
});

window.addEventListener('resize', () => scheduleRender());
setInterval(updateTimers, 250);
setInterval(() => {
  if (ctx.boot === 'ready' || ctx.boot === 'loading') scheduleRender();
}, 5000);

boot();
