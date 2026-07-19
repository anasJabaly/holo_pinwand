/* ═══════════════════════════════════════════════════════
   ui.js · Rendering & DOM-Helfer (v4)
   Karten sind bewusst ruhig: Klick = Detailansicht,
   nur der Status-Haken liegt direkt auf der Karte.
   ═══════════════════════════════════════════════════════ */

import { getState, todayISO } from './state.js';
import {
  todayTasks, boardTasks, tasksForDate, conflictIds, toMinutes, overdueTasks,
} from './tasks.js';
import { xpNeeded, rankForLevel, XP_BY_DIFFICULTY } from './leveling.js';
import { weekDates, monthGrid, shortLabel, DOW } from './calendar.js';
import { prayerTimes } from './integrations.js';
import { allGroups, findGroup } from './groups.js';
import { eventsForDate, EVENT_COLORS } from './events.js';

const el = (id) => document.getElementById(id);

/* ── Helfer ── */
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const minToHHMM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const pxPerMin = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--min-px')) || 0.9;

/** Relative Deadline: "HEUTE", "MORGEN", "IN 3 T", "VOR 2 T" */
export function relLabel(iso) {
  const diff = Math.round((new Date(iso + 'T12:00') - new Date(todayISO() + 'T12:00')) / 86400000);
  if (diff === 0) return 'HEUTE';
  if (diff === 1) return 'MORGEN';
  if (diff === -1) return 'GESTERN';
  return diff > 0 ? `IN ${diff} T` : `VOR ${-diff} T`;
}

const PRIO = {
  urgent: { label: 'DRINGEND', cls: 'p-urgent' },
  high:   { label: 'HOCH',     cls: 'p-high' },
  normal: { label: '',         cls: '' },
  low:    { label: 'NIEDRIG',  cls: 'p-low' },
};

/* ── View-Zustand (nur UI, nicht persistiert) ── */
export const viewState = {
  active: 'today',
  weekOffset: 0,
  monthOffset: 0,
  selectedDay: todayISO(),
  search: '',
  groupFilter: 'all',   // 'all' | 'none' | groupId
};

const matchesFilter = (t) => {
  if (viewState.search && !t.title.toLowerCase().includes(viewState.search.toLowerCase())) return false;
  if (viewState.groupFilter === 'all') return true;
  if (viewState.groupFilter === 'none') return t.groupId === null;
  return t.groupId === viewState.groupFilter;
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
  const name = (getState().profile.name || '').toUpperCase();
  el('greeting').textContent =
    (h < 5 ? 'NACHTSCHICHT AKTIV' :
     h < 11 ? 'GUTEN MORGEN' :
     h < 17 ? 'GUTEN TAG' :
     h < 22 ? 'GUTEN ABEND' : 'ZEIT ZUM RUNTERFAHREN') + (name ? `, ${name}` : '');
}

/* ── Header: Reaktor, Rang, Streak ── */
function renderPlayer() {
  const { player, streak } = getState();
  const need = xpNeeded(player.level);
  const CIRC = 251.3;
  el('reactorBar').style.strokeDashoffset = String(CIRC * (1 - Math.min(1, player.xp / need)));
  el('reactorLvl').textContent = player.level;
  el('reactorXp').textContent = `${player.xp} / ${need} XP`;

  const rank = rankForLevel(player.level);
  const badge = el('rankBadge');
  badge.textContent = rank;
  badge.className = `rank-badge rank-${rank}`;
  el('streakBox').innerHTML = streak.count > 0 ? `STREAK <b>⚡ ${streak.count}</b>` : 'STREAK <b>—</b>';
}

/* ── Quests: erledigt = abgehakt + dezent, NICHT durchgestrichen ── */
function renderQuests() {
  el('questList').innerHTML = getState().quests.items.map((q) => `
    <div class="quest ${q.done ? 'done' : ''}">
      <span class="q-check">${q.done ? '✓' : ''}</span>
      <span class="q-label">${esc(q.label)}</span>
      <span class="mono dim q-progress">${Math.min(q.progress, q.target)}/${q.target}</span>
      <span class="q-xp">+${q.bonusXp} XP</span>
    </div>`).join('');
}

