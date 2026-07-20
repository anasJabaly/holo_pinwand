/* ═══════════════════════════════════════════════════════
   state.js · Zentraler App-State + Persistenz + Migration
   Jede Änderung läuft über update() → validiert, speichert
   und benachrichtigt Subscriber (UI-Rerender).
   ═══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'holoPinnwand.v2';
const BACKUP_KEY = 'holoPinnwand.backup';
const LEGACY_KEY = 'holo-pinnwand-tasks';

export const SCHEMA_VERSION = 4;
const VALID_STATUS = new Set(['open', 'progress', 'done']);
const VALID_DIFFICULTY = new Set(['easy', 'medium', 'hard']);
const VALID_PRIORITY = new Set(['urgent', 'high', 'normal', 'low']);
const VALID_RECUR = new Set(['daily', 'weekly']);
const VALID_EVENT_COLORS = new Set(['cyan', 'amber', 'rot', 'gruen', 'lila']);
const VALID_QUEST_TYPES = new Set(['anyDone', 'hardDone', 'planned']);
const VALID_PRAYER_NAMES = new Set(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const SAFE_HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Heutiges Datum als 'YYYY-MM-DD' (lokale Zeit, nicht UTC). */
export function todayISO(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString('sv-SE');
}

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    player: { level: 1, xp: 0, totalXp: 0 },
    streak: { count: 0, lastDate: null },
    quests: { date: null, items: [] },
    settings: {
      dayStart: 6,
      dayEnd: 24,
      coords: null,
      prayerEnabled: false,
      showPrayerInTimeline: false,
      notifyEnabled: false,
    },
    prayerCache: {},
    prayerAdopted: {},
    groups: [],
    events: [],
    profile: { name: '', lastBootDate: null },
  };
}

function idOrNew(value) {
  return typeof value === 'string' && SAFE_ID.test(value) ? value : crypto.randomUUID();
}

function safeOptionalId(value) {
  return typeof value === 'string' && SAFE_ID.test(value) ? value : null;
}

