/* ═══════════════════════════════════════════════════════
   state.js · Zentraler App-State + Persistenz + Migration
   Jede Änderung läuft über update() → speichert automatisch
   und benachrichtigt Subscriber (UI-Rerender).
   ═══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'holoPinnwand.v2';
const LEGACY_KEY  = 'holo-pinnwand-tasks'; // v1 (Single-File-MVP)

export const SCHEMA_VERSION = 3;

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
      prayerMethod: 13,            // Diyanet – für DE meist am genauesten
      locationLabel: '',           // z. B. "Solingen"
      showPrayerInTimeline: false, // Gebete nur anzeigen, nicht automatisch in den Plan
      notifyEnabled: false,
      collapsed: {},               // eingeklappte Panels (UI-Merker)
    },
    prayerCache: {},        // 'YYYY-MM-DD' → [{ name, time }]
    prayerAdopted: {},      // 'YYYY-MM-DD' → ['Fajr', …] (vom Nutzer bestätigt)
    groups: [],             // { id, name, color }
    events: [],             // manuelle Termine { id, title, date, start, durationMin, color }
    profile: { name: '', lastBootDate: null },
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
    priority: 'normal',
    status: t.done ? 'done' : 'open',
    groupId: null,
    subtasks: [],
    dueDate: t.where === 'today' ? today : null, // Pinnwand = null
    dueTime: null,
    plan: null,
    done: !!t.done,
    doneAt: t.done ? Date.now() : null,
    createdAt: t.created || Date.now(),
  }));
  return s;
}

/** v2 → v3: Status, Priorität, Subtasks, Gruppen nachrüsten */
function migrateV2toV3(s) {
  const d = defaultState();
  s.schemaVersion = 3;
  s.groups = s.groups || [];
  s.events = s.events || [];
  s.prayerAdopted = s.prayerAdopted || {};
  s.profile = s.profile || { name: '', lastBootDate: null };
  s.tasks.forEach((t) => {
    t.status = t.status || (t.done ? 'done' : 'open');
    t.priority = t.priority || 'normal';
    t.subtasks = t.subtasks || [];
    t.groupId = t.groupId ?? null;
    t.dueTime = t.dueTime ?? null;
  });
  s.settings = { ...d.settings, ...s.settings };
  return s;
}

let state = load();
const listeners = new Set();

/* ═══════════════════════════════════════════════════════
   Import / Export / Sanitizing / automatische Rückfallkopie
   ═══════════════════════════════════════════════════════ */

const BACKUP_KEY = 'holoPinnwand.v2.backup';

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const PRIORITIES   = new Set(['urgent', 'high', 'normal', 'low']);
const STATUSES     = new Set(['open', 'progress', 'done']);
const RECURS       = new Set(['daily', 'weekly']);
const GROUP_PALETTE = ['#5FE3FF', '#FFB547', '#FF6B6B', '#7BE8A8', '#C792EA', '#F78C6C'];
const EVENT_COLOR_NAMES = new Set(['cyan', 'amber', 'rot', 'gruen', 'lila']);
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const SAFE_ID   = /^[A-Za-z0-9_-]+$/;
const SAFE_TIME = /^\d{1,2}:\d{2}$/;
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Beliebigen Wert auf einen sauberen String begrenzen */
const str = (v, max = 200) => (typeof v === 'string' ? v : '').slice(0, max);

/** ID übernehmen, wenn unbedenklich – sonst frische UUID */
const safeId = (v) => (typeof v === 'string' && SAFE_ID.test(v) ? v : crypto.randomUUID());

/** Koordinaten auf 3 Nachkommastellen runden (Genauigkeit/Datensparsamkeit) */
function roundCoords(coords) {
  if (!coords || typeof coords !== 'object') return null;
  const lat = Number(coords.lat), lon = Number(coords.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 };
}

