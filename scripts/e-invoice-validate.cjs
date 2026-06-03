const fs = require("node:fs/promises");
const path = require("node:path");
const {
  getMustangAvailability,
  hasEmbeddedFacturXXml,
  inspectFacturXPdf,
  validateWithMustang,
} = require("../lib/facturx-pdf.cjs");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_DIR = path.join(ROOT_DIR, "data", "pdfs");

async function findLatestFacturXPdf() {
  const files = await fs.readdir(DEFAULT_DIR).catch(() => []);
  const entries = [];

  for (const fileName of files) {
    if (!/^Rechnung_.*\.pdf$/iu.test(fileName)) continue;
    const filePath = path.join(DEFAULT_DIR, fileName);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat?.isFile()) entries.push({ filePath, mtimeMs: stat.mtimeMs });
  }

  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries[0]?.filePath || "";
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : await findLatestFacturXPdf();
  if (!inputPath) {
    console.log("Keine Factur-X-PDF gefunden. Erzeuge zuerst eine Rechnung mit lokalem PDF-Export.");
    console.log(`Gesucht wurde in: ${path.relative(ROOT_DIR, DEFAULT_DIR)}`);
    process.exitCode = 2;
    return;
  }

  const exists = await fs.stat(inputPath).then((stat) => stat.isFile()).catch(() => false);
  if (!exists) {
    console.log(`Datei nicht gefunden: ${inputPath}`);
    process.exitCode = 2;
    return;
  }

  const embedded = await hasEmbeddedFacturXXml(inputPath, { baseDir: ROOT_DIR });
  const inspection = await inspectFacturXPdf(inputPath, { baseDir: ROOT_DIR });
  console.log(`Datei: ${path.relative(ROOT_DIR, inputPath) || inputPath}`);
  console.log(`factur-x.xml eingebettet: ${embedded ? "ja" : "nein"}`);
  console.log(`PDF/A-Version: ${inspection.pdfaVersion || "nicht erkannt"}`);
  console.log(`Seitenanzahl: ${inspection.pageCount}`);
  console.log(`Attachments: ${inspection.embeddedFileNames.join(", ") || "keine"}`);
  console.log(`Sichtbares HSRechnung-Layout: ${inspection.hasHsrechnungLayout ? "ja" : "nein"}`);
  console.log(`Technische Mustang-Datenseite sichtbar: ${inspection.hasMustangDataPage ? "ja" : "nein"}`);

  const availability = await getMustangAvailability(ROOT_DIR);
  if (!availability.available) {
    console.log(`Mustang-Validierung: uebersprungen (${availability.reason})`);
    process.exitCode = embedded ? 0 : 1;
    return;
  }

  const validation = await validateWithMustang(inputPath, { baseDir: ROOT_DIR });
  console.log(`Mustang-Validierung: ${validation.valid ? "valid" : "invalid"}`);
  console.log(`Mustang-Fehleranzahl: ${validation.summary?.errorCount ?? "unbekannt"}`);
  console.log(`Profil: ${inspection.profile || "nicht erkannt"}`);
  if (!validation.valid && validation.output) {
    const summary = validation.summary?.finalStatus ? `<summary status="${validation.summary.finalStatus}"/>` : validation.reason;
    console.log(`Mustang-Ergebnis: ${summary}`);
  }

  process.exitCode = embedded && validation.valid ? 0 : 1;
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
