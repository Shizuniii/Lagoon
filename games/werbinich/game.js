// games/werbinich/game.js – "Wer bin ich?" als Spiel der Plattform.
// Ein Raum unter /rooms/<id> ist eine Lobby im Sinne von logic.js (plus game/host/title).
// Die Zettel liegen unter /secrets/<raum>/<runde>/<ziel> – dort darf die Zielperson nicht lesen.
import * as G from './logic.js';
import {
  ICON, esc, store, makeId, $, slot, setHTML, normalize, noteHTML, fitNotes, toast, openSheet, closeSheets, safeImg,
  confirmDialog, sound, vibrate, announce, keepScreenOn,
} from '../../core/ui.js';

import { catalog, allTopics, rollTopic, topicByName, setCatalog, isCustomCatalog } from './topics.js';
import { openCatalog, keepTopic } from './catalog.js';
import { pickImageHTML, bindPickImage, imageActions } from './images.js';

const ID = 'werbinich';
const ADMIN_AWAY_MS = 20 * 1000;

// Zustand nur auf diesem Gerät
const S = {
  roomId: null,
  secrets: {},
  secretRid: null,
  subs: new Map(),
  ownRetries: 0,
  editingPick: true,
  revealOpen: false,
  flashTurn: false,
  busy: false,
  rolling: false,
  recentTopics: [],
  catTimer: null,
  catDirty: new Set(),
  groupsOpen: false,
  topicSheet: null,
  topicsOff: null,
  pickImg: null,
};

const roomOf = (api) => (api.room && api.room.game === ID ? api.room : null);
const isAdmin = (api, L) => !!(L && L.admin === api.uid);
/** Darf ich das hier? Admin darf alles, andere nur mit vergebenem Recht. */
const can = (api, L, right) => G.can(L, api.uid, right);
const colorOf = (api, L, uid) => api.roomColor(L, uid);
const FREE_LABEL = 'Freie Wahl';
/** Thema der laufenden Runde fürs Klebeband oben. */
function categoryText(L) {
  if (!L) return FREE_LABEL;
  if (L.round) return G.eachTopics(L) ? 'Jede:r ein eigenes Thema' : L.round.category || FREE_LABEL;
  return G.catModeOf(L) === 'each' ? 'Jede:r ein eigenes Thema' : L.category || FREE_LABEL;
}
const topicLabel = (t) => t || FREE_LABEL;
const MOD_BADGE = ICON.shield.replace('class="ico"', 'class="ico mod-badge" role="img" aria-label="hat Rechte"').replace(' aria-hidden="true"', '');

function adminAway(api, L) {
  if (!L || !L.admin || L.admin === api.uid || !L.players || !L.players[api.uid]) return false;
  if (api.hasConn(api.status[L.admin])) return false;
  return api.b.now() - api.lastSeen(L.admin) > ADMIN_AWAY_MS;
}

function adminAwayNotice(api, L) {
  if (!adminAway(api, L)) return '';
  return `<div class="notice warn"><p><strong>${esc(G.playerName(L, L.admin))}</strong> ist gerade offline. Damit es weitergeht, kann jemand anderes Admin werden.</p>
    <button class="btn secondary" data-action="wbi:take-admin">Admin übernehmen</button></div>`;
}

function row(api, L, uid, { meta, button }) {
  return api.personRow(uid, {
    meta,
    button: button ? 'wbi:player' : false,
    color: colorOf(api, L, uid),
    name: G.playerName(L, uid),
    badge: L.admin === uid ? ICON.crown : G.rightsOf(L, uid).length ? MOD_BADGE : '',
  });
}

// ---------- Geheime Zettel ----------

function syncSecrets(api, roomId, L) {
  const rid = L && L.round ? L.round.rid : null;
  const key = rid ? roomId + '/' + rid : null;
  if (key !== S.secretRid) {
    S.subs.forEach((off) => off());
    S.subs.clear();
    S.secrets = {};
    S.secretRid = key;
    S.ownRetries = 0;
  }
  if (!rid) return;
  const want = new Set(G.roundIds(L).filter((u) => u !== api.uid || G.isRevealedFor(L, api.uid)));
  want.forEach((u) => {
    if (S.subs.has(u)) return;
    const off = api.b.watchCharacter(
      roomId,
      rid,
      u,
      (val) => {
        if (S.secretRid !== key) return;
        S.secrets[u] = val;
        api.render();
      },
      () => {
        S.subs.delete(u);
        if (u === api.uid && S.ownRetries++ < 5) setTimeout(() => syncSecrets(api, roomId, roomOf(api)), 1200);
      }
    );
    S.subs.set(u, off);
  });
  S.subs.forEach((off, u) => {
    if (!want.has(u)) {
      off();
      S.subs.delete(u);
      delete S.secrets[u];
    }
  });
}

/** Eingaben in den Themenfeldern – einmal für die ganze Seite (Lobby und Blatt). */
let inputsBound = false;
function bindTopicInputs(api) {
  if (inputsBound) return;
  inputsBound = true;
  const isTopic = (t) => t && t.matches && t.matches('[data-input="category"], [data-input="pcat"]');
  document.addEventListener('input', (e) => isTopic(e.target) && onTopicInput(api, e.target, false));
  document.addEventListener('change', (e) => isTopic(e.target) && onTopicInput(api, e.target, true));
  // aufgeklappte Bereichs-Auswahl bleibt offen, auch wenn neu gezeichnet wird ('toggle' blubbert nicht)
  document.addEventListener('toggle', (e) => e.target.matches && e.target.matches('.topic-groups') && (S.groupsOpen = e.target.open), true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !isTopic(e.target)) return;
    e.preventDefault();
    onTopicInput(api, e.target, true);
    e.target.blur();
  });
}

/** Die Themenliste der Gruppe mitlesen (eigene Liste aus der Datenbank, sonst die eingebaute). */
function watchCatalog(api) {
  if (S.topicsOff || Date.now() < (S.topicsRetryAt || 0)) return;
  S.topicsOff = api.b.watch(
    'topics',
    (v) => {
      setCatalog(v && v.data);
      api.render();
    },
    () => {
      // z. B. alte Regeln ohne /topics: eingebaute Liste nehmen und erst in einer Minute wieder fragen
      S.topicsOff = null;
      S.topicsRetryAt = Date.now() + 60000;
    }
  );
}

function resetLocal() {
  S.subs.forEach((off) => off());
  S.subs.clear();
  S.secrets = {};
  S.secretRid = null;
  S.roomId = null;
  S.editingPick = true;
}

// ---------- Bildschirme ----------

const screens = {};

// ---------- Lobby: Thema und Zuteilung ----------

function topicGroups() {
  const ids = catalog().map((g) => g.id);
  const saved = store.get('wbiTopicGroups', null);
  const chosen = Array.isArray(saved) ? saved.filter((g) => ids.includes(g)) : ids;
  return chosen.length ? chosen : ids;
}

function topicCardHTML(api, L, editable) {
  const name = (L && L.category) || '';
  if (!name) {
    return `<div class="topic-card empty" data-topic-card><span class="topic-name">${FREE_LABEL}</span>
      <span class="topic-hint">${editable ? 'Würfel ein Thema oder tipp selbst eins ein. Ohne Thema ist alles erlaubt.' : 'Ohne Thema ist alles erlaubt.'}</span></div>`;
  }
  const t = topicByName(name);
  return `<div class="topic-card" data-topic-card><span class="topic-name">${esc(name)}</span>${t && t.hint ? `<span class="topic-hint">${esc(t.hint)}</span>` : ''}</div>`;
}

