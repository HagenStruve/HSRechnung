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

async function assertFileNonEmpty(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) {
    throw new Error(message);
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

async function uniqueFacturXPdfPath(outputDir, invoice) {
  await fs.mkdir(outputDir, { recursive: true });
  const invoiceNumber = sanitizeFilePart(invoice.invoiceNumber, "Ohne-Nummer");
  const baseName = `Rechnung_${invoiceNumber}_factur-x`;

  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? "" : `_${index}`;
    const fileName = `${baseName}${suffix}.pdf`;
    const filePath = path.join(outputDir, fileName);
    try {
      await fs.access(filePath);
    } catch (error) {
      if (error.code === "ENOENT") return { fileName, filePath };
      throw error;
    }
  }

  throw new Error("Kein freier Factur-X-PDF-Dateiname gefunden.");
}

async function copyXmlAsFacturX(xmlPath, targetDir) {
  const targetPath = path.join(targetDir, "factur-x.xml");
  await fs.copyFile(xmlPath, targetPath);
  return targetPath;
}

async function combinePdfAndXml(jarPath, sourcePdfPath, xmlPath, outputPdfPath, cwd) {
  const commonArgs = [
    "--action",
    "combine",
    "--source",
    sourcePdfPath,
    "--source-xml",
    xmlPath,
    "--out",
    outputPdfPath,
    "--format",
    "fx",
    "--version",
    "1",
    "--no-additional-attachments",
  ];
  const profiles = ["E", "EN16931"];
  let lastError = null;

  for (const profile of profiles) {
    try {
      const result = await runMustang(jarPath, [...commonArgs, "--profile", profile], { cwd });
      await assertFileNonEmpty(outputPdfPath, `Mustang hat mit Profil ${profile} keine kombinierte Factur-X-PDF erzeugt.`);
      return result;
    } catch (error) {
      lastError = error;
      await fs.rm(outputPdfPath, { force: true }).catch(() => {});
    }
  }

  throw lastError;
}

async function createPdfAFromXml(jarPath, xmlPath, outputPdfPath, cwd) {
  const result = await runMustang(
    jarPath,
    ["--action", "pdf", "--source", xmlPath, "--out", outputPdfPath, "--language", "de"],
    { cwd }
  );
  await assertFileNonEmpty(outputPdfPath, "Mustang hat keine PDF/A-Ausgabedatei erzeugt.");
  return result;
}

function getProcessText(errorOrResult) {
  return `${errorOrResult?.stdout || ""}\n${errorOrResult?.stderr || ""}`.trim();
}

async function hasEmbeddedFacturXXml(pdfPath) {
  const data = await fs.readFile(pdfPath);
  const latin = data.toString("latin1");
  return latin.includes("factur-x.xml") && latin.includes("/EmbeddedFiles");
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
    return {
      available: true,
      valid: true,
      skipped: false,
      reason: "",
      output: result.stdout || "",
    };
  } catch (error) {
    return {
      available: true,
      valid: false,
      skipped: false,
      reason: "Mustang-Validierung fehlgeschlagen.",
      output: getProcessText(error),
    };
  }
}

async function createFacturXPdf({ invoice, sourcePdfPath, xmlPath, outputDir, baseDir }) {
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
    };
  }

  const { fileName, filePath } = await uniqueFacturXPdfPath(outputDir, invoice);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "facturx-pdf-"));
  const facturXXmlPath = await copyXmlAsFacturX(xmlPath, tempDir);
  const visualPdfPath = path.join(tempDir, "mustang-source.pdf");
  let usedFallbackPdf = false;
  let combineError = null;

  try {
    try {
      await combinePdfAndXml(availability.jarPath, sourcePdfPath, facturXXmlPath, filePath, tempDir);
      await assertFileNonEmpty(filePath, "Mustang hat keine kombinierte Factur-X-PDF erzeugt.");
    } catch (error) {
      combineError = error;
      await createPdfAFromXml(availability.jarPath, facturXXmlPath, visualPdfPath, tempDir);
      usedFallbackPdf = true;
      await combinePdfAndXml(availability.jarPath, visualPdfPath, facturXXmlPath, filePath, tempDir);
      await assertFileNonEmpty(filePath, "Mustang hat keine kombinierte Factur-X-PDF aus dem Fallback erzeugt.");
    }

    const embeddedXml = await hasEmbeddedFacturXXml(filePath);
    const validation = await validateWithMustang(filePath, { baseDir });

    return {
      success: embeddedXml && validation.valid,
      skipped: false,
      reason: embeddedXml
        ? validation.valid
          ? ""
          : "Factur-X-PDF wurde erzeugt, aber Mustang-Validierung ist fehlgeschlagen."
        : "Factur-X-PDF wurde erzeugt, aber factur-x.xml wurde nicht erkannt.",
      fileName,
      filePath,
      validation,
      embeddedXml,
      usedFallbackPdf,
      sourcePdfWasPdfACompatible: !usedFallbackPdf,
      combineFallbackReason: combineError ? "Vorhandene PDF konnte nicht direkt kombiniert werden; Mustang-PDF/A-Fallback wurde genutzt." : "",
    };
  } catch (error) {
    await fs.rm(filePath, { force: true }).catch(() => {});
    return {
      success: false,
      skipped: false,
      reason: "Factur-X-PDF konnte mit Mustang nicht erzeugt werden.",
      fileName: null,
      filePath: null,
      validation: null,
      embeddedXml: false,
      usedFallbackPdf,
      sourcePdfWasPdfACompatible: false,
      errorOutput: getProcessText(error),
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
  validateWithMustang,
};
