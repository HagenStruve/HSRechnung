import { clearIndexedDbState, loadIndexedDbState, saveIndexedDbState } from "./indexedDb.js";

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function loadAppState() {
  try {
    const fileState = await requestJson("/api/state", { method: "GET" });
    return { target: "project-folder", state: fileState };
  } catch (error) {
    console.warn("Projektordner-Speicher nicht erreichbar. IndexedDB wird als Fallback genutzt.", error);
  }

  const fallbackState = await loadIndexedDbState();
  return {
    target: "browser-fallback",
    state: fallbackState,
    warning: "Lokale Datei konnte nicht geladen werden. Browser-Fallback wird verwendet.",
  };
}

export async function saveAppState(state) {
  let projectFolderError = null;

  try {
    const saved = await requestJson("/api/state", {
      method: "PUT",
      body: JSON.stringify(state),
    });
    await saveIndexedDbState(saved);
    return { target: "project-folder", state: saved };
  } catch (error) {
    projectFolderError = error;
  }

  await saveIndexedDbState(state);
  throw new Error(
    `Projektordner-Speicher fehlgeschlagen. Daten wurden nur im Browser gespeichert. ${projectFolderError?.message || ""}`.trim()
  );
}

export async function clearAppState() {
  try {
    await requestJson("/api/state", { method: "DELETE" });
  } catch (error) {
    console.warn("Projektordner-Speicher konnte nicht geleert werden.", error);
  }
  await clearIndexedDbState();
}
