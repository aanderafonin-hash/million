/* ==========================================
   Бургер Башня — HTML5 Game for Yandex Games
   ========================================== */

// ─── Audio Context ───
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playTone(freq, dur, type = 'sine', vol = 0.15) {
    try {
        const c = getAudioCtx(), o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(vol, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
        o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
    } catch (e) {}
}

function playPerfectSound() {
    playTone(523, 0.12, 'sine', 0.2);
    setTimeout(() => playTone(659, 0.12, 'sine', 0.2), 80);
    setTimeout(() => playTone(784, 0.15, 'sine', 0.2), 160);
    setTimeout(() => playTone(1047, 0.25, 'sine', 0.2), 240);
}
function playDropSound() { playTone(200, 0.15, 'square', 0.08); }
function playLandSound() { playTone(300, 0.08, 'triangle', 0.12); }
function playCollapseSound() {
    for (let i = 0; i < 6; i++) setTimeout(() => playTone(200 - i * 25, 0.15, 'sawtooth', 0.1), i * 80);
}
function playGameOverSound() {
    playTone(400, 0.3, 'sawtooth', 0.12);
    setTimeout(() => playTone(300, 0.3, 'sawtooth', 0.12), 200);
    setTimeout(() => playTone(200, 0.5, 'sawtooth', 0.12), 400);
}

// ─── Speech Praise ───
const PRAISES = [
    { text: 'Отлично!', lang: 'ru-RU' }, { text: 'Великолепно!', lang: 'ru-RU' },
    { text: 'Супер!', lang: 'ru-RU' }, { text: 'Идеально!', lang: 'ru-RU' },
    { text: 'Потрясающе!', lang: 'ru-RU' }, { text: 'Браво!', lang: 'ru-RU' },
    { text: '대박!', lang: 'ko-KR' }, { text: '완벽해!', lang: 'ko-KR' }, { text: '최고!', lang: 'ko-KR' },
    { text: '太棒了!', lang: 'zh-CN' }, { text: '完美!', lang: 'zh-CN' }, { text: '厉害!', lang: 'zh-CN' },
    { text: 'ممتاز', lang: 'ar-SA' }, { text: 'رائع', lang: 'ar-SA' }, { text: 'عظيم', lang: 'ar-SA' },
    { text: 'Perfect!', lang: 'en-US' }, { text: 'Amazing!', lang: 'en-US' }, { text: 'Awesome!', lang: 'en-US' },
    { text: 'すごい!', lang: 'ja-JP' }, { text: '完璧!', lang: 'ja-JP' },
    { text: '¡Perfecto!', lang: 'es-ES' }, { text: 'Parfait!', lang: 'fr-FR' },
    { text: 'Perfetto!', lang: 'it-IT' }, { text: 'Wunderbar!', lang: 'de-DE' },
    { text: 'Perfeito!', lang: 'pt-BR' }, { text: 'Mükemmel!', lang: 'tr-TR' },
    { text: 'Tuyệt vời!', lang: 'vi-VN' },
];

function speakPraise() {
    try {
        const p = PRAISES[Math.floor(Math.random() * PRAISES.length)];
        const u = new SpeechSynthesisUtterance(p.text);
        u.lang = p.lang; u.rate = 1.1; u.volume = 0.8;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        return p.text;
    } catch (e) { return PRAISES[Math.floor(Math.random() * PRAISES.length)].text; }
}

// ─── Ingredients ───
const INGREDIENTS = [
    { name: 'Котлета', height: 26, pattern: 'patty' },
    { name: 'Листья салата', height: 18, pattern: 'lettuce' },
    { name: 'Сыр', height: 14, pattern: 'cheese' },
    { name: 'Помидор', height: 16, pattern: 'tomato' },
    { name: 'Лук', height: 14, pattern: 'onion' },
    { name: 'Соус', height: 10, pattern: 'sauce' },
    { name: 'Яйцо', height: 20, pattern: 'egg' },
    { name: 'Бекон', height: 14, pattern: 'bacon' },
    { name: 'Огурчики', height: 14, pattern: 'pickle' },
    { name: 'Салат', height: 16, pattern: 'salad' },
];
const BOTTOM_BUN = { name: 'Нижняя булка', height: 28, pattern: 'bun_bottom' };
const TOP_BUN = { name: 'Верхняя булка', height: 32, pattern: 'bun_top' };

// ─── Constants ───
const ING_W = 130;
const PERFECT_TH = 10;
const OK_TH = 35;
const MISS_TH = 70;
const GRAVITY = 0.6;
const MAX_LEAN = 100;
const DOG_INTERVAL = 8;
const DOG_EAT_LAYERS = 3;
const SWAY_FRICTION = 0.96;
const BASE_PTS = 100;
const COMBO_MUL = 25;
const SPD_BASE = 1.8;
const SPD_INC = 0.1;
const SPD_MAX = 5.5;
const CAM_SMOOTH = 0.07;
const PLATE_OFF = 80;
const MOVE_RANGE = 160;

// ─── State ───
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const gameArea = document.getElementById('game-area');
let W, H, gameState = 'menu', playerName = '', score = 0, level = 0;
let combo = 0, maxCombo = 0, perfectCount = 0, cumulativeLean = 0;
let swayAngle = 0, swayVel = 0, cameraY = 0, targetCamY = 0, plateBaseY = 0;
let stack = [], curIng = null, fallIng = null, colPieces = [], particles = [];
let moveSpd = SPD_BASE, moveDir = 1, resultShown = false;
// Dog state
let dogActive = false, dogY = 0, dogTargetY = 0, dogPhase = 'hidden'; // hidden, rising, eating, leaving
let dogEatTimer = 0, dropsSinceDog = 0, dogMouthOpen = 0;

// ─── DPR-aware resize ───
function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = gameArea.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    plateBaseY = H - PLATE_OFF;
}
window.addEventListener('resize', resize);
resize();

