// games/quiz/game.js – die Quizwand (Jeopardy-Prinzip) als Spiel der Plattform.
//
// Rollen: Der Host moderiert (sieht Lösungen, entscheidet über Punkte), alle anderen spielen.
// Raum unter /rooms/<id>: { game:'quiz', host, title, quizId, players:{uid:{name,joinedAt,color}}, st }
// - st schreibt nur der Host (seine App ist die Spielsteuerung, siehe Abschnitt "Host-Steuerung").
// - Spielende schreiben nur nach /inputs/<raum>/<uid>: pick (Feldwahl), joker, buzz, answer.
//   Diese Eingaben kann nur der Host lesen. Zurück an einzelne Spielende (50:50, Spicken) schreibt
//   der Host nach /inputs/<raum>/<uid>/host – das sieht nur diese Person.
// - Eigene Mediendateien liegen verschlüsselt unter /media/<raum>; den Schlüssel gibt es erst beim Aufdecken.
import * as Q from './logic.js';
import { getQuiz, stats, quizFileIds } from './library.js';
import { E, screens as studioScreens, actions as studioActions } from './studio.js';
import { mediaHTML, syncMedia, uploadQuizMedia, loadMediaMap, forgetMediaMap, startPrefetch, stopPrefetch, useLocalFiles, getFile, KIND_LABEL } from './media.js';
import {
  COLORS, ICON, esc, makeId, $, slot, setHTML, fmtSeconds, fmtPoints, toast, openSheet, closeSheets, confirmDialog,
  sound, vibrate, announce, keepScreenOn, steadyInterval,
} from '../../core/ui.js';

const ID = 'quiz';
const NAME = 'Quizwand';

// ---------- lokaler Zustand ----------

const H = {
  roomId: null,
  quiz: null,
  st: null,
  inputs: {},
  inputsOff: null,
  tick: null,
  arrivals: new Map(),
  buzzRound: null,
  buzzDue: null,
  reviewKey: null,
  verdicts: {},
  custom: {},
  media: { map: {}, ready: 0, total: 0, busy: false, error: '' },
  uploadToken: 0,
  needFile: null,
  peekSent: {},
  fiftySent: {},
  hostOut: {},
  locked: {}, // erste Antworten bei Fragen für alle: `${q.key}:${uid}` -> Antwort
};

const P = {
  round: null, // q.key:buzz.id
  open: false,
  shownAt: null,
  openTimer: null,
  pressed: false,
  reaction: null,
  lockUntil: 0,
  tooEarly: false,
  choice: null,
  choiceKey: null,
  sent: {},
  lastResultKey: null,
  lastTurnAlert: null,
  hostData: null,
  hostOff: null,
  hostRoom: null,
  readySent: {},
  jokerSent: null,
  rejSeen: null,
  jlogSeen: null,
  jsel: null, // { round, type, target } – ausgewählter Joker in der Joker-Runde
  jusing: null, // Runde, in der gerade ein Joker unterwegs ist
  jpassed: {}, // Runden, in denen „Ohne Joker“ gewählt wurde
  jroundSeen: null,
  bsel: null, // Board-Modus: { type, target } – ausgewählter Joker auf dem Board
  bpending: false, // Board-Modus: Joker ist unterwegs
};

/** Kennung der Joker-Runde (dasselbe Feld kann nach dem Zurücklegen noch einmal gewählt werden). */
const roundOf = (q) => (q ? `${q.key}:${q.pickedAt || 0}` : null);


const roomOf = (api) => (api.room && api.room.game === ID ? api.room : null);
const isHost = (api, room) => !!(room && room.host === api.uid);
const pname = (api, room, uid) => (room && room.players && room.players[uid] && room.players[uid].name) || api.memberName(uid);
const hostName = (api, room) => api.memberName(room.host);
function colorOf(api, room, uid) {
  const st = room && (isHost(api, room) && H.st ? H.st : room.st);
  const c = st && st.colors && st.colors[uid];
  return typeof c === 'number' ? COLORS[c % COLORS.length] : api.roomColor(room, uid);
}

/** Spielstand: für den Host seine Arbeitskopie (schneller als der Server), sonst der Server-Stand. */
function stOf(api, room) {
  if (isHost(api, room) && H.roomId === api.roomId) return cur(api) || room.st;
  return room && room.st;
}

function freeColor(players) {
  const used = new Set(Object.values(players || {}).map((p) => p.color));
  let c = 0;
  while (used.has(c)) c++;
  return c;
}

const RULE_TEXT = {
  penalty: { none: '', half: 'Falsche Antwort kostet die Hälfte', full: 'Falsche Antwort kostet den vollen Wert' },
  negative: 'Minuspunkte erlaubt',
  stealHalf: 'Wegschnappen bringt nur die Hälfte',
  winnerPicks: 'Wer richtig antwortet, wählt die nächste Frage',
  earlyLock: 'Frühstarter am Buzzer werden kurz gesperrt',
};

function activeRules(st) {
  const r = st.rules || {};
  const out = [];
  if (r.penalty && r.penalty !== 'none') out.push(RULE_TEXT.penalty[r.penalty]);
  if (r.negative) out.push(RULE_TEXT.negative);
  if (r.stealHalf) out.push(RULE_TEXT.stealHalf);
  if (r.winnerPicks) out.push(RULE_TEXT.winnerPicks);
  if (r.earlyLock) out.push(RULE_TEXT.earlyLock);
  if (r.answerTime) out.push(`${r.answerTime} Sekunden Antwortzeit`);
  const after = { buzzer: 'Nach falscher Antwort: Buzzer für alle', next: 'Nach falscher Antwort: nächste Person', none: 'Nach falscher Antwort: Frage ist weg' };
  out.push(after[st.afterWrong || 'buzzer']);
  return out;
}

// ---------- Host-Steuerung (läuft nur auf dem Gerät des Hosts) ----------

function cur(api) {
  const room = H.roomId && api.ctx.rooms && api.ctx.rooms[H.roomId];
  const remote = room && room.st;
  if (!H.st || (remote && (remote.v || 0) > (H.st.v || 0))) H.st = remote || H.st;
  return H.st;
}

/** Eingaben für die Auswertung – mit den festgehaltenen ersten Antworten bei Fragen für alle. */
function answerInputs(q) {
  if (!q || q.mode !== 'all') return H.inputs;
  const view = { ...H.inputs };
  Object.keys(H.locked).forEach((k) => {
    const [key, uid] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)];
    if (key === q.key) view[uid] = { ...(view[uid] || {}), answer: H.locked[k] };
  });
  return view;
}

async function mutate(api, fn) {
  const s0 = cur(api);
  if (!s0) return;
  const next = fn(s0);
  const s1 = next && Q.fillAnswers(next, answerInputs(next.q));
  if (!s1 || s1 === s0) return;
  H.st = s1;
  api.render();
  try {
    await api.b.write(`rooms/${H.roomId}/st`, s1);
  } catch (err) {
    console.error(err);
    toast('Spielstand konnte nicht gespeichert werden. Prüf deine Verbindung.');
  }
}

// Nur ein Fenster pro Gerät darf einen Raum moderieren – zwei Spielleitungen würden sich
// gegenseitig überschreiben (z. B. wenn die App versehentlich zweimal offen ist).
const LOCK = { waiting: null, blocked: null, release: null, retry: null };

function engineStart(api, roomId, room) {
  if (H.roomId === roomId || LOCK.waiting === roomId) return;
  if (!(navigator.locks && navigator.locks.request)) return startEngine(api, roomId, room);
  LOCK.waiting = roomId;
  navigator.locks
    .request(`spieleabend-quiz-${roomId}`, { ifAvailable: true }, (lock) => {
      LOCK.waiting = null;
      const latest = (api.ctx.rooms && api.ctx.rooms[roomId]) || null;
      if (!lock) {
        if (LOCK.blocked !== roomId) {
          LOCK.blocked = roomId;
          api.render();
        }
        clearTimeout(LOCK.retry);
        LOCK.retry = setTimeout(() => {
          const r = api.ctx.rooms && api.ctx.rooms[roomId];
          if (r && isHost(api, r)) engineStart(api, roomId, r);
        }, 3000);
        return null;
      }
      if (!latest || !isHost(api, latest)) return null; // Raum weg oder nicht mehr deiner
      LOCK.blocked = null;
      clearTimeout(LOCK.retry);
      startEngine(api, roomId, latest);
      mutate(api, (s) => Q.syncPlayers(s, latest.players || {}));
      processInputs(api);
      api.render();
      return new Promise((resolve) => {
        LOCK.release = resolve;
      });
    })
    .catch(() => {
      LOCK.waiting = null;
      startEngine(api, roomId, room);
    });
}

function localBlobForMid(mid) {
  const fileId = Object.keys(H.media.map || {}).find((id) => H.media.map[id] && H.media.map[id].mid === mid);
  return fileId ? getFile(fileId).then((rec) => (rec ? rec.blob : null)) : Promise.resolve(null);
}

function startEngine(api, roomId, room) {
  engineStop();
  H.roomId = roomId;
  H.quiz = getQuiz(room.quizId);
  H.st = room.st;
  const fileIds = H.quiz ? quizFileIds(H.quiz) : [];
  H.media = { map: loadMediaMap(roomId), ready: 0, total: fileIds.length, busy: fileIds.length > 0, error: '' };
  useLocalFiles(localBlobForMid);
  if (fileIds.length) {
    const token = ++H.uploadToken;
    uploadQuizMedia(api, roomId, fileIds, {
      cancelled: () => token !== H.uploadToken,
      first: () => H.needFile,
      onProgress: (p) => {
        if (token !== H.uploadToken) return;
        H.media = { ...H.media, ...p, error: p.error || '', map: loadMediaMap(roomId) };
        attachPendingMedia(api);
        api.render();
      },
    }).catch((err) => console.error(err));
  }
  H.inputsOff = api.b.watch(`inputs/${roomId}`, (v) => {
    H.inputs = v || {};
    processInputs(api);
    api.render();
  });
  // Takt der Spielsteuerung – läuft auch, wenn dein Fenster verdeckt oder minimiert ist.
  H.tick = steadyInterval(() => {
    // Buzzer: Ausgleichsfenster abgelaufen?
    if (H.buzzDue && performance.now() >= H.buzzDue.at) {
      const round = H.buzzDue.round;
      H.buzzDue = null;
      resolveRound(api, round);
    }
    const st = cur(api);
    if (!st || !st.q) return;
    const now = api.b.now();
    const q = st.q;
    if (q.stage === 'joker') {
      if (Q.jokerRoundDone(st, { now, online: onlineIds(api, st) })) openTile(api);
      return;
    }
    if (q.deadline && now >= q.deadline && (q.stage === 'answer' || q.stage === 'all')) mutate(api, (s) => Q.timeout(s, { now }));
    // „Alle“-Frage: Haben alle, die online sind, abgegeben, wartet die App nicht ewig auf Leute ohne Verbindung.
    if (q.stage === 'all') {
      const given = q.given || {};
      const eligible = Q.list(st.order).filter((u) => !Q.sitsOut(st, u));
      // Alle, die noch mitspielen, haben abgegeben (z. B. weil die letzte Person den Raum verlassen hat)
      if (eligible.length && eligible.every((u) => given[u])) {
        H.allSince = null;
        mutate(api, (s) => (s.q && s.q.key === q.key && s.q.stage === 'all' ? Q.toReview(s) : s));
        return;
      }
      const online = eligible.filter((u) => api.isOnline(u));
      const waiting = online.length && online.every((u) => given[u]) && eligible.some((u) => !given[u]);
      if (!waiting) H.allSince = null;
      else if (!H.allSince || H.allSince.key !== q.key) H.allSince = { key: q.key, at: now };
      else if (now - H.allSince.at > 4000) {
        H.allSince = null;
        mutate(api, (s) => (s.q && s.q.key === q.key ? Q.toReview(s) : s));
      }
    }
    // Video/Ton automatisch starten, sobald alle bereit sind (spätestens nach 8 Sekunden)
    if (q.media && q.media.autoplay && !q.media.pending && !q.play && q.stage !== 'closed' && ['video', 'audio', 'youtube'].includes(q.media.kind)) {
      const r = readyCount(api, st);
      if (r.ready >= r.total || now - (q.revealedAt || now) > 8000) {
        mutate(api, (s) => (s.q && s.q.key === q.key && !s.q.play ? Q.setPlay(s, { state: 'play', now: api.b.now() }) : s));
      }
    }
  }, 100);
}

/** Wie viele Geräte (online, im Spiel) das Medium der aktuellen Frage geladen haben. */
function readyCount(api, st) {
  const q = st.q;
  const online = Q.list(st.order).filter((u) => api.isOnline(u));
  const ready = online.filter((u) => H.inputs[u] && H.inputs[u].ready && H.inputs[u].ready.key === (q && q.key)).length;
  return { ready, total: online.length };
}

/** Öffentliche Beschreibung eines Mediums – eigene Dateien mit Schlüssel, sobald sie hochgeladen sind. */
function publicMedia(m) {
  if (!m || !m.kind) return null;
  const base = { kind: m.kind, start: Number(m.start) || 0, end: Number(m.end) || 0, autoplay: m.autoplay !== false };
  if (m.src) return { ...base, src: m.src };
  if (m.file) {
    const up = H.media.map && H.media.map[m.file];
    if (up && up.mid) return { ...base, file: { mid: up.mid, key: up.key, iv: up.iv, mime: up.mime } };
    if ((H.media.missing || []).includes(m.file)) return null; // fehlt auf diesem Gerät – Frage geht ohne Medium
    H.needFile = m.file;
    return { ...base, pending: true };
  }
  return null;
}

/** War eine Datei beim Aufdecken noch nicht hochgeladen, kommt sie nach, sobald sie da ist. */
function attachPendingMedia(api) {
  const st = cur(api);
  const q = st && st.q;
  if (!q) return;
  const question = questionOf(st);
  if (!question) return;
  const media = q.media && q.media.pending ? publicMedia(question.media) : null;
  const sol = q.solMedia && q.solMedia.pending ? publicMedia(question.solutionMedia) : null;
  if ((media && !media.pending) || (sol && !sol.pending)) {
    mutate(api, (s) => {
      if (!s.q || s.q.key !== q.key) return s;
      return { ...s, v: (s.v || 0) + 1, q: { ...s.q, ...(media && !media.pending ? { media } : {}), ...(sol && !sol.pending ? { solMedia: sol } : {}) } };
    });
  }
}

/** Nur für einzelne Spielende: welche Antworten bei 50:50 verschwinden, was beim Spicken zu sehen ist. */
function writeHost(api, uid, patch) {
  const prev = H.hostOut[uid] && H.hostOut[uid].key === patch.key ? H.hostOut[uid] : {};
  H.hostOut[uid] = { ...prev, ...patch };
  api.b.write(`inputs/${H.roomId}/${uid}/host`, H.hostOut[uid]).catch(() => {});
}

/** Was eine Person gerade eingibt (Entwurf) – nur für Spickende. */
function draftView(q, d) {
  if (d.choice != null) {
    const g = Q.givenOf(q, d);
    return g.choice != null ? g : { none: true };
  }
  const text = String(d.text == null ? '' : d.text).slice(0, 200);
  return text.trim() ? { text, raw: true } : { none: true };
}

