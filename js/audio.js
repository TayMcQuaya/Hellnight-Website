// ─────────── Procedural ambient + chase + monster-sting audio ───────────
// All synthesized at runtime via Web Audio. No external files.
//
// Public API:
//   initAudio()           – create the AudioContext and start ambient layers
//   setupAudioToggle()    – wire up the #audio-toggle DOM button
//   toggleAudioMuted()    – flip mute state (called from M-key handler)
//   playMonsterAppear()   – one-shot monster sting
//   startChaseAudio()     – start looping chase layer when creature spawns
//   stopChaseAudio()      – fade out chase layer when creature despawns

let audioCtx = null;
let masterGain = null;
let audioMuted = false;
const AUDIO_MASTER_VOLUME = 0.55;

export function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    return; // audio unsupported, fail silently
  }

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioCtx.destination);

  // Fade in over 3s so it doesn't startle
  masterGain.gain.linearRampToValueAtTime(
    AUDIO_MASTER_VOLUME,
    audioCtx.currentTime + 3
  );

  buildDrone();
  buildWindNoise();
  scheduleCreaks();
}

function buildDrone() {
  const ctx = audioCtx;
  // Two slightly detuned sub-oscillators create a slow beating "breathing"
  const subA = ctx.createOscillator();
  subA.type = 'sine';
  subA.frequency.value = 42;
  const subB = ctx.createOscillator();
  subB.type = 'sine';
  subB.frequency.value = 42.4;

  const subGain = ctx.createGain();
  subGain.gain.value = 0.18;
  subA.connect(subGain);
  subB.connect(subGain);
  subGain.connect(masterGain);

  // Mid-range drone for body
  const mid = ctx.createOscillator();
  mid.type = 'sine';
  mid.frequency.value = 110;
  const midGain = ctx.createGain();
  midGain.gain.value = 0.04;
  mid.connect(midGain);
  midGain.connect(masterGain);

  // Slow LFO modulating the mid gain — feels like the space breathing
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08;
  const lfoAmp = ctx.createGain();
  lfoAmp.gain.value = 0.06;
  lfo.connect(lfoAmp);
  lfoAmp.connect(midGain.gain);

  subA.start();
  subB.start();
  mid.start();
  lfo.start();
}

function buildWindNoise() {
  const ctx = audioCtx;
  const bufferSize = ctx.sampleRate * 4;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Pink noise via Voss-McCartney approximation (softer than white noise)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  // Static low-frequency rumble — NOT a bandpass sweep (which produced the
  // ocean-waves character). Keeping everything below ~160Hz makes it feel
  // like cavernous air pressure / distant machinery instead of surf.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 160;
  filter.Q.value = 0.4;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.06;

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);

  noise.start();
}

// ─────────── Chase audio ───────────
let chaseAudioNodes = null;

export function startChaseAudio() {
  if (!audioCtx || !masterGain || chaseAudioNodes) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;

  // Dedicated gain bus so the whole chase layer fades in/out cleanly
  const chaseGain = ctx.createGain();
  chaseGain.gain.value = 0;
  chaseGain.connect(masterGain);
  chaseGain.gain.linearRampToValueAtTime(0.85, now + 1.5);

  // 1) Heartbeat — 110 BPM low thump
  const heartOsc = ctx.createOscillator();
  heartOsc.type = 'sine';
  heartOsc.frequency.value = 55;
  const heartGain = ctx.createGain();
  heartGain.gain.value = 0;
  heartOsc.connect(heartGain);
  heartGain.connect(chaseGain);
  heartOsc.start();

  const beatInterval = 60 / 110;
  let nextBeat = now + 0.25;
  const heartInterval = setInterval(() => {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    while (nextBeat < t + 2) {
      heartGain.gain.setValueAtTime(0, nextBeat);
      heartGain.gain.linearRampToValueAtTime(0.75, nextBeat + 0.025);
      heartGain.gain.exponentialRampToValueAtTime(0.001, nextBeat + 0.22);
      nextBeat += beatInterval;
    }
  }, 400);

  // 2) Dissonant drone — tritone interval (E + A#) = maximum unease
  const drone1 = ctx.createOscillator();
  drone1.type = 'sawtooth';
  drone1.frequency.value = 164.8;
  const drone2 = ctx.createOscillator();
  drone2.type = 'sawtooth';
  drone2.frequency.value = 233.1;

  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 650;
  droneFilter.Q.value = 2.5;

  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.055;

  drone1.connect(droneFilter);
  drone2.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(chaseGain);

  const droneLfo = ctx.createOscillator();
  droneLfo.type = 'sine';
  droneLfo.frequency.value = 0.18;
  const droneLfoAmp = ctx.createGain();
  droneLfoAmp.gain.value = 260;
  droneLfo.connect(droneLfoAmp);
  droneLfoAmp.connect(droneFilter.frequency);

  drone1.start();
  drone2.start();
  droneLfo.start();

  // 3) High-passed breath / scrape
  const bufSize = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const bufData = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) bufData[i] = Math.random() * 2 - 1;

  const breath = ctx.createBufferSource();
  breath.buffer = buf;
  breath.loop = true;

  const breathFilter = ctx.createBiquadFilter();
  breathFilter.type = 'highpass';
  breathFilter.frequency.value = 1800;
  breathFilter.Q.value = 0.8;

  const breathGain = ctx.createGain();
  breathGain.gain.value = 0.015;
  breath.connect(breathFilter);
  breathFilter.connect(breathGain);
  breathGain.connect(chaseGain);

  const breathLfo = ctx.createOscillator();
  breathLfo.type = 'sine';
  breathLfo.frequency.value = 0.3;
  const breathLfoAmp = ctx.createGain();
  breathLfoAmp.gain.value = 0.045;
  breathLfo.connect(breathLfoAmp);
  breathLfoAmp.connect(breathGain.gain);
  breathLfo.start();

  breath.start();

  chaseAudioNodes = {
    chaseGain,
    oscillators: [heartOsc, drone1, drone2, droneLfo, breathLfo],
    sources: [breath],
    heartInterval
  };
}

