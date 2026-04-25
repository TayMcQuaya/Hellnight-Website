// ─────────── Tunnel geometry: walls, floor, ceiling, beams, doors,
// side corridors, plain end-wall ───────────
//
// Public API:
//   createTunnel(scene)  – builds everything and adds it to the scene.
//                          Returns { tunnelGroup, doorMeshes }.
//   createWallTexture()  – cached, reusable canvas-based wall material.

import * as THREE from 'three';
import { createDoor } from './doors.js?v=14';

let cachedWallCanvas = null;

export function createWallTexture() {
  if (!cachedWallCanvas) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1a1512';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const brightness = 20 + Math.random() * 40;
      ctx.fillStyle = `rgba(${brightness}, ${brightness * 0.8}, ${brightness * 0.7}, 0.4)`;
      ctx.fillRect(x, y, Math.random() * 4 + 1, Math.random() * 4 + 1);
    }

    for (let i = 0; i < 15; i++) {
      const x = Math.random() * 512;
      ctx.strokeStyle = `rgba(80, 30, 20, ${Math.random() * 0.4})`;
      ctx.lineWidth = Math.random() * 8 + 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 60, 512);
      ctx.stroke();
    }
    cachedWallCanvas = canvas;
  }

  const texture = new THREE.CanvasTexture(cachedWallCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createSideCorridor(z, side) {
  const corridorGroup = new THREE.Group();
  const tunnelWidth = 5;
  const corridorDepth = 12;
  const corridorWidth = 4;

  const wallTexture = createWallTexture();
  wallTexture.repeat.set(2, 2);

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTexture,
    roughness: 0.7,
    metalness: 0.15,
    color: 0x3a3530,
    emissive: 0x150a08,
    emissiveIntensity: 0.5
  });

  const floorMat = new THREE.MeshStandardMaterial({
    map: wallTexture.clone(),
    roughness: 0.75,
    metalness: 0.1,
    color: 0x3a3535,
    emissive: 0x120808,
    emissiveIntensity: 0.4
  });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(corridorDepth, corridorWidth),
    floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = Math.PI / 2;
  floor.position.set(side * (tunnelWidth / 2 + corridorDepth / 2), -2, z);
  corridorGroup.add(floor);

  const ceiling = floor.clone();
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4;
  corridorGroup.add(ceiling);

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(corridorWidth, 6),
    wallMat
  );
  backWall.rotation.y = side > 0 ? Math.PI : 0;
  backWall.position.set(side * (tunnelWidth / 2 + corridorDepth), 1, z);
  corridorGroup.add(backWall);

  // Side walls run along the corridor depth (x), at the corridor's z=z±2
  // edges. PlaneGeometry default normal is +z, so no y-rotation: the plane's
  // local x (corridorDepth=12) maps to world x and the wall correctly spans
  // from the tunnel side wall outward to the corridor back wall. (Previously
  // these had rotation.y = ±π/2, which turned them into transverse walls at
  // x=±8.5 spanning 12 units along z — visible inside the Records and
  // Security rooms as a pass-through "wall" right in front of the back-wall
  // furniture.)
  const sideWall1 = new THREE.Mesh(
    new THREE.PlaneGeometry(corridorDepth, 6),
    wallMat
  );
  sideWall1.position.set(side * (tunnelWidth / 2 + corridorDepth / 2), 1, z - corridorWidth / 2);
  corridorGroup.add(sideWall1);

  const sideWall2 = sideWall1.clone();
  sideWall2.position.z = z + corridorWidth / 2;
  corridorGroup.add(sideWall2);

  const fixture = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.1, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.9 })
  );
  fixture.position.set(side * (tunnelWidth / 2 + corridorDepth - 2), 3.8, z);
  corridorGroup.add(fixture);

  if (Math.random() > 0.7) {
    const silhouette = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 2.5, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    silhouette.position.set(side * (tunnelWidth / 2 + corridorDepth - 1.5), 0.25, z);
    corridorGroup.add(silhouette);
  }

  return corridorGroup;
}

