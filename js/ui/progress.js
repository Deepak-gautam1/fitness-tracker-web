// Progress: the cut, weekly rate rules, weight trend, waist and body fat, consistency, habits,
// strength, the Phase 1 criteria and maintenance (ProgressScreen.kt / ProgressViewModel.kt).

import { useState } from '../../vendor/preact-htm.js';
import * as repo from '../repo.js';
import { Analytics, DayStatus, Fmt, Measure, RateStatus, isSunday, isoDate, parseIsoDate, weekStart } from '../domain.js';
import { app, push } from './state.js';
import {
  html, Icon, TopBar, Card, CardHeader, MeterBar, StatTile, StatusCell, StatusLegend, Segmented, Dialog, NumberDialog,
  Field, NumberInput, SectionLabel,
} from './kit.js';
import { LineChart } from './charts.js';

/** The plan's main lifts, shown under Strength once each has four sessions. */
const KEY_LIFTS = [
  'bench_press', 'incline_bench_press', 'db_shoulder_press', 'barbell_row', 't_bar_row',
  'pullup_lat_pulldown', 'chin_up', 'chest_supported_row', 'squat_hack_squat', 'romanian_deadlift', 'deadlift',
];

function progressState(today) {
  const s = repo.settings();
  const ws = weekStart(today);
  const from = Math.min(ws - 49, today - 27);
  const to = ws + 6;
  const weights = repo.weights();
  const measurements = repo.measurements();
  const planItems = repo.plan();
  const plannedSets = repo.plannedSetsByTemplate(planItems);
  const order = repo.rotation(from, to, today);
  const logs = repo.dailyLogMap();
  const isRest = (d) => isSunday(d) || logs.get(d)?.restDay === true;
  const statusFor = (d) => repo.dayStatus(d, order, plannedSets, today);

  // Consistency: the last 8 Mon–Sun weeks since the program started, oldest first.
  const programWeek = weekStart(s.programStartEpochDay);
  const consistency = [7, 6, 5, 4, 3, 2, 1, 0].map((b) => ws - b * 7).filter((w) => w >= programWeek)
    .map((w) => ({ weekStart: w, days: [0, 1, 2, 3, 4, 5, 6].map((i) => statusFor(w + i)) }));
  const counted = consistency.flatMap((r) => r.days.map((st, i) => [r.weekStart + i, st]))
    .filter(([d, st]) => d < today && st !== DayStatus.REST && st !== DayStatus.BEFORE_START && st !== DayStatus.FUTURE);
  const todayDone = statusFor(today) === DayStatus.DONE ? 1 : 0;
  const workoutsDone = counted.filter(([, st]) => st === DayStatus.DONE).length + todayDone;
  const workoutsPlanned = counted.length + todayDone;

  // Adherence over the last 28 completed days (or since the program started).
  const adhFrom = Math.max(today - 28, s.programStartEpochDay);
  const days = [];
  for (let d = adhFrom; d < today; d++) days.push(d);
  const totals = repo.dailyTotals(from, to);
  const totalsByDay = new Map(totals.map((t) => [t.epochDay, t]));
  const weighInDays = new Set(weights.map((w) => w.epochDay));
  const trainingDays = days.filter((d) => !isRest(d));
  const count = (pred) => days.filter(pred).length;
  const adherence = days.length === 0 ? [] : [
    ['Workouts (Mon–Sat)', trainingDays.filter((d) => statusFor(d) === DayStatus.DONE).length, trainingDays.length],
    ['Morning weigh-in', count((d) => weighInDays.has(d)), days.length],
    [`Protein ≥ ${s.proteinGrams} g`, count((d) => (totalsByDay.get(d)?.protein ?? 0) >= s.proteinGrams), days.length],
    ['Calories on target', count((d) => { const k = totalsByDay.get(d)?.kcal ?? 0; return k >= s.dailyCalories * 0.9 && k <= s.dailyCalories * 1.05; }), days.length],
    [`Water ≥ ${Fmt.num(s.waterLitersMin)} L`, count((d) => (logs.get(d)?.waterMl ?? 0) >= s.waterLitersMin * 1000), days.length],
    [`Steps ≥ ${Fmt.int(s.dailyStepsMin)}`, count((d) => (logs.get(d)?.steps ?? 0) >= s.dailyStepsMin), days.length],
    [`Sleep ≥ ${Fmt.num(s.sleepHoursMin)} h`, count((d) => (logs.get(d)?.sleepHours ?? 0) >= s.sleepHoursMin), days.length],
  ];

  const waists = measurements.filter((m) => m.waistCm != null);
  const latestWaist = waists[waists.length - 1] ?? null;
  const firstWaist = waists[0] ?? null;
  const manualBf = [...measurements].reverse().find((m) => m.bodyFatPercent != null) ?? null;
  const navyBase = [...measurements].reverse().find((m) => m.waistCm != null && m.neckCm != null) ?? null;
  const navy = navyBase ? Analytics.navyBodyFatMale(s.heightCm, navyBase.waistCm, navyBase.neckCm) : null;
  let bodyFat = null;
  let bodyFatSource = null;
  if (manualBf && (!navyBase || manualBf.epochDay >= navyBase.epochDay)) {
    bodyFat = manualBf.bodyFatPercent;
    bodyFatSource = `Logged ${Fmt.shortDate(manualBf.epochDay)}`;
  } else if (navy != null) {
    bodyFat = navy;
    bodyFatSource = `U.S. Navy estimate, ${Fmt.shortDate(navyBase.epochDay)}`;
  }

  const measureOf = (id) => repo.exercise(id)?.measure ?? Measure.REPS;
  const lifts = Analytics.liftChanges(repo.setsFor(KEY_LIFTS), measureOf)
    .map((l) => ({ ...l, name: repo.exercise(l.exerciseId)?.name ?? l.exerciseId, measure: measureOf(l.exerciseId) }))
    .sort((a, b) => KEY_LIFTS.indexOf(a.exerciseId) - KEY_LIFTS.indexOf(b.exerciseId));

  const currentAverage = Analytics.currentAverage(weights);
  const sortedPct = lifts.map((l) => l.percent).sort((a, b) => a - b);
  const medianLift = sortedPct.length ? sortedPct[Math.floor(sortedPct.length / 2)] : null;
  const waistChange = latestWaist && firstWaist && latestWaist.epochDay !== firstWaist.epochDay ? latestWaist.waistCm - firstWaist.waistCm : null;
  const criteria = [
    { key: 'WEIGHT', label: `Weight ${Fmt.num(s.targetWeightMinKg)}–${Fmt.num(s.targetWeightMaxKg)} kg`,
      detail: currentAverage != null ? `7-day average ${Fmt.kg(currentAverage)}` : 'No weigh-ins yet', met: currentAverage != null ? currentAverage <= s.targetWeightMaxKg : null },
    { key: 'BODY_FAT', label: `Body fat about ${Fmt.num(s.targetBodyFatPercent)}–${Fmt.num(s.targetBodyFatPercent + 1)}%`,
      detail: bodyFat != null ? `Latest ${Fmt.num(bodyFat)}%` : 'Log body fat, or waist + neck for an estimate', met: bodyFat != null ? bodyFat <= s.targetBodyFatPercent + 1 : null },
    { key: 'WAIST', label: 'Waist significantly reduced',
      detail: waistChange != null ? `${Fmt.signed(waistChange)} cm since ${Fmt.shortDate(firstWaist.epochDay)}` : 'Log your waist weekly', met: waistChange != null ? waistChange <= -3 : null },
    { key: 'STRENGTH', label: 'Strength mostly maintained',
      detail: medianLift != null ? `Key lifts ${Fmt.signed(medianLift, 0)}% (median)` : 'Needs 4+ sessions of a key lift', met: medianLift != null ? medianLift >= -5 : null },
    { key: 'DEFINITION', label: 'Chest, shoulder and arm definition improved', detail: 'Compare your progress photos', met: s.definitionImproved, manual: true },
    { key: 'ABS', label: 'Abs visibly more defined', detail: 'Compare your progress photos', met: s.absMoreDefined, manual: true },
  ];
  const phaseStart = s.phase === 2 ? s.phase2StartEpochDay ?? s.programStartEpochDay : s.programStartEpochDay;
  return {
    s, today, weights, trend: Analytics.trend(weights), cut: Analytics.cutProgress(s, weights, today),
    rate: Analytics.assessRate(s, weights, today), measurements, latestWaist, firstWaist, bodyFat, bodyFatSource,
    consistency, workoutsDone, workoutsPlanned, adherence, adherenceDays: days.length, lifts,
    maintenance: Analytics.estimateMaintenance(totals, weights, today), criteria,
    weeksInPhase: Math.floor(Math.max(0, today - phaseStart) / 7) + 1,
  };
}