// ─── Screens ───
const screens = {
    start: document.getElementById('screen-start'),
    leaderboard: document.getElementById('screen-leaderboard'),
    game: document.getElementById('screen-game'),
    result: document.getElementById('screen-result'),
};
function showScreen(n) { Object.values(screens).forEach(s => s.classList.remove('active')); screens[n].classList.add('active'); }

// ─── Leaderboard ───
function getLB() { try { return JSON.parse(localStorage.getItem('burger_lb') || '[]'); } catch { return []; } }
function saveLB(name, s, l) {
    const lb = getLB(); lb.push({ name, score: s, levels: l, date: Date.now() });
    lb.sort((a, b) => b.score - a.score); if (lb.length > 50) lb.length = 50;
    localStorage.setItem('burger_lb', JSON.stringify(lb)); return lb;
}
function renderLB(hs) {
    const lb = getLB(), el = document.getElementById('leaderboard-list');
    if (!lb.length) { el.innerHTML = '<p style="color:#777;padding:20px;">Пока нет результатов</p>'; return; }
    const m = ['🥇', '🥈', '🥉'];
    el.innerHTML = lb.slice(0, 20).map((e, i) => {
        const cur = hs !== undefined && e.score === hs && e.name === playerName;
        return `<div class="lb-row${cur ? ' current-player' : ''}"><span class="lb-rank">${m[i] || (i + 1)}</span><span class="lb-name">${esc(e.name)}</span><span class="lb-score">${e.score}</span></div>`;
    }).join('');
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ─── HUD ───
function updateHUD() {
    document.querySelector('#hud-score span').textContent = score;
    document.querySelector('#hud-level span').textContent = level;
    document.querySelector('#hud-combo span').textContent = 'x' + combo;
}

// ─── Praise ───
let praiseTm;
function showPraise(txt, col = '#FFD700') {
    const el = document.getElementById('praise-popup');
    el.textContent = txt; el.style.color = col; el.className = 'praise visible';
    clearTimeout(praiseTm); praiseTm = setTimeout(() => { el.className = 'praise hidden'; }, 1200);
}

// ─── Particles ───
function spawnP(x, y, col, n = 10) {
    for (let i = 0; i < n; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 5 - 2, sz: Math.random() * 4 + 2, col, life: 1, dec: 0.02 + Math.random() * 0.02 });
}
function spawnStars(x, y) {
    const cols = ['#FFD700', '#FF6B35', '#FF4081', '#00E5FF', '#76FF03'];
    for (let i = 0; i < 18; i++) { const a = Math.PI * 2 * i / 18, s = 3 + Math.random() * 3;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, sz: Math.random() * 5 + 2, col: cols[i % cols.length], life: 1, dec: 0.015 + Math.random() * 0.015, star: true });
    }
}
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= p.dec; if (p.life <= 0) particles.splice(i, 1); }
}
function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.col;
        if (p.star) { drawStar(p.x, p.y, p.sz, 5); } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2); ctx.fill(); }
    } ctx.globalAlpha = 1;
}
function drawStar(cx, cy, r, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) { const a = Math.PI * i / pts - Math.PI / 2, rad = i % 2 === 0 ? r : r * 0.4; ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
    ctx.closePath(); ctx.fill();
}

// ─── Stack positions ───
function stackPos() {
    const pos = []; let y = plateBaseY, cx = W / 2;
    for (let i = 0; i < stack.length; i++) {
        const it = stack[i]; y -= it.height; if (i > 0) cx += it.offX;
        pos.push({ x: cx - ING_W / 2, y, w: ING_W, h: it.height, ing: it.ingredient, cx });
    } return pos;
}

// ════════════════════════════════════════════
//  REALISTIC INGREDIENT DRAWING
// ════════════════════════════════════════════

function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function drawIng(x, y, w, h, ing, angle) {
    ctx.save();
    if (angle) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(angle); ctx.translate(-w / 2, -h / 2); }
    else ctx.translate(x, y);

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rr(3, 4, w, h, 8); ctx.fill();

    const fn = DRAW_FNS[ing.pattern] || drawDefault;
    fn(w, h);
    ctx.restore();
}

function drawDefault(w, h) { ctx.fillStyle = '#888'; rr(0, 0, w, h, 8); ctx.fill(); }

