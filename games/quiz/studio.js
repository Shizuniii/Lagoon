// games/quiz/studio.js – die Quiz-Werkstatt: deine Quizze und der Editor.
// Alles hier passiert nur auf deinem Gerät. Gespeichert wird automatisch.

import { ICON, esc, $, slot, setHTML, toast, openSheet, confirmDialog, downloadFile, makeId } from '../../core/ui.js';
import * as Q from './logic.js';
import {
  listQuizzes, getQuiz, saveQuiz, deleteQuiz, newQuiz, importQuiz, exportQuiz, stats, fileName, addSample,
  blankQuestion, blankBoard, questionIssues, normalizeMedia, parseTolerance, cleanupFiles, LIMITS,
} from './library.js';
import { prepareFile, putFile, previewHTML, parseTime, fmtTime, fmtSize, linkKind, youtubeStart, isHttps, KIND_LABEL } from './media.js';

const ID = 'quiz';
export const E = { quizId: null, board: 0, saveTimer: null, savedTimer: null, pending: null };
export const screens = {};
export const actions = {};

const TIMES = [0, 10, 15, 20, 30, 45, 60, 90, 120];
const editorEl = () => document.querySelector('.view-quiz-editor');

// ---------- Meine Quizze ----------

screens['quiz:library'] = {
  mount(el, api) {
    el.innerHTML = `${api.topbar({ back: 'home', title: 'Meine Quizze' })}<main class="screen">
      <div class="stack-tight"><h1>Meine Quizze</h1>
        <p class="muted">Deine Quizze liegen nur auf diesem Gerät. Niemand sonst sieht Fragen, Antworten oder Medien, bis du sie im Spiel aufdeckst.</p></div>
      <ul class="quiz-list" data-slot="list"></ul>
      <div class="row-wrap">
        <button class="btn primary" data-action="quiz:new">${ICON.plus} Neues Quiz</button>
        <button class="btn secondary" data-action="quiz:import">Datei importieren</button>
        <button class="btn ghost" data-action="quiz:sample">Beispiel-Quiz laden</button>
      </div>
      <input type="file" accept=".json,application/json" hidden data-slot="file">
      <p class="hint">Sichere deine Quizze ab und zu als Datei (Mehr → Als Datei exportieren). Eigene Bilder, Videos und Töne kommen mit in die Datei.</p>
    </main>`;
    const file = slot(el, 'file');
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      toast('Wird importiert …');
      try {
        const { quiz, errors } = await importQuiz(await f.text());
        api.render();
        if (errors.length) {
          openSheet({
            title: 'Importiert – mit Hinweisen',
            body: `<p class="lead">„${esc(quiz.title)}“ ist da. Das solltest du dir noch ansehen:</p><ul class="steps">${errors
              .slice(0, 12)
              .map((e) => `<li>${esc(e)}</li>`)
              .join('')}</ul>`,
          });
        } else toast(`„${quiz.title}“ importiert.`);
      } catch (err) {
        toast(err.message || 'Die Datei konnte nicht gelesen werden.');
      }
    });
    cleanupFiles().catch(() => {});
  },
  update(el) {
    const all = listQuizzes();
    setHTML(
      slot(el, 'list'),
      all.length
        ? all
            .map((qz) => {
              const s = stats(qz);
              const media = s.media ? `, ${s.media} mit Medien` : '';
              const warn = s.issues ? `<span class="quiz-warn">${ICON.warn} ${s.issues} ${s.issues === 1 ? 'Frage braucht' : 'Fragen brauchen'} noch etwas</span>` : '';
              return `<li class="quiz-row"><div class="quiz-row-text"><strong>${esc(qz.title)}</strong>
                <span>${s.boards} ${s.boards === 1 ? 'Board' : 'Boards'}, ${s.filled} von ${s.questions} Fragen ausgefüllt${media}</span>${warn}</div>
                <div class="row-wrap">
                  <button class="btn primary" data-action="quiz:host" data-id="${esc(qz.id)}" ${s.filled ? '' : 'disabled'}>Hosten</button>
                  <button class="btn secondary" data-action="quiz:edit" data-id="${esc(qz.id)}">Bearbeiten</button>
                  <button class="btn ghost" data-action="quiz:more" data-id="${esc(qz.id)}">Mehr</button>
                </div></li>`;
            })
            .join('')
        : '<li class="empty-note">Noch keine Quizze. Leg eins an, importier eine Datei oder lade das Beispiel-Quiz zum Ausprobieren.</li>'
    );
  },
};

// ---------- Editor: Raster ----------

// Beim Tippen wird gesammelt und kurz danach gespeichert. Bis dahin arbeiten alle mit derselben Kopie,
// damit schnelle Änderungen an verschiedenen Feldern nicht verloren gehen.
function editorQuiz() {
  if (E.pending && E.pending.id === E.quizId) return E.pending;
  return E.quizId ? getQuiz(E.quizId) : null;
}

export function flushEditor() {
  if (E.pending) save(E.pending);
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushEditor);

function save(quiz) {
  if (E.pending === quiz) {
    clearTimeout(E.saveTimer);
    E.pending = null;
  }
  try {
    saveQuiz(quiz);
    const s = $('[data-slot="saved"]');
    if (s) {
      s.textContent = 'Gespeichert.';
      clearTimeout(E.savedTimer);
      E.savedTimer = setTimeout(() => (s.textContent = 'Änderungen werden automatisch gespeichert.'), 1800);
    }
  } catch (err) {
    toast(err.message);
  }
}