export function ProgressScreen() {
  const p = progressState(app.today);
  const [dialog, setDialog] = useState(null);
  const s = p.s;
  const suggested = Math.round((p.maintenance != null ? p.maintenance + 150 : s.dailyCalories + 350) / 50) * 50;
  return html`
    <${TopBar} title="Progress" />
    <main class="content">
      ${s.phase === 1 ? html`<${CutCard} p=${p} onPhase2=${() => setDialog({ type: 'phase2' })} />` : html`<${BuildCard} p=${p} />`}

      ${p.rate.status !== RateStatus.TARGET_REACHED && html`<${Card}>
        <${CardHeader} title="Weekly rate" icon="trend" />
        <p class="card-title mt8" style="font-size:16px">${p.rate.headline}</p>
        <p class="small mt4">${p.rate.advice}</p>
      <//>`}

      <${WeightCard} p=${p} onEdit=${(w) => setDialog({ type: 'weight', entry: w })} onAdd=${() => setDialog({ type: 'weight', entry: null })} />
      <${WaistCard} p=${p} onEdit=${(m) => setDialog({ type: 'measure', entry: m })} onAdd=${() => setDialog({ type: 'measure', entry: null })} />
      <${ConsistencyCard} p=${p} />
      <${HabitsCard} p=${p} />
      <${StrengthCard} p=${p} />
      ${s.phase === 1 ? html`<${CriteriaCard} p=${p} onPhase2=${() => setDialog({ type: 'phase2' })} />` : html`<${PrioritiesCard} />`}
      <${MaintenanceCard} p=${p} />
      <${TimelineCard} p=${p} />
    </main>

    ${dialog?.type === 'weight' && html`<${WeighInDialog} entry=${dialog.entry} today=${p.today} onDismiss=${() => setDialog(null)} />`}
    ${dialog?.type === 'measure' && html`<${MeasurementDialog} entry=${dialog.entry} today=${p.today} heightCm=${s.heightCm} onDismiss=${() => setDialog(null)} />`}
    ${dialog?.type === 'phase2' && html`<${NumberDialog} title="Start Phase 2: lean muscle building" label="Daily calories" suffix="kcal" decimal=${false}
      initial=${String(suggested)}
      message=${`${p.maintenance != null ? `Your estimated maintenance is about ${Fmt.kcal(p.maintenance)}. ` : 'Start roughly 300–400 kcal above your cut. '}Move to maintenance or a small surplus, keep protein at ${s.proteinGrams} g, and aim for slow gain. Extra calories go mostly to carbs. You can change this any time in Settings.`}
      validate=${(v) => (v >= 1500 && v <= 4500 ? null : 'Enter 1,500–4,500 kcal')}
      onDismiss=${() => setDialog(null)}
      onConfirm=${(calories) => {
        // README section 11: move to maintenance / small surplus; extra calories go mostly to carbs.
        const delta = calories - s.dailyCalories;
        repo.saveSettings({
          ...s, phase: 2, phase2StartEpochDay: p.today, dailyCalories: Math.round(calories),
          carbsGrams: Math.max(50, Math.round(s.carbsGrams + (delta * 0.75) / 4)),
          fatGrams: Math.max(30, Math.round(s.fatGrams + (delta * 0.25) / 9)),
        });
        setDialog(null);
      }} />`}
  `;
}

function CutCard({ p, onPhase2 }) {
  const { s, cut } = p;
  const reached = p.rate.status === RateStatus.TARGET_REACHED;
  const pace = `${Fmt.num(s.targetWeightLossMinKgPerWeek)}–${Fmt.num(s.targetWeightLossMaxKgPerWeek)} kg/week`;
  return html`<${Card}>
    <${SectionLabel}>Phase 1 · Cut · Week ${cut.weekNumber}<//>
    ${reached ? html`
      <div class="big mt6">Target reached</div>
      <p class="small mt4">7-day average ${cut.currentAverageKg != null ? Fmt.kg(cut.currentAverageKg) : '—'}. Don't keep cutting automatically.</p>
      <div class="mt12"><button class="btn" onClick=${onPhase2}>Start Phase 2</button></div>`
    : html`
      <div class="row bottom mt6"><span class="huge">${cut.remainingKg != null ? Fmt.num(cut.remainingKg) : '—'}</span><span class="ink2" style="padding-bottom:5px">kg to go</span></div>
      <p class="small">${cut.currentAverageKg != null ? `7-day average ${Fmt.kg(cut.currentAverageKg)} · ` : ''}target ${Fmt.num(s.targetWeightMinKg)}–${Fmt.num(s.targetWeightMaxKg)} kg</p>
      <div class="mt10"><${MeterBar} fraction=${cut.fraction} /></div>
      <div class="row tiny mt4"><span class="grow">Start ${Fmt.num(s.startWeightKg)} kg</span><span>${Math.floor(cut.fraction * 100)}% of the way</span><span class="grow" style="text-align:right">Goal ${Fmt.num(s.targetWeightMaxKg)} kg</span></div>
      <p class="small mt10">${cut.weekNumber <= 4
        ? `Plan pace: ${pace}, so about ${Fmt.num(Math.max(s.targetWeightMinKg, s.startWeightKg - s.targetWeightLossMaxKgPerWeek * 4))}–${Fmt.num(Math.max(s.targetWeightMinKg, s.startWeightKg - s.targetWeightLossMinKgPerWeek * 4))} kg by week 4.`
        : `Expected by now: ${Fmt.num(cut.expectedMinKg)}–${Fmt.num(cut.expectedMaxKg)} kg (${pace} since ${Fmt.date(s.programStartEpochDay)})`}</p>
      ${cut.etaWeeks != null && html`<p class="small mt4">At your current pace: about ${cut.etaWeeks} more week${cut.etaWeeks === 1 ? '' : 's'}.</p>`}`}
  <//>`;
}