/** Text im Eingabefeld für das Thema einer Person. */
const pcatText = (v) => (v === G.CAT_ROLL ? '' : v === G.CAT_FREE ? FREE_LABEL : v);
const pcatShow = (v) => (v === G.CAT_ROLL ? 'Zufall beim Start' : v === G.CAT_FREE ? FREE_LABEL : v);

/** Themen-Einstellungen (in der Lobby und während der Runde für die nächste). */
function topicPanelHTML(api, L, { editable, inRound = false }) {
  const mode = G.catModeOf(L);
  const ids = G.playerIds(L);
  const seg = (m, label) => `<button class="seg${mode === m ? ' on' : ''}" type="button" data-action="wbi:cat-mode" data-mode="${m}" aria-pressed="${mode === m}">${label}</button>`;
  const owner = api.ctx && api.ctx.owner === api.uid;
  let body = '';
  if (mode === 'all') {
    body = topicCardHTML(api, L, editable);
    if (editable) {
      const keep = owner && L.category && !topicByName(L.category)
        ? '<button class="link-btn" type="button" data-action="wbi:keep-topic">Dieses Thema dauerhaft in die Themenliste aufnehmen</button>' : '';
      body += `<div class="stack-tight">
        <div class="row-wrap"><button class="btn secondary" type="button" data-action="wbi:roll-topic">${ICON.dice} Thema würfeln</button></div>
        <label class="field"><span>Oder selbst eintippen</span>
          <input data-input="category" data-keep="cat" type="text" maxlength="${G.LIMITS.category}" placeholder="z. B. Gaming-Charaktere" enterkeyhint="done" autocomplete="off" list="wbi-topic-list"></label>
        ${keep}</div>`;
    }
  } else {
    const rows = ids
      .map((u) => {
        const who = `<span class="assign-who"><span class="swatch ${colorOf(api, L, u)}"></span>${u === api.uid ? 'Du' : esc(G.playerName(L, u))}</span>`;
        if (!editable) return `<li>${who}<span class="pcat-value">${esc(pcatShow(G.personCat(L, u)))}</span></li>`;
        return `<li>${who}<span class="pcat-edit">
          <input class="input" data-input="pcat" data-uid="${esc(u)}" data-keep="pcat-${esc(u)}" type="text" maxlength="${G.LIMITS.category}" placeholder="Zufall beim Start" autocomplete="off" list="wbi-topic-list" aria-label="Thema für ${esc(G.playerName(L, u))}">
          <button class="icon-btn" type="button" data-action="wbi:pcat-roll" data-uid="${esc(u)}" aria-label="Thema für ${esc(G.playerName(L, u))} würfeln" title="Würfeln">${ICON.dice}</button></span></li>`;
      })
      .join('');
    body = `<ul class="pcat-list">${rows}</ul>`;
    if (editable) {
      body += `<p class="hint">Leer lassen = wird beim Start gewürfelt. „${FREE_LABEL}“ = alles erlaubt. Aus der Liste wählen oder selbst eintippen.</p>
        <div class="row-wrap"><button class="btn secondary" type="button" data-action="wbi:pcat-roll-all">${ICON.dice} Alle jetzt würfeln</button>
        <button class="btn ghost" type="button" data-action="wbi:pcat-clear">Alle auf Zufall</button></div>`;
    } else {
      body += '<p class="hint">Wer für jemanden aussucht, sieht dessen Thema.</p>';
    }
  }
  const groups = editable
    ? `<details class="topic-groups"${S.groupsOpen ? ' open' : ''}><summary>Aus welchen Bereichen gewürfelt wird</summary><div class="chips">${groupChipsHTML()}</div></details>`
    : '';
  const list = editable
    ? `<datalist id="wbi-topic-list"><option value="${FREE_LABEL}"></option>${allTopics().map((t) => `<option value="${esc(t.name)}"></option>`).join('')}</datalist>`
    : '';
  const head = editable
    ? `<div class="segmented" role="group" aria-label="Themen">${seg('all', 'Ein Thema für alle')}${seg('each', 'Jede Person ein eigenes')}</div>`
    : '';
  const note = inRound ? '<p class="hint">Gilt ab der nächsten Runde. Die laufende Runde bleibt, wie sie ist.</p>' : '';
  const more = `<button class="link-btn" type="button" data-action="wbi:topics">${owner ? 'Themenliste ansehen und bearbeiten' : 'Alle Themen ansehen'}${isCustomCatalog() ? '' : ''}</button>`;
  return `${note}${head}${body}${groups}${list}<div class="row-wrap">${more}</div>`;
}

/** Werte in die Themenfelder schreiben – aber nicht in das, in dem gerade getippt wird. */
function fillTopicInputs(root, L) {
  if (!root || !L) return;
  root.querySelectorAll('[data-input="category"]').forEach((i) => {
    if (document.activeElement === i || S.catDirty.has('cat')) return;
    const v = L.category || '';
    if (i.value !== v) i.value = v;
  });
  root.querySelectorAll('[data-input="pcat"]').forEach((i) => {
    const k = 'pcat-' + i.dataset.uid;
    if (document.activeElement === i || S.catDirty.has(k)) return;
    const v = pcatText(G.personCat(L, i.dataset.uid));
    if (i.value !== v) i.value = v;
  });
}

function groupChipsHTML() {
  const on = topicGroups();
  return catalog().map(
    (g) => `<button class="chip toggle-chip" type="button" data-action="wbi:topic-group" data-group="${esc(g.id)}" aria-pressed="${on.includes(g.id)}">${esc(g.name)}</button>`
  ).join('');
}

function saveCategory(api, value) {
  const category = G.cleanText(value, G.LIMITS.category);
  store.set('lastCategory', category);
  return tx(api, (st) => (st && G.can(st, api.uid, 'topic') ? G.setCategory(st, { category }) : st)).finally(() => S.catDirty.delete('cat'));
}

function savePersonCat(api, uid, text) {
  const t = G.cleanText(text, G.LIMITS.category);
  const value = !t ? G.CAT_ROLL : t.toLowerCase() === FREE_LABEL.toLowerCase() ? G.CAT_FREE : t;
  return tx(api, (st) => (st && G.can(st, api.uid, 'topic') ? G.setPersonCat(st, { uid, value }) : st)).finally(() => S.catDirty.delete('pcat-' + uid));
}

/** Tippen in den Themenfeldern (Lobby und Blatt) – mit kurzer Pause speichern. */
function onTopicInput(api, input, now) {
  const isAll = input.dataset.input === 'category';
  const key = isAll ? 'cat' : 'pcat-' + input.dataset.uid;
  S.catDirty.add(key);
  clearTimeout(S.catTimer);
  const save = () => (isAll ? saveCategory(api, input.value) : savePersonCat(api, input.dataset.uid, input.value));
  if (now) return save();
  S.catTimer = setTimeout(save, 600);
}

/** Würfelt Themen für alle, die auf „Zufall“ stehen (oder für alle, wenn `all`). */
function rollPersonCats(L, uids, { avoid = [] } = {}) {
  const groups = topicGroups();
  const out = {};
  const taken = [...avoid];
  uids.forEach((u) => {
    const t = rollTopic(groups, S.recentTopics, Math.random, taken);
    if (!t) return;
    out[u] = t.name;
    taken.push(t.name);
  });
  S.recentTopics = [...Object.values(out), ...S.recentTopics].slice(0, 25);
  return out;
}

