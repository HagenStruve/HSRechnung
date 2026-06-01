const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");

const DEFAULT_APP_PORT = 5173;
const DEFAULT_API_PORT = 5174;
const HOST = "127.0.0.1";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const nodeCommand = process.execPath;

const children = [];
let shuttingDown = false;

function request(path, port, timeoutMs = 900) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: HOST,
        port,
        path,
        timeout: timeoutMs,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 400, statusCode: response.statusCode, body });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolve({ ok: false });
    });
    request.on("error", () => resolve({ ok: false }));
  });
}

async function isInvoiceApi(port) {
  const response = await request("/api/health", port);
  if (!response.ok) return false;

  try {
    const body = JSON.parse(response.body);
    return body?.ok === true && typeof body.dataFile === "string";
  } catch {
    return false;
  }
}

async function isInvoiceApp(port) {
  const health = await request("/api/health", port);
  if (!health.ok) return false;

  const page = await request("/", port);
  return page.ok && page.body.includes('id="root"');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function findFreePort(startPort, blockedPorts = new Set()) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (blockedPorts.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`Kein freier Port ab ${startPort} gefunden.`);
}

function openBrowser(url) {
  const command = isWindows ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = isWindows ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: isWindows && command === npmCommand,
    ...options,
  });
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) {
      console.log("");
      console.log("Die App konnte nicht vollstaendig gestartet werden.");
      console.log("Bitte pruefe, ob die Ports durch ein anderes Programm blockiert sind, und starte die App erneut.");
      shutdown(code);
    }
  });
  return child;
}

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

async function waitForApp(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isInvoiceApp(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function main() {
  console.log("HSRechnung wird gestartet...");

  if (await isInvoiceApp(DEFAULT_APP_PORT)) {
    const url = `http://${HOST}:${DEFAULT_APP_PORT}`;
    console.log("Die App laeuft bereits. Ich oeffne sie im Browser.");
    openBrowser(url);
    return;
  }

  let apiPort = DEFAULT_API_PORT;
  const apiAlreadyRunning = await isInvoiceApi(DEFAULT_API_PORT);
  if (apiAlreadyRunning) {
    console.log(`Lokale Daten-API laeuft bereits auf Port ${DEFAULT_API_PORT}.`);
  } else if (!(await isPortFree(DEFAULT_API_PORT))) {
    apiPort = await findFreePort(DEFAULT_API_PORT + 1);
    console.log(`Die App läuft bereits oder Port ${DEFAULT_API_PORT} ist belegt.`);
    console.log(`Ich nutze stattdessen Port ${apiPort} für die lokale Daten-API.`);
  }

  const blockedAppPorts = new Set([apiPort]);
  const appPort = (await isPortFree(DEFAULT_APP_PORT))
    ? DEFAULT_APP_PORT
    : await findFreePort(DEFAULT_APP_PORT + 1, blockedAppPorts);
  if (appPort !== DEFAULT_APP_PORT) {
    console.log(`Port ${DEFAULT_APP_PORT} ist belegt. Ich nutze stattdessen Port ${appPort} für die App.`);
  }

  if (!apiAlreadyRunning) {
    start(nodeCommand, ["server.cjs"], {
      env: {
        ...process.env,
        INVOICE_API_PORT: String(apiPort),
      },
    });
  }

  start(npmCommand, ["run", "vite", "--", "--host", HOST, "--port", String(appPort), "--strictPort"], {
    env: {
      ...process.env,
      INVOICE_API_PORT: String(apiPort),
    },
  });

  const appReady = await waitForApp(appPort);
  const url = `http://${HOST}:${appPort}`;
  if (appReady) {
    console.log(`App ist bereit: ${url}`);
    openBrowser(url);
    return;
  }

  console.log("");
  console.log("Die App konnte nicht rechtzeitig gestartet werden.");
  console.log(`Bitte öffne manuell ${url} oder starte die App erneut.`);
  shutdown(1);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", () => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
});

main().catch((error) => {
  console.log("");
  console.log(error?.message || "Die App konnte nicht gestartet werden.");
  console.log("Bitte starte die App erneut oder pruefe, ob ein anderes Programm die benoetigten Ports belegt.");
  shutdown(1);
});
