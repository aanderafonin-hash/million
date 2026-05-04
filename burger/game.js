/* ==========================================
   Бургер Башня — HTML5 Game for Yandex Games
   v2: Juicy visuals + addictive mechanics
   ========================================== */

// ─── Audio Context ───
let audioCtx = null;
let soundMuted = false;
let gamePaused = false;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playTone(freq, dur, type = 'sine', vol = 0.15) {
    if (soundMuted) return;
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
function playFeverSound() {
    playTone(660, 0.08, 'sine', 0.25);
    setTimeout(() => playTone(880, 0.08, 'sine', 0.25), 60);
    setTimeout(() => playTone(1100, 0.08, 'sine', 0.25), 120);
    setTimeout(() => playTone(1320, 0.15, 'sine', 0.3), 180);
}
function playMilestoneSound() {
    [523,659,784,1047,1175].forEach((f,i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.22), i * 100));
}
function playRecordSound() {
    [784,880,1047,1175,1320,1568].forEach((f,i) => setTimeout(() => playTone(f, 0.12, 'sine', 0.25), i * 80));
}
function playComboTick(c) {
    playTone(400 + c * 80, 0.06, 'sine', 0.18);
}

// ─── Speech Praise ───
const PRAISES = [
    { text: 'Класс!!', lang: 'ru-RU' }, { text: 'Ты супер!!', lang: 'ru-RU' },
    { text: 'Обалденно!!', lang: 'ru-RU' }, { text: 'Ты шеф-повар!!', lang: 'ru-RU' },
    { text: 'Я восхищаюсь тобой!!', lang: 'ru-RU' }, { text: 'Невероятно!!', lang: 'ru-RU' },
    { text: 'Ты гений кухни!!', lang: 'ru-RU' }, { text: 'Вот это да!!', lang: 'ru-RU' },
    { text: 'Потрясающе!!', lang: 'ru-RU' }, { text: 'Великолепно!!', lang: 'ru-RU' },
    { text: 'Шедевр!!', lang: 'ru-RU' }, { text: 'Бомба!!', lang: 'ru-RU' },
    { text: 'Красавчик!!', lang: 'ru-RU' }, { text: 'Мастер!!', lang: 'ru-RU' },
    { text: 'Вкуснотища!!', lang: 'ru-RU' }, { text: 'Идеально!!', lang: 'ru-RU' },
    { text: '대박!!', lang: 'ko-KR' }, { text: '완벽해!!', lang: 'ko-KR' }, { text: '최고!!', lang: 'ko-KR' },
    { text: '太棒了!!', lang: 'zh-CN' }, { text: '完美!!', lang: 'zh-CN' }, { text: '厉害!!', lang: 'zh-CN' },
    { text: 'Amazing!!', lang: 'en-US' }, { text: 'Awesome!!', lang: 'en-US' }, { text: 'Incredible!!', lang: 'en-US' },
    { text: 'すごい!!', lang: 'ja-JP' }, { text: '完璧!!', lang: 'ja-JP' },
    { text: '¡Increíble!!', lang: 'es-ES' }, { text: 'Magnifique!!', lang: 'fr-FR' },
    { text: 'Fantastico!!', lang: 'it-IT' }, { text: 'Wahnsinn!!', lang: 'de-DE' },
];

const FEVER_PRAISES = [
    'FEVER!!! 🔥', 'ГОРИМ!!! 🔥', 'ОГОНЬ!!! 🔥', 'ON FIRE!!! 🔥',
    '불타오르네!!! 🔥', '燃えてる!!! 🔥', '太火了!!! 🔥',
];

const MILESTONE_PRAISES = [
    '10 этажей! 🏗️', '20 этажей! 🏢', '30 этажей! 🏰', '40 этажей! 🗼',
    '50 этажей! 🌟', '60 этажей! ⭐', '70 этажей! 💫', '80 этажей! 🌈',
    '90 этажей! 🚀', '100 этажей! 👑',
];

function speakPraise() {
    try {
        const p = PRAISES[Math.floor(Math.random() * PRAISES.length)];
        if (!soundMuted) {
            const u = new SpeechSynthesisUtterance(p.text);
            u.lang = p.lang; u.rate = 1.3; u.pitch = 1.4; u.volume = 1.0;
            speechSynthesis.cancel(); speechSynthesis.speak(u);
        }
        return p.text;
    } catch (e) { return PRAISES[Math.floor(Math.random() * PRAISES.length)].text; }
}

// ─── Ingredients (taller/chunkier for juicy look) ───
const INGREDIENTS = [
    { name: 'Котлета', height: 32, pattern: 'patty' },
    { name: 'Листья салата', height: 22, pattern: 'lettuce' },
    { name: 'Сыр', height: 18, pattern: 'cheese' },
    { name: 'Помидор', height: 22, pattern: 'tomato' },
    { name: 'Лук', height: 18, pattern: 'onion' },
    { name: 'Соус', height: 14, pattern: 'sauce' },
    { name: 'Яйцо', height: 26, pattern: 'egg' },
    { name: 'Бекон', height: 20, pattern: 'bacon' },
    { name: 'Огурчики', height: 18, pattern: 'pickle' },
    { name: 'Салат', height: 22, pattern: 'salad' },
];
const BOTTOM_BUN = { name: 'Нижняя булка', height: 34, pattern: 'bun_bottom' };
const TOP_BUN = { name: 'Верхняя булка', height: 38, pattern: 'bun_top' };

// ─── Constants ───
const ING_W = 130;
const PERFECT_TH = 10;
const OK_TH = 35;
const MISS_TH = 70;
const GRAVITY = 0.6;
const MAX_LEAN = 70;
const DOG_INTERVAL = 15;
const DOG_EAT_LAYERS = 5;
const SWAY_FRICTION = 0.96;
const BASE_PTS = 100;
const COMBO_MUL = 25;
const SPD_BASE = 1.8;
const SPD_INC = 0.08;
const SPD_MAX = 5.5;
const CAM_SMOOTH = 0.07;
const PLATE_OFF = 80;
const MOVE_RANGE = 160;
const FEVER_COMBO = 5;
const GOLDEN_CHANCE = 0.08;

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
let dogActive = false, dogX = 0, dogY = 0, dogTargetY = 0, dogPhase = 'hidden';
let dogEatTimer = 0, dropsSinceDog = 0, dogMouthOpen = 0, dogDir = 1;
// Fever & addiction
let fever = false, feverTimer = 0, feverGlow = 0;
let personalBest = parseInt(localStorage.getItem('burger_pb') || '0');
let bestFloors = parseInt(localStorage.getItem('burger_bf') || '0');
let isNewRecord = false;
let shakeX = 0, shakeY = 0, shakeIntensity = 0;
let isGolden = false;
let floatingTexts = [];
let juiceDrops = [];
let bgPulse = 0;
let frameCount = 0;
let deathCount = parseInt(localStorage.getItem('burger_deaths') || '0');
let usedSecondLife = false;
let scoreTripled = false;

// ─── Ad System ───
function showRewardedAd(onSuccess, onFail) {
    if (ysdk) {
        try {
            ysdk.adv.showRewardedVideo({
                callbacks: {
                    onOpen: () => { if (audioCtx) audioCtx.suspend(); speechSynthesis.cancel(); },
                    onRewarded: () => { if (onSuccess) onSuccess(); },
                    onClose: () => { if (!soundMuted && audioCtx) audioCtx.resume(); },
                    onError: () => { if (onFail) onFail(); if (!soundMuted && audioCtx) audioCtx.resume(); }
                }
            });
        } catch(e) { if (onSuccess) onSuccess(); }
    } else {
        if (onSuccess) onSuccess();
    }
}

function showInterstitialAd(onComplete) {
    if (ysdk) {
        try {
            ysdk.adv.showFullscreenAdv({
                callbacks: {
                    onOpen: () => { if (audioCtx) audioCtx.suspend(); speechSynthesis.cancel(); },
                    onClose: (wasShown) => { if (!soundMuted && audioCtx) audioCtx.resume(); if (onComplete) onComplete(); },
                    onError: () => { if (!soundMuted && audioCtx) audioCtx.resume(); if (onComplete) onComplete(); }
                }
            });
        } catch(e) { if (onComplete) onComplete(); }
    } else {
        if (onComplete) onComplete();
    }
}

// ─── XP / Level System ───
const LEVEL_TITLES = [
    { minLvl: 0, title: 'Новичок', icon: '🍳' },
    { minLvl: 3, title: 'Стажёр', icon: '👨‍🍳' },
    { minLvl: 6, title: 'Повар', icon: '🔪' },
    { minLvl: 10, title: 'Шеф-повар', icon: '👨‍🍳' },
    { minLvl: 15, title: 'Су-шеф', icon: '⭐' },
    { minLvl: 20, title: 'Мастер бургеров', icon: '🏆' },
    { minLvl: 30, title: 'Гуру кухни', icon: '👑' },
    { minLvl: 40, title: 'Легенда', icon: '🌟' },
    { minLvl: 50, title: 'Бог бургеров', icon: '💎' },
];

function getXPForLevel(lvl) { return 100 + lvl * 50; }

function loadPlayerProgress() {
    try {
        return JSON.parse(localStorage.getItem('burger_progress') || '{}');
    } catch { return {}; }
}

function savePlayerProgress(data) {
    localStorage.setItem('burger_progress', JSON.stringify(data));
}

function getPlayerLevel() {
    const p = loadPlayerProgress();
    return { level: p.level || 0, xp: p.xp || 0, totalXP: p.totalXP || 0 };
}

function addXP(amount) {
    const p = loadPlayerProgress();
    let lvl = p.level || 0;
    let xp = (p.xp || 0) + amount;
    let totalXP = (p.totalXP || 0) + amount;
    let leveledUp = false;
    while (xp >= getXPForLevel(lvl)) {
        xp -= getXPForLevel(lvl);
        lvl++;
        leveledUp = true;
    }
    savePlayerProgress({ ...p, level: lvl, xp, totalXP });
    return { level: lvl, xp, totalXP, leveledUp };
}

function getLevelTitle(lvl) {
    let t = LEVEL_TITLES[0];
    for (const lt of LEVEL_TITLES) { if (lvl >= lt.minLvl) t = lt; }
    return t;
}

function updateLevelBadge() {
    const pl = getPlayerLevel();
    const t = getLevelTitle(pl.level);
    const badge = document.getElementById('start-level-badge');
    const titleEl = document.getElementById('start-level-title');
    const xpBar = document.getElementById('start-xp-bar');
    if (badge) {
        badge.style.display = 'flex';
        badge.querySelector('.level-icon').textContent = t.icon;
        titleEl.textContent = `Ур. ${pl.level} — ${t.title}`;
        const needed = getXPForLevel(pl.level);
        xpBar.style.width = Math.min(100, (pl.xp / needed) * 100) + '%';
    }
}