function cleanString(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function validIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function validTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCoords(coords) {
  if (!coords || typeof coords !== 'object') return null;
  const lat = Number(coords.lat);
  const lon = Number(coords.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  // Rundung reduziert die gespeicherte Genauigkeit auf ungefähr Stadtteil-Niveau.
  return { lat: Number(lat.toFixed(3)), lon: Number(lon.toFixed(3)) };
}

function normalizeTask(input = {}) {
  const status = VALID_STATUS.has(input.status)
    ? input.status
    : input.done
      ? 'done'
      : 'open';
  const isDone = status === 'done';
  const dueDate = validIsoDate(input.dueDate);
  const planStart = validTime(input.plan?.start);
  const duration = Math.max(30, Math.round(finiteNumber(input.plan?.durationMin, 60) / 30) * 30);

  return {
    id: idOrNew(input.id),
    title: cleanString(input.title) || 'Unbenannte Aufgabe',
    difficulty: VALID_DIFFICULTY.has(input.difficulty) ? input.difficulty : 'medium',
    priority: VALID_PRIORITY.has(input.priority) ? input.priority : 'normal',
    status,
    groupId: safeOptionalId(input.groupId),
    subtasks: Array.isArray(input.subtasks)
      ? input.subtasks.map((subtask) => ({
          id: idOrNew(subtask?.id),
          title: cleanString(subtask?.title, 120) || 'Unterpunkt',
          done: Boolean(subtask?.done),
        }))
      : [],
    notes: String(input.notes ?? '').slice(0, 2000),
    dueDate,
    dueTime: validTime(input.dueTime),
    plan: planStart ? { start: planStart, durationMin: duration } : null,
    done: isDone,
    doneAt: isDone ? finiteNumber(input.doneAt, Date.now()) : null,
    createdAt: finiteNumber(input.createdAt, Date.now()),
    recur: VALID_RECUR.has(input.recur) ? input.recur : null,
  };
}

function normalizeGroup(input = {}) {
  return {
    id: idOrNew(input.id),
    name: cleanString(input.name, 40) || 'Gruppe',
    color: typeof input.color === 'string' && SAFE_HEX_COLOR.test(input.color)
      ? input.color.toUpperCase()
      : '#5FE3FF',
  };
}

function normalizeEvent(input = {}) {
  return {
    id: idOrNew(input.id),
    title: cleanString(input.title, 120) || 'Termin',
    date: validIsoDate(input.date) || todayISO(),
    start: validTime(input.start) || '12:00',
    durationMin: Math.max(30, Math.round(finiteNumber(input.durationMin, 60) / 30) * 30),
    color: VALID_EVENT_COLORS.has(input.color) ? input.color : 'cyan',
  };
}

function normalizeQuest(input = {}) {
  const target = Math.max(1, Math.floor(finiteNumber(input.target, 1)));
  const progress = Math.max(0, Math.floor(finiteNumber(input.progress, 0)));
  return {
    id: idOrNew(input.id),
    label: cleanString(input.label, 120) || 'Tagesquest',
    target,
    type: VALID_QUEST_TYPES.has(input.type) ? input.type : 'anyDone',
    bonusXp: Math.max(0, Math.floor(finiteNumber(input.bonusXp, 0))),
    progress,
    done: Boolean(input.done || progress >= target),
    awarded: Boolean(input.awarded),
  };
}

function normalizePrayerCache(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result = {};
  for (const [date, entries] of Object.entries(input)) {
    const safeDate = validIsoDate(date);
    if (!safeDate || !Array.isArray(entries)) continue;
    const prayers = entries
      .map((entry) => ({
        name: VALID_PRAYER_NAMES.has(entry?.name) ? entry.name : null,
        time: validTime(entry?.time),
      }))
      .filter((entry) => entry.name && entry.time);
    if (prayers.length) result[safeDate] = prayers;
  }
  return result;
}

function normalizePrayerAdopted(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result = {};
  for (const [date, names] of Object.entries(input)) {
    const safeDate = validIsoDate(date);
    if (!safeDate || !Array.isArray(names)) continue;
    result[safeDate] = [...new Set(names.filter((name) => VALID_PRAYER_NAMES.has(name)))];
  }
  return result;
}

/** Unbekannte oder beschädigte Daten in ein sicheres, aktuelles Schema überführen. */
export function normalizeState(input) {
  const defaults = createDefaultState();
  const source = input && typeof input === 'object' ? input : {};
  const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const coords = normalizeCoords(settings.coords);
  const dayStart = Math.min(23, Math.max(0, Math.floor(finiteNumber(settings.dayStart, 6))));
  const rawDayEnd = Math.min(24, Math.max(1, Math.floor(finiteNumber(settings.dayEnd, 24))));
  const dayEnd = Math.max(dayStart + 1, rawDayEnd);

  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: Array.isArray(source.tasks) ? source.tasks.map(normalizeTask) : [],
    player: {
      level: Math.max(1, Math.floor(finiteNumber(source.player?.level, 1))),
      xp: Math.max(0, finiteNumber(source.player?.xp, 0)),
      totalXp: Math.max(0, finiteNumber(source.player?.totalXp, 0)),
    },
    streak: {
      count: Math.max(0, Math.floor(finiteNumber(source.streak?.count, 0))),
      lastDate: validIsoDate(source.streak?.lastDate),
    },
    quests: {
      date: validIsoDate(source.quests?.date),
      items: Array.isArray(source.quests?.items) ? source.quests.items.map(normalizeQuest) : [],
    },
    settings: {
      ...defaults.settings,
      dayStart,
      dayEnd,
      coords,
      prayerEnabled: Boolean(settings.prayerEnabled && coords),
      showPrayerInTimeline: Boolean(settings.showPrayerInTimeline),
      notifyEnabled: Boolean(settings.notifyEnabled),
    },
    prayerCache: normalizePrayerCache(source.prayerCache),
    prayerAdopted: normalizePrayerAdopted(source.prayerAdopted),
    groups: Array.isArray(source.groups) ? source.groups.map(normalizeGroup) : [],
    events: Array.isArray(source.events) ? source.events.map(normalizeEvent) : [],
    profile: {
      name: cleanString(source.profile?.name, 80),
      lastBootDate: validIsoDate(source.profile?.lastBootDate),
    },
  };
}

/** v1-Daten (Array von Tasks) ins aktuelle Schema überführen. */
function migrateFromV1(v1Tasks) {
  const next = createDefaultState();
  const today = todayISO();
  next.tasks = v1Tasks.map((task) => ({
    ...task,
    id: task.id || crypto.randomUUID(),
    title: String(task.title || '').slice(0, 160),
    difficulty: task.prio === 'prio' ? 'hard' : 'medium',
    priority: 'normal',
    status: task.done ? 'done' : 'open',
    groupId: null,
    subtasks: [],
    dueDate: task.where === 'today' ? today : null,
    dueTime: null,
    plan: null,
    doneAt: task.done ? Date.now() : null,
    createdAt: task.created || Date.now(),
  }));
  return normalizeState(next);
}

function parseStored(raw) {
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const candidate = parsed?.state && typeof parsed.state === 'object' ? parsed.state : parsed;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('Gespeicherter Datenstand ist kein gültiges Objekt.');
  }
  return normalizeState(candidate);
}

