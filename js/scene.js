// ─────────── Three.js scene setup, animate loop, controls,
// post-processing, fog, lights, and scroll triggers ───────────
//
// Public API:
//   init(opts)           – build the scene; opts: { reducedMotion: boolean }
//   triggerMassFlicker() – flicker tunnel lights (used by scroll triggers)
//   triggerBlackout()    – brief blackout
//   triggerDistortion()  – chromatic aberration sting

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ChromaticAberrationEffect,
  VignetteEffect,
  NoiseEffect,
  BlendFunction
} from 'postprocessing';

import { createTunnel } from './tunnel.js?v=14';
import * as creature from './creature.js?v=14';
import {
  updateDoorDetection,
  interactWithNearbyDoor,
  isDoorOpenAt,
  hasNearbyDoor,
  resetAllDoors
} from './doors.js?v=14';
import { createRooms, getRoomBounds, respawnPickups } from './rooms.js?v=14';
import {
  updatePickupDetection,
  pickUpNearby,
  setupInventoryHUD,
  getNearbyPickup,
  updatePickupAnimations,
  maybeRespawnCreatureOnReentry
} from './inventory.js?v=14';
import {
  buildPowerLever,
  buildEndWallPanel,
  updateLeverDetection,
  updatePanelDetection,
  hasNearbyLever,
  hasNearbyPanelTarget,
  pullNearbyLever,
  activateNearbyPanelTarget,
  resetPuzzles,
} from './puzzles.js?v=14';
import { startGame, resetGameState, markCaught, gameState, events as gameEvents } from './game.js?v=14';
import { hideInteractionPrompt, setupWinScreen, setupLoseScreen, setupObjectives, setObjectivesVisible } from './hud.js?v=14';
import {
  initAudio,
  setupAudioToggle,
  toggleAudioMuted
} from './audio.js?v=14';

// Module state
let scene = null;
let camera = null;
let renderer = null;
let composer = null;
let bloomEffect, chromaticAberrationEffect, noiseEffect;
let tunnelGroup = null;
let flashlight = null;
let fogLayers = null;
let controls = null;
let reducedMotion = false;

let currentSection = 0;
let targetZ = 5;
let currentZ = 5;
const sectionDepth = 20;

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

let isExploring = false;
const moveState = { forward: false, backward: false, left: false, right: false, sprint: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

const tunnelLights = [];

export function init({ reducedMotion: rm = false } = {}) {
  reducedMotion = rm;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050202);
  scene.fog = new THREE.FogExp2(0x050202, 0.045);

  camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 0.5, 5);
  camera.lookAt(0, 0.5, -10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('tunnel-container').appendChild(renderer.domElement);

  const tunnel = createTunnel(scene);
  tunnelGroup = tunnel.tunnelGroup;

  createRooms(scene);
  buildPowerLever(scene);
  buildEndWallPanel(scene, tunnel.endWall);

  createLights();
  createFlashlight();
  createFogLayers();
  creature.init(scene);

  setupPostProcessing();
  setupMouseTracking();
  initExplorationControls();
  setupAudioToggle();
  setupInventoryHUD();
  setupObjectives();
  setObjectivesVisible(false); // hidden until exploration starts
  setupWinScreen();
  setupLoseScreen(() => {
    // Called when the user clicks "Try again" on the lose screen
    resetAllDoors();
    resetPuzzles();
    respawnPickups(scene);
    resetGameState();
    resetClampHistory();
    camera.position.set(0, 0.5, currentZ);
    camera.rotation.set(0, 0, 0);
    if (controls && controls._euler) controls._euler.set(0, 0, 0, controls._euler.order);
  });

  // Win event from puzzles.js → unlock pointer so player sees the screen
  gameEvents.addEventListener('win', () => {
    setTimeout(() => {
      if (controls && controls.isLocked) controls.unlock();
    }, 1800);
  });

  window.addEventListener('resize', onWindowResize);
  setupScrollDetection();
  setupScrollEvents();

  animate();
}

function createLights() {
  const ambient = new THREE.AmbientLight(0x3a2828, 2.2);
  scene.add(ambient);

  for (let i = 0; i < 12; i++) {
    const z = 6 - i * 14;

    const light = new THREE.PointLight(0xff2200, 5, 35);
    light.position.set(0, 3.5, z);
    scene.add(light);

    tunnelLights.push({
      light,
      baseIntensity: 5,
      flickerPhase: Math.random() * Math.PI * 2
    });

    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.12, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xff6633 })
    );
    fixture.position.set(0, 3.92, z);
    tunnelGroup.add(fixture);

    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xffaa66 })
    );
    core.position.set(0, 3.9, z);
    tunnelGroup.add(core);
  }
}