// ─── Streak System ───
function getStreak() {
    try {
        const data = JSON.parse(localStorage.getItem('burger_streak') || '{}');
        return { count: data.count || 0, lastDate: data.lastDate || '' };
    } catch { return { count: 0, lastDate: '' }; }
}

function updateStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const s = getStreak();
    if (s.lastDate === today) return s;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let newCount = (s.lastDate === yesterday) ? s.count + 1 : 1;
    const data = { count: newCount, lastDate: today };
    localStorage.setItem('burger_streak', JSON.stringify(data));
    return data;
}

function displayStreak() {
    const s = getStreak();
    const el = document.getElementById('start-streak');
    if (el && s.count > 0) {
        el.style.display = '';
        const flames = '🔥'.repeat(Math.min(s.count, 7));
        const bonus = s.count >= 7 ? ' (+50% XP!)' : s.count >= 3 ? ' (+25% XP!)' : '';
        el.textContent = `${flames} ${s.count} ${s.count === 1 ? 'день' : s.count < 5 ? 'дня' : 'дней'} подряд${bonus}`;
    }
}

function getStreakMultiplier() {
    const s = getStreak();
    if (s.count >= 7) return 1.5;
    if (s.count >= 3) return 1.25;
    return 1;
}

// ─── Daily Quests System ───
const QUEST_TEMPLATES = [
    { id: 'score_500', title: 'Набери 500 очков', icon: '🎯', target: 500, stat: 'score', reward: 50 },
    { id: 'score_1000', title: 'Набери 1000 очков', icon: '🎯', target: 1000, stat: 'score', reward: 100 },
    { id: 'perfect_3', title: 'Сделай 3 идеальных попадания', icon: '✨', target: 3, stat: 'perfects', reward: 40 },
    { id: 'perfect_10', title: 'Сделай 10 идеальных попаданий', icon: '✨', target: 10, stat: 'perfects', reward: 80 },
    { id: 'floors_10', title: 'Построй 10 этажей', icon: '🏗️', target: 10, stat: 'floors', reward: 40 },
    { id: 'floors_20', title: 'Построй 20 этажей', icon: '🏢', target: 20, stat: 'floors', reward: 80 },
    { id: 'fever_1', title: 'Активируй Fever Mode', icon: '🔥', target: 1, stat: 'fevers', reward: 60 },
    { id: 'fever_3', title: 'Активируй Fever Mode 3 раза', icon: '🔥', target: 3, stat: 'fevers', reward: 120 },
    { id: 'combo_5', title: 'Достигни комбо x5', icon: '💥', target: 5, stat: 'maxCombo', reward: 50 },
    { id: 'combo_10', title: 'Достигни комбо x10', icon: '💥', target: 10, stat: 'maxCombo', reward: 100 },
    { id: 'golden_1', title: 'Поймай золотой ингредиент', icon: '⭐', target: 1, stat: 'goldens', reward: 60 },
    { id: 'games_3', title: 'Сыграй 3 раза', icon: '🎮', target: 3, stat: 'games', reward: 30 },
    { id: 'games_5', title: 'Сыграй 5 раз', icon: '🎮', target: 5, stat: 'games', reward: 60 },
];

function getTodayKey() { return new Date().toISOString().slice(0, 10); }

function loadQuests() {
    try {
        const data = JSON.parse(localStorage.getItem('burger_quests') || '{}');
        if (data.date !== getTodayKey()) return generateDailyQuests();
        return data;
    } catch { return generateDailyQuests(); }
}

function generateDailyQuests() {
    const shuffled = [...QUEST_TEMPLATES].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 3);
    const data = {
        date: getTodayKey(),
        quests: picked.map(q => ({ ...q, progress: 0, claimed: false })),
        sessionStats: { score: 0, perfects: 0, floors: 0, fevers: 0, maxCombo: 0, goldens: 0, games: 0 }
    };
    localStorage.setItem('burger_quests', JSON.stringify(data));
    return data;
}

function saveQuests(data) {
    localStorage.setItem('burger_quests', JSON.stringify(data));
}

function updateQuestProgress(stats) {
    const data = loadQuests();
    const ss = data.sessionStats;
    ss.score = Math.max(ss.score, stats.score || 0);
    ss.perfects += stats.perfects || 0;
    ss.floors += stats.floors || 0;
    ss.fevers += stats.fevers || 0;
    ss.maxCombo = Math.max(ss.maxCombo, stats.maxCombo || 0);
    ss.goldens += stats.goldens || 0;
    ss.games += stats.games || 0;

    let completed = [];
    for (const q of data.quests) {
        if (q.claimed) continue;
        let val = 0;
        if (q.stat === 'score') val = ss.score;
        else if (q.stat === 'perfects') val = ss.perfects;
        else if (q.stat === 'floors') val = ss.floors;
        else if (q.stat === 'fevers') val = ss.fevers;
        else if (q.stat === 'maxCombo') val = ss.maxCombo;
        else if (q.stat === 'goldens') val = ss.goldens;
        else if (q.stat === 'games') val = ss.games;
        q.progress = Math.min(val, q.target);
        if (q.progress >= q.target && !q.claimed) {
            q.claimed = true;
            completed.push(q);
            addXP(q.reward);
        }
    }
    saveQuests(data);
    return completed;
}

function renderQuestsScreen() {
    const data = loadQuests();
    const el = document.getElementById('quests-list');
    el.innerHTML = data.quests.map(q => {
        const pct = Math.min(100, (q.progress / q.target) * 100);
        const done = q.claimed;
        return `<div class="quest-item${done ? ' completed' : ''}">
            <div class="quest-icon">${done ? '✅' : q.icon}</div>
            <div class="quest-info">
                <div class="quest-title">${q.title}</div>
                <div class="quest-progress">${q.progress}/${q.target}</div>
                <div class="quest-progress-bar"><div class="quest-progress-fill" style="width:${pct}%"></div></div>
            </div>
            <div class="quest-reward">${done ? 'Получено' : '+' + q.reward + ' XP'}</div>
        </div>`;
    }).join('');

    const streakEl = document.getElementById('streak-info');
    const s = getStreak();
    if (streakEl) {
        const flames = '🔥'.repeat(Math.min(s.count, 7));
        const mul = getStreakMultiplier();
        streakEl.innerHTML = `<b>${flames} Серия: ${s.count} ${s.count === 1 ? 'день' : s.count < 5 ? 'дня' : 'дней'}</b><br>` +
            (mul > 1 ? `Бонус XP: x${mul}` : 'Играй каждый день для бонуса XP!');
    }
}

// Track stats for current game session
let sessionFevers = 0, sessionGoldens = 0;

// ─── Background visual system ───
const bgStars = [];
const bgBokeh = [];
const ambientParticles = [];
let impactRings = [];
let dropTrail = [];
let bgHue = 220;

function initBGEffects() {
    bgStars.length = 0; bgBokeh.length = 0;
    for (let i = 0; i < 60; i++) {
        bgStars.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.5, tw: Math.random() * Math.PI * 2, spd: 0.02 + Math.random() * 0.04 });
    }
    for (let i = 0; i < 12; i++) {
        bgBokeh.push({ x: Math.random(), y: Math.random(), r: 15 + Math.random() * 40, vx: (Math.random() - 0.5) * 0.0003, vy: -0.0001 - Math.random() * 0.0003, alpha: 0.03 + Math.random() * 0.06, hue: 20 + Math.random() * 30 });
    }
}
initBGEffects();

function spawnAmbient() {
    if (ambientParticles.length > 25) return;
    ambientParticles.push({ x: Math.random() * W, y: H + 5, vy: -0.3 - Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.3, s: 1 + Math.random() * 2, alpha: 0.2 + Math.random() * 0.3, hue: 30 + Math.random() * 30 });
}
function updateAmbient() {
    if (frameCount % 8 === 0) spawnAmbient();
    for (let i = ambientParticles.length - 1; i >= 0; i--) {
        const p = ambientParticles[i];
        p.y += p.vy; p.x += p.vx; p.alpha -= 0.001;
        if (p.y < -10 || p.alpha <= 0) ambientParticles.splice(i, 1);
    }
}
function drawAmbient() {
    for (const p of ambientParticles) {
        ctx.globalAlpha = p.alpha * 0.5;
        ctx.fillStyle = `hsl(${p.hue},80%,70%)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = p.alpha * 0.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function addImpactRing(x, y) {
    impactRings.push({ x, y, r: 5, maxR: 50 + Math.random() * 30, alpha: 0.6, color: fever ? '#FF6B35' : '#FFD700' });
}
function updateImpactRings() {
    for (let i = impactRings.length - 1; i >= 0; i--) {
        const ring = impactRings[i];
        ring.r += 2.5; ring.alpha -= 0.025;
        if (ring.alpha <= 0 || ring.r >= ring.maxR) impactRings.splice(i, 1);
    }
}
function drawImpactRings() {
    for (const ring of impactRings) {
        ctx.globalAlpha = ring.alpha;
        ctx.strokeStyle = ring.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function addDropTrail(x, y, w, h) {
    for (let i = 0; i < 2; i++) {
        dropTrail.push({ x: x + w * 0.2 + Math.random() * w * 0.6, y: y + h / 2, alpha: 0.4, s: 2 + Math.random() * 3 });
    }
}
function updateDropTrail() {
    for (let i = dropTrail.length - 1; i >= 0; i--) {
        const t = dropTrail[i];
        t.alpha -= 0.03; t.s *= 0.95;
        if (t.alpha <= 0) dropTrail.splice(i, 1);
    }
}
function drawDropTrail() {
    for (const t of dropTrail) {
        ctx.globalAlpha = t.alpha * 0.5;
        const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.s * 3);
        g.addColorStop(0, fever ? 'rgba(255,100,0,0.5)' : 'rgba(255,215,0,0.4)');
        g.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.s * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
}

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
    quests: document.getElementById('screen-quests'),
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
    const comboEl = document.querySelector('#hud-combo span');
    comboEl.textContent = 'x' + combo;
    // Fever styling
    const feverEl = document.getElementById('hud-fever');
    if (feverEl) {
        feverEl.style.display = fever ? '' : 'none';
    }
    // Best score indicator
    const bestEl = document.getElementById('hud-best');
    if (bestEl) {
        bestEl.querySelector('span').textContent = personalBest;
        bestEl.style.display = personalBest > 0 ? '' : 'none';
    }
}

// ─── Praise ───
let praiseTm;
function showPraise(txt, col = '#FFD700') {
    const el = document.getElementById('praise-popup');
    el.textContent = txt; el.style.color = col; el.className = 'praise visible';
    clearTimeout(praiseTm); praiseTm = setTimeout(() => { el.className = 'praise hidden'; }, 1200);
}

// ─── Floating text (points, combo) ───
function addFloatingText(x, y, text, color, size = 18) {
    floatingTexts.push({ x, y, text, color, size, life: 1, vy: -1.5 });
}
function updateFloatingTexts() {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y += ft.vy; ft.life -= 0.018;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
}
function drawFloatingTexts() {
    for (const ft of floatingTexts) {
        ctx.globalAlpha = ft.life;
        ctx.fillStyle = ft.color;
        ctx.font = `bold ${ft.size}px "Segoe UI",sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;
}

// ─── Screen shake ───
function triggerShake(intensity) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
}
function updateShake() {
    if (shakeIntensity > 0.1) {
        shakeX = (Math.random() - 0.5) * shakeIntensity;
        shakeY = (Math.random() - 0.5) * shakeIntensity;
        shakeIntensity *= 0.88;
    } else {
        shakeX = shakeY = shakeIntensity = 0;
    }
}

