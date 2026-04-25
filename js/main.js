// ─────────── Entry point: handles warning splash, mobile fallback,
// reduced-motion detection, and audio bootstrap ───────────

import { init as initScene } from './scene.js?v=14';
import { initAudio } from './audio.js?v=14';

const isMobile =
  window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
  window.innerWidth < 900;

// Lock the html + body so the user cannot scroll past the warning splash.
// Class goes on html so it cascades to both elements via CSS.
function lockBodyScroll() {
  document.documentElement.classList.add('warning-active');
}
function unlockBodyScroll() {
  document.documentElement.classList.remove('warning-active');
}

// Apply the reduced-motion class to body so CSS animations (glitch, pulse,
// blink, transitions) get disabled in addition to the JS-side guards.
function applyReducedMotionStyles() {
  document.body.classList.add('reduced-motion');
}

function bootstrap() {
  if (isMobile) {
    document.getElementById('mobile-fallback').style.display = 'flex';
    document.getElementById('warning-splash').style.display = 'none';
    return;
  }

  const splash = document.getElementById('warning-splash');
  const previouslyAccepted = localStorage.getItem('descent-warning-accepted');

  // One-shot audio-start hook for returning visitors who skip the warning.
  const startAudioOnFirstGesture = () => {
    initAudio();
    document.removeEventListener('pointerdown', startAudioOnFirstGesture);
    document.removeEventListener('keydown', startAudioOnFirstGesture);
  };

  const reducedFromSystem =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedFromSystem) applyReducedMotionStyles();

  if (previouslyAccepted === 'reduced') {
    applyReducedMotionStyles();
    splash.style.display = 'none';
    document.addEventListener('pointerdown', startAudioOnFirstGesture, { once: true });
    document.addEventListener('keydown', startAudioOnFirstGesture, { once: true });
    initScene({ reducedMotion: true });
    return;
  }
  if (previouslyAccepted === 'full') {
    splash.style.display = 'none';
    document.addEventListener('pointerdown', startAudioOnFirstGesture, { once: true });
    document.addEventListener('keydown', startAudioOnFirstGesture, { once: true });
    initScene({ reducedMotion: reducedFromSystem });
    return;
  }

  // First-time visit: warning is active. Lock scroll and require a click
  // on one of the two buttons before doing anything else.
  lockBodyScroll();

  document.getElementById('warning-continue').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    localStorage.setItem('descent-warning-accepted', 'full');
    splash.style.display = 'none';
    unlockBodyScroll();
    initAudio(); // the click IS the user gesture — good time to start audio
    initScene({ reducedMotion: reducedFromSystem });
  });

  document.getElementById('warning-reduced').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    localStorage.setItem('descent-warning-accepted', 'reduced');
    splash.style.display = 'none';
    unlockBodyScroll();
    applyReducedMotionStyles();
    initAudio();
    initScene({ reducedMotion: true });
  });
}

bootstrap();
