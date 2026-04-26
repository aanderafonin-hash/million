// Каталог нарядов для пекинеса. Используется экраном «Гардероб» и спрайтом.
// Категории:
//   - hat    (шапочка, надевается на голову)
//   - body   (юбка / шорты — взаимоисключающие)
//   - boots  (ботиночки на лапки)
// Поле `unlock` — сколько уровней нужно пройти, чтобы наряд стал доступен.
const OUTFITS = {
  hat: [
    { id: 'beret', name: 'Красный беретик', main: '#d63a2c', accent: '#ffffff', dark: '#7a1c14', unlock: 1 },
    { id: 'cap', name: 'Голубая бейсболка', main: '#3a8ad8', accent: '#ffffff', dark: '#194a7a', unlock: 1 },
    { id: 'bow', name: 'Розовый бантик', main: '#f06d96', accent: '#ffffff', dark: '#a83560', unlock: 2 },
    { id: 'crown', name: 'Золотая корона', main: '#f3c940', accent: '#ffe98a', dark: '#8a6a10', unlock: 4 },
    { id: 'tophat', name: 'Чёрный цилиндр', main: '#1a1a1a', accent: '#c4313a', dark: '#000000', unlock: 5 },
  ],
  body: [
    // Юбки
    { id: 'skirt-pink', name: 'Розовая юбка', sub: 'skirt', main: '#f06d96', accent: '#ffffff', dark: '#a83560', unlock: 1 },
    { id: 'skirt-blue', name: 'Синяя плиссе', sub: 'skirt', main: '#3a8ad8', accent: '#ffffff', dark: '#194a7a', unlock: 2 },
    { id: 'skirt-plaid', name: 'Красная клетка', sub: 'skirt', main: '#c4313a', accent: '#1a1a1a', dark: '#7a1c14', unlock: 3 },
    { id: 'skirt-tutu', name: 'Бирюзовая пачка', sub: 'skirt', main: '#5ed8c4', accent: '#ffffff', dark: '#2a8a78', unlock: 5 },
    // Шорты
    { id: 'shorts-denim', name: 'Джинсовые шорты', sub: 'shorts', main: '#3a5a8d', accent: '#f3c940', dark: '#1a3060', unlock: 1 },
    { id: 'shorts-red', name: 'Спортивные красные', sub: 'shorts', main: '#c4313a', accent: '#ffffff', dark: '#7a1c14', unlock: 2 },
    { id: 'shorts-camo', name: 'Зелёный камуфляж', sub: 'shorts', main: '#5a7a3a', accent: '#3a4a20', dark: '#2a3a14', unlock: 3 },
    { id: 'shorts-black', name: 'Чёрные классические', sub: 'shorts', main: '#2a2a2a', accent: '#ffffff', dark: '#0a0a0a', unlock: 4 },
  ],
  boots: [
    { id: 'boots-sneaker', name: 'Спортивные кроссовки', main: '#ffffff', accent: '#3a8ad8', dark: '#1a1a1a', unlock: 1 },
    { id: 'boots-rubber', name: 'Жёлтые сапожки', main: '#f3c940', accent: '#ffffff', dark: '#8a6a10', unlock: 2 },
    { id: 'boots-leather', name: 'Кожаные ботиночки', main: '#6a3a14', accent: '#f3c940', dark: '#3a1a08', unlock: 3 },
    { id: 'boots-winter', name: 'Уютные валеночки', main: '#d8d0b8', accent: '#a83560', dark: '#6a6050', unlock: 4 },
    { id: 'boots-ballet', name: 'Розовые балетки', main: '#f06d96', accent: '#ffffff', dark: '#a83560', unlock: 5 },
  ],
};
