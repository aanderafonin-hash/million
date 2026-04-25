// Каталог нарядов для пекинеса. Используется экраном «Гардероб» и спрайтом.
// Категории:
//   - hat   (шапочка, надевается на голову)
//   - body  (юбка / шорты / платье — взаимоисключающие)
const OUTFITS = {
  hat: [
    { id: 'beret', name: 'Красный беретик', main: '#d63a2c', accent: '#ffffff', dark: '#7a1c14' },
    { id: 'cap', name: 'Голубая бейсболка', main: '#3a8ad8', accent: '#ffffff', dark: '#194a7a' },
    { id: 'bow', name: 'Розовый бантик', main: '#f06d96', accent: '#ffffff', dark: '#a83560' },
    { id: 'crown', name: 'Золотая корона', main: '#f3c940', accent: '#ffe98a', dark: '#8a6a10' },
  ],
  body: [
    // Юбки
    { id: 'skirt-pink', name: 'Розовая юбка', sub: 'skirt', main: '#f06d96', accent: '#ffffff', dark: '#a83560' },
    { id: 'skirt-blue', name: 'Синяя плиссе', sub: 'skirt', main: '#3a8ad8', accent: '#ffffff', dark: '#194a7a' },
    { id: 'skirt-plaid', name: 'Красная клетка', sub: 'skirt', main: '#c4313a', accent: '#1a1a1a', dark: '#7a1c14' },
    { id: 'skirt-tutu', name: 'Бирюзовая пачка', sub: 'skirt', main: '#5ed8c4', accent: '#ffffff', dark: '#2a8a78' },
    // Шорты
    { id: 'shorts-denim', name: 'Джинсовые шорты', sub: 'shorts', main: '#3a5a8d', accent: '#f3c940', dark: '#1a3060' },
    { id: 'shorts-red', name: 'Спортивные красные', sub: 'shorts', main: '#c4313a', accent: '#ffffff', dark: '#7a1c14' },
    { id: 'shorts-camo', name: 'Зелёный камуфляж', sub: 'shorts', main: '#5a7a3a', accent: '#3a4a20', dark: '#2a3a14' },
    { id: 'shorts-black', name: 'Чёрные классические', sub: 'shorts', main: '#2a2a2a', accent: '#ffffff', dark: '#0a0a0a' },
    // Вечернее платье
    { id: 'dress-red', name: 'Красное вечернее', sub: 'dress', main: '#c4313a', accent: '#f3c940', dark: '#7a1c14' },
    { id: 'dress-black', name: 'Чёрное со звёздами', sub: 'dress', main: '#1a1a1a', accent: '#f3c940', dark: '#000000' },
    { id: 'dress-gold', name: 'Золотое с пайетками', sub: 'dress', main: '#f3c940', accent: '#ffffff', dark: '#8a6a10' },
    { id: 'dress-lavender', name: 'Лавандовое', sub: 'dress', main: '#a884d8', accent: '#ffffff', dark: '#5a3a8a' },
  ],
};
