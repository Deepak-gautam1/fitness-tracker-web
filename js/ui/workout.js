// Workout: log each set, see last time and the target, rest timer, finish (WorkoutScreen.kt /
// WorkoutViewModel.kt), plus an exercise's history (ExerciseHistoryScreen.kt).

import { useState, useEffect } from '../../vendor/preact-htm.js';
import * as repo from '../repo.js';
import * as ai from '../ai.js';
import { Analytics, DayStatus, ExerciseKind, Fmt, Measure, fmtWeight, isSunday, isWalking, weekStart } from '../domain.js';
import { app, push, selectDay, snack } from './state.js';
import { startTimer, adjustTimer, skipTimer, timerState, timerFinishedAt, unlockAudio } from './timer.js';
import {
  html, Icon, TopBar, BackBar, Card, CardHeader, SectionLabel, Tag, MeterBar, DateSelector, Dialog, ConfirmDialog,
  CardioCard, CardioDialog, CoachCard, Field, TextInput, Chips, EmptyNote,
} from './kit.js';
import { LineChart } from './charts.js';

// Kept while the app runs, like the Android view model: extra exercises, extra set rows, "train anyway".
const local = { extraExercises: new Map(), extraRows: new Map(), trainAnyway: new Set() };

function workoutState(day, today) {
  const settings = repo.settings();
  const templates = repo.templates();
  if (templates.length === 0) return null;
  const ws = weekStart(day);
  const planAll = repo.plan();
  const plannedSets = repo.plannedSetsByTemplate(planAll);
  // The walking plan has no workout order or rest days: two optional sessions a week, A then B.
  const walking = isWalking(settings);
  const order = walking ? new Map() : repo.rotation(ws, ws + 6, today);
  const logs = repo.dailyLogMap();
  const session = repo.session(day);
  const sunday = !walking && isSunday(day);
  const restMarked = !walking && logs.get(day)?.restDay === true;
  const showRest = session == null && (sunday || restMarked) && !local.trainAnyway.has(day);
  // Training on a rest day starts with the next workout in order.
  const upNext = walking ? repo.nextStrengthTemplate(day) : order.get(day)?.next ?? null;
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const template = (session && templateById.get(session.templateId)) || order.get(day)?.workout || upNext || templates[0];

  const planItems = planAll.filter((p) => p.templateId === template.id).sort((a, b) => a.position - b.position);
  const setsToday = repo.setsForDay(day);
  const setsByExercise = new Map();
  for (const s of setsToday) {
    if (!setsByExercise.has(s.exerciseId)) setsByExercise.set(s.exerciseId, []);
    setsByExercise.get(s.exerciseId).push(s);
  }
  const previous = repo.previousSets(day);
  const best = repo.bestBefore(day);
  const catalog = repo.exercises();
  const catalogById = new Map(catalog.map((e) => [e.id, e]));
  const plannedIds = new Set(planItems.map((p) => p.exerciseId));
  const extraIds = [...new Set([
    ...[...setsToday].sort((a, b) => a.completedAt - b.completedAt).map((s) => s.exerciseId),
    ...(local.extraExercises.get(day) ?? []),
  ])].filter((id) => !plannedIds.has(id));

  const card = (pe, isExtra) => {
    const logged = [...(setsByExercise.get(pe.exerciseId) ?? [])].sort((a, b) => a.setNumber - b.setNumber);
    const last = previous.get(pe.exerciseId) ?? [];
    const suggestion = Analytics.suggest(pe, last);
    const extraRows = local.extraRows.get(`${day}:${pe.exerciseId}`) ?? 0;
    const rowCount = Math.max(pe.sets, logged.length ? Math.max(...logged.map((s) => s.setNumber)) : 0) + extraRows;
    const priorBest = best.get(pe.exerciseId);
    let bestToday = null;
    for (const s of logged) {
      if (!bestToday || Analytics.setScore(s.weightKg, s.reps, pe.measure) > Analytics.setScore(bestToday.weightKg, bestToday.reps, pe.measure)) bestToday = s;
    }
    const pbId = bestToday && priorBest != null && Analytics.setScore(bestToday.weightKg, bestToday.reps, pe.measure) > priorBest + 1e-9 ? bestToday.id : null;
    const fallbackWeight = suggestion.weightKg ?? (last.length ? last[last.length - 1].weightKg : null);
    const rows = [];
    for (let n = 1; n <= rowCount; n++) {
      const l = logged.find((s) => s.setNumber === n) ?? null;
      rows.push({
        setNumber: n, logged: l, targetWeight: fallbackWeight,
        targetReps: suggestion.reps[n - 1] ?? suggestion.reps[suggestion.reps.length - 1] ?? pe.repMin,
        isPb: l != null && l.id === pbId,
      });
    }
    return {
      ...pe, timed: pe.measure === Measure.SECONDS, lastDay: last[0]?.epochDay ?? null, lastSets: last, suggestion, rows,
      isExtra, doneSets: logged.length, extraRows,
    };
  };

  const cards = [
    ...planItems.map((p) => card(p, false)),
    ...extraIds.map((id) => {
      const e = catalogById.get(id);
      if (!e) return null;
      const timed = e.measure === Measure.SECONDS;
      return card({
        teId: -1, templateId: template.id, exerciseId: e.id, position: 1e9, sets: timed ? 2 : 3,
        repMin: timed ? 30 : 8, repMax: timed ? 60 : 12, restSeconds: ExerciseKind.defaultRestSeconds(e.kind), notes: null,
        name: e.name, muscleGroup: e.muscleGroup, kind: e.kind, measure: e.measure,
      }, true);
    }).filter(Boolean),
  ];

  const statusFor = (d, templateId) => Analytics.dayStatus({
    day: d, today, programStart: settings.programStartEpochDay, restMarked: logs.get(d)?.restDay === true,
    sets: repo.setCount(d), plannedSets: templateId ? plannedSets.get(templateId) ?? 0 : 0,
    finished: repo.session(d)?.finishedAt != null,
  });
  const weekStatuses = [0, 1, 2, 3, 4, 5, 6].map((i) => statusFor(ws + i, order.get(ws + i)?.workout?.id));
  const cardio = repo.cardio(ws, ws + 6);
  const measureById = new Map(catalog.map((e) => [e.id, e.measure]));
  return {
    day, isToday: day === today, settings, walking, templates, upNext, template, isSunday: sunday, restMarked, showRest, session,
    status: statusFor(day, template.id), exercises: cards,
    plannedSets: planItems.reduce((a, p) => a + p.sets, 0), doneSets: setsToday.length,
    weekDone: walking ? repo.workoutDays(ws, ws + 6) : weekStatuses.filter((x) => x === DayStatus.DONE).length,
    weekPlanned: walking ? settings.strengthSessionsPerWeek : [0, 1, 2, 3, 4, 5].filter((i) => logs.get(ws + i)?.restDay !== true).length,
    catalog, cardioToday: cardio.filter((c) => c.epochDay === day), cardioThisWeek: cardio.length,
    lastSetAt: setsToday.length ? Math.max(...setsToday.map((s) => s.completedAt)) : null,
    pbCount: cards.filter((c) => c.rows.some((r) => r.isPb)).length,
    volumeKg: setsToday.filter((s) => measureById.get(s.exerciseId) !== Measure.SECONDS).reduce((a, s) => a + s.weightKg * s.reps, 0),
  };
}

