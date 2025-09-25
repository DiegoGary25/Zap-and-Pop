(function () {
  'use strict';
  const root = document.documentElement;
  const registryKey = Symbol.for('zap-registry');
  const modules = root[registryKey] || (root[registryKey] = Object.create(null));
  if (!modules.main) {
    const system = modules.game.setup();
    const startGameInternal = () => {
      if (system) {
        system.start();
      }
    };
    Object.defineProperty(window, 'startGame', {
      value: () => startGameInternal(),
      writable: false,
      configurable: false,
      enumerable: false
    });
    if (system && typeof system.registerStart === 'function') {
      system.registerStart(() => window.startGame());
    }
    modules.main = Object.freeze({ startGameInternal });
  }
})();
