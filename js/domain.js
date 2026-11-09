// Plan logic with no browser dependencies: a port of the Android app's domain package
// (Analytics.kt, Rotation.kt, Checklist.kt, WeeklyCheckIn.kt, Format.kt and Meters).
// Days are "epoch days" (days since 1970-01-01), the same numbers the Android backup uses.

// ------------------------------------------------------------------ dates

const DAY_MS = 86_400_000;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Today's date on this phone, as an epoch day. */
export function todayDay() {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** 1 = Monday ... 7 = Sunday (java.time.DayOfWeek). */
export function dayOfWeek(day) {
  return (((day + 3) % 7) + 7) % 7 + 1;
}

export const isSunday = (day) => dayOfWeek(day) === 7;
export const weekStart = (day) => day - (dayOfWeek(day) - 1);
export const isoDate = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
export function parseIsoDate(text) {
  const t = Date.parse(`${text}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.floor(t / DAY_MS);
}
export const dayName = (day, short = false) => {
  const n = DAY_NAMES[dayOfWeek(day) - 1];
  return short ? n.slice(0, 3) : n;
};
const parts = (day) => {
  const d = new Date(day * DAY_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};

// ------------------------------------------------------------------ formatting

const MINUS = '−';

export const Fmt = {
  int(value) {
    return Math.round(Number(value) || 0).toLocaleString('en-US');
  },
  /** At most [decimals] decimals, trailing zeros trimmed: 70.0 -> "70", 69.85 -> "69.9". */
  num(value, decimals = 1) {
    const f = 10 ** decimals;
    const rounded = Math.round(value * f) / f;
    let text = rounded.toFixed(decimals);
    if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
    if (text === '-0') text = '0';
    return text;
  },
  kg: (v) => `${Fmt.num(v)} kg`,
  signed(value, decimals = 1) {
    const body = Fmt.num(Math.abs(value), decimals);
    if (body === Fmt.num(0, decimals)) return '±0';
    return value > 0 ? `+${body}` : `${MINUS}${body}`;
  },
  signedKg: (v) => `${Fmt.signed(v)} kg`,
  kcal: (v) => `${Fmt.int(v)} kcal`,
  /** "Mon 9 Nov" */
  date(day) {
    const p = parts(day);
    return `${dayName(day, true)} ${p.d} ${MONTH_NAMES[p.m].slice(0, 3)}`;
  },
  /** "Monday, 9 November" */
  longDate(day) {
    const p = parts(day);
    return `${dayName(day)}, ${p.d} ${MONTH_NAMES[p.m]}`;
  },
  /** "Monday 9 November 2026" */
  fullDate(day) {
    const p = parts(day);
    return `${dayName(day)} ${p.d} ${MONTH_NAMES[p.m]} ${p.y}`;
  },
  /** "9 Nov" */
  shortDate(day) {
    const p = parts(day);
    return `${p.d} ${MONTH_NAMES[p.m].slice(0, 3)}`;
  },
  /** "42:13" or "1:05:23". */
  duration(millis) {
    const total = Math.max(0, Math.floor(millis / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  },
  time(ms) {
    const d = new Date(ms);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
  /** Accepts "72.5" and "72,5". */
  parseDecimal(text) {
    const t = String(text ?? '').trim().replace(',', '.');
    if (t === '' || !/^-?\d*\.?\d+$|^-?\d+\.?$/.test(t)) return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  },
  plural: (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`,
  /** "66–67 kg", or "60 kg" when both ends are the same. */
  range(min, max, unit = 'kg', decimals = 1) {
    const a = Fmt.num(min, decimals);
    const b = Fmt.num(max, decimals);
    return `${a === b ? a : `${a}–${b}`}${unit ? ` ${unit}` : ''}`;
  },
};

/** 50 → "50", 52.5 → "52.5", 52.25 → "52.25". */
export const fmtWeight = (kg) => Fmt.num(kg, 2);

// ------------------------------------------------------------------ constants

export const Meal = {
  entries: [
    { name: 'BREAKFAST', label: 'Breakfast' },
    { name: 'LUNCH', label: 'Lunch' },
    { name: 'PRE_WORKOUT', label: 'Pre-workout' },
    { name: 'POST_WORKOUT', label: 'Post-workout' },
    { name: 'DINNER', label: 'Dinner' },
    { name: 'SNACK', label: 'Snacks' },
  ],
  of(name) {
    return Meal.entries.find((m) => m.name === name) ?? Meal.entries[5];
  },
  forHour(hour) {
    if (hour < 11) return 'BREAKFAST';
    if (hour < 15) return 'LUNCH';
    if (hour < 19) return 'SNACK';
    if (hour < 23) return 'DINNER';
    return 'SNACK';
  },
};

export const Pose = {
  entries: [
    { name: 'RELAXED_FRONT', label: 'Relaxed front' },
    { name: 'FRONT_FLEXED', label: 'Front flexed' },
    { name: 'SIDE', label: 'Side' },
    { name: 'BACK', label: 'Back' },
  ],
  of(name) {
    return Pose.entries.find((p) => p.name === name) ?? Pose.entries[0];
  },
};

export const ExerciseKind = {
  COMPOUND: 'COMPOUND',
  ISOLATION: 'ISOLATION',
  ABS: 'ABS',
  all: ['COMPOUND', 'ISOLATION', 'ABS'],
  /** The plan's rest: compounds 2–3 min, isolation 1–2 min, abs 45–90 s. */
  defaultRestSeconds: (kind) => (kind === 'COMPOUND' ? 150 : kind === 'ABS' ? 60 : 90),
  label: (kind) => (kind === 'COMPOUND' ? 'Compound' : kind === 'ABS' ? 'Abs' : 'Isolation'),
};

export const Measure = { REPS: 'REPS', SECONDS: 'SECONDS' };

export const CARDIO_TYPES = ['Incline treadmill', 'Cycling', 'Brisk walk', 'Stair climber', 'Elliptical', 'Swimming', 'Other'];

export const FoodCategories = {
  PROTEIN: 'Protein',
  CARBS: 'Carbs',
  DAIRY: 'Dairy',
  FRUIT_VEG: 'Fruit & veg',
  EXTRAS: 'Fats & extras',
  CUSTOM: 'My foods',
  all: ['Protein', 'Carbs', 'Dairy', 'Fruit & veg', 'Fats & extras', 'My foods'],
};

/** All goal numbers (GoalSettings). Defaults mirror the Fitness Transformation README. */
export function defaultSettings(programStartEpochDay = todayDay()) {
  return {
    id: 1,
    heightCm: 170.0,
    startWeightKg: 70.5,
    targetWeightMinKg: 66.0,
    targetWeightMaxKg: 67.0,
    estimatedBodyFatPercent: 19.5,
    targetBodyFatPercent: 14.0,
    dailyCalories: 2100,
    proteinGrams: 150,
    carbsGrams: 230,
    fatGrams: 65,
    fiberGramsMin: 25,
    fiberGramsMax: 35,
    waterLitersMin: 2.5,
    waterLitersMax: 3.5,
    dailyStepsMin: 8000,
    dailyStepsTarget: 10000,
    targetWeightLossMinKgPerWeek: 0.3,
    targetWeightLossMaxKgPerWeek: 0.5,
    cardioSessionsMin: 2,
    cardioSessionsMax: 3,
    sleepHoursMin: 7.0,
    calorieFloor: 1800,
    phase: 1,
    programStartEpochDay,
    phase2StartEpochDay: null,
    phase2GainMinKgPerWeek: 0.1,
    phase2GainMaxKgPerWeek: 0.25,
    photoIntervalDays: 21,
    definitionImproved: false,
    absMoreDefined: false,
    // Web additions; the Android app ignores them in a backup.
    /** GYM: the six-day push/pull/legs cut. WALKING: daily steps, 3 meals, optional strength sessions. */
    planType: 'GYM',
    /** MALE or FEMALE: picks the body-fat formula and a few notes. */
    sex: 'MALE',
    /** The first week's step minimum; it rises by [stepsWeeklyIncrease] a week until it reaches dailyStepsMin. */
    stepsStart: 8000,
    stepsWeeklyIncrease: 1000,
    /** Walking plan: optional short strength sessions a week. */
    strengthSessionsPerWeek: 2,
    checklistCreatine: true,
  };
}

/** The two plans the app can follow. Numbers are each plan's starting targets; all are editable in Settings. */
export const PLANS = {
  GYM: {
    label: 'Gym: 6-day push/pull/legs',
    short: 'Gym plan',
    description: 'A cut with a six-day push/pull/legs gym plan, 2,100 kcal and 150 g protein to start, 8,000–10,000 steps. Sunday is rest.',
    preset: {
      dailyCalories: 2100, proteinGrams: 150, carbsGrams: 230, fatGrams: 65, fiberGramsMin: 25, fiberGramsMax: 35,
      waterLitersMin: 2.5, waterLitersMax: 3.5, dailyStepsMin: 8000, dailyStepsTarget: 10000, stepsStart: 8000,
      stepsWeeklyIncrease: 1000, targetWeightLossMinKgPerWeek: 0.3, targetWeightLossMaxKgPerWeek: 0.5,
      cardioSessionsMin: 2, cardioSessionsMax: 3, sleepHoursMin: 7, calorieFloor: 1800,
      phase2GainMinKgPerWeek: 0.1, phase2GainMaxKgPerWeek: 0.25, photoIntervalDays: 21, strengthSessionsPerWeek: 2,
      checklistCreatine: true,
    },
  },
  WALKING: {
    label: 'Walking & 3 meals',
    short: 'Walking plan',
    description: 'Gradual fat loss with daily walking that builds from 5,000 to 8,000–10,000 steps, three Indian meals a day, ' +
      '1,450 kcal and 100 g protein, and two optional short strength sessions a week.',
    preset: {
      dailyCalories: 1450, proteinGrams: 100, carbsGrams: 150, fatGrams: 45, fiberGramsMin: 25, fiberGramsMax: 30,
      waterLitersMin: 2.0, waterLitersMax: 3.0, dailyStepsMin: 8000, dailyStepsTarget: 10000, stepsStart: 5000,
      stepsWeeklyIncrease: 1000, targetWeightLossMinKgPerWeek: 0.3, targetWeightLossMaxKgPerWeek: 0.5,
      cardioSessionsMin: 0, cardioSessionsMax: 0, sleepHoursMin: 7, calorieFloor: 1400,
      phase2GainMinKgPerWeek: 0, phase2GainMaxKgPerWeek: 0.1, photoIntervalDays: 21, strengthSessionsPerWeek: 2,
      checklistCreatine: false,
    },
  },
};

export const isWalking = (s) => s?.planType === 'WALKING';

/** The day's step minimum: it builds week by week from stepsStart up to dailyStepsMin. */
export function stepsGoalFor(s, day) {
  if (!(s.stepsWeeklyIncrease > 0) || !(s.stepsStart < s.dailyStepsMin)) return s.dailyStepsMin;
  const week = Math.max(0, Math.floor((day - s.programStartEpochDay) / 7));
  return Math.min(s.dailyStepsMin, s.stepsStart + week * s.stepsWeeklyIncrease);
}

export const emptyLog = (epochDay) => ({
  epochDay, waterMl: 0, steps: null, sleepHours: null, creatine: false, noJunk: false, restDay: false, note: null,
});

// ------------------------------------------------------------------ totals

export function totalsOf(entries) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const e of entries) {
    t.kcal += e.kcal; t.protein += e.protein; t.carbs += e.carbs; t.fat += e.fat; t.fiber += e.fiber;
  }
  return t;
}