export function WorkoutScreen({ refresh }) {
  const s = workoutState(app.day, app.today);
  const [dialog, setDialog] = useState(null);
  if (!s) return html`<${TopBar} title="Workout" /><main class="content"><${EmptyNote}>No workout plan yet.<//></main>`;
  const day = s.day;

  const logSet = (card, setNumber, weightKg, reps, rir) => {
    unlockAudio();
    repo.logSet(day, s.template.id, card.exerciseId, setNumber, weightKg, reps, rir);
    if (day === app.today) startTimer(card.restSeconds, card.name);
  };
  const finish = () => {
    skipTimer();
    repo.finishSession(day);
    setDialog('summary');
  };

  return html`
    <${TopBar} title="Workout" />
    <main class="content">
      <${DateSelector} day=${day} onChange=${selectDay} />
      ${s.showRest
        ? html`<${RestDayPanel} s=${s} onTrainAnyway=${() => { local.trainAnyway.add(day); refresh(); }} />`
        : html`
          <${SessionHeader} s=${s} onFinish=${() => (s.doneSets < s.plannedSets ? setDialog('confirmFinish') : finish())} />
          ${s.exercises.map((c) => html`<${ExerciseCard} key=${`${day}:${c.exerciseId}`} card=${c} day=${day} refresh=${refresh}
            onLog=${(n, w, r, rir) => logSet(c, n, w, r, rir)} />`)}
          <button class="btn outline block" onClick=${() => setDialog('addExercise')}><${Icon} name="plus" size=${18} /> Add an exercise to this session</button>
        `}
      <${CardioCard} settings=${s.settings} entriesToday=${s.cardioToday} sessionsThisWeek=${s.cardioThisWeek}
        onAdd=${() => setDialog('cardio')} onDelete=${(e) => repo.deleteCardio(e.id)} />
    </main>

    ${dialog === 'cardio' && html`<${CardioDialog} onDismiss=${() => setDialog(null)}
      onSave=${(type, minutes) => { repo.addCardio(day, type, minutes); setDialog(null); }} />`}
    ${dialog === 'addExercise' && html`<${AddExerciseDialog} catalog=${s.catalog} exclude=${new Set(s.exercises.map((c) => c.exerciseId))}
      onDismiss=${() => setDialog(null)}
      onPick=${(id) => {
        local.extraExercises.set(day, [...(local.extraExercises.get(day) ?? []), id]);
        setDialog(null);
        refresh();
      }} />`}
    ${dialog === 'confirmFinish' && html`<${ConfirmDialog} title="Finish workout?"
      text=${`You've logged ${s.doneSets} of ${s.plannedSets} planned sets. Finishing marks the workout as done.`}
      confirm="Finish" onDismiss=${() => setDialog(null)} onConfirm=${finish} />`}
    ${dialog === 'summary' && html`<${SummaryDialog} s=${s} onDismiss=${() => setDialog(null)}
      onFeedback=${() => { ai.requestFeedback(day); setDialog('coach'); }} />`}
    ${dialog === 'coach' && html`<${Dialog} title="" onClose=${() => setDialog(null)}
      actions=${html`<button class="btn text" onClick=${() => setDialog(null)}>Close</button>`}>
      <${CoachCard} day=${day} isToday=${s.isToday} />
    <//>`}
  `;
}

function RestDayPanel({ s, onTrainAnyway }) {
  const next = s.upNext ? ` Next workout: ${s.upNext.name}.` : '';
  return html`<${Card}>
    <div class="row">
      <div class="grow">
        <${SectionLabel}>${s.isSunday ? 'Sunday' : 'Day off'}<//>
        <div class="big mt4">${s.isSunday ? 'REST / BREAK' : 'DAY OFF'}</div>
      </div>
    </div>
    <p class="small mt6">${s.isSunday
      ? `No resistance training today. Recovery is part of the plan, so Sunday never counts as a missed workout.${next}`
      : `A day off pauses the workout order, so nothing is skipped.${next}`}</p>
    <p class="small mt6">Focus on recovery, sleep, hydration and normal nutrition. Walking and light mobility are optional.</p>
    <div class="row mt12">
      <button class="btn outline" onClick=${onTrainAnyway}>Log a workout anyway</button>
      ${s.restMarked && !s.isSunday && html`<button class="btn text" onClick=${() => repo.updateDaily(s.day, (l) => ({ ...l, restDay: false }))}>Undo day off</button>`}
    </div>
  <//>`;
}