const rowsOf = (board) => Math.max(0, ...board.categories.map((c) => c.questions.length));
const rowValue = (board, r) => {
  const first = board.categories.find((c) => c.questions[r]);
  return first ? first.questions[r].value : (r + 1) * 100;
};

function cellHTML(q, ci, r) {
  if (!q) return '<div class="ecell missing" aria-hidden="true"></div>';
  const text = String(q.question || '').trim();
  const issues = questionIssues(q);
  const mediaIcon = q.media ? ICON[q.media.kind === 'youtube' ? 'video' : q.media.kind] || '' : '';
  const badges = [
    q.type === 'choice' ? '<span class="ebadge">A–D</span>' : '',
    q.type === 'estimate' ? '<span class="ebadge">Schätzen</span>' : '',
    q.mode ? `<span class="ebadge">${Q.MODE_LABEL[q.mode]}</span>` : '',
    q.time ? `<span class="ebadge">${ICON.timer}${q.time} s</span>` : '',
    mediaIcon ? `<span class="ebadge" title="${esc(KIND_LABEL[q.media.kind] || '')}">${mediaIcon}</span>` : '',
  ].join('');
  return `<button class="ecell${text ? ' filled' : ''}${issues.length ? ' warn' : ''}" data-action="quiz:e-question" data-c="${ci}" data-r="${r}"
      aria-label="${esc(`Frage ${r + 1}, ${text ? text.slice(0, 60) : 'leer'}${issues.length ? '. Fehlt: ' + issues.join(', ') : ''}`)}">
    <span class="ecell-top"><span class="ecell-val">${q.value}</span>${badges}</span>
    <span class="ecell-q">${text ? esc(text) : 'leer'}</span>
    ${issues.length ? `<span class="ecell-issue">${ICON.warn}${esc(issues[0])}</span>` : ''}</button>`;
}

function editorGrid(quiz) {
  const board = quiz.boards[E.board];
  if (!board) return '';
  const cols = board.categories.length;
  const rows = rowsOf(board);
  if (!cols) return '<p class="empty-note">Dieses Board hat noch keine Kategorie. Stell oben bei „Kategorien“ ein, wie viele es haben soll.</p>';
  const head =
    '<div class="ecorner">Punkte</div>' +
    board.categories
      .map(
        (c, ci) => `<div class="ecat"><input data-e="cat" data-c="${ci}" value="${esc(c.name)}" maxlength="40" aria-label="Name der Kategorie ${ci + 1}">
        <button class="icon-btn small" data-action="quiz:e-cat-menu" data-c="${ci}" aria-label="Kategorie ${ci + 1} verschieben oder entfernen">${ICON.dots}</button></div>`
      )
      .join('');
  let cells = '';
  for (let r = 0; r < rows; r++) {
    const val = rowValue(board, r);
    const mixed = board.categories.some((c) => c.questions[r] && c.questions[r].value !== val);
    cells += `<div class="erow-val"><input data-e="rowval" data-r="${r}" type="number" inputmode="numeric" min="0" step="50" value="${mixed ? '' : val}" placeholder="${mixed ? 'versch.' : ''}" aria-label="Punkte für alle Fragen in Zeile ${r + 1}"></div>`;
    board.categories.forEach((c, ci) => (cells += cellHTML(c.questions[r], ci, r)));
  }
  return `<div class="egrid" style="--cols:${cols}">${head}${cells}</div>`;
}

function editorTabs(quiz) {
  return `${quiz.boards
    .map(
      (bd, i) =>
        `<button class="board-tab${i === E.board ? ' on' : ''}" data-action="quiz:e-board" data-b="${i}">${esc(bd.title || `Board ${i + 1}`)}${
          Number(bd.multiplier) > 1 ? ` <small>×${bd.multiplier}</small>` : ''
        }</button>`
    )
    .join('')}<button class="board-tab add" data-action="quiz:e-add-board">${ICON.plus} Board</button>`;
}

export function renderEditor(el = editorEl()) {
  const quiz = editorQuiz();
  if (!quiz || !el) return;
  if (E.board >= quiz.boards.length) E.board = quiz.boards.length - 1;
  const board = quiz.boards[E.board];
  setHTML(slot(el, 'tabs'), editorTabs(quiz));
  const bt = slot(el, 'board-title');
  if (document.activeElement !== bt) bt.value = board.title;
  slot(el, 'mult').value = String(board.multiplier || 1);
  slot(el, 'ncats').textContent = String(board.categories.length);
  slot(el, 'nrows').textContent = String(rowsOf(board));
  const active = document.activeElement;
  const focusKey = active && active.dataset && active.dataset.e ? `${active.dataset.e}:${active.dataset.c ?? ''}:${active.dataset.r ?? ''}` : null;
  setHTML(slot(el, 'grid'), editorGrid(quiz));
  if (focusKey && !el.contains(active)) {
    const [e, c, r] = focusKey.split(':');
    const again = el.querySelector(`[data-e="${e}"]${c ? `[data-c="${c}"]` : ''}${r ? `[data-r="${r}"]` : ''}`);
    if (again) again.focus({ preventScroll: true });
  }
}

