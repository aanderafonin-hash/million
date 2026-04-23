(function () {
  'use strict';

  // ---------- Yandex Games SDK ----------
  let ysdk = null;
  if (typeof window.YaGames !== 'undefined' && window.YaGames.init) {
    window.YaGames.init()
      .then(function (sdk) {
        ysdk = sdk;
        try {
          if (sdk.features && sdk.features.LoadingAPI && sdk.features.LoadingAPI.ready) {
            sdk.features.LoadingAPI.ready();
          }
        } catch (_) {}
      })
      .catch(function () {});
  }

  // ---------- Constants ----------
  const GRID = 20;
  const CELL = 30; // canvas 600x600

  const DIR = {
    UP:    { x: 0,  y: -1 },
    DOWN:  { x: 0,  y: 1  },
    LEFT:  { x: -1, y: 0  },
    RIGHT: { x: 1,  y: 0  },
  };

  const LEVELS = window.LEVELS;
  const LB_KEY = 'taksa_leaderboard_v1';
  const PROGRESS_KEY = 'taksa_progress_v1';
  const NAME_KEY = 'taksa_player_name';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  const hudEl = $('hud');
  const hudLevel = $('hud-level');
  const hudBones = $('hud-bones');
  const hudGoal = $('hud-goal');
  const hudScore = $('hud-score');

  const overlays = {
    menu: $('overlay-menu'),
    name: $('overlay-name'),
    levels: $('overlay-levels'),
    leaderboard: $('overlay-leaderboard'),
    pause: $('overlay-pause'),
    gameover: $('overlay-gameover'),
    win: $('overlay-win'),
    finale: $('overlay-finale'),
  };

  // ---------- Persistence ----------
  function loadProgress() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { unlocked: 1, cleared: {}, bestScorePerLevel: {}, totalScore: 0 };
  }
  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (_) {}
  }
  function loadLeaderboard() {
    try {
      const raw = localStorage.getItem(LB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
  }
  function saveLeaderboard(arr) {
    try { localStorage.setItem(LB_KEY, JSON.stringify(arr)); } catch (_) {}
  }
  function loadName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (_) { return ''; }
  }
  function saveName(name) {
    try { localStorage.setItem(NAME_KEY, name); } catch (_) {}
  }

  const progress = loadProgress();
  let playerName = loadName();

  // ---------- State ----------
  const state = {
    level: null,              // LEVELS entry
    dog: [],                  // head first
    dir: DIR.RIGHT,
    pendingDir: DIR.RIGHT,
    bone: null,
    bonesEaten: 0,
    score: 0,
    obstaclesSet: new Set(),  // "x,y" strings
    tickMs: 180,
    lastTick: 0,
    running: false,
    paused: false,
    over: false,
    eatPulse: 0,              // tail wag + tongue lick boost
    particles: [],            // heart/sparkle particles
    blinkUntil: 0,            // blink animation end timestamp
    nextBlinkAt: 0,           // next scheduled blink
  };

  // ---------- Screen router ----------
  function showOnly(name) {
    for (const k in overlays) {
      overlays[k].classList.toggle('hidden', k !== name);
    }
    if (name === null) {
      for (const k in overlays) overlays[k].classList.add('hidden');
    }
  }

  function goMenu() {
    state.running = false;
    state.paused = false;
    state.over = false;
    hudEl.classList.add('hidden');
    // Reset idle scene
    state.level = LEVELS[0];
    state.obstaclesSet = new Set(state.level.obstacles.map(p => p.x + ',' + p.y));
    state.dog = [
      { x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 },
    ];
    state.bone = spawnBone();
    refreshMenu();
    showOnly('menu');
  }

  function refreshMenu() {
    const line = $('player-line');
    const display = $('player-name-display');
    if (playerName) {
      display.textContent = playerName;
      line.classList.remove('hidden');
    } else {
      line.classList.add('hidden');
    }
  }

  // ---------- Leaderboard ----------
  function submitScore(totalScore) {
    if (!playerName) return;
    const lb = loadLeaderboard();
    const existing = lb.find(e => e.name === playerName);
    if (existing) {
      if (totalScore > existing.score) existing.score = totalScore;
    } else {
      lb.push({ name: playerName, score: totalScore });
    }
    lb.sort((a, b) => b.score - a.score);
    saveLeaderboard(lb.slice(0, 50));
  }

  function renderLeaderboard() {
    const list = $('leaderboard-list');
    const empty = $('leaderboard-empty');
    list.innerHTML = '';
    const lb = loadLeaderboard().slice(0, 10);
    if (lb.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    lb.forEach((entry, idx) => {
      const li = document.createElement('li');
      if (entry.name === playerName) li.classList.add('me');
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);
      li.innerHTML =
        '<span class="rank">' + medal + '</span>' +
        '<span class="player"></span>' +
        '<span class="score">' + entry.score + '</span>';
      li.querySelector('.player').textContent = entry.name;
      list.appendChild(li);
    });
  }

  // ---------- Level select ----------
  function renderLevelGrid() {
    const grid = $('levels-grid');
    grid.innerHTML = '';
    LEVELS.forEach(lv => {
      const cell = document.createElement('div');
      cell.className = 'level-cell';
      const unlocked = lv.id <= progress.unlocked;
      const cleared = !!progress.cleared[lv.id];
      if (!unlocked) cell.classList.add('locked');
      if (cleared) cell.classList.add('cleared');
      cell.innerHTML =
        '<div class="num">' + lv.id + '</div>' +
        '<div class="badge">' + (cleared ? lv.reward.icon : (unlocked ? '🦴' : '🔒')) + '</div>';
      cell.title = lv.name + (unlocked ? ' — ' + lv.bonesToWin + ' косточек' : ' — закрыт');
      if (unlocked) {
        cell.addEventListener('click', () => startLevel(lv.id));
      }
      grid.appendChild(cell);
    });
  }

  // ---------- Level flow ----------
  function startLevel(id) {
    const lv = LEVELS.find(x => x.id === id);
    if (!lv) return;
    state.level = lv;
    state.obstaclesSet = new Set(lv.obstacles.map(p => p.x + ',' + p.y));
    // Find a safe starting area in row 10
    let startX = 7;
    // slide right if obstacles block the 3-cell starting line
    while (startX <= 14 && (
      state.obstaclesSet.has(startX + ',10') ||
      state.obstaclesSet.has((startX - 1) + ',10') ||
      state.obstaclesSet.has((startX - 2) + ',10')
    )) startX++;
    state.dog = [
      { x: startX, y: 10 },
      { x: startX - 1, y: 10 },
      { x: startX - 2, y: 10 },
    ];
    state.dir = DIR.RIGHT;
    state.pendingDir = DIR.RIGHT;
    state.bone = spawnBone();
    state.bonesEaten = 0;
    state.score = 0;
    state.tickMs = lv.tickMs;
    state.lastTick = 0;
    state.running = true;
    state.paused = false;
    state.over = false;
    state.eatPulse = 0;

    hudLevel.textContent = String(lv.id);
    hudBones.textContent = '0';
    hudGoal.textContent = String(lv.bonesToWin);
    hudScore.textContent = '0';
    hudEl.classList.remove('hidden');
    showOnly(null);
  }

  function spawnBone() {
    const occupied = new Set(state.dog.map(p => p.x + ',' + p.y));
    const free = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        const k = x + ',' + y;
        if (!occupied.has(k) && !state.obstaclesSet.has(k)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function levelComplete() {
    const lv = state.level;
    state.running = false;
    // Level bonus
    const levelBonus = lv.id * 20;
    state.score += levelBonus;
    // Save best for level
    const prevBest = progress.bestScorePerLevel[lv.id] || 0;
    if (state.score > prevBest) progress.bestScorePerLevel[lv.id] = state.score;
    // First-time clear grants full score addition to total
    if (!progress.cleared[lv.id]) {
      progress.cleared[lv.id] = true;
      progress.totalScore = (progress.totalScore || 0) + state.score;
      if (lv.id < LEVELS.length) progress.unlocked = Math.max(progress.unlocked, lv.id + 1);
    } else {
      // Replay: add only delta over previous best (to avoid farming)
      const delta = Math.max(0, state.score - prevBest);
      progress.totalScore = (progress.totalScore || 0) + delta;
    }
    saveProgress();
    submitScore(progress.totalScore);

    hudEl.classList.add('hidden');
    if (lv.id >= LEVELS.length) {
      $('finale-total').textContent = String(progress.totalScore);
      showOnly('finale');
      return;
    }

    $('win-level').textContent = String(lv.id);
    $('win-name').textContent = lv.name;
    $('win-score').textContent = String(state.score);
    $('win-total').textContent = String(progress.totalScore);
    $('win-icon').textContent = lv.reward.icon;
    $('win-title').textContent = lv.reward.title;
    showOnly('win');
  }

  function gameOver() {
    state.running = false;
    state.over = true;
    const lv = state.level;
    // partial score goes to total (first attempts only)
    if (!progress.cleared[lv.id]) {
      const partialBest = progress.bestScorePerLevel[lv.id] || 0;
      if (state.score > partialBest) {
        progress.totalScore = (progress.totalScore || 0) + (state.score - partialBest);
        progress.bestScorePerLevel[lv.id] = state.score;
        saveProgress();
      }
    }
    submitScore(progress.totalScore);

    $('go-level').textContent = String(lv.id);
    $('go-bones').textContent = String(state.bonesEaten);
    $('go-goal').textContent = String(lv.bonesToWin);
    $('go-score').textContent = String(state.score);
    hudEl.classList.add('hidden');
    showOnly('gameover');
  }

  // ---------- Input ----------
  function setDir(nd) {
    const cur = state.dir;
    if (cur.x + nd.x === 0 && cur.y + nd.y === 0) return;
    state.pendingDir = nd;
  }

  window.addEventListener('keydown', function (e) {
    // Skip when typing in the name input
    if (document.activeElement && document.activeElement.id === 'name-input') return;
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'ц' || k === 'Ц') {
      setDir(DIR.UP); e.preventDefault();
    } else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === 'ы' || k === 'Ы') {
      setDir(DIR.DOWN); e.preventDefault();
    } else if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ф' || k === 'Ф') {
      setDir(DIR.LEFT); e.preventDefault();
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'в' || k === 'В') {
      setDir(DIR.RIGHT); e.preventDefault();
    } else if (k === ' ' || k === 'p' || k === 'P') {
      togglePause(); e.preventDefault();
    }
  }, { passive: false });

  // Swipe
  let touchStart = null;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length) {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const MIN = 18;
    if (Math.max(adx, ady) < MIN) { touchStart = null; return; }
    if (adx > ady) setDir(dx > 0 ? DIR.RIGHT : DIR.LEFT);
    else setDir(dy > 0 ? DIR.DOWN : DIR.UP);
    touchStart = null;
  }, { passive: true });

  function togglePause() {
    if (state.over || !state.running && !state.paused) return;
    if (state.paused) {
      state.paused = false;
      state.lastTick = performance.now();
      showOnly(null);
    } else if (state.running) {
      state.paused = true;
      showOnly('pause');
    }
  }

  // ---------- Buttons ----------
  $('play-btn').addEventListener('click', function () {
    if (!playerName) { showOnly('name'); $('name-input').focus(); return; }
    startLevel(progress.unlocked);
  });
  $('levels-btn').addEventListener('click', function () {
    renderLevelGrid();
    showOnly('levels');
  });
  $('leaderboard-btn').addEventListener('click', function () {
    renderLeaderboard();
    showOnly('leaderboard');
  });
  $('change-name-btn').addEventListener('click', function () {
    $('name-input').value = playerName;
    showOnly('name');
    $('name-input').focus();
  });
  $('name-save-btn').addEventListener('click', function () {
    const v = ($('name-input').value || '').trim();
    if (!v) return;
    playerName = v.slice(0, 16);
    saveName(playerName);
    refreshMenu();
    showOnly('menu');
  });
  $('name-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('name-save-btn').click(); }
  });

  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const target = btn.getAttribute('data-back');
      if (target === 'overlay-menu') goMenu();
    });
  });

  $('pause-btn').addEventListener('click', togglePause);
  $('resume-btn').addEventListener('click', function () {
    if (state.paused) togglePause();
  });
  $('quit-btn').addEventListener('click', goMenu);

  $('retry-btn').addEventListener('click', function () {
    startLevel(state.level.id);
  });
  $('go-menu-btn').addEventListener('click', goMenu);

  $('next-btn').addEventListener('click', function () {
    startLevel(Math.min(LEVELS.length, state.level.id + 1));
  });
  $('win-menu-btn').addEventListener('click', goMenu);
  $('finale-menu-btn').addEventListener('click', goMenu);

  // ---------- Game Loop ----------
  function step() {
    state.dir = state.pendingDir;
    const head = state.dog[0];
    const nx = head.x + state.dir.x;
    const ny = head.y + state.dir.y;

    // Wall
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return gameOver();
    // Obstacles
    if (state.obstaclesSet.has(nx + ',' + ny)) return gameOver();

    const willEat = state.bone && nx === state.bone.x && ny === state.bone.y;
    const tailIndex = willEat ? state.dog.length : state.dog.length - 1;
    for (let i = 0; i < tailIndex; i++) {
      if (state.dog[i].x === nx && state.dog[i].y === ny) return gameOver();
    }

    state.dog.unshift({ x: nx, y: ny });
    if (willEat) {
      state.bonesEaten += 1;
      state.score += 10;
      state.eatPulse = 1;
      spawnHearts(nx, ny);
      hudBones.textContent = String(state.bonesEaten);
      hudScore.textContent = String(state.score);
      if (state.bonesEaten >= state.level.bonesToWin) {
        // include all body cells as occupied before level complete animation
        return levelComplete();
      }
      state.bone = spawnBone();
    } else {
      state.dog.pop();
    }
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (state.running && !state.paused && !state.over) {
      if (!state.lastTick) state.lastTick = ts;
      if (ts - state.lastTick >= state.tickMs) {
        state.lastTick = ts;
        step();
      }
    }
    state.eatPulse = Math.max(0, state.eatPulse - 0.03);
    updateParticles(ts);
    maybeBlink(ts);
    draw(ts);
  }

  // ---------- Particles ----------
  function spawnHearts(gx, gy) {
    const cx = gx * CELL + CELL / 2;
    const cy = gy * CELL + CELL / 2;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const speed = 0.6 + Math.random() * 0.8;
      state.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 1,
        size: 7 + Math.random() * 6,
        color: Math.random() < 0.5 ? '#ff6a8a' : '#ffb347',
        kind: Math.random() < 0.7 ? 'heart' : 'star',
      });
    }
  }

  function updateParticles(ts) {
    const dt = 1; // frame units
    for (const p of state.particles) {
      p.x += p.vx * dt * 2;
      p.y += p.vy * dt * 2;
      p.vy += 0.04; // gravity-ish (hearts float up then drift)
      p.life -= 0.018;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.scale(p.life, p.life);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      if (p.kind === 'heart') drawHeartShape(p.size);
      else drawStarShape(p.size);
      ctx.restore();
    }
  }

  function drawHeartShape(s) {
    const k = s / 12;
    ctx.beginPath();
    ctx.moveTo(0, 4 * k);
    ctx.bezierCurveTo(-6 * k, -1 * k, -6 * k, -7 * k, 0, -3 * k);
    ctx.bezierCurveTo(6 * k, -7 * k, 6 * k, -1 * k, 0, 4 * k);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawStarShape(s) {
    const spikes = 5;
    const outer = s * 0.5;
    const inner = s * 0.22;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = (i % 2 === 0) ? outer : inner;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ---------- Blinking ----------
  function maybeBlink(ts) {
    if (!state.nextBlinkAt) state.nextBlinkAt = ts + 3000 + Math.random() * 4000;
    if (ts >= state.nextBlinkAt && ts > state.blinkUntil) {
      state.blinkUntil = ts + 140;
      state.nextBlinkAt = ts + 3000 + Math.random() * 4000;
    }
  }
  function isBlinking(ts) { return ts < state.blinkUntil; }

  // ---------- Rendering ----------
  function draw(ts) {
    // Grass checker
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#8ec76a' : '#86bf62';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    // Obstacles
    if (state.level) {
      for (const p of state.level.obstacles) drawObstacle(p.x, p.y);
    }

    // Bone
    if (state.bone) drawBone(state.bone.x, state.bone.y, ts);

    // Dog
    drawDog(ts || 0);

    // Particles on top
    drawParticles();
  }

  function drawObstacle(gx, gy) {
    const x = gx * CELL;
    const y = gy * CELL;
    // Wooden-stone block look
    const g = ctx.createLinearGradient(x, y, x, y + CELL);
    g.addColorStop(0, '#6b4c2a');
    g.addColorStop(1, '#3d2a14');
    ctx.fillStyle = g;
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
    // Highlight edge
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + 3, y + 3, CELL - 6, 3);
    // Inner outline
    ctx.strokeStyle = '#1d1208';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
    // Rivets
    ctx.fillStyle = '#c8a463';
    dot(x + 6, y + 6, 2);
    dot(x + CELL - 6, y + 6, 2);
    dot(x + 6, y + CELL - 6, 2);
    dot(x + CELL - 6, y + CELL - 6, 2);
  }
  function dot(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBone(gx, gy, ts) {
    const cx = gx * CELL + CELL / 2;
    const cy = gy * CELL + CELL / 2 + Math.sin((ts || 0) * 0.005) * 1.2;
    const w = CELL * 0.78;
    const h = CELL * 0.38;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 6);

    const r = h / 2;
    ctx.fillStyle = '#fff8e0';
    ctx.strokeStyle = '#8b7a4a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.rect(-w / 2 + r, -h / 2, w - 2 * r, h);
    ctx.fill();

    knob(-w / 2, -h / 2, r);
    knob(-w / 2, h / 2, r);
    knob(w / 2, -h / 2, r);
    knob(w / 2, h / 2, r);

    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.moveTo(-w / 2 + r, h / 2);
    ctx.lineTo(w / 2 - r, h / 2);
    ctx.stroke();
    ctx.restore();
  }
  function knob(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawDog(ts) {
    const body = state.dog;
    if (body.length === 0) return;

    // Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < body.length; i++) {
      const p = body[i];
      ctx.beginPath();
      ctx.ellipse(p.x * CELL + CELL / 2, p.y * CELL + CELL * 0.82, CELL * 0.40, CELL * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (let i = body.length - 1; i >= 1; i--) {
      drawBodySegment(body[i], i, body.length, ts);
    }
    drawHead(body[0], ts);
  }

  function segIn(index) {
    const prev = state.dog[index - 1];
    const cur = state.dog[index];
    return prev ? { x: prev.x - cur.x, y: prev.y - cur.y } : state.dir;
  }

  function drawBodySegment(p, index, total, ts) {
    const isTail = index === total - 1;
    const inDir = segIn(index);
    const horizontal = inDir.x !== 0;

    const cx = p.x * CELL + CELL / 2;
    // Hopping gait: body bobs up/down per segment
    const moving = (state.running && !state.paused) ? 1 : 0;
    const bob = moving ? Math.sin((ts || 0) * 0.012 + index * 0.7) * 1.4 : 0;
    const cy = p.y * CELL + CELL / 2 + bob;

    ctx.save();
    ctx.translate(cx, cy);
    if (!horizontal) ctx.rotate(Math.PI / 2);

    const w = CELL * 1.02;
    const h = CELL * 0.64;

    // Belly (light tan pill beneath the saddle)
    roundRect(-w / 2, -h / 2, w, h, h / 2);
    const bellyGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    bellyGrad.addColorStop(0, '#c9914c');
    bellyGrad.addColorStop(1, '#8a5a22');
    ctx.fillStyle = bellyGrad;
    ctx.fill();
    ctx.strokeStyle = '#4d2e10';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Saddle (dark chocolate patch on top = classic black-and-tan dachshund)
    ctx.save();
    ctx.beginPath();
    roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.clip();
    const saddleGrad = ctx.createLinearGradient(0, -h / 2, 0, 0);
    saddleGrad.addColorStop(0, '#2a1608');
    saddleGrad.addColorStop(1, '#5a3412');
    ctx.fillStyle = saddleGrad;
    // saddle covers top portion and tapers at the ends
    const sx = -w / 2 + 4;
    const sw = w - 8;
    const sh = h * 0.55;
    roundRect(sx, -h / 2 + 1, sw, sh, sh * 0.5);
    ctx.fill();
    ctx.restore();

    // Subtle body outline again on top
    roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.strokeStyle = '#3d230b';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (!isTail && index % 2 === 1) drawLegs(h, ts, index);
    if (isTail) drawTail(w, h, ts);
    ctx.restore();
  }

  function drawLegs(bodyH, ts, index) {
    const speed = (state.running && !state.paused) ? 1 : 0;
    // Running animation: alternate legs up/down
    const phase = Math.sin((ts || 0) * 0.022 + index * 0.9) * 3 * speed;
    ctx.save();
    ctx.fillStyle = '#4a2a10';
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 1.5;
    const legW = CELL * 0.18;
    const legH = CELL * 0.28;
    const y = bodyH / 2 - 2;

    // Left leg
    roundRect(-CELL * 0.28 - legW / 2, y + phase, legW, legH, 3);
    ctx.fill(); ctx.stroke();
    // Right leg (opposite phase)
    roundRect(CELL * 0.28 - legW / 2, y - phase, legW, legH, 3);
    ctx.fill(); ctx.stroke();

    // Paw shadows
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(-CELL * 0.28, y + legH + phase + 1, legW * 0.7, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(CELL * 0.28, y + legH - phase + 1, legW * 0.7, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pink paw pads (bottom of each paw)
    ctx.fillStyle = '#ff9eb0';
    ctx.strokeStyle = '#c06a7a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(-CELL * 0.28, y + legH - 1 + phase, legW * 0.45, 2.2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(CELL * 0.28, y + legH - 1 - phase, legW * 0.45, 2.2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawTail(w, h, ts) {
    // Very happy wagging tail: big swing when running, extra wag on eat
    const speed = (state.running && !state.paused) ? 1 : 0.25;
    const wagAmount = 0.65 + state.eatPulse * 1.2;
    const wagFreq = 0.028 + state.eatPulse * 0.02;
    const wag = Math.sin((ts || 0) * wagFreq) * wagAmount * speed;
    const baseX = -w / 2 + 2;
    ctx.save();
    ctx.translate(baseX, 0);
    ctx.rotate(wag);

    ctx.fillStyle = '#5a3412';
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 2;
    // Curved tail body
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.22);
    ctx.quadraticCurveTo(-CELL * 0.38, -h * 0.52, -CELL * 0.48, -h * 0.05);
    ctx.quadraticCurveTo(-CELL * 0.32, h * 0.22, 0, h * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tail tip fluff (tan underside visible)
    ctx.fillStyle = '#c9914c';
    ctx.beginPath();
    ctx.ellipse(-CELL * 0.44, h * 0.02, CELL * 0.08, CELL * 0.06, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Motion lines while wagging hard
    if (Math.abs(wag) > 0.4 && speed > 0.5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-CELL * 0.55, -h * 0.05);
      ctx.lineTo(-CELL * 0.70, -h * 0.20);
      ctx.moveTo(-CELL * 0.55, h * 0.05);
      ctx.lineTo(-CELL * 0.70, h * 0.20);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHead(p, ts) {
    const d = state.dir;
    const cx = p.x * CELL + CELL / 2;
    // Head also bobs with gait
    const moving = (state.running && !state.paused) ? 1 : 0;
    const headBob = moving ? Math.sin((ts || 0) * 0.012) * 1.2 : 0;
    const cy = p.y * CELL + CELL / 2 + headBob;

    ctx.save();
    ctx.translate(cx, cy);
    const angle = Math.atan2(d.y, d.x);
    ctx.rotate(angle);

    const headW = CELL * 1.1;
    const headH = CELL * 0.76;

    // Floppy ears flap more while running, big bounce on eat
    const earFreq = 0.02 + state.eatPulse * 0.015;
    const earWag = Math.sin((ts || 0) * earFreq) * (0.12 + state.eatPulse * 0.15) * moving;

    // Top ear
    ctx.fillStyle = '#2a1608';
    ctx.strokeStyle = '#140a04';
    ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(-headW * 0.1, -headH * 0.38);
    ctx.rotate(-0.45 + earWag);
    ctx.beginPath();
    ctx.ellipse(0, CELL * 0.26, CELL * 0.19, CELL * 0.38, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Inner ear (pink)
    ctx.fillStyle = '#e89a9c';
    ctx.beginPath();
    ctx.ellipse(0, CELL * 0.3, CELL * 0.08, CELL * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bottom ear
    ctx.fillStyle = '#2a1608';
    ctx.save();
    ctx.translate(-headW * 0.1, headH * 0.38);
    ctx.rotate(0.45 - earWag);
    ctx.beginPath();
    ctx.ellipse(0, -CELL * 0.26, CELL * 0.19, CELL * 0.38, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e89a9c';
    ctx.beginPath();
    ctx.ellipse(0, -CELL * 0.3, CELL * 0.08, CELL * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Head base (tan)
    const gradH = ctx.createLinearGradient(0, -headH / 2, 0, headH / 2);
    gradH.addColorStop(0, '#c9914c');
    gradH.addColorStop(1, '#8a5a22');
    ctx.fillStyle = gradH;
    ctx.strokeStyle = '#3d230b';
    ctx.lineWidth = 2;
    roundRect(-headW * 0.45, -headH / 2, headW * 0.75, headH, headH / 2);
    ctx.fill(); ctx.stroke();

    // Dark forehead patch (saddle continues onto head)
    ctx.save();
    ctx.beginPath();
    roundRect(-headW * 0.45, -headH / 2, headW * 0.75, headH, headH / 2);
    ctx.clip();
    ctx.fillStyle = '#2a1608';
    ctx.beginPath();
    ctx.ellipse(-headW * 0.18, -headH * 0.28, headW * 0.3, headH * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Snout (slightly lighter tan)
    const snoutW = CELL * 0.58;
    const snoutH = CELL * 0.44;
    ctx.fillStyle = '#d9a560';
    ctx.strokeStyle = '#3d230b';
    ctx.lineWidth = 2;
    roundRect(headW * 0.08, -snoutH / 2, snoutW, snoutH, snoutH / 2);
    ctx.fill(); ctx.stroke();

    // Blush / pink cheeks on snout base
    ctx.fillStyle = 'rgba(255, 120, 140, 0.55)';
    ctx.beginPath();
    ctx.ellipse(headW * 0.18, -snoutH * 0.18, CELL * 0.1, CELL * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headW * 0.18, snoutH * 0.18, CELL * 0.1, CELL * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose (bigger, shinier)
    ctx.fillStyle = '#1a0f06';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(headW * 0.08 + snoutW - 2, 0, CELL * 0.12, CELL * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose big highlight
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(headW * 0.08 + snoutW - 4, -CELL * 0.035, CELL * 0.04, CELL * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose small highlight
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(headW * 0.08 + snoutW - 1, CELL * 0.025, CELL * 0.015, CELL * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth smile
    ctx.strokeStyle = '#3d230b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(headW * 0.08 + snoutW * 0.2, snoutH * 0.32);
    ctx.quadraticCurveTo(headW * 0.08 + snoutW * 0.55, snoutH * 0.58, headW * 0.08 + snoutW * 0.88, snoutH * 0.28);
    ctx.stroke();

    // Tongue (drops out when happy/running, extra long on eat)
    const tongueOut = moving * 0.6 + state.eatPulse * 0.6 + Math.max(0, Math.sin((ts || 0) * 0.004)) * 0.15;
    if (tongueOut > 0.1) {
      const tongueLen = CELL * 0.18 * tongueOut;
      const tongueW = CELL * 0.08;
      const tx = headW * 0.08 + snoutW * 0.62;
      const ty = snoutH * 0.45;
      ctx.fillStyle = '#f36a86';
      ctx.strokeStyle = '#b84060';
      ctx.lineWidth = 1.2;
      ctx.save();
      ctx.translate(tx, ty);
      // tongue with a midline fold
      roundRect(-tongueW / 2, 0, tongueW, tongueLen, tongueW * 0.5);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#b84060';
      ctx.beginPath();
      ctx.moveTo(0, tongueLen * 0.2);
      ctx.lineTo(0, tongueLen * 0.95);
      ctx.stroke();
      ctx.restore();
    }

    // Big puppy eye
    drawPuppyEye(headW * 0.02, -headH * 0.14, CELL * 0.21, ts);

    // Little eyebrow dot for expressive look (the head saddle hides most of this)
    ctx.fillStyle = 'rgba(42,22,8,0.6)';
    ctx.beginPath();
    ctx.ellipse(headW * 0.05, -headH * 0.32, CELL * 0.07, CELL * 0.03, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawPuppyEye(x, y, r, ts) {
    ctx.save();
    ctx.translate(x, y);

    const blinking = isBlinking(ts);

    if (blinking) {
      // Closed eye: curved line with lashes
      ctx.strokeStyle = '#1a0f06';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, 0);
      ctx.quadraticCurveTo(0, r * 0.55, r * 1.05, 0);
      ctx.stroke();
      // Closed lashes (sweeping down)
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, r * 0.08);
      ctx.lineTo(-r * 0.75, r * 0.4);
      ctx.moveTo(-r * 0.1, r * 0.32);
      ctx.lineTo(-r * 0.15, r * 0.7);
      ctx.moveTo(r * 0.3, r * 0.28);
      ctx.lineTo(r * 0.45, r * 0.6);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Outer eye (bigger for puppy look)
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 1.3, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Iris (warm brown with gradient for depth)
    const irisGrad = ctx.createRadialGradient(-r * 0.15, -r * 0.2, r * 0.1, r * 0.1, 0, r * 0.9);
    irisGrad.addColorStop(0, '#8b5a2b');
    irisGrad.addColorStop(0.6, '#5a3412');
    irisGrad.addColorStop(1, '#2a1608');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(r * 0.1, r * 0.08, r * 0.82, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil (large for cute proportions)
    ctx.fillStyle = '#0a0604';
    ctx.beginPath();
    ctx.ellipse(r * 0.2, r * 0.12, r * 0.44, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Big starry highlight (the iconic puppy-eye gleam)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, -r * 0.38, r * 0.38, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Medium highlight
    ctx.beginPath();
    ctx.ellipse(r * 0.35, -r * 0.08, r * 0.16, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tiny sparkle
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.4, r * 0.3, r * 0.08, r * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Upper eyelid shadow (gives the "looking up" puppy-dog look)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 1.3, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(42,22,8,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, -r * 1.0, r * 1.6, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Long curled eyelashes on top (4-5 lashes)
    ctx.strokeStyle = '#1a0f06';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const lashes = [
      { x: -r * 0.55, angle: -0.5, len: r * 0.55 },
      { x: -r * 0.25, angle: -0.2, len: r * 0.6 },
      { x:  r * 0.05, angle:  0.0, len: r * 0.65 },
      { x:  r * 0.4,  angle:  0.25, len: r * 0.55 },
      { x:  r * 0.7,  angle:  0.5, len: r * 0.45 },
    ];
    const lashY = -r * 1.25;
    for (const L of lashes) {
      ctx.beginPath();
      ctx.moveTo(L.x, lashY);
      ctx.quadraticCurveTo(
        L.x + Math.sin(L.angle) * L.len * 0.5,
        lashY - L.len * 0.35,
        L.x + Math.sin(L.angle) * L.len,
        lashY - L.len * 0.75
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  // ---------- Boot ----------
  // Idle scene behind the main menu: show level 1 preview
  state.level = LEVELS[0];
  state.obstaclesSet = new Set(state.level.obstacles.map(p => p.x + ',' + p.y));
  state.dog = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  state.bone = spawnBone();

  refreshMenu();
  draw(0);
  requestAnimationFrame(loop);
})();
