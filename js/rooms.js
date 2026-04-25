// ─────────── Room geometry: 6 boxes attached behind the doors ───────────
//
// Each door has a corresponding room. Rooms are simple 4-walls + floor +
// ceiling boxes with their own dim coloured light. Pickup items live inside.
//
// Public API:
//   createRooms(scene)       – builds all 6 rooms; returns array of room data
//   getRoomBounds()          – list of { minX, maxX, minZ, maxZ } volumes
//   getDoorOpening(zCenter)  – door opening between tunnel and room (for nav)

import * as THREE from 'three';
import { createWallTexture } from './tunnel.js?v=14';

// Room interior is 8 deep × 8 wide × 6 tall. Bigger than the wall slice
// (6 units), so we build two extra short inner-wall pieces inside each
// room to close the 1-unit gap on each z-end where the tunnel wall slice
// doesn't reach.
const ROOM_DEPTH_Z = 8;       // along z (along the tunnel)
const ROOM_WIDTH_X = 8;       // perpendicular to tunnel
const ROOM_HEIGHT  = 6;       // matches tunnel ceiling (-2 to +4)
const TUNNEL_SLICE_LEN = 6;   // must match tunnel.js

const TUNNEL_HALF_WIDTH = 2.5;

// Door placements (must match tunnel.js exactly).
// 3 fuses spread across the tunnel: storage (front), generator (middle —
// player MUST enter to grab one, so they see the lever), security (deep).
// Internal item IDs are distinct (fuse_a/b/c) but they all show as "Fuse";
// any fuse fits any panel slot.
const DOOR_PLACEMENTS = [
  { i: 1,  side:  1, theme: 'storage',     color: 0xffaa55, item: 'fuse_a' },
  { i: 3,  side: -1, theme: 'records',     color: 0x7799ff, item: null    }, // note hint
  { i: 5,  side:  1, theme: 'generator',   color: 0xff5522, item: 'fuse_b' }, // + power lever
  { i: 7,  side: -1, theme: 'lab',         color: 0x66ff99, item: null    }, // decoration
  { i: 9,  side:  1, theme: 'maintenance', color: 0xffdd55, item: null    }, // decoration
  { i: 11, side: -1, theme: 'security',    color: 0xff77aa, item: 'fuse_c' },
];

const roomBounds = [];   // { minX, maxX, minZ, maxZ, doorZ, side, theme }
const pickupMeshes = []; // pickup interactables for raycast

export function getRoomBounds() {
  return roomBounds;
}

export function getPickupMeshes() {
  return pickupMeshes;
}

export function getDoorPlacements() {
  return DOOR_PLACEMENTS;
}

export function createRooms(scene) {
  for (const placement of DOOR_PLACEMENTS) {
    const doorZ = 11 - placement.i * 6;
    buildRoom(scene, doorZ, placement);
  }
  return roomBounds.slice();
}

