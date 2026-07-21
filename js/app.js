/* ═══════════════════════════════════════════════════════
   app.js · Einstiegspunkt: Boot-Sequenz + Event-Wiring (v4)
   ═══════════════════════════════════════════════════════ */

import { getState, subscribe, todayISO } from './state.js';
import {
  addTask, toggleDone, setDueDate, deleteTask, planTask, rolloverRecurring,
} from './tasks.js';
import { ensureDailyQuests, validateStreak, refreshQuestProgress } from './leveling.js';
import { renderAll, tickClock, switchView, viewState, showLevelUp, toast, togglePanel } from './ui.js';
import { openPlanner, renderPlanner, initPlannerEvents } from './dayplanner.js';
import { prayerTimes, reminders, PRAYER_METHODS } from './integrations.js';
import { openDetail, renderDetail, initDetailEvents } from './taskdetail.js';
import { allGroups, addGroup, deleteGroup, setGroupColor, parseGroupShortcut, GROUP_COLORS } from './groups.js';
import { addEvent, editEvent, deleteEvent, findEvent, EVENT_COLORS } from './events.js';
import { runBootSequence } from './startscreen.js';
import { initAmbient, isAmbientAutostart } from './ambient.js';
import { esc } from './ui.js';

const el = (id) => document.getElementById(id);

/* ── Schnelleingabe (mit #gruppe-Kürzel) ── */
function handleAdd() {
  const input = el('taskInput');
  const where = el('taskWhere').value;
  const dateVal = el('taskDate').value;
  const dueDate =
    where === 'board' ? null :
    where === 'date' && dateVal ? dateVal : todayISO();

  const { title, groupId } = parseGroupShortcut(input.value);
  const t = addTask({ title, difficulty: el('taskDifficulty').value, dueDate, groupId });
  if (!t) { input.focus(); return; }
  input.value = '';
  input.focus();
}

/* ── Globale Klick-Aktionen ── */
function handleGlobalClick(e) {
  // 1) Buttons mit expliziter Aktion
  const btn = e.target.closest('button[data-act]');
  if (btn) {
    const { act, id } = btn.dataset;
    if (act === 'toggle') {
      const { levelUps, xpDelta } = toggleDone(id);
      if (xpDelta > 0) toast(`+${xpDelta} XP`);
      if (levelUps > 0) showLevelUp(getState().player.level);
    }
    if (act === 'del')     deleteTask(id);
    if (act === 'toBoard') setDueDate(id, null);
    if (act === 'toToday') setDueDate(id, todayISO());
    return;
  }

  // 2) Kleine Block-Buttons in Timelines
  const prayerX = e.target.closest('[data-prayer-remove]');
  if (prayerX) { prayerTimes.adopt(todayISO(), prayerX.dataset.prayerRemove, false); return; }
  const evBtn = e.target.closest('[data-event-id]');
  if (evBtn) { openEventModal(evBtn.dataset.eventId); return; }
  const openTaskBtn = e.target.closest('[data-open-task]');
  if (openTaskBtn) { openDetail(openTaskBtn.dataset.openTask); return; }

  // 3) Karte/Zeile geklickt → Detailansicht
  const card = e.target.closest('[data-task-id]');
  if (card && !e.target.closest('button')) openDetail(card.dataset.taskId);
}

/* ── Quick-Add: Aufgabe ODER Termin direkt im Zeitraster ── */
let quickTime = null;

function openQuickAdd(time) {
  quickTime = time;
  el('quickTimeLabel').textContent = `HEUTE · ${time} UHR`;
  el('quickTitle').value = '';
  el('quickType').value = 'task';
  el('quickColorRow').hidden = true;
  el('quickAddOverlay').hidden = false;
  el('quickTitle').focus();
}

function submitQuickAdd() {
  const type = el('quickType').value;
  const dur = parseInt(el('quickDur').value, 10);

  if (type === 'event') {
    const ev = addEvent({
      title: el('quickTitle').value, date: todayISO(),
      start: quickTime, durationMin: dur, color: el('quickColor').value,
    });
    if (!ev) { el('quickTitle').focus(); return; }
    toast(`TERMIN: ${quickTime} UHR ✓`);
  } else {
    const { title, groupId } = parseGroupShortcut(el('quickTitle').value);
    const t = addTask({ title, difficulty: el('quickDiff').value, dueDate: todayISO(), groupId });
    if (!t) { el('quickTitle').focus(); return; }
    planTask(t.id, quickTime, dur);
    toast(`EINGEPLANT: ${quickTime} UHR ✓`);
  }
  el('quickAddOverlay').hidden = true;
}

