const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  createEInvoiceXmlFile,
  generateFacturXCiiXml,
  validateEInvoiceData,
} = require("../lib/e-invoice.cjs");
const {
  createFacturXPdf,
  getMustangAvailability,
  hasEmbeddedFacturXXml,
} = require("../lib/facturx-pdf.cjs");

function createSampleInvoice(overrides = {}) {
  return {
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
    invoiceNumber: "RE-2026-00001",
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
    ...overrides,
  };
}

async function main() {
  const invoice = createSampleInvoice();
  const validation = validateEInvoiceData(invoice);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.missingFields, []);

  const generated = generateFacturXCiiXml(invoice);
  assert.match(generated.xml, /<rsm:CrossIndustryInvoice/);
  assert.match(generated.xml, /<ram:ID>RE-2026-00001<\/ram:ID>/);
  assert.match(generated.xml, /<ram:RateApplicablePercent>19.00<\/ram:RateApplicablePercent>/);
  assert.match(generated.xml, /<ram:IBANID>DE02120300000000202051<\/ram:IBANID>/);

  const invalid = validateEInvoiceData(createSampleInvoice({ companyIban: "", customerAddress: "" }));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.missingFields.includes("IBAN"));
  assert.ok(invalid.missingFields.includes("Rechnungsempfaenger Adresse"));

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "e-invoice-test-"));
  try {
    const result = await createEInvoiceXmlFile(invoice, tempDir);
    assert.equal(result.success, true);
    assert.ok(result.fileName.endsWith(".xml"));
    const xml = await fs.readFile(result.filePath, "utf8");
    assert.match(xml, /Baggerarbeiten/);
    assert.match(xml, /urn:cen\.eu:en16931:2017/);

    const fakeEmbeddedPdf = path.join(tempDir, "fake-factur-x.pdf");
    await fs.writeFile(fakeEmbeddedPdf, "%PDF-1.7\n/Names <</EmbeddedFiles [(factur-x.xml)]>>\n%%EOF", "latin1");
    assert.equal(await hasEmbeddedFacturXXml(fakeEmbeddedPdf), true);

    const availability = await getMustangAvailability(path.resolve(__dirname, ".."));
    if (!availability.available) {
      console.log(`SKIP Factur-X-PDF-Erzeugung: ${availability.reason}`);
      return;
    }

    const sourcePdf = path.join(tempDir, "source.pdf");
    await fs.writeFile(sourcePdf, "%PDF-1.7\n%%EOF", "latin1");
    const facturXPdf = await createFacturXPdf({
      invoice,
      sourcePdfPath: sourcePdf,
      xmlPath: result.filePath,
      outputDir: tempDir,
      baseDir: path.resolve(__dirname, ".."),
    });
    assert.equal(facturXPdf.success, true, facturXPdf.reason || facturXPdf.errorOutput || "Factur-X-PDF wurde nicht erzeugt");
    assert.equal(facturXPdf.embeddedXml, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
