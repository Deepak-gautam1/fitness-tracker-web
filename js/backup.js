// JSON backup / restore in the Android app's format (so data moves between the two), CSV exports,
// and photo ZIPs named by date and pose (2026-10-05_side.jpg), like the Android photo export.
// Restore parses the whole file before touching anything, so a bad file changes nothing.

import * as db from './db.js';
import * as repo from './repo.js';
import { Analytics, Fmt, Measure, Pose, defaultSettings, isSunday, isoDate, parseIsoDate, todayDay } from './domain.js';

const APP_ID = 'FitnessTracker';
const FORMAT = 1;

const SETTINGS_KEYS = Object.keys(defaultSettings(0)).filter((k) => k !== 'id');

// ------------------------------------------------------------------ JSON

export function exportJson() {
  const T = db.tables;
  const all = (t) => [...T[t].values()];
  const by = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
  const s = repo.settings();
  const root = {
    app: APP_ID,
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    settings: s ? Object.fromEntries(SETTINGS_KEYS.map((k) => [k, s[k] ?? null])) : null,
    weights: all('weights').sort(by('epochDay')).map((w) => ({ epochDay: w.epochDay, weightKg: w.weightKg, note: w.note ?? null })),
    measurements: all('measurements').sort(by('epochDay')).map((m) => ({
      epochDay: m.epochDay, waistCm: m.waistCm ?? null, neckCm: m.neckCm ?? null, bodyFatPercent: m.bodyFatPercent ?? null, note: m.note ?? null,
    })),
    dailyLogs: all('dailyLogs').sort(by('epochDay')).map((l) => ({
      epochDay: l.epochDay, waterMl: l.waterMl, steps: l.steps ?? null, sleepHours: l.sleepHours ?? null,
      creatine: !!l.creatine, noJunk: !!l.noJunk, restDay: !!l.restDay, note: l.note ?? null,
    })),
    cardio: all('cardio').sort((a, b) => a.epochDay - b.epochDay || a.id - b.id)
      .map((c) => ({ id: c.id, epochDay: c.epochDay, type: c.type, minutes: c.minutes, note: c.note ?? null })),
    food: all('food').sort((a, b) => a.epochDay - b.epochDay || a.createdAt - b.createdAt || a.id - b.id).map((f) => ({
      id: f.id, epochDay: f.epochDay, meal: f.meal, name: f.name, quantity: f.quantity, unit: f.unit, kcal: f.kcal,
      protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, createdAt: f.createdAt,
    })),
    presets: all('presets').map((p) => ({
      id: p.id, name: p.name, unit: p.unit, baseAmount: p.baseAmount, defaultAmount: p.defaultAmount, kcal: p.kcal,
      protein: p.protein, carbs: p.carbs, fat: p.fat, fiber: p.fiber, category: p.category, isCustom: !!p.isCustom,
      useCount: p.useCount ?? 0, lastUsedAt: p.lastUsedAt ?? 0,
    })),
    exercises: all('exercises').sort(by('id')).map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscleGroup, kind: e.kind, measure: e.measure })),
    templates: all('templates').sort(by('sortOrder')).map((t) => ({ id: t.id, name: t.name, hasAbs: !!t.hasAbs, dayOfWeek: t.dayOfWeek, sortOrder: t.sortOrder })),
    templateExercises: all('templateExercises').sort((a, b) => by('templateId')(a, b) || a.position - b.position).map((te) => ({
      id: te.id, templateId: te.templateId, exerciseId: te.exerciseId, position: te.position, sets: te.sets,
      repMin: te.repMin, repMax: te.repMax, restSeconds: te.restSeconds, notes: te.notes ?? null,
    })),
    sessions: all('sessions').sort(by('epochDay')).map((s2) => ({
      id: s2.id, epochDay: s2.epochDay, templateId: s2.templateId, startedAt: s2.startedAt ?? null, finishedAt: s2.finishedAt ?? null, notes: s2.notes ?? null,
    })),
    sets: all('sets').sort((a, b) => a.epochDay - b.epochDay || by('exerciseId')(a, b) || a.setNumber - b.setNumber).map((x) => ({
      id: x.id, sessionId: x.sessionId, epochDay: x.epochDay, exerciseId: x.exerciseId, setNumber: x.setNumber,
      weightKg: x.weightKg, reps: x.reps, rir: x.rir ?? null, completedAt: x.completedAt,
    })),
  };
  return JSON.stringify(root, null, 1);
}

