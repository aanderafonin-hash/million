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
    const s = findSafeStart(state.obstaclesSet);
    state.dog = [
      { x: s.x, y: s.y },
      { x: s.x - s.dir.x, y: s.y - s.dir.y },
      { x: s.x - 2 * s.dir.x, y: s.y - 2 * s.dir.y },
    ];
    state.dir = s.dir;
    state.pendingDir = s.dir;
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
    // Find a safe starting area: 3-cell body + 4-cell runway ahead
    const start = findSafeStart(state.obstaclesSet);
    state.dog = [
      { x: start.x, y: start.y },
      { x: start.x - start.dir.x, y: start.y - start.dir.y },
      { x: start.x - 2 * start.dir.x, y: start.y - 2 * start.dir.y },
    ];
    state.dir = start.dir;
    state.pendingDir = start.dir;
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

  function findSafeStart(obstacles) {
    // Try rows near the center first, then spiral outward
    const rowOrder = [10, 11, 9, 12, 8, 13, 7, 14, 6, 15, 5, 16, 4, 17, 3, 18, 2, 1];
    const dirs = [DIR.RIGHT, DIR.LEFT, DIR.DOWN, DIR.UP];
    for (const y of rowOrder) {
      for (const dir of dirs) {
        // For horizontal direction, scan across rows; for vertical, scan across cols
        if (dir.y === 0) {
          // horizontal: body at (x-2*d, y), (x-d, y), (x, y); runway needs (x+d, y), (x+2*d, y), (x+3*d, y) free
          const xs = dir.x > 0 ? [7, 8, 6, 9, 5, 10, 4, 11, 3, 12, 2, 13] : [12, 11, 13, 10, 14, 9, 15, 8, 16, 7, 17, 6];
          for (const x of xs) {
            if (cellsFree([
              { x, y },
              { x: x - dir.x, y },
              { x: x - 2 * dir.x, y },
              { x: x + dir.x, y },
              { x: x + 2 * dir.x, y },
              { x: x + 3 * dir.x, y },
            ], obstacles)) return { x, y, dir };
          }
        } else {
          const xs = [10, 11, 9, 12, 8, 13, 7, 14, 6, 15, 5, 16];
          for (const x of xs) {
            if (cellsFree([
              { x, y },
              { x, y: y - dir.y },
              { x, y: y - 2 * dir.y },
              { x, y: y + dir.y },
              { x, y: y + 2 * dir.y },
              { x, y: y + 3 * dir.y },
            ], obstacles)) return { x, y, dir };
          }
        }
      }
    }
    // Fallback: minimal check row 10 facing right
    return { x: 3, y: 10, dir: DIR.RIGHT };
  }

  function cellsFree(cells, obstacles) {
    for (const c of cells) {
      if (c.x < 0 || c.y < 0 || c.x >= GRID || c.y >= GRID) return false;
      if (obstacles.has(c.x + ',' + c.y)) return false;
    }
    return true;
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
      // Speed boost: each bone accelerates the dachshund (with a sane minimum)
      const minTick = Math.max(60, state.level.tickMs * 0.45);
      state.tickMs = Math.max(minTick, state.tickMs - 5);
      hudBones.textContent = String(state.bonesEaten);
      hudScore.textContent = String(state.score);
      if (state.bonesEaten >= state.level.bonesToWin) {
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
  function isMenuShown() {
    return overlays.menu && !overlays.menu.classList.contains('hidden');
  }

  function draw(ts) {
    // On the main menu, replace the gameplay scene with the cartoon mascot
    if (isMenuShown()) {
      drawMenuBackground(ts);
      drawMenuMascot(ts);
      return;
    }

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

  // ---------- Main menu cartoon mascot ----------
  function drawMenuBackground(ts) {
    // Soft sky-to-meadow gradient
    const W = canvas.width, H = canvas.height;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#fde8b5');
    sky.addColorStop(0.55, '#ffd789');
    sky.addColorStop(0.56, '#9bd66a');
    sky.addColorStop(1, '#5fa64a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Distant sun
    ctx.fillStyle = 'rgba(255, 240, 180, 0.85)';
    ctx.beginPath();
    ctx.ellipse(W * 0.78, H * 0.20, 60, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 220, 130, 0.55)';
    ctx.beginPath();
    ctx.ellipse(W * 0.78, H * 0.20, 90, 90, 0, 0, Math.PI * 2);
    ctx.fill();

    // Floating bones — tiny ambient decoration
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 137 + ts * 0.02) % (W + 80)) - 40;
      const by = 70 + i * 28 + Math.sin(ts * 0.001 + i) * 6;
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(0.45, 0.45);
      drawBoneShape();
      ctx.restore();
    }

    // Grass-line silhouettes near the horizon
    ctx.fillStyle = 'rgba(60, 110, 50, 0.5)';
    for (let i = 0; i < 14; i++) {
      const gx = (i * 47) % W;
      const gh = 8 + (i * 13) % 14;
      ctx.beginPath();
      ctx.moveTo(gx, H * 0.56);
      ctx.lineTo(gx + 6, H * 0.56 - gh);
      ctx.lineTo(gx + 12, H * 0.56);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBoneShape() {
    // Stylized cartoon bone for ambient menu decor
    ctx.fillStyle = '#fff8e1';
    ctx.strokeStyle = '#7a5a32';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(-22, -10, 12, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(-22, 10, 12, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(22, -10, 12, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(22, 10, 12, 11, 0, 0, Math.PI * 2);
    ctx.fillRect(-22, -8, 44, 16);
    ctx.fill();
    ctx.stroke();
  }

  function drawMenuMascot(ts) {
    const W = canvas.width, H = canvas.height;
    // Position the puppy in the upper portion so it sits above the bottom panel.
    const cx = W / 2;
    const cy = H * 0.34;

    // Subtle idle bob and gentle ear sway
    const bob = Math.sin(ts * 0.0022) * 4;
    const earSway = Math.sin(ts * 0.0018) * 0.06;

    // Ground shadow under the puppy
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 215, 165, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy + bob);

    // ---------- Body / chest behind paws ----------
    // The body bulges out beneath the head; in this front-on cartoon view we
    // only see the upper torso and the two front paws.
    ctx.fillStyle = '#1a1108';
    ctx.strokeStyle = '#0a0604';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 200, 175, 90, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tan chest patch
    ctx.fillStyle = '#a86a2c';
    ctx.beginPath();
    ctx.ellipse(0, 230, 75, 38, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---------- Front paws ----------
    drawMenuPaw(-78, 240);
    drawMenuPaw(78, 240);

    // ---------- Long floppy ears (drawn first so head sits over them) ----------
    drawMenuEar(-108, -20, -0.45 + earSway, false);
    drawMenuEar(108, -20, 0.45 - earSway, true);

    // ---------- Head ----------
    // Skull (rounded, slightly wider on top, narrower toward muzzle)
    ctx.fillStyle = '#1a1108';
    ctx.strokeStyle = '#0a0604';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-110, -10);
    ctx.bezierCurveTo(-118, -110, -50, -150, 0, -148);
    ctx.bezierCurveTo(50, -150, 118, -110, 110, -10);
    ctx.bezierCurveTo(108, 30, 90, 70, 60, 90);
    ctx.bezierCurveTo(40, 110, -40, 110, -60, 90);
    ctx.bezierCurveTo(-90, 70, -108, 30, -110, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle highlight on forehead
    const headGrad = ctx.createRadialGradient(-22, -90, 8, -10, -70, 70);
    headGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
    headGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(-22, -82, 38, 24, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // ---------- Tan eyebrow dots (classic black-and-tan markings) ----------
    ctx.fillStyle = '#a86a2c';
    ctx.beginPath();
    ctx.ellipse(-32, -52, 11, 7, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(32, -52, 11, 7, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // ---------- Big shiny puppy eyes ----------
    drawPuppyEye(-42, -22, ts);
    drawPuppyEye(42, -22, ts);

    // ---------- Muzzle / snout ----------
    // Tan around the snout (cheeks merging into muzzle)
    ctx.fillStyle = '#a86a2c';
    ctx.beginPath();
    ctx.ellipse(0, 50, 78, 56, 0, 0, Math.PI * 2);
    ctx.fill();

    // Black upper muzzle ridge
    ctx.fillStyle = '#1a1108';
    ctx.beginPath();
    ctx.moveTo(-58, 28);
    ctx.bezierCurveTo(-44, 6, 44, 6, 58, 28);
    ctx.bezierCurveTo(50, 50, -50, 50, -58, 28);
    ctx.closePath();
    ctx.fill();

    // Nose
    ctx.fillStyle = '#0a0604';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 24, 22, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Nose highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-7, 17, 6, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Nostrils
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(-7, 30, 2.5, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(7, 30, 2.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth — gentle curved smile under the nose
    ctx.strokeStyle = '#1a1108';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 46);
    ctx.lineTo(0, 58);
    ctx.moveTo(0, 58);
    ctx.quadraticCurveTo(-12, 70, -22, 64);
    ctx.moveTo(0, 58);
    ctx.quadraticCurveTo(12, 70, 22, 64);
    ctx.stroke();

    // Whiskers — light cream so they pop against the dark muzzle
    ctx.strokeStyle = 'rgba(255, 240, 210, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-26, 36); ctx.quadraticCurveTo(-55, 30, -82, 22);
    ctx.moveTo(-26, 44); ctx.quadraticCurveTo(-58, 46, -86, 48);
    ctx.moveTo(-26, 52); ctx.quadraticCurveTo(-58, 60, -82, 70);
    ctx.moveTo(26, 36);  ctx.quadraticCurveTo(55, 30, 82, 22);
    ctx.moveTo(26, 44);  ctx.quadraticCurveTo(58, 46, 86, 48);
    ctx.moveTo(26, 52);  ctx.quadraticCurveTo(58, 60, 82, 70);
    ctx.stroke();

    ctx.restore();
  }

  function drawMenuEar(rootX, rootY, baseAngle, mirror) {
    ctx.save();
    ctx.translate(rootX, rootY);
    ctx.rotate(baseAngle);
    if (mirror) ctx.scale(-1, 1);

    // Outer ear — very long teardrop hanging well below the head
    ctx.fillStyle = '#100a06';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.bezierCurveTo(-30, 40, -56, 150, -42, 220);
    ctx.bezierCurveTo(-18, 252, 38, 250, 52, 220);
    ctx.bezierCurveTo(56, 140, 36, 40, 14, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner-ear warm tan tint near the base
    ctx.fillStyle = 'rgba(168,106,44,0.55)';
    ctx.beginPath();
    ctx.ellipse(2, 36, 16, 32, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Subtle gloss on the front of the ear
    const gloss = ctx.createLinearGradient(-10, 0, 40, 220);
    gloss.addColorStop(0, 'rgba(255,255,255,0.22)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.bezierCurveTo(-30, 40, -56, 150, -42, 220);
    ctx.bezierCurveTo(-18, 252, 38, 250, 52, 220);
    ctx.bezierCurveTo(56, 140, 36, 40, 14, -10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawMenuPaw(x, y) {
    ctx.save();
    ctx.translate(x, y);
    // Black upper paw
    ctx.fillStyle = '#1a1108';
    ctx.strokeStyle = '#0a0604';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -8, 36, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Tan toes
    ctx.fillStyle = '#a86a2c';
    for (const dx of [-18, 0, 18]) {
      ctx.beginPath();
      ctx.ellipse(dx, 12, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Claws
    ctx.fillStyle = '#1a1108';
    for (const dx of [-22, -3, 16]) {
      ctx.beginPath();
      ctx.ellipse(dx + 3, 22, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPuppyEye(ex, ey, ts) {
    const blinking = isBlinking(ts);
    ctx.save();
    ctx.translate(ex, ey);

    if (blinking) {
      ctx.strokeStyle = '#1a1108';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.quadraticCurveTo(0, 16, 26, 0);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Big shiny eyeball — almost circular, slightly oval
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#1a1108';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Iris — warm dark brown / amber
    const iris = ctx.createRadialGradient(-4, -6, 4, 0, 0, 26);
    iris.addColorStop(0, '#7a4a1e');
    iris.addColorStop(0.55, '#3a1f0a');
    iris.addColorStop(1, '#0c0604');
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.ellipse(0, 2, 22, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 4, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Big highlight (top-left)
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(-7, -8, 8, 10, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Smaller highlight (bottom-right)
    ctx.beginPath();
    ctx.ellipse(8, 9, 3.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  const INTERIOR_TYPES = ['toilet', 'sofa', 'table', 'armchair', 'slipper', 'boot', 'stool', 'nightstand', 'lamp', 'rug', 'bookshelf', 'tv'];

  function drawObstacle(gx, gy) {
    const x = gx * CELL;
    const y = gy * CELL;
    // Deterministic per-cell interior item
    const hashK = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
    const kind = INTERIOR_TYPES[hashK % INTERIOR_TYPES.length];

    // Soft shadow under every item
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + CELL / 2, y + CELL - 3, CELL * 0.36, CELL * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    try {
      switch (kind) {
        case 'toilet': drawToilet(); break;
        case 'sofa': drawSofa(); break;
        case 'table': drawTable(); break;
        case 'armchair': drawArmchair(); break;
        case 'slipper': drawSlipper(); break;
        case 'boot': drawBoot(); break;
        case 'stool': drawStool(); break;
        case 'nightstand': drawNightstand(); break;
        case 'lamp': drawLamp(); break;
        case 'rug': drawRug(); break;
        case 'bookshelf': drawBookshelf(); break;
        case 'tv': drawTv(); break;
        default: drawFallbackBlock(); break;
      }
    } catch (e) {
      // Fallback: if an interior item draw throws, render a wooden block so the obstacle is still visible
      drawFallbackBlock();
    }
    ctx.restore();
  }

  function drawFallbackBlock() {
    const g = ctx.createLinearGradient(0, 0, 0, CELL);
    g.addColorStop(0, '#6b4c2a');
    g.addColorStop(1, '#3d2a14');
    ctx.fillStyle = g;
    ctx.fillRect(1, 1, CELL - 2, CELL - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(3, 3, CELL - 6, 3);
    ctx.strokeStyle = '#1d1208';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CELL - 2, CELL - 2);
  }

  function dot(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Interior items (drawn in a CELL×CELL cell with origin at 0,0) ----

  function drawToilet() {
    // Tank at top, bowl at bottom
    ctx.fillStyle = '#f2f2f0';
    ctx.strokeStyle = '#6a6a68';
    ctx.lineWidth = 1.4;
    // tank
    roundRect(CELL * 0.18, CELL * 0.08, CELL * 0.64, CELL * 0.32, 3);
    ctx.fill(); ctx.stroke();
    // seat/bowl
    ctx.beginPath();
    ctx.ellipse(CELL * 0.5, CELL * 0.66, CELL * 0.34, CELL * 0.26, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // inner water
    ctx.fillStyle = '#cde6f2';
    ctx.beginPath();
    ctx.ellipse(CELL * 0.5, CELL * 0.66, CELL * 0.22, CELL * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    // flush button
    ctx.fillStyle = '#bbb';
    ctx.fillRect(CELL * 0.44, CELL * 0.14, CELL * 0.12, CELL * 0.04);
  }

  function drawSofa() {
    // Plush sofa with 2 cushions
    ctx.fillStyle = '#8a3a3a';
    ctx.strokeStyle = '#4a1c1c';
    ctx.lineWidth = 1.4;
    // backrest
    roundRect(CELL * 0.06, CELL * 0.18, CELL * 0.88, CELL * 0.24, 5);
    ctx.fill(); ctx.stroke();
    // seat
    roundRect(CELL * 0.06, CELL * 0.45, CELL * 0.88, CELL * 0.35, 5);
    ctx.fill(); ctx.stroke();
    // arms
    roundRect(CELL * 0.02, CELL * 0.36, CELL * 0.12, CELL * 0.48, 4);
    ctx.fill(); ctx.stroke();
    roundRect(CELL * 0.86, CELL * 0.36, CELL * 0.12, CELL * 0.48, 4);
    ctx.fill(); ctx.stroke();
    // cushion divider
    ctx.strokeStyle = '#4a1c1c';
    ctx.beginPath();
    ctx.moveTo(CELL * 0.5, CELL * 0.48);
    ctx.lineTo(CELL * 0.5, CELL * 0.78);
    ctx.stroke();
    // feet
    ctx.fillStyle = '#2a1608';
    ctx.fillRect(CELL * 0.1, CELL * 0.83, CELL * 0.06, CELL * 0.08);
    ctx.fillRect(CELL * 0.84, CELL * 0.83, CELL * 0.06, CELL * 0.08);
  }

  function drawTable() {
    // Wooden table viewed top-down-ish
    ctx.fillStyle = '#8b5a2b';
    ctx.strokeStyle = '#3d230b';
    ctx.lineWidth = 1.4;
    roundRect(CELL * 0.08, CELL * 0.22, CELL * 0.84, CELL * 0.4, 4);
    ctx.fill(); ctx.stroke();
    // wood grain
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CELL * 0.15, CELL * 0.35); ctx.lineTo(CELL * 0.85, CELL * 0.35);
    ctx.moveTo(CELL * 0.15, CELL * 0.48); ctx.lineTo(CELL * 0.85, CELL * 0.48);
    ctx.stroke();
    // legs
    ctx.fillStyle = '#5a3412';
    ctx.fillRect(CELL * 0.12, CELL * 0.6, CELL * 0.08, CELL * 0.32);
    ctx.fillRect(CELL * 0.80, CELL * 0.6, CELL * 0.08, CELL * 0.32);
  }

  function drawArmchair() {
    // Cozy padded armchair
    ctx.fillStyle = '#4a6a3a';
    ctx.strokeStyle = '#233320';
    ctx.lineWidth = 1.4;
    // backrest
    roundRect(CELL * 0.15, CELL * 0.1, CELL * 0.7, CELL * 0.45, 8);
    ctx.fill(); ctx.stroke();
    // seat
    roundRect(CELL * 0.15, CELL * 0.45, CELL * 0.7, CELL * 0.3, 4);
    ctx.fill(); ctx.stroke();
    // arms
    roundRect(CELL * 0.04, CELL * 0.38, CELL * 0.16, CELL * 0.4, 4);
    ctx.fill(); ctx.stroke();
    roundRect(CELL * 0.8, CELL * 0.38, CELL * 0.16, CELL * 0.4, 4);
    ctx.fill(); ctx.stroke();
    // seat cushion highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.moveTo(CELL * 0.2, CELL * 0.5); ctx.lineTo(CELL * 0.8, CELL * 0.5);
    ctx.stroke();
    // legs
    ctx.fillStyle = '#2a1608';
    ctx.fillRect(CELL * 0.18, CELL * 0.78, CELL * 0.06, CELL * 0.12);
    ctx.fillRect(CELL * 0.76, CELL * 0.78, CELL * 0.06, CELL * 0.12);
  }

  function drawSlipper() {
    // Fuzzy slipper (pink)
    ctx.fillStyle = '#f28bb0';
    ctx.strokeStyle = '#a84a6a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    // sole
    ctx.ellipse(CELL * 0.5, CELL * 0.7, CELL * 0.38, CELL * 0.16, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // upper cover
    ctx.beginPath();
    ctx.moveTo(CELL * 0.12, CELL * 0.7);
    ctx.quadraticCurveTo(CELL * 0.3, CELL * 0.25, CELL * 0.58, CELL * 0.35);
    ctx.quadraticCurveTo(CELL * 0.85, CELL * 0.45, CELL * 0.88, CELL * 0.7);
    ctx.closePath();
    ctx.fillStyle = '#ffc0cb';
    ctx.fill(); ctx.stroke();
    // fluffy fur trim
    ctx.fillStyle = '#ffe0ea';
    for (let i = 0; i < 8; i++) {
      const fx = CELL * (0.2 + i * 0.08);
      ctx.beginPath();
      ctx.arc(fx, CELL * (0.45 + Math.sin(i) * 0.04), CELL * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBoot() {
    // Tall leather boot
    ctx.fillStyle = '#5a3412';
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(CELL * 0.3, CELL * 0.12);
    ctx.lineTo(CELL * 0.62, CELL * 0.12);
    ctx.lineTo(CELL * 0.62, CELL * 0.55);
    ctx.lineTo(CELL * 0.88, CELL * 0.55);
    ctx.quadraticCurveTo(CELL * 0.92, CELL * 0.82, CELL * 0.85, CELL * 0.85);
    ctx.lineTo(CELL * 0.18, CELL * 0.85);
    ctx.quadraticCurveTo(CELL * 0.14, CELL * 0.82, CELL * 0.18, CELL * 0.75);
    ctx.lineTo(CELL * 0.3, CELL * 0.65);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // laces
    ctx.strokeStyle = '#c8a463';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const ly = CELL * (0.2 + i * 0.09);
      ctx.beginPath();
      ctx.moveTo(CELL * 0.32, ly); ctx.lineTo(CELL * 0.6, ly + CELL * 0.03);
      ctx.stroke();
    }
    // sole
    ctx.fillStyle = '#1a0f06';
    ctx.fillRect(CELL * 0.18, CELL * 0.82, CELL * 0.7, CELL * 0.07);
  }

  function drawStool() {
    // Wooden stool: round seat + legs
    ctx.fillStyle = '#8b5a2b';
    ctx.strokeStyle = '#3d230b';
    ctx.lineWidth = 1.4;
    // seat
    ctx.beginPath();
    ctx.ellipse(CELL * 0.5, CELL * 0.35, CELL * 0.32, CELL * 0.1, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // legs (4 visible splay)
    ctx.strokeStyle = '#5a3412';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CELL * 0.28, CELL * 0.38); ctx.lineTo(CELL * 0.2, CELL * 0.85);
    ctx.moveTo(CELL * 0.45, CELL * 0.4); ctx.lineTo(CELL * 0.42, CELL * 0.88);
    ctx.moveTo(CELL * 0.58, CELL * 0.4); ctx.lineTo(CELL * 0.62, CELL * 0.88);
    ctx.moveTo(CELL * 0.74, CELL * 0.38); ctx.lineTo(CELL * 0.82, CELL * 0.85);
    ctx.stroke();
  }

  function drawNightstand() {
    // Small cabinet with drawer
    ctx.fillStyle = '#b88a4a';
    ctx.strokeStyle = '#5a3412';
    ctx.lineWidth = 1.4;
    roundRect(CELL * 0.12, CELL * 0.2, CELL * 0.76, CELL * 0.7, 3);
    ctx.fill(); ctx.stroke();
    // drawer line
    ctx.beginPath();
    ctx.moveTo(CELL * 0.14, CELL * 0.44);
    ctx.lineTo(CELL * 0.86, CELL * 0.44);
    ctx.stroke();
    // handle
    ctx.fillStyle = '#2a1608';
    ctx.beginPath();
    ctx.arc(CELL * 0.5, CELL * 0.35, CELL * 0.04, 0, Math.PI * 2);
    ctx.fill();
    // bottom drawer detail
    ctx.beginPath();
    ctx.moveTo(CELL * 0.14, CELL * 0.67);
    ctx.lineTo(CELL * 0.86, CELL * 0.67);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(CELL * 0.5, CELL * 0.55, CELL * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLamp() {
    // Floor lamp with shade
    ctx.fillStyle = '#e6c868';
    ctx.strokeStyle = '#8a6a20';
    ctx.lineWidth = 1.4;
    // shade
    ctx.beginPath();
    ctx.moveTo(CELL * 0.28, CELL * 0.32);
    ctx.lineTo(CELL * 0.72, CELL * 0.32);
    ctx.lineTo(CELL * 0.82, CELL * 0.08);
    ctx.lineTo(CELL * 0.18, CELL * 0.08);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // shade bottom
    ctx.strokeStyle = '#c89840';
    ctx.beginPath();
    ctx.moveTo(CELL * 0.28, CELL * 0.32);
    ctx.lineTo(CELL * 0.72, CELL * 0.32);
    ctx.stroke();
    // pole
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(CELL * 0.5, CELL * 0.34);
    ctx.lineTo(CELL * 0.5, CELL * 0.82);
    ctx.stroke();
    // base
    ctx.fillStyle = '#2a1608';
    ctx.beginPath();
    ctx.ellipse(CELL * 0.5, CELL * 0.86, CELL * 0.18, CELL * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    // soft light glow around shade
    const glow = ctx.createRadialGradient(CELL * 0.5, CELL * 0.2, 3, CELL * 0.5, CELL * 0.2, CELL * 0.45);
    glow.addColorStop(0, 'rgba(255, 240, 150, 0.35)');
    glow.addColorStop(1, 'rgba(255, 240, 150, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CELL, CELL);
  }

  function drawRug() {
    // Rolled/folded rug
    ctx.save();
    ctx.translate(CELL * 0.5, CELL * 0.5);
    ctx.rotate(-0.35);
    const w = CELL * 0.88;
    const h = CELL * 0.4;
    ctx.fillStyle = '#a83a3a';
    ctx.strokeStyle = '#4a1c1c';
    ctx.lineWidth = 1.2;
    roundRect(-w / 2, -h / 2, w, h, 3);
    ctx.fill(); ctx.stroke();
    // pattern stripes
    ctx.strokeStyle = '#f2d8a0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, -h * 0.25); ctx.lineTo(w / 2 - 3, -h * 0.25);
    ctx.moveTo(-w / 2 + 3, 0); ctx.lineTo(w / 2 - 3, 0);
    ctx.moveTo(-w / 2 + 3, h * 0.25); ctx.lineTo(w / 2 - 3, h * 0.25);
    ctx.stroke();
    // fringes on both ends
    ctx.strokeStyle = '#f2d8a0';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const fy = -h / 2 + i * (h / 6) + 2;
      ctx.moveTo(-w / 2, fy); ctx.lineTo(-w / 2 - 3, fy);
      ctx.moveTo(w / 2, fy); ctx.lineTo(w / 2 + 3, fy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBookshelf() {
    // Bookshelf with colorful books
    ctx.fillStyle = '#6a4a2a';
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 1.4;
    roundRect(CELL * 0.08, CELL * 0.08, CELL * 0.84, CELL * 0.84, 2);
    ctx.fill(); ctx.stroke();
    // two shelves
    ctx.beginPath();
    ctx.moveTo(CELL * 0.1, CELL * 0.37); ctx.lineTo(CELL * 0.9, CELL * 0.37);
    ctx.moveTo(CELL * 0.1, CELL * 0.66); ctx.lineTo(CELL * 0.9, CELL * 0.66);
    ctx.stroke();
    // books on each shelf
    const bookColors = ['#c23a3a', '#3a7ac2', '#c2a23a', '#3ac264', '#a03ac2'];
    const shelves = [CELL * 0.12, CELL * 0.41, CELL * 0.7];
    for (const sy of shelves) {
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = bookColors[(i + Math.round(sy * 7)) % bookColors.length];
        const bx = CELL * 0.12 + i * CELL * 0.155;
        ctx.fillRect(bx, sy, CELL * 0.14, CELL * 0.22);
        ctx.strokeStyle = '#1a0f06';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(bx, sy, CELL * 0.14, CELL * 0.22);
      }
    }
  }

  function drawTv() {
    // Flat-screen TV
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.4;
    roundRect(CELL * 0.06, CELL * 0.18, CELL * 0.88, CELL * 0.5, 3);
    ctx.fill(); ctx.stroke();
    // screen gradient
    const sg = ctx.createLinearGradient(CELL * 0.1, CELL * 0.22, CELL * 0.9, CELL * 0.64);
    sg.addColorStop(0, '#3a6abf');
    sg.addColorStop(0.5, '#7ac0f2');
    sg.addColorStop(1, '#2a4a8a');
    ctx.fillStyle = sg;
    ctx.fillRect(CELL * 0.11, CELL * 0.22, CELL * 0.78, CELL * 0.42);
    // reflection
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(CELL * 0.11, CELL * 0.22);
    ctx.lineTo(CELL * 0.4, CELL * 0.22);
    ctx.lineTo(CELL * 0.2, CELL * 0.6);
    ctx.lineTo(CELL * 0.11, CELL * 0.55);
    ctx.closePath();
    ctx.fill();
    // stand
    ctx.fillStyle = '#333';
    ctx.fillRect(CELL * 0.42, CELL * 0.68, CELL * 0.16, CELL * 0.1);
    ctx.fillRect(CELL * 0.3, CELL * 0.78, CELL * 0.4, CELL * 0.05);
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

    // Points for the continuous body polyline (tail to head)
    // We build it reversed so the line flows from tail up to head
    const pts = [];
    for (let i = body.length - 1; i >= 0; i--) {
      pts.push({
        x: body[i].x * CELL + CELL / 2,
        y: body[i].y * CELL + CELL / 2,
      });
    }
    // Extend head point slightly forward so body visually meets the head
    const headPt = pts[pts.length - 1];
    pts.push({
      x: headPt.x + state.dir.x * CELL * 0.25,
      y: headPt.y + state.dir.y * CELL * 0.25,
    });

    // Soft shadow under the whole body
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = CELL * 0.66;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x + 2, pts[0].y + CELL * 0.18);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + 2, pts[i].y + CELL * 0.18);
    ctx.stroke();
    ctx.restore();

    // Body layers (concentric strokes — chocolate-and-tan smooth-haired dachshund):
    // 1. Dark chocolate outline
    strokeBody(pts, CELL * 0.74, '#2a180c');
    // 2. Mid chocolate body (uniform — no saddle for chocolate-and-tan)
    strokeBody(pts, CELL * 0.66, '#5a3520');
    // 3. Warm chocolate top
    strokeBody(pts, CELL * 0.46, '#704026');
    // 4. Subtle highlight along the spine
    strokeBody(pts, CELL * 0.14, 'rgba(220, 170, 120, 0.22)');

    // Paws along the body
    drawPaws(body, ts);

    // Head and tail on top
    drawTailRibbon(body, ts);
    drawHead(body[0], ts);
  }

  function strokeBody(pts, width, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawPaws(body, ts) {
    const moving = (state.running && !state.paused) ? 1 : 0;
    const phase = (ts || 0) * 0.022;
    // Paws are placed at body segment positions (skip head, skip tail-most)
    // Dachshunds have short legs — we render compact paws.
    for (let i = 1; i < body.length; i++) {
      if (i % 2 !== 1) continue; // every other segment
      if (i >= body.length - 1) continue; // skip tail segment
      const p = body[i];
      const cx = p.x * CELL + CELL / 2;
      const cy = p.y * CELL + CELL / 2;
      // Determine local side axis: perpendicular to incoming direction
      const inDir = (function () {
        const prev = body[i - 1];
        const cur = body[i];
        return { x: prev.x - cur.x, y: prev.y - cur.y };
      })();
      const sideX = -inDir.y;
      const sideY = inDir.x;

      const bob = moving ? Math.sin(phase + i * 0.9) * 1.6 : 0;
      const bob2 = moving ? Math.sin(phase + i * 0.9 + Math.PI) * 1.6 : 0;

      drawPaw(cx + sideX * CELL * 0.28, cy + sideY * CELL * 0.28 + bob);
      drawPaw(cx - sideX * CELL * 0.28, cy - sideY * CELL * 0.28 + bob2);
    }
  }

  function drawPaw(cx, cy) {
    // Small paw: dark pad with pink underside
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#2a1608';
    ctx.strokeStyle = '#140a04';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, CELL * 0.13, CELL * 0.09, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // pink pad
    ctx.fillStyle = '#ff9eb0';
    ctx.beginPath();
    ctx.ellipse(0, CELL * 0.02, CELL * 0.08, CELL * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    // tiny claws
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-CELL * 0.06, -CELL * 0.04);
    ctx.lineTo(-CELL * 0.09, -CELL * 0.075);
    ctx.moveTo(0, -CELL * 0.05);
    ctx.lineTo(0, -CELL * 0.095);
    ctx.moveTo(CELL * 0.06, -CELL * 0.04);
    ctx.lineTo(CELL * 0.09, -CELL * 0.075);
    ctx.stroke();
    ctx.restore();
  }

  function segIn(index) {
    const prev = state.dog[index - 1];
    const cur = state.dog[index];
    return prev ? { x: prev.x - cur.x, y: prev.y - cur.y } : state.dir;
  }

  function drawTailRibbon(body, ts) {
    // Draw a long tapered wagging tail from the last body segment
    const tailSeg = body[body.length - 1];
    const prevSeg = body[body.length - 2] || tailSeg;
    // Direction from prev -> tail (i.e., which way the tail sticks out from body)
    const outDir = {
      x: tailSeg.x - prevSeg.x,
      y: tailSeg.y - prevSeg.y,
    };
    // If tail segment has no direction (1-cell body edge), fall back to opposite of head dir
    if (outDir.x === 0 && outDir.y === 0) {
      outDir.x = -state.dir.x;
      outDir.y = -state.dir.y;
    }

    const baseX = tailSeg.x * CELL + CELL / 2;
    const baseY = tailSeg.y * CELL + CELL / 2;

    const speed = (state.running && !state.paused) ? 1 : 0.25;
    const wagAmount = 0.75 + state.eatPulse * 1.2;
    const wagFreq = 0.028 + state.eatPulse * 0.02;
    const wag = Math.sin((ts || 0) * wagFreq) * wagAmount * speed;

    ctx.save();
    ctx.translate(baseX, baseY);
    const baseAngle = Math.atan2(outDir.y, outDir.x);
    ctx.rotate(baseAngle + wag);

    // Long thin tapered tail (like a stick)
    const tailLen = CELL * 1.25;
    const rootW = CELL * 0.32;
    const tipW = CELL * 0.08;

    // Dark outline
    ctx.fillStyle = '#2a1608';
    ctx.strokeStyle = '#140a04';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -rootW / 2);
    // Curved tail with gentle upward bend
    ctx.quadraticCurveTo(tailLen * 0.55, -rootW * 0.7, tailLen, -tipW / 2);
    ctx.quadraticCurveTo(tailLen + tipW * 0.9, 0, tailLen, tipW / 2);
    ctx.quadraticCurveTo(tailLen * 0.55, rootW * 0.7, 0, rootW / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tan stripe down the underside
    ctx.fillStyle = '#c8944c';
    ctx.beginPath();
    ctx.moveTo(tailLen * 0.1, rootW * 0.1);
    ctx.quadraticCurveTo(tailLen * 0.55, rootW * 0.5, tailLen * 0.9, tipW * 0.3);
    ctx.quadraticCurveTo(tailLen * 0.55, rootW * 0.15, tailLen * 0.1, rootW * 0.1);
    ctx.closePath();
    ctx.fill();

    // Subtle highlight along the top edge
    ctx.strokeStyle = 'rgba(255, 220, 180, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tailLen * 0.1, -rootW * 0.25);
    ctx.quadraticCurveTo(tailLen * 0.55, -rootW * 0.5, tailLen * 0.9, -tipW * 0.3);
    ctx.stroke();

    // Motion lines when wagging hard
    if (Math.abs(wag) > 0.45 && speed > 0.5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailLen * 0.35, -rootW * 0.8);
      ctx.lineTo(tailLen * 0.55, -rootW * 1.3);
      ctx.moveTo(tailLen * 0.35, rootW * 0.8);
      ctx.lineTo(tailLen * 0.55, rootW * 1.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHead(p, ts) {
    const d = state.dir;
    const cx = p.x * CELL + CELL / 2;
    const moving = (state.running && !state.paused) ? 1 : 0;
    const headBob = moving ? Math.sin((ts || 0) * 0.012) * 1.0 : 0;
    const cy = p.y * CELL + CELL / 2 + headBob;

    ctx.save();
    ctx.translate(cx, cy);
    const angle = Math.atan2(d.y, d.x);
    ctx.rotate(angle);

    // Realistic dachshund head: narrow skull, long snout
    const skullW = CELL * 0.62;
    const skullH = CELL * 0.70;
    const snoutW = CELL * 0.72;
    const snoutH = CELL * 0.34;

    // --- Ears (floppy, long — classic dachshund) ---
    const earFreq = 0.018 + state.eatPulse * 0.012;
    const earWag = Math.sin((ts || 0) * earFreq) * (0.10 + state.eatPulse * 0.12) * moving;

    // Top ear
    ctx.fillStyle = '#2a1608';
    ctx.strokeStyle = '#140a04';
    ctx.lineWidth = 1.8;
    ctx.save();
    ctx.translate(-skullW * 0.25, -skullH * 0.42);
    ctx.rotate(-0.35 + earWag);
    ctx.beginPath();
    ctx.ellipse(0, CELL * 0.28, CELL * 0.17, CELL * 0.36, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b27670';
    ctx.beginPath();
    ctx.ellipse(0, CELL * 0.32, CELL * 0.06, CELL * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bottom ear
    ctx.fillStyle = '#2a1608';
    ctx.save();
    ctx.translate(-skullW * 0.25, skullH * 0.42);
    ctx.rotate(0.35 - earWag);
    ctx.beginPath();
    ctx.ellipse(0, -CELL * 0.28, CELL * 0.17, CELL * 0.36, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b27670';
    ctx.beginPath();
    ctx.ellipse(0, -CELL * 0.32, CELL * 0.06, CELL * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Skull base (dark saddle colour on top) ---
    ctx.fillStyle = '#3a1f0a';
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(-skullW * 0.15, 0, skullW * 0.55, skullH / 2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Cheeks (tan, lower half)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-skullW * 0.15, 0, skullW * 0.55, skullH / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#c8944c';
    ctx.beginPath();
    ctx.ellipse(-skullW * 0.05, skullH * 0.15, skullW * 0.6, skullH * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-skullW * 0.05, -skullH * 0.15, skullW * 0.6, skullH * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- Long snout ---
    // Snout tapers toward the nose
    ctx.fillStyle = '#b7853f';
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const sX = skullW * 0.25;
    ctx.moveTo(sX, -snoutH * 0.55);
    ctx.lineTo(sX + snoutW * 0.85, -snoutH * 0.40);
    // round nose tip
    ctx.quadraticCurveTo(sX + snoutW + 2, -snoutH * 0.18, sX + snoutW + 2, 0);
    ctx.quadraticCurveTo(sX + snoutW + 2, snoutH * 0.18, sX + snoutW * 0.85, snoutH * 0.40);
    ctx.lineTo(sX, snoutH * 0.55);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Top ridge (darker stripe from skull toward nose)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sX, -snoutH * 0.55);
    ctx.lineTo(sX + snoutW * 0.85, -snoutH * 0.40);
    ctx.quadraticCurveTo(sX + snoutW + 2, -snoutH * 0.18, sX + snoutW + 2, 0);
    ctx.quadraticCurveTo(sX + snoutW * 0.85, -snoutH * 0.1, sX + snoutW * 0.3, -snoutH * 0.2);
    ctx.lineTo(sX, -snoutH * 0.3);
    ctx.closePath();
    ctx.fillStyle = '#6a3f17';
    ctx.fill();
    ctx.restore();

    // Subtle pink cheek patch (far subtler than before)
    ctx.fillStyle = 'rgba(220, 130, 130, 0.25)';
    ctx.beginPath();
    ctx.ellipse(sX + snoutW * 0.25, snoutH * 0.15, CELL * 0.08, CELL * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose (realistic — medium size)
    ctx.fillStyle = '#0e0604';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(sX + snoutW - 0.5, 0, CELL * 0.10, CELL * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nostril slits
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sX + snoutW - 1, -CELL * 0.025);
    ctx.quadraticCurveTo(sX + snoutW + 1, -CELL * 0.01, sX + snoutW - 1, CELL * 0.005);
    ctx.moveTo(sX + snoutW - 1, CELL * 0.025);
    ctx.quadraticCurveTo(sX + snoutW + 1, CELL * 0.03, sX + snoutW - 1, CELL * 0.045);
    ctx.stroke();
    // Single small shine on nose
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(sX + snoutW - 3, -CELL * 0.04, CELL * 0.025, CELL * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth line
    ctx.strokeStyle = '#2a1608';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sX + snoutW * 0.35, snoutH * 0.32);
    ctx.quadraticCurveTo(sX + snoutW * 0.65, snoutH * 0.48, sX + snoutW * 0.95, snoutH * 0.25);
    ctx.stroke();

    // Tongue — smaller and only when moving/eating
    const tongueOut = moving * 0.4 + state.eatPulse * 0.8;
    if (tongueOut > 0.15) {
      const tongueLen = CELL * 0.14 * tongueOut;
      const tongueW = CELL * 0.07;
      const tx = sX + snoutW * 0.72;
      const ty = snoutH * 0.42;
      ctx.fillStyle = '#e67a8e';
      ctx.strokeStyle = '#a84a5e';
      ctx.lineWidth = 1;
      ctx.save();
      ctx.translate(tx, ty);
      roundRect(-tongueW / 2, 0, tongueW, tongueLen, tongueW * 0.5);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, tongueLen * 0.25);
      ctx.lineTo(0, tongueLen * 0.9);
      ctx.stroke();
      ctx.restore();
    }

    // Realistic eye (medium-sized, one highlight)
    drawRealisticEye(-skullW * 0.02, -skullH * 0.2, CELL * 0.12, ts);

    // Brow ridge (subtle crease above the eye — more dog-like)
    ctx.strokeStyle = '#1a0f06';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-skullW * 0.18, -skullH * 0.34);
    ctx.quadraticCurveTo(-skullW * 0.02, -skullH * 0.40, skullW * 0.14, -skullH * 0.32);
    ctx.stroke();

    // Small tan eyebrow dot above the eye — classic black-and-tan dachshund marking
    ctx.fillStyle = 'rgba(200,140,80,0.9)';
    ctx.beginPath();
    ctx.ellipse(skullW * 0.02, -skullH * 0.38, CELL * 0.07, CELL * 0.035, -0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawRealisticEye(x, y, r, ts) {
    ctx.save();
    ctx.translate(x, y);

    const blinking = isBlinking(ts);

    if (blinking) {
      // Closed eye: a short curved line
      ctx.strokeStyle = '#1a0f06';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, r * 0.05);
      ctx.quadraticCurveTo(0, r * 0.45, r * 0.95, r * 0.05);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Outer eye — almond-shaped, more anatomical
    ctx.save();
    ctx.beginPath();
    // almond outline: two curved arcs
    ctx.moveTo(-r * 1.0, 0);
    ctx.quadraticCurveTo(-r * 0.3, -r * 0.85, r * 0.95, -r * 0.15);
    ctx.quadraticCurveTo(-r * 0.2, r * 0.75, -r * 1.0, 0);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#1a0f06';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.clip(); // clip inner details to the eye shape

    // Iris — warm amber-brown
    const irisGrad = ctx.createRadialGradient(-r * 0.1, -r * 0.2, r * 0.08, 0, 0, r * 0.85);
    irisGrad.addColorStop(0, '#a06a2a');
    irisGrad.addColorStop(0.65, '#5a3412');
    irisGrad.addColorStop(1, '#2a1608');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.05, r * 0.8, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil — vertical oval, moderate size
    ctx.fillStyle = '#0a0604';
    ctx.beginPath();
    ctx.ellipse(r * 0.05, -r * 0.02, r * 0.32, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // One clean highlight (realistic)
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.32, r * 0.2, r * 0.15, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Upper lash shadow
    ctx.fillStyle = 'rgba(26,15,6,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.1, -r * 0.75, r * 1.2, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // matches the inner save() before the almond clip
    ctx.restore(); // matches the outer save() at function start
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
  {
    const s = findSafeStart(state.obstaclesSet);
    state.dog = [
      { x: s.x, y: s.y },
      { x: s.x - s.dir.x, y: s.y - s.dir.y },
      { x: s.x - 2 * s.dir.x, y: s.y - 2 * s.dir.y },
    ];
    state.dir = s.dir;
    state.pendingDir = s.dir;
  }
  state.bone = spawnBone();

  refreshMenu();
  draw(0);
  requestAnimationFrame(loop);
})();
