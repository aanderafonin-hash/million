// Конфигурация уровней игры "Рыжий пекинес: летающие приключения".
// Каждый уровень задаёт длину (кол-во препятствий), размер "коридора" и скорость.
// obstacles -- массив типов препятствий, из которых уровень выбирает случайно.

const OBSTACLE_TYPES = ['sofa', 'armchair', 'chair', 'boot', 'slipper', 'toilet'];

const LEVELS = [
  {
    name: 'Уютная гостиная',
    description: 'Пекинес вылетел из корзинки и хочет долететь до хозяйки через гостиную.',
    obstacleCount: 10,
    gapSize: 210,
    spacing: 300,
    speed: 2.6,
    obstacles: ['sofa', 'armchair'],
    bgVariant: 0,
  },
  {
    name: 'В прихожей',
    description: 'Повсюду разбросаны тапки и ботинки — будь аккуратен!',
    obstacleCount: 14,
    gapSize: 195,
    spacing: 290,
    speed: 2.9,
    obstacles: ['boot', 'slipper', 'chair'],
    bgVariant: 1,
  },
  {
    name: 'Кухня и столовая',
    description: 'Между стульями и креслами нужно пролететь максимально точно.',
    obstacleCount: 18,
    gapSize: 185,
    spacing: 280,
    speed: 3.2,
    obstacles: ['chair', 'armchair', 'slipper'],
    bgVariant: 2,
  },
  {
    name: 'Ванная комната',
    description: 'Осторожно: унитазы, тапки и скользкий пол!',
    obstacleCount: 22,
    gapSize: 175,
    spacing: 270,
    speed: 3.5,
    obstacles: ['toilet', 'slipper', 'boot'],
    bgVariant: 3,
  },
  {
    name: 'Весь дом',
    description: 'Финальный рывок! Все препятствия дома — один за одним.',
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