class BadBackup extends Error {}

const need = (o, key, type = 'number') => {
  const v = o?.[key];
  if (type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) throw new BadBackup(`Missing ${key}`);
  if (type === 'string' && typeof v !== 'string') throw new BadBackup(`Missing ${key}`);
  if (type === 'boolean' && typeof v !== 'boolean') throw new BadBackup(`Missing ${key}`);
  return v;
};
const optNum = (o, key, fallback = null) => (typeof o?.[key] === 'number' && Number.isFinite(o[key]) ? o[key] : fallback);
const optStr = (o, key) => (typeof o?.[key] === 'string' ? o[key] : null);
const optBool = (o, key) => o?.[key] === true;
const list = (root, key, map) => (Array.isArray(root[key]) ? root[key].map(map) : []);

/** Reads a backup file's text; throws with a readable message. Returns the parsed, validated contents. */
export function parseBackup(text) {
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a Fitness Tracker backup.");
  }
  if (root?.app !== APP_ID) throw new Error("This file isn't a Fitness Tracker backup.");
  try {
    const d = defaultSettings(todayDay());
    let settings = null;
    if (root.settings && typeof root.settings === 'object') {
      settings = { id: 1 };
      for (const k of SETTINGS_KEYS) {
        const v = root.settings[k];
        if (k === 'phase2StartEpochDay') settings[k] = typeof v === 'number' ? v : null;
        else if (typeof d[k] === 'boolean') settings[k] = typeof v === 'boolean' ? v : d[k];
        else settings[k] = typeof v === 'number' && Number.isFinite(v) ? v : d[k];
      }
    }
    return {
      settings,
      weights: list(root, 'weights', (o) => ({ epochDay: need(o, 'epochDay'), weightKg: need(o, 'weightKg'), note: optStr(o, 'note') })),
      measurements: list(root, 'measurements', (o) => ({
        epochDay: need(o, 'epochDay'), waistCm: optNum(o, 'waistCm'), neckCm: optNum(o, 'neckCm'),
        bodyFatPercent: optNum(o, 'bodyFatPercent'), note: optStr(o, 'note'),
      })),
      dailyLogs: list(root, 'dailyLogs', (o) => ({
        epochDay: need(o, 'epochDay'), waterMl: optNum(o, 'waterMl', 0), steps: optNum(o, 'steps'), sleepHours: optNum(o, 'sleepHours'),
        creatine: optBool(o, 'creatine'), noJunk: optBool(o, 'noJunk'), restDay: optBool(o, 'restDay'), note: optStr(o, 'note'),
      })),
      cardio: list(root, 'cardio', (o) => ({
        id: need(o, 'id'), epochDay: need(o, 'epochDay'), type: need(o, 'type', 'string'), minutes: need(o, 'minutes'), note: optStr(o, 'note'),
      })),
      food: list(root, 'food', (o) => ({
        id: need(o, 'id'), epochDay: need(o, 'epochDay'), meal: need(o, 'meal', 'string'), name: need(o, 'name', 'string'),
        quantity: need(o, 'quantity'), unit: need(o, 'unit', 'string'), kcal: need(o, 'kcal'), protein: need(o, 'protein'),
        carbs: need(o, 'carbs'), fat: need(o, 'fat'), fiber: optNum(o, 'fiber', 0), createdAt: need(o, 'createdAt'),
      })),
      presets: list(root, 'presets', (o) => ({
        id: need(o, 'id'), name: need(o, 'name', 'string'), unit: need(o, 'unit', 'string'), baseAmount: need(o, 'baseAmount'),
        defaultAmount: need(o, 'defaultAmount'), kcal: need(o, 'kcal'), protein: need(o, 'protein'), carbs: need(o, 'carbs'),
        fat: need(o, 'fat'), fiber: optNum(o, 'fiber', 0), category: need(o, 'category', 'string'), isCustom: optBool(o, 'isCustom'),
        useCount: optNum(o, 'useCount', 0), lastUsedAt: optNum(o, 'lastUsedAt', 0),
      })),
      exercises: list(root, 'exercises', (o) => ({
        id: need(o, 'id', 'string'), name: need(o, 'name', 'string'), muscleGroup: need(o, 'muscleGroup', 'string'),
        kind: need(o, 'kind', 'string'), measure: need(o, 'measure', 'string'),
      })),
      templates: list(root, 'templates', (o) => ({
        id: need(o, 'id', 'string'), name: need(o, 'name', 'string'), hasAbs: need(o, 'hasAbs', 'boolean'),
        dayOfWeek: need(o, 'dayOfWeek'), sortOrder: need(o, 'sortOrder'),
      })),
      templateExercises: list(root, 'templateExercises', (o) => ({
        id: need(o, 'id'), templateId: need(o, 'templateId', 'string'), exerciseId: need(o, 'exerciseId', 'string'),
        position: need(o, 'position'), sets: need(o, 'sets'), repMin: need(o, 'repMin'), repMax: need(o, 'repMax'),
        restSeconds: need(o, 'restSeconds'), notes: optStr(o, 'notes'),
      })),
      sessions: list(root, 'sessions', (o) => ({
        id: need(o, 'id'), epochDay: need(o, 'epochDay'), templateId: need(o, 'templateId', 'string'),
        startedAt: optNum(o, 'startedAt'), finishedAt: optNum(o, 'finishedAt'), notes: optStr(o, 'notes'),
      })),
      sets: list(root, 'sets', (o) => ({
        id: need(o, 'id'), sessionId: need(o, 'sessionId'), epochDay: need(o, 'epochDay'), exerciseId: need(o, 'exerciseId', 'string'),
        setNumber: need(o, 'setNumber'), weightKg: need(o, 'weightKg'), reps: need(o, 'reps'), rir: optNum(o, 'rir'),
        completedAt: need(o, 'completedAt'),
      })),
    };
  } catch (e) {
    if (e instanceof BadBackup) throw new Error(`This backup file is damaged or incomplete (${e.message}).`);
    throw e;
  }
}

