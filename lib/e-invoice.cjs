const fs = require("node:fs/promises");
const path = require("node:path");

const FACTUR_X_XML_FILE_NAME = "factur-x.xml";
const SUPPORTED_TAX_CATEGORIES = new Set(["standard", "reduced", "zero", "smallBusiness", "taxExempt", "agriculture24"]);

function asString(value) {
  return String(value ?? "").trim();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value) {
  return Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;
}

function formatAmount(value) {
  return roundMoney(value).toFixed(2);
}

function formatQuantity(value) {
  return asNumber(value).toFixed(4).replace(/\.?0+$/u, "");
}

function formatDate(value) {
  const [year, month, day] = asString(value).split("-");
  if (!year || !month || !day) return "";
  return `${year}${month}${day}`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeUnitCode(unit) {
  const normalized = asString(unit).toLowerCase();
  if (["h", "std", "stunde", "stunden"].includes(normalized)) return "HUR";
  if (["kg"].includes(normalized)) return "KGM";
  if (["t", "to", "tonne", "tonnen"].includes(normalized)) return "TNE";
  if (["l", "liter"].includes(normalized)) return "LTR";
  if (["m3", "m³", "cbm"].includes(normalized)) return "MTQ";
  return "C62";
}

function normalizePriceMode(mode) {
  return mode === "gross" ? "gross" : "net";
}

function getTaxMultiplier(taxRate) {
  return 1 + asNumber(taxRate) / 100;
}

function getLineNetTotal(item, fallbackTaxRate) {
  const taxRate = asNumber(item.taxRate, fallbackTaxRate);
  const rawTotal = asNumber(item.quantity ?? item.hours) * asNumber(item.unitPrice);
  return normalizePriceMode(item.priceMode) === "gross" ? rawTotal / getTaxMultiplier(taxRate) : rawTotal;
}

function getLineGrossTotal(item, fallbackTaxRate) {
  const taxRate = asNumber(item.taxRate, fallbackTaxRate);
  const rawTotal = asNumber(item.quantity ?? item.hours) * asNumber(item.unitPrice);
  return normalizePriceMode(item.priceMode) === "gross" ? rawTotal : rawTotal * getTaxMultiplier(taxRate);
}

function calculateInvoiceTotals(invoice) {
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const subtotal = items.reduce((sum, item) => sum + getLineNetTotal(item, invoice.taxRate), 0);
  const grossTotal = items.reduce((sum, item) => sum + getLineGrossTotal(item, invoice.taxRate), 0);

  return {
    subtotal: roundMoney(subtotal),
    taxAmount: roundMoney(grossTotal - subtotal),
    grossTotal: roundMoney(grossTotal),
  };
}

function getTaxCategory(invoice) {
  const explicit = asString(invoice.taxCategory || invoice.companyTaxCategory);
  if (SUPPORTED_TAX_CATEGORIES.has(explicit)) return explicit;
  const rate = asNumber(invoice.taxRate);
  if (rate === 7) return "reduced";
  if (rate === 0) return "zero";
  return "standard";
}

function getTaxCategoryCode(invoice) {
  const category = getTaxCategory(invoice);
  if (category === "smallBusiness" || category === "taxExempt" || category === "zero") return "Z";
  if (category === "agriculture24") return "S";
  return "S";
}

function getTaxExemptionReason(invoice) {
  const category = getTaxCategory(invoice);
  if (category === "smallBusiness") return "Kleinunternehmerregelung gemaess Paragraph 19 UStG";
  if (category === "taxExempt") return "Steuerfreie Leistung";
  if (category === "zero") return "Steuersatz 0 %";
  if (category === "agriculture24") return "Durchschnittssatzbesteuerung nach § 24 UStG";
  return "";
}

function normalizeInvoiceForEInvoice(invoice) {
  const taxCategory = getTaxCategory(invoice);
  const defaultTaxRate = asNumber(invoice.taxRate);
  const items = (Array.isArray(invoice.items) ? invoice.items : []).map((item, index) => {
    const taxRate = asNumber(item.taxRate, defaultTaxRate);
    const quantity = asNumber(item.quantity ?? item.hours);
    const netLineTotal = roundMoney(getLineNetTotal(item, defaultTaxRate));
    const grossLineTotal = roundMoney(getLineGrossTotal(item, defaultTaxRate));

    return {
      id: asString(item.id) || String(index + 1),
      lineId: String(index + 1),
      description: asString(item.description),
      serviceDate: asString(item.serviceDate),
      quantity,
      unit: asString(item.unit || (item.type === "service" ? "h" : "Stueck")),
      unitCode: normalizeUnitCode(item.unit),
      unitPrice: asNumber(item.unitPrice),
      priceMode: normalizePriceMode(item.priceMode),
      taxRate,
      taxCategory,
      taxCategoryCode: getTaxCategoryCode({ ...invoice, taxCategory, taxRate }),
      netLineTotal,
      grossLineTotal,
    };
  });
  const totals = calculateInvoiceTotals({ ...invoice, items });

  return {
    invoiceNumber: asString(invoice.invoiceNumber),
    invoiceDate: asString(invoice.invoiceDate),
    dueDate: asString(invoice.dueDate),
    currency: "EUR",
    taxRate: defaultTaxRate,
    taxCategory,
    taxCategoryCode: getTaxCategoryCode({ ...invoice, taxCategory }),
    taxExemptionReason: getTaxExemptionReason({ ...invoice, taxCategory }),
    seller: {
      name: asString(invoice.companyName),
      address: asString(invoice.companyAddress),
      email: asString(invoice.companyEmail),
      phone: asString(invoice.companyPhone),
      iban: asString(invoice.companyIban),
      bic: asString(invoice.companyBic),
      bankName: asString(invoice.companyBankName),
      taxNumber: asString(invoice.companyTaxNumber),
      vatId: asString(invoice.companyVatId),
    },
    buyer: {
      name: asString(invoice.customerName),
      address: asString(invoice.customerAddress),
      email: asString(invoice.customerEmail),
    },
    items,
    totals,
    notes: asString(invoice.notes),
  };
}

function validateEInvoiceData(invoice) {
  const normalized = normalizeInvoiceForEInvoice(invoice);
  const missingFields = [];

  if (!normalized.seller.name) missingFields.push("Rechnungsaussteller Name");
  if (!normalized.seller.address) missingFields.push("Rechnungsaussteller Adresse");
  if (!normalized.buyer.name) missingFields.push("Rechnungsempfaenger Name");
  if (!normalized.buyer.address) missingFields.push("Rechnungsempfaenger Adresse");
  if (!normalized.invoiceNumber) missingFields.push("Rechnungsnummer");
  if (!formatDate(normalized.invoiceDate)) missingFields.push("Rechnungsdatum");
  if (!normalized.seller.iban) missingFields.push("IBAN");
  if (!normalized.items.length) missingFields.push("Rechnungspositionen");

  normalized.items.forEach((item, index) => {
    const prefix = `Position ${index + 1}`;
    if (!item.description) missingFields.push(`${prefix} Beschreibung`);
    if (!item.serviceDate || !formatDate(item.serviceDate)) missingFields.push(`${prefix} Leistungsdatum`);
    if (!(item.quantity > 0)) missingFields.push(`${prefix} Menge`);
    if (!item.unit) missingFields.push(`${prefix} Einheit`);
    if (!(item.unitPrice >= 0)) missingFields.push(`${prefix} Einzelpreis`);
    if (!Number.isFinite(item.taxRate)) missingFields.push(`${prefix} Steuersatz`);
  });

  return {
    valid: missingFields.length === 0,
    missingFields,
    normalized,
  };
}

function buildAddressLines(address) {
  return asString(address)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderPostalTradeAddress(address) {
  const lines = buildAddressLines(address);
  const country = "DE";
  const lineOne = lines[0] || "";
  const lineTwo = lines[1] || "";
  const lineThree = lines.slice(2).join(", ");
  const lineMarkup = [
    `<ram:LineOne>${escapeXml(lineOne)}</ram:LineOne>`,
    lineTwo ? `<ram:LineTwo>${escapeXml(lineTwo)}</ram:LineTwo>` : "",
    lineThree ? `<ram:LineThree>${escapeXml(lineThree)}</ram:LineThree>` : "",
  ].join("");

  return `<ram:PostalTradeAddress>${lineMarkup}<ram:CountryID>${country}</ram:CountryID></ram:PostalTradeAddress>`;
}

function renderSellerContact(seller) {
  if (!seller.email && !seller.phone) return "";

  return `<ram:DefinedTradeContact>
    <ram:PersonName>${escapeXml(seller.name)}</ram:PersonName>
    ${seller.phone ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${escapeXml(seller.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ""}
    ${seller.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${escapeXml(seller.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ""}
  </ram:DefinedTradeContact>`;
}

function renderSellerTaxRegistration(seller) {
  const registrations = [];
  if (seller.vatId) {
    registrations.push(`<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${escapeXml(seller.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>`);
  }
  if (seller.taxNumber) {
    registrations.push(`<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${escapeXml(seller.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>`);
  }
  return registrations.join("");
}

function renderTaxExemption(reason) {
  return reason ? `<ram:ExemptionReason>${escapeXml(reason)}</ram:ExemptionReason>` : "";
}

function renderIncludedSupplyChainTradeLineItem(item, invoice) {
  const grossUnitPrice = item.priceMode === "gross" ? item.unitPrice : item.unitPrice * getTaxMultiplier(item.taxRate);
  const netUnitPrice = item.priceMode === "gross" ? item.unitPrice / getTaxMultiplier(item.taxRate) : item.unitPrice;

  return `<ram:IncludedSupplyChainTradeLineItem>
    <ram:AssociatedDocumentLineDocument>
      <ram:LineID>${escapeXml(item.lineId)}</ram:LineID>
    </ram:AssociatedDocumentLineDocument>
    <ram:SpecifiedTradeProduct>
      <ram:Name>${escapeXml(item.description)}</ram:Name>
    </ram:SpecifiedTradeProduct>
    <ram:SpecifiedLineTradeAgreement>
      <ram:GrossPriceProductTradePrice>
        <ram:ChargeAmount>${formatAmount(grossUnitPrice)}</ram:ChargeAmount>
      </ram:GrossPriceProductTradePrice>
      <ram:NetPriceProductTradePrice>
        <ram:ChargeAmount>${formatAmount(netUnitPrice)}</ram:ChargeAmount>
      </ram:NetPriceProductTradePrice>
    </ram:SpecifiedLineTradeAgreement>
    <ram:SpecifiedLineTradeDelivery>
      <ram:BilledQuantity unitCode="${escapeXml(item.unitCode)}">${formatQuantity(item.quantity)}</ram:BilledQuantity>
    </ram:SpecifiedLineTradeDelivery>
    <ram:SpecifiedLineTradeSettlement>
      <ram:ApplicableTradeTax>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:CategoryCode>${escapeXml(item.taxCategoryCode)}</ram:CategoryCode>
        <ram:RateApplicablePercent>${formatAmount(item.taxRate)}</ram:RateApplicablePercent>
        ${renderTaxExemption(invoice.taxExemptionReason)}
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementLineMonetarySummation>
        <ram:LineTotalAmount>${formatAmount(item.netLineTotal)}</ram:LineTotalAmount>
      </ram:SpecifiedTradeSettlementLineMonetarySummation>
    </ram:SpecifiedLineTradeSettlement>
  </ram:IncludedSupplyChainTradeLineItem>`;
}

function generateFacturXCiiXml(invoice) {
  const validation = validateEInvoiceData(invoice);
  const normalized = validation.normalized;
  const issueDate = formatDate(normalized.invoiceDate);
  const dueDate = formatDate(normalized.dueDate);
  const taxBasis = normalized.totals.subtotal;
  const taxTotal = normalized.totals.taxAmount;
  const grandTotal = normalized.totals.grossTotal;

  const paymentMeans = normalized.seller.iban
    ? `<ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:TypeCode>58</ram:TypeCode>
      <ram:PayeePartyCreditorFinancialAccount>
        <ram:IBANID>${escapeXml(normalized.seller.iban.replace(/\s+/gu, ""))}</ram:IBANID>
      </ram:PayeePartyCreditorFinancialAccount>
      ${normalized.seller.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${escapeXml(normalized.seller.bic.replace(/\s+/gu, ""))}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}
    </ram:SpecifiedTradeSettlementPaymentMeans>`
    : "";

  const dueDateMarkup = dueDate
    ? `<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${dueDate}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>`
    : "";

  const lineItems = normalized.items.map((item) => renderIncludedSupplyChainTradeLineItem(item, normalized)).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(normalized.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${issueDate}</udt:DateTimeString></ram:IssueDateTime>
    ${normalized.notes ? `<ram:IncludedNote><ram:Content>${escapeXml(normalized.notes)}</ram:Content></ram:IncludedNote>` : ""}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${lineItems}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${escapeXml(normalized.buyer.name || normalized.invoiceNumber)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(normalized.seller.name)}</ram:Name>
        ${renderSellerContact(normalized.seller)}
        ${renderPostalTradeAddress(normalized.seller.address)}
        ${normalized.seller.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${escapeXml(normalized.seller.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}
        ${renderSellerTaxRegistration(normalized.seller)}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(normalized.buyer.name)}</ram:Name>
        ${renderPostalTradeAddress(normalized.buyer.address)}
        ${normalized.buyer.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${escapeXml(normalized.buyer.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      ${normalized.items[0]?.serviceDate ? `<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${formatDate(normalized.items[0].serviceDate)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : ""}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(normalized.currency)}</ram:InvoiceCurrencyCode>
      ${paymentMeans}
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${formatAmount(taxTotal)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${renderTaxExemption(normalized.taxExemptionReason)}
        <ram:BasisAmount>${formatAmount(taxBasis)}</ram:BasisAmount>
        <ram:CategoryCode>${escapeXml(normalized.taxCategoryCode)}</ram:CategoryCode>
        <ram:RateApplicablePercent>${formatAmount(normalized.taxRate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      ${dueDateMarkup}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${formatAmount(taxBasis)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${formatAmount(taxBasis)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${escapeXml(normalized.currency)}">${formatAmount(taxTotal)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${formatAmount(grandTotal)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${formatAmount(grandTotal)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;

  return {
    xml,
    validation,
    fileName: FACTUR_X_XML_FILE_NAME,
  };
}

function sanitizeFilePart(value, fallback) {
  const cleaned = asString(value)
    .replace(/\s+/gu, "-")
    .replace(/[<>:"/\\|?*\x00-\x1f]/gu, "")
    .replace(/\.+$/gu, "")
    .slice(0, 80);
  return cleaned || fallback;
}

async function uniqueXmlPath(outputDir, invoice) {
  await fs.mkdir(outputDir, { recursive: true });
  const invoiceNumber = sanitizeFilePart(invoice.invoiceNumber, "Ohne-Nummer");
  const customerName = sanitizeFilePart(invoice.customerName, "Ohne-Kunde");
  const invoiceDate = sanitizeFilePart(invoice.invoiceDate, new Date().toISOString().slice(0, 10));
  const baseName = `Rechnung_${invoiceNumber}_${customerName}_${invoiceDate}`;

  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? "" : `_${index}`;
    const fileName = `${baseName}${suffix}.xml`;
    const filePath = path.join(outputDir, fileName);
    try {
      await fs.access(filePath);
    } catch (error) {
      if (error.code === "ENOENT") return { fileName, filePath };
      throw error;
    }
  }

  throw new Error("Kein freier XML-Dateiname gefunden.");
}

async function createEInvoiceXmlFile(invoice, outputDir) {
  const generated = generateFacturXCiiXml(invoice);
  if (!generated.validation.valid) {
    return {
      success: false,
      missingFields: generated.validation.missingFields,
      fileName: null,
      filePath: null,
    };
  }

  const { fileName, filePath } = await uniqueXmlPath(outputDir, invoice);
  await fs.writeFile(filePath, generated.xml, "utf8");

  return {
    success: true,
    fileName,
    filePath,
    missingFields: [],
    xmlFileName: generated.fileName,
  };
}

module.exports = {
  FACTUR_X_XML_FILE_NAME,
  calculateInvoiceTotals,
  createEInvoiceXmlFile,
  generateFacturXCiiXml,
  normalizeInvoiceForEInvoice,
  validateEInvoiceData,
};
