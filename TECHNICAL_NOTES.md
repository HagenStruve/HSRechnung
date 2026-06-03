# Technische Notizen: E-Rechnung

## Aktueller Stand

- `server.cjs` erzeugt die fertige Nutzerdatei direkt als valide Factur-X/ZUGFeRD-Hybrid-PDF.
- Die finale Datei liegt unter dem normalen Rechnungsnamen:

```text
data/pdfs/Rechnung_RE-xxxxx_Kunde_Datum.pdf
```

- Diese finale PDF enthaelt `factur-x.xml` als eingebettete Datei.
- Die App meldet den Export nur als erfolgreich, wenn Mustang-Validierung bestanden wurde.
- XML und Browser-Quell-PDF werden temporaer erzeugt und nach erfolgreicher Erstellung geloescht.
- Der vorherige BR-CO-26-Fehler ist behoben: `SellerTradeParty/ram:ID` wird aus USt-IdNr. oder Steuernummer gesetzt. Zusaetzlich werden USt-IdNr. (`schemeID="VA"`) und Steuernummer (`schemeID="FC"`) als TaxRegistration ausgegeben, wenn vorhanden.

## Architektur

- `lib/e-invoice.cjs`
  - normalisiert Rechnungsdaten
  - validiert Pflichtfelder
  - erzeugt CrossIndustryInvoice-XML fuer EN16931
- `lib/facturx-pdf.cjs`
  - findet Mustang CLI ueber `MUSTANG_CLI_JAR`, `MUSTANG_JAR` oder `tools/Mustang-CLI-*.jar`
  - erzeugt/kombiniert PDF und XML per Mustang
  - prueft, ob `factur-x.xml` eingebettet ist
  - startet Mustang-Validierung
- `scripts/e-invoice-validate.cjs`
  - prueft eine Factur-X-PDF auf eingebettete `factur-x.xml`
  - fuehrt Mustang-Validierung aus, wenn Mustang verfuegbar ist
- `scripts/e-invoice-sample.cjs`
  - erzeugt eine Beispielrechnung fuer lokale Tests

Die UI bleibt unveraendert bis auf das bereits vorhandene kleine Feld `Steuerart` in den Firmendaten.

## Nutzerdatei und Zwischenprodukte

Fuer Nutzer und spaeter fuer MaschinenLog ist nur diese finale Datei relevant:

```text
data/pdfs/Rechnung_<Rechnungsnummer>_<Kunde>_<Datum>.pdf
```

Technische Zwischenprodukte:

- Browser-Quell-PDF im HSRechnung-Layout: temporaer im System-Temp-Ordner
- CII/XML vor der Einbettung: temporaer im System-Temp-Ordner

Diese Zwischenprodukte werden im normalen Exportfluss nach erfolgreicher Erstellung geloescht. Im Nutzerordner `data/pdfs/` soll nur die fertige E-Rechnungs-PDF sichtbar sein.

## Lokale Einrichtung

Java muss im PATH liegen:

```bash
java -version
```

Mustang CLI wird nicht als npm-Abhaengigkeit installiert. Empfohlen ist die lokale JAR:

```text
tools/Mustang-CLI-2.23.1.jar
```

Downloadquelle:

```text
https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/2.23.1/Mustang-CLI-2.23.1.jar
```

Alternativ:

```bash
MUSTANG_CLI_JAR=C:\pfad\zu\Mustang-CLI-2.23.1.jar
```

JAR-Dateien unter `tools/` sind per `.gitignore` ausgeschlossen.

## Erzeugung

Beim Button `PDF lokal speichern` passiert serverseitig:

1. Bestehende Browser-PDF temporaer im HSRechnung-Layout erzeugen.
2. Factur-X/CII-XML temporaer erzeugen.
3. Mit Mustang versuchen, die temporaere HSRechnung-PDF mit `factur-x.xml` zu kombinieren.
4. Wenn die vorhandene Browser-PDF nicht als PDF/A-Quelle geeignet ist, erzeugt Mustang eine PDF/A-3u-Ausgabe aus XML und kombiniert diese.
5. Mustang validiert die finale PDF.
6. Nur die validierte finale PDF wird in `data/pdfs/` unter dem normalen Rechnungsnamen gespeichert.

Wenn die finale PDF nicht validiert werden kann, gilt der Export als fehlgeschlagen.

Aktueller Layout-Stand:

