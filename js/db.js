// Local storage: every table lives in memory (fast to read on each render) and is written to
// IndexedDB on the phone after each change. Photos are kept in IndexedDB only and read on demand.
// Rows are treated as immutable: changing one means putting a new object.

const DB_NAME = 'fitness-tracker';
const DB_VERSION = 1;

/** Store name → key path. Table names follow the Android backup's JSON keys. */
const STORES = {
  settings: 'id',
  weights: 'epochDay',
  measurements: 'epochDay',
  dailyLogs: 'epochDay',
  cardio: 'id',
  food: 'id',
  presets: 'id',
  exercises: 'id',
  templates: 'id',
  templateExercises: 'id',
  sessions: 'id',
  sets: 'id',
  photos: 'id',
  photoFiles: 'fileName',
  meta: 'key',
};

export const TABLES = Object.keys(STORES).filter((s) => s !== 'photoFiles' && s !== 'meta');

/** table → Map(key → row) */
export const tables = {};
const meta = new Map();
const seq = {};
let idb = null;
let version = 0;
const listeners = new Set();
let pending = [];
let flushing = null;
let onError = (e) => console.error(e);

const promisify = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

export function setErrorHandler(fn) {
  onError = fn;
}

/** Opens the database and reads every table into memory. */
export async function openDb() {
  idb = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close the app in other tabs and open it again.'));
  });
  idb.onversionchange = () => idb.close();
  const tx = idb.transaction([...TABLES, 'meta'], 'readonly');
  const reads = TABLES.map(async (name) => {
    const rows = await promisify(tx.objectStore(name).getAll());
    const map = new Map();
    const keyPath = STORES[name];
    for (const row of rows) map.set(row[keyPath], row);
    tables[name] = map;
  });
  reads.push(promisify(tx.objectStore('meta').getAll()).then((rows) => {
    for (const row of rows) meta.set(row.key, row.value);
  }));
  await Promise.all(reads);
  for (const name of TABLES) seq[name] = maxNumericKey(name);
}

function maxNumericKey(name) {
  let max = 0;
  for (const key of tables[name].keys()) if (typeof key === 'number' && key > max) max = key;
  return max;
}

/** The next free id for an auto-numbered table. */
export function nextId(table) {
  seq[table] = Math.max(seq[table] ?? 0, maxNumericKey(table)) + 1;
  return seq[table];
}

export const getVersion = () => version;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let notifyScheduled = false;
function changed() {
  version++;
  if (!notifyScheduled) {
    notifyScheduled = true;
    queueMicrotask(() => {
      notifyScheduled = false;
      for (const fn of listeners) fn(version);
    });
  }
  scheduleFlush();
}

// ------------------------------------------------------------------ writes

export function put(table, row) {
  const key = row[STORES[table]];
  tables[table].set(key, row);
  pending.push({ store: table, op: 'put', value: row });
  changed();
  return row;
}

export function putAll(table, rows) {
  for (const row of rows) {
    tables[table].set(row[STORES[table]], row);
    pending.push({ store: table, op: 'put', value: row });
  }
  changed();
}

export function del(table, key) {
  tables[table].delete(key);
  pending.push({ store: table, op: 'delete', key });
  changed();
}

export function clear(table) {
  tables[table].clear();
  seq[table] = 0;
  pending.push({ store: table, op: 'clear' });
  changed();
}

export const getMeta = (key, fallback = null) => (meta.has(key) ? meta.get(key) : fallback);

export function setMeta(key, value) {
  if (value == null) {
    meta.delete(key);
    pending.push({ store: 'meta', op: 'delete', key });
  } else {
    meta.set(key, value);
    pending.push({ store: 'meta', op: 'put', value: { key, value } });
  }
  changed();
}

let flushTimer = null;
function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 0);
}

/** Writes every pending change in one transaction. Resolves once it's on disk. */
export async function flush() {
  if (flushing) await flushing.catch(() => {});
  if (pending.length === 0 || !idb) return;
  const ops = pending;
  pending = [];
  const stores = [...new Set(ops.map((o) => o.store))];
  flushing = (async () => {
    const tx = idb.transaction(stores, 'readwrite');
    for (const o of ops) {
      const s = tx.objectStore(o.store);
      if (o.op === 'put') s.put(o.value);
      else if (o.op === 'delete') s.delete(o.key);
      else s.clear();
    }
    await done(tx);
  })();
  try {
    await flushing;
  } catch (e) {
    onError(e);
  } finally {
    flushing = null;
  }
}

// ------------------------------------------------------------------ photo files

/** Saves a photo's bytes ({ data: ArrayBuffer, type }) under [fileName]. */
export async function putFile(fileName, data, type) {
  const tx = idb.transaction('photoFiles', 'readwrite');
  tx.objectStore('photoFiles').put({ fileName, data, type });
  await done(tx);
}

export async function getFile(fileName) {
  const tx = idb.transaction('photoFiles', 'readonly');
  return promisify(tx.objectStore('photoFiles').get(fileName));
}

export async function deleteFile(fileName) {
  const tx = idb.transaction('photoFiles', 'readwrite');
  tx.objectStore('photoFiles').delete(fileName);
  await done(tx);
}

// Save whatever is pending when the app goes to the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', () => flush());
