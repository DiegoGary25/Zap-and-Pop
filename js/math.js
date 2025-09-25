(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.math) {
    const { clamp } = modules.utils;
    const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const toAabb = (entity) => ({ x: entity.x - entity.hw, y: entity.y - entity.hh, w: entity.hw * 2, h: entity.hh * 2 });
    const sweepAabb = (box, delta, target) => {
      let entryTime = 0;
      let exitTime = 1;
      let nx = 0;
      let ny = 0;
      const invEntryX = delta.x > 0 ? target.x - (box.x + box.w) : (target.x + target.w) - box.x;
      const invExitX = delta.x > 0 ? (target.x + target.w) - box.x : target.x - (box.x + box.w);
      const invEntryY = delta.y > 0 ? target.y - (box.y + box.h) : (target.y + target.h) - box.y;
      const invExitY = delta.y > 0 ? (target.y + target.h) - box.y : target.y - (box.y + box.h);
      const entryX = delta.x === 0 ? -Infinity : invEntryX / delta.x;
      const exitX = delta.x === 0 ? Infinity : invExitX / delta.x;
      const entryY = delta.y === 0 ? -Infinity : invEntryY / delta.y;
      const exitY = delta.y === 0 ? Infinity : invExitY / delta.y;
      entryTime = Math.max(entryX, entryY);
      exitTime = Math.min(exitX, exitY);
      if (entryTime > exitTime || (entryX < 0 && entryY < 0) || entryX > 1 || entryY > 1) {
        return { time: 1, normalX: 0, normalY: 0 };
      }
      if (entryX > entryY) {
        nx = invEntryX < 0 ? 1 : -1;
      } else {
        ny = invEntryY < 0 ? 1 : -1;
      }
      return { time: clamp(entryTime, 0, 1), normalX: nx, normalY: ny };
    };
    const pointInRect = (x, y, rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    const distanceSq = (x1, y1, x2, y2) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      return dx * dx + dy * dy;
    };
    modules.math = Object.freeze({ rectsOverlap, toAabb, sweepAabb, pointInRect, distanceSq });
  }
})();