function rollTopicAnimated(api) {
  if (S.rolling) return;
  const groups = topicGroups();
  const pick = rollTopic(groups, S.recentTopics);
  if (!pick) return;
  S.recentTopics = [pick.name, ...S.recentTopics.filter((n) => n !== pick.name)].slice(0, 25);
  const card = $('[data-topic-card]');
  const finish = () => {
    S.rolling = false;
    document.querySelectorAll('[data-input="category"]').forEach((i) => (i.value = pick.name));
    S.catDirty.add('cat');
    saveCategory(api, pick.name).finally(() => api.render());
    api.render();
  };
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!card || still) return finish();
  S.rolling = true;
  const pool = allTopics().filter((t) => groups.includes(t.group));
  const delays = [45, 45, 50, 55, 60, 70, 80, 95, 115, 140, 170, 210];
  let i = 0;
  const step = () => {
    if (i >= delays.length || !card.isConnected) return finish();
    const t = pool[Math.floor(Math.random() * pool.length)] || pick;
    card.className = 'topic-card rolling';
    card.innerHTML = `<span class="topic-name">${esc(t.name)}</span><span class="topic-hint">&nbsp;</span>`;
    setTimeout(step, delays[i++]);
  };
  step();
}

/** Während einer Runde: Themen für die nächste Runde einstellen. */
function openTopicSheet(api) {
  const L = roomOf(api);
  if (!L || !can(api, L, 'topic')) return;
  const sheet = openSheet({
    title: 'Themen für die nächste Runde',
    body: '<div class="stack" data-topic-sheet></div>',
    onClose() {
      S.topicSheet = null;
    },
  });
  S.topicSheet = sheet;
  // Knöpfe im Blatt (Modus, Würfeln, Bereiche) laufen über dieselben Aktionen wie in der Lobby
  sheet.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const fn = GAME.actions[b.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(api, b, e);
  });
  refreshTopicSheet(api);
}

function refreshTopicSheet(api) {
  const sheet = S.topicSheet;
  const L = roomOf(api);
  if (!sheet) return;
  if (!L || !can(api, L, 'topic')) return sheet.close();
  const box = sheet.el.querySelector('[data-topic-sheet]');
  if (!S.rolling) setHTML(box, topicPanelHTML(api, L, { editable: true, inRound: L.phase !== G.PHASE.LOBBY }));
  fillTopicInputs(box, L);
}

function nextTopicsButton(api, L) {
  return can(api, L, 'topic') ? '<button class="link-btn" data-action="wbi:topic-sheet">Themen für die nächste Runde</button>' : '';
}

function assignHTML(api, L) {
  const ids = G.playerIds(L);
  const assign = G.nextAssign(L);
  if (!assign) {
    return `<p class="hint">${ids.length < G.MIN_PLAYERS ? 'Sobald mindestens zwei Leute da sind, wird ausgelost.' : 'Wird beim Start ausgelost.'}</p>`;
  }
  // als Kette lesen, bei dir beginnend: Du → Tom → Mia → …
  const start = assign[api.uid] ? api.uid : ids[0];
  const chain = [];
  const seen = new Set();
  for (let u = start; u && !seen.has(u); u = assign[u]) {
    seen.add(u);
    chain.push(u);
  }
  ids.forEach((u) => !seen.has(u) && chain.push(u));
  const who = (u, me) => `<span class="assign-who"><span class="swatch ${colorOf(api, L, u)}"></span>${u === api.uid ? me : esc(G.playerName(L, u))}</span>`;
  return `<ul class="assign-list">${chain
    .map(
      (u) => `<li class="${u === api.uid ? 'mine' : ''}">${who(u, 'Du')}<span class="assign-arrow">${ICON.arrow}<span class="visually-hidden">sucht aus für</span></span>${who(assign[u], 'dich')}</li>`
    )
    .join('')}</ul>`;
}

screens['wbi:lobby'] = {
  mount(el, api) {
    el.innerHTML = `${api.topbar({ tape: 'Wer bin ich?' })}<main class="screen">
      <div class="stack-tight"><h1>Lobby</h1><p class="muted" data-slot="sub"></p></div>
      <div data-slot="banner"></div>
      <section class="section"><h2 class="section-title" data-slot="count"></h2><ul class="people" data-slot="players"></ul></section>
      <section class="section">
        <h2 class="section-title">Thema</h2>
        <div class="stack" data-slot="topics"></div>
      </section>
      <section class="section">
        <h2 class="section-title">Wer sucht für wen aus?</h2>
        <div data-slot="assign"></div>
        <div class="stack-tight" data-slot="assign-admin">
          <div class="toggle"><span>Jede Runde neu auslosen</span>
            <button class="switch" role="switch" data-action="wbi:reroll-mode" data-slot="reroll" aria-label="Jede Runde neu auslosen"></button></div>
          <div class="row-wrap"><button class="btn ghost" data-action="wbi:reroll">${ICON.dice} Jetzt neu auslosen</button></div>
        </div>
        <p class="hint" data-slot="assign-mode"></p>
      </section>
      <div class="stack-tight" data-slot="admin">
        <button class="btn primary big" data-action="wbi:start-round" data-slot="start">Runde starten</button>
        <p class="hint" data-slot="start-hint"></p>
      </div>
      <p class="lead" data-slot="waiting"></p>
      <div class="row-wrap">
        <button class="btn ghost" data-action="wbi:leave">Raum verlassen</button>
        <button class="btn ghost danger" data-action="wbi:close" data-slot="close">Raum schließen</button>
      </div></main>`;
  },
  update(el, api) {
    const L = roomOf(api);
    const admin = isAdmin(api, L);
    const rounds = can(api, L, 'round');
    const topics = can(api, L, 'topic');
    const ids = G.playerIds(L);
    const mine = G.rightsOf(L, api.uid).map((r) => G.RIGHT_LABELS[r]);
    slot(el, 'sub').textContent = admin
      ? 'Du bist Admin. Leg ein Thema fest und starte, wenn alle da sind.'
      : mine.length
        ? `${G.playerName(L, L.admin)} ist Admin. Du darfst hier: ${mine.join(', ')}.`
        : `${G.playerName(L, L.admin)} ist Admin und startet die Runde.`;
    setHTML(slot(el, 'banner'), adminAwayNotice(api, L));
    slot(el, 'count').textContent = `Dabei (${ids.length})`;
    setHTML(slot(el, 'players'), ids.map((u) => row(api, L, u, { meta: api.onlineMeta(u), button: u !== api.uid && (admin || can(api, L, 'kick')) })).join(''));
    const box = slot(el, 'topics');
    if (!S.rolling) setHTML(box, topicPanelHTML(api, L, { editable: topics }));
    fillTopicInputs(box, L);
    setHTML(slot(el, 'assign'), assignHTML(api, L));
    slot(el, 'assign-admin').hidden = !topics;
    slot(el, 'reroll').setAttribute('aria-checked', String(G.rerollsEachRound(L)));
    slot(el, 'assign-mode').textContent = topics
      ? ''
      : G.rerollsEachRound(L)
        ? 'Wird jede Runde neu ausgelost.'
        : 'Bleibt auch in den nächsten Runden so.';
    slot(el, 'admin').hidden = !rounds;
    slot(el, 'close').hidden = !admin;
    const enough = ids.length >= G.MIN_PLAYERS;
    slot(el, 'start').disabled = !enough || S.busy || S.rolling;
    slot(el, 'start-hint').textContent = enough ? '' : 'Ihr braucht mindestens 2 Leute. Sag den anderen, dass sie beitreten sollen.';
    slot(el, 'waiting').textContent = rounds ? '' : 'Warte, bis die Runde startet.';
  },
};

function progressRows(api, L) {
  const picked = L.round.picked || {};
  const power = isAdmin(api, L) || can(api, L, 'kick') || can(api, L, 'round');
  return G.roundIds(L)
    .map((u) => {
      const done = !!picked[u];
      const meta = done ? `${ICON.check}fertig` : api.isOnline(u) ? 'sucht aus …' : '<span class="dot"></span>offline';
      return row(api, L, u, { meta, button: power && u !== api.uid });
    })
    .join('');
}