function BuildCard({ p }) {
  const { s } = p;
  const avg = Analytics.currentAverage(p.weights);
  return html`<${Card}>
    <${SectionLabel}>Phase 2 · Lean muscle building · Week ${p.weeksInPhase}<//>
    <div class="row bottom mt6"><span class="huge">${avg != null ? Fmt.num(avg) : '—'}</span><span class="ink2" style="padding-bottom:5px">kg 7-day avg</span></div>
    <p class="small mt6">Aim for slow gain of ${Fmt.num(s.phase2GainMinKgPerWeek, 2)}–${Fmt.num(s.phase2GainMaxKgPerWeek, 2)} kg/week at ${Fmt.kcal(s.dailyCalories)}, keeping visible definition.</p>
  <//>`;
}

function WeightCard({ p, onEdit, onAdd }) {
  const [range, setRange] = useState('84');
  const [showAll, setShowAll] = useState(false);
  const days = range === 'all' ? null : Number(range);
  const from = days ? p.today - days + 1 : null;
  const pts = p.trend.filter((t) => from == null || t.epochDay >= from);
  const list = [...p.trend].reverse();
  const shown = showAll ? list : list.slice(0, 7);
  return html`<${Card}>
    <${CardHeader} title="Weight trend" subtitle="Judge progress on the 7-day average"
      trailing=${html`<button class="btn text" onClick=${onAdd}>Log</button>`} />
    <div class="mt10"><${Segmented} options=${[['28', '4W'], ['84', '12W'], ['all', 'All']]} value=${range} onChange=${setRange} /></div>
    ${pts.length === 0
      ? html`<p class="small mt10">No weigh-ins in this range yet. Log your morning weight on the Today tab or here.</p>`
      : html`<div class="mt10">
          <${LineChart} label=${`Weight trend. Latest 7-day average ${Fmt.kg(pts[pts.length - 1].averageKg)}.`}
            xMin=${from ?? undefined} xMax=${from ? p.today : undefined}
            band=${p.s.phase === 1 ? { min: p.s.targetWeightMinKg, max: p.s.targetWeightMaxKg } : null}
            series=${[
              { points: pts.map((t) => ({ x: t.epochDay, y: t.weightKg })), dots: true, line: false },
              { points: pts.map((t) => ({ x: t.epochDay, y: t.averageKg })), cls: 'avg' },
            ]} />
          <div class="chart-legend mt6"><span><i></i>7-day average</span><span><i class="dot"></i>Daily weigh-in</span>${p.s.phase === 1 && html`<span><i class="band"></i>Target range</span>`}</div>
        </div>`}
    ${list.length > 0 && html`<table class="table mt12">
      <thead><tr><th>Date</th><th class="num">Weight</th><th class="num">7-day avg</th></tr></thead>
      <tbody>${shown.map((t) => html`<tr class="tap" onClick=${() => onEdit(repo.weightOn(t.epochDay))}>
        <td>${Fmt.date(t.epochDay)}</td><td class="num">${Fmt.num(t.weightKg, 2)}</td><td class="num">${Fmt.num(t.averageKg, 2)}</td></tr>`)}</tbody>
    </table>
    ${list.length > 7 && html`<button class="btn text mt4" onClick=${() => setShowAll(!showAll)}>${showAll ? 'Show less' : `Show all ${list.length}`}</button>`}`}
  <//>`;
}