function syncPrivate(api) {
  const st = cur(api);
  const q = st && st.q;
  if (!q || !H.roomId) return;
  const fx = st.fx || {};
  const question = questionOf(st);
  Object.keys(fx.fifty || {}).forEach((uid) => {
    const k = `${q.key}:${uid}`;
    if (H.fiftySent[k] || !question || question.type !== 'choice') return;
    H.fiftySent[k] = true;
    const wrong = (question.options || []).map((_, i) => i).filter((i) => i !== Number(question.correct) && String(question.options[i] || '').trim());
    const keep = wrong[Math.floor(Math.random() * wrong.length)];
    writeHost(api, uid, { key: q.key, hide: wrong.filter((i) => i !== keep) });
  });
  if (q.stage === 'all') {
    Object.keys(fx.peek || {}).forEach((uid) => {
      // Live: was die anderen gerade eintippen oder auswählen, und wer schon abgegeben hat
      const peek = {};
      Q.list(st.order).forEach((u) => {
        if (u === uid || Q.sitsOut(st, u)) return;
        const inp = H.inputs[u] || {};
        const ans = H.locked[`${q.key}:${u}`] || inp.answer;
        const dr = inp.draft;
        if (ans && ans.key === q.key && ans.attempt === q.attempt) peek[u] = { ...Q.givenOf(q, ans), done: true };
        else if (dr && dr.key === q.key && dr.attempt === q.attempt) peek[u] = draftView(q, dr);
        else peek[u] = { none: true };
      });
      const sig = JSON.stringify(peek);
      const k = `${q.key}:${uid}`;
      if (H.peekSent[k] === sig) return;
      H.peekSent[k] = sig;
      writeHost(api, uid, { key: q.key, peek });
    });
  }
  // Gibt der Host einen Joker zurück, verschwindet auch das, was nur diese Person gesehen hat.
  Object.entries(H.hostOut).forEach(([uid, out]) => {
    if (!out || out.key !== q.key) return;
    if (out.peek && !(fx.peek && fx.peek[uid])) {
      delete H.peekSent[`${q.key}:${uid}`];
      writeHost(api, uid, { key: q.key, peek: null });
    }
    if (out.hide && out.hide.length && !(fx.fifty && fx.fifty[uid])) {
      delete H.fiftySent[`${q.key}:${uid}`];
      writeHost(api, uid, { key: q.key, hide: [] });
    }
  });
}

function engineStop() {
  H.uploadToken++;
  useLocalFiles(null);
  if (LOCK.release) LOCK.release();
  LOCK.release = null;
  LOCK.blocked = null;
  clearTimeout(LOCK.retry);
  if (H.inputsOff) H.inputsOff();
  if (H.tick) H.tick();
  Object.assign(H, {
    roomId: null, quiz: null, st: null, inputs: {}, inputsOff: null, tick: null, buzzRound: null, buzzDue: null, reviewKey: null, verdicts: {}, custom: {},
    media: { map: {}, ready: 0, total: 0, busy: false, error: '' }, needFile: null, peekSent: {}, fiftySent: {}, hostOut: {}, allSince: null, locked: {},
  });
  H.arrivals = new Map();
}

function questionOf(st) {
  if (!H.quiz || !st || !st.q) return null;
  const b = H.quiz.boards[st.q.b];
  return (b && b.categories[st.q.c] && b.categories[st.q.c].questions[st.q.r]) || null;
}

const solutionText = (question) =>
  !question
    ? ''
    : question.type === 'choice'
      ? (question.options || [])[question.correct] || ''
      : question.type === 'estimate'
        ? `${Q.fmtNumber(Number(question.number))}${question.unit ? ' ' + question.unit : ''}`
        : question.answer || '';

function windowFor(api, st) {
  const ids = st.q ? Q.eligibleForBuzz(st) : Q.list(st.order);
  return Q.buzzWindow(ids.map((u) => api.rttOf(u)).filter((x) => x != null));
}

function revealTile(api, b, c, r, pickAt = null) {
  if (!H.quiz) return toast('Dieses Quiz liegt nicht auf diesem Gerät. Öffne den Raum auf dem Gerät, auf dem du es erstellt hast.');
  const board = H.quiz.boards[b];
  const question = board && board.categories[c] && board.categories[c].questions[r];
  if (!question) return;
  const now = api.b.now();
  publicMedia(question.media); // eigene Datei wird jetzt zuerst hochgeladen, falls sie noch fehlt
  mutate(api, (s) => {
    let n;
    if (Q.jokerModeOf(s) === 'board') {
      // Joker wurden schon auf dem Board eingesetzt – die Frage geht sofort auf.
      n = Q.reveal(s, { b, c, r, question, now, defaultMode: H.quiz.defaultMode, window: windowFor(api, s), media: publicMedia(question.media) });
    } else {
      // Erst die Joker-Runde. Hat niemand einen passenden Joker, geht die Frage sofort auf.
      n = Q.pickTile(s, { b, c, r, question, now, defaultMode: H.quiz.defaultMode });
      if (n !== s && Q.jokerRoundDone(n, { now, online: onlineIds(api, n) })) n = openWith(api, n, question, now);
    }
    if (pickAt && n !== s) n = { ...n, lastPickAt: pickAt };
    else if (pickAt) n = { ...s, lastPickAt: pickAt, v: (s.v || 0) + 1 };
    return n;
  });
}

const onlineIds = (api, st) => Q.list(st.order).filter((u) => api.isOnline(u));

function openWith(api, s, question, now) {
  return Q.openQuestion(s, { question, now, window: windowFor(api, s), media: publicMedia(question.media) });
}

/** Joker-Runde beenden und die Frage für alle aufdecken. */
function openTile(api) {
  mutate(api, (s) => {
    if (!Q.inJokerRound(s)) return s;
    const question = questionOf(s);
    return question ? openWith(api, s, question, api.b.now()) : s;
  });
}

function processInputs(api) {
  let st0 = cur(api);
  if (!st0) return;
  // Joker zuerst (Joker-Runde: wer zuerst einsetzt, bekommt ihn)
  let js = st0;
  Q.list(js.order).forEach((uid) => {
    const j = H.inputs[uid] && H.inputs[uid].joker;
    if (j && j.id && (!js.jseen || js.jseen[uid] !== j.id)) js = Q.useJoker(js, uid, j, { now: api.b.now() });
  });
  if (js !== st0) {
    mutate(api, () => js);
    st0 = cur(api);
  }
  let st = st0;
  const order = Q.list(st.order);
  // Feldwahl der Person, die dran ist
  if (st.phase === 'board' && st.turn) {
    const pick = H.inputs[st.turn] && H.inputs[st.turn].pick;
    if (pick && (pick.at || 0) > (st.lastPickAt || 0)) {
      if (Q.canPick(st, pick.b, pick.c, pick.r)) return revealTile(api, pick.b, pick.c, pick.r, pick.at);
      st = { ...st, lastPickAt: pick.at, v: (st.v || 0) + 1 };
    }
  }
  // Antworten – bei Fragen für alle zählt die erste Abgabe (spätere werden ignoriert)
  if (st.q) {
    order.forEach((uid) => {
      const ans = H.inputs[uid] && H.inputs[uid].answer;
      if (!ans || ans.key !== st.q.key || ans.attempt !== st.q.attempt) return;
      const before = st;
      st = Q.receiveAnswer(st, uid, ans);
      if (st !== before && st.q.mode === 'all') {
        const k = `${st.q.key}:${uid}`;
        if (!H.locked[k]) H.locked[k] = ans;
      }
    });
  }
  if (st !== st0) mutate(api, () => st);
  syncPrivate(api);
  // Buzzer: Ankunft merken, nach dem Ausgleichsfenster auswerten
  const q = st.q;
  if (q && q.stage === 'buzz' && q.buzz) {
    const round = `${q.key}:${q.buzz.id}`;
    let fresh = false;
    order.forEach((uid) => {
      const bz = H.inputs[uid] && H.inputs[uid].buzz;
      if (!bz || bz.key !== q.key || bz.id !== q.buzz.id) return;
      const k = `${round}:${uid}`;
      if (!H.arrivals.has(k)) {
        H.arrivals.set(k, { uid, id: bz.id, reaction: bz.reaction, arrived: performance.now(), round });
        fresh = true;
      }
    });
    if (fresh && H.buzzRound !== round) {
      H.buzzRound = round;
      H.buzzDue = { round, at: performance.now() + (q.buzz.window || 600) };
    }
  }
}

function resolveRound(api, round) {
  const entries = [...H.arrivals.values()].filter((e) => e.round === round).sort((a, b) => a.arrived - b.arrived);
  const before = cur(api);
  mutate(api, (s) => (s.q && s.q.buzz && `${s.q.key}:${s.q.buzz.id}` === round ? Q.resolveBuzz(s, entries, { now: api.b.now() }) : s));
  if (cur(api) === before) H.buzzRound = null; // nichts Gültiges dabei – nächster Druck startet neu
}

function reviewKeyOf(st) {
  return st.q ? `${st.q.key}:${st.q.attempt}:${st.q.stage}` : null;
}

function reviewRows(api, st) {
  const key = reviewKeyOf(st);
  if (key !== H.reviewKey) {
    H.reviewKey = key;
    H.verdicts = {};
    H.custom = {};
  }
  const question = questionOf(st);
  if (!question) return [];
  return Q.proposal(Q.fillAnswers(st, answerInputs(st.q)), question).map((row) => {
    const ok = row.uid in H.verdicts ? H.verdicts[row.uid] : row.ok;
    const owner = st.q.owner || st.q.picker;
    const stolen = st.q.mode === 'turn' && !!owner && row.uid !== owner;
    const delta = row.uid in H.custom ? H.custom[row.uid] : ok == null ? 0 : Q.effectiveDelta(st, row.uid, Q.scoreDelta(st.q.value, ok, { stolen, rules: st.rules }));
    return { ...row, ok, delta, auto: row.ok, custom: row.uid in H.custom };
  });
}

function applyReview(api) {
  const st = cur(api);
  const rows = reviewRows(api, st);
  if (st.q.mode !== 'all' && rows.some((r) => r.ok == null && !r.custom)) return toast('Entscheide zuerst: richtig oder falsch?');
  const verdicts = {};
  const custom = {};
  rows.forEach((r) => {
    verdicts[r.uid] = r.ok;
    if (r.custom) custom[r.uid] = r.delta;
  });
  const now = api.b.now();
  mutate(api, (s) => Q.judge(s, verdicts, { now, custom, window: windowFor(api, s) }));
}

function quickJudge(api, ok) {
  const st = cur(api);
  if (!st.q || !st.q.answering) return;
  const now = api.b.now();
  mutate(api, (s) => Q.judge(s, { [st.q.answering]: ok }, { now, window: windowFor(api, s) }));
}

// ---------- Spieler: Buzzer ----------

function syncBuzzer(api, room) {
  const st = room && room.st;
  const q = st && st.q;
  const round = q && q.stage === 'buzz' && q.buzz ? `${q.key}:${q.buzz.id}` : null;
  if (round === P.round) return;
  clearTimeout(P.openTimer);
  Object.assign(P, { round, open: false, shownAt: null, pressed: false, reaction: null, tooEarly: false, lockUntil: 0 });
  if (!round) return;
  const eligible = Q.eligibleForBuzz(st).includes(api.uid);
  const delay = Math.max(0, q.buzz.openAt - api.b.now());
  P.openTimer = setTimeout(() => {
    if (P.round !== round) return;
    P.open = true;
    api.renderNow();
    requestAnimationFrame(() => {
      if (P.round !== round) return;
      P.shownAt = performance.now();
      if (eligible) {
        sound('open');
        vibrate(25);
      }
    });
  }, delay);
}

function pressBuzzer(api) {
  const room = roomOf(api);
  const st = room && room.st;
  const q = st && st.q;
  if (!q || q.stage !== 'buzz' || !q.buzz || isHost(api, room)) return;
  if (!Q.eligibleForBuzz(st).includes(api.uid) || P.pressed) return;
  const now = performance.now();
  if (now < P.lockUntil) return;
  const early = !P.open || P.shownAt == null || now - P.shownAt < Q.MIN_REACTION;
  if (early) {
    P.tooEarly = true;
    if (st.rules && st.rules.earlyLock) P.lockUntil = now + 500;
    api.renderNow();
    setTimeout(() => {
      P.tooEarly = false;
      api.render();
    }, st.rules && st.rules.earlyLock ? 500 : 350);
    return;
  }
  P.pressed = true;
  P.reaction = Math.round(now - P.shownAt);
  sound('buzz');
  vibrate(35);
  api.renderNow();
  const round = P.round;
  api.b.sendInput(api.roomId, 'buzz', { key: q.key, id: q.buzz.id, reaction: P.reaction }).catch(() => {
    if (P.round === round) P.pressed = false;
    toast('Buzzer konnte nicht gesendet werden. Drück nochmal.');
    api.render();
  });
}

document.addEventListener(
  'pointerdown',
  (e) => {
    const btn = e.target.closest('[data-buzzer]');
    if (!btn || !window.__quizApi) return;
    e.preventDefault();
    pressBuzzer(window.__quizApi);
  },
  { passive: false }
);
document.addEventListener('keydown', (e) => {
  if (!window.__quizApi || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.querySelector('.overlay')) return;
  if (e.code === 'Space' && document.querySelector('[data-buzzer]')) {
    e.preventDefault();
    if (!e.repeat) pressBuzzer(window.__quizApi);
    return;
  }
  // Am PC: Antworten mit 1–6 oder A–F wählen, Enter gibt ab
  const pick = document.querySelectorAll('.qoptions.pick [data-action="quiz:choose"]');
  if (!pick.length || e.repeat) return;
  const k = e.key.toLowerCase();
  const i = '123456'.indexOf(k) >= 0 ? '123456'.indexOf(k) : 'abcdef'.indexOf(k);
  if (i >= 0 && k.length === 1) {
    const btn = [...pick].find((b) => Number(b.dataset.i) === i);
    if (btn) {
      e.preventDefault();
      btn.click();
    }
  } else if (e.key === 'Enter') {
    const send = document.querySelector('[data-action="quiz:send"]');
    if (send && !send.disabled) {
      e.preventDefault();
      send.click();
    }
  }
});

// Spicken: Was jemand gerade eintippt, geht (nur an den Host) raus, solange jemand anderes spickt.
const DRAFT = { timer: null, last: '', pending: null, sentAt: 0 };
function sendDraft(api, data) {
  const room = roomOf(api);
  const st = room && room.st;
  const q = st && st.q;
  if (!q || q.stage !== 'all' || !Q.list(st.order).includes(api.uid) || Q.sitsOut(st, api.uid)) return;
  if (!Object.keys((st.fx && st.fx.peek) || {}).some((u) => u !== api.uid)) return;
  const payload = { key: q.key, attempt: q.attempt, ...data };
  const sig = JSON.stringify(payload);
  if (sig === DRAFT.last) return;
  DRAFT.last = sig;
  DRAFT.pending = payload;
  const flush = () => {
    DRAFT.timer = null;
    DRAFT.sentAt = Date.now();
    const p = DRAFT.pending;
    DRAFT.pending = null;
    if (p) api.b.sendInput(api.roomId, 'draft', p).catch(() => {});
  };
  if (!DRAFT.timer) DRAFT.timer = setTimeout(flush, Math.max(0, 300 - (Date.now() - DRAFT.sentAt)));
}
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!window.__quizApi || !t || !t.classList || !t.classList.contains('answer-input')) return;
  sendDraft(window.__quizApi, { text: String(t.value || '').slice(0, 200) });
});

// ---------- Darstellung: gemeinsame Teile ----------

