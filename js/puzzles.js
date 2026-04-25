// ─────────── Puzzles: power-switch lever, end-wall slot panel ───────────

import * as THREE from 'three';
import { getRoomByTheme } from './rooms.js?v=14';
import { gameState, togglePower, hasAnyFuse, insertFuseInSlot, allSlotsFilled, tryWin, events } from './game.js?v=14';
import { playLeverClunk, playPanelBuzz, playPickupChime } from './audio.js?v=14';
import { showInteractionPrompt, hideInteractionPrompt } from './hud.js?v=14';

const LEVER_LOOK_DIST = 2.5;
const PANEL_LOOK_DIST = 4.5;
const _forwardRay = new THREE.Vector2(0, 0);

let leverPivot = null;       // rotates between "off" and "on" positions
let leverHandle = null;      // raycast target
let nearbyLever = null;

let panelMeshes = [];        // each slot mesh + button mesh, all raycast-able
let nearbyPanelTarget = null;
let endWallReference = null; // the actual end-wall mesh, for the slide-up tween

// ─────────── POWER LEVER ───────────
// Mounted on the back wall of the generator room. Uses a parent/child group
// so wall orientation and swing animation don't interfere with each other:
//   leverOrient — handles the wall facing (rotation.y = π for right rooms)
//   leverPivot  — child of leverOrient, animates around its local Y axis
//                 from +π/2 (handle pointing DOWN = OFF) to −π/2 (UP = ON).
// Inside leverOrient's local frame, +X always points INTO the room.
let leverOrient = null;
export function buildPowerLever(scene) {
  const room = getRoomByTheme('generator');
  if (!room) return;
  const { side, doorZ, xOuter } = room;

  // Wall plate flush with the back wall — side*0.05 puts it just inside.
  const baseX = xOuter - side * 0.05;
  const y = 1.4;
  const z = doorZ;

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x222222, metalness: 0.7, roughness: 0.4,
    emissive: 0x100000, emissiveIntensity: 0.2,
  });
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x882020, metalness: 0.6, roughness: 0.4,
    emissive: 0x551111, emissiveIntensity: 0.4,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.7), baseMat);
  base.position.set(baseX, y, z);
  scene.add(base);

  // Orientation group: local +X axis → into the room.
  leverOrient = new THREE.Group();
  leverOrient.position.set(baseX, y, z);
  if (side > 0) leverOrient.rotation.y = Math.PI;
  scene.add(leverOrient);

  // Swing pivot (rotates around local Y axis).
  //   rotation.y = +π/2 → handle pointing −Z (down) = OFF
  //   rotation.y = −π/2 → handle pointing +Z (up)   = ON
  leverPivot = new THREE.Group();
  leverOrient.add(leverPivot);
  leverPivot.rotation.y = Math.PI / 2;

  leverHandle = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.16), handleMat);
  leverHandle.position.x = 0.5;
  leverHandle.userData.kind = 'lever';
  leverPivot.add(leverHandle);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), handleMat);
  knob.position.x = 1.0;
  leverPivot.add(knob);

  // "POWER" sign on the wall above the lever
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 384; signCanvas.height = 96;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = 'rgba(20, 8, 0, 0.9)';
  sctx.fillRect(0, 0, 384, 96);
  sctx.fillStyle = '#ff5522';
  sctx.fillRect(0, 0, 384, 4);
  sctx.fillRect(0, 92, 384, 4);
  sctx.font = 'bold 56px "Share Tech Mono", monospace';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.shadowColor = '#ff8844';
  sctx.shadowBlur = 18;
  sctx.fillStyle = '#ffaa66';
  sctx.fillText('POWER', 192, 48);
  sctx.shadowBlur = 0;
  sctx.fillStyle = '#fff';
  sctx.fillText('POWER', 192, 48);
  const signTex = new THREE.CanvasTexture(signCanvas);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.36),
    new THREE.MeshBasicMaterial({
      map: signTex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  sign.position.set(baseX + side * 0.04, y + 0.95, z);
  sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  scene.add(sign);

  // Subtle accent point-light at the lever to draw the eye
  const accentLight = new THREE.PointLight(0xffaa44, 1.5, 4);
  accentLight.position.set(baseX - side * 0.5, y, z);
  scene.add(accentLight);
}

export function updateLeverDetection(camera, raycaster, isExploring, suppress) {
  if (!isExploring || !leverHandle || suppress) {
    if (nearbyLever && !suppress) hideInteractionPrompt();
    nearbyLever = null;
    return;
  }
  raycaster.setFromCamera(_forwardRay, camera);
  const hit = raycaster.intersectObject(leverHandle, false);
  if (hit.length > 0 && hit[0].distance < LEVER_LOOK_DIST) {
    if (nearbyLever !== leverHandle) {
      nearbyLever = leverHandle;
      showInteractionPrompt(
        gameState.powerOn ? '[ E ] Cut power' : '[ E ] Restore power'
      );
    }
  } else if (nearbyLever) {
    nearbyLever = null;
    hideInteractionPrompt();
  }
}

export function hasNearbyLever() {
  return nearbyLever !== null;
}

export function pullNearbyLever() {
  if (!nearbyLever || !leverPivot) return false;
  togglePower();
  // Animate around the local Y axis (down ↔ up swing in the wall's vertical plane)
  const targetY = gameState.powerOn ? -Math.PI / 2 : Math.PI / 2;
  gsap.to(leverPivot.rotation, { y: targetY, duration: 0.4, ease: 'power2.out' });
  playLeverClunk();
  showInteractionPrompt(
    gameState.powerOn ? '[ E ] Cut power' : '[ E ] Restore power'
  );
  return true;
}

// ─────────── Visual feedback to power-on ───────────
events.addEventListener('power:changed', (e) => {
  // Brighten the generator room light when power is restored
  const room = getRoomByTheme('generator');
  if (room && room.light) {
    gsap.to(room.light, {
      intensity: e.detail.on ? 2.4 : 0.5,
      duration: 0.6,
    });
  }
  if (panelButtonMesh) updatePanelButtonAppearance();
  if (e.detail.on) maybeAutoWin();
});

// Auto-win: as soon as all 3 fuses are in AND power is on, escape triggers.
// Players don't need to find/press the button — this also makes the order of
// operations forgiving.
function maybeAutoWin() {
  if (!gameState.powerOn) return;
  if (!allSlotsFilled()) return;
  if (gameState.gameComplete) return;
  if (tryWin() && endWallReference) {
    gsap.to(endWallReference.position, { y: 8, duration: 1.6, ease: 'power2.in' });
  }
}

// ─────────── END-WALL SLOT PANEL (Phase 6) ───────────
let panelButtonMesh = null;
const panelSlotMeshes = {}; // itemId → mesh

export function buildEndWallPanel(scene, endWallObject) {
  endWallReference = endWallObject;

  // Panel sits forward of the end wall on a small mounting pillar.
  // Player z-clamp is -58, so panel at z=-59 is 1 unit in front of the
  // clamp — close enough to interact AS SOON AS the player hits the wall.
  // This also separates it visibly from the "Wanna Play?" graffiti at
  // z=-61.95.
  const panelZ = -59;
  const panelGroup = new THREE.Group();

  // Mounting pillar — tall pedestal under the panel
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a, metalness: 0.6, roughness: 0.5,
    emissive: 0x080808,
  });
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.5, 0.5), pillarMat);
  pillar.position.set(0, -0.75, panelZ);
  panelGroup.add(pillar);
  const pillarBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 1.0), pillarMat);
  pillarBase.position.set(0, -1.95, panelZ);
  panelGroup.add(pillarBase);

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x222018, metalness: 0.6, roughness: 0.5,
    emissive: 0x110804, emissiveIntensity: 0.4,
  });
  const slotMat = new THREE.MeshStandardMaterial({
    color: 0x111111, metalness: 0.4, roughness: 0.7,
    emissive: 0x000000,
  });

  // Frame plate (bigger so it's unmistakable)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.0, 0.1), frameMat);
  frame.position.set(0, 1.2, panelZ);
  panelGroup.add(frame);

  // Header label rendered to canvas → texture
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 768; labelCanvas.height = 96;
  const lctx = labelCanvas.getContext('2d');
  lctx.font = 'bold 56px "Share Tech Mono", monospace';
  lctx.textAlign = 'center';
  lctx.textBaseline = 'middle';
  lctx.shadowColor = '#33ff66';
  lctx.shadowBlur = 22;
  lctx.fillStyle = '#88ffaa';
  lctx.fillText('EXIT CONTROL', 384, 48);
  lctx.shadowBlur = 0;
  lctx.fillStyle = '#ffffff';
  lctx.fillText('EXIT CONTROL', 384, 48);
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const headerLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 0.32),
    new THREE.MeshBasicMaterial({
      map: labelTex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  headerLabel.position.set(0, 2.0, panelZ + 0.06);
  panelGroup.add(headerLabel);

  // Three identical fuse slots — any fuse fits any slot.
  const slotXs = [-0.95, 0, 0.95];
  for (let i = 0; i < 3; i++) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.06), slotMat.clone());
    slot.position.set(slotXs[i], 1.4, panelZ + 0.06);
    slot.userData.kind = 'slot';
    slot.userData.slotIndex = i;
    panelGroup.add(slot);
    panelMeshes.push(slot);
    panelSlotMeshes[i] = slot;
  }

  // Button — initially red (no power), turns blinking green when powerOn
  panelButtonMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.1, 24),
    new THREE.MeshStandardMaterial({
      color: 0x550000, emissive: 0x330000, emissiveIntensity: 0.5,
      metalness: 0.5, roughness: 0.4,
    })
  );
  panelButtonMesh.rotation.x = Math.PI / 2;
  panelButtonMesh.position.set(0, 0.55, panelZ + 0.08);
  panelButtonMesh.userData.kind = 'button';
  panelGroup.add(panelButtonMesh);
  panelMeshes.push(panelButtonMesh);

  // Spot light pointing AT the panel from above + behind so it stands out
  const spot = new THREE.PointLight(0xaaffcc, 1.8, 8);
  spot.position.set(0, 3.5, panelZ + 1.5);
  scene.add(spot);

  scene.add(panelGroup);
  updatePanelButtonAppearance();
}