function SessionHeader({ s, onFinish }) {
  const [menu, setMenu] = useState(false);
  const t = s.template;
  const next = s.upNext;
  const finished = s.session?.finishedAt != null;
  const label = s.walking
    ? `Optional · ${s.settings.strengthSessionsPerWeek} short sessions a week help keep muscle while you lose fat`
    : s.isSunday || s.restMarked ? 'Extra session on a rest day' : next == null || next.id === t.id ? 'Next in order' : `Swapped in for ${next.name}`;
  return html`<${Card}>
    <${SectionLabel}>${s.walking ? 'Strength session' : s.isToday ? "Today's workout" : 'Workout'}<//>
    <div class="menu mt4">
      <button class="row" style="background:none;border:0;padding:0;cursor:pointer" onClick=${() => setMenu(!menu)} aria-label="Change workout">
        <span class="big">${t.name.toUpperCase()}</span><${Icon} name="down" />
        ${t.hasAbs && html`<${Tag} em>+ ABS<//>`}
      </button>
      ${menu && html`<div class="menu-list">
        ${s.templates.map((x) => html`<button class=${x.id === t.id ? 'on' : ''} onClick=${() => { setMenu(false); repo.chooseTemplate(s.day, x.id); }}>
          ${x.id === s.upNext?.id ? `${x.name} · next in order` : x.name}</button>`)}
      </div>`}
    </div>
    <div class="small">${label}</div>
    <div class="mt10"><${MeterBar} fraction=${s.plannedSets ? s.doneSets / s.plannedSets : 0} tone=${s.status === DayStatus.DONE ? 'GOOD' : 'PROGRESS'} /></div>
    <div class="row mt10">
      <span class="grow"><b>${s.doneSets} / ${s.plannedSets} sets</b> <${DurationLabel} s=${s} /></span>
      ${finished
        ? html`<button class="btn outline small" onClick=${() => repo.reopenSession(s.day)}>Resume workout</button>`
        : s.session?.startedAt == null && s.doneSets === 0
          ? html`<button class="btn small" onClick=${() => { unlockAudio(); repo.startSession(s.day, t.id); }}>Start workout</button>`
          : html`<button class="btn small" onClick=${onFinish}>Finish workout</button>`}
    </div>
    <div class="tiny mt6">This week ${s.weekDone} / ${s.weekPlanned}${s.walking ? ' sessions' : ''}</div>
  <//>`;
}

