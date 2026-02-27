import * as Tone from 'tone';

let isInitialized = false;

// Synths for different musical parts
let bassSynth: Tone.MonoSynth;
let arpSynth: Tone.Synth;
let drumKick: Tone.MembraneSynth;
let drumHihat: Tone.NoiseSynth;

// Sequences for different states
let battleLoop: Tone.Loop;
let warningLoop: Tone.Loop;
let drumLoop: Tone.Loop;

export async function initAudio() {
  if (isInitialized) return;
  await Tone.start();
  
  // Set global tempo
  Tone.Transport.bpm.value = 120;

  // 1. Bass Synth (Tense, pulsing)
  bassSynth = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { Q: 2, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 1 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 1, baseFrequency: 100, octaves: 3 }
  }).toDestination();
  bassSynth.volume.value = -8;

  // 2. Arpeggiator Synth (Fast, technological)
  arpSynth = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 }
  }).toDestination();
  arpSynth.volume.value = -12;

  // 3. Drums
  drumKick = new Tone.MembraneSynth().toDestination();
  drumKick.volume.value = -6;
  
  drumHihat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.005, decay: 0.05, sustain: 0, release: 0.05 }
  }).toDestination();
  drumHihat.volume.value = -15;

  // --- Sequences ---

  // Battle BGM (Plays when enemies are active)
  const bassNotes = ['C2', 'C2', 'D#2', 'C2', 'G1', 'A#1'];
  let bassStep = 0;
  
  battleLoop = new Tone.Loop((time) => {
    bassSynth.triggerAttackRelease(bassNotes[bassStep % bassNotes.length], '16n', time);
    bassStep++;
    
    // Fast arpeggio over top
    if (bassStep % 2 === 0) {
      const arpNotes = ['C4', 'G4', 'C5', 'D#5'];
      arpSynth.triggerAttackRelease(arpNotes[(bassStep/2) % arpNotes.length], '32n', time, 0.5);
    }
  }, '8n');

  // Drum Pattern for battle
  let drumStep = 0;
  drumLoop = new Tone.Loop((time) => {
    if (drumStep % 4 === 0) {
      drumKick.triggerAttackRelease('C1', '8n', time);
    }
    if (drumStep % 2 !== 0) {
      drumHihat.triggerAttackRelease('16n', time);
    }
    drumStep++;
  }, '16n');

  // Warning Music (Plays before next wave starts)
  const warningNotes = ['C3', 'F#2']; // Dissonant tritone
  let warnStep = 0;
  warningLoop = new Tone.Loop((time) => {
    // Slow, ominous pulse
    if (warnStep % 4 === 0) {
        bassSynth.triggerAttackRelease(warningNotes[(warnStep/4) % warningNotes.length], '2n', time);
    }
    // Ticking clock sound
    drumHihat.triggerAttackRelease('32n', time);
    warnStep++;
  }, '8n');

  Tone.Transport.start();
  isInitialized = true;
}

export function playWarningMusic() {
  if (!isInitialized) return;
  Tone.Transport.bpm.rampTo(90, 1); // Slow down
  battleLoop.stop();
  drumLoop.stop();
  warningLoop.start();
}

export function playBattleMusic() {
  if (!isInitialized) return;
  Tone.Transport.bpm.rampTo(130, 1); // Speed up for battle
  warningLoop.stop();
  battleLoop.start();
  drumLoop.start();
}

export function stopMusic() {
  if (!isInitialized) return;
  warningLoop.stop();
  battleLoop.stop();
  drumLoop.stop();
}

export function setMute(muted: boolean) {
  Tone.Destination.mute = muted;
}

export function setVolume(value: number) {
  // Map 0.0-1.0 to -60dB to 0dB (or -Infinity for 0.0)
  if (value <= 0) {
    Tone.Destination.volume.value = -Infinity;
  } else {
    // A standard logarithmic scale for volume
    Tone.Destination.volume.value = Math.log10(value) * 20;
  }
}
