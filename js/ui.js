/* ═══════════════════════════════════════════════════════
   ui.js · Rendering & DOM-Helfer
   Reagiert auf State-Änderungen (subscribe in app.js) und
   zeichnet Header, Views, Timeline, Quests, Effekte.
   ═══════════════════════════════════════════════════════ */

import { getState, todayISO } from './state.js';
import {
  todayTasks, boardTasks, tasksForDate, conflictIds, toMinutes,
} from './tasks.js';
import { xpNeeded, rankForLevel, DIFFICULTY_LABEL, XP_BY_DIFFICULTY } from './leveling.js';
import { weekDates, monthGrid, shortLabel, DOW } from './calendar.js';
import { prayerTimes } from './integrations.js';

const el = (id) => document.getElementById(id);

/* ── Helfer ── */
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const minToHHMM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const pxPerMin = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--min-px')) || 0.9;

/* ── View-Zustand (nur UI, nicht persistiert) ── */
export const viewState = {
  active: 'today',      // 'today' | 'week' | 'month'
  weekOffset: 0,
  monthOffset: 0,
  selectedDay: todayISO(),
};

export function switchView(name) {
  viewState.active = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  renderAll();
}

/* ── Header: Uhr, Begrüßung ── */
export function tickClock() {
  const now = new Date();
  el('clockTime').textContent = now.toLocaleTimeString('de-DE');
  el('clockDate').textContent = now
    .toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    .toUpperCase();
  const h = now.getHours();
  el('greeting').textContent =
    h < 5 ? 'NACHTSCHICHT AKTIV' :
    h < 11 ? 'GUTEN MORGEN, ANAS' :
    h < 17 ? 'GUTEN TAG, ANAS' :
    h < 22 ? 'GUTEN ABEND, ANAS' : 'ZEIT ZUM RUNTERFAHREN';
}

/* ── Header: Reaktor = XP-Fortschritt, Rang, Streak ── */
function renderPlayer() {
  const { player, streak } = getState();
  const need = xpNeeded(player.level);
  const pct = Math.min(1, player.xp / need);
  const CIRC = 251.3;

  el('reactorBar').style.strokeDashoffset = String(CIRC * (1 - pct));
  el('reactorLvl').textContent = player.level;
  el('reactorXp').textContent = `${player.xp} / ${need} XP`;

  const rank = rankForLevel(player.level);
  const badge = el('rankBadge');
  badge.textContent = rank;
  badge.className = `rank-badge rank-${rank}`;
  badge.title = `Rang ${rank} · Level ${player.level} · ${player.totalXp} XP gesamt`;

  el('streakBox').innerHTML = streak.count > 0
    ? `STREAK <b>⚡ ${streak.count}</b> TAGE`
    : `STREAK <b>—</b>`;
}

/* ── Quests ── */
function renderQuests() {
  const { quests } = getState();
  el('questList').innerHTML = quests.items.map((q) => `
    <div class="quest ${q.done ? 'done' : ''}">
      <span class="q-check">${q.done ? '✓' : ''}</span>
      ${esc(q.label)}
      <span class="mono dim">${Math.min(q.progress, q.target)}/${q.target}</span>
      <span class="q-xp">+${q.bonusXp} XP</span>
    </div>`).join('');
}

/* ── Heute: Timeline ── */
function renderTimeline() {
  const { dayStart, dayEnd } = getState().settings;
  const startMin = dayStart * 60;
  const totalMin = (dayEnd - dayStart) * 60;
  const ppm = pxPerMin();
  const today = todayISO();

  let html = '';
  for (let h = dayStart; h <= dayEnd; h++) {
    const y = (h * 60 - startMin) * ppm;
    html += `<div class="tl-hour" style="top:${y}px">${String(h).padStart(2, '0')}:00</div>`;
    html += `<div class="tl-hourline" style="top:${y}px"></div>`;
  }

  // Gebets-Blöcke
  prayerTimes.blocksFor(today).forEach((b) => {
    const top = (toMinutes(b.start) - startMin) * ppm;
    if (top < 0) return;
    html += `<div class="tl-block prayer" style="top:${top}px; height:${b.durationMin * ppm}px">
      <span class="tl-time">${b.start}</span> ${esc(b.title)}</div>`;
  });

  // Task-Blöcke
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const conflicts = conflictIds(today);

  todayTasks().filter((t) => t.plan).forEach((t) => {
    const s0 = toMinutes(t.plan.start);
    const running = !t.done && nowMin >= s0 && nowMin < s0 + t.plan.durationMin;
    html += `
      <div class="tl-block ${running ? 'running' : ''} ${t.done ? 'done' : ''} ${conflicts.has(t.id) ? 'conflict' : ''}"
           style="top:${(s0 - startMin) * ppm}px; height:${t.plan.durationMin * ppm}px">
        <span class="tl-time">${t.plan.start} – ${minToHHMM(s0 + t.plan.durationMin)}
          ${conflicts.has(t.id) ? '· ⚠' : ''}${running ? '· LÄUFT' : ''}</span>
        ${esc(t.title)}
      </div>`;
  });

  // Jetzt-Linie
  if (nowMin >= startMin && nowMin <= startMin + totalMin) {
    html += `<div class="tl-now" style="top:${(nowMin - startMin) * ppm}px"></div>`;
  }

  const tl = el('todayTimeline');
  tl.style.height = `${totalMin * ppm}px`;
  tl.innerHTML = html;
}

