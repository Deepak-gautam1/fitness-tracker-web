// Today: the day's workout, the week, the daily checklist, food, water, steps, weight, cardio and
// recovery (TodayScreen.kt / TodayViewModel.kt). On Sundays it also shows the weekly check-in,
// which the Android app sends as a notification.

import { useState } from '../../vendor/preact-htm.js';
import * as repo from '../repo.js';
import {
  Analytics, DayStatus, Fmt, Meters, buildChecklist, isSunday, isWalking, stepsGoalFor, stepsStatus, weekStart, weeklyCheckIn, dayName,
} from '../domain.js';
import { app, openTab, push, selectDay, snack } from './state.js';
import {
  html, Icon, TopBar, Card, CardHeader, SectionLabel, Tag, MeterBar, StatusLine, GoalMeter, StatTile, StatusCell,
  WeekStrip, DateSelector, Sparkline, EmptyNote, NumberDialog, TextDialog, CardioCard, CardioDialog, CoachCard,
} from './kit.js';

/** The numbers behind Today, built the way TodayViewModel.build does. */
export function todayState(day, today) {
  const settings = repo.settings();
  const ws = weekStart(day);
  const planItems = repo.plan();
  const plannedSets = repo.plannedSetsByTemplate(planItems);
  const order = repo.rotation(ws, ws + 6, today);
  const logs = repo.dailyLogMap();
  const walking = isWalking(settings);
  const isRest = (d) => !walking && (isSunday(d) || logs.get(d)?.restDay === true);
  const statusFor = (d) => (walking
    ? stepsStatus(settings, d, today, logs.get(d)?.steps ?? null)
    : repo.dayStatus(d, order, plannedSets, today));
  const kSteps = (n) => `${Fmt.num(n / 1000, 1)}K`;

  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const d = ws + i;
    const steps = logs.get(d)?.steps;
    return {
      epochDay: d,
      dayLabel: dayName(d, true).toUpperCase(),
      workoutLabel: walking
        ? (steps != null ? kSteps(steps) : '—')
        : order.get(d)?.workout?.name?.toUpperCase() ?? (isSunday(d) ? 'REST' : 'OFF'),
      status: statusFor(d),
      selected: d === day,
      isToday: d === today,
    };
  });

  const log = repo.dailyLog(day);
  const restDay = repo.session(day) == null && isRest(day);
  const template = walking ? null : order.get(day)?.workout ?? null;
  let workout = null;
  if (!restDay && template) {
    const items = planItems.filter((p) => p.templateId === template.id);
    workout = {
      templateId: template.id, name: template.name, hasAbs: template.hasAbs, exerciseCount: items.length,
      plannedSets: items.reduce((a, p) => a + p.sets, 0), doneSets: repo.setCount(day), status: statusFor(day),
    };
  }
  const upNext = order.get(day)?.next?.name ?? null;
  const totals = repo.dayTotals(day);
  const weights = repo.weights();
  const weightToday = repo.weightOn(day)?.weightKg ?? null;
  const average7 = Analytics.trailingAverage(weights, day);
  const previous7 = Analytics.trailingAverage(weights, day - 7);
  const photos = repo.photos();
  const lastPhoto = photos.length ? Math.max(...photos.map((p) => p.epochDay)) : null;
  const cardio = repo.cardio(ws, ws + 6);
  let lastWeight = null;
  for (const w of weights) if (w.epochDay <= day) lastWeight = w.weightKg;

  const stepsGoal = stepsGoalFor(settings, day);
  return {
    day, today, isToday: day === today, settings, walking, stepsGoal,
    strengthThisWeek: walking ? repo.workoutDays(ws, ws + 6) : 0,
    strengthToday: walking && repo.workoutDone(day),
    protein: repo.proteinFor(day),
    stepDaysThisWeek: walking ? week.filter((d) => d.status === DayStatus.DONE).length : 0,
    programWeek: Math.floor(Math.max(0, day - settings.programStartEpochDay) / 7) + 1,
    restDay,
    restReason: !restDay ? null : isSunday(day)
      ? `Sunday is your fixed recovery day. It never counts as a missed workout.${upNext ? ` Next workout: ${upNext}.` : ''}`
      : `A day off doesn't count as missed. The workout order pauses, so nothing is skipped${upNext ? `: ${upNext} is next.` : '.'}`,
    workout, week,
    weekDone: week.filter((d) => d.status === DayStatus.DONE).length,
    weekPlanned: [0, 1, 2, 3, 4, 5].filter((i) => logs.get(ws + i)?.restDay !== true).length,
    totals, log, weightToday, lastWeight, average7,
    averageChange: average7 != null && previous7 != null ? average7 - previous7 : null,
    recentAverages: Analytics.trend(weights.filter((w) => w.epochDay <= day)).slice(-14).map((t) => t.averageKg),
    cardioToday: cardio.filter((c) => c.epochDay === day),
    cardioThisWeek: cardio.length,
    checklist: buildChecklist(
      settings,
      workout && { name: workout.name, doneSets: workout.doneSets, plannedSets: workout.plannedSets, done: workout.status === DayStatus.DONE },
      log, totals, weightToday, stepsGoal,
    ),
    photoDueInDays: lastPhoto == null ? null : lastPhoto + settings.photoIntervalDays - today,
    order, plannedSets,
  };
}

