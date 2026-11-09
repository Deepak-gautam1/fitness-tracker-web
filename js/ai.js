// ChatGPT with your own OpenAI API key: a port of the Android app's ai package (OpenAi.kt,
// AiPrompts.kt, DayReport.kt, Coach.kt, AiSettings.kt). The browser talks to OpenAI directly;
// nothing goes anywhere else. The key is encrypted with a key the browser can't export.

import * as db from './db.js';
import * as repo from './repo.js';
import {
  Analytics, DayStatus, Fmt, Meal, Measure, isSunday, isWalking, stepsGoalFor, todayDay, weekStart, totalsOf,
} from './domain.js';

export const DEFAULT_MODEL = 'gpt-6-luna';

/** OpenAI's current models, cheapest first (October 2026). Any other model ID can be typed in. */
export const MODELS = [
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', detail: 'Fast and the cheapest: well under a cent per request' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', detail: 'Smarter, about 20 times the cost' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', detail: "OpenAI's most capable, about 100 times the cost" },
];

const BASE_URL = 'https://api.openai.com/v1';

export class AiError extends Error {}

const NETWORK_BLOCKED =
  "This network won't let the app reach OpenAI. Work networks and VPNs often block it; try mobile data or another Wi-Fi.";

// ------------------------------------------------------------------ settings and the encrypted key

export const model = () => db.getMeta('aiModel', DEFAULT_MODEL);
export const setModel = (id) => db.setMeta('aiModel', id.trim() || DEFAULT_MODEL);
export const modelLabel = (id = model()) => MODELS.find((m) => m.id === id)?.label ?? id;
export const hasKey = () => db.getMeta('aiKey') != null;
export const keyHint = () => db.getMeta('aiKeyHint');

async function cryptoKey() {
  let key = db.getMeta('aiCryptoKey');
  if (!key) {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    db.setMeta('aiCryptoKey', key);
  }
  return key;
}

export async function saveKey(text) {
  const clean = text.trim();
  if (!clean) return;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(), new TextEncoder().encode(clean));
  db.setMeta('aiKey', { iv, data });
  db.setMeta('aiKeyHint', `…${clean.slice(-4)}`);
}

export function removeKey() {
  db.setMeta('aiKey', null);
  db.setMeta('aiKeyHint', null);
}

async function apiKey() {
  const stored = db.getMeta('aiKey');
  if (!stored) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: stored.iv }, await cryptoKey(), stored.data);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ the OpenAI client

function request(modelId, instructions, input, schema, effort, maxOutputTokens) {
  const body = {
    model: modelId, instructions, input, max_output_tokens: maxOutputTokens, store: false,
    text: { format: { type: 'json_schema', name: schema.name, strict: true, schema: schema.json } },
  };
  if (effort) body.reasoning = { effort };
  return JSON.stringify(body);
}

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

async function post(key, json) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${BASE_URL}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: json,
      signal: controller.signal,
    });
    return [res.status, await res.text()];
  } catch (e) {
    if (e.name === 'AbortError') throw new AiError('OpenAI took too long to answer. Try again.');
    if (!navigator.onLine) throw new AiError("You're offline. Connect to the internet and try again.");
    throw new AiError(`Couldn't reach OpenAI. ${NETWORK_BLOCKED}`);
  } finally {
    clearTimeout(timer);
  }
}

function isAboutReasoning(body) {
  const error = parse(body)?.error;
  if (!error) return false;
  return String(error.param ?? '').startsWith('reasoning') || /reasoning/i.test(error.message ?? '');
}

