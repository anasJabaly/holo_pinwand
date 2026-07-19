/* ═══════════════════════════════════════════════════════
   state.js · Zentraler App-State + Persistenz + Migration
   Jede Änderung läuft über update() → speichert automatisch
   und benachrichtigt Subscriber (UI-Rerender).
   ═══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'holoPinnwand.v2';
const LEGACY_KEY  = 'holo-pinnwand-tasks'; // v1 (Single-File-MVP)

export const SCHEMA_VERSION = 2;

/** Heutiges Datum als 'YYYY-MM-DD' (lokale Zeit, nicht UTC!) */
export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('sv-SE'); // sv-SE liefert exakt YYYY-MM-DD
}

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    player: { level: 1, xp: 0, totalXp: 0 },
    streak: { count: 0, lastDate: null },
    quests: { date: null, items: [] },
    settings: {
      dayStart: 6,          // Tagesplaner-Beginn (Stunde)
      dayEnd: 24,           // Tagesplaner-Ende (Stunde)
      coords: null,         // { lat, lon } für Gebetszeiten
      prayerEnabled: false,
      showPrayerInTimeline: false, // Gebete nur anzeigen, nicht automatisch in den Plan
      notifyEnabled: false,
    },
    prayerCache: {},        // 'YYYY-MM-DD' → [{ name, time }]
  };
}

/** v1-Daten (Array von Tasks) ins v2-Schema überführen */
function migrateFromV1(v1Tasks) {
  const s = defaultState();
  const today = todayISO();
  s.tasks = v1Tasks.map((t) => ({
    id: t.id || crypto.randomUUID(),
    title: String(t.title || '').slice(0, 160),
    difficulty: t.prio === 'prio' ? 'hard' : 'medium',
    dueDate: t.where === 'today' ? today : null, // Pinnwand = null
    plan: null,
    done: !!t.done,
    doneAt: t.done ? Date.now() : null,
    createdAt: t.created || Date.now(),
  }));
  return s;
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.schemaVersion === SCHEMA_VERSION) {
        // Neue Settings-Felder in alte Speicherstände mergen
        parsed.settings = { ...defaultState().settings, ...parsed.settings };
        return parsed;
      }
      // Platz für künftige Migrationen v2 → v3 …
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateFromV1(JSON.parse(legacy));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (e) {
    console.warn('State konnte nicht geladen werden, starte frisch:', e);
  }
  return defaultState();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Speichern fehlgeschlagen:', e);
  }
}

/** Lesender Zugriff auf den aktuellen State */
export function getState() {
  return state;
}

/**
 * Einzige Schreib-Schnittstelle:
 * update(s => { s.tasks.push(...) })
 * → mutiert, speichert, informiert alle Subscriber.
 */
export function update(mutator) {
  mutator(state);
  persist();
  listeners.forEach((fn) => fn(state));
}

/** UI abonniert Änderungen: subscribe(render) */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
