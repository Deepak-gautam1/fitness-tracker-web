// First-run content, copied from the Android app's SeedData.kt: the workout plan, the README
// foods and the plan meals. Exercise ids match the Android app, so backups move between them.

/**
 * Bump whenever the plan changes. An install on an older plan switches to the new one once.
 * 1: the Fitness Transformation README plan. 2: the October 2026 plateau plan.
 */
export const PLAN_VERSION = 2;

const C = 'COMPOUND';
const I = 'ISOLATION';
const A = 'ABS';
const ex = (id, name, muscleGroup, kind, measure = 'REPS') => ({ id, name, muscleGroup, kind, measure });

export const exercises = [
  // Push A
  ex('bench_press', 'Barbell Bench Press', 'Chest', C),
  ex('incline_db_press', 'Incline Dumbbell Press', 'Upper chest', C),
  ex('cable_machine_fly', 'Machine Chest Fly', 'Chest', I),
  ex('db_shoulder_press', 'Seated Dumbbell Shoulder Press', 'Shoulders', C),
  ex('lateral_raise', 'Dumbbell Lateral Raise', 'Side delts', I),
  ex('rope_triceps_pushdown', 'Rope Triceps Pushdown', 'Triceps', I),
  ex('overhead_cable_triceps_extension', 'Overhead Cable Triceps Extension', 'Triceps', I),
  ex('cable_crunch', 'Cable Crunch', 'Abs', A),
  ex('hanging_leg_raise', 'Hanging Leg Raise', 'Abs', A),
  // Pull A
  ex('barbell_row', 'Bent-Over Barbell Row', 'Upper back', C),
  ex('pullup_lat_pulldown', 'Lat Pulldown', 'Lats', C),
  ex('seated_cable_row', 'Seated Cable Row', 'Back', C),
  ex('face_pull_rear_delt_fly', 'Face Pull', 'Rear delts', I),
  ex('ez_bar_curl', 'EZ-Bar Curl', 'Biceps', I),
  ex('hammer_curl', 'Hammer Curl', 'Biceps', I),
  // Legs A
  ex('romanian_deadlift', 'Romanian Deadlift', 'Hamstrings', C),
  ex('squat_hack_squat', 'Squat or Hack Squat', 'Quads', C),
  ex('leg_press', 'Leg Press', 'Quads', C),
  ex('leg_curl', 'Lying Leg Curl', 'Hamstrings', I),
  ex('calf_raise', 'Standing Calf Raise', 'Calves', I),
  ex('decline_crunch', 'Decline Crunch', 'Abs', A),
  ex('reverse_crunch', 'Reverse Crunch', 'Abs', A),
  // Push B
  ex('incline_bench_press', 'Incline Barbell Bench Press', 'Upper chest', C),
  ex('flat_db_press', 'Flat Dumbbell Press', 'Chest', C),
  ex('cable_fly', 'Cable Fly', 'Chest', I),
  ex('machine_shoulder_press', 'Machine Shoulder Press', 'Shoulders', C),
  ex('cable_lateral_raise', 'Cable Lateral Raise', 'Side delts', I),
  ex('triceps_pushdown', 'Triceps Pushdown', 'Triceps', I),
  ex('overhead_triceps_extension', 'Overhead Triceps Extension', 'Triceps', I),
  // Pull B
  ex('t_bar_row', 'T-Bar Row', 'Upper back', C),
  ex('chin_up', 'Chin-Up', 'Lats', C),
  ex('chest_supported_row', 'Chest-Supported Row', 'Upper back', C),
  ex('straight_arm_pulldown', 'Straight-Arm Pulldown', 'Lats', I),
  ex('rear_delt_fly', 'Reverse Pec Deck', 'Rear delts', I),
  ex('incline_db_curl', 'Incline Dumbbell Curl', 'Biceps', I),
  ex('preacher_curl', 'Preacher Curl', 'Biceps', I),
  ex('hanging_knee_leg_raise', 'Hanging Knee Raise', 'Abs', A),
  // Legs B
  ex('deadlift', 'Conventional Deadlift', 'Posterior chain', C),
  ex('bulgarian_split_squat', 'Bulgarian Split Squat', 'Quads & glutes', C),
  ex('leg_extension', 'Leg Extension', 'Quads', I),
  ex('seated_leg_curl', 'Seated Leg Curl', 'Hamstrings', I),
  ex('seated_calf_raise', 'Seated Calf Raise', 'Calves', I),
  // Alternatives for swapping in from the plan editor (and the first plan's history).
  ex('machine_db_chest_press', 'Machine/DB Chest Press', 'Chest', C),
  ex('shoulder_press', 'Shoulder Press', 'Shoulders', C),
  ex('single_arm_cable_row', 'Single-Arm Cable Row', 'Lats', C),
  ex('db_ez_bar_curl', 'DB/EZ-Bar Curl', 'Biceps', I),
  ex('hack_squat', 'Hack Squat', 'Quads', C),
  ex('ab_wheel_rollout', 'Ab Wheel Rollout', 'Abs', A),
  ex('plank', 'Plank', 'Abs', A, 'SECONDS'),
];