function buildRoom(scene, doorZ, placement) {
  const { side, theme, color, item } = placement;
  const group = new THREE.Group();

  const wallTex = createWallTexture();
  wallTex.repeat.set(2, 2);

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.7,
    metalness: 0.15,
    color: 0x3a2e28,
    emissive: 0x150a08,
    emissiveIntensity: 0.4,
    side: THREE.DoubleSide, // visible from inside AND from any angle
  });
  const floorMat = new THREE.MeshStandardMaterial({
    map: wallTex.clone(),
    roughness: 0.8,
    metalness: 0.1,
    color: 0x3a2f2c,
    emissive: 0x110806,
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  });

  // Room footprint:
  //   side=-1: x range [-7.5, -2.5] (left of tunnel)
  //   side=+1: x range [+2.5, +7.5]
  // z range: [doorZ - 2.5, doorZ + 2.5]
  const xInner = side * TUNNEL_HALF_WIDTH;             // wall flush with tunnel side
  const xOuter = side * (TUNNEL_HALF_WIDTH + ROOM_WIDTH_X);
  const xCenter = (xInner + xOuter) / 2;
  const zMin = doorZ - ROOM_DEPTH_Z / 2;
  const zMax = doorZ + ROOM_DEPTH_Z / 2;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_WIDTH_X, ROOM_DEPTH_Z),
    floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(xCenter, -2, doorZ);
  group.add(floor);

  // Ceiling
  const ceiling = floor.clone();
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4;
  group.add(ceiling);

  // Back wall (facing tunnel)
  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_WIDTH_X, ROOM_HEIGHT),
    wallMat
  );
  backWall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  backWall.position.set(xOuter, 1, doorZ);
  group.add(backWall);

  // Side walls (perpendicular to tunnel)
  const sideWallGeo = new THREE.PlaneGeometry(ROOM_WIDTH_X, ROOM_HEIGHT);
  const sideWall1 = new THREE.Mesh(sideWallGeo, wallMat);
  sideWall1.position.set(xCenter, 1, zMin);
  // Default plane normal is +z; we want it facing +z (toward zMax/inner room) → no rotation needed for back-side wall
  // But the side facing the OUTSIDE (toward zMin direction relative to room) should face +z (inward)
  sideWall1.rotation.y = 0; // facing +z (toward zMax = inward)
  group.add(sideWall1);

  const sideWall2 = new THREE.Mesh(sideWallGeo, wallMat);
  sideWall2.rotation.y = Math.PI;
  sideWall2.position.set(xCenter, 1, zMax);
  group.add(sideWall2);

  // (Inner-wall fillers removed — they overlapped with adjacent tunnel
  // wall slices on the same x=xInner plane and caused z-fighting visible as
  // a "wall only from one side" between the room's z-overhang and the door
  // wall. The tunnel slicing already covers those z ranges fully.)

  // Light: dim coloured point light per theme.
  // Generator room starts especially dim and brightens on power-on (Phase 5).
  const baseIntensity = theme === 'generator' ? 0.5 : 1.4;
  const light = new THREE.PointLight(color, baseIntensity, 12);
  light.position.set(xCenter, 2.5, doorZ);
  scene.add(light);

  // Tiny ceiling fixture so the light has a visual source
  const fixture = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.3),
    new THREE.MeshBasicMaterial({ color })
  );
  fixture.position.set(xCenter, 3.94, doorZ);
  group.add(fixture);

  // Theme-specific decorations — return AABB blockers so movement collides
  const blockers = addRoomDecor(group, theme, xCenter, doorZ, side, color);

  scene.add(group);

  // (Hint-note plane removed — players found it confusing as it appeared as
  // a stray wall and was pass-through. The objectives panel + large door
  // label on the generator room cover the same guidance more cleanly.)

  // Theme label above the doorframe — accent colour matches the room's light.
  // Sits right above the doorframe top (world y≈1.7) so it's at eye-level.
  const accentHex = '#' + color.toString(16).padStart(6, '0');
  const label = createDoorLabel(theme.toUpperCase(), accentHex);
  label.position.set(xInner - side * 0.06, 1.85, doorZ);
  label.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  scene.add(label);

  // Item pickup (if this room has one)
  if (item) {
    const pickup = createPickup(item, color);
    // Position at the back of the room on a small "shelf" plane
    pickup.position.set(xCenter + side * -0.8, -0.6, doorZ); // slight inward
    pickup.userData.itemId = item;
    pickup.userData.itemLabel = ITEM_LABELS[item] || item;
    scene.add(pickup);
    pickupMeshes.push(pickup);
  }

  // Register room bounds for movement clamping (slightly inset so player
  // doesn't clip into walls). Inner-side opens to tunnel at xInner.
  const inset = 0.4;
  const minX = side === -1 ? xOuter + inset : xInner;
  const maxX = side === -1 ? xInner          : xOuter - inset;
  roomBounds.push({
    minX,
    maxX,
    minZ: zMin + inset,
    maxZ: zMax - inset,
    doorZ,
    side,
    theme,
    light,
    xCenter,
    xInner,
    xOuter,
    blockers,
  });
}

export function getRoomByTheme(theme) {
  return roomBounds.find(r => r.theme === theme) || null;
}

// Re-create the pickup meshes that were removed when collected, putting
// each fuse back in its original room. Called on game reset.
export function respawnPickups(scene) {
  for (const m of pickupMeshes) {
    if (m.parent) m.parent.remove(m);
  }
  pickupMeshes.length = 0;

  for (const placement of DOOR_PLACEMENTS) {
    if (!placement.item) continue;
    const doorZ = 11 - placement.i * 6;
    const room = roomBounds.find(
      (r) => r.doorZ === doorZ && r.side === placement.side
    );
    if (!room) continue;
    const pickup = createPickup(placement.item, placement.color);
    pickup.position.set(
      room.xCenter + room.side * -0.8,
      -0.6,
      doorZ
    );
    pickup.userData.itemId = placement.item;
    pickup.userData.itemLabel = ITEM_LABELS[placement.item] || placement.item;
    scene.add(pickup);
    pickupMeshes.push(pickup);
  }
}

