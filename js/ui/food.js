// Food: the day's meals, totals and water, plan meals in one tap, adding foods (with an optional
// ChatGPT estimate) and the My foods list (NutritionScreen.kt, AddFoodSheet.kt, FoodLibraryScreen.kt).

import { useState, useEffect } from '../../vendor/preact-htm.js';
import * as repo from '../repo.js';
import * as ai from '../ai.js';
import { Fmt, FoodCategories, Meal, Meters, totalsOf } from '../domain.js';
import { app, push, selectDay, snack } from './state.js';
import {
  html, Icon, TopBar, BackBar, Card, CardHeader, GoalMeter, MeterBar, DateSelector, Dialog, Sheet, ConfirmDialog,
  Field, NumberInput, TextInput, Chips, EmptyNote, SectionLabel,
} from './kit.js';

const amountLabel = (quantity, unit) => (unit === 'g' || unit === 'ml' ? `${Fmt.num(quantity)} ${unit}` : `${Fmt.num(quantity)} × ${unit}`);
const macroLine = (t) => `${Fmt.int(t.kcal)} kcal · P ${Fmt.num(t.protein)} g · C ${Fmt.num(t.carbs)} g · F ${Fmt.num(t.fat)} g`;
const perLabel = (p) => (p.baseAmount === 1 ? `per ${p.unit}` : `per ${Fmt.num(p.baseAmount)} ${p.unit}`);
const kcalFromMacros = (p, c, f) => p * 4 + c * 4 + f * 9;

