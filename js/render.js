(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.render) {
    const { DIMENSIONS } = modules.constants;
    const { clamp } = modules.utils;
    const initRenderer = (canvas, wrapper) => {
      if (!canvas || !wrapper) {
        return Object.freeze({
          resize: () => {},
          getScale: () => 1,
          project: (x, y) => ({ x, y }),
          render: () => {}
        });
      }
      const ctx = canvas.getContext('2d');
      const state = Object.seal({
        scale: 1,
        pixelRatio: window.devicePixelRatio || 1,
        offsetX: 0,
        offsetY: 0,
        shakeX: 0,
        shakeY: 0,
        shakeEnd: 0,
        shakeMag: 0,
        shakeDuration: 0
      });
      const resize = () => {
        const ratio = window.devicePixelRatio || 1;
        state.pixelRatio = ratio;
        const scale = clamp(Math.min(window.innerWidth / DIMENSIONS.width, window.innerHeight / DIMENSIONS.height), 0.6, 3);
        state.scale = scale;
        wrapper.style.width = `${DIMENSIONS.width * scale}px`;
        wrapper.style.height = `${DIMENSIONS.height * scale}px`;
        canvas.width = Math.floor(DIMENSIONS.width * ratio);
        canvas.height = Math.floor(DIMENSIONS.height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const rect = wrapper.getBoundingClientRect();
        state.offsetX = rect.left;
        state.offsetY = rect.top;
      };
      const project = (clientX, clientY) => {
        const x = (clientX - state.offsetX) / state.scale;
        const y = (clientY - state.offsetY) / state.scale;
        return { x, y };
      };
      const drawBackground = () => {
        ctx.fillStyle = '#050608';
        ctx.fillRect(0, 0, DIMENSIONS.width, DIMENSIONS.height);
        const gradient = ctx.createLinearGradient(0, 0, 0, DIMENSIONS.height);
        gradient.addColorStop(0, 'rgba(20, 20, 40, 0.9)');
        gradient.addColorStop(1, 'rgba(8, 8, 16, 0.9)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, DIMENSIONS.width, DIMENSIONS.height);
        ctx.save();
        ctx.strokeStyle = 'rgba(80, 255, 220, 0.12)';
        ctx.lineWidth = 1;
        for (let y = 0; y < DIMENSIONS.height; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(DIMENSIONS.width, y + 0.5);
          ctx.stroke();
        }
        for (let x = 0; x < DIMENSIONS.width; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, DIMENSIONS.height);
          ctx.stroke();
        }
        ctx.restore();
      };
      const drawPlatforms = (map) => {
        ctx.save();
        ctx.fillStyle = 'rgba(84, 120, 220, 0.28)';
        const solids = map.solids;
        for (let i = 0; i < solids.length; i += 1) {
          const rect = solids[i];
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
        ctx.fillStyle = 'rgba(120, 255, 220, 0.28)';
        const ones = map.oneWays;
        for (let i = 0; i < ones.length; i += 1) {
          const rect = ones[i];
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
        ctx.restore();
      };
      const drawPlayer = (player) => {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.fillStyle = '#51ffd6';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#51ffd6';
        ctx.fillRect(-player.hw, -player.hh, player.hw * 2, player.hh * 2);
        ctx.restore();
      };
      const drawEnemies = (enemies) => {
        ctx.save();
        for (let i = 0; i < enemies.length; i += 1) {
          const enemy = enemies[i];
          if (!enemy.active) {
            continue;
          }
          ctx.save();
          ctx.translate(enemy.x, enemy.y);
          ctx.fillStyle = enemy.type.id === 'wisp' ? '#7f51ff' : enemy.type.id === 'turret' ? '#ff517a' : '#d1ff51';
          ctx.shadowBlur = 14;
          ctx.shadowColor = ctx.fillStyle;
          ctx.fillRect(-enemy.hw, -enemy.hh, enemy.hw * 2, enemy.hh * 2);
          ctx.restore();
        }
        ctx.restore();
      };
      const drawBullets = (bullets) => {
        ctx.save();
        ctx.fillStyle = '#ffed8a';
        for (let i = 0; i < bullets.length; i += 1) {
          const bullet = bullets[i];
          if (!bullet.active) {
            continue;
          }
          ctx.beginPath();
          ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };
      const drawCocoons = (cocoons) => {
        ctx.save();
        for (let i = 0; i < cocoons.length; i += 1) {
          const cocoon = cocoons[i];
          if (!cocoon.active) {
            continue;
          }
          const progress = cocoon.timer / 4.5;
          ctx.strokeStyle = `rgba(120,255,220,${clamp(1 - progress, 0.2, 1)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cocoon.x, cocoon.y, cocoon.hw, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      };
      const drawParticles = (particles) => {
        ctx.save();
        for (let i = 0; i < particles.length; i += 1) {
          const particle = particles[i];
          if (!particle.active) {
            continue;
          }
          const alpha = particle.ttl > 0 ? particle.lifetime / particle.ttl : 0;
          ctx.fillStyle = particle.color;
          ctx.globalAlpha = alpha;
          ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
        }
        ctx.restore();
      };
      const applyShake = () => {
        if (state.shakeEnd <= 0) {
          state.shakeX = 0;
          state.shakeY = 0;
          return;
        }
        const now = performance.now();
        if (now >= state.shakeEnd) {
          state.shakeEnd = 0;
          state.shakeX = 0;
          state.shakeY = 0;
          return;
        }
        const progress = (state.shakeEnd - now) / (state.shakeDuration || 1);
        const intensity = state.shakeMag * progress;
        state.shakeX = (Math.random() - 0.5) * 2 * intensity;
        state.shakeY = (Math.random() - 0.5) * 2 * intensity;
      };
      const render = (world) => {
        if (!world.map) {
          drawBackground();
          return;
        }
        applyShake();
        ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, state.shakeX, state.shakeY);
        drawBackground();
        drawPlatforms(world.map);
        drawCocoons(world.cocoons);
        drawEnemies(world.enemies);
        drawPlayer(world.player);
        drawBullets(world.bullets);
        drawParticles(world.particles);
      };
      const punch = (magnitude, duration) => {
        const now = performance.now();
        state.shakeMag = magnitude;
        state.shakeDuration = Math.max(duration * 1000, 16);
        state.shakeEnd = now + state.shakeDuration;
      };
      resize();
      return Object.freeze({ resize, getScale: () => state.scale, project, render, state, punch });
    };
    modules.render = Object.freeze({ initRenderer });
  }
})();
