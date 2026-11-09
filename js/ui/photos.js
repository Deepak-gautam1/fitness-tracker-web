// Progress photos: four poses per session, kept on the phone, plus side-by-side compare
// (PhotosScreen.kt / PhotoCompareScreen.kt). Photos are resized to at most 1600 px like on Android.

import { useState, useEffect } from '../../vendor/preact-htm.js';
import * as repo from '../repo.js';
import { Analytics, Fmt, Pose, isoDate, parseIsoDate } from '../domain.js';
import { app, push, snack } from './state.js';
import { html, Icon, TopBar, BackBar, Card, CardHeader, Dialog, ConfirmDialog, Chips, Field, pickFile } from './kit.js';

const MAX_SIDE = 1600;

/** A JPEG at most 1600 px on its longest side; small JPEGs are kept byte for byte. */
export async function normalizePhoto(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    if (scale === 1 && blob.type === 'image/jpeg') return await blob.arrayBuffer();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the photo'))), 'image/jpeg', 0.88));
    return await out.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PhotoImg({ photo, class: cls, alt }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    repo.photoUrl(photo).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [photo.fileName]);
  return url ? html`<img class=${cls} src=${url} alt=${alt} />` : html`<span class="spinner"></span>`;
}

async function addPhoto(day, pose, capture) {
  const file = await pickFile('image/*', capture);
  if (!file) return;
  try {
    await repo.savePhoto(day, pose, await normalizePhoto(file));
    snack(`${Pose.of(pose).label} photo saved`);
  } catch (e) {
    snack(`Couldn't save the photo: ${e.message ?? e}`);
  }
}

export function PhotosScreen() {
  const today = app.today;
  const s = repo.settings();
  const photos = repo.photos();
  const weights = repo.weights();
  const [extraDay, setExtraDay] = useState(null);
  const [picking, setPicking] = useState(null); // { day, pose }
  const [viewing, setViewing] = useState(null);
  const [askDate, setAskDate] = useState(false);
  const days = [...new Set([...photos.map((p) => p.epochDay), today, ...(extraDay != null ? [extraDay] : [])])].sort((a, b) => b - a);
  const lastPhoto = photos.length ? Math.max(...photos.map((p) => p.epochDay)) : null;
  const due = lastPhoto == null ? null : lastPhoto + s.photoIntervalDays - today;
  const status = due == null ? 'Take your first photos'
    : due > 0 ? `Next photos in ${due} day${due === 1 ? '' : 's'}`
      : due === 0 ? 'Photos are due today' : `Photos are ${-due} day${due === -1 ? '' : 's'} overdue`;

  return html`
    <${TopBar} title="Progress photos" actions=${html`<button class="btn text" onClick=${() => push({ name: 'compare' })}>Compare</button>`} />
    <main class="content">
      <${Card}>
        <${CardHeader} title=${status} icon="camera" subtitle="Every 3–4 weeks: relaxed front, front flexed, side, back" />
        <p class="small mt8">Keep conditions the same each time: lighting, camera distance, camera height, pose and time of day.
          Photos stay private on this phone and are never uploaded.</p>
      <//>
      ${days.map((day) => {
        const avg = Analytics.trailingAverage(weights, day);
        return html`<${Card}>
          <div class="row"><b class="grow">${day === today ? 'Today · ' : ''}${Fmt.date(day)}</b>${avg != null && html`<span class="small">${Fmt.kg(avg)} avg</span>`}</div>
          <div class="photo-grid mt10">${Pose.entries.map((pose) => {
            const photo = photos.find((p) => p.epochDay === day && p.pose === pose.name);
            return html`<div>
              <button class="photo-tile" aria-label=${photo ? `${pose.label}, ${Fmt.date(day)}` : `Add ${pose.label} photo`}
                onClick=${() => (photo ? setViewing(photo) : setPicking({ day, pose: pose.name }))}>
                ${photo ? html`<${PhotoImg} photo=${photo} alt=${pose.label} />` : html`<span class="add"><${Icon} name="plus" size=${20} />Add</span>`}
              </button>
              <div class="photo-caption">${pose.label}</div>
            </div>`;
          })}</div>
        <//>`;
      })}
      <button class="btn outline block" onClick=${() => setAskDate(true)}><${Icon} name="calendar" size=${18} /> Add photos for another date</button>
    </main>

    ${picking && html`<${Dialog} title=${`${Pose.of(picking.pose).label} · ${Fmt.date(picking.day)}`} onClose=${() => setPicking(null)}
      actions=${html`<button class="btn text" onClick=${() => setPicking(null)}>Cancel</button>`}>
      <p class="small">Same lighting, distance, camera height, pose and time of day as last time.</p>
      <button class="btn block" onClick=${() => { const p = picking; setPicking(null); addPhoto(p.day, p.pose, true); }}><${Icon} name="camera" size=${18} /> Take photo</button>
      <button class="btn tonal block" onClick=${() => { const p = picking; setPicking(null); addPhoto(p.day, p.pose, false); }}><${Icon} name="image" size=${18} /> Choose from library</button>
    <//>`}
    ${viewing && html`<${PhotoViewer} photo=${viewing} onDismiss=${() => setViewing(null)}
      onReplace=${() => { const p = viewing; setViewing(null); setPicking({ day: p.epochDay, pose: p.pose }); }} />`}
    ${askDate && html`<${DateDialog} today=${today} onDismiss=${() => setAskDate(false)} onPick=${(d) => { setExtraDay(d); setAskDate(false); }} />`}
  `;
}

function PhotoViewer({ photo, onDismiss, onReplace }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return html`<${ConfirmDialog} title="Delete this photo?" text="It will be removed from the app permanently." confirm="Delete" danger
      onDismiss=${() => setConfirm(false)} onConfirm=${() => { repo.deletePhoto(photo); onDismiss(); }} />`;
  }
  return html`<${Dialog} title=${`${Pose.of(photo.pose).label} · ${Fmt.date(photo.epochDay)}`} onClose=${onDismiss} actions=${html`
    <span class="left"><button class="btn danger" onClick=${() => setConfirm(true)}>Delete photo</button></span>
    <button class="btn text" onClick=${onReplace}>Replace</button>
    <button class="btn text" onClick=${onDismiss}>Close</button>`}>
    <${PhotoImg} photo=${photo} class="photo-view" alt=${Pose.of(photo.pose).label} />
  <//>`;
}

