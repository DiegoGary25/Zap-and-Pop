(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.physics) {
    const { DIMENSIONS, PHYSICS } = modules.constants;
    const { sweepAabb } = modules.math;
    const applyGravity = (body, dt) => {
      body.vy += PHYSICS.gravity * dt;
      if (body.vy > PHYSICS.maxFall) {
        body.vy = PHYSICS.maxFall;
      }
    };
    const boundsRect = Object.freeze({ x: 0, y: 0, w: DIMENSIONS.width, h: DIMENSIONS.height });
    const resolveAxis = (body, dt, map, axis) => {
      const solids = map.solids;
      const oneWays = map.oneWays;
      const hw = body.hw;
      const hh = body.hh;
      const box = { x: body.x - hw, y: body.y - hh, w: hw * 2, h: hh * 2 };
      const delta = axis === 'x' ? body.vx * dt : body.vy * dt;
      if (delta === 0) {
        return 0;
      }
      const move = axis === 'x' ? { x: delta, y: 0 } : { x: 0, y: delta };
      let earliest = { time: 1, normalX: 0, normalY: 0 };
      for (let i = 0; i < solids.length; i += 1) {
        const hit = sweepAabb(box, move, solids[i]);
        if (hit.time < earliest.time) {
          earliest = hit;
        }
      }
      if (axis === 'y' && delta > 0) {
        for (let i = 0; i < oneWays.length; i += 1) {
          const platform = oneWays[i];
          if (body.ignoreOneWayUntil > 0) {
            continue;
          }
          const hit = sweepAabb(box, move, platform);
          if (hit.time < earliest.time) {
            earliest = hit;
          }
        }
      }
      if (earliest.time < 1) {
        if (axis === 'x') {
          body.x += move.x * (earliest.time - PHYSICS.epsilon);
          body.vx = 0;
        } else {
          body.y += move.y * (earliest.time - PHYSICS.epsilon);
          if (earliest.normalY < 0) {
            body.vy = 0;
            body.onGround = true;
          } else {
            body.vy = 0;
          }
        }
        return earliest.time;
      }
      if (axis === 'x') {
        body.x += move.x;
      } else {
        body.y += move.y;
      }
      return 1;
    };
    const constrainToBounds = (body) => {
      const hw = body.hw;
      const hh = body.hh;
      if (body.x - hw < boundsRect.x) {
        body.x = boundsRect.x + hw;
        body.vx = Math.max(body.vx, 0);
      }
      if (body.x + hw > boundsRect.x + boundsRect.w) {
        body.x = boundsRect.x + boundsRect.w - hw;
        body.vx = Math.min(body.vx, 0);
      }
      if (body.y - hh < boundsRect.y) {
        body.y = boundsRect.y + hh;
        body.vy = Math.max(body.vy, 0);
      }
      if (body.y + hh > boundsRect.y + boundsRect.h) {
        body.y = boundsRect.y + boundsRect.h - hh;
        body.vy = Math.min(body.vy, 0);
      }
    };
    const integrateBody = (body, dt, map) => {
      body.onGround = false;
      resolveAxis(body, dt, map, 'x');
      const ratio = resolveAxis(body, dt, map, 'y');
      constrainToBounds(body);
      return ratio;
    };
    modules.physics = Object.freeze({ applyGravity, integrateBody });
  }
})();
