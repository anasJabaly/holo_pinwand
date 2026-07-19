/* ═══════════════════════════════════════════════════════
   tasks.js · Task-CRUD + Kopplung an Leveling
   dueDate = null  → Pinnwand (Backlog)
   dueDate = Datum → geplant für diesen Tag
   plan            → Zeitblock { start:'HH:MM', durationMin }
   ═══════════════════════════════════════════════════════ */

import { getState, update, todayISO } from './state.js';
import { addXp, touchStreak, refreshQuestProgress, XP_BY_DIFFICULTY } from './leveling.js';

/** Neuen Task anlegen */
export function addTask({ title, difficulty = 'medium', dueDate = null }) {
  const clean = String(title || '').trim().slice(0, 160);
  if (!clean) return null;
  const task = {
    id: crypto.randomUUID(),
    title: clean,
    difficulty,
    dueDate,          // null = Pinnwand
    plan: null,
    done: false,
    doneAt: null,
    createdAt: Date.now(),
  };
  update((s) => s.tasks.unshift(task));
  return task;
}

export function findTask(id) {
  return getState().tasks.find((t) => t.id === id) || null;
}

export function deleteTask(id) {
  update((s) => { s.tasks = s.tasks.filter((t) => t.id !== id); });
  refreshQuestProgress();
}

/**
 * Erledigt-Status umschalten.
 * Rückgabe: { levelUps, xpDelta } für UI-Feedback.
 */
export function toggleDone(id) {
  const t = findTask(id);
  if (!t) return { levelUps: 0, xpDelta: 0 };

  const nowDone = !t.done;
  update((s) => {
    const task = s.tasks.find((x) => x.id === id);
    task.done = nowDone;
    task.doneAt = nowDone ? Date.now() : null;
  });

  const base = XP_BY_DIFFICULTY[t.difficulty] || 25;
  let xpDelta = nowDone ? base : -base;
  let levelUps = addXp(xpDelta);

  if (nowDone) touchStreak();

  // Quests neu bewerten; evtl. Bonus-XP on top
  const bonus = refreshQuestProgress();
  if (bonus > 0) {
    xpDelta += bonus;
    levelUps += addXp(bonus);
  }
  return { levelUps, xpDelta };
}

/** Task auf ein Datum legen (oder mit null zurück auf die Pinnwand) */
export function setDueDate(id, dueDate) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    t.dueDate = dueDate;
    if (!dueDate) { t.plan = null; t.done = false; } // Pinnwand-Tasks sind offen & ungeplant
  });
  refreshQuestProgress();
}

/** Zeitblock setzen/ändern (start 'HH:MM', Dauer in Minuten, 30er-Raster) */
export function planTask(id, start, durationMin = 60) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    t.plan = { start, durationMin: Math.max(30, Math.round(durationMin / 30) * 30) };
    if (!t.dueDate) t.dueDate = todayISO();
  });
  refreshQuestProgress();
}

export function unplanTask(id) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (t) t.plan = null;
  });
  refreshQuestProgress();
}

export function changePlanDuration(id, deltaMin) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t || !t.plan) return;
    t.plan.durationMin = Math.max(30, t.plan.durationMin + deltaMin);
  });
}

/* ── Abfragen für Views ─────────────────────────────── */

export const tasksForDate = (iso) => getState().tasks.filter((t) => t.dueDate === iso);
export const boardTasks   = ()    => getState().tasks.filter((t) => t.dueDate === null);
export const todayTasks   = ()    => tasksForDate(todayISO());

/** 'HH:MM' → Minuten seit Mitternacht */
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Überlappende Zeitblöcke eines Tages finden → Set von Task-IDs */
export function conflictIds(iso) {
  const planned = tasksForDate(iso).filter((t) => t.plan);
  const bad = new Set();
  for (let i = 0; i < planned.length; i++) {
    for (let j = i + 1; j < planned.length; j++) {
      const a = planned[i], b = planned[j];
      const a0 = toMinutes(a.plan.start), a1 = a0 + a.plan.durationMin;
      const b0 = toMinutes(b.plan.start), b1 = b0 + b.plan.durationMin;
      if (a0 < b1 && b0 < a1) { bad.add(a.id); bad.add(b.id); }
    }
  }
  return bad;
}
