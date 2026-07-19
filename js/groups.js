/* ═══════════════════════════════════════════════════════
   groups.js · Gruppen/Bereiche (wie ClickUp-Listen)
   z. B. "SWP", "Mathe 2", "PeerLearn", "Privat", "Deen"
   ═══════════════════════════════════════════════════════ */

import { getState, update } from './state.js';

export const GROUP_COLORS = ['#5FE3FF', '#FFB547', '#FF6B6B', '#7BE8A8', '#C792EA', '#F78C6C'];

export const allGroups = () => getState().groups;

export const findGroup = (id) => getState().groups.find((g) => g.id === id) || null;

export const groupByName = (name) =>
  getState().groups.find((g) => g.name.toLowerCase() === String(name).toLowerCase()) || null;

export function addGroup(name, color) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) return null;
  const existing = groupByName(clean);
  if (existing) return existing;
  const g = {
    id: crypto.randomUUID(),
    name: clean,
    color: color || GROUP_COLORS[getState().groups.length % GROUP_COLORS.length],
  };
  update((s) => s.groups.push(g));
  return g;
}

export function renameGroup(id, name) {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) return;
  update((s) => {
    const g = s.groups.find((x) => x.id === id);
    if (g) g.name = clean;
  });
}

export function setGroupColor(id, color) {
  update((s) => {
    const g = s.groups.find((x) => x.id === id);
    if (g) g.color = color;
  });
}

/** Löschen: zugehörige Tasks wandern zu "Keine Gruppe" */
export function deleteGroup(id) {
  update((s) => {
    s.tasks.forEach((t) => { if (t.groupId === id) t.groupId = null; });
    s.groups = s.groups.filter((g) => g.id !== id);
  });
}

/**
 * #kürzel im Titel auflösen: "Übungsblatt 5 #swp"
 * → Gruppe zuweisen (bei Bedarf neu anlegen), Kürzel aus Titel entfernen.
 * Rückgabe: { title, groupId }
 */
export function parseGroupShortcut(rawTitle) {
  const m = String(rawTitle).match(/#([\wäöüÄÖÜß-]+)/);
  if (!m) return { title: rawTitle, groupId: null };
  const g = groupByName(m[1]) || addGroup(m[1]);
  return { title: rawTitle.replace(m[0], '').replace(/\s+/g, ' ').trim(), groupId: g ? g.id : null };
}