function sizePickText(area) {
  const n = area.value.length;
  area.style.fontSize = n <= 10 ? '2.6rem' : n <= 20 ? '2.2rem' : n <= 34 ? '1.9rem' : '1.6rem';
  area.style.height = 'auto';
  area.style.height = area.scrollHeight + 'px';
}

function checkDuplicate(api, el) {
  const area = el.querySelector('[data-input="character"]');
  const out = slot(el, 'dupe');
  if (!area || !out) return;
  const L = roomOf(api);
  const target = G.targetOf(L, api.uid);
  const value = normalize(area.value);
  let text = '';
  if (value) {
    const hit = Object.entries(S.secrets).find(([u, s]) => u !== target && s && normalize(s.name) === value);
    if (hit) text = `Achtung: ${G.playerName(L, hit[0])} hat schon „${hit[1].name}“ bekommen.`;
  }
  out.textContent = text;
}

screens['wbi:picking'] = {
  key: (api) => `${roomOf(api).round.rid}:${G.targetOf(roomOf(api), api.uid)}`,
  mount(el, api) {
    const L = roomOf(api);
    const target = G.targetOf(L, api.uid);
    el.innerHTML = `${api.topbar({ tape: categoryText(L) })}<main class="screen">
      <p class="pick-for">Du suchst einen Charakter aus für <strong>${esc(G.playerName(L, target))}</strong></p>
      <p class="pick-topic">Thema: <strong>${esc(topicLabel(G.topicOf(L, target)))}</strong></p>
      <div class="pick-note"><div class="note ${colorOf(api, L, target)}" style="--tilt:-1.5deg">
        <div class="note-img" data-slot="note-img" hidden></div>
        <textarea data-input="character" maxlength="${G.LIMITS.character}" rows="1" placeholder="Name schreiben" aria-label="Name des Charakters" enterkeyhint="next"></textarea>
      </div></div>
      <div class="stack" data-slot="img-wrap">${pickImageHTML()}</div>
      <div class="stack" data-slot="form">
        <label class="field"><span>Hinweis für die anderen <em>(optional)</em></span>
          <input data-input="hint" type="text" maxlength="${G.LIMITS.hint}" placeholder="z. B. aus Elden Ring" enterkeyhint="done"></label>
        <p class="hint" data-slot="dupe"></p>
        <button class="btn primary big" data-action="wbi:submit-pick">Zettel aufkleben</button>
      </div>
      <div class="stack" data-slot="done" hidden>
        <p class="pick-done-label">Aufgeklebt. Du kannst den Zettel noch ändern, bis alle fertig sind.</p>
        <button class="btn secondary" data-action="wbi:edit-pick">Ändern</button>
      </div>
      <section class="section"><h2 class="section-title" data-slot="progress-title"></h2><ul class="people" data-slot="progress"></ul></section>
      <div class="row-wrap"><button class="btn ghost" data-action="wbi:leave">Raum verlassen</button>
        <button class="btn ghost danger" data-action="wbi:cancel-round" data-slot="admin-tools">Runde abbrechen</button></div>
      <div class="row-wrap" data-slot="next-topics"></div>
      </main>`;
    const area = el.querySelector('[data-input="character"]');
    const hint = el.querySelector('[data-input="hint"]');
    const mine = S.secrets[target];
    S.pickImg = mine && mine.by === api.uid && safeImg(mine.img) ? mine.img : null;
    if (mine && mine.by === api.uid) {
      area.value = mine.name || '';
      hint.value = mine.hint || '';
    }
    bindPickImage(el, api, {
      get: () => S.pickImg,
      set: (img) => {
        S.pickImg = img;
        api.renderNow();
      },
      editing: () => {
        const R = roomOf(api);
        return !!R && R.phase === G.PHASE.PICKING && (S.editingPick || !(R.round.picked && R.round.picked[api.uid]));
      },
      name: () => area.value,
      topic: () => G.topicOf(roomOf(api), G.targetOf(roomOf(api), api.uid)),
    });
    area.addEventListener('input', () => {
      sizePickText(area);
      checkDuplicate(api, el);
    });
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        hint.focus();
      }
    });
    hint.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPick(api);
      }
    });
    sizePickText(area);
  },
  update(el, api) {
    const L = roomOf(api);
    const target = G.targetOf(L, api.uid);
    const picked = !!(L.round.picked && L.round.picked[api.uid]);
    const editing = S.editingPick || !picked;
    const area = el.querySelector('[data-input="character"]');
    const mine = S.secrets[target];
    if (!editing && mine && mine.by === api.uid && area.value !== mine.name) {
      area.value = mine.name;
      sizePickText(area);
    }
    if (!editing && mine && mine.by === api.uid) S.pickImg = safeImg(mine.img) || null;
    area.readOnly = !editing;
    slot(el, 'form').hidden = !editing;
    slot(el, 'done').hidden = editing;
    slot(el, 'img-wrap').hidden = !editing;
    const img = slot(el, 'note-img');
    img.hidden = !S.pickImg;
    setHTML(img, safeImg(S.pickImg) ? `<img src="${esc(safeImg(S.pickImg))}" alt="" referrerpolicy="no-referrer">` : '');
    el.querySelector('.pick-note .note').classList.toggle('has-img', !!S.pickImg);
    el.querySelectorAll('[data-slot="img-remove"]').forEach((b) => (b.hidden = !S.pickImg));
    setHTML(slot(el, 'next-topics'), nextTopicsButton(api, L));
    const total = G.roundIds(L).length;
    slot(el, 'progress-title').textContent = `Fertig: ${total - G.waitingForPick(L).length} von ${total}`;
    setHTML(slot(el, 'progress'), progressRows(api, L));
    slot(el, 'admin-tools').hidden = !can(api, L, 'round');
    checkDuplicate(api, el);
  },
};

screens['wbi:watchPicking'] = {
  key: (api) => roomOf(api).round.rid,
  mount(el, api) {
    el.innerHTML = `${api.topbar({ tape: categoryText(roomOf(api)) })}<main class="screen">
      <div class="notice"><p>Alle suchen gerade Charaktere aus. Du schaust zu und spielst ab der nächsten Runde mit.</p></div>
      <section class="section"><h2 class="section-title" data-slot="progress-title"></h2><ul class="people" data-slot="progress"></ul></section>
      <div class="row-wrap"><button class="btn ghost" data-action="wbi:leave">Raum verlassen</button></div>
      <div class="row-wrap" data-slot="next-topics"></div></main>`;
  },
  update(el, api) {
    const L = roomOf(api);
    const total = G.roundIds(L).length;
    slot(el, 'progress-title').textContent = `Fertig: ${total - G.waitingForPick(L).length} von ${total}`;
    setHTML(slot(el, 'progress'), progressRows(api, L));
    setHTML(slot(el, 'next-topics'), nextTopicsButton(api, L));
  },
};

