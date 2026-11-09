// Shared UI pieces: icons, cards, meters, the week strip, date selector, dialogs and the cardio and
// AI coach cards used on more than one screen (ui/components in the Android app).

import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { Fmt, isoDate, parseIsoDate, CARDIO_TYPES, dayStatusLabel } from '../domain.js';
import * as ai from '../ai.js';
import { app, back, push, snack } from './state.js';

export { html };

// ------------------------------------------------------------------ icons (stroke icons, 24×24)

const ICONS = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  food: '<path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2M17 22V13h-3V8c0-3 1.5-5.5 3-6v20"/>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  left: '<polyline points="15 18 9 12 15 6"/>',
  right: '<polyline points="9 18 15 12 9 6"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  up: '<polyline points="18 15 12 9 6 15"/>',
  arrowUp: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  arrowDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  circle: '<circle cx="12" cy="12" r="9.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><polyline points="7.5 12.5 10.5 15.5 16.5 9.2" stroke="#fff"/>',
  square: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/>',
  checkSquare: '<rect x="3" y="3" width="18" height="18" rx="3.5" fill="currentColor" stroke="none"/><polyline points="7.2 12.3 10.5 15.6 16.8 9.2" stroke="#fff"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  history: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><polyline points="12 7 12 12 15 14"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trophy: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  timer: '<circle cx="12" cy="13" r="9"/><polyline points="12 8 12 13 15 15"/><line x1="10" y1="1.5" x2="14" y2="1.5"/>',
  water: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  steps: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  scale: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7.5 10a6 6 0 0 1 9 0"/><line x1="12" y1="10" x2="13.5" y2="7.5"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  coach: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  rest: '<line x1="5" y1="12" x2="19" y2="12"/>',
};

export function Icon({ name, size = 22, class: cls = '' }) {
  const sizeClass = size === 16 ? 's16' : size === 18 ? 's18' : size === 20 ? 's20' : '';
  return html`<svg class=${`svg-icon ${sizeClass} ${cls}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ICONS[name] ?? '' }}></svg>`;
}

// ------------------------------------------------------------------ frame

export function TopBar({ title, onBack, actions }) {
  return html`<header class=${`topbar ${onBack ? 'with-back' : ''}`}>
    ${onBack && html`<button class="icon-btn ink" onClick=${onBack} aria-label="Back"><${Icon} name="back" /></button>`}
    <h1>${title}</h1>
    ${actions}
  </header>`;
}

/** The header for a screen pushed over the tabs. */
export const BackBar = ({ title, actions }) => html`<${TopBar} title=${title} onBack=${back} actions=${actions} />`;

// ------------------------------------------------------------------ cards and text

export function Card({ children, onClick, class: cls = '' }) {
  const handle = onClick ? (e) => {
    // Buttons and fields inside a tappable card do their own thing.
    if (e.target.closest('button, input, select, textarea, a, label')) return;
    onClick(e);
  } : undefined;
  return html`<section class=${`card ${onClick ? 'tap' : ''} ${cls}`} onClick=${handle}>${children}</section>`;
}

export function CardHeader({ title, subtitle, icon, trailing }) {
  return html`<div class="card-header">
    ${icon && html`<span class="icon"><${Icon} name=${icon} size=${20} /></span>`}
    <div class="titles">
      <div class="card-title">${title}</div>
      ${subtitle && html`<div class="card-sub">${subtitle}</div>`}
    </div>
    ${trailing}
  </div>`;
}

export const SectionLabel = ({ children }) => html`<div class="section-label">${children}</div>`;
export const Tag = ({ children, em }) => html`<span class=${`tag ${em ? 'em' : ''}`}>${children}</span>`;
export const EmptyNote = ({ children }) => html`<p class="empty">${children}</p>`;

export function MeterBar({ fraction, tone = 'PROGRESS' }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100;
  return html`<div class=${`meter ${tone}`}><div style=${`width:${pct}%`}></div></div>`;
}

export const StatusLine = ({ text, tone }) => html`<div class=${`status-line ${tone}`}>${text}</div>`;

/** "Protein   112 / 150 g", bar, then the state line. */
export function GoalMeter({ label, value, target, spec }) {
  return html`<div class="goal-meter">
    <div class="head"><span class="label">${label}</span><span class="value"><b>${value}</b> / ${target}</span></div>
    <${MeterBar} fraction=${spec.fraction} tone=${spec.tone} />
    ${spec.text && html`<${StatusLine} text=${spec.text} tone=${spec.tone} />`}
  </div>`;
}

export function StatTile({ label, value, unit, delta, deltaGood }) {
  return html`<div class="stat grow">
    <div class="label">${label}</div>
    <div class="value">${value}${unit && html`<small>${unit}</small>`}</div>
    ${delta && html`<div class=${`delta ${deltaGood ? 'good' : ''}`}>${delta}</div>`}
  </div>`;
}

const STATUS_ICON = { DONE: 'check', PARTIAL: 'more', MISSED: 'x', REST: 'rest' };

export function StatusCell({ status, lg }) {
  const icon = STATUS_ICON[status];
  return html`<span class=${`status-cell ${status} ${lg ? 'lg' : ''}`} title=${dayStatusLabel(status)}>
    ${icon && html`<${Icon} name=${icon} size=${lg ? 20 : 16} />`}
  </span>`;
}

/** Mon–Sun with each day's workout and status; tapping a day selects it. */
export function WeekStrip({ days, onSelect }) {
  return html`<div class="week-strip">
    ${days.map((d) => html`<button class=${`week-day ${d.selected ? 'selected' : ''} ${d.isToday ? 'today' : ''}`} onClick=${() => onSelect(d.epochDay)}>
      <span class="d">${d.dayLabel}</span>
      <${StatusCell} status=${d.status} />
      <span class="w">${d.workoutLabel}</span>
    </button>`)}
  </div>`;
}

export function StatusLegend() {
  const items = [['var(--good)', 'Done'], ['var(--warning)', 'Partial'], ['var(--serious)', 'Missed'], ['var(--neutral)', 'Rest']];
  return html`<div class="legend">${items.map(([c, l]) => html`<span><i style=${`background:${c}`}></i>${l}</span>`)}</div>`;
}

export function Sparkline({ values }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 54 + 1).toFixed(1)},${(26 - ((v - min) / span) * 24).toFixed(1)}`);
  return html`<svg class="sparkline" viewBox="0 0 56 28" aria-hidden="true"><path d=${`M${pts.join('L')}`} /></svg>`;
}

