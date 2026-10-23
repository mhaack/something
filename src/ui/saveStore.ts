/**
 * Spielstände im Browser (IndexedDB; große Karten passen nicht in localStorage). Jeder Eintrag
 * hält die Metadaten getrennt, damit die Liste ohne die ganzen Spielstände geladen werden kann.
 */
import type { SaveMeta } from '../sim/save';

const DB = 'kleine-siedler';
const META = 'meta';
const DATA = 'data';

export interface SlotInfo {
  slot: string;
  meta: SaveMeta;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('noStorage'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META);
      req.result.createObjectStore(DATA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('noStorage'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('storage'));
    tx.onabort = () => reject(tx.error ?? new Error('storage'));
  });
}

export async function listSaves(): Promise<SlotInfo[]> {
  const db = await open();
  const tx = db.transaction(META, 'readonly');
  const store = tx.objectStore(META);
  const out: SlotInfo[] = [];
  await new Promise<void>((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve();
      out.push({ slot: String(c.key), meta: c.value as SaveMeta });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

export async function writeSave(slot: string, meta: SaveMeta, json: string): Promise<void> {
  const db = await open();
  const tx = db.transaction([META, DATA], 'readwrite');
  tx.objectStore(DATA).put(json, slot);
  tx.objectStore(META).put(meta, slot);
  await done(tx);
  db.close();
}

export async function readSave(slot: string): Promise<string | null> {
  const db = await open();
  const tx = db.transaction(DATA, 'readonly');
  const json = await new Promise<string | null>((resolve, reject) => {
    const req = tx.objectStore(DATA).get(slot);
    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return json;
}

export async function deleteSave(slot: string): Promise<void> {
  const db = await open();
  const tx = db.transaction([META, DATA], 'readwrite');
  tx.objectStore(DATA).delete(slot);
  tx.objectStore(META).delete(slot);
  await done(tx);
  db.close();
}

/** Bietet einen Spielstand als Datei zum Herunterladen an. */
export function downloadSave(fileName: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lässt den Spieler eine Spielstanddatei auswählen. */
export function pickSaveFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    });
    input.click();
  });
}
