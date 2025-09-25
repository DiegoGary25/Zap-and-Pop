(function () {
  'use strict';
  const root = document.documentElement;
  const key = Symbol.for('zap-registry');
  const modules = root[key] || (root[key] = Object.create(null));
  if (!modules.utils) {
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const lerp = (a, b, t) => a + (b - a) * t;
    const rand = (min, max) => Math.random() * (max - min) + min;
    const randInt = (min, max) => Math.floor(rand(min, max + 1));
    const sign = (value) => (value < 0 ? -1 : value > 0 ? 1 : 0);
    const now = () => performance.now();
    const seededRandom = (seed) => {
      let s = seed >>> 0;
      return Object.freeze({
        next() {
          s = (s * 1664525 + 1013904223) >>> 0;
          return s / 0xffffffff;
        },
        nextRange(min, max) {
          return this.next() * (max - min) + min;
        }
      });
    };
    const arrayClear = (arr) => {
      arr.length = 0;
      return arr;
    };
    const vec2 = (x = 0, y = 0) => ({ x, y });
    modules.utils = Object.freeze({ clamp, lerp, rand, randInt, sign, now, seededRandom, arrayClear, vec2 });
  }
})();