// ------------------------------------------------------------------ date selector

export function dayTitle(day, today) {
  if (day === today) return 'Today';
  if (day === today - 1) return 'Yesterday';
  if (day === today + 1) return 'Tomorrow';
  return Fmt.longDate(day);
}

export function DateSelector({ day, onChange }) {
  const today = app.today;
  return html`<div class="date-selector">
    <button class="icon-btn ink" onClick=${() => onChange(day - 1)} aria-label="Previous day"><${Icon} name="left" /></button>
    <label class="label">
      ${dayTitle(day, today)}
      ${day !== today && html`<span class="today-link" onClick=${(e) => { e.preventDefault(); onChange(today); }}>Back to today</span>`}
      <input type="date" value=${isoDate(day)} aria-label="Choose a date"
        onChange=${(e) => { const d = parseIsoDate(e.target.value); if (d != null) onChange(d); }} />
    </label>
    <button class="icon-btn ink" onClick=${() => onChange(day + 1)} aria-label="Next day"><${Icon} name="right" /></button>
  </div>`;
}

// ------------------------------------------------------------------ form controls

export function Field({ label, suffix, hint, error, children }) {
  return html`<label class="field">
    ${label && html`<span>${label}</span>`}
    <div class="control">${children}${suffix && html`<span class="suffix">${suffix}</span>`}</div>
    ${error ? html`<span class="hint err">${error}</span>` : hint && html`<span class="hint">${hint}</span>`}
  </label>`;
}

export function NumberInput({ value, onInput, decimal = true, placeholder, autofocus, invalid, onEnter }) {
  const ref = useRef(null);
  useEffect(() => {
    if (autofocus && ref.current) setTimeout(() => ref.current?.focus(), 60);
  }, []);
  return html`<input ref=${ref} class=${`input ${invalid ? 'invalid' : ''}`} type="text"
    inputmode=${decimal ? 'decimal' : 'numeric'} enterkeyhint="done" autocomplete="off"
    value=${value} placeholder=${placeholder}
    onInput=${(e) => onInput(e.target.value)}
    onKeyDown=${(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }} />`;
}

export function TextInput({ value, onInput, placeholder, autofocus, multiline, onEnter, type = 'text' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (autofocus && ref.current) setTimeout(() => ref.current?.focus(), 60);
  }, []);
  if (multiline) {
    return html`<textarea ref=${ref} class="input" value=${value} placeholder=${placeholder} onInput=${(e) => onInput(e.target.value)}></textarea>`;
  }
  return html`<input ref=${ref} class="input" type=${type} value=${value} placeholder=${placeholder} autocomplete="off"
    onInput=${(e) => onInput(e.target.value)}
    onKeyDown=${(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }} />`;
}

