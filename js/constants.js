(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.constants) {
    const DIMENSIONS = Object.freeze({ width: 960, height: 540, tile: 32 });
    const PLAYER = Object.freeze({
      width: 24,
      height: 32,
      maxRunSpeed: 290,
      runAccel: 14000,
      runFriction: 7800,
      jumpVelocity: 800,
      gravity: 2400,
      lowJumpMultiplier: 1.8,
      coyoteTime: 0.09,
      jumpBuffer: 0.12,
      apexHangMs: 80,
      dashSpeed: 520,
      dashMs: 160,
      dashCooldown: 1.2
    });
    const PHYSICS = Object.freeze({
      gravity: 2400,
      maxFall: 1800,
      maxSlope: Math.cos(Math.PI / 4),
      epsilon: 0.0001,
      oneWayHeight: 8
    });
    const WEAPONS = Object.freeze({
      pistol: Object.freeze({ id: 'pistol', name: 'Pistol', damage: 12, cooldown: 0.25, spread: 0, projectiles: 1, speed: 820, knockback: 120 }),
      shotgun: Object.freeze({ id: 'shotgun', name: 'Shotgun', damage: 7, cooldown: 0.4, spread: 0.12, projectiles: 6, speed: 760, knockback: 320 }),
      rail: Object.freeze({ id: 'rail', name: 'Rail', damage: 30, cooldown: 0.625, spread: 0.01, projectiles: 1, speed: 1400, knockback: 40, pierce: true })
    });
    const ENEMY_TYPES = Object.freeze({
      hopper: Object.freeze({ id: 'hopper', width: 24, height: 24, hp: 30, score: 100 }),
      wisp: Object.freeze({ id: 'wisp', width: 20, height: 20, hp: 24, score: 120 }),
      turret: Object.freeze({ id: 'turret', width: 32, height: 32, hp: 60, score: 160 }),
      spiker: Object.freeze({ id: 'spiker', width: 24, height: 24, hp: 40, score: 140 }),
      blob: Object.freeze({ id: 'blob', width: 32, height: 32, hp: 70, score: 200 }),
      blobMini: Object.freeze({ id: 'blobMini', width: 20, height: 20, hp: 14, score: 60 }),
      kamikaze: Object.freeze({ id: 'kamikaze', width: 24, height: 24, hp: 28, score: 160 })
    });
    const HUD_COMBO = Object.freeze({
      comboWindow: 2,
      maxMultiplier: 5,
      step: 0.5
    });
    const LIMITS = Object.freeze({ maxEnemies: 30, maxBullets: 200, maxCocoons: 12, maxParticles: 320 });
    modules.constants = Object.freeze({ DIMENSIONS, PLAYER, PHYSICS, WEAPONS, ENEMY_TYPES, HUD_COMBO, LIMITS });
  }
})();