function updatePanelButtonAppearance() {
  if (!panelButtonMesh) return;
  const m = panelButtonMesh.material;
  if (gameState.powerOn) {
    m.color.setHex(0x119911);
    m.emissive.setHex(0x44ff44);
    m.emissiveIntensity = 1.0;
  } else {
    m.color.setHex(0x550000);
    m.emissive.setHex(0x330000);
    m.emissiveIntensity = 0.5;
  }
}

export function updatePanelDetection(camera, raycaster, isExploring, suppress) {
  if (!isExploring || panelMeshes.length === 0 || suppress) {
    if (nearbyPanelTarget && !suppress) hideInteractionPrompt();
    nearbyPanelTarget = null;
    return;
  }
  raycaster.setFromCamera(_forwardRay, camera);
  const hits = raycaster.intersectObjects(panelMeshes, false);
  if (hits.length > 0 && hits[0].distance < PANEL_LOOK_DIST) {
    const m = hits[0].object;
    if (nearbyPanelTarget !== m) {
      nearbyPanelTarget = m;
      showInteractionPrompt(promptForPanelTarget(m));
    } else {
      // Refresh in case state changed
      showInteractionPrompt(promptForPanelTarget(m));
    }
  } else if (nearbyPanelTarget) {
    nearbyPanelTarget = null;
    hideInteractionPrompt();
  }
}

