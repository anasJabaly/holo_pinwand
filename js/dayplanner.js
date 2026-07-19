/* ═══════════════════════════════════════════════════════
   dayplanner.js · "Tag planen"-Overlay
   Links: ungeplante Heute-Tasks · Rechts: Stundenleiste
   Planung per Klick (Task wählen → Slot klicken) ODER Drag & Drop.
   Raster: 30 Minuten. Konflikte werden rot markiert.
   ═══════════════════════════════════════════════════════ */

import { getState, todayISO } from './state.js';
import {
  todayTasks, planTask, unplanTask, changePlanDuration,
  toMinutes, conflictIds,
} from './tasks.js';
import { prayerTimes } from './integrations.js';
import { esc, minToHHMM, pxPerMin } from './ui.js';

let selectedTaskId = null;

const el = (id) => document.getElementById(id);

export function openPlanner() {
  selectedTaskId = null;
  el('plannerOverlay').hidden = false;
  renderPlanner();
}

export function closePlanner() {
  el('plannerOverlay').hidden = true;
}

export function renderPlanner() {
  if (el('plannerOverlay').hidden) return;
  const { dayStart, dayEnd } = getState().settings;
  const startMin = dayStart * 60;
  const totalMin = (dayEnd - dayStart) * 60;
  const ppm = pxPerMin();

  /* ── Linke Spalte: ungeplante Tasks ── */
  const pool = todayTasks().filter((t) => !t.plan && !t.done);
  el('plannerPool').innerHTML = pool.length
    ? pool.map((t) => `
        <div class="pool-task ${t.id === selectedTaskId ? 'selected' : ''}"
             draggable="true" data-pool-id="${t.id}" tabindex="0" role="button"
             aria-label="Task ${esc(t.title)} auswählen">
          ${esc(t.title)}
          <span class="mono">${t.difficulty.toUpperCase()} · KLICKEN, DANN ZEIT WÄHLEN</span>
        </div>`).join('')
    : `<div class="empty"><span class="big">ALLES EINGEPLANT</span>Keine offenen Tasks für heute.</div>`;

  /* ── Rechte Spalte: Zeitraster + Blöcke ── */
  const grid = el('plannerTimeline');
  let html = '';

  // Stundenlinien + Beschriftung
  for (let h = dayStart; h <= dayEnd; h++) {
    const y = (h * 60 - startMin) * ppm;
    html += `<div class="tl-hour" style="top:${y}px">${String(h).padStart(2, '0')}:00</div>`;
    html += `<div class="tl-hourline" style="top:${y}px"></div>`;
  }

  // Klickbare 30-Min-Slots
  for (let m = startMin; m < startMin + totalMin; m += 30) {
    html += `<div class="slot" data-slot="${minToHHMM(m)}"
                  style="top:${(m - startMin) * ppm}px; height:${30 * ppm}px"
                  title="${minToHHMM(m)}"></div>`;
  }

  // Gebets-Blöcke (fix, nicht verschiebbar)
  prayerTimes.blocksFor(todayISO()).forEach((b) => {
    const top = (toMinutes(b.start) - startMin) * ppm;
    if (top < 0) return;
    html += `
      <div class="tl-block prayer" style="top:${top}px; height:${b.durationMin * ppm}px">
        <span class="tl-time">${b.start} · FEST</span> ${esc(b.title)}
      </div>`;
  });

  // Geplante Task-Blöcke
  const conflicts = conflictIds(todayISO());
  todayTasks().filter((t) => t.plan).forEach((t) => {
    const top = (toMinutes(t.plan.start) - startMin) * ppm;
    html += `
      <div class="tl-block ${conflicts.has(t.id) ? 'conflict' : ''} ${t.done ? 'done' : ''}"
           style="top:${top}px; height:${t.plan.durationMin * ppm}px">
        <span class="tl-time">${t.plan.start} · ${t.plan.durationMin} MIN
          ${conflicts.has(t.id) ? '· ⚠ KONFLIKT' : ''}</span>
        ${esc(t.title)}
        <div class="card-actions">
          <button class="hud-btn small" data-plan-act="minus" data-id="${t.id}">−30</button>
          <button class="hud-btn small" data-plan-act="plus"  data-id="${t.id}">+30</button>
          <button class="hud-btn small danger" data-plan-act="remove" data-id="${t.id}">ENTFERNEN</button>
        </div>
      </div>`;
  });

  grid.style.height = `${totalMin * ppm}px`;
  grid.innerHTML = html;
}

/* ── Event-Wiring (einmalig aus app.js aufgerufen) ── */
export function initPlannerEvents() {
  el('plannerOverlay').addEventListener('click', (e) => {
    if (e.target === el('plannerOverlay')) closePlanner();

    // Task im Pool auswählen
    const poolTask = e.target.closest('[data-pool-id]');
    if (poolTask) {
      selectedTaskId = poolTask.dataset.poolId === selectedTaskId ? null : poolTask.dataset.poolId;
      renderPlanner();
      return;
    }

    // Slot geklickt → ausgewählten Task platzieren ODER Quick-Add öffnen
    const slot = e.target.closest('.slot');
    if (slot) {
      if (selectedTaskId) {
        planTask(selectedTaskId, slot.dataset.slot, 60);
        selectedTaskId = null;
      } else {
        // Kein Task ausgewählt → neuen Eintrag direkt zu dieser Zeit anlegen
        document.dispatchEvent(new CustomEvent('holo:quickadd', { detail: { time: slot.dataset.slot } }));
      }
      return;
    }

    // Block-Aktionen
    const btn = e.target.closest('[data-plan-act]');
    if (btn) {
      const { planAct, id } = btn.dataset;
      if (planAct === 'remove') unplanTask(id);
      if (planAct === 'plus')  changePlanDuration(id, 30);
      if (planAct === 'minus') changePlanDuration(id, -30);
    }
  });

  /* Drag & Drop: Pool-Task auf Slot ziehen */
  el('plannerOverlay').addEventListener('dragstart', (e) => {
    const t = e.target.closest('[data-pool-id]');
    if (t) e.dataTransfer.setData('text/task-id', t.dataset.poolId);
  });
  el('plannerOverlay').addEventListener('dragover', (e) => {
    const slot = e.target.closest('.slot');
    if (slot) { e.preventDefault(); slot.classList.add('dragover'); }
  });
  el('plannerOverlay').addEventListener('dragleave', (e) => {
    const slot = e.target.closest('.slot');
    if (slot) slot.classList.remove('dragover');
  });
  el('plannerOverlay').addEventListener('drop', (e) => {
    const slot = e.target.closest('.slot');
    if (!slot) return;
    e.preventDefault();
    const id = e.dataTransfer.getData('text/task-id');
    if (id) planTask(id, slot.dataset.slot, 60);
  });

  el('plannerClose').addEventListener('click', closePlanner);
}