function WaistCard({ p, onEdit, onAdd }) {
  const { latestWaist, firstWaist, s } = p;
  const waists = p.measurements.filter((m) => m.waistCm != null);
  const change = latestWaist && firstWaist && latestWaist.epochDay !== firstWaist.epochDay ? latestWaist.waistCm - firstWaist.waistCm : null;
  return html`<${Card}>
    <${CardHeader} title="Waist & body fat" subtitle="Measure weekly at the navel, relaxed, same time of day"
      trailing=${html`<button class="btn text" onClick=${onAdd}>Log</button>`} />
    <div class="row top mt10">
      <${StatTile} label="Waist" value=${latestWaist ? Fmt.num(latestWaist.waistCm) : '—'} unit="cm"
        delta=${change != null ? `${Fmt.signed(change)} cm since start` : null} deltaGood=${change != null && change < 0} />
      <${StatTile} label="Body fat" value=${p.bodyFat != null ? Fmt.num(p.bodyFat) : '—'} unit="%"
        delta=${p.bodyFatSource ?? `Estimated ${Fmt.num(s.estimatedBodyFatPercent)}% at start`} />
    </div>
    ${waists.length >= 2 && html`<div class="mt10"><${LineChart} label=${`Waist trend. Latest ${Fmt.num(waists[waists.length - 1].waistCm)} cm.`}
      series=${[{ points: waists.map((m) => ({ x: m.epochDay, y: m.waistCm })), cls: 'avg', dots: true }]} /></div>`}
    ${p.measurements.length > 0 && html`<div class="mt10">${[...p.measurements].reverse().slice(0, 8).map((m) => html`
      <button class="list-row" style="padding:8px 0" onClick=${() => onEdit(m)}>
        <span class="main"><div class="title">${Fmt.date(m.epochDay)}</div>
          <div class="detail">${[m.waistCm != null && `Waist ${Fmt.num(m.waistCm)} cm`, m.neckCm != null && `Neck ${Fmt.num(m.neckCm)} cm`, m.bodyFatPercent != null && `${Fmt.num(m.bodyFatPercent)}% BF`].filter(Boolean).join(' · ')}</div></span>
      </button>`)}</div>`}
  <//>`;
}

