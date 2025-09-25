(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.input) {
    const { clamp } = modules.utils;
    const pointer = { x: 0, y: 0, worldX: 0, worldY: 0, down: false, justPressed: false, timestamp: 0 };
    let worldProject = (x, y) => ({ x, y });
    const keys = Object.seal({
      left: false,
      right: false,
      up: false,
      down: false,
      jump: false,
      dash: false
    });
    const justPressed = Object.seal({ jump: false, dash: false });
    const fireQueue = [];
    Object.seal(fireQueue);
    const mapKey = (code) => {
      switch (code) {
        case 'ArrowLeft':
        case 'KeyA':
          return 'left';
        case 'ArrowRight':
        case 'KeyD':
          return 'right';
        case 'ArrowUp':
        case 'KeyW':
          return 'up';
        case 'ArrowDown':
        case 'KeyS':
          return 'down';
        case 'Space':
          return 'jump';
        case 'ShiftLeft':
        case 'ShiftRight':
          return 'dash';
        default:
          return undefined;
      }
    };
    const updatePointer = (clientX, clientY) => {
      pointer.x = clientX;
      pointer.y = clientY;
      const mapped = worldProject(clientX, clientY);
      pointer.worldX = mapped.x;
      pointer.worldY = mapped.y;
    };
    const initInput = (wrapper) => {
      if (!wrapper) {
        return Object.freeze({
          updateProjection: () => {},
          consumeJump: () => false,
          consumeDash: () => false,
          consumeFire: () => 0,
          getPointer: () => pointer,
          getMovement: () => ({ x: 0, y: 0 })
        });
      }
      const preventContext = (ev) => {
        ev.preventDefault();
      };
      wrapper.addEventListener('contextmenu', preventContext);
      const onKeyDown = (ev) => {
        const mapped = mapKey(ev.code);
        if (mapped && !keys[mapped]) {
          keys[mapped] = true;
          if (justPressed[mapped] !== undefined) {
            justPressed[mapped] = true;
          }
          if (mapped === 'jump') {
            keys.jump = true;
          }
        }
      };
      const onKeyUp = (ev) => {
        const mapped = mapKey(ev.code);
        if (mapped && keys[mapped]) {
          keys[mapped] = false;
        }
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      const onMouseMove = (ev) => {
        updatePointer(ev.clientX, ev.clientY);
      };
      const onMouseDown = (ev) => {
        if (ev.button === 0) {
          pointer.down = true;
          pointer.justPressed = true;
          pointer.timestamp = performance.now();
          fireQueue.push(pointer.timestamp);
        }
        updatePointer(ev.clientX, ev.clientY);
      };
      const onMouseUp = (ev) => {
        if (ev.button === 0) {
          pointer.down = false;
        }
        updatePointer(ev.clientX, ev.clientY);
      };
      const handleTouch = (ev) => {
        const touch = ev.touches[0] || ev.changedTouches[0];
        if (!touch) {
          return;
        }
        updatePointer(touch.clientX, touch.clientY);
      };
      const onTouchStart = (ev) => {
        ev.preventDefault();
        handleTouch(ev);
        pointer.down = true;
        pointer.justPressed = true;
        pointer.timestamp = performance.now();
        fireQueue.push(pointer.timestamp);
      };
      const onTouchEnd = (ev) => {
        ev.preventDefault();
        pointer.down = false;
        handleTouch(ev);
      };
      window.addEventListener('mousemove', onMouseMove, { passive: true });
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchstart', onTouchStart, { passive: false });
      window.addEventListener('touchend', onTouchEnd, { passive: false });
      window.addEventListener('touchmove', (ev) => {
        ev.preventDefault();
        handleTouch(ev);
      }, { passive: false });
      const updateProjection = (fn) => {
        worldProject = typeof fn === 'function' ? fn : worldProject;
      };
      const consumeJump = () => {
        if (justPressed.jump) {
          justPressed.jump = false;
          return true;
        }
        return false;
      };
      const consumeDash = () => {
        if (justPressed.dash) {
          justPressed.dash = false;
          return true;
        }
        return false;
      };
      const consumeFire = (cooldownMs) => {
        const now = performance.now();
        let fired = 0;
        const minInterval = cooldownMs;
        for (let i = fireQueue.length - 1; i >= 0; i -= 1) {
          if (now - fireQueue[i] <= minInterval + 1) {
            fired += 1;
            fireQueue.splice(i, 1);
          } else if (now - fireQueue[i] > 4000) {
            fireQueue.splice(i, 1);
          }
        }
        pointer.justPressed = false;
        return fired;
      };
      const getPointer = () => pointer;
      const getMovement = () => ({
        x: (keys.left ? -1 : 0) + (keys.right ? 1 : 0),
        y: (keys.up ? -1 : 0) + (keys.down ? 1 : 0)
      });
      return Object.freeze({ updateProjection, consumeJump, consumeDash, consumeFire, getPointer, getMovement, keys });
    };
    modules.input = Object.freeze({ initInput });
  }
})();
