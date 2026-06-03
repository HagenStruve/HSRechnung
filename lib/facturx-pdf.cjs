const childProcess = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const MUSTANG_VERSION = "2.23.1";
const MUSTANG_DOWNLOAD_URL = `https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/${MUSTANG_VERSION}/Mustang-CLI-${MUSTANG_VERSION}.jar`;

function asString(value) {
  return String(value ?? "").trim();
}

async function pathExists(filePath) {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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

async function findMustangCliJar(baseDir = path.resolve(__dirname, "..")) {
  const explicit = [process.env.MUSTANG_CLI_JAR, process.env.MUSTANG_JAR].map(asString).filter(Boolean);
  for (const candidate of explicit) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(baseDir, candidate);
    if (await pathExists(resolved)) return resolved;
  }

  const toolsDir = path.join(baseDir, "tools");
  if (!(await pathExists(toolsDir))) return "";

  const files = await fs.readdir(toolsDir).catch(() => []);
  const jar = files
    .filter((fileName) => /^Mustang-CLI-.*\.jar$/iu.test(fileName) || /^mustang.*\.jar$/iu.test(fileName))
    .sort()
    .reverse()[0];

  return jar ? path.join(toolsDir, jar) : "";
}

async function getMustangAvailability(baseDir) {
  const jarPath = await findMustangCliJar(baseDir);
  if (!jarPath) {
    return {
      available: false,
      reason: `Mustang CLI fehlt. Erwartet wird MUSTANG_CLI_JAR oder tools/Mustang-CLI-${MUSTANG_VERSION}.jar.`,
      jarPath: "",
    };
  }

  try {
    await execFileAsync("java", ["-version"], { timeout: 15000 });
  } catch {
    return {
      available: false,
      reason: "Java ist nicht verfuegbar oder nicht im PATH.",
      jarPath,
    };
  }

  return {
    available: true,
    reason: "",
    jarPath,
  };
}

async function runMustang(jarPath, args, options = {}) {
  return execFileAsync(
    "java",
    ["-Xmx1G", "-Dfile.encoding=UTF-8", "-jar", jarPath, ...args],
    {
      timeout: options.timeout || 120000,
      cwd: options.cwd,
    }
  );
}

async function compilePdfBoxEmbedder(jarPath, tempDir, baseDir = path.resolve(__dirname, "..")) {
  const sourcePath = path.join(baseDir, "tools", "facturx", "FacturXPdfBoxEmbedder.java");
  if (!(await pathExists(sourcePath))) {
    throw new Error("Factur-X PDFBox-Adapter fehlt unter tools/facturx/FacturXPdfBoxEmbedder.java.");
  }

  const classesDir = path.join(tempDir, "classes");
  await fs.mkdir(classesDir, { recursive: true });
  await execFileAsync(
    "javac",
    ["-encoding", "UTF-8", "-cp", jarPath, "-d", classesDir, sourcePath],
    { timeout: 60000, cwd: baseDir }
  );
  return classesDir;
}

async function embedXmlIntoPdfA3WithPdfBox(jarPath, sourcePdfPath, xmlPath, outputPdfPath, tempDir, baseDir) {
  const classesDir = await compilePdfBoxEmbedder(jarPath, tempDir, baseDir);
  const classPath = `${classesDir}${path.delimiter}${jarPath}`;
  return execFileAsync(
    "java",
    ["-cp", classPath, "tools.facturx.FacturXPdfBoxEmbedder", sourcePdfPath, xmlPath, outputPdfPath],
    { timeout: 120000, cwd: baseDir }
  );
}

async function assertFileNonEmpty(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) {
    throw new Error(message);
  }
}

