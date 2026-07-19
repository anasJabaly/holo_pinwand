/* ═══════════════════════════════════════════════════════
   calendar.js · Reine Datums-Logik für Woche & Monat
   (kein DOM – das Rendering übernimmt ui.js)
   ═══════════════════════════════════════════════════════ */

export const DOW = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'];

export function toISO(date) {
  return date.toLocaleDateString('sv-SE');
}

/** Montag der Woche, in der `date` liegt */
export function mondayOf(date) {
  const d = new Date(date);
  const shift = (d.getDay() + 6) % 7; // So=0 → 6, Mo=1 → 0 …
  d.setDate(d.getDate() - shift);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 7 ISO-Daten der Woche mit Offset (0 = aktuelle Woche) */
export function weekDates(weekOffset = 0) {
  const start = mondayOf(new Date());
  start.setDate(start.getDate() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISO(d);
  });
}

/**
 * Monatsraster: 42 Zellen (6 Wochen), beginnend am Montag
 * vor dem 1. des Monats. `monthOffset` relativ zum aktuellen Monat.
 */
export function monthGrid(monthOffset = 0) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);

  const label = base.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }).toUpperCase();
  const month = base.getMonth();

  const cursor = mondayOf(base);
  const cells = Array.from({ length: 42 }, () => {
    const cell = { iso: toISO(cursor), day: cursor.getDate(), inMonth: cursor.getMonth() === month };
    cursor.setDate(cursor.getDate() + 1);
    return cell;
  });
  return { label, cells };
}

/** Kurzformat für Kopfzeilen: "MO 21.07." */
export function shortLabel(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `${DOW[(d.getDay() + 6) % 7]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}