export function FoodScreen() {
  const day = app.day;
  const s = repo.settings();
  const entries = repo.foodEntries(day);
  const t = totalsOf(entries);
  const log = repo.dailyLog(day);
  const yesterdayCount = repo.foodEntries(day - 1).length;
  const [adding, setAdding] = useState(null); // meal name
  const [editing, setEditing] = useState(null);
  const [idea, setIdea] = useState(null);
  const left = s.dailyCalories - t.kcal;
  const liters = log.waterMl / 1000;
  const waterSpec = Meters.minimum(liters, s.waterLitersMin, `${Fmt.num(s.waterLitersMin - liters, 2)} L to go`);
  const water = (ml) => {
    repo.addWater(day, ml);
    if (ml > 0) snack(`Added ${ml} ml of water`, 'Undo', () => repo.addWater(day, -ml));
  };

  return html`
    <${TopBar} title="Food" actions=${html`<button class="btn text" onClick=${() => push({ name: 'foods' })}>My foods</button>`} />
    <main class="content">
      <${DateSelector} day=${day} onChange=${selectDay} />

      <${Card}>
        <div class="row bottom"><span class="huge">${Fmt.int(Math.abs(left))}</span><span class="ink2" style="padding-bottom:5px">${left >= 0 ? 'kcal left' : 'kcal over'}</span>
          <span class="grow"></span>
          <button class="btn" onClick=${() => setAdding(Meal.forHour(new Date().getHours()))}><${Icon} name="plus" size=${18} />Add food</button>
        </div>
        <div class="stack mt12">
          <${GoalMeter} label="Calories" value=${Fmt.int(t.kcal)} target=${`${Fmt.int(s.dailyCalories)} kcal`} spec=${Meters.budget(t.kcal, s.dailyCalories, 'kcal')} />
          <${GoalMeter} label="Protein" value=${Fmt.int(t.protein)} target=${`${s.proteinGrams} g`}
            spec=${Meters.minimum(t.protein, s.proteinGrams, `${Fmt.int(s.proteinGrams - t.protein)} g to go`)} />
          <${GoalMeter} label="Carbs" value=${Fmt.int(t.carbs)} target=${`${s.carbsGrams} g`} spec=${Meters.range(t.carbs, s.carbsGrams, 'g')} />
          <${GoalMeter} label="Fat" value=${Fmt.int(t.fat)} target=${`${s.fatGrams} g`} spec=${Meters.range(t.fat, s.fatGrams, 'g')} />
          <${GoalMeter} label="Fiber" value=${Fmt.int(t.fiber)} target=${`${s.fiberGramsMin}–${s.fiberGramsMax} g`}
            spec=${Meters.minimum(t.fiber, s.fiberGramsMin, `${Fmt.int(s.fiberGramsMin - t.fiber)} g to go`)} />
        </div>
      <//>

      <${Card}>
        <${CardHeader} title="Water" icon="water" subtitle=${`Target ${Fmt.num(s.waterLitersMin)}–${Fmt.num(s.waterLitersMax)} L`}
          trailing=${html`<span class="card-title">${Fmt.num(liters, 2)} L</span>`} />
        <div class="mt10"><${MeterBar} fraction=${waterSpec.fraction} tone=${waterSpec.tone} /></div>
        <div class="row mt10 wrap">
          <button class="btn outline small" disabled=${log.waterMl <= 0} onClick=${() => water(-250)}>−250</button>
          <button class="btn tonal small grow" onClick=${() => water(250)}>+250 ml</button>
          <button class="btn tonal small grow" onClick=${() => water(500)}>+500 ml</button>
          <button class="btn tonal small grow" onClick=${() => water(1000)}>+1 L</button>
        </div>
      <//>

      ${entries.length === 0 && yesterdayCount > 0 && html`<${Card}>
        <${CardHeader} title="Same as yesterday?" subtitle=${`Copy ${yesterdayCount} items, then adjust portions`} />
        <div class="mt10"><button class="btn tonal" onClick=${() => { const n = repo.copyFood(day - 1, day); snack(`Copied ${Fmt.plural(n, 'item')}`); }}>Copy yesterday's food</button></div>
      <//>`}

      ${Meal.entries.map((meal) => {
        const items = entries.filter((e) => Meal.of(e.meal).name === meal.name);
        const mt = totalsOf(items);
        const ideas = repo.mealTemplates().filter((m) => m.meal === meal.name);
        return html`<${Card}>
          <${CardHeader} title=${meal.label}
            subtitle=${items.length ? `${Fmt.int(mt.kcal)} kcal · P ${Fmt.int(mt.protein)} g` : 'Nothing logged'}
            trailing=${html`<button class="btn text" onClick=${() => setAdding(meal.name)}>Add</button>`} />
          ${items.length > 0 && html`<div class="mt8">${items.map((e) => html`<div class="meal-entry" onClick=${() => setEditing(e)}>
            <div class="grow"><div class="ellipsis">${e.name}</div>
              <div class="tiny">${amountLabel(e.quantity, e.unit)} · P ${Fmt.num(e.protein)} · C ${Fmt.num(e.carbs)} · F ${Fmt.num(e.fat)}</div></div>
            <span class="kcal">${Fmt.int(e.kcal)} kcal</span>
          </div>`)}</div>`}
          ${items.length === 0 && ideas.length > 0 && html`<div class="mt10 stack s6">
            <div class="tiny">From your plan, one tap adds it:</div>
            ${ideas.map((m) => html`<button class="idea" onClick=${() => setIdea(m)}><${Icon} name="plus" size=${16} /><span class="grow">${m.name}</span></button>`)}
          </div>`}
        <//>`;
      })}

      <${Card}>
        <${CardHeader} title="How to hit your targets" icon="info" />
        <div class="stack s6 mt10 small">
          <p>1. Hit protein (${s.proteinGrams} g).</p>
          <p>2. Stay close to ${Fmt.kcal(s.dailyCalories)}.</p>
          <p>3. Get ${s.fiberGramsMin}–${s.fiberGramsMax} g fiber and plenty of fruit and vegetables.</p>
          <p>4. Keep carbs and fat reasonably close.</p>
          <p>5. Stay hydrated.</p>
          <p class="mt6">Rice and roti are allowed. Portion control matters more than cutting them out, and macros don't need to be exact every day.</p>
          <p>The plan meal ideas in each section add up to about 2,100 kcal and 165 g protein for a full day.</p>
        </div>
      <//>
    </main>

    ${adding && html`<${AddFoodSheet} day=${day} initialMeal=${adding} onClose=${() => setAdding(null)} />`}
    ${editing && html`<${EntryDialog} entry=${editing} onDismiss=${() => setEditing(null)} />`}
    ${idea && html`<${Dialog} title=${`${Meal.of(idea.meal).label}: ${idea.name}`} onClose=${() => setIdea(null)} actions=${html`
      <button class="btn text" onClick=${() => setIdea(null)}>Cancel</button>
      <button class="btn text" onClick=${() => { repo.addMealTemplate(day, idea); snack(`Added ${idea.name} to ${Meal.of(idea.meal).label}`); setIdea(null); }}>Add to ${Meal.of(idea.meal).label}</button>`}>
      <div class="stack s6">${idea.items.map(([name, amount]) => {
        const p = repo.presets().find((x) => x.name === name);
        return html`<p>• ${name}, ${amountLabel(amount, p?.unit ?? '')}</p>`;
      })}</div>
    <//>`}
  `;
}

/** Change a logged item's amount or meal, or delete it (with undo). */
function EntryDialog({ entry, onDismiss }) {
  const [amount, setAmount] = useState(Fmt.num(entry.quantity, 2));
  const [meal, setMeal] = useState(Meal.of(entry.meal).name);
  const value = Fmt.parseDecimal(amount);
  const valid = value != null && value > 0 && value <= 10000;
  const f = valid ? value / entry.quantity : 1;
  const save = () => {
    if (!valid) return;
    if (value !== entry.quantity) repo.updateFoodAmount(entry, value);
    if (meal !== entry.meal) repo.moveFood(repo.foodEntries(entry.epochDay).find((e) => e.id === entry.id) ?? entry, meal);
    onDismiss();
  };
  return html`<${Dialog} title=${entry.name} onClose=${onDismiss} actions=${html`
    <span class="left"><button class="btn danger" onClick=${() => {
      repo.deleteFood(entry.id);
      snack(`Removed ${entry.name}`, 'Undo', () => repo.restoreFood(entry));
      onDismiss();
    }}>Delete</button></span>
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" disabled=${!valid} onClick=${save}>Save</button>`}>
    <${Field} label="Amount" suffix=${entry.unit}><${NumberInput} value=${amount} onInput=${setAmount} onEnter=${save} invalid=${!valid} /><//>
    <p class="small">${macroLine({ kcal: entry.kcal * f, protein: entry.protein * f, carbs: entry.carbs * f, fat: entry.fat * f })}</p>
    <${Chips} options=${Meal.entries.map((m) => [m.name, m.label])} value=${meal} onChange=${setMeal} />
  <//>`;
}

