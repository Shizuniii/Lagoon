// games/quiz/library.js – deine Quizze, gespeichert NUR auf diesem Gerät.
// Texte liegen im Browser-Speicher, eigene Bilder/Videos/Töne in der IndexedDB (media.js).
// Austausch nur über Dateien (Export/Import als .json). Kein Server sieht Fragen oder Antworten,
// bis du sie im Spiel aufdeckst.

import { store, makeId } from '../../core/ui.js';
import { getFile, putFile, deleteFiles, allFileIds, blobToB64, fromB64, isHttps, linkKind, youtubeId } from './media.js';

export const FORMAT = 'spieleabend-quiz';
const KEY = 'quizzes';
const MODES = ['', 'turn', 'buzzer', 'solo', 'all'];
export const TYPES = ['text', 'choice', 'estimate'];
export const SCORINGS = ['closest', 'farthest', 'range'];
export const LIMITS = { boards: 10, cats: 8, rows: 10, options: 6, time: 600, value: 100000 };
export const DEFAULT_SIZE = { cats: 5, rows: 4 };

const str = (v, max = 500) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const int = (v, fallback = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};
const num = (v) => {
  if (v === '' || v == null) return NaN;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export function blankQuestion(value) {
  return {
    value,
    type: 'text',
    question: '',
    answer: '',
    accept: [],
    options: ['', '', '', ''],
    correct: 0,
    number: null,
    unit: '',
    tolerance: null,
    scoring: 'closest',
    mode: '',
    time: 0,
    media: null,
    solutionMedia: null,
    note: '',
  };
}

export const defaultValues = (rows) => Array.from({ length: rows }, (_, r) => (r + 1) * 100);

export function blankBoard(n, { cats = DEFAULT_SIZE.cats, rows = DEFAULT_SIZE.rows, values = null } = {}) {
  const vals = values || defaultValues(rows);
  return {
    title: `Board ${n}`,
    multiplier: 1,
    categories: Array.from({ length: cats }, (_, i) => ({
      name: `Kategorie ${i + 1}`,
      questions: Array.from({ length: rows }, (_, r) => blankQuestion(vals[r] ?? (r + 1) * 100)),
    })),
  };
}

export function newQuiz() {
  return { id: makeId(), title: 'Neues Quiz', defaultMode: 'turn', boards: [blankBoard(1)], updatedAt: Date.now() };
}

/** „10%“ → {10, pct}, „±100“ / 100 → {100, abs}; leer → null. */
export function parseTolerance(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') {
    const v = num(raw.value);
    return v > 0 ? { value: v, mode: raw.mode === 'pct' ? 'pct' : 'abs' } : null;
  }
  const t = String(raw).trim();
  const v = num(t.replace(/[±+\-\s%]/g, ''));
  if (!(v > 0)) return null;
  return { value: v, mode: t.includes('%') ? 'pct' : 'abs' };
}

/** Medium in feste Form bringen: Link (https) oder eigene Datei (id in der IndexedDB). */
export function normalizeMedia(raw, errors = [], where = '') {
  if (!raw) return null;
  if (typeof raw === 'string') raw = { src: raw };
  const m = { kind: null, src: '', file: '', name: str(raw.name, 120), size: int(raw.size, 0), start: 0, end: 0, autoplay: raw.autoplay !== false };
  if (raw.file) {
    m.file = str(raw.file, 60);
    m.kind = ['image', 'audio', 'video'].includes(raw.kind) ? raw.kind : null;
    if (!m.kind) return null;
  } else {
    const src = str(raw.src ?? raw.url ?? raw.link, 2000);
    if (!src) return null;
    if (!isHttps(src)) {
      errors.push(`${where}: Medien-Link muss mit https:// anfangen.`);
      return null;
    }
    m.src = src;
    m.kind = youtubeId(src) ? 'youtube' : ['image', 'audio', 'video'].includes(raw.kind) ? raw.kind : linkKind(src) || 'image';
  }
  const start = num(raw.start);
  const end = num(raw.end);
  m.start = start > 0 ? Math.round(start * 10) / 10 : 0;
  m.end = end > m.start ? Math.round(end * 10) / 10 : 0;
  return m;
}

