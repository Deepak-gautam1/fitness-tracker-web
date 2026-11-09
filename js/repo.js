// Every read and write the screens use: a port of FitnessRepository.kt and the Room queries in Daos.kt.

import * as db from './db.js';
import * as Seed from './seed.js';
import { Analytics, Measure, ExerciseKind, FoodCategories, defaultSettings, emptyLog, todayDay, planRotation, totalsOf } from './domain.js';

const T = db.tables;
const values = (table) => [...T[table].values()];

// ------------------------------------------------------------------ indexes, rebuilt when data changes

let indexVersion = -1;
let index = null;

function idx() {
  if (indexVersion === db.getVersion() && index) return index;
  const setsByDay = new Map();
  const setsByExercise = new Map();
  const sessionsWithSets = new Set();
  for (const s of T.sets.values()) {
    if (!setsByDay.has(s.epochDay)) setsByDay.set(s.epochDay, []);
    setsByDay.get(s.epochDay).push(s);
    if (!setsByExercise.has(s.exerciseId)) setsByExercise.set(s.exerciseId, []);
    setsByExercise.get(s.exerciseId).push(s);
    sessionsWithSets.add(s.sessionId);
  }
  const sessionsByDay = new Map();
  for (const s of T.sessions.values()) sessionsByDay.set(s.epochDay, s);
  const foodByDay = new Map();
  for (const f of T.food.values()) {
    if (!foodByDay.has(f.epochDay)) foodByDay.set(f.epochDay, []);
    foodByDay.get(f.epochDay).push(f);
  }
  for (const list of foodByDay.values()) list.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const weights = values('weights').sort((a, b) => a.epochDay - b.epochDay);
  const exercises = new Map(values('exercises').map((e) => [e.id, e]));
  index = { setsByDay, setsByExercise, sessionsWithSets, sessionsByDay, foodByDay, weights, exercises };
  indexVersion = db.getVersion();
  return index;
}

// ------------------------------------------------------------------ seeding

/**
 * Seeds the goals, workout plan and foods on first launch, and moves an install that's on an
 * older workout plan to the current one, once. Safe to call every launch.
 */
export function ensureSeeded() {
  if (!T.settings.get(1)) db.put('settings', defaultSettings(todayDay()));
  if (T.presets.size === 0) {
    db.putAll('presets', Seed.foodPresets.map((p) => ({ ...p, id: db.nextId('presets') })));
  }
  const noPlan = T.templates.size === 0;
  if (noPlan || db.getMeta('planVersion', 1) < Seed.PLAN_VERSION) applyBuiltInPlan();
}

/**
 * Replaces the six workouts with the built-in plan. Logged sets and sessions aren't touched, and
 * exercises keep their ids where the movement is the same, so history and "last time" carry
 * over. Exercises you created stay in the catalogue.
 */
export function applyBuiltInPlan() {
  // As on Android, built-in exercises are written over (a renamed one gets its name back);
  // history is keyed by id, so it carries over either way.
  db.putAll('exercises', Seed.exercises.map((e) => ({ ...e })));
  db.putAll('templates', Seed.templates.map((t) => ({ ...t })));
  const ids = new Set(Seed.templates.map((t) => t.id));
  for (const te of values('templateExercises')) if (ids.has(te.templateId)) db.del('templateExercises', te.id);
  db.putAll('templateExercises', Seed.templateExercises.map((te) => ({ ...te, id: db.nextId('templateExercises') })));
  db.setMeta('planVersion', Seed.PLAN_VERSION);
  db.setMeta('planStarted', todayDay());
}

/** The day the current workout plan started, for the four-week review; null if unknown. */
export const planStartedOn = () => db.getMeta('planStarted', null);

// ------------------------------------------------------------------ goals

export const settings = () => T.settings.get(1);
export const saveSettings = (s) => db.put('settings', { ...s, id: 1 });
export const updateSettings = (change) => saveSettings(change(settings()));

// ------------------------------------------------------------------ body

/** Weigh-ins, oldest first. */
export const weights = () => idx().weights;
export const weightOn = (day) => T.weights.get(day) ?? null;
export const logWeight = (day, kg) => db.put('weights', { epochDay: day, weightKg: kg, note: null });
export const deleteWeight = (day) => db.del('weights', day);

export const measurements = () => values('measurements').sort((a, b) => a.epochDay - b.epochDay);
export const logMeasurement = (m) => db.put('measurements', m);
export const deleteMeasurement = (day) => db.del('measurements', day);

// ------------------------------------------------------------------ daily log

export const dailyLog = (day) => T.dailyLogs.get(day) ?? emptyLog(day);
export const dailyLogMap = () => T.dailyLogs;

