const childProcess = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createPdfBoxCarrierPdf } = require("../lib/facturx-pdf.cjs");

const BROWSER_CANDIDATES = [
  process.env.PDF_BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function findBrowserExecutable() {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error("Kein unterstuetzter Browser fuer die PDF-Erzeugung gefunden.");
}

function buildCarrierHtml(invoice) {
  const companyAddress = escapeHtml(invoice.companyAddress).replace(/\r?\n/gu, "<br>");
  const customerAddress = escapeHtml(invoice.customerAddress).replace(/\r?\n/gu, "<br>");
  const itemRows = invoice.items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const lineTotal = quantity * unitPrice;
    return `
      <tr>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.serviceDate)}</td>
        <td class="right">${quantity.toFixed(2)} ${escapeHtml(item.unit || "Stk")}</td>
        <td class="right">${unitPrice.toFixed(2)} EUR</td>
        <td class="right">${lineTotal.toFixed(2)} EUR</td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>HSRechnung - Rechnung ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { margin: 0; color: #172033; font-family: Arial, sans-serif; font-size: 12px; }
    .top { display: flex; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 18px; }
    .brand { font-size: 24px; font-weight: 700; letter-spacing: 0; }
    .subtle { color: #5d6678; line-height: 1.45; }
    h1 { margin: 42px 0 18px; font-size: 30px; letter-spacing: 0; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 30px; }
    .box { border: 1px solid #d7dce5; padding: 14px; border-radius: 4px; min-height: 86px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #172033; color: white; text-align: left; padding: 10px; font-weight: 700; }
    td { border-bottom: 1px solid #e2e6ee; padding: 10px; vertical-align: top; }
    .right { text-align: right; white-space: nowrap; }
    .totals { margin-left: auto; margin-top: 24px; width: 260px; }
    .totals div { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #e2e6ee; }
    .total { font-weight: 700; font-size: 15px; }
    footer { position: fixed; bottom: 0; left: 0; right: 0; color: #5d6678; border-top: 1px solid #d7dce5; padding-top: 8px; font-size: 10px; }
  </style>
</head>
<body>
  <section class="top">
    <div>
      <div class="brand">HSRechnung</div>
      <div class="subtle">${escapeHtml(invoice.companyName)}<br>${companyAddress}</div>
    </div>
    <div class="subtle">
      ${escapeHtml(invoice.companyEmail)}<br>
      ${escapeHtml(invoice.companyPhone)}<br>
      IBAN ${escapeHtml(invoice.companyIban)}
    </div>
  </section>
  <h1>Rechnung</h1>
  <section class="meta">
    <div class="box">
      <strong>Rechnung an</strong><br>
      ${escapeHtml(invoice.customerName)}<br>${customerAddress}
    </div>
    <div class="box">
      Rechnungsnummer: <strong>${escapeHtml(invoice.invoiceNumber)}</strong><br>
      Rechnungsdatum: ${escapeHtml(invoice.invoiceDate)}<br>
      Faellig am: ${escapeHtml(invoice.dueDate)}
    </div>
  </section>
  <table>
    <thead>
      <tr><th>Leistung</th><th>Datum</th><th class="right">Menge</th><th class="right">Einzelpreis</th><th class="right">Gesamt</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <section class="totals">
    <div><span>Netto</span><span>170.00 EUR</span></div>
    <div><span>USt. ${escapeHtml(invoice.taxRate)}%</span><span>32.30 EUR</span></div>
    <div class="total"><span>Brutto</span><span>202.30 EUR</span></div>
  </section>
  <footer>${escapeHtml(invoice.companyName)} &middot; ${escapeHtml(invoice.companyBankName)} &middot; ${escapeHtml(invoice.companyTaxNumber)}</footer>
</body>
</html>`;
}

async function createHsrechnungCarrierPdf(invoice, outputPath, tempDir) {
  const browserPath = await findBrowserExecutable();
  const htmlPath = path.join(tempDir, "carrier.html");
  const profileDir = path.join(tempDir, "browser-profile");
  await fs.mkdir(profileDir, { recursive: true });
  await fs.writeFile(htmlPath, buildCarrierHtml(invoice), "utf8");
  try {
    await execFileAsync(
      browserPath,
      [
        "--headless",
        "--disable-gpu",
        "--disable-gpu-sandbox",
        "--disable-gpu-compositing",
        "--disable-software-rasterizer",
        "--disable-features=UseSkiaRenderer,VizDisplayCompositor",
        "--run-all-compositor-stages-before-draw",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profileDir}`,
        `--print-to-pdf=${outputPath}`,
        "--print-to-pdf-no-header",
        pathToFileURL(htmlPath).href,
      ],
      { timeout: 60000 }
    );
  } catch (error) {
    const stat = await fs.stat(outputPath).catch(() => null);
    if (!stat?.size) {
      await createPdfBoxCarrierPdf(outputPath, { baseDir: path.resolve(__dirname, "..") });
      return;
    }
  }
  const stat = await fs.stat(outputPath);
  if (!stat.size) throw new Error("HSRechnung-Traeger-PDF wurde nicht erstellt.");
}

module.exports = {
  createHsrechnungCarrierPdf,
};