export function Switch({ checked, onChange, label }) {
  return html`<label class="switch" aria-label=${label}>
    <input type="checkbox" checked=${checked} onChange=${(e) => onChange(e.target.checked)} /><span></span>
  </label>`;
}

export function Segmented({ options, value, onChange }) {
  return html`<div class="segmented">${options.map(([v, label]) =>
    html`<button class=${v === value ? 'on' : ''} onClick=${() => onChange(v)}>${label}</button>`)}</div>`;
}

export function Chips({ options, value, onChange }) {
  return html`<div class="chips">${options.map(([v, label]) =>
    html`<button class=${`chip ${v === value ? 'on' : ''}`} onClick=${() => onChange(v)}>${label}</button>`)}</div>`;
}

// ------------------------------------------------------------------ dialogs

let openDialogs = 0;
function useScrollLock() {
  useEffect(() => {
    openDialogs++;
    document.body.style.overflow = 'hidden';
    return () => {
      openDialogs--;
      if (openDialogs === 0) document.body.style.overflow = '';
    };
  }, []);
}

export function Dialog({ title, children, actions, onClose }) {
  useScrollLock();
  return html`<div class="scrim" onClick=${(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label=${title}>
      ${title && html`<h2>${title}</h2>`}
      <div class="body">${children}</div>
      ${actions && html`<div class="actions">${actions}</div>`}
    </div>
  </div>`;
}

/** A full-screen sheet with its own header, for longer flows like adding food. */
export function Sheet({ title, onClose, children, actions }) {
  useScrollLock();
  return html`<div class="scrim sheet-scrim">
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${title}>
      <${TopBar} title=${title} onBack=${onClose} actions=${actions} />
      <div class="sheet-body">${children}</div>
    </div>
  </div>`;
}

export function ConfirmDialog({ title, text, confirm = 'OK', onConfirm, onDismiss, danger }) {
  return html`<${Dialog} title=${title} onClose=${onDismiss} actions=${html`
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class=${`btn ${danger ? 'danger' : 'text'}`} onClick=${onConfirm}>${confirm}</button>`}>
    <p class="ink2">${text}</p>
  <//>`;
}

/** One number, validated before it can be saved. */
export function NumberDialog({ title, label, suffix, initial = '', message, decimal = true, validate, onConfirm, onDismiss, extra }) {
  const [text, setText] = useState(initial);
  const value = decimal ? Fmt.parseDecimal(text) : (/^\d+$/.test(text.trim().replace(/,/g, '')) ? Number(text.trim().replace(/,/g, '')) : null);
  const error = text.trim() === '' ? null : value == null ? 'Enter a number' : validate?.(value) ?? null;
  const ok = value != null && !error;
  const submit = () => { if (ok) onConfirm(value); };
  return html`<${Dialog} title=${title} onClose=${onDismiss} actions=${html`
    ${extra && html`<span class="left">${extra}</span>`}
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" disabled=${!ok} onClick=${submit}>Save</button>`}>
    ${message && html`<p class="small">${message}</p>`}
    <${Field} label=${label} suffix=${suffix} error=${error}>
      <${NumberInput} value=${text} onInput=${setText} decimal=${decimal} autofocus invalid=${!!error} onEnter=${submit} />
    <//>
  <//>`;
}

export function TextDialog({ title, label, initial = '', onSave, onDismiss }) {
  const [text, setText] = useState(initial);
  return html`<${Dialog} title=${title} onClose=${onDismiss} actions=${html`
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" onClick=${() => onSave(text)}>Save</button>`}>
    <${Field} label=${label}><${TextInput} value=${text} onInput=${setText} multiline autofocus /><//>
  <//>`;
}

// ------------------------------------------------------------------ cardio (SharedCards.kt)

export function CardioCard({ settings, entriesToday, sessionsThisWeek, onAdd, onDelete }) {
  const s = settings;
  const toGo = Math.max(0, s.cardioSessionsMin - sessionsThisWeek);
  return html`<${Card}>
    <${CardHeader} title="Cardio" icon="heart"
      subtitle=${`${sessionsThisWeek} of ${s.cardioSessionsMin}–${s.cardioSessionsMax} sessions this week`}
      trailing=${html`<button class="btn text" onClick=${onAdd}>Log</button>`} />
    <div class="mt8">
      <${MeterBar} fraction=${s.cardioSessionsMin > 0 ? sessionsThisWeek / s.cardioSessionsMin : 1} tone=${toGo === 0 ? 'GOOD' : 'PROGRESS'} />
      <${StatusLine} text=${toGo === 0 ? 'Goal hit this week' : `${toGo} to go this week`} tone=${toGo === 0 ? 'GOOD' : ''} />
    </div>
    ${entriesToday.length === 0
      ? html`<p class="small mt8">20–30 minutes of incline treadmill, cycling or brisk walking.</p>`
      : html`<div class="mt8">${entriesToday.map((e) => html`<div class="row">
          <span class="grow">${e.type} · ${e.minutes} min</span>
          <button class="icon-btn" aria-label=${`Remove ${e.type}`} onClick=${() => onDelete(e)}><${Icon} name="x" size=${18} /></button>
        </div>`)}</div>`}
  <//>`;
}