/** Einen rohen Task normalisieren + absichern */
function sanitizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const status = STATUSES.has(raw.status) ? raw.status : (raw.done ? 'done' : 'open');
  const done = status === 'done';
  // done/doneAt konsistent zum Status erzwingen
  const doneAt = done ? (Number.isFinite(raw.doneAt) ? raw.doneAt : Date.now()) : null;

  return {
    id: safeId(raw.id),
    title: str(raw.title, 160),
    difficulty: DIFFICULTIES.has(raw.difficulty) ? raw.difficulty : 'medium',
    priority: PRIORITIES.has(raw.priority) ? raw.priority : 'normal',
    status,
    groupId: typeof raw.groupId === 'string' && SAFE_ID.test(raw.groupId) ? raw.groupId : null,
    subtasks: Array.isArray(raw.subtasks)
      ? raw.subtasks.filter((s) => s && typeof s === 'object').map((s) => ({
          id: safeId(s.id), title: str(s.title, 120), done: Boolean(s.done),
        }))
      : [],
    notes: str(raw.notes, 2000),
    dueDate: SAFE_DATE.test(raw.dueDate) ? raw.dueDate : null,
    dueTime: SAFE_TIME.test(raw.dueTime) ? raw.dueTime : null,
    plan: raw.plan && SAFE_TIME.test(raw.plan.start) && Number.isFinite(raw.plan.durationMin)
      ? { start: raw.plan.start, durationMin: Math.max(30, Math.round(raw.plan.durationMin / 30) * 30) }
      : null,
    done,
    doneAt,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    recur: RECURS.has(raw.recur) ? raw.recur : null,
  };
}

/** Gruppe absichern; Farbe muss echtes Hex sein, sonst Palette-Default */
function sanitizeGroup(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: safeId(raw.id),
    name: str(raw.name, 40),
    color: HEX_COLOR.test(raw.color) ? raw.color : GROUP_PALETTE[index % GROUP_PALETTE.length],
  };
}