screens['quiz:editor'] = {
  key: () => `${E.quizId}`,
  mount(el, api) {
    const quiz = editorQuiz();
    if (!quiz) {
      el.innerHTML = `${api.topbar({ back: 'quiz:library-back', title: 'Quiz' })}<main class="screen"><p class="lead">Dieses Quiz gibt es nicht mehr.</p></main>`;
      return;
    }
    el.innerHTML = `${api.topbar({ back: 'quiz:library-back', title: 'Quiz bearbeiten' })}<main class="screen editor">
      <div class="editor-head">
        <label class="field grow"><span>Titel des Quiz</span><input data-e="title" maxlength="80" value="${esc(quiz.title)}"></label>
        <label class="field"><span>Wer antwortet, wenn bei einer Frage nichts anderes steht</span>
          <select data-e="defaultMode">${Q.MODES.map((m) => `<option value="${m}" ${quiz.defaultMode === m ? 'selected' : ''}>${Q.MODE_LABEL[m]}</option>`).join('')}</select></label>
      </div>
      <div class="board-tabs" data-slot="tabs"></div>
      <div class="ed-boardbar">
        <label class="field grow"><span>Board-Titel</span><input data-e="boardTitle" data-slot="board-title" maxlength="60"></label>
        <label class="field"><span>Punkte</span><select data-e="mult" data-slot="mult"><option value="1">normal</option><option value="2">doppelt</option><option value="3">dreifach</option></select></label>
        <div class="field"><span>Kategorien</span><div class="stepper">
          <button class="icon-btn small" data-action="quiz:e-cats" data-d="-1" aria-label="Eine Kategorie weniger">${ICON.minus}</button>
          <output data-slot="ncats"></output>
          <button class="icon-btn small" data-action="quiz:e-cats" data-d="1" aria-label="Eine Kategorie mehr">${ICON.plus}</button></div></div>
        <div class="field"><span>Fragen pro Kategorie</span><div class="stepper">
          <button class="icon-btn small" data-action="quiz:e-rows" data-d="-1" aria-label="Eine Frage pro Kategorie weniger">${ICON.minus}</button>
          <output data-slot="nrows"></output>
          <button class="icon-btn small" data-action="quiz:e-rows" data-d="1" aria-label="Eine Frage pro Kategorie mehr">${ICON.plus}</button></div></div>
        <button class="btn ghost" data-action="quiz:e-board-menu">${ICON.dots} Board</button>
      </div>
      <div class="egrid-wrap" data-slot="grid"></div>
      <p class="hint"><span data-slot="saved">Änderungen werden automatisch gespeichert.</span> Tipp auf ein Feld, um die Frage zu bearbeiten. Die Zahl links gilt für die ganze Zeile.</p>
    </main>`;
    el.addEventListener('input', (e) => {
      const t = e.target;
      const q = editorQuiz();
      if (!q || !t.dataset.e) return;
      const board = q.boards[E.board];
      if (t.dataset.e === 'title') q.title = t.value.slice(0, 80);
      if (t.dataset.e === 'defaultMode') q.defaultMode = t.value;
      if (t.dataset.e === 'boardTitle') board.title = t.value.slice(0, 60);
      if (t.dataset.e === 'mult') board.multiplier = Number(t.value) || 1;
      if (t.dataset.e === 'cat') board.categories[Number(t.dataset.c)].name = t.value.slice(0, 40);
      if (t.dataset.e === 'rowval') {
        const v = Math.min(LIMITS.value, Math.round(Number(t.value)));
        if (!Number.isFinite(v) || v < 0 || t.value === '') return;
        board.categories.forEach((c) => c.questions[Number(t.dataset.r)] && (c.questions[Number(t.dataset.r)].value = v));
      }
      E.pending = q;
      clearTimeout(E.saveTimer);
      E.saveTimer = setTimeout(() => {
        save(q);
        if (['boardTitle', 'mult'].includes(t.dataset.e)) setHTML(slot(el, 'tabs'), editorTabs(q));
        if (t.dataset.e === 'rowval') renderEditor(el);
      }, 350);
    });
    el.addEventListener('change', (e) => e.target.dataset.e && e.target.dataset.e !== 'rowval' && e.target.dispatchEvent(new Event('input', { bubbles: true })));
    renderEditor(el);
  },
  update() {},
};

// ---------- Editor: eine Frage ----------

function finalize(D) {
  const q = { ...blankQuestion(0), ...D };
  q.value = Math.min(LIMITS.value, Math.max(0, Math.round(Number(q.value) || 0)));
  q.question = String(q.question || '').trim();
  q.note = String(q.note || '').trim();
  q.time = TIMES.includes(Number(q.time)) ? Number(q.time) : Math.max(0, Math.min(LIMITS.time, Math.round(Number(q.time) || 0)));
  if (q.type === 'choice') {
    const all = (q.options || []).map((o) => String(o || '').trim()).slice(0, LIMITS.options);
    // leere Felder weglassen – aber nur, wenn die markierte Antwort dabei bleibt (sonst zeigt der Editor den Fehler)
    const kept = all.map((o, i) => [o, i]).filter(([o]) => o);
    const at = kept.findIndex(([, i]) => i === Number(q.correct));
    if (kept.length >= 2 && at >= 0) {
      q.options = kept.map(([o]) => o);
      q.correct = at;
    } else {
      q.options = all;
      while (q.options.length < 2) q.options.push('');
      q.correct = Math.min(Math.max(0, Number(q.correct) || 0), q.options.length - 1);
    }
    q.answer = q.options[q.correct] || '';
    q.accept = [];
  } else if (q.type === 'estimate') {
    const n = q.numberText != null ? Q.parseNumber(q.numberText) : q.number != null && q.number !== '' ? Number(q.number) : NaN;
    q.number = Number.isFinite(n) ? n : null;
    q.unit = String(q.unit || '').trim().slice(0, 30);
    q.answer = q.number != null ? `${Q.fmtNumber(q.number)}${q.unit ? ' ' + q.unit : ''}` : '';
    q.accept = [];
  } else {
    q.answer = String(q.answer || '').trim();
    q.accept = (Array.isArray(q.accept) ? q.accept : String(q.accept || '').split(',')).map((a) => String(a).trim()).filter(Boolean).slice(0, 10);
  }
  delete q.numberText;
  delete q.image;
  return q;
}

