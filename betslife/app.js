/* BetLife app logic — vanilla JS, LocalStorage persistence. */
(function () {
  'use strict';

  const MARGIN = 0.05; // bookmaker margin
  const CATEGORIES = {
    life: { label: 'Жизнь', emoji: '🎭' },
    sport: { label: 'Спорт', emoji: '⚽' },
    weird: { label: 'Абсурд', emoji: '🌀' },
    office: { label: 'Офис', emoji: '💼' },
    home: { label: 'Дома', emoji: '🏠' },
    mine: { label: 'Мои события', emoji: '🧑‍🎨' },
    history: { label: 'История', emoji: '📜' }
  };

  const LS_KEYS = {
    balance: 'betlife.balance',
    custom: 'betlife.customEvents',
    history: 'betlife.history',
    coupon: 'betlife.coupon'
  };

  const state = {
    category: 'life',
    coupon: [], // [{ eventId, outcomeIndex, title, outcomeLabel, odds }]
    balance: 10000,
    customEvents: [],
    history: [] // [{ id, ts, stake, totalOdds, possibleWin, status: 'win'|'lose', legs: [{ title, outcome, odds, won, resolved }] }]
  };

  // --- persistence ---------------------------------------------------------
  function load() {
    try {
      const b = localStorage.getItem(LS_KEYS.balance);
      if (b !== null) state.balance = Number(b);
      const c = localStorage.getItem(LS_KEYS.custom);
      if (c) state.customEvents = JSON.parse(c);
      const h = localStorage.getItem(LS_KEYS.history);
      if (h) state.history = JSON.parse(h);
      const cp = localStorage.getItem(LS_KEYS.coupon);
      if (cp) state.coupon = JSON.parse(cp);
    } catch (e) {
      console.warn('load failed', e);
    }
  }

  function save() {
    localStorage.setItem(LS_KEYS.balance, String(state.balance));
    localStorage.setItem(LS_KEYS.custom, JSON.stringify(state.customEvents));
    localStorage.setItem(LS_KEYS.history, JSON.stringify(state.history));
    localStorage.setItem(LS_KEYS.coupon, JSON.stringify(state.coupon));
  }

  function resetAll() {
    state.balance = 10000;
    state.customEvents = [];
    state.history = [];
    state.coupon = [];
    save();
  }

  // --- utilities -----------------------------------------------------------
  function fmtMoney(n) {
    const rounded = Math.round(n * 100) / 100;
    const s = rounded.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    return s + ' ₽';
  }

  function fmtOdds(o) {
    return (Math.round(o * 100) / 100).toFixed(2);
  }

  function probToOdds(prob) {
    // Apply margin: overround reduces effective probability.
    const effective = prob * (1 - MARGIN);
    if (effective <= 0) return 999;
    return Math.max(1.01, 1 / effective);
  }

  function getAllEvents() {
    return [...window.DEFAULT_EVENTS, ...state.customEvents];
  }

  function getEvent(id) {
    return getAllEvents().find(function (e) { return e.id === id; });
  }

  function pickWeighted(outcomes) {
    const sum = outcomes.reduce(function (a, o) { return a + o.prob; }, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < outcomes.length; i++) {
      r -= outcomes[i].prob;
      if (r <= 0) return i;
    }
    return outcomes.length - 1;
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  // --- rendering -----------------------------------------------------------
  const els = {
    tabs: document.getElementById('tabs'),
    events: document.getElementById('events'),
    balance: document.getElementById('balance'),
    couponItems: document.getElementById('coupon-items'),
    couponSummary: document.getElementById('coupon-summary'),
    couponCount: document.getElementById('coupon-count'),
    couponOdds: document.getElementById('coupon-odds'),
    couponWin: document.getElementById('coupon-win'),
    stake: document.getElementById('stake'),
    placeBet: document.getElementById('place-bet'),
    clearCoupon: document.getElementById('clear-coupon'),
    resetBalance: document.getElementById('reset-balance'),
    addEventBtn: document.getElementById('add-event-btn'),
    // modal (add event)
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    modalSave: document.getElementById('modal-save'),
    fTitle: document.getElementById('f-title'),
    fDesc: document.getElementById('f-desc'),
    fCategory: document.getElementById('f-category'),
    outcomes: document.getElementById('outcomes'),
    addOutcome: document.getElementById('add-outcome'),
    fProbSum: document.getElementById('f-probsum'),
    // modal (resolve)
    resolveBackdrop: document.getElementById('resolve-backdrop'),
    resolveClose: document.getElementById('resolve-close'),
    resolveBody: document.getElementById('resolve-body'),
    // toast
    toast: document.getElementById('toast')
  };

  function renderBalance() {
    els.balance.textContent = fmtMoney(state.balance);
  }

  function renderTabs() {
    els.tabs.querySelectorAll('.tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.cat === state.category);
    });
  }

  function renderEvents() {
    if (state.category === 'history') {
      renderHistory();
      return;
    }
    const all = getAllEvents();
    const list = all.filter(function (e) {
      if (state.category === 'mine') return state.customEvents.some(function (c) { return c.id === e.id; });
      return e.category === state.category;
    });

    els.events.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      if (state.category === 'mine') {
        empty.innerHTML = '<h3>Здесь пока пусто</h3><p>Нажми «+ Создать событие» и придумай рынок сам.</p>';
      } else {
        empty.innerHTML = '<h3>Событий нет</h3><p>Попробуй другую категорию.</p>';
      }
      els.events.appendChild(empty);
      return;
    }

    list.forEach(function (ev) {
      els.events.appendChild(renderEventCard(ev));
    });
  }

  function renderEventCard(ev) {
    const card = document.createElement('article');
    card.className = 'card';

    const catMeta = CATEGORIES[ev.category] || { label: ev.category, emoji: '' };

    const head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML =
      '<div style="display:flex;gap:10px;align-items:flex-start;min-width:0">' +
      '<span class="card-emoji">' + (ev.emoji || '🎯') + '</span>' +
      '<div style="min-width:0">' +
      '<div class="card-cat">' + (catMeta.emoji ? catMeta.emoji + ' ' : '') + catMeta.label + '</div>' +
      '<h3 class="card-title">' + escapeHtml(ev.title) + '</h3>' +
      (ev.desc ? '<div class="card-desc">' + escapeHtml(ev.desc) + '</div>' : '') +
      '</div>' +
      '</div>';
    card.appendChild(head);

    const outcomesEl = document.createElement('div');
    outcomesEl.className = 'outcomes-list';
    ev.outcomes.forEach(function (o, idx) {
      const btn = document.createElement('button');
      btn.className = 'outcome';
      btn.type = 'button';
      const isSelected = state.coupon.some(function (c) { return c.eventId === ev.id && c.outcomeIndex === idx; });
      if (isSelected) btn.classList.add('selected');
      btn.innerHTML =
        '<span class="outcome-label">' + escapeHtml(o.label) + '</span>' +
        '<span class="outcome-odds">' + fmtOdds(probToOdds(o.prob)) + '</span>';
      btn.addEventListener('click', function () { toggleCoupon(ev, idx); });
      outcomesEl.appendChild(btn);
    });
    card.appendChild(outcomesEl);

    const foot = document.createElement('div');
    foot.className = 'card-foot';
    const isCustom = state.customEvents.some(function (c) { return c.id === ev.id; });
    foot.innerHTML = '<span>Исходов: ' + ev.outcomes.length + '</span>';
    if (isCustom) {
      const del = document.createElement('button');
      del.className = 'card-delete';
      del.textContent = 'Удалить';
      del.addEventListener('click', function () {
        if (!confirm('Удалить своё событие «' + ev.title + '»?')) return;
        state.customEvents = state.customEvents.filter(function (c) { return c.id !== ev.id; });
        state.coupon = state.coupon.filter(function (c) { return c.eventId !== ev.id; });
        save();
        renderEvents();
        renderCoupon();
      });
      foot.appendChild(del);
    }
    card.appendChild(foot);

    return card;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function toggleCoupon(ev, outcomeIndex) {
    const existing = state.coupon.findIndex(function (c) { return c.eventId === ev.id; });
    if (existing >= 0 && state.coupon[existing].outcomeIndex === outcomeIndex) {
      state.coupon.splice(existing, 1);
    } else if (existing >= 0) {
      // replace selection within same event
      state.coupon[existing].outcomeIndex = outcomeIndex;
      state.coupon[existing].outcomeLabel = ev.outcomes[outcomeIndex].label;
      state.coupon[existing].odds = probToOdds(ev.outcomes[outcomeIndex].prob);
    } else {
      state.coupon.push({
        eventId: ev.id,
        outcomeIndex: outcomeIndex,
        title: ev.title,
        outcomeLabel: ev.outcomes[outcomeIndex].label,
        odds: probToOdds(ev.outcomes[outcomeIndex].prob)
      });
    }
    save();
    renderEvents();
    renderCoupon();
  }

  function renderCoupon() {
    els.couponItems.innerHTML = '';
    if (state.coupon.length === 0) {
      els.couponItems.innerHTML = '<div class="coupon-empty">Выбери исход в любом событии, чтобы добавить его в купон.</div>';
      els.couponSummary.hidden = true;
      return;
    }
    state.coupon.forEach(function (leg, i) {
      const item = document.createElement('div');
      item.className = 'coupon-item';
      item.innerHTML =
        '<div class="coupon-item-title">' + escapeHtml(leg.title) + '</div>' +
        '<div class="coupon-item-row">' +
        '<span>' + escapeHtml(leg.outcomeLabel) + '</span>' +
        '<span class="odds">' + fmtOdds(leg.odds) + '</span>' +
        '</div>';
      const remove = document.createElement('button');
      remove.className = 'coupon-item-remove';
      remove.title = 'Убрать из купона';
      remove.textContent = '✕';
      remove.addEventListener('click', function () {
        state.coupon.splice(i, 1);
        save();
        renderEvents();
        renderCoupon();
      });
      // overlay remove on the item
      item.style.position = 'relative';
      remove.style.position = 'absolute';
      remove.style.top = '6px';
      remove.style.right = '6px';
      item.appendChild(remove);
      els.couponItems.appendChild(item);
    });

    const totalOdds = state.coupon.reduce(function (a, l) { return a * l.odds; }, 1);
    const stake = Math.max(0, Number(els.stake.value) || 0);
    els.couponCount.textContent = state.coupon.length;
    els.couponOdds.textContent = fmtOdds(totalOdds);
    els.couponWin.textContent = fmtMoney(stake * totalOdds);
    els.couponSummary.hidden = false;

    const canBet = stake >= 10 && stake <= state.balance;
    els.placeBet.disabled = !canBet;
    if (stake > state.balance) {
      els.placeBet.textContent = 'Недостаточно средств';
    } else if (stake < 10) {
      els.placeBet.textContent = 'Минимум 10 ₽';
    } else {
      els.placeBet.textContent = 'Сделать ставку — ' + fmtMoney(stake);
    }
  }

  function clearCoupon() {
    state.coupon = [];
    save();
    renderEvents();
    renderCoupon();
  }

  // --- place bet & resolve -------------------------------------------------
  function placeBet() {
    const stake = Math.max(0, Number(els.stake.value) || 0);
    if (state.coupon.length === 0) return;
    if (stake < 10 || stake > state.balance) return;

    state.balance -= stake;

    const totalOdds = state.coupon.reduce(function (a, l) { return a * l.odds; }, 1);
    const possibleWin = stake * totalOdds;

    // Resolve each leg: pick outcome by true probabilities.
    const legs = state.coupon.map(function (leg) {
      const ev = getEvent(leg.eventId);
      if (!ev) {
        return {
          title: leg.title,
          outcome: leg.outcomeLabel,
          resolved: '(событие удалено)',
          odds: leg.odds,
          won: false
        };
      }
      const drawnIdx = pickWeighted(ev.outcomes);
      return {
        title: leg.title,
        outcome: leg.outcomeLabel,
        resolved: ev.outcomes[drawnIdx].label,
        odds: leg.odds,
        won: drawnIdx === leg.outcomeIndex
      };
    });

    const allWon = legs.every(function (l) { return l.won; });
    if (allWon) state.balance += possibleWin;

    const entry = {
      id: uid('bet'),
      ts: Date.now(),
      stake: stake,
      totalOdds: totalOdds,
      possibleWin: possibleWin,
      status: allWon ? 'win' : 'lose',
      legs: legs
    };
    state.history.unshift(entry);
    if (state.history.length > 200) state.history.length = 200;

    state.coupon = [];
    save();
    renderBalance();
    renderEvents();
    renderCoupon();
    showResolveModal(entry);
  }

  function showResolveModal(entry) {
    const frag = document.createDocumentFragment();

    entry.legs.forEach(function (l) {
      const row = document.createElement('div');
      row.className = 'resolve-event ' + (l.won ? 'win' : 'lose');
      row.innerHTML =
        '<div class="res-title">' + escapeHtml(l.title) + '</div>' +
        '<div class="res-line"><span>Ваш исход</span><span>' + escapeHtml(l.outcome) + ' · ' + fmtOdds(l.odds) + '</span></div>' +
        '<div class="res-line"><span>Случилось</span><span>' + (l.won ? '✅ ' : '❌ ') + escapeHtml(l.resolved) + '</span></div>';
      frag.appendChild(row);
    });

    const summary = document.createElement('div');
    summary.className = 'resolve-summary ' + entry.status;
    if (entry.status === 'win') {
      summary.textContent = 'Выигрыш ' + fmtMoney(entry.possibleWin) + ' 🎉';
    } else {
      summary.textContent = 'Ставка не сыграла. Минус ' + fmtMoney(entry.stake);
    }
    frag.appendChild(summary);

    els.resolveBody.innerHTML = '';
    els.resolveBody.appendChild(frag);
    els.resolveBackdrop.hidden = false;

    toast(entry.status === 'win' ? ('Выигрыш ' + fmtMoney(entry.possibleWin)) : 'Не повезло — ' + fmtMoney(entry.stake) + ' пропали', entry.status);
  }

  // --- history -------------------------------------------------------------
  function renderHistory() {
    els.events.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'history-list';
    wrap.style.gridColumn = '1 / -1';

    if (state.history.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = '<h3>История пуста</h3><p>Сделай первую ставку!</p>';
      els.events.appendChild(empty);
      return;
    }

    state.history.forEach(function (e) {
      const item = document.createElement('div');
      item.className = 'history-item ' + e.status;
      const date = new Date(e.ts);
      const dstr = date.toLocaleString('ru-RU');
      const legsHtml = e.legs.map(function (l) {
        return '<div class="history-leg ' + (l.won ? 'win' : 'lose') + '">' +
          '<span>' + escapeHtml(l.title) + '</span>' +
          '<span class="leg-outcome">' + escapeHtml(l.outcome) + ' → ' + escapeHtml(l.resolved) + '</span>' +
          '</div>';
      }).join('');
      item.innerHTML =
        '<div class="history-head">' +
        '<span>' + dstr + ' · ' + e.legs.length + ' событий · коэф. ' + fmtOdds(e.totalOdds) + '</span>' +
        '<span class="history-status ' + e.status + '">' + (e.status === 'win' ? 'ВЫИГРЫШ' : 'ПРОИГРЫШ') + '</span>' +
        '</div>' +
        '<div class="history-legs">' + legsHtml + '</div>' +
        '<div class="history-foot">' +
        '<span>Ставка ' + fmtMoney(e.stake) + '</span>' +
        '<span>' + (e.status === 'win' ? 'Выплата ' + fmtMoney(e.possibleWin) : '—') + '</span>' +
        '</div>';
      wrap.appendChild(item);
    });
    els.events.appendChild(wrap);
  }

  // --- custom event modal --------------------------------------------------
  function openAddModal() {
    els.fTitle.value = '';
    els.fDesc.value = '';
    els.fCategory.value = 'mine';
    els.outcomes.innerHTML = '';
    addOutcomeRow('Да', 0.5);
    addOutcomeRow('Нет', 0.5);
    updateProbSum();
    els.modalBackdrop.hidden = false;
    setTimeout(function () { els.fTitle.focus(); }, 10);
  }

  function addOutcomeRow(label, prob) {
    const row = document.createElement('div');
    row.className = 'outcome-row';
    row.innerHTML =
      '<input type="text" class="o-label" placeholder="Исход" maxlength="60" value="' + (label || '') + '">' +
      '<input type="number" class="o-prob" min="0.01" max="0.99" step="0.01" value="' + (prob != null ? prob : 0.5) + '">' +
      '<button type="button" class="o-remove" title="Убрать">✕</button>';
    row.querySelector('.o-remove').addEventListener('click', function () {
      row.remove();
      updateProbSum();
    });
    row.querySelector('.o-prob').addEventListener('input', updateProbSum);
    row.querySelector('.o-label').addEventListener('input', updateProbSum);
    els.outcomes.appendChild(row);
  }

  function updateProbSum() {
    const rows = Array.from(els.outcomes.querySelectorAll('.outcome-row'));
    const probs = rows.map(function (r) { return Number(r.querySelector('.o-prob').value) || 0; });
    const sum = probs.reduce(function (a, b) { return a + b; }, 0);
    let msg = 'Сумма вероятностей: ' + (Math.round(sum * 100)) + '%';
    if (sum < 0.95) msg += ' — слишком мало, увеличь вероятности';
    else if (sum > 1.05) msg += ' — многовато, уменьши вероятности';
    else msg += ' — отлично';
    els.fProbSum.textContent = msg;
  }

  function saveCustomEvent() {
    const title = els.fTitle.value.trim();
    if (!title) { toast('Введи название события', 'info'); return; }
    const rows = Array.from(els.outcomes.querySelectorAll('.outcome-row'));
    if (rows.length < 2) { toast('Нужно минимум 2 исхода', 'info'); return; }
    const outcomes = rows.map(function (r) {
      return {
        label: r.querySelector('.o-label').value.trim(),
        prob: Number(r.querySelector('.o-prob').value) || 0
      };
    });
    if (outcomes.some(function (o) { return !o.label; })) { toast('У всех исходов должно быть название', 'info'); return; }
    const sum = outcomes.reduce(function (a, o) { return a + o.prob; }, 0);
    if (sum < 0.5 || sum > 2) { toast('Сумма вероятностей должна быть близка к 100%', 'info'); return; }
    // Normalise probabilities so they sum to 1.
    outcomes.forEach(function (o) { o.prob = o.prob / sum; });

    const cat = els.fCategory.value;
    const ev = {
      id: uid('custom'),
      category: cat,
      emoji: emojiForCategory(cat),
      title: title,
      desc: els.fDesc.value.trim(),
      outcomes: outcomes
    };
    state.customEvents.unshift(ev);
    save();
    els.modalBackdrop.hidden = true;
    state.category = cat === 'mine' ? 'mine' : cat;
    renderTabs();
    renderEvents();
    toast('Событие добавлено', 'info');
  }

  function emojiForCategory(cat) {
    const map = { mine: '🧑‍🎨', life: '🎭', office: '💼', home: '🏠', weird: '🌀', sport: '⚽' };
    return map[cat] || '🎯';
  }

  // --- toast --------------------------------------------------------------
  let toastTimer;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.className = 'toast ' + (type || 'info');
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 3500);
  }

  // --- wiring --------------------------------------------------------------
  function wire() {
    els.tabs.addEventListener('click', function (e) {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      state.category = btn.dataset.cat;
      renderTabs();
      renderEvents();
    });

    els.stake.addEventListener('input', renderCoupon);
    els.clearCoupon.addEventListener('click', clearCoupon);
    els.placeBet.addEventListener('click', placeBet);
    els.resetBalance.addEventListener('click', function () {
      if (!confirm('Сбросить баланс, историю и свои события?')) return;
      resetAll();
      renderBalance();
      renderEvents();
      renderCoupon();
      toast('Прогресс сброшен', 'info');
    });

    els.addEventBtn.addEventListener('click', openAddModal);
    els.modalClose.addEventListener('click', function () { els.modalBackdrop.hidden = true; });
    els.modalCancel.addEventListener('click', function () { els.modalBackdrop.hidden = true; });
    els.modalSave.addEventListener('click', saveCustomEvent);
    els.addOutcome.addEventListener('click', function () { addOutcomeRow('', 0.3); updateProbSum(); });

    els.resolveClose.addEventListener('click', function () { els.resolveBackdrop.hidden = true; });
    els.resolveBackdrop.addEventListener('click', function (e) {
      if (e.target === els.resolveBackdrop) els.resolveBackdrop.hidden = true;
    });
    els.modalBackdrop.addEventListener('click', function (e) {
      if (e.target === els.modalBackdrop) els.modalBackdrop.hidden = true;
    });
  }

  // --- init ---------------------------------------------------------------
  function init() {
    load();
    if (Number.isNaN(state.balance)) state.balance = 10000;
    wire();
    renderBalance();
    renderTabs();
    renderEvents();
    renderCoupon();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