/** Applies [change] to the day's log. Writes only when something changed, so no empty days appear. */
export function updateDaily(day, change) {
  const current = T.dailyLogs.get(day) ?? emptyLog(day);
  const next = change({ ...current });
  if (JSON.stringify(next) !== JSON.stringify(current)) db.put('dailyLogs', next);
}

export const addWater = (day, deltaMl) =>
  updateDaily(day, (l) => ({ ...l, waterMl: Math.min(10_000, Math.max(0, l.waterMl + deltaMl)) }));

export const cardio = (from, to) => values('cardio')
  .filter((c) => c.epochDay >= from && c.epochDay <= to)
  .sort((a, b) => a.epochDay - b.epochDay || a.id - b.id);
export const addCardio = (day, type, minutes) => db.put('cardio', { id: db.nextId('cardio'), epochDay: day, type, minutes, note: null });
export const deleteCardio = (id) => db.del('cardio', id);

// ------------------------------------------------------------------ food

export const foodEntries = (day) => idx().foodByDay.get(day) ?? [];
export const dayTotals = (day) => totalsOf(foodEntries(day));

/** One row per day with food logged in [from, to]. */
export function dailyTotals(from, to) {
  const out = [];
  for (const [day, list] of idx().foodByDay) {
    if (day >= from && day <= to) out.push({ epochDay: day, ...totalsOf(list) });
  }
  return out.sort((a, b) => a.epochDay - b.epochDay);
}

