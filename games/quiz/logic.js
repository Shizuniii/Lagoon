// games/quiz/logic.js – die reine Spiellogik der Quizwand (Jeopardy-Prinzip).
//
// Der Host (Moderator) ist die einzige Instanz, die den Spielstand schreibt. Seine App
// rechnet mit diesen Funktionen und legt das Ergebnis unter rooms/<id>/st ab.
// Fragen und Antworten liegen NUR auf dem Gerät des Hosts; in den Spielstand kommt eine
// Frage erst, wenn sie aufgedeckt wird – und die Lösung nur, wenn der Host sie zeigt.
//
// st = {
//   v, phase: 'lobby'|'board'|'question'|'end',
//   order: [uid], turn: uid, scores: {uid: n},
//   rules: {...}, afterWrong: 'buzzer'|'next'|'none',
//   board: 0, boards: [{ title, mult, cats: [{ name, values: [..], filled: [..] }] }],
//   used: { 'b_c_r': { by: uid|null } },
//   q: null | { key, b, c, r, cat, value, text, media, type, options, unit, est, time, mode, picker, stage,
//               answering, attempt, tried, buzz, deadline, given, results, winner, solution, play },
//   history: [{ label, scores }], lastPickAt,
//   jokers: { set: {typ: anzahl}, left: { uid: {typ: anzahl} } },   // Joker je Person
//   fx: { double|skip|shield|peek|fifty: { uid: true } },           // Joker-Wirkung für die nächste/aktuelle Frage
//   jlog: [{ id, type, uid, target, at }], jseen: { uid: letzteJokerId }
// }

export const MODES = ['turn', 'buzzer', 'solo', 'all'];
export const MODE_LABEL = { turn: 'Reihum', buzzer: 'Buzzer', solo: 'Solo', all: 'Alle' };
export const MODE_HELP = {
  turn: 'Wer dran ist, antwortet. Bei falscher Antwort geht es weiter wie eingestellt.',
  buzzer: 'Alle dürfen buzzern, die schnellste Reaktion antwortet.',
  solo: 'Nur wer dran ist, darf antworten. Kein Wegschnappen.',
  all: 'Alle antworten gleichzeitig. Jede richtige Antwort bekommt Punkte.',
};

export const DEFAULT_RULES = {
  penalty: 'none', // 'none' | 'half' | 'full'
  negative: false,
  stealHalf: false,
  winnerPicks: false,
  earlyLock: false,
  answerTime: 0, // Sekunden, 0 = aus
};

export const QTYPES = ['text', 'choice', 'estimate'];
export const QTYPE_LABEL = { text: 'Freitext', choice: 'Auswahl', estimate: 'Schätzfrage' };
export const EST_SCORING = {
  closest: 'Nächste Schätzung gewinnt',
  farthest: 'Weiteste Schätzung verliert',
  range: 'Alle im Fehlerbereich gewinnen',
};

/**
 * Joker und was sie tun. Eingesetzt werden sie in der Joker-Runde: nach der Feldwahl,
 * bevor die Frage aufgeht. Pro Frage geht nur ein Joker – wer zuerst einsetzt.
 */
export const JOKERS = {
  double: { name: 'Doppelt', short: '×2', help: 'Diese Frage zählt für dich doppelt – Gewinn und Abzug.' },
  skip: { name: 'Aussetzen', short: 'Aus', help: 'Such dir jemanden aus, der bei dieser Frage aussetzt. Trifft es die Person, die dran ist, antwortet die nächste.' },
  peek: { name: 'Spicken', short: 'Spick', help: 'Bei einer Frage für alle siehst du, was die anderen abgeben, bevor du selbst antwortest.' },
  fifty: { name: '50:50', short: '50:50', help: 'Bei einer Auswahlfrage verschwinden alle falschen Antworten bis auf eine – nur bei dir.' },
  shield: { name: 'Schutzschild', short: 'Schild', help: 'Liegst du bei dieser Frage daneben, kostet es dich keine Punkte.' },
  swap: { name: 'Neues Feld', short: 'Tausch', help: 'Gefällt dir dein Feld nicht? Es bleibt offen, und du wählst ein anderes.' },
};
export const JOKER_IDS = Object.keys(JOKERS);
export const NO_JOKERS = Object.fromEntries(JOKER_IDS.map((j) => [j, 0]));

export const MIN_REACTION = 90; // schneller kann kein Mensch reagieren -> Frühstart
const HISTORY_MAX = 15;

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
export const tileKey = (b, c, r) => `${b}_${c}_${r}`;

export function list(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.filter((v) => v != null);
  return Object.keys(x)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => x[k])
    .filter((v) => v != null);
}

// ---------- Aufbau ----------

/** Öffentliche Board-Struktur: nur Kategorien und Werte, keine Fragen oder Antworten. */
export function publicBoards(quiz) {
  return (quiz.boards || []).map((b) => ({
    title: b.title || '',
    mult: Number(b.multiplier) > 0 ? Number(b.multiplier) : 1,
    cats: (b.categories || []).map((c) => ({
      name: c.name || '',
      values: (c.questions || []).map((q) => Number(q.value) || 0),
      filled: (c.questions || []).map((q) => !!(q && String(q.question || '').trim())),
    })),
  }));
}

export function newGame(quiz) {
  return {
    v: 1,
    phase: 'lobby',
    order: [],
    turn: null,
    scores: {},
    rules: { ...DEFAULT_RULES },
    afterWrong: 'buzzer',
    board: 0,
    boards: publicBoards(quiz),
    used: {},
    q: null,
    history: [],
    lastPickAt: 0,
    jokers: { set: { ...NO_JOKERS }, left: {} },
    jokerMode: 'round',
    jarm: null,
    fx: {},
    jlog: [],
    jseen: {},
  };
}

const bump = (st) => ({ ...st, v: (st.v || 0) + 1 });

/** Spielerliste abgleichen: Neue hinten anhängen, Gegangene aus der Reihenfolge nehmen. */
export function syncPlayers(st, players) {
  const present = Object.keys(players || {}).sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0) || (a < b ? -1 : 1));
  const order = list(st.order).filter((u) => present.includes(u));
  present.forEach((u) => {
    if (!order.includes(u)) order.push(u);
  });
  const scores = { ...(st.scores || {}) };
  const colors = { ...(st.colors || {}) };
  order.forEach((u) => {
    if (typeof scores[u] !== 'number') scores[u] = 0;
    if (typeof colors[u] !== 'number') {
      const taken = new Set(order.map((x) => colors[x]));
      let c = 0;
      while (taken.has(c)) c++;
      colors[u] = c;
    }
  });
  const jk = st.jokers || { set: { ...NO_JOKERS }, left: {} };
  const left = { ...(jk.left || {}) };
  order.forEach((u) => {
    if (!left[u]) left[u] = { ...NO_JOKERS, ...(jk.set || {}) };
  });
  const sameOrder = JSON.stringify(order) === JSON.stringify(list(st.order));
  const sameScores = JSON.stringify(scores) === JSON.stringify(st.scores || {});
  const sameColors = JSON.stringify(colors) === JSON.stringify(st.colors || {});
  const sameLeft = JSON.stringify(left) === JSON.stringify(jk.left || {});
  let turn = st.turn;
  if (st.phase !== 'lobby' && (!turn || !order.includes(turn))) turn = order.length ? nextInOrder(order, turn, list(st.order)) : null;
  if (sameOrder && sameScores && sameColors && sameLeft && turn === st.turn && st.jokers) return st;
  return bump({ ...st, order, scores, colors, turn, jokers: { set: { ...NO_JOKERS, ...(jk.set || {}) }, left } });
}