/* ── Gebetszeiten-Panel (Anzeige; Übernahme läuft übers Modal) ── */
function renderPrayerPanel() {
  const s = getState();
  const panel = el('prayerPanel');
  if (!s.settings.prayerEnabled) { panel.hidden = true; return; }
  const iso = todayISO();
  const list = prayerTimes.listFor(iso);
  panel.hidden = false;

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nextIdx = list.findIndex((p) => toMinutes(p.time) > nowMin);

  panel.innerHTML = `
    <div class="q-title" style="color:var(--prayer)">☾ GEBETSZEITEN</div>
    ${list.length ? list.map((p, i) => `
      <div class="prayer-row ${i === nextIdx ? 'next' : ''} ${toMinutes(p.time) <= nowMin ? 'past' : ''}">
        <span>${esc(p.name)} ${prayerTimes.isAdopted(iso, p.name) ? '<span class="mono" style="font-size:9px">· IM PLAN</span>' : ''}</span>
        <span class="mono">${p.time}</span>
      </div>`).join('')
      : '<div class="mono dim" style="font-size:11px">ZEITEN WERDEN GELADEN …</div>'}
    <button class="hud-btn small" id="prayerManageBtn" style="margin-top:10px; width:100%">IN TAGESPLAN ÜBERNEHMEN …</button>`;
}

/* ── Mini-Statistik ── */
function renderStats() {
  const s = getState();
  const today = todayISO();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0, 0, 0, 0);
  const doneToday = s.tasks.filter((t) => t.status === 'done' && t.dueDate === today).length;
  const doneWeek = s.tasks.filter((t) => t.status === 'done' && t.doneAt && t.doneAt >= weekAgo.getTime()).length;
  const open = s.tasks.filter((t) => t.status !== 'done').length;
  el('statsRow').innerHTML = `
    <div class="stat"><b>${doneToday}</b><span>HEUTE ✓</span></div>
    <div class="stat"><b>${doneWeek}</b><span>7 TAGE ✓</span></div>
    <div class="stat"><b>${open}</b><span>OFFEN</span></div>
    <div class="stat"><b>${s.player.totalXp}</b><span>XP</span></div>`;
}

/* ── Timeline-Block: feste Kopfzeile Zeit · Badge · Titel ── */
export function tlBlock({ top, height, cls, time, badge, title, actions = '', style = '' }) {
  const compact = height < 45 * pxPerMin() ? 'compact' : '';
  return `
    <div class="tl-block ${cls} ${compact}" style="top:${top}px; height:${height}px; ${style}">
      <div class="tlb-head">
        <span class="tlb-time">${time}</span>
        ${badge ? `<span class="tlb-badge">${badge}</span>` : ''}
        <span class="tlb-title">${title}</span>
      </div>
      ${actions ? `<div class="tlb-actions">${actions}</div>` : ''}
    </div>`;
}

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
  for (let m = startMin; m < startMin + totalMin; m += 30) {
    html += `<div class="slot" data-slot="${minToHHMM(m)}"
      style="top:${(m - startMin) * ppm}px; height:${30 * ppm}px" title="＋ ${minToHHMM(m)}"></div>`;
  }

  // Gebete (nur übernommene)
  prayerTimes.blocksFor(today).forEach((b) => {
    html += tlBlock({
      top: (toMinutes(b.start) - startMin) * ppm,
      height: b.durationMin * ppm,
      cls: 'prayer', time: b.start, badge: '☾', title: esc(b.title),
      actions: `<button class="tlb-x" data-prayer-remove="${esc(b.title)}" title="Aus Plan entfernen">✕</button>`,
    });
  });

  // Manuelle Termine
  eventsForDate(today).forEach((ev) => {
    const c = EVENT_COLORS[ev.color];
    html += tlBlock({
      top: (toMinutes(ev.start) - startMin) * ppm,
      height: ev.durationMin * ppm,
      cls: 'event', time: ev.start, badge: '', title: esc(ev.title),
      style: `border-left: 3px solid ${c}; --ev-c:${c};`,
      actions: `<button class="tlb-x" data-event-id="${ev.id}" title="Bearbeiten">✎</button>`,
    });
  });

  // Geplante Tasks
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const conflicts = conflictIds(today);
  todayTasks().filter((t) => t.plan).forEach((t) => {
    const s0 = toMinutes(t.plan.start);
    const running = t.status !== 'done' && nowMin >= s0 && nowMin < s0 + t.plan.durationMin;
    const g = findGroup(t.groupId);
    html += tlBlock({
      top: (s0 - startMin) * ppm,
      height: t.plan.durationMin * ppm,
      cls: `${running ? 'running' : ''} ${t.status === 'done' ? 'done' : ''} ${conflicts.has(t.id) ? 'conflict' : ''}`,
      time: `${t.plan.start}–${minToHHMM(s0 + t.plan.durationMin)}`,
      badge: conflicts.has(t.id) ? '⚠' : (running ? '▶' : ''),
      title: esc(t.title),
      style: g ? `border-left: 3px solid ${g.color};` : '',
      actions: `<button class="tlb-x" data-open-task="${t.id}" title="Details">✎</button>`,
    });
  });

  if (nowMin >= startMin && nowMin <= startMin + totalMin) {
    html += `<div class="tl-now" style="top:${(nowMin - startMin) * ppm}px"></div>`;
  }

  const tl = el('todayTimeline');
  tl.style.height = `${totalMin * ppm}px`;
  tl.innerHTML = html;
}

