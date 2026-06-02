import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Euro,
  FolderOpen,
  Fuel,
  Mail,
  Pencil,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import { clearAppState, loadAppState, saveAppState } from "./storage/localStore.js";

const LEGACY_STORAGE_KEY = "rechnungsprogramm-data-v7";
const BACKUP_VERSION = 1;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const ALLOWED_LOGO_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
const ENTRY_TYPES = {
  service: "Dienstleistung pro Stunde",
  fixed: "Festpreis",
  quantity: "Ware/Menge",
};
const PRICE_MODES = {
  net: "Preis ist Netto",
  gross: "Preis ist Brutto",
};
const TAX_CATEGORIES = {
  standard: "Regelsteuer",
  reduced: "Ermaessigt",
  zero: "0 %",
  smallBusiness: "Kleinunternehmer",
  taxExempt: "Steuerfrei",
  agriculture24: "Landwirtschaft Paragraph 24",
};
const INVOICE_STATUSES = {
  draft: "Entwurf",
  created: "Erstellt",
  paid: "Bezahlt",
  cancelled: "Storniert",
};
const INVOICE_SORTS = {
  invoiceDate: "Rechnungsdatum",
  invoiceNumber: "Rechnungsnummer",
  customerName: "Kunde",
  grossTotal: "Betrag",
  status: "Status",
};
const APP_LOGO_SRC = "/brand/hsrechnung-logo.svg";
const APP_ICON_SRC = "/brand/hsrechnung-icon.svg";

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const today = () => new Date().toISOString().slice(0, 10);

const emptyItem = () => ({
  id: createId(),
  serviceId: "",
  type: "service",
  description: "",
  serviceDate: today(),
  quantity: 1,
  unit: "h",
  hours: 1,
  unitPrice: 0,
  priceMode: "net",
  fuelPerUnit: 0,
  fuelPerHour: 0,
});

const emptyCustomer = () => ({
  id: createId(),
  name: "",
  address: "",
  email: "",
});

const emptyService = () => ({
  id: createId(),
  type: "service",
  name: "",
  unit: "h",
  pricePerUnit: 0,
  pricePerHour: 0,
  priceMode: "net",
  fuelPerUnit: 0,
  fuelPerHour: 0,
});

const createDefaultInvoiceSettings = () => ({
  nextInvoiceNumber: `RE-${new Date().getFullYear()}-001`,
});

const createDefaultCompanySettings = () => ({
  id: "",
  companyName: "",
  address: "",
  email: "",
  phone: "",
  website: "",
  logoPath: "",
  logoFileName: "",
  vatRate: 19,
  taxCategory: "standard",
  bankName: "",
  iban: "",
  bic: "",
  taxNumber: "",
  vatId: "",
  invoicePrefix: "RE",
  nextInvoiceNumber: 1,
  createdAt: "",
  updatedAt: "",
  companyAddress: "",
  companyEmail: "",
  companyPhone: "",
  companyWebsite: "",
  companyLogoPath: "",
  companyLogoFileName: "",
  taxRate: 19,
  companyTaxCategory: "standard",
});

function getCompanyInvoiceNumber(companySettings) {
  if (!hasCompanySettings(companySettings)) return "";
  const prefix = String(companySettings.invoicePrefix || "RE").trim() || "RE";
  const number = Number.isFinite(Number(companySettings.nextInvoiceNumber)) ? Number(companySettings.nextInvoiceNumber) : 1;
  return `${prefix}-${String(Math.max(1, Math.trunc(number))).padStart(5, "0")}`;
}

const applyCompanySettingsToInvoice = (invoice, companySettings, options = {}) => ({
  ...invoice,
  companyId: companySettings.id,
  companyName: companySettings.companyName,
  companyAddress: companySettings.address || companySettings.companyAddress,
  companyEmail: companySettings.email || companySettings.companyEmail,
  companyPhone: companySettings.phone || companySettings.companyPhone,
  companyWebsite: companySettings.website || companySettings.companyWebsite,
  companyLogoPath: companySettings.logoPath || companySettings.companyLogoPath,
  companyLogoFileName: companySettings.logoFileName || companySettings.companyLogoFileName,
  companyBankName: companySettings.bankName,
  companyIban: companySettings.iban,
  companyBic: companySettings.bic,
  companyTaxNumber: companySettings.taxNumber,
  companyVatId: companySettings.vatId,
  companyInvoicePrefix: companySettings.invoicePrefix,
  companyTaxCategory: companySettings.taxCategory || companySettings.companyTaxCategory || inferTaxCategory(companySettings.vatRate ?? companySettings.taxRate ?? 19),
  taxRate: Number(companySettings.vatRate ?? companySettings.taxRate ?? 19),
  invoiceNumber: options.generateInvoiceNumber ? getCompanyInvoiceNumber(companySettings) || invoice.invoiceNumber : invoice.invoiceNumber,
});

const createDefaultInvoice = (companySettings = createDefaultCompanySettings(), invoiceSettings = createDefaultInvoiceSettings()) => ({
  companyId: companySettings.id,
  companyName: companySettings.companyName,
  companyAddress: companySettings.address || companySettings.companyAddress,
  companyEmail: companySettings.email || companySettings.companyEmail,
  companyPhone: companySettings.phone || companySettings.companyPhone,
  companyWebsite: companySettings.website || companySettings.companyWebsite,
  companyLogoPath: companySettings.logoPath || companySettings.companyLogoPath,
  companyLogoFileName: companySettings.logoFileName || companySettings.companyLogoFileName,
  companyBankName: companySettings.bankName,
  companyIban: companySettings.iban,
  companyBic: companySettings.bic,
  companyTaxNumber: companySettings.taxNumber,
  companyVatId: companySettings.vatId,
  companyInvoicePrefix: companySettings.invoicePrefix,
  companyTaxCategory: companySettings.taxCategory || companySettings.companyTaxCategory || inferTaxCategory(companySettings.vatRate ?? companySettings.taxRate ?? 19),
  showCompanyBranding: true,
  customerId: "",
  customerName: "",
  customerAddress: "",
  customerEmail: "",
  invoiceNumber: getCompanyInvoiceNumber(companySettings) || invoiceSettings.nextInvoiceNumber,
  invoiceDate: today(),
  dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  taxRate: Number(companySettings.vatRate ?? companySettings.taxRate ?? 19),
  status: "draft",
  notes: "Vielen Dank für Ihren Auftrag.",
  items: [emptyItem()],
});

const createDefaultCustomers = () => [
  {
    id: createId(),
    name: "Max Mustermann GmbH",
    address: "Hauptstraße 10\n12345 Berlin",
    email: "info@mustermann.de",
  },
];

const createDefaultServices = () => [
  { id: createId(), type: "service", name: "Baggerarbeiten", unit: "h", pricePerUnit: 85, pricePerHour: 85, fuelPerUnit: 6.5, fuelPerHour: 6.5 },
  { id: createId(), type: "service", name: "Transport", unit: "h", pricePerUnit: 72, pricePerHour: 72, fuelPerUnit: 4.2, fuelPerHour: 4.2 },
];