/* ── Heute: schwebende Karten + Pinnwand ── */
function taskCard(t) {
  const xp = XP_BY_DIFFICULTY[t.difficulty];
  return `
    <div class="holo-card ${t.done ? 'done' : ''}">
      <span class="tag ${t.difficulty}">${DIFFICULTY_LABEL[t.difficulty]}</span>
      <span class="tag xp">+${xp} XP</span>
      <div class="task-title">${esc(t.title)}</div>
      ${t.plan ? `<div class="task-time">◷ ${t.plan.start} · ${t.plan.durationMin} MIN</div>` : ''}
      <div class="card-actions">
        <button class="hud-btn ok"  data-act="toggle"  data-id="${t.id}">${t.done ? 'ZURÜCK' : '✓ FERTIG'}</button>
        <button class="hud-btn"     data-act="toBoard" data-id="${t.id}">→ PINNWAND</button>
        <button class="hud-btn danger" data-act="del"  data-id="${t.id}">✕</button>
      </div>
    </div>`;
}

function renderToday() {
  const list = todayTasks();
  el('todayGrid').innerHTML = list.map(taskCard).join('');
  el('todayEmpty').hidden = list.length > 0;
  el('todayCount').textContent = `${list.length} ${list.length === 1 ? 'AUFGABE' : 'AUFGABEN'}`;

  const board = boardTasks();
  el('boardGrid').innerHTML = board.map((t) => `
    <div class="pin-card" draggable="true" data-drag-id="${t.id}">
      <span class="pin"></span>
      <span class="tag ${t.difficulty}">${DIFFICULTY_LABEL[t.difficulty]}</span>
      <div class="task-title">${esc(t.title)}</div>
      <div class="card-actions">
        <button class="hud-btn" data-act="toToday" data-id="${t.id}">→ HEUTE</button>
        <button class="hud-btn danger" data-act="del" data-id="${t.id}">✕</button>
      </div>
    </div>`).join('');
  el('boardEmpty').hidden = board.length > 0;
  el('boardCount').textContent = `${board.length} ${board.length === 1 ? 'NOTIZ' : 'NOTIZEN'}`;
}

/* ── Wochenansicht ── */
function renderWeek() {
  const dates = weekDates(viewState.weekOffset);
  el('weekLabel').textContent =
    `${shortLabel(dates[0])} – ${shortLabel(dates[6])}`;

  el('weekGrid').innerHTML = dates.map((iso) => {
    const list = tasksForDate(iso);
    return `
      <div class="week-day ${iso === todayISO() ? 'today' : ''}" data-day="${iso}">
        <div class="wd-head"><span>${shortLabel(iso)}</span><span>${list.length || ''}</span></div>
        ${list.map((t) => `
          <div class="week-task ${t.done ? 'done' : ''} ${t.difficulty === 'hard' ? 'hard' : ''}"
               draggable="true" data-drag-id="${t.id}" title="Ziehen, um zu verschieben">
            ${esc(t.title)}
          </div>`).join('')}
      </div>`;
  }).join('');

  // Pinnwand-Tasks als Drag-Quelle unter der Woche
  const board = boardTasks();
  el('weekPool').innerHTML = board.length
    ? board.map((t) => `
        <div class="pool-task" draggable="true" data-drag-id="${t.id}">
          ${esc(t.title)}<span class="mono">VON DER PINNWAND AUF EINEN TAG ZIEHEN</span>
        </div>`).join('')
    : `<div class="empty">PINNWAND LEER</div>`;
}

/* ── Monatsansicht ── */
function renderMonth() {
  const { label, cells } = monthGrid(viewState.monthOffset);
  el('calTitle').textContent = label;

  el('calGrid').innerHTML =
    DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('') +
    cells.map((c) => {
      const count = tasksForDate(c.iso).length;
      return `
        <div class="cal-day ${c.inMonth ? '' : 'other'} ${c.iso === todayISO() ? 'today' : ''} ${c.iso === viewState.selectedDay ? 'selected' : ''}"
             data-cal-day="${c.iso}">
          ${c.day}
          ${count ? `<span class="cal-dot"></span><span class="cal-count">${count}</span>` : ''}
        </div>`;
    }).join('');

  const list = tasksForDate(viewState.selectedDay);
  el('calSideTitle').textContent = shortLabel(viewState.selectedDay);
  el('calSideList').innerHTML = list.length
    ? list.map((t) => `
        <div class="week-task ${t.done ? 'done' : ''}">
          ${esc(t.title)}
          <button class="hud-btn small danger" data-act="del" data-id="${t.id}" style="float:right">✕</button>
        </div>`).join('')
    : `<div class="empty">KEINE TASKS</div>`;
}

/* ── Level-Up-Effekt ── */
export function showLevelUp(newLevel) {
  const box = el('levelup');
  const rank = rankForLevel(newLevel);
  box.innerHTML = `
    <div class="flash"></div>
    <div class="lu-text">LEVEL ${newLevel}</div>
    <div class="lu-sub">RANG ${rank} · WEITER SO</div>`;

  // Partikel-Explosion
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('div');
    p.className = 'lu-particle';
    const ang = (i / 26) * Math.PI * 2;
    const dist = 120 + Math.random() * 160;
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
    box.appendChild(p);
  }
  box.hidden = false;
  setTimeout(() => { box.hidden = true; box.innerHTML = ''; }, 1900);
}

/* ── Toast ── */
let toastTimer = null;
export function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

/* ── Gesamt-Render ── */
export function renderAll() {
  renderPlayer();
  renderQuests();
  if (viewState.active === 'today') { renderToday(); renderTimeline(); }
  if (viewState.active === 'week')  renderWeek();
  if (viewState.active === 'month') renderMonth();

  const s = getState();
  el('prayerBtn').classList.toggle('active', s.settings.prayerEnabled);
  el('notifyBtn').classList.toggle('active', s.settings.notifyEnabled);
}