function slotHTML(api, L, uid) {
  const me = uid === api.uid;
  const st = G.statusOf(L, uid);
  const hidden = me && !G.isRevealedFor(L, uid);
  const sec = S.secrets[uid];
  const active = G.activeUid(L) === uid;
  const s = L.round.status[uid] || {};
  const stamp =
    st === G.STATE.GUESSED
      ? `<span class="stamp won">Erraten<small>Platz ${s.place}</small></span>`
      : st === G.STATE.GAVEUP
        ? '<span class="stamp lost">Aufgegeben</span>'
        : '';
  const color = colorOf(api, L, uid);
  const note = hidden
    ? noteHTML({ color, key: uid, mystery: true, sub: 'Das bist du', extra: stamp })
    : noteHTML({ color, key: uid, name: sec ? sec.name : null, hint: sec && sec.hint, img: sec && sec.img, extra: stamp });
  const cls = ['slot', active ? 'active' : '', st !== G.STATE.PLAYING ? 'done' : '', api.isOnline(uid) ? '' : 'offline'].filter(Boolean).join(' ');
  const label = me ? 'Du' : esc(G.playerName(L, uid));
  const topic = G.eachTopics(L) ? `<span class="slot-topic">${esc(topicLabel(G.topicOf(L, uid)))}</span>` : '';
  return `<button class="${cls}" data-action="wbi:player" data-uid="${esc(uid)}">
    ${note}<span class="slot-label"><span class="name">${label}</span>${active ? '<span class="tag">ist dran</span>' : ''}${topic}</span></button>`;
}

function turnbarHTML(api, L) {
  const active = G.activeUid(L);
  const admin = can(api, L, 'round');
  const myTurn = active === api.uid;
  const inRound = G.isInRound(L, api.uid);
  const stillMe = G.statusOf(L, api.uid) === G.STATE.PLAYING;
  const who = myTurn ? '<span class="turn-who me">Du bist dran!</span>' : `<span class="turn-who">${esc(G.playerName(L, active))} ist dran</span>`;
  const since = L.round.turn && L.round.turn.since;
  let buttons = '';
  if (admin) {
    buttons = `<button class="btn secondary" data-action="wbi:prev">Zurück</button>
      <button class="btn secondary" data-action="wbi:guessed-current">Erraten</button>
      <button class="btn primary" data-action="wbi:next">Nächster</button>`;
  } else if (myTurn) {
    buttons = '<button class="btn primary" data-action="wbi:next">Zug beenden</button>';
  }
  const more = [
    inRound ? '<button class="link-btn" data-action="wbi:notes">Meine Notizen</button>' : '',
    inRound && stillMe ? '<button class="link-btn" data-action="wbi:give-up">Aufgeben</button>' : '',
    nextTopicsButton(api, L),
    admin ? '<button class="link-btn danger" data-action="wbi:end-round">Runde beenden</button>' : '',
    '<button class="link-btn" data-action="wbi:leave">Raum verlassen</button>',
  ].join('');
  const after = G.upNext(L);
  const nextLine = after ? `<p class="turn-next">Danach: ${after === api.uid ? 'du' : esc(G.playerName(L, after))}</p>` : '';
  return `<div class="turn-line">${who}<span class="turn-time" data-since="${since || ''}" aria-label="Zeit in diesem Zug"></span></div>
    ${nextLine}${buttons ? `<div class="turn-actions">${buttons}</div>` : ''}
    ${more ? `<div class="turn-more">${more}</div>` : ''}`;
}

screens['wbi:playing'] = {
  key: (api) => roomOf(api).round.rid,
  mount(el, api) {
    el.innerHTML = `${api.topbar({ tape: categoryText(roomOf(api)) })}<main class="screen">
      <div data-slot="banner"></div>
      <div class="board" data-slot="board"></div></main>
      <footer class="turnbar" data-slot="turnbar-wrap"><div class="turnbar-inner" data-slot="turnbar"></div></footer>`;
    document.body.classList.add('has-turnbar');
  },
  unmount() {
    document.body.classList.remove('has-turnbar');
  },
  update(el, api) {
    const L = roomOf(api);
    const banners = [];
    if (!G.isInRound(L, api.uid)) banners.push('<div class="notice"><p>Du schaust bei dieser Runde zu und spielst ab der nächsten mit.</p></div>');
    banners.push(adminAwayNotice(api, L));
    setHTML(slot(el, 'banner'), banners.join(''));
    setHTML(slot(el, 'board'), G.roundIds(L).map((u) => slotHTML(api, L, u)).join(''));
    setHTML(slot(el, 'turnbar'), turnbarHTML(api, L));
    if (S.flashTurn) {
      S.flashTurn = false;
      const wrap = slot(el, 'turnbar-wrap');
      wrap.classList.remove('my-turn-flash');
      void wrap.offsetWidth;
      wrap.classList.add('my-turn-flash');
    }
  },
};

screens['wbi:results'] = {
  key: (api) => roomOf(api).round.rid,
  mount(el, api) {
    el.innerHTML = `${api.topbar({ tape: categoryText(roomOf(api)) })}<main class="screen">
      <div class="stack-tight"><h1>Runde vorbei</h1><p class="muted" data-slot="sub"></p></div>
      <ol class="ranking" data-slot="ranking"></ol>
      <div class="stack" data-slot="actions"></div></main>`;
  },
  update(el, api) {
    const L = roomOf(api);
    const rows = G.standings(L);
    const guessed = rows.filter((r) => r.state === G.STATE.GUESSED).length;
    slot(el, 'sub').textContent = `${guessed} von ${rows.length} haben ihren Charakter erraten.`;
    setHTML(
      slot(el, 'ranking'),
      rows
        .map((r) => {
          const sec = S.secrets[r.uid];
          const place = r.state === G.STATE.GUESSED ? `${r.place}.` : '–';
          const detail =
            r.state === G.STATE.GUESSED
              ? r.turns > 0
                ? `erraten in ${r.turns} ${r.turns === 1 ? 'Zug' : 'Zügen'}`
                : 'erraten'
              : r.state === G.STATE.GAVEUP
                ? 'aufgegeben'
                : 'nicht erraten';
          const by = r.by ? `, ausgesucht von ${r.by === api.uid ? 'dir' : esc(G.playerName(L, r.by))}` : '';
          const topic = G.eachTopics(L) ? `<span class="rank-topic">Thema: ${esc(topicLabel(G.topicOf(L, r.uid)))}</span>` : '';
          return `<li class="rank-row${r.uid === api.uid ? ' me' : ''}">
            <span class="rank-place">${place}</span>
            ${noteHTML({ color: colorOf(api, L, r.uid), key: r.uid, name: sec ? sec.name : null, img: sec && sec.img, fit: 24 })}
            <div class="rank-text"><strong>${esc(G.playerName(L, r.uid))}</strong><span>${detail}${by}</span>${topic}</div></li>`;
        })
        .join('')
    );
    const admin = isAdmin(api, L);
    setHTML(
      slot(el, 'actions'),
      (can(api, L, 'round')
        ? '<button class="btn primary big" data-action="wbi:new-round">Neue Runde</button>'
        : `<p class="lead">Warte, bis ${esc(G.playerName(L, L.admin))} die nächste Runde startet.</p>${adminAwayNotice(api, L)}`) +
        `<div class="row-wrap">${nextTopicsButton(api, L)}</div>` +
        `<div class="row-wrap"><button class="btn ghost" data-action="wbi:leave">Raum verlassen</button>${
          admin ? '<button class="btn ghost danger" data-action="wbi:close">Raum schließen</button>' : ''
        }</div>`
    );
  },
};

// ---------- Auflösung ----------