// ------------------------------------------------------------------ analytics

export const RateStatus = {
  NOT_ENOUGH_DATA: 'NOT_ENOUGH_DATA', ON_TRACK: 'ON_TRACK', SLOW: 'SLOW', PLATEAU: 'PLATEAU',
  FAST: 'FAST', TOO_FAST: 'TOO_FAST', TARGET_REACHED: 'TARGET_REACHED',
};

export const DayStatus = {
  DONE: 'DONE', PARTIAL: 'PARTIAL', MISSED: 'MISSED', REST: 'REST', TODAY: 'TODAY', FUTURE: 'FUTURE', BEFORE_START: 'BEFORE_START',
};

export const dayStatusLabel = (s) => ({
  DONE: 'Done', PARTIAL: 'Partial', MISSED: 'Missed', REST: 'Rest', TODAY: 'Today', FUTURE: 'Upcoming', BEFORE_START: 'Before start',
})[s];

const avg = (list) => list.reduce((a, b) => a + b, 0) / list.length;

export const Analytics = {
  KCAL_PER_KG: 7700.0,

  /** Mean of weigh-ins in the [window] days ending on [endDay], or null if there are none. */
  trailingAverage(weights, endDay, window = 7) {
    let sum = 0;
    let count = 0;
    for (const w of weights) {
      if (w.epochDay >= endDay - window + 1 && w.epochDay <= endDay) {
        sum += w.weightKg;
        count++;
      }
    }
    return count === 0 ? null : sum / count;
  },

  /** Every weigh-in paired with the 7-day average ending that day. */
  trend(weights, window = 7) {
    const sorted = [...weights].sort((a, b) => a.epochDay - b.epochDay);
    const out = [];
    let start = 0;
    let sum = 0;
    for (let i = 0; i < sorted.length; i++) {
      sum += sorted[i].weightKg;
      while (sorted[start].epochDay < sorted[i].epochDay - window + 1) {
        sum -= sorted[start].weightKg;
        start++;
      }
      out.push({ epochDay: sorted[i].epochDay, weightKg: sorted[i].weightKg, averageKg: sum / (i - start + 1) });
    }
    return out;
  },

  /** The latest 7-day average we have, even if the last weigh-in was a while ago. */
  currentAverage(weights) {
    const t = Analytics.trend(weights);
    return t.length ? t[t.length - 1].averageKg : null;
  },

  weeklyAverages(weights) {
    const groups = new Map();
    for (const w of weights) {
      const ws = weekStart(w.epochDay);
      if (!groups.has(ws)) groups.set(ws, []);
      groups.get(ws).push(w.weightKg);
    }
    return [...groups.entries()]
      .map(([start, list]) => ({ weekStart: start, averageKg: avg(list), count: list.length }))
      .sort((a, b) => a.weekStart - b.weekStart);
  },

  /**
   * kg/week change between consecutive complete Mon–Sun weeks with at least three weigh-ins.
   * The current week is excluded so a half-finished week never drives a decision.
   */
  weeklyChanges(weights, today) {
    const currentWeek = weekStart(today);
    const weeks = Analytics.weeklyAverages(weights).filter((w) => w.weekStart < currentWeek && w.count >= 3);
    const out = [];
    for (let i = 1; i < weeks.length; i++) {
      const a = weeks[i - 1];
      const b = weeks[i];
      out.push((b.averageKg - a.averageKg) / ((b.weekStart - a.weekStart) / 7.0));
    }
    return out;
  },

  /** README section 7: adjust only on weekly averages, never on one or two days. */
  assessRate(s, weights, today) {
    const changes = Analytics.weeklyChanges(weights, today);
    const last = changes.length ? changes[changes.length - 1] : null;
    const prev = changes.length >= 2 ? changes[changes.length - 2] : null;
    let r;
    if (s.phase === 1) r = assessCut(s, Analytics.currentAverage(weights), last, prev);
    else r = isWalking(s) ? assessMaintain(s, last, prev) : assessBuild(s, last, prev);
    // Water retention around a period can hide a week's loss; the plan says not to cut calories for it.
    if (s.sex === 'FEMALE' && s.phase === 1 && (r.status === RateStatus.SLOW || r.status === RateStatus.PLATEAU)) {
      r = { ...r, advice: `${r.advice} Weight can rise for a few days around your period: don't cut calories for that, judge it on the weekly average.` };
    }
    return r;
  },

  cutProgress(s, weights, today) {
    const average = Analytics.currentAverage(weights);
    const toLose = s.startWeightKg - s.targetWeightMaxKg;
    const fraction = average == null || toLose <= 0 ? 0 : Math.min(1, Math.max(0, (s.startWeightKg - average) / toLose));
    const remaining = average == null ? null : Math.max(0, average - s.targetWeightMaxKg);
    const days = Math.max(0, today - s.programStartEpochDay);
    const weeks = days / 7.0;
    const expectedMinKg = Math.max(s.targetWeightMinKg, s.startWeightKg - s.targetWeightLossMaxKgPerWeek * weeks);
    const expectedMaxKg = Math.max(s.targetWeightMinKg, s.startWeightKg - s.targetWeightLossMinKgPerWeek * weeks);
    const recent = Analytics.weeklyChanges(weights, today).slice(-3);
    const lossRate = recent.length === 0 ? null : -avg(recent);
    const etaWeeks = lossRate != null && lossRate > 0.05 && remaining != null && remaining > 0 ? Math.ceil(remaining / lossRate) : null;
    return {
      currentAverageKg: average, fraction, remainingKg: remaining, weekNumber: Math.floor(days / 7) + 1,
      expectedMinKg, expectedMaxKg, etaWeeks,
    };
  },

  /** Score used for personal bests: estimated 1RM, or reps/seconds for bodyweight and timed work. */
  setScore(weightKg, reps, measure) {
    return measure === Measure.SECONDS || weightKg <= 0 ? reps : weightKg * (1 + reps / 30.0);
  },

  loadIncrement: (kind) => (kind === ExerciseKind.COMPOUND ? 2.5 : 2.0),

  /**
   * Double progression, one rep at a time: at the same load, add a rep to the first set that's
   * below the top of the range (50 kg × 10, 8, 8 → 10, 9, 8). Once every set reaches the top,
   * add the smallest increment and start again from the bottom of the range.
   */
  suggest(plan, lastSets) {
    const timed = plan.measure === Measure.SECONDS;
    const unit = timed ? 's' : '';
    if (lastSets.length === 0) {
      const range = `${plan.repMin}–${plan.repMax}`;
      let text;
      if (timed) text = `First session: hold ${range} s per set.`;
      else if (plan.kind === ExerciseKind.COMPOUND) text = `First session: pick a load you can lift ${range} reps with 1–2 reps in reserve.`;
      else if (plan.kind === ExerciseKind.ABS) text = `First session: do ${range} controlled reps per set.`;
      else text = `First session: pick a load you can lift ${range} reps with clean form.`;
      return { text, weightKg: null, reps: Array(plan.sets).fill(plan.repMin), increaseLoad: false };
    }
    const topWeight = Math.max(...lastSets.map((s) => s.weightKg));
    const topSets = lastSets.filter((s) => s.weightKg === topWeight).sort((a, b) => a.setNumber - b.setNumber);
    const load = topWeight > 0 ? `${Fmt.num(topWeight, 2)} kg` : 'Bodyweight';
    const allAtTop = topSets.length >= plan.sets && topSets.slice(0, plan.sets).every((s) => s.reps >= plan.repMax);
    if (allAtTop) {
      if (timed || topWeight <= 0) {
        return {
          text: 'Top of the range on every set. Add load or use a harder variation.',
          weightKg: topWeight, reps: Array(plan.sets).fill(plan.repMax), increaseLoad: true,
        };
      }
      const next = topWeight + Analytics.loadIncrement(plan.kind);
      return {
        text: `Top of the range on every set. Increase to ${Fmt.num(next, 2)} kg and rebuild from ${plan.repMin} reps.`,
        weightKg: next, reps: Array(plan.sets).fill(plan.repMin), increaseLoad: true,
      };
    }
    const step = timed ? 5 : 1;
    const previous = Array.from({ length: plan.sets }, (_, i) => topSets[i]?.reps ?? null);
    const bump = previous.findIndex((r) => r != null && r < plan.repMax);
    const targets = previous.map((reps, i) => {
      if (reps == null) return plan.repMin;
      if (i === bump) return Math.min(plan.repMax, reps + step);
      return Math.min(plan.repMax, reps);
    });
    return {
      text: `Beat last time: ${load} × ${targets.map((t) => `${t}${unit}`).join(', ')}`,
      weightKg: topWeight, reps: targets, increaseLoad: false,
    };
  },

  /** README section 14: Sunday (or a marked rest day) is recovery, never a missed workout. */
  dayStatus({ day, today, programStart, restMarked, sets, plannedSets, finished }) {
    if (sets > 0 && (finished || (plannedSets > 0 && sets >= Math.ceil(plannedSets * 0.75)))) return DayStatus.DONE;
    if (sets > 0) return DayStatus.PARTIAL;
    if (isSunday(day) || restMarked) return DayStatus.REST;
    if (day > today) return DayStatus.FUTURE;
    if (day === today) return DayStatus.TODAY;
    if (day < programStart) return DayStatus.BEFORE_START;
    return DayStatus.MISSED;
  },

  /**
   * Maintenance calories from logged intake and the weight trend over [windowDays]:
   * intake minus the energy implied by the weight change. Needs at least 10 fully logged days.
   */
  estimateMaintenance(totals, weights, today, windowDays = 28) {
    const from = today - windowDays + 1;
    const logged = totals.filter((t) => t.epochDay >= from && t.epochDay <= today && t.kcal >= 1000);
    if (logged.length < 10) return null;
    const ws = weights.filter((w) => w.epochDay >= from && w.epochDay <= today).sort((a, b) => a.epochDay - b.epochDay);
    if (ws.length < 8 || ws[ws.length - 1].epochDay - ws[0].epochDay < 10) return null;
    const slope = Analytics.linearSlope(ws.map((w) => [w.epochDay, w.weightKg]));
    if (slope == null) return null;
    const tdee = avg(logged.map((t) => t.kcal)) - slope * Analytics.KCAL_PER_KG;
    return Math.round(tdee / 10) * 10;
  },

  /** Least-squares slope (y per x). */
  linearSlope(points) {
    if (points.length < 2) return null;
    const mx = avg(points.map((p) => p[0]));
    const my = avg(points.map((p) => p[1]));
    let num = 0;
    let den = 0;
    for (const [x, y] of points) {
      num += (x - mx) * (y - my);
      den += (x - mx) * (x - mx);
    }
    return den === 0 ? null : num / den;
  },

  /** U.S. Navy circumference method, male formula (cm). */
  navyBodyFatMale(heightCm, waistCm, neckCm) {
    if (waistCm <= neckCm || heightCm <= 0) return null;
    const bf = 495.0 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450.0;
    return bf >= 3 && bf <= 60 ? bf : null;
  },

  /** U.S. Navy circumference method, female formula (cm): needs the hip as well. */
  navyBodyFatFemale(heightCm, waistCm, neckCm, hipCm) {
    if (hipCm == null || waistCm + hipCm <= neckCm || heightCm <= 0) return null;
    const bf = 495.0 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450.0;
    return bf >= 8 && bf <= 60 ? bf : null;
  },

  /** The Navy estimate for the person's sex, or null without the measurements it needs. */
  navyBodyFat(s, m) {
    if (m?.waistCm == null || m.neckCm == null) return null;
    return s.sex === 'FEMALE'
      ? Analytics.navyBodyFatFemale(s.heightCm, m.waistCm, m.neckCm, m.hipCm)
      : Analytics.navyBodyFatMale(s.heightCm, m.waistCm, m.neckCm);
  },

  /** Best score in the first two vs the last two sessions of each lift (needs four sessions). */
  liftChanges(sets, measureOf) {
    const byExercise = new Map();
    for (const s of sets) {
      if (!byExercise.has(s.exerciseId)) byExercise.set(s.exerciseId, []);
      byExercise.get(s.exerciseId).push(s);
    }
    const out = [];
    for (const [id, list] of byExercise) {
      const byDay = new Map();
      for (const s of list) {
        if (!byDay.has(s.epochDay)) byDay.set(s.epochDay, []);
        byDay.get(s.epochDay).push(s);
      }
      const days = [...byDay.keys()].sort((a, b) => a - b);
      if (days.length < 4) continue;
      const measure = measureOf(id);
      const best = (ds) => Math.max(...ds.flatMap((d) => byDay.get(d)).map((s) => Analytics.setScore(s.weightKg, s.reps, measure)));
      const startBest = best(days.slice(0, 2));
      const recentBest = best(days.slice(-2));
      out.push({ exerciseId: id, startBest, recentBest, percent: startBest <= 0 ? 0 : ((recentBest - startBest) / startBest) * 100 });
    }
    return out;
  },
};