export const templates = [
  { id: 'push_a', name: 'Push A', hasAbs: true, dayOfWeek: 1, sortOrder: 1 },
  { id: 'pull_a', name: 'Pull A', hasAbs: false, dayOfWeek: 2, sortOrder: 2 },
  { id: 'legs_a', name: 'Legs A', hasAbs: true, dayOfWeek: 3, sortOrder: 3 },
  { id: 'push_b', name: 'Push B', hasAbs: false, dayOfWeek: 4, sortOrder: 4 },
  { id: 'pull_b', name: 'Pull B', hasAbs: true, dayOfWeek: 5, sortOrder: 5 },
  { id: 'legs_b', name: 'Legs B', hasAbs: true, dayOfWeek: 6, sortOrder: 6 },
];

const CRUNCH_NOTE = 'Add reps first, then weight';
const HANGING_NOTE = 'Controlled reps, no swinging';
const slot = (exerciseId, sets, repMin, repMax, restSeconds, notes = null) => ({ exerciseId, sets, repMin, repMax, restSeconds, notes });

const plan = {
  // Monday: chest focus, plus abs.
  push_a: [
    slot('bench_press', 3, 6, 10, 150),
    slot('incline_db_press', 3, 8, 12, 120),
    slot('cable_machine_fly', 2, 12, 15, 90),
    slot('db_shoulder_press', 3, 8, 12, 120),
    slot('lateral_raise', 3, 12, 20, 90),
    slot('rope_triceps_pushdown', 3, 10, 15, 90),
    slot('overhead_cable_triceps_extension', 2, 10, 15, 90),
    slot('cable_crunch', 3, 12, 15, 60, CRUNCH_NOTE),
    slot('hanging_leg_raise', 3, 10, 15, 60, HANGING_NOTE),
  ],
  // Tuesday: back thickness.
  pull_a: [
    slot('barbell_row', 3, 6, 10, 150),
    slot('pullup_lat_pulldown', 3, 8, 12, 120),
    slot('seated_cable_row', 3, 8, 12, 120),
    slot('face_pull_rear_delt_fly', 3, 12, 20, 90),
    slot('ez_bar_curl', 3, 8, 12, 90),
    slot('hammer_curl', 2, 10, 15, 90),
  ],
  // Wednesday: quads and hamstrings, plus abs.
  legs_a: [
    slot('romanian_deadlift', 3, 6, 10, 150),
    slot('squat_hack_squat', 3, 6, 10, 150, 'Use the same one each time so sessions compare'),
    slot('leg_press', 3, 10, 15, 120),
    slot('leg_curl', 3, 10, 15, 90),
    slot('calf_raise', 4, 10, 15, 90),
    slot('hanging_leg_raise', 3, 10, 15, 60, HANGING_NOTE),
    slot('decline_crunch', 3, 12, 20, 60),
    slot('reverse_crunch', 3, 12, 15, 60),
  ],
  // Thursday: upper chest and shoulders.
  push_b: [
    slot('incline_bench_press', 3, 6, 10, 150),
    slot('flat_db_press', 3, 8, 12, 120),
    slot('cable_fly', 2, 12, 15, 90),
    slot('machine_shoulder_press', 2, 8, 12, 120),
    slot('cable_lateral_raise', 3, 12, 20, 90),
    slot('triceps_pushdown', 3, 10, 15, 90),
    slot('overhead_triceps_extension', 2, 10, 15, 90),
  ],
  // Friday: lats and back, plus abs.
  pull_b: [
    slot('t_bar_row', 3, 8, 12, 150),
    slot('chin_up', 3, 6, 12, 150),
    slot('chest_supported_row', 2, 8, 12, 120),
    slot('straight_arm_pulldown', 2, 12, 15, 90),
    slot('rear_delt_fly', 3, 12, 20, 90),
    slot('incline_db_curl', 3, 10, 15, 90),
    slot('preacher_curl', 2, 10, 15, 90),
    slot('cable_crunch', 3, 12, 15, 60, CRUNCH_NOTE),
    slot('hanging_knee_leg_raise', 3, 12, 15, 60, HANGING_NOTE),
  ],
  // Saturday: posterior chain and quads.
  legs_b: [
    slot('deadlift', 3, 4, 6, 180, '1–2 reps in reserve; never take deadlifts to failure'),
    slot('bulgarian_split_squat', 3, 8, 12, 120, 'Reps per leg'),
    slot('leg_extension', 3, 10, 15, 90),
    slot('seated_leg_curl', 3, 10, 15, 90),
    slot('seated_calf_raise', 4, 12, 20, 90),
    slot('cable_crunch', 3, 12, 20, 60, CRUNCH_NOTE),
  ],
};