function promptForPanelTarget(m) {
  if (m.userData.kind === 'slot') {
    const i = m.userData.slotIndex;
    if (gameState.endWallSlots[i])     return '[ FILLED: FUSE ]';
    if (hasAnyFuse())                  return '[ E ] Insert Fuse';
    return '[ NEED FUSE ]';
  }
  if (m.userData.kind === 'button') {
    if (!gameState.powerOn)            return '[ NO POWER ]';
    if (!allSlotsFilled())             return '[ INSERT 3 FUSES FIRST ]';
    return '[ E ] OPEN';
  }
  return '';
}

export function hasNearbyPanelTarget() {
  return nearbyPanelTarget !== null;
}

// Reset everything puzzle-related to fresh state (called on unlock).
export function resetPuzzles() {
  if (leverPivot) {
    leverPivot.rotation.x = 0;
    leverPivot.rotation.y = Math.PI / 2; // OFF
    leverPivot.rotation.z = 0;
  }
  if (endWallReference) endWallReference.position.y = 1;
  for (const i of Object.keys(panelSlotMeshes)) {
    const slot = panelSlotMeshes[i];
    if (!slot) continue;
    slot.material.color.setHex(0x111111);
    slot.material.emissive.setHex(0x000000);
    slot.material.emissiveIntensity = 0;
  }
  updatePanelButtonAppearance();
  nearbyLever = null;
  nearbyPanelTarget = null;
}

export function activateNearbyPanelTarget() {
  if (!nearbyPanelTarget) return false;
  const m = nearbyPanelTarget;
  if (m.userData.kind === 'slot') {
    const i = m.userData.slotIndex;
    if (gameState.endWallSlots[i]) return false;
    if (!hasAnyFuse()) {
      playPanelBuzz();
      return false;
    }
    insertFuseInSlot(i);
    // Visualise: dim the slot to show "filled"
    m.material.color.setHex(0x336699);
    m.material.emissive.setHex(0x001144);
    m.material.emissiveIntensity = 0.8;
    playPickupChime();
    showInteractionPrompt(promptForPanelTarget(m));
    maybeAutoWin();
    return true;
  }
  if (m.userData.kind === 'button') {
    if (!gameState.powerOn || !allSlotsFilled()) {
      playPanelBuzz();
      return false;
    }
    if (tryWin() && endWallReference) {
      // Slide the end wall up out of view, revealing the exit
      gsap.to(endWallReference.position, { y: 8, duration: 1.6, ease: 'power2.in' });
    }
    return true;
  }
  return false;
}