// ─── Juice drops (grease dripping from burger) ───
function addJuiceDrop(x, y, color) {
    juiceDrops.push({ x, y, vy: 0.5 + Math.random() * 1.5, size: 2 + Math.random() * 3, color, life: 1 });
}
function updateJuiceDrops() {
    for (let i = juiceDrops.length - 1; i >= 0; i--) {
        const d = juiceDrops[i];
        d.y += d.vy; d.vy += 0.08; d.life -= 0.008;
        if (d.life <= 0 || d.y > H + 50) juiceDrops.splice(i, 1);
    }
}
function drawJuiceDrops() {
    for (const d of juiceDrops) {
        ctx.globalAlpha = d.life * 0.7;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        // Teardrop shape
        ctx.moveTo(d.x, d.y - d.size);
        ctx.quadraticCurveTo(d.x + d.size, d.y, d.x, d.y + d.size * 1.5);
        ctx.quadraticCurveTo(d.x - d.size, d.y, d.x, d.y - d.size);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
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
function spawnFireBurst(x, y) {
    const cols = ['#FF6B35', '#FF4500', '#FFD700', '#FF8C00', '#FFA500'];
    for (let i = 0; i < 25; i++) {
        const a = Math.PI * 2 * Math.random(), s = 2 + Math.random() * 5;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3, sz: Math.random() * 6 + 3, col: cols[Math.floor(Math.random() * cols.length)], life: 1, dec: 0.02 + Math.random() * 0.02, star: Math.random() > 0.5 });
    }
}
function spawnMilestoneExplosion(x, y) {
    const cols = ['#FFD700', '#FF6B35', '#FF4081', '#00E5FF', '#76FF03', '#E040FB', '#FFEB3B'];
    for (let i = 0; i < 40; i++) {
        const a = Math.PI * 2 * i / 40, s = 4 + Math.random() * 6;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, sz: Math.random() * 7 + 3, col: cols[i % cols.length], life: 1.2, dec: 0.01 + Math.random() * 0.01, star: true });
    }
}
function spawnJuiceSplatter(x, y, ingPattern) {
    const colorMap = {
        patty: ['#8B4513', '#6D3A1A', '#A0522D'],
        lettuce: ['#4CAF50', '#66BB6A', '#2E7D32'],
        cheese: ['#FFD54F', '#FFC107', '#FFB300'],
        tomato: ['#F44336', '#EF5350', '#E53935'],
        onion: ['#CE93D8', '#E1BEE7', '#AB47BC'],
        sauce: ['#FF5722', '#FF7043', '#E64A19'],
        egg: ['#FFC107', '#FFEB3B', '#FAFAFA'],
        bacon: ['#C62828', '#B71C1C', '#FF8A80'],
        pickle: ['#66BB6A', '#43A047', '#81C784'],
        salad: ['#81C784', '#4CAF50', '#A5D6A7'],
        bun_bottom: ['#E8A849', '#D49530'],
        bun_top: ['#F0B84A', '#E09830'],
    };
    const cols = colorMap[ingPattern] || ['#FFB74D'];
    for (let i = 0; i < 8; i++) {
        const col = cols[Math.floor(Math.random() * cols.length)];
        particles.push({
            x: x + (Math.random() - 0.5) * ING_W * 0.6,
            y, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 3 - 1,
            sz: Math.random() * 4 + 2, col, life: 1, dec: 0.025 + Math.random() * 0.02
        });
    }
    // Juice drops
    for (let i = 0; i < 3; i++) {
        addJuiceDrop(x + (Math.random() - 0.5) * ING_W * 0.4, y, cols[Math.floor(Math.random() * cols.length)]);
    }
}
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= p.dec; if (p.life <= 0) particles.splice(i, 1); }
}
function drawParticles() {
    for (const p of particles) {
        ctx.globalAlpha = Math.min(1, p.life); ctx.fillStyle = p.col;
        if (p.star) { drawStar(p.x, p.y, p.sz, 5); } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2); ctx.fill(); }
    } ctx.globalAlpha = 1;
}
function drawStar(cx, cy, r, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) { const a = Math.PI * i / pts - Math.PI / 2, rad = i % 2 === 0 ? r : r * 0.4; ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
    ctx.closePath(); ctx.fill();
}

// ─── Fever fire trail particles (continuous during fever) ───
function spawnFeverTrail() {
    if (!fever || !curIng) return;
    const cx = curIng.x + curIng.w / 2;
    const cols = ['#FF6B35', '#FFD700', '#FF4500', '#FFA500'];
    for (let i = 0; i < 2; i++) {
        particles.push({
            x: cx + (Math.random() - 0.5) * 30,
            y: curIng.sY + curIng.h,
            vx: (Math.random() - 0.5) * 2,
            vy: Math.random() * 2 + 1,
            sz: Math.random() * 4 + 2,
            col: cols[Math.floor(Math.random() * cols.length)],
            life: 0.8, dec: 0.03 + Math.random() * 0.02,
            star: Math.random() > 0.6
        });
    }
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
//  REALISTIC JUICY INGREDIENT DRAWING
// ════════════════════════════════════════════

function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function drawIng(x, y, w, h, ing, angle, golden) {
    ctx.save();
    if (angle) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(angle); ctx.translate(-w / 2, -h / 2); }
    else ctx.translate(x, y);

    // Drop shadow (bigger, softer)
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    rr(4, 5, w, h, 10); ctx.fill();

    const fn = DRAW_FNS[ing.pattern] || drawDefault;
    fn(w, h);

    // Golden glow overlay
    if (golden) {
        ctx.globalCompositeOperation = 'source-atop';
        const gg = ctx.createLinearGradient(0, 0, w, h);
        gg.addColorStop(0, 'rgba(255,215,0,0.3)');
        gg.addColorStop(0.5, 'rgba(255,255,100,0.15)');
        gg.addColorStop(1, 'rgba(255,215,0,0.3)');
        ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        // Sparkle border
        ctx.strokeStyle = 'rgba(255,215,0,0.6)'; ctx.lineWidth = 2;
        rr(0, 0, w, h, 10); ctx.stroke();
    }

    ctx.restore();
}

function drawDefault(w, h) { ctx.fillStyle = '#888'; rr(0, 0, w, h, 10); ctx.fill(); }

