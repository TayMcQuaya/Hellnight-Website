// ─────────── Door geometry + interaction (E key open/close) ───────────
//
// Each door panel is wrapped in a THREE.Group whose origin sits at the hinge
// edge, so rotating that group swings the panel around the correct pivot
// instead of around its geometric centre.
//
// Public API:
//   createDoor(z, side) → doorGroup   (call during tunnel build)
//   updateDoorDetection(camera, raycaster, isExploring)  (per frame)
//   interactWithNearbyDoor()          (called on E keydown)
//   getDoorMeshes()                   (exposed for completeness)

import * as THREE from 'three';
import { playDoorCreak } from './audio.js?v=14';
import { showInteractionPrompt, hideInteractionPrompt } from './hud.js?v=14';

const DOOR_OPEN_ANGLE = -Math.PI / 2;   // swings away from the tunnel interior
const DOOR_TWEEN_SEC = 0.6;
const DOOR_LOOK_DISTANCE = 3.5;          // metres

const doorMeshes = [];
let nearbyDoor = null;

export function getDoorMeshes() {
  return doorMeshes;
}

export function hasNearbyDoor() {
  return nearbyDoor !== null;
}

// Snap every door back to its closed state (used on exploration exit reset).
export function resetAllDoors() {
  for (const door of doorMeshes) {
    if (door.userData.hingeGroup) door.userData.hingeGroup.rotation.y = 0;
    door.userData.isOpen = false;
    door.userData.animating = false;
  }
  nearbyDoor = null;
}

// True if there's an open door whose world z is within `tolerance` of `z`.
export function isDoorOpenAt(z, tolerance = 1.2) {
  for (const door of doorMeshes) {
    if (!door.userData.isOpen) continue;
    // Door's world position is determined by the doorGroup ancestor; cheaper
    // to look up the cached doorZ we stash on userData below.
    const doorZ = door.userData.doorZ;
    if (doorZ === undefined) continue;
    if (Math.abs(z - doorZ) < tolerance) return door;
  }
  return null;
}

export function createDoor(z, side) {
  const doorGroup = new THREE.Group();
  const tunnelWidth = 5;
  const doorHeight = 3.5;

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a15,
    roughness: 0.85,
    metalness: 0.3,
    emissive: 0x1a0a08,
    emissiveIntensity: 0.4
  });

  // Frame pieces stay with the door group (don't move with the hinge)
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 0.3), frameMat);
  frameTop.position.y = doorHeight;
  doorGroup.add(frameTop);

  const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, doorHeight, 0.3), frameMat);
  frameLeft.position.set(-0.9, doorHeight / 2, 0);
  doorGroup.add(frameLeft);

  const frameRight = frameLeft.clone();
  frameRight.position.x = 0.9;
  doorGroup.add(frameRight);

  // HINGE GROUP: everything that swings open goes in here. Origin at left edge
  // of door (x = -0.8 in doorGroup), so rotation pivots there instead of the
  // door's centre.
  const hingeGroup = new THREE.Group();
  hingeGroup.position.set(-0.8, 0, 0);

  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a22,
    roughness: 0.8,
    metalness: 0.2,
    emissive: 0x1a0a05,
    emissiveIntensity: 0.3
  });

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, doorHeight - 0.3, 0.12), doorMat);
  // Offset INSIDE the hinge group so the door visually stays in its original
  // place (hinge at x=-0.8, door centre at x=0 of doorGroup = x=+0.8 of hinge)
  door.position.set(0.8, doorHeight / 2, -0.15);
  hingeGroup.add(door);
  doorMeshes.push(door);

  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.12, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x5a4035, metalness: 0.6, roughness: 0.4 })
  );
  handle.position.set(1.3, 1.5, 0.02); // 0.5 + 0.8 offset because we're in hinge frame
  hingeGroup.add(handle);

  doorGroup.add(hingeGroup);

  // State + hinge ref on the door mesh so raycast hit → tween target
  door.userData.isOpen = false;
  door.userData.hingeGroup = hingeGroup;
  door.userData.animating = false;
  door.userData.doorZ = z;
  door.userData.side = side;

  // Alarm light stays on the frame above the door (not on the hinge).
  // Sits well above the room-name label (which is at world y=1.85, top y≈2.12)
  // so they don't overlap.
  const alarmLight = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.15, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.95 })
  );
  alarmLight.position.set(0, doorHeight + 1.5, 0.1); // world y ≈ 3.0
  doorGroup.add(alarmLight);

  if (Math.random() > 0.5) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.7 })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.02, 0.15);
    doorGroup.add(glow);
  }

  const x = (tunnelWidth / 2 - 0.05) * side;
  doorGroup.position.set(x, -2, z);
  doorGroup.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;

  return doorGroup;
}

const _forwardRay = new THREE.Vector2(0, 0); // camera-centre ray (crosshair)

export function updateDoorDetection(camera, raycaster, isExploring) {
  if (!isExploring || doorMeshes.length === 0) {
    if (nearbyDoor) {
      hideInteractionPrompt();
      nearbyDoor = null;
    }
    return;
  }

  raycaster.setFromCamera(_forwardRay, camera);
  const intersects = raycaster.intersectObjects(doorMeshes, false);

  if (intersects.length > 0 && intersects[0].distance < DOOR_LOOK_DISTANCE) {
    const door = intersects[0].object;
    if (nearbyDoor !== door) {
      nearbyDoor = door;
      showInteractionPrompt(
        door.userData.isOpen ? '[ E ] Close' : '[ E ] Open'
      );
    }
  } else if (nearbyDoor) {
    hideInteractionPrompt();
    nearbyDoor = null;
  }
}

export function interactWithNearbyDoor() {
  if (!nearbyDoor || nearbyDoor.userData.animating) return;

  const door = nearbyDoor;
  const hinge = door.userData.hingeGroup;
  const willOpen = !door.userData.isOpen;
  door.userData.isOpen = willOpen;
  door.userData.animating = true;

  const targetAngle = willOpen ? DOOR_OPEN_ANGLE : 0;

  // GSAP is loaded globally via CDN
  gsap.to(hinge.rotation, {
    y: targetAngle,
    duration: DOOR_TWEEN_SEC,
    ease: 'power2.inOut',
    onComplete: () => { door.userData.animating = false; }
  });

  playDoorCreak();

  // Refresh prompt to reflect new state
  showInteractionPrompt(willOpen ? '[ E ] Close' : '[ E ] Open');
}
