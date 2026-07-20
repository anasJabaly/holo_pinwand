/* ═══════════════════════════════════════════════════════
   startscreen.js · Boot-Sequenz
   Erster Start: Name + optional Standort abfragen.
   Erster Start des Tages: volle Reactor-Animation + Tagesübersicht.
   Danach: kein Startscreen (nervt sonst).
   Immer skippbar per Klick oder Taste.
   ═══════════════════════════════════════════════════════ */

import { getState, update, todayISO } from './state.js';
import { todayTasks } from './tasks.js';
import { prayerTimes } from './integrations.js';
import { rankForLevel } from './leveling.js';
import { esc } from './ui.js';

const el = (id) => document.getElementById(id);

export function runBootSequence(onDone) {
  const s = getState();
  const today = todayISO();
  const firstRun = !s.profile.name;
  const firstToday = s.profile.lastBootDate !== today;
  const screen = el('bootScreen');

  // Kein Grund für einen Startscreen → sofort in die App
  if (!firstRun && !firstToday) {
    screen.hidden = true;
    onDone();
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    update((st) => { st.profile.lastBootDate = today; });
    screen.classList.add('boot-hide');
    setTimeout(() => { screen.hidden = true; onDone(); }, 350);
  };

  if (firstRun) {
    /* ── Erster Start: Name abfragen ── */
    el('bootContent').innerHTML = `
      <div class="boot-ring"><div class="boot-core"></div></div>
      <div class="boot-line">SYSTEM-INITIALISIERUNG</div>
      <div class="boot-form">
        <label class="mono dim" for="bootName" style="font-size:10px; letter-spacing:2px">WIE SOLL ICH DICH NENNEN?</label>
        <input type="text" class="form-input" id="bootName" maxlength="30" placeholder="Dein Name" autocomplete="off">
        <button type="button" class="hud-btn primary" id="bootStart">SYSTEM STARTEN</button>
        <div class="mono dim" style="font-size:10px; letter-spacing:1px">
          STANDORT FÜR GEBETSZEITEN KANNST DU SPÄTER ÜBER ☾ AKTIVIEREN
        </div>
      </div>`;
    const submit = () => {
      const name = el('bootName').value.trim().slice(0, 30);
      if (!name) { el('bootName').focus(); return; }
      update((st) => { st.profile.name = name; });
      finish();
    };
    el('bootStart').addEventListener('click', submit);
    el('bootName').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => el('bootName').focus(), 400);
  } else {
    /* ── Erster Start des Tages: Animation + Übersicht ── */
    const open = todayTasks().filter((t) => t.status !== 'done').length;
    const nextPrayer = prayerTimes.listFor(today).find((p) => {
      const [h, m] = p.time.split(':').map(Number);
      const now = new Date();
      return h * 60 + m > now.getHours() * 60 + now.getMinutes();
    });
    const p = getState().player;

    el('bootContent').innerHTML = `
      <div class="boot-ring"><div class="boot-core"></div></div>
      <div class="boot-line">SYSTEM ONLINE</div>
      <div class="boot-welcome">Willkommen zurück, ${esc(getState().profile.name)}</div>
      <div class="boot-stats">
        <span>◈ ${open} AUFGABE${open === 1 ? '' : 'N'} HEUTE</span>
        ${nextPrayer ? `<span style="color:var(--prayer)">☾ ${esc(nextPrayer.name)} ${nextPrayer.time}</span>` : ''}
        <span>⚡ STREAK ${getState().streak.count || 0}</span>
        <span>RANG ${rankForLevel(p.level)} · LVL ${p.level}</span>
      </div>
      <div class="mono dim boot-skip">KLICKEN ODER TASTE DRÜCKEN ZUM STARTEN</div>`;

    // Auto-Weiter nach 2,4s – oder sofort per Klick/Taste
    const auto = setTimeout(finish, 2400);
    const skip = () => { clearTimeout(auto); finish(); };
    screen.addEventListener('click', skip, { once: true });
    document.addEventListener('keydown', skip, { once: true });
  }
}
