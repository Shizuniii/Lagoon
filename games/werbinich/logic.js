// game.js – die reine Spiellogik von "Wer bin ich?".
//
// Jede Funktion bekommt den aktuellen Lobby-Zustand (so wie er in der
// Datenbank unter /lobby liegt) und gibt einen NEUEN Zustand zurück.
// Ändert sich nichts, kommt exakt dasselbe Objekt zurück.
// Kein Zugriff auf Netzwerk, DOM oder Zufall von außen – dadurch testbar.
//
// Zustand /lobby:
// {
//   admin: uid, createdAt, phase: 'lobby'|'picking'|'playing'|'results',
//   category: 'Gaming-Charaktere', roundNo: 3,
//   players: { uid: { name, joinedAt } },
//   assign: { wählerUid: zielUid },        // Zuteilung für die nächste Runde (für alle sichtbar)
//   reroll: true,                          // true = jede Runde neu auslosen, false = Zuteilung behalten
//   catMode: 'all'|'each',                 // ein Thema für alle oder jede Person ein eigenes (gilt ab der nächsten Runde)
//   cats: { uid: 'Thema' | '*' | '-' },    // eigenes Thema je Person: Text, '*' = würfeln, '-' = freie Wahl
//   rights: { uid: { round, topic, kick } }, // Rechte, die die Admin-Person vergeben hat
//   round: {
//     rid, no, category, cats: { uid: 'Thema' }, startedAt, playingSince, endedAt,
//     assign: { wählerUid: zielUid },      // wer sucht für wen aus
//     order: [uid, uid, …],                // zufällige Reihenfolge
//     picked: { wählerUid: true },
//     status: { uid: { state: 'playing'|'guessed'|'gaveup', place, at, turns } },
//     turn: { uid, count, since },         // count zählt jeden Zugwechsel
//     turns: { uid: anzahlZüge }
//   }
// }
// Die gewählten Charaktere selbst liegen NICHT hier, sondern unter
// /secrets/<rid>/<zielUid> – dort darf die Zielperson nicht lesen.

export const MIN_PLAYERS = 2;
export const LIMITS = { name: 20, character: 60, hint: 80, category: 60, codeMin: 6, codeMax: 40 };
export const PHASE = { LOBBY: 'lobby', PICKING: 'picking', PLAYING: 'playing', RESULTS: 'results' };
export const STATE = { PLAYING: 'playing', GUESSED: 'guessed', GAVEUP: 'gaveup' };
export const CAT_MODES = ['all', 'each'];
export const CAT_ROLL = '*';
export const CAT_FREE = '-';
/** Rechte, die die Admin-Person an andere vergeben kann. */
export const RIGHTS = ['round', 'topic', 'kick'];
export const RIGHT_LABELS = { round: 'Runden steuern', topic: 'Themen einstellen', kick: 'Leute entfernen' };
export const RIGHT_HINTS = {
  round: 'Runde starten, abbrechen und beenden, Züge weitergeben, „erraten“ eintragen',
  topic: 'Themen festlegen und würfeln, Zuteilung neu auslosen',
  kick: 'Leute aus dem Raum entfernen (nicht die Admin-Person)',
};

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

// Firebase speichert Arrays als Objekte mit Zahlen-Schlüsseln – hier wieder normalisieren.
export function list(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.filter((v) => v != null);
  return Object.keys(x)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => x[k])
    .filter((v) => v != null);
}

