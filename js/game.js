(function () {
  'use strict';
  const root = document.documentElement;
  const registryKey = Symbol.for('zap-registry');
  const modules = root[registryKey] || (root[registryKey] = Object.create(null));
  if (!modules.game) {
    const { DIMENSIONS, PLAYER, WEAPONS, HUD_COMBO } = modules.constants;
    const { initRenderer } = modules.render;
    const { initInput } = modules.input;
    const { initUi } = modules.ui;
    const { maps } = modules.maps;
    const { createPlayer, bulletPool, enemyPool, cocoonPool, particlePool, resetEnemy } = modules.entities;
    const { createSpawnSystem } = modules.spawn;
    const { applyGravity, integrateBody } = modules.physics;
    const { rand, clamp } = modules.utils;
    const { distanceSq } = modules.math;
    const audio = modules.audio;
    const STEP = 1 / 60;
    const COCOON_TIME = 4.5;
    const world = Object.seal({
      map: null,
      player: null,
      bullets: bulletPool.items,
      enemies: enemyPool.items,
      cocoons: cocoonPool.items,
      particles: particlePool.items,
      spawn: null,
      score: 0,
      multiplier: 1,
      comboTimer: 0,
      waveStarted: false
    });
    let renderer;
    let input;
    let ui;
    let running = false;
    let raf = 0;
    let accumulator = 0;
    let lastTime = 0;
    let currentMapIndex = 0;
    const resetParticles = () => {
      const particles = particlePool.items;
      for (let i = 0; i < particles.length; i += 1) {
        particlePool.release(particles[i]);
      }
    };
    const resetBullets = () => {
      const bullets = bulletPool.items;
      for (let i = 0; i < bullets.length; i += 1) {
        bulletPool.release(bullets[i]);
      }
    };
    const resetEnemies = () => {
      const enemies = enemyPool.items;
      for (let i = 0; i < enemies.length; i += 1) {
        enemyPool.release(enemies[i]);
      }
    };
    const resetCocoons = () => {
      const cocoons = cocoonPool.items;
      for (let i = 0; i < cocoons.length; i += 1) {
        cocoonPool.release(cocoons[i]);
      }
    };
    const spawnParticles = (x, y, color, count = 6) => {
      for (let i = 0; i < count; i += 1) {
        const particle = particlePool.acquire();
        if (!particle) {
          return;
        }
        particle.x = x;
        particle.y = y;
        particle.vx = rand(-80, 80);
        particle.vy = rand(-80, 20);
        particle.lifetime = 0;
        particle.ttl = rand(0.18, 0.42);
        particle.size = rand(2, 4);
        particle.color = color;
      }
    };
    const trapEnemy = (enemy) => {
      const cocoon = cocoonPool.acquire();
      if (!cocoon) {
        return;
      }
      enemy.trapped = true;
      enemy.state = 'cocoon';
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.escapeTimer = 0;
      enemy.cocoonRef = cocoon;
      cocoon.x = enemy.x;
      cocoon.y = enemy.y;
      cocoon.hw = enemy.hw + 6;
      cocoon.hh = enemy.hh + 6;
      cocoon.timer = 0;
      cocoon.enemyRef = enemy;
      spawnParticles(enemy.x, enemy.y, 'rgba(120,255,220,0.8)', 12);
    };
    const killEnemy = (enemy, reward) => {
      spawnParticles(enemy.x, enemy.y, 'rgba(255,120,180,0.9)', 18);
      enemyPool.release(enemy);
      if (world.spawn) {
        world.spawn.onEnemyRemoved();
      }
      const newMultiplier = clamp(world.multiplier + HUD_COMBO.step, 1, HUD_COMBO.maxMultiplier);
      const multiplierIncreased = newMultiplier > world.multiplier;
      world.multiplier = newMultiplier;
      world.comboTimer = HUD_COMBO.comboWindow;
      world.score += reward * world.multiplier;
      ui.updateHud({ score: world.score, wave: world.spawn ? world.spawn.wave : 1, lives: world.player.lives, weapon: world.player.weapon.name });
      ui.updateCombo(world.multiplier, 1, multiplierIncreased);
      if (renderer && typeof renderer.punch === 'function') {
        renderer.punch(6 + world.multiplier * 2, 0.09);
      }
      audio.cues.pop();
    };
    const escapeEnemy = (enemy) => {
      enemy.trapped = false;
      enemy.state = 'angry';
      enemy.cocoonRef = null;
      enemy.hp = Math.max(enemy.type.hp * 0.6, 10);
      enemy.vx *= 1.4;
      enemy.escapeTimer = 0;
    };
    const popCocoon = (cocoon, triggerScore) => {
      const enemy = cocoon.enemyRef;
      cocoonPool.release(cocoon);
      cocoon.enemyRef = null;
      if (!enemy) {
        return;
      }
      enemy.cocoonRef = null;
      if (triggerScore) {
        killEnemy(enemy, enemy.type.score);
      } else {
        escapeEnemy(enemy);
      }
    };
    const resetWorld = () => {
      resetParticles();
      resetBullets();
      resetEnemies();
      resetCocoons();
      world.score = 0;
      world.multiplier = 1;
      world.comboTimer = 0;
      world.waveStarted = false;
      currentMapIndex = (currentMapIndex + 1) % maps.length;
      world.map = maps[currentMapIndex];
      world.player = createPlayer();
      if (world.spawn) {
        world.spawn = null;
      }
      const spawn = createSpawnSystem(world.map);
      spawn.onSpawn(({ type, entrance }) => {
        const enemy = enemyPool.acquire();
        if (!enemy) {
          return;
        }
        resetEnemy(enemy, type, entrance.x + entrance.w * 0.5, entrance.y + entrance.h * 0.5);
        if (entrance.direction === 'left') {
          enemy.vx = -60;
        } else if (entrance.direction === 'right') {
          enemy.vx = 60;
        } else {
          enemy.vy = 30;
        }
        audio.cues.spawn();
      });
      world.spawn = spawn;
      ui.updateHud({ score: world.score, wave: spawn.wave, lives: world.player.lives, weapon: world.player.weapon.name });
      ui.updateCombo(world.multiplier, 0, false);
    };
    const fireWeapon = (weapon, angle) => {
      const player = world.player;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const muzzleX = player.x + dirX * (player.hw + 10);
      const muzzleY = player.y + dirY * (player.hh * 0.2);
      const pellets = weapon.projectiles;
      const baseSpeed = weapon.speed;
      for (let i = 0; i < pellets; i += 1) {
        const bullet = bulletPool.acquire();
        if (!bullet) {
          break;
        }
        const spread = weapon.spread ? rand(-weapon.spread, weapon.spread) : 0;
        const vx = Math.cos(angle + spread) * baseSpeed;
        const vy = Math.sin(angle + spread) * baseSpeed;
        bullet.x = muzzleX;
        bullet.y = muzzleY;
        bullet.vx = vx;
        bullet.vy = vy;
        bullet.lifetime = 0;
        bullet.damage = weapon.damage;
        bullet.pierce = Boolean(weapon.pierce);
        bullet.knockback = weapon.knockback || 0;
      }
      spawnParticles(muzzleX, muzzleY, 'rgba(255,255,160,0.8)', 6);
      audio.cues.shoot();
    };
    const updatePlayer = (dt) => {
      const player = world.player;
      const movement = input.getMovement();
      player.facing = movement.x !== 0 ? movement.x : player.facing;
      player.fireCooldown = Math.max(player.fireCooldown - dt, 0);
      player.dashCooldown = Math.max(player.dashCooldown - dt, 0);
      player.ignoreOneWayUntil = Math.max(player.ignoreOneWayUntil - dt, 0);
      if (movement.x !== 0) {
        player.vx += movement.x * PLAYER.runAccel * dt;
        if (Math.abs(player.vx) > PLAYER.maxRunSpeed) {
          player.vx = PLAYER.maxRunSpeed * Math.sign(player.vx);
        }
      } else {
        const friction = PLAYER.runFriction * dt;
        if (Math.abs(player.vx) <= friction) {
          player.vx = 0;
        } else {
          player.vx -= Math.sign(player.vx) * friction;
        }
      }
      player.coyote = player.onGround ? PLAYER.coyoteTime : Math.max(player.coyote - dt, 0);
      player.jumpBuffer = Math.max(player.jumpBuffer - dt, 0);
      if (input.consumeJump()) {
        if (movement.y > 0 && player.onGround) {
          player.ignoreOneWayUntil = 0.28;
        } else {
          player.jumpBuffer = PLAYER.jumpBuffer;
        }
      }
      if (player.jumpBuffer > 0 && (player.onGround || player.coyote > 0)) {
        player.vy = -PLAYER.jumpVelocity;
        player.onGround = false;
        player.coyote = 0;
        player.jumpBuffer = 0;
      }
      applyGravity(player, dt);
      player.ignoreOneWayUntil = Math.max(player.ignoreOneWayUntil - dt, 0);
      player.onGround = false;
      integrateBody(player, dt, world.map);
      if (player.onGround) {
        player.coyote = PLAYER.coyoteTime;
      }
      const pointer = input.getPointer();
      const angle = Math.atan2(pointer.worldY - player.y, pointer.worldX - player.x);
      player.facing = angle >= Math.PI / 2 || angle <= -Math.PI / 2 ? -1 : 1;
      if (player.fireCooldown <= 0) {
        const fired = input.consumeFire(player.weapon.cooldown * 1000);
        if (fired > 0) {
          player.fireCooldown = player.weapon.cooldown;
          fireWeapon(player.weapon, angle);
        }
      } else {
        input.consumeFire(0);
      }
    };
    const updateBullets = (dt) => {
      const bullets = bulletPool.items;
      const enemies = enemyPool.items;
      for (let i = 0; i < bullets.length; i += 1) {
        const bullet = bullets[i];
        if (!bullet.active) {
          continue;
        }
        bullet.lifetime += dt;
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        if (bullet.x < 0 || bullet.x > DIMENSIONS.width || bullet.y < 0 || bullet.y > DIMENSIONS.height || bullet.lifetime > 1.2) {
          bulletPool.release(bullet);
          continue;
        }
        for (let j = 0; j < enemies.length; j += 1) {
          const enemy = enemies[j];
          if (!enemy.active) {
            continue;
          }
          if (enemy.trapped) {
            if (enemy.cocoonRef && distanceSq(enemy.cocoonRef.x, enemy.cocoonRef.y, bullet.x, bullet.y) < (enemy.cocoonRef.hw + 6) ** 2) {
              popCocoon(enemy.cocoonRef, true);
              if (!bullet.pierce) {
                bulletPool.release(bullet);
              }
              break;
            }
            continue;
          }
          const dist = distanceSq(enemy.x, enemy.y, bullet.x, bullet.y);
          const radius = Math.max(enemy.hw, enemy.hh) + 6;
          if (dist <= radius * radius) {
            trapEnemy(enemy);
            if (!bullet.pierce) {
              bulletPool.release(bullet);
            }
            break;
          }
        }
      }
    };
    const updateCocoons = (dt) => {
      const cocoons = cocoonPool.items;
      for (let i = 0; i < cocoons.length; i += 1) {
        const cocoon = cocoons[i];
        if (!cocoon.active) {
          continue;
        }
        cocoon.timer += dt;
        const enemy = cocoon.enemyRef;
        if (enemy) {
          cocoon.x = enemy.x;
          cocoon.y = enemy.y;
          enemy.escapeTimer = cocoon.timer;
          if (cocoon.timer >= COCOON_TIME) {
            popCocoon(cocoon, false);
          }
        } else {
          cocoonPool.release(cocoon);
        }
      }
    };
    const updateEnemies = (dt) => {
      const enemies = enemyPool.items;
      const player = world.player;
      for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!enemy.active || enemy.trapped) {
        continue;
      }
      enemy.spawnProtection = Math.max(enemy.spawnProtection - dt, 0);
      enemy.ignoreOneWayUntil = Math.max(enemy.ignoreOneWayUntil - dt, 0);
      enemy.aiTimer += dt;
      let useGravity = true;
      switch (enemy.type.id) {
        case 'hopper': {
          const dir = Math.sign(player.x - enemy.x);
          enemy.vx += dir * 600 * dt;
          enemy.vx = clamp(enemy.vx, -95, 95);
            if (enemy.onGround && Math.abs(player.x - enemy.x) < 240 && enemy.aiTimer > 1.2) {
              enemy.vy = -600;
              enemy.onGround = false;
              enemy.aiTimer = 0;
            }
            break;
        }
        case 'wisp': {
          const horizontal = Math.sin(enemy.aiTimer * 2) * 80;
          enemy.vx = horizontal;
          if (enemy.aiTimer % 3 < dt && Math.abs(player.x - enemy.x) < 300) {
            enemy.vy = 180;
          }
          enemy.vy += Math.sin(enemy.aiTimer * 1.2) * 20 * dt;
          useGravity = false;
          break;
        }
          case 'spiker': {
            const dir = Math.sign(player.x - enemy.x);
            enemy.vx = dir * 80;
            if (enemy.onGround && enemy.aiTimer > 1.4) {
              enemy.vy = -520;
              enemy.aiTimer = 0;
            }
            break;
          }
          default:
            break;
        }
        if (useGravity) {
          applyGravity(enemy, dt);
        } else {
          enemy.vy *= 0.98;
        }
        integrateBody(enemy, dt, world.map);
        if (enemy.spawnProtection <= 0) {
          const dist = distanceSq(enemy.x, enemy.y, player.x, player.y);
          const radius = Math.max(enemy.hw, enemy.hh) + Math.max(player.hw, player.hh);
          if (dist <= radius * radius) {
            player.lives -= 1;
            spawnParticles(player.x, player.y, 'rgba(255,80,80,0.9)', 20);
            if (player.lives <= 0) {
              gameOver();
              return;
            }
            ui.updateHud({ score: world.score, wave: world.spawn.wave, lives: player.lives, weapon: player.weapon.name });
          }
        }
      }
    };
    const updateParticles = (dt) => {
      const particles = particlePool.items;
      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        if (!particle.active) {
          continue;
        }
        particle.lifetime += dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        if (particle.lifetime >= particle.ttl) {
          particlePool.release(particle);
        }
      }
    };
    const checkCombo = (dt) => {
      if (world.comboTimer > 0) {
        world.comboTimer -= dt;
        if (world.comboTimer <= 0) {
          world.comboTimer = 0;
          world.multiplier = 1;
          ui.updateCombo(world.multiplier, 0, false);
        } else {
          const ratio = world.comboTimer / HUD_COMBO.comboWindow;
          ui.updateCombo(world.multiplier, ratio, false);
        }
      }
    };
    const handleCocoonTouches = () => {
      const player = world.player;
      const cocoons = cocoonPool.items;
      for (let i = 0; i < cocoons.length; i += 1) {
        const cocoon = cocoons[i];
        if (!cocoon.active) {
          continue;
        }
        const dist = distanceSq(player.x, player.y, cocoon.x, cocoon.y);
        const radius = player.hw + cocoon.hw;
        if (dist <= radius * radius) {
          popCocoon(cocoon, true);
          break;
        }
      }
    };
    const updateSpawn = (dt) => {
      if (!world.spawn) {
        return;
      }
      world.spawn.update(dt);
      if (world.spawn.isWaveClear()) {
        world.spawn.nextWave();
        ui.updateHud({ score: world.score, wave: world.spawn.wave, lives: world.player.lives, weapon: world.player.weapon.name });
        ui.showToast(`WAVE ${world.spawn.wave}`);
      }
    };
    const gameOver = () => {
      running = false;
      if (raf) {
        cancelAnimationFrame(raf);
      }
      ui.showOverlay('GAME OVER', `Score ${Math.floor(world.score)}  –  Wave ${world.spawn ? world.spawn.wave : 1}`);
      audio.cues.gameOver();
    };
    const frame = (time) => {
      if (!running) {
        return;
      }
      const delta = time - lastTime;
      lastTime = time;
      accumulator += Math.min(delta, 100);
      while (accumulator >= STEP * 1000) {
        const dt = STEP;
        updatePlayer(dt);
        updateBullets(dt);
        updateEnemies(dt);
        updateCocoons(dt);
        handleCocoonTouches();
        updateParticles(dt);
        updateSpawn(dt);
        checkCombo(dt);
        accumulator -= STEP * 1000;
      }
      renderer.render(world);
      ui.update();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running) {
        return;
      }
      if (!renderer || !input || !ui) {
        return;
      }
      audio.resume();
      resetWorld();
      renderer.render(world);
      running = true;
      lastTime = performance.now();
      accumulator = 0;
      raf = requestAnimationFrame(frame);
      ui.hideOverlay();
    };
    const setup = () => {
      const canvas = document.getElementById('game');
      const wrapper = document.getElementById('gameWrapper');
      if (!canvas || !wrapper) {
        console.warn('Canvas missing');
        return Object.freeze({ start: () => {} });
      }
      renderer = initRenderer(canvas, wrapper);
      input = initInput(wrapper);
      ui = initUi();
      const syncProjection = () => {
        renderer.resize();
        input.updateProjection(renderer.project);
      };
      syncProjection();
      window.addEventListener('resize', syncProjection);
      window.addEventListener('orientationchange', syncProjection);
      const registerStart = (handler) => {
        if (ui) {
          ui.onStart(handler);
        }
      };
      return Object.freeze({ start, registerStart });
    };
    modules.game = Object.freeze({ setup });
  }
})();