function errorFor(code, body, modelId) {
  const error = parse(body)?.error;
  const message = error?.message;
  if (code === 401) return new AiError("OpenAI didn't accept the API key. Check it in Settings › ChatGPT.");
  if (code === 429 && error?.code === 'insufficient_quota') {
    return new AiError('Your OpenAI account has no credit left. Add some at platform.openai.com, under Billing.');
  }
  if (code === 429) return new AiError('Too many requests to OpenAI right now. Try again in a minute.');
  if (code === 404 || error?.code === 'model_not_found') {
    return new AiError(`Your OpenAI account can't use the model "${modelId}". Pick another in Settings › ChatGPT.`);
  }
  if (!error && [403, 407, 451].includes(code)) return new AiError(`${NETWORK_BLOCKED} (Error ${code}.)`);
  if (code >= 500) return new AiError('OpenAI is having problems right now. Try again shortly.');
  if (message) return new AiError(`OpenAI: ${message}`);
  return new AiError(`OpenAI returned error ${code}.`);
}

function output(body) {
  const root = parse(body);
  if (!root) throw new AiError("OpenAI's answer couldn't be read. Try again.");
  if (root.status === 'incomplete') throw new AiError('The answer was cut off. Try again.');
  if (root.status === 'failed') throw new AiError(root.error?.message ?? "OpenAI couldn't answer. Try again.");
  let text = '';
  for (const item of root.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part?.type === 'output_text') text += part.text ?? '';
      else if (part?.type === 'refusal') throw new AiError(`ChatGPT declined: ${part.refusal ?? 'no reason given'}`);
    }
  }
  if (!text.trim()) throw new AiError('OpenAI sent an empty answer. Try again.');
  const json = parse(text);
  if (!json) throw new AiError("OpenAI's answer wasn't in the expected format. Try again.");
  return json;
}

/** OpenAI's Responses API. Every answer is JSON in a fixed schema; `store: false` asks OpenAI not to keep it. */
async function structured(instructions, input, schema, effort = 'low', maxOutputTokens = 4000) {
  const key = await apiKey();
  if (!key) throw new AiError('Add your OpenAI API key in Settings › ChatGPT first.');
  const modelId = model();
  let [code, body] = await post(key, request(modelId, instructions, input, schema, effort, maxOutputTokens));
  // Some models don't take a reasoning effort; ask once more without it.
  if (code === 400 && effort && isAboutReasoning(body)) {
    [code, body] = await post(key, request(modelId, instructions, input, schema, null, maxOutputTokens));
  }
  if (code < 200 || code > 299) throw errorFor(code, body, modelId);
  return output(body);
}

export const userMessage = (e) => (e instanceof AiError ? e.message : `Something went wrong: ${e?.message ?? e}`);

// ------------------------------------------------------------------ prompts

const FOOD_INSTRUCTIONS = `You estimate the nutrition of foods and meals for a calorie and macro tracker.
Estimate calories, protein, carbohydrate, fat and fiber for exactly the portion described. If no amount is
given, assume one typical serving and say what you assumed in "portion" (for example "1 plate, about 350 g").
Use standard nutrition data and the usual recipe; for restaurant and regional dishes, use how they're commonly
prepared, including the cooking oil. Give totals for the whole portion, rounded sensibly.
Keep "name" short and tidy. Put the main assumption, or what would change the numbers most, in "note" as one
short sentence. If the text isn't a food or drink, return zeros, confidence "low", and say so in "note".`;

const FEEDBACK_INSTRUCTIONS = `You are an experienced, evidence-based strength coach and sports nutritionist reviewing one day of a client's log.
The client trains a six-day push/pull/legs plan. Its rules: double progression (add a rep to the first set below
the top of the rep range; once every set reaches the top, add the smallest load increment), most compound sets
at 1 to 2 reps in reserve, never taking deadlifts to failure, rest of 2 to 3 minutes on compound lifts, 1 to 2 on
isolation and 45 to 90 seconds on abs. They're working toward a lean, defined physique with visible abs while
keeping their strength, through a moderate calorie deficit with high protein.

Give specific, practical feedback grounded in the numbers provided: compare lifts with last time and the targets,
food with the daily targets, and recovery (sleep, steps, water) with the targets. Say what went well and the
changes that matter most for their goal; be honest but encouraging. Two to four points per list, each a single
sentence under 25 words. Use the client's exercise names, kg and grams. Don't invent data: if something wasn't
logged, mention it only when it matters. Don't diagnose; if they report pain, illness or very low intake, suggest
caution or a professional. "summary" is two or three sentences; "next_focus" is the one thing to do next.`;