/** Replaces the app's data with a parsed backup (photos are kept). Returns a summary. */
export async function restore(b) {
  if (b.settings) db.put('settings', b.settings);
  const replace = (table, rows) => {
    db.clear(table);
    if (rows.length) db.putAll(table, rows);
  };
  replace('weights', b.weights);
  replace('measurements', b.measurements);
  replace('dailyLogs', b.dailyLogs);
  replace('cardio', b.cardio);
  replace('food', b.food);
  if (b.presets.length) replace('presets', b.presets);
  if (b.templates.length && b.exercises.length) {
    replace('templateExercises', b.templateExercises);
    replace('templates', b.templates);
    replace('exercises', b.exercises);
  }
  replace('sets', b.sets);
  replace('sessions', b.sessions);
  await db.flush();
  const days = new Set([...b.weights, ...b.dailyLogs, ...b.food, ...b.sets].map((x) => x.epochDay)).size;
  return { weighIns: b.weights.length, foods: b.food.length, sets: b.sets.length, days };
}

// ------------------------------------------------------------------ CSV

const csv = (value) => {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cells) => cells.map(csv).join(',');

/** One row per day: the spreadsheet view of the whole transformation. */
export function exportDailyCsv() {
  const T = db.tables;
  const trend = new Map(Analytics.trend(repo.weights()).map((t) => [t.epochDay, t]));
  const group = (rows) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.epochDay)) m.set(r.epochDay, []);
      m.get(r.epochDay).push(r);
    }
    return m;
  };
  const logs = T.dailyLogs;
  const foods = group([...T.food.values()]);
  const cardio = group([...T.cardio.values()]);
  const sessions = new Map([...T.sessions.values()].map((s) => [s.epochDay, s]));
  const sets = group([...T.sets.values()]);
  const measurements = T.measurements;
  const templates = T.templates;
  const days = [...new Set([...trend.keys(), ...logs.keys(), ...foods.keys(), ...cardio.keys(), ...sessions.keys(), ...sets.keys(), ...measurements.keys()])]
    .sort((a, b) => a - b);
  const sum = (list, key) => list.reduce((a, e) => a + e[key], 0);
  const lines = ['date,weight_kg,weight_7day_avg_kg,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,water_l,steps,sleep_h,' +
    'cardio_min,workout,sets_logged,waist_cm,body_fat_pct,creatine,no_junk,rest_day,note'];
  for (const day of days) {
    const t = trend.get(day);
    const log = logs.get(day);
    const f = foods.get(day) ?? [];
    const m = measurements.get(day);
    const workout = sessions.has(day) ? templates.get(sessions.get(day).templateId)?.name : isSunday(day) ? 'Rest' : null;
    const yn = (v) => (log ? (v ? 'yes' : 'no') : null);
    lines.push(row([
      isoDate(day),
      t ? Fmt.num(t.weightKg, 2) : null,
      t ? Fmt.num(t.averageKg, 2) : null,
      f.length ? Fmt.num(sum(f, 'kcal'), 0) : null,
      f.length ? Fmt.num(sum(f, 'protein')) : null,
      f.length ? Fmt.num(sum(f, 'carbs')) : null,
      f.length ? Fmt.num(sum(f, 'fat')) : null,
      f.length ? Fmt.num(sum(f, 'fiber')) : null,
      log?.waterMl > 0 ? Fmt.num(log.waterMl / 1000, 2) : null,
      log?.steps ?? null,
      log?.sleepHours != null ? Fmt.num(log.sleepHours) : null,
      cardio.has(day) ? sum(cardio.get(day), 'minutes') : null,
      workout ?? null,
      sets.has(day) ? sets.get(day).length : null,
      m?.waistCm != null ? Fmt.num(m.waistCm) : null,
      m?.bodyFatPercent != null ? Fmt.num(m.bodyFatPercent) : null,
      yn(log?.creatine), yn(log?.noJunk), yn(log?.restDay),
      log?.note ?? null,
    ]));
  }
  return `${lines.join('\n')}\n`;
}

