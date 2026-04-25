/* BetLife — vanilla JS app with auth, payments, i18n, live broadcasts and custom events. */
(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------
  const MARGIN = 0.05;
  const STARTING_BALANCE = 10000;

  const CATEGORIES = ['life', 'sport', 'weird', 'office', 'home', 'mine'];
  const CAT_EMOJI = { life: '🎭', sport: '⚽', weird: '🌀', office: '💼', home: '🏠', mine: '🧑‍🎨' };

  const AVATAR_EMOJIS = [
    '🦊', '🐼', '🐨', '🐯', '🦁', '🐶', '🐱', '🐰',
    '🦄', '🐲', '🦉', '🦅', '🐸', '🐙', '🦀', '🐢',
    '👻', '👽', '🤖', '🎃', '🧙', '🧛', '🧞', '🥷',
    '😎', '🤠', '🧐', '🥸', '🤓', '🤩', '😈', '🤡'
  ];

  const LS = {
    users: 'betlife.users',
    currentUser: 'betlife.currentUser',
    custom: 'betlife.customEvents',
    history: 'betlife.history',     // namespaced per user below
    coupon: 'betlife.coupon',       // namespaced per user below
    streams: 'betlife.streams',     // by event id
    chats: 'betlife.chats'          // by event id
  };

  function userKey(user, suffix) {
    if (!user) return null;
    return 'betlife.user.' + user.id + '.' + suffix;
  }

  // -------------------------------------------------------------------------
  // App state
  // -------------------------------------------------------------------------
  const state = {
    category: 'life',
    coupon: [],
    customEvents: [],
    history: [],
    users: [], // [{ id, username, password, avatar, createdAt, balance }]
    currentUserId: null,
    streams: {},   // eventId -> { live, url, startedAt, ownerId }
    chats: {},     // eventId -> [{ userId, name, avatar, text, ts }]
    // UI
    authMode: 'login',
    pendingAvatar: AVATAR_EMOJIS[0],
    paymentMode: 'topup',
    activeStreamEventId: null,
    streamAnimRaf: null
  };

  function currentUser() {
    return state.users.find(function (u) { return u.id === state.currentUserId; }) || null;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------
  function load() {
    try {
      state.users = JSON.parse(localStorage.getItem(LS.users) || '[]');
      state.currentUserId = localStorage.getItem(LS.currentUser) || null;
      state.customEvents = JSON.parse(localStorage.getItem(LS.custom) || '[]');
      state.streams = JSON.parse(localStorage.getItem(LS.streams) || '{}');
      state.chats = JSON.parse(localStorage.getItem(LS.chats) || '{}');
      // Per-user state.
      const u = currentUser();
      if (u) {
        state.history = JSON.parse(localStorage.getItem(userKey(u, 'history')) || '[]');
        state.coupon = JSON.parse(localStorage.getItem(userKey(u, 'coupon')) || '[]');
      } else {
        state.history = [];
        state.coupon = [];
      }
    } catch (e) {
      console.warn('load failed', e);
    }
  }

  function saveGlobal() {
    localStorage.setItem(LS.users, JSON.stringify(state.users));
    localStorage.setItem(LS.custom, JSON.stringify(state.customEvents));
    localStorage.setItem(LS.streams, JSON.stringify(state.streams));
    localStorage.setItem(LS.chats, JSON.stringify(state.chats));
    if (state.currentUserId) {
      localStorage.setItem(LS.currentUser, state.currentUserId);
    } else {
      localStorage.removeItem(LS.currentUser);
    }
  }

  function saveUser() {
    const u = currentUser();
    if (!u) return;
    localStorage.setItem(userKey(u, 'history'), JSON.stringify(state.history));
    localStorage.setItem(userKey(u, 'coupon'), JSON.stringify(state.coupon));
    saveGlobal();
  }

  function save() {
    saveGlobal();
    if (state.currentUserId) saveUser();
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------
  function fmtMoney(n) {
    const rounded = Math.round(n * 100) / 100;
    const s = rounded.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    return s + ' ₽';
  }

  function fmtOdds(o) { return (Math.round(o * 100) / 100).toFixed(2); }

  function probToOdds(prob) {
    const eff = prob * (1 - MARGIN);
    if (eff <= 0) return 999;
    return Math.max(1.01, 1 / eff);
  }

  function getAllEvents() { return [...window.DEFAULT_EVENTS, ...state.customEvents]; }
  function getEvent(id) { return getAllEvents().find(function (e) { return e.id === id; }); }

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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function hashPwd(s) {
    let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return 'h' + (h >>> 0).toString(36);
  }

  // -------------------------------------------------------------------------
  // DOM refs
  // -------------------------------------------------------------------------
  const els = {
    tabs: document.getElementById('tabs'),
    events: document.getElementById('events'),
    couponItems: document.getElementById('coupon-items'),
    couponSummary: document.getElementById('coupon-summary'),
    couponCount: document.getElementById('coupon-count'),
    couponOdds: document.getElementById('coupon-odds'),
    couponWin: document.getElementById('coupon-win'),
    stake: document.getElementById('stake'),
    placeBet: document.getElementById('place-bet'),
    clearCoupon: document.getElementById('clear-coupon'),
    addEventBtn: document.getElementById('add-event-btn'),

    authBlock: document.getElementById('auth-block'),

    // Language
    langCurrent: document.getElementById('lang-current'),
    langSelect: document.getElementById('lang-select'),

    // Auth modal
    authBackdrop: document.getElementById('auth-backdrop'),
    authClose: document.getElementById('auth-close'),
    authCancel: document.getElementById('auth-cancel'),
    authSubmit: document.getElementById('auth-submit'),
    authTitle: document.getElementById('auth-title'),
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    authError: document.getElementById('auth-error'),
    authAvatarRow: document.getElementById('auth-avatar-row'),
    emojiGrid: document.getElementById('emoji-grid'),

    // Payment modal
    paymentBackdrop: document.getElementById('payment-backdrop'),
    paymentClose: document.getElementById('payment-close'),
    paymentCancel: document.getElementById('payment-cancel'),
    paymentSubmit: document.getElementById('payment-submit'),
    paymentTitle: document.getElementById('payment-title'),
    paymentAmount: document.getElementById('payment-amount'),
    paymentError: document.getElementById('payment-error'),
    quickAmounts: document.getElementById('quick-amounts'),

    // Add-event modal
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    modalSave: document.getElementById('modal-save'),
    fTitle: document.getElementById('f-title'),
    fDesc: document.getElementById('f-desc'),
    fCategory: document.getElementById('f-category'),
    fEmoji: document.getElementById('f-emoji'),
    fBg1: document.getElementById('f-bg1'),
    fBg2: document.getElementById('f-bg2'),
    fImage: document.getElementById('f-image'),
    cardPreview: document.getElementById('card-preview'),
    outcomes: document.getElementById('outcomes'),
    addOutcome: document.getElementById('add-outcome'),
    fProbSum: document.getElementById('f-probsum'),

    // Resolve modal
    resolveBackdrop: document.getElementById('resolve-backdrop'),
    resolveClose: document.getElementById('resolve-close'),
    resolveBody: document.getElementById('resolve-body'),

    // Stream modal
    streamBackdrop: document.getElementById('stream-backdrop'),
    streamClose: document.getElementById('stream-close'),
    streamTitle: document.getElementById('stream-title'),
    streamCanvas: document.getElementById('stream-canvas'),
    streamIframe: document.getElementById('stream-iframe'),
    streamStatus: document.getElementById('stream-status'),
    streamViewers: document.getElementById('stream-viewers'),
    streamMeta: document.getElementById('stream-meta'),
    chatList: document.getElementById('chat-list'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),

    confetti: document.getElementById('confetti'),
    toast: document.getElementById('toast')
  };

  let pendingImage = null; // data URL for the new event

  // -------------------------------------------------------------------------
  // Localisation helpers
  // -------------------------------------------------------------------------
  function applyI18nTo(node) {
    node.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = window.I18N.t(el.dataset.i18n);
    });
    node.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      const tpl = el.dataset.i18nHtml;
      el.innerHTML = tpl.replace(/\{(\w+)\}/g, function (_, k) {
        return escapeHtml(window.I18N.t(k));
      });
    });
    node.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      const spec = el.dataset.i18nAttr; // e.g. "placeholder:event_title_ph"
      spec.split(',').forEach(function (pair) {
        const parts = pair.split(':');
        if (parts.length === 2) el.setAttribute(parts[0].trim(), window.I18N.t(parts[1].trim()));
      });
    });
  }

  function applyI18n() { applyI18nTo(document); }

  function fillLanguageSelector() {
    els.langSelect.innerHTML = '';
    window.I18N.LANGUAGES.forEach(function (l) {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.name;
      if (l.code === window.I18N.lang) opt.selected = true;
      els.langSelect.appendChild(opt);
    });
    updateLangIndicator();
  }

  function updateLangIndicator() {
    const code = window.I18N.lang.toUpperCase();
    els.langCurrent.textContent = '🌐 ' + code;
  }

  function fillCategorySelect() {
    els.fCategory.innerHTML = '';
    [['mine', 'tab_mine'], ['life', 'tab_life'], ['office', 'tab_office'],
     ['home', 'tab_home'], ['weird', 'tab_weird'], ['sport', 'tab_sport']
    ].forEach(function (pair) {
      const opt = document.createElement('option');
      opt.value = pair[0];
      opt.textContent = CAT_EMOJI[pair[0]] + ' ' + window.I18N.t(pair[1]);
      els.fCategory.appendChild(opt);
    });
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  function renderAuthBlock() {
    const u = currentUser();
    els.authBlock.innerHTML = '';
    if (!u) {
      const btn = document.createElement('button');
      btn.className = 'auth-button';
      btn.textContent = window.I18N.t('signin_or_register');
      btn.addEventListener('click', openAuth);
      els.authBlock.appendChild(btn);
      return;
    }
    const chip = document.createElement('div');
    chip.className = 'user-chip';
    chip.tabIndex = 0;
    chip.innerHTML =
      '<span class="user-avatar">' + renderAvatarInner(u.avatar) + '</span>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.15">' +
      '<span class="user-name">' + escapeHtml(u.username) + '</span>' +
      '<span class="user-balance" id="user-balance">' + fmtMoney(u.balance) + '</span>' +
      '</div>' +
      '<span style="font-size:11px;color:var(--muted);margin-left:4px">▾</span>';
    const menu = document.createElement('div');
    menu.className = 'user-menu';
    menu.innerHTML =
      '<button data-act="topup">💸 ' + window.I18N.t('topup') + '</button>' +
      '<button data-act="withdraw">🏧 ' + window.I18N.t('withdraw') + '</button>' +
      '<hr>' +
      '<button data-act="logout">🚪 ' + window.I18N.t('logout') + '</button>';
    chip.appendChild(menu);
    chip.addEventListener('click', function (e) {
      const actBtn = e.target.closest('button[data-act]');
      if (actBtn) {
        const act = actBtn.dataset.act;
        menu.classList.remove('open');
        if (act === 'topup') openPayment('topup');
        else if (act === 'withdraw') openPayment('withdraw');
        else if (act === 'logout') logout();
        e.stopPropagation();
        return;
      }
      menu.classList.toggle('open');
      e.stopPropagation();
    });
    document.addEventListener('click', function () { menu.classList.remove('open'); });
    els.authBlock.appendChild(chip);
  }

  function renderAvatarInner(av) {
    if (av && av.startsWith('data:')) return '<img alt="" src="' + av + '" />';
    return '<span>' + escapeHtml(av || '🙂') + '</span>';
  }

  function openAuth() {
    state.authMode = 'login';
    state.pendingAvatar = AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
    setAuthMode('login');
    fillEmojiGrid();
    els.authUsername.value = '';
    els.authPassword.value = '';
    els.authError.style.display = 'none';
    els.authBackdrop.hidden = false;
    setTimeout(function () { els.authUsername.focus(); }, 30);
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    document.querySelectorAll('.auth-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.mode === mode);
    });
    els.authAvatarRow.hidden = mode !== 'register';
    els.authTitle.textContent = window.I18N.t(mode === 'login' ? 'login' : 'register');
    els.authSubmit.textContent = window.I18N.t(mode === 'login' ? 'login' : 'register');
  }

  function fillEmojiGrid() {
    els.emojiGrid.innerHTML = '';
    AVATAR_EMOJIS.forEach(function (e) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      if (e === state.pendingAvatar) b.classList.add('selected');
      b.addEventListener('click', function () {
        state.pendingAvatar = e;
        els.emojiGrid.querySelectorAll('button').forEach(function (x) { x.classList.remove('selected'); });
        b.classList.add('selected');
      });
      els.emojiGrid.appendChild(b);
    });
  }

  function authSubmit() {
    const username = els.authUsername.value.trim();
    const password = els.authPassword.value;
    if (username.length < 3 || password.length < 3) {
      return showAuthError(window.I18N.t('auth_short'));
    }
    if (state.authMode === 'register') {
      if (state.users.some(function (u) { return u.username.toLowerCase() === username.toLowerCase(); })) {
        return showAuthError(window.I18N.t('auth_user_exists'));
      }
      const u = {
        id: uid('u'),
        username: username,
        password: hashPwd(password),
        avatar: state.pendingAvatar,
        createdAt: Date.now(),
        balance: STARTING_BALANCE
      };
      state.users.push(u);
      state.currentUserId = u.id;
      save();
      // load per-user state (empty)
      state.history = [];
      state.coupon = [];
      saveUser();
      els.authBackdrop.hidden = true;
      renderAuthBlock();
      renderAll();
      toast(window.I18N.t('registered', { name: username }), 'win');
    } else {
      const u = state.users.find(function (x) { return x.username.toLowerCase() === username.toLowerCase(); });
      if (!u) return showAuthError(window.I18N.t('auth_user_not_found'));
      if (u.password !== hashPwd(password)) return showAuthError(window.I18N.t('auth_wrong_password'));
      state.currentUserId = u.id;
      save();
      load(); // reload per-user history/coupon
      els.authBackdrop.hidden = true;
      renderAuthBlock();
      renderAll();
      toast(window.I18N.t('welcome_back', { name: u.username }), 'win');
    }
  }

  function showAuthError(msg) {
    els.authError.textContent = msg;
    els.authError.style.display = 'block';
  }

  function logout() {
    state.currentUserId = null;
    state.coupon = [];
    state.history = [];
    save();
    renderAuthBlock();
    renderAll();
  }

  function requireLogin() {
    if (!currentUser()) {
      toast(window.I18N.t('need_login'), 'info');
      openAuth();
      return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Payments (top-up / withdraw)
  // -------------------------------------------------------------------------
  function openPayment(mode) {
    if (!requireLogin()) return;
    state.paymentMode = mode;
    els.paymentTitle.textContent = window.I18N.t(mode === 'topup' ? 'payment_topup' : 'payment_withdraw');
    els.paymentAmount.value = mode === 'topup' ? 1000 : 500;
    els.paymentError.style.display = 'none';
    els.paymentBackdrop.hidden = false;
    setTimeout(function () { els.paymentAmount.focus(); }, 20);
  }

  function paymentSubmit() {
    const u = currentUser();
    if (!u) return;
    const amount = Math.floor(Number(els.paymentAmount.value) || 0);
    if (amount <= 0) {
      els.paymentError.textContent = '—';
      els.paymentError.style.display = 'block';
      return;
    }
    if (state.paymentMode === 'topup') {
      animateBalanceTo(u.balance, u.balance + amount, 'up');
      u.balance += amount;
      save();
      toast(window.I18N.t('topup_done', { amount: fmtMoney(amount) }), 'win');
    } else {
      if (u.balance < amount) {
        els.paymentError.textContent = window.I18N.t('withdraw_no_funds');
        els.paymentError.style.display = 'block';
        return;
      }
      animateBalanceTo(u.balance, u.balance - amount, 'down');
      u.balance -= amount;
      save();
      toast(window.I18N.t('withdraw_done', { amount: fmtMoney(amount) }), 'info');
    }
    els.paymentBackdrop.hidden = true;
    renderCoupon();
  }

  function animateBalanceTo(from, to, dir) {
    const el = document.getElementById('user-balance');
    if (!el) return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(dir === 'up' ? 'flash-up' : 'flash-down');
    const duration = 700;
    const start = performance.now();
    function step(t) {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = from + (to - from) * eased;
      el.textContent = fmtMoney(v);
      if (k < 1) requestAnimationFrame(step);
      else el.textContent = fmtMoney(to);
    }
    requestAnimationFrame(step);
  }

  // -------------------------------------------------------------------------
  // Events / coupon rendering
  // -------------------------------------------------------------------------
  function renderTabs() {
    els.tabs.querySelectorAll('.tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.cat === state.category);
    });
  }

  function renderEvents() {
    if (state.category === 'history') return renderHistory();
    if (state.category === 'streams') return renderStreamsList();

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
        empty.innerHTML = '<h3>' + window.I18N.t('empty_mine_title') + '</h3><p>' + window.I18N.t('empty_mine_hint') + '</p>';
      } else {
        empty.innerHTML = '<h3>—</h3>';
      }
      els.events.appendChild(empty);
      return;
    }

    list.forEach(function (ev, i) {
      const card = renderEventCard(ev);
      card.style.animationDelay = (i * 30) + 'ms';
      els.events.appendChild(card);
    });
  }

  function renderEventCard(ev) {
    const card = document.createElement('article');
    card.className = 'card';

    if (ev.image) {
      card.classList.add('cover');
      const bg = document.createElement('div');
      bg.className = 'card-bg';
      bg.style.backgroundImage = "url('" + ev.image + "')";
      card.appendChild(bg);
    } else if (ev.bg1 || ev.bg2) {
      const bg = document.createElement('div');
      bg.className = 'card-bg';
      const c1 = ev.bg1 || '#ff7a1a';
      const c2 = ev.bg2 || '#3a82f7';
      bg.style.background = 'linear-gradient(135deg, ' + c1 + '33, ' + c2 + '22)';
      card.appendChild(bg);
    }

    const head = document.createElement('div');
    head.className = 'card-head';
    const owner = ev.ownerId ? state.users.find(function (u) { return u.id === ev.ownerId; }) : null;
    head.innerHTML =
      '<div style="display:flex;gap:10px;align-items:flex-start;min-width:0;flex:1">' +
      '<span class="card-emoji">' + escapeHtml(ev.emoji || '🎯') + '</span>' +
      '<div style="min-width:0;flex:1">' +
      '<div class="card-cat">' + (CAT_EMOJI[ev.category] || '') + ' ' + escapeHtml(window.I18N.t('tab_' + ev.category) || ev.category) + '</div>' +
      '<h3 class="card-title">' + escapeHtml(ev.title) + '</h3>' +
      (ev.desc ? '<div class="card-desc">' + escapeHtml(ev.desc) + '</div>' : '') +
      (owner
        ? '<div class="card-author"><span class="ava">' + renderAvatarInner(owner.avatar) + '</span>' + escapeHtml(owner.username) + '</div>'
        : '') +
      '</div>' +
      '</div>';

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const stream = state.streams[ev.id];
    const liveBtn = document.createElement('button');
    liveBtn.className = 'icon-btn' + (stream && stream.live ? ' live' : '');
    liveBtn.textContent = stream && stream.live ? window.I18N.t('live') : window.I18N.t('go_live');
    liveBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openStreamFor(ev);
    });
    actions.appendChild(liveBtn);
    head.appendChild(actions);
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
    foot.innerHTML = '<span>' + window.I18N.t('outcomes_count', { n: ev.outcomes.length }) + '</span>';
    const u = currentUser();
    const isCustom = state.customEvents.some(function (c) { return c.id === ev.id; });
    if (isCustom && u && (ev.ownerId === u.id || !ev.ownerId)) {
      const del = document.createElement('button');
      del.className = 'card-delete';
      del.textContent = '✕ ' + window.I18N.t('remove');
      del.addEventListener('click', function () {
        if (!confirm(window.I18N.t('del_event_confirm', { name: ev.title }))) return;
        state.customEvents = state.customEvents.filter(function (c) { return c.id !== ev.id; });
        state.coupon = state.coupon.filter(function (c) { return c.eventId !== ev.id; });
        delete state.streams[ev.id];
        delete state.chats[ev.id];
        save();
        renderEvents();
        renderCoupon();
      });
      foot.appendChild(del);
    }
    card.appendChild(foot);
    return card;
  }

  function toggleCoupon(ev, outcomeIndex) {
    if (!requireLogin()) return;
    const existing = state.coupon.findIndex(function (c) { return c.eventId === ev.id; });
    if (existing >= 0 && state.coupon[existing].outcomeIndex === outcomeIndex) {
      state.coupon.splice(existing, 1);
    } else if (existing >= 0) {
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
      toast(window.I18N.t('bet_added'), 'info');
    }
    save();
    renderEvents();
    renderCoupon();
  }

  function renderCoupon() {
    const u = currentUser();
    els.couponItems.innerHTML = '';
    if (state.coupon.length === 0) {
      els.couponItems.innerHTML = '<div class="coupon-empty">' + window.I18N.t('empty_coupon') + '</div>';
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
        '</div>' +
        '<button class="coupon-item-remove" title="' + window.I18N.t('remove') + '">✕</button>';
      item.querySelector('.coupon-item-remove').addEventListener('click', function () {
        state.coupon.splice(i, 1);
        save();
        renderEvents();
        renderCoupon();
      });
      els.couponItems.appendChild(item);
    });

    const totalOdds = state.coupon.reduce(function (a, l) { return a * l.odds; }, 1);
    const stake = Math.max(0, Number(els.stake.value) || 0);
    els.couponCount.textContent = state.coupon.length;
    els.couponOdds.textContent = fmtOdds(totalOdds);
    els.couponWin.textContent = fmtMoney(stake * totalOdds);
    els.couponSummary.hidden = false;

    const balance = u ? u.balance : 0;
    const canBet = !!u && stake >= 10 && stake <= balance;
    els.placeBet.disabled = !canBet;
    if (!u) {
      els.placeBet.textContent = window.I18N.t('signin_or_register');
    } else if (stake > balance) {
      els.placeBet.textContent = window.I18N.t('no_funds');
    } else if (stake < 10) {
      els.placeBet.textContent = window.I18N.t('min_stake');
    } else {
      els.placeBet.textContent = window.I18N.t('place_bet_amount', { amount: fmtMoney(stake) });
    }
  }

  function clearCoupon() {
    state.coupon = [];
    save();
    renderEvents();
    renderCoupon();
  }

  // -------------------------------------------------------------------------
  // Place bet & resolution
  // -------------------------------------------------------------------------
  function placeBet() {
    if (!requireLogin()) return;
    const u = currentUser();
    if (!u) return;
    const stake = Math.max(0, Number(els.stake.value) || 0);
    if (state.coupon.length === 0) return;
    if (stake < 10 || stake > u.balance) return;

    animateBalanceTo(u.balance, u.balance - stake, 'down');
    u.balance -= stake;

    const totalOdds = state.coupon.reduce(function (a, l) { return a * l.odds; }, 1);
    const possibleWin = stake * totalOdds;

    const legs = state.coupon.map(function (leg) {
      const ev = getEvent(leg.eventId);
      if (!ev) return { title: leg.title, outcome: leg.outcomeLabel, resolved: '—', odds: leg.odds, won: false };
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
    if (allWon) {
      // small delay so balance settles before win animation
      setTimeout(function () {
        animateBalanceTo(u.balance, u.balance + possibleWin, 'up');
        u.balance += possibleWin;
        save();
      }, 750);
    }

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

    renderEvents();
    renderCoupon();
    showResolveModal(entry);
    if (allWon) launchConfetti();
  }

  function showResolveModal(entry) {
    const frag = document.createDocumentFragment();
    entry.legs.forEach(function (l) {
      const row = document.createElement('div');
      row.className = 'resolve-event ' + (l.won ? 'win' : 'lose');
      row.innerHTML =
        '<div class="res-title">' + escapeHtml(l.title) + '</div>' +
        '<div class="res-line"><span>' + window.I18N.t('your_pick') + '</span><span>' + escapeHtml(l.outcome) + ' · ' + fmtOdds(l.odds) + '</span></div>' +
        '<div class="res-line"><span>' + window.I18N.t('actually') + '</span><span>' + (l.won ? '✅ ' : '❌ ') + escapeHtml(l.resolved) + '</span></div>';
      frag.appendChild(row);
    });
    const summary = document.createElement('div');
    summary.className = 'resolve-summary ' + entry.status;
    summary.textContent = entry.status === 'win'
      ? window.I18N.t('win_amount', { amount: fmtMoney(entry.possibleWin) })
      : window.I18N.t('lose_amount', { amount: fmtMoney(entry.stake) });
    frag.appendChild(summary);
    els.resolveBody.innerHTML = '';
    els.resolveBody.appendChild(frag);
    els.resolveBackdrop.hidden = false;
    toast(entry.status === 'win'
      ? window.I18N.t('bet_won', { amount: fmtMoney(entry.possibleWin) })
      : window.I18N.t('bet_lost', { amount: fmtMoney(entry.stake) }),
      entry.status);
  }

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------
  function renderHistory() {
    els.events.innerHTML = '';
    if (state.history.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = '<h3>' + window.I18N.t('empty_history') + '</h3><p>' + window.I18N.t('empty_history_hint') + '</p>';
      els.events.appendChild(empty);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'history-list';
    wrap.style.gridColumn = '1 / -1';
    state.history.forEach(function (e, i) {
      const item = document.createElement('div');
      item.className = 'history-item ' + e.status;
      item.style.animationDelay = (i * 30) + 'ms';
      const dstr = new Date(e.ts).toLocaleString();
      const legs = e.legs.map(function (l) {
        return '<div class="history-leg ' + (l.won ? 'win' : 'lose') + '">' +
          '<span>' + escapeHtml(l.title) + '</span>' +
          '<span class="leg-outcome">' + escapeHtml(l.outcome) + ' → ' + escapeHtml(l.resolved) + '</span>' +
          '</div>';
      }).join('');
      item.innerHTML =
        '<div class="history-head">' +
        '<span>' + dstr + ' · ' + e.legs.length + ' · ' + fmtOdds(e.totalOdds) + '</span>' +
        '<span class="history-status ' + e.status + '">' + window.I18N.t(e.status) + '</span>' +
        '</div>' +
        '<div class="history-legs">' + legs + '</div>' +
        '<div class="history-foot">' +
        '<span>' + window.I18N.t('stake') + ': ' + fmtMoney(e.stake) + '</span>' +
        '<span>' + (e.status === 'win' ? '+' + fmtMoney(e.possibleWin) : '—') + '</span>' +
        '</div>';
      wrap.appendChild(item);
    });
    els.events.appendChild(wrap);
  }

  // -------------------------------------------------------------------------
  // Streams list
  // -------------------------------------------------------------------------
  function renderStreamsList() {
    els.events.innerHTML = '';
    const ids = Object.keys(state.streams).filter(function (id) { return state.streams[id].live; });
    if (ids.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = '<h3>' + window.I18N.t('empty_streams_title') + '</h3><p>' + window.I18N.t('empty_streams_hint') + '</p>';
      els.events.appendChild(empty);
      return;
    }
    ids.forEach(function (id) {
      const ev = getEvent(id);
      if (!ev) return;
      const stream = state.streams[id];
      const owner = stream.ownerId ? state.users.find(function (u) { return u.id === stream.ownerId; }) : null;
      const card = document.createElement('article');
      card.className = 'stream-card';
      const minutes = Math.max(1, Math.floor((Date.now() - stream.startedAt) / 60000));
      card.innerHTML =
        '<div class="stream-thumb">' + escapeHtml(ev.emoji || '🎯') + '</div>' +
        '<div class="stream-card-info">' +
          '<h3>' + escapeHtml(ev.title) + '</h3>' +
          '<div class="meta"><span class="live-tag">' + window.I18N.t('live') + '</span> · ' +
              window.I18N.t('minutes_ago', { n: minutes }) +
              (owner ? ' · ' + escapeHtml(owner.username) : '') + '</div>' +
        '</div>';
      card.addEventListener('click', function () { openStreamFor(ev); });
      els.events.appendChild(card);
    });
  }

  // -------------------------------------------------------------------------
  // Custom event modal
  // -------------------------------------------------------------------------
  function openAddModal() {
    if (!requireLogin()) return;
    pendingImage = null;
    fillCategorySelect();
    els.fTitle.value = '';
    els.fDesc.value = '';
    els.fCategory.value = 'mine';
    els.fEmoji.value = '🎯';
    els.fBg1.value = '#ff7a1a';
    els.fBg2.value = '#3a82f7';
    els.fImage.value = '';
    els.outcomes.innerHTML = '';
    addOutcomeRow('Да', 0.5);
    addOutcomeRow('Нет', 0.5);
    updateProbSum();
    updateCardPreview();
    els.modalBackdrop.hidden = false;
    setTimeout(function () { els.fTitle.focus(); }, 20);
  }

  function addOutcomeRow(label, prob) {
    const row = document.createElement('div');
    row.className = 'outcome-row';
    row.innerHTML =
      '<input type="text" class="o-label" placeholder="' + window.I18N.t('outcome') + '" maxlength="60" value="' + escapeHtml(label || '') + '">' +
      '<input type="number" class="o-prob" min="0.01" max="0.99" step="0.01" value="' + (prob != null ? prob : 0.5) + '">' +
      '<button type="button" class="o-remove" title="' + window.I18N.t('remove') + '">✕</button>';
    row.querySelector('.o-remove').addEventListener('click', function () { row.remove(); updateProbSum(); });
    row.querySelector('.o-prob').addEventListener('input', updateProbSum);
    els.outcomes.appendChild(row);
  }

  function updateProbSum() {
    const rows = Array.from(els.outcomes.querySelectorAll('.outcome-row'));
    const probs = rows.map(function (r) { return Number(r.querySelector('.o-prob').value) || 0; });
    const sum = probs.reduce(function (a, b) { return a + b; }, 0);
    let msg = window.I18N.t('probsum_label', { p: Math.round(sum * 100) });
    if (sum < 0.95) msg += window.I18N.t('probsum_low');
    else if (sum > 1.05) msg += window.I18N.t('probsum_high');
    else msg += window.I18N.t('probsum_ok');
    els.fProbSum.textContent = msg;
  }

  function updateCardPreview() {
    const c1 = els.fBg1.value;
    const c2 = els.fBg2.value;
    if (pendingImage) {
      els.cardPreview.style.background = "url('" + pendingImage + "') center/cover";
    } else {
      els.cardPreview.style.background = 'linear-gradient(135deg, ' + c1 + ', ' + c2 + ')';
    }
    els.cardPreview.textContent = els.fEmoji.value || '🎯';
  }

  function saveCustomEvent() {
    if (!requireLogin()) return;
    const u = currentUser();
    const title = els.fTitle.value.trim();
    if (!title) return toast(window.I18N.t('event_title'), 'info');
    const rows = Array.from(els.outcomes.querySelectorAll('.outcome-row'));
    if (rows.length < 2) return toast('—', 'info');
    const outcomes = rows.map(function (r) {
      return { label: r.querySelector('.o-label').value.trim(), prob: Number(r.querySelector('.o-prob').value) || 0 };
    });
    if (outcomes.some(function (o) { return !o.label; })) return toast(window.I18N.t('outcome'), 'info');
    const sum = outcomes.reduce(function (a, o) { return a + o.prob; }, 0);
    if (sum < 0.5 || sum > 2) return toast('—', 'info');
    outcomes.forEach(function (o) { o.prob = o.prob / sum; });

    const ev = {
      id: uid('custom'),
      category: els.fCategory.value,
      emoji: els.fEmoji.value || '🎯',
      title: title,
      desc: els.fDesc.value.trim(),
      bg1: els.fBg1.value,
      bg2: els.fBg2.value,
      image: pendingImage,
      ownerId: u.id,
      ownerName: u.username,
      outcomes: outcomes,
      createdAt: Date.now()
    };
    state.customEvents.unshift(ev);
    save();
    els.modalBackdrop.hidden = true;
    state.category = ev.category;
    renderTabs();
    renderEvents();
    toast(window.I18N.t('event_added'), 'win');
  }

  // -------------------------------------------------------------------------
  // Streams (broadcast modal + chat)
  // -------------------------------------------------------------------------
  function openStreamFor(ev) {
    if (!state.streams[ev.id]) state.streams[ev.id] = { live: false, url: '', startedAt: 0, ownerId: null };
    const s = state.streams[ev.id];
    if (!s.live) {
      if (!requireLogin()) return;
      const url = prompt(window.I18N.t('stream_desc_ph') + '\n(optional)') || '';
      s.live = true;
      s.url = url.trim();
      s.startedAt = Date.now();
      s.ownerId = currentUser().id;
      save();
    }
    state.activeStreamEventId = ev.id;
    els.streamTitle.innerHTML = '🔴 ' + escapeHtml(ev.title);
    els.streamMeta.innerHTML =
      '<h4>' + escapeHtml(ev.title) + '</h4>' +
      (ev.desc ? '<div>' + escapeHtml(ev.desc) + '</div>' : '');

    // Try to embed iframe if URL is a YouTube/Twitch link.
    const embedUrl = toEmbedUrl(s.url);
    if (embedUrl) {
      els.streamIframe.src = embedUrl;
      els.streamIframe.hidden = false;
      els.streamCanvas.hidden = true;
    } else {
      els.streamIframe.removeAttribute('src');
      els.streamIframe.hidden = true;
      els.streamCanvas.hidden = false;
      startCanvasAnim();
    }
    els.streamStatus.textContent = window.I18N.t('stream_starts');
    setTimeout(function () {
      const viewers = 5 + Math.floor(Math.random() * 95);
      els.streamViewers.textContent = viewers;
      els.streamStatus.textContent = window.I18N.t('stream_status', { n: viewers });
    }, 600);

    renderChat();
    els.streamBackdrop.hidden = false;
  }

  function toEmbedUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
        return 'https://www.youtube.com/embed/' + u.searchParams.get('v') + '?autoplay=1';
      }
      if (u.hostname === 'youtu.be') {
        return 'https://www.youtube.com/embed' + u.pathname + '?autoplay=1';
      }
      if (u.hostname.includes('twitch.tv')) {
        const channel = u.pathname.replace(/^\//, '').split('/')[0];
        if (channel) return 'https://player.twitch.tv/?channel=' + channel + '&parent=' + location.hostname + '&autoplay=true';
      }
    } catch (e) { /* invalid URL */ }
    return null;
  }

  function closeStream() {
    els.streamBackdrop.hidden = true;
    els.streamIframe.removeAttribute('src');
    if (state.streamAnimRaf) cancelAnimationFrame(state.streamAnimRaf);
    state.streamAnimRaf = null;
    state.activeStreamEventId = null;
  }

  function startCanvasAnim() {
    const canvas = els.streamCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = 640; canvas.height = 360;
    const bubbles = [];
    for (let i = 0; i < 40; i++) {
      bubbles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 6 + Math.random() * 18,
        dx: -1 + Math.random() * 2,
        dy: -1 + Math.random() * 2,
        h: Math.random() * 360
      });
    }
    function frame() {
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // gradient pulse
      const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 50, canvas.width / 2, canvas.height / 2, 400);
      grad.addColorStop(0, 'rgba(255, 122, 26, 0.2)');
      grad.addColorStop(1, 'rgba(58, 130, 247, 0.05)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      bubbles.forEach(function (b) {
        b.x += b.dx; b.y += b.dy;
        if (b.x < -b.r) b.x = canvas.width + b.r;
        if (b.x > canvas.width + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = canvas.height + b.r;
        if (b.y > canvas.height + b.r) b.y = -b.r;
        ctx.beginPath();
        ctx.fillStyle = 'hsla(' + b.h + ', 70%, 60%, 0.35)';
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔴 LIVE', canvas.width / 2, canvas.height / 2 - 8);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('BetLife stream', canvas.width / 2, canvas.height / 2 + 14);
      state.streamAnimRaf = requestAnimationFrame(frame);
    }
    if (state.streamAnimRaf) cancelAnimationFrame(state.streamAnimRaf);
    state.streamAnimRaf = requestAnimationFrame(frame);
  }

  function renderChat() {
    const id = state.activeStreamEventId;
    if (!id) return;
    const list = state.chats[id] || [];
    els.chatList.innerHTML = '';
    list.forEach(function (m) {
      const row = document.createElement('div');
      row.className = 'chat-msg';
      const tstr = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      row.innerHTML =
        '<span class="ava">' + renderAvatarInner(m.avatar) + '</span>' +
        '<div class="body"><span class="name">' + escapeHtml(m.name) + '</span>' +
        '<span class="ts">' + tstr + '</span><br>' +
        escapeHtml(m.text) + '</div>';
      els.chatList.appendChild(row);
    });
    els.chatList.scrollTop = els.chatList.scrollHeight;

    if (!currentUser()) {
      els.chatInput.disabled = true;
      els.chatInput.placeholder = window.I18N.t('chat_login_required');
    } else {
      els.chatInput.disabled = false;
      els.chatInput.placeholder = window.I18N.t('chat_ph');
    }
  }

  function sendChatMessage(e) {
    e.preventDefault();
    const id = state.activeStreamEventId;
    const u = currentUser();
    if (!id || !u) return;
    const text = els.chatInput.value.trim();
    if (!text) return;
    if (!state.chats[id]) state.chats[id] = [];
    state.chats[id].push({
      userId: u.id, name: u.username, avatar: u.avatar, text: text, ts: Date.now()
    });
    els.chatInput.value = '';
    save();
    renderChat();
  }

  // -------------------------------------------------------------------------
  // Confetti
  // -------------------------------------------------------------------------
  function launchConfetti() {
    const canvas = els.confetti;
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth; canvas.height = innerHeight;
    const colors = ['#ff7a1a', '#ffb454', '#2fbf71', '#3a82f7', '#ef4a4a', '#f9d423'];
    const pieces = [];
    for (let i = 0; i < 160; i++) {
      pieces.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 200,
        y: innerHeight / 2,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 16 - 4,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4
      });
    }
    const start = performance.now();
    function frame(t) {
      const elapsed = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(function (p) {
        p.vy += 0.45;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (elapsed < 2600) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------------
  // Toast
  // -------------------------------------------------------------------------
  let toastTimer;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.className = 'toast ' + (type || 'info');
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 3500);
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------
  function wire() {
    els.tabs.addEventListener('click', function (e) {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      state.category = btn.dataset.cat;
      renderTabs();
      renderEvents();
    });

    els.langSelect.addEventListener('change', function () {
      window.I18N.set(els.langSelect.value);
      updateLangIndicator();
      applyI18n();
      fillCategorySelect();
      renderAuthBlock();
      renderEvents();
      renderCoupon();
    });

    els.stake.addEventListener('input', renderCoupon);
    els.clearCoupon.addEventListener('click', clearCoupon);
    els.placeBet.addEventListener('click', placeBet);

    els.addEventBtn.addEventListener('click', openAddModal);

    // Auth modal
    els.authClose.addEventListener('click', function () { els.authBackdrop.hidden = true; });
    els.authCancel.addEventListener('click', function () { els.authBackdrop.hidden = true; });
    els.authBackdrop.addEventListener('click', function (e) {
      if (e.target === els.authBackdrop) els.authBackdrop.hidden = true;
    });
    document.querySelectorAll('.auth-tab').forEach(function (t) {
      t.addEventListener('click', function () { setAuthMode(t.dataset.mode); });
    });
    els.authSubmit.addEventListener('click', authSubmit);
    els.authPassword.addEventListener('keydown', function (e) { if (e.key === 'Enter') authSubmit(); });

    // Payment
    els.paymentClose.addEventListener('click', function () { els.paymentBackdrop.hidden = true; });
    els.paymentCancel.addEventListener('click', function () { els.paymentBackdrop.hidden = true; });
    els.paymentBackdrop.addEventListener('click', function (e) {
      if (e.target === els.paymentBackdrop) els.paymentBackdrop.hidden = true;
    });
    els.paymentSubmit.addEventListener('click', paymentSubmit);
    els.quickAmounts.addEventListener('click', function (e) {
      const b = e.target.closest('button[data-amount]');
      if (!b) return;
      els.paymentAmount.value = b.dataset.amount;
    });

    // Add-event modal
    els.modalClose.addEventListener('click', function () { els.modalBackdrop.hidden = true; });
    els.modalCancel.addEventListener('click', function () { els.modalBackdrop.hidden = true; });
    els.modalSave.addEventListener('click', saveCustomEvent);
    els.addOutcome.addEventListener('click', function () { addOutcomeRow('', 0.3); updateProbSum(); });
    els.modalBackdrop.addEventListener('click', function (e) {
      if (e.target === els.modalBackdrop) els.modalBackdrop.hidden = true;
    });
    [els.fEmoji, els.fBg1, els.fBg2].forEach(function (el) { el.addEventListener('input', updateCardPreview); });
    els.fImage.addEventListener('change', function () {
      const file = els.fImage.files && els.fImage.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () { pendingImage = reader.result; updateCardPreview(); };
      reader.readAsDataURL(file);
    });

    // Resolve
    els.resolveClose.addEventListener('click', function () { els.resolveBackdrop.hidden = true; });
    els.resolveBackdrop.addEventListener('click', function (e) {
      if (e.target === els.resolveBackdrop) els.resolveBackdrop.hidden = true;
    });

    // Stream
    els.streamClose.addEventListener('click', closeStream);
    els.streamBackdrop.addEventListener('click', function (e) {
      if (e.target === els.streamBackdrop) closeStream();
    });
    els.chatForm.addEventListener('submit', sendChatMessage);

    // Resize confetti canvas to viewport
    addEventListener('resize', function () {
      els.confetti.width = innerWidth;
      els.confetti.height = innerHeight;
    });
  }

  function renderAll() {
    applyI18n();
    fillCategorySelect();
    renderTabs();
    renderEvents();
    renderCoupon();
  }

  function init() {
    load();
    fillLanguageSelector();
    applyI18n();
    fillCategorySelect();
    wire();
    renderAuthBlock();
    renderTabs();
    renderEvents();
    renderCoupon();

    // Resize confetti
    els.confetti.width = innerWidth;
    els.confetti.height = innerHeight;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