function createFlashlight() {
  flashlight = new THREE.SpotLight(0xffeedd, 5, 50, Math.PI / 5, 0.3, 0.5);
  flashlight.position.copy(camera.position);
  scene.add(flashlight);
  scene.add(flashlight.target);
}

function createFogLayers() {
  fogLayers = new THREE.Group();

  const fogMaterial = new THREE.MeshBasicMaterial({
    color: 0x1a0a0a,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  for (let i = 0; i < 25; i++) {
    const fog = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 5),
      fogMaterial.clone()
    );
    fog.position.set(0, 0.5, 5 - i * 4);
    fog.material.opacity = 0.05 + (i / 25) * 0.1;
    fogLayers.add(fog);
  }

  scene.add(fogLayers);
}

function setupMouseTracking() {
  document.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });
}

function updateFlashlight() {
  flashlight.position.copy(camera.position);

  if (isExploring) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const targetPoint = camera.position.clone().add(dir.multiplyScalar(20));
    flashlight.target.position.copy(targetPoint);
  } else {
    raycaster.setFromCamera(mouse, camera);
    const targetPoint = camera.position.clone().add(
      raycaster.ray.direction.multiplyScalar(20)
    );
    flashlight.target.position.copy(targetPoint);
  }
}

function updateCameraParallax() {
  const lookX = -mouse.x * 0.03;
  const lookY = mouse.y * 0.02;
  camera.rotation.x = lookY;
  camera.rotation.y = lookX;
}

function updateLightFlicker(time) {
  if (reducedMotion) return;
  tunnelLights.forEach((lightData) => {
    const { light, baseIntensity, flickerPhase } = lightData;

    const flicker =
      Math.sin(time * 5 + flickerPhase) * 0.1 +
      Math.sin(time * 13 + flickerPhase * 2) * 0.05 +
      (Math.random() > 0.995 ? -0.4 : 0);

    light.intensity = baseIntensity * (1 + flicker);
  });
}

export function triggerMassFlicker(duration = 2000) {
  if (reducedMotion) return;
  const startTime = performance.now();

  function flicker() {
    const elapsed = performance.now() - startTime;
    if (elapsed > duration) {
      tunnelLights.forEach(l => l.light.intensity = l.baseIntensity);
      return;
    }

    // Keep interval >= 333ms (3Hz max) to stay under WCAG 2.3.1 threshold
    tunnelLights.forEach(l => {
      l.light.intensity = Math.random() > 0.5 ? l.baseIntensity * 0.3 : l.baseIntensity * 1.3;
    });

    setTimeout(flicker, 340 + Math.random() * 120);
  }

  flicker();
}

export function triggerBlackout(duration = 500) {
  if (reducedMotion) return;
  const originalIntensities = tunnelLights.map(l => l.light.intensity);
  tunnelLights.forEach(l => l.light.intensity = 0);
  flashlight.intensity = 0;

  setTimeout(() => {
    tunnelLights.forEach((l, i) => l.light.intensity = originalIntensities[i]);
    flashlight.intensity = 5;
  }, duration);
}

export function triggerDistortion(intensity = 0.01, duration = 500) {
  if (reducedMotion || !chromaticAberrationEffect) return;
  const originalOffset = 0.002;
  chromaticAberrationEffect.offset.set(intensity, intensity);

  setTimeout(() => {
    chromaticAberrationEffect.offset.set(originalOffset, originalOffset);
  }, duration);
}