/** Termin absichern; Farbe muss bekannter Name sein, sonst 'cyan' */
function sanitizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!SAFE_TIME.test(raw.start) || !SAFE_DATE.test(raw.date)) return null;
  return {
    id: safeId(raw.id),
    title: str(raw.title, 120),
    date: raw.date,
    start: raw.start,
    durationMin: Number.isFinite(raw.durationMin) ? Math.max(15, raw.durationMin) : 60,
    color: EVENT_COLOR_NAMES.has(raw.color) ? raw.color : 'cyan',
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

/** Gebets-Cache absichern: nur Einträge mit sauberem Namen + gültiger Zeit */
function sanitizePrayerCache(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [iso, list] of Object.entries(raw)) {
    if (!SAFE_DATE.test(iso) || !Array.isArray(list)) continue;
    const clean = list
      .filter((p) => p && SAFE_TIME.test(p.time) && /^[A-Za-zÀ-ÿ' -]{1,30}$/.test(p.name || ''))
      .map((p) => ({ name: p.name, time: p.time }));
    if (clean.length) out[iso] = clean;
  }
  return out;
}

/** Adoptierte Gebete: nur bekannte Namen erlauben */
const PRAYER_NAMES = new Set(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
function sanitizePrayerAdopted(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [iso, names] of Object.entries(raw)) {
    if (!SAFE_DATE.test(iso) || !Array.isArray(names)) continue;
    const clean = names.filter((n) => PRAYER_NAMES.has(n));
    if (clean.length) out[iso] = clean;
  }
  return out;
}

/**
 * Rohen (evtl. fremden/unsicheren) State-Payload in einen sauberen,
 * vollständigen State überführen. Fehlende Felder → Defaults.
 */
function sanitizeState(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;

  const s = defaultState();
  s.tasks = Array.isArray(raw.tasks) ? raw.tasks.map(sanitizeTask).filter(Boolean) : [];
  s.groups = Array.isArray(raw.groups) ? raw.groups.map(sanitizeGroup).filter(Boolean) : [];
  s.events = Array.isArray(raw.events) ? raw.events.map(sanitizeEvent).filter(Boolean) : [];
  s.prayerCache = sanitizePrayerCache(raw.prayerCache);
  s.prayerAdopted = sanitizePrayerAdopted(raw.prayerAdopted);

  if (raw.player && typeof raw.player === 'object') {
    s.player = {
      level: Math.max(1, Math.floor(Number(raw.player.level) || 1)),
      xp: Math.max(0, Math.floor(Number(raw.player.xp) || 0)),
      totalXp: Math.max(0, Math.floor(Number(raw.player.totalXp) || 0)),
    };
  }
  if (raw.streak && typeof raw.streak === 'object') {
    s.streak = {
      count: Math.max(0, Math.floor(Number(raw.streak.count) || 0)),
      lastDate: SAFE_DATE.test(raw.streak.lastDate) ? raw.streak.lastDate : null,
    };
  }
  if (raw.quests && typeof raw.quests === 'object' && Array.isArray(raw.quests.items)) {
    s.quests = { date: SAFE_DATE.test(raw.quests.date) ? raw.quests.date : null, items: raw.quests.items };
  }
  if (raw.profile && typeof raw.profile === 'object') {
    s.profile = {
      name: str(raw.profile.name, 30),
      lastBootDate: SAFE_DATE.test(raw.profile.lastBootDate) ? raw.profile.lastBootDate : null,
    };
  }
  if (raw.settings && typeof raw.settings === 'object') {
    s.settings = {
      ...d.settings,
      ...raw.settings,
      coords: roundCoords(raw.settings.coords),
      collapsed: (raw.settings.collapsed && typeof raw.settings.collapsed === 'object') ? raw.settings.collapsed : {},
      locationLabel: str(raw.settings.locationLabel, 60),
    };
  }
  return s;
}

/** Aktuellen Stand als Rückfallkopie sichern (vor destruktiven Aktionen) */
function saveBackup() {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

/** Gibt es eine automatische Rückfallkopie? */
export function hasAutomaticBackup() {
  try { return localStorage.getItem(BACKUP_KEY) !== null; } catch (e) { return false; }
}

/**
 * State importieren – akzeptiert ein Objekt ODER einen JSON-String.
 * Legt vorher automatisch eine Rückfallkopie an, säubert die Daten
 * und ersetzt den aktuellen Stand. Gibt den neuen State zurück.
 */
export function importStateJson(input) {
  let raw = input;
  if (typeof input === 'string') {
    try { raw = JSON.parse(input); }
    catch (e) { throw new Error('Ungültige JSON-Datei.'); }
  }
  saveBackup();                 // aktuellen Stand als Rückfallkopie sichern
  state = sanitizeState(raw);   // säubern + normalisieren
  persist();
  listeners.forEach((fn) => fn(state));
  return state;
}

/** Aktuellen State als hübsch formatierten JSON-String exportieren */
export function exportStateJson() {
  return JSON.stringify(state, null, 2);
}

/** Letzte automatische Rückfallkopie wiederherstellen (nach Import) */
export function restoreAutomaticBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return false;
    state = JSON.parse(raw);
    localStorage.removeItem(BACKUP_KEY);
    persist();
    listeners.forEach((fn) => fn(state));
    return true;
  } catch (e) {
    return false;
  }
}

/** Kompletten Reset auf Werkszustand (mit Rückfallkopie) */
export function resetState() {
  saveBackup();
  state = defaultState();
  persist();
  listeners.forEach((fn) => fn(state));
  return state;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.schemaVersion === SCHEMA_VERSION) {
        parsed.settings = { ...defaultState().settings, ...parsed.settings };
        return parsed;
      }
      if (parsed && parsed.schemaVersion === 2) {
        const migrated = migrateV2toV3(parsed);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
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
