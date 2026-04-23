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
  const CELL = 30; // canvas is 600x600
  const INITIAL_TICK_MS = 180;
  const MIN_TICK_MS = 70;
  const SPEEDUP_PER_BONE = 4; // ms faster per bone eaten

  const DIR = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
  };

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const finalScoreEl = document.getElementById('final-score');
  const finalBestEl = document.getElementById('final-best');
  const overlay = document.getElementById('overlay');
  const gameoverEl = document.getElementById('gameover');
  const pauseEl = document.getElementById('pause');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const pauseBtn = document.getElementById('pause-btn');

  // ---------- State ----------
  const state = {
    dog: [],           // array of {x,y}, head first
    dir: DIR.RIGHT,
    pendingDir: DIR.RIGHT,
    bone: null,
    score: 0,
    best: 0,
    tickMs: INITIAL_TICK_MS,
    lastTick: 0,
    running: false,
    paused: false,
    over: false,
  };

  try {
    const stored = parseInt(localStorage.getItem('taksa_best') || '0', 10);
    if (!Number.isNaN(stored)) state.best = stored;
  } catch (_) {}
  bestEl.textContent = state.best;

  // ---------- Helpers ----------
  function randInt(max) { return Math.floor(Math.random() * max); }

  function spawnBone() {
    const occupied = new Set(state.dog.map(p => p.x + ',' + p.y));
    const free = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!occupied.has(x + ',' + y)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    return free[randInt(free.length)];
  }

  function resetGame() {
    state.dog = [
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
    ];
    state.dir = DIR.RIGHT;
    state.pendingDir = DIR.RIGHT;
    state.bone = spawnBone();
    state.score = 0;
    state.tickMs = INITIAL_TICK_MS;
    state.lastTick = 0;
    state.running = true;
    state.paused = false;
    state.over = false;
    scoreEl.textContent = '0';
  }

  // ---------- Input ----------
  function setDir(nd) {
    // Disallow reversing into the body
    const cur = state.dir;
    if (cur.x + nd.x === 0 && cur.y + nd.y === 0) return;
    state.pendingDir = nd;
  }

  window.addEventListener('keydown', function (e) {
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

  // Touch / swipe
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

  // Buttons
  startBtn.addEventListener('click', function () {
    overlay.classList.add('hidden');
    resetGame();
  });
  restartBtn.addEventListener('click', function () {
    gameoverEl.classList.add('hidden');
    resetGame();
  });
  resumeBtn.addEventListener('click', function () {
    if (state.over || !state.running) return;
    pauseEl.classList.add('hidden');
    state.paused = false;
    state.lastTick = performance.now();
  });
  pauseBtn.addEventListener('click', togglePause);

  function togglePause() {
    if (state.over || !state.running) return;
    if (state.paused) {
      pauseEl.classList.add('hidden');
      state.paused = false;
      state.lastTick = performance.now();
    } else {
      state.paused = true;
      pauseEl.classList.remove('hidden');
    }
  }

  // ---------- Game Loop ----------
  function step() {
    state.dir = state.pendingDir;
    const head = state.dog[0];
    const nx = head.x + state.dir.x;
    const ny = head.y + state.dir.y;

    // Wall collision
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
      return gameOver();
    }

    // Self collision (the tail will move, so check all but last cell)
    const willEat = state.bone && nx === state.bone.x && ny === state.bone.y;
    const tailIndex = willEat ? state.dog.length : state.dog.length - 1;
    for (let i = 0; i < tailIndex; i++) {
      if (state.dog[i].x === nx && state.dog[i].y === ny) {
        return gameOver();
      }
    }

    state.dog.unshift({ x: nx, y: ny });
    if (willEat) {
      state.score += 1;
      scoreEl.textContent = String(state.score);
      state.tickMs = Math.max(MIN_TICK_MS, state.tickMs - SPEEDUP_PER_BONE);
      state.bone = spawnBone();
    } else {
      state.dog.pop();
    }
  }

  function gameOver() {
    state.running = false;
    state.over = true;
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem('taksa_best', String(state.best)); } catch (_) {}
      bestEl.textContent = state.best;
    }
    finalScoreEl.textContent = String(state.score);
    finalBestEl.textContent = String(state.best);
    gameoverEl.classList.remove('hidden');
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!state.running || state.paused || state.over) {
      draw();
      return;
    }
    if (!state.lastTick) state.lastTick = ts;
    if (ts - state.lastTick >= state.tickMs) {
      state.lastTick = ts;
      step();
    }
    draw();
  }

  // ---------- Rendering ----------
  function draw() {
    // Background grass with subtle checker
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#8ec76a' : '#86bf62';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }

    // Bone
    if (state.bone) drawBone(state.bone.x, state.bone.y);

    // Dachshund
    drawDog();
  }

  function drawBone(gx, gy) {
    const cx = gx * CELL + CELL / 2;
    const cy = gy * CELL + CELL / 2;
    const w = CELL * 0.75;
    const h = CELL * 0.38;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 6);

    const r = h / 2;
    ctx.fillStyle = '#fff8e0';
    ctx.strokeStyle = '#8b7a4a';
    ctx.lineWidth = 2;

    // Shaft
    ctx.beginPath();
    ctx.rect(-w / 2 + r, -h / 2, w - 2 * r, h);
    ctx.fill();

    // Left knobs
    circle(-w / 2, -h / 2, r);
    circle(-w / 2, h / 2, r);
    // Right knobs
    circle(w / 2, -h / 2, r);
    circle(w / 2, h / 2, r);

    // Outline
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.lineTo(w / 2 - r, -h / 2);
    ctx.moveTo(-w / 2 + r, h / 2);
    ctx.lineTo(w / 2 - r, h / 2);
    ctx.stroke();
    ctx.restore();
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8b7a4a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawDog() {
    const body = state.dog;
    if (body.length === 0) return;

    // Shadow under body
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < body.length; i++) {
      const p = body[i];
      ctx.beginPath();
      ctx.ellipse(
        p.x * CELL + CELL / 2,
        p.y * CELL + CELL * 0.82,
        CELL * 0.40,
        CELL * 0.16,
        0, 0, Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();

    // Body segments (from tail to just behind head)
    for (let i = body.length - 1; i >= 1; i--) {
      drawBodySegment(body[i], i, body.length);
    }

    // Head last (on top)
    drawHead(body[0]);
  }

  function segmentDirs(index) {
    const body = state.dog;
    const prev = body[index - 1];
    const cur = body[index];
    const next = body[index + 1];
    const inDir = prev ? { x: prev.x - cur.x, y: prev.y - cur.y } : state.dir;
    const outDir = next ? { x: cur.x - next.x, y: cur.y - next.y } : inDir;
    return { inDir, outDir };
  }

  function drawBodySegment(p, index, total) {
    const isTail = index === total - 1;
    const { inDir } = segmentDirs(index);
    const horizontal = inDir.x !== 0;

    const cx = p.x * CELL + CELL / 2;
    const cy = p.y * CELL + CELL / 2;

    ctx.save();
    ctx.translate(cx, cy);
    if (!horizontal) ctx.rotate(Math.PI / 2);

    // Body pill
    const w = CELL * 1.02; // slight overlap with neighbors
    const h = CELL * 0.62;
    roundRect(-w / 2, -h / 2, w, h, h / 2);
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, '#b27437');
    grad.addColorStop(1, '#7a4a1e');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#4d2e10';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Legs on every 2nd segment
    if (!isTail && index % 2 === 1) {
      drawLegs(h);
    }

    // Tail tip
    if (isTail) {
      ctx.fillStyle = '#7a4a1e';
      ctx.strokeStyle = '#4d2e10';
      ctx.lineWidth = 2;
      const tx = -w / 2 + 2;
      ctx.beginPath();
      ctx.moveTo(tx, -h * 0.2);
      ctx.quadraticCurveTo(tx - CELL * 0.35, -h * 0.5, tx - CELL * 0.38, -h * 0.1);
      ctx.quadraticCurveTo(tx - CELL * 0.30, h * 0.2, tx, h * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawLegs(bodyH) {
    ctx.save();
    ctx.fillStyle = '#6a3f1a';
    ctx.strokeStyle = '#3d230b';
    ctx.lineWidth = 1.5;
    const legW = CELL * 0.18;
    const legH = CELL * 0.26;
    const y = bodyH / 2 - 2;

    // Left leg
    roundRect(-CELL * 0.28 - legW / 2, y, legW, legH, 3);
    ctx.fill(); ctx.stroke();
    // Right leg
    roundRect(CELL * 0.28 - legW / 2, y, legW, legH, 3);
    ctx.fill(); ctx.stroke();

    // Paws
    ctx.fillStyle = '#4d2e10';
    ctx.beginPath();
    ctx.ellipse(-CELL * 0.28, y + legH, legW * 0.7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(CELL * 0.28, y + legH, legW * 0.7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHead(p) {
    const d = state.dir;
    const cx = p.x * CELL + CELL / 2;
    const cy = p.y * CELL + CELL / 2;

    ctx.save();
    ctx.translate(cx, cy);
    // Rotate so head faces along direction (right = 0)
    const angle = Math.atan2(d.y, d.x);
    ctx.rotate(angle);

    // Head shape: body-colored rounded rect with elongated snout
    const headW = CELL * 1.1;
    const headH = CELL * 0.68;

    // Ears (floppy, darker) - draw first so they're behind head
    ctx.fillStyle = '#5a3412';
    ctx.strokeStyle = '#3d230b';
    ctx.lineWidth = 2;
    // Left ear (top when facing right)
    ctx.beginPath();
    ctx.ellipse(-headW * 0.15, -headH * 0.55, CELL * 0.18, CELL * 0.32, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Right ear (bottom when facing right)
    ctx.beginPath();
    ctx.ellipse(-headW * 0.15, headH * 0.55, CELL * 0.18, CELL * 0.32, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Main head
    const gradH = ctx.createLinearGradient(0, -headH / 2, 0, headH / 2);
    gradH.addColorStop(0, '#b27437');
    gradH.addColorStop(1, '#7a4a1e');
    ctx.fillStyle = gradH;
    ctx.strokeStyle = '#4d2e10';
    ctx.lineWidth = 2;
    roundRect(-headW * 0.45, -headH / 2, headW * 0.7, headH, headH / 2);
    ctx.fill(); ctx.stroke();

    // Snout (extends forward)
    const snoutW = CELL * 0.55;
    const snoutH = CELL * 0.4;
    ctx.fillStyle = '#a06630';
    roundRect(headW * 0.1, -snoutH / 2, snoutW, snoutH, snoutH / 2);
    ctx.fill(); ctx.stroke();

    // Nose
    ctx.fillStyle = '#1a0f06';
    ctx.beginPath();
    ctx.ellipse(headW * 0.1 + snoutW - 2, 0, CELL * 0.09, CELL * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -headH * 0.18, CELL * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0f06';
    ctx.beginPath();
    ctx.arc(CELL * 0.02, -headH * 0.18, CELL * 0.05, 0, Math.PI * 2);
    ctx.fill();

    // Mouth hint
    ctx.strokeStyle = '#3d230b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(headW * 0.1 + snoutW * 0.3, snoutH * 0.25);
    ctx.lineTo(headW * 0.1 + snoutW * 0.75, snoutH * 0.3);
    ctx.stroke();

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
  // Draw an idle frame (menu background) before the player starts
  state.dog = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  state.bone = { x: 14, y: 10 };
  draw();

  requestAnimationFrame(loop);
})();
