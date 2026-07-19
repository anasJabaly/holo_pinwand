/* ═══════════════════════════════════════════════════════
   app.js · Einstiegspunkt: Initialisierung + Event-Wiring
   ═══════════════════════════════════════════════════════ */

import { getState, subscribe, todayISO } from './state.js';
import {
  addTask, toggleDone, setDueDate, deleteTask,
  editTask, planTask, findTask, rolloverRecurring,
} from './tasks.js';
import { ensureDailyQuests, validateStreak, refreshQuestProgress } from './leveling.js';
import {
  renderAll, tickClock, switchView, viewState, showLevelUp, toast,
} from './ui.js';
import { openPlanner, renderPlanner, initPlannerEvents } from './dayplanner.js';
import { prayerTimes, reminders } from './integrations.js';

const el = (id) => document.getElementById(id);

/* ── Task anlegen (Kommandozeile) ── */
function handleAdd() {
  const input = el('taskInput');
  const where = el('taskWhere').value;      // today | board | date
  const dateVal = el('taskDate').value;     // optionales Datum

  const dueDate =
    where === 'board' ? null :
    where === 'date' && dateVal ? dateVal :
    todayISO();

  const t = addTask({
    title: input.value,
    difficulty: el('taskDifficulty').value,
    dueDate,
  });
  if (!t) { input.focus(); return; }
  input.value = '';
  input.focus();
}

/* ── Globale Klick-Aktionen (Karten-Buttons) ── */
function handleAction(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;

  if (act === 'toggle') {
    const { levelUps, xpDelta } = toggleDone(id);
    if (xpDelta > 0) toast(`+${xpDelta} XP`);
    if (levelUps > 0) showLevelUp(getState().player.level);
  }
  if (act === 'del')     deleteTask(id);
  if (act === 'toBoard') setDueDate(id, null);
  if (act === 'toToday') setDueDate(id, todayISO());
  if (act === 'edit')    openEdit(id);
}

/* ── Quick-Add: Eintrag direkt im Zeitplan anlegen ── */
let quickTime = null;

function openQuickAdd(time) {
  quickTime = time;
  el('quickTimeLabel').textContent = `HEUTE · ${time} UHR`;
  el('quickTitle').value = '';
  el('quickAddOverlay').hidden = false;
  el('quickTitle').focus();
}

function submitQuickAdd() {
  const t = addTask({
    title: el('quickTitle').value,
    difficulty: el('quickDiff').value,
    dueDate: todayISO(),
  });
  if (!t) { el('quickTitle').focus(); return; }
  planTask(t.id, quickTime, parseInt(el('quickDur').value, 10));
  el('quickAddOverlay').hidden = true;
  toast(`EINGEPLANT: ${quickTime} UHR ✓`);
}

/* ── Edit-Modal: Task vollständig bearbeiten ── */
let editingId = null;

function openEdit(id) {
  const t = findTask(id);
  if (!t) return;
  editingId = id;
  el('editTitle').value = t.title;
  el('editDiff').value = t.difficulty;
  el('editDate').value = t.dueDate || '';
  el('editRecur').value = t.recur || '';
  el('editNotes').value = t.notes || '';
  el('editOverlay').hidden = false;
  el('editTitle').focus();
}

function submitEdit() {
  editTask(editingId, {
    title: el('editTitle').value,
    difficulty: el('editDiff').value,
    dueDate: el('editDate').value || null,
    recur: el('editRecur').value || null,
    notes: el('editNotes').value,
  });
  el('editOverlay').hidden = true;
  toast('GESPEICHERT ✓');
}

/* ── Drag & Drop: Wochenansicht (Task auf Tag ziehen) ── */
function initWeekDnD() {
  const week = el('view-week');
  week.addEventListener('dragstart', (e) => {
    const t = e.target.closest('[data-drag-id]');
    if (t) e.dataTransfer.setData('text/task-id', t.dataset.dragId);
  });
  week.addEventListener('dragover', (e) => {
    const day = e.target.closest('.week-day');
    if (day) { e.preventDefault(); day.classList.add('dragover'); }
  });
  week.addEventListener('dragleave', (e) => {
    const day = e.target.closest('.week-day');
    if (day) day.classList.remove('dragover');
  });
  week.addEventListener('drop', (e) => {
    const day = e.target.closest('.week-day');
    if (!day) return;
    e.preventDefault();
    const id = e.dataTransfer.getData('text/task-id');
    if (id) setDueDate(id, day.dataset.day);
  });
}