/** The Sunday check-in for [today] (ReminderNotifier.checkIn). */
function checkInFor(s, today, order, plannedSets) {
  if (today < s.programStartEpochDay) return null;
  const ws = weekStart(today);
  const from = Math.max(ws, s.programStartEpochDay);
  const to = Math.min(ws + 5, today);
  const days = [];
  for (let d = from; d <= to; d++) days.push(d);
  const statuses = days.map((d) => repo.dayStatus(d, order, plannedSets, today));
  const totals = new Map(repo.dailyTotals(ws, ws + 6).map((t) => [t.epochDay, t]));
  const photos = repo.photos();
  const lastPhoto = photos.length ? Math.max(...photos.map((p) => p.epochDay)) : null;
  const walking = isWalking(s);
  const allDays = [];
  for (let d = from; d <= today; d++) allDays.push(d);
  const week = {
    workoutsDone: walking ? repo.workoutDays(ws, today) : statuses.filter((x) => x === DayStatus.DONE).length,
    workoutsPlanned: walking ? s.strengthSessionsPerWeek : statuses.filter((x) => x !== DayStatus.REST && x !== DayStatus.BEFORE_START).length,
    stepDays: allDays.filter((d) => (repo.dailyLog(d).steps ?? 0) >= stepsGoalFor(s, d)).length,
    proteinDays: days.filter((d) => (totals.get(d)?.protein ?? 0) >= s.proteinGrams).length,
    foodDays: days.filter((d) => totals.has(d)).length,
    days: walking ? allDays.length : days.length,
    waistLogged: repo.measurements().some((m) => m.epochDay >= ws && m.epochDay <= today && m.waistCm != null),
    photosDue: lastPhoto == null || lastPhoto + s.photoIntervalDays <= today,
  };
  return weeklyCheckIn(s, repo.weights(), today, week, repo.planStartedOn());
}

