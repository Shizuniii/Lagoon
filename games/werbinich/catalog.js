// games/werbinich/catalog.js – die Themenliste der Gruppe ansehen und (als Gruppen-Besitzer) bearbeiten.
// Gespeichert unter /topics in der Datenbank: { data: JSON-Text, updatedAt }. Ohne Eintrag gilt die eingebaute Liste.
import { ICON, esc, toast, openSheet, confirmDialog } from '../../core/ui.js';
import { catalog, normalizeCatalog, isCustomCatalog, setCatalog, CATALOG_LIMITS, topicByName } from './topics.js';

const isOwner = (api) => !!(api.ctx && api.ctx.owner && api.ctx.owner === api.uid);
const OWN_GROUP = { id: 'eigene', name: 'Eigene Themen' };

async function loadFresh(api) {
  try {
    const v = await api.b.read('topics');
    setCatalog(v && v.data);
  } catch {
    /* dann eben die zuletzt bekannte Liste */
  }
}

async function saveCatalog(api, groups) {
  const clean = normalizeCatalog({ groups });
  if (!clean) throw new Error('Die Liste ist leer.');
  const data = JSON.stringify({ v: 1, groups: clean });
  if (data.length > 190000) throw new Error('Die Liste ist zu lang.');
  await api.b.write('topics', { data, updatedAt: api.b.now() });
  setCatalog(data);
  api.render();
}

export async function openCatalog(api) {
  await loadFresh(api);
  if (isOwner(api)) openEditor(api);
  else openViewer();
}

function openViewer() {
  const groups = catalog();
  const n = groups.reduce((sum, g) => sum + g.topics.length, 0);
  openSheet({
    title: 'Themenliste',
    wide: true,
    body: `<p class="hint">${n} Themen in ${groups.length} Bereichen. Ändern kann die Liste nur, wer die Gruppe eingerichtet hat.</p>
      ${groups
        .map(
          (g) => `<details class="cat-group"><summary>${esc(g.name)} <span class="muted">(${g.topics.length})</span></summary>
          <ul class="cat-view">${g.topics.map((t) => `<li><strong>${esc(t.name)}</strong>${t.hint ? `<span>${esc(t.hint)}</span>` : ''}</li>`).join('')}</ul></details>`
        )
        .join('')}`,
  });
}

function topicRow(t = { name: '', hint: '' }) {
  return `<li class="cat-row">
    <input class="input cat-name" type="text" maxlength="${CATALOG_LIMITS.name}" placeholder="Thema" aria-label="Thema" value="${esc(t.name)}">
    <input class="input cat-hint" type="text" maxlength="${CATALOG_LIMITS.hint}" placeholder="Kurze Erklärung (freiwillig)" aria-label="Erklärung" value="${esc(t.hint || '')}">
    <button class="icon-btn" type="button" data-x="del-topic" aria-label="Thema löschen" title="Thema löschen">${ICON.trash}</button></li>`;
}

function groupHTML(g, open) {
  return `<details class="cat-group" data-gid="${esc(g.id)}"${open ? ' open' : ''}>
    <summary><span class="cat-gname">${esc(g.name)}</span> <span class="muted cat-count">(${g.topics.length})</span></summary>
    <div class="stack-tight cat-body">
      <label class="field"><span>Name des Bereichs</span><input class="cat-group-name" type="text" maxlength="${CATALOG_LIMITS.groupName}" value="${esc(g.name)}"></label>
      <ul class="cat-rows">${g.topics.map((t) => topicRow(t)).join('')}</ul>
      <div class="row-wrap"><button class="btn secondary" type="button" data-x="add-topic">${ICON.plus} Thema hinzufügen</button>
        <button class="btn ghost danger" type="button" data-x="del-group">Bereich löschen</button></div>
    </div></details>`;
}

function collect(root) {
  return [...root.querySelectorAll('.cat-group')].map((d, i) => ({
    id: d.dataset.gid,
    name: d.querySelector('.cat-group-name').value.trim() || `Bereich ${i + 1}`,
    topics: [...d.querySelectorAll('.cat-row')]
      .map((r) => ({ name: r.querySelector('.cat-name').value.trim(), hint: r.querySelector('.cat-hint').value.trim() }))
      .filter((t) => t.name),
  }));
}

function updateCounts(root) {
  root.querySelectorAll('.cat-group').forEach((d) => {
    const n = [...d.querySelectorAll('.cat-name')].filter((i) => i.value.trim()).length;
    d.querySelector('.cat-count').textContent = `(${n})`;
  });
}