/* ── Task-Karte: ruhig. Klick = Details, nur ✓ direkt ── */
function badges(t) {
  const g = findGroup(t.groupId);
  const p = PRIO[t.priority] || PRIO.normal;
  const subs = t.subtasks.length
    ? `<span class="chip">☑ ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}</span>` : '';
  const due = t.dueDate
    ? `<span class="chip ${t.dueDate < todayISO() && t.status !== 'done' ? 'chip-over' : (t.dueDate === todayISO() ? 'chip-today' : '')}">◔ ${relLabel(t.dueDate)}${t.dueTime ? ' ' + t.dueTime : ''}</span>` : '';
  return `
    ${g ? `<span class="chip" style="--g:${g.color}"><i class="g-dot"></i>${esc(g.name.toUpperCase())}</span>` : ''}
    ${p.label ? `<span class="chip ${p.cls}">⚑ ${p.label}</span>` : ''}
    ${t.status === 'progress' ? '<span class="chip chip-prog">IN ARBEIT</span>' : ''}
    ${t.recur ? `<span class="chip">↻</span>` : ''}
    ${due}${subs}`;
}

function taskCard(t) {
  return `
    <div class="holo-card ${t.status === 'done' ? 'done' : ''}" data-task-id="${t.id}" role="button" tabindex="0">
      <div class="chip-row">${badges(t)}<span class="chip chip-xp">+${XP_BY_DIFFICULTY[t.difficulty]} XP</span></div>
      <div class="task-title">${esc(t.title)}</div>
      ${t.plan ? `<div class="task-time">◷ ${t.plan.start} · ${t.plan.durationMin} MIN</div>` : ''}
      <button class="hud-btn ok card-check" data-act="toggle" data-id="${t.id}">
        ${t.status === 'done' ? '↩ ZURÜCK' : '✓ FERTIG'}
      </button>
    </div>`;
}