function assessCut(s, current, last, prev) {
  if (current != null && current <= s.targetWeightMaxKg) {
    return {
      status: RateStatus.TARGET_REACHED, weeklyChangeKg: last, headline: 'Target range reached',
      advice: "Don't keep cutting automatically. Move to Phase 2: maintenance first, then a small surplus.",
    };
  }
  if (last == null) {
    return {
      status: RateStatus.NOT_ENOUGH_DATA, weeklyChangeKg: null, headline: 'Building your trend',
      advice: 'Weigh in every morning. After two full weeks your weekly rate shows here. ' +
        'Judge progress on weekly averages, never on one or two days.',
    };
  }
  const loss = -last;
  const prevLoss = prev == null ? null : -prev;
  const range = `${Fmt.num(s.targetWeightLossMinKgPerWeek)}–${Fmt.num(s.targetWeightLossMaxKgPerWeek)} kg/week`;
  const rate = `${Fmt.signedKg(last)}/week`;
  if (prevLoss != null && loss < 0.2 && prevLoss < 0.2) {
    const advice = s.dailyCalories - 150 >= s.calorieFloor
      ? 'Two weeks under 0.2 kg/week. Reduce ~100–150 kcal/day ' +
        `(to ${Fmt.int(s.dailyCalories - 150)}–${Fmt.kcal(s.dailyCalories - 100)}) ` +
        'or add activity, such as 2,000 more steps a day.'
      : `Two weeks under 0.2 kg/week. You're near your ${Fmt.kcal(s.calorieFloor)} floor, ` +
        'so add activity (steps or one more cardio session) rather than eating less.';
    return { status: RateStatus.PLATEAU, weeklyChangeKg: last, headline: `Loss has stalled: ${rate}`, advice };
  }
  if (prevLoss != null && loss > 0.7 && prevLoss > 0.7) {
    return {
      status: RateStatus.TOO_FAST, weeklyChangeKg: last, headline: `Losing too fast: ${rate}`,
      advice: 'Two weeks above 0.7 kg/week. Add ~100–150 kcal/day ' +
        `(to ${Fmt.int(s.dailyCalories + 100)}–${Fmt.kcal(s.dailyCalories + 150)}) to protect muscle and strength.`,
    };
  }
  if (loss >= s.targetWeightLossMinKgPerWeek && loss <= s.targetWeightLossMaxKgPerWeek) {
    return {
      status: RateStatus.ON_TRACK, weeklyChangeKg: last, headline: `On track: ${rate}`,
      advice: `Inside the ${range} target. Keep calories at ${Fmt.kcal(s.dailyCalories)}.`,
    };
  }
  if (loss < s.targetWeightLossMinKgPerWeek) {
    return {
      status: RateStatus.SLOW, weeklyChangeKg: last, headline: `Slower than plan: ${rate}`,
      advice: `Target is ${range}. Don't change anything yet; adjust only if loss stays under 0.2 kg/week for 2–3 weeks.`,
    };
  }
  return {
    status: RateStatus.FAST, weeklyChangeKg: last, headline: `Faster than plan: ${rate}`,
    advice: `Target is ${range}. Fine for now; if it stays above 0.7 kg/week, add 100–150 kcal/day.`,
  };
}