const FEEDBACK_INSTRUCTIONS_WALKING = `You are an experienced, evidence-based coach and nutritionist reviewing one day of a client's log.
The client follows a gradual fat-loss plan built on daily walking (a step goal that rises week by week to 8,000 to 10,000),
three balanced Indian meals a day in a moderate calorie deficit with high protein, and two optional short strength sessions
a week to keep muscle. The aim is steady loss of about 0.3 to 0.5 kg a week with good energy: consistency, not starving.

Give specific, practical feedback grounded in the numbers provided: food against the daily targets (protein, calories,
fibre), steps against this week's step goal, water and sleep against their targets, and any strength work against last
time. Say what went well and the changes that matter most for their goal; be honest but encouraging. Two to four points
per list, each a single sentence under 25 words. Use the client's food names, kg and grams. Don't invent data: if
something wasn't logged, mention it only when it matters. Never suggest eating below the stated calorie floor. Don't
diagnose; if they report fatigue, dizziness, menstrual changes, pain, illness or very low intake, suggest easing off and
speaking to a doctor or dietitian. "summary" is two or three sentences; "next_focus" is the one thing to do next.`;

const str = { type: 'string' };
const num = { type: 'number' };
/** Strict mode: every property required, nothing else allowed. */
const objectSchema = (properties) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});

const foodSchema = {
  name: 'food_estimate',
  json: objectSchema({
    name: str, portion: str, kcal: num, protein_g: num, carbs_g: num, fat_g: num, fiber_g: num,
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, note: str,
  }),
};

const feedbackSchema = {
  name: 'day_feedback',
  json: objectSchema({ summary: str, went_well: { type: 'array', items: str }, improve: { type: 'array', items: str }, next_focus: str }),
};

const checkSchema = { name: 'key_check', json: objectSchema({ ok: { type: 'boolean' } }) };