function answerPartHTML(D) {
  if (D.type === 'choice') {
    const opts = D.options || [];
    return `<fieldset class="stack-tight"><legend class="field-label">Antworten – markier die richtige</legend>
      <ol class="opt-edit">${opts
        .map(
          (o, i) => `<li><label class="opt-radio"><input type="radio" name="correct" value="${i}" ${Number(D.correct) === i ? 'checked' : ''} aria-label="Antwort ${'ABCDEF'[i]} ist richtig"><span class="opt-letter">${'ABCDEF'[i]}</span></label>
          <input name="opt${i}" value="${esc(o)}" maxlength="200" placeholder="Antwort ${'ABCDEF'[i]}" aria-label="Antwort ${'ABCDEF'[i]}"></li>`
        )
        .join('')}</ol>
      <div class="row-wrap">${opts.length < LIMITS.options ? `<button type="button" class="btn ghost" data-sa="opt-add">${ICON.plus} Antwort</button>` : ''}${
      opts.length > 2 ? `<button type="button" class="btn ghost" data-sa="opt-del">${ICON.minus} letzte Antwort</button>` : ''
    }</div></fieldset>`;
  }
  if (D.type === 'estimate') {
    const tol = D.tolerance;
    const tmode = tol ? tol.mode : 'none';
    const numText = D.numberText != null ? D.numberText : D.number != null ? String(D.number).replace('.', ',') : '';
    return `<div class="qform-row">
        <label class="field"><span>Richtige Zahl</span><input name="number" inputmode="decimal" value="${esc(numText)}" placeholder="z. B. 860"></label>
        <label class="field"><span>Einheit (wenn du willst)</span><input name="unit" maxlength="30" value="${esc(D.unit || '')}" placeholder="z. B. Gemälde"></label>
      </div>
      <div class="stack-tight"><span class="field-label">Fehlerbereich – wie weit daneben noch zählt</span>
        <div class="tol-row">
          <div class="segmented" role="radiogroup" aria-label="Fehlerbereich">
            ${[['none', 'Nur genau'], ['abs', '± Zahl'], ['pct', '± Prozent']]
              .map(([v, l]) => `<button type="button" class="seg${tmode === v ? ' on' : ''}" data-sa="tol" data-tol="${v}" aria-pressed="${tmode === v}">${l}</button>`)
              .join('')}</div>
          ${
            tol
              ? `<label class="tol-value"><span class="visually-hidden">${tol.mode === 'pct' ? 'Prozent' : 'Abstand'}</span><span aria-hidden="true">±</span>
              <input name="tolValue" inputmode="decimal" value="${esc(String(tol.value).replace('.', ','))}"><span aria-hidden="true">${tol.mode === 'pct' ? '%' : esc(D.unit || '')}</span></label>`
              : ''
          }
        </div>
      </div>
      <label class="field"><span>Wenn alle gleichzeitig schätzen (Modus „Alle“)</span>
        <select name="scoring">${Object.entries(Q.EST_SCORING)
          .map(([k, l]) => `<option value="${k}" ${D.scoring === k ? 'selected' : ''}>${l}</option>`)
          .join('')}</select></label>
      <p class="hint">Antwortet nur eine Person, zählt der Fehlerbereich. Bei „Alle“ entscheidet die Auswahl darüber. Du kannst jeden Vorschlag im Spiel noch ändern.</p>`;
  }
  return `<label class="field"><span>Antwort</span><input name="answer" maxlength="300" value="${esc(D.answer || '')}"></label>
    <label class="field"><span>Auch richtig (mit Komma trennen)</span><input name="accept" maxlength="400" value="${esc(Array.isArray(D.accept) ? D.accept.join(', ') : String(D.accept || ''))}" placeholder="z. B. andere Schreibweise, Spitzname"></label>
    <p class="hint">Kleine Tippfehler erkennt die App selbst. Entscheiden tust im Spiel immer du.</p>`;
}

