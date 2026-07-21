/* ═══════════════════════════════════════════════════════
   ambient.js · Vollbild-"Screensaver"-Modus
   Große Uhr + nächster Task + nächstes Gebet.
   Als echter Linux-Bildschirmschoner einbindbar (siehe README):
   ?ambient=1 in der URL startet direkt in diesem Modus.
   ═══════════════════════════════════════════════════════ */

import { getState, todayISO } from './state.js';
import { todayTasks, toMinutes } from './tasks.js';
import { prayerTimes } from './integrations.js';
import { esc } from './ui.js';

const el = (id) => document.getElementById(id);
let timer = null;

export function isAmbientAutostart() {
  return new URLSearchParams(location.search).get('ambient') === '1';
}

export function openAmbient() {
  const box = el('ambient');
  box.hidden = false;
  document.documentElement.requestFullscreen?.().catch(() => {});
  tick();
  timer = setInterval(tick, 1000);
}

export function closeAmbient() {
  const box = el('ambient');
  box.hidden = true;
  clearInterval(timer);
  timer = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

function tick() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  el('ambClock').textContent = now.toLocaleTimeString('de-DE');
  el('ambDate').textContent = now
    .toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    .toUpperCase();

  // Nächster geplanter Task heute (nach jetzt), sonst nächster offener
  const planned = todayTasks()
    .filter((t) => t.plan && t.status !== 'done' && toMinutes(t.plan.start) + t.plan.durationMin > nowMin)
    .sort((a, b) => toMinutes(a.plan.start) - toMinutes(b.plan.start));
  const openTask = todayTasks().filter((t) => t.status !== 'done');
  const next = planned[0] || openTask[0];

  el('ambTask').innerHTML = next
    ? `<div class="amb-label">${planned[0] ? 'ALS NÄCHSTES' : 'OFFEN'}</div>
       <div class="amb-task-title">${esc(next.title)}</div>
       ${next.plan ? `<div class="amb-task-time">◷ ${next.plan.start} · ${next.plan.durationMin} MIN</div>` : ''}`
    : `<div class="amb-label">HEUTE</div><div class="amb-task-title dim">Keine offenen Aufgaben ✓</div>`;

  // Nächstes Gebet
  const list = prayerTimes.listFor(todayISO());
  const nextPrayer = list.find((p) => toMinutes(p.time) > nowMin);
  if (nextPrayer) {
    const diff = toMinutes(nextPrayer.time) - nowMin;
    el('ambPrayer').innerHTML = `
      <div class="amb-label">NÄCHSTES GEBET</div>
      <div class="amb-prayer-name">☾ ${esc(nextPrayer.name)}</div>
      <div class="amb-prayer-time">${nextPrayer.time} · IN ${Math.floor(diff / 60)}H ${diff % 60}M</div>`;
    el('ambPrayer').hidden = false;
  } else {
    el('ambPrayer').hidden = true;
  }
}

export function initAmbient() {
  el('ambientBtn').addEventListener('click', openAmbient);
  el('ambient').addEventListener('click', closeAmbient);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el('ambient').hidden) closeAmbient();
  });
  // Autostart als Bildschirmschoner
  if (isAmbientAutostart()) setTimeout(openAmbient, 300);
}
