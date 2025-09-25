(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.spawn) {
    const { ENEMY_TYPES } = modules.constants;
    const { rand } = modules.utils;
    const scheduleWave = (waveNumber, map) => {
      const entrances = map.entrances;
      const schedule = [];
      const baseDelay = 0.6;
      const count = Math.min(3 + waveNumber, 8);
      for (let i = 0; i < count; i += 1) {
        const entrance = entrances[i % entrances.length];
        const type = waveNumber < 2 ? ENEMY_TYPES.hopper : waveNumber < 4 ? ENEMY_TYPES.wisp : ENEMY_TYPES.spiker;
        schedule.push({
          delay: baseDelay + (i * 0.7) + rand(0, 0.2),
          type,
          entrance
        });
      }
      return schedule.sort((a, b) => a.delay - b.delay);
    };
    const createSpawnSystem = (map) => {
      let wave = 1;
      let timer = 0;
      let schedule = scheduleWave(1, map);
      let pending = schedule.length;
      let active = 0;
      let waveStarted = false;
      const listeners = [];
      const reset = () => {
        wave = 1;
        timer = 0;
        schedule = scheduleWave(1, map);
        pending = schedule.length;
        active = 0;
        waveStarted = false;
      };
      const onSpawn = (fn) => {
        if (typeof fn === 'function') {
          listeners.push(fn);
        }
      };
      const notify = (item) => {
        for (let i = 0; i < listeners.length; i += 1) {
          listeners[i](item);
        }
      };
      const update = (dt) => {
        timer += dt;
        if (!waveStarted && timer > 0.4) {
          waveStarted = true;
        }
        for (let i = 0; i < schedule.length; i += 1) {
          const spawn = schedule[i];
          if (spawn && timer >= spawn.delay) {
            schedule[i] = null;
            pending -= 1;
            active += 1;
            notify({ type: spawn.type, entrance: spawn.entrance });
          }
        }
      };
      const onEnemyRemoved = () => {
        if (active > 0) {
          active -= 1;
        }
      };
      const nextWave = () => {
        wave += 1;
        timer = 0;
        schedule = scheduleWave(wave, map);
        pending = schedule.length;
        active = 0;
        waveStarted = false;
      };
      const isWaveClear = () => waveStarted && pending <= 0 && active <= 0;
      return Object.freeze({ reset, update, onSpawn, onEnemyRemoved, nextWave, isWaveClear, get wave() { return wave; }, get pending() { return pending; } });
    };
    modules.spawn = Object.freeze({ createSpawnSystem });
  }
})();