function openEditor(api) {
  const groups = catalog();
  const sheet = openSheet({
    title: 'Themenliste bearbeiten',
    wide: true,
    body: `<form class="stack" data-sheet-form="catalog" novalidate autocomplete="off">
      <p class="hint">Gilt für die ganze Gruppe und bleibt gespeichert. Ändern kannst nur du. Zeilen ohne Thema werden beim Speichern weggelassen.</p>
      <div class="stack-tight" data-cat-groups>${groups.map((g) => groupHTML(g, false)).join('')}</div>
      <div class="row-wrap"><button class="btn ghost" type="button" data-x="add-group">${ICON.plus} Neuer Bereich</button></div>
      <div class="row-wrap"><button class="btn primary" type="submit">Speichern</button>
        ${isCustomCatalog() ? '<button class="btn ghost danger" type="button" data-x="reset">Eingebaute Liste wiederherstellen</button>' : ''}</div>
    </form>`,
    async onSubmit(form, s2) {
      const next = collect(form);
      const names = next.flatMap((g) => g.topics.map((t) => t.name.toLowerCase()));
      const twice = names.find((n, i) => names.indexOf(n) !== i);
      if (twice) return toast(`„${twice}“ steht doppelt in der Liste. Lösch eins davon.`);
      if (!names.length) return toast('Die Liste braucht mindestens ein Thema.');
      try {
        await saveCatalog(api, next);
        s2.close();
        toast('Themenliste gespeichert.');
      } catch (err) {
        toast(err && err.message && !/PERMISSION/i.test(err.message) ? err.message : 'Die Themenliste konnte nicht gespeichert werden.');
      }
    },
  });
  const root = sheet.el;
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const x = b.dataset.x;
    if (x === 'add-topic') {
      const list = b.closest('.cat-group').querySelector('.cat-rows');
      list.insertAdjacentHTML('beforeend', topicRow());
      list.lastElementChild.querySelector('.cat-name').focus();
    } else if (x === 'del-topic') {
      b.closest('.cat-row').remove();
      updateCounts(root);
    } else if (x === 'del-group') {
      const d = b.closest('.cat-group');
      const filled = [...d.querySelectorAll('.cat-name')].some((i) => i.value.trim());
      if (filled && b.dataset.sure !== '1') {
        b.dataset.sure = '1';
        b.textContent = 'Wirklich löschen?';
        return;
      }
      d.remove();
    } else if (x === 'add-group') {
      const used = new Set([...root.querySelectorAll('.cat-group')].map((d) => d.dataset.gid));
      let id = 'eigene';
      for (let i = 2; used.has(id); i++) id = 'eigene' + i;
      root.querySelector('[data-cat-groups]').insertAdjacentHTML('beforeend', groupHTML({ id, name: 'Neuer Bereich', topics: [{ name: '', hint: '' }] }, true));
      const d = root.querySelector('[data-cat-groups]').lastElementChild;
      d.querySelector('.cat-group-name').select();
      d.querySelector('.cat-group-name').focus();
    } else if (x === 'reset') {
      const ok = await confirmDialog({
        title: 'Eingebaute Liste wiederherstellen?',
        text: 'Deine Änderungen an der Themenliste gehen dabei verloren.',
        ok: 'Wiederherstellen',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.b.write('topics', null);
        setCatalog(null);
        api.render();
        sheet.close();
        toast('Die eingebaute Themenliste gilt wieder.');
      } catch {
        toast('Das hat nicht geklappt.');
      }
    }
  });
  root.addEventListener('input', (e) => {
    if (e.target.matches('.cat-group-name')) e.target.closest('.cat-group').querySelector('.cat-gname').textContent = e.target.value || 'Bereich';
    if (e.target.matches('.cat-name')) updateCounts(root);
  });
  // Enter springt weiter statt zu speichern: Thema → Erklärung → neue Zeile
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('.cat-name, .cat-hint, .cat-group-name')) return;
    e.preventDefault();
    if (e.target.matches('.cat-name')) return e.target.closest('.cat-row').querySelector('.cat-hint').focus();
    if (e.target.matches('.cat-group-name')) return;
    const row = e.target.closest('.cat-row');
    row.insertAdjacentHTML('afterend', topicRow());
    row.nextElementSibling.querySelector('.cat-name').focus();
  });
}

/** Ein selbst eingetipptes Thema dauerhaft in die Liste übernehmen (Bereich „Eigene Themen“). */
export async function keepTopic(api, name) {
  if (!isOwner(api)) return;
  const n = String(name || '').trim().slice(0, CATALOG_LIMITS.name);
  if (!n) return;
  await loadFresh(api);
  if (topicByName(n)) return toast(`„${n}“ steht schon in der Themenliste.`);
  const groups = catalog().map((g) => ({ ...g, topics: [...g.topics] }));
  let own = groups.find((g) => g.id === OWN_GROUP.id);
  if (!own) {
    own = { ...OWN_GROUP, topics: [] };
    groups.push(own);
  }
  own.topics.push({ name: n, hint: '' });
  try {
    await saveCatalog(api, groups);
    toast(`„${n}“ ist jetzt in der Themenliste (Bereich „${own.name}“).`);
  } catch {
    toast('Das Thema konnte nicht gespeichert werden.');
  }
}