/* ── Boot ── */
function boot() {
  rolloverRecurring();   // wiederkehrende Tasks nach vorn rollen
  validateStreak();
  ensureDailyQuests();
  refreshQuestProgress();

  // Suche (filtert Heute-Karten + Pinnwand live)
  el('searchInput').addEventListener('input', (e) => {
    viewState.search = e.target.value;
    renderAll();
  });

  // Quick-Add: Klick auf leeren Slot in der Heute-Timeline
  el('view-today').addEventListener('click', (e) => {
    const slot = e.target.closest('.slot');
    if (slot) openQuickAdd(slot.dataset.slot);
    // Toggle "Gebete im Zeitplan anzeigen" (Button wird dynamisch gerendert)
    if (e.target.id === 'prayerTimelineToggle') {
      prayerTimes.toggleTimeline();
    }
  });
  // Quick-Add aus dem Tagesplaner heraus
  document.addEventListener('holo:quickadd', (e) => openQuickAdd(e.detail.time));

  el('quickAddBtn').addEventListener('click', submitQuickAdd);
  el('quickTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitQuickAdd(); });
  el('quickCancel').addEventListener('click', () => { el('quickAddOverlay').hidden = true; });
  el('quickAddOverlay').addEventListener('click', (e) => {
    if (e.target === el('quickAddOverlay')) el('quickAddOverlay').hidden = true;
  });

  el('editSaveBtn').addEventListener('click', submitEdit);
  el('editCancel').addEventListener('click', () => { el('editOverlay').hidden = true; });
  el('editOverlay').addEventListener('click', (e) => {
    if (e.target === el('editOverlay')) el('editOverlay').hidden = true;
  });

  // Kommandozeile
  el('addBtn').addEventListener('click', handleAdd);
  el('taskInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAdd(); });
  el('taskWhere').addEventListener('change', () => {
    el('taskDate').style.display = el('taskWhere').value === 'date' ? '' : 'none';
  });

  // View-Navigation
  document.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => switchView(b.dataset.view)));

  // Woche blättern
  el('weekPrev').addEventListener('click', () => { viewState.weekOffset--; renderAll(); });
  el('weekNext').addEventListener('click', () => { viewState.weekOffset++; renderAll(); });

  // Monat blättern + Tag wählen
  el('calPrev').addEventListener('click', () => { viewState.monthOffset--; renderAll(); });
  el('calNext').addEventListener('click', () => { viewState.monthOffset++; renderAll(); });
  el('view-month').addEventListener('click', (e) => {
    const day = e.target.closest('[data-cal-day]');
    if (day) { viewState.selectedDay = day.dataset.calDay; renderAll(); }
  });

  // Tagesplaner
  el('planDayBtn').addEventListener('click', openPlanner);
  initPlannerEvents();

  // Integrationen
  el('prayerBtn').addEventListener('click', async () => {
    const s = getState();
    if (s.settings.prayerEnabled) {
      prayerTimes.disable();
      toast('GEBETSZEITEN DEAKTIVIERT');
    } else {
      toast('STANDORT WIRD ERMITTELT …');
      const ok = await prayerTimes.enable();
      toast(ok ? 'GEBETSZEITEN AKTIV ✓' : 'STANDORT NICHT VERFÜGBAR');
    }
    renderAll(); renderPlanner();
  });
  el('notifyBtn').addEventListener('click', async () => {
    const ok = await reminders.enable();
    toast(ok ? 'ERINNERUNGEN AKTIV ✓ (10 MIN VORHER)' : 'BENACHRICHTIGUNGEN NICHT ERLAUBT');
  });
  if (getState().settings.notifyEnabled && 'Notification' in window && Notification.permission === 'granted') {
    reminders.start();
  }
  if (getState().settings.prayerEnabled) {
    prayerTimes.fetchFor(todayISO()).then(renderAll);
  }

  // Globale Aktionen + Rerender bei jeder State-Änderung
  document.addEventListener('click', handleAction);
  subscribe(() => { renderAll(); renderPlanner(); });
  initWeekDnD();

  // Uhr + Timeline-Jetzt-Linie im Minutentakt
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(renderAll, 60 * 1000);

  switchView('today');
}

boot();
