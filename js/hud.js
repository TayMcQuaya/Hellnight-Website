// ─────────── HUD overlays: interaction prompts, inventory, win screen ───────────
//
// Uses DOM overlays (not three.js) so styling stays in regular CSS and the
// overlays respect page scroll / z-index. CSS is in index.html.

import { events as gameEvents, gameState, getElapsedSeconds } from './game.js?v=14';

let promptEl = null;

export function showInteractionPrompt(text) {
  if (!promptEl) promptEl = document.getElementById('interaction-prompt');
  if (!promptEl) return;
  promptEl.textContent = text;
  promptEl.classList.add('visible');
}

export function hideInteractionPrompt() {
  if (!promptEl) promptEl = document.getElementById('interaction-prompt');
  if (!promptEl) return;
  promptEl.classList.remove('visible');
}

export function setupObjectives() {
  const panel = document.getElementById('objectives');
  if (!panel) return;
  panel.classList.add('visible');

  const setDone = (key, done) => {
    const row = panel.querySelector(`.obj-row[data-obj="${key}"]`);
    if (!row) return;
    row.classList.toggle('done', done);
    row.querySelector('.obj-mark').textContent = done ? '[x]' : '[ ]';
  };

  const refresh = () => {
    setDone('power', gameState.powerOn);
    const fusesCarried = ['fuse_a', 'fuse_b', 'fuse_c'].filter(id => gameState.inventory.has(id)).length;
    const fusesInserted = Object.values(gameState.endWallSlots).filter(Boolean).length;
    const totalFuses = fusesCarried + fusesInserted;
    setDone('fuses', totalFuses >= 3);
    // Show progress in the row text while not yet complete
    const fusesRow = panel.querySelector('.obj-row[data-obj="fuses"] .obj-text');
    if (fusesRow) fusesRow.textContent = totalFuses >= 3
      ? 'Collect 3 fuses'
      : `Collect 3 fuses (${totalFuses}/3)`;
    setDone('exit', gameState.gameComplete);
  };

  gameEvents.addEventListener('inventory:changed', refresh);
  gameEvents.addEventListener('power:changed', refresh);
  gameEvents.addEventListener('slot:filled', refresh);
  gameEvents.addEventListener('win', refresh);

  refresh();
}

// Toggle the objectives panel visibility based on exploration mode
export function setObjectivesVisible(visible) {
  const panel = document.getElementById('objectives');
  if (!panel) return;
  panel.classList.toggle('visible', visible);
}

export function setupLoseScreen(onDismiss) {
  const overlay = document.getElementById('lose-screen');
  if (!overlay) return;
  gameEvents.addEventListener('caught', () => {
    const seconds = getElapsedSeconds();
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    const t = document.getElementById('lose-time');
    if (t) t.textContent = `${mm}:${ss}`;
    // Brief delay so the unlock UI transitions complete first
    setTimeout(() => overlay.classList.add('visible'), 250);
  });
  const btn = document.getElementById('lose-restart');
  if (btn) btn.addEventListener('click', () => {
    overlay.classList.remove('visible');
    if (typeof onDismiss === 'function') onDismiss();
  });
}

export function setupWinScreen() {
  const overlay = document.getElementById('win-screen');
  if (!overlay) return;
  const HOMEPAGE = 'https://www.taymcquaya.com';
  gameEvents.addEventListener('win', () => {
    const seconds = getElapsedSeconds();
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    document.getElementById('win-time').textContent = `${mm}:${ss}`;
    // Wait for the end-wall slide-up tween, then fade in the win screen
    setTimeout(() => overlay.classList.add('visible'), 1900);
    // Auto-redirect to the homepage 5 seconds after the screen appears
    setTimeout(() => {
      window.location.href = HOMEPAGE;
    }, 1900 + 5000);
  });
  const btn = document.getElementById('win-continue');
  if (btn) btn.addEventListener('click', () => {
    window.location.href = HOMEPAGE;
  });
}