const DRAW_FNS = {
    bun_bottom(w, h) {
        // Main body with rich golden gradient
        let g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#F0B84A'); g.addColorStop(0.3, '#E8A849');
        g.addColorStop(0.6, '#D49530'); g.addColorStop(1, '#B87A20');
        ctx.fillStyle = g; rr(0, 2, w, h - 2, 10); ctx.fill();
        // Darker bottom crust
        const cg = ctx.createLinearGradient(0, h * 0.7, 0, h);
        cg.addColorStop(0, 'rgba(160,100,20,0)'); cg.addColorStop(1, 'rgba(160,100,20,0.4)');
        ctx.fillStyle = cg; rr(0, 2, w, h - 2, 10); ctx.fill();
        // Flat top edge
        ctx.fillStyle = '#D49530'; ctx.fillRect(4, 0, w - 8, 4);
        // Flour dust spots
        ctx.fillStyle = 'rgba(255,248,225,0.15)';
        for (let i = 0; i < 10; i++) {
            ctx.beginPath(); ctx.arc(8 + Math.random() * (w - 16), 4 + Math.random() * (h - 8), 2 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
        }
        // Sesame seeds (bigger, more realistic with shadow)
        for (let i = 0; i < 7; i++) {
            const sx = 10 + i * (w - 20) / 6, sy = h * 0.3 + (i % 2) * 5;
            // Seed shadow
            ctx.fillStyle = 'rgba(150,100,30,0.3)';
            ctx.save(); ctx.translate(sx + 1, sy + 1); ctx.rotate(0.3 + i * 0.3);
            ctx.beginPath(); ctx.ellipse(0, 0, 3, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            // Seed
            ctx.fillStyle = '#FFF8E1';
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(0.3 + i * 0.3);
            ctx.beginPath(); ctx.ellipse(0, 0, 2.8, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // Gloss highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.ellipse(w * 0.4, h * 0.2, w * 0.28, 5, -0.15, 0, Math.PI * 2); ctx.fill();
    },

    bun_top(w, h) {
        // Dome with rich golden gradient
        let g = ctx.createRadialGradient(w * 0.4, h * 0.3, 5, w / 2, h * 0.5, w * 0.65);
        g.addColorStop(0, '#F5C85C'); g.addColorStop(0.3, '#F0B84A');
        g.addColorStop(0.6, '#E09830'); g.addColorStop(1, '#B87A20');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(3, h); ctx.lineTo(3, h * 0.45);
        ctx.quadraticCurveTo(w / 2, -h * 0.35, w - 3, h * 0.45); ctx.lineTo(w - 3, h); ctx.closePath(); ctx.fill();
        // Bottom crust line
        ctx.fillStyle = '#A06818'; ctx.fillRect(3, h * 0.82, w - 6, h * 0.18);
        // Darker baked edge
        const eg = ctx.createLinearGradient(0, 0, 0, h * 0.15);
        eg.addColorStop(0, 'rgba(180,120,30,0.35)'); eg.addColorStop(1, 'rgba(180,120,30,0)');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.moveTo(10, h * 0.55); ctx.quadraticCurveTo(w / 2, -h * 0.15, w - 10, h * 0.55);
        ctx.lineTo(w - 10, h * 0.7); ctx.quadraticCurveTo(w / 2, h * 0.1, 10, h * 0.7); ctx.closePath(); ctx.fill();
        // Sesame seeds (3D look)
        for (let i = 0; i < 9; i++) {
            const sx = 10 + i * (w - 20) / 8, sy = h * 0.18 + Math.sin(i * 1.2) * 7 + (i % 2) * 5;
            ctx.fillStyle = 'rgba(150,100,30,0.25)';
            ctx.save(); ctx.translate(sx + 1, sy + 1); ctx.rotate(i * 0.4);
            ctx.beginPath(); ctx.ellipse(0, 0, 3, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            ctx.fillStyle = '#FFF8E1';
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(i * 0.4);
            ctx.beginPath(); ctx.ellipse(0, 0, 2.8, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        // Big gloss highlight (wet look)
        const hl = ctx.createRadialGradient(w * 0.35, h * 0.22, 3, w * 0.35, h * 0.22, w * 0.25);
        hl.addColorStop(0, 'rgba(255,255,255,0.28)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.beginPath(); ctx.ellipse(w * 0.35, h * 0.22, w * 0.22, h * 0.14, -0.25, 0, Math.PI * 2); ctx.fill();
    },

    patty(w, h) {
        // Thick juicy patty with multiple gradient layers
        let g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#7D4420'); g.addColorStop(0.2, '#8B4513');
        g.addColorStop(0.5, '#6D3A1A'); g.addColorStop(0.8, '#5C2E0E'); g.addColorStop(1, '#4A2409');
        ctx.fillStyle = g; rr(0, 0, w, h, 12); ctx.fill();
        // Irregular bumpy texture (like real ground meat)
        for (let i = 0; i < 25; i++) {
            const bx = 5 + Math.random() * (w - 10), by = 3 + Math.random() * (h - 6);
            const bs = 3 + Math.random() * 5;
            const br = Math.random() * 0.4;
            ctx.fillStyle = `rgba(${100 + Math.random() * 60}, ${40 + Math.random() * 30}, ${15 + Math.random() * 20}, ${0.3 + br})`;
            ctx.beginPath(); ctx.ellipse(bx, by, bs, bs * 0.6, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
        }
        // Grill marks (darker, charred)
        ctx.strokeStyle = 'rgba(20,10,0,0.45)'; ctx.lineWidth = 2.5;
        for (let i = 0; i < 5; i++) { const gx = 10 + i * (w - 20) / 4; ctx.beginPath(); ctx.moveTo(gx - 2, 4); ctx.lineTo(gx + 4, h - 4); ctx.stroke(); }
        // Caramelized edges
        ctx.strokeStyle = 'rgba(80,30,0,0.5)'; ctx.lineWidth = 2;
        rr(0, 0, w, h, 12); ctx.stroke();
        // Juicy sheen (grease/moisture)
        const jg = ctx.createLinearGradient(0, 0, w, 0);
        jg.addColorStop(0, 'rgba(255,180,100,0)'); jg.addColorStop(0.3, 'rgba(255,180,100,0.12)');
        jg.addColorStop(0.5, 'rgba(255,200,150,0.18)'); jg.addColorStop(0.7, 'rgba(255,180,100,0.12)');
        jg.addColorStop(1, 'rgba(255,180,100,0)');
        ctx.fillStyle = jg; rr(4, 2, w - 8, h * 0.4, 8); ctx.fill();
        // Grease droplet highlights
        ctx.fillStyle = 'rgba(255,220,180,0.2)';
        ctx.beginPath(); ctx.ellipse(w * 0.25, h * 0.3, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(w * 0.65, h * 0.25, 3, 2, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(w * 0.8, h * 0.4, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    },

    lettuce(w, h) {
        // Rich, leafy lettuce with depth (like cilantro/parsley in photo)
        // Back layer (darker)
        ctx.fillStyle = '#2E7D32';
        ctx.beginPath(); ctx.moveTo(-8, h);
        for (let i = 0; i <= w + 16; i += 6) {
            ctx.lineTo(i - 8, h * 0.2 + Math.sin(i * 0.25) * h * 0.3 + Math.cos(i * 0.4) * 4);
        }
        ctx.lineTo(w + 8, h); ctx.closePath(); ctx.fill();
        // Middle layer
        const g1 = ctx.createLinearGradient(0, 0, 0, h);
        g1.addColorStop(0, '#43A047'); g1.addColorStop(0.5, '#66BB6A'); g1.addColorStop(1, '#388E3C');
        ctx.fillStyle = g1;
        ctx.beginPath(); ctx.moveTo(-5, h);
        for (let i = 0; i <= w + 10; i += 7) {
            ctx.lineTo(i - 5, h * 0.15 + Math.sin(i * 0.22 + 1) * h * 0.35 + Math.cos(i * 0.35) * 3);
        }
        ctx.lineTo(w + 5, h); ctx.closePath(); ctx.fill();
        // Front highlights (bright green, leafy edges)
        ctx.fillStyle = 'rgba(129,199,132,0.5)';
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let i = 0; i <= w; i += 9) {
            ctx.lineTo(i, h * 0.35 + Math.cos(i * 0.18 + 2) * h * 0.25);
        }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
        // Vein lines (leaf structure)
        ctx.strokeStyle = 'rgba(200,255,200,0.25)'; ctx.lineWidth = 0.8;
        for (let i = 0; i < 6; i++) {
            const vx = 12 + i * (w - 24) / 5;
            ctx.beginPath(); ctx.moveTo(vx, h);
            ctx.quadraticCurveTo(vx + 4, h * 0.4, vx - 2, h * 0.1); ctx.stroke();
        }
        // Moisture drops
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        for (let i = 0; i < 4; i++) {
            ctx.beginPath(); ctx.arc(15 + Math.random() * (w - 30), h * 0.3 + Math.random() * h * 0.4, 1.5, 0, Math.PI * 2); ctx.fill();
        }
    },

    cheese(w, h) {
        // Thick melting cheese with oozing drips
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#FFE082'); g.addColorStop(0.3, '#FFD54F');
        g.addColorStop(0.6, '#FFC107'); g.addColorStop(1, '#FFB300');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(w - 2, 0); ctx.lineTo(w - 2, h * 0.45);
        // Melting drips (more, juicier)
        ctx.quadraticCurveTo(w - 6, h * 1.5, w - 18, h * 0.5);
        ctx.lineTo(w * 0.78, h * 0.45);
        ctx.quadraticCurveTo(w * 0.72, h * 1.6, w * 0.6, h * 0.55);
        ctx.lineTo(w * 0.52, h * 0.45);
        ctx.quadraticCurveTo(w * 0.45, h * 1.4, w * 0.35, h * 0.5);
        ctx.lineTo(w * 0.28, h * 0.45);
        ctx.quadraticCurveTo(w * 0.2, h * 1.3, 10, h * 0.5);
        ctx.lineTo(2, h * 0.45); ctx.closePath(); ctx.fill();
        // Darker melted edges
        ctx.strokeStyle = 'rgba(200,150,0,0.3)'; ctx.lineWidth = 1.5;
        ctx.stroke();
        // Holes
        ctx.fillStyle = 'rgba(230,170,20,0.5)';
        ctx.beginPath(); ctx.arc(w * 0.22, h * 0.22, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w * 0.62, h * 0.18, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w * 0.42, h * 0.28, 2.5, 0, Math.PI * 2); ctx.fill();
        // Glossy wet shine
        const sg = ctx.createLinearGradient(0, 0, w, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.3, 'rgba(255,255,255,0.22)');
        sg.addColorStop(0.5, 'rgba(255,255,255,0.3)'); sg.addColorStop(0.7, 'rgba(255,255,255,0.22)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg; ctx.fillRect(5, 1, w - 10, h * 0.25);
    },

    tomato(w, h) {
        // Thick juicy tomato slices
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#FF5252'); g.addColorStop(0.3, '#F44336');
        g.addColorStop(0.7, '#E53935'); g.addColorStop(1, '#C62828');
        ctx.fillStyle = g; rr(0, 0, w, h, 10); ctx.fill();
        // Visible slice cross-sections
        for (let i = 0; i < 5; i++) {
            const cx = 14 + i * (w - 28) / 4, cy = h / 2;
            // Outer membrane ring
            ctx.strokeStyle = 'rgba(180,40,40,0.5)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
            // Inner gel
            const tg = ctx.createRadialGradient(cx, cy, 1, cx, cy, 6);
            tg.addColorStop(0, '#FFCDD2'); tg.addColorStop(1, 'rgba(244,67,54,0.3)');
            ctx.fillStyle = tg;
            ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
            // Seeds
            ctx.fillStyle = '#FFEBEE';
            for (let j = 0; j < 3; j++) {
                const a = j * Math.PI * 2 / 3 + i * 0.5;
                ctx.save(); ctx.translate(cx + Math.cos(a) * 3.5, cy + Math.sin(a) * 2.5);
                ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 1.8, 0.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            }
        }
        // Wet juicy shine
        const sg = ctx.createLinearGradient(0, 0, w, h * 0.3);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.4, 'rgba(255,255,255,0.2)');
        sg.addColorStop(0.6, 'rgba(255,255,255,0.25)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg; rr(6, 1, w - 12, h * 0.35, 6); ctx.fill();
        // Juice bead
        ctx.fillStyle = 'rgba(255,200,200,0.35)';
        ctx.beginPath(); ctx.ellipse(w * 0.7, h * 0.2, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    },

    onion(w, h) {
        // Purple onion rings (like the photo — vibrant purple)
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#E1BEE7'); g.addColorStop(0.3, '#CE93D8');
        g.addColorStop(0.7, '#AB47BC'); g.addColorStop(1, '#8E24AA');
        ctx.fillStyle = g; rr(0, 0, w, h, 8); ctx.fill();
        // Individual ring cross-sections (more detailed)
        for (let i = 0; i < 6; i++) {
            const rx = 11 + i * (w - 22) / 5;
            // Outer ring (purple)
            ctx.strokeStyle = 'rgba(142,36,170,0.7)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(rx, h / 2, 8, 6, 0, 0, Math.PI * 2); ctx.stroke();
            // Middle layer (lighter)
            ctx.strokeStyle = 'rgba(225,190,231,0.6)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.ellipse(rx, h / 2, 6, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
            // Inner white
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath(); ctx.ellipse(rx, h / 2, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        }
        // Wet sheen
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(5, 1, w - 10, h * 0.3, 5); ctx.fill();
    },

    sauce(w, h) {
        // Ketchup sauce — drizzly, glossy
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#E64A19'); g.addColorStop(0.3, '#FF5722');
        g.addColorStop(0.6, '#FF7043'); g.addColorStop(1, '#FF8A65');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h * 0.3);
        for (let i = w; i >= 0; i -= 10) {
            ctx.quadraticCurveTo(i - 2, h * 1.2 + Math.sin(i * 0.2) * 4, i - 10, h * 0.35 + Math.sin(i * 0.3) * 3);
        }
        ctx.closePath(); ctx.fill();
        // Glossy shine streaks
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.12, w * 0.18, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(w * 0.7, h * 0.12, w * 0.14, 2, 0, 0, Math.PI * 2); ctx.fill();
        // Darker drip edge
        ctx.strokeStyle = 'rgba(180,50,10,0.25)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= w; i += 10) {
            ctx.lineTo(i, h * 0.35 + Math.sin(i * 0.3) * 3);
        }
        ctx.stroke();
    },

    egg(w, h) {
        // Fried egg — irregular white, glossy yolk
        // White with irregular crispy edges
        ctx.fillStyle = '#FAFAFA';
        ctx.beginPath();
        ctx.moveTo(6, h * 0.3);
        ctx.quadraticCurveTo(w * 0.12, -5, w * 0.3, h * 0.12);
        ctx.quadraticCurveTo(w * 0.45, -4, w * 0.65, h * 0.08);
        ctx.quadraticCurveTo(w * 0.85, -3, w - 4, h * 0.25);
        ctx.quadraticCurveTo(w + 5, h * 0.55, w - 4, h * 0.78);
        ctx.quadraticCurveTo(w * 0.82, h + 5, w * 0.55, h * 0.88);
        ctx.quadraticCurveTo(w * 0.3, h + 4, 4, h * 0.72);
        ctx.quadraticCurveTo(-5, h * 0.5, 6, h * 0.3);
        ctx.closePath(); ctx.fill();
        // Crispy brown edge
        ctx.strokeStyle = 'rgba(180,140,80,0.35)'; ctx.lineWidth = 2; ctx.stroke();
        // Slight texture on white
        ctx.fillStyle = 'rgba(240,235,220,0.3)';
        for (let i = 0; i < 8; i++) {
            ctx.beginPath(); ctx.arc(10 + Math.random() * (w - 20), 8 + Math.random() * (h - 16), 3 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
        }
        // Yolk - big, glossy, golden
        const yg = ctx.createRadialGradient(w / 2, h * 0.42, 2, w / 2, h * 0.42, 14);
        yg.addColorStop(0, '#FFE500'); yg.addColorStop(0.4, '#FFD600');
        yg.addColorStop(0.7, '#FFC107'); yg.addColorStop(1, '#FFB300');
        ctx.fillStyle = yg;
        ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 12, 0, Math.PI * 2); ctx.fill();
        // Yolk edge shadow
        ctx.strokeStyle = 'rgba(200,150,0,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(w / 2, h * 0.42, 12, 0, Math.PI * 2); ctx.stroke();
        // Big glossy highlight on yolk
        const yhl = ctx.createRadialGradient(w / 2 - 4, h * 0.36, 1, w / 2 - 4, h * 0.36, 6);
        yhl.addColorStop(0, 'rgba(255,255,255,0.55)'); yhl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = yhl;
        ctx.beginPath(); ctx.arc(w / 2 - 4, h * 0.36, 5, 0, Math.PI * 2); ctx.fill();
    },

    bacon(w, h) {
        // Wavy crispy bacon strips (more detailed)
        for (let strip = 0; strip < 2; strip++) {
            const sy = strip * h * 0.42 + 1;
            // Meat gradient
            const mg = ctx.createLinearGradient(0, sy, 0, sy + h * 0.55);
            mg.addColorStop(0, '#D32F2F'); mg.addColorStop(0.3, '#C62828');
            mg.addColorStop(0.6, '#B71C1C'); mg.addColorStop(1, '#8E1010');
            ctx.fillStyle = mg;
            ctx.beginPath(); ctx.moveTo(0, sy + h * 0.12);
            for (let i = 0; i <= w; i += 12) {
                ctx.quadraticCurveTo(i + 3, sy - 2, i + 6, sy + h * 0.12);
                ctx.quadraticCurveTo(i + 9, sy + h * 0.35, i + 12, sy + h * 0.12);
            }
            ctx.lineTo(w, sy + h * 0.5); ctx.lineTo(0, sy + h * 0.5); ctx.closePath(); ctx.fill();
            // Fat streaks (white/pink marbling)
            ctx.fillStyle = 'rgba(255,205,185,0.55)';
            for (let i = 3; i < w - 3; i += 16) {
                ctx.beginPath();
                ctx.moveTo(i, sy + h * 0.05);
                ctx.quadraticCurveTo(i + 4, sy + h * 0.2, i + 2, sy + h * 0.38);
                ctx.quadraticCurveTo(i + 6, sy + h * 0.2, i + 8, sy + h * 0.05);
                ctx.closePath(); ctx.fill();
            }
            // Crispy edges (darker)
            ctx.strokeStyle = 'rgba(100,20,0,0.3)'; ctx.lineWidth = 0.8;
            ctx.beginPath();
            for (let i = 0; i <= w; i += 12) {
                ctx.lineTo(i + 6, sy + h * 0.12 + Math.sin(i * 0.3) * 2);
            }
            ctx.stroke();
        }
        // Grease sheen
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; rr(3, 1, w - 6, h * 0.25, 5); ctx.fill();
    },

    pickle(w, h) {
        // Pickle slices — greener, more detailed
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#4CAF50'); bg.addColorStop(0.5, '#66BB6A'); bg.addColorStop(1, '#388E3C');
        ctx.fillStyle = bg; rr(0, 0, w, h, 8); ctx.fill();
        // Individual round pickle slices
        for (let i = 0; i < 6; i++) {
            const px = 10 + i * (w - 20) / 5, py = h / 2;
            // Outer ring (dark green skin)
            ctx.fillStyle = '#2E7D32'; ctx.beginPath(); ctx.ellipse(px, py, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
            // Inner flesh (lighter)
            const pg = ctx.createRadialGradient(px, py, 1, px, py, 6);
            pg.addColorStop(0, '#C8E6C9'); pg.addColorStop(1, '#81C784');
            ctx.fillStyle = pg;
            ctx.beginPath(); ctx.ellipse(px, py, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
            // Seed pattern (tiny dots in circle)
            ctx.fillStyle = '#E8F5E9';
            for (let j = 0; j < 4; j++) {
                const a = j * Math.PI * 2 / 4 + i * 0.5;
                ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * 3, py + Math.sin(a) * 2.5, 1.2, 0.6, a, 0, Math.PI * 2); ctx.fill();
            }
        }
        // Brine moisture sheen
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; rr(4, 1, w - 8, h * 0.3, 5); ctx.fill();
    },

    salad(w, h) {
        // Leafy salad / herbs (more like parsley/cilantro from the photo)
        // Dark back layer
        ctx.fillStyle = '#2E7D32';
        ctx.beginPath(); ctx.moveTo(-6, h);
        for (let i = 0; i <= w + 12; i += 8) {
            ctx.lineTo(i - 6, h * 0.25 + Math.sin(i * 0.2 + 2) * h * 0.28 + Math.cos(i * 0.4) * 3);
        }
        ctx.lineTo(w + 6, h); ctx.closePath(); ctx.fill();
        // Main bright layer
        const g1 = ctx.createLinearGradient(0, 0, 0, h);
        g1.addColorStop(0, '#66BB6A'); g1.addColorStop(0.5, '#81C784'); g1.addColorStop(1, '#4CAF50');
        ctx.fillStyle = g1;
        ctx.beginPath(); ctx.moveTo(-4, h);
        for (let i = 0; i <= w + 8; i += 7) {
            const wave = Math.sin(i * 0.22 + 1) * h * 0.32 + Math.cos(i * 0.35) * 4;
            ctx.lineTo(i - 4, h * 0.18 + wave);
        }
        ctx.lineTo(w + 4, h); ctx.closePath(); ctx.fill();
        // Light highlights
        ctx.fillStyle = 'rgba(200,255,200,0.25)';
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let i = 0; i <= w; i += 10) ctx.lineTo(i, h * 0.45 + Math.cos(i * 0.15 + 1) * h * 0.2);
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
        // Leaf stems
        ctx.strokeStyle = 'rgba(46,125,50,0.4)'; ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const vx = 12 + i * (w - 24) / 4;
            ctx.beginPath(); ctx.moveTo(vx, h); ctx.quadraticCurveTo(vx + 3, h * 0.4, vx - 1, h * 0.1); ctx.stroke();
        }
    },
};

// ─── Plate ───
function drawPlate(cx, y) {
    const pw = ING_W + 80;
    // Under-glow (warm light reflection on surface below)
    const ugr = ctx.createRadialGradient(cx, y + 20, 5, cx, y + 20, pw * 0.7);
    ugr.addColorStop(0, 'rgba(255,180,80,0.08)'); ugr.addColorStop(0.5, 'rgba(255,150,50,0.03)'); ugr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ugr;
    ctx.beginPath(); ctx.ellipse(cx, y + 20, pw * 0.7, 25, 0, 0, Math.PI * 2); ctx.fill();
    // Shadow (larger, softer)
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(cx, y + 14, pw / 2 + 5, 14, 0, 0, Math.PI * 2); ctx.fill();
    // Plate edge (chrome look)
    let pg = ctx.createLinearGradient(cx - pw / 2, y, cx + pw / 2, y);
    pg.addColorStop(0, '#455A64'); pg.addColorStop(0.2, '#78909C'); pg.addColorStop(0.5, '#B0BEC5');
    pg.addColorStop(0.8, '#78909C'); pg.addColorStop(1, '#455A64');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(cx, y + 7, pw / 2 + 2, 13, 0, 0, Math.PI * 2); ctx.fill();
    // Plate top surface (polished)
    pg = ctx.createRadialGradient(cx - pw * 0.15, y - 2, 3, cx, y, pw / 2);
    pg.addColorStop(0, '#ECEFF1'); pg.addColorStop(0.3, '#CFD8DC'); pg.addColorStop(0.7, '#B0BEC5'); pg.addColorStop(1, '#78909C');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(cx, y, pw / 2 - 1, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Rim highlight (polished rim shine)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, y - 1, pw / 2 - 6, 6, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    // Inner ring detail
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.ellipse(cx, y + 1, pw / 2 - 15, 6, 0, 0, Math.PI * 2); ctx.stroke();
}

// ─── Background ───
function drawBG() {
    // Dynamic gradient that shifts hue slowly
    bgHue = 220 + Math.sin(frameCount * 0.003) * 15;
    const topCol = `hsl(${bgHue}, 30%, 5%)`;
    const midCol = `hsl(${bgHue + 10}, 25%, 8%)`;
    const botCol = `hsl(${bgHue - 5}, 35%, 4%)`;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, topCol); g.addColorStop(0.5, midCol); g.addColorStop(1, botCol);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Twinkling stars
    for (const star of bgStars) {
        star.tw += star.spd;
        const twinkle = Math.sin(star.tw) * 0.5 + 0.5;
        ctx.globalAlpha = 0.15 + twinkle * 0.45;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(star.x * W, star.y * H, star.s, 0, Math.PI * 2); ctx.fill();
        if (star.s > 1.2) {
            ctx.globalAlpha = twinkle * 0.08;
            ctx.beginPath(); ctx.arc(star.x * W, star.y * H, star.s * 4, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.globalAlpha = 1;

    // Floating bokeh orbs
    for (const b of bgBokeh) {
        b.x += b.vx; b.y += b.vy;
        if (b.x < -0.05) b.x = 1.05; if (b.x > 1.05) b.x = -0.05;
        if (b.y < -0.05) b.y = 1.05;
        const pulse = Math.sin(frameCount * 0.02 + b.hue) * 0.3 + 0.7;
        const bx = b.x * W, by = b.y * H;
        const bg = ctx.createRadialGradient(bx, by, 0, bx, by, b.r);
        bg.addColorStop(0, `hsla(${b.hue + (fever ? 0 : 200)}, 70%, 60%, ${b.alpha * pulse})`);
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.fill();
    }

    // Fever background pulse (more dramatic)
    if (fever) {
        const pulse = Math.sin(frameCount * 0.08) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,80,0,${0.04 + pulse * 0.06})`;
        ctx.fillRect(0, 0, W, H);
        // Fire border glow
        const fw = 12;
        const fAlpha = 0.15 + pulse * 0.2;
        const flg = ctx.createLinearGradient(0, 0, fw, 0);
        flg.addColorStop(0, `rgba(255,80,0,${fAlpha})`); flg.addColorStop(0.5, `rgba(255,150,0,${fAlpha * 0.5})`); flg.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = flg; ctx.fillRect(0, 0, fw, H);
        const frg = ctx.createLinearGradient(W, 0, W - fw, 0);
        frg.addColorStop(0, `rgba(255,80,0,${fAlpha})`); frg.addColorStop(0.5, `rgba(255,150,0,${fAlpha * 0.5})`); frg.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = frg; ctx.fillRect(W - fw, 0, fw, H);
        // Top fire glow
        const ftg = ctx.createLinearGradient(0, 0, 0, fw);
        ftg.addColorStop(0, `rgba(255,80,0,${fAlpha})`); ftg.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = ftg; ctx.fillRect(0, 0, W, fw);
    } else {
        // Subtle side glow (warm)
        const bw = 4;
        const bg1 = ctx.createLinearGradient(0, 0, bw * 3, 0);
        bg1.addColorStop(0, 'rgba(255,150,50,0.08)'); bg1.addColorStop(1, 'rgba(255,150,50,0)');
        ctx.fillStyle = bg1; ctx.fillRect(0, 0, bw * 3, H);
        const bg2 = ctx.createLinearGradient(W, 0, W - bw * 3, 0);
        bg2.addColorStop(0, 'rgba(255,150,50,0.08)'); bg2.addColorStop(1, 'rgba(255,150,50,0)');
        ctx.fillStyle = bg2; ctx.fillRect(W - bw * 3, 0, bw * 3, H);
    }

    // Ambient floating particles
    drawAmbient();

    // Vignette (dark corners for cinematic depth)
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
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

// ─── Combo meter (right side) ───
function drawComboMeter() {
    if (combo < 2) return;
    const mx = W - 22, my = H - 165, mw = 10, mh = 130;
    const fill = Math.min(1, combo / (FEVER_COMBO + 3));
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(mx - 1, my - 1, mw + 2, mh + 2, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; rr(mx, my, mw, mh, 4); ctx.fill();
    const cg = ctx.createLinearGradient(0, my + mh, 0, my);
    cg.addColorStop(0, '#2196F3'); cg.addColorStop(0.5, '#FF9800'); cg.addColorStop(1, '#FF5722');
    ctx.fillStyle = cg;
    const ch = mh * fill;
    if (ch > 1) { rr(mx, my + mh - ch, mw, ch, 4); ctx.fill(); }
    // Combo text
    ctx.fillStyle = fever ? '#FFD700' : '#FF9800';
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(fever ? '🔥' : 'x' + combo, mx + mw / 2, my - 6);
}

// ─── Game ───
function startGame() {
    gameState = 'playing'; score = 0; level = 0; combo = 0; maxCombo = 0;
    perfectCount = 0; cumulativeLean = 0; swayAngle = 0; swayVel = 0;
    cameraY = 0; targetCamY = 0; stack = []; particles = []; colPieces = [];
    moveSpd = SPD_BASE; resultShown = false;
    dogActive = false; dogPhase = 'hidden'; dropsSinceDog = 0; dogX = 0; dogDir = 1;
    fever = false; feverTimer = 0; feverGlow = 0;
    isNewRecord = false; isGolden = false;
    floatingTexts = []; juiceDrops = []; shakeIntensity = 0;
    bgPulse = 0; frameCount = 0;
    impactRings = []; dropTrail = []; ambientParticles.length = 0;
    usedSecondLife = false; scoreTripled = false;
    sessionFevers = 0; sessionGoldens = 0;
    initBGEffects();
    gamePaused = false; pauseOverlay.classList.remove('active');
    document.getElementById('second-life-overlay').style.display = 'none';
    showScreen('game');
    resize();
    // GameplayAPI start (1.19.3)
    if (ysdk) try { ysdk.features.GameplayAPI.start(); } catch(e) {}
    stack.push({ ingredient: BOTTOM_BUN, height: BOTTOM_BUN.height, offX: 0 });
    spawnIng(); updateHUD();
}

function spawnIng() {
    const ing = INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
    // Golden ingredient chance
    isGolden = Math.random() < GOLDEN_CHANCE && level > 3;
    curIng = { x: W / 2 - ING_W / 2, sY: 65, w: ING_W, h: ing.height, ing };
    moveDir = Math.random() > 0.5 ? 1 : -1; fallIng = null;
}

function dropIng() {
    if (gameState !== 'playing' || !curIng) return;
    gameState = 'dropping'; playDropSound();
    const ps = stackPos(), top = ps[ps.length - 1];
    fallIng = { x: curIng.x, wY: curIng.sY + cameraY, vy: 0, w: curIng.w, h: curIng.h,
        ing: curIng.ing, tY: top.y - curIng.h, tCX: top.cx, golden: isGolden };
    curIng = null;
}

function landIng() {
    const fi = fallIng, fcx = fi.x + fi.w / 2;
    const rawOff = fcx - fi.tCX;
    const maxOff = ING_W * 0.4;
    const off = Math.max(-maxOff, Math.min(maxOff, rawOff));
    const absOff = Math.abs(rawOff);
    const wasGolden = fi.golden;

    stack.push({ ingredient: fi.ing, height: fi.h, offX: off });
    level++; cumulativeLean += off;
    playLandSound();

    const ps = stackPos(), lp = ps[ps.length - 1];
    const px = lp.cx, py = lp.y;
    const screenY = py - cameraY;

    // Juice splatter on land + impact ring
    spawnJuiceSplatter(px, screenY, fi.ing.pattern);
    addImpactRing(px, screenY);
    triggerShake(4);

    const goldenMul = wasGolden ? 3 : 1;

    if (wasGolden) sessionGoldens++;

    if (absOff <= PERFECT_TH) {
        combo++; if (combo > maxCombo) maxCombo = combo; perfectCount++;
        const pts = (BASE_PTS + combo * COMBO_MUL + level * 10) * goldenMul;
        score += pts * (fever ? 2 : 1);
        cumulativeLean *= 0.8;
        playPerfectSound();
        if (wasGolden) {
            showPraise('GOLDEN x3! ✨', '#FFD700');
            triggerShake(8);
            spawnFireBurst(px, screenY);
        } else {
            showPraise(speakPraise(), '#FFD700');
        }
        spawnStars(px, screenY);
        addFloatingText(px, screenY - 10, '+' + (pts * (fever ? 2 : 1)), fever ? '#FF6B35' : '#FFD700', fever ? 22 : 18);
        playComboTick(combo);

        // Fever activation
        if (combo >= FEVER_COMBO && !fever) {
            fever = true; feverTimer = 0;
            sessionFevers++;
            playFeverSound();
            showPraise(FEVER_PRAISES[Math.floor(Math.random() * FEVER_PRAISES.length)], '#FF4500');
            spawnFireBurst(px, screenY);
            spawnFireBurst(px - 30, screenY + 10);
            spawnFireBurst(px + 30, screenY + 10);
            triggerShake(12);
        }
    } else if (absOff <= OK_TH) {
        combo = 0; fever = false;
        const pts = (Math.max(10, Math.round((OK_TH - absOff) / OK_TH * 50) + level * 3)) * goldenMul;
        score += pts;
        showPraise(wasGolden ? 'GOLDEN +' + pts : '+' + pts, '#90CAF9');
        spawnP(px, screenY, '#FFB74D', 6);
        addFloatingText(px, screenY - 10, '+' + pts, '#90CAF9');
    } else if (absOff <= MISS_TH) {
        combo = 0; fever = false;
        showPraise('Неровно!', '#FF8A65');
        spawnP(px, screenY, '#FF5252', 8);
        triggerShake(6);
    } else {
        combo = 0; fever = false;
        showPraise('Криво!', '#FF5252');
        spawnP(px, screenY, '#FF5252', 12);
        triggerShake(10);
    }

    // Check for new record during gameplay
    if (score > personalBest && !isNewRecord) {
        isNewRecord = true;
        showPraise('НОВЫЙ РЕКОРД! 🏆', '#FFD700');
        playRecordSound();
        spawnMilestoneExplosion(W / 2, H / 2);
        triggerShake(15);
    }

    // Milestone celebrations
    if (level > 0 && level % 10 === 0) {
        const mi = Math.min(Math.floor(level / 10) - 1, MILESTONE_PRAISES.length - 1);
        if (mi >= 0) {
            playMilestoneSound();
            spawnMilestoneExplosion(px, screenY);
            addFloatingText(W / 2, H / 2, MILESTONE_PRAISES[mi], '#FFEB3B', 24);
            triggerShake(10);
        }
    }

    // Camera stays fixed — no vertical scrolling
    targetCamY = 0;
    moveSpd = Math.min(SPD_MAX, SPD_BASE + level * SPD_INC);
    fallIng = null; updateHUD();

    dropsSinceDog++;
    if (Math.abs(cumulativeLean) >= MAX_LEAN) startCollapse();
    else {
        if (dropsSinceDog >= DOG_INTERVAL && stack.length > DOG_EAT_LAYERS + 2 && !dogActive) {
            summonDog();
        } else {
            gameState = 'playing'; spawnIng();
        }
    }
}

function startCollapse() {
    gameState = 'collapsing'; playCollapseSound(); colPieces = [];
    triggerShake(25);
    const ps = stackPos();
    for (let i = ps.length - 1; i >= 1; i--) {
        const p = ps[i];
        colPieces.push({ x: p.x, y: p.y, w: p.w, h: p.h, ing: p.ing,
            vx: (Math.random() - 0.5) * 8 + (cumulativeLean > 0 ? 2 : -2),
            vy: -Math.random() * 4 - 1, va: (Math.random() - 0.5) * 0.2, a: 0 });
    }
    setTimeout(() => {
        playGameOverSound();
        setTimeout(() => {
            if (resultShown) return;
            if (!usedSecondLife && level >= 3) {
                showSecondLifeOffer();
            } else {
                showResult();
            }
        }, 1000);
    }, 1200);
}

function showSecondLifeOffer() {
    gameState = 'secondlife';
    document.getElementById('second-life-overlay').style.display = 'flex';
}

function useSecondLife() {
    usedSecondLife = true;
    document.getElementById('second-life-overlay').style.display = 'none';
    showRewardedAd(() => {
        // Restore game — rebuild stack from bottom bun + a few layers
        colPieces = [];
        cumulativeLean *= 0.3;
        swayAngle = 0; swayVel = 0;
        // Keep only bottom bun + last 3 layers
        if (stack.length > 4) stack.length = 4;
        gameState = 'playing';
        if (ysdk) try { ysdk.features.GameplayAPI.start(); } catch(e) {}
        spawnIng();
        showPraise('Второй шанс! 💪', '#A855F7');
        playPerfectSound();
    }, () => {
        showResult();
    });
}

function skipSecondLife() {
    document.getElementById('second-life-overlay').style.display = 'none';
    showResult();
}

function showResult() {
    if (resultShown) return; resultShown = true; gameState = 'gameover';
    // GameplayAPI stop (1.19.3)
    if (ysdk) try { ysdk.features.GameplayAPI.stop(); } catch(e) {}

    // Track death for interstitial ads
    deathCount++;
    localStorage.setItem('burger_deaths', String(deathCount));

    // Save personal best
    if (score > personalBest) {
        personalBest = score;
        localStorage.setItem('burger_pb', String(score));
    }
    if (level > bestFloors) {
        bestFloors = level;
        localStorage.setItem('burger_bf', String(level));
    }

    // XP reward based on performance
    const streakMul = getStreakMultiplier();
    const baseXP = Math.floor(level * 5 + perfectCount * 3 + Math.floor(score / 50));
    const xpEarned = Math.floor(baseXP * streakMul);
    const xpResult = addXP(xpEarned);

    // Update quest progress
    const completedQuests = updateQuestProgress({
        score, perfects: perfectCount, floors: level,
        fevers: sessionFevers, maxCombo, goldens: sessionGoldens, games: 1
    });

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

    // Best scores display
    const bestEl = document.getElementById('result-best');
    if (bestEl) {
        bestEl.textContent = `Лучший результат: ${personalBest} очков, ${bestFloors} этажей`;
        bestEl.style.display = '';
    }

    // XP display
    const xpEl = document.getElementById('result-xp');
    if (xpEl) {
        const t = getLevelTitle(xpResult.level);
        const lvlUpText = xpResult.leveledUp ? ` 🎉 Новый уровень! ${t.icon} ${t.title}` : '';
        xpEl.textContent = `+${xpEarned} XP${streakMul > 1 ? ' (x' + streakMul + ' серия!)' : ''}${lvlUpText}`;
        xpEl.style.display = '';
    }

    // Quest completion notifications
    const questsEl = document.getElementById('result-quests');
    if (questsEl && completedQuests.length > 0) {
        questsEl.innerHTML = completedQuests.map(q =>
            `<div class="result-quest-done">✅ ${q.title} — +${q.reward} XP</div>`
        ).join('');
        questsEl.style.display = '';
    } else if (questsEl) {
        questsEl.style.display = 'none';
    }

    // Triple score button (only if score > 50 and not yet tripled)
    const tripleBtn = document.getElementById('btn-triple-score');
    if (tripleBtn) {
        tripleBtn.style.display = (score >= 50 && !scoreTripled) ? '' : 'none';
    }

    document.getElementById('result-title').textContent =
        Math.abs(cumulativeLean) >= MAX_LEAN ? '💥 Бургер развалился!' : '🍔 Отличный бургер!';

    // Show interstitial every 3rd death
    if (deathCount % 3 === 0) {
        showInterstitialAd(() => showScreen('result'));
    } else {
        showScreen('result');
    }
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
    dogActive = true; dogPhase = 'entering';
    dogDir = Math.random() > 0.5 ? 1 : -1;
    dogX = dogDir > 0 ? -120 : W + 120;
    dogY = plateBaseY + 10;
    dogMouthOpen = 0;
    dogEatTimer = 0;
    gameState = 'dog';
    playBarkSound();
    showPraise('🐕 Ав-ав!', '#FFB74D');
}

function dogEatLayers() {
    const toEat = Math.min(DOG_EAT_LAYERS, stack.length - 1);
    if (toEat <= 0) return;
    const ps = stackPos();
    for (let i = 1; i <= toEat; i++) {
        if (ps[i]) spawnP(ps[i].cx, ps[i].y - cameraY, '#FFB74D', 5);
    }
    stack.splice(1, toEat);
    cumulativeLean *= 0.4;
    playMunchSound();
    dropsSinceDog = 0;
}

function drawDog(dx, dy) {
    ctx.save();
    ctx.translate(dx, dy);
    // Flip horizontally based on direction
    ctx.scale(dogDir, 1);

    // Body
    ctx.fillStyle = '#8B6914';
    ctx.beginPath(); ctx.ellipse(0, 30, 50, 35, 0, 0, Math.PI * 2); ctx.fill();

    // Head
    const headG = ctx.createRadialGradient(-5, -5, 5, 0, 0, 40);
    headG.addColorStop(0, '#C49A2A'); headG.addColorStop(1, '#8B6914');
    ctx.fillStyle = headG;
    ctx.beginPath(); ctx.ellipse(0, -5, 40, 32, 0, 0, Math.PI * 2); ctx.fill();

    // Ears
    ctx.fillStyle = '#6B4E0A';
    ctx.beginPath(); ctx.ellipse(-32, -15, 14, 22, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(32, -15, 14, 22, 0.3, 0, Math.PI * 2); ctx.fill();

    // Snout
    ctx.fillStyle = '#D4A843';
    ctx.beginPath(); ctx.ellipse(0, 8, 22, 16, 0, 0, Math.PI * 2); ctx.fill();

    // Mouth
    const mouthOpen = dogMouthOpen;
    if (mouthOpen > 0) {
        ctx.fillStyle = '#C62828';
        ctx.beginPath(); ctx.ellipse(0, 14 + mouthOpen * 4, 15, 5 + mouthOpen * 8, 0, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-12, -14, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(16, -14, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#444';
    ctx.beginPath(); ctx.arc(-14, -14, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14, -14, 2.5, 0, Math.PI * 2); ctx.fill();

    // Eyebrows
    ctx.strokeStyle = '#6B4E0A'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-14, -18, 8, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    ctx.beginPath(); ctx.arc(14, -18, 8, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();

    ctx.restore();
}

function updateDog() {
    if (!dogActive) return;
    const targetX = W / 2;
    if (dogPhase === 'entering') {
        // Move horizontally toward center (slower speed = 2)
        dogX += dogDir * 2;
        if ((dogDir > 0 && dogX >= targetX) || (dogDir < 0 && dogX <= targetX)) {
            dogX = targetX; dogPhase = 'eating'; dogEatTimer = 0;
        }
    } else if (dogPhase === 'eating') {
        dogEatTimer++;
        dogMouthOpen = Math.min(1, dogEatTimer / 20);
        if (dogEatTimer === 35) dogEatLayers();
        if (dogEatTimer > 70) { dogPhase = 'leaving'; dogMouthOpen = 0; }
    } else if (dogPhase === 'leaving') {
        // Exit horizontally in the opposite direction
        dogX -= dogDir * 2;
        if (dogX < -120 || dogX > W + 120) {
            dogActive = false; dogPhase = 'hidden';
            targetCamY = 0;
            gameState = 'playing'; spawnIng();
        }
    }
}

// ─── Loop ───
function update() {
    frameCount++;
    cameraY += (targetCamY - cameraY) * CAM_SMOOTH;
    updateShake();
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
        addDropTrail(fallIng.x, fallIng.wY - cameraY, fallIng.w, fallIng.h);
        if (fallIng.wY >= fallIng.tY) { fallIng.wY = fallIng.tY; fallIng.isTop ? landTopBun() : landIng(); }
    }
    if (gameState === 'collapsing') for (const p of colPieces) { p.vy += 0.5; p.x += p.vx; p.y += p.vy; p.a += p.va; }
    // Fever decay
    if (fever) {
        feverTimer++;
        feverGlow = Math.sin(feverTimer * 0.12) * 0.5 + 0.5;
        spawnFeverTrail();
    }
    updateDog();
    updateParticles();
    updateFloatingTexts();
    updateJuiceDrops();
    updateAmbient();
    updateImpactRings();
    updateDropTrail();
}

function landTopBun() {
    stack.push({ ingredient: fallIng.ing, height: fallIng.h, offX: 0 });
    fallIng = null; playPerfectSound();
    const ps = stackPos(), tp = ps[ps.length - 1];
    spawnStars(tp.cx, tp.y - cameraY);
    setTimeout(() => showResult(), 800);
}

function draw() {
    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawBG();
    drawDropTrail();
    const ps = stackPos();
    if (ps.length > 0) drawPlate(W / 2, plateBaseY - cameraY);

    ctx.save();
    const pvX = W / 2, pvY = plateBaseY - cameraY;
    ctx.translate(pvX, pvY); ctx.rotate(swayAngle); ctx.translate(-pvX, -pvY);
    for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        drawIng(p.x, p.y - cameraY, p.w, p.h, p.ing);
    }
    if (fallIng && (gameState === 'dropping' || gameState === 'topbun'))
        drawIng(fallIng.x, fallIng.wY - cameraY, fallIng.w, fallIng.h, fallIng.ing, 0, fallIng.golden);
    ctx.restore();

    if (gameState === 'collapsing') for (const p of colPieces) drawIng(p.x, p.y - cameraY, p.w, p.h, p.ing, p.a);

    if (curIng && gameState === 'playing') {
        ctx.save();
        const cx = curIng.x + curIng.w / 2;
        // Neon guide line
        const guideAlpha = 0.06 + Math.sin(frameCount * 0.06) * 0.02;
        ctx.strokeStyle = fever ? `rgba(255,120,0,${guideAlpha * 2})` : `rgba(100,200,255,${guideAlpha})`;
        ctx.lineWidth = 1.5; ctx.setLineDash([4, 8]);
        ctx.beginPath(); ctx.moveTo(cx, curIng.sY + curIng.h); ctx.lineTo(cx, H); ctx.stroke();
        ctx.setLineDash([]);
        // Neon glow around guide line
        ctx.globalAlpha = guideAlpha * 0.4;
        ctx.strokeStyle = fever ? '#FF6B35' : '#64B5F6';
        ctx.lineWidth = 6; ctx.filter = 'blur(3px)';
        ctx.beginPath(); ctx.moveTo(cx, curIng.sY + curIng.h); ctx.lineTo(cx, H); ctx.stroke();
        ctx.filter = 'none'; ctx.lineWidth = 1; ctx.globalAlpha = 1;

        // Target zone (glowing)
        if (ps.length > 0) {
            const tp = ps[ps.length - 1];
            const zAlpha = 0.08 + Math.sin(frameCount * 0.05) * 0.04;
            const zoneColor = fever ? `rgba(255,150,0,${zAlpha * 2})` : `rgba(76,175,80,${zAlpha})`;
            ctx.strokeStyle = zoneColor; ctx.lineWidth = PERFECT_TH * 2;
            ctx.beginPath(); ctx.moveTo(tp.cx, curIng.sY + curIng.h + 10); ctx.lineTo(tp.cx, tp.y - cameraY); ctx.stroke();
            ctx.lineWidth = 1;
        }
        ctx.restore();
        drawIng(curIng.x, curIng.sY, curIng.w, curIng.h, curIng.ing, 0, isGolden);

        // Ingredient name with glow
        ctx.save();
        if (isGolden) {
            ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 8;
        }
        ctx.fillStyle = isGolden ? '#FFD700' : 'rgba(255,255,255,0.5)';
        ctx.font = `${isGolden ? 'bold ' : ''}12px "Segoe UI",sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(isGolden ? '★ ' + curIng.ing.name + ' ★' : curIng.ing.name, curIng.x + curIng.w / 2, curIng.sY - 6);
        ctx.restore();
    }
    if (gameState === 'playing' || gameState === 'dropping' || gameState === 'dog') {
        drawInstMeter();
        drawComboMeter();
    }
    if (dogActive) drawDog(dogX, dogY);
    drawImpactRings();
    drawJuiceDrops();
    drawParticles();
    drawFloatingTexts();

    // Fever overlay glow (top and bottom borders pulse)
    if (fever) {
        const fv = 0.03 + feverGlow * 0.04;
        ctx.fillStyle = `rgba(255,100,0,${fv})`;
        ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
}

function loop() {
    if (!gamePaused) { update(); draw(); }
    requestAnimationFrame(loop);
}

// ─── Input ───
function handleDrop() { if (gameState === 'playing' && curIng && !gamePaused) dropIng(); }
canvas.addEventListener('click', e => { if (e.target !== canvas) return; e.preventDefault(); handleDrop(); });
canvas.addEventListener('touchstart', e => { if (e.target !== canvas) return; e.preventDefault(); handleDrop(); }, { passive: false });
document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); handleDrop(); }
    if (e.code === 'Escape' || e.key === 'Escape') { e.preventDefault(); togglePause(); }
});

// ─── Prevent context menu & long-tap (1.6.1.8 / 1.6.2.7) ───
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('selectstart', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
// Prevent pull-to-refresh / swipe navigation (1.10.2)
document.addEventListener('touchmove', e => {
    if (!e.target.closest('.leaderboard')) e.preventDefault();
}, { passive: false });

// ─── Mute toggle (6.2) ───
const btnMute = document.getElementById('btn-mute');
btnMute.addEventListener('click', e => {
    e.stopPropagation();
    soundMuted = !soundMuted;
    btnMute.textContent = soundMuted ? '🔇' : '🔊';
    if (soundMuted) { speechSynthesis.cancel(); if (audioCtx) audioCtx.suspend(); }
    else { if (audioCtx) audioCtx.resume(); }
});

// ─── Pause toggle (6.3) ───
const pauseOverlay = document.getElementById('pause-overlay');
function togglePause() {
    if (gameState !== 'playing' && gameState !== 'dropping' && gameState !== 'dog' && !gamePaused) return;
    gamePaused = !gamePaused;
    pauseOverlay.classList.toggle('active', gamePaused);
    if (gamePaused) {
        speechSynthesis.cancel();
        if (audioCtx) audioCtx.suspend();
        if (ysdk) try { ysdk.features.GameplayAPI.stop(); } catch(e) {}
    } else {
        if (!soundMuted && audioCtx) audioCtx.resume();
        if (ysdk) try { ysdk.features.GameplayAPI.start(); } catch(e) {}
    }
}
document.getElementById('btn-pause').addEventListener('click', e => { e.stopPropagation(); togglePause(); });
document.getElementById('btn-resume').addEventListener('click', e => { e.stopPropagation(); togglePause(); });
document.getElementById('btn-pause-menu').addEventListener('click', e => {
    e.stopPropagation();
    gamePaused = false; pauseOverlay.classList.remove('active');
    if (ysdk) try { ysdk.features.GameplayAPI.stop(); } catch(e) {}
    showScreen('start');
});

// ─── Visibility change — pause sound & game on minimize (1.3) ───
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        speechSynthesis.cancel();
        if (audioCtx) audioCtx.suspend();
        if ((gameState === 'playing' || gameState === 'dropping' || gameState === 'dog') && !gamePaused) {
            togglePause();
        }
    } else {
        if (!soundMuted && audioCtx) audioCtx.resume();
    }
});

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
document.getElementById('btn-result-menu').addEventListener('click', () => { updateLevelBadge(); displayStreak(); showScreen('start'); });

// ─── Second Life + Triple Score buttons ───
document.getElementById('btn-second-life').addEventListener('click', () => useSecondLife());
document.getElementById('btn-skip-life').addEventListener('click', () => skipSecondLife());
document.getElementById('btn-triple-score').addEventListener('click', () => {
    showRewardedAd(() => {
        scoreTripled = true;
        const oldScore = score;
        score *= 3;
        // Update leaderboard with tripled score
        if (score > personalBest) {
            personalBest = score;
            localStorage.setItem('burger_pb', String(score));
        }
        saveLB(playerName, score, level);
        document.getElementById('result-score').textContent = score;
        document.getElementById('btn-triple-score').style.display = 'none';
        const bestEl = document.getElementById('result-best');
        if (bestEl) bestEl.textContent = `Лучший результат: ${personalBest} очков, ${bestFloors} этажей`;
    });
});

// ─── Quests Screen ───
document.getElementById('btn-quests').addEventListener('click', () => { renderQuestsScreen(); showScreen('quests'); });
document.getElementById('btn-quests-back').addEventListener('click', () => showScreen('start'));

// ─── Yandex Games SDK ───
let ysdk = null;
function initSDK() {
    if (typeof YaGames === 'undefined') return;
    YaGames.init().then(sdk => {
        ysdk = sdk;
        sdk.features.LoadingAPI.ready();
        // Auto language detection (2.14)
        try {
            const lang = sdk.environment.i18n.lang;
            document.documentElement.lang = lang === 'ru' ? 'ru' : lang;
        } catch(e) {}
    }).catch(() => {});
}

// ─── Init ───
document.getElementById('player-name').value = localStorage.getItem('burger_pn') || '';
// Show personal best on start screen
const startBestEl = document.getElementById('start-best');
if (startBestEl && personalBest > 0) {
    startBestEl.textContent = `Твой рекорд: ${personalBest} очков, ${bestFloors} этажей`;
}
// Initialize engagement systems
updateStreak();
updateLevelBadge();
displayStreak();
loadQuests();
showScreen('start'); loop(); initSDK();

// ─── Animated menu background ───
(function() {
    const bgc = document.getElementById('bg-canvas');
    if (!bgc) return;
    const bctx = bgc.getContext('2d');
    const menuStars = [], menuBokeh = [];
    let bW, bH, bFrame = 0;

    function resizeBG() {
        bW = window.innerWidth; bH = window.innerHeight;
        bgc.width = bW; bgc.height = bH;
    }
    window.addEventListener('resize', resizeBG);
    resizeBG();

    for (let i = 0; i < 80; i++) {
        menuStars.push({ x: Math.random() * bW, y: Math.random() * bH, s: 0.3 + Math.random() * 1.5, tw: Math.random() * Math.PI * 2, spd: 0.01 + Math.random() * 0.03 });
    }
    for (let i = 0; i < 8; i++) {
        menuBokeh.push({ x: Math.random() * bW, y: Math.random() * bH, r: 30 + Math.random() * 60, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.2, hue: 20 + Math.random() * 30, alpha: 0.02 + Math.random() * 0.04 });
    }

    function drawMenuBG() {
        bFrame++;
        const hue = 220 + Math.sin(bFrame * 0.002) * 15;
        const g = bctx.createLinearGradient(0, 0, 0, bH);
        g.addColorStop(0, `hsl(${hue}, 25%, 4%)`);
        g.addColorStop(0.5, `hsl(${hue + 10}, 20%, 7%)`);
        g.addColorStop(1, `hsl(${hue - 5}, 30%, 3%)`);
        bctx.fillStyle = g; bctx.fillRect(0, 0, bW, bH);

        for (const s of menuStars) {
            s.tw += s.spd;
            const tw = Math.sin(s.tw) * 0.5 + 0.5;
            bctx.globalAlpha = 0.1 + tw * 0.5;
            bctx.fillStyle = '#fff';
            bctx.beginPath(); bctx.arc(s.x, s.y, s.s, 0, Math.PI * 2); bctx.fill();
        }
        bctx.globalAlpha = 1;

        for (const b of menuBokeh) {
            b.x += b.vx; b.y += b.vy;
            if (b.x < -b.r) b.x = bW + b.r;
            if (b.x > bW + b.r) b.x = -b.r;
            if (b.y < -b.r) b.y = bH + b.r;
            if (b.y > bH + b.r) b.y = -b.r;
            const pulse = Math.sin(bFrame * 0.015 + b.hue) * 0.3 + 0.7;
            const bg = bctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
            bg.addColorStop(0, `hsla(${b.hue}, 70%, 55%, ${b.alpha * pulse})`);
            bg.addColorStop(1, 'rgba(0,0,0,0)');
            bctx.fillStyle = bg;
            bctx.beginPath(); bctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); bctx.fill();
        }

        requestAnimationFrame(drawMenuBG);
    }
    drawMenuBG();
})();