function renderToday() {
  // Überfällig-Bereich (nur wenn vorhanden)
  const over = overdueTasks().filter(matchesFilter);
  el('overdueWrap').hidden = over.length === 0;
  el('overdueList').innerHTML = over.map((t) => `
    <div class="over-row" data-task-id="${t.id}">
      <span class="chip chip-over">◔ ${relLabel(t.dueDate)}</span>
      <span class="over-title">${esc(t.title)}</span>
      <button class="hud-btn small ok" data-act="toggle" data-id="${t.id}">✓</button>
      <button class="hud-btn small" data-act="toToday" data-id="${t.id}">→ HEUTE</button>
    </div>`).join('');

  const list = todayTasks().filter(matchesFilter);
  el('todayGrid').innerHTML = list.map(taskCard).join('');
  el('todayEmpty').hidden = list.length > 0;
  el('todayCount').textContent = `${list.length} ${list.length === 1 ? 'AUFGABE' : 'AUFGABEN'}`;

  const board = boardTasks().filter(matchesFilter);
  el('boardGrid').innerHTML = board.map((t) => `
    <div class="pin-card" draggable="true" data-drag-id="${t.id}" data-task-id="${t.id}">
      <span class="pin" ${findGroup(t.groupId) ? `style="background:${findGroup(t.groupId).color}; box-shadow:0 0 8px ${findGroup(t.groupId).color}"` : ''}></span>
      <div class="chip-row">${badges(t)}</div>
      <div class="task-title">${esc(t.title)}</div>
      <button class="hud-btn small card-check" data-act="toToday" data-id="${t.id}">→ HEUTE</button>
    </div>`).join('');
  el('boardEmpty').hidden = board.length > 0;
  el('boardCount').textContent = `${board.length} ${board.length === 1 ? 'NOTIZ' : 'NOTIZEN'}`;
}

/* ── Wochenansicht (Tasks in Gruppenfarbe) ── */
function renderWeek() {
  const dates = weekDates(viewState.weekOffset);
  el('weekLabel').textContent = `${shortLabel(dates[0])} – ${shortLabel(dates[6])}`;
  el('weekGrid').innerHTML = dates.map((iso) => {
    const list = tasksForDate(iso).filter(matchesFilter);
    return `
      <div class="week-day ${iso === todayISO() ? 'today' : ''}" data-day="${iso}">
        <div class="wd-head"><span>${shortLabel(iso)}</span><span>${list.length || ''}</span></div>
        ${list.map((t) => {
          const g = findGroup(t.groupId);
          return `<div class="week-task ${t.status === 'done' ? 'done' : ''}"
            draggable="true" data-drag-id="${t.id}" data-task-id="${t.id}"
            ${g ? `style="border-left:3px solid ${g.color}"` : ''}>${esc(t.title)}</div>`;
        }).join('')}
      </div>`;
  }).join('');

  const board = boardTasks().filter(matchesFilter);
  el('weekPool').innerHTML = board.length
    ? board.map((t) => `
        <div class="pool-task" draggable="true" data-drag-id="${t.id}">
          ${esc(t.title)}<span class="mono">AUF EINEN TAG ZIEHEN</span>
        </div>`).join('')
    : '<div class="empty">PINNWAND LEER</div>';
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
        <div class="week-task ${t.status === 'done' ? 'done' : ''}" data-task-id="${t.id}">${esc(t.title)}</div>`).join('')
    : '<div class="empty">KEINE TASKS</div>';
}

/* ── Gruppen-Filter in der Nav ── */
function renderGroupFilter() {
  const sel = el('groupFilter');
  const cur = viewState.groupFilter;
  sel.innerHTML =
    '<option value="all">ALLE GRUPPEN</option>' +
    allGroups().map((g) => `<option value="${g.id}">${esc(g.name.toUpperCase())}</option>`).join('') +
    '<option value="none">OHNE GRUPPE</option>';
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : 'all';
}

/* ── Level-Up-Effekt ── */
export function showLevelUp(newLevel) {
  const box = el('levelup');
  box.innerHTML = `
    <div class="flash"></div>
    <div class="lu-text">LEVEL ${newLevel}</div>
    <div class="lu-sub">RANG ${rankForLevel(newLevel)} · WEITER SO</div>`;
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
  renderGroupFilter();
  if (viewState.active === 'today') {
    renderToday(); renderTimeline(); renderPrayerPanel(); renderStats();
  }
  if (viewState.active === 'week')  renderWeek();
  if (viewState.active === 'month') renderMonth();
  el('prayerBtn').classList.toggle('active', getState().settings.prayerEnabled);
  el('notifyBtn').classList.toggle('active', getState().settings.notifyEnabled);
}
