/**
 * Inactivity Timer
 * Auto-logout after TIMEOUT_MS of no user activity.
 * Shows a warning WARN_BEFORE_MS before logout.
 */

const TIMEOUT_MS    = 30 * 60 * 1000; // 30 minutes
const WARN_BEFORE_MS =  2 * 60 * 1000; //  2 minutes warning

let inactivityTimer  = null;
let warningTimer     = null;
let _onWarning       = null; // fn(secondsLeft)
let _onLogout        = null; // fn()

function resetTimer() {
  clearTimeout(inactivityTimer);
  clearTimeout(warningTimer);

  // Fire warning 2 min before expiry
  warningTimer = setTimeout(() => {
    if (_onWarning) _onWarning(Math.floor(WARN_BEFORE_MS / 1000));
  }, TIMEOUT_MS - WARN_BEFORE_MS);

  // Fire logout at expiry
  inactivityTimer = setTimeout(() => {
    if (_onLogout) _onLogout();
  }, TIMEOUT_MS);
}

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

export function startInactivityTimer({ onWarning, onLogout }) {
  _onWarning = onWarning || null;
  _onLogout  = onLogout  || (() => {});

  ACTIVITY_EVENTS.forEach(ev =>
    window.addEventListener(ev, resetTimer, { passive: true })
  );
  resetTimer();
}

export function stopInactivityTimer() {
  clearTimeout(inactivityTimer);
  clearTimeout(warningTimer);
  ACTIVITY_EVENTS.forEach(ev =>
    window.removeEventListener(ev, resetTimer)
  );
  _onWarning = null;
  _onLogout  = null;
}

/** Call when user clicks "Stay logged in" */
export function keepAlive() {
  resetTimer();
}