/** Walking plan, Phase 2: hold the new weight within about ±0.15 kg a week. */
function assessMaintain(s, last, prev) {
  if (last == null) {
    return {
      status: RateStatus.NOT_ENOUGH_DATA, weeklyChangeKg: null, headline: 'Building your trend',
      advice: 'Weigh in every morning. Aim to hold your weight steady, judged on weekly averages.',
    };
  }
  const rate = `${Fmt.signedKg(last)}/week`;
  if (prev != null && last > 0.15 && prev > 0.15) {
    return {
      status: RateStatus.TOO_FAST, weeklyChangeKg: last, headline: `Creeping up: ${rate}`,
      advice: 'Two weeks of gain. Trim ~100 kcal/day or add 1,000–2,000 steps a day.',
    };
  }
  if (prev != null && last < -0.15 && prev < -0.15) {
    return {
      status: RateStatus.PLATEAU, weeklyChangeKg: last, headline: `Still losing: ${rate}`,
      advice: `Two weeks of loss. Add ~100–150 kcal/day (to ${Fmt.int(s.dailyCalories + 100)}–${Fmt.kcal(s.dailyCalories + 150)}) to hold your weight.`,
    };
  }
  return {
    status: RateStatus.ON_TRACK, weeklyChangeKg: last, headline: `Holding steady: ${rate}`,
    advice: `Keep calories around ${Fmt.kcal(s.dailyCalories)}, keep walking and keep protein at ${s.proteinGrams} g.`,
  };
}

