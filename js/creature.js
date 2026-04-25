// ─────────── The creature: spawn, chase, despawn ───────────
//
// The creature is a tall lanky silhouette with shoulder/hip-pivoted limbs.
// It is spawned by the game flow (currently: when all 3 items collected) at
// a fixed coordinate at the entrance side of the tunnel and chases at 2 m/s
// toward the player. Touch (distance < 1.5) ends the chase.
//
// Public API:
//   init(scene)          – build the creature mesh and add it to the scene
//   update(time, camera) – per-frame animation + chase logic; returns true
//                          if the creature touched the player this frame
//   spawnCreatureAt(x,z) – spawn at fixed coords (used by inventory flow)
//   onPlayerUnlock()     – cancel timer + hide creature on exit/caught

import * as THREE from 'three';
import { playMonsterAppear, startChaseAudio, stopChaseAudio } from './audio.js?v=14';

const CREATURE_CHASE_SPEED = 2.0;
const CREATURE_TOUCH_DISTANCE = 1.5;

let creature = null;
let creatureVisible = false;
let creatureChasing = false;
let creatureLastTime = 0;

export function init(scene) {
  creature = new THREE.Group();

  // Dark red-tint + fog:false so silhouette stays visible at any fog distance.
  // MeshBasicMaterial ignores lighting → solid silhouette look.
  const bodyMat = new THREE.MeshBasicMaterial({
    color: 0x1a0505,
    fog: false
  });

  const torsoW = 1.1, torsoH = 2.0, torsoD = 0.35;
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(torsoW, torsoH, torsoD),
    bodyMat
  );
  torso.position.y = torsoH / 2;
  creature.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 12),
    bodyMat
  );
  head.position.y = torsoH + 0.35;
  creature.add(head);

  const neck = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.25, 0.22),
    bodyMat
  );
  neck.position.y = torsoH + 0.05;
  creature.add(neck);

  // Arms — pivoted at the shoulder so they hang naturally and touch the torso
  const armLen = 1.85;
  const shoulderY = torsoH - 0.15;
  const shoulderX = torsoW / 2 - 0.02;

  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * shoulderX, shoulderY, 0);
    shoulder.rotation.z = side * 0.18;

    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, armLen, 0.14),
      bodyMat
    );
    upper.position.y = -armLen / 2;
    shoulder.add(upper);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      bodyMat
    );
    shoulder.add(cap);

    return shoulder;
  }

  creature.add(makeArm(-1));
  creature.add(makeArm(1));

  // Legs — same pivot trick at the hips
  const legLen = 1.4;
  const hipY = 0.05;
  const hipX = 0.22;

  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * hipX, hipY, 0);

    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, legLen, 0.16),
      bodyMat
    );
    leg.position.y = -legLen / 2;
    hip.add(leg);

    return hip;
  }

  creature.add(makeLeg(-1));
  creature.add(makeLeg(1));

  creature.visible = false;
  creature.position.set(0, -0.65, -45);
  scene.add(creature);
}

// Public entry point: spawn at a fixed position (used by game flow when the
// player has collected all items, or on re-entry after being caught).
export function spawnCreatureAt(x, z) {
  if (!creature) return;
  if (creatureVisible) return; // already on the field
  creature.position.set(
    THREE.MathUtils.clamp(x, -1.8, 1.8),
    -0.65,
    THREE.MathUtils.clamp(z, -57, 5)
  );
  creature.visible = true;
  creatureVisible = true;
  creatureChasing = true;
  creatureLastTime = 0;
  playMonsterAppear();
  startChaseAudio();
}

function stopCreatureChase() {
  if (!creature) return;
  creature.visible = false;
  creatureVisible = false;
  creatureChasing = false;
  stopChaseAudio();
}

// Returns `true` if the creature touched the player this frame (caller
// should unlock the pointer). Returns `false` otherwise.
export function update(time, camera) {
  if (!creatureVisible) return false;

  if (creatureChasing) {
    const delta = creatureLastTime ? Math.min(time - creatureLastTime, 0.1) : 0;
    creatureLastTime = time;

    const dx = camera.position.x - creature.position.x;
    const dz = camera.position.z - creature.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < CREATURE_TOUCH_DISTANCE) {
      return true; // caller unlocks pointer → onPlayerUnlock will hide creature
    }

    creature.position.x += (dx / dist) * CREATURE_CHASE_SPEED * delta;
    creature.position.z += (dz / dist) * CREATURE_CHASE_SPEED * delta;

    creature.position.x = THREE.MathUtils.clamp(creature.position.x, -1.8, 1.8);
    creature.position.z = THREE.MathUtils.clamp(creature.position.z, -58, 6);

    creature.lookAt(camera.position.x, creature.position.y, camera.position.z);
    creature.position.y = -0.65 + Math.sin(time * 2) * 0.05;
  } else {
    creature.lookAt(camera.position.x, creature.position.y, camera.position.z);
    creature.rotation.z = Math.sin(time * 2) * 0.08;
    creature.position.y = -0.65 + Math.sin(time * 1.5) * 0.04;
  }
  return false;
}

// Kept for parity with the previous API; no timer is started anymore.
// The flow module decides when to spawn (currently: all 3 items collected).
export function onPlayerLock(_camera) {
  /* no-op */
}

export function onPlayerUnlock() {
  stopCreatureChase();
}
