// Settings: program, ChatGPT, every goal number, the workout plan editor, My foods, backups and
// exports (SettingsScreen.kt, PlanEditorScreen.kt). Reminders, the widget and Health Connect are
// Android-only; the About section says so.

import { useState, useEffect } from '../../vendor/preact-htm.js';
import * as repo from '../repo.js';
import * as ai from '../ai.js';
import * as backup from '../backup.js';
import * as db from '../db.js';
import { ExerciseKind, Fmt, Measure, PLANS, dayName, isWalking, isoDate, parseIsoDate, todayDay } from '../domain.js';
import { push, snack } from './state.js';
import {
  html, Icon, BackBar, Card, Dialog, ConfirmDialog, NumberDialog, Field, NumberInput, TextInput, Tag, Switch, saveFile, pickFile,
} from './kit.js';
import { AddExerciseDialog } from './workout.js';
import { normalizePhoto } from './photos.js';

export const APP_VERSION = '1.4-web';

/** One editable number: label, unit, decimals, range, how to read and apply it, extra checks. */
const N = (label, suffix, decimal, key, min, max, extra = {}) => ({ label, suffix, decimal, key, min, max, ...extra });

const GROUPS = [
  ['Body & goal', [
    N('Height', 'cm', true, 'heightCm', 120, 230),
    N('Start weight', 'kg', true, 'startWeightKg', 30, 250),
    N('Target weight (low end)', 'kg', true, 'targetWeightMinKg', 30, 250, {
      check: (s, v) => (v > s.targetWeightMaxKg ? `Must be at or below the high end (${Fmt.num(s.targetWeightMaxKg)} kg)` : null),
    }),
    N('Target weight (high end)', 'kg', true, 'targetWeightMaxKg', 30, 250, {
      check: (s, v) => (v < s.targetWeightMinKg ? `Must be at or above the low end (${Fmt.num(s.targetWeightMinKg)} kg)` : null),
    }),
    N('Estimated body fat at start', '%', true, 'estimatedBodyFatPercent', 0, 60, { zeroIsUnset: true, help: '0 means not set.' }),
    N('Target body fat', '%', true, 'targetBodyFatPercent', 0, 60, { zeroIsUnset: true, help: '0 means no body-fat goal.' }),
  ]],
  ['Daily nutrition', [
    N('Daily calories', 'kcal', false, 'dailyCalories', 1000, 6000, {
      check: (s, v) => (v < s.calorieFloor ? `Below your ${Fmt.kcal(s.calorieFloor)} floor. Avoid extreme restriction; add activity instead.` : null),
    }),
    N('Protein', 'g', false, 'proteinGrams', 40, 400),
    N('Carbohydrates', 'g', false, 'carbsGrams', 20, 800),
    N('Fat', 'g', false, 'fatGrams', 20, 300),
    N('Fiber, minimum', 'g', false, 'fiberGramsMin', 5, 100),
    N('Fiber, maximum', 'g', false, 'fiberGramsMax', 5, 120),
    N('Water, minimum', 'L', true, 'waterLitersMin', 0.5, 8),
    N('Water, maximum', 'L', true, 'waterLitersMax', 0.5, 10),
    N('Calorie floor', 'kcal', false, 'calorieFloor', 1200, 3000, {
      help: 'The app never suggests eating below this. When loss stalls near it, it suggests more activity instead.',
    }),
  ]],
  ['Activity & recovery', [
    N('Steps, minimum', 'steps', false, 'dailyStepsMin', 0, 50000),
    N('Steps, target', 'steps', false, 'dailyStepsTarget', 0, 60000),
    N('Cardio sessions per week (min)', '', false, 'cardioSessionsMin', 0, 14),
    N('Cardio sessions per week (max)', '', false, 'cardioSessionsMax', 0, 14),
    N('Steps, first week', 'steps', false, 'stepsStart', 0, 50000, {
      help: 'The step goal starts here and rises by the weekly increase until it reaches the minimum. Set it to the minimum for no build-up.',
    }),
    N('Steps, weekly increase', 'steps', false, 'stepsWeeklyIncrease', 0, 5000),
    N('Strength sessions per week', '', false, 'strengthSessionsPerWeek', 0, 7, { only: 'WALKING' }),
    N('Sleep target', 'h', true, 'sleepHoursMin', 4, 12),
    N('Photo reminder every', 'days', false, 'photoIntervalDays', 7, 90),
  ]],
  ['Weekly rate targets', [
    N('Phase 1 loss, slowest', 'kg/wk', true, 'targetWeightLossMinKgPerWeek', 0.05, 1.5),
    N('Phase 1 loss, fastest', 'kg/wk', true, 'targetWeightLossMaxKgPerWeek', 0.05, 1.5),
    N('Phase 2 gain, slowest', 'kg/wk', true, 'phase2GainMinKgPerWeek', 0, 1),
    N('Phase 2 gain, fastest', 'kg/wk', true, 'phase2GainMaxKgPerWeek', 0, 1),
  ]],
];