/** Most used first, then most recent, then by name. */
export const presets = () => values('presets').sort((a, b) =>
  b.useCount - a.useCount || b.lastUsedAt - a.lastUsedAt || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

export function addFood(day, meal, preset, amount) {
  const factor = amount / preset.baseAmount;
  const now = Date.now();
  db.put('food', {
    id: db.nextId('food'), epochDay: day, meal, name: preset.name, quantity: amount, unit: preset.unit,
    kcal: preset.kcal * factor, protein: preset.protein * factor, carbs: preset.carbs * factor,
    fat: preset.fat * factor, fiber: preset.fiber * factor, createdAt: now,
  });
  const p = T.presets.get(preset.id);
  if (p) db.put('presets', { ...p, useCount: p.useCount + 1, lastUsedAt: now });
}

export function addCustomFood(day, meal, { name, kcal, protein, carbs, fat, fiber }, saveAsPreset) {
  const now = Date.now();
  db.put('food', {
    id: db.nextId('food'), epochDay: day, meal, name, quantity: 1, unit: 'serving',
    kcal, protein, carbs, fat, fiber, createdAt: now,
  });
  if (saveAsPreset) {
    db.put('presets', {
      id: db.nextId('presets'), name, unit: 'serving', baseAmount: 1, defaultAmount: 1, kcal, protein, carbs, fat, fiber,
      category: FoodCategories.CUSTOM, isCustom: true, useCount: 1, lastUsedAt: now,
    });
  }
}

/** Rescales a logged item to a new amount, keeping its per-unit macros. */
export function updateFoodAmount(entry, amount) {
  if (entry.quantity <= 0 || amount <= 0) return;
  const f = amount / entry.quantity;
  db.put('food', {
    ...entry, quantity: amount, kcal: entry.kcal * f, protein: entry.protein * f, carbs: entry.carbs * f,
    fat: entry.fat * f, fiber: entry.fiber * f,
  });
}

export const moveFood = (entry, meal) => db.put('food', { ...entry, meal });
export const deleteFood = (id) => db.del('food', id);
/** Puts a just-deleted entry back exactly as it was (undo). */
export const restoreFood = (entry) => db.put('food', entry);

export function copyFood(fromDay, toDay) {
  const items = foodEntries(fromDay);
  const now = Date.now();
  db.putAll('food', items.map((e, i) => ({ ...e, id: db.nextId('food'), epochDay: toDay, createdAt: now + i })));
  return items.length;
}

export function addMealTemplate(day, template) {
  const byName = new Map(values('presets').map((p) => [p.name, p]));
  let added = 0;
  for (const [name, amount] of template.items) {
    const preset = byName.get(name);
    if (!preset) continue;
    addFood(day, template.meal, preset, amount);
    added++;
  }
  return added;
}

export const mealTemplates = () => Seed.mealTemplates;

export function savePreset(preset) {
  db.put('presets', { ...preset, id: preset.id ?? db.nextId('presets') });
}
export const deletePreset = (id) => db.del('presets', id);

// ------------------------------------------------------------------ workouts

export const templates = () => values('templates').sort((a, b) => a.sortOrder - b.sortOrder);
export const exercises = () => values('exercises').sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
export const exercise = (id) => T.exercises.get(id) ?? null;

/** Template slots joined with their exercise (PlannedExercise), by template then position. */
export function plan() {
  const ex = idx().exercises;
  return values('templateExercises')
    .filter((te) => ex.has(te.exerciseId))
    .map((te) => {
      const e = ex.get(te.exerciseId);
      return {
        teId: te.id, templateId: te.templateId, exerciseId: te.exerciseId, position: te.position, sets: te.sets,
        repMin: te.repMin, repMax: te.repMax, restSeconds: te.restSeconds, notes: te.notes ?? null,
        name: e.name, muscleGroup: e.muscleGroup, kind: e.kind, measure: e.measure,
      };
    })
    .sort((a, b) => (a.templateId < b.templateId ? -1 : a.templateId > b.templateId ? 1 : a.position - b.position));
}

export const plannedSetsByTemplate = (planItems) => {
  const m = new Map();
  for (const p of planItems) m.set(p.templateId, (m.get(p.templateId) ?? 0) + p.sets);
  return m;
};

export const session = (day) => idx().sessionsByDay.get(day) ?? null;
export const setsForDay = (day) => [...(idx().setsByDay.get(day) ?? [])].sort((a, b) =>
  (a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : a.setNumber - b.setNumber));
export const setCount = (day) => idx().setsByDay.get(day)?.length ?? 0;

/** The workout of the latest session before [day] that has sets logged or was finished. */
export function lastDoneBefore(day) {
  const { sessionsWithSets } = idx();
  let best = null;
  for (const s of T.sessions.values()) {
    if (s.epochDay < day && (s.finishedAt != null || sessionsWithSets.has(s.id)) && (!best || s.epochDay > best.epochDay)) best = s;
  }
  return best?.templateId ?? null;
}

/** Each day's { workout, next } in [from, to] from the workout order (see planRotation). */
export function rotation(from, to, today = todayDay()) {
  const s = settings();
  const { sessionsByDay, setsByDay } = idx();
  const sessionTemplates = new Map();
  for (let d = from; d <= to; d++) {
    const sess = sessionsByDay.get(d);
    if (sess) sessionTemplates.set(d, sess.templateId);
  }
  return planRotation({
    from, to, today, programStart: s.programStartEpochDay, templates: templates(),
    lastDone: lastDoneBefore(from), sessionTemplates,
    done: (d) => (setsByDay.get(d)?.length ?? 0) > 0 || sessionsByDay.get(d)?.finishedAt != null,
    dayOff: (d) => T.dailyLogs.get(d)?.restDay === true,
  });
}

/** A day's status for the week strip and the checklist. */
export function dayStatus(day, order, plannedSets, today = todayDay()) {
  const s = settings();
  const tpl = order.get(day)?.workout;
  return Analytics.dayStatus({
    day, today, programStart: s.programStartEpochDay, restMarked: T.dailyLogs.get(day)?.restDay === true,
    sets: setCount(day), plannedSets: tpl ? plannedSets.get(tpl.id) ?? 0 : 0,
    finished: session(day)?.finishedAt != null,
  });
}

/** Every set from the most recent earlier session of each exercise, by exercise id. */
export function previousSets(day) {
  const out = new Map();
  for (const [id, list] of idx().setsByExercise) {
    let lastDay = null;
    for (const s of list) if (s.epochDay < day && (lastDay == null || s.epochDay > lastDay)) lastDay = s.epochDay;
    if (lastDay != null) out.set(id, list.filter((s) => s.epochDay === lastDay).sort((a, b) => a.setNumber - b.setNumber));
  }
  return out;
}

/** Best score per exercise before [day] (personal-best badge). */
export function bestBefore(day) {
  const out = new Map();
  const ex = idx().exercises;
  for (const [id, list] of idx().setsByExercise) {
    const measure = ex.get(id)?.measure ?? Measure.REPS;
    let best = null;
    for (const s of list) {
      if (s.epochDay >= day) continue;
      const score = Analytics.setScore(s.weightKg, s.reps, measure);
      if (best == null || score > best) best = score;
    }
    if (best != null) out.set(id, best);
  }
  return out;
}

/** An exercise's sets, newest day first. */
export const history = (exerciseId) => [...(idx().setsByExercise.get(exerciseId) ?? [])]
  .sort((a, b) => b.epochDay - a.epochDay || a.setNumber - b.setNumber);

export const setsFor = (ids) => ids.flatMap((id) => idx().setsByExercise.get(id) ?? []);

/** Logs one completed set, creating and starting the day's session if needed. */
export function logSet(day, templateId, exerciseId, setNumber, weightKg, reps, rir) {
  const now = Date.now();
  let sess = session(day);
  if (!sess) sess = db.put('sessions', { id: db.nextId('sessions'), epochDay: day, templateId, startedAt: now, finishedAt: null, notes: null });
  else if (sess.startedAt == null) sess = db.put('sessions', { ...sess, startedAt: now });
  db.put('sets', {
    id: db.nextId('sets'), sessionId: sess.id, epochDay: day, exerciseId, setNumber, weightKg, reps, rir: rir ?? null, completedAt: now,
  });
}

export const deleteSet = (id) => db.del('sets', id);

export function chooseTemplate(day, templateId) {
  const s = session(day);
  if (!s) db.put('sessions', { id: db.nextId('sessions'), epochDay: day, templateId, startedAt: null, finishedAt: null, notes: null });
  else db.put('sessions', { ...s, templateId });
}

export function startSession(day, templateId) {
  const now = Date.now();
  const s = session(day);
  if (!s) db.put('sessions', { id: db.nextId('sessions'), epochDay: day, templateId, startedAt: now, finishedAt: null, notes: null });
  else if (s.startedAt == null) db.put('sessions', { ...s, templateId, startedAt: now });
}

export function finishSession(day) {
  const s = session(day);
  if (!s) return;
  const sets = idx().setsByDay.get(day) ?? [];
  const now = Date.now();
  const lastSet = sets.length ? Math.max(...sets.map((x) => x.completedAt)) : null;
  const firstSet = sets.length ? Math.min(...sets.map((x) => x.completedAt)) : null;
  const end = day === todayDay() ? now : lastSet ?? now;
  db.put('sessions', { ...s, startedAt: s.startedAt ?? firstSet ?? end, finishedAt: end });
}

export function reopenSession(day) {
  const s = session(day);
  if (s) db.put('sessions', { ...s, finishedAt: null });
}

// ------------------------------------------------------------------ plan editing

export const planItems = (templateId) => values('templateExercises')
  .filter((te) => te.templateId === templateId).sort((a, b) => a.position - b.position);

export function updatePlanItem(item) {
  db.put('templateExercises', item);
}

export function deletePlanItem(templateId, id) {
  db.del('templateExercises', id);
  planItems(templateId).forEach((te, i) => { if (te.position !== i) db.put('templateExercises', { ...te, position: i }); });
}

export function movePlanItem(templateId, id, up) {
  const list = planItems(templateId);
  const i = list.findIndex((te) => te.id === id);
  const j = up ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((te, k) => { if (te.position !== k) db.put('templateExercises', { ...te, position: k }); });
}

export function addPlanItem(templateId, exerciseId, measure, kind) {
  const timed = measure === Measure.SECONDS;
  db.put('templateExercises', {
    id: db.nextId('templateExercises'), templateId, exerciseId, position: planItems(templateId).length,
    sets: timed ? 2 : 3, repMin: timed ? 30 : 8, repMax: timed ? 60 : 12, restSeconds: ExerciseKind.defaultRestSeconds(kind), notes: null,
  });
}

/** Adds an exercise to the catalogue and returns its id. */
export function createExercise(name, muscleGroup, kind, measure) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'exercise';
  let id = `custom_${base}`;
  let n = 2;
  while (T.exercises.has(id)) id = `custom_${base}_${n++}`;
  db.put('exercises', { id, name: name.trim(), muscleGroup: muscleGroup.trim() || 'Other', kind, measure });
  return id;
}

