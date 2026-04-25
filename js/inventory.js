// ─────────── Pickup detection + inventory HUD ───────────

import * as THREE from 'three';
import { getPickupMeshes } from './rooms.js?v=14';
import { addItem, gameState, events } from './game.js?v=14';
import { playPickupChime } from './audio.js?v=14';
import { showInteractionPrompt, hideInteractionPrompt } from './hud.js?v=14';
import { spawnCreatureAt } from './creature.js?v=14';

const CREATURE_ENTRANCE_X = 0;
const CREATURE_ENTRANCE_Z = 6;
let creatureSpawnedYet = false;

// True if all 3 fuses have been picked up (or already inserted into the panel)
function allItemsAcquired() {
  const owned = (id) => gameState.inventory.has(id);
  const totalCarried = ['fuse_a', 'fuse_b', 'fuse_c'].filter(owned).length;
  const totalInserted =
    Object.values(gameState.endWallSlots).filter(Boolean).length;
  return totalCarried + totalInserted >= 3;
}

events.addEventListener('inventory:changed', () => {
  if (creatureSpawnedYet || gameState.gameComplete) return;
  if (allItemsAcquired()) {
    creatureSpawnedYet = true;
    spawnCreatureAt(CREATURE_ENTRANCE_X, CREATURE_ENTRANCE_Z);
  }
});

events.addEventListener('reset', () => {
  creatureSpawnedYet = false;
});

// Called by scene.js on lock to re-trigger the chase if the player got
// caught and is re-entering with a full inventory.
export function maybeRespawnCreatureOnReentry() {
  if (gameState.gameComplete) return;
  if (!allItemsAcquired()) return;
  spawnCreatureAt(CREATURE_ENTRANCE_X, CREATURE_ENTRANCE_Z);
}

const PICKUP_LOOK_DISTANCE = 4.5;
const _forwardRay = new THREE.Vector2(0, 0);

let nearbyPickup = null;

export function getNearbyPickup() {
  return nearbyPickup;
}

export function updatePickupDetection(camera, raycaster, isExploring, doorPromptActive) {
  if (!isExploring || doorPromptActive) {
    if (nearbyPickup && !doorPromptActive) hideInteractionPrompt();
    nearbyPickup = null;
    return;
  }
  const pickups = getPickupMeshes();
  if (pickups.length === 0) {
    nearbyPickup = null;
    return;
  }
  raycaster.setFromCamera(_forwardRay, camera);
  const intersects = raycaster.intersectObjects(pickups, false);
  if (intersects.length > 0 && intersects[0].distance < PICKUP_LOOK_DISTANCE) {
    const m = intersects[0].object;
    if (nearbyPickup !== m) {
      nearbyPickup = m;
      showInteractionPrompt(`[ E ] Pick up: ${m.userData.itemLabel}`);
    }
  } else if (nearbyPickup) {
    nearbyPickup = null;
    hideInteractionPrompt();
  }
}

export function pickUpNearby() {
  if (!nearbyPickup) return false;
  const itemId = nearbyPickup.userData.itemId;
  if (!addItem(itemId)) return false;
  // Remove mesh from scene + pickup list
  if (nearbyPickup.parent) nearbyPickup.parent.remove(nearbyPickup);
  const list = getPickupMeshes();
  const idx = list.indexOf(nearbyPickup);
  if (idx >= 0) list.splice(idx, 1);
  nearbyPickup = null;
  hideInteractionPrompt();
  playPickupChime();
  return true;
}

// Per-frame: gentle bob + rotation so items catch the eye
export function updatePickupAnimations(time) {
  const list = getPickupMeshes();
  for (const m of list) {
    if (m.userData.baseY === undefined) m.userData.baseY = m.position.y;
    if (m.userData.phase === undefined) m.userData.phase = Math.random() * Math.PI * 2;
    m.rotation.y = time * 0.6;
    m.position.y = m.userData.baseY + Math.sin(time * 1.5 + m.userData.phase) * 0.06;
  }
}

// ─────────── Inventory HUD ───────────
const ITEM_LABELS = {
  fuse_a: 'Fuse',
  fuse_b: 'Fuse',
  fuse_c: 'Fuse',
};
const ITEM_GLYPHS = {
  fuse_a: '🔌',
  fuse_b: '🔌',
  fuse_c: '🔌',
};

export function setupInventoryHUD() {
  const bar = document.getElementById('inventory-bar');
  if (!bar) return;
  const render = () => {
    bar.innerHTML = '';
    if (gameState.inventory.size === 0) {
      bar.classList.remove('visible');
      return;
    }
    bar.classList.add('visible');
    for (const itemId of gameState.inventory) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.title = ITEM_LABELS[itemId] || itemId;
      slot.textContent = ITEM_GLYPHS[itemId] || '?';
      bar.appendChild(slot);
    }
  };
  events.addEventListener('inventory:changed', render);
  render();
}