// ------------------------------------------------------------------ add food

function AddFoodSheet({ day, initialMeal, onClose }) {
  const [meal, setMeal] = useState(initialMeal);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [custom, setCustom] = useState(null); // { ask: string|null }
  const presets = repo.presets();
  const q = query.trim().toLowerCase();
  const matches = q ? presets.filter((p) => p.name.toLowerCase().includes(q)) : presets;
  const mealLabel = Meal.of(meal).label;
  const hasKey = ai.hasKey();

  let body;
  if (selected) {
    body = html`<${AmountPicker} preset=${selected} mealLabel=${mealLabel} onBack=${() => setSelected(null)}
      onAdd=${(amount) => { repo.addFood(day, meal, selected, amount); snack(`Added ${selected.name} to ${mealLabel}`); setSelected(null); setQuery(''); }} />`;
  } else if (custom) {
    body = html`<${CustomFood} ask=${custom.ask} mealLabel=${mealLabel} onBack=${() => setCustom(null)}
      onAdd=${(food, save) => { repo.addCustomFood(day, meal, food, save); snack(`Added ${food.name} to ${mealLabel}`); setCustom(null); setQuery(''); }} />`;
  } else {
    body = html`
      <${Field}><${TextInput} value=${query} onInput=${setQuery} placeholder="Search foods" /><//>
      <button class="idea" onClick=${() => setCustom({ ask: null })}><${Icon} name=${hasKey ? 'coach' : 'edit'} size=${18} />
        <span class="grow">${hasKey ? 'Custom food, or ask ChatGPT' : 'Custom food or quick macros'}</span><${Icon} name="right" size=${18} /></button>
      <div>
        ${matches.map((p) => html`<button class="food-result" onClick=${() => setSelected(p)}>
          <span class="grow"><div>${p.name}</div><div class="tiny">${perLabel(p)} · ${Fmt.int(p.kcal)} kcal · P ${Fmt.num(p.protein)} g</div></span>
          <span class="ink2"><${Icon} name="plus" size=${20} /></span>
        </button>`)}
        ${matches.length === 0 && html`<div class="stack s8 mt8">
          <p class="small">No match. Use “Custom food” to add it once, or save it to My foods.</p>
          ${hasKey && html`<button class="btn tonal" onClick=${() => setCustom({ ask: query.trim() })}>Ask ChatGPT about “${query.trim()}”</button>`}
        </div>`}
      </div>`;
  }
  return html`<${Sheet} title="Add food" onClose=${onClose} actions=${html`<button class="btn text" onClick=${onClose}>Done</button>`}>
    <${Chips} options=${Meal.entries.map((m) => [m.name, m.label])} value=${meal} onChange=${setMeal} />
    ${body}
  <//>`;
}