- Wenn Mustang die bestehende HSRechnung-PDF direkt als PDF/A-kompatible Quelle akzeptiert, bleibt das HSRechnung-Layout der sichtbare PDF-Teil.
- Wenn Mustang die bestehende Browser-PDF nicht kombinieren kann, wird die finale validierte Factur-X-PDF mit Mustang-Layout erzeugt.
- In der aktuellen lokalen Beispielvalidierung wurde das Mustang-Layout verwendet. Grund: die Browser-PDF ist keine zuverlaessige PDF/A-Quelle fuer Mustang `combine`. Damit der Nutzer trotzdem genau eine valide Datei bekommt, wird das Mustang-Layout als finale Nutzer-PDF unter dem normalen Rechnungsnamen gespeichert.

## Pruefen

Beispielrechnung erzeugen:

```bash
npm run sample:e-invoice
```

Neueste Factur-X-PDF pruefen:

```bash
npm run validate:e-invoice
```

Bestimmte Datei pruefen:

```bash
node scripts/e-invoice-validate.cjs data/pdfs/Rechnung_RE-2026-SAMPLE_Max-Mustermann-GmbH_2026-06-02.pdf
```

Das Script gibt aus:

- ob `factur-x.xml` eingebettet ist
- ob Mustang-Validierung verfuegbar ist
- ob Mustang die PDF als `valid` bewertet

Wenn Mustang fehlt, wird die Mustang-Validierung klar als uebersprungen gemeldet. Dann darf die Datei nicht als validierte E-Rechnung behauptet werden.

## Validierung in dieser Arbeitsumgebung

In dieser Umgebung wurde Mustang CLI 2.23.1 lokal unter `tools/Mustang-CLI-2.23.1.jar` bereitgestellt.

Ausgefuehrt:

```bash
npm test
npm run sample:e-invoice
npm run validate:e-invoice
```

Ergebnis des Validierungsscripts fuer die Beispielrechnung:

```text
factur-x.xml eingebettet: ja
PDF/A-Version: PDF/A-3U
Seitenanzahl: 2
Attachments: factur-x.xml
Mustang-Validierung: valid
Mustang-Fehleranzahl: 0
Profil: urn:cen.eu:en16931:2017
```

## Steuerlogik und Grenzen

Unterstuetzt und im Modell abgebildet:

- Regelsteuer
- ermaessigt
- 0 %
- Kleinunternehmer
- steuerfrei
- vorbereitet fuer Landwirtschaft Paragraph 24

Aktuelle Grenze:

- Die App nutzt weiterhin einen globalen Steuersatz pro Rechnung. Das XML schreibt den Satz je Position aus. Fuer gemischte Rechnungen mit mehreren Steuersaetzen sollte das Datenmodell spaeter um Positions-Steuerarten erweitert werden.
- Steuerfreie Sonderfaelle koennen je nach Geschaeftsfall spezifischere VATEX-Codes benoetigen.
- Wenn die vorhandene Browser-PDF nicht PDF/A-tauglich kombinierbar ist, verwendet der Adapter eine von Mustang erzeugte PDF/A-3u-Visualisierung als finale Nutzer-PDF.

## Pflichtfelder fuer valide E-Rechnungen

Mindestens erforderlich:

- Rechnungsaussteller: Name, vollstaendige Adresse, Land DE, E-Mail
- Verkaeuferkennung: Steuernummer oder USt-IdNr.
- Rechnungsempfaenger: Name, vollstaendige Adresse, Land DE
- Rechnungsnummer
- Rechnungsdatum
- Leistungsdatum
- Positionen: Beschreibung, Menge, Einheit, Einzelpreis, Steuersatz
- Netto-, Steuer- und Bruttosummen
- Zahlungsdaten mit IBAN

Die Pflichtfeldvalidierung in `lib/e-invoice.cjs` blockiert die XML-Erzeugung, wenn die Verkaeuferkennung fehlt.

## Uebernahme nach MaschinenLog

Die uebertragbaren Teile sind:

- `lib/e-invoice.cjs` als fachliche Generator- und Validierungsschicht
- `lib/facturx-pdf.cjs` als Mustang-Adapter
- Pflichtfeldvalidierung vor dem Export
- Validierungsscript als CI- oder Support-Werkzeug

Die Generatorfunktionen nehmen reine Rechnungsdaten entgegen und schreiben keine Rechnungsdaten in Logs. Mustang wird lokal ausgefuehrt; es findet keine Cloud-Verarbeitung statt.
