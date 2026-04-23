/* Default catalogue of events.
 * Each event has outcomes with probabilities (sum ~= 1.0) and an odds
 * derived as 1 / (prob * (1 - margin)). The site keeps bookmaker margin small
 * for a friendlier virtual experience.
 */
window.DEFAULT_EVENTS = [
  // LIFE
  {
    id: 'life-rain-tomorrow',
    category: 'life',
    emoji: '🌧️',
    title: 'Пойдёт ли дождь завтра в вашем городе?',
    desc: 'Классика. Посмотри в окно, погадай на кофейной гуще.',
    outcomes: [
      { label: 'Да, промокнем', prob: 0.45 },
      { label: 'Нет, солнышко', prob: 0.5 },
      { label: 'Выпадет снег в мае', prob: 0.05 }
    ]
  },
  {
    id: 'life-lose-keys',
    category: 'life',
    emoji: '🔑',
    title: 'Вы потеряете ключи на этой неделе',
    desc: 'Считаются только серьёзные поиски дольше 10 минут.',
    outcomes: [
      { label: 'Потеряю', prob: 0.3 },
      { label: 'Всё под контролем', prob: 0.7 }
    ]
  },
  {
    id: 'life-wakeup-time',
    category: 'life',
    emoji: '⏰',
    title: 'Во сколько вы встанете завтра?',
    desc: 'По факту первого выхода из спальни.',
    outcomes: [
      { label: 'До 7:00 — герой', prob: 0.2 },
      { label: '7:00–9:00 — норма', prob: 0.45 },
      { label: '9:00–11:00 — совушка', prob: 0.25 },
      { label: 'Позже 11:00 — легенда', prob: 0.1 }
    ]
  },
  {
    id: 'life-new-crush',
    category: 'life',
    emoji: '💘',
    title: 'Влюбитесь в кого-то в течение месяца',
    desc: 'Даже платонически — засчитывается.',
    outcomes: [
      { label: 'Да, сердце — не камень', prob: 0.35 },
      { label: 'Нет, только работа', prob: 0.65 }
    ]
  },
  {
    id: 'life-parking',
    category: 'life',
    emoji: '🅿️',
    title: 'Найдёте парковку рядом с домом с первого раза',
    outcomes: [
      { label: 'Первый же круг', prob: 0.4 },
      { label: 'Через 2–3 круга', prob: 0.45 },
      { label: 'Припаркуюсь во дворе соседнем', prob: 0.15 }
    ]
  },

  // SPORT (для антуража обычной БК)
  {
    id: 'sport-football',
    category: 'sport',
    emoji: '⚽',
    title: 'Спартак — Зенит',
    desc: 'РПЛ. 15-й тур. Начало в 19:30.',
    outcomes: [
      { label: 'П1', prob: 0.34 },
      { label: 'X', prob: 0.28 },
      { label: 'П2', prob: 0.38 }
    ]
  },
  {
    id: 'sport-hockey',
    category: 'sport',
    emoji: '🏒',
    title: 'ЦСКА — Ак Барс',
    desc: 'КХЛ. Регулярка.',
    outcomes: [
      { label: 'П1', prob: 0.5 },
      { label: 'Ничья в осн.', prob: 0.12 },
      { label: 'П2', prob: 0.38 }
    ]
  },
  {
    id: 'sport-tennis',
    category: 'sport',
    emoji: '🎾',
    title: 'Медведев — Синнер',
    desc: 'ATP 1000.',
    outcomes: [
      { label: 'Победа Медведева', prob: 0.45 },
      { label: 'Победа Синнера', prob: 0.55 }
    ]
  },
  {
    id: 'sport-ufc',
    category: 'sport',
    emoji: '🥊',
    title: 'UFC: исход главного боя',
    outcomes: [
      { label: 'Нокаут в 1-м раунде', prob: 0.18 },
      { label: 'Победа решением', prob: 0.45 },
      { label: 'Сабмишн', prob: 0.22 },
      { label: 'Ничья', prob: 0.05 },
      { label: 'Дисквалификация', prob: 0.1 }
    ]
  },

  // OFFICE
  {
    id: 'office-meeting',
    category: 'office',
    emoji: '🧑‍💼',
    title: 'Митинг в понедельник задержится больше чем на 10 минут',
    desc: 'Как обычно, Игорь не найдёт ссылку.',
    outcomes: [
      { label: 'Конечно да', prob: 0.65 },
      { label: 'В этот раз вовремя', prob: 0.3 },
      { label: 'Митинг вообще отменят', prob: 0.05 }
    ]
  },
  {
    id: 'office-deadline',
    category: 'office',
    emoji: '📅',
    title: 'Вы сдадите задачу в срок',
    outcomes: [
      { label: 'В срок — чудеса случаются', prob: 0.35 },
      { label: 'На день позже', prob: 0.4 },
      { label: 'Попрошу перенос', prob: 0.25 }
    ]
  },
  {
    id: 'office-pizza',
    category: 'office',
    emoji: '🍕',
    title: 'В пятницу закажут пиццу в офис',
    outcomes: [
      { label: 'Да, маргарита', prob: 0.5 },
      { label: 'Нет, только бутеры', prob: 0.4 },
      { label: 'Суши вместо пиццы', prob: 0.1 }
    ]
  },
  {
    id: 'office-zoom',
    category: 'office',
    emoji: '🎥',
    title: 'Кто-то забудет включить микрофон в Zoom',
    outcomes: [
      { label: 'Да (и это будет Вася)', prob: 0.6 },
      { label: 'Да (но не Вася)', prob: 0.3 },
      { label: 'Все чётко', prob: 0.1 }
    ]
  },

  // HOME
  {
    id: 'home-dinner',
    category: 'home',
    emoji: '🍝',
    title: 'На ужин сегодня будут макароны',
    outcomes: [
      { label: 'Да', prob: 0.35 },
      { label: 'Нет, что-то новенькое', prob: 0.55 },
      { label: 'Доставка заменит ужин', prob: 0.1 }
    ]
  },
  {
    id: 'home-cat',
    category: 'home',
    emoji: '🐈',
    title: 'Кот скинет что-то со стола в течение суток',
    outcomes: [
      { label: 'Скинет (кружку)', prob: 0.45 },
      { label: 'Скинет (еду)', prob: 0.2 },
      { label: 'Скинет сам себя (с дивана)', prob: 0.15 },
      { label: 'Всё целое', prob: 0.2 }
    ]
  },
  {
    id: 'home-delivery',
    category: 'home',
    emoji: '📦',
    title: 'Доставка привезёт заказ вовремя',
    outcomes: [
      { label: 'В слот', prob: 0.55 },
      { label: 'Опоздание до 30 мин', prob: 0.3 },
      { label: 'Опоздание > 30 мин', prob: 0.15 }
    ]
  },

  // WEIRD / ABSURD
  {
    id: 'weird-alien',
    category: 'weird',
    emoji: '👽',
    title: 'Инопланетяне свяжутся с человечеством в этом году',
    outcomes: [
      { label: 'Да', prob: 0.02 },
      { label: 'Нет', prob: 0.98 }
    ]
  },
  {
    id: 'weird-button',
    category: 'weird',
    emoji: '🔴',
    title: 'Если нажать красную кнопку — что-то сломается',
    outcomes: [
      { label: 'Обязательно', prob: 0.7 },
      { label: 'Обойдётся', prob: 0.3 }
    ]
  },
  {
    id: 'weird-dream',
    category: 'weird',
    emoji: '🌙',
    title: 'Приснится ли вам бывший/бывшая сегодня?',
    outcomes: [
      { label: 'Да, приснится', prob: 0.25 },
      { label: 'Нет, слава богу', prob: 0.7 },
      { label: 'Приснится, но в странном контексте', prob: 0.05 }
    ]
  },
  {
    id: 'weird-wifi',
    category: 'weird',
    emoji: '📶',
    title: 'Wi-Fi в кафе будет медленнее 2 Мбит/с',
    outcomes: [
      { label: 'Уверенно медленнее', prob: 0.6 },
      { label: 'Нормально', prob: 0.35 },
      { label: 'Летает', prob: 0.05 }
    ]
  },
  {
    id: 'weird-song',
    category: 'weird',
    emoji: '🎧',
    title: 'Услышите Шамана/Киркорова в ближайшие 24 часа',
    outcomes: [
      { label: 'Услышу', prob: 0.55 },
      { label: 'Не услышу', prob: 0.45 }
    ]
  }
];