function mediaPartHTML(m, part) {
  if (!m) {
    return `<div class="row-wrap"><button type="button" class="btn secondary" data-sa="pick-file" data-part="${part}">${ICON.image} Datei wählen</button>
        <button type="button" class="btn ghost" data-sa="show-link" data-part="${part}">Link einfügen</button></div>
      <div class="link-box" data-linkbox="${part}" hidden><label class="field"><span>Link: YouTube oder direkte Adresse zu Bild, Video oder Ton</span>
        <input data-link="${part}" inputmode="url" placeholder="https://…"></label></div>
      ${part === 'media' ? '<p class="hint">Eigene Dateien bleiben auf deinem Gerät. Erst im Spiel gehen sie verschlüsselt an die anderen; den Schlüssel bekommen sie beim Aufdecken.</p>' : ''}`;
  }
  const timed = m.kind !== 'image';
  const what = m.file ? `${esc(m.name || 'Eigene Datei')}${m.size ? `, ${fmtSize(m.size)}` : ''}` : esc(m.src.length > 70 ? m.src.slice(0, 67) + '…' : m.src);
  return `<div class="media-edit">
      <div class="media-preview" data-preview="${part}"><p class="hint">Vorschau lädt …</p></div>
      <p class="media-what"><strong>${esc(KIND_LABEL[m.kind] || 'Medium')}</strong> ${what}</p>
      ${
        !m.file && m.kind !== 'youtube'
          ? `<label class="field small"><span>Art</span><select data-kind="${part}">${['image', 'video', 'audio']
              .map((k) => `<option value="${k}" ${m.kind === k ? 'selected' : ''}>${KIND_LABEL[k]}</option>`)
              .join('')}</select></label>`
          : ''
      }
      ${
        timed
          ? `<div class="qform-row">
          <label class="field small"><span>Start (m:ss)</span><input data-mt="start" data-part="${part}" value="${esc(fmtTime(m.start))}" placeholder="0:00"></label>
          <label class="field small"><span>Ende (m:ss)</span><input data-mt="end" data-part="${part}" value="${esc(fmtTime(m.end))}" placeholder="bis Schluss"></label>
        </div>
        ${part === 'media' ? `<label class="check-row"><input type="checkbox" data-autoplay ${m.autoplay !== false ? 'checked' : ''}> Abspielen, sobald alle bereit sind</label>` : ''}`
          : ''
      }
      <div class="row-wrap"><button type="button" class="btn ghost danger" data-sa="media-del" data-part="${part}">${ICON.trash} Entfernen</button></div>
    </div>`;
}