function DurationLabel({ s }) {
  const running = s.session?.startedAt != null && s.session.finishedAt == null && s.isToday;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const start = s.session?.startedAt;
  if (start == null) return null;
  const end = s.session.finishedAt ?? (s.isToday ? Date.now() : s.lastSetAt ?? start);
  return html`<span class="tiny nowrap"> · <${Icon} name="timer" size=${16} class="inline" /> ${Fmt.duration(end - start)}</span>`;
}

const restLabel = (seconds) => (seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);

function lastLine(card) {
  const sets = card.lastSets;
  if (sets.length === 0) return 'No previous session: today sets your baseline.';
  const unit = card.timed ? ' s' : '';
  const weights = [...new Set(sets.map((x) => x.weightKg))];
  const body = weights.length === 1
    ? (weights[0] > 0 ? `${fmtWeight(weights[0])} kg × ` : 'BW × ') + sets.map((x) => `${x.reps}${unit}`).join(', ')
    : sets.map((x) => `${x.weightKg > 0 ? fmtWeight(x.weightKg) : 'BW'} × ${x.reps}${unit}`).join(', ');
  return `Last · ${Fmt.date(card.lastDay)}: ${body}`;
}

function ExerciseCard({ card, day, onLog, refresh }) {
  const key = `${day}:${card.exerciseId}`;
  const lastRow = card.rows[card.rows.length - 1];
  return html`<${Card} class="tight">
    <div class="row top">
      <div class="grow">
        <div class="row"><span class="card-title">${card.name}</span>${card.isExtra && html`<${Tag}>Extra<//>`}</div>
        <div class="small">${card.muscleGroup} · ${card.sets} × ${card.repMin}–${card.repMax}${card.timed ? ' s' : ''} · rest ${restLabel(card.restSeconds)}</div>
        ${card.notes && html`<div class="small">${card.notes}</div>`}
      </div>
      <button class="icon-btn" aria-label=${`History of ${card.name}`} onClick=${() => push({ name: 'history', exerciseId: card.exerciseId })}><${Icon} name="history" size=${20} /></button>
    </div>
    <div class="small mt4">${lastLine(card)}</div>
    <div class="suggestion"><${Icon} name=${card.suggestion.increaseLoad ? 'trend' : 'flag'} size=${16} /><span>${card.suggestion.text}</span></div>
    <div class="set-table">
      <div class="set-head"><span>SET</span><span>KG</span><span>${card.timed ? 'SEC' : 'REPS'}</span><span>RIR</span><span></span><span>DONE</span></div>
      ${card.rows.map((row, i) => {
        // Empty kg boxes default to the weight of the last set logged above, else the target.
        const above = card.rows.slice(0, i).filter((r) => r.logged).pop();
        const carry = above ? above.logged.weightKg : row.targetWeight;
        return html`<${SetRow} key=${`${key}:${row.setNumber}`} card=${card} row=${row} carry=${carry}
          onLog=${(w, r, rir) => onLog(row.setNumber, w, r, rir)} />`;
      })}
    </div>
    <div class="row">
      <button class="btn text small" onClick=${() => { local.extraRows.set(key, card.extraRows + 1); refresh(); }}>+ Add set</button>
      ${card.extraRows > 0 && lastRow && !lastRow.logged && html`<button class="btn text small"
        onClick=${() => { const n = card.extraRows - 1; if (n <= 0) local.extraRows.delete(key); else local.extraRows.set(key, n); refresh(); }}>Remove set</button>`}
    </div>
  <//>`;
}

