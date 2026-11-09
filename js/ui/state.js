// App-wide UI state: the selected day (shared by Today, Workout and Food, as on Android), the open
// tab, screens pushed on top of it, and the snackbar.

import { todayDay } from '../domain.js';

export const app = {
  tab: 'today',
  /** Screens pushed over the tabs: { name, ...params }. */
  stack: [],
  day: todayDay(),
  today: todayDay(),
  snack: null,
};

const listeners = new Set();
export const onAppChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function setApp(patch) {
  Object.assign(app, patch);
  for (const fn of listeners) fn();
}

export const selectDay = (day) => setApp({ day });

export function openTab(tab) {
  if (app.stack.length) {
    const n = app.stack.length;
    setApp({ stack: [] });
    history.go(-n);
  }
  if (app.tab !== tab) {
    setApp({ tab });
    window.scrollTo(0, 0);
  }
}

export function push(screen) {
  history.pushState({ depth: app.stack.length + 1 }, '');
  setApp({ stack: [...app.stack, screen] });
  window.scrollTo(0, 0);
}

export function back() {
  if (app.stack.length) history.back();
}

window.addEventListener('popstate', () => {
  if (app.stack.length) setApp({ stack: app.stack.slice(0, -1) });
});

let snackTimer = null;
/** A short message at the bottom, optionally with one action (like Undo). */
export function snack(message, action = null, onAction = null, ms = 4000) {
  clearTimeout(snackTimer);
  setApp({ snack: { message, action, onAction, id: Date.now() } });
  snackTimer = setTimeout(() => setApp({ snack: null }), ms);
}
export function dismissSnack() {
  clearTimeout(snackTimer);
  setApp({ snack: null });
}

/** Keeps "today" right when the app stays open past midnight or comes back the next day. */
function checkDate() {
  const now = todayDay();
  if (now !== app.today) setApp({ today: now, day: app.day === app.today ? now : app.day });
}
setInterval(checkDate, 30_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkDate();
});
