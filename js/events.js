/* ═══════════════════════════════════════════════════════
   events.js · Manuelle Termine (eigenständige Zeitblöcke,
   unabhängig von der Task-Liste – "Vorlesung", "Gym" …)
   ═══════════════════════════════════════════════════════ */

import { getState, update } from './state.js';

export const EVENT_COLORS = {
  cyan:  '#5FE3FF',
  amber: '#FFB547',
  rot:   '#FF6B6B',
  gruen: '#7BE8A8',
  lila:  '#C792EA',
};

export function addEvent({ title, date, start, durationMin = 60, color = 'cyan' }) {
  const clean = String(title || '').trim().slice(0, 120);
  if (!clean || !date || !start) return null;
  const ev = {
    id: crypto.randomUUID(),
    title: clean, date, start,
    durationMin: Math.max(15, durationMin),
    color: EVENT_COLORS[color] ? color : 'cyan',
    createdAt: Date.now(),
  };
  update((s) => s.events.push(ev));
  return ev;
}

export function editEvent(id, fields) {
  update((s) => {
    const ev = s.events.find((e) => e.id === id);
    if (!ev) return;
    if (fields.title !== undefined) {
      const clean = String(fields.title).trim().slice(0, 120);
      if (clean) ev.title = clean;
    }
    if (fields.start !== undefined && fields.start) ev.start = fields.start;
    if (fields.durationMin !== undefined) ev.durationMin = Math.max(15, fields.durationMin);
    if (fields.color !== undefined && EVENT_COLORS[fields.color]) ev.color = fields.color;
  });
}

export function deleteEvent(id) {
  update((s) => { s.events = s.events.filter((e) => e.id !== id); });
}

export const findEvent = (id) => getState().events.find((e) => e.id === id) || null;

export const eventsForDate = (iso) => getState().events.filter((e) => e.date === iso);
