# Holo-Pinnwand

Persönlicher Tagesplaner im HUD-Stil. Vanilla JS, keine Frameworks, keine Build-Tools.

## Lokal starten
ES-Module laufen nicht per Doppelklick (Browser blockt `file://`). Mini-Server nötig:

```bash
cd holo-pinnwand
python3 -m http.server 8000
# → http://localhost:8000
```

## Deploy (Cloudflare Pages)
Repo pushen → Pages-Projekt → Build command leer, Output-Verzeichnis `/`. Fertig.

## Daten & Sync
Alles liegt lokal im Browser (`localStorage`). Kein Server, keine Konten.
Die Sync-Schicht (`js/sync.js`) ist als Adapter gebaut: aktuell `local`, später
lässt sich Supabase einstecken, ohne die App umzuschreiben.

## Screensaver-Modus (Ambient)
Große Uhr + nächste Aufgabe + nächstes Gebet, im Vollbild.

- In der App: **⋯ MEHR → ◱ SCREENSAVER-MODUS** (Esc oder Klick beendet)
- Direktstart über URL: `…/index.html?ambient=1`

### Als echter Linux-Bildschirmschoner (Cinnamon / Linux Mint)
Ein Web-Tab kann nicht selbst „Bildschirmschoner werden". Der saubere Weg:
Chromium im Kiosk-Vollbild auf die `?ambient=1`-Seite starten, wenn der Rechner
idle ist. Zwei Varianten:

**A) Schnell testen (Kiosk-Vollbild):**
```bash
chromium --kiosk "http://localhost:8000/index.html?ambient=1"
# oder mit deiner deployten URL:
chromium --kiosk "https://pinnwand.anas-jabaly.de/?ambient=1"
```

**B) Automatisch bei Inaktivität (xss-lock + eigenes Skript):**
```bash
# 1) Skript anlegen: ~/holo-saver.sh
#!/usr/bin/env bash
chromium --kiosk --incognito "https://pinnwand.anas-jabaly.de/?ambient=1" &
CHROME_PID=$!
# Warten bis der Sperr-Trigger endet, dann Chromium schließen:
wait
kill $CHROME_PID 2>/dev/null

# 2) ausführbar machen
chmod +x ~/holo-saver.sh

# 3) bei Inaktivität auslösen (xss-lock reagiert auf systemd-idle/Sperre)
sudo apt install xss-lock
xss-lock -- ~/holo-saver.sh &
```
Idle-Zeit stellst du in Cinnamon unter *Systemeinstellungen → Bildschirmschoner*
bzw. per `xset s <sekunden>` ein. Für Autostart das `xss-lock …` in die
*Startprogramme* aufnehmen.

> Hinweis: Da die App offline-fähig im Browser-Cache liegt, funktioniert der
> Ambient-Modus auch ohne Internet — nur die Gebetszeiten brauchen beim ersten
> Abruf des Tages eine Verbindung.

## Struktur
```
css/   base · components · layout
js/    app · state · tasks · leveling · calendar · groups · events
       dayplanner · taskdetail · startscreen · integrations · sync · ambient · ui
```