/** Kleine Marken für aktive Joker-Wirkungen: ×2, Schild, setzt aus. */
function fxTags(st, uid) {
  const fx = st.fx || {};
  const tags = [];
  if (fx.double && fx.double[uid]) tags.push('<span class="fx-tag">×2</span>');
  if (fx.shield && fx.shield[uid]) tags.push(`<span class="fx-tag" title="Schutzschild">${ICON.shield}</span>`);
  if (fx.skip && fx.skip[uid]) tags.push('<span class="fx-tag out">setzt aus</span>');
  return tags.join('');
}

function scorebar(api, room, st, { host = false } = {}) {
  const order = Q.list(st.order);
  if (!order.length) return '';
  return `<ol class="scorebar">${order
    .map((uid) => {
      const cls = ['score-chip', uid === st.turn && st.phase !== 'lobby' ? 'turn' : '', uid === api.uid ? 'me' : '', api.isOnline(uid) ? '' : 'offline'].filter(Boolean).join(' ');
      const inner = `<span class="swatch ${colorOf(api, room, uid)}"></span><span class="score-name">${esc(uid === api.uid ? 'Du' : pname(api, room, uid))}</span>${fxTags(st, uid)}<span class="score-val">${(st.scores || {})[uid] || 0}</span>`;
      return host ? `<li><button class="${cls}" data-action="quiz:player" data-uid="${esc(uid)}">${inner}</button></li>` : `<li class="${cls}">${inner}</li>`;
    })
    .join('')}</ol>`;
}

function boardHTML(api, room, st, { mode = 'view' } = {}) {
  const b = st.board;
  const board = st.boards[b];
  if (!board) return '';
  const cols = board.cats.length;
  const rows = Math.max(0, ...board.cats.map((c) => c.values.length));
  const head = board.cats.map((c) => `<div class="qcat-head"><span data-fitw="17">${esc(c.name)}</span></div>`).join('');
  let cells = '';
  for (let r = 0; r < rows; r++) {
    board.cats.forEach((cat, c) => {
      const key = Q.tileKey(b, c, r);
      const filled = r < cat.values.length && cat.filled[r];
      const used = st.used && st.used[key];
      if (!filled) cells += '<div class="tile empty" aria-hidden="true"></div>';
      else if (used) {
        const by = used.by;
        const label = by ? (by === api.uid ? 'du' : pname(api, room, by)) : 'niemand';
        const inner = `${by ? `<span class="swatch ${colorOf(api, room, by)}"></span>` : ''}<span>${esc(label)}</span>`;
        cells +=
          mode === 'host'
            ? `<button class="tile used" data-action="quiz:used-tile" data-key="${key}" aria-label="${esc(cat.name)} ${Q.tileValue(st, b, c, r)}, erledigt">${inner}</button>`
            : `<div class="tile used">${inner}</div>`;
      } else {
        const v = Q.tileValue(st, b, c, r);
        cells +=
          mode === 'host' || mode === 'pick'
            ? `<button class="tile open" data-action="${mode === 'host' ? 'quiz:host-pick' : 'quiz:pick'}" data-b="${b}" data-c="${c}" data-r="${r}" aria-label="${esc(cat.name)} für ${v}">${v}</button>`
            : `<div class="tile open">${v}</div>`;
      }
    });
  }
  return `<div class="qboard" style="--cols:${cols}">${head}${cells}</div>`;
}

function boardTabs(st, { host }) {
  if (st.boards.length < 2) return '';
  return `<div class="board-tabs" role="tablist">${st.boards
    .map((bd, i) => {
      const done = Q.boardDone(st, i);
      const label = `${esc(bd.title || `Board ${i + 1}`)}${bd.mult > 1 ? ` <small>×${bd.mult}</small>` : ''}${done ? ' <small>fertig</small>' : ''}`;
      return host
        ? `<button class="board-tab${i === st.board ? ' on' : ''}" role="tab" aria-selected="${i === st.board}" data-action="quiz:board" data-b="${i}">${label}</button>`
        : `<span class="board-tab${i === st.board ? ' on' : ''}">${label}</span>`;
    })
    .join('')}</div>`;
}

function qheadHTML(st, { question = null } = {}) {
  const q = st.q;
  if (q.stage === 'joker') {
    const type = q.type === 'choice' ? `Auswahl, ${q.nopts} Antworten` : Q.QTYPE_LABEL[q.type] || '';
    const media = q.mkind ? `<span class="qmeta-mode">${ICON[q.mkind === 'youtube' ? 'video' : q.mkind] || ''}mit ${esc(KIND_LABEL[q.mkind] || 'Medium')}</span>` : '';
    const meta = `<div class="qmeta"><span class="qmeta-cat">${esc(q.cat)}</span><span class="qmeta-val">${q.value}</span><span class="qmeta-mode">${Q.MODE_LABEL[q.mode]}</span><span class="qmeta-mode">${esc(type)}</span>${media}</div>`;
    if (question) {
      return `${meta}<p class="qtext">${esc(question.question || '')}</p><p class="muted small">Nur du siehst die Frage schon. Die anderen sehen sie, wenn die Joker-Runde vorbei ist.</p>`;
    }
    return `${meta}<p class="qtext veiled">Die Frage geht gleich auf.</p>`;
  }
  const time = q.time ? `<span class="qmeta-mode">${ICON.timer}${q.time} s</span>` : '';
  const type = q.type === 'estimate' ? '<span class="qmeta-mode">Schätzfrage</span>' : '';
  let estText = '';
  if (q.type === 'estimate' && q.est) {
    if (q.mode !== 'all' || q.est.scoring === 'range') estText = `${q.mode === 'all' ? 'Alle im Fehlerbereich gewinnen. ' : ''}${Q.tolText(q.est.tol, q.unit)}`;
    else estText = q.est.scoring === 'farthest' ? 'Die weiteste Schätzung verliert, alle anderen gewinnen.' : 'Die nächste Schätzung gewinnt.';
  }
  const est = estText ? `<p class="est-rule">${esc(estText)}</p>` : '';
  return `<div class="qmeta"><span class="qmeta-cat">${esc(q.cat)}</span><span class="qmeta-val">${q.value}</span><span class="qmeta-mode">${Q.MODE_LABEL[q.mode]}</span>${type}${time}</div>
    <p class="qtext">${esc(q.text)}</p>${est}`;
}

/** Antwortmöglichkeiten zum Ansehen (nicht zum Wählen). host: richtige markieren. */
function qoptsHTML(st, { host = false, question = null } = {}) {
  const q = st.q;
  if (q.type !== 'choice' || !q.options) return '';
  return `<ol class="qoptions readonly">${q.options
    .map((o, i) => `<li class="${host && question && Number(question.correct) === i ? 'correct' : ''}"><span class="opt-letter">${'ABCDEF'[i]}</span>${esc(o)}</li>`)
    .join('')}</ol>`;
}

/** Feste Hülle für das Medium der Frage (bleibt während der Frage gleich, damit nichts neu startet). */
function qmediaHTML(st) {
  const q = st.q;
  if (!q.media) return '';
  if (q.media.pending) return `<div class="qmedia pending"><p>${ICON[q.media.kind === 'youtube' ? 'video' : q.media.kind] || ''} ${esc(KIND_LABEL[q.media.kind] || 'Medium')} wird geladen …</p></div>`;
  return mediaHTML(q.media, { key: q.key });
}

const givenText = (q, g) =>
  !g
    ? ''
    : g.timeout
      ? 'Zeit abgelaufen'
      : g.num != null
        ? `${Q.fmtNumber(g.num)}${q.unit ? ' ' + q.unit : ''}`
        : g.choice != null
          ? `${'ABCDEF'[g.choice]}: ${(q.options || [])[g.choice] || ''}`
          : `„${g.text || ''}“`;

/** Schätzfrage aufgelöst: alle Schätzungen nach Abstand sortiert. */
function estimateListHTML(api, room, st) {
  const q = st.q;
  if (q.type !== 'estimate' || q.target == null || !q.given) return '';
  const rows = Object.entries(q.given)
    .filter(([, g]) => g && g !== true && Number.isFinite(g.num))
    .map(([uid, g]) => ({ uid, num: g.num, d: Math.abs(g.num - q.target) }))
    .sort((a, b) => a.d - b.d);
  if (!rows.length) return '';
  return `<ol class="est-list">${rows
    .map(
      (r) => `<li><span class="swatch ${colorOf(api, room, r.uid)}"></span><span>${esc(r.uid === api.uid ? 'Du' : pname(api, room, r.uid))}</span>
        <strong>${esc(Q.fmtNumber(r.num))}</strong><span class="muted small">${r.d ? `${esc(Q.fmtNumber(r.d))} daneben` : 'genau'}</span></li>`
    )
    .join('')}</ol>`;
}

function solutionHTML(api, room, st) {
  const q = st.q;
  if (q.solution == null) return '';
  return `<div class="solution-box"><p class="solution">Lösung: <strong>${esc(q.solution)}</strong></p>${estimateListHTML(api, room, st)}
    ${q.solMedia && !q.solMedia.pending ? mediaHTML(q.solMedia, { key: q.key + '-sol', native: true, label: 'zur Lösung' }) : ''}</div>`;
}

function resultsHTML(api, room, st) {
  const q = st.q;
  const res = Q.list(q.results);
  if (!res.length) return '';
  return `<ul class="results">${res
    .map(
      (r) =>
        `<li class="${r.ok ? 'ok' : 'no'}"><span class="swatch ${colorOf(api, room, r.uid)}"></span><span>${esc(r.uid === api.uid ? 'Du' : pname(api, room, r.uid))}</span>
        <span class="verdict">${r.ok ? 'richtig' : 'falsch'}</span><span class="delta ${r.delta > 0 ? 'plus' : r.delta < 0 ? 'minus' : ''}">${fmtPoints(r.delta)}</span></li>`
    )
    .join('')}</ul>`;
}

function buzzTimesHTML(api, room, st) {
  const times = st.q && st.q.buzz && st.q.buzz.times;
  if (!times) return '';
  const sorted = Object.entries(times).sort((a, b) => a[1] - b[1]);
  return `<p class="buzz-times">Reaktionszeiten: ${sorted
    .map(([uid, ms]) => `<span>${esc(uid === api.uid ? 'du' : pname(api, room, uid))} ${fmtSeconds(ms)}</span>`)
    .join('')}</p>`;
}