export function stopChaseAudio() {
  if (!chaseAudioNodes || !audioCtx) return;
  const { chaseGain, oscillators, sources, heartInterval } = chaseAudioNodes;
  chaseAudioNodes = null;

  clearInterval(heartInterval);

  const now = audioCtx.currentTime;
  chaseGain.gain.cancelScheduledValues(now);
  chaseGain.gain.setValueAtTime(chaseGain.gain.value, now);
  chaseGain.gain.linearRampToValueAtTime(0, now + 0.6);

  setTimeout(() => {
    oscillators.forEach(o => { try { o.stop(); } catch (e) {} });
    sources.forEach(s => { try { s.stop(); } catch (e) {} });
    try { chaseGain.disconnect(); } catch (e) {}
  }, 700);
}

// ─────────── Monster appearance sting (one-shot) ───────────
export function playMonsterAppear() {
  if (!audioCtx || !masterGain || audioMuted) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const duration = 2.6;

  const stingGain = ctx.createGain();
  stingGain.gain.setValueAtTime(0, now);
  stingGain.gain.linearRampToValueAtTime(0.6, now + 0.05);
  stingGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  stingGain.connect(masterGain);

  // 1) Sub-impact thump
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(85, now);
  sub.frequency.exponentialRampToValueAtTime(34, now + 0.3);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0, now);
  subGain.gain.linearRampToValueAtTime(0.42, now + 0.02);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  sub.connect(subGain);
  subGain.connect(stingGain);
  sub.start(now);
  sub.stop(now + 0.6);

  // 2) Sharp inhale gasp
  const bufSize = ctx.sampleRate * 0.6;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const bufData = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) bufData[i] = Math.random() * 2 - 1;
  const gasp = ctx.createBufferSource();
  gasp.buffer = buf;

  const gaspFilter = ctx.createBiquadFilter();
  gaspFilter.type = 'bandpass';
  gaspFilter.Q.value = 4.5;
  gaspFilter.frequency.setValueAtTime(750, now);
  gaspFilter.frequency.exponentialRampToValueAtTime(2400, now + 0.42);

  const gaspGain = ctx.createGain();
  gaspGain.gain.setValueAtTime(0, now);
  gaspGain.gain.linearRampToValueAtTime(0.28, now + 0.05);
  gaspGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

  gasp.connect(gaspFilter);
  gaspFilter.connect(gaspGain);
  gaspGain.connect(stingGain);
  gasp.start(now);

  // 3) Descending wail with AM warble
  const wail = ctx.createOscillator();
  wail.type = 'sawtooth';
  wail.frequency.setValueAtTime(880, now);
  wail.frequency.exponentialRampToValueAtTime(120, now + duration * 0.85);

  const amGain = ctx.createGain();
  amGain.gain.value = 0.5;

  const modulator = ctx.createOscillator();
  modulator.type = 'sine';
  modulator.frequency.setValueAtTime(47, now);
  modulator.frequency.exponentialRampToValueAtTime(22, now + duration);
  const modulatorGain = ctx.createGain();
  modulatorGain.gain.value = 0.5;
  modulator.connect(modulatorGain);
  modulatorGain.connect(amGain.gain);

  const wailHpf = ctx.createBiquadFilter();
  wailHpf.type = 'highpass';
  wailHpf.frequency.value = 110;

  const wailGain = ctx.createGain();
  wailGain.gain.setValueAtTime(0, now);
  wailGain.gain.linearRampToValueAtTime(0.18, now + 0.08);
  wailGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  wail.connect(amGain);
  amGain.connect(wailHpf);
  wailHpf.connect(wailGain);
  wailGain.connect(stingGain);

  wail.start(now);
  wail.stop(now + duration + 0.05);
  modulator.start(now);
  modulator.stop(now + duration + 0.05);

  setTimeout(() => {
    try { stingGain.disconnect(); } catch (e) {}
  }, (duration + 0.5) * 1000);
}