/** Bringt eine Frage in die feste Form – auch wenn sie aus einer fremden Datei kommt. */
function normalizeQuestion(raw, fallbackValue, errors, where) {
  const q = blankQuestion(fallbackValue);
  if (!raw || typeof raw !== 'object') return q;
  q.value = Math.min(LIMITS.value, Math.max(0, int(raw.value ?? raw.points ?? raw.punkte, fallbackValue)));
  q.question = str(raw.question ?? raw.frage, 600);
  q.note = str(raw.note ?? raw.notiz, 300);
  q.mode = MODES.includes(raw.mode) ? raw.mode : '';
  q.time = Math.max(0, Math.min(LIMITS.time, int(raw.time ?? raw.zeit ?? raw.timer, 0)));
  const legacyImage = raw.image ?? raw.bild;
  q.media = normalizeMedia(raw.media ?? raw.medien ?? (legacyImage ? { kind: 'image', src: legacyImage } : null), errors, where);
  q.solutionMedia = normalizeMedia(raw.solutionMedia ?? raw.loesungMedien ?? raw.lösungMedien, errors, where);
  const options = Array.isArray(raw.options ?? raw.optionen) ? (raw.options ?? raw.optionen).map((o) => str(o, 200)) : null;
  const numberRaw = raw.number ?? raw.zahl;
  const type = TYPES.includes(raw.type)
    ? raw.type
    : options && options.filter(Boolean).length >= 2
      ? 'choice'
      : numberRaw != null && numberRaw !== ''
        ? 'estimate'
        : 'text';
  q.type = type;
  if (type === 'choice') {
    q.options = (options || ['', '', '', '']).slice(0, LIMITS.options);
    while (q.options.length < 2) q.options.push('');
    q.correct = Math.min(Math.max(0, int(raw.correct ?? raw.richtig, 0)), q.options.length - 1);
    q.answer = q.options[q.correct] || '';
    if (q.question && q.options.filter(Boolean).length < 2) errors.push(`${where}: Auswahlfrage braucht mindestens 2 Antworten.`);
  } else if (type === 'estimate') {
    const n = num(numberRaw ?? raw.answer ?? raw.antwort);
    q.number = Number.isFinite(n) ? n : null;
    q.unit = str(raw.unit ?? raw.einheit, 30);
    q.tolerance = parseTolerance(raw.tolerance ?? raw.toleranz ?? raw.fehlerbereich);
    q.scoring = SCORINGS.includes(raw.scoring ?? raw.wertung) ? raw.scoring ?? raw.wertung : 'closest';
    q.answer = q.number != null ? `${q.number}${q.unit ? ' ' + q.unit : ''}` : '';
    if (q.question && q.number == null) errors.push(`${where}: Schätzfrage braucht eine Zahl als Lösung.`);
  } else {
    q.answer = str(raw.answer ?? raw.antwort, 300);
    const accept = raw.accept ?? raw.auchRichtig ?? [];
    q.accept = (Array.isArray(accept) ? accept : String(accept).split(',')).map((a) => str(a, 200)).filter(Boolean).slice(0, 10);
    if (q.question && !q.answer) errors.push(`${where}: Frage hat keine Antwort.`);
  }
  return q;
}

/** Was an einer Frage noch fehlt (für Hinweise im Editor). Leer = alles gut oder Feld leer. */
export function questionIssues(q) {
  if (!q || !String(q.question || '').trim()) return [];
  const out = [];
  if (q.type === 'choice') {
    const opts = (q.options || []).filter((o) => String(o).trim());
    if (opts.length < 2) out.push('Mindestens zwei Antworten');
    if (!String((q.options || [])[q.correct] || '').trim()) out.push('Richtige Antwort markieren');
  } else if (q.type === 'estimate') {
    if (q.number == null || !Number.isFinite(Number(q.number))) out.push('Zahl fehlt');
  } else if (!String(q.answer || '').trim()) out.push('Antwort fehlt');
  return out;
}

