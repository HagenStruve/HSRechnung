const http = require("node:http");
const fs = require("node:fs/promises");
const childProcess = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createEInvoiceXmlFile } = require("./lib/e-invoice.cjs");

const PORT = Number(process.env.INVOICE_API_PORT || 5174);
const DATA_DIR = path.join(__dirname, "data");
const LOGO_DIR = path.join(DATA_DIR, "logos");
const PDF_DIR = path.join(DATA_DIR, "pdfs");
const E_INVOICE_DIR = path.join(DATA_DIR, "e-invoices");
const DATA_FILE = path.join(DATA_DIR, "invoices.json");
const APP_ICON_FILE = path.join(__dirname, "public", "brand", "hsrechnung-icon.svg");
const BACKUP_FILE = path.join(DATA_DIR, "invoices.json.bak");
const TMP_FILE = path.join(DATA_DIR, "invoices.json.tmp");
const ALLOWED_LOGO_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const BROWSER_CANDIDATES = [
  process.env.PDF_BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const emptyState = () => ({
  version: 1,
  savedAt: null,
  invoice: null,
  invoiceSettings: null,
  invoices: [],
  customers: [],
  services: [],
  serviceHours: {},
  companySettings: null,
  companyProfiles: [],
});

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function ensureLogoDir() {
  await ensureDataDir();
  await fs.mkdir(LOGO_DIR, { recursive: true });
}

async function ensurePdfDir() {
  await ensureDataDir();
  await fs.mkdir(PDF_DIR, { recursive: true });
}

async function ensureEInvoiceDir() {
  await ensureDataDir();
  await fs.mkdir(E_INVOICE_DIR, { recursive: true });
}

async function readState() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return writeState(emptyState());
    throw error;
  }
}

async function writeState(state) {
  await ensureDataDir();
  const payload = {
    ...state,
    version: 1,
    savedAt: new Date().toISOString(),
  };
  const text = `${JSON.stringify(payload, null, 2)}\n`;

  try {
    await fs.copyFile(DATA_FILE, BACKUP_FILE);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await fs.writeFile(TMP_FILE, text, "utf8");
  await fs.rename(TMP_FILE, DATA_FILE);
  return payload;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function sendResponse(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    ...headers,
  });
  response.end(body);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sanitizeLogoExtension(fileName = "", mimeType = "") {
  const extension = path.extname(fileName).toLowerCase();
  if (ALLOWED_LOGO_EXTENSIONS.has(extension)) return extension;
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/svg+xml") return ".svg";
  return "";
}

function getLogoContentType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeExternalUrl(value) {
  const cleaned = String(value || "").replace(/\s+/g, "");
  if (!cleaned) return "";
  const candidate = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(parsed.hostname)) return "";
    return candidate;
  } catch {
    return "";
  }
}

function shouldShowCompanyBranding(invoice) {
  return invoice?.showCompanyBranding !== false;
}

function normalizePriceMode(mode) {
  return mode === "gross" ? "gross" : "net";
}

