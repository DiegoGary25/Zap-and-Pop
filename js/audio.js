(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.audio) {
    const context = (() => {
      try {
        return new (window.AudioContext || window.webkitAudioContext)();
      } catch (err) {
        return null;
      }
    })();
    if (context) {
      context.suspend().catch(() => {});
    }
    const playTone = (frequency, duration, type = 'sine', gainValue = 0.12) => {
      if (!context) {
        return;
      }
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.value = gainValue;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    };
    const resume = () => {
      if (context && context.state === 'suspended') {
        context.resume().catch(() => {});
      }
    };
    const cues = Object.freeze({
      shoot: () => playTone(680, 0.08, 'square', 0.09),
      hit: () => playTone(240, 0.12, 'sawtooth', 0.1),
      pop: () => playTone(1040, 0.18, 'triangle', 0.08),
      spawn: () => playTone(520, 0.2, 'sine', 0.07),
      combo: () => playTone(880, 0.25, 'square', 0.08),
      gameOver: () => playTone(180, 0.6, 'triangle', 0.11)
    });
    modules.audio = Object.freeze({ resume, cues });
  }
})();
