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

  const STATE = {
    MENU: 'menu',
    LEVELS: 'levels',
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
    const load = () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) {}
      return { best: 0, unlocked: 1, completed: [], soundOn: true };
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
    scrollX: 0,
    obstaclesPassed: 0,
    groundOffset: 0,
    cutscene: null,
    timeMs: 0,
    flapPhase: 0,

    save: Storage.load(),
  };

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
    };
  }

  function flap() {
    if (Game.state !== STATE.PLAYING) return;
    if (!Game.pekinese.alive) return;
    Game.pekinese.vy = FLAP_V;
    Game.pekinese.flapTime = 12;
    Sound.flap();
  }

  // ---------- Препятствия ----------
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
  }

  function prepareInitialObstacles() {
    Game.obstacles = [];
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
      x += level.spacing;
    }
  }

  // ---------- Старт уровня ----------
  function startLevel(idx) {
    Game.currentLevel = idx;
    Game.score = 0;
    Game.obstaclesPassed = 0;
    Game.pekinese = createPekinese();
    Game.scrollX = 0;
    Game.cutscene = null;
    prepareInitialObstacles();
    setState(STATE.PLAYING);
    updateHud();
  }

  // ---------- Коллизии ----------
  function hitsObstacle(p, ob) {
    // Круг пекинеса vs прямоугольник препятствия
    const r = PEKINESE_COL_R;
    // Верхнее препятствие
    if (aabbVsCircle(ob.x, 0, OBSTACLE_W, ob.topH, p.x, p.y, r)) return true;
    // Нижнее
    if (aabbVsCircle(ob.x, ob.bottomY, OBSTACLE_W, ob.bottomH, p.x, p.y, r)) return true;
    return false;
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
      onDeath();
      return;
    }

    // Движение препятствий
    for (const ob of Game.obstacles) {
      ob.x -= level.speed;
    }
    Game.scrollX += level.speed;
    Game.groundOffset += level.speed;
    Game.flapPhase += 0.2;

    // Проверка пройденных и коллизий
    for (const ob of Game.obstacles) {
      if (!ob.passed && ob.x + OBSTACLE_W < p.x) {
        ob.passed = true;
        Game.obstaclesPassed += 1;
        Game.score += 1;
        Sound.score();
        updateHud();
      }
      if (hitsObstacle(p, ob)) {
        onDeath();
        return;
      }
    }

    // Убираем ушедшие
    Game.obstacles = Game.obstacles.filter(o => o.x + OBSTACLE_W > -100);

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
    // Сохраняем прогресс
    if (!Game.save.completed.includes(idx)) Game.save.completed.push(idx);
    Game.save.unlocked = Math.max(Game.save.unlocked, Math.min(LEVELS.length, idx + 2));
    if (Game.score > Game.save.best) Game.save.best = Game.score;
    Storage.save(Game.save);

    // Попытаемся показать fullscreen-рекламу между уровнями (не блокирует UI)
    Yandex.showFullscreenAd();

    if (idx + 1 >= LEVELS.length) {
      setState(STATE.FINAL);
    } else {
      document.getElementById('win-stats').textContent =
        `Ты пролетел ${Game.score} препятствий. Пекинес получил косточку!`;
      setState(STATE.WIN);
    }
  }

  function onDeath() {
    if (!Game.pekinese.alive) return;
    Game.pekinese.alive = false;
    Sound.hit();
    if (Game.score > Game.save.best) {
      Game.save.best = Game.score;
      Storage.save(Game.save);
    }
    setTimeout(() => {
      document.getElementById('over-stats').textContent =
        `Преодолено: ${Game.score}. Рекорд: ${Game.save.best}.`;
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
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      Sprites.drawPekinese(ctx, PEKINESE_SIZE, Game.flapPhase + (p.flapTime > 0 ? 2 : 0));
      // Косточка в зубах, если забрана
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
      [STATE.INTRO]: 'intro',
      [STATE.PAUSED]: 'pause',
      [STATE.WIN]: 'win',
      [STATE.OVER]: 'over',
      [STATE.FINAL]: 'final',
    };
    ['menu', 'levels', 'intro', 'pause', 'win', 'over', 'final'].forEach(id => {
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
  }

  function updateHud() {
    document.getElementById('hud-level').textContent = String(Game.currentLevel + 1);
    document.getElementById('hud-score').textContent = String(Game.score);
    document.getElementById('hud-best').textContent = String(Game.save.best);
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

    // Touch / mouse на зоне тапа
    const tap = document.getElementById('tap-zone');
    const handler = (e) => {
      e.preventDefault();
      flap();
    };
    tap.addEventListener('touchstart', handler, { passive: false });
    tap.addEventListener('mousedown', handler);

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
