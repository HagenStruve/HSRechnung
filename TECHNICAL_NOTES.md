# Technische Notizen: E-Rechnung

## Aktueller Stand

- `server.cjs` erzeugt die fertige Nutzerdatei direkt als valide Factur-X/ZUGFeRD-Hybrid-PDF.
- Die finale Datei liegt unter dem normalen Rechnungsnamen:

```text
data/pdfs/Rechnung_RE-xxxxx_Kunde_Datum.pdf
```

- Diese finale PDF enthaelt `factur-x.xml` als eingebettete Datei.
- Die sichtbare PDF-Seite nutzt das HSRechnung-Layout der bestehenden Vorschau. Die technische Mustang-Seite `Daten der E-Rechnung` wird nicht als Nutzerrechnung verwendet.
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
  - kompiliert bei Bedarf den lokalen PDFBox-Adapter `tools/facturx/FacturXPdfBoxEmbedder.java`
  - bettet `factur-x.xml` in die vorhandene HSRechnung-PDF ein
  - setzt PDF/A-3B- und Factur-X-XMP-Metadaten
  - prueft strukturell, ob `factur-x.xml` eingebettet ist
  - startet Mustang-Validierung
- `scripts/e-invoice-validate.cjs`
  - prueft eine Factur-X-PDF auf eingebettete `factur-x.xml`
  - fuehrt Mustang-Validierung aus, wenn Mustang verfuegbar ist
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

Der PDFBox-Adapter wird aus Quellcode kompiliert. Deshalb muss neben `java` auch `javac` im PATH liegen:

```bash
javac -version
```

## Erzeugung

Beim Button `PDF lokal speichern` passiert serverseitig:

1. Bestehende Browser-PDF temporaer im HSRechnung-Layout erzeugen.
2. Factur-X/CII-XML temporaer erzeugen.
3. Der lokale PDFBox-Adapter bettet `factur-x.xml` in genau diese HSRechnung-PDF ein.
4. Der Adapter setzt PDF/A-3B- und Factur-X-XMP-Metadaten.
5. Mustang validiert die finale PDF.
6. Nur die validierte finale PDF wird in `data/pdfs/` unter dem normalen Rechnungsnamen gespeichert.

Wenn die finale PDF nicht validiert werden kann, gilt der Export als fehlgeschlagen.

Aktueller Layout-Stand:

- Das HSRechnung-Layout bleibt der sichtbare PDF-Teil.
- Die Mustang-Darstellung `Daten der E-Rechnung` wird nicht als finale Nutzerdatei erzeugt.
- Wenn die HSRechnung-Traeger-PDF nicht erfolgreich eingebettet und validiert werden kann, schlaegt der Export fehl statt auf ein anderes sichtbares Layout umzuschalten.

## Pruefen

Neueste Factur-X-PDF pruefen:

```bash
npm run validate:e-invoice
```

Bestimmte Datei pruefen:

```bash
node scripts/e-invoice-validate.cjs data/pdfs/Rechnung_RE-2026006_tester_2026-06-01.pdf
```

Das Script gibt aus:

- ob `factur-x.xml` eingebettet ist
- ob Mustang-Validierung verfuegbar ist
- ob Mustang die PDF als `valid` bewertet
- ob das HSRechnung-Layout sichtbar ist
- ob ein Sample-Layout sichtbar ist
- ob eine technische Mustang-Datenseite sichtbar ist

Wenn Mustang fehlt, wird die Mustang-Validierung klar als uebersprungen gemeldet. Dann darf die Datei nicht als validierte E-Rechnung behauptet werden.

## Validierung in dieser Arbeitsumgebung

In dieser Umgebung wurde Mustang CLI 2.23.1 lokal unter `tools/Mustang-CLI-2.23.1.jar` bereitgestellt.

Ausgefuehrt:

```bash
npm test
npm run validate:e-invoice
```

Ergebnis des Validierungsscripts fuer eine echte Nutzerrechnung:

```text
factur-x.xml eingebettet: ja
PDF/A-Version: PDF/A-3B
Seitenanzahl: 1
Attachments: factur-x.xml
Sichtbares HSRechnung-Layout: ja
Sample-Layout sichtbar: nein
Technische Mustang-Datenseite sichtbar: nein
Mustang-Validierung: valid
Mustang-Fehleranzahl: 0
Profil: EN 16931
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
- Die finale Hybrid-PDF wird als PDF/A-3B erzeugt. PDF/A-3U wird nicht erzwungen, weil das sichtbare HSRechnung-Layout aus Browser/PDFBox nicht als vollstaendig getaggtes PDF/UA-Dokument neu aufgebaut wird.

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
