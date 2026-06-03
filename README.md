# HSRechnung lokal starten

Dieses Projekt ist eine Vite/React-App mit einem kleinen lokalen Node-Backend fuer die Datenspeicherung im Projektordner. `index.html` sollte nicht per Doppelklick direkt aus dem Dateisystem geoeffnet werden.

## Start

```bash
npm install
npm run dev
```

Danach im Browser oeffnen:

```text
http://127.0.0.1:5173
```

Unter Windows kann alternativ `START_APP.bat` per Doppelklick gestartet werden. Das Fenster muss offen bleiben, solange die App genutzt wird.

## App-Icon fuer Windows-Verknuepfung

Im Projektordner liegen zwei Icon-Dateien fuer Windows:

```text
app.ico
HSRechnung.ico
```

So nutzt du das Icon fuer eine Desktop-Verknuepfung:

1. Rechtsklick auf die Verknuepfung zu `START_APP.bat`.
2. `Eigenschaften` oeffnen.
3. `Anderes Symbol...` waehlen.
4. Die Datei `HSRechnung.ico` aus diesem Projektordner auswaehlen.
5. Mit `OK` bestaetigen.

Das Browser-Favicon und das PWA/Icon der App liegen unter:

```text
public/favicon.ico
public/brand/hsrechnung-icon.svg
public/brand/hsrechnung-logo.svg
```

## Datenspeicherung

Die App speichert den kompletten lokalen App-Stand ueber das Node-Backend in:

```text
data/invoices.json
```

Vor jedem Schreibvorgang wird die vorherige Datei als Backup abgelegt:

```text
data/invoices.json.bak
```

IndexedDB im Browser bleibt als Fallback und als Migrationsquelle fuer alte lokale Daten erhalten. Reines Browser-JavaScript kann nicht sicher direkt in den Projektordner schreiben, deshalb startet `npm run dev` sowohl Vite als auch die lokale Speicher-API.

## E-Rechnung

Beim lokalen Speichern einer PDF erzeugt die App die fertige Rechnung direkt als valide Factur-X/ZUGFeRD-Hybrid-PDF mit eingebetteter `factur-x.xml`:

```text
data/pdfs/Rechnung_RE-xxxxx_Kunde_Datum.pdf
```

Diese Datei ist die Hauptdatei fuer Nutzer, Kunden und spaeter MaschinenLog. Sie nutzt das sichtbare HSRechnung-Layout der Rechnungsvorschau und enthaelt die E-Rechnungsdaten unsichtbar als eingebettete `factur-x.xml`. Der Export wird nur als erfolgreich gemeldet, wenn die finale PDF Mustang-valid ist. Technische XML- und Quell-PDF-Zwischenprodukte werden temporaer erzeugt und nach erfolgreicher Erstellung geloescht.

Lokale Voraussetzung:

```text
Java im PATH
JDK/javac im PATH
tools/Mustang-CLI-2.23.1.jar
```

Alternativ kann der Pfad zur JAR per Umgebungsvariable gesetzt werden:

```bash
MUSTANG_CLI_JAR=C:\pfad\zu\Mustang-CLI-2.23.1.jar
```

Beispielrechnung erzeugen und pruefen:

```bash
npm run sample:e-invoice
npm run validate:e-invoice
```

Das Validierungsscript prueft die zuletzt erzeugte finale Rechnung in `data/pdfs/` und gibt aus, ob `factur-x.xml` eingebettet ist, welche PDF/A-3-Variante erkannt wurde, ob das HSRechnung-Layout sichtbar ist und ob Mustang 0 Fehler meldet.

Fuer valide EN16931-Rechnungen muessen im Firmenprofil mindestens diese Daten gepflegt sein:

- Firmenname
- vollstaendige Adresse
- E-Mail
- IBAN
- Steuernummer oder USt-IdNr. als Verkaeuferkennung

Details zu Installation, Validierung und offenen Grenzen stehen in `TECHNICAL_NOTES.md`.

## Backup

Fuer ein Backup den Ordner `data/` kopieren, insbesondere:

```text
data/invoices.json
data/invoices.json.bak
```

Diese Dateien nicht loeschen, wenn die gespeicherten Rechnungen erhalten bleiben sollen. Zusaetzlich kann in der App weiterhin der JSON-Export genutzt werden.

## Build

```bash
npm run build
```

Der fertige Build liegt danach in `dist/`. Fuer die Projektordner-Speicherung muss die lokale API (`node server.cjs`) laufen; im normalen Entwicklungsbetrieb erledigt das `npm run dev`.

## Ursache der weissen Seite

Die App laedt in `index.html` ein ES-Modul ueber `/src/main.jsx`. Das funktioniert mit Vite ueber einen lokalen HTTP-Server, aber nicht zuverlaessig beim direkten Oeffnen per `file://`.