function initExplorationControls() {
  controls = new PointerLockControls(camera, document.body);
  // Constrain pitch so you can't look past straight-up/straight-down — without
  // these limits PointerLockControls flips the yaw 180° at the pole, which
  // shows up as a sudden "mouse spin" in random directions.
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI - 0.05;

  // Browsers occasionally deliver mousemove events with absurd movementX/Y
  // deltas (hundreds to thousands of pixels in a single event) — usually when
  // pointer lock is briefly lost/regained on focus changes, alerts, or
  // extension interference. PointerLockControls applies that delta directly
  // to the camera euler, so a single bad event yanks the view across the
  // room. Filter at the capture phase BEFORE PointerLockControls' bubble-
  // phase listener gets it, so it never sees the spike.
  const MAX_PIXELS_PER_EVENT = 200;
  document.addEventListener('mousemove', (e) => {
    if (!controls.isLocked) return;
    if (Math.abs(e.movementX) > MAX_PIXELS_PER_EVENT ||
        Math.abs(e.movementY) > MAX_PIXELS_PER_EVENT) {
      e.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    // M works globally — no text inputs on the page
    if (e.code === 'KeyM') {
      toggleAudioMuted();
      return;
    }
    if (!isExploring) return;
    switch(e.code) {
      case 'KeyW': moveState.forward = true; break;
      case 'KeyS': moveState.backward = true; break;
      case 'KeyA': moveState.left = true; break;
      case 'KeyD': moveState.right = true; break;
      case 'ShiftLeft':
      case 'ShiftRight': moveState.sprint = true; break;
      case 'KeyE':
        // Priority: door → lever → end-wall panel → pickup
        if (hasNearbyDoor()) interactWithNearbyDoor();
        else if (hasNearbyLever()) pullNearbyLever();
        else if (hasNearbyPanelTarget()) activateNearbyPanelTarget();
        else if (getNearbyPickup()) pickUpNearby();
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    switch(e.code) {
      case 'KeyW': moveState.forward = false; break;
      case 'KeyS': moveState.backward = false; break;
      case 'KeyA': moveState.left = false; break;
      case 'KeyD': moveState.right = false; break;
      case 'ShiftLeft':
      case 'ShiftRight': moveState.sprint = false; break;
    }
  });

  controls.addEventListener('lock', () => {
    isExploring = true;
    startGame();
    document.querySelector('.scroll-container').style.display = 'none';
    document.querySelector('header').style.display = 'none';
    document.querySelector('.depth-indicator').style.display = 'none';
    document.getElementById('crosshair').style.display = 'block';
    setObjectivesVisible(true);

    const onboarding = document.getElementById('onboarding');
    onboarding.classList.add('visible');
    setTimeout(() => onboarding.classList.remove('visible'), 3500);

    creature.onPlayerLock(camera);

    // If the player got caught and is re-entering with a full inventory,
    // bring the creature back at the entrance immediately.
    maybeRespawnCreatureOnReentry();
  });

  controls.addEventListener('unlock', () => {
    isExploring = false;
    document.querySelector('.scroll-container').style.display = 'block';
    document.querySelector('header').style.display = 'flex';
    document.querySelector('.depth-indicator').style.display = 'flex';
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('onboarding').classList.remove('visible');
    hideInteractionPrompt();
    setObjectivesVisible(false);

    creature.onPlayerUnlock();

    // Always reset on unlock — manual ESC, caught, win, or any edge case
    // that drops the user back to the scrolling text view should leave the
    // world in a clean state for the next entry. The win/lose overlays are
    // dispatched by their game events (which already fired), so resetting
    // game state here doesn't hide them; it only ensures doors, puzzles,
    // pickups, inventory, and camera are fresh on the next lock.
    resetAllDoors();
    resetPuzzles();
    respawnPickups(scene);
    resetGameState();
    resetClampHistory();
    camera.position.set(0, 0.5, currentZ);
    camera.rotation.set(0, 0, 0);
    if (controls && controls._euler) controls._euler.set(0, 0, 0, controls._euler.order);
  });

  document.querySelector('.cta-btn').addEventListener('click', () => {
    controls.lock();
  });
}

function updateMovement() {
  if (!isExploring) return;

  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  prevTime = time;

  const speed = moveState.sprint ? 120.0 : 50.0;

  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;

  direction.z = Number(moveState.forward) - Number(moveState.backward);
  direction.x = Number(moveState.right) - Number(moveState.left);
  direction.normalize();

  if (moveState.forward || moveState.backward) {
    velocity.z -= direction.z * speed * delta;
  }
  if (moveState.left || moveState.right) {
    velocity.x -= direction.x * speed * delta;
  }

  controls.moveRight(-velocity.x * delta);
  controls.moveForward(-velocity.z * delta);

  camera.position.y = 0.5;

  clampPlayerPosition(camera.position);
}

// Multi-volume clamp. The tunnel and each room are separate volumes; the
// player crosses between them through doorways. To avoid teleport-snap at
// volume boundaries we use position to decide which volume rules apply,
// with a fallback that finds the NEAREST room when the player is past the
// tunnel walls but z is outside the room footprint.
const TUNNEL_INNER_X = 2.4;  // clamp 0.1 inside the wall at x=±2.5
const TUNNEL_MIN_Z = -58;
const TUNNEL_MAX_Z = 6;

// Previous frame's clamped position — used for anti-tunnelling sweep tests.
// Initialised on first call.
let _prevX = 0;
let _prevZ = 5;
let _prevValid = false;

function clampPlayerPosition(pos) {
  const rooms = getRoomBounds();

  // ── Anti-tunnelling: detect cross of x=±2.5 plane through a non-doorway ──
  if (_prevValid) {
    for (const wallX of [-2.5, 2.5]) {
      const wasInside  = _prevX > wallX;
      const isInside   = pos.x  > wallX;
      const wasOutside = _prevX < wallX;
      const isOutside  = pos.x  < wallX;
      if (wasInside !== isInside) {
        // Crossed this wall — find the z at the crossing point
        const t = (wallX - _prevX) / (pos.x - _prevX);
        const zAtCross = _prevZ + t * (pos.z - _prevZ);
        const side = wallX < 0 ? -1 : 1;
        const door = rooms.find(r =>
          r.side === side && Math.abs(zAtCross - r.doorZ) < 1.0
        );
        const allowed = door && isDoorOpenAt(door.doorZ, 1.2);
        if (!allowed) {
          // Push back to the previous valid position (don't pass through wall)
          pos.x = _prevX;
          pos.z = _prevZ;
        }
      }
    }
  }

  // CASE A: player is past one of the tunnel walls (|x| > 2.5)
  // → they belong to a room; find which one (or snap to nearest by z+side)
  if (Math.abs(pos.x) > 2.5) {
    const side = pos.x < 0 ? -1 : 1;
    let best = null;
    let bestDist = Infinity;
    for (const r of rooms) {
      if (r.side !== side) continue;
      // Score: 0 if inside the room footprint, else distance to its centre
      const inX = pos.x >= r.minX && pos.x <= r.maxX;
      const inZ = pos.z >= r.minZ && pos.z <= r.maxZ;
      let dist;
      if (inX && inZ) { best = r; bestDist = 0; break; }
      const dz = Math.abs(pos.z - r.doorZ);
      const dx = inX ? 0 : Math.min(Math.abs(pos.x - r.minX), Math.abs(pos.x - r.maxX));
      dist = dz * 4 + dx; // weight z heavily so we pick the right room first
      if (dist < bestDist) { bestDist = dist; best = r; }
    }
    if (best) {
      pos.x = THREE.MathUtils.clamp(pos.x, best.minX, best.maxX);
      pos.z = THREE.MathUtils.clamp(pos.z, best.minZ, best.maxZ);
      resolveBlockers(pos, best.blockers);
      _prevX = pos.x; _prevZ = pos.z; _prevValid = true;
      return;
    }
    // Shouldn't happen with 6 rooms covering both sides, but be safe
    pos.x = THREE.MathUtils.clamp(pos.x, -TUNNEL_INNER_X, TUNNEL_INNER_X);
    pos.z = THREE.MathUtils.clamp(pos.z, TUNNEL_MIN_Z, TUNNEL_MAX_Z);
    _prevX = pos.x; _prevZ = pos.z; _prevValid = true;
    return;
  }

  // CASE B: player is inside the tunnel x-range (|x| ≤ 2.5)
  let minX = -TUNNEL_INNER_X;
  let maxX =  TUNNEL_INNER_X;

  // If a door is open and the player is at that door's z, allow them to step
  // through into the room. Tolerance is the actual doorway width (~1 unit).
  for (const r of rooms) {
    if (Math.abs(pos.z - r.doorZ) < 1.0 && isDoorOpenAt(r.doorZ, 1.5)) {
      if (r.side === -1) minX = r.minX;
      else                maxX = r.maxX;
    }
  }

  pos.x = THREE.MathUtils.clamp(pos.x, minX, maxX);
  pos.z = THREE.MathUtils.clamp(pos.z, TUNNEL_MIN_Z, TUNNEL_MAX_Z);
  _prevX = pos.x;
  _prevZ = pos.z;
  _prevValid = true;
}

function resetClampHistory() {
  _prevValid = false;
}

// Push the player out of any blocker AABBs they've ended up inside.
// XZ-only collision (camera y is fixed at 0.5).
function resolveBlockers(pos, blockers) {
  if (!blockers || blockers.length === 0) return;
  for (const b of blockers) {
    if (pos.x < b.minX || pos.x > b.maxX) continue;
    if (pos.z < b.minZ || pos.z > b.maxZ) continue;
    // Inside this blocker — push out along the closest face
    const dxL = pos.x - b.minX;
    const dxR = b.maxX - pos.x;
    const dzL = pos.z - b.minZ;
    const dzR = b.maxZ - pos.z;
    const m = Math.min(dxL, dxR, dzL, dzR);
    if (m === dxL)      pos.x = b.minX;
    else if (m === dxR) pos.x = b.maxX;
    else if (m === dzL) pos.z = b.minZ;
    else                pos.z = b.maxZ;
  }
}

function setupPostProcessing() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bloomEffect = new BloomEffect({
    intensity: 1.5,
    luminanceThreshold: 0.2,
    luminanceSmoothing: 0.8,
    mipmapBlur: true
  });

  const vignetteEffect = new VignetteEffect({
    darkness: 0.6,
    offset: 0.3
  });

  if (reducedMotion) {
    composer.addPass(new EffectPass(camera, bloomEffect, vignetteEffect));
    return;
  }

  chromaticAberrationEffect = new ChromaticAberrationEffect({
    offset: new THREE.Vector2(0.002, 0.002),
    radialModulation: true,
    modulationOffset: 0.15
  });

  noiseEffect = new NoiseEffect({
    blendFunction: BlendFunction.OVERLAY,
    premultiply: true
  });
  noiseEffect.blendMode.opacity.value = 0.12;

  composer.addPass(new EffectPass(camera,
    bloomEffect,
    chromaticAberrationEffect,
    vignetteEffect,
    noiseEffect
  ));
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function setupScrollDetection() {
  const chambers = document.querySelectorAll('.chamber');
  const dots = document.querySelectorAll('.depth-dot');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const index = Array.from(chambers).indexOf(entry.target);
        currentSection = index;
        targetZ = 5 - index * sectionDepth;

        dots.forEach((dot, i) => {
          dot.classList.toggle('active', i === index);
        });
      }
    });
  }, { threshold: 0.5 });

  chambers.forEach(chamber => observer.observe(chamber));
}