function scheduleCreaks() {
  function playCreak() {
    if (!audioCtx) return;
    if (!audioMuted) {
      const ctx = audioCtx;
      const now = ctx.currentTime;
      const duration = 1.4 + Math.random() * 2.2;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const startFreq = 75 + Math.random() * 55;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(
        startFreq * 0.5,
        now + duration
      );

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      filter.Q.value = 4;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.13, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }
    setTimeout(playCreak, 8000 + Math.random() * 18000);
  }
  setTimeout(playCreak, 6000 + Math.random() * 8000);
}

function setAudioMuted(muted) {
  if (!audioCtx || !masterGain) return;
  audioMuted = muted;
  const now = audioCtx.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.linearRampToValueAtTime(
    muted ? 0 : AUDIO_MASTER_VOLUME,
    now + 0.35
  );
  const btn = document.getElementById('audio-toggle');
  if (btn) btn.classList.toggle('muted', muted);
}

export function toggleAudioMuted() {
  if (!audioCtx) initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  setAudioMuted(!audioMuted);
}

// Short, sharp creak for door open/close — derived from the ambient creak
// generator but quicker and with a snap at the end.
export function playDoorCreak() {
  if (!audioCtx || !masterGain || audioMuted) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const duration = 0.55;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  const startFreq = 130 + Math.random() * 40;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 0.55, now + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 4;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

// Soft chime for pickup confirmations — bright sine triad, ~250ms
export function playPickupChime() {
  if (!audioCtx || !masterGain || audioMuted) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const duration = 0.45;

  const stingGain = ctx.createGain();
  stingGain.gain.setValueAtTime(0, now);
  stingGain.gain.linearRampToValueAtTime(0.35, now + 0.02);
  stingGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  stingGain.connect(masterGain);

  // C major triad up an octave: C5, E5, G5
  const freqs = [523.25, 659.25, 783.99];
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    osc.connect(g);
    g.connect(stingGain);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  setTimeout(() => { try { stingGain.disconnect(); } catch (e) {} }, (duration + 0.2) * 1000);
}

// Mechanical clunk for the power lever — short noise burst + low thump
export function playLeverClunk() {
  if (!audioCtx || !masterGain || audioMuted) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;

  const bus = ctx.createGain();
  bus.gain.value = 0.5;
  bus.connect(masterGain);

  // Low thump
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(120, now);
  sub.frequency.exponentialRampToValueAtTime(40, now + 0.18);
  const subG = ctx.createGain();
  subG.gain.setValueAtTime(0, now);
  subG.gain.linearRampToValueAtTime(0.6, now + 0.01);
  subG.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  sub.connect(subG); subG.connect(bus);
  sub.start(now); sub.stop(now + 0.3);

  // Click
  const bufSize = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const clk = ctx.createBufferSource();
  clk.buffer = buf;
  const clkF = ctx.createBiquadFilter();
  clkF.type = 'highpass';
  clkF.frequency.value = 1200;
  const clkG = ctx.createGain();
  clkG.gain.value = 0.4;
  clk.connect(clkF); clkF.connect(clkG); clkG.connect(bus);
  clk.start(now);

  setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 400);
}

// Buzz for "missing requirements" feedback (panel button without items)
export function playPanelBuzz() {
  if (!audioCtx || !masterGain || audioMuted) return;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const duration = 0.4;

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 110;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.18, now + 0.02);
  g.gain.setValueAtTime(0.18, now + duration - 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(g); g.connect(masterGain);
  osc.start(now); osc.stop(now + duration + 0.05);
}

export function setupAudioToggle() {
  const btn = document.getElementById('audio-toggle');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAudioMuted();
  });
}