const ITEM_LABELS = {
  fuse_a: 'Fuse',
  fuse_b: 'Fuse',
  fuse_c: 'Fuse',
};

function addRoomDecor(group, theme, xCenter, doorZ, side, accentColor) {
  // Each meaningful obstacle is registered in `blockers` (XZ AABB only) so
  // movement collides with it. Tiny floor debris is purely cosmetic.
  const blockers = [];
  const backX  = xCenter + side * 2.0; // generic "back third" anchor
  const xOuter = xCenter + side * 4;   // actual back wall x
  // For wall-mounted objects: position = xOuter - side * (halfDepth + tiny)
  const wallMount = (halfDepth) => xOuter - side * (halfDepth + 0.005);

  function addObstacle(mesh, w, d, pad = 0.25) {
    group.add(mesh);
    blockers.push({
      minX: mesh.position.x - w / 2 - pad,
      maxX: mesh.position.x + w / 2 + pad,
      minZ: mesh.position.z - d / 2 - pad,
      maxZ: mesh.position.z + d / 2 + pad,
    });
  }

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x4a3220, roughness: 0.85, metalness: 0.05,
    emissive: 0x140a04, emissiveIntensity: 0.3,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x2a2e30, roughness: 0.5, metalness: 0.7,
    emissive: 0x080a0a,
  });
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xc9b58d, roughness: 0.9, emissive: 0x1a160c,
  });

  switch (theme) {
    case 'storage': {
      // Floor at y=-2; box center y = -2 + height/2 to sit on it.
      const crateA = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), woodMat);
      crateA.position.set(backX, -1.5, doorZ - 1.8);                   // -2 + 0.5
      addObstacle(crateA, 1.0, 1.0);
      const crateB = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), woodMat);
      crateB.position.set(backX - side * 0.3, -1.55, doorZ + 2.2);     // -2 + 0.45
      addObstacle(crateB, 0.9, 0.9);
      // crateC sits on top of crateB (top of B is at y = -1.55 + 0.45 = -1.1)
      const crateC = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), woodMat);
      crateC.position.set(backX - side * 0.3, -1.1 + 0.425, doorZ + 2.2);
      group.add(crateC);
      // Tipped barrel (cyl rotated 90° around z → axis along x; y radius = 0.35)
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 16), metalMat);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(xCenter + side * 0.4, -2 + 0.35, doorZ - 1.0);
      addObstacle(barrel, 0.9, 0.7);
      break;
    }
    case 'records': {
      // Row of filing cabinets along the entire back wall, touching each
      // other shoulder-to-shoulder. 0.6 deep, so 0.6 z-spacing per cabinet.
      const cabX = wallMount(0.35);
      const cabZs = [doorZ - 2.4, doorZ - 1.8, doorZ - 1.2, doorZ + 1.2, doorZ + 1.8, doorZ + 2.4];
      for (const cz of cabZs) {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.6), metalMat);
        cab.position.set(cabX, -2 + 0.8, cz);
        addObstacle(cab, 0.7, 0.6);
      }
      // Desk: legs 0.85 tall, top sits at y=-1.15 (legs from -2 to -1.15)
      const legHeight = 0.85;
      const deskTopY = -2 + legHeight;                                  // -1.15
      const desk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.7), woodMat);
      desk.position.set(backX, deskTopY + 0.05, doorZ + 1.6);           // -1.10
      addObstacle(desk, 1.4, 0.7);
      const deskLegL = new THREE.Mesh(new THREE.BoxGeometry(0.08, legHeight, 0.6), woodMat);
      deskLegL.position.set(backX - 0.65, -2 + legHeight / 2, doorZ + 1.6);
      group.add(deskLegL);
      const deskLegR = deskLegL.clone();
      deskLegR.position.x = backX + 0.65;
      group.add(deskLegR);
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), woodMat);
      chair.position.set(backX - side * 0.9, -2 + 0.45, doorZ + 1.6);   // -1.55
      addObstacle(chair, 0.5, 0.5);
      break;
    }
    case 'generator': {
      // Turbine: 1.6 tall, sits on floor
      const turbine = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 16), metalMat);
      turbine.position.set(backX, -2 + 0.8, doorZ - 2.2);
      addObstacle(turbine, 1.4, 1.4);

      // Vertical pipe rising from turbine top (y=-0.4) to overhead pipe (y=2.6)
      const PIPE_X = backX;
      const TURBINE_TOP_Y = -0.4;
      const JOINT_Y = 2.6;
      const verticalH = JOINT_Y - TURBINE_TOP_Y;                   // 3.0
      const pipe1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, verticalH, 12), metalMat);
      pipe1.position.set(PIPE_X, TURBINE_TOP_Y + verticalH / 2, doorZ - 2.2);
      group.add(pipe1);

      // Elbow joint sphere at the corner
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), metalMat);
      elbow.position.set(PIPE_X, JOINT_Y, doorZ - 2.2);
      group.add(elbow);

      // Overhead pipe spans the full room
      const pipe2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 8, 12), metalMat);
      pipe2.rotation.x = Math.PI / 2;
      pipe2.position.set(PIPE_X, JOINT_Y, doorZ);
      group.add(pipe2);

      // Auxiliary box near the lever
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), metalMat);
      box.position.set(backX - side * 1.2, -2 + 0.25, doorZ + 2.0);
      addObstacle(box, 0.6, 0.5);
      break;
    }
    case 'lab': {
      const legHeight = 0.85;
      const tableTopY = -2 + legHeight;                                // -1.15
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.7), metalMat);
      table.position.set(backX, tableTopY + 0.05, doorZ - 1.8);
      addObstacle(table, 1.6, 0.7);
      const tableLegL = new THREE.Mesh(new THREE.BoxGeometry(0.08, legHeight, 0.6), metalMat);
      tableLegL.position.set(backX - 0.75, -2 + legHeight / 2, doorZ - 1.8);
      group.add(tableLegL);
      const tableLegR = tableLegL.clone();
      tableLegR.position.x = backX + 0.75;
      group.add(tableLegR);
      const beakerMat = new THREE.MeshStandardMaterial({
        color: 0x66ff99, transparent: true, opacity: 0.5,
        emissive: 0x33aa66, emissiveIntensity: 0.6,
      });
      const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.4, 16), beakerMat);
      beaker.position.set(backX - 0.4, tableTopY + 0.1 + 0.2, doorZ - 1.8);
      group.add(beaker);
      const files = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.3), paperMat);
      files.position.set(backX + 0.5, tableTopY + 0.1 + 0.09, doorZ - 1.8);
      group.add(files);
      // Second table — gets its own legs so it doesn't float
      const lowLegH = 0.7;
      const lowTopY = -2 + lowLegH;                                    // -1.3
      const table2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.6), metalMat);
      table2.position.set(backX, lowTopY + 0.05, doorZ + 1.6);
      addObstacle(table2, 1.0, 0.6);
      const t2Leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, lowLegH, 0.5), metalMat);
      t2Leg.position.set(backX - 0.45, -2 + lowLegH / 2, doorZ + 1.6);
      group.add(t2Leg);
      const t2LegR = t2Leg.clone();
      t2LegR.position.x = backX + 0.45;
      group.add(t2LegR);
      // Toppled stool — rotated cylinder lies on its side; y radius = 0.2
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 12), metalMat);
      stool.rotation.z = Math.PI / 2;
      stool.position.set(xCenter + side * 1.2, -2 + 0.2, doorZ + 1.0); // -1.8
      addObstacle(stool, 0.7, 0.4);
      break;
    }
    case 'maintenance': {
      const pipeMat = new THREE.MeshStandardMaterial({
        color: 0x5a3525, roughness: 0.5, metalness: 0.6,
      });
      const PIPE_X = backX + side * 0.4;
      const JOINT_Y = 2.6;
      const JOINT_Z = doorZ - 2.5;

      // Vertical pipe: floor → joint height (so it actually meets the overhead)
      const verticalH = JOINT_Y - (-2);                                 // 4.6
      const verticalPipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, verticalH, 12), pipeMat);
      verticalPipe.position.set(PIPE_X, -2 + verticalH / 2, JOINT_Z);   // center 0.3
      addObstacle(verticalPipe, 0.32, 0.32);

      // Elbow joint sphere at the corner so the bend reads as connected
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), pipeMat);
      elbow.position.set(PIPE_X, JOINT_Y, JOINT_Z);
      group.add(elbow);

      // Overhead horizontal pipe (full room length, axis along z)
      const horizontalPipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 8, 12), pipeMat);
      horizontalPipe.rotation.x = Math.PI / 2;
      horizontalPipe.position.set(PIPE_X, JOINT_Y, doorZ);
      group.add(horizontalPipe);

      // Wall-mounted breaker box (flush with the back wall)
      const breakerBox = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.6), metalMat);
      breakerBox.position.set(wallMount(0.075), 1.0, doorZ + 2.5);
      group.add(breakerBox);
      // Cable bundle dangling from the bottom of the breaker
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), metalMat);
      cable.position.set(wallMount(0.04), 0.2, doorZ + 2.5);
      group.add(cable);

      // Toolbox on floor
      const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.45), metalMat);
      toolbox.position.set(backX, -2 + 0.175, doorZ + 2.0);
      addObstacle(toolbox, 0.7, 0.45);

      // Workbench
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.7), woodMat);
      bench.position.set(backX, -2 + 0.45, doorZ + 0.5);
      addObstacle(bench, 1.6, 0.7);

      // Stack of pipes on the floor (rotated cyl)
      const pipeStack = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 12), pipeMat);
      pipeStack.rotation.z = Math.PI / 2;
      pipeStack.position.set(xCenter + side * 1.2, -2 + 0.1, doorZ - 1.5);
      addObstacle(pipeStack, 1.6, 0.4);

      // Oil barrel
      const barrelMat = new THREE.MeshStandardMaterial({
        color: 0x2a2418, roughness: 0.7, metalness: 0.4, emissive: 0x100806,
      });
      const oilBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.1, 16), barrelMat);
      oilBarrel.position.set(xCenter + side * 1.2, -2 + 0.55, doorZ + 1.5);
      addObstacle(oilBarrel, 0.9, 0.9);

      // Cardboard box stacked on the bench
      const cardboard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.45), woodMat);
      cardboard.position.set(backX, -2 + 0.9 + 0.225, doorZ + 0.5);
      group.add(cardboard);

      // Bare bulb hanging from the pipe (visual only)
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffeebb })
      );
      bulb.position.set(PIPE_X, 1.6, doorZ + 1.5);
      group.add(bulb);
      const bulbWire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 1.0, 6),
        new THREE.MeshStandardMaterial({ color: 0x222 }));
      bulbWire.position.set(PIPE_X, 2.1, doorZ + 1.5);
      group.add(bulbWire);
      break;
    }
    case 'security': {
      // Long row of lockers flush against the back wall (5 of them)
      const lockerX = wallMount(0.275);
      for (let i = 0; i < 5; i++) {
        const locker = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.5), metalMat);
        locker.position.set(lockerX, -2 + 0.9, doorZ - 2.5 + i * 0.5);
        addObstacle(locker, 0.55, 0.5);
      }

      // Security desk along the back wall. Box dimensions (BoxGeometry order:
      // width=x, height=y, depth=z). For wall-mount, the relevant axis is x —
      // the *width* halved is what we feed to wallMount, NOT the box's depth.
      const deskH = 0.95;
      const deskTopY = -2 + deskH;
      const deskZ = doorZ + 2.5;
      const deskX = wallMount(0.325); // x half-width
      const securityDesk = new THREE.Mesh(new THREE.BoxGeometry(0.65, deskH, 1.4), woodMat);
      securityDesk.position.set(deskX, -2 + deskH / 2, deskZ);
      addObstacle(securityDesk, 0.65, 1.4);

      // Two monitors on the desk
      const monitorBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), metalMat);
      monitorBody.position.set(deskX, deskTopY + 0.25, deskZ - 0.35);
      addObstacle(monitorBody, 0.55, 0.5);
      const monitor2 = monitorBody.clone();
      monitor2.position.set(deskX, deskTopY + 0.25, deskZ + 0.35);
      addObstacle(monitor2, 0.55, 0.5);

      // Glowing screens on the monitors' room-facing side
      const screenMat = new THREE.MeshBasicMaterial({
        color: 0x4488ff, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide,
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.35), screenMat);
      screen.position.set(deskX - side * 0.28, deskTopY + 0.25, deskZ - 0.35);
      screen.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(screen);
      const screen2 = screen.clone();
      screen2.position.z = deskZ + 0.35;
      group.add(screen2);

      // Swivel chair in front of the desk (room interior side, NOT behind wall)
      const chairX = deskX - side * 0.9;
      const chairBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.5, 12), metalMat);
      chairBase.position.set(chairX, -2 + 0.25, deskZ);
      group.add(chairBase);
      const chairSeat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16), woodMat);
      chairSeat.position.set(chairX, -2 + 0.55, deskZ);
      addObstacle(chairSeat, 0.5, 0.5);
      // (Chair back removed — its 0.06-thick Box read as a thin pass-through
      // wall when viewed edge-on.)

      // Small file cabinet near the door
      const fileCab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.5), metalMat);
      fileCab.position.set(lockerX, -2 + 0.45, doorZ + 0.5);
      addObstacle(fileCab, 0.55, 0.5);

      // A safe on the floor
      const safe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.6), metalMat);
      safe.position.set(xCenter + side * 1.6, -2 + 0.35, doorZ + 1.5);
      addObstacle(safe, 0.7, 0.6);
      // Safe door circle
      const dial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.04, 16),
        new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8, roughness: 0.3 })
      );
      dial.rotation.x = Math.PI / 2;
      dial.position.set(xCenter + side * 1.6, -2 + 0.35, doorZ + 1.5 - 0.31);
      group.add(dial);

      // "AUTHORIZED ONLY" wall sign above the lockers
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 384; signCanvas.height = 80;
      const sctx = signCanvas.getContext('2d');
      sctx.fillStyle = 'rgba(20, 0, 5, 0.9)';
      sctx.fillRect(0, 0, 384, 80);
      sctx.fillStyle = '#ff77aa';
      sctx.fillRect(0, 0, 384, 3);
      sctx.fillRect(0, 77, 384, 3);
      sctx.font = 'bold 44px "Share Tech Mono", monospace';
      sctx.fillStyle = '#ffaadd';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText('AUTHORIZED ONLY', 192, 40);
      const signTex = new THREE.CanvasTexture(signCanvas);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.3),
        new THREE.MeshBasicMaterial({
          map: signTex, transparent: true, depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      sign.position.set(wallMount(0.005), 2.4, doorZ);
      sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(sign);
      break;
    }
  }

  // Cosmetic floor debris (no collision — small, lies flat).
  const debris = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.18), woodMat);
  debris.rotation.y = Math.random() * Math.PI;
  debris.position.set(xCenter + side * 1.5, -1.92, doorZ - 0.8);
  group.add(debris);

  return blockers;
}

