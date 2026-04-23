// Level definitions for Такса и косточки
// Each level: { id, name, bonesToWin, tickMs, obstacles: [{x,y}...] }
// Grid is 20x20. Keep a safe corridor around start (7..10, 10) empty.

(function (global) {
  'use strict';

  const GRID = 20;

  // --- helpers ---
  function hline(y, x1, x2) {
    const arr = [];
    for (let x = x1; x <= x2; x++) arr.push({ x, y });
    return arr;
  }
  function vline(x, y1, y2) {
    const arr = [];
    for (let y = y1; y <= y2; y++) arr.push({ x, y });
    return arr;
  }
  function block(x, y, w, h) {
    const arr = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) arr.push({ x: x + i, y: y + j });
    return arr;
  }
  function merge(...groups) {
    const set = new Map();
    for (const g of groups) for (const p of g) set.set(p.x + ',' + p.y, p);
    // Remove any cells overlapping the start area (the first 4 cells on row 10)
    const safe = new Set(['7,10', '8,10', '9,10', '10,10', '11,10']);
    return [...set.values()].filter(p => !safe.has(p.x + ',' + p.y));
  }

  // --- handcrafted patterns ---
  const patterns = [
    // 1 — обучение
    () => [],
    // 2 — два блока по углам
    () => merge(block(2, 2, 1, 1), block(17, 17, 1, 1)),
    // 3 — четыре угловых блока
    () => merge(block(2, 2, 2, 1), block(16, 2, 2, 1), block(2, 17, 2, 1), block(16, 17, 2, 1)),
    // 4 — центральный квадрат
    () => merge(block(9, 4, 2, 2), block(9, 14, 2, 2)),
    // 5 — плюс в центре
    () => merge(hline(10, 8, 12), vline(10, 8, 12)),
    // 6 — две короткие стенки
    () => merge(hline(5, 4, 9), hline(15, 10, 15)),
    // 7 — коридор горизонтальный
    () => merge(hline(7, 2, 8), hline(7, 11, 17), hline(13, 2, 8), hline(13, 11, 17)),
    // 8 — крест
    () => merge(hline(10, 2, 6), hline(10, 13, 17), vline(10, 2, 6), vline(10, 13, 17)),
    // 9 — четыре L
    () => merge(
      hline(3, 2, 4), vline(2, 3, 5),
      hline(3, 15, 17), vline(17, 3, 5),
      hline(16, 2, 4), vline(2, 14, 16),
      hline(16, 15, 17), vline(17, 14, 16),
    ),
    // 10 — центральная линия с проходом
    () => merge(hline(10, 0, 7), hline(10, 12, 19)),
    // 11 — T-образные стены
    () => merge(vline(5, 0, 10), hline(10, 0, 5), vline(14, 9, 19), hline(10, 14, 19)),
    // 12 — разбросанные 6 блоков
    () => merge(block(4, 4, 1, 1), block(15, 4, 1, 1), block(8, 7, 1, 1), block(12, 12, 1, 1), block(4, 15, 1, 1), block(15, 15, 1, 1)),
    // 13 — восемь блоков «шахматкой»
    () => merge(
      block(3, 3, 1, 1), block(7, 3, 1, 1), block(11, 3, 1, 1), block(15, 3, 1, 1),
      block(3, 16, 1, 1), block(7, 16, 1, 1), block(11, 16, 1, 1), block(15, 16, 1, 1),
    ),
    // 14 — два коридора
    () => merge(hline(6, 4, 15), hline(14, 4, 15)),
    // 15 — рамка без углов
    () => merge(hline(2, 5, 14), hline(17, 5, 14), vline(2, 5, 14), vline(17, 5, 14)),
    // 16 — четыре уголка в центре
    () => merge(
      hline(6, 6, 8), vline(6, 6, 8),
      hline(6, 11, 13), vline(13, 6, 8),
      hline(13, 6, 8), vline(6, 11, 13),
      hline(13, 11, 13), vline(13, 11, 13),
    ),
    // 17 — диагональные отрезки
    () => merge(
      block(3, 3, 2, 1), block(6, 6, 2, 1), block(12, 12, 2, 1), block(15, 15, 2, 1),
      block(15, 3, 2, 1), block(12, 6, 2, 1), block(6, 12, 2, 1), block(3, 15, 2, 1),
    ),
    // 18 — зигзаг по горизонтали
    () => merge(hline(5, 0, 7), hline(10, 6, 13), hline(15, 12, 19)),
    // 19 — зигзаг по вертикали
    () => merge(vline(5, 0, 7), vline(10, 6, 13), vline(15, 12, 19)),
    // 20 — «ромб»
    () => merge(
      block(10, 3, 1, 1), block(9, 4, 1, 1), block(11, 4, 1, 1),
      block(8, 5, 1, 1), block(12, 5, 1, 1),
      block(7, 6, 1, 1), block(13, 6, 1, 1),
      block(7, 13, 1, 1), block(13, 13, 1, 1),
      block(8, 14, 1, 1), block(12, 14, 1, 1),
      block(9, 15, 1, 1), block(11, 15, 1, 1), block(10, 16, 1, 1),
    ),
    // 21 — спираль-начало
    () => merge(
      hline(3, 3, 16), vline(16, 3, 16), hline(16, 5, 16), vline(5, 6, 16),
    ),
    // 22 — лабиринт
    () => merge(
      hline(4, 0, 12), hline(8, 7, 19), hline(12, 0, 12), hline(16, 7, 19),
    ),
    // 23 — буква H
    () => merge(vline(5, 3, 16), vline(14, 3, 16), hline(10, 6, 13)),
    // 24 — рамка с дырками
    () => merge(
      hline(3, 3, 7), hline(3, 12, 16),
      hline(16, 3, 7), hline(16, 12, 16),
      vline(3, 5, 7), vline(3, 12, 14),
      vline(16, 5, 7), vline(16, 12, 14),
    ),
    // 25 — восемь парных стенок
    () => merge(
      block(3, 3, 2, 1), block(14, 3, 3, 1),
      block(3, 7, 1, 2), block(14, 7, 1, 2),
      block(3, 11, 1, 2), block(14, 11, 1, 2),
      block(3, 16, 3, 1), block(14, 16, 3, 1),
      block(8, 5, 4, 1), block(8, 14, 4, 1),
    ),
    // 26 — много разбросанных
    () => merge(
      block(3, 3, 1, 1), block(6, 5, 1, 1), block(9, 3, 1, 1), block(13, 5, 1, 1), block(16, 3, 1, 1),
      block(4, 8, 1, 1), block(8, 8, 1, 1), block(12, 8, 1, 1), block(16, 8, 1, 1),
      block(3, 12, 1, 1), block(7, 14, 1, 1), block(11, 12, 1, 1), block(15, 14, 1, 1),
      block(5, 17, 1, 1), block(10, 16, 1, 1), block(14, 17, 1, 1),
    ),
    // 27 — плотный лабиринт
    () => merge(
      hline(3, 2, 8), hline(3, 11, 17),
      vline(8, 4, 8), vline(11, 4, 8),
      hline(12, 2, 8), hline(12, 11, 17),
      vline(8, 13, 17), vline(11, 13, 17),
    ),
    // 28 — две комнаты
    () => merge(
      vline(9, 0, 7), vline(10, 0, 7),
      vline(9, 12, 19), vline(10, 12, 19),
    ),
    // 29 — очень плотно
    () => merge(
      hline(3, 2, 6), hline(3, 13, 17),
      hline(6, 9, 10),
      hline(10, 2, 4), hline(10, 15, 17),
      hline(14, 9, 10),
      hline(17, 2, 6), hline(17, 13, 17),
      vline(2, 6, 8), vline(17, 6, 8),
      vline(2, 12, 14), vline(17, 12, 14),
    ),
    // 30 — финальный босс
    () => merge(
      hline(2, 2, 17), hline(17, 2, 17),
      vline(2, 4, 15), vline(17, 4, 15),
      block(6, 6, 2, 2), block(12, 6, 2, 2),
      block(6, 12, 2, 2), block(12, 12, 2, 2),
      block(9, 9, 2, 2),
    ),
  ];

  // --- names for flavor ---
  const names = [
    'Щенячьи шаги', 'Первые блоки', 'Углы двора', 'Прогулка в парке', 'Крестовый поход',
    'Двор с заборчиком', 'Коридор', 'Перекрёсток', 'Четыре угла', 'Проход в стене',
    'Два выхода', 'Рассыпанные камни', 'Шахматная лужайка', 'Двойной тоннель', 'Открытый дворик',
    'Квартет углов', 'По диагонали', 'Зигзаг', 'Змейка-зигзаг', 'Ромбовидный сад',
    'Спираль лая', 'Лабиринт лапок', 'Буква H', 'Дырявый забор', 'Восемь стенок',
    'Град камней', 'Путь мастера', 'Две комнаты', 'Тесный переулок', 'Финальный поход',
  ];

  // Rewards: tier ladder by level
  function rewardFor(level) {
    if (level <= 5)  return { icon: '🥉', medal: 'bronze',   title: 'Щенок' };
    if (level <= 10) return { icon: '🥈', medal: 'silver',   title: 'Юный охотник' };
    if (level <= 15) return { icon: '🥇', medal: 'gold',     title: 'Мастер раскопок' };
    if (level <= 20) return { icon: '💎', medal: 'diamond',  title: 'Легенда такс' };
    if (level <= 25) return { icon: '🌈', medal: 'rainbow',  title: 'Король косточек' };
    return            { icon: '⭐', medal: 'star',     title: 'Чемпион' };
  }

  // Build final list
  // Каждый уровень: 10 косточек × 10 очков = 100 очков для прохождения.
  const BONES_TO_WIN = 10;
  const POINTS_PER_BONE = 10;
  const LEVELS = patterns.map(function (fn, i) {
    const level = i + 1;
    // speed: starts 180ms, ends ~85ms
    const tickMs = Math.max(85, 180 - (level - 1) * 3);
    return {
      id: level,
      name: names[i] || ('Уровень ' + level),
      bonesToWin: BONES_TO_WIN,
      pointsToWin: BONES_TO_WIN * POINTS_PER_BONE, // 100
      pointsPerBone: POINTS_PER_BONE, // 10
      tickMs: tickMs,
      obstacles: fn(),
      reward: rewardFor(level),
    };
  });

  global.LEVELS = LEVELS;
  global.GRID_SIZE = GRID;
})(window);