export const updateExercise = (e) => db.put('exercises', e);

// ------------------------------------------------------------------ photos

export const photos = () => values('photos').sort((a, b) => a.epochDay - b.epochDay || a.pose.localeCompare(b.pose));

/** Saves a normalized JPEG for [day] and [pose], replacing any photo of that day and pose. */
export async function savePhoto(day, pose, bytes) {
  const fileName = `photo_${day}_${pose.toLowerCase()}_${Date.now()}.jpg`;
  await db.putFile(fileName, bytes, 'image/jpeg');
  const old = values('photos').find((p) => p.epochDay === day && p.pose === pose);
  db.put('photos', { id: old?.id ?? db.nextId('photos'), epochDay: day, pose, fileName, createdAt: Date.now() });
  if (old && old.fileName !== fileName) await db.deleteFile(old.fileName);
}

export async function deletePhoto(photo) {
  db.del('photos', photo.id);
  await db.deleteFile(photo.fileName);
}

const urlCache = new Map();
/** An object URL for a photo, cached while the app runs. */
export async function photoUrl(photo) {
  if (urlCache.has(photo.fileName)) return urlCache.get(photo.fileName);
  const file = await db.getFile(photo.fileName);
  if (!file) return null;
  const url = URL.createObjectURL(new Blob([file.data], { type: file.type || 'image/jpeg' }));
  urlCache.set(photo.fileName, url);
  return url;
}

export const photoBytes = async (photo) => (await db.getFile(photo.fileName))?.data ?? null;
