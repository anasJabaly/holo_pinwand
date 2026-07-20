# Holo-Pinnwand

Eine lokale, gamifizierte Aufgabenverwaltung mit Pinnwand, Tagesplaner, Wochen- und Monatsansicht, Gruppen, XP-System, Terminen und optionalen Gebetszeiten.

## Neu in Version 4

- Konsistente Aufgabenstatus bei wiederkehrenden Aufgaben und beim Verschieben zur Pinnwand
- Validierung und automatische Migration gespeicherter Daten
- Automatische Rückfallkopie vor Änderungen
- JSON-Export, JSON-Import, Wiederherstellung und vollständiges Zurücksetzen
- Gerundete Standortkoordinaten und vollständiges Löschen aller Standortdaten
- Robuster Abruf der Gebetszeiten mit HTTP-Prüfung und Zeitlimit
- Barrierefreie Dialoge mit Fokussteuerung, Fokusfalle und Escape-Taste
- Verbesserte mobile Darstellung und Unterstützung für reduzierte Animationen
- Installierbare PWA mit lokalem Offline-Cache
- Automatische Tests und GitHub-Actions-Qualitätsprüfung

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm run dev
```

Danach im Browser öffnen:

```text
http://127.0.0.1:4173
```

Die Anwendung benötigt keine npm-Abhängigkeiten und kann grundsätzlich auch direkt über `index.html` geöffnet werden. Für Service Worker, Offline-Cache und Installation als PWA ist jedoch ein lokaler Webserver oder HTTPS erforderlich.

## Prüfungen ausführen

```bash
npm run verify
```

Dabei werden alle JavaScript-Dateien syntaktisch geprüft, JSON- und Manifest-Dateien validiert, doppelte HTML-IDs gesucht und die automatisierten Tests ausgeführt.

Einzelne Befehle:

```bash
npm run check
npm test
```

## Datensicherung

Über die Schaltfläche **⇩** in der Navigation lassen sich alle lokalen Daten als JSON-Datei exportieren und später wieder importieren.

Vor jedem geänderten Speicherstand legt die App die vorherige Version als lokale Rückfallkopie ab. Diese Kopie ist kein Ersatz für einen exportierten Download, da Browserdaten durch Bereinigung, Profilwechsel oder Geräteverlust verschwinden können.

Beim vollständigen Zurücksetzen werden auch die Rückfallkopie und gespeicherte Standortdaten gelöscht.

## Standort und Gebetszeiten

Die Gebetszeiten sind optional. Bei Aktivierung werden Koordinaten auf drei Nachkommastellen gerundet, lokal gespeichert und für die Berechnung an die Aladhan-API gesendet. Über den Gebetszeiten-Dialog können Koordinaten, Cache und übernommene Gebetsblöcke vollständig gelöscht werden.

## Benachrichtigungen

Erinnerungen werden zehn Minuten vor einem geplanten Aufgabenblock ausgelöst. Browser und Betriebssystem dürfen Hintergrundseiten jedoch drosseln oder schließen. Ohne einen Push-Dienst mit Server sind Erinnerungen deshalb am zuverlässigsten, solange die App geöffnet oder als installierte PWA aktiv ist.

## Projektstruktur

```text
.
├── css/                    Darstellung und responsive Regeln
├── icons/                  PWA-Symbole
├── js/
│   ├── app.js              Boot und Event-Wiring
│   ├── data-management.js  Export, Import und Wiederherstellung
│   ├── dialogs.js          Barrierefreie Dialogsteuerung
│   ├── integrations.js     Gebetszeiten und Benachrichtigungen
│   ├── state.js            Zustand, Migration, Validierung und Persistenz
│   └── ...                 Aufgaben, Kalender, Gruppen und UI
├── scripts/                Entwicklungsserver und Qualitätsprüfung
├── tests/                  Automatisierte Tests
├── manifest.webmanifest    PWA-Metadaten
└── sw.js                   Offline-Cache und Notification-Handling
```

## Architekturhinweis

Version 4 bleibt bewusst eine lokale PWA ohne Benutzerkonto und ohne Cloud-Synchronisierung. Für geräteübergreifende Synchronisierung wären als nächster Schritt ein authentifiziertes Backend und eine Datenbank nötig, beispielsweise Node.js/Fastify mit PostgreSQL. Dieser Schritt sollte zusammen mit Hosting, Datenschutz, Konfliktauflösung und Account-Wiederherstellung geplant werden, statt ein unsicheres Teil-Backend in die lokale App einzubauen.