/**
 * One set. The kg and reps boxes start empty and show the target in grey; tapping the circle
 * logs whatever is typed, or the grey target if a box was left empty.
 */
function SetRow({ card, row, carry, onLog }) {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState(row.logged?.rir ?? null);
  const logged = row.logged;
  const weightValue = weight.trim() ? Fmt.parseDecimal(weight) : carry ?? 0;
  const repsValue = reps.trim() ? (/^\d+$/.test(reps.trim()) ? Number(reps.trim()) : null) : row.targetReps;
  const valid = weightValue != null && weightValue >= 0 && weightValue <= 500 && repsValue != null && repsValue >= 1 && repsValue <= 999;
  const submit = () => {
    if (!valid) return;
    document.activeElement?.blur?.();
    onLog(weightValue, repsValue, rir);
  };

  if (logged) {
    return html`<div class="set-row logged">
      <span class="n">${row.setNumber}</span>
      <span class="v">${logged.weightKg > 0 ? `${fmtWeight(logged.weightKg)} kg` : 'BW'}</span>
      <span class="v">× ${logged.reps}${card.timed ? ' s' : ''}</span>
      <span class="rir">${logged.rir != null ? `RIR ${logged.rir}` : ''}</span>
      <span class="pb">${row.isPb && html`<span title="Personal best"><${Icon} name="trophy" size=${20} /></span>`}</span>
      <button class="done-btn on" aria-label=${`Set ${row.setNumber} done, tap to undo`} onClick=${() => {
        // Put the logged numbers back in the boxes so a mis-tap is easy to fix.
        setWeight(fmtWeight(logged.weightKg));
        setReps(String(logged.reps));
        setRir(logged.rir ?? null);
        repo.deleteSet(logged.id);
      }}><${Icon} name="checkCircle" size=${28} /></button>
    </div>`;
  }
  return html`<div class="set-row">
    <span class="n">${row.setNumber}</span>
    <input type="text" inputmode="decimal" enterkeyhint="next" value=${weight} placeholder=${carry != null ? fmtWeight(carry) : 'kg'}
      aria-label=${`Set ${row.setNumber} weight in kg`} onInput=${(e) => setWeight(e.target.value)} />
    <input type="text" inputmode="numeric" enterkeyhint="done" value=${reps} placeholder=${String(row.targetReps)}
      aria-label=${`Set ${row.setNumber} ${card.timed ? 'seconds' : 'reps'}`} onInput=${(e) => setReps(e.target.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
    <select aria-label="Reps in reserve (aim for 1–3)" value=${rir == null ? '' : String(rir)}
      onChange=${(e) => setRir(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">–</option>
      ${[0, 1, 2, 3, 4, 5].map((n) => html`<option value=${String(n)}>${n}</option>`)}
    </select>
    <span></span>
    <button class="done-btn" disabled=${!valid} aria-label=${`Complete set ${row.setNumber}`} onClick=${submit}><${Icon} name="circle" size=${28} /></button>
  </div>`;
}

