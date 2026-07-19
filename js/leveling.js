/* ═══════════════════════════════════════════════════════
   leveling.js · XP, Level, Ränge (E→S), Daily Quests, Streak
   Stil angelehnt an "Hunter"-Progression – eigenes Design.
   ═══════════════════════════════════════════════════════ */

import { getState, update, todayISO } from './state.js';

export const XP_BY_DIFFICULTY = { easy: 10, medium: 25, hard: 50 };
export const DIFFICULTY_LABEL = { easy: 'LEICHT', medium: 'MITTEL', hard: 'SCHWER' };

/** Benötigte XP, um von `level` auf `level+1` zu kommen */
export function xpNeeded(level) {
  return Math.round(100 * Math.pow(level, 1.5));
}

/** Rang aus Level ableiten */
export function rankForLevel(level) {
  if (level >= 30) return 'S';
  if (level >= 20) return 'A';
  if (level >= 15) return 'B';
  if (level >= 10) return 'C';
  if (level >= 5)  return 'D';
  return 'E';
}

/**
 * XP gutschreiben (oder bei negativem Wert abziehen, z. B. Task-Undo).
 * Gibt die Anzahl der Level-Ups zurück, damit die UI animieren kann.
 */
export function addXp(amount) {
  let levelUps = 0;
  update((s) => {
    const p = s.player;
    p.totalXp = Math.max(0, p.totalXp + amount);
    p.xp += amount;

    // Level-Ups (auch mehrere hintereinander möglich)
    while (p.xp >= xpNeeded(p.level)) {
      p.xp -= xpNeeded(p.level);
      p.level += 1;
      levelUps += 1;
    }
    // Bei Abzug: kein Level-Down (bewusste Design-Entscheidung –
    // erreichte Level bleiben, nur der Fortschrittsbalken sinkt)
    if (p.xp < 0) p.xp = 0;
  });
  return levelUps;
}

/** Streak fortschreiben, wenn heute mindestens ein Task erledigt wurde */
export function touchStreak() {
  update((s) => {
    const today = todayISO();
    const yesterday = todayISO(-1);
    const st = s.streak;
    if (st.lastDate === today) return;               // heute schon gezählt
    st.count = st.lastDate === yesterday ? st.count + 1 : 1;
    st.lastDate = today;
  });
}

/** Streak beim App-Start prüfen: Lücke > 1 Tag → Kette gerissen */
export function validateStreak() {
  const s = getState();
  const { lastDate } = s.streak;
  if (!lastDate) return;
  if (lastDate !== todayISO() && lastDate !== todayISO(-1)) {
    update((st) => { st.streak.count = 0; st.streak.lastDate = null; });
  }
}

/* ── Daily Quests ─────────────────────────────────────── */

const QUEST_POOL = [
  { id: 'q3',    label: '3 Aufgaben abschließen',        target: 3, type: 'anyDone',  bonusXp: 30 },
  { id: 'qhard', label: '1 schwere Aufgabe erledigen',   target: 1, type: 'hardDone', bonusXp: 50 },
  { id: 'qplan', label: 'Deinen Tag planen (1 Block)',   target: 1, type: 'planned',  bonusXp: 20 },
];

/** Quests für heute erzeugen, falls noch nicht geschehen */
export function ensureDailyQuests() {
  const s = getState();
  const today = todayISO();
  if (s.quests.date === today) return;
  update((st) => {
    st.quests = {
      date: today,
      items: QUEST_POOL.map((q) => ({ ...q, progress: 0, done: false, awarded: false })),
    };
  });
}

/**
 * Quest-Fortschritt aus dem Task-Zustand neu berechnen.
 * Gibt gesammelte Bonus-XP zurück (0, wenn nichts neu abgeschlossen).
 */
export function refreshQuestProgress() {
  ensureDailyQuests();
  const s = getState();
  const today = todayISO();

  const doneToday   = s.tasks.filter((t) => t.done && t.dueDate === today).length;
  const hardToday   = s.tasks.filter((t) => t.done && t.dueDate === today && t.difficulty === 'hard').length;
  const plannedToday = s.tasks.filter((t) => t.plan && t.dueDate === today).length;

  let bonus = 0;
  update((st) => {
    st.quests.items.forEach((q) => {
      q.progress =
        q.type === 'anyDone'  ? doneToday :
        q.type === 'hardDone' ? hardToday :
        plannedToday;
      q.done = q.progress >= q.target;
      if (q.done && !q.awarded) {       // Bonus nur einmal pro Tag
        q.awarded = true;
        bonus += q.bonusXp;
      }
    });
  });
  return bonus;
}