function maybeShowReveal(api) {
  const L = roomOf(api);
  if (S.revealOpen || !L || !L.round || !G.isInRound(L, api.uid) || !G.isRevealedFor(L, api.uid)) return;
  const rid = L.round.rid;
  if (store.get('seenReveal', null) === rid) return;
  const mine = S.secrets[api.uid];
  if (!mine) return;
  S.revealOpen = true;
  const by = mine.by ? G.playerName(L, mine.by) : null;
  const title = G.statusOf(L, api.uid) === G.STATE.GUESSED ? 'Erraten! Du bist' : 'Du warst';
  const color = colorOf(api, L, api.uid);
  const wrap = document.createElement('div');
  wrap.className = 'reveal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', `${title} ${mine.name}`);
  wrap.innerHTML = `<p class="reveal-title">${title}</p>
    <div class="flip"><div class="flip-inner">
      <div class="note front ${color}"><div class="note-name"><span data-fit="110">?</span></div></div>
      <div class="note back ${color}${safeImg(mine.img) ? ' has-img' : ''}">${
        safeImg(mine.img) ? `<div class="note-img"><img src="${esc(safeImg(mine.img))}" alt="" referrerpolicy="no-referrer"></div>` : ''
      }<div class="note-name"><span data-fit="60">${esc(mine.name)}</span></div>${
        mine.hint ? `<div class="note-hint">${esc(mine.hint)}</div>` : ''
      }</div>
    </div></div>
    ${by ? `<p class="muted">ausgesucht von ${esc(by)}</p>` : ''}
    <button class="btn primary" data-reveal-close>Weiter</button>`;
  document.body.appendChild(wrap);
  fitNotes(wrap);
  const close = () => {
    store.set('seenReveal', rid);
    S.revealOpen = false;
    wrap.remove();
  };
  wrap.querySelector('[data-reveal-close]').addEventListener('click', close);
  wrap.querySelector('[data-reveal-close]').focus({ preventScroll: true });
}

// ---------- Blätter ----------

function openPlayer(api, uid) {
  const L = roomOf(api);
  if (!L) return;
  const me = uid === api.uid;
  const admin = isAdmin(api, L);
  const rounds = can(api, L, 'round');
  const inRound = G.isInRound(L, uid) && (L.phase === G.PHASE.PLAYING || L.phase === G.PHASE.RESULTS);
  const name = me ? 'Du' : G.playerName(L, uid);
  const color = colorOf(api, L, uid);
  let top = '';
  if (inRound) {
    const hidden = me && !G.isRevealedFor(L, uid);
    const sec = S.secrets[uid];
    top = `<div class="player-sheet-note">${
      hidden ? noteHTML({ color, key: uid, mystery: true }) : noteHTML({ color, key: uid, name: sec ? sec.name : null, hint: sec && sec.hint, img: sec && sec.img, fit: 34 })
    }</div>`;
    if (G.eachTopics(L)) top += `<p class="muted">Thema: ${esc(topicLabel(G.topicOf(L, uid)))}</p>`;
    if (hidden) top += '<p class="muted">Das bist du. Stell Ja-Nein-Fragen, um herauszufinden, wer du bist.</p>';
    else if (sec && sec.by) top += `<p class="muted">Ausgesucht von ${sec.by === api.uid ? 'dir' : esc(G.playerName(L, sec.by))}.</p>`;
  }
  const items = [];
  const playing = L.phase === G.PHASE.PLAYING && G.statusOf(L, uid) === G.STATE.PLAYING;
  if (rounds && playing) {
    items.push(`<button class="btn primary" data-sa="guessed">${me ? 'Ich hab’s erraten' : `${esc(name)} hat’s erraten`}</button>`);
    items.push(`<button class="btn secondary" data-sa="giveup">${me ? 'Aufgeben' : `${esc(name)} gibt auf`}</button>`);
    if (me) items.push('<button class="btn secondary" data-sa="notes">Meine Notizen</button>');
  } else if (me && playing) {
    items.push('<button class="btn secondary" data-sa="notes">Meine Notizen</button>');
    items.push('<button class="btn secondary" data-sa="giveup">Aufgeben</button>');
  }
  const present = !!(L.players && L.players[uid]);
  if (admin && !me && present) items.push('<button class="btn secondary" data-sa="admin">Zum Admin machen</button>');
  if (!me && present && uid !== L.admin && can(api, L, 'kick')) items.push('<button class="btn ghost danger" data-sa="kick">Aus dem Raum entfernen</button>');
  const rights = admin && !me && present ? rightsHTML(L, uid) : '';
  if (!top && !items.length && !rights) return;
  openSheet({
    title: me ? 'Dein Zettel' : G.playerName(L, uid),
    body: `${top}${items.length ? `<div class="sheet-actions">${items.join('')}</div>` : ''}${rights}`,
    onAction(action, btn, sheet) {
      if (action === 'right') return toggleRight(api, uid, btn);
      sheet.close();
      if (action === 'guessed') markGuessed(api, uid);
      if (action === 'giveup') giveUp(api, uid);
      if (action === 'notes') openNotes(api);
      if (action === 'admin') makeAdmin(api, uid);
      if (action === 'kick') kickPlayer(api, api.roomId, uid);
    },
  });
}

function rightsHTML(L, uid) {
  const rows = G.RIGHTS.map((r) => {
    const on = G.can(L, uid, r);
    return `<div class="toggle right-row"><span><strong>${G.RIGHT_LABELS[r]}</strong><small>${esc(G.RIGHT_HINTS[r])}</small></span>
      <button class="switch" role="switch" type="button" data-sa="right" data-right="${r}" aria-checked="${on}" aria-label="${G.RIGHT_LABELS[r]}"></button></div>`;
  }).join('');
  return `<div class="rights-box"><h3 class="sheet-sub">Rechte in diesem Raum</h3>${rows}
    <p class="hint">Schließen kann den Raum nur die Admin-Person.</p></div>`;
}

async function toggleRight(api, uid, btn) {
  const right = btn.dataset.right;
  const on = btn.getAttribute('aria-checked') !== 'true';
  btn.setAttribute('aria-checked', String(on));
  const res = await tx(api, (s) => (s && s.admin === api.uid ? G.setRight(s, { uid, right, on }) : s)).catch(() => null);
  const L = res && res.committed ? res.value : roomOf(api);
  btn.setAttribute('aria-checked', String(!!(L && G.can(L, uid, right))));
  if (!res || !res.committed) toast('Das Recht konnte nicht geändert werden.');
  else if (G.can(L, uid, right) !== on) toast('Das geht gerade nicht – bist du noch Admin?');
}

function openNotes(api) {
  const L = roomOf(api);
  if (!L || !L.round) return;
  const key = 'notes:' + L.round.rid;
  const previous = store.get('notesKey', null);
  if (previous && previous !== key) store.del(previous);
  store.set('notesKey', key);
  const sheet = openSheet({
    title: 'Meine Notizen',
    body: `<label class="field"><span>Was du schon über deinen Charakter weißt</span>
      <textarea data-notes rows="8" placeholder="z. B. männlich, aus einem Videospiel, kein Mensch">${esc(store.get(key, ''))}</textarea></label>
      <p class="hint">Nur du siehst das. Es bleibt auf diesem Gerät.</p>`,
  });
  const area = sheet.el.querySelector('[data-notes]');
  area.addEventListener('input', () => store.set(key, area.value));
  area.focus({ preventScroll: true });
}

// ---------- Aktionen ----------

const tx = (api, fn) => api.roomTx(api.roomId, fn);

async function startRound(api) {
  const L = roomOf(api);
  if (!L) return;
  const input = $('[data-input="category"]');
  clearTimeout(S.catTimer);
  // Was gerade noch getippt wurde, zählt mit
  document.querySelectorAll('[data-input="pcat"]').forEach((i) => S.catDirty.has('pcat-' + i.dataset.uid) && savePersonCat(api, i.dataset.uid, i.value));
  const category = G.cleanText(input ? input.value : L.category || '', G.LIMITS.category);
  store.set('lastCategory', category);
  let cats = null;
  if (G.catModeOf(L) === 'each') {
    const ids = G.playerIds(L);
    const fixed = ids.map((u) => G.personCat(L, u)).filter((v) => v !== G.CAT_ROLL && v !== G.CAT_FREE);
    const rolled = rollPersonCats(L, ids.filter((u) => G.personCat(L, u) === G.CAT_ROLL), { avoid: fixed });
    cats = {};
    ids.forEach((u) => (cats[u] = rolled[u] || G.personCat(L, u)));
  }
  const rid = makeId();
  S.busy = true;
  api.render();
  await tx(api, (s) => (s && G.can(s, api.uid, 'round') ? G.startRound(s, { category, cats, now: api.b.now(), rid }) : s));
  S.busy = false;
  api.render();
}