const DRAW_FNS = {
    bun_bottom(w, h) {
        // Main body
        let g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#E8A849'); g.addColorStop(0.5, '#D49530'); g.addColorStop(1, '#C08020');
        ctx.fillStyle = g; rr(0, 0, w, h, 8); ctx.fill();
        // Flat top edge
        ctx.fillStyle = '#D49530'; ctx.fillRect(4, 0, w - 8, 4);
        // Sesame seeds
        ctx.fillStyle = '#FFF8E1';
        for (let i = 0; i < 6; i++) {
            ctx.save(); ctx.translate(12 + i * (w - 24) / 5, h * 0.35 + (i % 2) * 4);
            ctx.rotate(0.3 + i * 0.25); ctx.beginPath(); ctx.ellipse(0, 0, 2.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // Gloss
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.ellipse(w * 0.4, h * 0.25, w * 0.25, 4, -0.15, 0, Math.PI * 2); ctx.fill();
    },

    bun_top(w, h) {
        // Dome
        let g = ctx.createRadialGradient(w * 0.4, h * 0.3, 5, w / 2, h * 0.5, w * 0.6);
        g.addColorStop(0, '#F0B84A'); g.addColorStop(0.5, '#E09830'); g.addColorStop(1, '#C07820');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(4, h); ctx.lineTo(4, h * 0.5);
        ctx.quadraticCurveTo(w / 2, -h * 0.3, w - 4, h * 0.5); ctx.lineTo(w - 4, h); ctx.closePath(); ctx.fill();
        // Bottom flat
        ctx.fillStyle = '#C07820'; ctx.fillRect(4, h * 0.8, w - 8, h * 0.2);
        // Sesame
        ctx.fillStyle = '#FFF8E1';
        for (let i = 0; i < 8; i++) {
            const sx = 10 + i * (w - 20) / 7, sy = h * 0.2 + Math.sin(i * 1.2) * 6 + (i % 2) * 5;
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(i * 0.4);
            ctx.beginPath(); ctx.ellipse(0, 0, 2.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // Gloss highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.ellipse(w * 0.35, h * 0.25, w * 0.2, h * 0.12, -0.25, 0, Math.PI * 2); ctx.fill();
    },

    patty(w, h) {
        // Dark brown patty with gradient
        let g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#6D3A1A'); g.addColorStop(0.4, '#8B4513'); g.addColorStop(0.7, '#5C2E0E'); g.addColorStop(1, '#4A2409');
        ctx.fillStyle = g; rr(0, 0, w, h, 10); ctx.fill();
        // Grill marks
        ctx.strokeStyle = 'rgba(30,15,5,0.5)'; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) { const gx = 8 + i * (w - 16) / 4; ctx.beginPath(); ctx.moveTo(gx, 5); ctx.lineTo(gx + 3, h - 5); ctx.stroke(); }
        // Subtle texture dots
        ctx.fillStyle = 'rgba(100,50,20,0.5)';
        for (let i = 0; i < 15; i++) { ctx.beginPath(); ctx.arc(10 + Math.random() * (w - 20), 4 + Math.random() * (h - 8), 1.5, 0, Math.PI * 2); ctx.fill(); }
        // Top highlight
        ctx.fillStyle = 'rgba(255,200,150,0.08)'; rr(6, 2, w - 12, h * 0.35, 6); ctx.fill();
    },

    lettuce(w, h) {
        // Rich green wavy lettuce
        const g1 = ctx.createLinearGradient(0, 0, 0, h);
        g1.addColorStop(0, '#5ABF5A'); g1.addColorStop(1, '#2E8B2E');
        ctx.fillStyle = g1;
        ctx.beginPath(); ctx.moveTo(-6, h);
        for (let i = 0; i <= w + 12; i += 8) ctx.lineTo(i - 6, h * 0.15 + Math.sin(i * 0.22) * h * 0.35 + Math.cos(i * 0.35) * 3);
        ctx.lineTo(w + 6, h); ctx.closePath(); ctx.fill();
        // Darker inner layer
        ctx.fillStyle = 'rgba(30,100,30,0.35)';
        ctx.beginPath(); ctx.moveTo(-3, h);
        for (let i = 0; i <= w + 6; i += 10) ctx.lineTo(i - 3, h * 0.4 + Math.cos(i * 0.18 + 1) * h * 0.25);
        ctx.lineTo(w + 3, h); ctx.closePath(); ctx.fill();
        // Vein lines
        ctx.strokeStyle = 'rgba(200,255,200,0.2)'; ctx.lineWidth = 0.7;
        for (let i = 0; i < 5; i++) { const vx = 15 + i * (w - 30) / 4; ctx.beginPath(); ctx.moveTo(vx, h); ctx.quadraticCurveTo(vx + 5, h * 0.3, vx - 3, 2); ctx.stroke(); }
    },

    cheese(w, h) {
        // Melting yellow cheese
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#FFD54F'); g.addColorStop(0.5, '#FFC107'); g.addColorStop(1, '#FFB300');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(w - 2, 0); ctx.lineTo(w - 2, h * 0.5);
        // Melting drips
        ctx.quadraticCurveTo(w - 8, h * 1.3, w - 20, h * 0.55);
        ctx.lineTo(w * 0.7, h * 0.5);
        ctx.quadraticCurveTo(w * 0.6, h * 1.4, w * 0.45, h * 0.6);
        ctx.lineTo(w * 0.35, h * 0.5);
        ctx.quadraticCurveTo(w * 0.2, h * 1.2, 12, h * 0.55);
        ctx.lineTo(2, h * 0.5); ctx.closePath(); ctx.fill();
        // Holes
        ctx.fillStyle = 'rgba(230,170,20,0.6)';
        ctx.beginPath(); ctx.arc(w * 0.25, h * 0.25, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w * 0.65, h * 0.2, 3, 0, Math.PI * 2); ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.15, w * 0.3, 3, 0, 0, Math.PI * 2); ctx.fill();
    },

    tomato(w, h) {
        // Red tomato slices
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#EF5350'); g.addColorStop(0.5, '#F44336'); g.addColorStop(1, '#D32F2F');
        ctx.fillStyle = g; rr(0, 0, w, h, 8); ctx.fill();
        // Tomato slice circles
        for (let i = 0; i < 5; i++) {
            const cx = 14 + i * (w - 28) / 4, cy = h / 2;
            // Outer ring
            ctx.strokeStyle = 'rgba(200,50,50,0.5)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
            // Center seed
            ctx.fillStyle = '#FFCDD2'; ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
            // Seeds around
            ctx.fillStyle = 'rgba(255,230,220,0.5)';
            for (let j = 0; j < 3; j++) { const a = j * Math.PI * 2 / 3; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 4, cy + Math.sin(a) * 3, 1.5, 0.8, a, 0, Math.PI * 2); ctx.fill(); }
        }
        // Moisture shine
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; rr(8, 1, w - 16, h * 0.3, 4); ctx.fill();
    },

    onion(w, h) {
        // Purple-white onion rings
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#F3E5F5'); g.addColorStop(0.5, '#E1BEE7'); g.addColorStop(1, '#CE93D8');
        ctx.fillStyle = g; rr(0, 0, w, h, 6); ctx.fill();
        // Ring patterns
        for (let i = 0; i < 6; i++) {
            const rx = 11 + i * (w - 22) / 5;
            ctx.strokeStyle = 'rgba(180,130,200,0.6)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.ellipse(rx, h / 2, 7, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.ellipse(rx, h / 2, 5, 3.5, 0, 0, Math.PI * 2); ctx.stroke();
        }
        // Gloss
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; rr(6, 1, w - 12, h * 0.3, 4); ctx.fill();
    },

    sauce(w, h) {
        // Ketchup-mustard sauce drizzle
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#FF5722'); g.addColorStop(0.5, '#FF7043'); g.addColorStop(1, '#FF8A65');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.3);
        for (let i = w; i >= 0; i -= 12) ctx.quadraticCurveTo(i - 3, h * 1.1, i - 12, h * 0.35 + Math.sin(i * 0.3) * 3);
        ctx.closePath(); ctx.fill();
        // Shine streaks
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.15, w * 0.15, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(w * 0.7, h * 0.15, w * 0.12, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    },

    egg(w, h) {
        // Fried egg white with irregular edges
        ctx.fillStyle = '#FAFAFA';
        ctx.beginPath();
        ctx.moveTo(8, h * 0.3);
        ctx.quadraticCurveTo(w * 0.15, -3, w * 0.35, h * 0.15);
        ctx.quadraticCurveTo(w * 0.5, -2, w * 0.7, h * 0.1);
        ctx.quadraticCurveTo(w * 0.9, -1, w - 5, h * 0.3);
        ctx.quadraticCurveTo(w + 3, h * 0.6, w - 5, h * 0.75);
        ctx.quadraticCurveTo(w * 0.8, h + 3, w * 0.5, h * 0.85);
        ctx.quadraticCurveTo(w * 0.2, h + 2, 5, h * 0.7);
        ctx.quadraticCurveTo(-3, h * 0.5, 8, h * 0.3);
        ctx.closePath(); ctx.fill();
        // Crispy brown edge
        ctx.strokeStyle = 'rgba(180,140,80,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
        // Yolk - radial gradient
        const yg = ctx.createRadialGradient(w / 2, h * 0.45, 2, w / 2, h * 0.45, 12);
        yg.addColorStop(0, '#FFD600'); yg.addColorStop(0.7, '#FFC107'); yg.addColorStop(1, '#FFB300');
        ctx.fillStyle = yg;
        ctx.beginPath(); ctx.arc(w / 2, h * 0.45, 10, 0, Math.PI * 2); ctx.fill();
        // Yolk highlight
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath(); ctx.arc(w / 2 - 3, h * 0.4, 3.5, 0, Math.PI * 2); ctx.fill();
    },

    bacon(w, h) {
        // Wavy bacon strips
        for (let strip = 0; strip < 2; strip++) {
            const sy = strip * h * 0.4 + 1;
            // Meat part
            const mg = ctx.createLinearGradient(0, sy, 0, sy + h * 0.5);
            mg.addColorStop(0, '#B71C1C'); mg.addColorStop(0.5, '#C62828'); mg.addColorStop(1, '#A01515');
            ctx.fillStyle = mg;
            ctx.beginPath(); ctx.moveTo(0, sy + h * 0.15);
            for (let i = 0; i <= w; i += 15) {
                ctx.quadraticCurveTo(i + 4, sy, i + 7, sy + h * 0.15);
                ctx.quadraticCurveTo(i + 11, sy + h * 0.4, i + 15, sy + h * 0.15);
            }
            ctx.lineTo(w, sy + h * 0.5); ctx.lineTo(0, sy + h * 0.5); ctx.closePath(); ctx.fill();
            // Fat streaks
            ctx.fillStyle = 'rgba(255,200,180,0.6)';
            for (let i = 5; i < w - 5; i += 20) ctx.fillRect(i, sy + h * 0.05, 8, h * 0.35);
        }
        // Slight crispy gloss
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; rr(3, 1, w - 6, h * 0.3, 4); ctx.fill();
    },

    pickle(w, h) {
        // Pickle slices
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#66BB6A'); bg.addColorStop(1, '#43A047');
        ctx.fillStyle = bg; rr(0, 0, w, h, 6); ctx.fill();
        // Individual slices
        for (let i = 0; i < 6; i++) {
            const px = 10 + i * (w - 20) / 5;
            // Outer
            ctx.fillStyle = '#388E3C'; ctx.beginPath(); ctx.ellipse(px, h / 2, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
            // Inner lighter
            ctx.fillStyle = '#A5D6A7'; ctx.beginPath(); ctx.ellipse(px, h / 2, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
            // Seeds
            ctx.fillStyle = '#C8E6C9';
            for (let j = 0; j < 3; j++) { const a = j * Math.PI * 2 / 3 + i;
                ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * 2.5, h / 2 + Math.sin(a) * 2, 1, 0.5, a, 0, Math.PI * 2); ctx.fill();
            }
        }
        // Brine sheen
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(5, 1, w - 10, h * 0.35, 4); ctx.fill();
    },

    salad(w, h) {
        // Leafy salad / iceberg lettuce
        const g1 = ctx.createLinearGradient(0, 0, 0, h);
        g1.addColorStop(0, '#81C784'); g1.addColorStop(1, '#4CAF50');
        ctx.fillStyle = g1;
        ctx.beginPath(); ctx.moveTo(-4, h);
        for (let i = 0; i <= w + 8; i += 10) ctx.lineTo(i - 4, h * 0.2 + Math.sin(i * 0.2 + 2) * h * 0.3 + Math.cos(i * 0.35) * 2);
        ctx.lineTo(w + 4, h); ctx.closePath(); ctx.fill();
        // Lighter overlay
        ctx.fillStyle = 'rgba(200,255,200,0.2)';
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let i = 0; i <= w; i += 12) ctx.lineTo(i, h * 0.5 + Math.cos(i * 0.15 + 1) * h * 0.2);
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    },
};

// ─── Plate ───
function drawPlate(cx, y) {
    const pw = ING_W + 50;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, y + 12, pw / 2, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Plate base
    let pg = ctx.createLinearGradient(cx - pw / 2, y, cx + pw / 2, y);
    pg.addColorStop(0, '#607D8B'); pg.addColorStop(0.5, '#90A4AE'); pg.addColorStop(1, '#607D8B');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(cx, y + 6, pw / 2, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Plate top
    pg = ctx.createRadialGradient(cx, y, 5, cx, y, pw / 2);
    pg.addColorStop(0, '#B0BEC5'); pg.addColorStop(1, '#78909C');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(cx, y, pw / 2 - 3, 8, 0, 0, Math.PI * 2); ctx.fill();
    // Rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, y - 1, pw / 2 - 6, 5, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
}

// ─── Background ───
function drawBG() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d1117'); g.addColorStop(0.4, '#161b22'); g.addColorStop(1, '#0d1117');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Side borders
    const bw = 3;
    const bg = ctx.createLinearGradient(0, 0, bw, 0);
    bg.addColorStop(0, 'rgba(255,150,50,0.15)'); bg.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, bw, H);
    const bg2 = ctx.createLinearGradient(W, 0, W - bw, 0);
    bg2.addColorStop(0, 'rgba(255,150,50,0.15)'); bg2.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = bg2; ctx.fillRect(W - bw, 0, bw, H);
}

function drawInstMeter() {
    const mx = 10, my = H - 165, mw = 10, mh = 130;
    const fill = Math.min(1, Math.abs(cumulativeLean) / MAX_LEAN);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(mx - 1, my - 1, mw + 2, mh + 2, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; rr(mx, my, mw, mh, 4); ctx.fill();
    const fg = ctx.createLinearGradient(0, my + mh, 0, my);
    fg.addColorStop(0, '#4CAF50'); fg.addColorStop(0.5, '#FFEB3B'); fg.addColorStop(1, '#F44336');
    ctx.fillStyle = fg;
    const fh = mh * fill;
    if (fh > 1) { rr(mx, my + mh - fh, mw, fh, 4); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('⚠', mx + mw / 2, my - 6);
    if (Math.abs(cumulativeLean) > 20) {
        ctx.fillStyle = fill > 0.7 ? '#F44336' : '#FFEB3B';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(cumulativeLean > 0 ? '→' : '←', mx + mw / 2, my + mh + 15);
    }
}

// ─── Game ───
function startGame() {
    gameState = 'playing'; score = 0; level = 0; combo = 0; maxCombo = 0;
    perfectCount = 0; cumulativeLean = 0; swayAngle = 0; swayVel = 0;
    cameraY = 0; targetCamY = 0; stack = []; particles = []; colPieces = [];
    moveSpd = SPD_BASE; resultShown = false;
    dogActive = false; dogPhase = 'hidden'; dropsSinceDog = 0;
    showScreen('game');
    resize();
    stack.push({ ingredient: BOTTOM_BUN, height: BOTTOM_BUN.height, offX: 0 });
    spawnIng(); updateHUD();
}

function spawnIng() {
    const ing = INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
    curIng = { x: W / 2 - ING_W / 2, sY: 65, w: ING_W, h: ing.height, ing };
    moveDir = Math.random() > 0.5 ? 1 : -1; fallIng = null;
}

function dropIng() {
    if (gameState !== 'playing' || !curIng) return;
    gameState = 'dropping'; playDropSound();
    const ps = stackPos(), top = ps[ps.length - 1];
    fallIng = { x: curIng.x, wY: curIng.sY + cameraY, vy: 0, w: curIng.w, h: curIng.h,
        ing: curIng.ing, tY: top.y - curIng.h, tCX: top.cx };
    curIng = null;
}

function landIng() {
    const fi = fallIng, fcx = fi.x + fi.w / 2;
    const rawOff = fcx - fi.tCX;
    const maxOff = ING_W * 0.4;
    const off = Math.max(-maxOff, Math.min(maxOff, rawOff));
    const absOff = Math.abs(rawOff);

    stack.push({ ingredient: fi.ing, height: fi.h, offX: off });
    level++; cumulativeLean += off;
    playLandSound();

    const ps = stackPos(), lp = ps[ps.length - 1];
    const px = lp.cx, py = lp.y;

    if (absOff <= PERFECT_TH) {
        combo++; if (combo > maxCombo) maxCombo = combo; perfectCount++;
        score += BASE_PTS + combo * COMBO_MUL + level * 10;
        cumulativeLean *= 0.8;
        playPerfectSound(); showPraise(speakPraise(), '#FFD700');
        spawnStars(px, py - cameraY);
    } else if (absOff <= OK_TH) {
        combo = 0;
        const pts = Math.max(10, Math.round((OK_TH - absOff) / OK_TH * 50) + level * 3);
        score += pts; showPraise('+' + pts, '#90CAF9');
        spawnP(px, py - cameraY, '#FFB74D', 6);
    } else if (absOff <= MISS_TH) {
        combo = 0; showPraise('Неровно!', '#FF8A65');
        spawnP(px, py - cameraY, '#FF5252', 8);
    } else {
        combo = 0; showPraise('Криво!', '#FF5252');
        spawnP(px, py - cameraY, '#FF5252', 12);
    }

    targetCamY = Math.min(0, lp.y - H * 0.75);
    moveSpd = Math.min(SPD_MAX, SPD_BASE + level * SPD_INC);
    fallIng = null; updateHUD();

    dropsSinceDog++;
    if (Math.abs(cumulativeLean) >= MAX_LEAN) startCollapse();
    else {
        // Maybe summon dog
        if (dropsSinceDog >= DOG_INTERVAL && stack.length > DOG_EAT_LAYERS + 2 && !dogActive) {
            summonDog();
        } else {
            gameState = 'playing'; spawnIng();
        }
    }
}

function startCollapse() {
    gameState = 'collapsing'; playCollapseSound(); colPieces = [];
    const ps = stackPos();
    for (let i = ps.length - 1; i >= 1; i--) {
        const p = ps[i];
        colPieces.push({ x: p.x, y: p.y, w: p.w, h: p.h, ing: p.ing,
            vx: (Math.random() - 0.5) * 8 + (cumulativeLean > 0 ? 2 : -2),
            vy: -Math.random() * 4 - 1, va: (Math.random() - 0.5) * 0.2, a: 0 });
    }
    setTimeout(() => { playGameOverSound(); setTimeout(() => { if (!resultShown) showResult(); }, 1000); }, 1200);
}

function showResult() {
    if (resultShown) return; resultShown = true; gameState = 'gameover';
    const lb = saveLB(playerName, score, level);
    document.getElementById('result-score').textContent = score;
    document.getElementById('result-levels').textContent = level;
    document.getElementById('result-perfect').textContent = perfectCount;
    document.getElementById('result-combo').textContent = maxCombo;
    const rank = lb.findIndex(e => e.name === playerName && e.score === score) + 1;
    const re = document.getElementById('result-rank');
    if (rank === 1) { re.textContent = '🏆 Новый рекорд! 1-е место!'; re.style.display = ''; }
    else if (rank <= 3) { re.textContent = `🥈 ${rank}-е место!`; re.style.display = ''; }
    else if (rank <= 10) { re.textContent = `Топ ${rank} в рейтинге`; re.style.display = ''; }
    else re.style.display = 'none';
    document.getElementById('result-title').textContent =
        Math.abs(cumulativeLean) >= MAX_LEAN ? '💥 Бургер развалился!' : '🍔 Отличный бургер!';
    showScreen('result');
}

// ─── Dog mechanic ───
function playBarkSound() {
    playTone(180, 0.08, 'sawtooth', 0.15);
    setTimeout(() => playTone(220, 0.1, 'sawtooth', 0.15), 100);
}
function playMunchSound() {
    for (let i = 0; i < 3; i++) setTimeout(() => playTone(120 + i * 30, 0.06, 'square', 0.1), i * 80);
}

function summonDog() {
    dogActive = true; dogPhase = 'rising';
    dogY = H + 100; // start below screen
    const ps = stackPos();
    // Target: rise up to the plate level
    dogTargetY = plateBaseY - cameraY;
    dogMouthOpen = 0;
    dogEatTimer = 0;
    gameState = 'dog';
    playBarkSound();
    showPraise('🐕 Ав-ав!', '#FFB74D');
}

function dogEatLayers() {
    const toEat = Math.min(DOG_EAT_LAYERS, stack.length - 1);
    if (toEat <= 0) return;
    // Remove bottom layers (after the plate bun), create particles for eaten ones
    const ps = stackPos();
    for (let i = 1; i <= toEat; i++) {
        if (ps[i]) spawnP(ps[i].cx, ps[i].y - cameraY, '#FFB74D', 5);
    }
    stack.splice(1, toEat);
    // Reduce lean since bottom wobbles are gone
    cumulativeLean *= 0.4;
    playMunchSound();
    dropsSinceDog = 0;
}

function drawDog(screenY) {
    const cx = W / 2, w = 100, h = 80;
    const y = screenY;
    ctx.save();
    ctx.translate(cx, y);

    // Body (below the head, peeking from bottom)
    ctx.fillStyle = '#8B6914';
    ctx.beginPath();
    ctx.ellipse(0, 30, 50, 35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    const headG = ctx.createRadialGradient(-5, -5, 5, 0, 0, 40);
    headG.addColorStop(0, '#C49A2A'); headG.addColorStop(1, '#8B6914');
    ctx.fillStyle = headG;
    ctx.beginPath();
    ctx.ellipse(0, -5, 40, 32, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears (floppy)
    ctx.fillStyle = '#6B4E0A';
    ctx.beginPath(); ctx.ellipse(-32, -15, 14, 22, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(32, -15, 14, 22, 0.3, 0, Math.PI * 2); ctx.fill();

    // Snout
    ctx.fillStyle = '#D4A843';
    ctx.beginPath(); ctx.ellipse(0, 8, 22, 16, 0, 0, Math.PI * 2); ctx.fill();

    // Mouth (opens when eating)
    const mouthOpen = dogMouthOpen;
    if (mouthOpen > 0) {
        ctx.fillStyle = '#C62828';
        ctx.beginPath(); ctx.ellipse(0, 14 + mouthOpen * 4, 15, 5 + mouthOpen * 8, 0, 0, Math.PI * 2); ctx.fill();
        // Tongue
        ctx.fillStyle = '#FF5252';
        ctx.beginPath(); ctx.ellipse(0, 18 + mouthOpen * 6, 8, 4 + mouthOpen * 3, 0, 0, Math.PI); ctx.fill();
    }

    // Nose
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.ellipse(-2, -2, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(-14, -12, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -12, 5.5, 0, Math.PI * 2); ctx.fill();
    // Eye highlights
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-12, -14, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(16, -14, 2, 0, Math.PI * 2); ctx.fill();
    // Pupils (looking up at burger)
    ctx.fillStyle = '#444';
    ctx.beginPath(); ctx.arc(-14, -14, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -14, 2.5, 0, Math.PI * 2); ctx.fill();

    // Eyebrows (happy)
    ctx.strokeStyle = '#6B4E0A'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-14, -18, 8, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    ctx.beginPath(); ctx.arc(14, -18, 8, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();

    ctx.restore();
}

function updateDog() {
    if (!dogActive) return;
    if (dogPhase === 'rising') {
        dogY -= 4;
        const target = plateBaseY - cameraY + 10;
        if (dogY <= target) {
            dogY = target;
            dogPhase = 'eating';
            dogEatTimer = 0;
        }
    } else if (dogPhase === 'eating') {
        dogEatTimer++;
        dogMouthOpen = Math.min(1, dogEatTimer / 15);
        if (dogEatTimer === 25) {
            dogEatLayers();
        }
        if (dogEatTimer > 50) {
            dogPhase = 'leaving';
            dogMouthOpen = 0;
        }
    } else if (dogPhase === 'leaving') {
        dogY += 5;
        if (dogY > H + 100) {
            dogActive = false;
            dogPhase = 'hidden';
            // Update camera for new stack height
            const ps = stackPos();
            if (ps.length > 0) {
                const lp = ps[ps.length - 1];
                targetCamY = Math.min(0, lp.y - H * 0.75);
            }
            gameState = 'playing';
            spawnIng();
        }
    }
}

// ─── Loop ───
function update() {
    cameraY += (targetCamY - cameraY) * CAM_SMOOTH;
    if (stack.length > 1 && gameState !== 'collapsing' && gameState !== 'gameover') {
        const lf = cumulativeLean / MAX_LEAN;
        const ns = Math.sin(Date.now() * 0.0015) * 0.02 * (1 + Math.abs(lf) * 3);
        const ta = lf * 0.15 + ns;
        swayVel += (ta - swayAngle) * 0.03; swayVel *= SWAY_FRICTION; swayAngle += swayVel;
    }
    if (gameState === 'playing' && curIng) {
        curIng.x += moveSpd * moveDir;
        const ps = stackPos(), top = ps[ps.length - 1];
        const scx = top ? top.cx : W / 2;
        const lb = Math.max(5, scx - MOVE_RANGE - ING_W / 2);
        const rb = Math.min(W - 5 - ING_W, scx + MOVE_RANGE - ING_W / 2);
        if (curIng.x <= lb) { curIng.x = lb; moveDir = 1; }
        if (curIng.x >= rb) { curIng.x = rb; moveDir = -1; }
    }
    if (fallIng && (gameState === 'dropping' || gameState === 'topbun')) {
        fallIng.vy += GRAVITY; fallIng.wY += fallIng.vy;
        if (fallIng.wY >= fallIng.tY) { fallIng.wY = fallIng.tY; fallIng.isTop ? landTopBun() : landIng(); }
    }
    if (gameState === 'collapsing') for (const p of colPieces) { p.vy += 0.5; p.x += p.vx; p.y += p.vy; p.a += p.va; }
    updateDog();
    updateParticles();
}

function landTopBun() {
    stack.push({ ingredient: fallIng.ing, height: fallIng.h, offX: 0 });
    fallIng = null; playPerfectSound();
    const ps = stackPos(), tp = ps[ps.length - 1];
    spawnStars(tp.cx, tp.y - cameraY);
    setTimeout(() => showResult(), 800);
}

function draw() {
    drawBG();
    const ps = stackPos();
    if (ps.length > 0) drawPlate(W / 2, plateBaseY - cameraY);

    ctx.save();
    const pvX = W / 2, pvY = plateBaseY - cameraY;
    ctx.translate(pvX, pvY); ctx.rotate(swayAngle); ctx.translate(-pvX, -pvY);
    for (const p of ps) drawIng(p.x, p.y - cameraY, p.w, p.h, p.ing);
    if (fallIng && (gameState === 'dropping' || gameState === 'topbun'))
        drawIng(fallIng.x, fallIng.wY - cameraY, fallIng.w, fallIng.h, fallIng.ing);
    ctx.restore();

    if (gameState === 'collapsing') for (const p of colPieces) drawIng(p.x, p.y - cameraY, p.w, p.h, p.ing, p.a);

    if (curIng && gameState === 'playing') {
        ctx.save();
        // Subtle guide
        const cx = curIng.x + curIng.w / 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.setLineDash([3, 6]);
        ctx.beginPath(); ctx.moveTo(cx, curIng.sY + curIng.h); ctx.lineTo(cx, H); ctx.stroke();
        ctx.setLineDash([]);
        // Target zone
        if (ps.length > 0) {
            const tp = ps[ps.length - 1];
            ctx.strokeStyle = 'rgba(76,175,80,0.12)'; ctx.lineWidth = PERFECT_TH * 2;
            ctx.beginPath(); ctx.moveTo(tp.cx, curIng.sY + curIng.h + 10); ctx.lineTo(tp.cx, tp.y - cameraY); ctx.stroke();
            ctx.lineWidth = 1;
        }
        ctx.restore();
        drawIng(curIng.x, curIng.sY, curIng.w, curIng.h, curIng.ing);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '12px "Segoe UI",sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(curIng.ing.name, curIng.x + curIng.w / 2, curIng.sY - 6);
    }
    if (gameState === 'playing' || gameState === 'dropping' || gameState === 'dog') drawInstMeter();
    // Draw dog
    if (dogActive) drawDog(dogY);
    drawParticles();
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

// ─── Input ───
function handleDrop() { if (gameState === 'playing' && curIng) dropIng(); }
canvas.addEventListener('click', e => { e.preventDefault(); handleDrop(); });
canvas.addEventListener('touchstart', e => { e.preventDefault(); handleDrop(); }, { passive: false });
document.addEventListener('keydown', e => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); handleDrop(); } });

// ─── UI ───
document.getElementById('btn-play').addEventListener('click', () => {
    playerName = document.getElementById('player-name').value.trim() || 'Игрок';
    localStorage.setItem('burger_pn', playerName); startGame();
});
document.getElementById('player-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-play').click(); });
document.getElementById('btn-leaderboard').addEventListener('click', () => { renderLB(); showScreen('leaderboard'); });
document.getElementById('btn-back-start').addEventListener('click', () => showScreen('start'));
document.getElementById('btn-retry').addEventListener('click', () => startGame());
document.getElementById('btn-result-leaderboard').addEventListener('click', () => { renderLB(score); showScreen('leaderboard'); });
document.getElementById('btn-result-menu').addEventListener('click', () => showScreen('start'));

// ─── Yandex Games SDK ───
let ysdk = null;
function initSDK() {
    if (typeof YaGames === 'undefined') return;
    YaGames.init().then(sdk => { ysdk = sdk; sdk.features.LoadingAPI.ready(); }).catch(() => {});
}

// ─── Init ───
document.getElementById('player-name').value = localStorage.getItem('burger_pn') || '';
showScreen('start'); loop(); initSDK();
