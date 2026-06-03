# Technische Notizen: E-Rechnung

## Aktueller Stand

- Die bestehende PDF-Erzeugung bleibt erhalten: `server.cjs` erzeugt weiter die bisherige PDF in `data/pdfs/`.
- Zusaetzlich erzeugt die App eine Factur-X/ZUGFeRD-XML-Datei in `data/e-invoices/`.
- Wenn Mustang CLI lokal verfuegbar ist, erzeugt die App eine finale Hybrid-PDF:

```text
data/e-invoices/Rechnung_RE-xxxxx_factur-x.pdf
```

- Diese finale PDF enthaelt `factur-x.xml` als eingebettete Datei.
- Die App meldet die finale Factur-X-PDF nur als erfolgreich, wenn Mustang-Validierung bestanden wurde.
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
data/e-invoices/Rechnung_<Rechnungsnummer>_factur-x.pdf
```

Technische Zwischenprodukte:

- `data/pdfs/Rechnung_...pdf`: bisherige normale PDF im HSRechnung-Layout
- `data/e-invoices/Rechnung_...xml`: erzeugtes CII/XML vor der Einbettung

Diese Zwischenprodukte koennen fuer Diagnose und Support nuetzlich sein, sind aber nicht die finale E-Rechnung.

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

1. Bestehende Browser-PDF nach `data/pdfs/` schreiben.
2. Factur-X/CII-XML nach `data/e-invoices/` schreiben.
3. Mit Mustang versuchen, die vorhandene PDF mit `factur-x.xml` zu kombinieren.
4. Wenn die vorhandene Browser-PDF nicht als PDF/A-Quelle geeignet ist, erzeugt Mustang eine PDF/A-3u-Ausgabe aus XML und kombiniert diese.
5. Mustang validiert die finale `_factur-x.pdf`.

Der originale PDF-Export bleibt dadurch erhalten. Die finale E-Rechnung liegt separat in `data/e-invoices/`.

Aktueller Layout-Stand:

- Wenn Mustang die bestehende HSRechnung-PDF direkt als PDF/A-kompatible Quelle akzeptiert, bleibt das HSRechnung-Layout der sichtbare PDF-Teil.
- Wenn Mustang die bestehende Browser-PDF nicht kombinieren kann, wird die finale validierte Factur-X-PDF mit Mustang-Layout erzeugt.
- In der aktuellen lokalen Beispielvalidierung wurde das Mustang-Layout verwendet. Grund: die Browser-PDF ist keine zuverlaessige PDF/A-Quelle fuer Mustang `combine`. Die normale HSRechnung-PDF bleibt separat erhalten.

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
node scripts/e-invoice-validate.cjs data/e-invoices/Rechnung_RE-2026-SAMPLE_factur-x.pdf
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
- Wenn die vorhandene Browser-PDF nicht PDF/A-tauglich kombinierbar ist, verwendet der Adapter eine von Mustang erzeugte PDF/A-3u-Visualisierung als finale Factur-X-PDF. Die bisherige PDF bleibt unveraendert separat erhalten.

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