function openQuestionEditor(api, c, r) {
  const quiz = editorQuiz();
  const board = quiz && quiz.boards[E.board];
  const cat = board && board.categories[c];
  if (!cat || !cat.questions[r]) return;
  const D = JSON.parse(JSON.stringify({ ...blankQuestion(100), ...cat.questions[r] }));
  if (!Array.isArray(D.options) || D.options.length < 4) D.options = [...(D.options || []), '', '', '', ''].slice(0, Math.max(4, (D.options || []).length));
  let discard = false;
  let goNext = false;
  const modeLabel = (m) => (m ? Q.MODE_LABEL[m] : `Standard (${Q.MODE_LABEL[quiz.defaultMode] || 'Reihum'})`);

  const sheet = openSheet({
    title: `${cat.name || 'Kategorie'} – Frage ${r + 1}`,
    wide: true,
    body: `<form class="stack qform" data-sheet-form="question" autocomplete="off" novalidate>
      <div class="qform-row">
        <label class="field small"><span>Punkte</span><input name="value" type="number" inputmode="numeric" min="0" step="50" value="${D.value}"></label>
        <label class="field"><span>Wer antwortet</span><select name="mode">${['', ...Q.MODES]
          .map((m) => `<option value="${m}" ${D.mode === m ? 'selected' : ''}>${modeLabel(m)}</option>`)
          .join('')}</select></label>
        <label class="field small"><span>Timer</span><select name="time">${TIMES.map((t) => `<option value="${t}" ${Number(D.time) === t ? 'selected' : ''}>${t ? `${t} s` : 'Aus'}</option>`).join('')}</select></label>
      </div>
      <p class="hint" data-mode-help></p>
      <div class="segmented qtype" role="radiogroup" aria-label="Art der Frage">${Q.QTYPES.map(
        (t) => `<button type="button" class="seg${D.type === t ? ' on' : ''}" data-sa="type" data-type="${t}" aria-pressed="${D.type === t}">${Q.QTYPE_LABEL[t]}</button>`
      ).join('')}</div>
      <label class="field"><span>Frage</span><textarea name="question" rows="3" maxlength="600" data-autofocus>${esc(D.question)}</textarea></label>
      <div class="stack" data-part="answer"></div>
      <section class="qform-section"><h3 class="qform-sub">Bild, Video oder Ton zur Frage</h3><div class="stack-tight" data-part="media"></div></section>
      <details class="qform-section"${D.note || D.solutionMedia ? ' open' : ''}><summary class="qform-sub">Notiz und Medium zur Lösung</summary>
        <div class="stack">
          <label class="field"><span>Notiz – siehst nur du</span><input name="note" maxlength="300" value="${esc(D.note || '')}" placeholder="z. B. Quelle oder Hintergrund"></label>
          <div class="stack-tight"><span class="field-label">Wird zusammen mit „Lösung allen zeigen“ gezeigt</span><div class="stack-tight" data-part="solmedia"></div></div>
        </div></details>
      <div class="sheet-actions qform-actions">
        <button class="btn primary" type="button" data-sa="done">Fertig</button>
        <button class="btn secondary" type="button" data-sa="next">Nächste Frage ${ICON.right}</button>
        <button class="btn ghost danger" type="button" data-sa="clear">Frage leeren</button>
        <button class="btn ghost" type="button" data-sa="discard">Änderungen verwerfen</button>
      </div>
      <p class="hint">Wird beim Schließen automatisch gespeichert. Strg + Enter springt zur nächsten Frage.</p>
      <input type="file" hidden data-file accept="image/*,audio/*,video/*">
    </form>`,
    onAction(action, btn, sh) {
      collect();
      if (action === 'type') {
        D.type = btn.dataset.type;
        sh.el.querySelectorAll('[data-sa="type"]').forEach((b) => {
          b.classList.toggle('on', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        renderAnswer();
      }
      if (action === 'opt-add' && D.options.length < LIMITS.options) {
        D.options.push('');
        renderAnswer();
        const inp = sh.el.querySelector(`[name="opt${D.options.length - 1}"]`);
        if (inp) inp.focus();
      }
      if (action === 'opt-del' && D.options.length > 2) {
        D.options.pop();
        if (Number(D.correct) >= D.options.length) D.correct = 0;
        renderAnswer();
      }
      if (action === 'tol') {
        const mode = btn.dataset.tol;
        D.tolerance = mode === 'none' ? null : { value: (D.tolerance && D.tolerance.value) || (mode === 'pct' ? 10 : 1), mode };
        renderAnswer();
      }
      if (action === 'pick-file') {
        const input = sh.el.querySelector('[data-file]');
        input.dataset.part = btn.dataset.part;
        input.click();
      }
      if (action === 'show-link') {
        const box = sh.el.querySelector(`[data-linkbox="${btn.dataset.part}"]`);
        box.hidden = false;
        box.querySelector('input').focus();
      }
      if (action === 'media-del') {
        D[btn.dataset.part === 'media' ? 'media' : 'solutionMedia'] = null;
        renderMedia(btn.dataset.part);
      }
      if (action === 'done') sh.close();
      if (action === 'next') {
        goNext = true;
        sh.close();
      }
      if (action === 'discard') {
        discard = true;
        sh.close();
      }
      if (action === 'clear') {
        confirmDialog({ title: 'Frage leeren?', text: 'Text, Antworten und Medien dieser Frage werden gelöscht. Die Punkte bleiben.', ok: 'Leeren', danger: true }).then((ok) => {
          if (!ok) return;
          const qz = editorQuiz();
          qz.boards[E.board].categories[c].questions[r] = blankQuestion(D.value);
          save(qz);
          discard = true;
          sh.close();
        });
      }
    },
    onSubmit(form, sh) {
      sh.close();
    },
    onInput(t) {
      if (t.name === 'mode') updateModeHelp();
    },
    onClose() {
      if (!discard) {
        collect();
        const qz = editorQuiz();
        if (qz && qz.boards[E.board] && qz.boards[E.board].categories[c]) {
          qz.boards[E.board].categories[c].questions[r] = finalize(D);
          save(qz);
        }
      }
      renderEditor();
      if (goNext) {
        const qz = editorQuiz();
        const bd = qz && qz.boards[E.board];
        if (!bd) return;
        let nc = c;
        let nr = r + 1;
        if (nr >= (bd.categories[nc] ? bd.categories[nc].questions.length : 0)) {
          nc += 1;
          nr = 0;
        }
        if (bd.categories[nc] && bd.categories[nc].questions[nr]) setTimeout(() => openQuestionEditor(api, nc, nr), 0);
      }
    },
  });

  const form = sheet.el.querySelector('form');

  function collect() {
    const f = form.elements;
    D.value = f.value.value;
    D.mode = f.mode.value;
    D.time = Number(f.time.value) || 0;
    D.question = f.question.value;
    D.note = f.note.value;
    if (D.type === 'choice') {
      D.options = D.options.map((_, i) => (f[`opt${i}`] ? f[`opt${i}`].value : D.options[i]));
      const checked = form.querySelector('input[name="correct"]:checked');
      if (checked) D.correct = Number(checked.value);
    } else if (D.type === 'estimate') {
      if (f.number) D.numberText = f.number.value;
      if (f.unit) D.unit = f.unit.value;
      if (f.scoring) D.scoring = f.scoring.value;
      if (D.tolerance && f.tolValue) {
        const v = Q.parseNumber(f.tolValue.value);
        D.tolerance = v > 0 ? { ...D.tolerance, value: v } : D.tolerance;
      }
    } else {
      if (f.answer) D.answer = f.answer.value;
      if (f.accept) D.accept = f.accept.value;
    }
    ['media', 'solmedia'].forEach((part) => {
      const m = part === 'media' ? D.media : D.solutionMedia;
      if (!m) return;
      const s = form.querySelector(`[data-mt="start"][data-part="${part}"]`);
      const e = form.querySelector(`[data-mt="end"][data-part="${part}"]`);
      if (s) {
        const v = parseTime(s.value);
        if (Number.isFinite(v)) m.start = v;
      }
      if (e) {
        const v = parseTime(e.value);
        if (Number.isFinite(v)) m.end = v > m.start ? v : 0;
      }
      const ap = part === 'media' && form.querySelector('[data-autoplay]');
      if (ap) m.autoplay = ap.checked;
      const kind = form.querySelector(`[data-kind="${part}"]`);
      if (kind) m.kind = kind.value;
    });
  }

  function updateModeHelp() {
    const m = form.elements.mode.value || quiz.defaultMode;
    sheet.el.querySelector('[data-mode-help]').textContent = Q.MODE_HELP[m] || '';
  }

  function renderAnswer() {
    setHTML(sheet.el.querySelector('[data-part="answer"]'), answerPartHTML(D));
  }

  async function renderMedia(part) {
    const m = part === 'media' ? D.media : D.solutionMedia;
    const box = sheet.el.querySelector(`[data-part="${part}"]`);
    box.innerHTML = mediaPartHTML(m, part);
    if (m) {
      const html = await previewHTML(m);
      const pv = sheet.el.querySelector(`[data-preview="${part}"]`);
      if (pv) pv.innerHTML = html || '<p class="hint">Keine Vorschau möglich.</p>';
    }
  }

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.link) {
      const url = t.value.trim();
      if (!url) return;
      if (!isHttps(url)) return toast('Der Link muss mit https:// anfangen.');
      const kind = linkKind(url);
      const m = normalizeMedia({ src: url, kind: kind || 'image', start: kind === 'youtube' ? youtubeStart(url) : 0 });
      if (!m) return toast('Mit diesem Link kann die Quizwand nichts anfangen.');
      collect();
      if (t.dataset.link === 'media') D.media = m;
      else D.solutionMedia = m;
      renderMedia(t.dataset.link);
      if (!kind) toast('Stell unten ein, ob der Link ein Bild, Video oder Ton ist.');
    }
    if (t.dataset.kind) collect();
  });

  form.querySelector('[data-file]').addEventListener('change', async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    const part = input.dataset.part || 'media';
    input.value = '';
    if (!file) return;
    const box = sheet.el.querySelector(`[data-part="${part}"]`);
    box.innerHTML = '<p class="hint">Datei wird vorbereitet …</p>';
    try {
      const prepared = await prepareFile(file);
      const rec = await putFile({ blob: prepared.blob, name: prepared.name, mime: prepared.mime });
      collect();
      const m = { kind: prepared.kind, src: '', file: rec.id, name: rec.name, size: rec.size, start: 0, end: 0, autoplay: true };
      if (part === 'media') D.media = m;
      else D.solutionMedia = m;
    } catch (err) {
      toast(err.message || 'Die Datei konnte nicht gespeichert werden.');
    }
    renderMedia(part);
  });

  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      collect();
      goNext = true;
      sheet.close();
    } else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
      e.preventDefault();
    }
  });

  updateModeHelp();
  renderAnswer();
  renderMedia('media');
  renderMedia('solmedia');
}