/** Prüft und normalisiert ein Quiz. Gibt { quiz, errors } zurück; errors sind Hinweise, kein Abbruch. */
export function validateQuiz(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') throw new Error('Die Datei enthält kein Quiz.');
  const boardsRaw = Array.isArray(raw.boards) ? raw.boards : Array.isArray(raw.categories) ? [{ title: raw.title, categories: raw.categories }] : null;
  if (!boardsRaw || !boardsRaw.length) throw new Error('Im Quiz fehlt "boards" – mindestens ein Board mit Kategorien.');
  const quiz = {
    id: makeId(),
    title: str(raw.title ?? raw.titel, 80) || 'Quiz ohne Namen',
    defaultMode: MODES.includes(raw.defaultMode) && raw.defaultMode ? raw.defaultMode : 'turn',
    boards: boardsRaw.slice(0, LIMITS.boards).map((b, bi) => {
      const cats = Array.isArray(b && (b.categories ?? b.kategorien)) ? b.categories ?? b.kategorien : [];
      if (!cats.length) errors.push(`Board ${bi + 1}: keine Kategorien.`);
      return {
        title: str(b && (b.title ?? b.titel), 60) || `Board ${bi + 1}`,
        multiplier: Math.max(1, Math.min(10, Number(b && (b.multiplier ?? b.multiplikator)) || 1)),
        categories: cats.slice(0, LIMITS.cats).map((c, ci) => {
          const qs = Array.isArray(c && (c.questions ?? c.fragen)) ? c.questions ?? c.fragen : [];
          return {
            name: str(c && (c.name ?? c.title), 40) || `Kategorie ${ci + 1}`,
            questions: qs.slice(0, LIMITS.rows).map((q, qi) => normalizeQuestion(q, (qi + 1) * 100, errors, `Board ${bi + 1}, „${str(c && c.name, 40) || ci + 1}“, Frage ${qi + 1}`)),
          };
        }),
      };
    }),
    updatedAt: Date.now(),
  };
  return { quiz, errors };
}

export function listQuizzes() {
  const all = store.get(KEY, []);
  return Array.isArray(all) ? all.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) : [];
}

export function getQuiz(id) {
  return listQuizzes().find((q) => q.id === id) || null;
}

// Bittet den Browser, die Quizze nicht bei Platzmangel automatisch wegzuräumen.
let askedPersist = false;
function keepStorage() {
  if (askedPersist || typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) return;
  askedPersist = true;
  navigator.storage
    .persisted()
    .then((yes) => yes || navigator.storage.persist())
    .catch(() => {});
}

export function saveQuiz(quiz) {
  const all = listQuizzes().filter((q) => q.id !== quiz.id);
  all.push({ ...quiz, updatedAt: Date.now() });
  if (!store.set(KEY, all)) throw new Error('Der Speicher auf diesem Gerät ist voll.');
  keepStorage();
  return quiz;
}

export function eachQuestion(quiz, fn) {
  (quiz.boards || []).forEach((b, bi) => (b.categories || []).forEach((c, ci) => (c.questions || []).forEach((q, qi) => fn(q, bi, ci, qi))));
}

/** Ids aller eigenen Dateien, die ein Quiz benutzt. */
export function quizFileIds(quiz) {
  const ids = new Set();
  eachQuestion(quiz, (q) => {
    if (q.media && q.media.file) ids.add(q.media.file);
    if (q.solutionMedia && q.solutionMedia.file) ids.add(q.solutionMedia.file);
  });
  return [...ids];
}

/** Dateien wegräumen, die kein Quiz mehr benutzt. */
export async function cleanupFiles(extraKeep = []) {
  const used = new Set(extraKeep);
  listQuizzes().forEach((q) => quizFileIds(q).forEach((id) => used.add(id)));
  const all = await allFileIds();
  await deleteFiles(all.filter((id) => !used.has(id)));
}

export function deleteQuiz(id) {
  store.set(
    KEY,
    listQuizzes().filter((q) => q.id !== id)
  );
  cleanupFiles().catch(() => {});
}

/** Als Datei: eigene Medien werden mit eingepackt, damit der Import auf einem anderen Gerät klappt. */
export async function exportQuiz(quiz) {
  const { id, updatedAt, ...rest } = quiz;
  const files = {};
  for (const fid of quizFileIds(quiz)) {
    const rec = await getFile(fid);
    if (rec) files[fid] = { name: rec.name, mime: rec.mime, data: await blobToB64(rec.blob) };
  }
  const out = { format: FORMAT, version: 2, ...rest };
  if (Object.keys(files).length) out.files = files;
  return JSON.stringify(out, null, 2);
}

function remapFiles(raw, map) {
  const fix = (m) => (m && typeof m === 'object' && m.file ? (map[m.file] ? { ...m, file: map[m.file] } : null) : m);
  (raw.boards || []).forEach((b) =>
    ((b && (b.categories ?? b.kategorien)) || []).forEach((c) =>
      ((c && (c.questions ?? c.fragen)) || []).forEach((q) => {
        if (!q || typeof q !== 'object') return;
        if (q.media) q.media = fix(q.media);
        if (q.solutionMedia) q.solutionMedia = fix(q.solutionMedia);
      })
    )
  );
}