/** Every logged set, for tracking progressive overload in a spreadsheet. */
export function exportSetsCsv() {
  const T = db.tables;
  const lines = ['date,workout,exercise,set,weight_kg,reps_or_seconds,rir,score'];
  const sets = [...T.sets.values()].sort((a, b) =>
    a.epochDay - b.epochDay || (a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0) || a.setNumber - b.setNumber);
  for (const s of sets) {
    const e = T.exercises.get(s.exerciseId);
    const session = T.sessions.get(s.sessionId);
    lines.push(row([
      isoDate(s.epochDay),
      session ? T.templates.get(session.templateId)?.name ?? null : null,
      e?.name ?? s.exerciseId,
      s.setNumber,
      Fmt.num(s.weightKg, 2),
      s.reps,
      s.rir,
      Fmt.num(Analytics.setScore(s.weightKg, s.reps, e?.measure ?? Measure.REPS)),
    ]));
  }
  return `${lines.join('\n')}\n`;
}

// ------------------------------------------------------------------ ZIP (stored entries; reads stored and deflated)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(ms) {
  const d = new Date(ms);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

/** [{ name, data: Uint8Array, time }] → a ZIP Blob. */
export function zip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const [time, date] = dosTime(f.time ?? Date.now());
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(local.buffer, name, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd.buffer, name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((a, c) => a + (c.byteLength ?? c.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end.buffer], { type: 'application/zip' });
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old to open compressed ZIP files.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads a ZIP's files: [{ name, data: Uint8Array }]. Uses the central directory, so data descriptors are fine. */
export async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This file isn't a ZIP.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('This ZIP file is damaged.');
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compressed);
    if (method === 0) out.push({ name, data: raw.slice() });
    else if (method === 8) out.push({ name, data: await inflateRaw(raw) });
  }
  return out;
}

// ------------------------------------------------------------------ photos

const entryName = (day, pose) => `${isoDate(day)}_${pose.toLowerCase()}.jpg`;

function parseEntryName(name) {
  const base = name.split('/').pop();
  const m = /^(\d{4}-\d{2}-\d{2})_([a-z_]+)\.jpe?g$/i.exec(base);
  if (!m) return null;
  const day = parseIsoDate(m[1]);
  const pose = Pose.entries.find((p) => p.name === m[2].toUpperCase());
  return day != null && pose ? { day, pose: pose.name } : null;
}

export async function exportPhotos() {
  const files = [];
  for (const p of repo.photos()) {
    const data = await repo.photoBytes(p);
    if (data) files.push({ name: entryName(p.epochDay, p.pose), data: new Uint8Array(data), time: p.createdAt });
  }
  return { blob: zip(files), count: files.length };
}

/** Adds the photos in a photo ZIP; a photo for the same day and pose is replaced. */
export async function importPhotos(buffer, normalize) {
  let imported = 0;
  let skipped = 0;
  for (const f of await unzip(buffer)) {
    const target = parseEntryName(f.name);
    if (!target) {
      skipped++;
      continue;
    }
    try {
      const bytes = await normalize(new Blob([f.data], { type: 'image/jpeg' }));
      await repo.savePhoto(target.day, target.pose, bytes);
      imported++;
    } catch {
      skipped++;
    }
  }
  return { imported, skipped };
}