function assessBuild(s, last, prev) {
  const range = `${Fmt.num(s.phase2GainMinKgPerWeek, 2)}–${Fmt.num(s.phase2GainMaxKgPerWeek, 2)} kg/week`;
  if (last == null) {
    return {
      status: RateStatus.NOT_ENOUGH_DATA, weeklyChangeKg: null, headline: 'Building your trend',
      advice: `Weigh in every morning. Aim for slow gain of ${range}, judged on weekly averages.`,
    };
  }
  const rate = `${Fmt.signedKg(last)}/week`;
  const fastLimit = s.phase2GainMaxKgPerWeek + 0.15;
  if (prev != null && last < 0.05 && prev < 0.05) {
    return {
      status: RateStatus.PLATEAU, weeklyChangeKg: last, headline: `Weight isn't moving: ${rate}`,
      advice: `Two weeks without gain. Add ~100–150 kcal/day (to ${Fmt.int(s.dailyCalories + 100)}–${Fmt.kcal(s.dailyCalories + 150)}).`,
    };
  }
  if (prev != null && last > fastLimit && prev > fastLimit) {
    return {
      status: RateStatus.TOO_FAST, weeklyChangeKg: last, headline: `Gaining too fast: ${rate}`,
      advice: `Two weeks above ${Fmt.num(fastLimit, 2)} kg/week. Trim ~100–150 kcal/day to keep fat gain controlled.`,
    };
  }
  if (last >= s.phase2GainMinKgPerWeek && last <= s.phase2GainMaxKgPerWeek) {
    return {
      status: RateStatus.ON_TRACK, weeklyChangeKg: last, headline: `Lean gain on track: ${rate}`,
      advice: `Inside the ${range} target. Keep calories at ${Fmt.kcal(s.dailyCalories)}.`,
    };
  }
  if (last < s.phase2GainMinKgPerWeek) {
    return {
      status: RateStatus.SLOW, weeklyChangeKg: last, headline: `Slower than plan: ${rate}`,
      advice: `Target is ${range}. Add 100–150 kcal/day only if it stays flat for 2–3 weeks.`,
    };
  }
  return {
    status: RateStatus.FAST, weeklyChangeKg: last, headline: `Faster than plan: ${rate}`,
    advice: `Target is ${range}. Fine short-term; if it continues, trim 100–150 kcal/day.`,
  };
}