export function createTunnel(scene) {
  const tunnelGroup = new THREE.Group();

  const wallTexture = createWallTexture();
  wallTexture.repeat.set(3, 15);

  const tunnelLength = 180;
  const tunnelWidth = 5;

  const floorMat = new THREE.MeshStandardMaterial({
    map: wallTexture.clone(),
    roughness: 0.75,
    metalness: 0.1,
    color: 0x4a4040,
    emissive: 0x1a0a08,
    emissiveIntensity: 0.5
  });

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTexture.clone(),
    roughness: 0.7,
    metalness: 0.15,
    color: 0x4a4038,
    emissive: 0x1a0c08,
    emissiveIntensity: 0.6,
    side: THREE.DoubleSide,  // visible from inside rooms too
  });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(tunnelWidth, tunnelLength),
    floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -2, -tunnelLength / 2 + 20);
  tunnelGroup.add(floor);

  const ceiling = floor.clone();
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4;
  tunnelGroup.add(ceiling);

  // Walls — built as 6-unit-wide slices, but where a door sits the slice is
  // replaced by two 2-unit filler walls flanking the doorway. Doorframe is
  // 2 units wide, so we leave a 2-unit gap centred on doorZ for the actual
  // opening; the rest of the slice is filled with proper wall.
  const sliceLen = 6;
  const numSlices = Math.ceil(tunnelLength / sliceLen);
  const fullSliceGeo = new THREE.PlaneGeometry(sliceLen, 6);
  const fillerGeo = new THREE.PlaneGeometry(2, 6); // 2 wide in z

  const _doorMap = new Map(); // key: `${side}:${k}` → doorZ
  const _doorPlacementsForCuts = [
    { i: 1,  side:  1 }, { i: 3,  side: -1 }, { i: 5,  side:  1 },
    { i: 7,  side: -1 }, { i: 9,  side:  1 }, { i: 11, side: -1 },
  ];
  _doorPlacementsForCuts.forEach(({ i, side }) => {
    const k = i + 1;
    const doorZ = 11 - i * 6;
    _doorMap.set(`${side}:${k}`, doorZ);
  });

  function addWallPiece(side, geo, zCenter, yCenter = 1) {
    const slice = new THREE.Mesh(geo, wallMat);
    slice.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    slice.position.set(side * tunnelWidth / 2, yCenter, zCenter);
    tunnelGroup.add(slice);
  }

  // Above-door filler closes the gap between the doorframe top (world y≈1.5)
  // and the ceiling (y=4). Width matches the doorway opening (2 units in z),
  // height is 2.5 (from y=1.5 to y=4), centred at y=2.75.
  const aboveDoorGeo = new THREE.PlaneGeometry(2, 2.5);

  for (let k = 0; k < numSlices; k++) {
    const zCenter = 17 - k * sliceLen;
    for (const side of [-1, 1]) {
      const doorZ = _doorMap.get(`${side}:${k}`);
      if (doorZ === undefined) {
        addWallPiece(side, fullSliceGeo, zCenter);
      } else {
        // Two 2-unit fillers on either side of the 2-unit doorway
        addWallPiece(side, fillerGeo, doorZ - 2); // covers doorZ-3..doorZ-1
        addWallPiece(side, fillerGeo, doorZ + 2); // covers doorZ+1..doorZ+3
        // Cap above the doorframe so the room/tunnel can't be seen above it
        addWallPiece(side, aboveDoorGeo, doorZ, 2.75);
      }
    }
  }

  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x3a2520,
    roughness: 0.8,
    metalness: 0.25,
    emissive: 0x100505,
    emissiveIntensity: 0.3
  });

  // i=10 corridor (z=-52, side=-1) was removed: its 4-unit z-extent (-50..-54)
  // overlaps the Security room (i=11, side=-1, z=-59..-51) by 3 units, so its
  // decorative walls and floor poked into the room as pass-through "ghost walls"
  // on the left side when entering. Side corridors are decorative-only (the
  // tunnel wall has no opening for them, so they're never enterable), so
  // removing the conflict is harmless. The i=4 corridor (z=-16) is clear of
  // Records (z=-11..-3) by 3 units; i=18/i=24 are past the playable area.
  const corridorPositions = [4, 18, 24];

  // Door positions chosen so all 6 doors land within the playable z-range
  // [-55, 5]. doorZ = (8 - i*6) + 3 = 11 - i*6. Avoid corridor beam indices
  // [4, 10, 18, 24]. Alternate sides so they're staggered along the tunnel.
  //   i=1  → doorZ =  5 (right)
  //   i=3  → doorZ = -7 (left)
  //   i=5  → doorZ = -19 (right)
  //   i=7  → doorZ = -31 (left)
  //   i=9  → doorZ = -43 (right)
  //   i=11 → doorZ = -55 (left)
  const doorPlacements = [
    { i: 1,  side:  1 },
    { i: 3,  side: -1 },
    { i: 5,  side:  1 },
    { i: 7,  side: -1 },
    { i: 9,  side:  1 },
    { i: 11, side: -1 },
  ];

  for (let i = 0; i < 28; i++) {
    const z = 8 - i * 6;
    const isCorridorPos = corridorPositions.includes(i);

    if (!isCorridorPos) {
      const leftBeam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6, 0.2), beamMat);
      leftBeam.position.set(-tunnelWidth / 2 + 0.1, 1, z);
      tunnelGroup.add(leftBeam);

      const rightBeam = leftBeam.clone();
      rightBeam.position.x = tunnelWidth / 2 - 0.1;
      tunnelGroup.add(rightBeam);
    }

    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(tunnelWidth, 0.15, 0.15), beamMat);
    topBeam.position.set(0, 4, z);
    tunnelGroup.add(topBeam);

    if (i % 2 === 0) {
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 });

      const floorLightLeft = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.08, 0.15),
        lightMat
      );
      floorLightLeft.position.set(-tunnelWidth / 2 + 0.4, -1.95, z);
      tunnelGroup.add(floorLightLeft);

      const floorLightRight = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.08, 0.15),
        lightMat
      );
      floorLightRight.position.set(tunnelWidth / 2 - 0.4, -1.95, z);
      tunnelGroup.add(floorLightRight);

      const ceilingLightLeft = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.08, 0.15),
        lightMat
      );
      ceilingLightLeft.position.set(-tunnelWidth / 2 + 0.4, 3.95, z);
      tunnelGroup.add(ceilingLightLeft);

      const ceilingLightRight = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.08, 0.15),
        lightMat
      );
      ceilingLightRight.position.set(tunnelWidth / 2 - 0.4, 3.95, z);
      tunnelGroup.add(ceilingLightRight);
    }

    if (isCorridorPos) {
      const side = (i % 2 === 0) ? -1 : 1;
      const corridor = createSideCorridor(z, side);
      tunnelGroup.add(corridor);
    }

    const doorPlacement = doorPlacements.find(d => d.i === i);
    if (doorPlacement) {
      const doorZ = z + 3;
      const door = createDoor(doorZ, doorPlacement.side);
      tunnelGroup.add(door);
    }
  }

  // Pipes
  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x4a2525,
    roughness: 0.5,
    metalness: 0.5
  });

  const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, tunnelLength, 8), pipeMat);
  pipe1.rotation.x = Math.PI / 2;
  pipe1.position.set(-2, 3.5, -tunnelLength / 2 + 20);
  tunnelGroup.add(pipe1);

  const pipe2 = pipe1.clone();
  pipe2.position.x = 2;
  tunnelGroup.add(pipe2);

  // END WALL — plain wall behind the EXIT CONTROL panel
  const endWallZ = -62;

  const endWallTexture = createWallTexture();
  endWallTexture.repeat.set(2, 2);

  const endWall = new THREE.Mesh(
    new THREE.PlaneGeometry(tunnelWidth, 6),
    new THREE.MeshStandardMaterial({
      map: endWallTexture,
      roughness: 0.7,
      metalness: 0.15,
      color: 0x3a3530,
      emissive: 0x150a08,
      emissiveIntensity: 0.5
    })
  );
  endWall.position.set(0, 1, endWallZ);
  tunnelGroup.add(endWall);

  // (Previously a "Wanna Play?" bloody graffiti was rendered here.
  //  Removed because the EXIT CONTROL panel now sits in front of the
  //  wall and the graffiti competed with it visually.)

  // Subtle light illuminating the end wall
  const endWallLight = new THREE.PointLight(0xff2200, 1.5, 15);
  endWallLight.position.set(0, 2, endWallZ + 8);
  scene.add(endWallLight);

  scene.add(tunnelGroup);
  return { tunnelGroup, endWall };
}
