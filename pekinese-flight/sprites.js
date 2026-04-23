// Все спрайты (пекинес, хозяйка, препятствия, косточка, фон)
// рисуются процедурно через Canvas 2D API — без внешних изображений.

const Sprites = (() => {
  // ---------- Утилиты ----------
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
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

  // ---------- Рыжий пекинес ----------
  // Рисуется в квадрате размером size, центр в (0,0). Вызывающий код сам
  // применяет translate/rotate.
  function drawPekinese(ctx, size, flapPhase = 0) {
    const s = size;
    ctx.save();
    ctx.translate(-s / 2, -s / 2);

    const fur = '#e07a2d';          // основной рыжий
    const furLight = '#f4a75a';     // светло-рыжий
    const furDark = '#9c4d15';      // тёмный контур
    const white = '#fffaf2';        // белый мех на груди/морде
    const pink = '#ff9ab3';         // язычок
    const noseDark = '#1a0f08';

    // Тень под пекинесом
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(s * 0.55, s * 0.92, s * 0.35, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();

    // Хвост (закрученный)
    const tailWave = Math.sin(flapPhase * 2) * s * 0.04;
    ctx.save();
    ctx.translate(s * 0.18, s * 0.45 + tailWave);
    ctx.fillStyle = fur;
    ctx.strokeStyle = furDark;
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Пушистые пряди хвоста
    ctx.fillStyle = furLight;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * s * 0.12, Math.sin(a) * s * 0.12, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Тело (овальное, пушистое)
    ctx.save();
    ctx.fillStyle = fur;
    ctx.strokeStyle = furDark;
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.ellipse(s * 0.55, s * 0.6, s * 0.3, s * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Пушистые комки на теле
    ctx.fillStyle = furLight;
    for (const [px, py, pr] of [
      [0.42, 0.45, 0.07], [0.58, 0.42, 0.07], [0.72, 0.52, 0.06],
      [0.78, 0.65, 0.06], [0.4, 0.72, 0.07], [0.62, 0.8, 0.06],
    ]) {
      ctx.beginPath();
      ctx.arc(s * px, s * py, s * pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Белый животик
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.ellipse(s * 0.55, s * 0.72, s * 0.18, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Лапки (передние, машут для эффекта полёта)
    const pawLift = Math.sin(flapPhase) * s * 0.04;
    ctx.fillStyle = fur;
    ctx.strokeStyle = furDark;
    // Передняя левая
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.82 + pawLift, s * 0.05, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Передняя правая
    ctx.beginPath();
    ctx.ellipse(s * 0.66, s * 0.82 - pawLift, s * 0.05, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Голова (большая, круглая, чуть выдвинута вперёд)
    ctx.save();
    ctx.fillStyle = fur;
    ctx.strokeStyle = furDark;
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.arc(s * 0.72, s * 0.42, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Пушистые пряди на голове
    ctx.fillStyle = furLight;
    for (const [px, py, pr] of [
      [0.62, 0.3, 0.06], [0.72, 0.26, 0.06], [0.82, 0.3, 0.06],
      [0.58, 0.42, 0.05], [0.86, 0.5, 0.05],
    ]) {
      ctx.beginPath();
      ctx.arc(s * px, s * py, s * pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Уши (висячие, длинные, рыжие)
    ctx.fillStyle = furDark;
    ctx.beginPath();
    ctx.ellipse(s * 0.57, s * 0.5, s * 0.07, s * 0.15, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.87, s * 0.48, s * 0.07, s * 0.15, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Светлые участки на ушах
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(s * 0.58, s * 0.47, s * 0.04, s * 0.1, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.86, s * 0.45, s * 0.04, s * 0.1, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Мордочка (белый "воротник" вокруг носа)
    ctx.fillStyle = white;
    ctx.beginPath();
    ctx.ellipse(s * 0.78, s * 0.48, s * 0.11, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // Глаза (большие, блестящие)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s * 0.69, s * 0.4, s * 0.035, 0, Math.PI * 2);
    ctx.arc(s * 0.79, s * 0.38, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = noseDark;
    ctx.beginPath();
    ctx.arc(s * 0.7, s * 0.41, s * 0.02, 0, Math.PI * 2);
    ctx.arc(s * 0.8, s * 0.39, s * 0.02, 0, Math.PI * 2);
    ctx.fill();
    // Блик
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s * 0.705, s * 0.404, s * 0.006, 0, Math.PI * 2);
    ctx.arc(s * 0.805, s * 0.384, s * 0.006, 0, Math.PI * 2);
    ctx.fill();

    // Нос (курносый)
    ctx.fillStyle = noseDark;
    ctx.beginPath();
    ctx.ellipse(s * 0.82, s * 0.48, s * 0.03, s * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ротик + язычок
    ctx.strokeStyle = noseDark;
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(s * 0.82, s * 0.52);
    ctx.quadraticCurveTo(s * 0.8, s * 0.55, s * 0.78, s * 0.53);
    ctx.stroke();
    ctx.fillStyle = pink;
    ctx.beginPath();
    ctx.ellipse(s * 0.81, s * 0.55, s * 0.018, s * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  // ---------- Хозяйка ----------
  // Женщина с раскрытыми руками, на финальной сцене.
  function drawOwner(ctx, x, y, h = 220) {
    ctx.save();
    ctx.translate(x, y);
    const w = h * 0.5;

    // Ноги
    ctx.fillStyle = '#4a3a2a';
    roundRect(ctx, -w * 0.22, h * 0.55, w * 0.18, h * 0.42, 6);
    ctx.fill();
    roundRect(ctx, w * 0.04, h * 0.55, w * 0.18, h * 0.42, 6);
    ctx.fill();
    // Обувь
    ctx.fillStyle = '#2a1f15';
    roundRect(ctx, -w * 0.25, h * 0.94, w * 0.24, h * 0.05, 4);
    ctx.fill();
    roundRect(ctx, w * 0.01, h * 0.94, w * 0.24, h * 0.05, 4);
    ctx.fill();

    // Юбка / платье
    ctx.fillStyle = '#d84a7a';
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, h * 0.55);
    ctx.lineTo(w * 0.35, h * 0.55);
    ctx.lineTo(w * 0.28, h * 0.25);
    ctx.lineTo(-w * 0.28, h * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c43a6a';
    roundRect(ctx, -w * 0.3, h * 0.25, w * 0.6, h * 0.06, 4);
    ctx.fill();

    // Тело (верх)
    ctx.fillStyle = '#ffd2a8';
    roundRect(ctx, -w * 0.22, h * 0.1, w * 0.44, h * 0.2, 10);
    ctx.fill();

    // Руки раскрытые (встречают пекинеса)
    ctx.strokeStyle = '#ffd2a8';
    ctx.lineWidth = h * 0.08;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, h * 0.18);
    ctx.quadraticCurveTo(-w * 0.5, h * 0.1, -w * 0.55, -h * 0.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.18);
    ctx.quadraticCurveTo(w * 0.5, h * 0.1, w * 0.55, -h * 0.05);
    ctx.stroke();

    // Голова
    ctx.fillStyle = '#ffd2a8';
    ctx.beginPath();
    ctx.arc(0, -h * 0.02, h * 0.12, 0, Math.PI * 2);
    ctx.fill();
    // Волосы (тёмные)
    ctx.fillStyle = '#5a3420';
    ctx.beginPath();
    ctx.arc(0, -h * 0.05, h * 0.13, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-h * 0.12, h * 0.02, h * 0.04, h * 0.08, 0, 0, Math.PI * 2);
    ctx.ellipse(h * 0.12, h * 0.02, h * 0.04, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // Лицо: глаза, улыбка
    ctx.fillStyle = '#1a0f08';
    ctx.beginPath();
    ctx.arc(-h * 0.04, -h * 0.01, h * 0.012, 0, Math.PI * 2);
    ctx.arc(h * 0.04, -h * 0.01, h * 0.012, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b44';
    ctx.lineWidth = h * 0.01;
    ctx.beginPath();
    ctx.moveTo(-h * 0.03, h * 0.03);
    ctx.quadraticCurveTo(0, h * 0.055, h * 0.03, h * 0.03);
    ctx.stroke();
    // Румянец
    ctx.fillStyle = 'rgba(255,120,140,0.6)';
    ctx.beginPath();
    ctx.arc(-h * 0.06, h * 0.02, h * 0.015, 0, Math.PI * 2);
    ctx.arc(h * 0.06, h * 0.02, h * 0.015, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---------- Косточка ----------
  function drawBone(ctx, x, y, size = 48, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const s = size;
    ctx.fillStyle = '#fff6d8';
    ctx.strokeStyle = '#8c6a2a';
    ctx.lineWidth = Math.max(1, s * 0.04);
    const r = s * 0.22;
    // Тело кости (прямоугольник с закруглениями)
    ctx.beginPath();
    ctx.arc(-s * 0.45, -r, r, 0, Math.PI * 2);
    ctx.arc(-s * 0.45, r, r, 0, Math.PI * 2);
    ctx.arc(s * 0.45, -r, r, 0, Math.PI * 2);
    ctx.arc(s * 0.45, r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.3);
    // Контуры
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, -s * 0.15);
    ctx.lineTo(s * 0.45, -s * 0.15);
    ctx.moveTo(-s * 0.45, s * 0.15);
    ctx.lineTo(s * 0.45, s * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-s * 0.45, -r, r, Math.PI, Math.PI * 2);
    ctx.arc(-s * 0.45, r, r, 0, Math.PI);
    ctx.arc(s * 0.45, -r, r, Math.PI, Math.PI * 2);
    ctx.arc(s * 0.45, r, r, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- Препятствия ----------
  // Все препятствия рисуются в прямоугольнике (x, y, w, h).
  // Если flipped=true, рисуем вверх ногами (для верхних препятствий).

  function withFlip(ctx, x, y, w, h, flipped, drawFn) {
    ctx.save();
    if (flipped) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(1, -1);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    drawFn();
    ctx.restore();
  }

  function drawSofa(ctx, x, y, w, h, flipped = false) {
    withFlip(ctx, x, y, w, h, flipped, () => {
      const cushH = h * 0.35;
      const legH = h * 0.1;
      // Спинка
      ctx.fillStyle = '#7a4b2e';
      roundRect(ctx, x, y, w, h - legH - cushH * 0.3, 14);
      ctx.fill();
      // Подлокотники
      ctx.fillStyle = '#5e3820';
      roundRect(ctx, x, y + h * 0.25, w * 0.18, h - legH - h * 0.25, 10);
      ctx.fill();
      roundRect(ctx, x + w - w * 0.18, y + h * 0.25, w * 0.18, h - legH - h * 0.25, 10);
      ctx.fill();
      // Подушки
      ctx.fillStyle = '#c47a4a';
      const cushY = y + h - legH - cushH;
      const cushW = (w - w * 0.18 * 2) / 2 - 4;
      roundRect(ctx, x + w * 0.18 + 2, cushY, cushW, cushH, 10);
      ctx.fill();
      roundRect(ctx, x + w * 0.18 + cushW + 6, cushY, cushW, cushH, 10);
      ctx.fill();
      // Контур
      ctx.strokeStyle = 'rgba(40,20,10,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + w * 0.18 + 2, cushY, cushW, cushH);
      ctx.strokeRect(x + w * 0.18 + cushW + 6, cushY, cushW, cushH);
      // Ножки
      ctx.fillStyle = '#3a2414';
      ctx.fillRect(x + w * 0.05, y + h - legH, w * 0.1, legH);
      ctx.fillRect(x + w - w * 0.15, y + h - legH, w * 0.1, legH);
    });
  }

  function drawArmchair(ctx, x, y, w, h, flipped = false) {
    withFlip(ctx, x, y, w, h, flipped, () => {
      const legH = h * 0.08;
      // Спинка
      ctx.fillStyle = '#2c6a8f';
      roundRect(ctx, x + w * 0.1, y, w * 0.8, h - legH, 18);
      ctx.fill();
      // Подлокотники
      ctx.fillStyle = '#1d4c66';
      roundRect(ctx, x, y + h * 0.3, w * 0.22, h * 0.6, 12);
      ctx.fill();
      roundRect(ctx, x + w - w * 0.22, y + h * 0.3, w * 0.22, h * 0.6, 12);
      ctx.fill();
      // Сиденье / подушка
      ctx.fillStyle = '#4ea0c8';
      roundRect(ctx, x + w * 0.22, y + h * 0.5, w * 0.56, h * 0.38, 10);
      ctx.fill();
      // Декоративный кант
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + w * 0.22 + 4, y + h * 0.5 + 4, w * 0.56 - 8, h * 0.38 - 8);
      // Ножки
      ctx.fillStyle = '#3a2414';
      ctx.fillRect(x + w * 0.12, y + h - legH, w * 0.08, legH);
      ctx.fillRect(x + w - w * 0.2, y + h - legH, w * 0.08, legH);
    });
  }

  function drawChair(ctx, x, y, w, h, flipped = false) {
    withFlip(ctx, x, y, w, h, flipped, () => {
      const seatY = y + h * 0.55;
      const seatH = h * 0.15;
      const legH = h * 0.3;
      // Спинка
      ctx.fillStyle = '#a9692a';
      roundRect(ctx, x + w * 0.15, y, w * 0.7, h * 0.55, 6);
      ctx.fill();
      // Перекладины на спинке
      ctx.fillStyle = '#c68a48';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x + w * 0.2, y + h * 0.08 + i * h * 0.12, w * 0.6, h * 0.04);
      }
      // Сиденье
      ctx.fillStyle = '#c68a48';
      roundRect(ctx, x + w * 0.05, seatY, w * 0.9, seatH, 6);
      ctx.fill();
      // Ножки
      ctx.fillStyle = '#7a4b2e';
      ctx.fillRect(x + w * 0.12, seatY + seatH, w * 0.07, legH);
      ctx.fillRect(x + w - w * 0.19, seatY + seatH, w * 0.07, legH);
    });
  }

  function drawBoot(ctx, x, y, w, h, flipped = false) {
    withFlip(ctx, x, y, w, h, flipped, () => {
      ctx.fillStyle = '#3a2414';
      // Голенище
      roundRect(ctx, x + w * 0.15, y, w * 0.55, h * 0.7, 10);
      ctx.fill();
      // Носок
      ctx.beginPath();
      ctx.moveTo(x + w * 0.15, y + h * 0.6);
      ctx.lineTo(x + w * 0.95, y + h * 0.6);
      ctx.quadraticCurveTo(x + w, y + h * 0.8, x + w * 0.9, y + h * 0.88);
      ctx.lineTo(x + w * 0.12, y + h * 0.88);
      ctx.closePath();
      ctx.fill();
      // Подошва
      ctx.fillStyle = '#1a0d05';
      roundRect(ctx, x + w * 0.1, y + h * 0.85, w * 0.85, h * 0.12, 4);
      ctx.fill();
      // Шнурки
      ctx.strokeStyle = '#d8c190';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const yy = y + h * 0.12 + i * h * 0.12;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.22, yy);
        ctx.lineTo(x + w * 0.62, yy);
        ctx.stroke();
      }
      // Блик
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(ctx, x + w * 0.2, y + h * 0.05, w * 0.08, h * 0.6, 4);
      ctx.fill();
    });
  }

  function drawSlipper(ctx, x, y, w, h, flipped = false) {
    withFlip(ctx, x, y, w, h, flipped, () => {
      // "Тапок" занимает нижнюю часть прямоугольника, верх — помпон
      // Основная часть — плюшевый розовый тапок
      ctx.fillStyle = '#ffb3c6';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.08, y + h * 0.55);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.4, x + w * 0.95, y + h * 0.55);
      ctx.quadraticCurveTo(x + w * 0.95, y + h * 0.85, x + w * 0.75, y + h * 0.9);
      ctx.lineTo(x + w * 0.2, y + h * 0.9);
      ctx.quadraticCurveTo(x + w * 0.05, y + h * 0.85, x + w * 0.08, y + h * 0.55);
      ctx.closePath();
      ctx.fill();
      // Подошва
      ctx.fillStyle = '#7a4b6a';
      roundRect(ctx, x + w * 0.08, y + h * 0.88, w * 0.87, h * 0.08, 4);
      ctx.fill();
      // Помпон (пушистый, с глазами — в стиле "зверушки")
      ctx.fillStyle = '#fff3f6';
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.3, h * 0.22, 0, Math.PI * 2);
      ctx.fill();
      // Пушистость
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + w * 0.5 + Math.cos(a) * h * 0.2, y + h * 0.3 + Math.sin(a) * h * 0.2, h * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      // Глазки на помпоне
      ctx.fillStyle = '#1a0f08';
      ctx.beginPath();
      ctx.arc(x + w * 0.43, y + h * 0.28, h * 0.02, 0, Math.PI * 2);
      ctx.arc(x + w * 0.57, y + h * 0.28, h * 0.02, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawToilet(ctx, x, y, w, h, flipped = false) {
    withFlip(ctx, x, y, w, h, flipped, () => {
      // Бачок
      ctx.fillStyle = '#f4f4f4';
      roundRect(ctx, x + w * 0.15, y, w * 0.7, h * 0.45, 8);
      ctx.fill();
      ctx.strokeStyle = '#b8b8b8';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Кнопка
      ctx.fillStyle = '#c8c8c8';
      roundRect(ctx, x + w * 0.45, y + h * 0.08, w * 0.1, h * 0.08, 3);
      ctx.fill();
      // Сиденье (овал)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + h * 0.55, w * 0.42, h * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#aaa';
      ctx.stroke();
      // Чаша
      ctx.fillStyle = '#ececec';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.1, y + h * 0.6);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 1.02, x + w * 0.9, y + h * 0.6);
      ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.7, x + w * 0.1, y + h * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Вода (синяя лужица)
      ctx.fillStyle = '#7ec8ff';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + h * 0.7, w * 0.22, h * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const drawers = {
    sofa: drawSofa,
    armchair: drawArmchair,
    chair: drawChair,
    boot: drawBoot,
    slipper: drawSlipper,
    toilet: drawToilet,
  };

  function drawObstacle(ctx, type, x, y, w, h, flipped = false) {
    const fn = drawers[type] || drawSofa;
    fn(ctx, x, y, w, h, flipped);
  }

  // ---------- Фон ----------
  // Облако в небе
  function drawCloud(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const s = scale;
    ctx.beginPath();
    ctx.arc(0, 0, 22 * s, 0, Math.PI * 2);
    ctx.arc(25 * s, -6 * s, 28 * s, 0, Math.PI * 2);
    ctx.arc(50 * s, 0, 22 * s, 0, Math.PI * 2);
    ctx.arc(24 * s, 8 * s, 24 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // "Земля" — деревянный пол
  function drawFloor(ctx, x, y, w, h, offset = 0) {
    ctx.save();
    // Основа
    ctx.fillStyle = '#c28a52';
    ctx.fillRect(x, y, w, h);
    // Доски
    ctx.strokeStyle = 'rgba(70,40,15,0.55)';
    ctx.lineWidth = 2;
    const plankW = 80;
    const startX = x - (offset % plankW);
    for (let px = startX; px < x + w + plankW; px += plankW) {
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + h);
      ctx.stroke();
    }
    // Тёмная линия сверху (плинтус)
    ctx.fillStyle = '#7a4b2e';
    ctx.fillRect(x, y, w, 6);
    ctx.restore();
  }

  // Обои на фоне (разные для уровней)
  function drawWallpaper(ctx, w, h, variant = 0) {
    const variants = [
      { base: '#fff1c4', accent: '#ffd97a' }, // гостиная
      { base: '#d7e8ff', accent: '#9ac6f0' }, // прихожая
      { base: '#ffe0e6', accent: '#ffaec0' }, // кухня
      { base: '#e5f5d6', accent: '#b8dc8d' }, // ванная
      { base: '#ece5ff', accent: '#b8a8f0' }, // финал
    ];
    const v = variants[variant % variants.length];
    // Градиент обоев
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, v.base);
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Узор — повторяющиеся маленькие кружочки
    ctx.fillStyle = v.accent;
    for (let yy = 40; yy < h - 140; yy += 60) {
      for (let xx = 30 + (yy % 120 === 0 ? 0 : 30); xx < w; xx += 60) {
        ctx.beginPath();
        ctx.arc(xx, yy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return {
    drawPekinese,
    drawOwner,
    drawBone,
    drawObstacle,
    drawCloud,
    drawFloor,
    drawWallpaper,
  };
})();