function createWallNote(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // Aged paper background
  ctx.fillStyle = '#ddc99e';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(120, 80, 40, 0.15)';
  for (let i = 0; i < 80; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 256, Math.random() * 6, Math.random() * 6);
  }
  // Hand-written-ish text
  ctx.fillStyle = '#3a1a08';
  ctx.font = 'bold 38px "Special Elite", "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  const startY = 128 - (lines.length - 1) * 20;
  lines.forEach((line, i) => ctx.fillText(line, 256, startY + i * 42));
  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.7),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
}

function createDoorLabel(text, accentHex = '#ffaa66') {
  // Larger canvas + larger plane → readable from across the tunnel.
  const W = 768, H = 160;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Dark backing strip so the text stands out against any wall colour
  ctx.fillStyle = 'rgba(10, 5, 5, 0.85)';
  ctx.fillRect(0, 0, W, H);
  // Top + bottom accent stripes
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, W, 4);
  ctx.fillRect(0, H - 4, W, 4);

  ctx.font = 'bold 80px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Outer glow
  ctx.shadowColor = accentHex;
  ctx.shadowBlur = 28;
  ctx.fillStyle = accentHex;
  ctx.fillText(text, W / 2, H / 2 + 4);
  // Sharp inner highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, W / 2, H / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.55),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
}

function createPickup(itemId, accentColor) {
  // Slight emissive glow so items stand out against dim rooms.
  const mat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.8,
    roughness: 0.4,
    metalness: 0.5,
  });

  // All pickups are fuses now — bigger so they read clearly from across the
  // room AND give the crosshair a generous target to hit.
  let mesh;
  if (itemId === 'fuse_a' || itemId === 'fuse_b' || itemId === 'fuse_c') {
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.55, 18),
      mat
    );
  } else {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), mat);
  }
  mesh.castShadow = false;
  return mesh;
}

// Helper: returns true if x,z is inside any room's footprint (or in the
// doorway transition near a door at the tunnel wall).
export function pointInRoom(x, z) {
  for (const r of roomBounds) {
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r;
  }
  return null;
}

// Returns the room that the player at (x, z) facing into would enter through
// an open door. Used to extend tunnel clamping at doorways.
export function nearbyRoomDoorway(x, z) {
  // Player must be in tunnel x-range and very close to a door's z
  for (const r of roomBounds) {
    if (Math.abs(z - r.doorZ) < 1.1) return r;
  }
  return null;
}
