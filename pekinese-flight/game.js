// =============================================================
// "Рыжий пекинес: летающие приключения" — основная игровая логика
// =============================================================
(() => {
  'use strict';

  // ---------- Константы ----------
  const BASE_W = 800;
  const BASE_H = 600;
  const GRAVITY = 0.55;
  const FLAP_V = -8.5;
  const FLOOR_H = 80;          // высота пола (не рабочая зона)
  const CEIL_H = 0;            // потолок — верх экрана
  const OBSTACLE_W = 90;
  const PEKINESE_SIZE = 68;
  const PEKINESE_COL_R = 24;   // радиус коллизий (меньше спрайта, для честности)
  const MAX_TILT = 0.9;        // макс. угол наклона пекинеса
  const END_RUN_DIST = 600;    // дистанция финальной "анимированной" сцены
  // Косточки-пикапы, собираемые во время полёта
  const BONE_SIZE = 40;
  const BONE_COL_R = 22;
  const BONE_GROWTH = 0.05;    // +5% объёма за косточку
  const MAX_BONE_SCALE = 1.8;  // максимум — примерно в 1.8x
  // Кошка-преследователь
  const CAT_SIZE = 130;
  const CAT_TRAIL_DX = 150;    // сколько пикселей кошка держится позади пекинеса по X
  const CAT_FOLLOW = 0.04;     // насколько быстро кошка догоняет (0..1)
  const CAT_SWIPE_INTERVAL = 2400; // интервал между атаками, мс
  const CAT_SWIPE_WINDUP = 350;    // мс перед атакой (приседание)
  const CAT_SWIPE_STRIKE = 200;    // мс непосредственно удара
  const CAT_SWIPE_RECOVER = 350;   // мс возврата лапы

  const STATE = {
    MENU: 'menu',
    LEVELS: 'levels',
    WARDROBE: 'wardrobe',
    INTRO: 'intro',
    PLAYING: 'playing',
    PAUSED: 'paused',
    CUTSCENE: 'cutscene',
    WIN: 'win',
    OVER: 'over',
    FINAL: 'final',
  };

  // ---------- Хранилище ----------
  const Storage = (() => {
    const KEY = 'pekinese_flight_save_v1';
    const DEFAULT = { best: 0, unlocked: 1, completed: [], soundOn: true, outfit: { hat: null, body: null, boots: null } };
    const load = () => {
      let data = { ...DEFAULT };
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) data = { ...DEFAULT, ...JSON.parse(raw) };
      } catch (_) {}
      data.outfit = { hat: null, body: null, boots: null, ...(data.outfit || {}) };
      return data;
    };
    const save = (data) => {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
    };
    return { load, save };
  })();

  // ---------- Yandex SDK ----------
  const Yandex = {
    ysdk: null,
    ready: false,
    async init() {
      if (typeof YaGames === 'undefined') return;
      try {
        this.ysdk = await YaGames.init();
        this.ready = true;
        // Сигнал платформе, что игра загрузилась и готова
        try {
          this.ysdk.features?.LoadingAPI?.ready?.();
        } catch (_) {}
      } catch (e) {
        console.warn('Yandex SDK init failed', e);
      }
    },
    showFullscreenAd(cb) {
      const done = () => { if (cb) cb(); };
      if (this.ysdk?.adv?.showFullscreenAdv) {
        try {
          this.ysdk.adv.showFullscreenAdv({
            callbacks: {
              onClose: done,
              onError: done,
              onOffline: done,
            },
          });
          return;
        } catch (_) {}
      }
      done();
    },
  };

  // ---------- Звук ----------
  const Sound = (() => {
    let ctx = null;
    let enabled = true;
    const ensure = () => {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    const tone = (freq, dur = 0.1, type = 'sine', vol = 0.15) => {
      if (!enabled) return;
      const c = ensure();
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    };
    return {
      setEnabled(v) { enabled = v; },
      isEnabled() { return enabled; },
      flap() { tone(520, 0.08, 'triangle', 0.12); },
      score() { tone(880, 0.12, 'sine', 0.15); setTimeout(() => tone(1175, 0.12, 'sine', 0.15), 80); },
      hit() { tone(160, 0.3, 'sawtooth', 0.25); },
      win() {
        tone(660, 0.15, 'sine', 0.18);
        setTimeout(() => tone(880, 0.15, 'sine', 0.18), 150);
        setTimeout(() => tone(1175, 0.25, 'sine', 0.2), 300);
      },
      pause(suspend) {
        if (!ctx) return;
        if (suspend) ctx.suspend(); else ctx.resume();
      },
    };
  })();

  // ---------- Состояние игры ----------
  const Game = {
    state: STATE.MENU,
    canvas: null,
    ctx: null,
    scale: 1,
    width: BASE_W,
    height: BASE_H,

    currentLevel: 0,
    score: 0,
    sessionBest: 0,
    pekinese: null,
    obstacles: [],
    bones: [],
    bonesCollected: 0,
    cat: null,
    deathCause: 'crash',
    scrollX: 0,
    obstaclesPassed: 0,
    groundOffset: 0,
    cutscene: null,
    timeMs: 0,
    flapPhase: 0,
    wardrobeTab: 'hat',

    save: Storage.load(),
  };

  // ---------- Наряд ----------
  function findOutfitItem(category, id) {
    if (!id) return null;
    return (OUTFITS[category] || []).find(i => i.id === id) || null;
  }
  function getCurrentOutfit() {
    return {
      hat: findOutfitItem('hat', Game.save.outfit.hat),
      body: findOutfitItem('body', Game.save.outfit.body),
      boots: findOutfitItem('boots', Game.save.outfit.boots),
    };
  }
  function isUnlocked(item) {
    return (Game.save.completed?.length || 0) >= (item.unlock || 1);
  }
  function setOutfit(category, id) {
    if (id) {
      const item = findOutfitItem(category, id);
      if (!item || !isUnlocked(item)) return;
    }
    Game.save.outfit = { ...Game.save.outfit, [category]: id };
    Storage.save(Game.save);
    renderWardrobeGrid();
    renderWardrobePreview();
  }

  // ---------- Инициализация canvas ----------
  function setupCanvas() {
    const cvs = document.getElementById('game');
    Game.canvas = cvs;
    Game.ctx = cvs.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    Game.canvas.style.width = cssW + 'px';
    Game.canvas.style.height = cssH + 'px';
    Game.canvas.width = Math.floor(cssW * dpr);
    Game.canvas.height = Math.floor(cssH * dpr);

    // Виртуальное разрешение: фиксируем высоту в BASE_H и пересчитываем ширину
    // — это даёт единый масштаб физики на любом устройстве.
    const scaleY = Game.canvas.height / BASE_H;
    Game.scale = scaleY;
    Game.width = Math.round(Game.canvas.width / scaleY);
    Game.height = BASE_H;
    Game.ctx.setTransform(scaleY, 0, 0, scaleY, 0, 0);
  }

  // ---------- Пекинес ----------
  function createPekinese() {
    return {
      x: Math.max(120, Game.width * 0.28),
      y: Game.height * 0.45,
      vy: 0,
      rotation: 0,
      alive: true,
      flapTime: 0,
      // Коэффициент объёма пекинеса — растёт с каждой съеденной косточкой.
      // Влияет и на размер спрайта, и на радиус коллизий.
      sizeScale: 1,
      // Пульсация при поедании косточки (мс)
      chompTime: 0,
    };
  }

  function flap() {
    if (Game.state !== STATE.PLAYING) return;
    if (!Game.pekinese.alive) return;
    Game.pekinese.vy = FLAP_V;
    Game.pekinese.flapTime = 12;
    Sound.flap();
  }

  // ---------- Препятствия и косточки ----------
  function spawnObstacleSet() {
    const level = LEVELS[Game.currentLevel];
    const gap = level.gapSize;
    const minTop = 40;
    const maxTop = Game.height - FLOOR_H - gap - 40;
    const topH = minTop + Math.random() * (maxTop - minTop);
    const bottomY = topH + gap;
    const bottomH = Game.height - FLOOR_H - bottomY;
    const types = level.obstacles;
    const typeTop = types[Math.floor(Math.random() * types.length)];
    const typeBottom = types[Math.floor(Math.random() * types.length)];
    const lastX = Game.obstacles.length
      ? Game.obstacles[Game.obstacles.length - 1].x
      : Game.width + 50;
    const x = Math.max(Game.width + 50, lastX + level.spacing);
    Game.obstacles.push({
      x, topH, bottomY, bottomH,
      typeTop, typeBottom,
      passed: false,
    });
    // Косточка между предыдущим и новым препятствием (если есть предыдущее)
    if (Game.obstacles.length >= 2) {
      const prev = Game.obstacles[Game.obstacles.length - 2];
      spawnBoneBetween(prev, Game.obstacles[Game.obstacles.length - 1]);
    }
  }

  function spawnBoneBetween(prev, next) {
    // Кость ставим примерно посередине между препятствиями, в середине
    // пролетаемой зоны (над/под полом), слегка случайно по вертикали.
    const betweenX = (prev.x + OBSTACLE_W + next.x) / 2;
    // Берём середину пересечения двух гапов, чтобы косточка была достижима
    // без лишнего риска зацепиться за препятствие.
    const gapTop = Math.max(prev.topH, next.topH);
    const gapBottom = Math.min(prev.bottomY, next.bottomY);
    const mid = (gapTop + gapBottom) / 2;
    const jitter = (Math.random() - 0.5) * Math.max(20, (gapBottom - gapTop) * 0.3);
    Game.bones.push({
      x: betweenX,
      y: mid + jitter,
      collected: false,
      rot: Math.random() * 0.6 - 0.3,
    });
  }

  function prepareInitialObstacles() {
    Game.obstacles = [];
    Game.bones = [];
    // Первое препятствие ставим подальше, чтобы у игрока было время
    const level = LEVELS[Game.currentLevel];
    let x = Game.width + 200;
    for (let i = 0; i < 3; i++) {
      const gap = level.gapSize;
      const minTop = 40;
      const maxTop = Game.height - FLOOR_H - gap - 40;
      const topH = minTop + Math.random() * (maxTop - minTop);
      const bottomY = topH + gap;
      const bottomH = Game.height - FLOOR_H - bottomY;
      const types = level.obstacles;
      const typeTop = types[Math.floor(Math.random() * types.length)];
      const typeBottom = types[Math.floor(Math.random() * types.length)];
      Game.obstacles.push({
        x,
        topH, bottomY, bottomH,
        typeTop, typeBottom,
        passed: false,
      });
      if (i > 0) {
        spawnBoneBetween(
          Game.obstacles[Game.obstacles.length - 2],
          Game.obstacles[Game.obstacles.length - 1],
        );
      }
      x += level.spacing;
    }
  }

  // ---------- Старт уровня ----------
  function startLevel(idx) {
    Game.currentLevel = idx;
    Game.score = 0;
    Game.obstaclesPassed = 0;
    Game.bonesCollected = 0;
    Game.pekinese = createPekinese();
    Game.cat = createCat();
    Game.deathCause = 'crash';
    Game.scrollX = 0;
    Game.cutscene = null;
    prepareInitialObstacles();
    setState(STATE.PLAYING);
    updateHud();
  }

  // ---------- Кошка-преследователь ----------
  function createCat() {
    return {
      // Стартует слегка за левым краем, постепенно догоняет пекинеса по X.
      x: -CAT_SIZE,
      y: Game.height - FLOOR_H - CAT_SIZE * 0.32,
      tailPhase: 0,
      // Цикл атаки: idle -> windup -> strike -> recover -> idle
      swipeT: -CAT_SWIPE_INTERVAL * 0.4,  // короткая отсрочка перед первой атакой
      swipePhase: 'idle',
      pawExt: 0,
      // Лёгкие прыжки во время удара — для динамики
      jumpY: 0,
    };
  }

  function updateCat(dt) {
    const cat = Game.cat;
    const p = Game.pekinese;
    if (!cat || !p) return;
    cat.tailPhase += dt * 0.012;

    // X: следуем за пекинесом, держась на CAT_TRAIL_DX позади.
    const targetX = Math.max(40, p.x - CAT_TRAIL_DX);
    cat.x += (targetX - cat.x) * CAT_FOLLOW;

    // Y: подлетает выше когда атакует, прыгая под пекинеса.
    const baseY = Game.height - FLOOR_H - CAT_SIZE * 0.32;
    let targetY = baseY;
    if (cat.swipePhase === 'strike') {
      // Прыгает к Y пекинеса, насколько достаёт
      const reach = CAT_SIZE * 0.55;
      targetY = Math.max(p.y + 30, baseY - reach);
    }
    cat.y += (targetY - cat.y) * 0.18;

    // Цикл атаки
    cat.swipeT += dt;
    switch (cat.swipePhase) {
      case 'idle':
        cat.pawExt = Math.max(0, cat.pawExt - dt * 0.005);
        if (cat.swipeT >= CAT_SWIPE_INTERVAL) {
          cat.swipeT = 0;
          cat.swipePhase = 'windup';
        }
        break;
      case 'windup': {
        const k = Math.min(1, cat.swipeT / CAT_SWIPE_WINDUP);
        cat.pawExt = -k * 0.15; // отводит лапу назад/прижимает
        if (cat.swipeT >= CAT_SWIPE_WINDUP) {
          cat.swipeT = 0;
          cat.swipePhase = 'strike';
        }
        break;
      }
      case 'strike': {
        const k = Math.min(1, cat.swipeT / CAT_SWIPE_STRIKE);
        cat.pawExt = 0.4 + k * 0.6;
        if (cat.swipeT >= CAT_SWIPE_STRIKE) {
          cat.swipeT = 0;
          cat.swipePhase = 'recover';
        }
        break;
      }
      case 'recover': {
        const k = Math.min(1, cat.swipeT / CAT_SWIPE_RECOVER);
        cat.pawExt = 1 - k;
        if (cat.swipeT >= CAT_SWIPE_RECOVER) {
          cat.swipeT = 0;
          cat.swipePhase = 'idle';
          cat.pawExt = 0;
        }
        break;
      }
    }
  }

  function hitsCatPaw(p) {
    const cat = Game.cat;
    if (!cat) return false;
    // Опасна только в фазе 'strike' и при заметно вытянутой лапе.
    if (cat.swipePhase !== 'strike' || cat.pawExt < 0.4) return false;
    const paw = Sprites.catPawPos(CAT_SIZE, cat.pawExt);
    const px = cat.x + paw.x;
    const py = cat.y + paw.y;
    const r = pekineseRadius() + paw.r;
    const dx = p.x - px;
    const dy = p.y - py;
    return dx * dx + dy * dy < r * r;
  }

  // ---------- Коллизии ----------
  function pekineseRadius() {
    return PEKINESE_COL_R * (Game.pekinese ? Game.pekinese.sizeScale : 1);
  }

  function hitsObstacle(p, ob) {
    // Круг пекинеса vs прямоугольник препятствия
    const r = pekineseRadius();
    // Верхнее препятствие
    if (aabbVsCircle(ob.x, 0, OBSTACLE_W, ob.topH, p.x, p.y, r)) return true;
    // Нижнее
    if (aabbVsCircle(ob.x, ob.bottomY, OBSTACLE_W, ob.bottomH, p.x, p.y, r)) return true;
    return false;
  }

  function hitsBone(p, bone) {
    const r = pekineseRadius() + BONE_COL_R;
    const dx = p.x - bone.x;
    const dy = p.y - bone.y;
    return dx * dx + dy * dy < r * r;
  }

  function aabbVsCircle(ax, ay, aw, ah, cx, cy, cr) {
    const closestX = Math.max(ax, Math.min(cx, ax + aw));
    const closestY = Math.max(ay, Math.min(cy, ay + ah));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < cr * cr;
  }

  // ---------- Update ----------
  function update(dt) {
    Game.timeMs += dt;
    if (Game.state === STATE.PLAYING) {
      updatePlaying(dt);
    } else if (Game.state === STATE.CUTSCENE) {
      updateCutscene(dt);
    }
  }

  function updatePlaying(dt) {
    const level = LEVELS[Game.currentLevel];
    const p = Game.pekinese;

    // Физика пекинеса
    p.vy += GRAVITY;
    p.y += p.vy;
    p.flapTime = Math.max(0, p.flapTime - 1);
    // Наклон в зависимости от скорости (вверх при flap, вниз при падении)
    const targetRot = Math.max(-MAX_TILT, Math.min(MAX_TILT, p.vy * 0.05));
    p.rotation += (targetRot - p.rotation) * 0.15;

    // Границы
    if (p.y < 20) { p.y = 20; p.vy = 0; }
    if (p.y > Game.height - FLOOR_H - 10) {
      p.y = Game.height - FLOOR_H - 10;
      onDeath('crash');
      return;
    }

    // Движение препятствий и косточек
    for (const ob of Game.obstacles) {
      ob.x -= level.speed;
    }
    for (const b of Game.bones) {
      b.x -= level.speed;
    }
    Game.scrollX += level.speed;
    Game.groundOffset += level.speed;
    Game.flapPhase += 0.2;
    p.chompTime = Math.max(0, p.chompTime - dt);

    // Кошка: движение + цикл атаки
    updateCat(dt);
    // Проверка пройденных и коллизий с препятствиями
    for (const ob of Game.obstacles) {
      if (!ob.passed && ob.x + OBSTACLE_W < p.x) {
        ob.passed = true;
        Game.obstaclesPassed += 1;
        Game.score += 1;
        Sound.score();
        updateHud();
      }
      if (hitsObstacle(p, ob)) {
        onDeath('crash');
        return;
      }
    }
    // Коллизия с лапой кошки во время strike
    if (hitsCatPaw(p)) {
      onDeath('cat');
      return;
    }

    // Сбор косточек
    for (const b of Game.bones) {
      if (!b.collected && hitsBone(p, b)) {
        b.collected = true;
        onBoneEaten();
      }
    }

    // Убираем ушедшие и съеденные
    Game.obstacles = Game.obstacles.filter(o => o.x + OBSTACLE_W > -100);
    Game.bones = Game.bones.filter(b => !b.collected && b.x > -80);

    // Спавн новых, пока не набрали нужного количества для уровня
    const remaining = level.obstacleCount - Game.obstaclesPassed - Game.obstacles.length;
    while (Game.obstacles.length < 4 && remaining > 0) {
      spawnObstacleSet();
    }

    // Если прошли все препятствия — переход в финальную сцену уровня
    if (Game.obstaclesPassed >= level.obstacleCount && Game.obstacles.length === 0) {
      startCutscene();
    }
  }

  // ---------- Финальная сцена уровня ----------
  function startCutscene() {
    Game.state = STATE.CUTSCENE;
    // Кошка отстаёт и убегает с экрана за кадр
    Game.cat = null;
    Game.cutscene = {
      phase: 'approach',   // approach -> bone -> arms -> done
      t: 0,
      boneX: Game.width + 60,
      boneY: Game.height * 0.45,
      ownerX: Game.width + 200,
      ownerY: Game.height - FLOOR_H,
      hasBone: false,
      inArms: false,
    };
    Sound.win();
  }

  function updateCutscene(dt) {
    const cs = Game.cutscene;
    const p = Game.pekinese;
    const level = LEVELS[Game.currentLevel];
    cs.t += dt;

    Game.groundOffset += level.speed * 0.5;
    Game.flapPhase += 0.25;

    // Хозяйка и косточка въезжают в кадр
    cs.ownerX -= level.speed * 0.7;
    cs.boneX -= level.speed * 0.7;
    if (cs.ownerX < Game.width * 0.75) cs.ownerX = Game.width * 0.75;
    if (cs.boneX < Game.width * 0.55) cs.boneX = Game.width * 0.55;

    if (cs.phase === 'approach') {
      // Пекинес летит к косточке
      const tx = cs.boneX;
      const ty = cs.boneY;
      p.x += (tx - p.x) * 0.04;
      p.y += (ty - p.y) * 0.04;
      p.rotation *= 0.9;
      if (Math.abs(p.x - tx) < 8 && Math.abs(p.y - ty) < 8) {
        cs.phase = 'bone';
        cs.hasBone = true;
      }
    } else if (cs.phase === 'bone') {
      // Секунду радуется косточке
      if (cs.t > 1200) cs.phase = 'toArms';
    } else if (cs.phase === 'toArms') {
      // Прыгает в руки к хозяйке
      const tx = cs.ownerX;
      const ty = cs.ownerY - 90;
      p.x += (tx - p.x) * 0.06;
      p.y += (ty - p.y) * 0.06;
      if (Math.abs(p.x - tx) < 6 && Math.abs(p.y - ty) < 6) {
        cs.phase = 'done';
        cs.inArms = true;
        setTimeout(finishLevel, 900);
      }
    }
  }

  function finishLevel() {
    const idx = Game.currentLevel;
    const wasCompletedCount = Game.save.completed.length;
    // Сохраняем прогресс
    if (!Game.save.completed.includes(idx)) Game.save.completed.push(idx);
    Game.save.unlocked = Math.max(Game.save.unlocked, Math.min(LEVELS.length, idx + 2));
    const newCompletedCount = Game.save.completed.length;
    if (Game.score > Game.save.best) Game.save.best = Game.score;
    Storage.save(Game.save);

    // Какие наряды только что открылись?
    const newlyUnlocked = [];
    if (newCompletedCount > wasCompletedCount) {
      for (const cat of ['hat', 'body', 'boots']) {
        for (const item of (OUTFITS[cat] || [])) {
          if (item.unlock === newCompletedCount) newlyUnlocked.push(item);
        }
      }
    }

    // Попытаемся показать fullscreen-рекламу между уровнями (не блокирует UI)
    Yandex.showFullscreenAd();

    if (idx + 1 >= LEVELS.length) {
      setState(STATE.FINAL);
    } else {
      let msg = `Ты пролетел ${Game.score} препятствий и съел ${Game.bonesCollected} косточек.`;
      if (newlyUnlocked.length) {
        msg += ' Открыты новые наряды: ' + newlyUnlocked.map(i => i.name).join(', ') + '.';
      }
      document.getElementById('win-stats').textContent = msg;
      setState(STATE.WIN);
    }
  }

  function onBoneEaten() {
    const p = Game.pekinese;
    if (!p) return;
    Game.bonesCollected += 1;
    p.sizeScale = Math.min(MAX_BONE_SCALE, p.sizeScale + BONE_GROWTH);
    p.chompTime = 260;
    Sound.score();
    updateHud();
  }

  function onDeath(cause = 'crash') {
    if (!Game.pekinese.alive) return;
    Game.pekinese.alive = false;
    Game.deathCause = cause;
    Sound.hit();
    if (Game.score > Game.save.best) {
      Game.save.best = Game.score;
      Storage.save(Game.save);
    }
    setTimeout(() => {
      document.getElementById('over-stats').textContent =
        `Преодолено: ${Game.score}. Рекорд: ${Game.save.best}.`;
      const titleEl = document.getElementById('over-title');
      if (titleEl) {
        titleEl.textContent = cause === 'cat'
          ? 'Кошка цапнула пекинеса!'
          : 'Ой! Пекинес врезался';
      }
      setState(STATE.OVER);
    }, 600);
  }

  // ---------- Рендер ----------
  function render() {
    const ctx = Game.ctx;
    const w = Game.width;
    const h = Game.height;

    // Фон: обои (для помещения) или небо
    const level = LEVELS[Game.currentLevel] || LEVELS[0];
    Sprites.drawWallpaper(ctx, w, h - FLOOR_H, level.bgVariant);

    // Небольшие облака в комнате? Нет — заменим на картины
    drawWallDecor(ctx, w, h - FLOOR_H, level.bgVariant);

    // Пол
    Sprites.drawFloor(ctx, 0, h - FLOOR_H, w, FLOOR_H, Game.groundOffset);

    // Препятствия
    for (const ob of Game.obstacles) {
      Sprites.drawObstacle(ctx, ob.typeTop, ob.x, 0, OBSTACLE_W, ob.topH, true);
      Sprites.drawObstacle(ctx, ob.typeBottom, ob.x, ob.bottomY, OBSTACLE_W, ob.bottomH, false);
    }

    // Кошка-преследователь (на земле, под препятствиями по слою — но перед фоном)
    if (Game.cat && (Game.state === STATE.PLAYING || Game.state === STATE.PAUSED)) {
      const cat = Game.cat;
      ctx.save();
      ctx.translate(cat.x, cat.y);
      // Лёгкий «приседающий» наклон при windup
      if (cat.swipePhase === 'windup') ctx.scale(1, 0.95);
      Sprites.drawCat(ctx, CAT_SIZE, cat.pawExt, cat.tailPhase);
      ctx.restore();
      // Тень под кошкой
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(cat.x, Game.height - FLOOR_H + 4, CAT_SIZE * 0.36, CAT_SIZE * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Летающие косточки (пикапы) — только в процессе полёта
    if (Game.state === STATE.PLAYING || Game.state === STATE.PAUSED) {
      for (const b of Game.bones) {
        if (b.collected) continue;
        const float = Math.sin((Game.timeMs + b.x * 3) / 220) * 4;
        Sprites.drawBone(ctx, b.x, b.y + float, BONE_SIZE, b.rot);
      }
    }

    // Финальная сцена
    if (Game.state === STATE.CUTSCENE) {
      const cs = Game.cutscene;
      // Хозяйка стоит на полу
      Sprites.drawOwner(ctx, cs.ownerX, cs.ownerY - 220, 220);
      // Косточка (плавает рядом)
      if (!cs.hasBone) {
        Sprites.drawBone(ctx, cs.boneX, cs.boneY + Math.sin(Game.timeMs / 200) * 6, 56);
      }
    }

    // Пекинес
    const p = Game.pekinese;
    if (p) {
      // Лёгкая пульсация сразу после поедания косточки
      const chompPulse = p.chompTime > 0 ? 1 + Math.sin((260 - p.chompTime) / 260 * Math.PI) * 0.08 : 1;
      const scale = p.sizeScale * chompPulse;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(scale, scale);
      Sprites.drawPekinese(ctx, PEKINESE_SIZE, Game.flapPhase + (p.flapTime > 0 ? 2 : 0));
      Sprites.drawOutfit(ctx, PEKINESE_SIZE, getCurrentOutfit());
      // Косточка в зубах, если забрана в финальной сцене
      if (Game.state === STATE.CUTSCENE && Game.cutscene.hasBone) {
        Sprites.drawBone(ctx, PEKINESE_SIZE * 0.35, -PEKINESE_SIZE * 0.05, 40);
      }
      ctx.restore();
    }

    // Надписи поверх (только во время intro'а или начала уровня)
    if (Game.state === STATE.PLAYING && Game.obstaclesPassed === 0 && Game.obstacles[0]?.x > Game.width * 0.65) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(Game.width / 2 - 160, 80, 320, 50);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px "Nunito", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Пробел / тап — вверх!', Game.width / 2, 112);
      ctx.restore();
    }
  }

  function drawWallDecor(ctx, w, wallH, variant) {
    // Парящие облака-"пылинки" чтобы оживить фон
    const spots = 5;
    for (let i = 0; i < spots; i++) {
      const x = ((i * 187 + Game.groundOffset * 0.3) % (w + 120)) - 60;
      const y = 60 + i * 90;
      ctx.save();
      ctx.globalAlpha = 0.35;
      Sprites.drawCloud(ctx, x, y, 0.5 + (i % 2) * 0.15);
      ctx.restore();
    }
    // Полоса "плинтуса" у пола
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, wallH - 4, w, 4);
  }

  // ---------- Игровой цикл ----------
  let lastT = 0;
  function loop(t) {
    const dt = Math.min(50, t - lastT);
    lastT = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- UI / экраны ----------
  function setState(s) {
    Game.state = s;
    // Показываем/скрываем экраны
    const show = {
      [STATE.MENU]: 'menu',
      [STATE.LEVELS]: 'levels',
      [STATE.WARDROBE]: 'wardrobe',
      [STATE.INTRO]: 'intro',
      [STATE.PAUSED]: 'pause',
      [STATE.WIN]: 'win',
      [STATE.OVER]: 'over',
      [STATE.FINAL]: 'final',
    };
    ['menu', 'levels', 'wardrobe', 'intro', 'pause', 'win', 'over', 'final'].forEach(id => {
      document.getElementById(id).classList.toggle('hidden', show[s] !== id);
    });
    document.getElementById('hud').classList.toggle('hidden',
      !(s === STATE.PLAYING || s === STATE.CUTSCENE));
    document.getElementById('tap-zone').classList.toggle('hidden',
      !(s === STATE.PLAYING));

    // Убираем keyboard-focus с кнопок, чтобы Space/Enter не "кликали" их
    // и использовались игроком для полёта.
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    if (s === STATE.LEVELS) renderLevelGrid();
    if (s === STATE.WARDROBE) {
      renderWardrobeGrid();
      renderWardrobePreview();
    }
  }

  function renderWardrobePreview() {
    const cv = document.getElementById('wardrobe-preview');
    if (!cv) return;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    // Лёгкая рамка-подложка
    c.fillStyle = '#fef9ed';
    c.fillRect(0, 0, cv.width, cv.height);
    c.save();
    c.translate(cv.width / 2, cv.height / 2 + 20);
    const size = Math.min(cv.width, cv.height) * 0.85;
    Sprites.drawPekinese(c, size, 0);
    Sprites.drawOutfit(c, size, getCurrentOutfit());
    c.restore();
  }

  function renderWardrobeGrid() {
    const grid = document.getElementById('wardrobe-grid');
    if (!grid) return;
    const tab = Game.wardrobeTab || 'hat';
    const items = OUTFITS[tab] || [];
    const selectedId = Game.save.outfit[tab];
    grid.innerHTML = '';
    for (const item of items) {
      const unlocked = isUnlocked(item);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'wardrobe__cell';
      if (item.id === selectedId) cell.classList.add('is-selected');
      if (!unlocked) cell.classList.add('is-locked');
      const cv = document.createElement('canvas');
      cv.width = 120; cv.height = 120;
      const c = cv.getContext('2d');
      c.fillStyle = '#f7e9c8';
      c.fillRect(0, 0, cv.width, cv.height);
      c.save();
      c.translate(cv.width / 2, cv.height / 2 + 6);
      Sprites.drawPekinese(c, 100, 0);
      const previewOutfit = {};
      previewOutfit[tab] = item;
      Sprites.drawOutfit(c, 100, previewOutfit);
      c.restore();
      cell.appendChild(cv);
      const label = document.createElement('span');
      label.className = 'wardrobe__label';
      label.textContent = item.name;
      cell.appendChild(label);
      if (!unlocked) {
        const lock = document.createElement('span');
        lock.className = 'wardrobe__lock';
        lock.textContent = `\u{1F512} Уровень ${item.unlock}`;
        cell.appendChild(lock);
      }
      cell.addEventListener('click', () => {
        if (unlocked) setOutfit(tab, item.id);
      });
      grid.appendChild(cell);
    }
  }

  function updateHud() {
    document.getElementById('hud-level').textContent = String(Game.currentLevel + 1);
    document.getElementById('hud-score').textContent = String(Game.score);
    document.getElementById('hud-best').textContent = String(Game.save.best);
    const bonesEl = document.getElementById('hud-bones');
    if (bonesEl) bonesEl.textContent = String(Game.bonesCollected);
  }

  function renderLevelGrid() {
    const grid = document.getElementById('level-grid');
    grid.innerHTML = '';
    for (let i = 0; i < LEVELS.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'level-cell';
      const unlocked = i < Game.save.unlocked;
      const completed = Game.save.completed.includes(i);
      if (!unlocked) cell.classList.add('locked');
      if (completed) cell.classList.add('completed');
      cell.textContent = String(i + 1);
      if (unlocked) {
        cell.addEventListener('click', () => {
          prepareIntro(i);
        });
      }
      grid.appendChild(cell);
    }
  }

  function prepareIntro(idx) {
    Game.currentLevel = idx;
    const level = LEVELS[idx];
    document.getElementById('intro-level').textContent = String(idx + 1);
    document.getElementById('intro-name').textContent = level.name;
    document.getElementById('intro-desc').textContent = level.description;
    setState(STATE.INTRO);
  }

  // ---------- Обработчики кнопок ----------
  function wireUi() {
    document.getElementById('btn-start').addEventListener('click', () => {
      // Стартуем следующий недойденный уровень
      let next = 0;
      for (let i = 0; i < LEVELS.length; i++) {
        if (!Game.save.completed.includes(i)) { next = i; break; }
        if (i === LEVELS.length - 1) next = 0;
      }
      prepareIntro(Math.min(next, Game.save.unlocked - 1));
    });
    document.getElementById('btn-levels').addEventListener('click', () => setState(STATE.LEVELS));
    document.getElementById('btn-levels-back').addEventListener('click', () => setState(STATE.MENU));
    document.getElementById('btn-wardrobe').addEventListener('click', () => setState(STATE.WARDROBE));
    document.getElementById('btn-wardrobe-back').addEventListener('click', () => setState(STATE.MENU));
    document.getElementById('btn-wardrobe-clear-hat').addEventListener('click', () => { setOutfit('hat', null); });
    document.getElementById('btn-wardrobe-clear-body').addEventListener('click', () => { setOutfit('body', null); });
    document.getElementById('btn-wardrobe-clear-boots').addEventListener('click', () => { setOutfit('boots', null); });
    document.querySelectorAll('.ui-btn--tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ui-btn--tab').forEach(b => b.classList.toggle('is-active', b === btn));
        Game.wardrobeTab = btn.dataset.tab;
        renderWardrobeGrid();
      });
    });
    document.getElementById('btn-intro-play').addEventListener('click', () => {
      startLevel(Game.currentLevel);
    });
    document.getElementById('pause-btn').addEventListener('click', togglePause);
    document.getElementById('btn-resume').addEventListener('click', togglePause);
    document.getElementById('btn-restart').addEventListener('click', () => startLevel(Game.currentLevel));
    document.getElementById('btn-menu').addEventListener('click', () => setState(STATE.MENU));
    document.getElementById('btn-next').addEventListener('click', () => {
      const next = Math.min(LEVELS.length - 1, Game.currentLevel + 1);
      prepareIntro(next);
    });
    document.getElementById('btn-win-menu').addEventListener('click', () => setState(STATE.MENU));
    document.getElementById('btn-retry').addEventListener('click', () => startLevel(Game.currentLevel));
    document.getElementById('btn-over-menu').addEventListener('click', () => setState(STATE.MENU));
    document.getElementById('btn-final-menu').addEventListener('click', () => setState(STATE.MENU));

    const soundBtn = document.getElementById('btn-sound');
    const syncSoundBtn = () => {
      soundBtn.textContent = 'Звук: ' + (Game.save.soundOn ? 'вкл' : 'выкл');
      Sound.setEnabled(!!Game.save.soundOn);
    };
    syncSoundBtn();
    soundBtn.addEventListener('click', () => {
      Game.save.soundOn = !Game.save.soundOn;
      Storage.save(Game.save);
      syncSoundBtn();
    });
  }

  function togglePause() {
    if (Game.state === STATE.PLAYING) setState(STATE.PAUSED);
    else if (Game.state === STATE.PAUSED) setState(STATE.PLAYING);
  }

  // ---------- Ввод ----------
  function wireInput() {
    // Клавиатура: пробел / W / стрелка вверх
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        flap();
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
      } else if (e.code === 'Enter' && Game.state === STATE.INTRO) {
        startLevel(Game.currentLevel);
      }
    }, { passive: false });

    // Touch / mouse на зоне тапа (любая кнопка мыши — левая, средняя, правая)
    const tap = document.getElementById('tap-zone');
    const handler = (e) => {
      e.preventDefault();
      flap();
    };
    tap.addEventListener('touchstart', handler, { passive: false });
    tap.addEventListener('mousedown', handler);

    // Правая кнопка мыши по всему окну — тоже flap во время игры.
    // Отключаем браузерное контекстное меню, пока идёт уровень.
    window.addEventListener('contextmenu', (e) => {
      if (Game.state === STATE.PLAYING || Game.state === STATE.PAUSED) {
        e.preventDefault();
        if (Game.state === STATE.PLAYING) flap();
      }
    });

    // Аудио-контекст «будим» на первое взаимодействие
    const unlock = () => {
      Sound.pause(false);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  function wireVisibility() {
    // По требованию Я.Игр: звук останавливаем, когда вкладка свёрнута
    document.addEventListener('visibilitychange', () => {
      const hidden = document.hidden;
      Sound.pause(hidden);
      if (hidden && Game.state === STATE.PLAYING) setState(STATE.PAUSED);
    });
  }

  // ---------- Bootstrap ----------
  async function main() {
    setupCanvas();
    wireUi();
    wireInput();
    wireVisibility();
    setState(STATE.MENU);
    requestAnimationFrame((t) => { lastT = t; loop(t); });
    // SDK — после первого рендера, чтобы не блокировать UI
    await Yandex.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
