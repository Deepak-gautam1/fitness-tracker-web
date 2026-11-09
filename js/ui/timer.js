// Rest timer between sets (RestTimer.kt). It keeps running while you switch tabs and survives the
// app being closed. A web app can't alert you from the background on iPhone, so it beeps when the
// app is on screen, and asks the phone to keep the screen awake while you rest.

const KEY = 'fitness.restTimer';
const listeners = new Set();
let state = load();
let finishedAt = null;
let audio = null;
let wakeLock = null;

export const onTimerChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const changed = () => listeners.forEach((fn) => fn());

export const timerState = () => state;
export const timerFinishedAt = () => finishedAt;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    // A rest that ended over a minute ago is dropped.
    if (!s || s.endsAt < Date.now() - 60_000) return null;
    return s;
  } catch {
    return null;
  }
}

function save(s) {
  state = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the timer still works, it just isn't remembered.
  }
  changed();
}

/** Call from a tap, so iPhone allows sound later. */
export function unlockAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

function beep() {
  try {
    navigator.vibrate?.([0, 300, 150, 300]);
  } catch { /* not on iPhone */ }
  if (!audio) return;
  const now = audio.currentTime;
  for (const [start, freq] of [[0, 880], [0.28, 880], [0.56, 1175]]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(0.4, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.22);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + start);
    osc.stop(now + start + 0.25);
  }
}

async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

export function startTimer(seconds, label) {
  finishedAt = null;
  save({ endsAt: Date.now() + seconds * 1000, totalSeconds: seconds, label });
  keepAwake(true);
}

export function adjustTimer(delta) {
  if (!state) return;
  save({ ...state, endsAt: Math.max(Date.now() + 1000, state.endsAt + delta * 1000), totalSeconds: Math.max(1, state.totalSeconds + delta) });
}

export function skipTimer() {
  save(null);
  keepAwake(false);
}

function tick() {
  if (!state || Date.now() < state.endsAt) return;
  const lateBy = Date.now() - state.endsAt;
  save(null);
  keepAwake(false);
  // Coming back long after the rest ended: no beep, just clear it.
  if (document.visibilityState === 'visible' && lateBy < 5000) {
    finishedAt = Date.now();
    beep();
    changed();
    setTimeout(() => {
      if (finishedAt && Date.now() - finishedAt >= 3900) {
        finishedAt = null;
        changed();
      }
    }, 4000);
  }
}

setInterval(tick, 250);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tick();
    if (state) keepAwake(true);
  }
});