// ------------------------------------------------------------------ the workout order

/**
 * The workout order. Workouts run in plan order (Push A, Pull A, Legs A, Push B, Pull B, Legs B,
 * then Push A again) and a day without a workout pauses it: Sunday, a day off, or a missed day.
 * Nothing is skipped, so after a day off the next day picks up where you left off and the order
 * carries into the next week. With no days off it's the weekday plan: Push A on Monday through
 * Legs B on Saturday.
 *
 * Returns a Map day → { workout, next } (templates; workout is null on a rest day).
 */
export function planRotation({ from, to, today, programStart, templates, lastDone, sessionTemplates, done, dayOff }) {
  const order = [...templates].sort((a, b) => a.sortOrder - b.sortOrder);
  const plan = new Map();
  if (order.length === 0) {
    for (let d = from; d <= to; d++) plan.set(d, { workout: null, next: null });
    return plan;
  }
  const byId = new Map(order.map((t) => [t.id, t]));
  const after = (t) => order[(order.indexOf(t) + 1) % order.length];
  const weekday = (day) => order.find((t) => t.dayOfWeek === dayOfWeek(day)) ?? null;
  const firstWorkout = () => {
    const firstTrainingDay = isSunday(programStart) ? programStart + 1 : programStart;
    return weekday(firstTrainingDay) ?? order[0];
  };

  let due = (lastDone && byId.get(lastDone) && after(byId.get(lastDone))) || firstWorkout();
  for (let d = from; d <= to; d++) {
    const logged = sessionTemplates.has(d) ? byId.get(sessionTemplates.get(d)) ?? null : null;
    const beforeStart = d < programStart;
    const next = beforeStart ? weekday(d) : due;
    let workout;
    if (logged) workout = logged;
    else if (isSunday(d) || dayOff(d)) workout = null;
    else workout = next;
    plan.set(d, { workout, next });
    // A missed day in the past doesn't move the order; the workout waits for the next day.
    const moves = logged ? done(d) || d >= today : workout != null && !beforeStart && d >= today;
    if (moves && workout) due = after(workout);
  }
  return plan;
}