/** Template slots without ids; the store numbers them. */
export const templateExercises = Object.entries(plan).flatMap(([templateId, slots]) =>
  slots.map((s, position) => ({ templateId, position, ...s })));

/** Macros per single piece (egg, roti, scoop...). */
const piece = (name, unit, kcal, protein, carbs, fat, fiber, category) =>
  ({ name, unit, baseAmount: 1, defaultAmount: 1, kcal, protein, carbs, fat, fiber, category, isCustom: false, useCount: 0, lastUsedAt: 0 });

/** Macros per 100 g or 100 ml. */
const per100 = (name, unit, defaultAmount, kcal, protein, carbs, fat, fiber, category) =>
  ({ name, unit, baseAmount: 100, defaultAmount, kcal, protein, carbs, fat, fiber, category, isCustom: false, useCount: 0, lastUsedAt: 0 });

const PROTEIN = 'Protein';
const CARBS = 'Carbs';
const DAIRY = 'Dairy';
const FRUIT_VEG = 'Fruit & veg';
const EXTRAS = 'Fats & extras';

export const foodPresets = [
  piece('Whey protein', 'scoop', 120, 24, 3, 1.5, 0, PROTEIN),
  piece('Whole egg', 'egg', 72, 6.3, 0.4, 4.8, 0, PROTEIN),
  piece('Egg white', 'egg white', 17, 3.6, 0.2, 0.1, 0, PROTEIN),
  per100('Chicken breast (cooked)', 'g', 150, 165, 31, 0, 3.6, 0, PROTEIN),
  per100('Fish (cooked)', 'g', 150, 128, 26, 0, 2.7, 0, PROTEIN),
  per100('Tofu (firm)', 'g', 100, 144, 17.3, 2.8, 8.7, 2.3, PROTEIN),
  per100('Soy chunks (dry)', 'g', 50, 345, 52, 33, 0.5, 13, PROTEIN),
  per100('Soybeans (cooked)', 'g', 100, 172, 18.2, 8.4, 9, 6, PROTEIN),
  piece('Dal', 'bowl', 165, 9, 23, 4, 6, PROTEIN),
  per100('Paneer', 'g', 50, 290, 18.5, 3, 22.5, 0, DAIRY),
  per100('Curd / dahi', 'g', 150, 60, 3.5, 4.7, 3.3, 0, DAIRY),
  per100('Greek yogurt', 'g', 150, 73, 10, 4, 2, 0, DAIRY),
  per100('Milk (full fat)', 'ml', 250, 62, 3.2, 4.8, 3.3, 0, DAIRY),
  per100('Milk (low fat)', 'ml', 250, 46, 3.3, 4.9, 1.5, 0, DAIRY),
  per100('High-protein milk', 'ml', 250, 70, 6.7, 3.6, 3.2, 0, DAIRY),
  piece('Roti (plain)', 'roti', 120, 4, 19, 3, 2.5, CARBS),
  piece('Roti with ghee', 'roti', 150, 4, 19, 7, 2.5, CARBS),
  piece('Aloo paratha', 'paratha', 225, 4.5, 27, 11, 3, CARBS),
  piece('Paneer paratha', 'paratha', 280, 10, 30, 13, 3, CARBS),
  piece('Gobi paratha', 'paratha', 200, 5, 28, 8, 3.5, CARBS),
  per100('Rice (cooked)', 'g', 150, 130, 2.7, 28, 0.3, 0.4, CARBS),
  per100('Oats (dry)', 'g', 40, 380, 13, 68, 6.5, 10, CARBS),
  per100('Potato (boiled)', 'g', 150, 87, 1.9, 20, 0.1, 1.8, CARBS),
  piece('Brown bread', 'slice', 75, 3, 13, 1, 2, CARBS),
  piece('Banana', 'medium', 105, 1.3, 27, 0.4, 3.1, FRUIT_VEG),
  piece('Apple', 'medium', 95, 0.5, 25, 0.3, 4.4, FRUIT_VEG),
  per100('Mixed fruit', 'g', 150, 60, 0.8, 15, 0.2, 2, FRUIT_VEG),
  piece('Vegetable sabzi', 'bowl', 90, 3, 12, 3.5, 3.5, FRUIT_VEG),
  piece('Mixed nuts', 'handful (30 g)', 180, 5, 6, 15, 2, EXTRAS),
  piece('Peanut butter', 'tbsp', 95, 3.5, 3.5, 8, 1, EXTRAS),
  piece('Chia / flax seeds', 'tbsp', 55, 2, 4, 3.5, 3.5, EXTRAS),
  piece('Ghee / oil', 'tsp', 45, 0, 0, 5, 0, EXTRAS),
  piece('Sugar', 'tsp', 16, 0, 4, 0, 0, EXTRAS),
];

