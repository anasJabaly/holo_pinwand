/* ═══════════════════════════════════════════════════════
   integrations.js · Erweiterbare Integrations-Schicht
   Jede Integration ist ein Objekt { id, init(), … } und wird
   in REGISTRY eingehängt – neue Module später einfach ergänzen.
   ═══════════════════════════════════════════════════════ */

import { getState, update, todayISO } from './state.js';
import { toMinutes, tasksForDate } from './tasks.js';

/* ── 1) Gebetszeiten (Aladhan API, kostenlos, kein Key) ── */

const PRAYER_NAMES = { Fajr: 'Fajr', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' };
export const PRAYER_BLOCK_MIN = 20; // fester, nicht verschiebbarer Block

/** Berechnungsmethoden, die in Deutschland/Europa sinnvoll sind */
export const PRAYER_METHODS = [
  { id: 3,  name: 'Muslim World League' },
  { id: 13, name: 'Diyanet (Türkei/DE üblich)' },
  { id: 2,  name: 'ISNA (Nordamerika)' },
  { id: 5,  name: 'Ägypt. Behörde' },
  { id: 4,  name: 'Umm al-Qura (Mekka)' },
];

export const prayerTimes = {
  id: 'prayerTimes',

  /**
   * Stadt per Name suchen (Aladhan-Geocoding).
   * Rückgabe: [{ name, country, lat, lon }] oder [].
   */
  async searchCity(query) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    try {
      // Aladhan liefert Zeiten direkt per Stadt/Land – wir nutzen die
      // Adress-Variante, die intern geокодiert, und lesen meta.latitude/longitude.
      const res = await fetch(
        `https://api.aladhan.com/v1/timingsByAddress/${encodeURIComponent(todayISO().split('-').reverse().join('-'))}?address=${encodeURIComponent(q)}&method=${getState().settings.prayerMethod ?? 13}`
      );
      const json = await res.json();
      const meta = json?.data?.meta;
      if (!meta) return [];
      return [{ name: q, country: '', lat: meta.latitude, lon: meta.longitude }];
    } catch (e) {
      console.warn('Stadtsuche fehlgeschlagen:', e);
      return [];
    }
  },

  /** Standort setzen (aus Stadtwahl oder Geolocation) */
  async setLocation(coords, label = '') {
    update((s) => {
      s.settings.coords = coords;
      s.settings.locationLabel = label;
      s.settings.prayerEnabled = true;
      s.prayerCache = {}; // Cache leeren, damit neue Methode/Stadt greift
    });
    await this.fetchFor(todayISO());
    return true;
  },

  /** Berechnungsmethode wechseln → Cache leeren */
  setMethod(methodId) {
    update((s) => { s.settings.prayerMethod = methodId; s.prayerCache = {}; });
    return this.fetchFor(todayISO());
  },

  /** Standort per GPS ermitteln */
  async enable() {
    const coords = await new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 8000 }
      );
    });
    if (!coords) return false;
    return this.setLocation(coords, 'Mein Standort');
  },

  disable() {
    update((s) => { s.settings.prayerEnabled = false; });
  },

  /** Zeiten für ein Datum holen (mit Cache im State) */
  async fetchFor(iso) {
    const s = getState();
    if (!s.settings.coords) return null;
    if (s.prayerCache[iso]) return s.prayerCache[iso];

    const [y, m, d] = iso.split('-');
    const { lat, lon } = s.settings.coords;
    const method = s.settings.prayerMethod ?? 13;
    try {
      const res = await fetch(
        `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${lat}&longitude=${lon}&method=${method}`
      );
      const json = await res.json();
      const t = json?.data?.timings;
      if (!t) return null;
      const blocks = Object.keys(PRAYER_NAMES).map((k) => ({
        name: PRAYER_NAMES[k],
        time: t[k].slice(0, 5), // "HH:MM"
      }));
      update((st) => { st.prayerCache[iso] = blocks; });
      return blocks;
    } catch (e) {
      console.warn('Gebetszeiten-Abruf fehlgeschlagen:', e);
      return null;
    }
  },

  /** Für das HUD-Panel: reine Liste der Zeiten */
  listFor(iso) {
    const s = getState();
    if (!s.settings.prayerEnabled) return [];
    return s.prayerCache[iso] || [];
  },

  /** Ist dieses Gebet für den Tag in den Plan übernommen? */
  isAdopted(iso, name) {
    return (getState().prayerAdopted[iso] || []).includes(name);
  },

  /** Einzelnes Gebet in den Tagesplan übernehmen / entfernen */
  adopt(iso, name, on) {
    update((s) => {
      const list = s.prayerAdopted[iso] || [];
      s.prayerAdopted[iso] = on
        ? [...new Set([...list, name])]
        : list.filter((x) => x !== name);
    });
  },

  /** Alle Gebete des Tages übernehmen */
  adoptAll(iso) {
    const names = this.listFor(iso).map((p) => p.name);
    update((s) => { s.prayerAdopted[iso] = names; });
  },

  /** Für die Timeline: NUR vom Nutzer bestätigte Gebete als Blöcke */
  blocksFor(iso) {
    const s = getState();
    if (!s.settings.prayerEnabled) return [];
    const adopted = s.prayerAdopted[iso] || [];
    return (s.prayerCache[iso] || [])
      .filter((p) => adopted.includes(p.name))
      .map((p) => ({
      kind: 'prayer',
      title: p.name,
      start: p.time,
      durationMin: PRAYER_BLOCK_MIN,
    }));
  },
};

/* ── 2) Erinnerungen (Notification API) ─────────────── */

export const reminders = {
  id: 'reminders',
  LEAD_MIN: 10,               // Minuten Vorlauf
  _timer: null,
  _notified: new Set(),       // "taskId@start" – nur einmal melden

  async enable() {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    const ok = perm === 'granted';
    update((s) => { s.settings.notifyEnabled = ok; });
    if (ok) this.start();
    return ok;
  },

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this.check(), 60 * 1000);
    this.check();
  },

  check() {
    const s = getState();
    if (!s.settings.notifyEnabled) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today = todayISO();

    tasksForDate(today)
      .filter((t) => t.plan && !t.done)
      .forEach((t) => {
        const startMin = toMinutes(t.plan.start);
        const key = `${t.id}@${t.plan.start}`;
        const diff = startMin - nowMin;
        if (diff > 0 && diff <= this.LEAD_MIN && !this._notified.has(key)) {
          this._notified.add(key);
          new Notification('⬡ Holo-Pinnwand', {
            body: `In ${diff} Min: ${t.title} (${t.plan.start})`,
          });
        }
      });
  },
};

/* ── Registry: hier künftige Integrationen ergänzen ── */
export const REGISTRY = [prayerTimes, reminders];
