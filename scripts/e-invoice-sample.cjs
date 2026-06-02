const fs = require("node:fs/promises");
const path = require("node:path");
const { createEInvoiceXmlFile } = require("../lib/e-invoice.cjs");
const { createFacturXPdf } = require("../lib/facturx-pdf.cjs");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "data", "e-invoices");

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
  const xml = await createEInvoiceXmlFile(sampleInvoice, OUTPUT_DIR);
  if (!xml.success) {
    console.log(`Beispiel-XML konnte nicht erzeugt werden: ${xml.missingFields.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const sourcePdfPath = path.join(OUTPUT_DIR, "sample-source.pdf");
  await fs.writeFile(sourcePdfPath, "%PDF-1.7\n%%EOF", "latin1");

  try {
    const pdf = await createFacturXPdf({
      invoice: sampleInvoice,
      sourcePdfPath,
      xmlPath: xml.filePath,
      outputDir: OUTPUT_DIR,
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
    await fs.rm(sourcePdfPath, { force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