function ConsistencyCard({ p }) {
  const pct = p.workoutsPlanned ? Math.round((p.workoutsDone / p.workoutsPlanned) * 100) : 0;
  return html`<${Card}>
    <${CardHeader} title="Workout consistency" icon="dumbbell" subtitle="Last 8 weeks · Sundays are rest, never missed" />
    ${p.consistency.length === 0
      ? html`<p class="small mt10">Your first training days will appear here.</p>`
      : html`<div class="consistency mt12">
          <span></span>${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => html`<span class="hdr">${d}</span>`)}
          ${p.consistency.map((r) => html`<span class="lbl">${Fmt.shortDate(r.weekStart)}</span>${r.days.map((st) => html`<${StatusCell} status=${st} />`)}`)}
        </div>
        <div class="mt10"><${StatusLegend} /></div>
        ${p.workoutsPlanned > 0 && html`<p class="small mt8">${p.workoutsDone} of ${p.workoutsPlanned} planned workouts done (${pct}%).</p>`}`}
  <//>`;
}

function HabitsCard({ p }) {
  if (p.adherence.length === 0) return null;
  return html`<${Card}>
    <${CardHeader} title="Habits" icon="check" subtitle=${`Last ${p.adherenceDays} day${p.adherenceDays === 1 ? '' : 's'}, not counting today`} />
    <div class="stack mt12">${p.adherence.map(([label, hit, of]) => {
      const f = of ? hit / of : 0;
      return html`<div>
        <div class="row"><span class="grow">${label}</span><span class="small">${hit} / ${of}</span></div>
        <div class="mt4"><${MeterBar} fraction=${f} tone=${f >= 0.8 ? 'GOOD' : 'PROGRESS'} /></div>
      </div>`;
    })}</div>
  <//>`;
}

