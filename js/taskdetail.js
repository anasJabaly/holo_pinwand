/* ═══════════════════════════════════════════════════════
   taskdetail.js · Task-Detailansicht (Klick auf Karte)
   Titel inline, Status-Workflow, Priorität, Gruppe,
   Deadline + Uhrzeit, Notizen, Subtask-Checkliste.
   ═══════════════════════════════════════════════════════ */

import { findTask, editTask, setStatus, deleteTask, addSubtask, toggleSubtask, deleteSubtask } from './tasks.js';
import { allGroups } from './groups.js';
import { esc, toast, showLevelUp } from './ui.js';
import { getState } from './state.js';
import { closeDialog, openDialog } from './dialogs.js';

const el = (id) => document.getElementById(id);
let currentId = null;

export function openDetail(id) {
  if (!findTask(id)) return;
  currentId = id;
  openDialog('detailOverlay', { focus: '#dTitle' });
  renderDetail();
}

export function closeDetail() {
  closeDialog('detailOverlay');
}

export function renderDetail() {
  if (el('detailOverlay').hidden || !currentId) return;
  const t = findTask(currentId);
  if (!t) { closeDetail(); return; }

  el('dTitle').value = t.title;

  // Status-Workflow
  el('dStatus').innerHTML = [
    ['open', 'OFFEN'], ['progress', 'IN ARBEIT'], ['done', '✓ ERLEDIGT'],
  ].map(([v, label]) =>
    `<button type="button" class="hud-btn small ${t.status === v ? 'active' : ''}" data-status="${v}">${label}</button>`
  ).join('');

  el('dPriority').value = t.priority;
  el('dDiff').value = t.difficulty;

  // Gruppen-Dropdown
  el('dGroup').innerHTML =
    `<option value="">KEINE GRUPPE</option>` +
    allGroups().map((g) =>
      `<option value="${g.id}" ${t.groupId === g.id ? 'selected' : ''}>${esc(g.name.toUpperCase())}</option>`
    ).join('');

  el('dDue').value = t.dueDate || '';
  el('dDueTime').value = t.dueTime || '';
  el('dRecur').value = t.recur || '';
  el('dNotes').value = t.notes || '';

  el('dPlanInfo').textContent = t.plan
    ? `◷ GEPLANT: ${t.plan.start} UHR · ${t.plan.durationMin} MIN`
    : '◷ NOCH KEIN ZEITBLOCK — über "TAG PLANEN" einplanen';

  // Subtasks
  const done = t.subtasks.filter((s) => s.done).length;
  el('dSubProgress').textContent = t.subtasks.length ? `${done}/${t.subtasks.length}` : '';
  el('dSubs').innerHTML = t.subtasks.map((s) => `
    <div class="subtask ${s.done ? 'done' : ''}">
      <button type="button" class="sub-check" data-sub-toggle="${s.id}" aria-label="Unterpunkt umschalten">${s.done ? '✓' : ''}</button>
      <span class="sub-title">${esc(s.title)}</span>
      <button type="button" class="hud-btn small danger" data-sub-del="${s.id}" aria-label="Unterpunkt löschen">✕</button>
    </div>`).join('');

  const fmt = (ts) => ts ? new Date(ts).toLocaleDateString('de-DE') : '—';
  el('dMeta').textContent = `ERSTELLT ${fmt(t.createdAt)} · ERLEDIGT ${fmt(t.doneAt)}`;
}

/** Formularwerte in den Task schreiben (bei jeder Änderung) */
function saveFields() {
  if (!currentId) return;
  editTask(currentId, {
    title: el('dTitle').value,
    priority: el('dPriority').value,
    difficulty: el('dDiff').value,
    groupId: el('dGroup').value || null,
    dueDate: el('dDue').value || null,
    dueTime: el('dDueTime').value || null,
    recur: el('dRecur').value || null,
    notes: el('dNotes').value,
  });
}

export function initDetailEvents() {
  const overlay = el('detailOverlay');

  overlay.addEventListener('holo:dialog-before-close', saveFields);
  overlay.addEventListener('holo:dialog-closed', () => { currentId = null; });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { saveFields(); closeDetail(); return; }

    const statusBtn = e.target.closest('[data-status]');
    if (statusBtn) {
      const { levelUps, xpDelta } = setStatus(currentId, statusBtn.dataset.status);
      if (xpDelta > 0) toast(`+${xpDelta} XP`);
      if (levelUps > 0) showLevelUp(getState().player.level);
      renderDetail();
      return;
    }
    const subT = e.target.closest('[data-sub-toggle]');
    if (subT) { toggleSubtask(currentId, subT.dataset.subToggle); renderDetail(); return; }
    const subD = e.target.closest('[data-sub-del]');
    if (subD) { deleteSubtask(currentId, subD.dataset.subDel); renderDetail(); return; }
  });

  // Felder speichern bei Änderung (kein extra Save-Button nötig)
  ['dTitle', 'dPriority', 'dDiff', 'dGroup', 'dDue', 'dDueTime', 'dRecur', 'dNotes'].forEach((id) =>
    el(id).addEventListener('change', saveFields));
  el('dTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { saveFields(); e.target.blur(); } });

  // Subtask hinzufügen
  const addSub = () => {
    addSubtask(currentId, el('dSubInput').value);
    el('dSubInput').value = '';
    renderDetail();
    el('dSubInput').focus();
  };
  el('dSubAdd').addEventListener('click', addSub);
  el('dSubInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSub(); });

  el('dDelete').addEventListener('click', () => {
    if (confirm('Aufgabe wirklich löschen?')) {
      deleteTask(currentId);
      closeDetail();
      toast('GELÖSCHT');
    }
  });
  el('dClose').addEventListener('click', () => { saveFields(); closeDetail(); });
}
