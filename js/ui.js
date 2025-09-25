(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.ui) {
    const { clamp } = modules.utils;
    const initUi = () => {
      const overlay = document.getElementById('overlay');
      const playAgain = document.getElementById('playAgain');
      const scoreEl = document.getElementById('score');
      const waveEl = document.getElementById('wave');
      const livesEl = document.getElementById('lives');
      const weaponEl = document.getElementById('weapon');
      const multiplierText = document.getElementById('multiplierText');
      const multiplierFill = document.getElementById('multiplierFill');
      const hud = document.getElementById('hud');
      const toast = document.getElementById('toast');
      const overlayInfo = document.getElementById('overlayInfo');
      if (!overlay || !playAgain || !scoreEl || !waveEl || !livesEl || !weaponEl || !multiplierText || !multiplierFill || !hud || !toast || !overlayInfo) {
        console.warn('UI elements missing; overlay stays visible');
        return Object.freeze({
          onStart: () => {},
          onGameOver: () => {},
          updateHud: () => {},
          updateCombo: () => {},
          showToast: () => {}
        });
      }
      let toastTimer = 0;
      const showOverlay = (message, info) => {
        overlay.classList.remove('hidden');
        if (message) {
          document.getElementById('message').textContent = message;
        }
        overlayInfo.textContent = info || '';
      };
      const hideOverlay = () => overlay.classList.add('hidden');
      const onStart = (fn) => {
        playAgain.addEventListener('click', fn);
        window.addEventListener('keydown', (ev) => {
          if (ev.code === 'Enter') {
            fn();
          }
        });
      };
      const onGameOver = (score, wave) => {
        showOverlay('GAME OVER', `Score ${score} – Wave ${wave}`);
      };
      const updateHud = ({ score, wave, lives, weapon }) => {
        scoreEl.textContent = `${Math.floor(score)}`;
        waveEl.textContent = `${wave}`;
        livesEl.textContent = `${lives}`;
        weaponEl.textContent = weapon;
      };
      const updateCombo = (multiplier, ratio, pulse) => {
        multiplierText.textContent = `x${multiplier.toFixed(1)}`;
        multiplierFill.style.width = `${clamp(ratio, 0, 1) * 100}%`;
        if (pulse) {
          hud.classList.add('pulse');
          setTimeout(() => hud.classList.remove('pulse'), 280);
        }
      };
      const showToast = (text) => {
        toast.textContent = text;
        toast.classList.remove('hidden');
        toast.style.opacity = '1';
        toastTimer = performance.now();
      };
      const update = () => {
        if (!toast.classList.contains('hidden')) {
          if (performance.now() - toastTimer > 1200) {
            toast.style.opacity = '0';
            toast.classList.add('hidden');
          }
        }
      };
      return Object.freeze({ onStart, hideOverlay, showOverlay, onGameOver, updateHud, updateCombo, showToast, update });
    };
    modules.ui = Object.freeze({ initUi });
  }
})();
