import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

globalThis.crypto ??= webcrypto;
globalThis.localStorage = new MemoryStorage();

const stateModule = await import('../js/state.js');
const taskModule = await import('../js/tasks.js');

const {
  getState,
  importStateJson,
  restoreAutomaticBackup,
  todayISO,
} = stateModule;
const { rolloverRecurring, setDueDate } = taskModule;

function baseTask(overrides = {}) {
  return {
    id: globalThis.crypto.randomUUID(),
    title: 'Testaufgabe',
    difficulty: 'medium',
    priority: 'normal',
    status: 'open',
    groupId: null,
    subtasks: [],
    notes: '',
    dueDate: todayISO(),
    dueTime: null,
    plan: null,
    done: false,
    doneAt: null,
    createdAt: Date.now(),
    recur: null,
    ...overrides,
  };
}

test('wiederkehrende erledigte Aufgaben werden vollständig geöffnet', () => {
  const task = baseTask({
    status: 'done',
    done: true,
    doneAt: Date.now(),
    dueDate: '2020-01-01',
    recur: 'daily',
  });
  importStateJson({ tasks: [task] });

  rolloverRecurring();

  const updated = getState().tasks[0];
  assert.equal(updated.dueDate, todayISO());
  assert.equal(updated.status, 'open');
  assert.equal(updated.done, false);
  assert.equal(updated.doneAt, null);
});

test('Verschieben zur Pinnwand entfernt Erledigt-Status und Zeitblock', () => {
  const task = baseTask({
    status: 'done',
    done: true,
    doneAt: Date.now(),
    plan: { start: '10:00', durationMin: 60 },
  });
  importStateJson({ tasks: [task] });

  setDueDate(task.id, null);

  const updated = getState().tasks[0];
  assert.equal(updated.dueDate, null);
  assert.equal(updated.plan, null);
  assert.equal(updated.status, 'open');
  assert.equal(updated.done, false);
  assert.equal(updated.doneAt, null);
});

test('Import normalisiert Status und reduziert Koordinatengenauigkeit', () => {
  importStateJson({
    settings: {
      coords: { lat: 51.123456, lon: 7.987654 },
      prayerEnabled: true,
    },
    tasks: [baseTask({ status: 'done', done: false, doneAt: null })],
  });

  assert.deepEqual(getState().settings.coords, { lat: 51.123, lon: 7.988 });
  assert.equal(getState().tasks[0].done, true);
  assert.equal(getState().tasks[0].status, 'done');
  assert.equal(typeof getState().tasks[0].doneAt, 'number');
});

test('automatische Rückfallkopie stellt den vorherigen Datenstand wieder her', () => {
  importStateJson({ tasks: [baseTask({ title: 'Stand A' })] });
  importStateJson({ tasks: [baseTask({ title: 'Stand B' })] });

  assert.equal(getState().tasks[0].title, 'Stand B');
  assert.equal(restoreAutomaticBackup(), true);
  assert.equal(getState().tasks[0].title, 'Stand A');
});

test('Import verwirft unsichere IDs, Farben und Cache-Inhalte', () => {
  importStateJson({
    tasks: [baseTask({ id: '\"><img src=x onerror=alert(1)>', groupId: '" onmouseover="x' })],
    groups: [{ id: 'safe_group', name: 'Sicher', color: 'red; background:url(javascript:x)' }],
    events: [{ id: 'safe_event', title: 'Termin', date: todayISO(), start: '10:00', color: 'javascript:x' }],
    prayerCache: {
      [todayISO()]: [
        { name: '<img src=x>', time: '<svg/onload=alert(1)>' },
        { name: 'Fajr', time: '05:30' },
      ],
    },
    prayerAdopted: { [todayISO()]: ['Fajr', '<script>'] },
  });

  const state = getState();
  assert.match(state.tasks[0].id, /^[A-Za-z0-9_-]+$/);
  assert.equal(state.tasks[0].groupId, null);
  assert.equal(state.groups[0].color, '#5FE3FF');
  assert.equal(state.events[0].color, 'cyan');
  assert.deepEqual(state.prayerCache[todayISO()], [{ name: 'Fajr', time: '05:30' }]);
  assert.deepEqual(state.prayerAdopted[todayISO()], ['Fajr']);
});
