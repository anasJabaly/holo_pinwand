/* ═══════════════════════════════════════════════════════
   integrations.js · Erweiterbare Integrations-Schicht
   ═══════════════════════════════════════════════════════ */

import { clearLocationData, getState, todayISO, update } from './state.js';
import { tasksForDate, toMinutes } from './tasks.js';

const PRAYER_NAMES = {
  Fajr: 'Fajr',
  Dhuhr: 'Dhuhr',
  Asr: 'Asr',
  Maghrib: 'Maghrib',
  Isha: 'Isha',
};
const PRAYER_API_TIMEOUT_MS = 10_000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const PRAYER_BLOCK_MIN = 20;

function roundCoordinate(value) {
  return Number(Number(value).toFixed(3));
}

function validCoordinates(coords) {
  if (!coords) return null;
  const lat = Number(coords.lat);
  const lon = Number(coords.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat: roundCoordinate(lat), lon: roundCoordinate(lon) };
}

function manualCoordinates() {
  const raw = prompt(
    'Standort nicht verfügbar.\nKoordinaten manuell eingeben (Lat, Lon), z. B. 51.17, 7.08:',
  );
  if (!raw) return null;
  const [lat, lon] = raw.split(',').map((value) => Number.parseFloat(value.trim()));
  return validCoordinates({ lat, lon });
}

async function browserCoordinates() {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(validCoordinates({
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      })),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 60 * 60 * 1000, timeout: 8000 },
    );
  });
}

async function fetchJsonWithTimeout(url, timeoutMs = PRAYER_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export const prayerTimes = {
  id: 'prayerTimes',

  async enable() {
    const coords = (await browserCoordinates()) || manualCoordinates();
    if (!coords) return false;

    update((state) => {
      state.settings.coords = coords;
      state.settings.prayerEnabled = true;
    });

    const result = await this.fetchFor(todayISO(), { force: true });
    if (!result) {
      update((state) => { state.settings.prayerEnabled = false; });
      return false;
    }
    return true;
  },

  disable() {
    update((state) => { state.settings.prayerEnabled = false; });
  },

  clearLocation() {
    clearLocationData();
  },

  /** Zeiten für ein Datum holen (mit lokalem Cache). */
  async fetchFor(iso, { force = false } = {}) {
    const state = getState();
    if (!state.settings.coords) return null;
    if (!force && state.prayerCache[iso]) return state.prayerCache[iso];

    const [year, month, day] = iso.split('-');
    const { lat, lon } = state.settings.coords;
    const query = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      method: '3',
    });

    try {
      const json = await fetchJsonWithTimeout(
        `https://api.aladhan.com/v1/timings/${day}-${month}-${year}?${query}`,
      );
      const timings = json?.data?.timings;
      if (!timings || typeof timings !== 'object') throw new Error('Ungültige API-Antwort');

      const blocks = Object.keys(PRAYER_NAMES).map((key) => {
        const time = String(timings[key] || '').slice(0, 5);
        if (!TIME_PATTERN.test(time)) throw new Error(`Ungültige Zeit für ${key}`);
        return { name: PRAYER_NAMES[key], time };
      });

      update((next) => { next.prayerCache[iso] = blocks; });
      return blocks;
    } catch (error) {
      const reason = error?.name === 'AbortError' ? 'Zeitüberschreitung' : error?.message;
      console.warn(`Gebetszeiten-Abruf fehlgeschlagen (${reason || 'unbekannt'}).`);
      return null;
    }
  },

  listFor(iso) {
    const state = getState();
    if (!state.settings.prayerEnabled) return [];
    return state.prayerCache[iso] || [];
  },

  isAdopted(iso, name) {
    return (getState().prayerAdopted[iso] || []).includes(name);
  },

  adopt(iso, name, on) {
    update((state) => {
      const list = state.prayerAdopted[iso] || [];
      state.prayerAdopted[iso] = on
        ? [...new Set([...list, name])]
        : list.filter((entry) => entry !== name);
    });
  },

  adoptAll(iso) {
    const names = this.listFor(iso).map((prayer) => prayer.name);
    update((state) => { state.prayerAdopted[iso] = names; });
  },

  blocksFor(iso) {
    const state = getState();
    if (!state.settings.prayerEnabled) return [];
    const adopted = state.prayerAdopted[iso] || [];
    return (state.prayerCache[iso] || [])
      .filter((prayer) => adopted.includes(prayer.name))
      .map((prayer) => ({
        kind: 'prayer',
        title: prayer.name,
        start: prayer.time,
        durationMin: PRAYER_BLOCK_MIN,
      }));
  },
};

async function showReminder(title, options) {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  }
  new Notification(title, options);
}

export const reminders = {
  id: 'reminders',
  LEAD_MIN: 10,
  _timer: null,
  _notified: new Set(),

  async enable() {
    if (!('Notification' in window)) return false;
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted';
    update((state) => { state.settings.notifyEnabled = enabled; });
    if (enabled) this.start();
    else this.stop();
    return enabled;
  },

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this.check(), 60 * 1000);
    this.check();
  },

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },

  check() {
    const state = getState();
    if (!state.settings.notifyEnabled || Notification.permission !== 'granted') return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    tasksForDate(todayISO())
      .filter((task) => task.plan && task.status !== 'done')
      .forEach((task) => {
        const startMin = toMinutes(task.plan.start);
        const key = `${task.id}@${task.plan.start}`;
        const diff = startMin - nowMin;
        if (diff <= 0 || diff > this.LEAD_MIN || this._notified.has(key)) return;

        this._notified.add(key);
        showReminder('⬡ Holo-Pinnwand', {
          body: `In ${diff} Min: ${task.title} (${task.plan.start})`,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: key,
        }).catch((error) => console.warn('Benachrichtigung fehlgeschlagen:', error));
      });
  },
};

export const REGISTRY = [prayerTimes, reminders];