/** The rest countdown between sets, with ±15 s and skip; flashes "Rest over" when done. */
export function TimerBar() {
  const [, tick] = useState(0);
  const s = timerState();
  const finished = timerFinishedAt();
  useEffect(() => {
    if (!s) return undefined;
    const id = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [s?.endsAt]);
  if (!s && finished) {
    return html`<div class="timer-bar over row"><b class="grow" style="padding:8px 0">Rest over. Next set!</b></div>`;
  }
  if (!s) return null;
  const left = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
  const fraction = s.totalSeconds ? left / s.totalSeconds : 0;
  return html`<div class="timer-bar" role="timer">
    <div class="row">
      <span class="time">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>
      <span class="grow tiny ellipsis">Rest · ${s.label}</span>
      <button class="btn text tight" onClick=${() => adjustTimer(-15)}>−15s</button>
      <button class="btn text tight" onClick=${() => adjustTimer(15)}>+15s</button>
      <button class="btn text tight" onClick=${skipTimer}>Skip</button>
    </div>
    <${MeterBar} fraction=${fraction} />
  </div>`;
}

function SummaryDialog({ s, onDismiss, onFeedback }) {
  const sess = repo.session(s.day);
  const start = sess?.startedAt;
  const end = sess?.finishedAt;
  return html`<${Dialog} title="Workout complete" onClose=${onDismiss} actions=${html`
    ${ai.hasKey() && html`<button class="btn text" onClick=${onFeedback}>Get AI feedback</button>`}
    <button class="btn text" onClick=${onDismiss}>Done</button>`}>
    <p>${s.template.name}: ${s.doneSets} sets</p>
    ${start != null && end != null && html`<p>Duration ${Fmt.duration(end - start)}</p>`}
    ${s.volumeKg > 0 && html`<p>Volume ${Fmt.int(s.volumeKg)} kg</p>`}
    ${s.pbCount > 0 && html`<p>${s.pbCount} personal best${s.pbCount === 1 ? '' : 's'}</p>`}
    <p class="ink2">Log your food, water and steps on the Today tab.</p>
  <//>`;
}

/** Search the catalogue, or create a new exercise. */
export function AddExerciseDialog({ catalog, exclude, onPick, onDismiss, title = 'Add exercise' }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('');
  const [kind, setKind] = useState(ExerciseKind.ISOLATION);
  const [measure, setMeasure] = useState(Measure.REPS);
  const q = query.trim().toLowerCase();
  const matches = catalog.filter((e) => !exclude.has(e.id) && (!q || e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q)));
  if (creating) {
    return html`<${Dialog} title="New exercise" onClose=${onDismiss} actions=${html`
      <button class="btn text" onClick=${() => setCreating(false)}>Back</button>
      <button class="btn text" disabled=${!name.trim()} onClick=${() => onPick(repo.createExercise(name, muscle, kind, measure))}>Add</button>`}>
      <${Field} label="Name"><${TextInput} value=${name} onInput=${setName} autofocus /><//>
      <${Field} label="Muscle group"><${TextInput} value=${muscle} onInput=${setMuscle} /><//>
      <${Chips} options=${ExerciseKind.all.map((k) => [k, ExerciseKind.label(k)])} value=${kind} onChange=${setKind} />
      <${Chips} options=${[[Measure.REPS, 'Reps'], [Measure.SECONDS, 'Seconds']]} value=${measure} onChange=${setMeasure} />
    <//>`;
  }
  return html`<${Dialog} title=${title} onClose=${onDismiss} actions=${html`<button class="btn text" onClick=${onDismiss}>Cancel</button>`}>
    <${Field} label="Search"><${TextInput} value=${query} onInput=${setQuery} /><//>
    <div style="max-height:45vh;overflow-y:auto;margin:0 -8px">
      ${matches.map((e) => html`<button class="list-row" style="padding:8px" onClick=${() => onPick(e.id)}>
        <span class="main"><div class="title">${e.name}</div><div class="detail">${e.muscleGroup} · ${ExerciseKind.label(e.kind)}</div></span>
      </button>`)}
      ${matches.length === 0 && html`<p class="small" style="padding:8px">No match.</p>`}
    </div>
    <button class="btn text" style="align-self:flex-start" onClick=${() => { setName(query.trim()); setCreating(true); }}>Create a new exercise</button>
  <//>`;
}