function StrengthCard({ p }) {
  return html`<${Card}>
    <${CardHeader} title="Strength" icon="trophy" subtitle="Best estimated 1-rep max: first 2 vs last 2 sessions" />
    ${p.lifts.length === 0
      ? html`<p class="small mt10">After four sessions of a key lift (bench, incline, shoulder press, pull-ups, rows, squats, RDL) you'll see whether strength is holding during the cut.</p>`
      : html`<div class="mt8">${p.lifts.map((l) => {
          const unit = l.measure === Measure.SECONDS ? 's' : 'kg';
          return html`<button class="list-row" style="padding:8px 0" onClick=${() => push({ name: 'history', exerciseId: l.exerciseId })}>
            <span class="main"><div class="title">${l.name}</div>
              <div class=${`detail ${l.percent >= 0 ? 'good-text' : l.percent < -5 ? 'bad-text' : ''}`}>${Fmt.num(l.startBest)} → ${Fmt.num(l.recentBest)} ${unit} (${Fmt.signed(l.percent, 0)}%)</div></span>
            <span class="ink2"><${Icon} name="right" size=${18} /></span>
          </button>`;
        })}</div>`}
  <//>`;
}

function CriteriaCard({ p, onPhase2 }) {
  const toggle = (key) => repo.updateSettings((s) => (key === 'DEFINITION' ? { ...s, definitionImproved: !s.definitionImproved } : { ...s, absMoreDefined: !s.absMoreDefined }));
  return html`<${Card} class="flush">
    <div class="pad"><${CardHeader} title="Phase 1 is complete when…" subtitle="README section 10" /></div>
    <div class="mt6">${p.criteria.map((c) => {
      const icon = c.manual ? (c.met ? 'checkSquare' : 'square') : c.met ? 'checkCircle' : 'circle';
      const row = html`<span class=${`check ${c.met ? 'done' : ''}`} style=${c.met === null ? 'opacity:.5' : ''}><${Icon} name=${icon} /></span>
        <span class="main"><div class="title">${c.label}</div><div class="detail">${c.detail}</div></span>`;
      return c.manual
        ? html`<button class="list-row" onClick=${() => toggle(c.key)}>${row}</button>`
        : html`<div class="list-row" style="cursor:default">${row}</div>`;
    })}</div>
    <div class="pad row mt8">
      <button class="btn outline small" onClick=${() => push({ name: 'compare' })}>Compare photos</button>
      ${p.criteria[0].met && html`<button class="btn small" onClick=${onPhase2}>Start Phase 2</button>`}
    </div>
  <//>`;
}