export function shuffle(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cleanText(text, max) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// ---------- Abfragen ----------

/** Spieler in der Lobby, sortiert nach Beitrittszeit (bestimmt auch die Farben). */
export function playerIds(state) {
  const players = (state && state.players) || {};
  return Object.keys(players).sort(
    (a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0) || (a < b ? -1 : 1)
  );
}

export function playerName(state, uid) {
  const p = state && state.players && state.players[uid];
  if (p) return p.name;
  const n = state && state.round && state.round.names && state.round.names[uid];
  return n || 'Jemand';
}

/** Teilnehmende der aktuellen Runde in Zugreihenfolge. */
export function roundIds(state) {
  return state && state.round ? list(state.round.order) : [];
}

export function isInRound(state, uid) {
  return !!(state && state.round && state.round.status && state.round.status[uid]);
}

export function statusOf(state, uid) {
  const s = state && state.round && state.round.status && state.round.status[uid];
  return s ? s.state : null;
}

/** Darf diese Person ihren eigenen Charakter sehen? (gleiche Bedingung wie in den Datenbank-Regeln) */
export function isRevealedFor(state, uid) {
  if (!state || !state.round) return false;
  if (state.phase === PHASE.RESULTS) return true;
  const st = statusOf(state, uid);
  return st === STATE.GUESSED || st === STATE.GAVEUP;
}

export function targetOf(state, uid) {
  return (state && state.round && state.round.assign && state.round.assign[uid]) || null;
}

export function chooserOf(state, uid) {
  const assign = (state && state.round && state.round.assign) || {};
  return Object.keys(assign).find((c) => assign[c] === uid) || null;
}

export function waitingForPick(state) {
  if (!state || state.phase !== PHASE.PICKING) return [];
  const picked = state.round.picked || {};
  return Object.keys(state.round.assign || {}).filter((c) => !picked[c]);
}

export function activeUid(state) {
  return state && state.phase === PHASE.PLAYING && state.round.turn ? state.round.turn.uid : null;
}

/** Wer nach der aktiven Person dran ist (null, wenn niemand sonst mehr rät). */
export function upNext(state) {
  if (!state || state.phase !== PHASE.PLAYING || !state.round.turn) return null;
  return findNext(state.round, state.round.turn.uid, +1, { includeSelf: false });
}

export function stillPlaying(state) {
  return roundIds(state).filter((uid) => statusOf(state, uid) === STATE.PLAYING);
}

/** Ergebnisliste: erst wer erraten hat (nach Platz), dann offen, dann aufgegeben. */
export function standings(state) {
  if (!state || !state.round) return [];
  const r = state.round;
  const rank = (row) =>
    row.state === STATE.GUESSED ? row.place : row.state === STATE.PLAYING ? 1000 : 2000;
  return roundIds(state)
    .map((uid) => {
      const st = (r.status && r.status[uid]) || { state: STATE.PLAYING };
      return {
        uid,
        state: st.state,
        place: st.place || null,
        turns: st.turns != null ? st.turns : (r.turns && r.turns[uid]) || 0,
        by: chooserOf(state, uid),
      };
    })
    .sort((a, b) => rank(a) - rank(b));
}

// ---------- Zuteilung: wer sucht für wen aus ----------

/** Würfelt einen Kreis A→B→C→A: niemand sucht für sich selbst aus, jede Person bekommt genau einen Zettel. */
export function rollAssign(ids, rng = Math.random) {
  if (ids.length < MIN_PLAYERS) return {};
  const circle = shuffle(ids, rng);
  const assign = {};
  circle.forEach((uid, i) => {
    assign[uid] = circle[(i + 1) % circle.length];
  });
  return assign;
}

/** Passt die Zuteilung genau zu diesen Personen? (Jede sucht für genau eine andere aus, jede bekommt genau einen Zettel.) */
export function assignFits(assign, ids) {
  if (!assign || ids.length < MIN_PLAYERS || Object.keys(assign).length !== ids.length) return false;
  const targets = new Set();
  for (const uid of ids) {
    const t = assign[uid];
    if (!t || t === uid || !ids.includes(t) || targets.has(t)) return false;
    targets.add(t);
  }
  return true;
}

/**
 * Passt eine bestehende Zuteilung an, wenn Leute dazukommen oder gehen – die übrigen Paare bleiben,
 * so weit es geht, wie sie waren. Neue Leute werden an zufälliger Stelle in den Kreis eingefügt.
 */
export function fitAssign(assign, ids, rng = Math.random) {
  if (ids.length < MIN_PLAYERS) return {};
  if (assignFits(assign, ids)) return assign;
  const old = assign || {};
  const circle = [];
  const start = Object.keys(old).find((u) => ids.includes(u));
  const seen = new Set();
  for (let cur = start; cur && !seen.has(cur); cur = old[cur]) {
    seen.add(cur);
    if (ids.includes(cur)) circle.push(cur);
  }
  shuffle(ids.filter((u) => !circle.includes(u)), rng).forEach((u) => {
    circle.splice(Math.floor(rng() * (circle.length + 1)), 0, u);
  });
  const out = {};
  circle.forEach((uid, i) => {
    out[uid] = circle[(i + 1) % circle.length];
  });
  return assignFits(out, ids) ? out : rollAssign(ids, rng);
}

/** Neue Zuteilung auslosen (nur in der Lobby). */
export function rerollAssign(state, { rng = Math.random } = {}) {
  if (!state || state.phase !== PHASE.LOBBY) return state;
  return { ...state, assign: rollAssign(playerIds(state), rng) };
}

/** true = jede Runde neu auslosen, false = Zuteilung für die nächsten Runden behalten. */
export function setReroll(state, { on }) {
  if (!state || state.reroll === !!on || (state.reroll === undefined && on)) return state;
  return { ...state, reroll: !!on };
}

export const rerollsEachRound = (state) => !state || state.reroll !== false;

/** Zuteilung für die nächste Runde, passend zu den Leuten, die gerade da sind. */
export function nextAssign(state) {
  const ids = playerIds(state);
  return assignFits(state && state.assign, ids) ? state.assign : null;
}

const withFittedAssign = (state, rng) => {
  const ids = playerIds(state);
  const assign = fitAssign(state.assign, ids, rng);
  return assign === state.assign ? state : { ...state, assign };
};

// ---------- Lobby ----------

export function createLobby({ uid, name, now }) {
  return {
    admin: uid,
    createdAt: now,
    phase: PHASE.LOBBY,
    category: '',
    roundNo: 0,
    reroll: true,
    players: { [uid]: { name, joinedAt: now, color: 0 } },
  };
}

/** Kleinste Zettelfarbe, die gerade niemand in der Lobby hat. */
function freeColor(players) {
  const used = new Set(Object.values(players || {}).map((p) => p.color));
  let c = 0;
  while (used.has(c)) c++;
  return c;
}

/** Lobby öffnen oder beitreten. Wer während einer Runde kommt, schaut zu und spielt ab der nächsten mit. */
export function joinLobby(state, { uid, name, now, rng = Math.random }) {
  if (!state) return createLobby({ uid, name, now });
  const existing = state.players && state.players[uid];
  if (existing && existing.name === name) return state;
  const players = { ...(state.players || {}) };
  players[uid] = existing ? { ...existing, name } : { name, joinedAt: now, color: freeColor(players) };
  return existing ? { ...state, players } : withFittedAssign({ ...state, players }, rng);
}

function pickNewAdmin(state, online) {
  const ids = playerIds(state);
  return ids.find((uid) => online && online[uid]) || ids[0] || null;
}

/** Lobby verlassen bzw. von der Admin-Person entfernt werden. Gibt null zurück, wenn die Lobby leer ist. */
export function leaveLobby(state, { uid, now, online = {}, rng = Math.random }) {
  if (!state || !state.players || !state.players[uid]) return state;
  let s = clone(state);
  delete s.players[uid];
  if (s.cats) delete s.cats[uid];
  if (s.rights) delete s.rights[uid];
  if (playerIds(s).length === 0) return null;
  if (s.admin === uid) s.admin = pickNewAdmin(s, online);
  if (isInRound(s, uid) && s.phase !== PHASE.RESULTS) s = removeFromRound(s, uid, now);
  return withFittedAssign(s, rng);
}

export function setAdmin(state, { uid }) {
  if (!state || !state.players || !state.players[uid] || state.admin === uid) return state;
  const next = { ...state, admin: uid };
  if (state.rights && state.rights[uid]) {
    next.rights = { ...state.rights };
    delete next.rights[uid];
  }
  return next;
}

// ---------- Rechte ----------

/** Darf `uid` das? Die Admin-Person darf alles, andere nur, was sie bekommen haben. */
export function can(state, uid, right) {
  if (!state || !uid || !state.players || !state.players[uid]) return false;
  if (state.admin === uid) return true;
  return !!(state.rights && state.rights[uid] && state.rights[uid][right] === true);
}

export function rightsOf(state, uid) {
  return RIGHTS.filter((r) => state && state.admin !== uid && can(state, uid, r));
}

export function setRight(state, { uid, right, on }) {
  if (!state || !RIGHTS.includes(right) || !state.players || !state.players[uid] || state.admin === uid) return state;
  if (!!(state.rights && state.rights[uid] && state.rights[uid][right]) === !!on) return state;
  const rights = clone(state.rights || {});
  const mine = { ...(rights[uid] || {}) };
  if (on) mine[right] = true;
  else delete mine[right];
  if (Object.keys(mine).length) rights[uid] = mine;
  else delete rights[uid];
  return { ...state, rights };
}

/** Thema für alle – jederzeit änderbar, gilt ab der nächsten Runde. */
export function setCategory(state, { category }) {
  if (!state) return state;
  const c = cleanText(category, LIMITS.category);
  return c === (state.category || '') ? state : { ...state, category: c };
}

export const catModeOf = (state) => (state && state.catMode === 'each' ? 'each' : 'all');

export function setCatMode(state, { mode }) {
  if (!state || !CAT_MODES.includes(mode) || catModeOf(state) === mode) return state;
  return { ...state, catMode: mode };
}

/** Eingestelltes Thema einer Person für die nächste Runde: Text, CAT_ROLL oder CAT_FREE. */
export function personCat(state, uid) {
  const v = state && state.cats && state.cats[uid];
  return typeof v === 'string' && v ? v : CAT_ROLL;
}

export function setPersonCat(state, { uid, value }) {
  if (!state || !state.players || !state.players[uid]) return state;
  const v = value === CAT_ROLL || value === CAT_FREE ? value : cleanText(value, LIMITS.category) || CAT_ROLL;
  if (personCat(state, uid) === v) return state;
  const cats = { ...(state.cats || {}) };
  if (v === CAT_ROLL) delete cats[uid];
  else cats[uid] = v;
  return { ...state, cats };
}

/** Thema einer Person in der laufenden Runde ('' = freie Wahl). */
export function topicOf(state, uid) {
  const r = state && state.round;
  if (!r) return '';
  if (r.cats && typeof r.cats[uid] === 'string') return r.cats[uid];
  return r.category || '';
}

/** Hat in dieser Runde jede Person ein eigenes Thema? */
export const eachTopics = (state) => !!(state && state.round && state.round.cats);

// ---------- Runde ----------

/**
 * Startet die Auswahlphase: jede Person bekommt zufällig genau eine andere Person zugeteilt,
 * für die sie einen Charakter aussucht. Die Zuteilung ist ein einziger Kreis
 * (A→B→C→A), so sucht niemand für sich selbst aus und jede Person bekommt genau einen Charakter.
 * Die Zugreihenfolge wird separat und ebenfalls zufällig gemischt.
 */
export function startRound(state, { category, cats = null, now, rid, rng = Math.random }) {
  if (!state || state.phase !== PHASE.LOBBY) return state;
  const ids = playerIds(state);
  if (ids.length < MIN_PLAYERS) return state;
  // Die Zuteilung, die alle in der Lobby gesehen haben – passt sie nicht mehr, wird sie angepasst.
  const assign = fitAssign(state.assign, ids, rng);
  const order = shuffle(ids, rng);
  const status = {};
  const names = {};
  ids.forEach((uid) => {
    status[uid] = { state: STATE.PLAYING };
    names[uid] = state.players[uid].name;
  });
  const no = (state.roundNo || 0) + 1;
  const round = { rid, no, category: '', startedAt: now, assign: { ...assign }, order, status, names, picked: {}, turns: {} };
  const next = { ...state, phase: PHASE.PICKING, roundNo: no, assign, round };
  if (catModeOf(state) === 'each') {
    // jede Person ein eigenes Thema; was beim Start noch gewürfelt werden sollte, kommt fertig in `cats`
    round.cats = {};
    ids.forEach((uid) => {
      const wanted = cats && typeof cats[uid] === 'string' ? cats[uid] : personCat(state, uid);
      round.cats[uid] = wanted === CAT_ROLL || wanted === CAT_FREE ? '' : cleanText(wanted, LIMITS.category);
    });
  } else {
    const cat = cleanText(category != null ? category : state.category, LIMITS.category);
    round.category = cat;
    next.category = cat;
  }
  return next;
}

function maybeStartPlaying(state, now) {
  if (state.phase !== PHASE.PICKING) return state;
  const r = state.round;
  const choosers = Object.keys(r.assign || {});
  const picked = r.picked || {};
  if (choosers.length === 0 || !choosers.every((c) => picked[c])) return state;
  const first = list(r.order)[0];
  return {
    ...state,
    phase: PHASE.PLAYING,
    round: { ...r, playingSince: now, turn: { uid: first, count: 1, since: now }, turns: { [first]: 1 } },
  };
}

/**
 * Ein Charakter wurde aufgeklebt. Sind alle fertig, beginnt automatisch die Raterunde.
 * `target` schützt davor, dass ein Zettel für eine Person zählt, die inzwischen neu zugeteilt wurde.
 */
export function markPicked(state, { uid, now, target = null }) {
  if (!state || state.phase !== PHASE.PICKING || !targetOf(state, uid)) return state;
  if (target && targetOf(state, uid) !== target) return state;
  const picked = { ...(state.round.picked || {}) };
  if (picked[uid]) return state;
  picked[uid] = true;
  return maybeStartPlaying({ ...state, round: { ...state.round, picked } }, now);
}

/** Nächste noch ratende Person in Richtung dir (+1 vorwärts / -1 rückwärts). */
function findNext(r, fromUid, dir, { includeSelf = true } = {}) {
  const order = list(r.order);
  const n = order.length;
  if (n === 0) return null;
  const i = order.indexOf(fromUid);
  const candidates = [];
  if (i < 0) {
    for (let k = 0; k < n; k++) candidates.push(order[dir > 0 ? k : n - 1 - k]);
  } else {
    for (let k = 1; k <= n; k++) candidates.push(order[(((i + dir * k) % n) + n) % n]);
  }
  const isPlaying = (uid) => !!(r.status && r.status[uid] && r.status[uid].state === STATE.PLAYING);
  return candidates.find((c) => (includeSelf || c !== fromUid) && isPlaying(c)) || null;
}

function withTurn(state, uid, now, { countTurn = true } = {}) {
  const r = state.round;
  const turns = { ...(r.turns || {}) };
  if (countTurn) turns[uid] = (turns[uid] || 0) + 1;
  return {
    ...state,
    round: { ...r, turns, turn: { uid, count: ((r.turn && r.turn.count) || 0) + 1, since: now } },
  };
}

function toResults(state, now) {
  return { ...state, phase: PHASE.RESULTS, round: { ...state.round, endedAt: now, turn: null } };
}

/**
 * Weiter zur nächsten Person. `expect` ist der Zugzähler, den der Button gesehen hat –
 * tippen zwei Leute gleichzeitig, wird nur einmal weitergeschaltet.
 */
export function nextTurn(state, { now, expect = null }) {
  if (!state || state.phase !== PHASE.PLAYING) return state;
  const r = state.round;
  if (expect != null && r.turn && r.turn.count !== expect) return state;
  const next = findNext(r, r.turn && r.turn.uid, +1);
  if (!next) return toResults(state, now);
  return withTurn(state, next, now);
}

/** Einen Zug zurück (falls zu früh auf "Nächster" getippt wurde). */
export function prevTurn(state, { now, expect = null }) {
  if (!state || state.phase !== PHASE.PLAYING) return state;
  const r = state.round;
  if (expect != null && r.turn && r.turn.count !== expect) return state;
  const current = r.turn && r.turn.uid;
  const prev = findNext(r, current, -1, { includeSelf: false });
  if (!prev) return state;
  const turns = { ...(r.turns || {}) };
  if (current && turns[current]) turns[current] -= 1;
  return withTurn({ ...state, round: { ...r, turns } }, prev, now, { countTurn: false });
}

function finishPlayer(state, uid, now, kind) {
  if (!state || state.phase !== PHASE.PLAYING || statusOf(state, uid) !== STATE.PLAYING) return state;
  const r = state.round;
  const status = { ...r.status };
  const turnsUsed = (r.turns && r.turns[uid]) || 0;
  if (kind === STATE.GUESSED) {
    const place = Object.values(status).filter((s) => s.state === STATE.GUESSED).length + 1;
    status[uid] = { state: STATE.GUESSED, place, at: now, turns: turnsUsed };
  } else {
    status[uid] = { state: STATE.GAVEUP, at: now, turns: turnsUsed };
  }
  let s = { ...state, round: { ...r, status } };
  if (stillPlaying(s).length === 0) return toResults(s, now);
  if (r.turn && r.turn.uid === uid) {
    const next = findNext(s.round, uid, +1);
    s = next ? withTurn(s, next, now) : toResults(s, now);
  }
  return s;
}

/** Person hat ihren Charakter erraten: sie bekommt einen Platz und wird in der Reihenfolge übersprungen. */
export function markGuessed(state, { uid, now }) {
  return finishPlayer(state, uid, now, STATE.GUESSED);
}

/** Person gibt auf: sie sieht ihren Charakter und wird übersprungen. */
export function giveUp(state, { uid, now }) {
  return finishPlayer(state, uid, now, STATE.GAVEUP);
}

export function endRound(state, { now }) {
  if (!state || (state.phase !== PHASE.PLAYING && state.phase !== PHASE.PICKING)) return state;
  if (state.phase === PHASE.PICKING) return backToLobby(state);
  return toResults(state, now);
}

const sameAssign = (a, b) => !!a && !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

export function backToLobby(state, { rng = Math.random } = {}) {
  if (!state || state.phase === PHASE.LOBBY) return state;
  // Nur nach einer gespielten Runde neu auslosen – wird die Auswahl abgebrochen, bleibt die Zuteilung.
  const played = (state.phase === PHASE.PLAYING || state.phase === PHASE.RESULTS) && state.round && state.round.assign;
  const s = { ...state, phase: PHASE.LOBBY };
  delete s.round;
  const ids = playerIds(s);
  if (rerollsEachRound(s) && played) {
    // jede Runde neu: möglichst eine andere Zuteilung als eben
    let next = rollAssign(ids, rng);
    for (let i = 0; i < 6 && ids.length > 2 && sameAssign(next, played); i++) next = rollAssign(ids, rng);
    s.assign = next;
  } else {
    s.assign = fitAssign(s.assign, ids, rng);
  }
  return s;
}

/** Person verlässt eine laufende Runde (Lobby verlassen oder entfernt). */
export function removeFromRound(state, uid, now) {
  if (!isInRound(state, uid)) return state;
  const s = clone(state);
  const r = s.round;
  const wasTurn = s.phase === PHASE.PLAYING && r.turn && r.turn.uid === uid;
  const nextAfter = wasTurn ? findNext(r, uid, +1, { includeSelf: false }) : null;

  r.order = list(r.order).filter((x) => x !== uid);
  delete r.status[uid];
  if (r.turns) delete r.turns[uid];

  if (s.phase === PHASE.PICKING) {
    const assign = r.assign || {};
    const picked = r.picked || {};
    const chooser = Object.keys(assign).find((c) => assign[c] === uid);
    const target = assign[uid];
    delete assign[uid];
    delete picked[uid];
    if (chooser) {
      if (target && target !== chooser) {
        assign[chooser] = target; // der Kreis schließt sich wieder
      } else {
        delete assign[chooser];
      }
      delete picked[chooser]; // muss neu (für die neue Person) aussuchen
    }
    r.assign = assign;
    r.picked = picked;
    if (r.order.length < MIN_PLAYERS) return backToLobby(s);
    return maybeStartPlaying(s, now);
  }

  if (s.phase === PHASE.PLAYING) {
    if (r.order.length === 0) return backToLobby(s);
    if (stillPlaying(s).length === 0) return toResults(s, now);
    if (wasTurn) return nextAfter ? withTurn(s, nextAfter, now) : toResults(s, now);
  }
  return s;
}
