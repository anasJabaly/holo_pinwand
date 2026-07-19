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

export const prayerTimes = {
  id: 'prayerTimes',

  /** Standort einmalig ermitteln (Geolocation, Fallback: manuelle Eingabe) */
  async enable() {
    const coords = await new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 8000 }
      );
    }) || (() => {
      const raw = prompt('Standort nicht verfügbar.\nKoordinaten manuell eingeben (Lat, Lon), z. B. 51.17, 7.08:');
      if (!raw) return null;
      const [lat, lon] = raw.split(',').map((x) => parseFloat(x.trim()));
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    })();

    if (!coords) return false;
    update((s) => { s.settings.coords = coords; s.settings.prayerEnabled = true; });
    await this.fetchFor(todayISO());
    return true;
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
    try {
      const res = await fetch(
        `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${lat}&longitude=${lon}&method=3`
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

  /** Für die Timeline: Gebete eines Tages als fixe Blöcke */
  blocksFor(iso) {
    const s = getState();
    if (!s.settings.prayerEnabled) return [];
    return (s.prayerCache[iso] || []).map((p) => ({
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
