# Technische Notizen: E-Rechnung

## Aenderungen

- Die bestehende PDF-Erzeugung bleibt unveraendert: `server.cjs` baut weiter HTML und erzeugt daraus per lokalem Edge/Chrome eine PDF in `data/pdfs/`.
- Beim lokalen PDF-Speichern wird zusaetzlich ein E-Rechnungs-XML-Sidecar in `data/e-invoices/` erzeugt.
- Die E-Rechnungslogik liegt getrennt in `lib/e-invoice.cjs`:
  - Normalisierung der Rechnungsdaten
  - Pflichtfeldvalidierung
  - Summenberechnung
  - Factur-X/CrossIndustryInvoice-XML-Erzeugung
- Im bestehenden Firmendatenbereich wurde minimal das Feld `Steuerart` ergaenzt. Es nutzt den vorhandenen Stil und veraendert den Workflow nicht.

## Format

Erzeugt wird eine XML-Datei im Stil von Factur-X/ZUGFeRD auf Basis von CrossIndustryInvoice und EN16931-Datenfeldern. Die Datei heisst im Standardkontext `factur-x.xml`, wird lokal aber mit rechnungsspezifischem Dateinamen als Sidecar abgelegt.

Aktuell werden unter anderem abgebildet:

- Rechnungsaussteller und Rechnungsempfaenger
- Rechnungsnummer, Rechnungsdatum und Faelligkeit
- Leistungsdatum je Position
- Positionen mit Beschreibung, Menge, Einheit, Einzelpreis, Steuersatz und Nettobetrag
- Netto-, Steuer- und Bruttosummen
- Zahlungsdaten mit IBAN und optional BIC
- Steuerarten: Regelsteuer, ermaessigt, 0 %, Kleinunternehmer, steuerfrei, vorbereitet fuer Landwirtschaft Paragraph 24

## Bibliothek

Es wurde bewusst keine neue npm-Abhaengigkeit eingebaut. Fuer Node.js gibt es keine breit etablierte, leichtgewichtige Bibliothek, die in diesem Stack zuverlaessig PDF/A-3-Konvertierung plus Factur-X-Embedding und Validierung abdeckt.

Die aktuelle Architektur haelt die Generatorlogik vendor-neutral. Fuer eine produktive Validierung oder PDF/A-3-Einbettung kann spaeter ein externer lokaler Prozess angeschlossen werden, zum Beispiel Mustangproject als CLI/Service. Das passt besser fuer MaschinenLog, weil Mustangproject bereits auf ZUGFeRD/Factur-X spezialisiert ist und lokal ohne Cloud-Verarbeitung betrieben werden kann.

## Noch offen fuer vollstaendige Validitaet

- Die XML-Datei ist vorbereitet, aber noch nicht extern gegen EN16931/ZUGFeRD validiert.
- Die PDF ist weiterhin eine normale Browser-PDF, noch kein PDF/A-3.
- Das XML wird noch nicht in die PDF eingebettet.
- Die aktuelle App nutzt einen globalen Steuersatz pro Rechnung. Das XML schreibt diesen je Position aus. Gemischte Rechnungen mit mehreren Steuersaetzen pro Position sollten vor produktiver Nutzung im Datenmodell erweitert werden.
- Fuer steuerfreie Sonderfaelle koennen je nach Geschaeftsfall weitere Codes/Begruendungen notwendig sein.

## Uebernahme nach MaschinenLog

Die uebertragbaren Teile sind:

- `lib/e-invoice.cjs` als fachliche Generator- und Validierungsschicht
- die Pflichtfeldvalidierung vor dem Export
- der Sidecar-Export als Zwischenstufe
- spaeter ein Adapter, der statt Sidecar eine Mustangproject-CLI oder einen lokalen Service aufruft

Wichtig ist, das Rechnungsmodell in MaschinenLog getrennt von UI-Komponenten zu halten und steuerliche Sonderfaelle nicht hart zu verdrahten. Die Generatorfunktionen nehmen reine Rechnungsdaten entgegen und schreiben keine Rechnungsdaten in Logs.