const numText = (v, decimal) => (decimal ? Fmt.num(v, 2) : Fmt.int(v));
const shown = (item, s) => (item.zeroIsUnset && !s[item.key] ? 'Not set' : `${numText(s[item.key], item.decimal)}${item.suffix ? ` ${item.suffix}` : ''}`);
const phaseLabel = (s, ph = s.phase) => (isWalking(s)
  ? (ph === 1 ? 'Fat loss' : 'Maintenance')
  : (ph === 1 ? 'Phase 1 · Cut' : 'Phase 2 · Lean muscle building'));

function Row({ title, detail, value, onClick, icon }) {
  return html`<button class="list-row" onClick=${onClick}>
    ${icon && html`<span class="ink2"><${Icon} name=${icon} size=${20} /></span>`}
    <span class="main"><div class="title">${title}</div>${detail && html`<div class="detail">${detail}</div>`}</span>
    ${value != null && html`<span class="value">${value}</span>`}
  </button>`;
}

const Group = ({ title, children }) => html`<${Card} class="flush settings-group"><div class="group-title" style="padding-top:0">${title}</div>${children}<//>`;

export const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function InstallBanner() {
  if (isStandalone()) return null;
  return html`<div class="banner">
    ${isIos()
      ? html`<b>Add this app to your Home Screen.</b> In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. Open it from the new icon from then on:
        it works offline, and the Home Screen app keeps its own data, separate from Safari.`
      : html`<b>Install this app.</b> Use your browser's menu and choose <b>Install app</b> or <b>Add to Home screen</b>, then open it from the new icon.`}
  </div>`;
}

export function SettingsScreen() {
  const s = repo.settings();
  const [editing, setEditing] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [checking, setChecking] = useState(false);
  const [persisted, setPersisted] = useState(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => {}); }, []);
  const fromMacros = s.proteinGrams * 4 + s.carbsGrams * 4 + s.fatGrams * 9;
  const today = isoDate(todayDay());
  const photoCount = repo.photos().length;

  const run = async (fn, success) => {
    try {
      const done = await fn();
      if (success && done !== false) snack(success);
    } catch (e) {
      snack(e.message ?? String(e));
    }
  };
  const exportBackup = () => run(async () => {
    await db.flush();
    return saveFile(new Blob([backup.exportJson()], { type: 'application/json' }), `fitness-tracker-backup-${today}.json`);
  }, 'Backup saved');
  const chooseBackup = () => run(async () => {
    const file = await pickFile('.json,application/json,text/plain');
    if (!file) return false;
    setDialog({ type: 'restore', parsed: backup.parseBackup(await file.text()) });
    return false;
  });
  const choosePhotos = () => run(async () => {
    const file = await pickFile('.zip,application/zip,application/x-zip-compressed');
    if (!file) return false;
    setDialog({ type: 'importPhotos', buffer: await file.arrayBuffer() });
    return false;
  });
  const checkKey = async () => {
    setChecking(true);
    try {
      const m = await ai.checkKey();
      snack(`The key works with ${ai.modelLabel(m)}`);
    } catch (e) {
      snack(ai.userMessage(e), null, null, 6000);
    }
    setChecking(false);
  };

  return html`
    <${BackBar} title="Settings" />
    <main class="content no-nav">
      <${InstallBanner} />

      <${Group} title="Program">
        <${Row} title="Plan" value=${PLANS[s.planType ?? 'GYM'].short} onClick=${() => setDialog({ type: 'plan' })} />
        <${Row} title="Phase" value=${phaseLabel(s)} onClick=${() => setDialog({ type: 'phase' })} />
        <${Row} title="Sex" detail="For the body-fat estimate" value=${s.sex === 'FEMALE' ? 'Female' : 'Male'} onClick=${() => setDialog({ type: 'sex' })} />
        <label class="list-row" style="position:relative">
          <span class="main"><div class="title">Program start date</div></span>
          <span class="value">${Fmt.date(s.programStartEpochDay)}</span>
          <input type="date" value=${isoDate(s.programStartEpochDay)} style="position:absolute;inset:0;opacity:0;width:100%"
            onChange=${(e) => { const d = parseIsoDate(e.target.value); if (d != null) repo.saveSettings({ ...s, programStartEpochDay: d }); }} />
        </label>
      <//>

      <${Group} title="ChatGPT">
        <${Row} title="OpenAI API key" detail=${ai.hasKey() ? `Saved (${ai.keyHint() ?? '…'}) · tap to change or remove` : 'Not set · tap to add your key'}
          onClick=${() => setDialog({ type: 'key' })} />
        <${Row} title="Model" value=${ai.modelLabel()} onClick=${() => setDialog({ type: 'model' })} />
        ${ai.hasKey() && html`<${Row} title="Test the key" detail=${checking ? 'Asking OpenAI…' : 'Sends a tiny request to check that it works'} onClick=${checking ? undefined : checkKey} />`}
        <p class="small" style="padding:6px 16px 8px">Estimates calories and macros from a food's name, and gives feedback on your day. The app goes online
          only when you tap one of those buttons: an estimate sends what you typed, and feedback sends that day's workout, food, water,
          steps, sleep, weight trend and goals. OpenAI bills the use to your account; a ChatGPT Plus subscription doesn't cover it.</p>
      <//>

      ${GROUPS.map(([title, items]) => html`<${Group} title=${title}>
        ${items.filter((item) => !item.only || item.only === (s.planType ?? 'GYM')).map((item) => html`<${Row} title=${item.label} value=${shown(item, s)} onClick=${() => setEditing(item)} />`)}
        ${title === 'Daily nutrition' && html`<p class="small" style="padding:6px 16px 8px">Your macros add up to ${Fmt.kcal(fromMacros)} (protein and carbs 4 kcal/g, fat 9 kcal/g).</p>`}
        ${title === 'Activity & recovery' && html`<label class="list-row">
          <span class="main"><div class="title">Creatine in the daily checklist</div></span>
          <${Switch} label="Creatine in the daily checklist" checked=${s.checklistCreatine !== false}
            onChange=${(on) => repo.saveSettings({ ...repo.settings(), checklistCreatine: on })} />
        </label>`}
      <//>`)}

      <${Group} title="Workouts & food">
        <${Row} title="Edit workout plan" detail="Exercises, sets, reps, rest" icon="dumbbell" onClick=${() => push({ name: 'plan' })} />
        <${Row} title="My foods" detail="Food list and macros" icon="food" onClick=${() => push({ name: 'foods' })} />
      <//>

      <${Group} title="Your data">
        <${Row} title="Back up to a file" detail="Everything except photos, as JSON. Works with the Android app too." icon="download" onClick=${exportBackup} />
        <${Row} title="Restore from a backup" detail="Replaces the data in the app" icon="upload" onClick=${chooseBackup} />
        <${Row} title="Export daily log (CSV)" detail="Weight, food, water, steps, sleep per day" icon="share"
          onClick=${() => run(() => saveFile(new Blob([backup.exportDailyCsv()], { type: 'text/csv' }), `fitness-daily-${today}.csv`), 'Daily log exported')} />
        <${Row} title="Export workout sets (CSV)" detail="Every set, for progressive overload" icon="share"
          onClick=${() => run(() => saveFile(new Blob([backup.exportSetsCsv()], { type: 'text/csv' }), `fitness-sets-${today}.csv`), 'Workout sets exported')} />
        <${Row} title="Export photos (ZIP)" detail=${photoCount ? `${Fmt.plural(photoCount, 'photo')}, named by date and pose` : 'No photos yet'} icon="image"
          onClick=${() => (photoCount ? run(async () => saveFile((await backup.exportPhotos()).blob, `fitness-photos-${today}.zip`), null) : snack('No progress photos to export yet'))} />
        <${Row} title="Import photos (ZIP)" detail="From a photo export; replaces a photo of the same day and pose" icon="upload" onClick=${choosePhotos} />
        <p class="small" style="padding:6px 16px 8px">Your data is stored only on this phone, inside this app. Nothing is uploaded and there's no account.
          Deleting the app from the Home Screen deletes its data, so back up to a file now and then, and before switching phones.
          ${persisted === true ? ' The phone has been asked to keep this data.' : ''}</p>
      <//>

      <${Group} title="Reset">
        <${Row} title="Reset targets to the plan" detail=${isWalking(s) ? '1,450 kcal · 100 g protein · 5k steps building to 8–10k' : '2,100 kcal · 150 g protein · 8–10k steps'}
          onClick=${() => setDialog({ type: 'reset' })} />
      <//>

      <${Card}>
        <p class="small">Fitness Tracker ${APP_VERSION} · ${PLANS[s.planType ?? 'GYM'].label}.<br />
          ${isWalking(s) ? 'Lose fat gradually while keeping good nutrition, energy and muscle.' : 'Lose fat slowly, preserve strength, reveal existing muscle, then build more.'}</p>
        <p class="small mt8">The web version can't send reminders, show a home-screen widget or read Apple Health, and the rest timer
          beeps only while the app is on screen (with the ringer on). Steps and sleep are typed in.</p>
      <//>
    </main>

    ${editing && html`<${NumberDialog} title=${editing.label} label=${editing.label} suffix=${editing.suffix} decimal=${editing.decimal}
      initial=${numText(s[editing.key], editing.decimal).replace(/,/g, '')} message=${editing.help}
      validate=${(v) => (v < editing.min || v > editing.max ? `Enter ${numText(editing.min, editing.decimal)}–${numText(editing.max, editing.decimal)}` : editing.check?.(s, v) ?? null)}
      onDismiss=${() => setEditing(null)}
      onConfirm=${(v) => { repo.saveSettings({ ...repo.settings(), [editing.key]: editing.decimal ? v : Math.round(v) }); setEditing(null); }} />`}

    ${dialog?.type === 'phase' && html`<${Dialog} title="Phase" onClose=${() => setDialog(null)} actions=${html`<button class="btn text" onClick=${() => setDialog(null)}>Close</button>`}>
      ${(isWalking(s)
        ? [[1, 'Fat loss (deficit, 0.3–0.5 kg/week)'], [2, 'Maintenance (hold your new weight)']]
        : [[1, 'Phase 1 · Cut (deficit, 0.3–0.5 kg/week)'], [2, 'Phase 2 · Lean muscle building (maintenance → small surplus)']]).map(([ph, label]) => html`
        <button class=${`chip ${s.phase === ph ? 'on' : ''}`} style="text-align:left;padding:12px" onClick=${() => {
          repo.saveSettings(ph === 2 ? { ...s, phase: 2, phase2StartEpochDay: s.phase2StartEpochDay ?? todayDay() } : { ...s, phase: 1 });
          setDialog(null);
        }}>${label}</button>`)}
      <p class="small">Switching phase doesn't change your calories; set them under Daily nutrition. The Progress tab suggests a target when you reach your goal weight.</p>
    <//>`}
    ${dialog?.type === 'plan' && html`<${Dialog} title="Plan" onClose=${() => setDialog(null)} actions=${html`<button class="btn text" onClick=${() => setDialog(null)}>Close</button>`}>
      ${Object.entries(PLANS).map(([id, plan]) => html`
        <button class=${`chip ${(s.planType ?? 'GYM') === id ? 'on' : ''}`} style="text-align:left;padding:12px" onClick=${() => {
          if ((s.planType ?? 'GYM') === id) setDialog(null);
          else setDialog({ type: 'switchPlan', planType: id });
        }}><div><b>${plan.label}</b></div><div class="tiny mt4">${plan.description}</div></button>`)}
    <//>`}
    ${dialog?.type === 'switchPlan' && html`<${ConfirmDialog} title=${`Switch to the ${PLANS[dialog.planType].short.toLowerCase()}?`} confirm="Switch"
      text=${`Workouts, meal ideas and the checklist change to the ${PLANS[dialog.planType].short.toLowerCase()}. Your calories and other targets stay as they are: use “Reset targets to the plan” afterwards for its numbers. Logged history is kept.`}
      onDismiss=${() => setDialog(null)}
      onConfirm=${() => { repo.switchPlan(dialog.planType); setDialog(null); snack(`Switched to the ${PLANS[dialog.planType].short.toLowerCase()}`); }} />`}
    ${dialog?.type === 'sex' && html`<${Dialog} title="Sex" onClose=${() => setDialog(null)} actions=${html`<button class="btn text" onClick=${() => setDialog(null)}>Close</button>`}>
      ${[['FEMALE', 'Female'], ['MALE', 'Male']].map(([v, label]) => html`<button class=${`chip ${s.sex === v ? 'on' : ''}`} style="text-align:left;padding:12px"
        onClick=${() => { repo.saveSettings({ ...s, sex: v }); setDialog(null); }}>${label}</button>`)}
      <p class="small">Picks the U.S. Navy body-fat formula (women's uses the hip too) and adds notes that apply.</p>
    <//>`}
    ${dialog?.type === 'key' && html`<${KeyDialog} onDismiss=${() => setDialog(null)} />`}
    ${dialog?.type === 'model' && html`<${ModelDialog} onDismiss=${() => setDialog(null)} />`}
    ${dialog?.type === 'reset' && html`<${ConfirmDialog} title="Reset targets?" confirm="Reset"
      text=${`Calories, macros, water, steps, sleep and rates go back to the ${PLANS[s.planType ?? 'GYM'].short.toLowerCase()}'s numbers. Your weights, dates and logged data are not touched.`}
      onDismiss=${() => setDialog(null)}
      onConfirm=${() => {
        repo.resetTargets();
        setDialog(null);
        snack('Targets reset to the plan');
      }} />`}
    ${dialog?.type === 'restore' && html`<${ConfirmDialog} title="Restore this backup?" confirm="Restore" danger
      text=${`All weigh-ins, food, workouts and settings in the app will be replaced by the backup (${Fmt.plural(dialog.parsed.weights.length, 'weigh-in')}, ${Fmt.plural(dialog.parsed.food.length, 'food')}, ${Fmt.plural(dialog.parsed.sets.length, 'set')}). Photos are kept.`}
      onDismiss=${() => setDialog(null)}
      onConfirm=${async () => {
        const parsed = dialog.parsed;
        setDialog(null);
        const r = await backup.restore(parsed);
        snack(`Restored ${Fmt.plural(r.days, 'day')}: ${Fmt.plural(r.weighIns, 'weigh-in')}, ${Fmt.plural(r.foods, 'food')}, ${Fmt.plural(r.sets, 'set')}`, null, null, 6000);
      }} />`}
    ${dialog?.type === 'importPhotos' && html`<${ConfirmDialog} title="Import these photos?" confirm="Import"
      text="Photos in the file are added. If you already have a photo for the same day and pose, it's replaced."
      onDismiss=${() => setDialog(null)}
      onConfirm=${() => {
        const buffer = dialog.buffer;
        setDialog(null);
        snack('Importing photos…');
        run(async () => {
          const r = await backup.importPhotos(buffer, normalizePhoto);
          snack(`Imported ${Fmt.plural(r.imported, 'photo')}${r.skipped ? `, skipped ${r.skipped}` : ''}`);
        });
      }} />`}
  `;
}

function KeyDialog({ onDismiss }) {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  return html`<${Dialog} title=${ai.hasKey() ? 'Change your API key' : 'Add your OpenAI API key'} onClose=${onDismiss} actions=${html`
    ${ai.hasKey() && html`<span class="left"><button class="btn danger" onClick=${() => { ai.removeKey(); onDismiss(); snack('API key removed'); }}>Remove</button></span>`}
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" disabled=${!key.trim()} onClick=${async () => { await ai.saveKey(key); onDismiss(); snack('API key saved'); }}>Save</button>`}>
    <p class="small">Create a key at platform.openai.com, under API keys, and paste it here. Your OpenAI account needs some credit.
      The key is stored encrypted on this phone, left out of backups and sent only to OpenAI.</p>
    <${Field} label="API key (sk-…)"><${TextInput} value=${key} onInput=${setKey} type=${show ? 'text' : 'password'} autofocus /><//>
    <button class="btn text" style="align-self:flex-start" onClick=${() => setShow(!show)}>${show ? 'Hide key' : 'Show key'}</button>
  <//>`;
}

function ModelDialog({ onDismiss }) {
  const current = ai.model();
  const [custom, setCustom] = useState(ai.MODELS.some((m) => m.id === current) ? '' : current);
  return html`<${Dialog} title="ChatGPT model" onClose=${onDismiss} actions=${html`<button class="btn text" onClick=${onDismiss}>Close</button>`}>
    ${ai.MODELS.map((m) => html`<button class=${`chip ${m.id === current ? 'on' : ''}`} style="text-align:left;padding:10px 12px"
      onClick=${() => { ai.setModel(m.id); onDismiss(); }}><div><b>${m.label}</b></div><div class="tiny">${m.detail}</div></button>`)}
    <${Field} label="Or another model ID"><${TextInput} value=${custom} onInput=${setCustom} /><//>
    <button class="btn tonal" disabled=${!custom.trim()} onClick=${() => { ai.setModel(custom); onDismiss(); }}>Use this ID</button>
    <p class="small">Luna is plenty for estimates and feedback. Feedback costs a fraction of a cent with it.</p>
  <//>`;
}

// ------------------------------------------------------------------ workout plan editor

export function PlanScreen() {
  const [confirm, setConfirm] = useState(false);
  const plan = repo.plan();
  return html`
    <${BackBar} title="Workout plan" />
    <main class="content no-nav">
      <p class="small">${isWalking(repo.settings())
        ? 'Two short strength sessions a week, on any days you like; they alternate A and B. A suggested starting point: change exercises, sets and reps to suit you. Edits apply from your next session; past sessions keep their history.'
        : 'Workouts run in this order, normally Monday to Saturday, and Sunday is always a rest day. A day off pauses the order, so nothing is skipped. Edits apply from your next session; past sessions keep their history.'}</p>
      <${Card} class="flush">
        ${repo.templates().map((t) => {
          const items = plan.filter((p) => p.templateId === t.id);
          return html`<button class="list-row" onClick=${() => push({ name: 'planTemplate', templateId: t.id })}>
            <span class="main"><div class="title row">${t.name}${t.hasAbs && html`<${Tag} em>+ ABS<//>`}</div>
              <div class="detail">${t.dayOfWeek >= 1 && t.dayOfWeek <= 7 ? dayName(3 + t.dayOfWeek) : 'Any day'} · ${items.length} exercises · ${items.reduce((a, p) => a + p.sets, 0)} sets</div></span>
            <span class="ink2"><${Icon} name="right" size=${18} /></span>
          </button>`;
        })}
      <//>
      <button class="btn outline block" onClick=${() => setConfirm(true)}>Reset to the built-in plan</button>
    </main>
    ${confirm && html`<${ConfirmDialog} title="Reset the workout plan?" confirm="Reset" danger
      text="The workouts go back to the built-in plan, undoing your edits. Logged workouts and their history aren't touched."
      onDismiss=${() => setConfirm(false)} onConfirm=${() => { repo.applyBuiltInPlan(); setConfirm(false); snack('Workout plan reset to the built-in plan'); }} />`}
  `;
}

export function PlanTemplateScreen({ templateId }) {
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [adding, setAdding] = useState(false);
  const template = repo.templates().find((t) => t.id === templateId);
  const items = repo.plan().filter((p) => p.templateId === templateId).sort((a, b) => a.position - b.position);
  return html`
    <${BackBar} title=${template?.name ?? 'Workout'} />
    <main class="content no-nav">
      ${items.map((item, i) => html`<${Card} class="tight">
        <div class="row top">
          <div class="grow" style="cursor:pointer" onClick=${() => setEditing(item)}>
            <div class="card-title">${item.name}</div>
            <div class="small">${item.sets} × ${item.repMin}–${item.repMax}${item.measure === Measure.SECONDS ? ' s' : ''} · rest ${item.restSeconds} s · ${item.muscleGroup}</div>
            ${item.notes && html`<div class="small">${item.notes}</div>`}
          </div>
          <button class="icon-btn" aria-label="Edit" onClick=${() => setEditing(item)}><${Icon} name="edit" size=${18} /></button>
        </div>
        <div class="row mt4">
          <button class="icon-btn" aria-label="Move up" disabled=${i === 0} onClick=${() => repo.movePlanItem(templateId, item.teId, true)}><${Icon} name="arrowUp" size=${18} /></button>
          <button class="icon-btn" aria-label="Move down" disabled=${i === items.length - 1} onClick=${() => repo.movePlanItem(templateId, item.teId, false)}><${Icon} name="arrowDown" size=${18} /></button>
          <span class="grow"></span>
          <button class="btn danger small" onClick=${() => setRemoving(item)}>Remove</button>
        </div>
      <//>`)}
      <button class="btn outline block" onClick=${() => setAdding(true)}><${Icon} name="plus" size=${18} /> Add exercise</button>
    </main>
    ${editing && html`<${PlanItemDialog} item=${editing} onDismiss=${() => setEditing(null)} />`}
    ${removing && html`<${ConfirmDialog} title=${`Remove ${removing.name}?`} confirm="Remove" danger
      text=${`It comes off ${template?.name ?? 'this workout'}. Logged history for the exercise is kept.`}
      onDismiss=${() => setRemoving(null)} onConfirm=${() => { repo.deletePlanItem(templateId, removing.teId); setRemoving(null); }} />`}
    ${adding && html`<${AddExerciseDialog} catalog=${repo.exercises()} exclude=${new Set(items.map((p) => p.exerciseId))}
      onDismiss=${() => setAdding(false)}
      onPick=${(id) => { const e = repo.exercise(id); repo.addPlanItem(templateId, id, e.measure, e.kind); setAdding(false); }} />`}
  `;
}

function PlanItemDialog({ item, onDismiss }) {
  const [name, setName] = useState(item.name);
  const [sets, setSets] = useState(String(item.sets));
  const [repMin, setRepMin] = useState(String(item.repMin));
  const [repMax, setRepMax] = useState(String(item.repMax));
  const [rest, setRest] = useState(String(item.restSeconds));
  const [notes, setNotes] = useState(item.notes ?? '');
  const int = (t) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : null);
  const v = { sets: int(sets), repMin: int(repMin), repMax: int(repMax), rest: int(rest) };
  const timed = item.measure === Measure.SECONDS;
  const errors = {
    sets: v.sets == null || v.sets < 1 || v.sets > 10 ? 'Enter 1–10' : null,
    repMin: v.repMin == null || v.repMin < 1 || v.repMin > 300 ? 'Enter 1–300' : null,
    repMax: v.repMax == null || v.repMax < (v.repMin ?? 1) || v.repMax > 300 ? 'At least the minimum' : null,
    rest: v.rest == null || v.rest < 15 || v.rest > 600 ? 'Enter 15–600 s' : null,
  };
  const ok = name.trim() && Object.values(errors).every((e) => !e);
  const save = () => {
    if (!ok) return;
    const te = db.tables.templateExercises.get(item.teId);
    repo.updatePlanItem({ ...te, sets: v.sets, repMin: v.repMin, repMax: v.repMax, restSeconds: v.rest, notes: notes.trim() || null });
    const e = repo.exercise(item.exerciseId);
    if (e && name.trim() !== e.name) repo.updateExercise({ ...e, name: name.trim() });
    onDismiss();
  };
  return html`<${Dialog} title="Edit exercise" onClose=${onDismiss} actions=${html`
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" disabled=${!ok} onClick=${save}>Save</button>`}>
    <${Field} label="Name (renames it everywhere)"><${TextInput} value=${name} onInput=${setName} /><//>
    <div class="split">
      <${Field} label="Sets" error=${errors.sets}><${NumberInput} value=${sets} onInput=${setSets} decimal=${false} /><//>
      <${Field} label="Rest" suffix="s" error=${errors.rest}><${NumberInput} value=${rest} onInput=${setRest} decimal=${false} /><//>
      <${Field} label=${timed ? 'Seconds, min' : 'Reps, min'} error=${errors.repMin}><${NumberInput} value=${repMin} onInput=${setRepMin} decimal=${false} /><//>
      <${Field} label=${timed ? 'Seconds, max' : 'Reps, max'} error=${errors.repMax}><${NumberInput} value=${repMax} onInput=${setRepMax} decimal=${false} /><//>
    </div>
    <p class="tiny">Compounds 120–180 s, isolation and abs 60–120 s · ${ExerciseKind.label(item.kind)}</p>
    <${Field} label="Notes"><${TextInput} value=${notes} onInput=${setNotes} /><//>
  <//>`;
}