function createAppState(overrides = {}) {
  return {
    invoice: createDefaultInvoice(),
    invoices: [],
    customers: createDefaultCustomers(),
    services: createDefaultServices(),
    serviceHours: {},
    companySettings: createDefaultCompanySettings(),
    companyProfiles: [],
    invoiceSettings: createDefaultInvoiceSettings(),
    ...overrides,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAppState(raw) {
  if (!isPlainObject(raw)) return createAppState();

  const companySettings = normalizeCompanySettings(raw);
  const invoiceSettings = normalizeInvoiceSettings(raw.invoiceSettings || raw.invoice);
  const invoice = isPlainObject(raw.invoice)
    ? applyCompanySettingsToInvoice({ ...createDefaultInvoice(companySettings, invoiceSettings), ...raw.invoice }, companySettings)
    : createDefaultInvoice(companySettings, invoiceSettings);
  const customers = Array.isArray(raw.customers) ? raw.customers : createDefaultCustomers();
  const services = Array.isArray(raw.services) ? raw.services.map(normalizeServiceEntry) : createDefaultServices();
  const serviceHours = isPlainObject(raw.serviceHours) ? raw.serviceHours : {};
  const companyProfiles = normalizeCompanyProfiles(raw.companyProfiles || raw.firmProfiles || raw.companyProfile || raw.firmProfile);
  const invoices = Array.isArray(raw.invoices)
    ? raw.invoices.filter((entry) => isPlainObject(entry?.invoice)).map(normalizeInvoiceSnapshot)
    : [];
  const normalizedInvoice = {
    ...invoice,
    items: Array.isArray(invoice.items) && invoice.items.length ? invoice.items.map(normalizeInvoiceItem) : [emptyItem()],
  };

  return createAppState({
    invoice: normalizedInvoice,
    invoices,
    customers,
    services,
    serviceHours,
    companySettings,
    companyProfiles,
    invoiceSettings,
  });
}

function normalizeInvoiceSettings(value) {
  const source = isPlainObject(value) ? value : {};
  const fallback = createDefaultInvoiceSettings();

  return {
    nextInvoiceNumber:
      typeof source.nextInvoiceNumber === "string" && source.nextInvoiceNumber.trim()
        ? source.nextInvoiceNumber.trim()
        : typeof source.invoiceNumber === "string" && source.invoiceNumber.trim()
          ? source.invoiceNumber.trim()
        : fallback.nextInvoiceNumber,
  };
}

function normalizeCompanySettings(raw) {
  const profileSource = Array.isArray(raw.companyProfiles)
    ? raw.companyProfiles.find((entry) => hasCompanySettings(normalizeCompanyRecord(entry)))
    : Array.isArray(raw.firmProfiles)
      ? raw.firmProfiles.find((entry) => hasCompanySettings(normalizeCompanyRecord(entry)))
      : isPlainObject(raw.companyProfile)
        ? raw.companyProfile
        : isPlainObject(raw.firmProfile)
          ? raw.firmProfile
          : null;
  const primarySource = isPlainObject(raw.companySettings)
    ? raw.companySettings
    : isPlainObject(raw.settings)
      ? raw.settings
      : {};
  const source = hasCompanySettings(normalizeCompanyRecord(primarySource))
    ? primarySource
    : isPlainObject(profileSource)
      ? profileSource
      : isPlainObject(raw.invoice)
        ? raw.invoice
        : primarySource;

  return normalizeCompanyRecord(source);
}

function firstString(...values) {
  const value = values.find((entry) => typeof entry === "string");
  return value || "";
}

function firstFiniteNumber(fallback, ...values) {
  const value = values.find((entry) => Number.isFinite(Number(entry)));
  return value === undefined ? fallback : Number(value);
}

function inferTaxCategory(taxRate) {
  const rate = Number(taxRate || 0);
  if (rate === 7) return "reduced";
  if (rate === 0) return "zero";
  return "standard";
}

function normalizeTaxCategory(category, taxRate) {
  return Object.prototype.hasOwnProperty.call(TAX_CATEGORIES, category) ? category : inferTaxCategory(taxRate);
}

function normalizeCompanyRecord(source = {}) {
  const address = firstString(source.address, source.companyAddress, source.firmAddress, source.businessAddress);
  const email = firstString(source.email, source.companyEmail, source.firmEmail, source.businessEmail);
  const phone = firstString(source.phone, source.companyPhone, source.telephone, source.firmPhone, source.businessPhone);
  const website = firstString(source.website, source.companyWebsite, source.webseite, source.url);
  const logoPath = firstString(source.logoPath, source.companyLogoPath, source.logo, source.logoUrl);
  const logoFileName = firstString(source.logoFileName, source.companyLogoFileName, source.logoFilename, source.logoName);
  const vatRate = firstFiniteNumber(19, source.vatRate, source.taxRate);
  const taxCategory = normalizeTaxCategory(firstString(source.taxCategory, source.companyTaxCategory), vatRate);
  const nextInvoiceNumber = Math.max(1, Math.trunc(firstFiniteNumber(1, source.nextInvoiceNumber)));
  const invoicePrefix = firstString(source.invoicePrefix, source.prefix).trim() || "RE";

  return {
    id: typeof source.id === "string" ? source.id : typeof source.companyId === "string" ? source.companyId : "",
    companyName: firstString(source.companyName, source.name, source.firmName, source.businessName),
    address,
    email,
    phone,
    website,
    logoPath,
    logoFileName,
    vatRate,
    taxCategory,
    bankName: firstString(source.bankName, source.bank),
    iban: firstString(source.iban, source.IBAN),
    bic: firstString(source.bic, source.BIC),
    taxNumber: firstString(source.taxNumber, source.steuernummer),
    vatId: firstString(source.vatId, source.ustId, source.vatID),
    invoicePrefix,
    nextInvoiceNumber,
    createdAt: firstString(source.createdAt) || new Date().toISOString(),
    updatedAt: firstString(source.updatedAt) || new Date().toISOString(),
    companyAddress: address,
    companyEmail: email,
    companyPhone: phone,
    companyWebsite: website,
    companyLogoPath: logoPath,
    companyLogoFileName: logoFileName,
    taxRate: vatRate,
    companyTaxCategory: taxCategory,
  };
}

function normalizeCompanyProfiles(value) {
  const entries = Array.isArray(value) ? value : isPlainObject(value) ? [value] : [];
  if (!entries.length) return [];

  return entries
    .filter(isPlainObject)
    .map((entry) => ({
      ...normalizeCompanyRecord(entry),
      id: typeof entry.id === "string" && entry.id ? entry.id : createId(),
    }))
    .filter(hasCompanySettings);
}

function hasCompanySettings(settings) {
  if (!isPlainObject(settings)) return false;
  return Boolean(
    String(settings.companyName || "").trim() ||
      String(settings.companyAddress || "").trim() ||
      String(settings.companyEmail || "").trim() ||
      String(settings.companyPhone || "").trim() ||
      String(settings.address || "").trim() ||
      String(settings.email || "").trim() ||
      String(settings.phone || "").trim() ||
      String(settings.companyWebsite || "").trim() ||
      String(settings.website || "").trim() ||
      String(settings.companyLogoPath || "").trim() ||
      String(settings.logoPath || "").trim() ||
      String(settings.companyLogoFileName || "").trim() ||
      String(settings.logoFileName || "").trim()
  );
}

function normalizeEntryType(type) {
  return Object.prototype.hasOwnProperty.call(ENTRY_TYPES, type) ? type : "service";
}

function normalizePriceMode(mode) {
  return Object.prototype.hasOwnProperty.call(PRICE_MODES, mode) ? mode : "net";
}

function normalizeInvoiceStatus(status) {
  return Object.prototype.hasOwnProperty.call(INVOICE_STATUSES, status) ? status : "draft";
}

function normalizeServiceEntry(entry) {
  const type = normalizeEntryType(entry?.type);
  const unit = type === "service" ? "h" : type === "fixed" ? "Stück" : entry?.unit || "Stück";
  const pricePerUnit = Number(entry?.pricePerUnit ?? entry?.pricePerHour ?? entry?.fixedPrice ?? 0);
  const fuelPerUnit = type === "service" ? Number(entry?.fuelPerUnit ?? entry?.fuelPerHour ?? 0) : 0;

  return {
    id: entry?.id || createId(),
    type,
    name: entry?.name || "",
    unit,
    pricePerUnit,
    pricePerHour: type === "service" ? pricePerUnit : 0,
    priceMode: normalizePriceMode(entry?.priceMode),
    fuelPerUnit,
    fuelPerHour: type === "service" ? fuelPerUnit : 0,
  };
}

function normalizeInvoiceItem(item) {
  const type = normalizeEntryType(item?.type);
  const quantity = Number(item?.quantity ?? item?.hours ?? 1);
  const unit = item?.unit || (type === "service" ? "h" : type === "fixed" ? "Stück" : "");
  const unitPrice = Number(item?.unitPrice ?? item?.pricePerUnit ?? item?.pricePerHour ?? 0);
  const priceMode = normalizePriceMode(item?.priceMode);
  const fuelPerUnit = type === "service" ? Number(item?.fuelPerUnit ?? item?.fuelPerHour ?? 0) : 0;
  const serviceDate = typeof item?.serviceDate === "string" ? item.serviceDate : "";

  return {
    id: item?.id || createId(),
    serviceId: item?.serviceId || "",
    type,
    description: item?.description || "",
    serviceDate,
    quantity,
    unit,
    hours: quantity,
    unitPrice,
    priceMode,
    fuelPerUnit,
    fuelPerHour: fuelPerUnit,
  };
}

function getTaxMultiplier(taxRate) {
  return 1 + Number(taxRate || 0) / 100;
}

function getLineNetTotal(item, taxRate) {
  const rawTotal = Number(item.quantity ?? item.hours ?? 0) * Number(item.unitPrice || 0);
  return normalizePriceMode(item.priceMode) === "gross" ? rawTotal / getTaxMultiplier(taxRate) : rawTotal;
}

function getLineGrossTotal(item, taxRate) {
  const rawTotal = Number(item.quantity ?? item.hours ?? 0) * Number(item.unitPrice || 0);
  return normalizePriceMode(item.priceMode) === "gross" ? rawTotal : rawTotal * getTaxMultiplier(taxRate);
}

function getLineTotal(item) {
  return Number(item.quantity ?? item.hours ?? 0) * Number(item.unitPrice || 0);
}

function getLineFuel(item) {
  return Number(item.quantity ?? item.hours ?? 0) * Number(item.fuelPerUnit ?? item.fuelPerHour ?? 0);
}

function calculateInvoiceTotals(invoice) {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
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

function incrementInvoiceNumber(value) {
  const input = String(value || "").trim();
  const match = input.match(/^(.*?)(\d+)$/);
  if (!match) return input;

  const [, prefix, numberPart] = match;
  const nextNumber = String(Number(numberPart) + 1).padStart(numberPart.length, "0");
  return `${prefix}${nextNumber}`;
}

function createInvoiceSnapshot(invoice) {
  const id = invoice.id || createId();
  const createdAt = invoice.createdAt || new Date().toISOString();
  const normalizedInvoice = {
    ...invoice,
    showCompanyBranding: invoice.showCompanyBranding !== false,
    status: normalizeInvoiceStatus(invoice.status || "created"),
    items: invoice.items.map(normalizeInvoiceItem),
  };
  const totals = calculateInvoiceTotals(normalizedInvoice);
  return {
    id,
    invoiceNumber: normalizedInvoice.invoiceNumber || "Ohne Nummer",
    customerName: normalizedInvoice.customerName || "Ohne Kunde",
    invoiceDate: normalizedInvoice.invoiceDate || new Date().toISOString().slice(0, 10),
    createdAt,
    savedAt: new Date().toISOString(),
    status: normalizedInvoice.status,
    ...totals,
    invoice: {
      ...normalizedInvoice,
      id,
      createdAt,
    },
  };
}

function normalizeInvoiceSnapshot(entry) {
  const normalizedInvoice = {
    ...entry.invoice,
    showCompanyBranding: entry.invoice.showCompanyBranding !== false,
    status: normalizeInvoiceStatus(entry.invoice.status || entry.status),
    items: Array.isArray(entry.invoice.items) && entry.invoice.items.length ? entry.invoice.items.map(normalizeInvoiceItem) : [emptyItem()],
  };
  const totals = calculateInvoiceTotals(normalizedInvoice);
  const id = entry.id || normalizedInvoice.id || createId();
  const createdAt = entry.createdAt || normalizedInvoice.createdAt || entry.savedAt || new Date().toISOString();

  return {
    id,
    invoiceNumber: entry.invoiceNumber || normalizedInvoice.invoiceNumber || "Ohne Nummer",
    customerName: entry.customerName || normalizedInvoice.customerName || "Ohne Kunde",
    invoiceDate: entry.invoiceDate || normalizedInvoice.invoiceDate || new Date().toISOString().slice(0, 10),
    createdAt,
    savedAt: entry.savedAt || new Date().toISOString(),
    status: normalizeInvoiceStatus(entry.status || normalizedInvoice.status),
    subtotal: Number.isFinite(Number(entry.subtotal)) ? Number(entry.subtotal) : totals.subtotal,
    taxAmount: Number.isFinite(Number(entry.taxAmount)) ? Number(entry.taxAmount) : totals.taxAmount,
    grossTotal: Number.isFinite(Number(entry.grossTotal)) ? Number(entry.grossTotal) : totals.grossTotal,
    totalFuel: Number.isFinite(Number(entry.totalFuel)) ? Number(entry.totalFuel) : totals.totalFuel,
    invoice: {
      ...normalizedInvoice,
      id,
      createdAt,
    },
  };
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
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : cleaned;
  const candidate = /^https?:\/\//i.test(withProtocol) ? withProtocol : `https://${withProtocol}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(parsed.hostname)) return "";
    return candidate;
  } catch {
    return "";
  }
}

function renderWebsiteLink(value, className = "") {
  const text = String(value || "").trim();
  if (!text) return null;
  const href = normalizeExternalUrl(text);
  return href ? (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  ) : (
    <span className={className}>{text}</span>
  );
}

function shouldShowCompanyBranding(invoice) {
  return invoice.showCompanyBranding !== false;
}

function hasAllowedLogoExtension(fileName = "") {
  const lowerName = fileName.toLowerCase();
  return ALLOWED_LOGO_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function validateLogoFile(file) {
  if (!file) return "Keine Logo-Datei ausgewählt.";
  if (!ALLOWED_LOGO_TYPES.has(file.type) || !hasAllowedLogoExtension(file.name)) {
    return "Bitte nur png, jpg, jpeg, webp oder svg hochladen.";
  }
  if (file.size > 5 * 1024 * 1024) {
    return "Die Logo-Datei darf maximal 5 MB groß sein.";
  }
  return "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("Logo-Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

async function uploadLogoFile(file) {
  const data = await fileToBase64(file);
  const response = await fetch("/api/logo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      data,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `HTTP ${response.status}`);
  }

  return response.json();
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

function createInvoiceItemFromService(service, hours = 1, serviceDate = today()) {
  const entry = normalizeServiceEntry(service);
  const quantity = Number(hours || 1);
  return {
    id: createId(),
    serviceId: entry.id,
    type: entry.type,
    description: entry.name,
    serviceDate,
    quantity,
    unit: entry.unit,
    hours: quantity,
    unitPrice: entry.pricePerUnit,
    priceMode: entry.priceMode,
    fuelPerUnit: entry.fuelPerUnit,
    fuelPerHour: entry.fuelPerUnit,
  };
}

function buildInvoiceHtml(invoice, subtotal, totalFuel, taxAmount, total, options = {}) {
  const showToolbar = options.showToolbar === true;
  const showBranding = shouldShowCompanyBranding(invoice);
  const logoMarkup = showBranding && invoice.companyLogoPath
    ? `<img class="company-logo" src="${escapeHtml(invoice.companyLogoPath)}" alt="Logo ${escapeHtml(invoice.companyName || "Firma")}" />`
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
  const rows = invoice.items
    .map((item) => {
      const lineNet = getLineNetTotal(item, invoice.taxRate);
      const lineFuel = getLineFuel(item);
      const modeLabel = normalizePriceMode(item.priceMode) === "gross" ? "brutto vereinbart" : "netto";
      return `<tr>
        <td>${escapeHtml(formatServiceDate(item.serviceDate))}</td>
        <td>${escapeHtml(item.description || "–")}</td>
        <td>${escapeHtml(item.quantity ?? item.hours)}</td>
        <td>${escapeHtml(item.unit || "")}</td>
        <td>${currency(item.unitPrice)}<br><span class="muted">${modeLabel}</span></td>
        <td>${lineFuel > 0 ? formatFuel(lineFuel) : "–"}</td>
        <td style="text-align:right">${currency(lineNet)}</td>
      </tr>`;
    })
    .join("");

  const toolbarMarkup = showToolbar
    ? `<div class="pdf-toolbar">
        <strong>Rechnung als PDF speichern</strong>
        <span>Im Druckdialog als Ziel "Als PDF speichern" auswählen.</span>
        <button type="button" onclick="window.print()">PDF speichern / Drucken</button>
      </div>`
    : "";

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="application-name" content="HSRechnung" />
  <link rel="icon" href="${APP_ICON_SRC}" type="image/svg+xml" />
  <title>HSRechnung - Rechnung ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111827; padding: 0; margin: 0; font-size: 12px; line-height: 1.35; }
    .pdf-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 0 0 18px; padding: 12px 14px; border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; font-size: 13px; }
    .pdf-toolbar span { color: #475569; }
    .pdf-toolbar button { margin-left: auto; border: 0; border-radius: 6px; background: #0f172a; color: white; padding: 8px 12px; font: inherit; cursor: pointer; }
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
      .pdf-toolbar { display: none !important; }
      .top { margin-bottom: 14px; }
      .positions-table { margin-top: 14px; }
      .summary-section { break-inside: avoid; page-break-inside: avoid; }
      .bank-section { break-inside: avoid; page-break-inside: avoid; }
      .note-section { break-inside: avoid; page-break-inside: avoid; }
    }
    @media (max-width: 700px) {
      body { padding: 16px; }
      .top { flex-direction: column; }
      .company-head { flex-direction: column; gap: 10px; }
      .company-logo { width: 82px; max-height: 52px; }
      .top > div:last-child { text-align: left !important; }
      .detail-card { margin-left: 0; }
      .detail-row { grid-template-columns: 1fr; gap: 2px; }
      .detail-value { text-align: left; }
      h1 { font-size: 28px; }
      h2 { font-size: 22px; }
    }
  </style>
</head>
<body>
  ${toolbarMarkup}
  <table class="page-layout">
    <thead>
      <tr>
        <td>${headerMarkup}</td>
      </tr>
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
              <div class="row"><span>Zwischensumme Netto</span><span>${currency(subtotal)}</span></div>
              <div class="row"><span>Gesamt Dieselverbrauch</span><span>${formatFuel(totalFuel)}</span></div>
              <div class="row"><span>MwSt. (${escapeHtml(invoice.taxRate)}%)</span><span>${currency(taxAmount)}</span></div>
              <div class="row total"><span>Gesamt Brutto</span><span>${currency(total)}</span></div>
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

function runInlineTests() {
  console.assert(currency(85) === "85,00 €", "currency() sollte Euro im deutschen Format ausgeben");
  console.assert(formatFuel(6.5) === "6,5 l", "formatFuel() sollte Liter korrekt formatieren");
  console.assert(createDefaultInvoice().companyAddress === "", "Firmendaten sollten leer starten");
  console.assert(
    normalizeAppState({ companySettings: { companyName: "Testfirma", companyEmail: "test@example.test" } }).invoice.companyName === "Testfirma",
    "Firmendaten sollten in die aktuelle Rechnung übernommen werden"
  );
  console.assert(
    normalizeAppState({ companyProfiles: [{ companyName: "Profil A" }] }).companyProfiles.length === 1,
    "Firmenprofile sollten normalisiert werden"
  );

  const testService = { id: "1", name: "Test", pricePerHour: 99, fuelPerHour: 3.5 };
  const newItem = createInvoiceItemFromService(testService, 2.5, "2026-06-01");
  console.assert(newItem.description === "Test", "Dienstleistung sollte die Beschreibung übernehmen");
  console.assert(newItem.serviceDate === "2026-06-01", "Dienstleistung sollte das Leistungsdatum übernehmen");
  console.assert(newItem.unitPrice === 99, "Dienstleistung sollte den Stundenpreis übernehmen");
  console.assert(newItem.fuelPerUnit === 3.5, "Dienstleistung sollte den Dieselverbrauch übernehmen");
  console.assert(newItem.quantity === 2.5, "Neue Rechnungsposition sollte die gewählte Menge übernehmen");
  console.assert(getLineTotal(createInvoiceItemFromService({ id: "2", type: "fixed", name: "Testartikel", pricePerUnit: 2500 }, 2)) === 5000, "Festpreisartikel sollten mit Menge abrechnen");
  console.assert(Math.round(getLineNetTotal({ quantity: 1, unitPrice: 119, priceMode: "gross" }, 19)) === 100, "119 Euro brutto sollten 100 Euro netto ergeben");
  console.assert(incrementInvoiceNumber("RE-2026-009") === "RE-2026-010", "Rechnungsnummern sollten führende Nullen behalten");
  console.assert(incrementInvoiceNumber("R-15") === "R-16", "Rechnungsnummern sollten am Ende hochzählen");

  const testInvoice = createDefaultInvoice();
  const html = buildInvoiceHtml(testInvoice, 100, 4, 19, 119);
  console.assert(html.includes("RECHNUNG"), "PDF-HTML sollte die Überschrift enthalten");
  console.assert(html.includes(testInvoice.invoiceNumber), "PDF-HTML sollte die Rechnungsnummer enthalten");
  console.assert(html.includes("<tbody>"), "PDF-HTML sollte tbody öffnen");
  console.assert(html.includes("</tbody>"), "PDF-HTML sollte tbody schließen");
  console.assert(html.includes("</style>"), "PDF-HTML sollte den Style-Block korrekt schließen");
  console.assert(html.includes("</html>"), "PDF-HTML sollte vollständig geschlossen sein");
  console.assert(
    normalizeAppState({ invoice: { showCompanyBranding: false, items: [emptyItem()] } }).invoice.showCompanyBranding === false,
    "Rechnungs-Branding sollte pro Rechnung deaktivierbar bleiben"
  );
  console.assert(
    normalizeCompanySettings({ companySettings: { companyWebsite: "https://example.test", companyLogoPath: "/api/logo/test.png" } }).companyWebsite === "https://example.test",
    "Webseite sollte in den Firmendaten normalisiert werden"
  );
  console.assert(normalizeExternalUrl("Struvelohn.de") === "https://Struvelohn.de", "Domains ohne Protokoll sollten https erhalten");
  console.assert(normalizeExternalUrl("www.struvelohn.de") === "https://www.struvelohn.de", "www-Domains ohne Protokoll sollten https erhalten");
  console.assert(normalizeExternalUrl("https://struvelohn.de") === "https://struvelohn.de", "https-URLs sollten unverändert bleiben");
  console.assert(normalizeExternalUrl("kein link") === "", "Ungültige Webseiten sollten keinen href erhalten");
  console.assert(
    getCompanyInvoiceNumber({ companyName: "A", invoicePrefix: "BAU", nextInvoiceNumber: 41 }) === "BAU-00041",
    "Firmeneigene Rechnungsnummern sollten aus Prefix und Nummer entstehen"
  );
  console.assert(
    normalizeAppState({ companyProfile: { companyName: "Alt", bankName: "Bank", vatId: "DE123" } }).companyProfiles.length === 1,
    "Alte einzelne Firmenprofile sollten in die neue Liste migriert werden"
  );
  console.assert(
    normalizeCompanyRecord({ companyName: "A" }).invoicePrefix === "RE" && normalizeCompanyRecord({ companyName: "A" }).nextInvoiceNumber === 1,
    "Fehlende Firmenfelder sollten mit sicheren Defaults ergänzt werden"
  );
}

runInlineTests();

const Field = ({ label, children }) => (
  <div className="grid min-w-0 gap-2">
    <Label className="min-w-0 break-words">{label}</Label>
    {children}
  </div>
);

const SummaryRow = ({ label, value, strong = false }) => (
  <div className={`flex justify-between gap-4 ${strong ? "border-t pt-2 text-base font-bold" : ""}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

const DetailRow = ({ label, value }) => (
  <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-4 sm:gap-6">
    <span className="min-w-0 break-words text-xs font-semibold text-slate-700">{label}</span>
    <span className="min-w-0 break-words text-right text-slate-900">{value}</span>
  </div>
);

export default function HSRechnung() {
  const [invoice, setInvoice] = useState(() => createDefaultInvoice());
  const [invoiceSettings, setInvoiceSettings] = useState(() => createDefaultInvoiceSettings());
  const [invoices, setInvoices] = useState([]);
  const [companySettings, setCompanySettings] = useState(() => createDefaultCompanySettings());
  const [companyForm, setCompanyForm] = useState(() => createDefaultCompanySettings());
  const [companyProfiles, setCompanyProfiles] = useState([]);
  const [customers, setCustomers] = useState(() => createDefaultCustomers());
  const [services, setServices] = useState(() => createDefaultServices());
  const [newCustomer, setNewCustomer] = useState(() => emptyCustomer());
  const [newService, setNewService] = useState(() => emptyService());
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const [editingCustomerId, setEditingCustomerId] = useState("");
  const [editingServiceId, setEditingServiceId] = useState("");
  const [serviceHours, setServiceHours] = useState({});
  const [serviceDates, setServiceDates] = useState({});
  const [saveMessage, setSaveMessage] = useState("");
  const [lastPdfPath, setLastPdfPath] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState({
    target: "checking",
    message: "Lokale Datei wird geprüft...",
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceSort, setInvoiceSort] = useState("invoiceDate");
  const [invoiceSortDirection, setInvoiceSortDirection] = useState("desc");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const saveTimerRef = useRef(null);
  const autoSaveTimerRef = useRef(null);

  const showSaveMessage = (message) => {
    setSaveMessage(message);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveMessage(""), 2500);
  };

  const handleSelectableCardKeyDown = (event, action) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  const applyRestoredState = (state) => {
    const next = normalizeAppState(state);
    const nextCompanySettings = hasCompanySettings(next.companySettings)
      ? { ...next.companySettings, id: next.companySettings.id || next.companyProfiles[0]?.id || createId() }
      : createDefaultCompanySettings();
    const nextCompanyProfiles = hasCompanySettings(nextCompanySettings)
      ? [
          nextCompanySettings,
          ...next.companyProfiles.filter((profile) => profile.id !== nextCompanySettings.id && hasCompanySettings(profile)),
        ]
      : next.companyProfiles.filter(hasCompanySettings);
    setInvoice(hasCompanySettings(nextCompanySettings) ? applyCompanySettingsToInvoice(next.invoice, nextCompanySettings) : next.invoice);
    setInvoiceSettings(next.invoiceSettings);
    setInvoices(next.invoices);
    setCompanySettings(nextCompanySettings);
    setCompanyForm(nextCompanySettings);
    setCompanyProfiles(nextCompanyProfiles);
    setCustomers(next.customers.length ? next.customers : createDefaultCustomers());
    setServices(next.services.length ? next.services : createDefaultServices());
    setServiceHours(next.serviceHours);
    setServiceDates({});
  };

  useEffect(() => {
    let active = true;

    async function restoreData() {
      try {
        const loaded = await loadAppState();
        let restored = loaded?.state ? loaded.state : null;

        if (!restored) {
          const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
          restored = legacy ? JSON.parse(legacy) : null;
        }

        if (!active) return;

        if (restored) {
          applyRestoredState(restored);
        }
        setStorageStatus({
          target: loaded?.target || "project-folder",
          message:
            loaded?.target === "browser-fallback"
              ? loaded.warning || "Lokale Datei konnte nicht geladen werden. Browser-Fallback wird verwendet."
              : "Lokale Datei aktiv",
        });
      } catch (error) {
        console.error("Gespeicherte Daten konnten nicht geladen werden.", error);
        showSaveMessage("Gespeicherte Daten konnten nicht geladen werden.");
        setStorageStatus({
          target: "error",
          message: "Lokale Datei konnte nicht geladen werden.",
        });
      } finally {
        if (active) setStorageReady(true);
      }
    }

    restoreData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveAppState({ invoice, invoiceSettings, invoices, customers, services, serviceHours, companySettings, companyProfiles })
        .then(() => {
          setStorageStatus({ target: "project-folder", message: "Lokale Datei aktiv" });
        })
        .catch((error) => {
          console.error("Automatisches Speichern fehlgeschlagen", error);
          setStorageStatus({ target: "error", message: "Lokale Datei konnte nicht gespeichert werden." });
          showSaveMessage(error.message || "Lokale Datei konnte nicht gespeichert werden.");
        });
    }, 350);
  }, [storageReady, invoice, invoiceSettings, invoices, customers, services, serviceHours, companySettings, companyProfiles]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const subtotal = useMemo(
    () => invoice.items.reduce((sum, item) => sum + getLineNetTotal(item, invoice.taxRate), 0),
    [invoice.items, invoice.taxRate]
  );

  const totalFuel = useMemo(
    () => invoice.items.reduce((sum, item) => sum + getLineFuel(item), 0),
    [invoice.items]
  );

  const total = useMemo(
    () => invoice.items.reduce((sum, item) => sum + getLineGrossTotal(item, invoice.taxRate), 0),
    [invoice.items, invoice.taxRate]
  );
  const taxAmount = useMemo(() => total - subtotal, [subtotal, total]);
  const selectedInvoice = useMemo(
    () => invoices.find((entry) => entry.id === selectedInvoiceId) || invoices[0] || null,
    [invoices, selectedInvoiceId]
  );
  const visibleInvoices = useMemo(() => {
    const query = invoiceSearch.trim().toLowerCase();
    const filtered = query
      ? invoices.filter((entry) => {
          const haystack = [
            entry.invoiceNumber,
            entry.customerName,
            entry.invoiceDate,
            INVOICE_STATUSES[entry.status],
            entry.invoice?.notes,
            ...(entry.invoice?.items || []).map((item) => item.description),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : invoices;

    return [...filtered].sort((a, b) => {
      const direction = invoiceSortDirection === "asc" ? 1 : -1;
      const left = invoiceSort === "grossTotal" ? Number(a[invoiceSort] || 0) : String(a[invoiceSort] || "").toLowerCase();
      const right = invoiceSort === "grossTotal" ? Number(b[invoiceSort] || 0) : String(b[invoiceSort] || "").toLowerCase();
      if (left < right) return -1 * direction;
      if (left > right) return 1 * direction;
      return String(b.savedAt || "").localeCompare(String(a.savedAt || ""));
    });
  }, [invoiceSearch, invoiceSort, invoiceSortDirection, invoices]);

  const updateField = (field, value) => setInvoice((prev) => ({ ...prev, [field]: value }));

  const saveInvoiceNumberSetting = () => {
    const nextInvoiceNumber = invoiceSettings.nextInvoiceNumber.trim() || createDefaultInvoiceSettings().nextInvoiceNumber;
    setInvoiceSettings({ nextInvoiceNumber });
    setInvoice((prev) => ({ ...prev, invoiceNumber: nextInvoiceNumber }));
    showSaveMessage("Rechnungsnummer gespeichert.");
  };

  const createNextInvoice = () => {
    setInvoice(createDefaultInvoice(companySettings, invoiceSettings));
    showSaveMessage("Neue Rechnung vorbereitet.");
  };

  const updateCompanyField = (field, value) => {
    setCompanyForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "vatRate" && ["standard", "reduced", "zero"].includes(prev.taxCategory || prev.companyTaxCategory)) {
        next.taxCategory = inferTaxCategory(value);
        next.companyTaxCategory = next.taxCategory;
      }
      if (editingCompanyId && next.id && next.id === companySettings.id) {
        setCompanySettings(next);
        setInvoice((prevInvoice) => applyCompanySettingsToInvoice(prevInvoice, next));
      }
      return next;
    });
  };

  const saveCompanyProfile = async () => {
    if (!hasCompanySettings(companyForm)) {
      showSaveMessage("Bitte zuerst Firmendaten eintragen.");
      return;
    }

    const profile = {
      ...companyForm,
      id: editingCompanyId || createId(),
      companyName: companyForm.companyName.trim(),
      address: String(companyForm.address || companyForm.companyAddress || "").trim(),
      email: String(companyForm.email || companyForm.companyEmail || "").trim(),
      phone: String(companyForm.phone || companyForm.companyPhone || "").trim(),
      website: String(companyForm.website || companyForm.companyWebsite || "").trim(),
      logoPath: companyForm.logoPath || companyForm.companyLogoPath,
      logoFileName: companyForm.logoFileName || companyForm.companyLogoFileName,
      vatRate: Number(companyForm.vatRate ?? companyForm.taxRate ?? 19),
      taxCategory: normalizeTaxCategory(companyForm.taxCategory || companyForm.companyTaxCategory, companyForm.vatRate ?? companyForm.taxRate ?? 19),
      bankName: String(companyForm.bankName || "").trim(),
      iban: String(companyForm.iban || "").trim(),
      bic: String(companyForm.bic || "").trim(),
      taxNumber: String(companyForm.taxNumber || "").trim(),
      vatId: String(companyForm.vatId || "").trim(),
      invoicePrefix: String(companyForm.invoicePrefix || "RE").trim() || "RE",
      nextInvoiceNumber: Math.max(1, Math.trunc(Number(companyForm.nextInvoiceNumber || 1))),
      createdAt: editingCompanyId ? companyForm.createdAt || new Date().toISOString() : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const normalizedProfile = normalizeCompanyRecord(profile);

    const shouldActivate = !editingCompanyId || companySettings.id === normalizedProfile.id;
    const nextCompanySettings = shouldActivate ? normalizedProfile : companySettings;
    const nextInvoice = shouldActivate
      ? applyCompanySettingsToInvoice(invoice, normalizedProfile, { generateInvoiceNumber: normalizeInvoiceStatus(invoice.status) === "draft" })
      : invoice;
    const nextCompanyProfiles = [normalizedProfile, ...companyProfiles.filter((entry) => entry.id !== normalizedProfile.id && hasCompanySettings(entry))].slice(0, 50);

    if (shouldActivate) {
      setCompanySettings(nextCompanySettings);
      setInvoice(nextInvoice);
    }
    setCompanyProfiles(nextCompanyProfiles);
    setCompanyForm(createDefaultCompanySettings());
    setEditingCompanyId("");

    try {
      await saveAppState({
        invoice: nextInvoice,
        invoiceSettings,
        invoices,
        customers,
        services,
        serviceHours,
        companySettings: nextCompanySettings,
        companyProfiles: nextCompanyProfiles,
      });
      setStorageStatus({ target: "project-folder", message: "Lokale Datei aktiv" });
      const loaded = await loadAppState();
      if (loaded?.state) {
        applyRestoredState(loaded.state);
        setCompanyForm(createDefaultCompanySettings());
        setEditingCompanyId("");
      }
      showSaveMessage(editingCompanyId ? "Firmendaten aktualisiert." : "Firmendaten gespeichert.");
    } catch (error) {
      console.error("Firmendaten konnten nicht gespeichert werden.", error);
      setStorageStatus({ target: "error", message: "Lokale Datei konnte nicht gespeichert werden." });
      showSaveMessage(error.message || "Lokale Datei konnte nicht gespeichert werden.");
    }
  };

  const applyCompanyProfile = (id) => {
    const profile = companyProfiles.find((entry) => entry.id === id);
    if (!profile) return;

    setCompanySettings(profile);
    setCompanyForm(createDefaultCompanySettings());
    setEditingCompanyId("");
    setInvoice((prev) => applyCompanySettingsToInvoice(prev, profile, { generateInvoiceNumber: normalizeInvoiceStatus(prev.status) === "draft" }));
    showSaveMessage("Firmendaten übernommen.");
  };

  const startNewCompanyProfile = () => {
    setCompanyForm(createDefaultCompanySettings());
    setEditingCompanyId("");
  };

  const editCompanyProfile = (profile) => {
    setCompanyForm(profile);
    setEditingCompanyId(profile.id);
  };

  const cancelCompanyEdit = () => {
    setCompanyForm(createDefaultCompanySettings());
    setEditingCompanyId("");
  };

  const removeCompanyProfile = async (id) => {
    const confirmed = window.confirm("Dieses Firmenprofil wirklich löschen?");
    if (!confirmed) return;

    const nextCompanyProfiles = companyProfiles.filter((entry) => entry.id !== id);
    const nextCompanySettings = companySettings.id === id
      ? nextCompanyProfiles[0] || createDefaultCompanySettings()
      : companySettings;
    const nextInvoice = companySettings.id === id ? applyCompanySettingsToInvoice(invoice, nextCompanySettings) : invoice;

    setCompanyProfiles(nextCompanyProfiles);
    setCompanySettings(nextCompanySettings);
    setCompanyForm(createDefaultCompanySettings());
    setEditingCompanyId("");
    if (companySettings.id === id) {
      setInvoice(nextInvoice);
    }

    try {
      await saveAppState({
        invoice: nextInvoice,
        invoiceSettings,
        invoices,
        customers,
        services,
        serviceHours,
        companySettings: nextCompanySettings,
        companyProfiles: nextCompanyProfiles,
      });
      setStorageStatus({ target: "project-folder", message: "Lokale Datei aktiv" });
      showSaveMessage("Firmenprofil gelöscht.");
    } catch (error) {
      console.error("Firmenprofil konnte nicht gelöscht werden.", error);
      setStorageStatus({ target: "error", message: "Lokale Datei konnte nicht gespeichert werden." });
      showSaveMessage(error.message || "Lokale Datei konnte nicht gespeichert werden.");
    }
  };

  const updateItem = (id, field, value) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, [field]: value };
        if (field === "quantity") next.hours = value;
        if (field === "fuelPerUnit") next.fuelPerHour = value;
        if (field === "priceMode") next.priceMode = normalizePriceMode(value);
        if (field === "type" && value !== "service") {
          next.fuelPerUnit = 0;
          next.fuelPerHour = 0;
          next.unit = value === "fixed" ? "Stück" : next.unit;
        }
        if (field === "type" && value === "service") next.unit = "h";
        return next;
      }),
    }));
  };

  const applyCustomerToInvoice = (customerId) => {
    const customer = customers.find((entry) => entry.id === customerId);
    if (!customer) {
      setInvoice((prev) => ({ ...prev, customerId: "", customerName: "", customerAddress: "", customerEmail: "" }));
      return;
    }
    setInvoice((prev) => ({
      ...prev,
      customerId: customer.id,
      customerName: customer.name,
      customerAddress: customer.address,
      customerEmail: customer.email,
    }));
  };

  const applyServiceToItem = (itemId, serviceId) => {
    const service = services.find((entry) => entry.id === serviceId);
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== itemId) return item;
        if (!service) return { ...item, serviceId: "" };
        const entry = normalizeServiceEntry(service);
        return {
          ...item,
          serviceId: entry.id,
          type: entry.type,
          description: entry.name,
          serviceDate: item.serviceDate || today(),
          unit: entry.unit,
          unitPrice: entry.pricePerUnit,
          priceMode: entry.priceMode,
          fuelPerUnit: entry.fuelPerUnit,
          fuelPerHour: entry.fuelPerUnit,
        };
      }),
    }));
  };

  const addServiceToInvoice = (serviceId) => {
    const service = services.find((entry) => entry.id === serviceId);
    if (!service) return;
    const selectedHours = Number(serviceHours[serviceId] || 1);
    const selectedDate = serviceDates[serviceId] || today();
    setInvoice((prev) => ({
      ...prev,
      items: [...prev.items, createInvoiceItemFromService(service, selectedHours, selectedDate)],
    }));
  };

  const addItem = () => setInvoice((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));

  const removeItem = (id) => {
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((item) => item.id !== id) : prev.items,
    }));
  };

  const clearInvoiceItems = () => setInvoice((prev) => ({ ...prev, items: [emptyItem()] }));

  const addCustomer = () => {
    if (!newCustomer.name.trim()) return;
    const customer = {
      ...newCustomer,
      id: editingCustomerId || newCustomer.id || createId(),
      name: newCustomer.name.trim(),
      address: newCustomer.address.trim(),
      email: newCustomer.email.trim(),
    };
    setCustomers((prev) => {
      if (!editingCustomerId) return [...prev, customer];
      return prev.map((entry) => (entry.id === editingCustomerId ? customer : entry));
    });
    if (invoice.customerId === customer.id) {
      setInvoice((prev) => ({
        ...prev,
        customerName: customer.name,
        customerAddress: customer.address,
        customerEmail: customer.email,
      }));
    }
    setNewCustomer(emptyCustomer());
    setEditingCustomerId("");
    showSaveMessage(editingCustomerId ? "Kunde aktualisiert." : "Kunde gespeichert.");
  };

  const editCustomer = (customer) => {
    setNewCustomer(customer);
    setEditingCustomerId(customer.id);
  };

  const cancelCustomerEdit = () => {
    setNewCustomer(emptyCustomer());
    setEditingCustomerId("");
  };

  const removeCustomer = (id) => {
    setCustomers((prev) => prev.filter((customer) => customer.id !== id));
    if (editingCustomerId === id) cancelCustomerEdit();
    setInvoice((prev) =>
      prev.customerId === id ? { ...prev, customerId: "", customerName: "", customerAddress: "", customerEmail: "" } : prev
    );
  };

  const addService = () => {
    if (!newService.name.trim()) return;
    const type = normalizeEntryType(newService.type);
    const service = normalizeServiceEntry({
      ...newService,
      type,
      id: editingServiceId || newService.id || createId(),
      name: newService.name.trim(),
      unit: type === "service" ? "h" : type === "fixed" ? "Stück" : newService.unit.trim() || "Stück",
      pricePerUnit: Number(newService.pricePerUnit || newService.pricePerHour || 0),
      priceMode: normalizePriceMode(newService.priceMode),
      fuelPerUnit: type === "service" ? Number(newService.fuelPerUnit || newService.fuelPerHour || 0) : 0,
    });
    setServices((prev) => {
      if (!editingServiceId) return [...prev, service];
      return prev.map((entry) => (entry.id === editingServiceId ? service : entry));
    });
    setServiceHours((prev) => ({ ...prev, [service.id]: 1 }));
    setServiceDates((prev) => ({ ...prev, [service.id]: prev[service.id] || today() }));
    setNewService(emptyService());
    setEditingServiceId("");
    showSaveMessage(editingServiceId ? "Eintrag aktualisiert." : "Eintrag gespeichert.");
  };

  const editService = (service) => {
    setNewService(normalizeServiceEntry(service));
    setEditingServiceId(service.id);
  };

  const cancelServiceEdit = () => {
    setNewService(emptyService());
    setEditingServiceId("");
  };

  const removeService = (id) => {
    setServices((prev) => prev.filter((service) => service.id !== id));
    if (editingServiceId === id) cancelServiceEdit();
    setServiceHours((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setServiceDates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.serviceId === id ? { ...item, serviceId: "" } : item)),
    }));
  };

  const saveData = async () => {
    try {
      await saveAppState({ invoice, invoiceSettings, invoices, customers, services, serviceHours, companySettings, companyProfiles });
      setStorageStatus({ target: "project-folder", message: "Lokale Datei aktiv" });
      showSaveMessage("Daten im Projektordner gespeichert.");
    } catch (error) {
      console.error("Speichern fehlgeschlagen", error);
      setStorageStatus({ target: "error", message: "Lokale Datei konnte nicht gespeichert werden." });
      showSaveMessage(error.message || "Speichern fehlgeschlagen.");
    }
  };

  const reloadLocalData = async () => {
    try {
      const loaded = await loadAppState();
      if (loaded?.state) {
        applyRestoredState(loaded.state);
      }
      setStorageStatus({
        target: loaded?.target || "project-folder",
        message:
          loaded?.target === "browser-fallback"
            ? loaded.warning || "Lokale Datei konnte nicht geladen werden. Browser-Fallback wird verwendet."
            : "Lokale Datei aktiv",
      });
      showSaveMessage("Lokale Daten neu geladen.");
    } catch (error) {
      console.error("Lokale Daten konnten nicht geladen werden.", error);
      setStorageStatus({ target: "error", message: "Lokale Datei konnte nicht geladen werden." });
      showSaveMessage("Lokale Datei konnte nicht geladen werden.");
    }
  };

  const saveCurrentInvoice = async () => {
    const snapshot = createInvoiceSnapshot({ ...invoice, status: invoice.status === "draft" ? "created" : invoice.status });
    const nextCompanySettings = hasCompanySettings(companySettings)
      ? normalizeCompanyRecord({
          ...companySettings,
          nextInvoiceNumber: Number(companySettings.nextInvoiceNumber || 1) + 1,
          updatedAt: new Date().toISOString(),
        })
      : companySettings;
    const nextCompanyProfiles = hasCompanySettings(nextCompanySettings)
      ? [nextCompanySettings, ...companyProfiles.filter((entry) => entry.id !== nextCompanySettings.id && hasCompanySettings(entry))]
      : companyProfiles;
    const nextInvoiceNumber = getCompanyInvoiceNumber(nextCompanySettings) || incrementInvoiceNumber(snapshot.invoiceNumber);
    const nextInvoiceSettings = { nextInvoiceNumber };
    const nextInvoice = hasCompanySettings(nextCompanySettings)
      ? applyCompanySettingsToInvoice({ ...snapshot.invoice, invoiceNumber: nextInvoiceNumber, status: "draft" }, nextCompanySettings)
      : { ...snapshot.invoice, invoiceNumber: nextInvoiceNumber, status: "draft" };
    const nextInvoices = [snapshot, ...invoices.filter((entry) => entry.id !== snapshot.id)].slice(0, 500);

    setInvoiceSettings(nextInvoiceSettings);
    setInvoice(nextInvoice);
    setInvoices(nextInvoices);
    setCompanySettings(nextCompanySettings);
    setCompanyProfiles(nextCompanyProfiles);
    setSelectedInvoiceId(snapshot.id);

    try {
      await saveAppState({
        invoice: nextInvoice,
        invoiceSettings: nextInvoiceSettings,
        invoices: nextInvoices,
        customers,
        services,
        serviceHours,
        companySettings: nextCompanySettings,
        companyProfiles: nextCompanyProfiles,
      });
      setStorageStatus({ target: "project-folder", message: "Lokale Datei aktiv" });
      showSaveMessage("Rechnung im Projektordner gespeichert.");
    } catch (error) {
      console.error("Rechnung konnte nicht im Projektordner gespeichert werden.", error);
      setStorageStatus({ target: "error", message: "Lokale Datei konnte nicht gespeichert werden." });
      showSaveMessage(error.message || "Rechnung nur im Browser gespeichert.");
    }
  };

  const openSavedInvoice = (entry) => {
    const normalizedItems = Array.isArray(entry.invoice.items) && entry.invoice.items.length ? entry.invoice.items.map(normalizeInvoiceItem) : [emptyItem()];
    setInvoice({
      ...createDefaultInvoice(companySettings, invoiceSettings),
      ...entry.invoice,
      showCompanyBranding: entry.invoice.showCompanyBranding !== false,
      items: normalizedItems,
    });
    setSelectedInvoiceId(entry.id);
    showSaveMessage("Rechnung geöffnet.");
  };

  const removeSavedInvoice = async (id) => {
    const nextInvoices = invoices.filter((entry) => entry.id !== id);
    setInvoices(nextInvoices);
    if (selectedInvoiceId === id) setSelectedInvoiceId("");
    try {
      await saveAppState({ invoice, invoiceSettings, invoices: nextInvoices, customers, services, serviceHours, companySettings, companyProfiles });
      setStorageStatus({ target: "project-folder", message: "Lokale Datei aktiv" });
      showSaveMessage("Gespeicherte Rechnung entfernt.");
    } catch (error) {
      console.error("Rechnung konnte nicht aus der lokalen Datei entfernt werden.", error);
      setStorageStatus({ target: "error", message: "Lokale Datei konnte nicht gespeichert werden." });
      showSaveMessage(error.message || "Lokale Datei konnte nicht gespeichert werden.");
    }
  };

  const exportDataFile = () => {
    try {
      const payload = {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        invoice,
        invoiceSettings,
        invoices,
        companySettings,
        companyProfiles,
        settings: companySettings,
        customers,
        services,
        serviceHours,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hsrechnung-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showSaveMessage("Datei wurde heruntergeladen.");
    } catch (error) {
      console.error("Datei-Export fehlgeschlagen", error);
      showSaveMessage("Datei-Export fehlgeschlagen.");
    }
  };

  const triggerImportFile = () => fileInputRef.current?.click();
  const triggerLogoFile = () => logoInputRef.current?.click();

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateLogoFile(file);
    if (validationError) {
      showSaveMessage(validationError);
      event.target.value = "";
      return;
    }

    try {
      const uploaded = await uploadLogoFile(file);
      const nextLogo = {
        logoPath: uploaded.path,
        logoFileName: uploaded.fileName || file.name,
        companyLogoPath: uploaded.path,
        companyLogoFileName: uploaded.fileName || file.name,
      };
      const shouldUpdateActiveCompany = editingCompanyId && companySettings.id === companyForm.id;
      const nextCompanySettings = shouldUpdateActiveCompany ? normalizeCompanyRecord({ ...companySettings, ...nextLogo, updatedAt: new Date().toISOString() }) : companySettings;
      const nextInvoice = shouldUpdateActiveCompany ? { ...invoice, ...nextLogo } : invoice;
      setCompanyForm((prev) => ({ ...prev, ...nextLogo }));
      if (shouldUpdateActiveCompany) {
        setCompanySettings(nextCompanySettings);
        setInvoice(nextInvoice);
      }
      await saveAppState({
        invoice: nextInvoice,
        invoiceSettings,
        invoices,
        customers,
        services,
        serviceHours,
        companySettings: nextCompanySettings,
        companyProfiles,
      });
      setStorageStatus({ target: "project-folder", message: "Lokale Datei aktiv" });
      showSaveMessage("Logo wurde im Projektordner gespeichert.");
    } catch (error) {
      console.error("Logo-Upload fehlgeschlagen", error);
      setStorageStatus({ target: "error", message: "Lokale Datei konnte nicht gespeichert werden." });
      showSaveMessage("Logo konnte nicht gespeichert werden.");
    } finally {
      event.target.value = "";
    }
  };

  const importDataFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      "Die importierte JSON-Datei ersetzt die aktuellen lokalen Daten. Vorher am besten ein Backup exportieren. Fortfahren?"
    );
    if (!confirmed) {
      event.target.value = "";
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (
        !isPlainObject(parsed) ||
        (
          !parsed.invoice &&
          !parsed.companySettings &&
          !parsed.companyProfile &&
          !parsed.firmProfile &&
          !Array.isArray(parsed.companyProfiles) &&
          !Array.isArray(parsed.firmProfiles) &&
          !Array.isArray(parsed.customers) &&
          !Array.isArray(parsed.services)
        )
      ) {
        throw new Error("Ungültiges Backup-Format.");
      }

      const imported = normalizeAppState(parsed);
      setInvoice(imported.invoice);
      setInvoiceSettings(imported.invoiceSettings);
      setInvoices(imported.invoices);
      setCompanySettings(imported.companySettings);
      setCompanyForm(imported.companySettings);
      setCompanyProfiles(imported.companyProfiles);
      setCustomers(imported.customers.length ? imported.customers : createDefaultCustomers());
      setServices(imported.services.length ? imported.services : createDefaultServices());
      setServiceHours(imported.serviceHours);
      setEditingCompanyId("");
      setEditingCustomerId("");
      setEditingServiceId("");
      await saveAppState(imported);
      setStorageStatus({ target: "project-folder", message: "Lokale Datei aktiv" });
      showSaveMessage("Backup wurde importiert.");
    } catch (error) {
      console.error("Datei-Import fehlgeschlagen", error);
      setStorageStatus({ target: "error", message: "Lokale Datei konnte nicht gespeichert werden." });
      showSaveMessage("Datei konnte nicht geladen werden.");
    } finally {
      event.target.value = "";
    }
  };

  const openInvoiceDocument = (invoiceToPrint, subtotalToPrint, totalFuelToPrint, taxAmountToPrint, totalToPrint, options = {}) => {
    try {
      const printWindow = window.open("", "_blank", "width=900,height=1200");
      if (!printWindow) {
        showSaveMessage("Pop-up blockiert. Bitte Pop-ups erlauben.");
        return;
      }
      printWindow.document.open();
      printWindow.document.write(
        buildInvoiceHtml(invoiceToPrint, subtotalToPrint, totalFuelToPrint, taxAmountToPrint, totalToPrint, {
          showToolbar: options.autoPrint !== true,
        })
      );
      printWindow.document.close();
      printWindow.focus();
      if (options.autoPrint === true) {
        setTimeout(() => printWindow.print(), 500);
      } else {
        showSaveMessage("PDF-Fenster geöffnet. Dort kann die Rechnung als PDF gespeichert werden.");
      }
    } catch (error) {
      console.error("PDF/Druck fehlgeschlagen", error);
      showSaveMessage("PDF/Druck fehlgeschlagen.");
    }
  };

  const printInvoice = () => {
    openInvoiceDocument(invoice, subtotal, totalFuel, taxAmount, total, { autoPrint: true });
  };

  const printSavedInvoice = (entry) => {
    const totals = calculateInvoiceTotals(entry.invoice);
    openInvoiceDocument(entry.invoice, totals.subtotal, totals.totalFuel, totals.taxAmount, totals.grossTotal, { autoPrint: true });
  };

  const saveInvoicePdfLocal = async (invoiceToSave = invoice, invoiceId = "current") => {
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(invoiceId === "current" ? { invoice: invoiceToSave } : {}),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      setLastPdfPath(result.filePath);
      if (result.facturXPdf?.success) {
        showSaveMessage(`PDF gespeichert: ${result.filePath} | Factur-X-PDF: ${result.facturXPdf.filePath}`);
      } else if (result.facturXPdf?.skipped) {
        showSaveMessage(`PDF und XML gespeichert. Factur-X-PDF fehlt: ${result.facturXPdf.reason}`);
      } else if (result.facturXPdf?.reason) {
        showSaveMessage(`PDF und XML gespeichert. Factur-X-PDF nicht valide: ${result.facturXPdf.reason}`);
      } else if (result.eInvoice?.success) {
        showSaveMessage(`PDF gespeichert: ${result.filePath} | E-Rechnung XML: ${result.eInvoice.filePath}`);
      } else if (Array.isArray(result.eInvoice?.missingFields) && result.eInvoice.missingFields.length) {
        showSaveMessage(`PDF gespeichert. E-Rechnung XML fehlt: ${result.eInvoice.missingFields.join(", ")}`);
      } else {
        showSaveMessage(`PDF gespeichert: ${result.filePath}`);
      }
    } catch (error) {
      console.error("PDF konnte nicht lokal gespeichert werden.", error);
      showSaveMessage(error.message || "PDF konnte nicht lokal gespeichert werden.");
    }
  };

  const saveSavedInvoicePdfLocal = (entry) => {
    saveInvoicePdfLocal(entry.invoice, entry.id);
  };

  const openPdfFolder = async () => {
    try {
      const response = await fetch("/api/pdfs/open-folder", { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error("PDF-Ordner konnte nicht geöffnet werden.", error);
      showSaveMessage("PDF-Ordner konnte nicht geöffnet werden.");
    }
  };

  const resetAll = async () => {
    try {
      await clearAppState();
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      console.error("Zurücksetzen fehlgeschlagen", error);
    }
    const defaultCompanySettings = createDefaultCompanySettings();
    const defaultInvoiceSettings = createDefaultInvoiceSettings();
    setCompanySettings(defaultCompanySettings);
    setCompanyForm(defaultCompanySettings);
    setCompanyProfiles([]);
    setInvoiceSettings(defaultInvoiceSettings);
    setInvoice(createDefaultInvoice(defaultCompanySettings, defaultInvoiceSettings));
    setInvoices([]);
    setCustomers(createDefaultCustomers());
    setServices(createDefaultServices());
    setServiceHours({});
    setServiceDates({});
    setNewCustomer(emptyCustomer());
    setNewService(emptyService());
    setEditingCompanyId("");
    setEditingCustomerId("");
    setEditingServiceId("");
    setStorageStatus({ target: "project-folder", message: "Lokale Datei aktiv" });
    showSaveMessage("Alle Daten wurden zurückgesetzt.");
  };

  const renderInvoicePreview = () => (
    <Card className="w-full max-w-full overflow-hidden rounded-2xl shadow-sm print:border-0 print:shadow-none">
      <CardHeader className="border-b print:border-b"><CardTitle className="text-xl sm:text-2xl">Rechnungsvorschau</CardTitle></CardHeader>
      <CardContent className="min-w-0 p-4 sm:p-5 md:p-6">
        <div className="space-y-8 text-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
              {shouldShowCompanyBranding(invoice) && invoice.companyLogoPath ? (
                <img
                  src={invoice.companyLogoPath}
                  alt={`Logo ${invoice.companyName || "Firma"}`}
                  className="h-14 max-w-[120px] object-contain object-left sm:h-16 sm:max-w-[140px]"
                />
              ) : null}
              <div className="min-w-0">
                <h2 className="break-words text-xl font-bold sm:text-2xl">{invoice.companyName || "Firmenname"}</h2>
                <p className="whitespace-pre-line break-words text-slate-600">{invoice.companyAddress}</p>
                <p className="break-words text-slate-600">{invoice.companyEmail}</p>
                <p className="break-words text-slate-600">{invoice.companyPhone}</p>
                {shouldShowCompanyBranding(invoice) && invoice.companyWebsite ? (
                  <p className="break-words text-slate-600">{renderWebsiteLink(invoice.companyWebsite, "text-slate-600 underline-offset-2 hover:underline")}</p>
                ) : null}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">RECHNUNG</h3>
              <p><span className="font-medium">Nr.:</span> {invoice.invoiceNumber}</p>
              <p><span className="font-medium">Datum:</span> {invoice.invoiceDate}</p>
              <p><span className="font-medium">Fällig:</span> {invoice.dueDate}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Rechnung an</p>
            <p className="break-words text-base font-semibold">{invoice.customerName || "Kundenname"}</p>
            <p className="whitespace-pre-line break-words text-slate-600">{invoice.customerAddress || "Kundenadresse"}</p>
          </div>

          <div className="overflow-hidden rounded-2xl border">
            <table className="w-full table-fixed text-left text-[11px] sm:text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="w-[14%] px-2 py-2">Datum</th>
                  <th className="w-[27%] px-2 py-2">Leistung</th>
                  <th className="w-[10%] px-2 py-2">Menge</th>
                  <th className="w-[9%] px-2 py-2">Einheit</th>
                  <th className="w-[17%] px-2 py-2">Einzelpreis</th>
                  <th className="w-[11%] px-2 py-2">Diesel</th>
                  <th className="w-[12%] px-2 py-2 text-right">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="border-t align-top">
                    <td className="break-words px-2 py-2">{formatServiceDate(item.serviceDate)}</td>
                    <td className="break-words px-2 py-2">{item.description || "-"}</td>
                    <td className="break-words px-2 py-2">{item.quantity ?? item.hours}</td>
                    <td className="break-words px-2 py-2">{item.unit || ""}</td>
                    <td className="break-words px-2 py-2">
                      {currency(item.unitPrice)}
                      <span className="block break-words text-[10px] leading-tight text-slate-500">{normalizePriceMode(item.priceMode) === "gross" ? "brutto vereinbart" : "netto"}</span>
                    </td>
                    <td className="break-words px-2 py-2">{getLineFuel(item) > 0 ? formatFuel(getLineFuel(item)) : "-"}</td>
                    <td className="break-words px-2 py-2 text-right">{currency(getLineNetTotal(item, invoice.taxRate))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto w-full max-w-sm space-y-2 rounded-2xl border p-4">
            <SummaryRow label="Zwischensumme Netto" value={currency(subtotal)} />
            <SummaryRow label="Gesamt Dieselverbrauch" value={formatFuel(totalFuel)} />
            <SummaryRow label={`MwSt. (${invoice.taxRate}%)`} value={currency(taxAmount)} />
            <SummaryRow label="Gesamt Brutto" value={currency(total)} strong />
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Hinweis</p>
            <p className="whitespace-pre-line break-words text-slate-700">{invoice.notes}</p>
          </div>

          {invoice.companyBankName || invoice.companyIban || invoice.companyBic || invoice.companyTaxNumber || invoice.companyVatId ? (
            <div className="w-full max-w-sm rounded-2xl border p-4">
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-500">Bankdaten</p>
              <div className="grid gap-3 text-sm">
                {invoice.companyBankName ? <DetailRow label="Bank" value={invoice.companyBankName} /> : null}
                {invoice.companyIban ? <DetailRow label="IBAN" value={invoice.companyIban} /> : null}
                {invoice.companyBic ? <DetailRow label="BIC" value={invoice.companyBic} /> : null}
                {invoice.companyTaxNumber ? <DetailRow label="Steuernummer" value={invoice.companyTaxNumber} /> : null}
                {invoice.companyVatId ? <DetailRow label="USt-IdNr." value={invoice.companyVatId} /> : null}
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 p-3 pb-24 sm:p-4 sm:pb-24 md:p-8 md:pb-28 xl:pb-8 min-[1700px]:pr-[660px] print:bg-white">
      <main className="invoice-app-shell mx-auto grid w-full max-w-[1600px] grid-cols-1 items-start gap-4 md:gap-6">
        <section className="invoice-form-column grid min-w-0 gap-6 print:hidden">
          <div className="flex min-w-0 flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <img
                src={APP_LOGO_SRC}
                alt="HSRechnung"
                className="h-14 w-auto max-w-[230px] rounded-md border bg-white shadow-sm"
              />
              <div className="min-w-0">
                <h1 className="sr-only">HSRechnung</h1>
                <p className="text-sm text-slate-600">Mit Kundenspeicher, Dienstleistungsliste und Stundenauswahl.</p>
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:flex 2xl:max-w-[760px] 2xl:flex-wrap 2xl:justify-end">
              <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importDataFile} />
              <input ref={logoInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
              <Button className="w-full 2xl:w-auto" variant="outline" onClick={clearInvoiceItems}>
                <RotateCcw className="mr-2 h-4 w-4" /> Positionen leeren
              </Button>
              <Button className="w-full 2xl:w-auto" variant="outline" onClick={resetAll}>
                <RotateCcw className="mr-2 h-4 w-4" /> Alles zurücksetzen
              </Button>
              <Button className="w-full 2xl:w-auto" variant="outline" onClick={saveData}>
                <Save className="mr-2 h-4 w-4" /> Lokal speichern
              </Button>
              <Button className="w-full 2xl:w-auto" variant="outline" onClick={reloadLocalData}>
                <RotateCcw className="mr-2 h-4 w-4" /> Lokale Daten neu laden
              </Button>
              <Button className="w-full 2xl:w-auto" variant="outline" onClick={saveCurrentInvoice}>
                <Receipt className="mr-2 h-4 w-4" /> Rechnung speichern
              </Button>
              <Button className="w-full 2xl:w-auto" variant="outline" onClick={exportDataFile}>
                <Download className="mr-2 h-4 w-4" /> Daten exportieren
              </Button>
              <Button className="w-full 2xl:w-auto" variant="outline" onClick={triggerImportFile}>
                <Upload className="mr-2 h-4 w-4" /> Daten importieren
              </Button>
              <Button className="w-full 2xl:w-auto" onClick={() => saveInvoicePdfLocal()}>
                <Download className="mr-2 h-4 w-4" /> PDF lokal speichern
              </Button>
              <Button className="w-full 2xl:w-auto" variant="outline" onClick={printInvoice}>
                <Printer className="mr-2 h-4 w-4" /> Drucken
              </Button>
            </div>
          </div>

          {saveMessage ? (
            <div className="flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              {saveMessage.toLowerCase().includes("fehl") || saveMessage.toLowerCase().includes("block") ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>{saveMessage}</span>
            </div>
          ) : null}

          {lastPdfPath ? (
            <div className="flex flex-col gap-3 rounded-2xl border bg-white px-4 py-3 text-sm text-slate-700 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 break-words">PDF gespeichert: {lastPdfPath}</span>
              <Button className="w-full sm:w-auto" variant="outline" onClick={openPdfFolder}>
                <FolderOpen className="mr-2 h-4 w-4" /> PDF-Ordner öffnen
              </Button>
            </div>
          ) : null}

          <div
            className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
              storageStatus.target === "project-folder"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {storageStatus.message} · data/invoices.json ist die primäre lokale Datenquelle.
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <Euro className="h-5 w-5" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Netto</p>
                  <p className="text-xl font-bold">{currency(subtotal)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <Fuel className="h-5 w-5" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Diesel gesamt</p>
                  <p className="text-xl font-bold">{formatFuel(totalFuel)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <Receipt className="h-5 w-5" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Brutto</p>
                  <p className="text-xl font-bold">{currency(total)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Rechnungseinstellungen</CardTitle>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,auto)] md:items-end">
              <Field label="Aktuelle Rechnungsnummer">
                <Input
                  value={invoice.invoiceNumber}
                  onChange={(e) => {
                    const nextInvoiceNumber = e.target.value;
                    setInvoiceSettings((prev) => ({ ...prev, nextInvoiceNumber }));
                    setInvoice((prev) => ({ ...prev, invoiceNumber: nextInvoiceNumber }));
                  }}
                />
              </Field>
              <Button className="w-full md:w-auto" variant="outline" onClick={saveInvoiceNumberSetting}>
                <Save className="mr-2 h-4 w-4" /> Speichern
              </Button>
              <Button className="w-full md:w-auto" variant="outline" onClick={createNextInvoice}>
                <Plus className="mr-2 h-4 w-4" /> Neue Rechnung
              </Button>
              <p className="text-sm text-slate-500 md:col-span-3">
                Neue Rechnungen nutzen den Nummernkreis der aktiven Firma. Prefix und nächste Nummer pflegst du in den Firmendaten.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Rechnungen</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">Sortierte Übersicht aller lokal gespeicherten Rechnungen.</p>
                </div>
                <Button className="w-full sm:w-auto" variant="outline" onClick={saveCurrentInvoice}>
                  <Save className="mr-2 h-4 w-4" /> Aktuelle Rechnung sichern
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(150px,190px)_minmax(130px,150px)]">
                <Field label="Suche">
                  <Input
                    placeholder="Kunde, Rechnungsnummer oder Stichwort"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                  />
                </Field>
                <Field label="Sortieren nach">
                  <select className="h-10 rounded-md border bg-white px-3 text-sm" value={invoiceSort} onChange={(e) => setInvoiceSort(e.target.value)}>
                    {Object.entries(INVOICE_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Richtung">
                  <select className="h-10 rounded-md border bg-white px-3 text-sm" value={invoiceSortDirection} onChange={(e) => setInvoiceSortDirection(e.target.value)}>
                    <option value="desc">Absteigend</option>
                    <option value="asc">Aufsteigend</option>
                  </select>
                </Field>
              </div>
              {invoices.length ? (
                <>
                {visibleInvoices.map((entry) => (
                  <div key={entry.id} className={`grid min-w-0 gap-3 rounded-2xl border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)] sm:items-center ${selectedInvoice?.id === entry.id ? "border-slate-900 bg-slate-100" : ""}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-semibold">{entry.invoiceNumber}</p>
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{INVOICE_STATUSES[entry.status]}</span>
                      </div>
                      <p className="break-words text-sm text-slate-600">
                        {entry.customerName} · {entry.invoiceDate}
                      </p>
                      <p className="text-xs text-slate-500">Gespeichert: {new Date(entry.savedAt).toLocaleString("de-DE")}</p>
                      <p className="break-words text-sm font-medium text-slate-700">{currency(entry.grossTotal)}</p>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Button variant="outline" onClick={() => setSelectedInvoiceId(entry.id)}>Details</Button>
                      <Button variant="outline" onClick={() => openSavedInvoice(entry)}>Öffnen</Button>
                      <Button variant="ghost" size="icon" onClick={() => removeSavedInvoice(entry.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {visibleInvoices.length === 0 ? (
                  <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">Keine Rechnung passt zur Suche.</p>
                ) : null}
                {selectedInvoice ? (
                  <div className="rounded-2xl border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Detailansicht</p>
                        <h3 className="break-words text-lg font-semibold">{selectedInvoice.invoiceNumber}</h3>
                        <p className="break-words text-sm text-slate-600">{selectedInvoice.customerName}</p>
                      </div>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{INVOICE_STATUSES[selectedInvoice.status]}</span>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm">
                      <SummaryRow label="Rechnungsdatum" value={selectedInvoice.invoiceDate} />
                      <SummaryRow label="Netto" value={currency(selectedInvoice.subtotal)} />
                      <SummaryRow label={`MwSt. (${selectedInvoice.invoice.taxRate}%)`} value={currency(selectedInvoice.taxAmount)} />
                      <SummaryRow label="Brutto" value={currency(selectedInvoice.grossTotal)} strong />
                      <SummaryRow label="Diesel" value={formatFuel(selectedInvoice.totalFuel)} />
                    </div>
                    <div className="mt-4 rounded-2xl border">
                      {(selectedInvoice.invoice.items || []).map((item) => (
                        <div key={item.id} className="border-b p-3 last:border-b-0">
                          <p className="break-words font-medium">{item.description || "-"}</p>
                          <p className="text-sm text-slate-600">
                            {item.quantity} {item.unit} · {currency(item.unitPrice)} · {currency(getLineNetTotal(item, selectedInvoice.invoice.taxRate))}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => openSavedInvoice(selectedInvoice)}>Öffnen</Button>
                      <Button variant="outline" onClick={() => saveSavedInvoicePdfLocal(selectedInvoice)}>
                        <Download className="mr-2 h-4 w-4" /> PDF lokal speichern
                      </Button>
                      <Button variant="outline" onClick={() => printSavedInvoice(selectedInvoice)}>
                        <Printer className="mr-2 h-4 w-4" /> Drucken
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => removeSavedInvoice(selectedInvoice.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : null}
                </>
              ) : (
                <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                  Noch keine Rechnung gespeichert. Nutze „Rechnung speichern“, um diese Rechnung später wieder zu öffnen.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2"><Receipt className="h-5 w-5" /><CardTitle>Eigene Firmendaten</CardTitle></div>
                <span className="text-xs text-slate-500">Karte anklicken = als Absender übernehmen</span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid min-w-0 gap-4 rounded-2xl border p-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Firmenname"><Input placeholder="z. B. MaschinenLog" value={companyForm.companyName} onChange={(e) => updateCompanyField("companyName", e.target.value)} /></Field>
                <Field label="E-Mail"><Input placeholder="name@example.de" value={companyForm.companyEmail} onChange={(e) => updateCompanyField("companyEmail", e.target.value)} /></Field>
                <Field label="Telefon"><Input placeholder="+49 ..." value={companyForm.companyPhone} onChange={(e) => updateCompanyField("companyPhone", e.target.value)} /></Field>
                <Field label="MwSt. (%)"><Input type="number" min="0" step="0.1" value={companyForm.vatRate ?? companyForm.taxRate} onChange={(e) => updateCompanyField("vatRate", e.target.value)} /></Field>
                <Field label="Steuerart">
                  <select className="h-10 rounded-md border bg-white px-3 text-sm" value={companyForm.taxCategory || companyForm.companyTaxCategory || inferTaxCategory(companyForm.vatRate ?? companyForm.taxRate)} onChange={(e) => updateCompanyField("taxCategory", e.target.value)}>
                    {Object.entries(TAX_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Webseite"><Input type="url" placeholder="https://meinefirma.de" value={companyForm.companyWebsite} onChange={(e) => updateCompanyField("companyWebsite", e.target.value)} /></Field>
                <Field label="Bank"><Input value={companyForm.bankName || ""} onChange={(e) => updateCompanyField("bankName", e.target.value)} /></Field>
                <Field label="IBAN"><Input value={companyForm.iban || ""} onChange={(e) => updateCompanyField("iban", e.target.value)} /></Field>
                <Field label="BIC"><Input value={companyForm.bic || ""} onChange={(e) => updateCompanyField("bic", e.target.value)} /></Field>
                <Field label="Steuernummer"><Input value={companyForm.taxNumber || ""} onChange={(e) => updateCompanyField("taxNumber", e.target.value)} /></Field>
                <Field label="Umsatzsteuer-ID"><Input value={companyForm.vatId || ""} onChange={(e) => updateCompanyField("vatId", e.target.value)} /></Field>
                <Field label="Rechnungspräfix"><Input placeholder="RE" value={companyForm.invoicePrefix || "RE"} onChange={(e) => updateCompanyField("invoicePrefix", e.target.value)} /></Field>
                <Field label="Nächste Rechnungsnummer"><Input type="number" min="1" step="1" value={companyForm.nextInvoiceNumber || 1} onChange={(e) => updateCompanyField("nextInvoiceNumber", e.target.value)} /></Field>
                <div className="grid min-w-0 gap-2 md:col-span-2 xl:col-span-3">
                  <Label>Adresse</Label>
                  <Textarea placeholder={"Straße und Hausnummer\nPLZ Ort"} value={companyForm.companyAddress} onChange={(e) => updateCompanyField("companyAddress", e.target.value)} rows={4} />
                </div>
                <div className="grid min-w-0 gap-3 rounded-2xl border bg-slate-50 p-4 md:col-span-2 xl:col-span-3">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Label>Logo</Label>
                      <p className="mt-1 break-words text-sm text-slate-600">
                        {companyForm.companyLogoFileName || "Kein Logo gespeichert"}
                      </p>
                    </div>
                    <Button className="w-full sm:w-auto" variant="outline" onClick={triggerLogoFile}>
                      <Upload className="mr-2 h-4 w-4" /> Logo hochladen
                    </Button>
                  </div>
                  {companyForm.companyLogoPath ? (
                    <img
                      src={companyForm.companyLogoPath}
                      alt={`Logo ${companyForm.companyName || "Firma"}`}
                      className="h-16 max-w-[160px] object-contain object-left"
                    />
                  ) : null}
                  <p className="text-sm text-slate-500">Erlaubt sind png, jpg, jpeg, webp und svg bis 5 MB. Das Logo wird im Projektordner unter data/logos gespeichert.</p>
                </div>
                <Button className="w-full sm:w-auto" onClick={saveCompanyProfile}>
                  {editingCompanyId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingCompanyId ? "Änderungen speichern" : "Neue Firma speichern"}
                </Button>
                {editingCompanyId ? (
                  <Button className="w-full sm:w-auto" variant="outline" onClick={cancelCompanyEdit}><X className="mr-2 h-4 w-4" /> Abbrechen</Button>
                ) : hasCompanySettings(companyForm) ? (
                  <Button className="w-full sm:w-auto" variant="outline" onClick={startNewCompanyProfile}><X className="mr-2 h-4 w-4" /> Formular leeren</Button>
                ) : null}
              </div>

              <div className="grid min-w-0 gap-3">
                {companyProfiles.length ? (
                  companyProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => applyCompanyProfile(profile.id)}
                      onKeyDown={(event) => handleSelectableCardKeyDown(event, () => applyCompanyProfile(profile.id))}
                      className={`flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition hover:border-slate-400 hover:bg-slate-50 sm:flex-row sm:justify-between ${companySettings.id === profile.id ? "border-slate-900 bg-slate-100" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{profile.companyName || "Ohne Firmenname"}</p>
                        <p className="whitespace-pre-line break-words text-sm text-slate-600">{profile.address || profile.companyAddress || "Keine Adresse"}</p>
                        <p className="mt-1 flex items-center gap-2 break-words text-sm text-slate-600"><Mail className="h-4 w-4" />{profile.email || profile.companyEmail || "Keine E-Mail"}</p>
                        <p className="break-words text-sm text-slate-600">{profile.phone || profile.companyPhone || "Keine Telefonnummer"}</p>
                        <p className="break-words text-sm text-slate-600">
                          {profile.website || profile.companyWebsite
                            ? renderWebsiteLink(profile.website || profile.companyWebsite, "text-slate-600 underline-offset-2 hover:underline")
                            : "Keine Webseite"}
                        </p>
                        <p className="text-sm text-slate-600">MwSt.: {Number(profile.vatRate ?? profile.taxRate ?? 19).toLocaleString("de-DE")}%</p>
                        <p className="text-sm text-slate-600">Nummernkreis: {(profile.invoicePrefix || "RE")}-{String(Number(profile.nextInvoiceNumber || 1)).padStart(5, "0")}</p>
                        {profile.bankName ? <p className="break-words text-sm text-slate-600">Bank: {profile.bankName}</p> : null}
                        {profile.iban ? <p className="break-words text-sm text-slate-600">IBAN: {profile.iban}</p> : null}
                        {profile.taxNumber ? <p className="break-words text-sm text-slate-600">Steuernummer: {profile.taxNumber}</p> : null}
                        {profile.vatId ? <p className="break-words text-sm text-slate-600">USt-ID: {profile.vatId}</p> : null}
                        {(profile.logoPath || profile.companyLogoPath) ? (
                          <img
                            src={profile.logoPath || profile.companyLogoPath}
                            alt={`Logo ${profile.companyName || "Firma"}`}
                            className="mt-3 h-10 max-w-[120px] object-contain object-left"
                          />
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            editCompanyProfile(profile);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" /> Bearbeiten
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCompanyProfile(profile.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                    Noch kein Firmenprofil gespeichert. Lege eigene Absenderprofile an und übernimm sie per Klick in die Rechnung.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2"><UserPlus className="h-5 w-5" /><CardTitle>Kundenspeicher</CardTitle></div>
                <span className="text-xs text-slate-500">Karte anklicken = übernehmen</span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid min-w-0 gap-4 rounded-2xl border p-4 md:grid-cols-2">
                <Field label="Kundenname"><Input value={newCustomer.name} onChange={(e) => setNewCustomer((prev) => ({ ...prev, name: e.target.value }))} /></Field>
                <Field label="E-Mail-Adresse"><Input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))} /></Field>
                <div className="grid min-w-0 gap-2 md:col-span-2">
                  <Label>Adresse</Label>
                  <Textarea value={newCustomer.address} onChange={(e) => setNewCustomer((prev) => ({ ...prev, address: e.target.value }))} rows={3} />
                </div>
                <Button className="w-full sm:w-auto" onClick={addCustomer}>
                  {editingCustomerId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingCustomerId ? "Änderungen speichern" : "Kunde speichern"}
                </Button>
                {editingCustomerId ? (
                  <Button className="w-full sm:w-auto" variant="outline" onClick={cancelCustomerEdit}><X className="mr-2 h-4 w-4" /> Abbrechen</Button>
                ) : null}
              </div>

              <div className="grid gap-3">
                {customers.map((customer) => (
                  <div
                    key={customer.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => applyCustomerToInvoice(customer.id)}
                    onKeyDown={(event) => handleSelectableCardKeyDown(event, () => applyCustomerToInvoice(customer.id))}
                    className={`flex min-w-0 w-full flex-col gap-3 rounded-2xl border p-4 text-left transition hover:border-slate-400 hover:bg-slate-50 sm:flex-row sm:justify-between ${invoice.customerId === customer.id ? "border-slate-900 bg-slate-100" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{customer.name}</p>
                      <p className="whitespace-pre-line break-words text-sm text-slate-600">{customer.address || "Keine Adresse"}</p>
                      <p className="mt-1 flex items-center gap-2 break-words text-sm text-slate-600"><Mail className="h-4 w-4" />{customer.email || "Keine E-Mail"}</p>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          editCustomer(customer);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" /> Bearbeiten
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCustomer(customer.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2"><Wrench className="h-5 w-5" /><CardTitle>Leistungen & Artikel</CardTitle></div>
                <span className="text-xs text-slate-500">Menge wählen, dann zur Rechnung hinzufügen</span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid min-w-0 gap-4 rounded-2xl border p-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Typ">
                  <select
                    className="h-10 rounded-md border bg-white px-3 text-sm"
                    value={newService.type}
                    onChange={(e) => setNewService((prev) => ({ ...prev, type: e.target.value, unit: e.target.value === "service" ? "h" : e.target.value === "fixed" ? "Stück" : prev.unit }))}
                  >
                    {Object.entries(ENTRY_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Name"><Input value={newService.name} onChange={(e) => setNewService((prev) => ({ ...prev, name: e.target.value }))} /></Field>
                {newService.type === "quantity" ? (
                  <Field label="Einheit"><Input placeholder="m³, t, Stück, l, kg" value={newService.unit} onChange={(e) => setNewService((prev) => ({ ...prev, unit: e.target.value }))} /></Field>
                ) : null}
                <Field label="Preisangabe">
                  <select
                    className="h-10 rounded-md border bg-white px-3 text-sm"
                    value={newService.priceMode}
                    onChange={(e) => setNewService((prev) => ({ ...prev, priceMode: e.target.value }))}
                  >
                    {Object.entries(PRICE_MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label={newService.type === "service" ? "Preis pro Stunde (€)" : newService.type === "fixed" ? "Festpreis (€)" : "Preis pro Einheit (€)"}>
                  <Input type="number" min="0" step="0.01" value={newService.pricePerUnit || newService.pricePerHour} onChange={(e) => setNewService((prev) => ({ ...prev, pricePerUnit: e.target.value, pricePerHour: e.target.value }))} />
                </Field>
                {newService.type === "service" ? (
                  <Field label="Dieselverbrauch pro Stunde (l)">
                    <Input type="number" min="0" step="0.01" value={newService.fuelPerUnit || newService.fuelPerHour} onChange={(e) => setNewService((prev) => ({ ...prev, fuelPerUnit: e.target.value, fuelPerHour: e.target.value }))} />
                  </Field>
                ) : null}
                <Button className="w-full sm:w-auto" onClick={addService}>
                  {editingServiceId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingServiceId ? "Änderungen speichern" : "Eintrag speichern"}
                </Button>
                {editingServiceId ? (
                  <Button className="w-full sm:w-auto" variant="outline" onClick={cancelServiceEdit}><X className="mr-2 h-4 w-4" /> Abbrechen</Button>
                ) : null}
                <p className="text-sm text-slate-500 md:col-span-3">
                  Bei Bruttopreisen wird der vereinbarte Endpreis automatisch in Netto und MwSt. umgerechnet.
                </p>
              </div>

              <div className="grid min-w-0 gap-3">
                {services.map((service) => {
                  const entry = normalizeServiceEntry(service);
                  const selectedHours = serviceHours[service.id] ?? 1;
                  const selectedDate = serviceDates[service.id] || today();
                  const previewAmount = Number(selectedHours || 0) * Number(entry.pricePerUnit || 0);
                  const previewFuel = Number(selectedHours || 0) * Number(entry.fuelPerUnit || 0);
                  return (
                    <div key={service.id} className="grid min-w-0 gap-4 rounded-2xl border p-4">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{entry.name}</p>
                        <p className="text-sm text-slate-600">Typ: {ENTRY_TYPES[entry.type]}</p>
                        <p className="text-sm text-slate-600">Preis: {currency(entry.pricePerUnit)} / {entry.unit} · {normalizePriceMode(entry.priceMode) === "gross" ? "brutto vereinbart" : "netto"}</p>
                        {entry.type === "service" ? <p className="text-sm text-slate-600">Dieselverbrauch pro Stunde: {formatFuel(entry.fuelPerUnit)}</p> : null}
                        <p className="mt-2 break-words text-sm font-medium text-slate-700">
                          Vorschau: {currency(previewAmount)}{previewFuel > 0 ? ` · Diesel: ${formatFuel(previewFuel)}` : ""}
                        </p>
                      </div>
                      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_40px] 2xl:items-end">
                        <Field label={entry.type === "service" ? "Stunden" : "Menge"}><Input type="number" min="0.25" step="0.25" value={selectedHours} onChange={(e) => setServiceHours((prev) => ({ ...prev, [service.id]: e.target.value }))} /></Field>
                        <Field label="Leistungsdatum"><Input type="date" value={selectedDate} onChange={(e) => setServiceDates((prev) => ({ ...prev, [service.id]: e.target.value }))} /></Field>
                        <Button className="w-full xl:w-auto" onClick={() => addServiceToInvoice(service.id)}><Plus className="mr-2 h-4 w-4" /> Zur Rechnung</Button>
                        <Button className="w-full xl:w-auto" variant="outline" onClick={() => editService(service)}><Pencil className="mr-2 h-4 w-4" /> Bearbeiten</Button>
                        <Button variant="ghost" size="icon" onClick={() => removeService(service.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader><CardTitle>Kundendaten & Rechnung</CardTitle></CardHeader>
            <CardContent className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="grid min-w-0 gap-2 md:col-span-2">
                <Label>Gespeicherten Kunden auswählen</Label>
                <select className="h-10 rounded-md border bg-white px-3 text-sm" value={invoice.customerId} onChange={(e) => applyCustomerToInvoice(e.target.value)}>
                  <option value="">Bitte auswählen</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </div>
              <Field label="Kundenname"><Input value={invoice.customerName} onChange={(e) => updateField("customerName", e.target.value)} /></Field>
              <Field label="E-Mail-Adresse Kunde"><Input type="email" value={invoice.customerEmail} onChange={(e) => updateField("customerEmail", e.target.value)} /></Field>
              <Field label="Rechnungsnummer"><Input value={invoice.invoiceNumber} onChange={(e) => updateField("invoiceNumber", e.target.value)} /></Field>
              <Field label="Rechnungsdatum"><Input type="date" value={invoice.invoiceDate} onChange={(e) => updateField("invoiceDate", e.target.value)} /></Field>
              <Field label="Fällig am"><Input type="date" value={invoice.dueDate} onChange={(e) => updateField("dueDate", e.target.value)} /></Field>
              <Field label="Status">
                <select className="h-10 rounded-md border bg-white px-3 text-sm" value={normalizeInvoiceStatus(invoice.status)} onChange={(e) => updateField("status", e.target.value)}>
                  {Object.entries(INVOICE_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <label className="flex items-start gap-3 rounded-2xl border p-4 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={shouldShowCompanyBranding(invoice)}
                  onChange={(e) => updateField("showCompanyBranding", e.target.checked)}
                />
                <span>
                  <span className="block font-medium">Logo und Webseite auf Rechnung anzeigen</span>
                  <span className="block text-slate-500">Standardmäßig aktiv. Die Auswahl wird mit dieser Rechnung gespeichert.</span>
                </span>
              </label>
              <div className="grid min-w-0 gap-2 md:col-span-2">
                <Label>Kundenadresse</Label>
                <Textarea value={invoice.customerAddress} onChange={(e) => updateField("customerAddress", e.target.value)} rows={4} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Positionen der aktuellen Rechnung</CardTitle>
                <Button className="w-full sm:w-auto" variant="outline" onClick={addItem}><Plus className="mr-2 h-4 w-4" /> Position hinzufügen</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {invoice.items.map((item, index) => (
                <div key={item.id} className="grid min-w-0 gap-3 rounded-2xl border p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 2xl:items-end">
                  <div className="grid min-w-0 gap-2">
                    <Label>Leistung/Artikel {index + 1}</Label>
                    <select className="h-10 rounded-md border bg-white px-3 text-sm" value={item.serviceId} onChange={(e) => applyServiceToItem(item.id, e.target.value)}>
                      <option value="">Bitte auswählen</option>
                      {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                    </select>
                  </div>
                  <Field label="Beschreibung"><Input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} /></Field>
                  <Field label="Leistungsdatum"><Input type="date" value={item.serviceDate || ""} onChange={(e) => updateItem(item.id, "serviceDate", e.target.value)} /></Field>
                  <Field label="Menge"><Input type="number" min="0" step="0.25" value={item.quantity ?? item.hours} onChange={(e) => updateItem(item.id, "quantity", e.target.value)} /></Field>
                  <Field label="Einheit"><Input value={item.unit || ""} onChange={(e) => updateItem(item.id, "unit", e.target.value)} /></Field>
                  <Field label="Einzelpreis (€)"><Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(item.id, "unitPrice", e.target.value)} /></Field>
                  <Field label="Preisangabe">
                    <select className="h-10 rounded-md border bg-white px-3 text-sm" value={normalizePriceMode(item.priceMode)} onChange={(e) => updateItem(item.id, "priceMode", e.target.value)}>
                      {Object.entries(PRICE_MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Diesel (l/Einheit)"><Input type="number" min="0" step="0.01" value={item.fuelPerUnit ?? item.fuelPerHour} onChange={(e) => updateItem(item.id, "fuelPerUnit", e.target.value)} /></Field>
                  <div className="grid gap-2">
                    <Label>Netto</Label>
                    <div className="h-10 rounded-md border bg-slate-50 px-3 py-2 text-sm">{currency(getLineNetTotal(item, invoice.taxRate))}</div>
                  </div>
                  <Button className="w-full sm:col-span-2 xl:col-span-3 2xl:col-span-1 2xl:w-auto" variant="ghost" size="icon" onClick={() => removeItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader><CardTitle>Zusatzinfos</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Hinweis</Label>
                <Textarea value={invoice.notes} onChange={(e) => updateField("notes", e.target.value)} rows={4} />
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="invoice-preview-column hidden min-[1700px]:block">
          {renderInvoicePreview()}
        </aside>

      </main>

      <Button
        className="fixed bottom-4 right-4 z-30 shadow-lg min-[1700px]:hidden"
        onClick={() => setPreviewOpen(true)}
      >
        <Receipt className="mr-2 h-4 w-4" /> Rechnung ansehen
      </Button>

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/70 p-3 sm:items-center sm:p-6 min-[1700px]:hidden" role="dialog" aria-modal="true" aria-label="Rechnungsvorschau">
          <div className="relative max-h-[90dvh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl sm:mx-auto sm:max-w-4xl">
            <Button
              className="absolute right-3 top-3 z-10"
              variant="outline"
              size="icon"
              onClick={() => setPreviewOpen(false)}
              aria-label="Rechnungsvorschau schliessen"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="pt-12 sm:pt-10">
              {renderInvoicePreview()}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