function PrioritiesCard() {
  return html`<${Card}>
    <${CardHeader} title="Phase 2 priorities" subtitle="Same PPL split · progressive overload · controlled fat gain" />
    <div class="stack s6 mt10">
      ${['1. Side and rear delts', '2. Upper chest', '3. Lats', '4. Arms', '5. Abs', '6. Legs'].map((t) => html`<p>${t}</p>`)}
      <p class="small mt4">Keep the waist in check: if it climbs while weight rises quickly, trim 100–150 kcal.</p>
    </div>
  <//>`;
}

function MaintenanceCard({ p }) {
  const m = p.maintenance;
  const s = p.s;
  return html`<${Card}>
    <${CardHeader} title="Estimated maintenance" subtitle="From your logged food and weight trend, last 4 weeks" />
    ${m == null
      ? html`<p class="small mt10">Log food on at least 10 days and weigh in on 8+ mornings across two weeks to see this.</p>`
      : html`<div class="row bottom mt8"><span class="huge">${Fmt.int(m)}</span><span class="ink2" style="padding-bottom:5px">kcal/day</span></div>
        <p class="small mt4">Your target is ${Fmt.kcal(s.dailyCalories)}: a ${Fmt.int(Math.abs(m - s.dailyCalories))} kcal ${m >= s.dailyCalories ? 'deficit' : 'surplus'}. An estimate, not an exact number.</p>`}
  <//>`;
}

function TimelineCard({ p }) {
  const weeks = Math.floor(Math.max(0, p.today - p.s.programStartEpochDay) / 7);
  return html`<${Card}>
    <${CardHeader} title="Transformation timeline" subtitle=${`Week ${weeks + 1} since you started`} />
    <div class="stack s6 mt10">
      ${[[10, '10–12 weeks: noticeably leaner'], [13, '3–4 months: strong visual improvement'], [26, '6 months: substantially more muscular'], [39, '9–12 months: major transformation possible with consistency']]
        .map(([w, t]) => html`<div class="row"><span class=${weeks >= w ? 'good-text' : 'muted'}><${Icon} name=${weeks >= w ? 'checkCircle' : 'circle'} size=${18} /></span><span>${t}</span></div>`)}
      <p class="small mt4">Lose fat slowly, preserve strength, reveal existing muscle, then build more.</p>
    </div>
  <//>`;
}

function DateField({ day, onChange, max }) {
  return html`<${Field} label="Date"><input class="input" type="date" value=${isoDate(day)} max=${isoDate(max)}
    onChange=${(e) => { const d = parseIsoDate(e.target.value); if (d != null) onChange(d); }} /><//>`;
}