function AmountPicker({ preset, mealLabel, onBack, onAdd }) {
  const [amount, setAmount] = useState(Fmt.num(preset.defaultAmount, 2));
  const value = Fmt.parseDecimal(amount);
  const valid = value != null && value > 0 && value <= 10000;
  const big = preset.unit === 'g' || preset.unit === 'ml';
  const step = big ? (preset.defaultAmount >= 100 ? 25 : 10) : 0.5;
  const f = valid ? value / preset.baseAmount : 0;
  const t = { kcal: preset.kcal * f, protein: preset.protein * f, carbs: preset.carbs * f, fat: preset.fat * f, fiber: preset.fiber * f };
  const bump = (d) => setAmount(Fmt.num(Math.max(step, (value ?? 0) + d), 2));
  return html`<${Card}>
    <div class="row"><button class="icon-btn ink" aria-label="Back" onClick=${onBack}><${Icon} name="back" /></button><span class="card-title grow">${preset.name}</span></div>
    <p class="small mt4">${perLabel(preset)}: ${macroLine(preset)}</p>
    <div class="row mt12">
      <button class="btn outline" onClick=${() => bump(-step)} aria-label="Less"><${Icon} name="minus" size=${18} /></button>
      <div class="grow"><${Field} label="Quantity" suffix=${preset.unit}><${NumberInput} value=${amount} onInput=${setAmount} invalid=${!valid} onEnter=${() => valid && onAdd(value)} /><//></div>
      <button class="btn outline" onClick=${() => bump(step)} aria-label="More"><${Icon} name="plus" size=${18} /></button>
    </div>
    <p class="mt10"><b>${Fmt.int(t.kcal)} kcal</b> <span class="small">· P ${Fmt.num(t.protein)} g · C ${Fmt.num(t.carbs)} g · F ${Fmt.num(t.fat)} g · Fiber ${Fmt.num(t.fiber)} g</span></p>
    <button class="btn block mt12" disabled=${!valid} onClick=${() => onAdd(value)}>Add to ${mealLabel}</button>
  <//>`;
}