const amount = (o, key) => {
  const v = Number(o[key]);
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const oneDecimal = (v) => Math.round(v * 10) / 10;
const strings = (list) => (Array.isArray(list) ? list.map((s) => String(s ?? '').trim()).filter(Boolean) : []);

/** ChatGPT's estimate for one food or meal. [per] asks for a fixed amount, like "100 g" for a food in My foods. */
export async function estimateFood(description, per = null) {
  let input = `Food or meal: ${description.trim()}`;
  if (per) input += `\nGive the values for exactly ${per}, not a whole serving.`;
  const o = await structured(FOOD_INSTRUCTIONS, input, foodSchema, 'low', 3000);
  return {
    name: String(o.name ?? '').trim(),
    portion: String(o.portion ?? '').trim(),
    kcal: Math.round(amount(o, 'kcal')),
    protein: oneDecimal(amount(o, 'protein_g')),
    carbs: oneDecimal(amount(o, 'carbs_g')),
    fat: oneDecimal(amount(o, 'fat_g')),
    fiber: oneDecimal(amount(o, 'fiber_g')),
    confidence: o.confidence ?? 'low',
    note: String(o.note ?? '').trim(),
  };
}

/** Sends the smallest possible request; returns the model that answered. */
export async function checkKey() {
  await structured('Set ok to true.', 'Key check', checkSchema, 'low', 2000);
  return model();
}

// ------------------------------------------------------------------ feedback on a day

const KEEP_DAYS = 62;
const running = new Map(); // day → 'working' | { error }
const coachListeners = new Set();
export const onCoachChange = (fn) => {
  coachListeners.add(fn);
  return () => coachListeners.delete(fn);
};
const coachChanged = () => coachListeners.forEach((fn) => fn());

export function coachState(day) {
  const r = running.get(day);
  return {
    ready: hasKey(),
    working: r === 'working',
    error: r && r !== 'working' ? r.error : null,
    feedback: db.getMeta('aiFeedback', {})[day] ?? null,
  };
}

/** Runs in the background, so it finishes even if you switch tabs; the answer is kept for that day. */
export async function requestFeedback(day) {
  if (running.get(day) === 'working') return;
  running.set(day, 'working');
  coachChanged();
  try {
    const modelId = model();
    const instructions = isWalking(repo.settings()) ? FEEDBACK_INSTRUCTIONS_WALKING : FEEDBACK_INSTRUCTIONS;
    const o = await structured(instructions, dayReport(day), feedbackSchema, 'medium', 8000);
    const feedback = {
      day, createdAt: Date.now(), model: modelId,
      summary: String(o.summary ?? '').trim(), wentWell: strings(o.went_well), improve: strings(o.improve),
      nextFocus: String(o.next_focus ?? '').trim(),
    };
    const oldest = todayDay() - KEEP_DAYS;
    const all = { ...db.getMeta('aiFeedback', {}), [day]: feedback };
    for (const k of Object.keys(all)) if (Number(k) < oldest && Number(k) !== day) delete all[k];
    db.setMeta('aiFeedback', all);
    running.delete(day);
  } catch (e) {
    running.set(day, { error: userMessage(e) });
  }
  coachChanged();
}

// ------------------------------------------------------------------ the day as text (DayReport.kt)

function setsText(list, timed) {
  const unit = timed ? ' s' : '';
  const weights = [...new Set(list.map((s) => s.weightKg))];
  if (weights.length === 1) {
    const kg = weights[0];
    return (kg > 0 ? `${Fmt.num(kg, 2)} kg × ` : 'bodyweight × ') + list.map((s) => `${s.reps}${unit}`).join(', ');
  }
  return list.map((s) => `${s.weightKg > 0 ? `${Fmt.num(s.weightKg, 2)} kg` : 'bodyweight'} × ${s.reps}${unit}`).join(', ');
}

const rirText = (list) => (list.every((s) => s.rir == null) ? '' : ` (RIR ${list.map((s) => s.rir ?? '?').join(', ')})`);

/** Everything about one day that a feedback request sends. Nothing else leaves the phone. */
export function dayReport(day) {
  const s = repo.settings();
  const walking = isWalking(s);
  const today = todayDay();
  const ws = weekStart(day);
  const order = walking ? new Map() : repo.rotation(ws, ws + 6, today);
  const planItems = repo.plan();
  const plannedSets = repo.plannedSetsByTemplate(planItems);
  const log = repo.dailyLog(day);
  const lines = [];
  const programWeek = Math.floor(Math.max(0, day - s.programStartEpochDay) / 7) + 1;
  lines.push(`Day: ${Fmt.fullDate(day)}, week ${programWeek} of the program.`);
  const who = `${s.sex === 'FEMALE' ? 'Female' : 'Male'}, height ${Fmt.num(s.heightCm)} cm.`;
  if (walking) {
    lines.push(s.phase === 1
      ? `Goal: lose fat gradually from ${Fmt.kg(s.startWeightKg)} to ${Fmt.range(s.targetWeightMinKg, s.targetWeightMaxKg)} ` +
        `at ${Fmt.num(s.targetWeightLossMinKgPerWeek)}–${Fmt.num(s.targetWeightLossMaxKgPerWeek)} kg a week while keeping energy and muscle. ${who}`
      : `Goal: hold their new weight (maintenance) while keeping energy and muscle. ${who}`);
  } else if (s.phase === 1) {
    lines.push(`Goal: lose fat from ${Fmt.kg(s.startWeightKg)} to ${Fmt.range(s.targetWeightMinKg, s.targetWeightMaxKg)} ` +
      `at ${Fmt.num(s.targetWeightLossMinKgPerWeek)}–${Fmt.num(s.targetWeightLossMaxKgPerWeek)} kg a week` +
      `${s.targetBodyFatPercent > 0 ? `, reach about ${Fmt.num(s.targetBodyFatPercent)}% body fat with visible abs` : ''}, and keep strength. Height ${Fmt.num(s.heightCm)} cm.`);
  } else {
    lines.push(`Goal: lean muscle gain at ${Fmt.num(s.phase2GainMinKgPerWeek)}–${Fmt.num(s.phase2GainMaxKgPerWeek)} kg a week ` +
      `while staying lean. Height ${Fmt.num(s.heightCm)} cm.`);
  }
  const stepsGoal = stepsGoalFor(s, day);
  lines.push(`Daily targets: ${Fmt.kcal(s.dailyCalories)} (never below ${Fmt.kcal(s.calorieFloor)}), protein ${s.proteinGrams} g, carbs ${s.carbsGrams} g, fat ${s.fatGrams} g, ` +
    `fiber ${s.fiberGramsMin}–${s.fiberGramsMax} g, water ${Fmt.num(s.waterLitersMin)}–${Fmt.num(s.waterLitersMax)} L, ` +
    `steps ${stepsGoal < s.dailyStepsMin ? `${Fmt.int(stepsGoal)} this week, building to ` : ''}${Fmt.int(s.dailyStepsMin)}–${Fmt.int(s.dailyStepsTarget)}, sleep ${Fmt.num(s.sleepHoursMin)} h or more` +
    (walking ? `, ${s.strengthSessionsPerWeek} short strength sessions a week.` : `, cardio ${s.cardioSessionsMin}–${s.cardioSessionsMax} sessions a week.`));
  lines.push('');

  const template = walking
    ? (repo.workoutDone(day) ? repo.templates().find((t) => t.id === repo.session(day)?.templateId) ?? null : null)
    : order.get(day)?.workout ?? null;
  if (walking && !template) {
    lines.push(`Strength: no session today; ${repo.workoutDays(ws, ws + 6)} of ${s.strengthSessionsPerWeek} this week.`);
  } else if (!template) {
    const restLabel = isSunday(day) ? "Sunday, the plan's fixed rest day" : 'a day off (the workout order pauses, nothing is skipped)';
    const next = order.get(day)?.next?.name;
    lines.push(`Training: ${restLabel}.${next ? ` Next workout: ${next}.` : ''}`);
  } else {
    const setsToday = repo.setsForDay(day);
    const byExercise = new Map();
    for (const st of setsToday) {
      if (!byExercise.has(st.exerciseId)) byExercise.set(st.exerciseId, []);
      byExercise.get(st.exerciseId).push(st);
    }
    for (const list of byExercise.values()) list.sort((a, b) => a.setNumber - b.setNumber);
    const previous = repo.previousSets(day);
    const items = planItems.filter((p) => p.templateId === template.id).sort((a, b) => a.position - b.position);
    const sess = repo.session(day);
    const end = sess?.finishedAt ?? (setsToday.length ? Math.max(...setsToday.map((x) => x.completedAt)) : null);
    const minutes = sess?.startedAt != null && end != null ? Math.floor((end - sess.startedAt) / 60000) : null;
    let head = `Workout: ${template.name}${template.hasAbs ? ' with abs' : ''}. ${setsToday.length} of ${items.reduce((a, p) => a + p.sets, 0)} planned sets logged`;
    if (minutes != null) head += ` in ${minutes} min`;
    lines.push(head + (sess?.finishedAt != null ? ', finished.' : '.'));
    const exerciseLine = (name, timed, planned, logged, last, target) => {
      const doneText = logged.length === 0 ? 'not logged' : setsText(logged, timed) + rirText(logged);
      const lastText = last.length === 0 ? '' : `; last time ${setsText(last, timed)}`;
      const targetText = target ? `; app's target: ${target}` : '';
      return `- ${name} (${planned ?? 'added to the session'}): ${doneText}${lastText}${targetText}`;
    };
    for (const pe of items) {
      const timed = pe.measure === Measure.SECONDS;
      const last = previous.get(pe.exerciseId) ?? [];
      lines.push(exerciseLine(pe.name, timed, `${pe.sets} × ${pe.repMin}–${pe.repMax}${timed ? ' s' : ''} planned`,
        byExercise.get(pe.exerciseId) ?? [], last, Analytics.suggest(pe, last).text));
    }
    for (const [id, logged] of byExercise) {
      if (items.some((p) => p.exerciseId === id)) continue;
      const e = repo.exercise(id);
      if (e) lines.push(exerciseLine(e.name, e.measure === Measure.SECONDS, null, logged, previous.get(id) ?? [], null));
    }
  }
  if (walking) {
    const stepDays = [0, 1, 2, 3, 4, 5, 6].map((i) => ws + i).filter((d) => d <= day && (repo.dailyLog(d).steps ?? 0) >= stepsGoalFor(s, d)).length;
    lines.push(`This week so far: step goal hit on ${stepDays} of ${Math.min(7, day - ws + 1)} days; ${repo.workoutDays(ws, ws + 6)} of ${s.strengthSessionsPerWeek} strength sessions.`);
  } else {
    const weekDone = [0, 1, 2, 3, 4, 5, 6].filter((i) => repo.dayStatus(ws + i, order, plannedSets, today) === DayStatus.DONE).length;
    const weekPlanned = [0, 1, 2, 3, 4, 5].filter((i) => repo.dailyLog(ws + i).restDay !== true).length;
    lines.push(`This week so far: ${weekDone} of ${weekPlanned} workouts done.`);
  }
  lines.push('');

  const foods = repo.foodEntries(day);
  const t = totalsOf(foods);
  if (foods.length === 0) {
    lines.push('Food: nothing logged.');
  } else {
    lines.push(`Food: ${Fmt.int(t.kcal)} kcal, protein ${Fmt.int(t.protein)} g, carbs ${Fmt.int(t.carbs)} g, ` +
      `fat ${Fmt.int(t.fat)} g, fiber ${Fmt.int(t.fiber)} g.`);
    for (const f of foods) {
      lines.push(`- ${Meal.of(f.meal).label}: ${f.name}, ${Fmt.num(f.quantity)} ${f.unit}, ${Fmt.int(f.kcal)} kcal, ${Fmt.num(f.protein)} g protein`);
    }
  }
  lines.push(`Water: ${Fmt.num(log.waterMl / 1000, 2)} L. Steps: ${log.steps != null ? `${Fmt.int(log.steps)} (goal ${Fmt.int(stepsGoal)})` : 'not logged'}. ` +
    `Sleep last night: ${log.sleepHours != null ? `${Fmt.num(log.sleepHours)} h` : 'not logged'}.`);
  lines.push(`${s.checklistCreatine === false ? '' : `Creatine: ${log.creatine ? 'taken' : 'not marked'}. `}No junk food or sugar: ${log.noJunk ? 'yes' : 'not marked'}.`);
  const cardio = repo.cardio(day, day);
  if (cardio.length) lines.push(`Cardio: ${cardio.map((c) => `${c.minutes} min ${c.type}`).join(', ')}.`);
  lines.push('');

  const weighIns = repo.weights();
  const weightToday = repo.weightOn(day)?.weightKg ?? null;
  const average7 = Analytics.trailingAverage(weighIns, day);
  const previous7 = Analytics.trailingAverage(weighIns, day - 7);
  let w = `Weight: ${weightToday != null ? `${Fmt.kg(weightToday)} this morning` : 'no weigh-in today'}`;
  if (average7 != null) w += `; 7-day average ${Fmt.kg(average7)}`;
  if (average7 != null && previous7 != null) w += ` (${Fmt.signedKg(average7 - previous7)} on the week before)`;
  lines.push(`${w}.`);
  const rate = Analytics.assessRate(s, weighIns.filter((x) => x.epochDay <= day), day);
  lines.push(`Weekly rate: ${`${rate.headline}. ${rate.advice}`.trim()}`);
  if (log.note) lines.push(`Their notes for the day: "${log.note}"`);
  return lines.join('\n').trim();
}

