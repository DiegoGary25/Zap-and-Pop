(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.entities) {
    const { DIMENSIONS, PLAYER, WEAPONS, LIMITS, ENEMY_TYPES } = modules.constants;
    const { clamp } = modules.utils;
    const makePool = (size, factory) => {
      const items = new Array(size).fill(null).map(() => factory());
      const free = [];
      Object.seal(items);
      Object.seal(free);
      for (let i = size - 1; i >= 0; i -= 1) {
        free.push(items[i]);
      }
      const acquire = () => {
        if (free.length === 0) {
          return null;
        }
        const item = free.pop();
        item.active = true;
        return item;
      };
      const release = (item) => {
        if (!item.active) {
          return;
        }
        item.active = false;
        free.push(item);
      };
      return Object.freeze({ items, acquire, release });
    };
    const createPlayer = () => {
      const weapon = WEAPONS.pistol;
      return Object.seal({
        x: DIMENSIONS.width * 0.5,
        y: DIMENSIONS.height - 80,
        vx: 0,
        vy: 0,
        hw: PLAYER.width * 0.5,
        hh: PLAYER.height * 0.5,
        facing: 1,
        fireCooldown: 0,
        dashCooldown: 0,
        dashTimer: 0,
        isDashing: false,
        lives: 3,
        weapon,
        coyote: 0,
        jumpBuffer: 0,
        apexTimer: 0,
        ignoreOneWayUntil: 0,
        onGround: false
      });
    };
    const bulletPool = makePool(LIMITS.maxBullets, () => Object.seal({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      lifetime: 0,
      damage: 0,
      pierce: false,
      knockback: 0
    }));
    const enemyPool = makePool(LIMITS.maxEnemies, () => Object.seal({
      active: false,
      type: ENEMY_TYPES.hopper,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hw: 12,
      hh: 12,
      hp: 20,
      state: 'idle',
      aiTimer: 0,
      spawnProtection: 0,
      ignoreOneWayUntil: 0,
      onGround: false,
      cocoonRef: null,
      trapped: false,
      escapeTimer: 0
    }));
    const cocoonPool = makePool(LIMITS.maxCocoons, () => Object.seal({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hw: 12,
      hh: 12,
      timer: 0,
      enemyRef: null
    }));
    const particlePool = makePool(LIMITS.maxParticles, () => Object.seal({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      lifetime: 0,
      ttl: 0,
      size: 4,
      color: '#fff'
    }));
    const resetEnemy = (enemy, type, x, y) => {
      enemy.type = type;
      enemy.x = x;
      enemy.y = y;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.hw = type.width * 0.5;
      enemy.hh = type.height * 0.5;
      enemy.hp = type.hp;
      enemy.state = 'spawn';
      enemy.aiTimer = 0;
      enemy.spawnProtection = 0.8;
      enemy.ignoreOneWayUntil = 0;
      enemy.onGround = false;
      enemy.cocoonRef = null;
      enemy.trapped = false;
      enemy.escapeTimer = 0;
      return enemy;
    };
    modules.entities = Object.freeze({ createPlayer, bulletPool, enemyPool, cocoonPool, particlePool, resetEnemy });
  }
})();