function historyLabel(api, room, entry) {
  const deltas = Object.entries(entry.deltas || {});
  const parts = deltas.map(([uid, d]) => `${pname(api, room, uid)} ${fmtPoints(d)}`);
  return `${entry.label || 'letzte Punkte'}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

function hostOfflineNotice(api, room) {
  if (api.isOnline(room.host)) return '';
  return `<div class="notice warn"><p><strong>${esc(hostName(api, room))}</strong> ist gerade offline. Das Spiel geht weiter, sobald ${esc(hostName(api, room))} zurück ist.</p></div>`;
}

// ---------- Bildschirme: Bibliothek & Editor ----------

const screens = {};

Object.assign(screens, studioScreens);

// ---------- Joker ----------

const jokerIcon = (j) => ({ double: '×2', skip: ICON.ban, peek: ICON.eye, fifty: '50', shield: ICON.shield, swap: ICON.swap })[j] || '';

/** Deine Joker auf dem Board. Joker-Runde: nur zum Ansehen. Board-Modus: hier einsetzen (gilt für die nächste Frage). */
function jokerBarHTML(api, room, st) {
  const me = api.uid;
  if (!Q.list(st.order).includes(me) || st.phase !== 'board') return '';
  const left = Q.jokersLeft(st, me);
  const set = (st.jokers && st.jokers.set) || {};
  const types = Q.jokerTypesFor(st).filter((j) => (set[j] || 0) > 0 || left[j] > 0);
  const armed = st.jarm;
  if (Q.jokerModeOf(st) !== 'board') {
    if (!types.length) return '';
    return `<section class="jk-panel passive"><p class="jk-panel-title">Deine Joker <span class="muted small">– einsetzen in der Joker-Runde</span></p><div class="joker-bar" role="group" aria-label="Deine Joker">${types
      .map((j) => {
        const n = left[j];
        return `<button class="joker${n ? '' : ' empty'}" data-action="quiz:joker" data-type="${j}"
          aria-label="${esc(Q.JOKERS[j].name)}: noch ${n}. Was er macht"><span class="jk-ico">${jokerIcon(j)}</span><span class="jk-name">${esc(Q.JOKERS[j].name)}</span><span class="jk-n">${n}</span></button>`;
      })
      .join('')}</div></section>`;
  }
  if (!types.length && !armed) return '';
  // Board-Modus
  let body;
  if (armed) {
    const mine = armed.uid === me;
    body = `<div class="jk-armed"><span class="jk-ico">${jokerIcon(armed.type)}</span><p>${esc(jokerLine(api, room, { ...armed, armed: true }))}</p>
      ${mine ? '<button class="btn ghost" data-action="quiz:bcancel">Zurücknehmen</button>' : ''}</div>
      ${mine ? '' : '<p class="muted small">Für die nächste Frage ist schon ein Joker eingesetzt.</p>'}`;
  } else if (P.bpending) {
    body = '<p class="muted">Dein Joker wird eingesetzt …</p>';
  } else {
    const why = (j) => (left[j] > 0 ? Q.armBlocked(st, me, j) : 'Keiner mehr übrig.');
    const ok = types.filter((j) => !why(j));
    const off = types.filter((j) => why(j));
    const sel = P.bsel && ok.includes(P.bsel.type) ? P.bsel : null;
    const buttons = ok
      .map((j) => `<button class="joker ready${sel && sel.type === j ? ' on' : ''}" data-action="quiz:bsel" data-type="${j}" aria-pressed="${!!(sel && sel.type === j)}"><span class="jk-ico">${jokerIcon(j)}</span><span class="jk-name">${esc(Q.JOKERS[j].name)}</span><span class="jk-n">${left[j]}</span></button>`)
      .join('');
    let detail = '';
    if (sel) {
      const targets =
        sel.type === 'skip'
          ? `<div class="chips">${Q.list(st.order)
              .filter((u) => u !== me)
              .map((u) => `<button class="chip toggle-chip" type="button" data-action="quiz:btarget" data-uid="${esc(u)}" aria-pressed="${sel.target === u}"><span class="swatch ${colorOf(api, room, u)}"></span>${esc(pname(api, room, u))}</button>`)
              .join('')}</div>`
          : '';
      const ready = !Q.armBlocked(st, me, sel.type, sel.type === 'skip' ? sel.target || '' : null);
      detail = `<div class="jk-detail"><p>${esc(Q.JOKERS[sel.type].help)}</p>${sel.type === 'skip' ? '<span class="field-label">Wer soll aussetzen?</span>' : ''}${targets}
        <div class="row-wrap"><button class="btn primary" data-action="quiz:barm" ${ready ? '' : 'disabled'}>Für die nächste Frage einsetzen</button><button class="btn ghost" data-action="quiz:bsel" data-type="${sel.type}">Abbrechen</button></div></div>`;
    }
    body = `${ok.length ? `<div class="joker-bar" role="group" aria-label="Deine Joker">${buttons}</div>` : '<p class="muted small">Gerade kannst du keinen Joker einsetzen.</p>'}${detail}
      ${off.length ? `<p class="muted small jk-off">Gerade nicht verfügbar: ${off.map((j) => `${esc(Q.JOKERS[j].name)} (${esc(why(j))})`).join(', ')}</p>` : ''}`;
  }
  return `<section class="jk-panel" aria-label="Deine Joker"><p class="jk-panel-title">Deine Joker <span class="muted small">– gelten für die nächste Frage, pro Frage einer</span></p>${body}</section>`;
}

function jokerLine(api, room, e) {
  const me = e.uid === api.uid;
  const who = me ? 'Du' : pname(api, room, e.uid);
  const tgt = e.target === api.uid ? 'dich' : e.target ? pname(api, room, e.target) : 'jemanden';
  const name = Q.isJoker(e.type) ? Q.JOKERS[e.type].name : 'Joker';
  if (e.back === 'host') return me ? `Du bekommst deinen Joker ${name} zurück.` : `${who} bekommt den Joker ${name} zurück.`;
  if (e.back) return me ? `Dein Joker ${name} passt nicht zu dieser Frage – du bekommst ihn zurück.` : `Der Joker ${name} von ${who} passt nicht zu dieser Frage – zurückgegeben.`;
  if (e.cancel) return me ? `Du nimmst deinen Joker ${name} zurück.` : `${who} nimmt den Joker ${name} zurück.`;
  const frage = e.armed ? 'die nächste Frage' : 'diese Frage';
  const bei = e.armed ? 'bei der nächsten Frage' : 'bei dieser Frage';
  if (e.by === 'host') {
    const h = room ? hostName(api, room) : 'Der Host';
    return `${h} setzt ${name} für ${me ? 'dich' : who} ein${e.type === 'skip' ? ` (${tgt} setzt aus)` : ''}${e.armed ? ' – gilt für die nächste Frage' : ''}.`;
  }
  switch (e.type) {
    case 'double':
      return me ? `Du spielst ${frage} doppelt.` : `${who} spielt ${frage} doppelt.`;
    case 'skip':
      return `${who} lässt ${tgt} ${bei} aussetzen.`;
    case 'peek':
      return me ? `Du spickst ${bei}.` : `${who} spickt ${bei}.`;
    case 'fifty':
      return me ? `Du nimmst 50:50${e.armed ? ' für die nächste Frage' : ''}.` : `${who} nimmt 50:50${e.armed ? ' für die nächste Frage' : ''}.`;
    case 'shield':
      return me ? `Du hebst den Schutzschild${e.armed ? ' für die nächste Frage' : ''}.` : `${who} hebt den Schutzschild${e.armed ? ' für die nächste Frage' : ''}.`;
    case 'swap':
      return me ? 'Du tauschst das Feld – wähl ein anderes.' : `${who} tauscht das Feld.`;
    default:
      return '';
  }
}

const JLOG_MS = 6000;
function jlogHTML(api, room, st) {
  const last = Q.list(st.jlog).slice(-1)[0];
  if (!last || api.b.now() - last.at > JLOG_MS) return '';
  return `<div class="joker-news" role="status"><span class="jk-ico">${jokerIcon(last.type)}</span><p>${esc(jokerLine(api, room, last))}</p></div>`;
}

const JOKER_WHEN = 'Einsetzen kannst du Joker in der Joker-Runde: Sobald ein Feld gewählt ist und bevor die Frage aufgeht, siehst du deine Joker zur Auswahl. Pro Frage geht nur einer – wer zuerst einsetzt, bekommt ihn.';

function openJokerSheet(api, type) {
  const room = roomOf(api);
  const st = room && room.st;
  const j = Q.JOKERS[type];
  if (!st || !j) return;
  const n = Q.jokersLeft(st, api.uid)[type];
  openSheet({
    title: j.name,
    body: `<p class="lead">${esc(j.help)}</p><p class="muted">Du hast noch ${n}.</p>
      <div class="notice"><p>${esc(JOKER_WHEN)}</p></div>
      <div class="sheet-actions"><button class="btn primary" data-sa="close">Verstanden</button></div>`,
  });
}

/** Auswahl in der Joker-Runde: Karten antippen, einsetzen oder ohne Joker weiter. */
function jokerRoundHTML(api, room, st) {
  const q = st.q;
  const me = api.uid;
  const round = roundOf(q);
  const head = `<p class="stage-title">Joker-Runde <span class="jr-time">noch <span class="countdown" data-until="${q.jokerUntil}"></span> s</span></p>`;
  const tile = `<strong>${esc(q.cat)} für ${q.value}</strong>`;
  if (q.joker) {
    const j = q.joker;
    return `<div class="stage-box jr-done"><p class="stage-title"><span class="jk-ico">${jokerIcon(j.type)}</span>${esc(jokerLine(api, room, j))}</p>
      <p class="muted small">${j.uid === me ? 'Dein Joker gilt für diese Frage.' : 'Für diese Frage ist schon ein Joker eingesetzt.'} Gleich geht die Frage auf.</p></div>`;
  }
  if (!Q.list(st.order).includes(me)) return `<div class="stage-box">${head}<p class="muted small">Die anderen können jetzt einen Joker einsetzen.</p></div>`;
  if (P.jpassed[round] || (q.jpass && q.jpass[me])) return `<div class="stage-box">${head}<p class="muted">Du spielst diese Frage ohne Joker. Gleich geht sie auf.</p></div>`;
  if (P.jusing === round) return `<div class="stage-box">${head}<p class="muted">Dein Joker wird eingesetzt …</p></div>`;
  const left = Q.jokersLeft(st, me);
  const set = (st.jokers && st.jokers.set) || {};
  const types = Q.JOKER_IDS.filter((j) => left[j] > 0 || (set[j] || 0) > 0);
  if (!Q.usableJokers(st, me).length) {
    const why = Q.JOKER_IDS.some((j) => left[j] > 0) ? 'Deine Joker passen nicht zu dieser Frage.' : 'Du hast keine Joker mehr.';
    return `<div class="stage-box">${head}<p class="muted">${why} Gleich geht die Frage auf.</p></div>`;
  }
  const sel = P.jsel && P.jsel.round === round ? P.jsel : null;
  const why = (j) => (left[j] > 0 ? Q.jokerBlocked(st, me, j) : 'Keiner mehr übrig.');
  const cards = types
    .filter((j) => !why(j))
    .map((j) => {
      const on = sel && sel.type === j;
      return `<li><button class="jr-card${on ? ' on' : ''}" data-action="quiz:jsel" data-type="${j}" aria-pressed="${!!on}">
        <span class="jk-ico">${jokerIcon(j)}</span><span class="jr-name">${esc(Q.JOKERS[j].name)}</span><span class="jr-n">${left[j]}×</span>
        <span class="jr-help">${esc(Q.JOKERS[j].help)}</span></button></li>`;
    })
    .join('');
  const off = types.filter((j) => why(j));
  const offHTML = off.length
    ? `<details class="jr-off"><summary>Passen hier nicht: ${off.map((j) => esc(Q.JOKERS[j].name)).join(', ')}</summary>
        <ul>${off.map((j) => `<li data-off="${j}"><strong>${esc(Q.JOKERS[j].name)}</strong> – ${esc(why(j))}</li>`).join('')}</ul></details>`
    : '';
  let targets = '';
  if (sel && sel.type === 'skip') {
    targets = `<div class="stack-tight"><span class="field-label">Wer soll aussetzen?</span><div class="chips">${Q.list(st.order)
      .filter((u) => u !== me)
      .map((u) => {
        const blocked = Q.jokerBlocked(st, me, 'skip', u);
        const on = sel.target === u;
        return `<button class="chip toggle-chip" type="button" data-action="quiz:jtarget" data-uid="${esc(u)}" aria-pressed="${on}" ${blocked ? `disabled title="${esc(blocked)}"` : ''}><span class="swatch ${colorOf(api, room, u)}"></span>${esc(pname(api, room, u))}</button>`;
      })
      .join('')}</div></div>`;
  }
  const ready = !!sel && !Q.jokerBlocked(st, me, sel.type, sel.type === 'skip' ? sel.target || '' : null);
  return `<div class="stage-box mine jr">${head}
    <p class="jr-lead">${tile}: Willst du einen Joker einsetzen? Pro Frage geht nur einer – wer zuerst einsetzt, bekommt ihn.</p>
    <ul class="jr-grid" aria-label="Deine Joker">${cards}</ul>${targets}${offHTML}
    <div class="row-wrap"><button class="btn primary" data-action="quiz:juse" ${ready ? '' : 'disabled'}>${sel ? `${esc(Q.JOKERS[sel.type].name)} einsetzen` : 'Joker einsetzen'}</button>
      <button class="btn ghost" data-action="quiz:jpass">Ohne Joker weiter</button></div></div>`;
}

function sendJoker(api) {
  const room = roomOf(api);
  const q = room && room.st && room.st.q;
  const sel = P.jsel;
  if (!q || q.stage !== 'joker' || !sel || sel.round !== roundOf(q)) return;
  const id = makeId();
  P.jokerSent = id;
  P.jusing = sel.round;
  api.b.sendInput(api.roomId, 'joker', { id, type: sel.type, target: sel.target || null, key: q.key }).catch(() => {
    P.jusing = null;
    toast('Der Joker konnte nicht gesendet werden.');
    api.render();
  });
  api.renderNow();
}

function passJokerRound(api) {
  const room = roomOf(api);
  const q = room && room.st && room.st.q;
  if (!q || q.stage !== 'joker') return;
  P.jpassed[roundOf(q)] = true;
  api.b.sendInput(api.roomId, 'joker', { id: makeId(), pass: true, key: q.key }).catch(() => {});
  api.renderNow();
}

function jokerSetHTML(st) {
  const set = (st.jokers && st.jokers.set) || {};
  const mode = Q.jokerModeOf(st);
  const seg = (m) =>
    `<button class="seg${mode === m ? ' on' : ''}" data-action="quiz:jmode" data-mode="${m}" aria-pressed="${mode === m}">${esc(Q.JOKER_MODES[m].name)}</button>`;
  return `<div class="stack-tight"><span class="field-label">Wann Joker eingesetzt werden</span>
      <div class="segmented">${seg('round')}${seg('board')}</div><p class="hint">${esc(Q.JOKER_MODES[mode].help)} Pro Frage geht nur ein Joker – wer zuerst kommt.</p></div>
    <ul class="joker-set">${Q.JOKER_IDS.map((j) => {
      const off = !Q.jokerTypesFor(st).includes(j);
      return `<li class="${off ? 'off' : ''}"><span class="jk-ico">${jokerIcon(j)}</span><div class="jk-text"><strong>${esc(Q.JOKERS[j].name)}</strong><span class="muted small">${esc(off ? 'Gibt es nur mit Joker-Runde.' : Q.JOKERS[j].help)}</span></div>
      <div class="stepper"><button class="icon-btn small" data-action="quiz:jset" data-type="${j}" data-d="-1" ${set[j] > 0 ? '' : 'disabled'} aria-label="${esc(Q.JOKERS[j].name)}: einen weniger">${ICON.minus}</button>
        <output>${set[j] || 0}</output>
        <button class="icon-btn small" data-action="quiz:jset" data-type="${j}" data-d="1" ${(set[j] || 0) >= 3 || off ? 'disabled' : ''} aria-label="${esc(Q.JOKERS[j].name)}: einen mehr">${ICON.plus}</button></div></li>`;
    }).join('')}</ul>`;
}

function jokerSummary(st) {
  const set = (st.jokers && st.jokers.set) || {};
  const parts = Q.JOKER_IDS.filter((j) => set[j] > 0).map((j) => `${set[j]}× ${Q.JOKERS[j].name}`);
  return parts.length ? `Joker für jede Person: ${parts.join(', ')}` : '';
}

function mediaProgressHTML() {
  const m = H.media;
  if (!m || !m.total) return '';
  const miss = (m.missing || []).length;
  if (miss && !m.busy) {
    return `<div class="notice warn"><p>${miss === 1 ? 'Eine Mediendatei fehlt' : `${miss} Mediendateien fehlen`} auf diesem Gerät (vielleicht wurde der Browser-Speicher geleert). Diese Fragen gehen ohne Bild, Video oder Ton auf. Importier das Quiz neu aus deiner Sicherung, um sie zurückzuholen.</p></div>`;
  }
  const text = m.busy ? `Bilder, Videos und Töne für die anderen vorbereiten: ${m.ready} von ${m.total} …` : `Alle ${m.total} Mediendateien sind für die anderen bereit.`;
  return `<div class="notice${m.error ? ' warn' : ''}"><p>${esc(text)}${m.error ? ` ${esc(m.error)}` : ''}</p></div>`;
}

// ---------- Bildschirme: Host ----------

function playerRowsHost(api, room, st) {
  const order = Q.list(st.order);
  if (!order.length) return '<li class="empty-note">Noch niemand da. Deine Freunde sehen den Raum auf ihrer Startseite.</li>';
  return order
    .map((uid, i) => {
      const turn = uid === st.turn && st.phase !== 'lobby';
      const rtt = api.rttOf(uid);
      const status = api.isOnline(uid) ? `<span class="dot on"></span>${rtt != null ? `${rtt} ms` : 'online'}` : '<span class="dot"></span>offline';
      const jl = Q.jokersInGame(st) && st.phase !== 'lobby' ? Object.values(Q.jokersLeft(st, uid)).reduce((a, b) => a + b, 0) : null;
      return `<li><button class="host-player${turn ? ' turn' : ''}" data-action="quiz:player" data-uid="${esc(uid)}">
        <span class="hp-num">${i + 1}</span><span class="swatch ${colorOf(api, room, uid)}"></span>
        <span class="hp-name">${esc(pname(api, room, uid))}${turn ? ' <span class="tag">dran</span>' : ''}${fxTags(st, uid)}${jl != null ? ` <span class="jk-count">${jl} Joker</span>` : ''}</span>
        <span class="hp-status">${status}</span><span class="hp-score">${(st.scores || {})[uid] || 0}</span></button></li>`;
    })
    .join('');
}

function hostNotice(api) {
  if (LOCK.blocked === api.roomId) {
    return '<div class="notice warn"><p>Du moderierst diesen Raum schon in einem anderen Fenster. Mach dort weiter. Schließt du das andere Fenster, übernimmt dieses hier nach ein paar Sekunden.</p></div>';
  }
  if (H.roomId === api.roomId && !H.quiz) {
    return '<div class="notice warn"><p>Das Quiz zu diesem Raum liegt nicht auf diesem Gerät. Öffne den Raum dort, wo du das Quiz gespeichert hast.</p></div>';
  }
  return '';
}

function rulesHTML(st) {
  const r = st.rules || Q.DEFAULT_RULES;
  const seg = (rule, value, label) =>
    `<button class="seg${r[rule] === value ? ' on' : ''}" data-action="quiz:rule" data-rule="${rule}" data-value="${value}" aria-pressed="${r[rule] === value}">${label}</button>`;
  const sw = (rule, label) =>
    `<div class="toggle"><span>${label}</span><button class="switch" role="switch" aria-checked="${!!r[rule]}" data-action="quiz:rule" data-rule="${rule}" data-value="${!r[rule]}" aria-label="${label}"></button></div>`;
  const aw = (value, label) =>
    `<button class="seg${(st.afterWrong || 'buzzer') === value ? ' on' : ''}" data-action="quiz:after-wrong" data-value="${value}" aria-pressed="${(st.afterWrong || 'buzzer') === value}">${label}</button>`;
  return `<div class="stack-tight"><span class="field-label">Nach falscher Antwort (Reihum-Fragen)</span>
      <div class="segmented">${aw('buzzer', 'Buzzer für alle')}${aw('next', 'Nächste Person')}${aw('none', 'Frage ist weg')}</div></div>
    <div class="stack-tight"><span class="field-label">Falsche Antwort kostet Punkte</span>
      <div class="segmented">${seg('penalty', 'none', 'Nein')}${seg('penalty', 'half', 'Hälfte')}${seg('penalty', 'full', 'Voller Wert')}</div></div>
    ${sw('negative', 'Minuspunkte erlaubt')}
    ${sw('stealHalf', 'Wegschnappen bringt nur die Hälfte')}
    ${sw('winnerPicks', 'Wer richtig antwortet, wählt die nächste Frage')}
    ${sw('earlyLock', 'Frühstarter am Buzzer kurz sperren')}
    <div class="stack-tight"><span class="field-label">Antwortzeit</span>
      <div class="segmented">${[0, 10, 20, 30].map((s) => seg('answerTime', s, s ? `${s} s` : 'Aus')).join('')}</div></div>`;
}

screens['quiz:hostLobby'] = {
  key: (api) => api.roomId,
  mount(el, api) {
    const room = roomOf(api);
    el.innerHTML = `${api.topbar({ tape: room.title || NAME })}<main class="screen">
      <div class="stack-tight"><h1>Dein Raum ist offen</h1>
        <p class="muted">Deine Freunde sehen ihn auf der Startseite unter ${NAME} und können beitreten. Du moderierst, und die Lösungen siehst nur du.</p></div>
      <div data-slot="missing"></div>
      <section class="section"><div class="row space"><h2 class="section-title" data-slot="count"></h2>
        <button class="btn ghost" data-action="quiz:shuffle">Reihenfolge mischen</button></div>
        <ol class="host-players" data-slot="players"></ol></section>
      <section class="section panel"><h2 class="section-title">Regeln</h2><div class="stack" data-slot="rules"></div>
        <p class="hint">Alle Zusatzregeln sind aus, bis du sie einschaltest. Du kannst sie auch mitten im Spiel ändern.</p></section>
      <section class="section panel"><h2 class="section-title">Joker</h2><div data-slot="jokers"></div>
        <p class="hint">Die Zahl ist, wie viele jede Person bekommt – am Anfang alle 0. Im Spiel kannst du einzelnen Leuten Joker geben, nehmen, für sie einsetzen oder zurückgeben (auf die Person tippen).</p></section>
      <div data-slot="media"></div>
      <button class="btn primary big" data-action="quiz:start" data-slot="start">Spiel starten</button>
      <div class="row-wrap"><button class="btn ghost danger" data-action="quiz:close">Raum schließen</button></div></main>`;
  },
  update(el, api) {
    const room = roomOf(api);
    const st = stOf(api, room);
    const n = Q.list(st.order).length;
    setHTML(slot(el, 'missing'), hostNotice(api));
    slot(el, 'count').textContent = `Spielende (${n})`;
    setHTML(slot(el, 'players'), playerRowsHost(api, room, st));
    setHTML(slot(el, 'rules'), rulesHTML(st));
    setHTML(slot(el, 'jokers'), jokerSetHTML(st));
    setHTML(slot(el, 'media'), mediaProgressHTML());
    slot(el, 'start').disabled = !n || !H.quiz;
  },
};

function timerCtl(st) {
  const q = st.q;
  if (q.deadline) {
    return `<button class="btn ghost" data-action="quiz:timer" data-op="add">${ICON.timer} +10 s</button><button class="btn ghost" data-action="quiz:timer" data-op="stop">Timer aus</button>`;
  }
  return `<button class="btn ghost" data-action="quiz:timer" data-op="restart">${ICON.timer} Timer (${q.time || st.rules.answerTime || 30} s)</button>`;
}

/** Host: welcher Joker gerade gilt (oder für die nächste Frage eingesetzt ist) – mit Zurückgeben. */
function hostJokerNote(api, room, st) {
  const a = Q.activeJoker(st);
  if (!a || (st.phase === 'question' && st.q.stage === 'joker')) return '';
  const line = jokerLine(api, room, { ...a, armed: a.when === 'next' });
  return `<div class="jk-armed host"><span class="jk-ico">${jokerIcon(a.type)}</span><p>${esc(line)}</p>
    <button class="btn ghost" data-action="quiz:jreturn">Joker zurückgeben</button></div>`;
}

function hostSolutionBox(st) {
  const question = questionOf(st);
  if (!question) return '<div class="notice warn"><p>Die Lösung ist auf diesem Gerät nicht gespeichert.</p></div>';
  const extra = [];
  if (question.type === 'text' && (question.accept || []).length) extra.push(`<small>Auch richtig: ${esc(question.accept.join(', '))}</small>`);
  if (question.type === 'estimate') {
    const q = st.q;
    const scoring = q && q.mode === 'all' && q.est && q.est.scoring !== 'range' ? q.est.scoring : null;
    extra.push(`<small>${esc(scoring ? (scoring === 'farthest' ? 'Die weiteste Schätzung verliert.' : 'Die nächste Schätzung gewinnt.') : Q.tolText(question.tolerance, question.unit))}</small>`);
  }
  if (question.note) extra.push(`<small>Notiz: ${esc(question.note)}</small>`);
  return `<div class="host-solution"><span>Lösung (nur du)</span><strong>${esc(solutionText(question))}</strong>${extra.join('')}</div>`;
}

function mediaControlsHTML(api, st) {
  const q = st.q;
  const m = q.media;
  if (!m) return '';
  if (m.pending) return '<p class="muted small">Die Datei wird noch hochgeladen. Sie erscheint bei allen, sobald sie da ist.</p>';
  const r = readyCount(api, st);
  if (m.kind === 'image') return `<p class="muted small">Bild geladen bei ${r.ready} von ${r.total}.</p>`;
  const playing = q.play && q.play.state === 'play';
  return `<div class="media-ctl">
    <button class="btn secondary" data-action="quiz:media" data-op="${playing ? 'pause' : 'play'}">${playing ? `${ICON.pause} Pause` : `${ICON.play} ${q.play ? 'Weiter' : 'Abspielen'}`}</button>
    <button class="btn ghost" data-action="quiz:media" data-op="restart">${ICON.restart} Von vorn</button>
    <span class="muted small">Bereit: ${r.ready} von ${r.total}${!q.play && m.autoplay ? '. Startet von selbst, sobald alle bereit sind.' : ''}</span></div>`;
}

function hostStageHTML(api, room, st) {
  const q = st.q;
  const question = questionOf(st);
  const who = (uid) => esc(pname(api, room, uid));
  const skip = '<button class="btn ghost" data-action="quiz:skip">Niemand weiß es</button>';
  const putBack = Q.list(q.results).length ? '' : '<button class="btn ghost" data-action="quiz:put-back">Frage zurücklegen</button>';
  if (q.stage === 'joker') {
    const j = q.joker;
    const status = (uid) => {
      if (j && j.uid === uid) return `<strong>${esc(jokerLine(api, room, j))}</strong>`;
      if (!api.isOnline(uid)) return 'offline';
      if (q.jpass && q.jpass[uid]) return 'ohne Joker';
      if (j) return '';
      return Q.usableJokers(st, uid).length ? 'überlegt …' : 'kein passender Joker';
    };
    return `<div class="stage-box"><p class="stage-title">${
      j ? `<span class="jk-ico">${jokerIcon(j.type)}</span>${who(j.uid)} setzt ${esc(Q.JOKERS[j.type].name)} ein` : `Joker-Runde <span class="jr-time">noch <span class="countdown" data-until="${q.jokerUntil}"></span> s</span>`
    }</p>
      <p class="muted small">${
        j ? 'Pro Frage geht nur ein Joker. Gleich geht die Frage für alle auf.' : 'Alle sehen Kategorie und Wert, aber noch nicht die Frage. Wer zuerst einen Joker einsetzt, bekommt ihn – pro Frage geht nur einer.'
      }</p>
      <ul class="buzz-live jr-status">${Q.list(st.order)
        .map((uid) => `<li><span class="swatch ${colorOf(api, room, uid)}"></span>${who(uid)}<span>${status(uid)}</span></li>`)
        .join('')}</ul>
      <div class="row-wrap"><button class="btn primary" data-action="quiz:open-question">Frage jetzt aufdecken</button>${j ? '<button class="btn ghost" data-action="quiz:jreturn">Joker zurückgeben</button>' : '<button class="btn ghost" data-action="quiz:joker-more">+10 s</button>'}${putBack}</div></div>`;
  }
  if (q.stage === 'answer') {
    return `<div class="stage-box"><p class="stage-title"><span class="swatch ${colorOf(api, room, q.answering)}"></span>${who(q.answering)} antwortet${
      q.deadline ? ` <span class="countdown" data-until="${q.deadline}"></span>` : ''
    }</p>${buzzTimesHTML(api, room, st)}
      <p class="muted small">Kommt die Antwort im Discord, entscheide direkt. Tippt ${who(q.answering)} sie ein, siehst du gleich einen Vorschlag.</p>
      <div class="judge-row"><button class="btn judge ok" data-action="quiz:quick" data-ok="1">${ICON.check} Richtig</button>
        <button class="btn judge no" data-action="quiz:quick" data-ok="0">${ICON.cross} Falsch</button></div>
      <div class="row-wrap">${timerCtl(st)}${skip}${putBack}</div></div>`;
  }
  if (q.stage === 'buzz') {
    const round = `${q.key}:${q.buzz.id}`;
    const arrivals = [...H.arrivals.values()].filter((a) => a.round === round).sort((a, b) => a.reaction - b.reaction);
    const waiting = q.buzz.openAt > api.b.now();
    const waitsForMedia = q.media && Q.PLAYABLE.includes(q.media.kind) && !q.play;
    return `<div class="stage-box"><p class="stage-title">${
      waiting
        ? waitsForMedia
          ? 'Buzzer öffnet, sobald abgespielt wird'
          : `Buzzer öffnet in <span class="countdown" data-until="${q.buzz.openAt}"></span> s`
        : 'Buzzer ist offen'
    }</p>
      <p class="muted small">Ausgleich für langsames Internet: ${q.buzz.window} ms. Es gewinnt die schnellste Reaktion, nicht die schnellste Leitung.</p>
      ${arrivals.length ? `<ul class="buzz-live">${arrivals.map((a) => `<li><span class="swatch ${colorOf(api, room, a.uid)}"></span>${who(a.uid)}<span>${fmtSeconds(a.reaction)}</span></li>`).join('')}</ul>` : ''}
      <div class="row-wrap">${waiting ? '<button class="btn secondary" data-action="quiz:open-now">Jetzt öffnen</button>' : ''}${skip}${putBack}</div></div>`;
  }
  if (q.stage === 'all') {
    const order = Q.list(st.order);
    const given = q.given || {};
    return `<div class="stage-box"><p class="stage-title">Alle antworten${q.deadline ? ` <span class="countdown" data-until="${q.deadline}"></span>` : ''}</p>
      <p class="muted small">${order.filter((u) => given[u]).length} von ${order.filter((u) => !Q.sitsOut(st, u)).length} haben abgegeben.</p>
      <div class="row-wrap"><button class="btn primary" data-action="quiz:to-review">Jetzt auswerten</button>${timerCtl(st)}${skip}${putBack}</div></div>`;
  }
  if (q.stage === 'review') {
    const rows = reviewRows(api, st);
    const given = (row) => {
      if (!row.given) return '<em>keine Eingabe</em>';
      if (row.given.timeout) return '<em>Zeit abgelaufen</em>';
      return esc(givenText(q, row.given));
    };
    return `<div class="stage-box"><p class="stage-title">Vorschlag – du entscheidest</p>
      <ul class="review">${rows
        .map(
          (row) => `<li class="review-row ${row.ok === true ? 'ok' : row.ok === false ? 'no' : 'open'}">
          <div class="review-who"><span class="review-name"><span class="swatch ${colorOf(api, room, row.uid)}"></span><strong>${who(row.uid)}</strong></span><span class="review-given">${given(row)}</span>
            <span class="muted small">${row.auto === true ? 'App meint: richtig' : row.auto === false ? 'App meint: falsch' : 'App kann es nicht prüfen'}${row.reason ? ` – ${esc(row.reason)}` : ''}</span></div>
          <div class="review-actions">
            <button class="mini ok${row.ok === true ? ' on' : ''}" data-action="quiz:verdict" data-uid="${esc(row.uid)}" data-ok="1" aria-label="richtig">${ICON.check}</button>
            <button class="mini no${row.ok === false ? ' on' : ''}" data-action="quiz:verdict" data-uid="${esc(row.uid)}" data-ok="0" aria-label="falsch">${ICON.cross}</button>
            <button class="delta-btn ${row.delta > 0 ? 'plus' : row.delta < 0 ? 'minus' : ''}" data-action="quiz:custom" data-uid="${esc(row.uid)}" title="Punkte selbst festlegen">${fmtPoints(row.delta)}${row.custom ? '*' : ''}</button>
          </div></li>`
        )
        .join('')}</ul>
      <div class="row-wrap"><button class="btn primary" data-action="quiz:apply">Übernehmen</button>${skip}</div></div>`;
  }
  if (q.stage === 'closed') {
    const res = resultsHTML(api, room, st);
    return `<div class="stage-box"><p class="stage-title">${q.winner ? `${who(q.winner)} hat die Frage` : 'Niemand hat die Frage'}</p>${res}
      ${solutionHTML(api, room, st)}
      <div class="row-wrap">${q.solution == null ? `<button class="btn secondary" data-action="quiz:solution">Lösung allen zeigen</button>` : ''}
        <button class="btn primary" data-action="quiz:back">Zurück zum Board</button></div></div>`;
  }
  return '';
}

screens['quiz:hostGame'] = {
  key: (api) => api.roomId,
  mount(el, api) {
    const room = roomOf(api);
    el.innerHTML = `${api.topbar({ tape: room.title || NAME })}<main class="screen host">
      <div data-slot="notice"></div>
      <div data-slot="jlog"></div>
      <div class="host-grid">
        <section class="host-main">
          <div data-slot="board"></div>
          <section class="qcard host" data-slot="qcard" hidden>
            <div data-slot="qhead"></div><div data-slot="qmedia"></div><div data-slot="mctl"></div><div data-slot="qopts"></div><div data-slot="qsol"></div>
          </section>
          <div data-slot="stage"></div>
        </section>
        <aside class="host-side">
          <section class="panel"><div class="row space"><h2 class="section-title">Punkte und Reihenfolge</h2></div>
            <ol class="host-players" data-slot="players"></ol>
            <p class="hint">Tippe auf eine Person, um Punkte oder Joker zu ändern, sie dranzunehmen oder die Reihenfolge zu ändern.</p>
            <div class="row-wrap" data-slot="undo"></div></section>
          <details class="panel" data-slot="rules-wrap"><summary class="section-title">Regeln</summary><div class="stack" data-slot="rules"></div></details>
          <section class="panel row-wrap">
            <button class="btn ghost" data-action="quiz:end">Spiel beenden</button>
            <button class="btn ghost danger" data-action="quiz:close">Raum schließen</button></section>
        </aside></div></main>`;
    window.__quizHostApi = api;
  },
  unmount() {
    window.__quizHostApi = null;
  },
  update(el, api) {
    const room = roomOf(api);
    const st = stOf(api, room);
    const inQ = st.phase === 'question' && !!st.q;
    let board = '';
    if (!inQ) {
      const turnName = st.turn ? esc(pname(api, room, st.turn)) : '';
      const done = Q.boardDone(st);
      const nextBoard = st.board + 1 < st.boards.length;
      board = `${boardTabs(st, { host: true })}${hostJokerNote(api, room, st)}
        <p class="board-hint">${turnName ? `<span class="swatch ${colorOf(api, room, st.turn)}"></span><strong>${turnName}</strong> ist dran und wählt eine Frage – oder du tippst für ${turnName} auf ein Feld.` : 'Tippe auf ein Feld.'}</p>
        ${boardHTML(api, room, st, { mode: 'host' })}
        ${done ? `<div class="notice"><p>Dieses Board ist durch.</p><div class="row-wrap">${nextBoard ? '<button class="btn primary" data-action="quiz:next-board">Nächstes Board</button>' : ''}<button class="btn secondary" data-action="quiz:end">Spiel beenden</button></div></div>` : ''}`;
    }
    setHTML(slot(el, 'notice'), hostNotice(api) + (H.media && (H.media.busy || H.media.error || (H.media.missing || []).length) ? mediaProgressHTML() : ''));
    setHTML(slot(el, 'jlog'), jlogHTML(api, room, st));
    setHTML(slot(el, 'board'), board);
    slot(el, 'qcard').hidden = !inQ;
    const question = inQ ? questionOf(st) : null;
    const veiled = inQ && Q.inJokerRound(st);
    setHTML(slot(el, 'qhead'), inQ ? qheadHTML(st, { question: veiled ? question : null }) : '');
    setHTML(slot(el, 'qmedia'), inQ ? qmediaHTML(st) : '');
    setHTML(slot(el, 'mctl'), inQ ? mediaControlsHTML(api, st) : '');
    const optsSt = veiled && question && question.type === 'choice' ? { ...st, q: { ...st.q, options: (question.options || []).map(String) } } : st;
    setHTML(slot(el, 'qopts'), inQ ? qoptsHTML(optsSt, { host: true, question }) : '');
    setHTML(slot(el, 'qsol'), inQ ? hostSolutionBox(st) : '');
    setHTML(slot(el, 'stage'), inQ ? hostJokerNote(api, room, st) + hostStageHTML(api, room, st) : '');
    setHTML(slot(el, 'players'), playerRowsHost(api, room, st));
    const last = Q.list(st.history).slice(-1)[0];
    setHTML(slot(el, 'undo'), last ? `<button class="btn ghost" data-action="quiz:undo">Rückgängig: ${esc(historyLabel(api, room, last))}</button>` : '');
    setHTML(slot(el, 'rules'), rulesHTML(st));
  },
};

// ---------- Bildschirme: Spielende ----------

screens['quiz:lobby'] = {
  key: (api) => api.roomId,
  mount(el, api) {
    const room = roomOf(api);
    el.innerHTML = `${api.topbar({ tape: room.title || NAME })}<main class="screen">
      <div class="stack-tight"><h1>${esc(room.title || NAME)}</h1><p class="muted" data-slot="sub"></p></div>
      <div data-slot="banner"></div>
      <section class="section"><h2 class="section-title" data-slot="count"></h2><ul class="people" data-slot="players"></ul></section>
      <section class="section panel"><h2 class="section-title">Regeln in diesem Spiel</h2><ul class="rule-list" data-slot="rules"></ul></section>
      <div class="notice"><p data-slot="ping"></p></div>
      <p class="lead">Warte, bis das Spiel startet.</p>
      <div class="row-wrap"><button class="btn ghost" data-action="quiz:leave">Raum verlassen</button></div></main>`;
  },
  update(el, api) {
    const room = roomOf(api);
    const st = room.st;
    slot(el, 'sub').textContent = `${hostName(api, room)} moderiert.`;
    setHTML(slot(el, 'banner'), hostOfflineNotice(api, room));
    const order = Q.list(st.order).length ? Q.list(st.order) : Object.keys(room.players || {});
    slot(el, 'count').textContent = `Dabei (${order.length})`;
    setHTML(
      slot(el, 'players'),
      order.map((u) => api.personRow(u, { meta: api.onlineMeta(u, { ping: true }), color: colorOf(api, room, u), name: pname(api, room, u) })).join('')
    );
    const jk = jokerSummary(st);
    const jkWhen = !jk ? [] : Q.jokerModeOf(st) === 'board'
      ? ['Joker setzt ihr auf dem Board ein – sie gelten für die nächste Frage. Pro Frage geht nur einer, wer zuerst kommt. Passt er nicht zur Frage, bekommt ihr ihn zurück.']
      : ['Joker setzt ihr nach der Feldwahl ein, bevor die Frage aufgeht. Pro Frage geht nur einer – wer zuerst kommt.'];
    setHTML(slot(el, 'rules'), [...activeRules(st), ...(jk ? [jk] : []), ...jkWhen].map((t) => `<li>${esc(t)}</li>`).join(''));
    const rtt = api.rttOf(api.uid);
    slot(el, 'ping').textContent = `Dein Ping: ${rtt != null ? rtt + ' ms' : 'wird gemessen …'}. Beim Buzzer zählt nur deine Reaktionszeit – langsames Internet wird ausgeglichen.`;
  },
};

function playerInteraction(api, room, st) {
  const q = st.q;
  const me = api.uid;
  const inGame = Q.list(st.order).includes(me);
  const who = (uid) => (uid === me ? 'Du' : esc(pname(api, room, uid)));
  const sentKey = `${q.key}:${q.attempt}`;
  const hd = P.hostData && P.hostData.key === q.key ? P.hostData : null;
  const peekBox = () => {
    if (!(st.fx && st.fx.peek && st.fx.peek[me]) || q.stage !== 'all') return '';
    const data = (hd && hd.peek) || {};
    const others = Q.list(st.order).filter((u) => u !== me && !Q.sitsOut(st, u));
    const val = (g) => (!g || g.none ? '<em>noch nichts</em>' : g.raw ? esc(g.text) : esc(givenText(q, g)));
    return `<div class="peek-box"><p class="peek-title">${ICON.eye} Spicken: Das geben die anderen gerade ein – live</p>
      <ul class="peek-list">${others
        .map((u) => `<li><span class="swatch ${colorOf(api, room, u)}"></span><span class="peek-who">${who(u)}</span><span class="peek-val">${val(data[u])}</span>${data[u] && data[u].done ? '<span class="tag">abgegeben</span>' : ''}</li>`)
        .join('')}</ul>
      <p class="muted small">Nur du siehst das. Übernommen wird nichts – deine Antwort gibst du selbst ab.</p></div>`;
  };
  if (q.stage === 'joker') return jokerRoundHTML(api, room, st);
  const answerForm = () => {
    // auch nach Neuladen: wer schon abgegeben hat, gibt nicht noch einmal ab
    if (P.sent[sentKey] || (q.stage === 'all' && q.given && q.given[me])) return '<p class="stage-title">Abgegeben. Warte auf die Auswertung.</p>';
    if (q.type === 'choice') {
      if (P.choiceKey !== sentKey) {
        P.choiceKey = sentKey;
        P.choice = null;
      }
      const hide = new Set((hd && hd.hide) || []);
      return `${peekBox()}<ol class="qoptions pick">${q.options
        .map((o, i) =>
          hide.has(i)
            ? `<li><span class="opt gone" aria-label="${'ABCDEF'[i]}: fällt weg"><span class="opt-letter">${'ABCDEF'[i]}</span>${esc(o)}</span></li>`
            : `<li><button class="opt${P.choice === i ? ' on' : ''}" data-action="quiz:choose" data-i="${i}" aria-pressed="${P.choice === i}"><span class="opt-letter">${'ABCDEF'[i]}</span>${esc(o)}</button></li>`
        )
        .join('')}</ol>
        <button class="btn primary big" data-action="quiz:send" ${P.choice == null ? 'disabled' : ''}>Antwort abgeben</button>
        <p class="muted small kbd-hint">Am PC: Taste ${q.options.length > 1 ? `1–${q.options.length}` : '1'} wählt, Enter gibt ab.</p>`;
    }
    if (q.type === 'estimate') {
      return `${peekBox()}<form class="answer-form est" data-form="quiz-answer" autocomplete="off">
        <div class="est-input"><input data-keep="ans:${esc(sentKey)}" class="answer-input" name="answer" inputmode="decimal" maxlength="30" placeholder="Deine Schätzung" aria-label="Deine Schätzung" enterkeyhint="send">${
          q.unit ? `<span class="est-unit">${esc(q.unit)}</span>` : ''
        }</div>
        <button class="btn primary" type="submit">Abgeben</button></form>`;
    }
    return `${peekBox()}<form class="answer-form" data-form="quiz-answer" autocomplete="off">
        <input data-keep="ans:${esc(sentKey)}" class="answer-input" name="answer" maxlength="200" placeholder="Deine Antwort" aria-label="Deine Antwort" enterkeyhint="send">
        <button class="btn primary" type="submit">Abgeben</button></form>`;
  };
  if (q.stage === 'answer') {
    const countdown = q.deadline ? ` <span class="countdown" data-until="${q.deadline}"></span>` : '';
    if (q.answering === me) {
      return `<div class="stage-box mine"><p class="stage-title me">Du antwortest!${countdown}</p>${buzzTimesHTML(api, room, st)}${answerForm()}
        <p class="muted small">Du kannst auch im Discord antworten – ${esc(hostName(api, room))} entscheidet.</p></div>`;
    }
    return `<div class="stage-box"><p class="stage-title"><span class="swatch ${colorOf(api, room, q.answering)}"></span>${who(q.answering)} antwortet …${countdown}</p>${buzzTimesHTML(api, room, st)}</div>`;
  }
  if (q.stage === 'buzz') {
    const eligible = inGame && Q.eligibleForBuzz(st).includes(me);
    if (!eligible) {
      const why = !inGame ? 'Die anderen buzzern.' : Q.sitsOut(st, me) ? 'Du setzt bei dieser Frage aus.' : 'Du hast bei dieser Frage schon geantwortet.';
      return `<div class="stage-box"><p class="stage-title">${why}</p></div>`;
    }
    const waiting = !P.open;
    let label = 'BUZZ';
    let cls = 'buzzer';
    let sub = 'Tippen oder Leertaste';
    const waitsForMedia = q.media && Q.PLAYABLE.includes(q.media.kind) && !q.play;
    if (waiting) {
      cls += ' waiting';
      label = waitsForMedia ? '…' : `<span class="countdown" data-until="${q.buzz.openAt}"></span>`;
      sub = waitsForMedia ? (q.media.kind === 'audio' ? 'Geht auf, sobald der Ton läuft' : 'Geht auf, sobald das Video läuft') : 'Gleich geht’s los';
    } else {
      cls += ' open';
    }
    if (P.tooEarly) {
      cls += ' early';
      sub = st.rules && st.rules.earlyLock ? 'Zu früh! Kurz gesperrt' : 'Zu früh!';
    }
    if (P.pressed) {
      cls = 'buzzer pressed';
      label = fmtSeconds(P.reaction);
      sub = 'Gedrückt – warte auf die anderen';
    }
    return `<div class="stage-box buzz-box"><button class="${cls}" data-buzzer aria-label="Buzzer">${label}</button><p class="buzz-sub">${sub}</p>
      <p class="muted small">Gezählt wird deine Reaktionszeit ab dem Moment, in dem der Buzzer bei dir aufleuchtet.</p></div>`;
  }
  if (q.stage === 'all') {
    const countdown = q.deadline ? ` <span class="countdown" data-until="${q.deadline}"></span>` : '';
    if (!inGame) return '<div class="stage-box"><p class="stage-title">Alle antworten gerade.</p></div>';
    if (Q.sitsOut(st, me)) return `<div class="stage-box"><p class="stage-title">Du setzt bei dieser Frage aus.${countdown}</p></div>`;
    return `<div class="stage-box mine"><p class="stage-title me">Alle antworten!${countdown}</p>${answerForm()}</div>`;
  }
  if (q.stage === 'review') {
    const given = q.given || {};
    const shown = Object.entries(given)
      .filter(([, g]) => g && g !== true)
      .map(([uid, g]) => `<li><span class="swatch ${colorOf(api, room, uid)}"></span>${who(uid)}<span>${esc(givenText(q, g))}</span></li>`)
      .join('');
    return `<div class="stage-box"><p class="stage-title">${esc(hostName(api, room))} prüft …</p>${shown ? `<ul class="buzz-live">${shown}</ul>` : ''}</div>`;
  }
  if (q.stage === 'closed') {
    return `<div class="stage-box"><p class="stage-title">${q.winner ? `${who(q.winner)} ${q.winner === me ? 'hast' : 'hat'} die Frage!` : 'Niemand hat die Frage.'}</p>
      ${resultsHTML(api, room, st)}${solutionHTML(api, room, st)}
      <p class="muted small">Gleich geht es weiter.</p></div>`;
  }
  return '';
}

screens['quiz:play'] = {
  key: (api) => api.roomId,
  mount(el, api) {
    const room = roomOf(api);
    el.innerHTML = `${api.topbar({ tape: room.title || NAME })}<main class="screen play">
      <div data-slot="banner"></div>
      <div data-slot="jlog"></div>
      <div class="play-grid">
        <aside class="play-side"><div data-slot="scores"></div><div data-slot="jokers"></div></aside>
        <section class="play-main">
          <div data-slot="board"></div>
          <section class="qcard" data-slot="qcard" hidden><div data-slot="qhead"></div><div data-slot="qmedia"></div><div data-slot="qopts"></div></section>
          <div data-slot="interaction"></div></section>
      </div>
      <div class="row-wrap play-foot"><button class="btn ghost" data-action="quiz:leave">Raum verlassen</button></div></main>`;
    window.__quizApi = api;
  },
  unmount() {
    window.__quizApi = null;
  },
  update(el, api) {
    const room = roomOf(api);
    const st = room.st;
    const inQ = st.phase === 'question' && !!st.q;
    setHTML(slot(el, 'banner'), hostOfflineNotice(api, room));
    setHTML(slot(el, 'jlog'), Q.inJokerRound(st) && st.q.joker ? '' : jlogHTML(api, room, st));
    setHTML(slot(el, 'scores'), scorebar(api, room, st));
    setHTML(slot(el, 'jokers'), jokerBarHTML(api, room, st));
    let board = '';
    if (!inQ) {
      const myTurn = st.turn === api.uid && Q.list(st.order).includes(api.uid);
      const turnName = st.turn ? esc(pname(api, room, st.turn)) : '';
      const ncols = (st.boards[st.board] && st.boards[st.board].cats.length) || 1;
      board = `<div class="board-wrap" style="--cols:${ncols}">${boardTabs(st, { host: false })}
        <p class="board-hint">${myTurn ? '<strong class="me">Du bist dran – wähl eine Frage!</strong>' : turnName ? `<span class="swatch ${colorOf(api, room, st.turn)}"></span><strong>${turnName}</strong> wählt eine Frage …` : ''}</p>
        ${boardHTML(api, room, st, { mode: myTurn ? 'pick' : 'view' })}</div>`;
    }
    setHTML(slot(el, 'board'), board);
    slot(el, 'qcard').hidden = !inQ;
    setHTML(slot(el, 'qhead'), inQ ? qheadHTML(st) : '');
    setHTML(slot(el, 'qmedia'), inQ ? qmediaHTML(st) : '');
    // Wer gerade selbst auswählt, sieht die Antworten unten zum Antippen – oben nicht noch einmal.
    const picking =
      inQ && st.q.type === 'choice' && !P.sent[`${st.q.key}:${st.q.attempt}`] &&
      ((st.q.stage === 'answer' && st.q.answering === api.uid) || (st.q.stage === 'all' && Q.list(st.order).includes(api.uid) && !Q.sitsOut(st, api.uid)));
    setHTML(slot(el, 'qopts'), inQ && !picking ? qoptsHTML(st) : '');
    setHTML(slot(el, 'interaction'), inQ ? playerInteraction(api, room, st) : '');
    const q = st.q;
    const focusKey = q && inQ && (q.stage === 'joker' || q.stage === 'buzz' || q.stage === 'all' || (q.stage === 'answer' && q.answering === api.uid)) ? `${q.key}:${q.attempt}:${q.stage}` : null;
    if (focusKey && focusKey !== P.focusKey) {
      const box = el.querySelector('.stage-box');
      if (box) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    P.focusKey = focusKey;
  },
};

screens['quiz:end'] = {
  key: (api) => api.roomId,
  mount(el, api) {
    const room = roomOf(api);
    el.innerHTML = `${api.topbar({ tape: room.title || NAME })}<main class="screen">
      <div class="stack-tight"><h1>Endstand</h1><p class="muted" data-slot="sub"></p></div>
      <ol class="final" data-slot="final"></ol>
      <div class="stack" data-slot="actions"></div></main>`;
  },
  update(el, api) {
    const room = roomOf(api);
    const st = stOf(api, room);
    const rows = Q.standings(st);
    const winners = rows.filter((r) => r.place === 1);
    const nameOf = (uid) => (uid === api.uid ? 'du' : pname(api, room, uid));
    slot(el, 'sub').textContent = !winners.length
      ? ''
      : winners.length > 1
        ? `Gleichstand: ${winners.map((r) => nameOf(r.uid)).join(' und ')} mit ${winners[0].score} Punkten.`
        : `${winners[0].uid === api.uid ? 'Du gewinnst' : `${pname(api, room, winners[0].uid)} gewinnt`} mit ${winners[0].score} Punkten.`;
    setHTML(
      slot(el, 'final'),
      rows
        .map(
          (r) => `<li class="final-row${r.uid === api.uid ? ' me' : ''}${r.place === 1 ? ' first' : ''}"><span class="rank-place">${r.place}.</span>
          <span class="swatch ${colorOf(api, room, r.uid)}"></span><strong>${esc(r.uid === api.uid ? 'Du' : pname(api, room, r.uid))}</strong><span class="final-score">${r.score}</span></li>`
        )
        .join('')
    );
    setHTML(
      slot(el, 'actions'),
      isHost(api, room)
        ? '<div class="row-wrap"><button class="btn secondary" data-action="quiz:resume">Weiterspielen</button><button class="btn ghost danger" data-action="quiz:close">Raum schließen</button></div>'
        : `<p class="lead">Danke fürs Mitspielen! ${esc(hostName(api, room))} schließt gleich den Raum.</p><div class="row-wrap"><button class="btn ghost" data-action="quiz:leave">Raum verlassen</button></div>`
    );
  },
};

// ---------- Host: Spieler-Blatt ----------

function openPlayerSheet(api, uid) {
  const room = roomOf(api);
  if (!room || !isHost(api, room)) return;
  const st = cur(api);
  const order = Q.list(st.order);
  const i = order.indexOf(uid);
  const name = pname(api, room, uid);
  const score = (st.scores || {})[uid] || 0;
  const step = st.q ? st.q.value : 100;
  openSheet({
    title: name,
    body: `<form class="stack-tight" data-sheet-form="score" novalidate><label class="field"><span>Punkte</span>
        <input name="score" type="number" step="50" value="${score}" inputmode="numeric"></label>
        <div class="row-wrap"><button type="button" class="btn secondary" data-sa="add" data-d="${-step}">${fmtPoints(-step)}</button>
          <button type="button" class="btn secondary" data-sa="add" data-d="${step}">${fmtPoints(step)}</button>
          <button class="btn primary" type="submit">Punkte setzen</button></div></form>
      <hr>
      <div class="sheet-actions">
        ${st.phase !== 'lobby' && st.turn !== uid ? '<button class="btn secondary" data-sa="turn">Ist jetzt dran</button>' : ''}
        <div class="row-wrap"><button class="btn secondary" data-sa="up" ${i <= 0 ? 'disabled' : ''}>${ICON.up} Früher dran</button>
          <button class="btn secondary" data-sa="down" ${i < 0 || i >= order.length - 1 ? 'disabled' : ''}>${ICON.down} Später dran</button></div>
        <button class="btn ghost danger" data-sa="kick">Aus dem Raum entfernen</button>
      </div>
      ${
        st.phase !== 'lobby'
          ? `<hr><div class="stack-tight"><h3>Joker von ${esc(name)}</h3><ul class="joker-set compact" data-jgive>${jokerGiveRows(api, room, st, uid)}</ul></div>`
          : ''
      }`,
    onAction(action, btn, sh) {
      const refresh = (pickSkip = false) => {
        const list = sh.el.querySelector('[data-jgive]');
        if (list) list.innerHTML = jokerGiveRows(api, room, cur(api), uid, pickSkip);
      };
      if (action === 'jgive') {
        mutate(api, (s) => Q.giveJoker(s, uid, btn.dataset.type, Number(btn.dataset.d)));
        refresh();
        return;
      }
      if (action === 'juse') {
        if (btn.dataset.type === 'skip') return refresh(true);
        mutate(api, (s) => Q.hostSetJoker(s, uid, btn.dataset.type, null, { now: api.b.now() }));
        sh.close();
        return;
      }
      if (action === 'jskip') {
        mutate(api, (s) => Q.hostSetJoker(s, uid, 'skip', btn.dataset.target, { now: api.b.now() }));
        sh.close();
        return;
      }
      if (action === 'add') {
        mutate(api, (s) => Q.addScore(s, uid, Number(btn.dataset.d), `${name} ${fmtPoints(Number(btn.dataset.d))}`));
        sh.close();
      }
      if (action === 'turn') {
        mutate(api, (s) => Q.setTurn(s, uid));
        sh.close();
      }
      if (action === 'up' || action === 'down') {
        mutate(api, (s) => Q.moveInOrder(s, uid, action === 'up' ? -1 : 1));
        sh.close();
      }
      if (action === 'kick') {
        sh.close();
        kickPlayer(api, api.roomId, uid);
      }
    },
    onSubmit(form, sh) {
      const raw = String(form.score.value).trim();
      const v = Number(raw);
      if (raw === '' || !Number.isFinite(v)) return toast('Gib eine Zahl ein.');
      mutate(api, (s) => Q.setScore(s, uid, v, `${name} auf ${Math.round(v)}`));
      sh.close();
    },
  });
}

function jokerGiveRows(api, room, st, uid, pickSkip = false) {
  const left = Q.jokersLeft(st, uid);
  const when = st.phase === 'board' ? 'für die nächste Frage' : 'für diese Frage';
  const rows = Q.jokerTypesFor(st)
    .map((j) => {
      const block = j === 'skip' ? Q.hostJokerBlocked(st, uid, 'skip', Q.list(st.order).find((u) => u !== uid) || null) : Q.hostJokerBlocked(st, uid, j);
      const canUse = !block || (j === 'skip' && block === 'Diese Person antwortet gerade.');
      return `<li><span class="jk-ico">${jokerIcon(j)}</span><div class="jk-text"><strong>${esc(Q.JOKERS[j].name)}</strong></div>
      <div class="stepper"><button class="icon-btn small" data-sa="jgive" data-type="${j}" data-d="-1" ${left[j] > 0 ? '' : 'disabled'} aria-label="${esc(Q.JOKERS[j].name)} wegnehmen">${ICON.minus}</button>
      <output>${left[j]}</output><button class="icon-btn small" data-sa="jgive" data-type="${j}" data-d="1" aria-label="${esc(Q.JOKERS[j].name)} geben">${ICON.plus}</button></div>
      ${j !== 'swap' ? `<button class="btn ghost small" data-sa="juse" data-type="${j}" ${canUse && (st.phase === 'board' || st.phase === 'question') ? '' : 'disabled'} title="${esc(block || `${Q.JOKERS[j].name} ${when} einsetzen`)}">Einsetzen</button>` : ''}</li>`;
    })
    .join('');
  const targets = pickSkip
    ? `<li class="jk-targets"><span class="field-label">Wer soll aussetzen?</span><div class="chips">${Q.list(st.order)
        .filter((u) => u !== uid)
        .map((u) => {
          const why = Q.hostJokerBlocked(st, uid, 'skip', u);
          return `<button class="chip" type="button" data-sa="jskip" data-target="${esc(u)}" ${why ? `disabled title="${esc(why)}"` : ''}><span class="swatch ${colorOf(api, room, u)}"></span>${esc(pname(api, room, u))}</button>`;
        })
        .join('')}</div></li>`
    : '';
  const a = Q.activeJoker(st);
  const note = a
    ? `<p class="muted small">Es gilt schon ein Joker (${esc(jokerLine(api, room, { ...a, armed: a.when === 'next' }))}). Gib ihn zuerst zurück, dann kannst du einen anderen einsetzen.</p>`
    : `<p class="muted small">Einsetzen wirkt ${when}, auch wenn die App den Joker für unpassend hält. Hat die Person keinen mehr, ist er geschenkt.</p>`;
  return `${rows}${targets}<li class="jk-note">${note}</li>`;
}

async function kickPlayer(api, roomId, uid, { silent = false } = {}) {
  const room = api.ctx.rooms && api.ctx.rooms[roomId];
  if (!room) return;
  if (!silent) {
    const ok = await confirmDialog({ title: `${pname(api, room, uid)} entfernen?`, text: 'Die Person fliegt aus dem Raum. Ihre Punkte bleiben gespeichert, falls sie wiederkommt.', ok: 'Entfernen', danger: true });
    if (!ok) return;
  }
  await api.b.write(`rooms/${roomId}/players/${uid}`, null).catch(() => toast('Das hat nicht geklappt.'));
}

async function leaveRoom(api, roomId, { silent = false } = {}) {
  const room = api.ctx.rooms && api.ctx.rooms[roomId];
  if (!room) return;
  if (isHost(api, room)) return closeRoom(api, roomId, { silent });
  if (!silent && room.st && room.st.phase !== 'lobby' && room.st.phase !== 'end') {
    const ok = await confirmDialog({ title: 'Raum verlassen?', text: 'Deine Punkte bleiben gespeichert, falls du zurückkommst.', ok: 'Verlassen', danger: true });
    if (!ok) return;
  }
  api.leaving();
  await api.b.write(`rooms/${roomId}/players/${api.uid}`, null).catch(() => toast('Das hat nicht geklappt.'));
}

async function closeRoom(api, roomId, { silent = false } = {}) {
  if (!silent) {
    const ok = await confirmDialog({ title: 'Raum schließen?', text: 'Das Spiel endet für alle.', ok: 'Schließen', danger: true });
    if (!ok) return;
  }
  api.leaving();
  engineStop();
  forgetMediaMap(roomId);
  await api.b.deleteRoom(roomId).catch(() => toast('Das hat nicht geklappt.'));
}

async function hostQuiz(api, id) {
  const quiz = getQuiz(id);
  if (!quiz) return;
  if (!stats(quiz).filled) return toast('Das Quiz hat noch keine Fragen.');
  // Eigene alte Quiz-Räume aufräumen – sonst bleiben ihre Medien ewig in der Datenbank liegen.
  const mine = Object.entries(api.ctx.rooms || {}).filter(([, r]) => r && r.game === ID && r.host === api.uid);
  const running = mine.filter(([, r]) => r.st && r.st.phase !== 'lobby' && r.st.phase !== 'end' && Object.keys(r.players || {}).some((u) => api.isOnline(u)));
  if (running.length) {
    const ok = await confirmDialog({
      title: 'Laufendes Quiz schließen?',
      text: `„${running[0][1].title || NAME}“ läuft noch mit Leuten, die online sind. Wenn du ein neues Quiz hostest, wird es geschlossen.`,
      ok: 'Schließen und neu hosten',
      danger: true,
    });
    if (!ok) return;
  }
  for (const [oldId] of mine) {
    if (H.roomId === oldId) engineStop();
    forgetMediaMap(oldId);
    await api.b.deleteRoom(oldId).catch(() => {});
  }
  const roomId = makeId();
  const room = { game: ID, host: api.uid, createdAt: api.b.now(), title: quiz.title, quizId: quiz.id, st: Q.newGame(quiz) };
  try {
    await api.b.write(`rooms/${roomId}`, room);
    api.enterRoom(roomId);
  } catch (err) {
    console.error(err);
    toast('Der Raum konnte nicht geöffnet werden.');
  }
}

// ---------- Medien abgleichen ----------

function leavePlayerRoom() {
  if (P.hostOff) P.hostOff();
  Object.assign(P, { hostOff: null, hostRoom: null, hostData: null, readySent: {} });
  stopPrefetch();
}

function syncQuestionMedia(api) {
  const room = roomOf(api);
  const st = room && stOf(api, room);
  const q = st && st.phase === 'question' && st.q;
  if (!q) return;
  const root = document.getElementById('app');
  const ctx = {
    api,
    roomId: api.roomId,
    now: () => api.b.now(),
    onReady(key) {
      if (isHost(api, room) || P.readySent[key] || key.endsWith('-sol')) return;
      P.readySent[key] = true;
      api.b.sendInput(api.roomId, 'ready', { key }).catch(() => {});
    },
  };
  if (q.media && !q.media.pending) syncMedia(root, q.media, q.key, q.play, ctx);
  if (q.solMedia && !q.solMedia.pending) syncMedia(root, q.solMedia, q.key + '-sol', null, ctx);
}

// Wiedergabe regelmäßig nachziehen (z. B. wenn ein Gerät kurz hängt)
setInterval(() => {
  if (window.__quizApi || document.querySelector('.view-quiz-hostGame')) {
    const api = window.__quizApi || window.__quizHostApi;
    if (api) syncQuestionMedia(api);
  }
}, 1000);

// ---------- Spiel-Definition ----------

export default {
  id: ID,
  name: NAME,
  tagline: 'Fragen-Board im Jeopardy-Stil mit Buzzer. Du moderierst, die anderen raten.',
  art: () =>
    `<div class="art-quiz">${[100, 200, 300, 200, 400, 300]
      .map((v, i) => `<span class="${i === 4 ? 'lit' : ''}">${v}</span>`)
      .join('')}</div>`,
  cardButtons: () => '<button class="btn primary" data-action="quiz:library">Quiz hosten</button>',
  screens,

  isIn: (room, uid) => !!room && (room.host === uid || !!(room.players && room.players[uid])),

  roomSummary(api, room) {
    const n = Object.keys(room.players || {}).length;
    const phase = room.st && room.st.phase;
    return {
      title: `${room.title || NAME} mit ${api.memberName(room.host)}`,
      meta: `${n} ${n === 1 ? 'Person' : 'Leute'}${phase === 'lobby' ? ', wartet auf Start' : phase === 'end' ? ', vorbei' : ', läuft'}`,
      joinLabel: 'Beitreten',
    };
  },

  screenFor(api, room) {
    const st = room.st || {};
    if (isHost(api, room)) return st.phase === 'lobby' ? 'quiz:hostLobby' : st.phase === 'end' ? 'quiz:end' : 'quiz:hostGame';
    return st.phase === 'lobby' ? 'quiz:lobby' : st.phase === 'end' ? 'quiz:end' : 'quiz:play';
  },

  localScreenFor(api, route) {
    if (route.view === 'editor' && E.quizId) return 'quiz:editor';
    return 'quiz:library';
  },

  async joinRoom(api, roomId, room) {
    const players = (room && room.players) || {};
    try {
      await api.b.write(`rooms/${roomId}/players/${api.uid}`, { name: api.myName(), joinedAt: api.b.now(), color: freeColor(players) });
      api.enterRoom(roomId);
    } catch (err) {
      console.error(err);
      toast('Beitreten hat nicht geklappt.');
    }
  },

  leave: leaveRoom,
  kick: kickPlayer,

  async rename(api, roomId, name) {
    const room = api.ctx.rooms && api.ctx.rooms[roomId];
    if (room && room.players && room.players[api.uid]) await api.b.write(`rooms/${roomId}/players/${api.uid}/name`, name);
  },

  onRoom(api, roomId, prev, next) {
    if (!next) {
      if (H.roomId === roomId) engineStop();
      if (P.hostRoom === roomId) leavePlayerRoom();
      keepScreenOn(false);
      return;
    }
    const st = next.st || {};
    // Joker-Ansage für alle
    const lastJ = Q.list(st.jlog).slice(-1)[0];
    if (lastJ && lastJ.id !== P.jlogSeen) {
      const fresh = P.jlogSeen !== null && api.b.now() - lastJ.at < JLOG_MS;
      P.jlogSeen = lastJ.id;
      if (fresh) {
        sound('open');
        announce(jokerLine(api, next, lastJ));
        setTimeout(() => api.render(), JLOG_MS + 100);
      }
    } else if (!lastJ && P.jlogSeen === null) P.jlogSeen = '';
    if (isHost(api, next)) {
      engineStart(api, roomId, next);
      mutate(api, (s) => Q.syncPlayers(s, next.players || {}));
      processInputs(api);
    } else {
      startPrefetch(api, roomId);
      if (P.hostRoom !== roomId) {
        if (P.hostOff) P.hostOff();
        P.hostRoom = roomId;
        P.hostData = null;
        P.hostOff = api.b.watch(`inputs/${roomId}/${api.uid}/host`, (v) => {
          P.hostData = v || null;
          api.render();
        });
      }
      const rej = st.jrej && st.jrej[api.uid];
      if (rej && rej.id === P.jokerSent && P.rejSeen !== rej.id) {
        P.rejSeen = rej.id;
        P.jusing = null;
        P.bpending = false;
        toast(`${rej.why} Der Joker bleibt dir.`);
      }
      if (P.bpending && (st.jarm ? st.jarm.id === P.jokerSent : st.phase !== 'board')) P.bpending = false;
      if (st.phase !== 'board') P.bsel = null;
      // Fängt jemand an zu spicken, geht auch schon Getipptes raus
      if (st.q && st.q.stage === 'all' && Object.keys((st.fx && st.fx.peek) || {}).some((u) => u !== api.uid)) {
        const input = document.querySelector('.answer-input');
        if (input && input.value) sendDraft(api, { text: String(input.value).slice(0, 200) });
        else if (st.q.type === 'choice' && P.choice != null && P.choiceKey === `${st.q.key}:${st.q.attempt}`) sendDraft(api, { choice: P.choice });
      }
      // Joker-Runde beginnt: wer einen passenden Joker hat, bekommt einen Hinweis
      const jr = st.phase === 'question' && st.q && st.q.stage === 'joker' ? roundOf(st.q) : null;
      if (jr && jr !== P.jroundSeen) {
        P.jroundSeen = jr;
        P.jsel = null;
        if (!st.q.joker && Q.usableJokers(st, api.uid).length) {
          sound('open');
          vibrate(60);
          announce('Joker-Runde: Willst du für diese Frage einen Joker einsetzen?');
        }
      }
      syncBuzzer(api, next);
      const q = st.q;
      // Ton, wenn man dran ist oder ein Ergebnis kommt
      if (st.phase === 'board' && st.turn === api.uid && P.lastTurnAlert !== `${st.v}:${st.turn}` && (!prev || !prev.st || prev.st.turn !== api.uid || prev.st.phase !== 'board')) {
        P.lastTurnAlert = `${st.v}:${st.turn}`;
        sound('turn');
        vibrate([100, 60, 100]);
        announce('Du bist dran – wähl eine Frage.');
      }
      if (q && q.stage === 'answer' && q.answering === api.uid && !(prev && prev.st && prev.st.q && prev.st.q.stage === 'answer' && prev.st.q.answering === api.uid && prev.st.q.attempt === q.attempt)) {
        sound('turn');
        vibrate([80, 50, 80]);
        announce('Du antwortest!');
      }
      const res = q && Q.list(q.results).filter((r) => r.uid === api.uid);
      const resKey = q && res.length ? `${q.key}:${res.length}` : null;
      if (resKey && resKey !== P.lastResultKey) {
        P.lastResultKey = resKey;
        sound(res[res.length - 1].ok ? 'right' : 'wrong');
      }
    }
    if (prev && prev.st && prev.st.phase !== st.phase) closeSheets();
    keepScreenOn(st.phase === 'board' || st.phase === 'question');
  },

  onStatus(api) {
    const room = roomOf(api);
    if (room && isHost(api, room)) api.render();
  },

  onReset() {
    engineStop();
    leavePlayerRoom();
  },

  afterRender(api) {
    syncQuestionMedia(api);
  },

  forms: {
    'quiz-answer': (api, form) => {
      const room = roomOf(api);
      const q = room && room.st && room.st.q;
      if (!q) return;
      const text = String(form.answer.value || '').trim();
      if (!text) return toast('Schreib zuerst eine Antwort.');
      const data = { key: q.key, attempt: q.attempt, text };
      if (q.type === 'estimate') {
        const n = Q.parseNumber(text);
        if (!Number.isFinite(n)) return toast('Gib eine Zahl ein, z. B. 1.250 oder 3,5.');
        data.num = n;
      }
      const k = `${q.key}:${q.attempt}`;
      P.sent[k] = true;
      api.b.sendInput(api.roomId, 'answer', data).catch(() => {
        delete P.sent[k];
        toast('Antwort konnte nicht gesendet werden. Versuch es nochmal.');
        api.render();
      });
      api.renderNow();
    },
  },

  actions: {
    ...studioActions,
    'quiz:host': (api, btn) => hostQuiz(api, btn.dataset.id),
    // Host
    'quiz:shuffle': (api) => mutate(api, (s) => Q.shuffleOrder(s)),
    'quiz:rule': (api, btn) => {
      const rule = btn.dataset.rule;
      let value = btn.dataset.value;
      if (value === 'true' || value === 'false') value = value === 'true';
      else if (rule === 'answerTime') value = Number(value);
      mutate(api, (s) => Q.setRule(s, rule, value));
    },
    'quiz:after-wrong': (api, btn) => mutate(api, (s) => Q.setAfterWrong(s, btn.dataset.value)),
    'quiz:start': (api) => mutate(api, (s) => Q.startGame(s, { now: api.b.now() })),
    'quiz:host-pick': (api, btn) => revealTile(api, Number(btn.dataset.b), Number(btn.dataset.c), Number(btn.dataset.r)),
    'quiz:used-tile': async (api, btn) => {
      const ok = await confirmDialog({ title: 'Feld wieder öffnen?', text: 'Die Frage kann dann noch einmal gewählt werden. Vergebene Punkte bleiben, wie sie sind.', ok: 'Wieder öffnen' });
      if (ok) mutate(api, (s) => Q.reopenTile(s, btn.dataset.key));
    },
    'quiz:board': (api, btn) => mutate(api, (s) => Q.switchBoard(s, Number(btn.dataset.b))),
    'quiz:next-board': (api) => mutate(api, (s) => Q.switchBoard(s, s.board + 1)),
    'quiz:quick': (api, btn) => quickJudge(api, btn.dataset.ok === '1'),
    'quiz:skip': (api) => mutate(api, (s) => Q.skipQuestion(s, { now: api.b.now() })),
    'quiz:put-back': (api) => mutate(api, (s) => Q.putBack(s)),
    'quiz:open-now': (api) => mutate(api, (s) => Q.openBuzzerNow(s, { now: api.b.now() })),
    'quiz:to-review': (api) => mutate(api, (s) => Q.toReview(s)),
    'quiz:verdict': (api, btn) => {
      const uid = btn.dataset.uid;
      const ok = btn.dataset.ok === '1';
      H.verdicts[uid] = H.verdicts[uid] === ok ? null : ok;
      delete H.custom[uid];
      api.renderNow();
    },
    'quiz:custom': (api, btn) => {
      const uid = btn.dataset.uid;
      const room = roomOf(api);
      openSheet({
        title: `Punkte für ${pname(api, room, uid)}`,
        body: `<form class="stack-tight" data-sheet-form="custom" novalidate><label class="field"><span>Punkte für diese Frage (auch minus)</span>
          <input name="pts" type="number" step="50" value="" inputmode="numeric" data-autofocus></label>
          <div class="sheet-actions"><button class="btn primary" type="submit">Übernehmen</button><button class="btn ghost" type="button" data-sa="reset">Wieder Vorschlag nehmen</button></div></form>`,
        onAction(action, b2, sh) {
          if (action === 'reset') {
            delete H.custom[uid];
            sh.close();
            api.renderNow();
          }
        },
        onSubmit(form, sh) {
          const v = Number(form.pts.value);
          if (!Number.isFinite(v) || form.pts.value === '') return toast('Gib eine Zahl ein.');
          H.custom[uid] = Math.round(v);
          if (!(uid in H.verdicts) || H.verdicts[uid] == null) H.verdicts[uid] = v > 0;
          sh.close();
          api.renderNow();
        },
      });
    },
    'quiz:apply': (api) => applyReview(api),
    'quiz:solution': (api) =>
      mutate(api, (s) => {
        const question = questionOf(s);
        const extra = question && question.type === 'estimate' && question.number != null ? { target: Number(question.number) } : null;
        return Q.showSolution(s, solutionText(question), question ? publicMedia(question.solutionMedia) : null, extra);
      }),
    'quiz:media': (api, btn) => mutate(api, (s) => Q.setPlay(s, { state: btn.dataset.op, now: api.b.now() })),
    'quiz:timer': (api, btn) => mutate(api, (s) => Q.changeDeadline(s, { now: api.b.now(), op: btn.dataset.op, seconds: 10 })),
    'quiz:jset': (api, btn) => mutate(api, (s) => Q.setJokerSet(s, btn.dataset.type, ((s.jokers && s.jokers.set && s.jokers.set[btn.dataset.type]) || 0) + Number(btn.dataset.d))),
    'quiz:joker': (api, btn) => openJokerSheet(api, btn.dataset.type),
    'quiz:open-question': (api) => openTile(api),
    'quiz:joker-more': (api) => mutate(api, (s) => Q.extendJokerRound(s, { now: api.b.now(), seconds: 10 })),
    'quiz:jsel': (api, btn) => {
      const q = roomOf(api) && roomOf(api).st.q;
      if (!q || q.stage !== 'joker') return;
      const round = roundOf(q);
      const type = btn.dataset.type;
      P.jsel = P.jsel && P.jsel.round === round && P.jsel.type === type ? null : { round, type, target: null };
      api.renderNow();
    },
    'quiz:jtarget': (api, btn) => {
      if (!P.jsel) return;
      P.jsel = { ...P.jsel, target: P.jsel.target === btn.dataset.uid ? null : btn.dataset.uid };
      api.renderNow();
    },
    'quiz:juse': (api) => sendJoker(api),
    'quiz:jpass': (api) => passJokerRound(api),
    'quiz:jmode': (api, btn) => mutate(api, (s) => Q.setJokerMode(s, btn.dataset.mode)),
    'quiz:jreturn': async (api) => {
      const st = cur(api);
      const a = st && Q.activeJoker(st);
      if (!a) return;
      const scored = st.q && Q.list(st.q.results).length;
      const ok = await confirmDialog({
        title: 'Joker zurückgeben?',
        text: `${pname(api, roomOf(api), a.uid)} bekommt den Joker ${Q.JOKERS[a.type].name} zurück, und er wirkt nicht mehr.${scored ? ' Schon vergebene Punkte bleiben – korrigier sie bei Bedarf.' : ''}`,
        ok: 'Zurückgeben',
      });
      if (ok) mutate(api, (s) => Q.hostReturnJoker(s, { now: api.b.now() }));
    },
    'quiz:bsel': (api, btn) => {
      const type = btn.dataset.type;
      P.bsel = P.bsel && P.bsel.type === type ? null : { type, target: null };
      api.renderNow();
    },
    'quiz:btarget': (api, btn) => {
      if (!P.bsel) return;
      P.bsel = { ...P.bsel, target: P.bsel.target === btn.dataset.uid ? null : btn.dataset.uid };
      api.renderNow();
    },
    'quiz:barm': (api) => {
      const room = roomOf(api);
      const sel = P.bsel;
      if (!room || !sel || room.st.phase !== 'board') return;
      const id = makeId();
      P.jokerSent = id;
      P.bpending = true;
      P.bsel = null;
      api.b.sendInput(api.roomId, 'joker', { id, type: sel.type, target: sel.target || null }).catch(() => {
        P.bpending = false;
        toast('Der Joker konnte nicht gesendet werden.');
        api.render();
      });
      api.renderNow();
    },
    'quiz:bcancel': (api) => {
      api.b.sendInput(api.roomId, 'joker', { id: makeId(), cancel: true }).catch(() => toast('Das hat nicht geklappt.'));
    },
    'quiz:back': (api) => mutate(api, (s) => Q.backToBoard(s)),
    'quiz:undo': async (api) => {
      const last = Q.list(cur(api).history).slice(-1)[0];
      const ok = await confirmDialog({ title: 'Rückgängig machen?', text: `Die Punkte werden auf den Stand vor „${last ? historyLabel(api, roomOf(api), last) : 'der letzten Änderung'}“ zurückgesetzt.`, ok: 'Rückgängig' });
      if (ok) mutate(api, (s) => Q.undo(s));
    },
    'quiz:player': (api, btn) => openPlayerSheet(api, btn.dataset.uid),
    'quiz:end': async (api) => {
      const st = cur(api);
      if (st.phase === 'question') return toast('Schließ zuerst die offene Frage.');
      const ok = await confirmDialog({ title: 'Spiel beenden?', text: 'Alle sehen den Endstand. Du kannst danach weiterspielen.', ok: 'Beenden' });
      if (ok) mutate(api, (s) => Q.endGame(s, { now: api.b.now() }));
    },
    'quiz:resume': (api) => mutate(api, (s) => Q.resumeGame(s)),
    'quiz:close': (api) => closeRoom(api, api.roomId),
    'quiz:leave': (api) => leaveRoom(api, api.roomId),
    // Spielende
    'quiz:pick': (api, btn) => {
      const room = roomOf(api);
      if (!room || room.st.turn !== api.uid) return;
      btn.classList.add('picked');
      api.b
        .sendInput(api.roomId, 'pick', { b: Number(btn.dataset.b), c: Number(btn.dataset.c), r: Number(btn.dataset.r) })
        .catch(() => toast('Auswahl konnte nicht gesendet werden.'));
    },
    'quiz:choose': (api, btn) => {
      P.choice = Number(btn.dataset.i);
      sendDraft(api, { choice: P.choice });
      api.renderNow();
    },
    'quiz:send': (api) => {
      const room = roomOf(api);
      const q = room && room.st && room.st.q;
      if (!q || P.choice == null) return;
      const k = `${q.key}:${q.attempt}`;
      P.sent[k] = true;
      api.b.sendInput(api.roomId, 'answer', { key: q.key, attempt: q.attempt, choice: P.choice }).catch(() => {
        delete P.sent[k];
        toast('Antwort konnte nicht gesendet werden. Versuch es nochmal.');
        api.render();
      });
      api.renderNow();
    },
  },
};
