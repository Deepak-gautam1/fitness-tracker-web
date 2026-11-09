// Entry point: opens the on-phone database, seeds the plan, and renders the tabs (AppRoot.kt).

import { html, render, useState, useEffect } from '../vendor/preact-htm.js';
import * as db from './db.js';
import * as repo from './repo.js';
import * as ai from './ai.js';
import { app, onAppChange, openTab, dismissSnack, snack } from './ui/state.js';
import { onTimerChange, timerState, timerFinishedAt } from './ui/timer.js';
import { Icon } from './ui/kit.js';
import { TodayScreen } from './ui/today.js';
import { WorkoutScreen, ExerciseHistoryScreen, TimerBar } from './ui/workout.js';
import { FoodScreen, FoodLibraryScreen } from './ui/food.js';
import { ProgressScreen } from './ui/progress.js';
import { PhotosScreen, CompareScreen } from './ui/photos.js';
import { SettingsScreen, PlanScreen, PlanTemplateScreen } from './ui/settings.js';

const TABS = [
  ['today', 'Today', 'calendar'],
  ['workout', 'Workout', 'dumbbell'],
  ['food', 'Food', 'food'],
  ['progress', 'Progress', 'trend'],
  ['photos', 'Photos', 'camera'],
];

function TabBar({ timerOn }) {
  return html`<nav class="tabbar" aria-label="Tabs">
    ${TABS.map(([id, label, icon]) => html`<button class=${app.tab === id ? 'on' : ''} aria-current=${app.tab === id ? 'page' : undefined} onClick=${() => openTab(id)}>
      <span class="pill"><${Icon} name=${icon} /></span>${label}
      ${id === 'workout' && timerOn && app.tab !== 'workout' && html`<span class="dot"></span>`}
    </button>`)}
  </nav>`;
}

function Snackbar({ noNav, aboveTimer }) {
  const s = app.snack;
  if (!s) return null;
  return html`<div class=${`snackbar ${noNav ? 'no-nav' : aboveTimer ? 'above-timer' : ''}`} role="status" key=${s.id}>
    <span class="msg">${s.message}</span>
    ${s.action && html`<button onClick=${() => { dismissSnack(); s.onAction?.(); }}>${s.action}</button>`}
  </div>`;
}

function App() {
  const [, force] = useState(0);
  useEffect(() => {
    const update = () => force((x) => x + 1);
    const offs = [db.subscribe(update), onAppChange(update), ai.onCoachChange(update), onTimerChange(update)];
    return () => offs.forEach((off) => off());
  }, []);
  const refresh = () => force((x) => x + 1);

  const top = app.stack[app.stack.length - 1];
  let screen;
  if (top) {
    switch (top.name) {
      case 'settings': screen = html`<${SettingsScreen} />`; break;
      case 'plan': screen = html`<${PlanScreen} />`; break;
      case 'planTemplate': screen = html`<${PlanTemplateScreen} templateId=${top.templateId} key=${top.templateId} />`; break;
      case 'foods': screen = html`<${FoodLibraryScreen} />`; break;
      case 'history': screen = html`<${ExerciseHistoryScreen} exerciseId=${top.exerciseId} key=${top.exerciseId} />`; break;
      case 'compare': screen = html`<${CompareScreen} />`; break;
      default: screen = null;
    }
  } else {
    switch (app.tab) {
      case 'workout': screen = html`<${WorkoutScreen} refresh=${refresh} />`; break;
      case 'food': screen = html`<${FoodScreen} />`; break;
      case 'progress': screen = html`<${ProgressScreen} />`; break;
      case 'photos': screen = html`<${PhotosScreen} />`; break;
      default: screen = html`<${TodayScreen} />`;
    }
  }
  const timerOn = timerState() != null;
  const showTimer = !top && (timerOn || timerFinishedAt() != null);
  document.body.classList.toggle('has-timer', showTimer);
  return html`
    <div key=${top ? `s:${app.stack.length}:${top.name}` : `t:${app.tab}`}>${screen}</div>
    ${showTimer && html`<${TimerBar} />`}
    ${!top && html`<${TabBar} timerOn=${timerOn} />`}
    <${Snackbar} noNav=${!!top} aboveTimer=${showTimer} />
  `;
}

function fail(root, error) {
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'boot';
  const msg = /indexedDB|IDB|storage|QuotaExceeded|SecurityError/i.test(String(error?.name) + String(error?.message))
    ? "This browser won't let the app store data. Private browsing blocks it: open the app in a normal Safari tab, or from its Home Screen icon."
    : `The app couldn't start: ${error?.message ?? error}`;
  box.textContent = msg;
  root.appendChild(box);
}

async function boot() {
  const root = document.getElementById('app');
  try {
    await db.openDb();
    repo.ensureSeeded();
    await db.flush();
  } catch (e) {
    console.error(e);
    fail(root, e);
    return;
  }
  db.setErrorHandler((e) => {
    console.error(e);
    snack(`Couldn't save to this phone: ${e?.message ?? e}`, null, null, 8000);
  });
  // Ask the phone to keep the data even when storage runs low.
  navigator.storage?.persist?.().catch(() => {});
  root.innerHTML = '';
  render(html`<${App} />`, root);
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Only an update replaces a worker that was already running; the very first install isn't news.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state !== 'activated') return;
        if (hadController) snack('A new version of the app is ready', 'Reload', () => location.reload(), 15000);
        hadController = true;
      });
    });
    // Look for a new version each time the app comes back to the screen.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}

boot();
