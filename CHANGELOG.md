# Changelog

## 4.0.0 – Stabilität, Datenschutz und PWA

### Behoben

- Wiederkehrende Aufgaben setzen jetzt `status`, `done` und `doneAt` konsistent zurück.
- Aufgaben, die zur Pinnwand verschoben werden, verlieren korrekt Erledigt-Status und Zeitblock.
- Importierte oder ältere Daten werden normalisiert, bevor sie gespeichert oder gerendert werden.

### Neu

- Automatische lokale Rückfallkopie
- JSON-Export und -Import
- Wiederherstellung der letzten Rückfallkopie
- Vollständiges Zurücksetzen aller App-Daten
- Vollständiges Löschen von Standort, Gebetszeiten-Cache und übernommenen Gebetsblöcken
- PWA-Manifest, App-Symbole und Service Worker
- Offline-Cache für die lokale Anwendung
- Barrierefreie Dialogsteuerung mit Fokusfalle und Escape-Taste
- Mobile Layoutverbesserungen und `prefers-reduced-motion`
- Dependency-freier Entwicklungsserver
- Automatisierte Tests und GitHub-Actions-Workflow

### Sicherheit

- JSON-Import bereinigt IDs, Farben, Datums-/Zeitwerte, Quests und Gebetszeitdaten.
- Koordinaten werden auf drei Nachkommastellen reduziert.
- Gebetszeiten-API nutzt HTTP-Statusprüfung und ein Zeitlimit.
- Service-Worker-Cache verarbeitet nur Ressourcen des eigenen Origins.