export function TodayScreen() {
  const s = todayState(app.day, app.today);
  const [dialog, setDialog] = useState(null);
  const day = s.day;
  const settings = s.settings;

  const addWater = (ml) => {
    repo.addWater(day, ml);
    snack(`Added ${ml} ml of water`, 'Undo', () => repo.addWater(day, -ml));
  };
  const onItem = (key) => {
    switch (key) {
      case 'WORKOUT': openTab('workout'); break;
      case 'WEIGH_IN': setDialog('weight'); break;
      case 'PROTEIN': case 'CALORIES': openTab('food'); break;
      case 'WATER': addWater(250); break;
      case 'STEPS': setDialog('steps'); break;
      case 'SLEEP': setDialog('sleep'); break;
      case 'CREATINE': repo.updateDaily(day, (l) => ({ ...l, creatine: !l.creatine })); break;
      case 'NO_JUNK': repo.updateDaily(day, (l) => ({ ...l, noJunk: !l.noJunk })); break;
      default: break;
    }
  };
  const checkIn = s.isToday && isSunday(day) ? checkInFor(settings, s.today, s.order, s.plannedSets) : null;
  const due = s.photoDueInDays;

  return html`
    <${TopBar} title="Fitness Tracker" actions=${html`
      <button class="icon-btn ink" aria-label="Settings" onClick=${() => push({ name: 'settings' })}><${Icon} name="settings" /></button>`} />
    <main class="content">
      <div>
        <${DateSelector} day=${day} onChange=${selectDay} />
        <p class="subtitle">${s.walking
          ? (settings.phase === 1 ? `Fat loss · Week ${s.programWeek}` : 'Maintenance')
          : (settings.phase === 1 ? `Phase 1 · Cut · Week ${s.programWeek}` : 'Phase 2 · Lean muscle building')}</p>
      </div>

      ${s.walking
        ? html`<${WalkCard} s=${s} onSteps=${() => setDialog('steps')} />`
        : s.workout == null
          ? html`<${RestCard} s=${s} />`
          : html`<${WorkoutCard} w=${s.workout} isToday=${s.isToday} onRest=${() => repo.updateDaily(day, (l) => ({ ...l, restDay: true }))} />`}

      <${Card}>
        <${CardHeader} title="This week" subtitle=${s.walking
          ? `${s.stepDaysThisWeek} ${s.stepDaysThisWeek === 1 ? 'day' : 'days'} at your step goal · tap a day to see it`
          : `${s.weekDone} of ${s.weekPlanned} workouts done · Sunday is rest`} />
        <div class="mt10"><${WeekStrip} days=${s.week} onSelect=${selectDay} /></div>
      <//>

      ${checkIn && html`<${Card}>
        <${CardHeader} title=${checkIn.title} icon="calendar" subtitle=${checkIn.summary} />
        <ul class="coach-list mt8">${checkIn.lines.map((l) => html`<li>${l}</li>`)}</ul>
      <//>`}

      <${ChecklistCard} s=${s} onItem=${onItem} />

      <${CoachCard} day=${day} isToday=${s.isToday} />

      <${NutritionCard} s=${s} />

      ${s.walking
        ? html`<${WaterCard} s=${s} onAdd=${addWater} />`
        : html`<div class="split">
            <${WaterCard} s=${s} onAdd=${addWater} />
            <${StepsCard} s=${s} onEdit=${() => setDialog('steps')} />
          </div>`}

      <${WeighInCard} s=${s} onLog=${() => setDialog('weight')} />

      <${CardioCard} settings=${settings} entriesToday=${s.cardioToday} sessionsThisWeek=${s.cardioThisWeek}
        onAdd=${() => setDialog('cardio')} onDelete=${(e) => repo.deleteCardio(e.id)} />

      <${RecoveryCard} s=${s} onSleep=${() => setDialog('sleep')} onNote=${() => setDialog('note')} />

      ${s.isToday && (due == null || due <= 0) && html`<${Card} onClick=${() => openTab('photos')}>
        <${CardHeader} icon="camera" title=${due == null ? 'Take your first progress photos' : 'Progress photos are due'}
          subtitle="Front relaxed, front flexed, side and back, every 3–4 weeks"
          trailing=${html`<span class="ink2"><${Icon} name="right" /></span>`} />
      <//>`}
    </main>

    ${dialog === 'weight' && html`<${NumberDialog} title="Morning weight" label="Weight" suffix="kg"
      initial=${(s.weightToday ?? s.lastWeight) != null ? Fmt.num(s.weightToday ?? s.lastWeight, 2) : ''}
      message="After waking, after the bathroom, before food or drink."
      validate=${(v) => (v >= 30 && v <= 250 ? null : 'Enter a weight between 30 and 250 kg')}
      onDismiss=${() => setDialog(null)}
      onConfirm=${(v) => { repo.logWeight(day, v); setDialog(null); }}
      extra=${s.weightToday != null && html`<button class="btn danger" onClick=${() => { repo.deleteWeight(day); setDialog(null); }}>Delete</button>`} />`}
    ${dialog === 'steps' && html`<${NumberDialog} title="Steps" label="Steps today" decimal=${false}
      initial=${s.log.steps != null ? String(s.log.steps) : ''}
      message=${`${s.stepsGoal < settings.dailyStepsMin ? `This week's goal: ${Fmt.int(s.stepsGoal)} a day, building to ${Fmt.int(settings.dailyStepsMin)}–${Fmt.int(settings.dailyStepsTarget)}.` : `Target ${Fmt.int(settings.dailyStepsMin)}–${Fmt.int(settings.dailyStepsTarget)} a day.`} Copy the number from the Health app or your watch.`}
      validate=${(v) => (v <= 100000 ? null : 'That looks too high')}
      onDismiss=${() => setDialog(null)}
      onConfirm=${(v) => { repo.updateDaily(day, (l) => ({ ...l, steps: Math.round(v) })); setDialog(null); }} />`}
    ${dialog === 'sleep' && html`<${NumberDialog} title="Sleep last night" label="Hours" suffix="h"
      initial=${s.log.sleepHours != null ? Fmt.num(s.log.sleepHours) : ''}
      validate=${(v) => (v >= 0 && v <= 16 ? null : 'Enter 0–16 hours')}
      onDismiss=${() => setDialog(null)}
      onConfirm=${(v) => { repo.updateDaily(day, (l) => ({ ...l, sleepHours: v })); setDialog(null); }} />`}
    ${dialog === 'note' && html`<${TextDialog} title="Recovery notes" label="Soreness, energy, stress, anything"
      initial=${s.log.note ?? ''} onDismiss=${() => setDialog(null)}
      onSave=${(t) => { repo.updateDaily(day, (l) => ({ ...l, note: t.trim() || null })); setDialog(null); }} />`}
    ${dialog === 'cardio' && html`<${CardioDialog} onDismiss=${() => setDialog(null)}
      onSave=${(type, minutes) => { repo.addCardio(day, type, minutes); setDialog(null); }} />`}
  `;
}

function WorkoutCard({ w, isToday, onRest }) {
  const done = w.status === DayStatus.DONE;
  const tone = done ? 'GOOD' : 'PROGRESS';
  return html`<${Card} onClick=${() => openTab('workout')}>
    <div class="row">
      <div class="grow">
        <${SectionLabel}>${isToday ? "Today's workout" : 'Workout'}<//>
        <div class="row mt4"><span class="big">${w.name.toUpperCase()}</span>${w.hasAbs && html`<${Tag} em>+ ABS<//>`}</div>
        <div class="small">${w.exerciseCount} exercises · ${w.plannedSets} sets</div>
      </div>
      <${StatusCell} status=${w.status} lg />
    </div>
    <div class="mt12"><${MeterBar} fraction=${w.plannedSets ? w.doneSets / w.plannedSets : 0} tone=${tone} /></div>
    <${StatusLine} tone=${tone} text=${done ? `Workout complete · ${w.doneSets} sets` : `${w.doneSets} of ${w.plannedSets} sets done`} />
    <div class="row mt12">
      <button class="btn" onClick=${() => openTab('workout')}>${done ? 'View workout' : w.doneSets > 0 ? 'Continue workout' : 'Start workout'}</button>
      ${w.doneSets === 0 && html`<button class="btn text" onClick=${onRest}>Take a day off</button>`}
    </div>
  <//>`;
}