function setupScrollEvents() {
  // GSAP + ScrollTrigger are loaded globally via CDN <script> tags
  gsap.registerPlugin(ScrollTrigger);

  ScrollTrigger.create({
    trigger: '#chamber-1',
    start: 'top center',
    onEnter: () => {
      triggerMassFlicker(800);
    }
  });

  ScrollTrigger.create({
    trigger: '#chamber-2',
    start: 'top center',
    onEnter: () => {
      triggerDistortion(0.008, 600);
      setTimeout(() => triggerMassFlicker(500), 300);
    }
  });

  ScrollTrigger.create({
    trigger: '#chamber-3',
    start: 'top center',
    onEnter: () => {
      triggerBlackout(400);
      setTimeout(() => triggerDistortion(0.015, 1200), 400);
    }
  });

  ScrollTrigger.create({
    trigger: '.scroll-container',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      if (isExploring) return;
      const progress = self.progress;

      scene.fog.density = 0.045 + progress * 0.025;

      if (!reducedMotion && chromaticAberrationEffect && noiseEffect) {
        const aberration = 0.002 + progress * 0.004;
        chromaticAberrationEffect.offset.set(aberration, aberration);
        noiseEffect.blendMode.opacity.value = 0.12 + progress * 0.12;
      }
    }
  });
}

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() * 0.001;

  if (isExploring) {
    updateMovement();
  } else {
    currentZ += (targetZ - currentZ) * 0.025;
    camera.position.z = currentZ;

    camera.position.x = Math.sin(time * 0.5) * 0.08;
    camera.position.y = 0.5 + Math.cos(time * 0.3) * 0.04;
    camera.rotation.z = Math.sin(time * 0.2) * 0.004;

    updateCameraParallax();
  }

  updateFlashlight();
  updateLightFlicker(time);
  updatePickupAnimations(time);
  updateDoorDetection(camera, raycaster, isExploring);
  // Detection cascades — first non-door interactable wins the prompt
  const doorActive = hasNearbyDoor();
  updateLeverDetection(camera, raycaster, isExploring, doorActive);
  const upstreamActive = doorActive || hasNearbyLever();
  updatePanelDetection(camera, raycaster, isExploring, upstreamActive);
  updatePickupDetection(camera, raycaster, isExploring,
    upstreamActive || hasNearbyPanelTarget());

  // Creature update returns true on touch → mark caught (so unlock handler
  // shows the lose screen instead of just resetting silently)
  if (creature.update(time, camera)) {
    markCaught();
    if (controls && controls.isLocked) controls.unlock();
  }

  composer.render();
}