async function submitPick(api) {
  const L = roomOf(api);
  if (!L || L.phase !== G.PHASE.PICKING) return;
  const roomId = api.roomId;
  const target = G.targetOf(L, api.uid);
  const rid = L.round.rid;
  const area = $('[data-input="character"]');
  const hintInput = $('[data-input="hint"]');
  const name = G.cleanText(area.value, G.LIMITS.character);
  const hint = G.cleanText(hintInput.value, G.LIMITS.hint);
  if (!name) {
    toast('Schreib zuerst einen Namen auf den Zettel.');
    area.focus();
    return;
  }
  const button = $('[data-action="wbi:submit-pick"]');
  if (button) button.disabled = true;
  try {
    const data = { name };
    if (hint) data.hint = hint;
    if (safeImg(S.pickImg)) data.img = S.pickImg;
    await api.b.writeCharacter(roomId, rid, target, data);
    S.editingPick = false;
    await api.roomTx(roomId, (s) => G.markPicked(s, { uid: api.uid, now: api.b.now(), target }));
  } catch (err) {
    console.error(err);
    toast('Der Zettel konnte nicht gespeichert werden. Prüf deine Verbindung.');
  } finally {
    if (button) button.disabled = false;
    api.render();
  }
}

async function cancelRound(api) {
  const ok = await confirmDialog({
    title: 'Runde abbrechen?',
    text: 'Alle Zettel dieser Runde werden verworfen und ihr landet wieder in der Lobby.',
    ok: 'Abbrechen',
    cancel: 'Weiter aussuchen',
    danger: true,
  });
  if (!ok) return;
  const roomId = api.roomId;
  const rid = roomOf(api) && roomOf(api).round && roomOf(api).round.rid;
  const res = await api.roomTx(roomId, (s) => (s && G.can(s, api.uid, 'round') ? G.endRound(s, { now: api.b.now() }) : s));
  if (res.committed && rid) api.b.clearCharacters(roomId, rid);
}

async function changeTurn(api, dir) {
  const L = roomOf(api);
  if (!L || !L.round || !L.round.turn) return;
  const expect = L.round.turn.count;
  const now = api.b.now();
  await tx(api, (s) => (dir > 0 ? G.nextTurn(s, { now, expect }) : G.prevTurn(s, { now, expect })));
}

async function markGuessed(api, uid) {
  const L = roomOf(api);
  if (!uid || !L) return;
  const me = uid === api.uid;
  const name = G.playerName(L, uid);
  const ok = await confirmDialog({
    title: me ? 'Hast du deinen Charakter erraten?' : `Hat ${name} erraten?`,
    text: me ? 'Dann siehst du deinen Zettel und wirst ab jetzt übersprungen.' : `${name} sieht danach den eigenen Zettel und wird ab jetzt übersprungen.`,
    ok: 'Ja, erraten',
  });
  if (ok) await tx(api, (s) => G.markGuessed(s, { uid, now: api.b.now() }));
}

async function giveUp(api, uid) {
  const L = roomOf(api);
  if (!uid || !L) return;
  const me = uid === api.uid;
  const name = G.playerName(L, uid);
  const ok = await confirmDialog({
    title: me ? 'Aufgeben?' : `${name} aufgeben lassen?`,
    text: me ? 'Du siehst deinen Charakter und wirst ab jetzt übersprungen.' : `${name} sieht den eigenen Zettel und wird ab jetzt übersprungen.`,
    ok: 'Aufgeben',
    danger: true,
  });
  if (ok) await tx(api, (s) => G.giveUp(s, { uid, now: api.b.now() }));
}

async function endRound(api) {
  const ok = await confirmDialog({ title: 'Runde beenden?', text: 'Alle sehen ihre Zettel und das Ergebnis.', ok: 'Runde beenden' });
  if (ok) await tx(api, (s) => (s && G.can(s, api.uid, 'round') ? G.endRound(s, { now: api.b.now() }) : s));
}

async function newRound(api) {
  const roomId = api.roomId;
  const rid = roomOf(api) && roomOf(api).round && roomOf(api).round.rid;
  const res = await api.roomTx(roomId, (s) => (s && G.can(s, api.uid, 'round') ? G.backToLobby(s) : s));
  if (res.committed && rid) api.b.clearCharacters(roomId, rid);
}

async function takeAdmin(api) {
  const before = roomOf(api) && roomOf(api).admin;
  const res = await tx(api, (s) => (s && s.admin === before && s.players && s.players[api.uid] ? G.setAdmin(s, { uid: api.uid }) : s));
  if (res.committed) toast('Du bist jetzt Admin.');
}

async function makeAdmin(api, uid) {
  const res = await tx(api, (s) => (s && s.admin === api.uid ? G.setAdmin(s, { uid }) : s));
  if (res.committed) toast(`${G.playerName(roomOf(api), uid)} ist jetzt Admin.`);
}

async function removeFromRoom(api, roomId, uid) {
  const res = await api.roomTx(roomId, (s) => G.leaveLobby(s, { uid, now: api.b.now(), online: api.onlineMap() }));
  if (res.committed && res.value === null) await api.b.write(`secrets/${roomId}`, null).catch(() => {});
  return res;
}

async function kickPlayer(api, roomId, uid, { silent = false } = {}) {
  const L = api.ctx.rooms && api.ctx.rooms[roomId];
  if (!L) return;
  if (!silent && (!G.can(L, api.uid, 'kick') || uid === L.admin)) return;
  if (!silent) {
    const name = G.playerName(L, uid);
    const running = G.isInRound(L, uid) && (L.phase === G.PHASE.PICKING || L.phase === G.PHASE.PLAYING);
    const ok = await confirmDialog({
      title: `${name} entfernen?`,
      text: running ? `${name} fliegt aus der laufenden Runde und kann danach als Zuschauer wieder beitreten.` : `${name} kann jederzeit wieder beitreten.`,
      ok: 'Entfernen',
      danger: true,
    });
    if (!ok) return;
  }
  await removeFromRoom(api, roomId, uid);
}

async function leaveRoom(api, roomId, { silent = false } = {}) {
  const L = api.ctx.rooms && api.ctx.rooms[roomId];
  if (!L) return;
  const running = G.isInRound(L, api.uid) && (L.phase === G.PHASE.PICKING || L.phase === G.PHASE.PLAYING);
  if (running && !silent) {
    const ok = await confirmDialog({ title: 'Raum verlassen?', text: 'Du steigst aus der laufenden Runde aus.', ok: 'Verlassen', danger: true });
    if (!ok) return;
  }
  api.leaving();
  await removeFromRoom(api, roomId, api.uid);
}

async function closeRoom(api) {
  const ok = await confirmDialog({ title: 'Raum schließen?', text: 'Alle fliegen raus und die Runde endet.', ok: 'Schließen', danger: true });
  if (!ok) return;
  const roomId = api.roomId;
  api.leaving();
  const res = await api.roomTx(roomId, (s) => (s && s.admin === api.uid ? null : s));
  if (res.committed) await api.b.write(`secrets/${roomId}`, null).catch(() => {});
}

