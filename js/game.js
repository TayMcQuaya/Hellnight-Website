// ─────────── Central game state ───────────
// Every state mutation goes through a helper that fires an event so HUD,
// audio, and other modules can react without import cycles.

export const gameState = {
  inventory: new Set(),                 // 'fuse_a' | 'fuse_b' | 'fuse_c'
  powerOn: false,
  endWallSlots: { 0: false, 1: false, 2: false },  // 3 fuse slots, any-fuse-fits
  gameComplete: false,
  caught: false,                        // creature caught player → show lose screen
  startTime: 0,
};

export const events = new EventTarget();

export function startGame() {
  gameState.startTime = performance.now();
}

export function addItem(itemId) {
  if (gameState.inventory.has(itemId)) return false;
  gameState.inventory.add(itemId);
  events.dispatchEvent(new CustomEvent('inventory:changed', { detail: { itemId } }));
  return true;
}

export function hasItem(itemId) {
  return gameState.inventory.has(itemId);
}

export function togglePower() {
  gameState.powerOn = !gameState.powerOn;
  events.dispatchEvent(new CustomEvent('power:changed', { detail: { on: gameState.powerOn } }));
  return gameState.powerOn;
}

// Insert any fuse from inventory into the given slot index (0/1/2).
// Returns true if a fuse was consumed.
export function insertFuseInSlot(slotIndex) {
  if (!(slotIndex in gameState.endWallSlots)) return false;
  if (gameState.endWallSlots[slotIndex]) return false;
  const fuseIds = ['fuse_a', 'fuse_b', 'fuse_c'];
  const owned = fuseIds.find(id => gameState.inventory.has(id));
  if (!owned) return false;
  gameState.endWallSlots[slotIndex] = true;
  gameState.inventory.delete(owned);
  events.dispatchEvent(new CustomEvent('inventory:changed', { detail: { itemId: owned, removed: true } }));
  events.dispatchEvent(new CustomEvent('slot:filled', { detail: { slotIndex } }));
  return true;
}

export function allSlotsFilled() {
  return Object.values(gameState.endWallSlots).every(Boolean);
}

// True if the player has at least one fuse to insert
export function hasAnyFuse() {
  return ['fuse_a', 'fuse_b', 'fuse_c'].some(id => gameState.inventory.has(id));
}

export function tryWin() {
  if (gameState.gameComplete) return false;
  if (!gameState.powerOn) return false;
  if (!allSlotsFilled()) return false;
  gameState.gameComplete = true;
  events.dispatchEvent(new Event('win'));
  return true;
}

export function getElapsedSeconds() {
  if (!gameState.startTime) return 0;
  return Math.round((performance.now() - gameState.startTime) / 1000);
}

// Reset every game-state field to its initial value and notify listeners.
// Called from scene.js when the player leaves exploration mode (unlock).
export function resetGameState() {
  gameState.inventory.clear();
  for (const k of Object.keys(gameState.endWallSlots)) {
    gameState.endWallSlots[k] = false;
  }
  gameState.powerOn = false;
  gameState.gameComplete = false;
  gameState.caught = false;
  gameState.startTime = 0;
  events.dispatchEvent(new Event('reset'));
  events.dispatchEvent(new CustomEvent('inventory:changed'));
  events.dispatchEvent(new CustomEvent('power:changed', { detail: { on: false } }));
}

export function markCaught() {
  if (gameState.caught) return;
  gameState.caught = true;
  events.dispatchEvent(new Event('caught'));
}
