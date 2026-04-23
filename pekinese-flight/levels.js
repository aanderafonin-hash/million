// Конфигурация уровней игры "Рыжий пекинес: летающие приключения".
// Каждый уровень задаёт длину (кол-во препятствий), размер "коридора" и скорость.
// obstacles -- массив типов препятствий, из которых уровень выбирает случайно.
// Разрешённые типы: холодильник (fridge), тапок (slipper), ботинок (boot).

const OBSTACLE_TYPES = ['fridge', 'slipper', 'boot'];

const LEVELS = [
  {
    name: 'Уютная гостиная',
    description: 'Пекинес вылетел из корзинки и хочет долететь до хозяйки. По пути — разбросанные тапки и ботинки.',
    obstacleCount: 10,
    gapSize: 210,
    spacing: 300,
    speed: 2.6,
    obstacles: ['slipper', 'boot'],
    bgVariant: 0,
  },
  {
    name: 'В прихожей',
    description: 'В прихожей появляется холодильник — пролетай между тапками, ботинками и холодильником.',
    obstacleCount: 14,
    gapSize: 195,
    spacing: 290,
    speed: 2.9,
    obstacles: ['boot', 'slipper', 'fridge'],
    bgVariant: 1,
  },
  {
    name: 'Кухня',
    description: 'На кухне повсюду холодильники! Держись середины гапов.',
    obstacleCount: 18,
    gapSize: 185,
    spacing: 280,
    speed: 3.2,
    obstacles: ['fridge', 'fridge', 'slipper'],
    bgVariant: 2,
  },
  {
    name: 'Тесный коридор',
    description: 'Гап совсем узкий. Каждая косточка прибавляет пекинесу объём — будь точнее!',
    obstacleCount: 22,
    gapSize: 175,
    spacing: 270,
    speed: 3.5,
    obstacles: ['boot', 'slipper', 'fridge'],
    bgVariant: 3,
  },
  {
    name: 'Весь дом',
    description: 'Финальный рывок! Холодильник, тапок, ботинок — всё по очереди.',
    obstacleCount: 28,
    gapSize: 170,
    spacing: 260,
    speed: 3.8,
    obstacles: OBSTACLE_TYPES,
    bgVariant: 4,
  },
];

if (typeof module !== 'undefined') {
  module.exports = { LEVELS, OBSTACLE_TYPES };
}