// ---------- Spiel-Definition ----------

const GAME = {
  id: ID,
  name: 'Wer bin ich?',
  tagline: 'Zettel auf der Stirn – mit Charakteren, die ihr euch gegenseitig aussucht.',
  art: () => `<div class="art-wbi">${noteHTML({ color: 'c-yellow', key: 'art-wbi', mystery: true, fit: 30 })}</div>`,
  cardButtons: () =>
    '<button class="btn primary" data-action="open-room" data-game="werbinich">Raum öffnen</button><button class="btn ghost" data-action="wbi:topics">Themenliste</button>',
  screens,

  isIn: (room, uid) => !!(room && room.players && room.players[uid]),

  roomSummary(api, room) {
    const n = G.playerIds(room).length;
    const running = room.phase && room.phase !== G.PHASE.LOBBY;
    return {
      title: `Lobby von ${G.playerName(room, room.admin)}`,
      meta: `${n} ${n === 1 ? 'Person' : 'Leute'}${running ? ', Runde läuft' : ''}`,
      joinLabel: running ? 'Zuschauen' : 'Beitreten',
    };
  },

  screenFor(api, room) {
    if (room.phase === G.PHASE.LOBBY || !room.round) return 'wbi:lobby';
    if (room.phase === G.PHASE.PICKING) return G.isInRound(room, api.uid) ? 'wbi:picking' : 'wbi:watchPicking';
    if (room.phase === G.PHASE.PLAYING) return 'wbi:playing';
    return 'wbi:results';
  },

  async openRoom(api) {
    const roomId = makeId();
    const now = api.b.now();
    const name = api.myName();
    const res = await api.roomTx(roomId, (cur) => cur || { ...G.createLobby({ uid: api.uid, name, now }), game: ID, host: api.uid });
    if (res.committed) api.enterRoom(roomId);
  },

  async joinRoom(api, roomId) {
    const name = api.myName();
    const res = await api.roomTx(roomId, (s) => (s ? G.joinLobby(s, { uid: api.uid, name, now: api.b.now() }) : s));
    if (res.committed || (res.value && res.value.players && res.value.players[api.uid])) api.enterRoom(roomId);
  },

  leave: leaveRoom,
  kick: kickPlayer,
  async rename(api, roomId, name) {
    await api.roomTx(roomId, (s) => (s && s.players && s.players[api.uid] ? G.joinLobby(s, { uid: api.uid, name, now: api.b.now() }) : s));
  },

  onRoom(api, roomId, prev, next) {
    if (!next) {
      resetLocal();
      keepScreenOn(false);
      return;
    }
    if (S.roomId !== roomId) {
      resetLocal();
      S.roomId = roomId;
    }
    bindTopicInputs(api);
    watchCatalog(api);
    const prevTurn = prev && prev.round && prev.round.turn;
    const nextTurn = next.round && next.round.turn;
    if (nextTurn && nextTurn.uid === api.uid && next.phase === G.PHASE.PLAYING && (!prevTurn || prevTurn.uid !== api.uid || prev.phase !== G.PHASE.PLAYING)) {
      sound('turn');
      vibrate([120, 80, 120]);
      announce('Du bist dran!');
      S.flashTurn = true;
    }
    if (prev && prev.phase !== next.phase) closeSheets();
    if (next.round && next.round.rid !== (prev && prev.round && prev.round.rid)) S.editingPick = true;
    syncSecrets(api, roomId, next);
    keepScreenOn(next.phase === G.PHASE.PICKING || next.phase === G.PHASE.PLAYING);
  },

  onReset() {
    resetLocal();
  },

  afterRender(api) {
    if (roomOf(api)) maybeShowReveal(api);
    if (S.topicSheet) refreshTopicSheet(api);
  },

  actions: {
    'wbi:player': (api, btn) => openPlayer(api, btn.dataset.uid),
    'wbi:roll-topic': (api) => rollTopicAnimated(api),
    'wbi:topic-group': (api, btn) => {
      const g = btn.dataset.group;
      const on = topicGroups();
      const next = on.includes(g) ? on.filter((x) => x !== g) : [...on, g];
      if (!next.length) return toast('Mindestens ein Bereich muss an sein.');
      store.set('wbiTopicGroups', next);
      document.querySelectorAll('[data-action="wbi:topic-group"]').forEach((b) => b.setAttribute('aria-pressed', String(next.includes(b.dataset.group))));
    },
    'wbi:cat-mode': (api, btn) => tx(api, (st) => (st && G.can(st, api.uid, 'topic') ? G.setCatMode(st, { mode: btn.dataset.mode }) : st)),
    'wbi:pcat-roll': (api, btn) => {
      const L = roomOf(api);
      if (!L) return;
      const uid = btn.dataset.uid;
      const others = G.playerIds(L).filter((u) => u !== uid).map((u) => G.personCat(L, u));
      const t = rollPersonCats(L, [uid], { avoid: others })[uid];
      if (!t) return;
      document.querySelectorAll(`[data-input="pcat"][data-uid="${CSS.escape(uid)}"]`).forEach((i) => (i.value = t));
      S.catDirty.add('pcat-' + uid);
      savePersonCat(api, uid, t);
    },
    'wbi:pcat-roll-all': (api) => {
      const L = roomOf(api);
      if (!L) return;
      const ids = G.playerIds(L);
      const rolled = rollPersonCats(L, ids);
      tx(api, (st) => {
        if (!st || !G.can(st, api.uid, 'topic')) return st;
        let next = st;
        ids.forEach((u) => rolled[u] && (next = G.setPersonCat(next, { uid: u, value: rolled[u] })));
        return next;
      });
    },
    'wbi:pcat-clear': (api) =>
      tx(api, (st) => {
        if (!st || !G.can(st, api.uid, 'topic')) return st;
        let next = st;
        G.playerIds(st).forEach((u) => (next = G.setPersonCat(next, { uid: u, value: G.CAT_ROLL })));
        return next;
      }),
    'wbi:topic-sheet': (api) => openTopicSheet(api),
    'wbi:topics': (api) => openCatalog(api),
    'wbi:keep-topic': (api) => {
      const L = roomOf(api);
      if (L && L.category) keepTopic(api, L.category);
    },
    ...imageActions,
    'wbi:reroll': (api) => tx(api, (st) => (st && G.can(st, api.uid, 'topic') ? G.rerollAssign(st) : st)),
    'wbi:reroll-mode': (api) => {
      const L = roomOf(api);
      tx(api, (st) => (st && G.can(st, api.uid, 'topic') ? G.setReroll(st, { on: !G.rerollsEachRound(L) }) : st));
    },
    'wbi:start-round': (api) => startRound(api),
    'wbi:submit-pick': (api) => submitPick(api),
    'wbi:edit-pick': (api) => {
      S.editingPick = true;
      api.renderNow();
      const area = $('[data-input="character"]');
      if (area) area.focus();
    },
    'wbi:cancel-round': (api) => cancelRound(api),
    'wbi:next': (api) => changeTurn(api, +1),
    'wbi:prev': (api) => changeTurn(api, -1),
    'wbi:guessed-current': (api) => markGuessed(api, G.activeUid(roomOf(api))),
    'wbi:give-up': (api) => giveUp(api, api.uid),
    'wbi:end-round': (api) => endRound(api),
    'wbi:notes': (api) => openNotes(api),
    'wbi:new-round': (api) => newRound(api),
    'wbi:take-admin': (api) => takeAdmin(api),
    'wbi:leave': (api) => leaveRoom(api, api.roomId),
    'wbi:close': (api) => closeRoom(api),
  },
};

export default GAME;