/** The walking plan's main card: the day's steps against this week's goal, and strength sessions. */
function WalkCard({ s, onSteps }) {
  const set = s.settings;
  const steps = s.log.steps;
  const goal = s.stepsGoal;
  const hit = (steps ?? 0) >= goal;
  const building = goal < set.dailyStepsMin;
  return html`<${Card} onClick=${onSteps}>
    <div class="row">
      <div class="grow">
        <${SectionLabel}>${s.isToday ? "Today's walk" : 'Walk'}<//>
        <div class="row bottom mt4"><span class="big">${steps == null ? '—' : Fmt.int(steps)}</span><span class="ink2" style="padding-bottom:3px">/ ${Fmt.int(goal)} steps</span></div>
        <div class="small">${building
          ? `Week ${s.programWeek} goal, building to ${Fmt.int(set.dailyStepsMin)}–${Fmt.int(set.dailyStepsTarget)}`
          : `Goal ${Fmt.int(set.dailyStepsMin)}–${Fmt.int(set.dailyStepsTarget)} a day`}</div>
      </div>
      <${StatusCell} status=${hit ? DayStatus.DONE : steps ? DayStatus.PARTIAL : DayStatus.TODAY} lg />
    </div>
    <div class="mt12"><${MeterBar} fraction=${goal ? (steps ?? 0) / goal : 0} tone=${hit ? 'GOOD' : 'PROGRESS'} /></div>
    <${StatusLine} tone=${hit ? 'GOOD' : ''} text=${hit ? 'Step goal hit' : steps ? `${Fmt.int(goal - steps)} steps to go` : 'Brisk walking: start with 20–30 minutes, then build up'} />
    <div class="row mt12"><button class="btn" onClick=${onSteps}>${steps == null ? 'Log steps' : 'Update steps'}</button></div>
    ${set.strengthSessionsPerWeek > 0 && html`<div class="divider mt12"></div>
      <div class="row mt8">
        <span class="ink2"><${Icon} name="dumbbell" size=${20} /></span>
        <div class="grow">
          <div>Strength: ${s.strengthThisWeek} of ${set.strengthSessionsPerWeek} this week</div>
          <div class="tiny">Two short sessions a week help keep muscle while you lose fat</div>
        </div>
        <button class="btn text tight" onClick=${() => openTab('workout')}>${s.strengthToday ? 'View' : 'Log'}</button>
      </div>`}
  <//>`;
}

