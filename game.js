(function () {
  'use strict';
  const doc = document;
  const exposeStart = (fn) => {
    Object.defineProperty(window, 'startGame', { value: fn, writable: false, configurable: false });
  };
  const VIEW = Object.freeze({ width: 960, height: 540 });
  const stageEl = doc.querySelector('.stage');
  const canvas = doc.getElementById('game');
  const hudEl = doc.getElementById('hud');
  const scoreEl = doc.getElementById('score');
  const waveEl = doc.getElementById('wave');
  const livesEl = doc.getElementById('lives');
  const weaponEl = doc.getElementById('weapon');
  const overlayEl = doc.getElementById('overlay');
  const messageEl = doc.getElementById('message');
  const submessageEl = doc.getElementById('submessage');
  const overlayInfoEl = doc.getElementById('overlayInfo');
  const playBtn = doc.getElementById('playAgain');
  const toastEl = doc.getElementById('toast');
  const multBarEl = doc.getElementById('multiplierBar');
  const multFillEl = doc.getElementById('multiplierFill');
  const multTextEl = doc.getElementById('multiplierText');
  const requiredElements = [];
  if (!canvas) requiredElements.push('#game canvas');
  if (!hudEl) requiredElements.push('#hud');
  if (!scoreEl) requiredElements.push('#score');
  if (!waveEl) requiredElements.push('#wave');
  if (!livesEl) requiredElements.push('#lives');
  if (!weaponEl) requiredElements.push('#weapon');
  if (!multBarEl) requiredElements.push('#multiplierBar');
  if (!multFillEl) requiredElements.push('#multiplierFill');
  if (!multTextEl) requiredElements.push('#multiplierText');
  if (requiredElements.length) {
    console.error(`[NeonFoam] Missing required element(s): ${requiredElements.join(', ')}`);
    if (overlayEl) overlayEl.classList.remove('hidden');
    exposeStart(() => console.error('Cannot start game: missing required DOM nodes.'));
    return;
  }
  if (!stageEl) console.error('[NeonFoam] Stage container (.stage) not found; canvas scaling disabled.');
  if (!overlayEl) console.error('[NeonFoam] Overlay element (#overlay) not found; using keyboard start fallback.');
  if (!playBtn) console.error('[NeonFoam] Start button (#playAgain) not found; press Enter to begin.');
  if (!messageEl) console.error('[NeonFoam] Overlay message element (#message) missing.');
  if (!submessageEl) console.error('[NeonFoam] Overlay submessage element (#submessage) missing.');
  if (!overlayInfoEl) console.error('[NeonFoam] Overlay info element (#overlayInfo) missing.');
  if (!toastEl) console.error('[NeonFoam] Toast element (#toast) missing; pickup messages disabled.');
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = VIEW.width * dpr;
  canvas.height = VIEW.height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('[NeonFoam] Unable to acquire 2D rendering context.');
    if (overlayEl) overlayEl.classList.remove('hidden');
    exposeStart(() => console.error('Cannot start game: canvas context unavailable.'));
    return;
  }
  ctx.scale(dpr, dpr);
  canvas.tabIndex = 0;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothStep = (t) => t * t * (3 - 2 * t);
  const freezeRect = (x, y, w, h) => Object.freeze({ x, y, w, h });
  const freezePath = (minX, maxX, y, orientation) => Object.freeze({ minX, maxX, y, orientation });
  const EPSILON = 0.0001;
  const WRAP_BUFFER = 72;
  const EMPTY_ARRAY = Object.freeze([]);
  const CFG = Object.freeze({
    gravity: 2600,
    moveAccel: 17000,
    moveMax: 320,
    airControl: 0.68,
    jumpVel: 960,
    coyoteMs: 110,
    jumpBufferMs: 140,
    dropBufferMs: 160,
    apexMs: 80,
    lowJumpGravityScale: 1.85,
    apexGravityScale: 0.6,
    dashVel: 620,
    dashMs: 160,
    dashCdMs: 1200,
    stepHeight: 10,
    hitstopMs: 85,
    shakeMax: 7,
    angrySpeedBoost: 1.35,
    smg: Object.freeze({ dmg: 11, rof: 10, knock: 140, range: 960 }),
    shotgun: Object.freeze({ pellets: 6, dmg: 8, spread: 10, knock: 600, rof: 2.5, range: 420 }),
    rail: Object.freeze({ dmg: 48, rof: 1.25, knock: 900, pierce: 4, range: 1400 }),
    foam: Object.freeze({
      speed: 620,
      lifeMs: 4700,
      bounce: 0.58,
      stacks: Object.freeze({
        Hopper: 1,
        Wisp: 1,
        Turret: 2,
        Spiker: 2,
        BlobTank: 2,
        Bloblet: 1,
        Kamikaze: 1
      })
    }),
    enemy: Object.freeze({
      baseHp: Object.freeze({
        Hopper: 36,
        Wisp: 24,
        Turret: 70,
        Spiker: 40,
        BlobTank: 160,
        Bloblet: 26,
        Kamikaze: 32
      }),
      speed: Object.freeze({
        Hopper: 110,
        Wisp: 70,
        Spiker: 150,
        BlobTank: 60,
        Bloblet: 110,
        Kamikaze: 170
      }),
      scalePerWave: 1.07,
      turretRof: 1.7
    }),
    scoring: Object.freeze({
      Hopper: 110,
      Wisp: 130,
      Turret: 170,
      Spiker: 150,
      BlobTank: 220,
      Bloblet: 90,
      Kamikaze: 160
    }),
    combo: Object.freeze({ windowMs: 2000, step: 0.5, max: 5 }),
    pickupChance: 0.28,
    ammoMax: Object.freeze({ smg: 140, shotgun: 42, rail: 12 }),
    pickupAmmo: Object.freeze({ smg: 40, shotgun: 12, rail: 4 })
  });
  const SCENARIOS = Object.freeze([
    Object.freeze({
      width: VIEW.width,
      playerStart: Object.freeze({ x: 140, y: VIEW.height - 180 }),
      solids: Object.freeze([
        freezeRect(0, VIEW.height - 32, VIEW.width, 32),
        freezeRect(96, 420, 180, 24),
        freezeRect(360, 368, 240, 24),
        freezeRect(720, 420, 180, 24),
        freezeRect(240, 304, 160, 24),
        freezeRect(560, 304, 160, 24),
        freezeRect(400, 232, 160, 24),
        freezeRect(320, VIEW.height - 96, 80, 64),
        freezeRect(560, VIEW.height - 96, 80, 64)
      ]),
      oneWays: Object.freeze([
        freezeRect(220, 344, 200, 12),
        freezeRect(540, 344, 200, 12),
        freezeRect(400, 260, 160, 12)
      ]),
      wraps: Object.freeze([
        Object.freeze({ y: VIEW.height - 144, h: 144 }),
        Object.freeze({ y: 272, h: 132 })
      ]),
      crawlerPaths: Object.freeze([
        freezePath(48, VIEW.width - 48, VIEW.height - 32, 'floor'),
        freezePath(220, 420, 304, 'ceiling'),
        freezePath(540, 740, 304, 'ceiling'),
        freezePath(360, 600, 232, 'ceiling')
      ]),
      lanes: Object.freeze([
        Object.freeze({
          x1: 32,
          x2: VIEW.width - 32,
          y: VIEW.height - 32,
          links: Object.freeze([
            Object.freeze({ to: 1, x: 156, type: 'jump', power: CFG.jumpVel * 0.78, cooldown: 260 }),
            Object.freeze({ to: 2, x: 480, type: 'jump', power: CFG.jumpVel * 0.82, cooldown: 280 }),
            Object.freeze({ to: 3, x: 804, type: 'jump', power: CFG.jumpVel * 0.78, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 96,
          x2: 276,
          y: 420,
          links: Object.freeze([
            Object.freeze({ to: 0, x: 156, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 4, x: 220, type: 'jump', power: CFG.jumpVel * 0.72, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 360,
          x2: 600,
          y: 368,
          links: Object.freeze([
            Object.freeze({ to: 0, x: 480, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 4, x: 400, type: 'jump', power: CFG.jumpVel * 0.7, cooldown: 260 }),
            Object.freeze({ to: 5, x: 560, type: 'jump', power: CFG.jumpVel * 0.7, cooldown: 260 }),
            Object.freeze({ to: 6, x: 480, type: 'jump', power: CFG.jumpVel * 0.64, cooldown: 280 })
          ])
        }),
        Object.freeze({
          x1: 720,
          x2: 900,
          y: 420,
          links: Object.freeze([
            Object.freeze({ to: 0, x: 804, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 5, x: 760, type: 'jump', power: CFG.jumpVel * 0.72, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 240,
          x2: 400,
          y: 304,
          links: Object.freeze([
            Object.freeze({ to: 1, x: 260, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 2, x: 360, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 6, x: 320, type: 'jump', power: CFG.jumpVel * 0.64, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 560,
          x2: 720,
          y: 304,
          links: Object.freeze([
            Object.freeze({ to: 2, x: 560, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 3, x: 700, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 6, x: 640, type: 'jump', power: CFG.jumpVel * 0.64, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 400,
          x2: 560,
          y: 232,
          links: Object.freeze([
            Object.freeze({ to: 4, x: 420, type: 'drop', cooldown: 220 }),
            Object.freeze({ to: 5, x: 540, type: 'drop', cooldown: 220 })
          ])
        })
      ]),
      turretSpots: Object.freeze([
        Object.freeze({ x: 160, y: VIEW.height - 32 }),
        Object.freeze({ x: 800, y: VIEW.height - 32 }),
        Object.freeze({ x: 480, y: 304 })
      ]),
      pickupSpots: Object.freeze([
        Object.freeze({ x: 200, y: 304 }),
        Object.freeze({ x: 720, y: 304 }),
        Object.freeze({ x: 480, y: 232 })
      ]),
      entrances: Object.freeze({
        left: Object.freeze([
          Object.freeze({ start: Object.freeze({ x: -90, y: VIEW.height - 32, ref: 'floor' }), end: Object.freeze({ x: 96, y: VIEW.height - 32, ref: 'floor' }), duration: 720 }),
          Object.freeze({ start: Object.freeze({ x: -90, y: 344, ref: 'floor' }), end: Object.freeze({ x: 156, y: 344, ref: 'floor' }), duration: 720 })
        ]),
        right: Object.freeze([
          Object.freeze({ start: Object.freeze({ x: VIEW.width + 90, y: VIEW.height - 32, ref: 'floor' }), end: Object.freeze({ x: VIEW.width - 96, y: VIEW.height - 32, ref: 'floor' }), duration: 720 }),
          Object.freeze({ start: Object.freeze({ x: VIEW.width + 90, y: 344, ref: 'floor' }), end: Object.freeze({ x: VIEW.width - 156, y: 344, ref: 'floor' }), duration: 720 })
        ]),
        top: Object.freeze([
          Object.freeze({ start: Object.freeze({ x: 220, y: -120, ref: 'center' }), end: Object.freeze({ x: 220, y: 304, ref: 'floor' }), duration: 820 }),
          Object.freeze({ start: Object.freeze({ x: 480, y: -120, ref: 'center' }), end: Object.freeze({ x: 480, y: 232, ref: 'floor' }), duration: 820 }),
          Object.freeze({ start: Object.freeze({ x: 720, y: -120, ref: 'center' }), end: Object.freeze({ x: 720, y: 304, ref: 'floor' }), duration: 820 })
        ])
      }),
      spawnPlan: Object.freeze([
        Object.freeze({
          time: 360,
          entries: Object.freeze([
            Object.freeze({ type: 'Hopper', entrance: 'left', lane: 0 }),
            Object.freeze({ type: 'Hopper', entrance: 'right', lane: 3 })
          ])
        }),
        Object.freeze({
          time: 960,
          entries: Object.freeze([
            Object.freeze({ type: 'Wisp', entrance: 'top', lane: 6 }),
            Object.freeze({ type: 'Wisp', entrance: 'top', lane: 5 })
          ])
        }),
        Object.freeze({
          time: 1680,
          entries: Object.freeze([
            Object.freeze({ type: 'Spiker', entrance: 'left', lane: 1 }),
            Object.freeze({ type: 'BlobTank', entrance: 'right', lane: 0 })
          ])
        }),
        Object.freeze({
          time: 2480,
          entries: Object.freeze([
            Object.freeze({ type: 'Kamikaze', entrance: 'top', lane: 4 }),
            Object.freeze({ type: 'Hopper', entrance: 'right', lane: 2 })
          ])
        }),
        Object.freeze({
          time: 3320,
          entries: Object.freeze([
            Object.freeze({ type: 'Turret', entrance: 'top', lane: 4 })
          ])
        })
      ])
    }),
    Object.freeze({
      width: VIEW.width,
      playerStart: Object.freeze({ x: VIEW.width - 180, y: VIEW.height - 200 }),
      solids: Object.freeze([
        freezeRect(0, VIEW.height - 32, VIEW.width, 32),
        freezeRect(120, 420, 160, 24),
        freezeRect(680, 420, 160, 24),
        freezeRect(360, 360, 240, 120),
        freezeRect(80, 288, 160, 24),
        freezeRect(720, 288, 160, 24),
        freezeRect(240, 232, 120, 24),
        freezeRect(600, 232, 120, 24),
        freezeRect(440, 200, 80, 24),
        freezeRect(280, VIEW.height - 96, 80, 64),
        freezeRect(600, VIEW.height - 96, 80, 64)
      ]),
      oneWays: Object.freeze([
        freezeRect(240, 340, 120, 12),
        freezeRect(600, 340, 120, 12),
        freezeRect(440, 260, 160, 12)
      ]),
      wraps: Object.freeze([
        Object.freeze({ y: VIEW.height - 152, h: 152 }),
        Object.freeze({ y: 288, h: 148 })
      ]),
      crawlerPaths: Object.freeze([
        freezePath(48, VIEW.width - 48, VIEW.height - 32, 'floor'),
        freezePath(120, 280, 288, 'ceiling'),
        freezePath(680, 840, 288, 'ceiling'),
        freezePath(360, 600, 360, 'ceiling')
      ]),
      lanes: Object.freeze([
        Object.freeze({
          x1: 32,
          x2: 280,
          y: VIEW.height - 32,
          links: Object.freeze([
            Object.freeze({ to: 2, x: 180, type: 'jump', power: CFG.jumpVel * 0.76, cooldown: 260 }),
            Object.freeze({ to: 4, x: 200, type: 'jump', power: CFG.jumpVel * 0.82, cooldown: 280 })
          ])
        }),
        Object.freeze({
          x1: 680,
          x2: VIEW.width - 32,
          y: VIEW.height - 32,
          links: Object.freeze([
            Object.freeze({ to: 3, x: 760, type: 'jump', power: CFG.jumpVel * 0.76, cooldown: 260 }),
            Object.freeze({ to: 5, x: 780, type: 'jump', power: CFG.jumpVel * 0.82, cooldown: 280 })
          ])
        }),
        Object.freeze({
          x1: 120,
          x2: 280,
          y: 420,
          links: Object.freeze([
            Object.freeze({ to: 0, x: 180, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 4, x: 200, type: 'jump', power: CFG.jumpVel * 0.7, cooldown: 240 })
          ])
        }),
        Object.freeze({
          x1: 680,
          x2: 840,
          y: 420,
          links: Object.freeze([
            Object.freeze({ to: 1, x: 760, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 5, x: 760, type: 'jump', power: CFG.jumpVel * 0.7, cooldown: 240 })
          ])
        }),
        Object.freeze({
          x1: 80,
          x2: 240,
          y: 288,
          links: Object.freeze([
            Object.freeze({ to: 0, x: 160, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 2, x: 200, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 6, x: 260, type: 'jump', power: CFG.jumpVel * 0.66, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 720,
          x2: 880,
          y: 288,
          links: Object.freeze([
            Object.freeze({ to: 1, x: 780, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 3, x: 760, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 7, x: 700, type: 'jump', power: CFG.jumpVel * 0.66, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 240,
          x2: 360,
          y: 232,
          links: Object.freeze([
            Object.freeze({ to: 4, x: 260, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 8, x: 320, type: 'jump', power: CFG.jumpVel * 0.64, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 600,
          x2: 720,
          y: 232,
          links: Object.freeze([
            Object.freeze({ to: 5, x: 700, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 8, x: 640, type: 'jump', power: CFG.jumpVel * 0.64, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 440,
          x2: 520,
          y: 200,
          links: Object.freeze([
            Object.freeze({ to: 6, x: 460, type: 'drop', cooldown: 220 }),
            Object.freeze({ to: 7, x: 500, type: 'drop', cooldown: 220 })
          ])
        })
      ]),
      turretSpots: Object.freeze([
        Object.freeze({ x: 180, y: VIEW.height - 32 }),
        Object.freeze({ x: 780, y: VIEW.height - 32 }),
        Object.freeze({ x: 480, y: 360 })
      ]),
      pickupSpots: Object.freeze([
        Object.freeze({ x: 160, y: 288 }),
        Object.freeze({ x: 800, y: 288 }),
        Object.freeze({ x: 480, y: 200 })
      ]),
      entrances: Object.freeze({
        left: Object.freeze([
          Object.freeze({ start: Object.freeze({ x: -90, y: VIEW.height - 32, ref: 'floor' }), end: Object.freeze({ x: 96, y: VIEW.height - 32, ref: 'floor' }), duration: 700 }),
          Object.freeze({ start: Object.freeze({ x: -90, y: 340, ref: 'floor' }), end: Object.freeze({ x: 156, y: 340, ref: 'floor' }), duration: 720 })
        ]),
        right: Object.freeze([
          Object.freeze({ start: Object.freeze({ x: VIEW.width + 90, y: VIEW.height - 32, ref: 'floor' }), end: Object.freeze({ x: VIEW.width - 96, y: VIEW.height - 32, ref: 'floor' }), duration: 700 }),
          Object.freeze({ start: Object.freeze({ x: VIEW.width + 90, y: 340, ref: 'floor' }), end: Object.freeze({ x: VIEW.width - 156, y: 340, ref: 'floor' }), duration: 720 })
        ]),
        top: Object.freeze([
          Object.freeze({ start: Object.freeze({ x: 200, y: -120, ref: 'center' }), end: Object.freeze({ x: 200, y: 288, ref: 'floor' }), duration: 820 }),
          Object.freeze({ start: Object.freeze({ x: 480, y: -120, ref: 'center' }), end: Object.freeze({ x: 480, y: 232, ref: 'floor' }), duration: 820 }),
          Object.freeze({ start: Object.freeze({ x: 760, y: -120, ref: 'center' }), end: Object.freeze({ x: 760, y: 288, ref: 'floor' }), duration: 820 })
        ])
      }),
      spawnPlan: Object.freeze([
        Object.freeze({
          time: 340,
          entries: Object.freeze([
            Object.freeze({ type: 'Hopper', entrance: 'left', lane: 0 }),
            Object.freeze({ type: 'Hopper', entrance: 'right', lane: 1 })
          ])
        }),
        Object.freeze({
          time: 960,
          entries: Object.freeze([
            Object.freeze({ type: 'Wisp', entrance: 'top', lane: 8 }),
            Object.freeze({ type: 'Wisp', entrance: 'top', lane: 6 })
          ])
        }),
        Object.freeze({
          time: 1640,
          entries: Object.freeze([
            Object.freeze({ type: 'BlobTank', entrance: 'right', lane: 1 }),
            Object.freeze({ type: 'Spiker', entrance: 'left', lane: 2 })
          ])
        }),
        Object.freeze({
          time: 2440,
          entries: Object.freeze([
            Object.freeze({ type: 'Kamikaze', entrance: 'top', lane: 7 }),
            Object.freeze({ type: 'Hopper', entrance: 'left', lane: 4 })
          ])
        }),
        Object.freeze({
          time: 3200,
          entries: Object.freeze([
            Object.freeze({ type: 'Turret', entrance: 'top', lane: 8 })
          ])
        })
      ])
    }),
    Object.freeze({
      width: VIEW.width,
      playerStart: Object.freeze({ x: 220, y: VIEW.height - 220 }),
      solids: Object.freeze([
        freezeRect(0, VIEW.height - 32, VIEW.width, 32),
        freezeRect(160, 432, 180, 24),
        freezeRect(620, 432, 180, 24),
        freezeRect(320, 372, 160, 24),
        freezeRect(480, 312, 160, 24),
        freezeRect(200, 252, 140, 24),
        freezeRect(620, 252, 140, 24),
        freezeRect(400, 196, 160, 24),
        freezeRect(96, 316, 80, 120),
        freezeRect(784, 316, 80, 120),
        freezeRect(360, VIEW.height - 104, 80, 72),
        freezeRect(520, VIEW.height - 104, 80, 72)
      ]),
      oneWays: Object.freeze([
        freezeRect(260, 348, 160, 12),
        freezeRect(540, 288, 160, 12),
        freezeRect(320, 228, 160, 12)
      ]),
      wraps: Object.freeze([
        Object.freeze({ y: VIEW.height - 152, h: 152 }),
        Object.freeze({ y: 260, h: 140 })
      ]),
      crawlerPaths: Object.freeze([
        freezePath(48, VIEW.width - 48, VIEW.height - 32, 'floor'),
        freezePath(180, 340, 252, 'ceiling'),
        freezePath(620, 780, 252, 'ceiling'),
        freezePath(400, 560, 196, 'ceiling')
      ]),
      lanes: Object.freeze([
        Object.freeze({
          x1: 32,
          x2: 360,
          y: VIEW.height - 32,
          links: Object.freeze([
            Object.freeze({ to: 2, x: 220, type: 'jump', power: CFG.jumpVel * 0.78, cooldown: 260 }),
            Object.freeze({ to: 3, x: 320, type: 'jump', power: CFG.jumpVel * 0.8, cooldown: 280 })
          ])
        }),
        Object.freeze({
          x1: 600,
          x2: VIEW.width - 32,
          y: VIEW.height - 32,
          links: Object.freeze([
            Object.freeze({ to: 4, x: 700, type: 'jump', power: CFG.jumpVel * 0.78, cooldown: 260 }),
            Object.freeze({ to: 5, x: 640, type: 'jump', power: CFG.jumpVel * 0.8, cooldown: 280 })
          ])
        }),
        Object.freeze({
          x1: 160,
          x2: 340,
          y: 432,
          links: Object.freeze([
            Object.freeze({ to: 0, x: 220, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 6, x: 260, type: 'jump', power: CFG.jumpVel * 0.7, cooldown: 240 })
          ])
        }),
        Object.freeze({
          x1: 320,
          x2: 480,
          y: 372,
          links: Object.freeze([
            Object.freeze({ to: 0, x: 340, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 6, x: 360, type: 'jump', power: CFG.jumpVel * 0.68, cooldown: 240 }),
            Object.freeze({ to: 7, x: 440, type: 'jump', power: CFG.jumpVel * 0.68, cooldown: 240 })
          ])
        }),
        Object.freeze({
          x1: 620,
          x2: 800,
          y: 432,
          links: Object.freeze([
            Object.freeze({ to: 1, x: 700, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 5, x: 720, type: 'jump', power: CFG.jumpVel * 0.7, cooldown: 240 })
          ])
        }),
        Object.freeze({
          x1: 480,
          x2: 640,
          y: 312,
          links: Object.freeze([
            Object.freeze({ to: 1, x: 620, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 7, x: 520, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 8, x: 560, type: 'jump', power: CFG.jumpVel * 0.64, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 200,
          x2: 340,
          y: 252,
          links: Object.freeze([
            Object.freeze({ to: 2, x: 220, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 3, x: 320, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 8, x: 280, type: 'jump', power: CFG.jumpVel * 0.64, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 620,
          x2: 760,
          y: 252,
          links: Object.freeze([
            Object.freeze({ to: 4, x: 700, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 5, x: 640, type: 'drop', cooldown: 200 }),
            Object.freeze({ to: 8, x: 640, type: 'jump', power: CFG.jumpVel * 0.64, cooldown: 260 })
          ])
        }),
        Object.freeze({
          x1: 400,
          x2: 560,
          y: 196,
          links: Object.freeze([
            Object.freeze({ to: 6, x: 420, type: 'drop', cooldown: 220 }),
            Object.freeze({ to: 7, x: 540, type: 'drop', cooldown: 220 })
          ])
        })
      ]),
      turretSpots: Object.freeze([
        Object.freeze({ x: 200, y: 252 }),
        Object.freeze({ x: 760, y: 252 }),
        Object.freeze({ x: 480, y: 312 })
      ]),
      pickupSpots: Object.freeze([
        Object.freeze({ x: 260, y: 252 }),
        Object.freeze({ x: 700, y: 252 }),
        Object.freeze({ x: 480, y: 196 })
      ]),
      entrances: Object.freeze({
        left: Object.freeze([
          Object.freeze({ start: Object.freeze({ x: -90, y: VIEW.height - 32, ref: 'floor' }), end: Object.freeze({ x: 96, y: VIEW.height - 32, ref: 'floor' }), duration: 720 }),
          Object.freeze({ start: Object.freeze({ x: -90, y: 348, ref: 'floor' }), end: Object.freeze({ x: 156, y: 348, ref: 'floor' }), duration: 720 })
        ]),
        right: Object.freeze([
          Object.freeze({ start: Object.freeze({ x: VIEW.width + 90, y: VIEW.height - 32, ref: 'floor' }), end: Object.freeze({ x: VIEW.width - 96, y: VIEW.height - 32, ref: 'floor' }), duration: 720 }),
          Object.freeze({ start: Object.freeze({ x: VIEW.width + 90, y: 288, ref: 'floor' }), end: Object.freeze({ x: VIEW.width - 156, y: 288, ref: 'floor' }), duration: 720 })
        ]),
        top: Object.freeze([
          Object.freeze({ start: Object.freeze({ x: 220, y: -120, ref: 'center' }), end: Object.freeze({ x: 220, y: 252, ref: 'floor' }), duration: 840 }),
          Object.freeze({ start: Object.freeze({ x: 480, y: -120, ref: 'center' }), end: Object.freeze({ x: 480, y: 196, ref: 'floor' }), duration: 840 }),
          Object.freeze({ start: Object.freeze({ x: 740, y: -120, ref: 'center' }), end: Object.freeze({ x: 740, y: 252, ref: 'floor' }), duration: 840 })
        ])
      }),
      spawnPlan: Object.freeze([
        Object.freeze({
          time: 320,
          entries: Object.freeze([
            Object.freeze({ type: 'Hopper', entrance: 'left', lane: 0 }),
            Object.freeze({ type: 'Hopper', entrance: 'right', lane: 1 })
          ])
        }),
        Object.freeze({
          time: 900,
          entries: Object.freeze([
            Object.freeze({ type: 'Wisp', entrance: 'top', lane: 8 }),
            Object.freeze({ type: 'Wisp', entrance: 'top', lane: 5 })
          ])
        }),
        Object.freeze({
          time: 1620,
          entries: Object.freeze([
            Object.freeze({ type: 'BlobTank', entrance: 'left', lane: 0 }),
            Object.freeze({ type: 'Spiker', entrance: 'right', lane: 4 })
          ])
        }),
        Object.freeze({
          time: 2420,
          entries: Object.freeze([
            Object.freeze({ type: 'Kamikaze', entrance: 'top', lane: 7 }),
            Object.freeze({ type: 'Hopper', entrance: 'right', lane: 4 })
          ])
        }),
        Object.freeze({
          time: 3240,
          entries: Object.freeze([
            Object.freeze({ type: 'Turret', entrance: 'top', lane: 8 })
          ])
        })
      ])
    })
  ]);
  const rng = (() => {
    let seed = Date.now() % 2147483647;
    return () => {
      seed = seed * 16807 % 2147483647;
      return (seed - 1) / 2147483646;
    };
  })();
  const input = Object.seal({
    left: false,
    right: false,
    down: false,
    jump: false,
    jumpBuffer: 0,
    dropBuffer: 0,
    dash: false,
    dashBuffer: 0,
    primary: false,
    secondary: false,
    mouseX: VIEW.width * 0.5,
    mouseY: VIEW.height * 0.5
  });
  const player = Object.seal({
    x: 0,
    y: 0,
    w: 32,
    h: 46,
    vx: 0,
    vy: 0,
    onGround: false,
    onOneWay: null,
    coyoteTimer: 0,
    dashTimer: 0,
    dashCooldown: 0,
    dashDir: 0,
    invulnTimer: 0,
    wrapTimer: 0,
    aimAngle: 0,
    facing: 1,
    apexTimer: 0,
    fireTimer: 0,
    shotgunTimer: 0,
    railTimer: 0,
    foamTimer: 0,
    dropTimer: 0,
    lives: 3,
    weapon: 'smg',
    weaponUnlocked: Object.seal({ smg: true, shotgun: false, rail: false }),
    ammo: Object.seal({ smg: 80, shotgun: 0, rail: 0 })
  });
  const world = Object.seal({
    running: false,
    overlayVisible: true,
    state: 'idle',
    wave: 1,
    score: 0,
    comboTimer: 0,
    multiplier: 1,
    chainCount: 0,
    hitstop: 0,
    shakeTimer: 0,
    shakeMag: 0,
    scenarioIndex: 0,
    scenarioCycle: 0,
    scenario: SCENARIOS[0],
    transitionTimer: 0,
    transitionPhase: 0,
    spawnDelay: 0,
    activeWave: false,
    tutorialTimer: 0,
    pendingSpawns: 0,
    aliveEnemies: 0,
    inPlay: false
  });
  const spawnerPlan = [];
  const spawner = {
    plan: spawnerPlan,
    index: 0,
    clock: 0,
    active: false,
    started: false
  };
  Object.defineProperty(spawner, 'plan', { value: spawnerPlan, writable: false, configurable: false, enumerable: true });
  Object.seal(spawner);
  const camera = Object.seal({ x: 0, y: 0 });
  const enemies = [];
  const foams = [];
  const cocoons = [];
  const enemyProjectiles = [];
  const particles = [];
  const pickups = [];
  const dashTrail = [];
  const hudCache = Object.seal({ score: -1, wave: -1, lives: -1, weapon: '', multiplier: -1 });
  let toastTimer = 0;
  let audioCtx = null;
  let viewScale = 1;
  let lastTime = 0;
  let accumulator = 0;
  const STEP = 1 / 60;
  const MAX_FRAME = 0.1;
  let rafId = 0;
  function resizeStage() {
    const maxStageHeight = Math.min(window.innerHeight * 0.9, 720);
    let targetHeight = maxStageHeight;
    let targetWidth = targetHeight * (VIEW.width / VIEW.height);
    const maxStageWidth = Math.min(window.innerWidth * 0.92, 1280);
    if (targetWidth > maxStageWidth) {
      targetWidth = maxStageWidth;
      targetHeight = targetWidth * (VIEW.height / VIEW.width);
    }
    if (stageEl) {
      stageEl.style.height = `${targetHeight}px`;
      stageEl.style.width = `${targetWidth}px`;
    }
    canvas.style.height = `${targetHeight}px`;
    canvas.style.width = `${targetWidth}px`;
    viewScale = targetWidth / VIEW.width;
    if (hudEl) {
      hudEl.style.transformOrigin = 'top center';
      hudEl.style.transform = `translateX(-50%) scale(${viewScale})`;
    }
    if (multBarEl) {
      multBarEl.style.transformOrigin = 'top right';
      multBarEl.style.transform = `scale(${viewScale})`;
      multBarEl.style.right = `${-50 * viewScale}px`;
      multBarEl.style.top = '0px';
    }
    if (toastEl) {
      toastEl.style.transformOrigin = 'center';
      toastEl.style.transform = `translate(-50%, -50%) scale(${viewScale})`;
    }
    if (multTextEl) {
      multTextEl.style.transformOrigin = 'center';
      multTextEl.style.transform = `translate(-50%, -50%) scale(${viewScale})`;
    }
    if (overlayEl) overlayEl.style.fontSize = `${16 * viewScale}px`;
  }
  function initEvents() {
    doc.addEventListener('keydown', (ev) => {
      if (!ev.isTrusted) return;
      const key = ev.key.toLowerCase();
      if (key === 'a' || key === 'arrowleft') input.left = true;
      if (key === 'd' || key === 'arrowright') input.right = true;
      if (key === 's' || key === 'arrowdown') input.down = true;
      if (key === 'w' || key === 'arrowup' || key === ' ') {
        if (!input.jump) input.jumpBuffer = CFG.jumpBufferMs;
        if (input.down) input.dropBuffer = CFG.dropBufferMs;
        input.jump = true;
      }
      if (key === 'shift') { input.dash = true; input.dashBuffer = 160; }
      if (key === '1' && player.weaponUnlocked.smg) setWeapon('smg');
      if (key === '2' && player.weaponUnlocked.shotgun) setWeapon('shotgun');
      if (key === '3' && player.weaponUnlocked.rail) setWeapon('rail');
      if (world.overlayVisible && key === 'enter') {
        if (playBtn && playBtn.style.display !== 'none') playBtn.click();
        else startGameInternal();
      }
    });
    doc.addEventListener('keyup', (ev) => {
      if (!ev.isTrusted) return;
      const key = ev.key.toLowerCase();
      if (key === 'a' || key === 'arrowleft') input.left = false;
      if (key === 'd' || key === 'arrowright') input.right = false;
      if (key === 's' || key === 'arrowdown') input.down = false;
      if (key === 'w' || key === 'arrowup' || key === ' ') input.jump = false;
      if (key === 'shift') input.dash = false;
    });
    canvas.addEventListener('mousemove', (ev) => {
      if (!ev.isTrusted) return;
      const rect = canvas.getBoundingClientRect();
      const rx = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
      const ry = clamp((ev.clientY - rect.top) / rect.height, 0, 1);
      input.mouseX = rx * VIEW.width;
      input.mouseY = ry * VIEW.height;
    });
    canvas.addEventListener('mousedown', (ev) => {
      if (!ev.isTrusted) return;
      if (ev.button === 0) input.primary = true;
      if (ev.button === 2) input.secondary = true;
      if (canvas) canvas.focus({ preventScroll: true });
      ev.preventDefault();
    });
    doc.addEventListener('mouseup', (ev) => {
      if (!ev.isTrusted) return;
      if (ev.button === 0) input.primary = false;
      if (ev.button === 2) input.secondary = false;
    });
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (!world.overlayVisible) return;
        if (world.state === 'idle' || world.state === 'gameover') startGameInternal();
      });
    }
    window.addEventListener('resize', resizeStage);
  }
  function setWeapon(type) {
    player.weapon = type;
    weaponEl.textContent = type.toUpperCase();
    if (type === 'shotgun') showToast('SHOTGUN READY');
    else if (type === 'rail') showToast('RAIL READY');
    else showToast('SMG READY');
  }
  function resetInputState() {
    input.left = false;
    input.right = false;
    input.down = false;
    input.jump = false;
    input.dash = false;
    input.primary = false;
    input.secondary = false;
    input.jumpBuffer = 0;
    input.dropBuffer = 0;
    input.dashBuffer = 0;
  }
  function resetState() {
    enemies.length = 0;
    foams.length = 0;
    cocoons.length = 0;
    enemyProjectiles.length = 0;
    particles.length = 0;
    pickups.length = 0;
    dashTrail.length = 0;
    world.wave = 1;
    world.score = 0;
    world.comboTimer = 0;
    world.multiplier = 1;
    world.chainCount = 0;
    world.hitstop = 0;
    world.shakeTimer = 0;
    world.shakeMag = 0;
    world.scenarioIndex = 0;
    world.scenarioCycle = 0;
    world.scenario = SCENARIOS[0];
    world.transitionTimer = 0;
    world.transitionPhase = 0;
    world.spawnDelay = 0;
    world.activeWave = false;
    world.tutorialTimer = 3200;
    world.pendingSpawns = 0;
    world.aliveEnemies = 0;
    world.inPlay = false;
    spawner.plan.length = 0;
    configureSpawner();
    player.vx = 0;
    player.vy = 0;
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.invulnTimer = 0;
    player.coyoteTimer = 0;
    player.dropTimer = 0;
    player.wrapTimer = 0;
    player.facing = 1;
    player.apexTimer = 0;
    player.onGround = false;
    player.onOneWay = null;
    player.lives = 3;
    player.weapon = player.weaponUnlocked.rail ? 'rail' : player.weaponUnlocked.shotgun ? 'shotgun' : 'smg';
    player.ammo.smg = 80;
    player.ammo.shotgun = player.weaponUnlocked.shotgun ? clamp(player.ammo.shotgun, 0, CFG.ammoMax.shotgun) : 0;
    player.ammo.rail = player.weaponUnlocked.rail ? clamp(player.ammo.rail, 0, CFG.ammoMax.rail) : 0;
    placePlayerAtStart();
    updateCameraImmediate();
    updateHUD(true);
    if (submessageEl) submessageEl.textContent = 'A/D to move • W/Space to jump • Shift to dash • Right click foam';
    if (overlayInfoEl) overlayInfoEl.textContent = '';
    if (playBtn) playBtn.textContent = 'START';
    world.state = 'countdown';
    world.spawnDelay = 400;
  }
  function configureSpawner() {
    spawner.plan.length = 0;
    spawner.index = 0;
    spawner.clock = 0;
    spawner.active = false;
    spawner.started = false;
    world.pendingSpawns = 0;
    world.aliveEnemies = enemies.length;
    world.activeWave = false;
    const scenario = world.scenario;
    if (!scenario) return;
    const basePlan = scenario.spawnPlan || [];
    if (!basePlan.length) return;
    const lastTime = basePlan[basePlan.length - 1].time || 0;
    const baseDuration = Math.max(1200, lastTime + 1600);
    const cycleBoost = Math.min(world.scenarioCycle, 2);
    const waveBoost = Math.max(0, Math.floor((world.wave - 1) / SCENARIOS.length));
    const repeats = Math.min(3, 1 + cycleBoost + waveBoost);
    for (let r = 0; r < repeats; r += 1) {
      const offset = r * baseDuration;
      for (let i = 0; i < basePlan.length; i += 1) {
        const event = basePlan[i];
        if (!event || !event.entries || !event.entries.length) continue;
        const entriesCopy = [];
        let eventCount = 0;
        for (let e = 0; e < event.entries.length; e += 1) {
          const entry = event.entries[e];
          if (!entry || !entry.type) continue;
          const count = Math.max(1, entry.count || 1);
          eventCount += count;
          entriesCopy.push({
            type: entry.type,
            count,
            entrance: entry.entrance || 'top',
            lane: Number.isFinite(entry.lane) ? entry.lane : null,
            vx: entry.vx || 0
          });
        }
        if (!entriesCopy.length) continue;
        const time = Math.max(0, (event.time || 0) + offset);
        spawner.plan.push({ time, entries: entriesCopy });
        world.pendingSpawns += eventCount;
      }
    }
    spawner.plan.sort((a, b) => a.time - b.time);
    if (spawner.plan.length && spawner.plan[0].time > 500) spawner.plan[0].time = 500;
  }
  function beginSpawning() {
    spawner.clock = 0;
    spawner.index = 0;
    spawner.started = false;
    spawner.active = spawner.plan.length > 0;
  }
  function processSpawner(ms) {
    if (!spawner.active) return;
    spawner.clock = Math.min(spawner.clock + ms, 120000);
    while (spawner.index < spawner.plan.length && spawner.clock >= spawner.plan[spawner.index].time) {
      const event = spawner.plan[spawner.index];
      const hpScale = Math.pow(CFG.enemy.scalePerWave, world.wave - 1 + world.scenarioCycle * 0.4);
      const spawned = runSpawnEntries(event.entries, hpScale);
      if (spawned) {
        if (!spawner.started) maybeSpawnPickup();
        spawner.started = true;
        world.activeWave = true;
      }
      spawner.index += 1;
    }
    if (spawner.index >= spawner.plan.length) spawner.active = false;
  }
  function runSpawnEntries(entries, hpScale) {
    let spawnedAny = false;
    for (let i = 0; i < entries.length; i += 1) {
      if (spawnEnemyFromEntry(entries[i], hpScale)) spawnedAny = true;
    }
    return spawnedAny;
  }
  function spawnEnemyFromEntry(entry, hpScale) {
    if (!entry || !entry.type) return false;
    const count = Math.max(1, entry.count || 1);
    const dims = getEnemyDimensions(entry.type);
    let spawned = false;
    let successes = 0;
    let failures = 0;
    for (let i = 0; i < count; i += 1) {
      const path = resolveSpawnPath(entry, dims);
      let enemy = null;
      if (path) {
        const spawnPoint = { x: path.start.x, y: path.start.y - dims.h * 0.5 };
        enemy = makeEnemy(entry.type, spawnPoint, hpScale, entry.vx);
        if (enemy) {
          if (Number.isFinite(entry.lane)) {
            enemy.lane = entry.lane;
            enemy.targetLane = entry.lane;
          }
          applySpawnPath(enemy, path);
        }
      }
      if (enemy && registerEnemy(enemy)) {
        spawned = true;
        successes += 1;
      } else {
        failures += 1;
      }
    }
    if (successes > 0) world.pendingSpawns = Math.max(0, world.pendingSpawns - successes);
    if (failures > 0) queueSpawnRetry(entry, failures);
    return spawned;
  }
  function resolveSpawnPath(entry, dims) {
    const scenario = world.scenario;
    if (!scenario || !scenario.entrances) return null;
    const options = collectEntranceCandidates(entry);
    for (let i = 0; i < options.length; i += 1) {
      const option = options[i];
      const path = buildPathFromCandidate(option.data, option.entrance, dims);
      if (!path) continue;
      if (pathIsClear(path, dims)) return path;
    }
    return fallbackSpawnPath(entry, dims);
  }
  function collectEntranceCandidates(entry) {
    const scenario = world.scenario;
    const result = [];
    if (!scenario || !scenario.entrances) return result;
    const preferred = entry.entrance || 'top';
    const order = [preferred, 'top', 'left', 'right'];
    const seen = new Set();
    for (let i = 0; i < order.length; i += 1) {
      const key = order[i];
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const list = scenario.entrances[key];
      if (!list || !list.length) continue;
      if (key === preferred && Number.isFinite(entry.lane) && list[entry.lane]) {
        result.push({ data: list[entry.lane], entrance: key });
      } else if (key === preferred && Number.isFinite(entry.lane)) {
        const lanes = scenario.lanes || EMPTY_ARRAY;
        const laneData = lanes[entry.lane];
        if (laneData) {
          let closest = null;
          let bestDist = Infinity;
          for (let li = 0; li < list.length; li += 1) {
            const candidate = list[li];
            if (!candidate || !candidate.end) continue;
            const dx = (candidate.end.x || 0) - (laneData.x1 + laneData.x2) * 0.5;
            const dy = (candidate.end.y || 0) - laneData.y;
            const dist = Math.hypot(dx, dy);
            if (dist < bestDist) {
              bestDist = dist;
              closest = candidate;
            }
          }
          if (closest) result.push({ data: closest, entrance: key });
        }
      }
      for (let lane = 0; lane < list.length; lane += 1) {
        if (key === preferred && Number.isFinite(entry.lane) && lane === entry.lane) continue;
        result.push({ data: list[lane], entrance: key });
      }
    }
    return result;
  }
  function buildPathFromCandidate(candidate, entrance, dims) {
    if (!candidate || !candidate.start || !candidate.end) return null;
    const start = resolveEntrancePoint(candidate.start, dims);
    const end = resolveEntrancePoint(candidate.end, dims);
    if (!start || !end) return null;
    const duration = Math.max(360, candidate.duration || 720);
    return { start, end, duration, entrance };
  }
  function resolveEntrancePoint(point, dims) {
    if (!point) return null;
    const ref = point.ref || 'center';
    let y = point.y;
    if (ref === 'floor') y = point.y - dims.h * 0.5;
    else if (ref === 'top') y = point.y + dims.h * 0.5;
    return { x: point.x, y };
  }
  function pathIsClear(path, dims) {
    const solids = world.scenario ? world.scenario.solids : [];
    const steps = 8;
    for (let i = 0; i <= steps; i += 1) {
      const t = smoothStep(i / steps);
      const cx = lerp(path.start.x, path.end.x, t);
      const cy = lerp(path.start.y, path.end.y, t);
      const left = cx - dims.w * 0.5;
      const top = cy - dims.h * 0.5;
      for (let s = 0; s < solids.length; s += 1) {
        const solid = solids[s];
        if (rectOverlapRaw(left, top, dims.w, dims.h, solid.x, solid.y, solid.w, solid.h)) return false;
      }
    }
    return true;
  }
  function applySpawnPath(enemy, path) {
    if (!enemy || !path) return;
    enemy.x = path.start.x - enemy.w * 0.5;
    enemy.y = path.start.y - enemy.h * 0.5;
    enemy.spawnPath = path;
    enemy.spawnDuration = path.duration;
    enemy.spawnTimer = path.duration;
    enemy.spawnEntrance = path.entrance;
    enemy.postSpawnState = enemy.state;
    enemy.state = 'spawn';
    enemy.spawnGuard = Math.max(enemy.spawnGuard || 0, path.duration + 200);
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.onGround = false;
  }
  function queueSpawnRetry(entry, count) {
    if (!entry || count <= 0) return;
    const retryEntry = {
      type: entry.type,
      count,
      entrance: entry.entrance || 'top',
      lane: Number.isFinite(entry.lane) ? entry.lane : null,
      vx: entry.vx || 0
    };
    const retryTime = spawner.clock + 260 + Math.floor(rng() * 240);
    const event = { time: retryTime, entries: [retryEntry] };
    const plan = spawner.plan;
    const startIndex = Math.max(spawner.index, 0);
    let insertIndex = plan.length;
    for (let i = startIndex; i < plan.length; i += 1) {
      if (plan[i].time > retryTime) { insertIndex = i; break; }
    }
    plan.splice(insertIndex, 0, event);
  }
  function fallbackSpawnPath(entry, dims) {
    const scenario = world.scenario;
    if (!scenario) return null;
    const halfW = dims.w * 0.5;
    const oneWayList = scenario.oneWays || EMPTY_ARRAY;
    const lanes = oneWayList.length ? oneWayList : (scenario.solids || EMPTY_ARRAY);
    let bestPath = null;
    let bestY = Infinity;
    for (let i = 0; i < lanes.length; i += 1) {
      const lane = lanes[i];
      if (!lane || lane.w < dims.w + 8 || lane.h > 48) continue;
      const centerX = clamp(lane.x + lane.w * 0.5, halfW, scenario.width - halfW);
      const endY = lane.y - dims.h * 0.5;
      const path = { start: { x: centerX, y: -120 }, end: { x: centerX, y: endY }, duration: 820, entrance: 'top' };
      if (!pathIsClear(path, dims)) continue;
      if (!bestPath || lane.y < bestY) {
        bestPath = path;
        bestY = lane.y;
      }
    }
    return bestPath;
  }
  function placePlayerAtStart() {
    const start = world.scenario.playerStart;
    player.x = clamp(start.x, 0, world.scenario.width - player.w);
    player.y = clamp(start.y, 0, VIEW.height - player.h - 4);
  }
  function getScenarioLanes() {
    const scenario = world.scenario;
    return scenario && scenario.lanes ? scenario.lanes : EMPTY_ARRAY;
  }
  function findLaneForPosition(x, y, tolerance = 8) {
    const lanes = getScenarioLanes();
    for (let i = 0; i < lanes.length; i += 1) {
      const lane = lanes[i];
      if (!lane) continue;
      if (x < lane.x1 - 8 || x > lane.x2 + 8) continue;
      if (Math.abs(y - lane.y) <= tolerance) return i;
    }
    return null;
  }
  function resolveLaneLanding(entity) {
    const laneIndex = findLaneForPosition(entity.x + entity.w * 0.5, entity.y + entity.h, 8);
    if (laneIndex !== null && laneIndex !== undefined) {
      entity.lane = laneIndex;
      if (entity.pendingLane === laneIndex) entity.pendingLane = null;
    }
  }
  function getPlayerLaneIndex() {
    return findLaneForPosition(player.x + player.w * 0.5, player.y + player.h, 10);
  }
  function findLaneStep(from, to, lanes) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return null;
    const total = lanes.length;
    if (to < 0 || to >= total || from < 0 || from >= total) return null;
    const queue = [from];
    const visited = new Set([from]);
    const prev = new Map();
    while (queue.length) {
      const current = queue.shift();
      if (current === to) break;
      const lane = lanes[current];
      if (!lane || !lane.links) continue;
      for (let i = 0; i < lane.links.length; i += 1) {
        const link = lane.links[i];
        if (!link || !Number.isFinite(link.to)) continue;
        const target = link.to;
        if (target < 0 || target >= total) continue;
        if (visited.has(target)) continue;
        visited.add(target);
        prev.set(target, { from: current, link });
        queue.push(target);
      }
    }
    if (!prev.has(to)) return null;
    let node = to;
    const path = [];
    while (node !== from) {
      const step = prev.get(node);
      if (!step) break;
      path.push(step.link);
      node = step.from;
    }
    return path.length ? path[path.length - 1] : null;
  }
  function navigateGroundEnemy(enemy, dt, ms, spec) {
    const lanes = getScenarioLanes();
    if (!lanes.length) return false;
    if (!Number.isFinite(enemy.lane)) resolveLaneLanding(enemy);
    if (!Number.isFinite(enemy.lane)) return false;
    const lane = lanes[enemy.lane];
    if (!lane) return false;
    const playerLane = getPlayerLaneIndex();
    let targetLane = Number.isFinite(enemy.targetLane) ? enemy.targetLane : playerLane;
    if (!Number.isFinite(targetLane)) targetLane = enemy.lane;
    if (enemy.angry && Number.isFinite(playerLane)) targetLane = playerLane;
    let destination = clamp(player.x + player.w * 0.5, lane.x1 + enemy.w * 0.5, lane.x2 - enemy.w * 0.5);
    let link = null;
    enemy.targetLane = targetLane;
    if (targetLane !== enemy.lane) {
      link = findLaneStep(enemy.lane, targetLane, lanes);
      if (!link && Number.isFinite(playerLane) && playerLane !== enemy.lane) link = findLaneStep(enemy.lane, playerLane, lanes);
      if (link) {
        destination = clamp(link.x, lane.x1 + enemy.w * 0.5, lane.x2 - enemy.w * 0.5);
        enemy.pendingLane = link.to;
        enemy.activeLink = link;
      } else {
        enemy.activeLink = null;
        enemy.pendingLane = null;
      }
    } else {
      enemy.activeLink = null;
      enemy.pendingLane = null;
    }
    const center = enemy.x + enemy.w * 0.5;
    const diff = destination - center;
    const accel = spec.accel;
    if (Math.abs(diff) > (spec.tolerance || 6)) enemy.vx += Math.sign(diff) * accel * dt;
    else enemy.vx = lerp(enemy.vx, 0, clamp(dt * 6, 0, 1));
    const speedCap = spec.speed * (enemy.angry ? CFG.angrySpeedBoost : 1);
    enemy.vx = clamp(enemy.vx, -speedCap, speedCap);
    if (
      enemy.activeLink &&
      Math.abs(diff) <= (spec.triggerRadius || 12) &&
      enemy.onGround &&
      (enemy.jumpCooldown || 0) <= 0
    ) {
      if (enemy.activeLink.type === 'jump') {
        const base = spec.jumpPower || CFG.jumpVel * 0.7;
        enemy.vy = -Math.max(base, enemy.activeLink.power || 0);
        enemy.jumpCooldown = enemy.activeLink.cooldown || 240;
      } else if (enemy.activeLink.type === 'drop') {
        enemy.dropTimer = Math.max(enemy.dropTimer, enemy.activeLink.cooldown || 200);
        enemy.jumpCooldown = enemy.activeLink.cooldown || 200;
      }
    }
    return true;
  }
  function getEnemyDimensions(type) {
    switch (type) {
      case 'Turret': return { w: 40, h: 46 };
      case 'Spiker': return { w: 36, h: 32 };
      case 'BlobTank': return { w: 64, h: 60 };
      case 'Bloblet': return { w: 28, h: 28 };
      case 'Kamikaze': return { w: 32, h: 32 };
      case 'Wisp': return { w: 36, h: 34 };
      default: return { w: 36, h: 46 };
    }
  }
  function registerEnemy(enemy) {
    if (!enemy) return false;
    if (enemies.length >= 30) return false;
    const levelWidth = world.scenario ? world.scenario.width : VIEW.width;
    const minX = -WRAP_BUFFER * 2;
    const maxX = levelWidth - enemy.w + WRAP_BUFFER * 2;
    enemy.x = clamp(enemy.x, minX, maxX);
    enemy.y = clamp(enemy.y, -200, VIEW.height - enemy.h);
    enemies.push(enemy);
    world.aliveEnemies += 1;
    return true;
  }
  function startGameInternal() {
    if (overlayEl) overlayEl.classList.add('hidden');
    if (playBtn) playBtn.style.display = '';
    world.overlayVisible = false;
    if (toastEl) {
      toastEl.classList.add('hidden');
      toastEl.classList.remove('toast-visible');
    }
    toastTimer = 0;
    lastTime = 0;
    accumulator = 0;
    resetInputState();
    resetState();
    resumeAudio();
    world.running = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
    if (canvas) canvas.focus({ preventScroll: true });
  }
  function resumeAudio() {
    if (!audioCtx) {
      try { audioCtx = new AudioContext(); } catch (_) { audioCtx = null; }
    } else if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function loop(timestamp) {
    if (!world.running) {
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(loop);
    if (!lastTime) lastTime = timestamp;
    let delta = (timestamp - lastTime) / 1000;
    if (!Number.isFinite(delta) || delta <= 0) delta = STEP;
    else if (delta > MAX_FRAME) delta = MAX_FRAME;
    lastTime = timestamp;
    if (world.hitstop > 0) {
      world.hitstop = Math.max(0, world.hitstop - delta * 1000);
      render();
      return;
    }
    accumulator += delta;
    if (accumulator > STEP * 5) accumulator = STEP * 5;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
    render();
  }
  function update(dt) {
    const ms = dt * 1000;
    updateInputTimers(ms);
    if (world.state === 'gameover') return;
    updatePlayer(dt, ms);
    updateFoams(dt, ms);
    updateCocoons(dt, ms);
    updateEnemies(dt, ms);
    updateEnemyProjectiles(dt, ms);
    updatePickups(dt, ms);
    updateParticles(dt, ms);
    updateWorld(ms);
    updateCamera();
  }
  function updateInputTimers(ms) {
    if (input.jumpBuffer > 0) input.jumpBuffer = Math.max(0, input.jumpBuffer - ms);
    if (input.dropBuffer > 0) input.dropBuffer = Math.max(0, input.dropBuffer - ms);
    if (input.dashBuffer > 0) input.dashBuffer = Math.max(0, input.dashBuffer - ms);
  }
  function updatePlayer(dt, ms) {
    player.invulnTimer = Math.max(0, player.invulnTimer - ms);
    if (player.dashTimer > 0) {
      player.dashTimer = Math.max(0, player.dashTimer - ms);
      dashTrail.push({ x: player.x + player.w * 0.5, y: player.y + player.h * 0.5, life: 200 });
      if (dashTrail.length > 20) dashTrail.shift();
    }
    if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - ms);
    if (player.dropTimer > 0) player.dropTimer = Math.max(0, player.dropTimer - ms);
    handleMovement(dt, ms);
    handleWeapons(ms);
  }
  function handleMovement(dt, ms) {
    let move = 0;
    if (input.left) move -= 1;
    if (input.right) move += 1;
    if (player.dashTimer > 0) {
      player.vx = player.dashDir * CFG.dashVel;
      player.vy = 0;
    } else {
      const accel = player.onGround ? CFG.moveAccel : CFG.moveAccel * CFG.airControl;
      player.vx += move * accel * dt;
      const friction = player.onGround ? clamp(dt * 14, 0, 1) : clamp(dt * 4, 0, 1);
      if (!move) player.vx = lerp(player.vx, 0, friction);
      const maxSpeed = player.onGround ? CFG.moveMax : CFG.moveMax * 0.95;
      player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
    }
    let gravityScale = 1;
    if (player.onGround) {
      player.apexTimer = 0;
    } else {
      if (Math.abs(player.vy) < 55 && player.vy > -220) player.apexTimer = CFG.apexMs;
      else if (player.apexTimer > 0) player.apexTimer = Math.max(0, player.apexTimer - ms);
      if (player.apexTimer > 0) {
        gravityScale *= CFG.apexGravityScale;
        player.apexTimer = Math.max(0, player.apexTimer - ms);
      }
      if (!input.jump && player.vy < 0) gravityScale *= CFG.lowJumpGravityScale;
    }
    player.vy += CFG.gravity * dt * gravityScale;
    if (player.onGround) player.coyoteTimer = CFG.coyoteMs; else player.coyoteTimer = Math.max(0, player.coyoteTimer - ms);
    const wantsDrop = player.onOneWay && input.dropBuffer > 0;
    if (wantsDrop) {
      input.dropBuffer = 0;
      player.dropTimer = 200;
      player.onGround = false;
      player.onOneWay = null;
    }
    if (input.jumpBuffer > 0 && (player.coyoteTimer > 0 || player.onGround)) performJump();
    if (input.dashBuffer > 0 && player.dashCooldown === 0) startDash();
    integratePlayer(dt);
    applyWrap(player, ms);
    if (move) player.facing = move > 0 ? 1 : -1;
    else {
      const aimDir = Math.cos(player.aimAngle);
      if (Math.abs(aimDir) > 0.2) player.facing = aimDir >= 0 ? 1 : -1;
    }
  }
  function performJump() {
    input.jumpBuffer = 0;
    player.vy = -CFG.jumpVel;
    player.onGround = false;
    player.coyoteTimer = 0;
    player.apexTimer = 0;
    dashTrail.push({ x: player.x + player.w * 0.5, y: player.y + player.h, life: 160 });
    playBeep(440, 0.05, 0.15);
  }
  function startDash() {
    input.dashBuffer = 0;
    player.dashTimer = CFG.dashMs;
    player.dashCooldown = CFG.dashCdMs;
    const worldMouseX = camera.x + input.mouseX;
    player.dashDir = worldMouseX >= player.x + player.w * 0.5 ? 1 : -1;
    player.invulnTimer = Math.max(player.invulnTimer, CFG.dashMs);
    dashTrail.length = 0;
    playBeep(220, 0.04, 0.2);
  }
  function sweepMove(body, dt, opts) {
    const level = world.scenario;
    if (!level) return;
    const solids = level.solids;
    const allowOneWay = opts && opts.allowOneWay;
    const oneWays = allowOneWay ? level.oneWays : EMPTY_ARRAY;
    const ignoreOneWay = opts && opts.ignoreOneWay;
    const prevBottom = opts && Number.isFinite(opts.prevBottom) ? opts.prevBottom : body.y + body.h;
    let vx = body.vx || 0;
    let vy = body.vy || 0;
    let x = body.x;
    let y = body.y;
    let onGround = false;
    let onOneWay = null;
    if (Math.abs(vx) > EPSILON) {
      const dx = vx * dt;
      const sweepX = sweepRectAgainstWorld(x, y, body.w, body.h, dx, 0, solids, EMPTY_ARRAY, prevBottom, true);
      let stepped = false;
      const stepHeight = opts && opts.stepHeight ? opts.stepHeight : 0;
      if (sweepX.hit && stepHeight > 0 && Math.abs(dx) > EPSILON && (body.onGround || (opts && opts.forceStep))) {
        const dir = Math.sign(dx);
        if (dir !== 0) {
          const maxStep = Math.ceil(stepHeight);
          for (let step = 1; step <= maxStep; step += 1) {
            const ny = y - step;
            if (rectCollidesSolids(x, ny, body.w, body.h, solids)) continue;
            if (rectCollidesSolids(x + dx, ny, body.w, body.h, solids)) continue;
            y = ny;
            x += dx;
            stepped = true;
            break;
          }
        }
      }
      if (!stepped) {
        x += dx * sweepX.time;
        if (sweepX.hit) {
          vx = 0;
          x += sweepX.normalX * EPSILON;
        }
      }
    } else {
      x += vx * dt;
    }
    if (Math.abs(vy) > EPSILON) {
      const dy = vy * dt;
      const sweepY = sweepRectAgainstWorld(x, y, body.w, body.h, 0, dy, solids, oneWays, prevBottom, ignoreOneWay);
      y += dy * sweepY.time;
      if (sweepY.hit) {
        if (sweepY.normalY === -1) {
          onGround = true;
          onOneWay = sweepY.oneWay;
        }
        vy = 0;
        y += sweepY.normalY * EPSILON;
      }
    } else {
      y += vy * dt;
    }
    body.x = x;
    body.y = y;
    body.vx = vx;
    body.vy = vy;
    body.onGround = onGround;
    if ('onOneWay' in body) body.onOneWay = onGround ? onOneWay : null;
  }
  function sweepRectAgainstWorld(x, y, w, h, dx, dy, solids, oneWays, prevBottom, ignoreOneWay) {
    let earliest = 1;
    let hit = false;
    let normalX = 0;
    let normalY = 0;
    let hitOneWay = null;
    for (let i = 0; i < solids.length; i += 1) {
      const res = sweptAABB(x, y, w, h, dx, dy, solids[i]);
      if (!res) continue;
      if (res.time < earliest) {
        earliest = res.time;
        hit = true;
        normalX = res.normalX;
        normalY = res.normalY;
        hitOneWay = null;
      }
    }
    if (dy >= 0 && !ignoreOneWay) {
      for (let i = 0; i < oneWays.length; i += 1) {
        const plat = oneWays[i];
        if (prevBottom > plat.y + 4) continue;
        const res = sweptAABB(x, y, w, h, dx, dy, plat);
        if (!res || res.normalY !== -1) continue;
        if (res.time < earliest) {
          earliest = res.time;
          hit = true;
          normalX = res.normalX;
          normalY = res.normalY;
          hitOneWay = plat;
        }
      }
    }
    return { time: earliest, hit, normalX, normalY, oneWay: hitOneWay };
  }
  function sweptAABB(x, y, w, h, dx, dy, rect) {
    let invEntryX;
    let invExitX;
    if (dx > 0) {
      invEntryX = rect.x - (x + w);
      invExitX = rect.x + rect.w - x;
    } else if (dx < 0) {
      invEntryX = rect.x + rect.w - x;
      invExitX = rect.x - (x + w);
    } else {
      invEntryX = -Infinity;
      invExitX = Infinity;
    }
    let invEntryY;
    let invExitY;
    if (dy > 0) {
      invEntryY = rect.y - (y + h);
      invExitY = rect.y + rect.h - y;
    } else if (dy < 0) {
      invEntryY = rect.y + rect.h - y;
      invExitY = rect.y - (y + h);
    } else {
      invEntryY = -Infinity;
      invExitY = Infinity;
    }
    const entryX = dx === 0 ? -Infinity : invEntryX / dx;
    const exitX = dx === 0 ? Infinity : invExitX / dx;
    const entryY = dy === 0 ? -Infinity : invEntryY / dy;
    const exitY = dy === 0 ? Infinity : invExitY / dy;
    const entryTime = Math.max(entryX, entryY);
    const exitTime = Math.min(exitX, exitY);
    if (entryTime > exitTime || entryTime < 0 || entryTime > 1) return null;
    if (entryX < 0 && entryY < 0) return null;
    let normalX = 0;
    let normalY = 0;
    if (entryX > entryY) normalX = dx > 0 ? -1 : 1;
    else normalY = dy > 0 ? -1 : 1;
    return { time: entryTime, normalX, normalY };
  }
  function rectCollidesSolids(x, y, w, h, solids) {
    for (let i = 0; i < solids.length; i += 1) {
      const s = solids[i];
      if (x + w <= s.x || x >= s.x + s.w || y + h <= s.y || y >= s.y + s.h) continue;
      return true;
    }
    return false;
  }
  function snapToGround(body, prevBottom, allowOneWay, ignoreOneWay) {
    if (body.onGround) return;
    if ((body.vy || 0) < -1) return;
    const level = world.scenario;
    if (!level) return;
    const yBottom = body.y + body.h;
    const snapDist = 3;
    const solids = level.solids;
    for (let i = 0; i < solids.length; i += 1) {
      const s = solids[i];
      if (body.x + body.w <= s.x + EPSILON || body.x >= s.x + s.w - EPSILON) continue;
      const dist = s.y - yBottom;
      if (dist >= -snapDist && dist <= snapDist) {
        body.y = s.y - body.h;
        body.vy = 0;
        body.onGround = true;
        if ('onOneWay' in body) body.onOneWay = null;
        return;
      }
    }
    if (!allowOneWay || ignoreOneWay) return;
    const oneWays = level.oneWays;
    for (let i = 0; i < oneWays.length; i += 1) {
      const plat = oneWays[i];
      if (prevBottom > plat.y + 4) continue;
      if (body.x + body.w <= plat.x + EPSILON || body.x >= plat.x + plat.w - EPSILON) continue;
      const dist = plat.y - yBottom;
      if (dist >= -snapDist && dist <= snapDist) {
        body.y = plat.y - body.h;
        body.vy = 0;
        body.onGround = true;
        if ('onOneWay' in body) body.onOneWay = plat;
        return;
      }
    }
  }
  function enforceHorizontalBounds(body) {
    const level = world.scenario;
    if (!level) return;
    if (canUseWrap(body)) return;
    if (body.x < 0) {
      body.x = 0;
      if (body.vx < 0) body.vx = 0;
    }
    const max = level.width - body.w;
    if (body.x > max) {
      body.x = max;
      if (body.vx > 0) body.vx = 0;
    }
  }
  function applyWrap(entity, ms) {
    const level = world.scenario;
    if (!level) return;
    if (entity.wrapTimer) entity.wrapTimer = Math.max(0, entity.wrapTimer - ms);
    if (!canUseWrap(entity)) return;
    const width = level.width;
    if (entity.x + entity.w < -WRAP_BUFFER) {
      entity.x = width + WRAP_BUFFER - entity.w;
      entity.wrapTimer = Math.max(entity.wrapTimer || 0, 320);
      if (entity === player) player.invulnTimer = Math.max(player.invulnTimer, 200);
    } else if (entity.x > width + WRAP_BUFFER) {
      entity.x = -WRAP_BUFFER;
      entity.wrapTimer = Math.max(entity.wrapTimer || 0, 320);
      if (entity === player) player.invulnTimer = Math.max(player.invulnTimer, 200);
    }
  }
  function canUseWrap(entity) {
    const level = world.scenario;
    if (!level || !level.wraps || !level.wraps.length) return false;
    const cy = entity.y + entity.h * 0.5;
    const wraps = level.wraps;
    for (let i = 0; i < wraps.length; i += 1) {
      const range = wraps[i];
      if (cy >= range.y && cy <= range.y + range.h) return true;
    }
    return false;
  }
  function integratePlayer(dt) {
    const prevBottom = player.y + player.h;
    const wasGrounded = player.onGround;
    sweepMove(player, dt, { allowOneWay: true, ignoreOneWay: player.dropTimer > 0, prevBottom, stepHeight: CFG.stepHeight });
    snapToGround(player, prevBottom, true, player.dropTimer > 0);
    if (!wasGrounded && player.onGround) spawnLandingDust(player.x + player.w * 0.5, player.y + player.h);
    enforceHorizontalBounds(player);
    if (player.y < -240) player.y = -240;
    const worldMouseX = camera.x + input.mouseX;
    const worldMouseY = camera.y + input.mouseY;
    const aimX = worldMouseX - (player.x + player.w * 0.5);
    const aimY = worldMouseY - (player.y + player.h * 0.4);
    player.aimAngle = Math.atan2(aimY, aimX);
  }
  function handleWeapons(ms) {
    if (player.fireTimer > 0) player.fireTimer = Math.max(0, player.fireTimer - ms);
    if (player.shotgunTimer > 0) player.shotgunTimer = Math.max(0, player.shotgunTimer - ms);
    if (player.railTimer > 0) player.railTimer = Math.max(0, player.railTimer - ms);
    if (player.foamTimer > 0) player.foamTimer = Math.max(0, player.foamTimer - ms);
    if (input.primary) firePrimary();
    if (input.secondary) fireFoam();
  }
  function firePrimary() {
    const dir = normalize(Math.cos(player.aimAngle), Math.sin(player.aimAngle));
    if (!dir) return;
    const muzzle = { x: player.x + player.w * 0.5, y: player.y + player.h * 0.4 };
    if (player.weapon === 'smg') {
      if (player.fireTimer > 0 || player.ammo.smg <= 0) return;
      player.fireTimer = 1000 / CFG.smg.rof;
      player.ammo.smg -= 1;
      fireRay(muzzle, dir, CFG.smg.range, CFG.smg.dmg, CFG.smg.knock, 1);
      spawnMuzzleFlash(muzzle.x, muzzle.y, dir.x, dir.y);
      playBeep(760, 0.02, 0.08);
    } else if (player.weapon === 'shotgun') {
      if (!player.weaponUnlocked.shotgun || player.shotgunTimer > 0 || player.ammo.shotgun <= 0) return;
      player.shotgunTimer = 1000 / CFG.shotgun.rof;
      player.ammo.shotgun -= 1;
      for (let i = 0; i < CFG.shotgun.pellets; i += 1) {
        const spread = (rng() - 0.5) * (CFG.shotgun.spread * Math.PI / 180);
        const pelletDir = normalize(Math.cos(player.aimAngle + spread), Math.sin(player.aimAngle + spread));
        if (pelletDir) fireRay(muzzle, pelletDir, CFG.shotgun.range, CFG.shotgun.dmg, CFG.shotgun.knock / CFG.shotgun.pellets, 1);
      }
      spawnMuzzleFlash(muzzle.x, muzzle.y, dir.x, dir.y);
      playBeep(200, 0.04, 0.18);
    } else {
      if (!player.weaponUnlocked.rail || player.railTimer > 0 || player.ammo.rail <= 0) return;
      player.railTimer = 1000 / CFG.rail.rof;
      player.ammo.rail -= 1;
      fireRay(muzzle, dir, CFG.rail.range, CFG.rail.dmg, CFG.rail.knock, CFG.rail.pierce);
      spawnMuzzleFlash(muzzle.x, muzzle.y, dir.x, dir.y);
      playBeep(1040, 0.04, 0.22);
    }
    weaponEl.textContent = player.weapon.toUpperCase();
  }
  function fireRay(origin, dir, range, damage, knockback, pierce) {
    const level = world.scenario;
    let maxRange = range;
    const solids = level.solids;
    for (let i = 0; i < solids.length; i += 1) {
      const hit = rayVsRect(origin, dir, range, solids[i]);
      if (hit && hit.dist < maxRange) maxRange = hit.dist;
    }
    let cocoonHit = null;
    for (let i = 0; i < cocoons.length; i += 1) {
      const c = cocoons[i];
      const hit = rayVsCircle(origin, dir, maxRange, c.x + c.r, c.y + c.r, c.r);
      if (hit && (!cocoonHit || hit.dist < cocoonHit.dist)) cocoonHit = Object.assign({ cocoon: c }, hit);
    }
    const enemyHits = [];
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      const hit = rayVsRect(origin, dir, maxRange, enemy);
      if (hit) enemyHits.push({ enemy, dist: hit.dist, point: hit.point });
    }
    enemyHits.sort((a, b) => a.dist - b.dist);
    let hitsLeft = pierce;
    for (let i = 0; i < enemyHits.length && hitsLeft > 0; i += 1) {
      const hit = enemyHits[i];
      if (cocoonHit && cocoonHit.dist < hit.dist) break;
      applyDamage(hit.enemy, damage, dir, knockback);
      spawnHitEffect(hit.point.x, hit.point.y);
      hitsLeft -= 1;
    }
    if (hitsLeft === pierce && cocoonHit) {
      pushCocoon(cocoonHit.cocoon, dir, knockback * 0.7);
      popCocoon(cocoonHit.cocoon, 'burst');
    }
  }
  function rayVsRect(origin, dir, range, rect) {
    const minX = rect.x;
    const maxX = rect.x + rect.w;
    const minY = rect.y;
    const maxY = rect.y + rect.h;
    const invX = dir.x !== 0 ? 1 / dir.x : Infinity;
    const invY = dir.y !== 0 ? 1 / dir.y : Infinity;
    const t1 = (minX - origin.x) * invX;
    const t2 = (maxX - origin.x) * invX;
    const t3 = (minY - origin.y) * invY;
    const t4 = (maxY - origin.y) * invY;
    const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
    const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));
    if (tmax < 0 || tmin > tmax || tmin > range) return null;
    const dist = Math.max(0, tmin);
    return { dist, point: { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist } };
  }
  function rayVsCircle(origin, dir, range, cx, cy, r) {
    const dx = cx - origin.x;
    const dy = cy - origin.y;
    const proj = dx * dir.x + dy * dir.y;
    if (proj < 0 || proj > range) return null;
    const closestX = origin.x + dir.x * proj;
    const closestY = origin.y + dir.y * proj;
    const distSq = (closestX - cx) ** 2 + (closestY - cy) ** 2;
    const rSq = r * r;
    if (distSq > rSq) return null;
    const offset = Math.sqrt(rSq - distSq);
    const dist = proj - offset;
    return { dist, point: { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist } };
  }
  function fireFoam() {
    if (player.foamTimer > 0 || foams.length >= 40) return;
    const dir = normalize(Math.cos(player.aimAngle), Math.sin(player.aimAngle));
    if (!dir) return;
    player.foamTimer = 220;
    const muzzle = { x: player.x + player.w * 0.5, y: player.y + player.h * 0.3 };
    foams.push({ x: muzzle.x, y: muzzle.y, vx: dir.x * CFG.foam.speed, vy: dir.y * CFG.foam.speed - 80, r: 9, life: CFG.foam.lifeMs });
    playBeep(520, 0.03, 0.12);
  }
  function updateFoams(dt, ms) {
    const level = world.scenario;
    const solids = level.solids;
    for (let i = foams.length - 1; i >= 0; i -= 1) {
      const f = foams[i];
      f.life -= ms;
      if (f.life <= 0) { foams.splice(i, 1); continue; }
      f.vy += CFG.gravity * dt * 0.6;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < -40 || f.x > level.width + 40 || f.y > VIEW.height + 80) { foams.splice(i, 1); continue; }
      let hitSolid = false;
      for (let s = 0; s < solids.length; s += 1) {
        if (circleRectOverlap(f.x, f.y, f.r, solids[s])) { hitSolid = true; break; }
      }
      if (hitSolid) { foams.splice(i, 1); continue; }
      let hitEnemy = false;
      for (let e = enemies.length - 1; e >= 0; e -= 1) {
        const enemy = enemies[e];
        if (circleRectOverlap(f.x, f.y, f.r, enemy)) {
          addFoamStack(enemy, f);
          hitEnemy = true;
          break;
        }
      }
      if (hitEnemy) foams.splice(i, 1);
    }
  }
  function addFoamStack(enemy, foam) {
    enemy.foamStacks = (enemy.foamStacks || 0) + 1;
    spawnHitEffect(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5);
    playBeep(880, 0.02, 0.1);
    const needed = CFG.foam.stacks[enemy.type] || 1;
    if (enemy.foamStacks >= needed) cocoonEnemy(enemy, foam);
  }
  function cocoonEnemy(enemy, foam) {
    const radius = Math.max(18, Math.min(30, Math.sqrt(enemy.w * enemy.h)));
    if (cocoons.length >= 12) cocoons.shift();
    cocoons.push({
      x: enemy.x + enemy.w * 0.5 - radius,
      y: enemy.y + enemy.h * 0.5 - radius,
      vx: enemy.vx + foam.vx * 0.12,
      vy: enemy.vy + foam.vy * 0.12,
      r: radius,
      life: CFG.foam.lifeMs,
      source: enemy.type,
      escape: { type: enemy.type, hpScale: enemy.levelScale || 1, lane: enemy.lane }
    });
    spawnParticles(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, CFG.scoring[enemy.type] / 18);
    removeEnemy(enemy);
  }
  function pushCocoon(cocoon, dir, strength) {
    cocoon.vx = (cocoon.vx || 0) + dir.x * strength * 0.02;
    cocoon.vy = (cocoon.vy || 0) + dir.y * strength * 0.02;
  }
  function updateCocoons(dt, ms) {
    const level = world.scenario;
    const solids = level.solids;
    for (let i = cocoons.length - 1; i >= 0; i -= 1) {
      const c = cocoons[i];
      c.life -= ms;
      if (c.life <= 0) { popCocoon(c, 'timeout'); continue; }
      c.vx = (c.vx || 0) * 0.995;
      c.vy = (c.vy || 0) + CFG.gravity * dt * 0.8;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      resolveCocoon(c, solids, level.width);
    }
  }
  function resolveCocoon(c, solids, width) {
    const r = c.r;
    if (c.x < 0) { c.x = 0; c.vx = -c.vx * CFG.foam.bounce; }
    if (c.x + r * 2 > width) { c.x = width - r * 2; c.vx = -c.vx * CFG.foam.bounce; }
    if (c.y + r * 2 >= VIEW.height) {
      c.y = VIEW.height - r * 2;
      c.vy = Math.abs(c.vy) > 40 ? -c.vy * CFG.foam.bounce : 0;
    }
    for (let i = 0; i < solids.length; i += 1) {
      const s = solids[i];
      if (!circleRectOverlap(c.x + r, c.y + r, r, s)) continue;
      if (c.y + r < s.y) {
        c.y = s.y - r * 2;
        c.vy = -Math.abs(c.vy) * CFG.foam.bounce;
      } else if (c.y + r > s.y + s.h) {
        c.y = s.y + s.h;
        c.vy = Math.abs(c.vy) * CFG.foam.bounce;
      } else {
        c.vx = -(c.vx || 0) * 0.7;
      }
    }
    if (rectOverlapRaw(player.x, player.y, player.w, player.h, c.x, c.y, r * 2, r * 2)) {
      c.vx += clamp(player.vx * 0.12, -80, 80);
      c.vy -= 80;
    }
  }
  function popCocoon(cocoon, reason) {
    const idx = cocoons.indexOf(cocoon);
    if (idx !== -1) cocoons.splice(idx, 1);
    if (reason === 'timeout') {
      releaseCocoon(cocoon);
      return;
    }
    addScore(cocoon.source, true);
    chainPulse();
    spawnParticles(cocoon.x + cocoon.r, cocoon.y + cocoon.r, 12);
    playBeep(1200, 0.04, 0.2);
    world.shakeTimer = 200;
    world.shakeMag = clamp(world.shakeMag + 0.6 + world.chainCount * 0.18, 0, CFG.shakeMax);
    if (cocoon.source === 'Kamikaze') triggerKamikazeBlast(cocoon);
    if (cocoon.source === 'BlobTank') spawnBloblets(cocoon.x + cocoon.r, cocoon.y + cocoon.r);
  }
  function triggerKamikazeBlast(cocoon) {
    const radius = 160;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      const dx = enemy.x + enemy.w * 0.5 - (cocoon.x + cocoon.r);
      const dy = enemy.y + enemy.h * 0.5 - (cocoon.y + cocoon.r);
      if (dx * dx + dy * dy <= radius * radius) {
        applyDamage(enemy, 60, normalize(dx, dy) || { x: 0, y: -1 }, 500);
      }
    }
  }
  function spawnBloblets(x, y) {
    if (enemies.length >= 28) return;
    for (let i = 0; i < 2; i += 1) {
      const blob = makeEnemy('Bloblet', { x: x - 12 + i * 24, y: y - 12 }, 1, -140 + i * 80);
      registerEnemy(blob);
    }
  }
  function chainPulse() {
    world.chainCount += 1;
    const stop = world.chainCount >= 3 ? CFG.hitstopMs : 35;
    world.hitstop = Math.max(world.hitstop, stop);
    hudEl.classList.remove('pulse');
    multTextEl.classList.remove('shrink');
    void hudEl.offsetWidth;
    hudEl.classList.add('pulse');
    multTextEl.classList.remove('pulse');
    void multTextEl.offsetWidth;
    multTextEl.classList.add('pulse');
  }
  function addScore(type, allowCombo) {
    const base = CFG.scoring[type] || 100;
    if (allowCombo) {
      if (world.comboTimer > 0) world.multiplier = Math.min(CFG.combo.max, world.multiplier + CFG.combo.step);
      else world.multiplier = Math.max(1, world.multiplier);
      world.comboTimer = CFG.combo.windowMs;
    } else {
      world.multiplier = 1;
      world.comboTimer = 0;
      world.chainCount = 0;
    }
    world.score += Math.round(base * world.multiplier);
    updateHUD(false);
  }
  function applyDamage(enemy, damage, dir, knockback) {
    if (!enemy) return;
    if ((enemy.spawnTimer && enemy.spawnTimer > 0) || (enemy.spawnGuard && enemy.spawnGuard > 0)) return;
    if (enemy.wrapTimer && enemy.wrapTimer > 0) return;
    enemy.hp -= damage;
    const mass = enemy.mass || 4;
    if (dir) {
      enemy.vx = (enemy.vx || 0) + dir.x * (knockback / mass);
      enemy.vy = (enemy.vy || 0) + dir.y * (knockback / mass);
    }
    enemy.lastHit = 160;
    if (enemy.hp <= 0) killEnemy(enemy);
  }
  function killEnemy(enemy) {
    if (!enemy) return;
    if (enemy.type === 'BlobTank') spawnBloblets(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5);
    if (enemy.type === 'Kamikaze') triggerKamikazeBlast({ x: enemy.x, y: enemy.y, r: enemy.w * 0.5 });
    addScore(enemy.type, false);
    spawnParticles(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, 10);
    removeEnemy(enemy);
  }
  function removeEnemy(enemy) {
    const idx = enemies.indexOf(enemy);
    if (idx !== -1) {
      enemies.splice(idx, 1);
      world.aliveEnemies = Math.max(0, world.aliveEnemies - 1);
    }
  }
  function makeEnemy(type, spawn, hpScale, initialVX) {
    const baseHp = CFG.enemy.baseHp[type];
    if (!baseHp) return null;
    const hp = Math.round(baseHp * hpScale);
    if (!Number.isFinite(hp) || hp <= 0) return null;
    if (type === 'Turret') {
      return {
        type,
        x: spawn.x - 20,
        y: spawn.y,
        w: 40,
        h: 46,
        vx: initialVX || 0,
        vy: 0,
        hp,
        mass: 6,
        levelScale: hpScale,
        dropTimer: 0,
        jumpCooldown: 0,
        pendingLane: null,
        activeLink: null,
        targetLane: null,
        fireTimer: 600,
        onGround: false,
        anchor: chooseTurretSpot(),
        state: 'drop'
      };
    }
    if (type === 'Spiker') {
      return {
        type,
        x: spawn.x - 18,
        y: spawn.y,
        w: 36,
        h: 32,
        vx: initialVX || 0,
        vy: 0,
        hp,
        mass: 4,
        levelScale: hpScale,
        dropTimer: 0,
        jumpCooldown: 0,
        pendingLane: null,
        activeLink: null,
        targetLane: null,
        path: chooseCrawlerPath(),
        state: 'drop',
        dropTimer: 400 + rng() * 400,
        dir: rng() > 0.5 ? 1 : -1
      };
    }
    if (type === 'BlobTank') {
      return {
        type,
        x: spawn.x - 32,
        y: spawn.y,
        w: 64,
        h: 60,
        vx: initialVX || 0,
        vy: 0,
        hp,
        mass: 9,
        levelScale: hpScale,
        dropTimer: 0,
        jumpCooldown: 0,
        pendingLane: null,
        activeLink: null,
        targetLane: null,
        onGround: false
      };
    }
    if (type === 'Bloblet') {
      return {
        type,
        x: spawn.x - 14,
        y: spawn.y - 14,
        w: 28,
        h: 28,
        vx: initialVX || 0,
        vy: -60,
        hp,
        mass: 3,
        levelScale: hpScale,
        dropTimer: 0,
        jumpCooldown: 0,
        pendingLane: null,
        activeLink: null,
        targetLane: null,
        onGround: false
      };
    }
    if (type === 'Kamikaze') {
      return {
        type,
        x: spawn.x - 16,
        y: spawn.y,
        w: 32,
        h: 32,
        vx: initialVX || 0,
        vy: 0,
        hp,
        mass: 3,
        levelScale: hpScale,
        dropTimer: 0,
        jumpCooldown: 0,
        pendingLane: null,
        activeLink: null,
        targetLane: null,
        fuse: 2200,
        onGround: false
      };
    }
    if (type === 'Wisp') {
      return {
        type,
        x: spawn.x - 18,
        y: spawn.y,
        w: 36,
        h: 34,
        vx: initialVX || 0,
        vy: 0,
        hp,
        mass: 3,
        levelScale: hpScale,
        dropTimer: 0,
        jumpCooldown: 0,
        pendingLane: null,
        activeLink: null,
        targetLane: null,
        phase: rng() * Math.PI * 2,
        onGround: false
      };
    }
    return {
      type,
      x: spawn.x - 18,
      y: spawn.y,
      w: 36,
      h: 46,
      vx: initialVX || 0,
      vy: 0,
      hp,
      mass: 4,
      levelScale: hpScale,
      dropTimer: 0,
      jumpCooldown: 0,
      pendingLane: null,
      activeLink: null,
      targetLane: null,
      onGround: false,
      jumpTimer: 600 + rng() * 400
    };
  }
  function chooseCrawlerPath() {
    const paths = world.scenario.crawlerPaths;
    if (!paths.length) return null;
    return paths[Math.floor(rng() * paths.length)];
  }
  function chooseTurretSpot() {
    const spots = world.scenario.turretSpots;
    if (!spots.length) return null;
    return spots[Math.floor(rng() * spots.length)];
  }
  function updateEnemies(dt, ms) {
    if (world.state === 'transition') return;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      enemy.lastHit = Math.max(0, (enemy.lastHit || 0) - ms);
      if (enemy.spawnGuard) enemy.spawnGuard = Math.max(0, enemy.spawnGuard - ms);
      if (enemy.jumpCooldown) enemy.jumpCooldown = Math.max(0, enemy.jumpCooldown - ms);
      if (enemy.dropTimer) enemy.dropTimer = Math.max(0, enemy.dropTimer - ms);
      if (enemy.spawnTimer && enemy.spawnTimer > 0 && enemy.spawnPath) {
        enemy.spawnTimer = Math.max(0, enemy.spawnTimer - ms);
        const path = enemy.spawnPath;
        const progress = path.duration ? clamp(1 - enemy.spawnTimer / path.duration, 0, 1) : 1;
        const eased = smoothStep(progress);
        const cx = lerp(path.start.x, path.end.x, eased);
        const cy = lerp(path.start.y, path.end.y, eased);
        enemy.x = cx - enemy.w * 0.5;
        enemy.y = cy - enemy.h * 0.5;
        enemy.vx = 0;
        enemy.vy = 0;
        if (enemy.spawnTimer > 0) {
          continue;
        }
        enemy.spawnPath = null;
        enemy.state = enemy.postSpawnState || enemy.state || 'active';
        enemy.postSpawnState = null;
        enemy.x = path.end.x - enemy.w * 0.5;
        enemy.y = path.end.y - enemy.h * 0.5;
      }
      switch (enemy.type) {
        case 'Hopper': updateHopper(enemy, dt, ms); break;
        case 'Wisp': updateWisp(enemy, dt, ms); break;
        case 'Turret': updateTurret(enemy, dt, ms); break;
        case 'Spiker': updateSpiker(enemy, dt, ms); break;
        case 'BlobTank': updateBlobTank(enemy, dt, ms); break;
        case 'Bloblet': updateBloblet(enemy, dt, ms); break;
        case 'Kamikaze': updateKamikaze(enemy, dt, ms); break;
        default: updateHopper(enemy, dt, ms); break;
      }
      applyWrap(enemy, ms);
      if (
        player.invulnTimer <= 0 &&
        (!enemy.spawnTimer || enemy.spawnTimer <= 0) &&
        (!enemy.spawnGuard || enemy.spawnGuard <= 0) &&
        (!enemy.wrapTimer || enemy.wrapTimer <= 0) &&
        rectOverlapRaw(player.x, player.y, player.w, player.h, enemy.x, enemy.y, enemy.w, enemy.h)
      ) {
        if (enemy.type === 'Kamikaze') {
          explodeKamikaze(enemy);
        } else {
          damagePlayer();
          applyDamage(enemy, 12, normalize(enemy.x - player.x, enemy.y - player.y) || { x: 0, y: -1 }, 120);
        }
      }
    }
    if (
      world.state === 'playing' &&
      world.inPlay &&
      world.activeWave &&
      !spawner.active &&
      world.pendingSpawns === 0 &&
      world.aliveEnemies === 0 &&
      cocoons.length === 0 &&
      foams.length === 0
    ) {
      beginScenarioTransition();
    }
  }
  function updateHopper(enemy, dt, ms) {
    const handled = navigateGroundEnemy(enemy, dt, ms, {
      speed: CFG.enemy.speed.Hopper * 1.5,
      accel: CFG.enemy.speed.Hopper * 6,
      jumpPower: CFG.jumpVel * 0.82,
      tolerance: 8,
      triggerRadius: 14
    });
    if (!handled) {
      const target = player.x + player.w * 0.5 < enemy.x + enemy.w * 0.5 ? -1 : 1;
      enemy.vx += target * CFG.enemy.speed.Hopper * dt * 1.4;
      enemy.vx = clamp(enemy.vx, -CFG.enemy.speed.Hopper * 1.4, CFG.enemy.speed.Hopper * 1.4);
    }
    enemy.vy += CFG.gravity * dt;
    integrateDynamic(enemy, dt, true);
  }
  function updateWisp(enemy, dt, ms) {
    enemy.phase = (enemy.phase || 0) + dt * 3;
    const sway = Math.sin(enemy.phase) * CFG.enemy.speed.Wisp * 0.6;
    enemy.vx = sway + (player.x + player.w * 0.5 - (enemy.x + enemy.w * 0.5)) * dt * 2;
    const desiredY = player.y + Math.sin(enemy.phase * 0.6) * 120;
    enemy.vy += (desiredY - enemy.y) * dt * 3;
    enemy.vy = clamp(enemy.vy, -160, 160);
    const solids = world.scenario.solids;
    if (rectCollidesSolids(enemy.x + enemy.vx * dt, enemy.y, enemy.w, enemy.h, solids)) enemy.vx = -enemy.vx * 0.5;
    if (rectCollidesSolids(enemy.x, enemy.y + enemy.vy * dt, enemy.w, enemy.h, solids)) enemy.vy = enemy.vy > 0 ? -Math.abs(enemy.vy) * 0.4 : enemy.vy;
    integrateFlying(enemy, dt);
  }
  function updateTurret(enemy, dt, ms) {
    if (enemy.state === 'drop') {
      enemy.vy += CFG.gravity * dt;
      integrateDynamic(enemy, dt, false);
      if (enemy.onGround) {
        enemy.state = 'lock';
        if (enemy.anchor) {
          enemy.x = clamp(enemy.anchor.x - enemy.w * 0.5, 0, world.scenario.width - enemy.w);
          enemy.y = enemy.anchor.y - enemy.h;
        }
        enemy.vx = 0;
        enemy.vy = 0;
      }
      return;
    }
    enemy.fireTimer = (enemy.fireTimer || 0) - ms;
    if (enemy.fireTimer <= 0) {
      if (enemyProjectiles.length < 90) {
        const ang = Math.atan2(player.y + player.h * 0.5 - (enemy.y + enemy.h * 0.5), player.x + player.w * 0.5 - (enemy.x + enemy.w * 0.5));
        const speed = 240 + world.wave * 6;
        enemyProjectiles.push({ x: enemy.x + enemy.w * 0.5, y: enemy.y + enemy.h * 0.5, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 3200 });
        playBeep(320, 0.02, 0.12);
      }
      enemy.fireTimer = 1000 / CFG.enemy.turretRof;
    }
  }
  function updateSpiker(enemy, dt, ms) {
    if (!enemy.path) enemy.path = chooseCrawlerPath();
    if (!enemy.path) {
      enemy.type = 'Hopper';
      updateHopper(enemy, dt, ms);
      return;
    }
    if (enemy.state === 'drop') {
      enemy.vy += CFG.gravity * dt;
      integrateDynamic(enemy, dt, false);
      enemy.dropTimer = (enemy.dropTimer || 0) - ms;
      if (enemy.dropTimer <= 0) {
        enemy.state = 'crawl';
        alignSpiker(enemy);
      }
      return;
    }
    const path = enemy.path;
    const center = enemy.x + enemy.w * 0.5;
    const target = clamp(player.x + player.w * 0.5, path.minX, path.maxX);
    const dir = target < center ? -1 : 1;
    enemy.x += dir * CFG.enemy.speed.Spiker * dt;
    enemy.x = clamp(enemy.x, path.minX, path.maxX - enemy.w);
    if (path.orientation === 'floor') enemy.y = path.y - enemy.h; else enemy.y = path.y;
  }
  function alignSpiker(enemy) {
    const path = enemy.path;
    if (!path) return;
    if (path.orientation === 'floor') enemy.y = path.y - enemy.h;
    else enemy.y = path.y;
    enemy.x = clamp(enemy.x, path.minX, path.maxX - enemy.w);
    enemy.vx = 0;
    enemy.vy = 0;
  }
  function updateBlobTank(enemy, dt, ms) {
    const handled = navigateGroundEnemy(enemy, dt, ms, {
      speed: CFG.enemy.speed.BlobTank,
      accel: CFG.enemy.speed.BlobTank * 4.2,
      jumpPower: CFG.jumpVel * 0.72,
      tolerance: 10,
      triggerRadius: 16
    });
    if (!handled) {
      const target = player.x + player.w * 0.5 < enemy.x + enemy.w * 0.5 ? -1 : 1;
      enemy.vx += target * CFG.enemy.speed.BlobTank * dt * 0.6;
      enemy.vx = clamp(enemy.vx, -CFG.enemy.speed.BlobTank, CFG.enemy.speed.BlobTank);
    }
    enemy.vy += CFG.gravity * dt;
    integrateDynamic(enemy, dt, true);
    if (enemy.onGround) enemy.vx *= 0.92;
  }
  function updateBloblet(enemy, dt, ms) {
    const handled = navigateGroundEnemy(enemy, dt, ms, {
      speed: CFG.enemy.speed.Bloblet,
      accel: CFG.enemy.speed.Bloblet * 5.5,
      jumpPower: CFG.jumpVel * 0.76,
      tolerance: 8,
      triggerRadius: 12
    });
    if (!handled) {
      const target = player.x + player.w * 0.5 < enemy.x + enemy.w * 0.5 ? -1 : 1;
      enemy.vx += target * CFG.enemy.speed.Bloblet * dt;
      enemy.vx = clamp(enemy.vx, -CFG.enemy.speed.Bloblet, CFG.enemy.speed.Bloblet);
    }
    enemy.vy += CFG.gravity * dt;
    integrateDynamic(enemy, dt, true);
  }
  function updateKamikaze(enemy, dt, ms) {
    const dx = player.x + player.w * 0.5 - (enemy.x + enemy.w * 0.5);
    const dy = player.y + player.h * 0.5 - (enemy.y + enemy.h * 0.5);
    const dir = normalize(dx, dy) || { x: 0, y: 1 };
    const boost = enemy.angry ? 1.35 : 1;
    enemy.vx += dir.x * CFG.enemy.speed.Kamikaze * dt * 1.4 * boost;
    enemy.vy += dir.y * CFG.enemy.speed.Kamikaze * dt * 1.4 * boost;
    enemy.vx = clamp(enemy.vx, -240, 240);
    enemy.vy = clamp(enemy.vy, -260, 260);
    enemy.fuse -= ms * (enemy.angry ? 1.2 : 1);
    integrateDynamic(enemy, dt, true);
    if (enemy.fuse <= 0) explodeKamikaze(enemy);
  }
  function explodeKamikaze(enemy) {
    spawnParticles(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5, 14);
    const blast = { x: enemy.x + enemy.w * 0.5, y: enemy.y + enemy.h * 0.5, r: 140 };
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const other = enemies[i];
      if (other === enemy) continue;
      const dx = other.x + other.w * 0.5 - blast.x;
      const dy = other.y + other.h * 0.5 - blast.y;
      if (dx * dx + dy * dy <= blast.r * blast.r) applyDamage(other, 60, normalize(dx, dy) || { x: 0, y: -1 }, 520);
    }
    if (rectOverlapRaw(player.x, player.y, player.w, player.h, blast.x - blast.r, blast.y - blast.r, blast.r * 2, blast.r * 2) && player.invulnTimer <= 0) damagePlayer();
    removeEnemy(enemy);
  }
  function releaseCocoon(cocoon) {
    world.multiplier = 1;
    world.comboTimer = 0;
    world.chainCount = 0;
    playBeep(260, 0.04, 0.2);
    spawnParticles(cocoon.x + cocoon.r, cocoon.y + cocoon.r, 10);
    const escape = cocoon.escape;
    if (!escape) return;
    const spawnPos = { x: cocoon.x + cocoon.r, y: cocoon.y + cocoon.r };
    const enemy = makeEnemy(escape.type, spawnPos, escape.hpScale || 1, 0);
    if (!enemy) return;
    enemy.x = spawnPos.x - enemy.w * 0.5;
    enemy.y = spawnPos.y - enemy.h * 0.5;
    enemy.angry = true;
    enemy.hp = Math.max(enemy.hp, Math.round((CFG.enemy.baseHp[escape.type] || enemy.hp) * (escape.hpScale || 1) * 1.1));
    enemy.vx += (rng() - 0.5) * 240;
    enemy.vy -= 160;
    enemy.spawnGuard = 260;
    if (escape.lane !== undefined && escape.lane !== null) {
      enemy.lane = escape.lane;
      enemy.targetLane = escape.lane;
    }
    registerEnemy(enemy);
    updateHUD(false);
  }
  function integrateDynamic(enemy, dt, allowOneWay) {
    const prevBottom = enemy.y + enemy.h;
    const wasGrounded = enemy.onGround;
    sweepMove(enemy, dt, {
      allowOneWay,
      ignoreOneWay: allowOneWay && enemy.dropTimer > 0,
      prevBottom,
      stepHeight: allowOneWay ? CFG.stepHeight : 0
    });
    if (allowOneWay) snapToGround(enemy, prevBottom, true, allowOneWay && enemy.dropTimer > 0);
    if (!wasGrounded && enemy.onGround) resolveLaneLanding(enemy);
    enforceHorizontalBounds(enemy);
    if (enemy.y < -240) enemy.y = -240;
  }
  function integrateFlying(enemy, dt) {
    enemy.x += (enemy.vx || 0) * dt;
    enemy.y += (enemy.vy || 0) * dt;
    enemy.x = clamp(enemy.x, 0, world.scenario.width - enemy.w);
    enemy.y = clamp(enemy.y, 60, VIEW.height - 200);
  }
  function updateEnemyProjectiles(dt, ms) {
    const level = world.scenario;
    const solids = level.solids;
    for (let i = enemyProjectiles.length - 1; i >= 0; i -= 1) {
      const proj = enemyProjectiles[i];
      proj.life -= ms;
      if (proj.life <= 0) { enemyProjectiles.splice(i, 1); continue; }
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      if (proj.x < -40 || proj.x > level.width + 40 || proj.y < -40 || proj.y > VIEW.height + 40) { enemyProjectiles.splice(i, 1); continue; }
      let blocked = false;
      for (let s = 0; s < solids.length; s += 1) {
        if (circleRectOverlap(proj.x, proj.y, 4, solids[s])) { blocked = true; break; }
      }
      if (blocked) { enemyProjectiles.splice(i, 1); continue; }
      if (player.invulnTimer <= 0 && circleRectOverlap(proj.x, proj.y, 4, { x: player.x, y: player.y, w: player.w, h: player.h })) {
        enemyProjectiles.splice(i, 1);
        damagePlayer();
      }
    }
  }
  function updatePickups(dt, ms) {
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const p = pickups[i];
      p.life -= ms;
      if (p.life <= 0) { pickups.splice(i, 1); continue; }
      if (rectOverlapRaw(player.x, player.y, player.w, player.h, p.x - 14, p.y - 14, 28, 28)) {
        pickups.splice(i, 1);
        collectPickup(p);
      }
    }
  }
  function collectPickup(pickup) {
    if (pickup.weapon === 'shotgun') {
      player.weaponUnlocked.shotgun = true;
      player.weapon = 'shotgun';
      player.ammo.shotgun = clamp(player.ammo.shotgun + CFG.pickupAmmo.shotgun, 0, CFG.ammoMax.shotgun);
      showToast('SHOTGUN READY');
    } else if (pickup.weapon === 'rail') {
      player.weaponUnlocked.rail = true;
      player.weapon = 'rail';
      player.ammo.rail = clamp(player.ammo.rail + CFG.pickupAmmo.rail, 0, CFG.ammoMax.rail);
      showToast('RAIL ONLINE');
    } else {
      player.ammo.smg = clamp(player.ammo.smg + CFG.pickupAmmo.smg, 0, CFG.ammoMax.smg);
      showToast('SMG AMMO');
    }
    playBeep(980, 0.04, 0.12);
    updateHUD(false);
  }
  function updateParticles(dt, ms) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= ms;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      p.vx = (p.vx || 0) * 0.98;
      p.vy = (p.vy || 0) + CFG.gravity * dt * 0.25;
    }
  }
  function damagePlayer() {
    player.lives -= 1;
    player.invulnTimer = 700;
    world.chainCount = 0;
    world.multiplier = 1;
    world.comboTimer = 0;
    playBeep(140, 0.05, 0.22);
    if (player.lives <= 0) {
      gameOver();
    } else {
      updateHUD(false);
    }
  }
  function gameOver() {
    world.state = 'gameover';
    world.running = true;
    world.overlayVisible = true;
    world.inPlay = false;
    spawner.active = false;
    spawner.started = false;
    world.pendingSpawns = 0;
    world.activeWave = false;
    resetInputState();
    if (overlayEl) overlayEl.classList.remove('hidden');
    if (playBtn) {
      playBtn.style.display = '';
      playBtn.textContent = 'PLAY AGAIN';
    }
    if (messageEl) messageEl.textContent = 'GAME OVER';
    if (overlayInfoEl) overlayInfoEl.textContent = `Score ${world.score.toLocaleString()} • Wave ${world.wave}`;
  }
  function beginScenarioTransition() {
    if (world.state !== 'playing') return;
    world.state = 'transition';
    world.transitionTimer = 1200;
    world.activeWave = false;
    world.inPlay = false;
    spawner.active = false;
    spawner.started = false;
    if (overlayEl) overlayEl.classList.remove('hidden');
    if (messageEl) messageEl.textContent = 'SCENARIO CLEARED';
    if (overlayInfoEl) overlayInfoEl.textContent = '';
    if (playBtn) playBtn.style.display = 'none';
    world.overlayVisible = true;
  }
  function advanceScenario() {
    world.wave += 1;
    world.scenarioIndex += 1;
    if (world.scenarioIndex >= SCENARIOS.length) {
      world.scenarioIndex = 0;
      world.scenarioCycle += 1;
    }
    world.scenario = SCENARIOS[world.scenarioIndex];
    world.pendingSpawns = 0;
    world.aliveEnemies = enemies.length;
    world.activeWave = false;
    world.inPlay = false;
    spawner.active = false;
    spawner.started = false;
    spawner.plan.length = 0;
    configureSpawner();
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    placePlayerAtStart();
    updateCameraImmediate();
  }
  function spawnPickup(type) {
    const spots = world.scenario.pickupSpots;
    if (!spots.length) return;
    const spot = spots[Math.floor(rng() * spots.length)];
    pickups.push({ weapon: type, x: spot.x, y: spot.y, life: 8000 });
  }
  function maybeSpawnPickup() {
    if (player.weaponUnlocked.shotgun && !player.weaponUnlocked.rail && rng() < 0.3) spawnPickup('rail');
    else if (!player.weaponUnlocked.shotgun && rng() < 0.4) spawnPickup('shotgun');
    else if (rng() < CFG.pickupChance) spawnPickup('smg');
  }
  function updateWorld(ms) {
    if (world.state === 'countdown') {
      world.spawnDelay -= ms;
      if (world.spawnDelay <= 0) {
        world.state = 'playing';
        world.spawnDelay = 0;
        world.inPlay = true;
        beginSpawning();
        if (!spawner.active && world.pendingSpawns === 0) world.activeWave = false;
      }
    } else if (world.state === 'playing') {
      processSpawner(ms);
    } else if (world.state === 'transition') {
      world.transitionTimer -= ms;
      if (world.transitionTimer <= 0) {
        if (overlayEl) overlayEl.classList.add('hidden');
        if (playBtn) playBtn.style.display = '';
        world.overlayVisible = false;
        world.state = 'countdown';
        world.spawnDelay = 600;
        advanceScenario();
      }
    }
    if (world.comboTimer > 0) {
      world.comboTimer = Math.max(0, world.comboTimer - ms);
      if (world.comboTimer === 0) {
        world.multiplier = 1;
        world.chainCount = 0;
        multTextEl.classList.remove('pulse');
        void multTextEl.offsetWidth;
        multTextEl.classList.add('shrink');
      }
    }
    if (toastEl) {
      if (toastTimer > 0) {
        toastTimer -= ms;
        if (toastTimer <= 0) { toastEl.classList.remove('toast-visible'); toastTimer = 0; }
      } else if (!toastEl.classList.contains('hidden') && !toastEl.classList.contains('toast-visible')) {
        toastEl.classList.add('hidden');
      }
    } else {
      toastTimer = 0;
    }
    if (world.tutorialTimer > 0) {
      world.tutorialTimer = Math.max(0, world.tutorialTimer - ms);
      if (world.tutorialTimer === 0 && submessageEl) submessageEl.textContent = '';
    }
    updateHUD(false);
  }
  function updateHUD(force) {
    if (force || hudCache.score !== world.score) { hudCache.score = world.score; scoreEl.textContent = world.score.toString().padStart(6, '0'); }
    if (force || hudCache.wave !== world.wave) { hudCache.wave = world.wave; waveEl.textContent = world.wave.toString(); }
    if (force || hudCache.lives !== player.lives) { hudCache.lives = player.lives; livesEl.textContent = player.lives.toString(); }
    const weaponName = player.weapon.toUpperCase();
    if (force || hudCache.weapon !== weaponName) { hudCache.weapon = weaponName; weaponEl.textContent = weaponName; }
    if (force || hudCache.multiplier !== world.multiplier) { hudCache.multiplier = world.multiplier; multTextEl.textContent = `x${world.multiplier.toFixed(1)}`; }
    const comboRatio = world.comboTimer > 0 ? clamp(world.comboTimer / CFG.combo.windowMs, 0, 1) : 0;
    multFillEl.style.height = `${comboRatio * 100}%`;
  }
  function updateCamera() {
    const level = world.scenario;
    const maxOffset = Math.max(0, level.width - VIEW.width);
    const target = clamp(player.x + player.w * 0.5 - VIEW.width * 0.5, 0, maxOffset);
    camera.x = lerp(camera.x, target, 0.18);
    camera.y = 0;
  }
  function updateCameraImmediate() {
    const level = world.scenario;
    const maxOffset = Math.max(0, level.width - VIEW.width);
    camera.x = clamp(player.x + player.w * 0.5 - VIEW.width * 0.5, 0, maxOffset);
    camera.y = 0;
  }
  function render() {
    ctx.save();
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    drawBackground();
    const shake = applyShake();
    ctx.save();
    ctx.translate(-camera.x + shake.x, -camera.y + shake.y);
    drawLevel();
    drawCocoons();
    drawEnemies();
    drawPlayer();
    drawEnemyProjectiles();
    drawFoams();
    drawParticles();
    drawDashTrail();
    ctx.restore();
    ctx.restore();
  }
  function isVisibleRect(x, y, w, h, pad = 48) {
    const left = camera.x - pad;
    const right = camera.x + VIEW.width + pad;
    const top = camera.y - pad;
    const bottom = camera.y + VIEW.height + pad;
    return x + w >= left && x <= right && y + h >= top && y <= bottom;
  }
  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    gradient.addColorStop(0, 'rgba(12,18,28,0.95)');
    gradient.addColorStop(1, 'rgba(6,8,12,0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  function drawLevel() {
    const solids = world.scenario.solids;
    ctx.save();
    ctx.fillStyle = 'rgba(36,52,78,0.75)';
    ctx.strokeStyle = 'rgba(81,255,214,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < solids.length; i += 1) {
      const s = solids[i];
      if (!isVisibleRect(s.x, s.y, s.w, s.h, 16)) continue;
      ctx.beginPath();
      ctx.roundRect(s.x, s.y, s.w, s.h, 12);
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(127,81,255,0.6)';
    const oneWays = world.scenario.oneWays;
    for (let i = 0; i < oneWays.length; i += 1) {
      const p = oneWays[i];
      if (!isVisibleRect(p.x, p.y, p.w, p.h, 16)) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 2);
      ctx.lineTo(p.x + p.w, p.y + 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    const facing = player.facing >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(player.w * 0.5, player.h * 0.5);
    ctx.scale(facing, 1);
    ctx.fillStyle = player.invulnTimer > 0 ? 'rgba(255,255,255,0.85)' : 'rgba(81,255,214,0.9)';
    ctx.shadowColor = 'rgba(81,255,214,0.7)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(-player.w * 0.4, -player.h * 0.5, player.w * 0.8, player.h, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(12,18,28,0.85)';
    ctx.fillRect(-player.w * 0.15, -player.h * 0.28, player.w * 0.3, player.h * 0.24);
    ctx.restore();
    const gunBaseX = player.w * 0.5;
    const gunBaseY = player.h * 0.35;
    ctx.save();
    ctx.translate(gunBaseX, gunBaseY);
    let visualAngle = player.aimAngle;
    if (visualAngle > Math.PI) visualAngle -= Math.PI * 2;
    if (visualAngle < -Math.PI) visualAngle += Math.PI * 2;
    visualAngle = clamp(visualAngle, -Math.PI * 0.78, Math.PI * 0.78);
    ctx.rotate(visualAngle);
    ctx.fillStyle = 'rgba(127,81,255,0.9)';
    ctx.fillRect(0, -4, 26, 8);
    ctx.fillStyle = 'rgba(81,255,214,0.9)';
    ctx.fillRect(18, -3, 12, 6);
    ctx.restore();
    ctx.restore();
  }
  function drawEnemies() {
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      if (!isVisibleRect(enemy.x, enemy.y, enemy.w, enemy.h)) continue;
      if (enemy.spawnTimer && enemy.spawnTimer > 0) {
        const duration = enemy.spawnDuration || 800;
        const ratio = clamp(enemy.spawnTimer / duration, 0, 1);
        ctx.save();
        ctx.translate(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5);
        ctx.strokeStyle = 'rgba(81,255,214,0.55)';
        ctx.fillStyle = `rgba(127,81,255,${0.25 + 0.2 * ratio})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, enemy.w * 0.65, enemy.h * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(enemy.x + enemy.w * 0.5, enemy.y + enemy.h * 0.5);
      let color = 'rgba(127,81,255,0.85)';
      if (enemy.type === 'Wisp') color = 'rgba(255,81,122,0.85)';
      else if (enemy.type === 'Turret') color = 'rgba(209,255,81,0.85)';
      else if (enemy.type === 'BlobTank') color = 'rgba(255,176,22,0.9)';
      else if (enemy.type === 'Kamikaze') color = 'rgba(255,81,122,0.9)';
      ctx.fillStyle = color;
      if (enemy.lastHit > 0) ctx.globalAlpha = 0.6 + Math.sin(enemy.lastHit * 0.15) * 0.2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(-enemy.w * 0.5, -enemy.h * 0.5, enemy.w, enemy.h, 12);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
  function drawCocoons() {
    for (let i = 0; i < cocoons.length; i += 1) {
      const c = cocoons[i];
      const lifeRatio = clamp(c.life / CFG.foam.lifeMs, 0, 1);
      const size = c.r * 2;
      if (!isVisibleRect(c.x, c.y, size, size)) continue;
      ctx.save();
      ctx.translate(c.x + c.r, c.y + c.r);
      ctx.fillStyle = `rgba(81,255,214,${0.4 + 0.4 * lifeRatio})`;
      ctx.strokeStyle = 'rgba(127,81,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, c.r, c.r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawFoams() {
    ctx.save();
    ctx.fillStyle = 'rgba(127,81,255,0.85)';
    for (let i = 0; i < foams.length; i += 1) {
      const f = foams[i];
      if (!isVisibleRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2, 12)) continue;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawEnemyProjectiles() {
    ctx.save();
    ctx.fillStyle = 'rgba(255,176,22,0.85)';
    for (let i = 0; i < enemyProjectiles.length; i += 1) {
      const proj = enemyProjectiles[i];
      if (!isVisibleRect(proj.x - 4, proj.y - 4, 8, 8, 12)) continue;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawParticles() {
    ctx.save();
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!isVisibleRect(p.x - 2, p.y - 2, 4, 4, 16)) continue;
      const alpha = clamp(p.life / 800, 0, 1);
      ctx.fillStyle = p.color === 'accent3' ? `rgba(255,81,122,${alpha})` : `rgba(81,255,214,${alpha})`;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.restore();
  }
  function drawDashTrail() {
    ctx.save();
    for (let i = dashTrail.length - 1; i >= 0; i -= 1) {
      const d = dashTrail[i];
      d.life -= 16;
      if (d.life <= 0) { dashTrail.splice(i, 1); continue; }
      const radius = 12 * (d.life / 200);
      if (!isVisibleRect(d.x - radius, d.y - radius, radius * 2, radius * 2, 24)) continue;
      ctx.fillStyle = `rgba(81,255,214,${d.life / 200})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function spawnLandingDust(x, y) {
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI - Math.PI * 0.5 + (rng() - 0.5) * 0.3;
      const speed = 140 + rng() * 60;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.4, life: 380 + rng() * 180, color: 'accent1' });
    }
    if (particles.length > 300) particles.splice(0, particles.length - 300);
  }
  function spawnHitEffect(x, y) {
    spawnParticles(x, y, 6);
  }
  function spawnMuzzleFlash(x, y, dx, dy) {
    particles.push({ x, y, vx: dx * 60, vy: dy * 60, life: 120, color: 'accent1' });
    if (particles.length > 300) particles.splice(0, particles.length - 300);
  }
  function spawnParticles(x, y, count) {
    const amount = Math.min(count, 20);
    for (let i = 0; i < amount; i += 1) {
      const ang = rng() * Math.PI * 2;
      const speed = 80 + rng() * 140;
      particles.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: 640 + rng() * 360, color: i % 2 === 0 ? 'accent1' : 'accent3' });
    }
    if (particles.length > 300) particles.splice(0, particles.length - 300);
  }
  function circleRectOverlap(cx, cy, radius, rect) {
    const rx = rect.x;
    const ry = rect.y;
    const rw = rect.w;
    const rh = rect.h;
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= radius * radius;
  }
  function rectOverlapRaw(ax, ay, aw, ah, bx, by, bw, bh) {
    return !(ax + aw < bx || ax > bx + bw || ay + ah < by || ay > by + bh);
  }
  function normalize(x, y) {
    const len = Math.hypot(x, y);
    if (!len || !Number.isFinite(len)) return null;
    return { x: x / len, y: y / len };
  }
  function showToast(text) {
    if (!toastEl) return;
    toastEl.classList.remove('toast-visible');
    toastEl.classList.remove('hidden');
    toastEl.textContent = text;
    void toastEl.offsetWidth;
    toastEl.classList.add('toast-visible');
    toastTimer = 1000;
  }
  function applyShake() {
    if (world.shakeTimer > 0) {
      world.shakeTimer = Math.max(0, world.shakeTimer - 16);
      world.shakeMag = Math.max(0, world.shakeMag - 0.1);
      return {
        x: Math.sin(world.shakeTimer * 0.12) * world.shakeMag,
        y: Math.cos(world.shakeTimer * 0.18) * world.shakeMag
      };
    }
    return { x: 0, y: 0 };
  }
  function playBeep(freq, attack, release) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, audioCtx.currentTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + attack + release);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + attack + release + 0.05);
  }
  function start() {
    initEvents();
    resizeStage();
    if (overlayEl) overlayEl.classList.remove('hidden');
    if (messageEl) messageEl.textContent = 'NEON FOAM';
    if (submessageEl) submessageEl.textContent = 'Bubble foes and pop for points. A/D to move, W/Space to jump, Shift dash. Mouse aim, Left shoot, Right foam.';
    if (overlayInfoEl) overlayInfoEl.textContent = '';
    if (playBtn) {
      playBtn.style.display = '';
      playBtn.textContent = 'START';
    }
    world.overlayVisible = true;
  }
  const startGame = () => startGameInternal();
  exposeStart(startGame);
  start();
})();