function currency(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function formatFuel(value) {
  return `${Number(value || 0).toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} l`;
}

function formatServiceDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}.${month}.${year}` : String(value);
}

function getTaxMultiplier(taxRate) {
  return 1 + Number(taxRate || 0) / 100;
}

function getLineNetTotal(item, taxRate) {
  const rawTotal = Number(item?.quantity ?? item?.hours ?? 0) * Number(item?.unitPrice || 0);
  return normalizePriceMode(item?.priceMode) === "gross" ? rawTotal / getTaxMultiplier(taxRate) : rawTotal;
}

function getLineGrossTotal(item, taxRate) {
  const rawTotal = Number(item?.quantity ?? item?.hours ?? 0) * Number(item?.unitPrice || 0);
  return normalizePriceMode(item?.priceMode) === "gross" ? rawTotal : rawTotal * getTaxMultiplier(taxRate);
}

function getLineFuel(item) {
  return Number(item?.quantity ?? item?.hours ?? 0) * Number(item?.fuelPerUnit ?? item?.fuelPerHour ?? 0);
}

function calculateInvoiceTotals(invoice) {
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const subtotal = items.reduce((sum, item) => sum + getLineNetTotal(item, invoice.taxRate), 0);
  const grossTotal = items.reduce((sum, item) => sum + getLineGrossTotal(item, invoice.taxRate), 0);
  const totalFuel = items.reduce((sum, item) => sum + getLineFuel(item), 0);

  return {
    subtotal,
    taxAmount: grossTotal - subtotal,
    grossTotal,
    totalFuel,
  };
}

async function logoPathToDataUri(logoPath) {
  if (!logoPath || !String(logoPath).startsWith("/api/logo/")) return logoPath || "";
  const fileName = path.basename(decodeURIComponent(String(logoPath).slice("/api/logo/".length)));
  const extension = path.extname(fileName).toLowerCase();
  if (!fileName || !ALLOWED_LOGO_EXTENSIONS.has(extension)) return "";

  try {
    const data = await fs.readFile(path.join(LOGO_DIR, fileName));
    return `data:${getLogoContentType(fileName)};base64,${data.toString("base64")}`;
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function appIconToDataUri() {
  try {
    const svg = await fs.readFile(APP_ICON_FILE, "utf8");
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  } catch {
    return "";
  }
}

async function buildInvoiceHtml(invoice, totals) {
  const showBranding = shouldShowCompanyBranding(invoice);
  const appIconHref = await appIconToDataUri();
  const logoSrc = showBranding ? await logoPathToDataUri(invoice.companyLogoPath) : "";
  const logoMarkup = logoSrc
    ? `<img class="company-logo" src="${escapeHtml(logoSrc)}" alt="Logo ${escapeHtml(invoice.companyName || "Firma")}" />`
    : "";
  const websiteMarkup = showBranding && invoice.companyWebsite
    ? normalizeExternalUrl(invoice.companyWebsite)
      ? `<div class="muted"><a href="${escapeHtml(normalizeExternalUrl(invoice.companyWebsite))}">${escapeHtml(invoice.companyWebsite)}</a></div>`
      : `<div class="muted">${escapeHtml(invoice.companyWebsite)}</div>`
    : "";
  const headerMarkup = `<div class="top">
    <div class="company-head">
      ${logoMarkup}
      <div class="company-data">
        <h2>${escapeHtml(invoice.companyName || "Firmenname")}</h2>
        <div class="muted">${escapeHtml(invoice.companyAddress || "")}</div>
        <div class="muted">${escapeHtml(invoice.companyEmail || "")}</div>
        <div class="muted">${escapeHtml(invoice.companyPhone || "")}</div>
        ${websiteMarkup}
      </div>
    </div>
    <div class="invoice-head">
      <h1>RECHNUNG</h1>
      <p><strong>Nr.:</strong> ${escapeHtml(invoice.invoiceNumber)}</p>
      <p><strong>Datum:</strong> ${escapeHtml(invoice.invoiceDate)}</p>
      <p><strong>Fällig:</strong> ${escapeHtml(invoice.dueDate)}</p>
    </div>
  </div>`;
  const bankRows = [
    invoice.companyBankName ? `<div class="detail-row"><span class="detail-label">Bank</span><span class="detail-value">${escapeHtml(invoice.companyBankName)}</span></div>` : "",
    invoice.companyIban ? `<div class="detail-row"><span class="detail-label">IBAN</span><span class="detail-value">${escapeHtml(invoice.companyIban)}</span></div>` : "",
    invoice.companyBic ? `<div class="detail-row"><span class="detail-label">BIC</span><span class="detail-value">${escapeHtml(invoice.companyBic)}</span></div>` : "",
    invoice.companyTaxNumber ? `<div class="detail-row"><span class="detail-label">Steuernummer</span><span class="detail-value">${escapeHtml(invoice.companyTaxNumber)}</span></div>` : "",
    invoice.companyVatId ? `<div class="detail-row"><span class="detail-label">USt-IdNr.</span><span class="detail-value">${escapeHtml(invoice.companyVatId)}</span></div>` : "",
  ].join("");
  const rows = (Array.isArray(invoice.items) ? invoice.items : [])
    .map((item) => {
      const lineNet = getLineNetTotal(item, invoice.taxRate);
      const lineFuel = getLineFuel(item);
      const modeLabel = normalizePriceMode(item.priceMode) === "gross" ? "brutto vereinbart" : "netto";
      return `<tr>
        <td>${escapeHtml(formatServiceDate(item.serviceDate))}</td>
        <td>${escapeHtml(item.description || "-")}</td>
        <td>${escapeHtml(item.quantity ?? item.hours)}</td>
        <td>${escapeHtml(item.unit || "")}</td>
        <td>${currency(item.unitPrice)}<br><span class="muted">${modeLabel}</span></td>
        <td>${lineFuel > 0 ? formatFuel(lineFuel) : "-"}</td>
        <td style="text-align:right">${currency(lineNet)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="application-name" content="HSRechnung" />
  ${appIconHref ? `<link rel="icon" href="${appIconHref}" type="image/svg+xml" />` : ""}
  <title>HSRechnung - Rechnung ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111827; padding: 0; margin: 0; font-size: 12px; line-height: 1.35; }
    .page-layout { width: 100%; min-width: 0; border-collapse: collapse; table-layout: fixed; margin: 0; }
    .page-layout > thead { display: table-header-group; }
    .page-layout > tbody { display: table-row-group; }
    .page-layout > thead > tr,
    .page-layout > tbody > tr,
    .page-layout > thead > tr > td,
    .page-layout > tbody > tr > td { border: 0; padding: 0; }
    .top { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 18px; break-inside: avoid; page-break-inside: avoid; }
    .company-head { display: flex; align-items: flex-start; gap: 16px; min-width: 0; }
    .company-logo { width: 80px; max-height: 52px; object-fit: contain; object-position: left top; flex: 0 0 auto; }
    .company-data { min-width: 0; }
    .muted { color: #475569; white-space: pre-line; }
    .invoice-head { text-align: right; min-width: 160px; }
    .table-wrap { width: 100%; overflow: visible; }
    .positions-table { width: 100%; min-width: 0; border-collapse: collapse; table-layout: fixed; margin: 16px 0 0; }
    .positions-table thead { display: table-header-group; }
    .positions-table tbody { display: table-row-group; }
    .positions-table tr { break-inside: avoid; page-break-inside: avoid; }
    .positions-table th,
    .positions-table td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #f1f5f9; }
    .summary-section,
    .bank-section,
    .note-section { break-inside: avoid; page-break-inside: avoid; }
    .summary-section { margin-top: 20px; }
    .summary { width: 330px; max-width: 100%; margin-left: auto; border: 1px solid #cbd5e1; padding: 14px; }
    .row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
    .detail-card { width: 380px; max-width: 100%; margin-top: 20px; margin-left: auto; border: 1px solid #cbd5e1; padding: 14px; }
    .detail-title { margin: 0 0 14px 0; font-size: 12px; letter-spacing: 0.2em; color: #64748b; text-transform: uppercase; }
    .detail-row { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 18px; align-items: start; padding: 7px 0; }
    .detail-label { font-size: 12px; font-weight: 700; color: #334155; }
    .detail-value { min-width: 0; overflow-wrap: anywhere; color: #111827; text-align: right; }
    .total { border-top: 1px solid #cbd5e1; padding-top: 8px; font-weight: bold; }
    h1, h2, h3, p { margin: 0 0 7px 0; }
    h1 { font-size: 28px; }
    h2 { font-size: 20px; }
    .section { margin-top: 18px; }
    .recipient-section { break-inside: avoid; page-break-inside: avoid; }
    @media print {
      html, body { width: 100%; }
      .top { margin-bottom: 14px; }
      .positions-table { margin-top: 14px; }
      .summary-section { break-inside: avoid; page-break-inside: avoid; }
      .bank-section { break-inside: avoid; page-break-inside: avoid; }
      .note-section { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <table class="page-layout">
    <thead>
      <tr><td>${headerMarkup}</td></tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div class="section recipient-section">
            <p style="font-size:12px; letter-spacing:0.2em; color:#64748b; text-transform:uppercase;">Rechnung an</p>
            <h3>${escapeHtml(invoice.customerName || "Kundenname")}</h3>
            <div class="muted">${escapeHtml(invoice.customerAddress || "Kundenadresse")}</div>
          </div>

          <div class="table-wrap">
            <table class="positions-table">
              <colgroup>
                <col style="width: 13%" />
                <col style="width: 29%" />
                <col style="width: 9%" />
                <col style="width: 9%" />
                <col style="width: 15%" />
                <col style="width: 11%" />
                <col style="width: 14%" />
              </colgroup>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Leistung</th>
                  <th>Menge</th>
                  <th>Einheit</th>
                  <th>Einzelpreis</th>
                  <th>Diesel</th>
                  <th style="text-align:right">Betrag</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>

          <div class="summary-section">
            <div class="summary">
              <div class="row"><span>Zwischensumme Netto</span><span>${currency(totals.subtotal)}</span></div>
              <div class="row"><span>Gesamt Dieselverbrauch</span><span>${formatFuel(totals.totalFuel)}</span></div>
              <div class="row"><span>MwSt. (${escapeHtml(invoice.taxRate)}%)</span><span>${currency(totals.taxAmount)}</span></div>
              <div class="row total"><span>Gesamt Brutto</span><span>${currency(totals.grossTotal)}</span></div>
            </div>
          </div>

          <div class="section note-section">
            <p style="font-size:12px; letter-spacing:0.2em; color:#64748b; text-transform:uppercase;">Hinweis</p>
            <div class="muted">${escapeHtml(invoice.notes || "")}</div>
          </div>
          ${bankRows ? `<div class="bank-section"><div class="detail-card"><p class="detail-title">Bankdaten</p>${bankRows}</div></div>` : ""}
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}

function sanitizeFilePart(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

async function uniquePdfPath(invoice) {
  await ensurePdfDir();
  const invoiceNumber = sanitizeFilePart(invoice.invoiceNumber, "Ohne-Nummer");
  const customerName = sanitizeFilePart(invoice.customerName, "Ohne-Kunde");
  const invoiceDate = sanitizeFilePart(invoice.invoiceDate, new Date().toISOString().slice(0, 10));
  const baseName = `Rechnung_${invoiceNumber}_${customerName}_${invoiceDate}`;

  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? "" : `_${index}`;
    const fileName = `${baseName}${suffix}.pdf`;
    const filePath = path.join(PDF_DIR, fileName);
    try {
      await fs.access(filePath);
    } catch (error) {
      if (error.code === "ENOENT") return { fileName, filePath };
      throw error;
    }
  }

  throw new Error("Kein freier PDF-Dateiname gefunden.");
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
  throw new Error("Kein unterstützter Browser für die PDF-Erzeugung gefunden. Bitte Microsoft Edge oder Chrome installieren.");
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, options, (error, stdout, stderr) => {
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

async function createInvoicePdf(invoice) {
  if (!invoice || typeof invoice !== "object") throw new Error("Keine Rechnung übergeben.");
  const browserPath = await findBrowserExecutable();
  const totals = calculateInvoiceTotals(invoice);
  const html = await buildInvoiceHtml(invoice, totals);
  const { fileName, filePath } = await uniquePdfPath(invoice);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-pdf-"));
  const htmlPath = path.join(tempDir, "invoice.html");
  const profileDir = path.join(tempDir, "profile");

  await fs.writeFile(htmlPath, html, "utf8");
  await fs.mkdir(profileDir, { recursive: true });

  try {
    await execFileAsync(
      browserPath,
      [
        "--headless",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profileDir}`,
        `--print-to-pdf=${filePath}`,
        "--print-to-pdf-no-header",
        pathToFileURL(htmlPath).href,
      ],
      { timeout: 60000, windowsHide: true }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  const stat = await fs.stat(filePath);
  if (!stat.size) throw new Error("PDF-Datei wurde nicht erstellt.");

  await ensureEInvoiceDir();
  const eInvoice = await createEInvoiceXmlFile(invoice, E_INVOICE_DIR);

  return {
    success: true,
    filePath: path.relative(__dirname, filePath).replaceAll("\\", "/"),
    fileName,
    eInvoice: {
      ...eInvoice,
      filePath: eInvoice.filePath ? path.relative(__dirname, eInvoice.filePath).replaceAll("\\", "/") : null,
    },
  };
}

function findInvoiceInState(state, invoiceId) {
  if (invoiceId === "current" && state?.invoice) return state.invoice;
  const entry = Array.isArray(state?.invoices) ? state.invoices.find((item) => item.id === invoiceId || item.invoice?.id === invoiceId) : null;
  return entry?.invoice || null;
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    const pathname = requestUrl.pathname;

    if (pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, { ok: true, dataFile: DATA_FILE });
      return;
    }

    if (pathname === "/api/state" && request.method === "GET") {
      sendJson(response, 200, await readState());
      return;
    }

    if (pathname === "/api/state" && request.method === "PUT") {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body || "{}");
      sendJson(response, 200, await writeState(parsed));
      return;
    }

    if (pathname === "/api/state" && request.method === "DELETE") {
      await writeState(emptyState());
      sendJson(response, 200, { ok: true });
      return;
    }

    const pdfMatch = pathname.match(/^\/api\/invoices\/([^/]+)\/pdf$/);
    if (pdfMatch && request.method === "POST") {
      const invoiceId = decodeURIComponent(pdfMatch[1]);
      const body = await readRequestBody(request);
      const parsed = body ? JSON.parse(body) : {};
      const state = await readState();
      const invoice = parsed.invoice && typeof parsed.invoice === "object" ? parsed.invoice : findInvoiceInState(state, invoiceId);

      if (!invoice) {
        sendJson(response, 404, { error: "Rechnung nicht gefunden." });
        return;
      }

      sendJson(response, 200, await createInvoicePdf(invoice));
      return;
    }

    if (pathname === "/api/pdfs/open-folder" && request.method === "POST") {
      await ensurePdfDir();
      childProcess.execFile("explorer.exe", [PDF_DIR], { windowsHide: true }, () => {});
      sendJson(response, 200, { success: true, folderPath: path.relative(__dirname, PDF_DIR).replaceAll("\\", "/") });
      return;
    }

    if (pathname === "/api/logo" && request.method === "POST") {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body || "{}");
      const mimeType = String(parsed.mimeType || "");
      const extension = sanitizeLogoExtension(parsed.fileName, mimeType);

      if (!extension || !ALLOWED_LOGO_MIME_TYPES.has(mimeType)) {
        sendJson(response, 400, { error: "Nur png, jpg, jpeg, webp und svg sind erlaubt." });
        return;
      }

      const data = String(parsed.data || "");
      if (!data) {
        sendJson(response, 400, { error: "Keine Bilddaten empfangen." });
        return;
      }

      const buffer = Buffer.from(data, "base64");
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
        sendJson(response, 400, { error: "Logo-Datei ist leer oder groesser als 5 MB." });
        return;
      }

      await ensureLogoDir();
      const fileName = `logo-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`;
      await fs.writeFile(path.join(LOGO_DIR, fileName), buffer);
      sendJson(response, 200, {
        fileName,
        path: `/api/logo/${fileName}`,
      });
      return;
    }

    if (pathname.startsWith("/api/logo/") && request.method === "GET") {
      const fileName = path.basename(decodeURIComponent(pathname.slice("/api/logo/".length)));
      const extension = path.extname(fileName).toLowerCase();
      if (!fileName || !ALLOWED_LOGO_EXTENSIONS.has(extension)) {
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      await ensureLogoDir();
      const filePath = path.join(LOGO_DIR, fileName);
      let data;
      try {
        data = await fs.readFile(filePath);
      } catch (error) {
        if (error.code === "ENOENT") {
          sendJson(response, 404, { error: "Not found" });
          return;
        }
        throw error;
      }
      sendResponse(response, 200, data, {
        "content-type": getLogoContentType(fileName),
        "cache-control": "public, max-age=31536000, immutable",
      });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: error.message || "Internal server error" });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`Die App laeuft bereits oder Port ${PORT} ist belegt.`);
    console.log("Bitte oeffne die vorhandene App im Browser oder starte sie erneut.");
    process.exit(98);
    return;
  }

  console.log("Die lokale Daten-API konnte nicht gestartet werden.");
  console.log(error.message || String(error));
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Invoice data API listening on http://127.0.0.1:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