function RestCard({ s }) {
  const dayOff = s.log.restDay && !isSunday(s.day);
  return html`<${Card}>
    <div class="row">
      <div class="grow">
        <${SectionLabel}>${s.isToday ? 'Today' : 'This day'}<//>
        <div class="big mt4">${dayOff ? 'DAY OFF' : 'REST / BREAK'}</div>
      </div>
      <${StatusCell} status="REST" lg />
    </div>
    <p class="small mt6">${s.restReason}</p>
    <div class="mt12"><${SectionLabel}>Focus on<//></div>
    <div class="stack s6 mt6">
      ${['Recovery', 'Sleep', 'Hydration', 'Normal nutrition', 'Optional walking and light mobility'].map((t) =>
        html`<div class="row"><span class="muted"><${Icon} name="check" size=${16} /></span><span>${t}</span></div>`)}
    </div>
    <div class="mt8">
      ${dayOff
        ? html`<button class="btn text" onClick=${() => repo.updateDaily(s.day, (l) => ({ ...l, restDay: false }))}>Undo day off</button>`
        : html`<button class="btn text" onClick=${() => openTab('workout')}>Log a workout anyway</button>`}
    </div>
  <//>`;
}

function ChecklistCard({ s, onItem }) {
  const done = s.checklist.filter((i) => i.done).length;
  const all = s.checklist.length;
  return html`<${Card} class="flush">
    <div class="pad">
      <${CardHeader} title="Daily checklist" subtitle="Tap an item to log or mark it"
        trailing=${html`<span class="card-title">${done} / ${all}</span>`} />
      <div class="mt10"><${MeterBar} fraction=${done / all} tone=${done === all ? 'GOOD' : 'PROGRESS'} /></div>
    </div>
    <div class="mt6">
      ${s.checklist.map((item) => {
        const icon = item.manual ? (item.done ? 'checkSquare' : 'square') : item.done ? 'checkCircle' : 'circle';
        return html`<button class="list-row" onClick=${() => onItem(item.key)}>
          <span class=${`check ${item.done ? 'done' : ''}`}><${Icon} name=${icon} /></span>
          <span class="main"><div class="title">${item.label}</div><div class="detail">${item.detail}</div></span>
        </button>`;
      })}
    </div>
  <//>`;
}

function NutritionCard({ s }) {
  const set = s.settings;
  const t = s.totals;
  const left = set.dailyCalories - t.kcal;
  return html`<${Card} onClick=${() => openTab('food')}>
    <${CardHeader} title="Nutrition" subtitle=${s.protein ? `Today's protein: ${s.protein}` : null}
      trailing=${html`<button class="btn text" onClick=${() => openTab('food')}>Log food</button>`} />
    <div class="row bottom mt4"><span class="huge">${Fmt.int(Math.abs(left))}</span><span class="ink2" style="padding-bottom:5px">${left >= 0 ? 'kcal left' : 'kcal over'}</span></div>
    <div class="stack mt12">
      <${GoalMeter} label="Calories" value=${Fmt.int(t.kcal)} target=${`${Fmt.int(set.dailyCalories)} kcal`} spec=${Meters.budget(t.kcal, set.dailyCalories, 'kcal')} />
      <${GoalMeter} label="Protein" value=${Fmt.int(t.protein)} target=${`${set.proteinGrams} g`}
        spec=${Meters.minimum(t.protein, set.proteinGrams, `${Fmt.int(set.proteinGrams - t.protein)} g to go`)} />
      <${GoalMeter} label="Carbs" value=${Fmt.int(t.carbs)} target=${`${set.carbsGrams} g`} spec=${Meters.range(t.carbs, set.carbsGrams, 'g')} />
      <${GoalMeter} label="Fat" value=${Fmt.int(t.fat)} target=${`${set.fatGrams} g`} spec=${Meters.range(t.fat, set.fatGrams, 'g')} />
    </div>
  <//>`;
}

