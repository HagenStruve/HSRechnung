const DB_NAME = "rechnungsprogramm-offline";
const DB_VERSION = 1;
const STORE_NAME = "records";
const STATE_KEY = "app-state";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB wird von diesem Browser nicht unterstützt."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB konnte nicht geöffnet werden."));
  });
}

function runStore(mode, operation) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = operation(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB-Vorgang fehlgeschlagen."));
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("IndexedDB-Transaktion fehlgeschlagen."));
        };
      })
  );
}

export function loadIndexedDbState() {
  return runStore("readonly", (store) => store.get(STATE_KEY));
}

export function saveIndexedDbState(state) {
  return runStore("readwrite", (store) =>
    store.put(
      {
        ...state,
        savedAt: new Date().toISOString(),
      },
      STATE_KEY
    )
  );
}

export function clearIndexedDbState() {
  return runStore("readwrite", (store) => store.delete(STATE_KEY));
}