async function inspectWithPdfBox(pdfPath, baseDir = path.resolve(__dirname, "..")) {
  const availability = await getMustangAvailability(baseDir);
  if (!availability.available) return null;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "facturx-inspect-"));
  try {
    const classesDir = await compilePdfBoxEmbedder(availability.jarPath, tempDir, baseDir);
    const classPath = `${classesDir}${path.delimiter}${availability.jarPath}`;
    const result = await execFileAsync(
      "java",
      ["-cp", classPath, "tools.facturx.FacturXPdfBoxEmbedder", "--inspect", pdfPath],
      { timeout: 120000, cwd: baseDir }
    );
    return Object.fromEntries(
      String(result.stdout || "")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf("=");
          return index === -1 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
        })
    );
  } catch {
    return null;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function sanitizeFilePart(value, fallback) {
  const cleaned = asString(value)
    .replace(/\s+/gu, "-")
    .replace(/[<>:"/\\|?*\x00-\x1f]/gu, "")
    .replace(/\.+$/gu, "")
    .slice(0, 80);
  return cleaned || fallback;
}

async function finalFacturXPdfPath(outputDir, invoice) {
  await fs.mkdir(outputDir, { recursive: true });
  const invoiceNumber = sanitizeFilePart(invoice.invoiceNumber, "Ohne-Nummer");
  const fileName = `Rechnung_${invoiceNumber}_factur-x.pdf`;
  return { fileName, filePath: path.join(outputDir, fileName) };
}

async function copyXmlAsFacturX(xmlPath, targetDir) {
  const targetPath = path.join(targetDir, "factur-x.xml");
  await fs.copyFile(xmlPath, targetPath);
  return targetPath;
}

function getProcessText(errorOrResult) {
  return `${errorOrResult?.stdout || ""}\n${errorOrResult?.stderr || ""}`.trim();
}

async function hasEmbeddedFacturXXml(pdfPath, options = {}) {
  const structured = await inspectWithPdfBox(pdfPath, options.baseDir);
  if (structured) return structured.hasFacturXXml === "true";

  const data = await fs.readFile(pdfPath);
  const latin = data.toString("latin1");
  return latin.includes("factur-x.xml") && latin.includes("/EmbeddedFiles");
}

async function inspectFacturXPdf(pdfPath, options = {}) {
  const data = await fs.readFile(pdfPath);
  const latin = data.toString("latin1");
  const structured = await inspectWithPdfBox(pdfPath, options.baseDir);
  const fileNames = [...new Set([...latin.matchAll(/\/(?:UF|F)\s*\(([^)]*)\)/g)].map((match) => match[1]))];
  const pdfaPart = [...new Set([...latin.matchAll(/<pdfaid:part>([^<]+)<\/pdfaid:part>/g)].map((match) => match[1]))];
  const pdfaConformance = [...new Set([...latin.matchAll(/<pdfaid:conformance>([^<]+)<\/pdfaid:conformance>/g)].map((match) => match[1]))];
  const pageCount = [...latin.matchAll(/\/Type\s*\/Page(?!s)\b/g)].length;
  const structuredFileNames = structured?.attachments
    ? structured.attachments.split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
  const structuredPdfaPart = structured?.pdfaPart ? [structured.pdfaPart] : [];
  const structuredPdfaConformance = structured?.pdfaConformance ? [structured.pdfaConformance] : [];

  return {
    bytes: data.length,
    pageCount: Number(structured?.pages || 0) || pageCount,
    embeddedFileNames: structuredFileNames.length ? structuredFileNames : fileNames,
    embeddedXmlFileName: (structuredFileNames.length ? structuredFileNames : fileNames).find((fileName) => fileName.toLowerCase() === "factur-x.xml") || "",
    hasEmbeddedFiles: structuredFileNames.length > 0 || latin.includes("/EmbeddedFiles"),
    hasFacturXXml: structured?.hasFacturXXml === "true" || (latin.includes("factur-x.xml") && latin.includes("/EmbeddedFiles")),
    pdfaPart: structuredPdfaPart.length ? structuredPdfaPart : pdfaPart,
    pdfaConformance: structuredPdfaConformance.length ? structuredPdfaConformance : pdfaConformance,
    pdfaVersion: (structuredPdfaPart.length && structuredPdfaConformance.length)
      ? `PDF/A-${structuredPdfaPart[0]}${structuredPdfaConformance[0]}`
      : pdfaPart.length && pdfaConformance.length ? `PDF/A-${pdfaPart[0]}${pdfaConformance[0]}` : "",
    profile: structured?.profile || (latin.includes("urn:cen.eu:en16931:2017") ? "urn:cen.eu:en16931:2017" : ""),
    hasHsrechnungLayout: structured?.hasHsrechnungLayout === "true",
    hasSampleLayout: structured?.hasSampleLayout === "true",
    hasMustangDataPage: structured?.hasMustangDataPage === "true",
  };
}

function summarizeMustangValidation(output) {
  const text = String(output || "");
  const failedMatches = [...text.matchAll(/<failed>(\d+)<\/failed>/g)].map((match) => Number(match[1]));
  const errorIds = [...new Set([...text.matchAll(/ErrorIDs:\s*\[([^\]]*)\]/g)]
    .flatMap((match) => match[1].split(",").map((entry) => entry.trim()).filter(Boolean)))];
  const summaryMatches = [...text.matchAll(/<summary status="([^"]+)"\/>/g)].map((match) => match[1]);
  const finalStatus = summaryMatches[summaryMatches.length - 1] || "";
  const failedRules = failedMatches.length ? Math.max(...failedMatches) : 0;
  const invalidSummaries = summaryMatches.filter((status) => status !== "valid").length;
  const xmlErrorTags = [...text.matchAll(/<error\b/giu)].length;
  const errorCount = Math.max(failedRules, errorIds.length, invalidSummaries, xmlErrorTags);

  return {
    finalStatus,
    failedRules,
    errorIds,
    errorCount,
  };
}

async function validateWithMustang(pdfPath, options = {}) {
  const availability = await getMustangAvailability(options.baseDir);
  if (!availability.available) {
    return {
      available: false,
      valid: false,
      skipped: true,
      reason: availability.reason,
      output: "",
    };
  }

  try {
    const result = await runMustang(
      availability.jarPath,
      ["--no-notices", "--action", "validate", "--source", pdfPath],
      { cwd: path.dirname(pdfPath), timeout: 180000 }
    );
    const summary = summarizeMustangValidation(result.stdout || "");
    return {
      available: true,
      valid: summary.finalStatus === "valid" && summary.errorCount === 0,
      skipped: false,
      reason: "",
      output: result.stdout || "",
      summary,
    };
  } catch (error) {
    const output = getProcessText(error);
    const summary = summarizeMustangValidation(output);
    return {
      available: true,
      valid: summary.finalStatus === "valid" && summary.errorCount === 0,
      skipped: false,
      reason: "Mustang-Validierung fehlgeschlagen.",
      output,
      summary,
    };
  }
}

async function createFacturXPdf({ invoice, sourcePdfPath, xmlPath, outputDir, outputFilePath, baseDir }) {
  const availability = await getMustangAvailability(baseDir);
  if (!availability.available) {
    return {
      success: false,
      skipped: true,
      reason: availability.reason,
      downloadUrl: MUSTANG_DOWNLOAD_URL,
      fileName: null,
      filePath: null,
      validation: null,
      embeddedXml: false,
      usedFallbackPdf: false,
      visibleLayout: "HSRechnung",
    };
  }

  const target = outputFilePath
    ? { fileName: path.basename(outputFilePath), filePath: outputFilePath }
    : await finalFacturXPdfPath(outputDir, invoice);
  const { fileName, filePath } = target;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "facturx-pdf-"));
  const facturXXmlPath = await copyXmlAsFacturX(xmlPath, tempDir);
  const workingOutputPath = path.join(tempDir, fileName);
  let embedError = null;

  try {
    try {
      await embedXmlIntoPdfA3WithPdfBox(availability.jarPath, sourcePdfPath, facturXXmlPath, workingOutputPath, tempDir, baseDir);
      await assertFileNonEmpty(workingOutputPath, "PDFBox-Adapter hat keine kombinierte Factur-X-PDF erzeugt.");
    } catch (error) {
      embedError = error;
      throw error;
    }

    const embeddedXml = await hasEmbeddedFacturXXml(workingOutputPath, { baseDir });
    const validation = await validateWithMustang(workingOutputPath, { baseDir });
    if (embeddedXml && validation.valid) {
      await fs.copyFile(workingOutputPath, filePath);
    }

    return {
      success: embeddedXml && validation.valid,
      skipped: false,
      reason: embeddedXml
        ? validation.valid
          ? ""
          : "Factur-X-PDF wurde im HSRechnung-Layout erzeugt, aber Mustang-Validierung ist fehlgeschlagen."
        : "Factur-X-PDF wurde erzeugt, aber factur-x.xml wurde nicht erkannt.",
      fileName,
      filePath,
      validation,
      embeddedXml,
      usedFallbackPdf: false,
      visibleLayout: "HSRechnung",
      sourcePdfWasPdfACompatible: true,
      combineFallbackReason: "",
    };
  } catch (error) {
    await fs.rm(filePath, { force: true }).catch(() => {});
    return {
      success: false,
      skipped: false,
      reason: "Factur-X-PDF konnte nicht validiert im HSRechnung-Layout erzeugt werden.",
      fileName: null,
      filePath: null,
      validation: null,
      embeddedXml: false,
      usedFallbackPdf: false,
      visibleLayout: "HSRechnung",
      sourcePdfWasPdfACompatible: false,
      errorOutput: getProcessText(embedError || error),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  MUSTANG_DOWNLOAD_URL,
  MUSTANG_VERSION,
  createFacturXPdf,
  getMustangAvailability,
  hasEmbeddedFacturXXml,
  inspectFacturXPdf,
  summarizeMustangValidation,
  validateWithMustang,
};
