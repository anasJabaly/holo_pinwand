/* ═══════════════════════════════════════════════════════
   sync.js · Sync-Adapter
   Aktuell: 100 % lokal (localStorage über state.js).
   Später: Supabase einfach "einstecken" – die App ruft nur
   diese neutrale Schnittstelle auf, nicht direkt Supabase.
   ═══════════════════════════════════════════════════════ */

import { getState, update } from './state.js';

/**
 * Der aktive Adapter. Standard = 'local'.
 * Ein späterer supabaseAdapter muss dieselben Methoden bieten:
 *   isAvailable(), signIn(), signOut(), push(state), pull()
 */
const localAdapter = {
  id: 'local',
  isAvailable: () => true,
  async signIn() { return { ok: true, mode: 'local' }; },
  async signOut() { return { ok: true }; },
  async push() { return { ok: true }; },   // state.js speichert bereits lokal
  async pull() { return null; },           // nichts Externes zu holen
};

/* Platzhalter, damit die Struktur sichtbar ist – später ausfüllen:
const supabaseAdapter = {
  id: 'supabase',
  isAvailable: () => Boolean(window.__SUPABASE_URL__),
  async signIn(email) { … supabase.auth … },
  async signOut() { … },
  async push(state) { … upsert nach Supabase … },
  async pull() { … select aus Supabase … },
};
*/

let active = localAdapter;

export const sync = {
  /** Aktuellen Modus abfragen (für UI-Anzeige) */
  mode: () => active.id,

  /** Adapter wechseln (später: sync.use(supabaseAdapter)) */
  use(adapter) {
    if (adapter && adapter.isAvailable()) active = adapter;
    return active.id;
  },

  async signIn(...args) { return active.signIn(...args); },
  async signOut()       { return active.signOut(); },

  /** Lokalen Zustand nach außen schieben (lokal: no-op) */
  async push() { return active.push(getState()); },

  /** Von außen ziehen und in den State mergen (lokal: no-op) */
  async pull() {
    const remote = await active.pull();
    if (remote) update((s) => Object.assign(s, remote));
    return remote;
  },
};