function nextInOrder(order, uid, previousOrder = null) {
  if (!order.length) return null;
  const i = order.indexOf(uid);
  if (i >= 0) return order[(i + 1) % order.length];
  // uid ist nicht mehr dabei: nimm die Person, die in der alten Reihenfolge danach kam
  if (previousOrder) {
    const j = previousOrder.indexOf(uid);
    if (j >= 0) {
      for (let k = 1; k <= previousOrder.length; k++) {
        const cand = previousOrder[(j + k) % previousOrder.length];
        if (order.includes(cand)) return cand;
      }
    }
  }
  return order[0];
}

export function shuffle(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function shuffleOrder(st, rng = Math.random) {
  const order = shuffle(list(st.order), rng);
  return bump({ ...st, order, orderFixed: true, turn: st.phase === 'lobby' ? null : order[0] || null });
}

/** Spiel starten. Hat der Host die Reihenfolge nicht selbst festgelegt, wird sie zufällig gemischt. */
export function startGame(st, { now, rng = Math.random, shuffle: mix = true }) {
  if (st.phase !== 'lobby' || !list(st.order).length) return st;
  const order = mix && !st.orderFixed ? shuffle(list(st.order), rng) : list(st.order);
  const set = { ...NO_JOKERS, ...((st.jokers && st.jokers.set) || {}) };
  const left = Object.fromEntries(order.map((u) => [u, { ...set }]));
  return bump({ ...st, phase: 'board', order, turn: order[0], startedAt: now, jokers: { set, left }, jarm: null, fx: {}, jlog: [], jseen: (st.jseen || {}) });
}

// ---------- Moderation ----------

export function moveInOrder(st, uid, dir) {
  const order = list(st.order);
  const i = order.indexOf(uid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return st;
  [order[i], order[j]] = [order[j], order[i]];
  return bump({ ...st, order, orderFixed: true });
}

export function setTurn(st, uid) {
  if (!list(st.order).includes(uid) || st.turn === uid) return st;
  return bump({ ...st, turn: uid });
}

function withHistory(st, label) {
  const history = list(st.history).slice(-(HISTORY_MAX - 1));
  history.push({ label, scores: clone(st.scores || {}) });
  return { ...st, history };
}

export function setScore(st, uid, value, label = null) {
  const v = Math.round(Number(value));
  if (!Number.isFinite(v) || (st.scores || {})[uid] === v) return st;
  const s = withHistory(st, label || 'Punkte geändert');
  return bump({ ...s, scores: { ...s.scores, [uid]: v } });
}

export function addScore(st, uid, delta, label = null) {
  return setScore(st, uid, ((st.scores || {})[uid] || 0) + Math.round(Number(delta) || 0), label);
}

export function undo(st) {
  const history = list(st.history);
  const last = history.pop();
  if (!last) return st;
  return bump({ ...st, history, scores: last.scores || {} });
}

export function setRule(st, key, value) {
  if (!(key in DEFAULT_RULES) || st.rules[key] === value) return st;
  return bump({ ...st, rules: { ...st.rules, [key]: value } });
}

export function setAfterWrong(st, value) {
  if (!['buzzer', 'next', 'none'].includes(value) || st.afterWrong === value) return st;
  return bump({ ...st, afterWrong: value });
}

export function switchBoard(st, index) {
  if (index < 0 || index >= st.boards.length || index === st.board || st.phase === 'question') return st;
  return bump({ ...st, board: index });
}

export function reopenTile(st, key) {
  if (!st.used || !st.used[key]) return st;
  const used = { ...st.used };
  delete used[key];
  return bump({ ...st, used });
}

export function endGame(st, { now }) {
  if (st.phase === 'question') return st;
  return bump({ ...st, phase: 'end', endedAt: now });
}

export function resumeGame(st) {
  if (st.phase !== 'end') return st;
  return bump({ ...st, phase: 'board' });
}

export function boardDone(st, b = st.board) {
  const board = st.boards[b];
  if (!board) return true;
  return board.cats.every((c, ci) => c.values.every((_, ri) => !c.filled[ri] || (st.used && st.used[tileKey(b, ci, ri)])));
}

export function tileValue(st, b, c, r) {
  const board = st.boards[b];
  return Math.round(((board && board.cats[c] && board.cats[c].values[r]) || 0) * ((board && board.mult) || 1));
}

export function canPick(st, b, c, r) {
  const board = st.boards[b];
  return (
    st.phase === 'board' &&
    b === st.board &&
    !!board &&
    !!board.cats[c] &&
    !!board.cats[c].filled[r] &&
    !(st.used && st.used[tileKey(b, c, r)])
  );
}

// ---------- Fragen ----------

/** Wie lange alle die Frage lesen dürfen, bevor der Buzzer aufgeht. */
export function readDelay(text) {
  const n = String(text || '').length;
  return Math.max(2500, Math.min(8000, 1500 + n * 40));
}

/**
 * Zeitfenster nach dem ersten Buzzer-Druck, in dem noch gewartet wird.
 * Wer langsameres Internet hat, sieht den Buzzer später und sein Druck kommt später an.
 * Gezählt wird trotzdem die eigene Reaktionszeit – das Fenster sorgt dafür, dass langsame
 * Verbindungen noch rechtzeitig ankommen.
 */
export function buzzWindow(rtts) {
  const max = Math.max(0, ...rtts.filter((x) => typeof x === 'number' && x >= 0));
  return Math.max(300, Math.min(1500, Math.round(max * 1.5 + 150)));
}

export const JOKER_MS = 12000; // Bedenkzeit in der Joker-Runde
export const JOKER_SHOW_MS = 2000; // so lange wird ein eingesetzter Joker angesagt, bevor die Frage aufgeht

/** Was alle schon wissen dürfen, sobald ein Feld gewählt ist: Kategorie, Wert, Art der Frage – nicht die Frage. */
function questionMeta(st, { b, c, r, question, defaultMode = 'turn' }) {
  const mode = MODES.includes(question.mode) ? question.mode : MODES.includes(defaultMode) ? defaultMode : 'turn';
  const type = QTYPES.includes(question.type) ? question.type : 'text';
  // key: Kennung genau dieser Frage-Öffnung. Wird ein Feld zurückgelegt oder wieder geöffnet und
  // später erneut gewählt, bekommt es eine neue Kennung – alte Eingaben passen dann nicht mehr.
  return {
    key: `${tileKey(b, c, r)}~${(st.v || 0).toString(36)}`,
    tile: tileKey(b, c, r),
    b,
    c,
    r,
    cat: st.boards[b].cats[c].name,
    value: tileValue(st, b, c, r),
    type,
    mode,
    nopts: type === 'choice' ? list(question.options).filter((o) => String(o || '').trim()).length : 0,
    mkind: (question.media && question.media.kind) || null,
    picker: st.turn || null,
  };
}

const EMPTY_Q = {
  text: '',
  media: null,
  options: null,
  unit: null,
  est: null,
  time: 0,
  answering: null,
  attempt: 1,
  tried: {},
  buzz: null,
  deadline: null,
  given: null,
  results: [],
  winner: null,
  solution: null,
  play: null,
  joker: null,
};

/**
 * Feld gewählt: Zuerst kommt die Joker-Runde. Alle sehen Kategorie, Wert und Art der Frage
 * und können einen Joker einsetzen – pro Frage geht nur einer. Danach deckt openQuestion auf.
 */
export function pickTile(st, { b, c, r, question, now, defaultMode = 'turn', jokerMs = JOKER_MS }) {
  if (!canPick(st, b, c, r)) return st;
  const q = { ...EMPTY_Q, ...questionMeta(st, { b, c, r, question, defaultMode }), stage: 'joker', pickedAt: now, jokerUntil: now + jokerMs, jpass: {}, revealedAt: null };
  let s = bump({ ...st, phase: 'question', q });
  // Hat der Host auf dem Board schon einen Joker gesetzt, gilt er für diese Frage – dann geht keiner mehr.
  if (s.jarm) s = applyArmed(s, now);
  return s;
}

/** Ende der Joker-Runde: Frage aufdecken. `question` ist die vollständige Frage aus dem lokalen Quiz des Hosts. */
export function openQuestion(st, { question, now, window = 600, media = null }) {
  const q = st.q;
  if (st.phase !== 'question' || !q || q.stage !== 'joker') return st;
  const base = { ...q };
  delete base.jokerUntil;
  delete base.jpass;
  delete base.pickedAt;
  return startQuestion(st, base, { question, now, window, media });
}

/**
 * Frage ohne Joker-Runde aufdecken. Übernommen werden nur die öffentlichen Teile
 * (Text, Medium, Antwortmöglichkeiten – keine Lösung).
 */
export function reveal(st, { b, c, r, question, now, defaultMode = 'turn', window = 600, media = null }) {
  if (!canPick(st, b, c, r)) return st;
  return startQuestion(st, { ...EMPTY_Q, ...questionMeta(st, { b, c, r, question, defaultMode }) }, { question, now, window, media });
}

/** Wer bei Reihum und Solo zuerst antwortet: wer gewählt hat – außer, die Person setzt aus. */
function firstAnswerer(st, picker) {
  const order = list(st.order);
  if (!picker || !order.includes(picker)) return null;
  if (!sitsOut(st, picker)) return picker;
  const i = order.indexOf(picker);
  for (let k = 1; k < order.length; k++) {
    const cand = order[(i + k) % order.length];
    if (!sitsOut(st, cand)) return cand;
  }
  return null;
}

function startQuestion(st, base, { question, now, window, media }) {
  const type = base.type;
  const own = Math.max(0, Math.min(600, Math.round(Number(question.time) || 0)));
  const time = own || st.rules.answerTime || 0;
  const q = {
    ...base,
    text: String(question.question || ''),
    media: media || null,
    options: type === 'choice' ? list(question.options).map(String) : null,
    unit: type === 'estimate' ? String(question.unit || '') : null,
    est: type === 'estimate' ? publicEstimate(question) : null,
    time,
    stage: 'answer',
    answering: null,
    attempt: 1,
    tried: {},
    buzz: null,
    deadline: null,
    given: null,
    results: [],
    winner: null,
    solution: null,
    play: null,
    revealedAt: now,
  };
  let s = bump({ ...st, phase: 'question', q });
  if (s.jarm) s = applyArmed(s, now);
  const mode = q.mode;
  const first = mode === 'turn' || mode === 'solo' ? firstAnswerer(s, q.picker) : null;
  if (mode === 'buzzer' || ((mode === 'turn' || mode === 'solo') && !first)) {
    // Bei Video oder Ton öffnet der Buzzer erst, wenn die Wiedergabe startet (siehe setPlay).
    const delay = q.media && PLAYABLE.includes(q.media.kind) ? MEDIA_BUZZ_WAIT : readDelay(q.text);
    s = openBuzzer(s, { now, delay, window });
  } else if (mode === 'all') {
    s = { ...s, q: { ...s.q, stage: 'all', deadline: time ? now + readDelay(q.text) + time * 1000 : null } };
  } else {
    s = { ...s, q: { ...s.q, answering: first, owner: first, deadline: time ? now + time * 1000 : null } };
  }
  return s;
}

/** Was bei einer Schätzfrage alle wissen dürfen: der Fehlerbereich und wie gewertet wird – nicht die Zahl. */
function publicEstimate(question) {
  const tol = question.tolerance && Number(question.tolerance.value) > 0 ? { value: Number(question.tolerance.value), mode: question.tolerance.mode === 'pct' ? 'pct' : 'abs' } : null;
  return { tol, scoring: EST_SCORING[question.scoring] ? question.scoring : 'closest' };
}

const answerMs = (st) => ((st.q && st.q.time) || st.rules.answerTime || 0) * 1000;
export const PLAYABLE = ['video', 'audio', 'youtube'];
const MEDIA_BUZZ_WAIT = 60000;
const fxOf = (st, type) => (st.fx && st.fx[type]) || {};

/** Darf diese Person bei der aktuellen Frage überhaupt antworten? (Aussetzen-Joker) */
export const sitsOut = (st, uid) => !!fxOf(st, 'skip')[uid];

export function eligibleForBuzz(st) {
  const tried = (st.q && st.q.tried) || {};
  return list(st.order).filter((u) => !tried[u] && !sitsOut(st, u));
}

export function openBuzzer(st, { now, delay = 1500, window = 600 }) {
  if (!st.q) return st;
  const id = ((st.q.buzz && st.q.buzz.id) || 0) + 1;
  return bump({
    ...st,
    q: {
      ...st.q,
      stage: 'buzz',
      answering: null,
      attempt: (st.q.attempt || 1) + 1,
      deadline: null,
      buzz: { id, openAt: now + delay, window, times: null, winner: null },
    },
  });
}

/** Buzzer jetzt sofort freigeben (Host tippt "Jetzt öffnen"). */
export function openBuzzerNow(st, { now }) {
  if (!st.q || st.q.stage !== 'buzz' || !st.q.buzz || st.q.buzz.openAt <= now) return st;
  return bump({ ...st, q: { ...st.q, buzz: { ...st.q.buzz, openAt: now } } });
}

/**
 * Buzzer auswerten. entries = [{ uid, id, reaction }] in Ankunftsreihenfolge.
 * Gewinnt die kleinste eigene Reaktionszeit – nicht, wessen Signal zuerst ankam.
 */
export function resolveBuzz(st, entries, { now }) {
  if (!st.q || st.q.stage !== 'buzz' || !st.q.buzz) return st;
  const eligible = new Set(eligibleForBuzz(st));
  const valid = entries.filter(
    (e) => e && e.id === st.q.buzz.id && eligible.has(e.uid) && typeof e.reaction === 'number' && e.reaction >= MIN_REACTION
  );
  if (!valid.length) return st;
  let best = valid[0];
  valid.forEach((e) => {
    if (e.reaction < best.reaction) best = e;
  });
  const times = {};
  valid.forEach((e) => {
    if (!(e.uid in times)) times[e.uid] = Math.round(e.reaction);
  });
  return bump({
    ...st,
    q: {
      ...st.q,
      stage: 'answer',
      answering: best.uid,
      attempt: st.q.attempt + 1,
      deadline: answerMs(st) ? now + answerMs(st) : null,
      buzz: { ...st.q.buzz, times, winner: best.uid },
    },
  });
}

/** Antwort eines Geräts übernehmen (Text oder Auswahl). */
/** Eingabe eines Geräts in die feste Form bringen (Text, Auswahl oder Zahl). */
export function givenOf(q, answer) {
  if (q.type === 'estimate') {
    const num = answer.num != null && answer.num !== '' ? Number(answer.num) : parseNumber(answer.text);
    if (Number.isFinite(num)) return { num };
  }
  if (answer.choice != null) {
    const i = Number(answer.choice);
    if (Number.isInteger(i) && i >= 0 && i < list(q.options).length) return { choice: i };
    return { text: '' };
  }
  return { text: String(answer.text == null ? '' : answer.text).slice(0, 200) };
}

export function receiveAnswer(st, uid, answer) {
  const q = st.q;
  if (!q || !answer || answer.key !== q.key || answer.attempt !== q.attempt) return st;
  const given = givenOf(q, answer);
  if (q.stage === 'answer' && q.answering === uid) {
    return bump({ ...st, q: { ...q, stage: 'review', given: { [uid]: given } } });
  }
  if (q.stage === 'all' && list(st.order).includes(uid) && !sitsOut(st, uid) && !(q.given && q.given[uid])) {
    // Nur ein Merker „hat abgegeben“: Der Spielstand ist für alle lesbar, die Antworten selbst
    // kennt bis zum Auswerten nur der Host (fillAnswers setzt sie dann ein).
    const all = { ...(q.given || {}), [uid]: true };
    const done = list(st.order).filter((u) => !sitsOut(st, u)).every((u) => all[u]);
    return bump({ ...st, q: { ...q, given: all, stage: done ? 'review' : 'all' } });
  }
  return st;
}

/**
 * Setzt beim Auswerten einer „Alle“-Frage die echten Antworten aus den Eingaben ein.
 * inputs = { uid: { answer: { key, attempt, text | choice } } } – nur der Host kann sie lesen.
 */
export function fillAnswers(st, inputs) {
  const q = st && st.q;
  if (!q || q.mode !== 'all' || q.stage !== 'review' || !q.given) return st;
  const marked = Object.keys(q.given).filter((uid) => q.given[uid] === true);
  if (!marked.length) return st;
  const given = { ...q.given };
  marked.forEach((uid) => {
    const ans = inputs && inputs[uid] && inputs[uid].answer;
    if (ans && ans.key === q.key && ans.attempt === q.attempt) given[uid] = givenOf(q, ans);
    else delete given[uid];
  });
  return bump({ ...st, q: { ...q, given } });
}

/** Zur Auswertung wechseln (Host tippt "Auswerten" oder die Zeit ist um). */
export function toReview(st) {
  const q = st.q;
  if (!q || (q.stage !== 'answer' && q.stage !== 'all')) return st;
  return bump({ ...st, q: { ...q, stage: 'review', given: q.given || {} } });
}

export function timeout(st, { now }) {
  const q = st.q;
  if (!q || !q.deadline || now < q.deadline || (q.stage !== 'answer' && q.stage !== 'all')) return st;
  const given = q.stage === 'answer' && q.answering ? { ...(q.given || {}), [q.answering]: { timeout: true } } : q.given || {};
  return bump({ ...st, q: { ...q, stage: 'review', given } });
}

// ---------- Wertung ----------

export function scoreDelta(value, ok, { stolen = false, rules = DEFAULT_RULES } = {}) {
  if (ok) return stolen && rules.stealHalf ? Math.round(value / 2) : value;
  if (rules.penalty === 'full') return -value;
  if (rules.penalty === 'half') return -Math.round(value / 2);
  return 0;
}

export function applyScore(score, delta, rules = DEFAULT_RULES) {
  const s = (score || 0) + delta;
  return rules.negative ? s : Math.max(0, s);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Vergleichsform: klein, ohne Akzente/Satzzeichen/Artikel. expand = Umlaute als ae/oe/ue. */
export const norm = (s, expand = false) => {
  let t = String(s || '').toLowerCase();
  if (expand) t = t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  return t
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/^(der|die|das|the|ein|eine|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
};

/** Ähnlichkeit 0–1; „Grün“, „grun“ und „gruen“ gelten als gleich. */
export function similarity(a, b) {
  let best = 0;
  [false, true].forEach((expand) => {
    const x = norm(a, expand);
    const y = norm(b, expand);
    if (x && y) best = Math.max(best, 1 - levenshtein(x, y) / Math.max(x.length, y.length));
  });
  return best;
}

/** Vorschlag für Freitext: passt die Antwort zur Lösung oder einer erlaubten Alternative? */
export function checkText(given, answer, accept = []) {
  const candidates = [answer, ...list(accept)].filter((c) => String(c || '').trim());
  let best = { ok: false, sim: 0, match: null };
  const g = norm(given);
  candidates.forEach((c) => {
    const sim = similarity(given, c);
    const n = norm(c);
    const contained = n.length >= 4 && g.includes(n) && g.length <= n.length * 2.5;
    const ok = sim >= 0.82 || contained;
    if (ok && !best.ok) best = { ok, sim: Math.max(sim, contained ? 0.9 : 0), match: c };
    else if (!best.ok && sim > best.sim) best = { ok: false, sim, match: c };
  });
  return best;
}

/** Automatischer Vorschlag für eine gegebene Antwort. ok = true/false, null = unklar. */
// ---------- Schätzfragen ----------

/**
 * Zahl aus einer Eingabe lesen: „1.234“ = 1234, „1,5“ = 1,5, „1.234,5“ = 1234,5, „12 Mio“ = 12000000.
 * Gibt NaN zurück, wenn keine Zahl drinsteht.
 */
export function parseNumber(input) {
  let t = String(input ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return NaN;
  let factor = 1;
  const units = [[/(mrd|milliarden?)\.?$/, 1e9], [/(mio|millionen?)\.?$/, 1e6], [/(tsd|tausend)\.?$/, 1e3], [/k$/, 1e3]];
  for (const [re, f] of units) {
    if (re.test(t)) {
      factor = f;
      t = t.replace(re, '');
      break;
    }
  }
  t = t.replace(/[^0-9.,\-]/g, '');
  if (!/[0-9]/.test(t)) return NaN;
  const neg = t.startsWith('-');
  t = t.replace(/-/g, '');
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // beides: das letzte Zeichen ist das Komma (Dezimaltrenner)
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    t = t.split(thou).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    const parts = t.split(',');
    t = parts.length > 2 ? parts.join('') : parts.join('.'); // deutsches Dezimalkomma
  } else if (lastDot >= 0) {
    const parts = t.split('.');
    // „1.234“ oder „1.234.567“ = Tausenderpunkte; „1.5“ = Dezimalpunkt
    t = parts.length > 2 || (parts.length === 2 && parts[1].length === 3) ? parts.join('') : parts.join('.');
  }
  const n = Number(t) * factor;
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

export const fmtNumber = (n) => (Number.isFinite(n) ? Number(n).toLocaleString('de-DE', { maximumFractionDigits: 3 }) : '–');

export function tolText(tol, unit = '') {
  if (!tol) return 'Nur die genaue Zahl zählt.';
  return tol.mode === 'pct' ? `Bis ${fmtNumber(tol.value)} % daneben zählt noch.` : `Bis ${fmtNumber(tol.value)}${unit ? ' ' + unit : ''} daneben zählt noch.`;
}

export function withinTolerance(num, target, tol) {
  if (!Number.isFinite(num) || !Number.isFinite(target)) return false;
  const d = Math.abs(num - target);
  if (!tol || !(tol.value > 0)) return d < 1e-9;
  return tol.mode === 'pct' ? d <= (Math.abs(target) * tol.value) / 100 + 1e-9 : d <= tol.value + 1e-9;
}

function distText(num, target, unit) {
  const d = Math.abs(num - target);
  if (d < 1e-9) return 'genau richtig';
  const pct = target ? ` (${fmtNumber(Math.round((d / Math.abs(target)) * 1000) / 10)} %)` : '';
  return `${fmtNumber(d)}${unit ? ' ' + unit : ''} daneben${pct}`;
}

/**
 * Vorschlag für Schätzfragen. single = eine Person antwortet (Fehlerbereich zählt),
 * sonst entscheidet die Wertung: nächste gewinnt, weiteste verliert oder alle im Bereich.
 */
export function estimateVerdicts(question, rows, { single }) {
  const target = Number(question.number);
  const tol = question.tolerance && Number(question.tolerance.value) > 0 ? question.tolerance : null;
  const unit = question.unit || '';
  const nums = rows.filter((r) => r.given && Number.isFinite(r.given.num));
  const dist = (r) => Math.abs(r.given.num - target);
  const scoring = single ? 'range' : question.scoring || 'closest';
  const min = nums.length ? Math.min(...nums.map(dist)) : null;
  const max = nums.length ? Math.max(...nums.map(dist)) : null;
  return rows.map((r) => {
    if (!r.given || !Number.isFinite(r.given.num)) return { ...r, ok: r.given ? false : null, reason: r.given ? 'keine Zahl' : 'keine Antwort' };
    const d = dist(r);
    const where = distText(r.given.num, target, unit);
    if (scoring === 'closest') return { ...r, ok: d === min, reason: d === min ? `am nächsten dran, ${where}` : where };
    if (scoring === 'farthest' && nums.length >= 2) return { ...r, ok: d !== max, reason: d === max ? `am weitesten weg, ${where}` : where };
    const ok = withinTolerance(r.given.num, target, tol);
    return { ...r, ok, reason: where };
  });
}

/** Punkte nach Jokern: Doppelt verdoppelt, Schutzschild nimmt den Abzug weg. */
export function effectiveDelta(st, uid, delta) {
  let d = delta;
  if (fxOf(st, 'double')[uid]) d *= 2;
  if (fxOf(st, 'shield')[uid] && d < 0) d = 0;
  return d;
}

export function autoVerdict(question, given) {
  if (!given || given.timeout) return { ok: false, reason: 'keine Antwort' };
  if (given.choice != null) {
    const ok = Number(given.choice) === Number(question.correct);
    return { ok, reason: ok ? 'richtige Auswahl' : 'falsche Auswahl' };
  }
  if (given.text != null) {
    if (!String(given.text).trim()) return { ok: false, reason: 'leer' };
    const res = checkText(given.text, question.answer, question.accept);
    return { ok: res.ok, reason: res.ok ? `passt zu „${res.match}“` : 'passt nicht zur Lösung' };
  }
  return { ok: null, reason: '' };
}

/**
 * Punktevorschlag für den Host. Ergebnis: [{ uid, given, ok, reason, delta }].
 * Wer nur im Discord antwortet, hat keine Eingabe – dann ist ok = null und der Host entscheidet.
 */
export function proposal(st, question) {
  const q = st.q;
  if (!q) return [];
  let rows = [];
  const stolenFor = (uid) => q.mode === 'turn' && (q.owner || q.picker) && uid !== (q.owner || q.picker);
  if (q.mode === 'all') {
    list(st.order)
      .filter((uid) => !sitsOut(st, uid))
      .forEach((uid) => {
        const raw = q.given && q.given[uid];
        rows.push({ uid, given: raw && raw !== true ? raw : null, loading: raw === true });
      });
  } else if (q.answering) {
    const raw = q.given && q.given[q.answering];
    rows.push({ uid: q.answering, given: raw && raw !== true ? raw : null, oral: !raw });
  }
  if (q.type === 'estimate') {
    rows = estimateVerdicts(question, rows, { single: q.mode !== 'all' }).map((row) =>
      row.oral && !row.given ? { ...row, ok: null, reason: 'mündlich' } : row
    );
  } else {
    rows = rows.map((row) => {
      if (row.given) return { ...row, ...autoVerdict(question, row.given) };
      return { ...row, ok: null, reason: row.loading ? 'Antwort wird geladen' : row.oral ? 'mündlich' : 'keine Antwort' };
    });
  }
  return rows.map((row) => ({
    uid: row.uid,
    given: row.given,
    ok: row.ok,
    reason: row.reason,
    delta: row.ok == null ? 0 : effectiveDelta(st, row.uid, scoreDelta(q.value, row.ok, { stolen: stolenFor(row.uid), rules: st.rules })),
  }));
}

export function judge(st, verdicts, { now, custom = {}, window = 600 } = {}) {
  const q = st.q;
  if (!q || q.stage === 'closed' || q.stage === 'buzz') return st;
  const stolenFor = (uid) => q.mode === 'turn' && (q.owner || q.picker) && uid !== (q.owner || q.picker);
  const entries = Object.entries(verdicts || {}).filter(([uid, ok]) => ok === true || ok === false || uid in custom);
  const results = list(q.results).slice();
  const tried = { ...(q.tried || {}) };
  let s = withHistory(st, '');
  const scores = { ...(s.scores || {}) };
  let winner = null;
  entries.forEach(([uid, ok]) => {
    const delta = uid in custom ? Math.round(Number(custom[uid]) || 0) : effectiveDelta(st, uid, scoreDelta(q.value, ok, { stolen: stolenFor(uid), rules: st.rules }));
    scores[uid] = uid in custom ? (scores[uid] || 0) + delta : applyScore(scores[uid], delta, st.rules);
    results.push({ uid, ok: ok === true, delta });
    if (ok === true && !winner) winner = uid;
    tried[uid] = true;
  });
  const history = list(s.history);
  history[history.length - 1].label = `${q.cat} ${q.value}`;
  history[history.length - 1].deltas = Object.fromEntries(results.slice(list(q.results).length).map((r) => [r.uid, r.delta]));
  s = { ...s, history, scores, q: { ...q, results, tried, given: q.given } };

  if (q.mode === 'all' || winner) return closeQuestion(s, { now, winner });

  // niemand richtig – wie geht es weiter?
  const answered = q.answering;
  if (q.mode === 'solo') return closeQuestion(s, { now, winner: null });
  if (q.mode === 'turn' && st.afterWrong === 'none') return closeQuestion(s, { now, winner: null });
  if (q.mode === 'turn' && st.afterWrong === 'next') {
    const order = list(st.order);
    const start = order.indexOf(answered);
    for (let k = 1; k <= order.length; k++) {
      const cand = order[(start + k) % order.length];
      if (!s.q.tried[cand] && !sitsOut(s, cand)) {
        return bump({
          ...s,
          q: { ...s.q, stage: 'answer', answering: cand, attempt: s.q.attempt + 1, given: null, deadline: answerMs(s) ? now + answerMs(s) : null },
        });
      }
    }
    return closeQuestion(s, { now, winner: null });
  }
  // Buzzer für alle, die noch nicht dran waren
  if (!eligibleForBuzz(s).length) return closeQuestion(s, { now, winner: null });
  return openBuzzer({ ...s, q: { ...s.q, given: null } }, { now, delay: 1500, window });
}

export function closeQuestion(st, { now, winner = null }) {
  const q = st.q;
  if (!q) return st;
  const used = { ...(st.used || {}), [q.tile || tileKey(q.b, q.c, q.r)]: { by: winner || null } };
  // Joker gelten genau für eine Frage – danach ist ihre Wirkung vorbei.
  return bump({ ...st, used, fx: {}, q: { ...q, stage: 'closed', winner: winner || null, answering: null, deadline: null, closedAt: now } });
}

/** Joker „Neues Feld“: Das Feld bleibt offen, dieselbe Person wählt gleich ein anderes. */
export function swapQuestion(st, uid) {
  const q = st.q;
  if (!q || q.picker !== uid) return st;
  return bump({ ...st, phase: 'board', q: null, turn: uid, fx: {} });
}

/** Timer der Frage ändern: +Sekunden, anhalten oder neu starten. */
export function changeDeadline(st, { now, op, seconds = 10 }) {
  const q = st.q;
  if (!q || (q.stage !== 'answer' && q.stage !== 'all')) return st;
  let deadline = q.deadline;
  if (op === 'add') deadline = Math.max(deadline || now, now) + seconds * 1000;
  else if (op === 'stop') deadline = null;
  else if (op === 'restart') deadline = now + ((q.time || st.rules.answerTime || 30) * 1000);
  if (deadline === q.deadline) return st;
  return bump({ ...st, q: { ...q, deadline } });
}

/** Wiedergabe von Video oder Ton für alle steuern. pos in Sekunden ab Medienbeginn. */
export function mediaPos(play, now, start = 0) {
  if (!play) return start;
  return play.state === 'play' ? play.pos + Math.max(0, now - play.at) / 1000 : play.pos;
}

export function setPlay(st, { state, now }) {
  const q = st.q;
  if (!q || !q.media) return st;
  const start = Number(q.media.start) || 0;
  const end = Number(q.media.end) || null;
  let pos = mediaPos(q.play, now, start);
  if (end && pos >= end) pos = start;
  let next;
  if (state === 'restart') next = { state: 'play', pos: start, at: now };
  else if (state === 'play') next = { state: 'play', pos, at: now };
  else next = { state: 'pause', pos: Math.min(pos, end || pos), at: now };
  let buzz = q.buzz;
  // Buzzer-Frage mit Video/Ton: kurz nach dem Start der Wiedergabe geht der Buzzer auf
  if (next.state === 'play' && q.stage === 'buzz' && buzz && buzz.openAt > now + 1000) buzz = { ...buzz, openAt: now + 1000 };
  return bump({ ...st, q: { ...q, play: next, buzz } });
}

/** Niemand weiß es / Frage ohne Wertung schließen. */
export function skipQuestion(st, { now }) {
  if (!st.q || st.q.stage === 'closed') return st;
  return closeQuestion(st, { now, winner: null });
}

/** Frage zurücklegen: das Feld bleibt offen, als wäre nichts passiert (z. B. falsch angetippt). Ein Joker kommt zurück. */
export function putBack(st) {
  if (!st.q || list(st.q.results).length) return st;
  let jokers = st.jokers;
  const j = st.q.joker;
  if (j && j.uid && !j.free && isJoker(j.type) && jokers && jokers.left && jokers.left[j.uid]) {
    const mine = jokersLeft(st, j.uid);
    jokers = { ...jokers, left: { ...jokers.left, [j.uid]: { ...mine, [j.type]: mine[j.type] + 1 } } };
  }
  return bump({ ...st, phase: 'board', q: null, fx: {}, jokers });
}

export function showSolution(st, text, solMedia = null, extra = null) {
  if (!st.q) return st;
  return bump({ ...st, q: { ...st.q, ...(extra || {}), solution: String(text || ''), solMedia: solMedia || null } });
}

/** Zurück zum Board. Reihum ist die nächste Person nach der, die gewählt hat, dran. */
export function backToBoard(st) {
  if (!st.q || st.q.stage !== 'closed') return st;
  const order = list(st.order);
  let turn = st.turn;
  if (st.rules.winnerPicks && st.q.winner && order.includes(st.q.winner)) turn = st.q.winner;
  else turn = nextInOrder(order, st.q.picker || st.turn, order);
  return bump({ ...st, phase: 'board', q: null, turn });
}

export function standings(st) {
  const order = list(st.order);
  const scores = st.scores || {};
  const ids = [...new Set([...order, ...Object.keys(scores)])];
  const sorted = ids.sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
  let place = 0;
  let last = null;
  return sorted.map((uid, i) => {
    const score = scores[uid] || 0;
    if (score !== last) {
      place = i + 1;
      last = score;
    }
    return { uid, score, place };
  });
}

// ---------- Joker ----------

const clampCount = (n) => Math.max(0, Math.min(9, Math.round(Number(n) || 0)));

/** Wie viele Joker jede Person bekommt (Lobby: gilt sofort für alle, im Spiel für Neue). */
export function setJokerSet(st, type, n) {
  if (!JOKER_IDS.includes(type) || (type === 'swap' && st.jokerMode === 'board' && Number(n) > 0)) return st;
  const jk = st.jokers || { set: { ...NO_JOKERS }, left: {} };
  const v = clampCount(n);
  if ((jk.set || {})[type] === v) return st;
  const set = { ...NO_JOKERS, ...(jk.set || {}), [type]: v };
  let left = jk.left || {};
  if (st.phase === 'lobby') {
    left = Object.fromEntries(list(st.order).map((u) => [u, { ...NO_JOKERS, ...(left[u] || {}), [type]: v }]));
  }
  return bump({ ...st, jokers: { set, left } });
}

/** Host gibt oder nimmt einer Person einen Joker. */
export function giveJoker(st, uid, type, delta) {
  if (!JOKER_IDS.includes(type) || !list(st.order).includes(uid)) return st;
  const jk = st.jokers || { set: { ...NO_JOKERS }, left: {} };
  const mine = { ...NO_JOKERS, ...((jk.left || {})[uid] || {}) };
  const v = clampCount(mine[type] + delta);
  if (v === mine[type]) return st;
  return bump({ ...st, jokers: { ...jk, left: { ...(jk.left || {}), [uid]: { ...mine, [type]: v } } } });
}

export const jokersLeft = (st, uid) => ({ ...NO_JOKERS, ...((st.jokers && st.jokers.left && st.jokers.left[uid]) || {}) });
export const jokersInGame = (st) => JOKER_IDS.some((j) => ((st.jokers && st.jokers.set) || {})[j] > 0) || Object.values((st.jokers && st.jokers.left) || {}).some((m) => JOKER_IDS.some((j) => m[j] > 0));

/** Wie Joker eingesetzt werden: in der Joker-Runde nach der Feldwahl oder vorher auf dem Board. */
export const JOKER_MODES = {
  round: { name: 'Joker-Runde', help: 'Nach der Feldwahl gibt es eine kurze Joker-Runde. Alle sehen Kategorie, Wert und Art der Frage und können einen Joker einsetzen, bevor die Frage aufgeht.' },
  board: { name: 'Auf dem Board', help: 'Joker werden auf dem Board eingesetzt und gelten für die nächste Frage. Passt ein Joker dann nicht zur Frage, bekommt die Person ihn automatisch zurück.' },
};
export const isJoker = (type) => typeof type === 'string' && Object.prototype.hasOwnProperty.call(JOKERS, type);
export const jokerModeOf = (st) => (st && st.jokerMode === 'board' ? 'board' : 'round');

/** Joker-Art festlegen – nur vor dem Spielstart. */
export function setJokerMode(st, mode) {
  if (st.phase !== 'lobby' || !Object.prototype.hasOwnProperty.call(JOKER_MODES, mode) || jokerModeOf(st) === mode) return st;
  let s = { ...st, jokerMode: mode };
  // „Neues Feld“ braucht ein gewähltes Feld – auf dem Board gibt es ihn nicht.
  if (mode === 'board') s = setJokerSet({ ...s, v: s.v }, 'swap', 0);
  return bump(s);
}

/** Welche Joker es in dieser Joker-Art überhaupt gibt („Neues Feld“ braucht ein gewähltes Feld). */
export const jokerTypesFor = (st) => (jokerModeOf(st) === 'board' ? JOKER_IDS.filter((j) => j !== 'swap') : JOKER_IDS);

/**
 * Kann diese Person bei der gewählten Frage überhaupt antworten? Bei Solo (und Reihum ohne
 * Weitergeben) antwortet nur, wer gewählt hat – sonst kann es jede Person werden.
 */
function mayAnswer(st, uid) {
  const q = st.q;
  if (!q || !q.picker) return true;
  if (q.mode === 'solo' || (q.mode === 'turn' && st.afterWrong === 'none')) return uid === q.picker;
  return true;
}

function skipTargetWhy(st, uid, target) {
  if (!target || !list(st.order).includes(target)) return 'Wähl aus, wer aussetzen soll.';
  if (target === uid) return 'Du kannst dich nicht selbst aussetzen lassen.';
  if (st.q && !mayAnswer(st, target)) return 'Diese Person antwortet bei dieser Frage sowieso nicht.';
  return '';
}

/** Wen diese Person gerade aussetzen lassen kann. */
export const skipTargets = (st, uid) => list(st.order).filter((u) => !skipTargetWhy(st, uid, u));

export const inJokerRound = (st) => st.phase === 'question' && !!st.q && st.q.stage === 'joker';

const NO_PENALTY = 'Falsche Antworten kosten gerade keine Punkte – der Schild bringt nichts.';

/**
 * Passt dieser Joker zur gewählten Frage (st.q)? Leer heißt ja.
 * Beim Aussetzen ohne Ziel heißt leer: Es gibt jemanden, den man aussetzen lassen kann.
 */
function fitWhy(st, uid, type, target) {
  const q = st.q;
  const notMine = 'Bei dieser Frage antwortet nur, wer das Feld gewählt hat.';
  switch (type) {
    case 'double':
      return mayAnswer(st, uid) ? '' : notMine;
    case 'shield':
      if (!st.rules || !st.rules.penalty || st.rules.penalty === 'none') return NO_PENALTY;
      return mayAnswer(st, uid) ? '' : notMine;
    case 'skip':
      if (target == null) return skipTargets(st, uid).length ? '' : 'Bei dieser Frage kann niemand aussetzen.';
      return skipTargetWhy(st, uid, target);
    case 'peek':
      return q.mode === 'all' ? '' : 'Geht nur bei Fragen, die alle gleichzeitig beantworten.';
    case 'fifty':
      if (q.type !== 'choice' || (q.nopts || 0) < 3) return 'Geht nur bei Auswahlfragen mit mindestens drei Antworten.';
      return mayAnswer(st, uid) ? '' : notMine;
    case 'swap':
      return q.picker && q.picker === uid ? '' : 'Nur wer das Feld gewählt hat, kann es tauschen.';
    default:
      return 'Diesen Joker gibt es nicht.';
  }
}

/** Joker-Runde: Warum dieser Joker gerade nicht geht – leer, wenn er geht. */
export function jokerBlocked(st, uid, type, target = null) {
  if (!isJoker(type)) return 'Diesen Joker gibt es nicht.';
  if (!list(st.order).includes(uid)) return 'Du spielst gerade nicht mit.';
  if (!(jokersLeft(st, uid)[type] > 0)) return 'Du hast keinen mehr.';
  if (!inJokerRound(st)) {
    return st.phase === 'question' && st.q && st.q.stage !== 'closed'
      ? 'Zu spät – die Frage ist schon aufgedeckt.'
      : 'Joker setzt du ein, nachdem ein Feld gewählt ist – bevor die Frage aufgeht.';
  }
  if (st.q.joker) return 'Für diese Frage ist schon ein Joker eingesetzt.';
  return fitWhy(st, uid, type, target);
}

/** Welche Joker diese Person bei der gewählten Frage einsetzen könnte. */
export const usableJokers = (st, uid) => JOKER_IDS.filter((j) => !jokerBlocked(st, uid, j));

/**
 * Board-Modus: Warum dieser Joker gerade nicht für die nächste Frage eingesetzt werden kann.
 * Was erst von der Frage abhängt (z. B. Spicken nur bei „Alle“), prüft die App beim Aufdecken.
 */
export function armBlocked(st, uid, type, target = null) {
  if (!isJoker(type)) return 'Diesen Joker gibt es nicht.';
  if (!list(st.order).includes(uid)) return 'Du spielst gerade nicht mit.';
  if (type === 'swap') return '„Neues Feld“ gibt es nur mit Joker-Runde.';
  if (!(jokersLeft(st, uid)[type] > 0)) return 'Du hast keinen mehr.';
  if (st.phase !== 'board') return st.phase === 'question' ? 'Gerade läuft eine Frage. Joker gehen wieder auf dem Board.' : 'Das Spiel läuft gerade nicht.';
  if (st.jarm) return st.jarm.uid === uid ? 'Du hast schon einen Joker für die nächste Frage eingesetzt.' : 'Für die nächste Frage ist schon ein Joker eingesetzt.';
  if (type === 'shield' && (!st.rules || !st.rules.penalty || st.rules.penalty === 'none')) return NO_PENALTY;
  if (type === 'skip') {
    if (target == null) return skipTargets(st, uid).length ? '' : 'Gerade kann niemand aussetzen.';
    return skipTargetWhy(st, uid, target);
  }
  return '';
}

export const armableJokers = (st, uid) => jokerTypesFor(st).filter((j) => !armBlocked(st, uid, j));

function takeJoker(st, uid, type) {
  const mine = jokersLeft(st, uid);
  if (!(mine[type] > 0)) return st;
  return { ...st, jokers: { ...st.jokers, left: { ...(st.jokers.left || {}), [uid]: { ...mine, [type]: mine[type] - 1 } } } };
}

function returnJoker(st, uid, type) {
  if (!uid || !isJoker(type)) return st;
  const jk = st.jokers || { set: { ...NO_JOKERS }, left: {} };
  const mine = jokersLeft(st, uid);
  return { ...st, jokers: { ...jk, left: { ...(jk.left || {}), [uid]: { ...mine, [type]: clampCount(mine[type] + 1) } } } };
}

const logJoker = (st, entry) => ({ ...st, jlog: [...list(st.jlog).slice(-5), entry] });

/** Joker für die aktuelle Frage wirksam machen (Wirkung in fx, Merker in q.joker). */
function applyJoker(st, j) {
  const who = j.type === 'skip' ? j.target : j.uid;
  return { ...st, fx: { ...(st.fx || {}), [j.type]: { [who]: true } }, q: { ...st.q, joker: j } };
}

/**
 * Beim Aufdecken (Board-Modus): Der vorher eingesetzte Joker gilt, wenn er zur Frage passt –
 * sonst bekommt die Person ihn zurück. Vom Host gesetzte Joker (force) gelten immer.
 */
function applyArmed(st, now) {
  const a = st.jarm;
  if (!a) return st;
  let s = { ...st, jarm: null };
  if (!list(s.order).includes(a.uid) || (a.type === 'skip' && !list(s.order).includes(a.target))) {
    return a.free ? s : returnJoker(s, a.uid, a.type);
  }
  const why = a.force ? '' : fitWhy(s, a.uid, a.type, a.target);
  if (why) return logJoker(returnJoker(s, a.uid, a.type), { id: `${a.id}-back`, type: a.type, uid: a.uid, target: a.target || null, at: now, back: why });
  s = applyJoker(s, { uid: a.uid, type: a.type, target: a.target || null, at: a.at, ...(a.force ? { by: 'host' } : {}), ...(a.free ? { free: true } : {}) });
  return logJoker(s, { id: `${a.id}-on`, type: a.type, uid: a.uid, target: a.target || null, at: now });
}

/**
 * Eingabe zu Jokern vom Gerät einer Person. Jede id zählt nur einmal; geht etwas nicht,
 * steht der Grund in jrej[uid] (die Person behält ihren Joker).
 * Joker-Runde: { id, key, type, target } oder { id, key, pass: true }.
 * Board-Modus: { id, type, target } zum Einsetzen für die nächste Frage, { id, cancel: true } zum Zurücknehmen.
 */
export function useJoker(st, uid, input, { now }) {
  const id = input && input.id;
  if (!id || typeof id !== 'string' || (st.jseen && st.jseen[uid] === id)) return st;
  let s = { ...st, jseen: { ...(st.jseen || {}), [uid]: id } };
  const reject = (why) => bump({ ...s, jrej: { ...(st.jrej || {}), [uid]: { id, why } } });
  const type = input.type;
  const target = typeof input.target === 'string' ? input.target : null;

  if (jokerModeOf(st) === 'board') {
    if (input.cancel) {
      if (st.phase !== 'board' || !st.jarm || st.jarm.uid !== uid) return bump(s);
      const back = st.jarm.free ? { ...s, jarm: null } : returnJoker({ ...s, jarm: null }, uid, st.jarm.type);
      return bump(logJoker(back, { id, type: st.jarm.type, uid, target: st.jarm.target || null, at: now, cancel: true }));
    }
    if (input.pass) return bump(s);
    if (type === 'skip' && !target) return reject('Wähl aus, wer aussetzen soll.');
    const why = armBlocked(s, uid, type, target);
    if (why) return reject(why);
    s = takeJoker(s, uid, type);
    s = { ...s, jarm: { id, uid, type, target: type === 'skip' ? target : null, at: now } };
    return bump(logJoker(s, { id, type, uid, target: type === 'skip' ? target : null, at: now, armed: true }));
  }

  const sameQuestion = !input.key || (st.q && input.key === st.q.key);
  if (input.pass) return bump(sameQuestion ? passJoker(s, uid) : s);
  if (input.cancel) return bump(s);
  if (!sameQuestion) return reject('Die Frage ist schon vorbei.');
  if (type === 'skip' && !target) return reject('Wähl aus, wer aussetzen soll.');
  const why = jokerBlocked(s, uid, type, target);
  if (why) return reject(why);
  s = logJoker(takeJoker(s, uid, type), { id, type, uid, target: type === 'skip' ? target : null, at: now });
  if (type === 'swap') return swapQuestion(s, uid);
  return bump(applyJoker(s, { uid, type, target: type === 'skip' ? target : null, at: now }));
}

/** „Ohne Joker weiter“ in der Joker-Runde. */
export function passJoker(st, uid) {
  const q = st.q;
  if (!inJokerRound(st) || q.joker || !list(st.order).includes(uid) || (q.jpass && q.jpass[uid])) return st;
  return bump({ ...st, q: { ...q, jpass: { ...(q.jpass || {}), [uid]: true } } });
}

/** Host: Joker-Runde verlängern. */
export function extendJokerRound(st, { now, seconds = 10 }) {
  if (!inJokerRound(st) || st.q.joker) return st;
  return bump({ ...st, q: { ...st.q, jokerUntil: Math.max(st.q.jokerUntil || now, now) + seconds * 1000 } });
}

/**
 * Ist die Joker-Runde vorbei? Ja, wenn ein Joker eingesetzt und angesagt ist, die Zeit um ist
 * oder alle, die online sind und einen passenden Joker hätten, „Ohne Joker“ gewählt haben.
 * online = Liste der uids, die gerade verbunden sind.
 */
export function jokerRoundDone(st, { now, online = [] }) {
  if (!inJokerRound(st)) return false;
  const q = st.q;
  if (q.joker) return now >= (q.joker.at || 0) + JOKER_SHOW_MS;
  if (now >= (q.jokerUntil || 0)) return true;
  const deciders = list(st.order).filter((u) => online.includes(u) && usableJokers(st, u).length);
  return deciders.every((u) => q.jpass && q.jpass[u]);
}

// ---------- Joker: Eingriffe des Hosts ----------

/** Der Joker, der gerade gilt: für die offene Frage (q.joker) oder im Board-Modus für die nächste (jarm). */
export function activeJoker(st) {
  if (st.phase === 'question' && st.q && st.q.joker && st.q.stage !== 'closed') return { ...st.q.joker, when: 'now' };
  if (st.phase === 'board' && st.jarm) return { ...st.jarm, when: 'next' };
  return null;
}

/** Warum der Host diesen Joker gerade nicht für uid einsetzen kann. Passt er laut App nicht, darf der Host trotzdem. */
export function hostJokerBlocked(st, uid, type, target = null) {
  if (!isJoker(type)) return 'Diesen Joker gibt es nicht.';
  if (!list(st.order).includes(uid)) return 'Diese Person spielt gerade nicht mit.';
  if (activeJoker(st)) return 'Es gilt schon ein Joker. Gib ihn zuerst zurück.';
  if (type === 'swap') return '„Neues Feld“: Leg die Frage stattdessen zurück.';
  if (type === 'skip') {
    if (!target || !list(st.order).includes(target) || target === uid) return 'Wähl aus, wer aussetzen soll.';
    const q = st.q;
    if (q && q.stage === 'answer' && q.answering === target) return 'Diese Person antwortet gerade.';
  }
  if (st.phase === 'board') return '';
  if (st.phase !== 'question' || !st.q || st.q.stage === 'closed') return 'Gerade läuft keine Frage.';
  if (list(st.q.results).some((r) => r.uid === (type === 'skip' ? target : uid))) return 'Diese Person ist bei der Frage schon gewertet.';
  return '';
}

/**
 * Host setzt einen Joker für eine Person ein – auch wenn die App ihn für unpassend hält.
 * Auf dem Board gilt er für die nächste Frage, sonst sofort. Hat die Person noch einen, wird er abgezogen.
 */
export function hostSetJoker(st, uid, type, target = null, { now }) {
  if (hostJokerBlocked(st, uid, type, target)) return st;
  const free = !(jokersLeft(st, uid)[type] > 0); // hat die Person keinen mehr, schenkt der Host ihn
  const j = { uid, type, target: type === 'skip' ? target : null, at: now, ...(free ? { free: true } : {}) };
  let s = takeJoker(st, uid, type);
  const id = `host-${now}`;
  if (st.phase === 'board') {
    s = { ...s, jarm: { id, ...j, force: true } };
    return bump(logJoker(s, { id, ...j, armed: true, by: 'host' }));
  }
  s = applyJoker(s, { ...j, by: 'host' });
  return bump(logJoker(s, { id, ...j, by: 'host' }));
}

/** Host gibt den gerade geltenden Joker zurück: Die Wirkung ist weg, die Person bekommt ihn wieder. */
export function hostReturnJoker(st, { now }) {
  const a = activeJoker(st);
  if (!a) return st;
  let s = a.free ? st : returnJoker(st, a.uid, a.type);
  if (a.when === 'next') s = { ...s, jarm: null };
  else {
    const fx = { ...(s.fx || {}) };
    delete fx[a.type];
    s = { ...s, fx, q: { ...s.q, joker: null } };
  }
  return bump(logJoker(s, { id: `host-back-${now}`, type: a.type, uid: a.uid, target: a.target || null, at: now, back: 'host' }));
}