// ------------------------------------------------------------------ meters

/** fraction 0..1+, tone (PROGRESS, GOOD, WARNING, OVER) and the state line under a bar. */
export const Meters = {
  /** A budget not to exceed (calories): on target within -10% / +5%. */
  budget(value, target, unit) {
    if (target <= 0) return { fraction: 0, tone: 'PROGRESS', text: '' };
    const fraction = value / target;
    if (value > target * 1.05) return { fraction: 1, tone: 'OVER', text: `Over by ${Fmt.int(value - target)} ${unit}` };
    if (value >= target * 0.9) {
      return { fraction, tone: 'GOOD', text: value <= target ? `On target · ${Fmt.int(target - value)} ${unit} left` : 'On target' };
    }
    return { fraction, tone: 'PROGRESS', text: `${Fmt.int(target - value)} ${unit} left` };
  },
  /** A minimum to reach (protein, fiber, water, steps). */
  minimum(value, target, remainingText) {
    if (target <= 0) return { fraction: 0, tone: 'PROGRESS', text: '' };
    if (value >= target) return { fraction: 1, tone: 'GOOD', text: 'Goal hit' };
    return { fraction: value / target, tone: 'PROGRESS', text: remainingText };
  },
  /** A target to land near (carbs, fat): ±10% counts as on target. */
  range(value, target, unit) {
    if (target <= 0) return { fraction: 0, tone: 'PROGRESS', text: '' };
    const fraction = value / target;
    if (value > target * 1.1) return { fraction: 1, tone: 'WARNING', text: `${Fmt.int(value - target)} ${unit} over` };
    if (value >= target * 0.9) return { fraction, tone: 'GOOD', text: 'On target' };
    return { fraction, tone: 'PROGRESS', text: `${Fmt.int(target - value)} ${unit} left` };
  },
};

// ------------------------------------------------------------------ the daily checklist

/**
 * The day's checklist. [workout] is { name, doneSets, plannedSets, done }, or null on a rest day; the
 * walking plan has no daily workout item. [stepsGoal] is the day's step minimum (it builds up week by week).
 */