export async function importQuiz(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (raw && typeof raw === 'object' && raw.files && typeof raw.files === 'object') {
    const map = {};
    for (const [oldId, f] of Object.entries(raw.files)) {
      if (!f || typeof f.data !== 'string') continue;
      try {
        const blob = new Blob([fromB64(f.data)], { type: f.mime || '' });
        const rec = await putFile({ blob, name: f.name, mime: f.mime });
        map[oldId] = rec.id;
      } catch {
        /* einzelne kaputte Datei überspringen */
      }
    }
    remapFiles(raw, map);
  }
  const { quiz, errors } = validateQuiz(raw);
  saveQuiz(quiz);
  return { quiz, errors };
}

export function stats(quiz) {
  let questions = 0;
  let filled = 0;
  let media = 0;
  let issues = 0;
  let categories = 0;
  (quiz.boards || []).forEach((b) =>
    (b.categories || []).forEach((c) => {
      categories++;
      (c.questions || []).forEach((q) => {
        questions++;
        if (String(q.question || '').trim()) filled++;
        if (q.media) media++;
        if (questionIssues(q).length) issues++;
      });
    })
  );
  return { boards: (quiz.boards || []).length, categories, questions, filled, media, issues };
}

export const fileName = (quiz) =>
  (String(quiz.title || 'quiz')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'quiz') + '.json';

// ---------- Beispiel-Quiz zum Ausprobieren ----------

export const SAMPLE = {
  format: FORMAT,
  version: 2,
  title: 'Beispiel-Quiz',
  defaultMode: 'turn',
  boards: [
    {
      title: 'Aufwärmen',
      multiplier: 1,
      categories: [
        {
          name: 'Allgemeinwissen',
          questions: [
            { value: 100, question: 'Wie viele Bits hat ein Byte?', answer: '8', accept: ['acht'] },
            { value: 200, question: 'Welches chemische Element hat das Zeichen O?', answer: 'Sauerstoff', accept: ['Oxygen'] },
            { value: 300, question: 'Was ist die Hauptstadt von Australien?', type: 'choice', options: ['Sydney', 'Canberra', 'Melbourne', 'Perth'], correct: 1 },
          ],
        },
        {
          name: 'Videospiele',
          questions: [
            { value: 100, question: 'Wie heißt Nintendos Klempner mit der roten Mütze?', answer: 'Mario', accept: ['Super Mario'] },
            { value: 200, question: 'In welchem Spiel jagen dich Creeper, während du mit Blöcken baust?', answer: 'Minecraft', mode: 'buzzer' },
            { value: 300, question: 'Welches Pokémon hat im Nationaldex die Nummer 25?', type: 'choice', options: ['Evoli', 'Pikachu', 'Glumanda', 'Mauzi'], correct: 1, mode: 'all' },
          ],
        },
        {
          name: 'Zahlen',
          questions: [
            { value: 100, question: 'Wie viele Felder hat ein Schachbrett?', answer: '64', accept: ['vierundsechzig'] },
            { value: 200, question: 'Wie viele Seiten hat ein Sechseck?', answer: '6', accept: ['sechs'], mode: 'solo', time: 20 },
            { value: 300, question: 'Wie hoch ist der Eiffelturm (mit Antennen)?', type: 'estimate', number: 330, unit: 'Meter', tolerance: { value: 10, mode: 'pct' }, scoring: 'closest', mode: 'all' },
          ],
        },
      ],
    },
    {
      title: 'Finale',
      multiplier: 2,
      categories: [
        {
          name: 'Gemischt',
          questions: [
            { value: 100, question: 'Welche Farbe entsteht, wenn man Blau und Gelb mischt?', answer: 'Grün' },
            { value: 200, question: 'In welchem Land wurde Tetris ursprünglich entwickelt?', answer: 'Sowjetunion', accept: ['UdSSR', 'Russland'], note: 'Alexei Paschitnow, 1984 in Moskau' },
          ],
        },
        {
          name: 'Schnell!',
          questions: [
            { value: 100, question: 'Wie viele Minuten hat eine Stunde?', answer: '60', mode: 'buzzer' },
            { value: 200, question: 'Was ist 7 mal 8?', answer: '56', mode: 'buzzer' },
          ],
        },
      ],
    },
  ],
};

export function addSample() {
  const { quiz } = validateQuiz(JSON.parse(JSON.stringify(SAMPLE)));
  saveQuiz(quiz);
  return quiz;
}