// ---------- Aktionen ----------

function boardSizeOps(board) {
  const rows = rowsOf(board);
  return {
    addCat() {
      if (board.categories.length >= LIMITS.cats) return toast(`Mehr als ${LIMITS.cats} Kategorien passen nicht aufs Board.`);
      const n = rows || 4;
      board.categories.push({ name: `Kategorie ${board.categories.length + 1}`, questions: Array.from({ length: n }, (_, r) => blankQuestion(rows ? rowValue(board, r) : (r + 1) * 100)) });
      return true;
    },
    async delCat(ci = board.categories.length - 1) {
      const cat = board.categories[ci];
      if (!cat) return false;
      if (cat.questions.some((x) => String(x.question || '').trim())) {
        const ok = await confirmDialog({ title: `„${cat.name}“ entfernen?`, text: 'Die Fragen dieser Kategorie gehen verloren.', ok: 'Entfernen', danger: true });
        if (!ok) return false;
      }
      board.categories.splice(ci, 1);
      return true;
    },
    addRow() {
      if (!board.categories.length) return toast('Leg zuerst eine Kategorie an.');
      if (rows >= LIMITS.rows) return toast(`Mehr als ${LIMITS.rows} Fragen pro Kategorie gehen nicht.`);
      const last = rows ? rowValue(board, rows - 1) : 0;
      const step = rows > 1 ? last - rowValue(board, rows - 2) || 100 : 100;
      board.categories.forEach((c) => {
        while (c.questions.length < rows) c.questions.push(blankQuestion(rowValue(board, c.questions.length)));
        c.questions.push(blankQuestion(last + step));
      });
      return true;
    },
    async delRow() {
      if (rows <= 1) return false;
      if (board.categories.some((c) => c.questions[rows - 1] && String(c.questions[rows - 1].question || '').trim())) {
        const ok = await confirmDialog({ title: 'Letzte Zeile entfernen?', text: 'Die Fragen in der letzten Zeile gehen verloren.', ok: 'Entfernen', danger: true });
        if (!ok) return false;
      }
      board.categories.forEach((c) => c.questions.splice(rows - 1));
      return true;
    },
  };
}

const withQuiz = (fn) => async (api, btn) => {
  const q = editorQuiz();
  if (!q) return;
  const changed = await fn(q, q.boards[E.board], btn, api);
  if (changed) {
    save(q);
    renderEditor();
  }
};