function DateDialog({ today, onPick, onDismiss }) {
  const [day, setDay] = useState(today - 1);
  return html`<${Dialog} title="Photos for another date" onClose=${onDismiss} actions=${html`
    <button class="btn text" onClick=${onDismiss}>Cancel</button>
    <button class="btn text" onClick=${() => onPick(day)}>OK</button>`}>
    <${Field} label="Date"><input class="input" type="date" value=${isoDate(day)} max=${isoDate(today)}
      onChange=${(e) => { const d = parseIsoDate(e.target.value); if (d != null) setDay(d); }} /><//>
  <//>`;
}

// ------------------------------------------------------------------ compare

export function CompareScreen() {
  const [pose, setPose] = useState(Pose.entries[0].name);
  const photos = repo.photos().filter((p) => p.pose === pose);
  const days = photos.map((p) => p.epochDay).sort((a, b) => a - b);
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const b = days.includes(before) ? before : days[0];
  const a = days.includes(after) ? after : days[days.length - 1];
  const weights = repo.weights();
  const avgB = b != null ? Analytics.trailingAverage(weights, b) : null;
  const avgA = a != null ? Analytics.trailingAverage(weights, a) : null;
  const side = (label, day, set, avg) => {
    const photo = photos.find((p) => p.epochDay === day);
    return html`<div class="stack s6">
      <b>${label}</b>
      ${photo && html`<${PhotoImg} photo=${photo} alt=${`${label}, ${Pose.of(pose).label}`} />`}
      <select class="input" aria-label=${`Choose date for ${label.toLowerCase()}`} value=${String(day)} onChange=${(e) => set(Number(e.target.value))}>
        ${days.map((d) => html`<option value=${String(d)}>${Fmt.date(d)}</option>`)}
      </select>
      <span class="small">${avg != null ? `${Fmt.kg(avg)} avg` : 'No weigh-in'}</span>
    </div>`;
  };
  return html`
    <${BackBar} title="Compare photos" />
    <main class="content no-nav">
      <${Chips} options=${Pose.entries.map((p) => [p.name, p.label])} value=${pose} onChange=${setPose} />
      ${days.length < 2
        ? html`<${Card}><p class="ink2">You need ${Pose.of(pose).label.toLowerCase()} photos from at least two sessions to compare them. Take them every 3–4 weeks.</p><//>`
        : html`<${Card}>
            <div class="compare">${side('Before', b, setBefore, avgB)}${side('After', a, setAfter, avgA)}</div>
            <p class="small mt12">${Math.abs(a - b)} days apart${avgA != null && avgB != null ? ` · ${Fmt.signedKg(avgA - avgB)} (7-day average)` : ''}</p>
            <p class="small mt6">Look at shoulders, upper chest, arms and the waistline, not just the scale.</p>
          <//>`}
    </main>
  `;
}