// ------------------------------------------------------------------ exercise history

export function ExerciseHistoryScreen({ exerciseId }) {
  const [renaming, setRenaming] = useState(false);
  const e = repo.exercise(exerciseId);
  const sets = repo.history(exerciseId);
  const measure = e?.measure ?? Measure.REPS;
  const timed = measure === Measure.SECONDS;
  const bodyweight = sets.length > 0 && sets.every((x) => x.weightKg <= 0);
  const scoreLabel = timed ? 'Longest hold' : bodyweight ? 'Most reps' : 'Best estimated 1RM';
  const unit = timed ? 's' : bodyweight ? 'reps' : 'kg';
  const byDay = new Map();
  for (const x of sets) {
    if (!byDay.has(x.epochDay)) byDay.set(x.epochDay, []);
    byDay.get(x.epochDay).push(x);
  }
  const sessions = [...byDay.entries()].map(([day, list]) => ({
    day, sets: list.sort((a, b) => a.setNumber - b.setNumber),
    best: Math.max(...list.map((x) => Analytics.setScore(x.weightKg, x.reps, measure))),
  }));
  const points = [...sessions].reverse().map((x) => ({ x: x.day, y: x.best }));
  return html`
    <${BackBar} title=${e?.name ?? 'History'} actions=${e && html`<button class="icon-btn ink" aria-label="Rename exercise" onClick=${() => setRenaming(true)}><${Icon} name="edit" /></button>`} />
    <main class="content no-nav">
      ${sessions.length === 0
        ? html`<${Card}><${EmptyNote}>No sets logged yet. Your sessions will appear here.<//><//>`
        : html`
          <${Card}>
            <${CardHeader} title=${`${scoreLabel} per session`} subtitle=${!timed && !bodyweight ? 'Estimated 1RM = weight × (1 + reps ÷ 30). It lets sets with different reps be compared fairly.' : null} />
            ${points.length >= 2 && html`<div class="mt12"><${LineChart} series=${[{ points, cls: 'avg', dots: true }]} unit=${unit} /></div>`}
          <//>
          <${Card}>
            <${CardHeader} title="Sessions" subtitle=${Fmt.plural(sessions.length, 'session')} />
            <div class="stack mt10">
              ${sessions.map((x) => html`<div>
                <div class="row"><b class="grow">${Fmt.date(x.day)}</b><span class="small">Best ${Fmt.num(x.best)} ${unit}</span></div>
                ${x.sets.map((st) => {
                  const load = st.weightKg > 0 ? `${Fmt.num(st.weightKg, 2)} kg` : 'BW';
                  const reps = timed ? `${st.reps} s` : `${st.reps}`;
                  return html`<div class="small">Set ${st.setNumber}: ${load} × ${reps}${st.rir != null ? ` · RIR ${st.rir}` : ''}</div>`;
                })}
              </div>`)}
            </div>
          <//>`}
    </main>
    ${renaming && html`<${RenameDialog} initial=${e.name} onDismiss=${() => setRenaming(false)}
      onSave=${(n) => { if (n.trim()) repo.updateExercise({ ...e, name: n.trim() }); setRenaming(false); snack('Exercise renamed'); }} />`}
  `;
}

function RenameDialog({ initial, onSave, onDismiss }) {
  const [name, setName] = useState(initial);
  return html`<${Dialog} title="Rename exercise" onClose=${onDismiss} actions=${html`
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" disabled=${!name.trim()} onClick=${() => onSave(name)}>Save</button>`}>
    <${Field} label="Name"><${TextInput} value=${name} onInput=${setName} autofocus onEnter=${() => onSave(name)} /><//>
  <//>`;
}