function WaterCard({ s, onAdd }) {
  const liters = s.log.waterMl / 1000;
  const spec = Meters.minimum(liters, s.settings.waterLitersMin, `${Fmt.num(s.settings.waterLitersMin - liters, 2)} L to go`);
  return html`<${Card} class="tight">
    <div class="row"><span class="ink2"><${Icon} name="water" size=${18} /></span><b>Water</b></div>
    <div class="row bottom mt6"><span class="big">${Fmt.num(liters, 2)}</span><span class="tiny" style="padding-bottom:4px">/ ${Fmt.num(s.settings.waterLitersMin)} L</span></div>
    <div class="mt6"><${MeterBar} fraction=${spec.fraction} tone=${spec.tone} /></div>
    <div class="row mt10">
      <button class="btn tonal small grow tight" onClick=${() => onAdd(250)}>+250</button>
      <button class="btn tonal small grow tight" onClick=${() => onAdd(500)}>+500</button>
    </div>
  <//>`;
}

function StepsCard({ s, onEdit }) {
  const steps = s.log.steps ?? 0;
  return html`<${Card} class="tight" onClick=${onEdit}>
    <div class="row"><span class="ink2"><${Icon} name="steps" size=${18} /></span><b>Steps</b></div>
    <div class="row bottom mt6"><span class="big">${s.log.steps == null ? '—' : Fmt.int(steps)}</span><span class="tiny" style="padding-bottom:4px">/ ${Fmt.int(s.settings.dailyStepsTarget / 1000)}k</span></div>
    <div class="mt6"><${MeterBar} fraction=${s.settings.dailyStepsTarget ? steps / s.settings.dailyStepsTarget : 0} tone=${steps >= s.stepsGoal ? 'GOOD' : 'PROGRESS'} /></div>
    <div class="mt10"><button class="btn outline small block" onClick=${onEdit}>${s.log.steps == null ? 'Log steps' : 'Edit'}</button></div>
  <//>`;
}

function WeighInCard({ s, onLog }) {
  const change = s.averageChange;
  const goodDirection = change != null && (s.settings.phase === 1 ? change < 0 : change > 0);
  return html`<${Card} onClick=${onLog}>
    <${CardHeader} title="Morning weigh-in" icon="scale"
      trailing=${html`<button class="btn text" onClick=${onLog}>${s.weightToday == null ? 'Log' : 'Edit'}</button>`} />
    <div class="mt8">
      ${s.weightToday == null && s.average7 == null
        ? html`<${EmptyNote}>Weigh in every morning after waking and the bathroom, before food or drink. The 7-day average is what counts.<//>`
        : html`<div class="row bottom">
            <${StatTile} label=${s.isToday ? 'Today' : 'This day'} value=${s.weightToday != null ? Fmt.num(s.weightToday, 1) : '—'} unit="kg" />
            <${StatTile} label="7-day average" value=${s.average7 != null ? Fmt.num(s.average7, 1) : '—'} unit="kg"
              delta=${change != null ? `${Fmt.signedKg(change)} vs prior 7 days` : null} deltaGood=${goodDirection} />
            ${s.recentAverages.length >= 2 && html`<${Sparkline} values=${s.recentAverages} />`}
          </div>`}
    </div>
  <//>`;
}

function RecoveryCard({ s, onSleep, onNote }) {
  const hours = s.log.sleepHours;
  const setSleep = (v) => repo.updateDaily(s.day, (l) => ({ ...l, sleepHours: v }));
  return html`<${Card}>
    <${CardHeader} title="Sleep & recovery" icon="moon" />
    <div class="row mt10">
      <div class="grow">
        <div>Sleep last night</div>
        <div class="tiny">Target ${Fmt.num(s.settings.sleepHoursMin)}–8 h</div>
      </div>
      ${hours == null
        ? html`<button class="btn outline small" onClick=${onSleep}>Log sleep</button>`
        : html`<div class="row">
            <button class="icon-btn ink" aria-label="Half an hour less" onClick=${() => setSleep(Math.max(0, hours - 0.5))}><${Icon} name="minus" size=${20} /></button>
            <button class="btn text tight" onClick=${onSleep} style=${`color:${hours >= s.settings.sleepHoursMin ? 'var(--success-text)' : 'var(--ink)'}`}>${Fmt.num(hours)} h</button>
            <button class="icon-btn ink" aria-label="Half an hour more" onClick=${() => setSleep(Math.min(16, hours + 0.5))}><${Icon} name="plus" size=${20} /></button>
          </div>`}
    </div>
    <div class="divider mt10"></div>
    <button class="list-row" style="padding-left:0;padding-right:0" onClick=${onNote}>
      <span class="main">
        <div class="title">Recovery notes</div>
        <div class="detail">${s.log.note ?? 'Soreness, energy, stress: tap to add'}</div>
      </span>
      <span class="ink2"><${Icon} name="edit" size=${18} /></span>
    </button>
  <//>`;
}