export function buildChecklist(s, workout, log, t, weightKg, stepsGoal = s.dailyStepsMin) {
  const workoutItem = workout == null
    ? { key: 'WORKOUT', label: 'Rest day', detail: 'Recovery is part of the plan', done: true, manual: false }
    : { key: 'WORKOUT', label: `Workout: ${workout.name}`, detail: `${workout.doneSets} / ${workout.plannedSets} sets`, done: workout.done, manual: false };
  return [
    ...(isWalking(s) ? [] : [workoutItem]),
    {
      key: 'WEIGH_IN', label: 'Morning weigh-in', detail: weightKg != null ? Fmt.kg(weightKg) : 'After waking and the bathroom, before food',
      done: weightKg != null, manual: false,
    },
    {
      key: 'PROTEIN', label: `Protein ${s.proteinGrams} g`, detail: `${Fmt.int(t.protein)} / ${s.proteinGrams} g`,
      done: t.protein >= s.proteinGrams, manual: false,
    },
    {
      key: 'CALORIES', label: 'Calories on target', detail: `${Fmt.int(t.kcal)} / ${Fmt.kcal(s.dailyCalories)}`,
      done: t.kcal >= s.dailyCalories * 0.9 && t.kcal <= s.dailyCalories * 1.05, manual: false,
    },
    {
      key: 'WATER', label: `Water ${Fmt.num(s.waterLitersMin)} L+`, detail: `${Fmt.num(log.waterMl / 1000, 2)} L · tap to add 250 ml`,
      done: log.waterMl >= s.waterLitersMin * 1000, manual: false,
    },
    {
      key: 'STEPS', label: `Steps ${Fmt.int(stepsGoal)}+`, detail: log.steps != null ? `${Fmt.int(log.steps)} steps` : 'Not logged yet',
      done: (log.steps ?? 0) >= stepsGoal, manual: false,
    },
    {
      key: 'SLEEP', label: `Sleep ${Fmt.num(s.sleepHoursMin)} h+`, detail: log.sleepHours != null ? `${Fmt.num(log.sleepHours)} h last night` : 'Not logged yet',
      done: (log.sleepHours ?? 0) >= s.sleepHoursMin, manual: false,
    },
    ...(s.checklistCreatine === false ? [] : [
      { key: 'CREATINE', label: 'Creatine', detail: log.creatine ? 'Taken' : 'Tap to mark', done: log.creatine, manual: true },
    ]),
    { key: 'NO_JUNK', label: 'No junk food or sugar', detail: log.noJunk ? 'Clean day' : 'Tap to mark', done: log.noJunk, manual: true },
  ];
}

/** A day against the walking plan's step goal, for the week strip and consistency grid. */
export function stepsStatus(s, day, today, steps) {
  const goal = stepsGoalFor(s, day);
  if (steps != null && steps >= goal) return DayStatus.DONE;
  if (steps != null && steps > 0) return DayStatus.PARTIAL;
  if (day > today) return DayStatus.FUTURE;
  if (day === today) return DayStatus.TODAY;
  if (day < s.programStartEpochDay) return DayStatus.BEFORE_START;
  return DayStatus.MISSED;
}

// ------------------------------------------------------------------ the Sunday check-in

const FOUR_WEEKS = 28;

/** The week's numbers plus what the README rules say to do next. */
export function weeklyCheckIn(s, weights, today, week, planStartEpochDay) {
  const weekNumber = Math.floor(Math.max(0, today - s.programStartEpochDay) / 7) + 1;
  const average = Analytics.trailingAverage(weights, today);
  const previous = Analytics.trailingAverage(weights, today - 7);
  const change = average != null && previous != null ? average - previous : null;

  const lines = [];
  if (average == null) lines.push('No weigh-ins this week. Weigh in every morning.');
  else if (change == null) lines.push(`7-day average ${Fmt.kg(average)}`);
  else lines.push(`7-day average ${Fmt.kg(average)} (${Fmt.signedKg(change)} on last week)`);
  if (isWalking(s)) {
    if (week.days > 0) lines.push(`Step goal hit on ${week.stepDays} of ${week.days} days`);
    if (week.workoutsPlanned > 0) lines.push(`Strength sessions: ${week.workoutsDone} of ${week.workoutsPlanned}`);
  } else if (week.workoutsPlanned > 0) {
    lines.push(`Workouts: ${week.workoutsDone} of ${week.workoutsPlanned} done`);
  }
  if (week.days > 0) {
    lines.push(week.foodDays === 0 ? 'No food logged this week' : `Protein target hit on ${week.proteinDays} of ${week.days} days`);
  }
  const rate = Analytics.assessRate(s, weights, today);
  if (rate.status === RateStatus.PLATEAU || rate.status === RateStatus.TOO_FAST || rate.status === RateStatus.TARGET_REACHED) {
    lines.push(rate.headline, rate.advice);
  } else if (rate.status !== RateStatus.NOT_ENOUGH_DATA) {
    lines.push(rate.headline);
  }
  if (!week.waistLogged) lines.push('Measure your waist at the navel today');
  if (week.photosDue) lines.push('Progress photos are due');
  if (planStartEpochDay != null && today - planStartEpochDay >= FOUR_WEEKS && today - planStartEpochDay < FOUR_WEEKS + 7) {
    lines.push('Four weeks on this workout plan: compare your lifts on Progress, and check your recovery ' +
      'and weight trend before changing anything.');
  }
  const summary = [
    average != null ? Fmt.kg(average) + (change != null ? ` (${Fmt.signed(change)})` : '') : null,
    isWalking(s) && week.days > 0 ? `steps ${week.stepDays}/${week.days} days` : null,
    week.workoutsPlanned > 0 ? `${week.workoutsDone}/${week.workoutsPlanned} ${isWalking(s) ? 'strength' : 'workouts'}` : null,
    week.foodDays > 0 ? `protein ${week.proteinDays}/${week.days} days` : null,
  ].filter(Boolean).join(' · ') || 'Your week in numbers';
  return { title: `Week ${weekNumber} check-in`, summary, lines };
}