function WeighInDialog({ entry, today, onDismiss }) {
  const [day, setDay] = useState(entry?.epochDay ?? today);
  const [text, setText] = useState(entry ? Fmt.num(entry.weightKg, 2) : '');
  const v = Fmt.parseDecimal(text);
  const error = text.trim() === '' ? null : v == null || v < 30 || v > 250 ? 'Enter a weight between 30 and 250 kg' : null;
  const ok = v != null && !error;
  const save = () => { if (ok) { repo.logWeight(day, v); onDismiss(); } };
  return html`<${Dialog} title="Weigh-in" onClose=${onDismiss} actions=${html`
    ${entry && html`<span class="left"><button class="btn danger" onClick=${() => { repo.deleteWeight(entry.epochDay); onDismiss(); }}>Delete</button></span>`}
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" disabled=${!ok} onClick=${save}>Save</button>`}>
    <p class="small">Morning, after the bathroom, before food or drink.</p>
    ${entry ? html`<p><b>${Fmt.longDate(entry.epochDay)}</b></p>` : html`<${DateField} day=${day} onChange=${setDay} max=${today} />`}
    <${Field} label="Weight" suffix="kg" error=${error}><${NumberInput} value=${text} onInput=${setText} autofocus invalid=${!!error} onEnter=${save} /><//>
  <//>`;
}

function MeasurementDialog({ entry, today, heightCm, onDismiss }) {
  const [day, setDay] = useState(entry?.epochDay ?? today);
  const existing = entry ?? repo.measurements().find((m) => m.epochDay === day) ?? null;
  const [waist, setWaist] = useState(existing?.waistCm != null ? Fmt.num(existing.waistCm) : '');
  const [neck, setNeck] = useState(existing?.neckCm != null ? Fmt.num(existing.neckCm) : '');
  const [bf, setBf] = useState(existing?.bodyFatPercent != null ? Fmt.num(existing.bodyFatPercent) : '');
  const opt = (t, lo, hi) => (t.trim() === '' ? { v: null, ok: true } : (() => { const v = Fmt.parseDecimal(t); return { v, ok: v != null && v >= lo && v <= hi }; })());
  const w = opt(waist, 40, 200);
  const n = opt(neck, 20, 70);
  const b = opt(bf, 3, 60);
  const ok = w.ok && n.ok && b.ok && (w.v != null || n.v != null || b.v != null);
  const navy = w.v != null && n.v != null ? Analytics.navyBodyFatMale(heightCm, w.v, n.v) : null;
  const save = () => {
    if (!ok) return;
    repo.logMeasurement({ epochDay: day, waistCm: w.v, neckCm: n.v, bodyFatPercent: b.v, note: existing?.note ?? null });
    onDismiss();
  };
  return html`<${Dialog} title="Body measurements" onClose=${onDismiss} actions=${html`
    ${entry && html`<span class="left"><button class="btn danger" onClick=${() => { repo.deleteMeasurement(entry.epochDay); onDismiss(); }}>Delete</button></span>`}
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" disabled=${!ok} onClick=${save}>Save</button>`}>
    ${entry ? html`<p><b>${Fmt.longDate(entry.epochDay)}</b></p>` : html`<${DateField} day=${day} onChange=${setDay} max=${today} />`}
    <${Field} label="Waist (at navel)" suffix="cm" error=${w.ok ? null : 'Enter 40–200 cm'}><${NumberInput} value=${waist} onInput=${setWaist} autofocus /><//>
    <${Field} label="Neck (optional)" suffix="cm" error=${n.ok ? null : 'Enter 20–70 cm'}><${NumberInput} value=${neck} onInput=${setNeck} /><//>
    <${Field} label="Body fat (optional)" suffix="%" error=${b.ok ? null : 'Enter 3–60%'}
      hint=${navy != null ? `U.S. Navy estimate (male formula): ${Fmt.num(navy)}%. Leave body fat empty to use it.` : null}>
      <${NumberInput} value=${bf} onInput=${setBf} /><//>
  <//>`;
}