/* ── Termin bearbeiten ── */
let editingEventId = null;

function openEventModal(id) {
  const ev = findEvent(id);
  if (!ev) return;
  editingEventId = id;
  el('evTitle').value = ev.title;
  el('evStart').value = ev.start;
  el('evDur').value = String(ev.durationMin);
  el('evColor').value = ev.color;
  el('eventOverlay').hidden = false;
}

/* ── Gebetszeiten-Vorschau-Modal ── */
function renderPrayerModal() {
  if (el('prayerOverlay').hidden) return;
  const s = getState();
  const iso = todayISO();
  const body = el('prayerModalBody');

  // Standort-/Methoden-Einstellungen (immer sichtbar)
  const methodOpts = PRAYER_METHODS.map((m) =>
    `<option value="${m.id}" ${(s.settings.prayerMethod ?? 13) === m.id ? 'selected' : ''}>${esc(m.name)}</option>`
  ).join('');

  const settingsBlock = `
    <div class="prayer-settings">
      <div class="form-row">
        <label for="prayerCity">STADT / MOSCHEE-ORT</label>
        <div class="form-row-inline" style="gap:8px">
          <input type="text" class="form-input" id="prayerCity" placeholder="z. B. Solingen"
                 value="${esc(s.settings.locationLabel || '')}">
          <button class="hud-btn" id="prayerCityBtn" style="height:40px; white-space:nowrap">SUCHEN</button>
        </div>
        <div id="prayerCityResults"></div>
      </div>
      <div class="form-row">
        <label for="prayerMethodSel">BERECHNUNGSMETHODE</label>
        <select class="form-input" id="prayerMethodSel">${methodOpts}</select>
      </div>
      <div class="form-row">
        <button class="hud-btn small" id="prayerGpsBtn">◉ STATTDESSEN GPS VERWENDEN</button>
      </div>
    </div>`;

  if (!s.settings.prayerEnabled || !s.settings.coords) {
    body.innerHTML = `
      <p class="dim" style="font-size:14px; margin-bottom:14px">
        Wähle deine Stadt für präzise Gebetszeiten (Aladhan-API, kostenlos). Die Methode bestimmt die genaue Berechnung — für Deutschland ist Diyanet meist am nächsten an den Moschee-Zeiten.
      </p>
      ${settingsBlock}`;
    return;
  }

  const list = prayerTimes.listFor(iso);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next = list.find((p) => toMinutes(p.time) > nowMin);
  let countdown = '';
  if (next) {
    const diff = toMinutes(next.time) - nowMin;
    countdown = `NÄCHSTES: ${next.name.toUpperCase()} IN ${Math.floor(diff / 60)}H ${diff % 60}M`;
  }

  body.innerHTML = `
    ${settingsBlock}
    <div class="prayer-divider"></div>
    ${countdown ? `<div class="prayer-countdown mono">${countdown}</div>` : ''}
    ${list.map((p) => {
      const adopted = prayerTimes.isAdopted(iso, p.name);
      return `
        <div class="prayer-modal-row ${adopted ? 'adopted' : ''}">
          <span class="p-name">${esc(p.name)}</span>
          <span class="mono p-time">${p.time}</span>
          <button class="hud-btn small ${adopted ? 'active' : ''}" data-adopt="${esc(p.name)}">
            ${adopted ? '✓ IM PLAN' : '→ IN PLAN'}
          </button>
        </div>`;
    }).join('')}
    <button class="hud-btn primary" id="prayerAdoptAll" style="margin-top:14px; width:100%">ALLE ÜBERNEHMEN</button>
    <p class="mono dim" style="font-size:10px; margin-top:10px; letter-spacing:1px">
      NICHTS WIRD OHNE DEINE BESTÄTIGUNG IN DEN PLAN GESCHRIEBEN.
    </p>`;
}