Object.assign(actions, {
  'quiz:library': (api) => api.navigate({ game: ID, view: 'library' }),
  'quiz:library-back': (api) => {
    flushEditor();
    E.quizId = null;
    api.navigate({ game: ID, view: 'library' });
  },
  'quiz:new': (api) => {
    const quiz = newQuiz();
    saveQuiz(quiz);
    E.quizId = quiz.id;
    E.board = 0;
    api.navigate({ game: ID, view: 'editor' });
  },
  'quiz:edit': (api, btn) => {
    E.quizId = btn.dataset.id;
    E.board = 0;
    api.navigate({ game: ID, view: 'editor' });
  },
  'quiz:import': () => {
    const input = $('[data-slot="file"]');
    if (input) input.click();
  },
  'quiz:sample': (api) => {
    addSample();
    toast('Beispiel-Quiz geladen.');
    api.render();
  },
  'quiz:more': (api, btn) => {
    const quiz = getQuiz(btn.dataset.id);
    if (!quiz) return;
    openSheet({
      title: quiz.title,
      body: `<div class="sheet-actions"><button class="btn secondary" data-sa="export">Als Datei exportieren</button>
        <button class="btn secondary" data-sa="copy">Kopie anlegen</button>
        <button class="btn ghost danger" data-sa="delete">Löschen</button></div>`,
      async onAction(action, b2, sh) {
        sh.close();
        if (action === 'export') {
          try {
            downloadFile(fileName(quiz), await exportQuiz(quiz));
          } catch (err) {
            toast('Export hat nicht geklappt: ' + (err.message || err));
          }
        }
        if (action === 'copy') {
          saveQuiz({ ...JSON.parse(JSON.stringify(quiz)), id: makeId(), title: `${quiz.title} (Kopie)` });
          api.render();
        }
        if (action === 'delete') {
          const ok = await confirmDialog({ title: `„${quiz.title}“ löschen?`, text: 'Das Quiz ist danach von diesem Gerät weg – mit seinen Bildern, Videos und Tönen. Exportier es vorher, wenn du es behalten willst.', ok: 'Löschen', danger: true });
          if (ok) {
            deleteQuiz(quiz.id);
            api.render();
          }
        }
      },
    });
  },
  'quiz:e-board': (api, btn) => {
    E.board = Number(btn.dataset.b);
    renderEditor();
  },
  'quiz:e-add-board': withQuiz((q, board) => {
    if (q.boards.length >= LIMITS.boards) return toast(`Mehr als ${LIMITS.boards} Boards gehen nicht.`);
    const rows = rowsOf(board) || 4;
    const values = Array.from({ length: rows }, (_, r) => rowValue(board, r));
    q.boards.push(blankBoard(q.boards.length + 1, { cats: board.categories.length || 5, rows, values }));
    E.board = q.boards.length - 1;
    return true;
  }),
  'quiz:e-board-menu': (api) => {
    const q = editorQuiz();
    if (!q) return;
    openSheet({
      title: q.boards[E.board].title || `Board ${E.board + 1}`,
      body: `<div class="sheet-actions">
        <button class="btn secondary" data-sa="dup">${ICON.copy} Board kopieren</button>
        ${E.board > 0 ? `<button class="btn secondary" data-sa="left">${ICON.left} Nach vorn</button>` : ''}
        ${E.board < q.boards.length - 1 ? `<button class="btn secondary" data-sa="right">${ICON.right} Nach hinten</button>` : ''}
        ${q.boards.length > 1 ? `<button class="btn ghost danger" data-sa="delete">${ICON.trash} Board löschen</button>` : ''}</div>`,
      async onAction(action, b2, sh) {
        sh.close();
        const qz = editorQuiz();
        const i = E.board;
        if (action === 'dup') {
          if (qz.boards.length >= LIMITS.boards) return toast(`Mehr als ${LIMITS.boards} Boards gehen nicht.`);
          const copy = JSON.parse(JSON.stringify(qz.boards[i]));
          copy.title = `${copy.title} (Kopie)`.slice(0, 60);
          qz.boards.splice(i + 1, 0, copy);
          E.board = i + 1;
        }
        if (action === 'left' || action === 'right') {
          const j = action === 'left' ? i - 1 : i + 1;
          [qz.boards[i], qz.boards[j]] = [qz.boards[j], qz.boards[i]];
          E.board = j;
        }
        if (action === 'delete') {
          const ok = await confirmDialog({ title: `„${qz.boards[i].title}“ löschen?`, text: 'Alle Fragen auf diesem Board gehen verloren.', ok: 'Löschen', danger: true });
          if (!ok) return;
          qz.boards.splice(i, 1);
          E.board = Math.max(0, i - 1);
        }
        save(qz);
        renderEditor();
      },
    });
  },
  'quiz:e-cats': withQuiz(async (q, board, btn) => {
    const ops = boardSizeOps(board);
    return Number(btn.dataset.d) > 0 ? ops.addCat() : ops.delCat();
  }),
  'quiz:e-rows': withQuiz(async (q, board, btn) => {
    const ops = boardSizeOps(board);
    return Number(btn.dataset.d) > 0 ? ops.addRow() : ops.delRow();
  }),
  'quiz:e-cat-menu': (api, btn) => {
    const q = editorQuiz();
    const ci = Number(btn.dataset.c);
    const board = q && q.boards[E.board];
    if (!board || !board.categories[ci]) return;
    openSheet({
      title: board.categories[ci].name || `Kategorie ${ci + 1}`,
      body: `<div class="sheet-actions">
        ${ci > 0 ? `<button class="btn secondary" data-sa="left">${ICON.left} Nach links</button>` : ''}
        ${ci < board.categories.length - 1 ? `<button class="btn secondary" data-sa="right">${ICON.right} Nach rechts</button>` : ''}
        <button class="btn ghost danger" data-sa="delete">${ICON.trash} Kategorie entfernen</button></div>`,
      async onAction(action, b2, sh) {
        sh.close();
        const qz = editorQuiz();
        const bd = qz.boards[E.board];
        if (action === 'left' || action === 'right') {
          const j = action === 'left' ? ci - 1 : ci + 1;
          [bd.categories[ci], bd.categories[j]] = [bd.categories[j], bd.categories[ci]];
        }
        if (action === 'delete' && !(await boardSizeOps(bd).delCat(ci))) return;
        save(qz);
        renderEditor();
      },
    });
  },
  'quiz:e-question': (api, btn) => openQuestionEditor(api, Number(btn.dataset.c), Number(btn.dataset.r)),
});
