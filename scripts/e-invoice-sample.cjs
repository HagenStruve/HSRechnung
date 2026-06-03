const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createEInvoiceXmlFile } = require("../lib/e-invoice.cjs");
const { createFacturXPdf } = require("../lib/facturx-pdf.cjs");
const { createHsrechnungCarrierPdf } = require("./hsrechnung-carrier-pdf.cjs");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "data", "pdfs");

const sampleInvoice = {
  companyName: "Hof Struve Lohnunternehmen",
  companyAddress: "Dorfstrasse 1\n12345 Musterort",
  companyEmail: "rechnung@example.test",
  companyPhone: "+49 123 456789",
  companyBankName: "Musterbank",
  companyIban: "DE02120300000000202051",
  companyBic: "BYLADEM1001",
  companyTaxNumber: "12/345/67890",
  companyVatId: "DE123456789",
  companyTaxCategory: "standard",
  customerName: "Max Mustermann GmbH",
  customerAddress: "Hauptstrasse 10\n12345 Berlin",
  customerEmail: "info@example.test",
  invoiceNumber: "RE-2026-SAMPLE",
  invoiceDate: "2026-06-02",
  dueDate: "2026-06-16",
  taxRate: 19,
  notes: "Vielen Dank fuer Ihren Auftrag.",
  items: [
    {
      id: "line-1",
      description: "Baggerarbeiten",
      serviceDate: "2026-06-01",
      quantity: 2,
      unit: "h",
      unitPrice: 85,
      priceMode: "net",
    },
  ],
};

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "e-invoice-sample-"));

  const xml = await createEInvoiceXmlFile(sampleInvoice, tempDir);
  if (!xml.success) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    console.log(`Beispiel-XML konnte nicht erzeugt werden: ${xml.missingFields.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  try {
    const sourcePdfPath = path.join(tempDir, "sample-source.pdf");
    const outputFilePath = path.join(OUTPUT_DIR, "Rechnung_RE-2026-SAMPLE_Max-Mustermann-GmbH_2026-06-02.pdf");
    await createHsrechnungCarrierPdf(sampleInvoice, sourcePdfPath, tempDir);

    const pdf = await createFacturXPdf({
      invoice: sampleInvoice,
      sourcePdfPath,
      xmlPath: xml.filePath,
      outputFilePath,
      baseDir: ROOT_DIR,
    });

    if (!pdf.success) {
      console.log(`Beispiel-Factur-X-PDF nicht erzeugt: ${pdf.reason}`);
      if (pdf.skipped) console.log("Mustang CLI installieren oder MUSTANG_CLI_JAR setzen.");
      process.exitCode = pdf.skipped ? 0 : 1;
      return;
    }

    console.log(`Beispiel-Factur-X-PDF: ${path.relative(ROOT_DIR, pdf.filePath)}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