/** Estimate with ChatGPT: fills the macro fields from a description. */
function EstimateBox({ initial = '', per = null, label, description, onResult }) {
  const [own, setText] = useState(initial);
  // With label null the box has no field of its own and estimates [description] (the food's name).
  const text = label === null ? description ?? '' : own;
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const run = async (description = text) => {
    if (!description.trim() || working) return;
    if (!navigator.onLine) {
      setError("You're offline. Connect to the internet to ask ChatGPT.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const r = await ai.estimateFood(description, per);
      setResult(r);
      onResult(r);
    } catch (e) {
      setError(ai.userMessage(e));
    }
    setWorking(false);
  };
  // Asked straight from a search with no match.
  useEffect(() => { if (initial) run(initial); }, []);
  if (!ai.hasKey()) {
    return html`<p class="small">Tip: add your OpenAI API key in Settings › ChatGPT and it can fill in the calories and macros from the name.</p>`;
  }
  return html`<div class="stack s8">
    ${label !== null && html`<${Field} label=${label ?? 'Food and amount (e.g. 2 chapati with dal)'}><${TextInput} value=${text} onInput=${setText} onEnter=${() => run()} /><//>`}
    <button class="btn tonal" disabled=${working || !text.trim()} onClick=${() => run()}>
      ${working ? html`<span class="spinner"></span> Asking ChatGPT…` : html`<${Icon} name="coach" size=${18} /> Estimate with ChatGPT`}
    </button>
    ${error && html`<p class="error-text">${error}</p>`}
    ${result && !error && html`<p class="small">ChatGPT's estimate${result.portion ? ` for ${result.portion}` : ''} (${result.confidence} confidence).${result.note ? ` ${result.note}` : ''} Check it before saving.</p>`}
  </div>`;
}

function CustomFood({ ask, mealLabel, onBack, onAdd }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [save, setSave] = useState(false);
  const n = (v) => (v.trim() === '' ? 0 : Fmt.parseDecimal(v));
  const p = n(protein);
  const c = n(carbs);
  const f = n(fat);
  const fi = n(fiber);
  const estimated = p != null && c != null && f != null ? kcalFromMacros(p, c, f) : null;
  const k = kcal.trim() === '' ? estimated : Fmt.parseDecimal(kcal);
  const valid = name.trim() && k != null && k >= 0 && k <= 10000 && [p, c, f, fi].every((x) => x != null && x >= 0 && x <= 2000);
  const fill = (r) => {
    setName(r.name || name);
    setKcal(String(r.kcal));
    setProtein(Fmt.num(r.protein));
    setCarbs(Fmt.num(r.carbs));
    setFat(Fmt.num(r.fat));
    setFiber(Fmt.num(r.fiber));
  };
  return html`<${Card}>
    <div class="row"><button class="icon-btn ink" aria-label="Back" onClick=${onBack}><${Icon} name="back" /></button><span class="card-title grow">Custom food</span></div>
    <div class="stack mt8">
      <${EstimateBox} initial=${ask ?? ''} onResult=${fill} />
      <${Field} label="Name (e.g. Chicken biryani)"><${TextInput} value=${name} onInput=${setName} /><//>
      <${Field} label="Calories" suffix="kcal" hint=${kcal.trim() === '' && estimated ? `Leave empty to use ${Fmt.int(estimated)} kcal from the macros` : null}>
        <${NumberInput} value=${kcal} onInput=${setKcal} placeholder=${estimated ? Fmt.int(estimated) : ''} /><//>
      <div class="split">
        <${Field} label="Protein" suffix="g"><${NumberInput} value=${protein} onInput=${setProtein} /><//>
        <${Field} label="Carbs" suffix="g"><${NumberInput} value=${carbs} onInput=${setCarbs} /><//>
        <${Field} label="Fat" suffix="g"><${NumberInput} value=${fat} onInput=${setFat} /><//>
        <${Field} label="Fiber" suffix="g"><${NumberInput} value=${fiber} onInput=${setFiber} /><//>
      </div>
      <label class="row"><input type="checkbox" checked=${save} onChange=${(e) => setSave(e.target.checked)} style="width:20px;height:20px" /><span>Save to My foods for next time</span></label>
      <button class="btn block" disabled=${!valid} onClick=${() => onAdd({ name: name.trim(), kcal: k, protein: p, carbs: c, fat: f, fiber: fi }, save)}>Add to ${mealLabel}</button>
    </div>
  <//>`;
}

// ------------------------------------------------------------------ My foods

export function FoodLibraryScreen() {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // preset or {} for new
  const q = query.trim().toLowerCase();
  const presets = repo.presets().filter((p) => !q || p.name.toLowerCase().includes(q));
  const categories = FoodCategories.all.filter((c) => presets.some((p) => p.category === c));
  const others = presets.filter((p) => !FoodCategories.all.includes(p.category));
  const row = (p) => html`<button class="list-row" onClick=${() => setEditing(p)}>
    <span class="main"><div class="title">${p.name}</div>
      <div class="detail">${p.baseAmount >= 100 ? `per ${Fmt.num(p.baseAmount)} ${p.unit}` : `per ${p.unit}`} · ${Fmt.int(p.kcal)} kcal · P ${Fmt.num(p.protein)} · C ${Fmt.num(p.carbs)} · F ${Fmt.num(p.fat)} · Fiber ${Fmt.num(p.fiber)}</div></span>
  </button>`;
  return html`
    <${BackBar} title="My foods" actions=${html`<button class="btn text" onClick=${() => setEditing({})}>New food</button>`} />
    <main class="content no-nav">
      <${Field}><${TextInput} value=${query} onInput=${setQuery} placeholder="Search" /><//>
      <p class="small">Values are typical estimates. Edit them to match the brands and portions you actually use.</p>
      ${categories.map((c) => html`<${Card} class="flush">
        <div class="pad"><${SectionLabel}>${c}<//></div>
        <div class="mt6">${presets.filter((p) => p.category === c).map(row)}</div>
      <//>`)}
      ${others.length > 0 && html`<${Card} class="flush"><div class="pad"><${SectionLabel}>Other<//></div><div class="mt6">${others.map(row)}</div><//>`}
      ${presets.length === 0 && html`<${EmptyNote}>No foods match.<//>`}
    </main>
    ${editing && html`<${PresetDialog} initial=${editing.id ? editing : null} onDismiss=${() => setEditing(null)} />`}
  `;
}

function PresetDialog({ initial, onDismiss }) {
  const p = initial;
  const [name, setName] = useState(p?.name ?? '');
  const [mode, setMode] = useState(p ? (p.baseAmount >= 100 && (p.unit === 'g' || p.unit === 'ml') ? p.unit : 'piece') : 'g');
  const [unit, setUnit] = useState(p && !(p.unit === 'g' || p.unit === 'ml') ? p.unit : 'serving');
  const [usual, setUsual] = useState(p ? Fmt.num(p.defaultAmount, 2) : '100');
  const [kcal, setKcal] = useState(p ? Fmt.num(p.kcal) : '');
  const [protein, setProtein] = useState(p ? Fmt.num(p.protein) : '');
  const [carbs, setCarbs] = useState(p ? Fmt.num(p.carbs) : '');
  const [fat, setFat] = useState(p ? Fmt.num(p.fat) : '');
  const [fiber, setFiber] = useState(p ? Fmt.num(p.fiber) : '0');
  const [category, setCategory] = useState(p?.category ?? FoodCategories.CUSTOM);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const num = (v) => Fmt.parseDecimal(v);
  const values = [kcal, protein, carbs, fat, fiber].map(num);
  const usualValue = num(usual);
  const valid = name.trim() && values.every((v) => v != null && v >= 0) && usualValue != null && usualValue > 0 && (mode !== 'piece' || unit.trim());
  const per = mode === 'piece' ? `1 ${unit.trim() || 'serving'}` : `100 ${mode}`;
  const save = () => {
    if (!valid) return;
    const [k, pr, c, f, fi] = values;
    repo.savePreset({
      ...(p ?? { isCustom: true, useCount: 0, lastUsedAt: 0 }),
      name: name.trim(), unit: mode === 'piece' ? unit.trim() : mode, baseAmount: mode === 'piece' ? 1 : 100, defaultAmount: usualValue,
      kcal: k, protein: pr, carbs: c, fat: f, fiber: fi, category,
    });
    onDismiss();
  };
  if (confirmDelete) {
    return html`<${ConfirmDialog} title=${`Delete ${p.name}?`} danger confirm="Delete"
      text="Foods you already logged keep their values. Meal ideas that use this food will skip it."
      onDismiss=${() => setConfirmDelete(false)} onConfirm=${() => { repo.deletePreset(p.id); onDismiss(); }} />`;
  }
  return html`<${Dialog} title=${p ? 'Edit food' : 'New food'} onClose=${onDismiss} actions=${html`
    ${p && html`<span class="left"><button class="btn danger" onClick=${() => setConfirmDelete(true)}>Delete</button></span>`}
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" disabled=${!valid} onClick=${save}>Save</button>`}>
    <${Field} label="Name"><${TextInput} value=${name} onInput=${setName} /><//>
    <div class="small">Macros are per</div>
    <${Chips} options=${[['g', '100 g'], ['ml', '100 ml'], ['piece', 'One piece']]} value=${mode}
      onChange=${(m) => { setMode(m); if (m !== 'piece' && Fmt.parseDecimal(usual) === 1) setUsual('100'); if (m === 'piece' && Fmt.parseDecimal(usual) >= 50) setUsual('1'); }} />
    ${mode === 'piece' && html`<${Field} label="Unit name (egg, bowl, slice...)"><${TextInput} value=${unit} onInput=${setUnit} /><//>`}
    <${EstimateBox} per=${per} label=${null} description=${name} onResult=${(r) => {
      setKcal(String(r.kcal)); setProtein(Fmt.num(r.protein)); setCarbs(Fmt.num(r.carbs)); setFat(Fmt.num(r.fat)); setFiber(Fmt.num(r.fiber));
    }} />
    <${Field} label="Usual amount" suffix=${mode === 'piece' ? unit : mode}><${NumberInput} value=${usual} onInput=${setUsual} /><//>
    <div class="split">
      <${Field} label="Calories" suffix="kcal"><${NumberInput} value=${kcal} onInput=${setKcal} /><//>
      <${Field} label="Protein" suffix="g"><${NumberInput} value=${protein} onInput=${setProtein} /><//>
      <${Field} label="Carbs" suffix="g"><${NumberInput} value=${carbs} onInput=${setCarbs} /><//>
      <${Field} label="Fat" suffix="g"><${NumberInput} value=${fat} onInput=${setFat} /><//>
      <${Field} label="Fiber" suffix="g"><${NumberInput} value=${fiber} onInput=${setFiber} /><//>
    </div>
    <div class="small">Category</div>
    <${Chips} options=${FoodCategories.all.map((c) => [c, c])} value=${category} onChange=${setCategory} />
  <//>`;
}