export function CardioDialog({ onDismiss, onSave }) {
  const [type, setType] = useState(CARDIO_TYPES[0]);
  const [minutes, setMinutes] = useState('25');
  const m = /^\d+$/.test(minutes.trim()) ? Number(minutes) : null;
  const error = minutes.trim() === '' ? null : m == null || m < 1 || m > 300 ? 'Enter 1–300 minutes' : null;
  return html`<${Dialog} title="Log cardio" onClose=${onDismiss} actions=${html`
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" disabled=${m == null || !!error} onClick=${() => onSave(type, m)}>Save</button>`}>
    <${Chips} options=${CARDIO_TYPES.map((t) => [t, t])} value=${type} onChange=${setType} />
    <${Field} label="Duration" suffix="min" error=${error}>
      <${NumberInput} value=${minutes} onInput=${setMinutes} decimal=${false} />
    <//>
  <//>`;
}

// ------------------------------------------------------------------ the AI coach card (CoachCard.kt)

export function CoachCard({ day, isToday, onSetUp }) {
  const c = ai.coachState(day);
  const f = c.feedback;
  const title = html`<${CardHeader} title="AI coach" icon="coach"
    subtitle=${isToday ? 'Feedback on today from ChatGPT' : 'Feedback on this day from ChatGPT'} />`;
  if (!c.ready) {
    return html`<${Card}>
      ${title}
      <p class="small mt8">Get feedback on your workout, food and recovery, and what to change for your goal.
        Add your own OpenAI API key in Settings › ChatGPT to start.</p>
      <div class="mt10"><button class="btn outline small" onClick=${onSetUp ?? (() => push({ name: 'settings' }))}>Set up ChatGPT</button></div>
    <//>`;
  }
  return html`<${Card}>
    ${title}
    ${c.working && html`<div class="row mt12"><span class="spinner"></span><span class="small">ChatGPT is reviewing your day…</span></div>`}
    ${c.error && !c.working && html`<p class="error-text mt8">${c.error}</p>`}
    ${f && !c.working && html`<div class="mt10">
      <p>${f.summary}</p>
      ${f.wentWell.length > 0 && html`<div class="mt10"><${SectionLabel}>Went well<//><ul class="coach-list">${f.wentWell.map((t) => html`<li>${t}</li>`)}</ul></div>`}
      ${f.improve.length > 0 && html`<div class="mt10"><${SectionLabel}>Improve<//><ul class="coach-list">${f.improve.map((t) => html`<li>${t}</li>`)}</ul></div>`}
      ${f.nextFocus && html`<div class="mt10"><${SectionLabel}>Next focus<//><p class="mt4">${f.nextFocus}</p></div>`}
      <p class="tiny mt8">${ai.modelLabel(f.model)} · ${Fmt.time(f.createdAt)}</p>
    </div>`}
    ${!c.working && html`<div class="mt10">
      ${!f && !c.error && html`<p class="small">Sends this day's workout, food, water, steps, sleep and weight trend to ChatGPT with your API key.</p>`}
      <div class="mt8"><button class=${`btn ${f ? 'text' : 'tonal'} small`} onClick=${() => {
        if (!navigator.onLine) snack("You're offline. Connect to the internet to ask ChatGPT.");
        else ai.requestFeedback(day);
      }}>${f ? 'Ask again with the latest numbers' : c.error ? 'Try again' : 'Get feedback'}</button></div>
    </div>`}
  <//>`;
}

// ------------------------------------------------------------------ files

/** Hands a file to the phone: the share sheet on iPhone (Save to Files, AirDrop…), a download elsewhere. */
export async function saveFile(blob, fileName) {
  const file = new File([blob], fileName, { type: blob.type });
  try {
    if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) {
      await navigator.share({ files: [file] });
      return true;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

/** Opens the file picker (or the camera, with [capture]) and resolves with the chosen File, or null. */
export function pickFile(accept, capture = false) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}