function load() {
  try {
    const primary = parseStored(localStorage.getItem(STORAGE_KEY));
    if (primary) return primary;
  } catch (error) {
    console.warn('Primärer Speicher ist beschädigt, versuche Rückfallkopie:', error);
  }

  try {
    const backup = parseStored(localStorage.getItem(BACKUP_KEY));
    if (backup) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
      return backup;
    }
  } catch (error) {
    console.warn('Rückfallkopie konnte nicht geladen werden:', error);
  }

  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        const migrated = migrateFromV1(parsed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch (error) {
    console.warn('Altdaten konnten nicht migriert werden:', error);
  }

  return createDefaultState();
}

let state = load();
const listeners = new Set();

function writeState(nextState, { createBackup = true } = {}) {
  const normalized = normalizeState(nextState);
  const serialized = JSON.stringify(normalized);

  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (createBackup && current && current !== serialized) {
      localStorage.setItem(BACKUP_KEY, current);
    }
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.warn('Speichern fehlgeschlagen:', error);
  }

  state = normalized;
}

function emit() {
  listeners.forEach((listener) => listener(state));
}

/** Lesender Zugriff auf den aktuellen State. */
export function getState() {
  return state;
}

/** Einzige reguläre Schreib-Schnittstelle. */
export function update(mutator) {
  mutator(state);
  writeState(state);
  emit();
}

/** UI abonniert Änderungen. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Vollständiges, portables JSON-Backup erzeugen. */
export function exportStateJson() {
  return JSON.stringify(
    {
      app: 'Holo-Pinnwand',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    2,
  );
}

/** JSON-Backup validieren, normalisieren und aktivieren. */
export function importStateJson(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const candidate = parsed?.state && typeof parsed.state === 'object' ? parsed.state : parsed;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('Die Datei enthält keinen gültigen Holo-Pinnwand-Datenstand.');
  }
  writeState(candidate);
  emit();
  return state;
}

/** Letzte automatisch angelegte Rückfallkopie wiederherstellen. */
export function restoreAutomaticBackup() {
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) return false;
  const backup = parseStored(raw);
  if (!backup) return false;
  writeState(backup);
  emit();
  return true;
}

export function hasAutomaticBackup() {
  return Boolean(localStorage.getItem(BACKUP_KEY));
}

/** Alle App-Daten auf Werkseinstellungen zurücksetzen. */
export function resetState() {
  state = createDefaultState();
  try {
    localStorage.removeItem(BACKUP_KEY);
    localStorage.removeItem(LEGACY_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Zurücksetzen des Speichers fehlgeschlagen:', error);
  }
  emit();
}

/** Standort, Cache und übernommene Gebetsblöcke vollständig entfernen. */
export function clearLocationData() {
  update((next) => {
    next.settings.coords = null;
    next.settings.prayerEnabled = false;
    next.prayerCache = {};
    next.prayerAdopted = {};
  });
  // Auch die automatische Rückfallkopie darf keine alten Koordinaten behalten.
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch (error) {
    console.warn('Standortdaten konnten nicht aus der Rückfallkopie entfernt werden:', error);
  }
}
