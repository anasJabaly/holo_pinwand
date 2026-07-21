/* ═══════════════════════════════════════════════════════
   tasks.js · Task-CRUD + Kopplung an Leveling
   dueDate = null  → Pinnwand (Backlog)
   dueDate = Datum → geplant für diesen Tag
   plan            → Zeitblock { start:'HH:MM', durationMin }
   ═══════════════════════════════════════════════════════ */

import { getState, update, todayISO } from './state.js';
import { addXp, touchStreak, refreshQuestProgress, XP_BY_DIFFICULTY } from './leveling.js';

/** Neuen Task anlegen */
export function addTask({ title, difficulty = 'medium', dueDate = null, groupId = null, priority = 'normal' }) {
  const clean = String(title || '').trim().slice(0, 160);
  if (!clean) return null;
  const task = {
    id: crypto.randomUUID(),
    title: clean,
    difficulty,
    priority,         // urgent | high | normal | low
    status: 'open',   // open | progress | done
    groupId,
    subtasks: [],
    notes: '',
    dueDate,          // null = Pinnwand
    dueTime: null,
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

/** ISO-Datum um n Tage verschieben */
function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
}

/** Task bearbeiten (Titel, Schwierigkeit, Datum, Notizen, Wiederholung) */
export function editTask(id, fields) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    if (fields.title !== undefined) {
      const clean = String(fields.title).trim().slice(0, 160);
      if (clean) t.title = clean;
    }
    if (fields.difficulty !== undefined) t.difficulty = fields.difficulty;
    if (fields.priority !== undefined) t.priority = fields.priority;
    if (fields.groupId !== undefined) t.groupId = fields.groupId || null;
    if (fields.dueTime !== undefined) t.dueTime = fields.dueTime || null;
    if (fields.notes !== undefined) t.notes = String(fields.notes).slice(0, 500);
    if (fields.recur !== undefined) t.recur = fields.recur || null;
    if (fields.dueDate !== undefined) {
      t.dueDate = fields.dueDate || null;
      if (!t.dueDate) t.plan = null;
    }
  });
  refreshQuestProgress();
}

/**
 * Wiederkehrende Tasks (recur: 'daily' | 'weekly') beim App-Start
 * nach vorn rollen: Fälligkeit in der Vergangenheit → auf heute/nächsten
 * Termin schieben und wieder öffnen. Zeitblock (plan) bleibt erhalten.
 */
export function rolloverRecurring() {
  const today = todayISO();
  update((s) => {
    s.tasks.forEach((t) => {
      if (!t.recur || !t.dueDate || t.dueDate >= today) return;
      if (t.recur === 'daily') {
        t.dueDate = today;
      } else {
        while (t.dueDate < today) t.dueDate = addDaysISO(t.dueDate, 7);
      }
      t.status = 'open';
      t.done = false;
      t.doneAt = null;
    });
  });
}

export function deleteTask(id) {
  update((s) => { s.tasks = s.tasks.filter((t) => t.id !== id); });
  refreshQuestProgress();
}

/**
 * Status setzen (open | progress | done) mit XP-Kopplung.
 * Rückgabe: { levelUps, xpDelta } für UI-Feedback.
 */
export function setStatus(id, status) {
  const t = findTask(id);
  if (!t) return { levelUps: 0, xpDelta: 0 };
  const wasDone = t.status === 'done';
  const nowDone = status === 'done';

  update((s) => {
    const task = s.tasks.find((x) => x.id === id);
    task.status = status;
    task.done = nowDone;            // Kompatibilität zu Quests/Streaks
    task.doneAt = nowDone ? Date.now() : null;
  });

  if (wasDone === nowDone) { refreshQuestProgress(); return { levelUps: 0, xpDelta: 0 }; }

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

/** Karten-Haken: offen/in Arbeit ⇄ erledigt */
export function toggleDone(id) {
  const t = findTask(id);
  return setStatus(id, t && t.status === 'done' ? 'open' : 'done');
}

/* ── Subtasks (Checkliste wie in ClickUp) ── */

export function addSubtask(taskId, title) {
  const clean = String(title || '').trim().slice(0, 120);
  if (!clean) return;
  update((s) => {
    const t = s.tasks.find((x) => x.id === taskId);
    if (t) t.subtasks.push({ id: crypto.randomUUID(), title: clean, done: false });
  });
}

export function toggleSubtask(taskId, subId) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === taskId);
    const st = t && t.subtasks.find((x) => x.id === subId);
    if (st) st.done = !st.done;
  });
}

export function deleteSubtask(taskId, subId) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === taskId);
    if (t) t.subtasks = t.subtasks.filter((x) => x.id !== subId);
  });
}

/** Überfällig: Deadline vergangen und nicht erledigt */
export function overdueTasks() {
  const today = todayISO();
  return getState().tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'done');
}

/** Task auf ein Datum legen (oder mit null zurück auf die Pinnwand) */
export function setDueDate(id, dueDate) {
  update((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    t.dueDate = dueDate;
    if (!dueDate) {                              // Pinnwand-Tasks sind offen & ungeplant
      t.plan = null;
      t.status = 'open';
      t.done = false;
      t.doneAt = null;
    }
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