function toMinutes(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

/* ── Gruppen-Verwaltung ── */
function renderGroupsModal() {
  if (el('groupsOverlay').hidden) return;
  el('groupsBody').innerHTML = allGroups().length
    ? allGroups().map((g) => `
        <div class="group-row">
          <span class="g-dot" style="--g:${g.color}"></span>
          <span class="g-name">${esc(g.name)}</span>
          <select class="form-input g-color" data-gcolor="${g.id}" aria-label="Farbe">
            ${GROUP_COLORS.map((c) => `<option value="${c}" ${c === g.color ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <button class="hud-btn small danger" data-gdel="${g.id}">✕</button>
        </div>`).join('')
    : '<div class="empty">NOCH KEINE GRUPPEN — z. B. "SWP", "Mathe 2", "Deen", "Privat"</div>';
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
  rolloverRecurring();
  validateStreak();
  ensureDailyQuests();
  refreshQuestProgress();

  el('addBtn').addEventListener('click', handleAdd);
  el('taskInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAdd(); });
  el('taskWhere').addEventListener('change', () => {
    el('taskDate').style.display = el('taskWhere').value === 'date' ? '' : 'none';
  });

  document.querySelectorAll('[data-view]').forEach((b) =>
    b.addEventListener('click', () => switchView(b.dataset.view)));

  el('searchInput').addEventListener('input', (e) => { viewState.search = e.target.value; renderAll(); });
  el('groupFilter').addEventListener('change', (e) => { viewState.groupFilter = e.target.value; renderAll(); });

  el('weekPrev').addEventListener('click', () => { viewState.weekOffset--; renderAll(); });
  el('weekNext').addEventListener('click', () => { viewState.weekOffset++; renderAll(); });
  el('calPrev').addEventListener('click', () => { viewState.monthOffset--; renderAll(); });
  el('calNext').addEventListener('click', () => { viewState.monthOffset++; renderAll(); });
  el('view-month').addEventListener('click', (e) => {
    const day = e.target.closest('[data-cal-day]');
    if (day) { viewState.selectedDay = day.dataset.calDay; renderAll(); }
  });

  el('planDayBtn').addEventListener('click', openPlanner);
  initPlannerEvents();
  initDetailEvents();
  initAmbient();

  // Panels ein-/ausklappen
  el('view-today').addEventListener('click', (e) => {
    const head = e.target.closest('[data-toggle]');
    if (head) { togglePanel(head.dataset.toggle); renderAll(); }
  });

  // "⋯ MEHR"-Menü öffnen/schließen
  el('moreBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    el('moreMenu').hidden = !el('moreMenu').hidden;
  });
  document.addEventListener('click', () => { el('moreMenu').hidden = true; });
  el('moreMenu').addEventListener('click', (e) => e.stopPropagation());

  /* Quick-Add */
  el('view-today').addEventListener('click', (e) => {
    const slot = e.target.closest('.slot');
    if (slot) { openQuickAdd(slot.dataset.slot); return; }
    if (e.target.id === 'prayerManageBtn') { el('prayerOverlay').hidden = false; renderPrayerModal(); }
  });
  document.addEventListener('holo:quickadd', (e) => openQuickAdd(e.detail.time));
  el('quickType').addEventListener('change', () => {
    const isEvent = el('quickType').value === 'event';
    el('quickColorRow').hidden = !isEvent;
    el('quickDiffRow').hidden = isEvent;
  });
  el('quickAddBtn').addEventListener('click', submitQuickAdd);
  el('quickTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitQuickAdd(); });
  el('quickCancel').addEventListener('click', () => { el('quickAddOverlay').hidden = true; });
  el('quickAddOverlay').addEventListener('click', (e) => {
    if (e.target === el('quickAddOverlay')) el('quickAddOverlay').hidden = true;
  });

  /* Termin-Modal */
  el('evSave').addEventListener('click', () => {
    editEvent(editingEventId, {
      title: el('evTitle').value, start: el('evStart').value,
      durationMin: parseInt(el('evDur').value, 10), color: el('evColor').value,
    });
    el('eventOverlay').hidden = true;
    toast('TERMIN GESPEICHERT ✓');
  });
  el('evDelete').addEventListener('click', () => {
    deleteEvent(editingEventId);
    el('eventOverlay').hidden = true;
    toast('TERMIN GELÖSCHT');
  });
  el('evCancel').addEventListener('click', () => { el('eventOverlay').hidden = true; });
  el('eventOverlay').addEventListener('click', (e) => {
    if (e.target === el('eventOverlay')) el('eventOverlay').hidden = true;
  });

  /* Gebetszeiten: Button öffnet die VORSCHAU (kein Auto-Eintrag) */
  el('prayerBtn').addEventListener('click', () => {
    el('prayerOverlay').hidden = false;
    renderPrayerModal();
  });
  el('prayerOverlay').addEventListener('click', async (e) => {
    if (e.target === el('prayerOverlay')) { el('prayerOverlay').hidden = true; return; }

    // Stadt suchen
    if (e.target.id === 'prayerCityBtn') {
      const q = el('prayerCity').value.trim();
      if (q.length < 2) return;
      el('prayerCityBtn').textContent = 'SUCHE …';
      const results = await prayerTimes.searchCity(q);
      el('prayerCityBtn').textContent = 'SUCHEN';
      if (results.length) {
        await prayerTimes.setLocation({ lat: results[0].lat, lon: results[0].lon }, q);
        toast(`STANDORT: ${q.toUpperCase()} ✓`);
        renderPrayerModal();
        renderAll();
      } else {
        toast('STADT NICHT GEFUNDEN — ANDERS SCHREIBEN?');
      }
      return;
    }

    // GPS-Fallback
    if (e.target.id === 'prayerGpsBtn') {
      e.target.textContent = 'GPS WIRD ERMITTELT …';
      const ok = await prayerTimes.enable();
      toast(ok ? 'GPS-STANDORT AKTIV ✓' : 'GPS NICHT VERFÜGBAR');
      renderPrayerModal();
      renderAll();
      return;
    }

    if (e.target.id === 'prayerAdoptAll') { prayerTimes.adoptAll(todayISO()); renderPrayerModal(); return; }
    const adoptBtn = e.target.closest('[data-adopt]');
    if (adoptBtn) {
      const name = adoptBtn.dataset.adopt;
      prayerTimes.adopt(todayISO(), name, !prayerTimes.isAdopted(todayISO(), name));
      renderPrayerModal();
    }
  });
  // Methodenwechsel
  el('prayerOverlay').addEventListener('change', async (e) => {
    if (e.target.id === 'prayerMethodSel') {
      await prayerTimes.setMethod(parseInt(e.target.value, 10));
      toast('METHODE AKTUALISIERT ✓');
      renderPrayerModal();
      renderAll();
    }
  });
  el('prayerClose').addEventListener('click', () => { el('prayerOverlay').hidden = true; });

  /* Gruppen-Verwaltung */
  el('groupsBtn').addEventListener('click', () => { el('groupsOverlay').hidden = false; renderGroupsModal(); });
  el('groupsClose').addEventListener('click', () => { el('groupsOverlay').hidden = true; });
  el('groupsOverlay').addEventListener('click', (e) => {
    if (e.target === el('groupsOverlay')) { el('groupsOverlay').hidden = true; return; }
    const del = e.target.closest('[data-gdel]');
    if (del && confirm('Gruppe löschen? Zugehörige Aufgaben behalten "Keine Gruppe".')) {
      deleteGroup(del.dataset.gdel);
      renderGroupsModal();
    }
  });
  el('groupsOverlay').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-gcolor]');
    if (sel) { setGroupColor(sel.dataset.gcolor, sel.value); renderGroupsModal(); }
  });
  el('newGroupBtn').addEventListener('click', () => {
    if (addGroup(el('newGroupName').value)) {
      el('newGroupName').value = '';
      renderGroupsModal();
    }
  });
  el('newGroupName').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('newGroupBtn').click(); });

  /* Erinnerungen */
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

  document.addEventListener("click", handleGlobalClick);
  initWeekDnD();
  subscribe(() => { renderAll(); renderPlanner(); renderDetail(); renderPrayerModal(); });

  tickClock();
  setInterval(tickClock, 1000);
  setInterval(renderAll, 60 * 1000);

  switchView('today');
}

/* Boot-Sequenz zuerst, dann die App */
runBootSequence(boot);