/** One-tap meals from the README diet plan; items reference preset names. A full day lands near 2,110 kcal and 165 g protein. */
export const mealTemplates = [
  { name: 'Eggs, roti, curd & fruit', meal: 'BREAKFAST', items: [['Whole egg', 3], ['Roti (plain)', 1], ['Curd / dahi', 100], ['Banana', 1]] },
  { name: 'Oats, milk, whey & banana', meal: 'BREAKFAST', items: [['Oats (dry)', 40], ['Milk (low fat)', 200], ['Whey protein', 1], ['Banana', 1]] },
  { name: 'Chicken, rice, dal & veg', meal: 'LUNCH', items: [['Chicken breast (cooked)', 120], ['Rice (cooked)', 120], ['Dal', 1], ['Vegetable sabzi', 1]] },
  { name: 'Tofu, rice, dal & veg', meal: 'LUNCH', items: [['Tofu (firm)', 150], ['Rice (cooked)', 120], ['Dal', 1], ['Vegetable sabzi', 1]] },
  { name: 'Banana & brown bread', meal: 'PRE_WORKOUT', items: [['Banana', 1], ['Brown bread', 1]] },
  { name: 'Whey & milk', meal: 'POST_WORKOUT', items: [['Whey protein', 1], ['Milk (low fat)', 250]] },
  { name: 'Chicken, 2 roti, veg & curd', meal: 'DINNER', items: [['Chicken breast (cooked)', 120], ['Roti (plain)', 2], ['Vegetable sabzi', 1], ['Curd / dahi', 100]] },
  { name: 'Soy chunks, 2 roti, veg & curd', meal: 'DINNER', items: [['Soy chunks (dry)', 50], ['Roti (plain)', 2], ['Vegetable sabzi', 1], ['Curd / dahi', 100]] },
];
