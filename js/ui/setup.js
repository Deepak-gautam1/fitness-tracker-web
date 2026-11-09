// First run: pick a plan and enter your own numbers, or restore a backup (from this app or Android).

import { useState } from '../../vendor/preact-htm.js';
import * as repo from '../repo.js';
import * as backup from '../backup.js';
import { Fmt, PLANS } from '../domain.js';
import { html, Icon, Card, Field, NumberInput, Chips, ConfirmDialog, pickFile } from './kit.js';
import { InstallBanner, isIos, isStandalone } from './settings.js';

export function SetupScreen({ onDone }) {
  const [plan, setPlan] = useState(null);
  const [sex, setSex] = useState(null);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [target, setTarget] = useState('');
  const [restoring, setRestoring] = useState(null);
  const [error, setError] = useState(null);
  // In Safari on iPhone, data stays in Safari, not in the Home Screen app: install first.
  const [anyway, setAnyway] = useState(false);
  const mustInstall = isIos() && !isStandalone() && !anyway;

  const h = Fmt.parseDecimal(height);
  const w = Fmt.parseDecimal(weight);
  const t = Fmt.parseDecimal(target);
  const errors = {
    height: height.trim() && (h == null || h < 120 || h > 230) ? 'Enter 120–230 cm' : null,
    weight: weight.trim() && (w == null || w < 30 || w > 250) ? 'Enter 30–250 kg' : null,
    target: target.trim() && (t == null || t < 30 || t > 250) ? 'Enter 30–250 kg'
      : t != null && w != null && t >= w ? 'For a fat-loss plan, aim below your current weight' : null,
  };
  const ready = plan && sex && h != null && w != null && t != null && !errors.height && !errors.weight && !errors.target;

  const start = () => {
    if (!ready) return;
    repo.completeSetup({ planType: plan, sex, heightCm: h, startWeightKg: w, targetWeightKg: t });
    onDone();
  };
  const chooseBackup = async () => {
    setError(null);
    try {
      const file = await pickFile('.json,application/json,text/plain');
      if (file) setRestoring(backup.parseBackup(await file.text()));
    } catch (e) {
      setError(e.message ?? String(e));
    }
  };

  return html`
    <header class="topbar"><h1>Fitness Tracker</h1></header>
    <main class="content no-nav">
      ${mustInstall ? html`
        <${Card}>
          <div class="card-title">First, add the app to your Home Screen</div>
          <ol class="coach-list mt8">
            <li>Tap <b>Share</b> at the bottom of Safari (the square with an arrow).</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Close Safari and open <b>Fitness</b> from your Home Screen. Set up there.</li>
          </ol>
          <p class="small mt8">The Home Screen app keeps its own data, separate from Safari, and works offline. Anything you set up in this Safari tab won't carry over.</p>
          <button class="btn text mt8" onClick=${() => setAnyway(true)}>Set up here in Safari anyway</button>
        <//>` : html`
        <${InstallBanner} />
        <div>
          <div class="big">Set up your plan</div>
          <p class="small mt4">Everything stays on this phone. You can change any number later in Settings.</p>
        </div>

        <${Card}>
          <div class="card-title">Which plan?</div>
          <div class="stack s8 mt10">
            ${Object.entries(PLANS).map(([id, p]) => html`<button class=${`chip ${plan === id ? 'on' : ''}`} style="text-align:left;padding:12px 14px"
              onClick=${() => setPlan(id)}>
              <div class="row"><b class="grow">${p.label}</b>${plan === id && html`<${Icon} name="check" size=${18} />`}</div>
              <div class="tiny mt4">${p.description}</div>
            </button>`)}
          </div>
        <//>

        <${Card}>
          <div class="card-title">About you</div>
          <div class="stack mt10">
            <div>
              <div class="small" style="margin-bottom:6px">Sex (for the body-fat estimate)</div>
              <${Chips} options=${[['FEMALE', 'Female'], ['MALE', 'Male']]} value=${sex} onChange=${setSex} />
            </div>
            <${Field} label="Height" suffix="cm" error=${errors.height}><${NumberInput} value=${height} onInput=${setHeight} /><//>
            <div class="split">
              <${Field} label="Current weight" suffix="kg" error=${errors.weight}><${NumberInput} value=${weight} onInput=${setWeight} /><//>
              <${Field} label="Target weight" suffix="kg" error=${errors.target}><${NumberInput} value=${target} onInput=${setTarget} onEnter=${start} /><//>
            </div>
          </div>
        <//>

        ${plan && html`<p class="small">
          ${plan === 'WALKING'
            ? 'Starts at 1,450 kcal, 100 g protein, 150 g carbs and 45 g fat a day, three meals, and 5,000 steps a day in week 1, adding 1,000 a week up to 8,000–10,000.'
            : 'Starts at 2,100 kcal, 150 g protein, 230 g carbs and 65 g fat a day, the six-day push/pull/legs plan and 8,000–10,000 steps a day.'}
          ${w != null && t != null && t < w && ` Losing ${Fmt.num(w - t)} kg at 0.3–0.5 kg a week takes about ${Math.ceil((w - t) / 0.5)}–${Math.ceil((w - t) / 0.3)} weeks.`}
        </p>`}

        <button class="btn block" disabled=${!ready} onClick=${start}>Start</button>

        <${Card}>
          <div class="card-title">Moving from another phone?</div>
          <p class="small mt4">Restore a backup made with <i>Settings › Back up to a file</i>, in this app or the Android app.</p>
          <button class="btn outline mt10" onClick=${chooseBackup}><${Icon} name="upload" size=${18} /> Restore from a backup</button>
          ${error && html`<p class="error-text mt8">${error}</p>`}
        <//>`}
    </main>
    ${restoring && html`<${ConfirmDialog} title="Restore this backup?" confirm="Restore"
      text=${`It has ${Fmt.plural(restoring.weights.length, 'weigh-in')}, ${Fmt.plural(restoring.food.length, 'food')} and ${Fmt.plural(restoring.sets.length, 'set')}, plus its targets and workout plan.`}
      onDismiss=${() => setRestoring(null)}
      onConfirm=${async () => { const b = restoring; setRestoring(null); await backup.restore(b); onDone(); }} />`}
  `;
}
