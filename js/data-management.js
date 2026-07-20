import {
  exportStateJson,
  getState,
  hasAutomaticBackup,
  importStateJson,
  resetState,
  restoreAutomaticBackup,
  todayISO,
} from './state.js';
import { closeDialog, openDialog } from './dialogs.js';
import { toast } from './ui.js';

const el = (id) => document.getElementById(id);

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderSummary() {
  const state = getState();
  el('dataSummary').textContent = [
    `${state.tasks.length} Aufgaben`,
    `${state.events.length} Termine`,
    `${state.groups.length} Gruppen`,
    hasAutomaticBackup() ? 'Rückfallkopie vorhanden' : 'Noch keine Rückfallkopie',
  ].join(' · ');
  el('dataRestoreBtn').disabled = !hasAutomaticBackup();
}

export function initDataManagement() {
  el('dataBtn').addEventListener('click', () => {
    renderSummary();
    openDialog('dataOverlay', { focus: '#dataExportBtn' });
  });
  el('dataClose').addEventListener('click', () => closeDialog('dataOverlay'));
  el('dataOverlay').addEventListener('click', (event) => {
    if (event.target === el('dataOverlay')) closeDialog('dataOverlay');
  });

  el('dataExportBtn').addEventListener('click', () => {
    downloadText(`holo-pinnwand-backup-${todayISO()}.json`, exportStateJson());
    toast('BACKUP EXPORTIERT ✓');
    renderSummary();
  });

  el('dataImportBtn').addEventListener('click', () => el('dataImportInput').click());
  el('dataImportInput').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    if (!confirm('Den aktuellen Datenstand durch dieses Backup ersetzen? Eine automatische Rückfallkopie wird angelegt.')) return;

    try {
      importStateJson(await file.text());
      renderSummary();
      toast('BACKUP IMPORTIERT ✓');
      closeDialog('dataOverlay');
    } catch (error) {
      console.error(error);
      toast('IMPORT FEHLGESCHLAGEN');
      alert(error.message || 'Die Backup-Datei ist ungültig.');
    }
  });

  el('dataRestoreBtn').addEventListener('click', () => {
    if (!confirm('Die letzte automatische Rückfallkopie wiederherstellen?')) return;
    try {
      const restored = restoreAutomaticBackup();
      toast(restored ? 'RÜCKFALLKOPIE WIEDERHERGESTELLT ✓' : 'KEINE RÜCKFALLKOPIE GEFUNDEN');
      renderSummary();
      if (restored) closeDialog('dataOverlay');
    } catch (error) {
      console.error(error);
      toast('WIEDERHERSTELLUNG FEHLGESCHLAGEN');
    }
  });

  el('dataResetBtn').addEventListener('click', () => {
    const accepted = confirm('Wirklich ALLE Aufgaben, Termine, Gruppen, XP- und Standortdaten löschen?');
    if (!accepted) return;
    resetState();
    renderSummary();
    closeDialog('dataOverlay');
    toast('APP-DATEN ZURÜCKGESETZT');
  });
}
