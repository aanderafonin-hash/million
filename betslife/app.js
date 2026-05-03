/* BetLife frontend app.js — talks to FastAPI backend via window.API. */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ----- state
  const state = {
    user: null,            // {id, username, avatar, balance, ...}
    category: 'all',
    search: '',
    events: [],
    coupon: [],            // [{eventId, outcomeIdx}]
    bets: [],
    transactions: [],
    streamsLive: [],
    activeStream: { eventId: null, ws: null, ownerId: null, viewers: 0 },
    chatMessages: [],
    historyFilter: 'all',  // all|won|lost|pending
    avatarPalette: ['🦊','🐱','🐶','🐼','🐯','🦁','🐸','🐧','🐙','🦄','🐰','🐢','🐉','🦅','🦋','🐝','🐞','👽','🤖','👻','🎃','🧙','🧛','🧜','🧝','🦸','🦹','🥷','🧞','🧚','🐲','🦖'],
    confettiTimer: null,
  };

  // ----- helpers
  const fmt = (n) => {
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(Number(n) || 0);
    return sign + v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
  };
  const oddsFmt = (n) => Number(n).toFixed(2);

  const T = (key, params) => {
    const dict = (window.I18N && window.I18N.dict()) || {};
    let s = dict[key] || (window.I18N && window.I18N.fallback(key)) || key;
    if (params) for (const k in params) s = s.replace('{' + k + '}', params[k]);
    return s;
  };

  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
  }

  function showLoader(on) { $('#loader').hidden = !on; }

  // ----- auth UI
  function openAuth(mode) {
    const m = mode || 'login';
    const back = $('#auth-backdrop');
    back.hidden = false;
    setAuthMode(m);
    $('#auth-username').focus();
  }
  function closeAuth() {
    $('#auth-backdrop').hidden = true;
    $('#auth-error').style.display = 'none';
    $('#auth-info').style.display = 'none';
  }
  function setAuthMode(mode) {
    $$('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('#auth-avatar-row').hidden = mode !== 'register';
    $('#auth-email-field').hidden = mode !== 'register';
    $('#auth-captcha-field').hidden = mode !== 'register';
    $('#auth-recovery-field').hidden = mode !== 'recover';
    $('#auth-newpw-field').hidden = mode !== 'recover';
    const titles = { login: 'login', register: 'register', recover: 'recover' };
    const submitLabels = { login: 'login', register: 'register', recover: 'reset_password' };
    $('#auth-title').textContent = T(titles[mode]);
    $('#auth-submit').textContent = T(submitLabels[mode]);
    if (mode === 'register') refreshCaptcha();
  }
  function buildEmojiGrid(grid, onPick, currentValue) {
    grid.innerHTML = '';
    state.avatarPalette.forEach(em => {
      const el = document.createElement('button');
      el.className = 'emoji-cell';
      el.type = 'button';
      el.textContent = em;
      if (em === currentValue) el.classList.add('selected');
      el.addEventListener('click', () => {
        $$('.emoji-cell', grid).forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        onPick(em);
      });
      grid.appendChild(el);
    });
  }

  let pickedAvatar = '🦊';
  let captchaToken = null;
  let pickedAvatarFile = null;  // File object selected for upload (register or profile)

  async function refreshCaptcha() {
    try {
      const c = await API.captcha();
      captchaToken = c.token;
      $('#auth-captcha-question').textContent = c.question + ' = ?';
      $('#auth-captcha-answer').value = '';
    } catch (e) { /* network */ }
  }

  function updateAuthAvatarPreview() {
    const prev = $('#auth-avatar-preview');
    if (!prev) return;
    if (pickedAvatarFile) {
      prev.innerHTML = '';
      const url = URL.createObjectURL(pickedAvatarFile);
      prev.style.backgroundImage = `url(${url})`;
      prev.style.backgroundSize = 'cover';
      prev.style.backgroundPosition = 'center';
      prev.textContent = '';
    } else {
      prev.style.backgroundImage = '';
      prev.textContent = pickedAvatar;
    }
  }

  async function authSubmit() {
    const mode = $$('.auth-tab').find(b => b.classList.contains('active')).dataset.mode;
    const username = $('#auth-username').value.trim();
    const password = $('#auth-password').value;
    $('#auth-error').style.display = 'none';
    $('#auth-info').style.display = 'none';

    if (mode === 'recover') {
      const code = $('#auth-recovery-code').value.trim();
      const newPw = $('#auth-new-password').value;
      if (!username || !code || !newPw) {
        showAuthError(T('auth_fill_all'));
        return;
      }
      try {
        showLoader(true);
        const res = await API.recoveryConfirm({ username, recovery_code: code, new_password: newPw });
        API.setToken(res.access_token);
        state.user = res.user;
        toast(T('logged_in') + ' ' + state.user.username, 'ok');
        closeAuth();
        await refreshAll();
      } catch (e) {
        showAuthError(prettyErr(e));
      } finally {
        showLoader(false);
      }
      return;
    }

    if (!username || username.length < 3) { showAuthError(T('auth_username_short')); return; }
    if (!password || password.length < 3) { showAuthError(T('auth_password_short')); return; }

    try {
      showLoader(true);
      let res;
      if (mode === 'register') {
        const email = $('#auth-email').value.trim();
        const captchaAnswer = $('#auth-captcha-answer').value.trim();
        if (!captchaToken || !captchaAnswer) { showAuthError(T('auth_captcha_required')); showLoader(false); return; }
        try {
          res = await API.register({
            username, password,
            avatar: pickedAvatar,
            email: email || null,
            captcha_token: captchaToken,
            captcha_answer: captchaAnswer,
          });
        } catch (e) {
          // refresh captcha after any failure
          await refreshCaptcha();
          throw e;
        }
        API.setToken(res.access_token);
        state.user = res.user;
        // upload avatar photo if user picked one
        if (pickedAvatarFile) {
          try {
            state.user = await API.uploadAvatar(pickedAvatarFile);
          } catch (e) { /* keep emoji */ }
          pickedAvatarFile = null;
        }
      } else {
        res = await API.login({ username, password });
        API.setToken(res.access_token);
        state.user = res.user;
      }
      closeAuth();
      toast(T(mode === 'register' ? 'registered' : 'logged_in', { name: state.user.username }), 'ok');
      if (mode === 'register' && res.user.recovery_code) {
        showRecoveryCode(res.user.recovery_code);
      }
      await refreshAll();
    } catch (e) {
      showAuthError(prettyErr(e));
    } finally {
      showLoader(false);
    }
  }
  function showAuthError(msg) {
    const el = $('#auth-error');
    el.textContent = msg; el.style.display = 'block';
  }
  function prettyErr(e) {
    if (e.network) return T('err_network');
    if (e.status === 401) return T('err_401');
    if (e.status === 403 && e.data && e.data.detail === 'muted') return T('err_muted');
    if (e.status === 403 && e.data && e.data.detail === 'banned') return T('err_banned');
    if (e.status === 409) return T('err_taken');
    if (e.status === 413) return T('file_too_large');
    if (e.status === 429) return T('err_rate_limited');
    if (e && e.message === 'captcha failed') return T('err_captcha');
    return (e && e.message) || T('err_generic');
  }
  function showRecoveryCode(code) {
    $('#recovery-code-display').textContent = code;
    $('#recovery-shown-backdrop').hidden = false;
  }

  async function logout() {
    API.setToken(null);
    state.user = null;
    state.bets = [];
    state.transactions = [];
    closeProfile();
    await refreshAll();
    toast(T('logged_out'));
  }

  // ----- profile
  function renderProfileAvatar() {
    const el = $('#profile-avatar');
    const prev = $('#profile-avatar-preview');
    const u = state.user;
    if (!u) return;
    if (u.avatar_url) {
      const url = API.mediaUrl(u.avatar_url);
      el.innerHTML = '';
      el.style.backgroundImage = `url(${url})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = '';
      if (prev) {
        prev.innerHTML = `<img src="${url}" alt=""/>`;
        $('#profile-avatar-remove').hidden = false;
      }
    } else {
      el.style.backgroundImage = '';
      el.textContent = u.avatar || '🦊';
      if (prev) {
        prev.innerHTML = '';
        prev.textContent = u.avatar || '🦊';
        $('#profile-avatar-remove').hidden = true;
      }
    }
  }
  function openProfile() {
    if (!state.user) { openAuth('login'); return; }
    $('#profile-backdrop').hidden = false;
    $('#profile-username').textContent = state.user.username;
    $('#profile-balance').textContent = fmt(state.user.balance);
    $('#profile-email').value = state.user.email || '';
    renderProfileAvatar();
    buildEmojiGrid($('#profile-emoji-grid'), async (em) => {
      try {
        const u = await API.updateProfile({ avatar: em });
        state.user = u;
        renderProfileAvatar();
        renderAuthBlock();
      } catch (e) { toast(prettyErr(e), 'err'); }
    }, state.user.avatar);
    refreshProfileStats();
  }
  function closeProfile() { $('#profile-backdrop').hidden = true; }

  function refreshProfileStats() {
    const bets = state.bets;
    const won = bets.filter(b => b.status === 'won').length;
    const lost = bets.filter(b => b.status === 'lost').length;
    const myEvents = state.events.filter(e => e.owner_id === (state.user && state.user.id)).length;
    $('#ps-bets').textContent = bets.length;
    $('#ps-won').textContent = won;
    $('#ps-lost').textContent = lost;
    $('#ps-events').textContent = myEvents;
  }

  // ----- payments
  function openPayment(kind) {
    if (!state.user) { openAuth('login'); return; }
    $('#payment-backdrop').hidden = false;
    $('#payment-title').textContent = T(kind === 'topup' ? 'payment_topup' : 'payment_withdraw');
    $('#payment-submit').dataset.kind = kind;
    $('#payment-amount').value = kind === 'topup' ? 1000 : Math.min(1000, Math.floor(state.user.balance));
    $('#payment-error').style.display = 'none';
  }
  async function paymentSubmit() {
    const amount = Number($('#payment-amount').value);
    const kind = $('#payment-submit').dataset.kind || 'topup';
    if (!Number.isFinite(amount) || amount < 10) { showPaymentError(T('amount_too_small')); return; }
    if (kind === 'withdraw' && amount > state.user.balance) { showPaymentError(T('insufficient')); return; }
    try {
      showLoader(true);
      const oldBal = state.user.balance;
      const u = kind === 'topup' ? await API.topup(amount) : await API.withdraw(amount);
      state.user = u;
      $('#payment-backdrop').hidden = true;
      animateBalanceTo(oldBal, u.balance, kind === 'topup' ? 'up' : 'down');
      renderAuthBlock();
      toast(T(kind === 'topup' ? 'toast_topup' : 'toast_withdraw', { amount: fmt(amount) }), 'ok');
    } catch (e) {
      showPaymentError(prettyErr(e));
    } finally { showLoader(false); }
  }
  function showPaymentError(msg) { const el = $('#payment-error'); el.textContent = msg; el.style.display = 'block'; }

  function animateBalanceTo(from, to, dir) {
    const el = $('#balance');
    if (!el) return;
    const start = performance.now();
    const dur = 700;
    el.classList.add(dir === 'up' ? 'flash-green' : 'flash-red');
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * ease;
      el.textContent = fmt(v);
      if (t < 1) requestAnimationFrame(step);
      else setTimeout(() => el.classList.remove('flash-green', 'flash-red'), 600);
    }
    requestAnimationFrame(step);
  }

  // ----- events list / categories / search
  async function refreshEvents() {
    // 'all', 'streams', 'history', 'community', 'mine' are not real backend categories.
    const passthrough = new Set(['all', 'streams', 'history', 'community', 'mine']);
    const cat = passthrough.has(state.category) ? null : state.category;
    try {
      const list = await API.listEvents({ category: cat, q: state.search || null });
      state.events = list;
    } catch (e) { state.events = []; toast(prettyErr(e), 'err'); }
  }

  function renderEvents() {
    const container = $('#events');
    const empty = $('#empty-hint');
    container.querySelectorAll('.event-card').forEach(n => n.remove());
    let visible = state.events;
    if (state.category === 'streams') visible = visible.filter(e => e.is_live);
    if (state.category === 'community') visible = visible.filter(e => e.source === 'user');
    if (state.category === 'mine') {
      if (state.user) visible = visible.filter(e => e.owner_id === state.user.id);
      else visible = [];
    }
    if (state.category === 'history') {
      renderHistoryView(container);
      empty.hidden = true;
      return;
    }
    // Main feed: hide community (user-created) markets unless explicitly browsing them.
    if (state.category === 'all') visible = visible.filter(e => e.source !== 'user');
    visible.sort((a, b) => (b.is_live - a.is_live) || 0);
    if (visible.length === 0) { empty.hidden = false; return; }
    empty.hidden = true;
    visible.forEach(ev => container.appendChild(buildEventCard(ev)));
  }

  function pctOf(prob) {
    const n = Math.round(Number(prob) * 100);
    return Math.max(1, Math.min(99, n));
  }

  function buildEventCard(ev) {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.style.borderLeftColor = ev.color1 || '';

    const head = document.createElement('div'); head.className = 'event-head';
    const left = document.createElement('div'); left.className = 'event-left';
    const em = document.createElement('div'); em.className = 'event-emoji'; em.textContent = ev.emoji || '🎯';
    const titleWrap = document.createElement('div'); titleWrap.style.minWidth = '0';
    const title = document.createElement('div'); title.className = 'event-title'; title.textContent = ev.title;
    const meta = document.createElement('div'); meta.className = 'event-meta';
    if (ev.owner_username) {
      meta.textContent = `${ev.owner_avatar || ''} ${ev.owner_username} · ${T('source_user') || 'community'}`;
    } else {
      meta.textContent = T('source_' + (ev.source || 'seed')) || ev.source;
    }
    if (ev.is_live) {
      const livePill = document.createElement('span');
      livePill.className = 'live-pill';
      livePill.textContent = T('live') || 'LIVE';
      meta.appendChild(document.createTextNode(' '));
      meta.appendChild(livePill);
    }
    titleWrap.appendChild(title); titleWrap.appendChild(meta);
    left.appendChild(em); left.appendChild(titleWrap);
    head.appendChild(left);

    const right = document.createElement('div'); right.className = 'event-right';
    const liveBtn = document.createElement('button');
    liveBtn.className = 'btn-ghost btn-sm';
    liveBtn.textContent = ev.is_live ? '🔴' : '📺';
    liveBtn.title = ev.is_live ? T('live') : T('go_live');
    liveBtn.addEventListener('click', () => openStreamFor(ev));
    right.appendChild(liveBtn);
    if (state.user && ev.owner_id === state.user.id && ev.resolved_outcome_index === null) {
      const del = document.createElement('button');
      del.className = 'btn-ghost btn-sm';
      del.textContent = '🗑';
      del.title = T('delete');
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteEvent(ev.id); });
      right.appendChild(del);
    }
    head.appendChild(right);
    card.appendChild(head);

    if (ev.description) {
      const desc = document.createElement('div'); desc.className = 'event-desc'; desc.textContent = ev.description;
      card.appendChild(desc);
    }

    const outs = document.createElement('div');
    const isBinary = ev.outcomes.length === 2;
    outs.className = isBinary ? 'outcomes binary' : 'outcomes multi';

    if (isBinary) {
      const labels = ev.outcomes.map(o => (o.label || '').toLowerCase());
      // Heuristic: the first outcome we treat as "Yes" (it's the affirmative option in our seeds:
      //   "Будет дождь" / "Сухо", "Будут задержки" / "Всё ок", etc.)
      ev.outcomes.forEach((o, i) => {
        const btn = document.createElement('button');
        const isYes = i === 0;
        btn.className = 'outcome ' + (isYes ? 'yes' : 'no');
        const inCoupon = state.coupon.find(c => c.eventId === ev.id && c.outcomeIdx === o.idx);
        if (inCoupon) btn.classList.add('selected');
        const pct = pctOf(o.probability);
        btn.innerHTML = `
          <span class="outcome-pct">${pct}%</span>
          <span class="outcome-action">${o.label}</span>
          <span class="outcome-odds-pill">×${oddsFmt(o.odds)}</span>
        `;
        btn.title = `${o.label} · вероятность ${pct}% · коэф ${oddsFmt(o.odds)}`;
        btn.addEventListener('click', () => toggleCoupon(ev, o));
        outs.appendChild(btn);
      });
    } else {
      ev.outcomes.forEach(o => {
        const row = document.createElement('button');
        row.className = 'outcome';
        const inCoupon = state.coupon.find(c => c.eventId === ev.id && c.outcomeIdx === o.idx);
        if (inCoupon) row.classList.add('selected');
        const pct = pctOf(o.probability);
        row.innerHTML = `
          <span class="outcome-label-multi">${o.label}</span>
          <span class="outcome-pct-multi">${pct}%</span>
          <span class="outcome-buy">${T('buy') || 'Buy'} ×${oddsFmt(o.odds)}</span>
        `;
        row.addEventListener('click', () => toggleCoupon(ev, o));
        outs.appendChild(row);
      });
    }
    card.appendChild(outs);

    // Footer: volume + when
    const footer = document.createElement('div'); footer.className = 'event-footer';
    const left2 = document.createElement('span'); left2.className = 'vol-label';
    const vol = (typeof ev.volume === 'number') ? ev.volume : 0;
    left2.innerHTML = `💸 <span class="vol-amount">${fmt(vol)}</span> ${T('volume') || 'оборот'}`;
    footer.appendChild(left2);
    if (ev.starts_at) {
      const right2 = document.createElement('span');
      right2.textContent = '🕐 ' + new Date(ev.starts_at).toLocaleDateString();
      footer.appendChild(right2);
    }
    card.appendChild(footer);
    return card;
  }

  function renderHistoryView(container) {
    const wrap = document.createElement('div'); wrap.className = 'history-wrap';
    const filterBar = document.createElement('div'); filterBar.className = 'history-filters';
    [['all', '🌐 ' + T('history_all')], ['pending', '⏳ ' + T('history_pending')], ['won', '🏆 ' + T('history_won')], ['lost', '💀 ' + T('history_lost')]].forEach(([k, label]) => {
      const b = document.createElement('button');
      b.className = 'btn-ghost' + (state.historyFilter === k ? ' active' : '');
      b.textContent = label;
      b.addEventListener('click', () => { state.historyFilter = k; renderEvents(); });
      filterBar.appendChild(b);
    });
    wrap.appendChild(filterBar);

    if (!state.user) {
      const note = document.createElement('div'); note.className = 'empty-hint visible';
      note.innerHTML = `<div class="title">${T('login_to_see_history')}</div>`;
      wrap.appendChild(note);
      container.appendChild(wrap);
      return;
    }
    let bets = state.bets;
    if (state.historyFilter !== 'all') bets = bets.filter(b => b.status === state.historyFilter);
    if (bets.length === 0) {
      const note = document.createElement('div'); note.className = 'empty-hint visible';
      note.innerHTML = `<div class="title">${T('history_empty')}</div>`;
      wrap.appendChild(note);
      container.appendChild(wrap);
      return;
    }
    bets.forEach(b => {
      const card = document.createElement('div'); card.className = 'bet-card status-' + b.status;
      const head = document.createElement('div'); head.className = 'bet-head';
      head.innerHTML = `<b>${T('bet_status_' + b.status)}</b><span>${oddsFmt(b.total_odds)}× · ${fmt(b.stake)}</span>`;
      card.appendChild(head);
      b.legs.forEach(l => {
        const row = document.createElement('div'); row.className = 'bet-leg leg-' + l.status;
        const resolved = (l.resolved_outcome_label !== null && l.resolved_outcome_label !== undefined)
          ? ` → ${l.resolved_outcome_label}` : '';
        row.innerHTML = `<span>${l.event_title}</span><span class="leg-pick">${l.outcome_label} (${oddsFmt(l.odds)})${resolved}</span>`;
        card.appendChild(row);
      });
      const foot = document.createElement('div'); foot.className = 'bet-foot';
      const created = new Date(b.created_at).toLocaleString();
      const payout = b.status === 'won' ? `🏆 ${fmt(b.payout)}` : (b.status === 'lost' ? `💀 -${fmt(b.stake)}` : `⏳ ${T('history_pending')}`);
      foot.innerHTML = `<span>${created}</span><span>${payout}</span>`;
      card.appendChild(foot);
      wrap.appendChild(card);
    });
    container.appendChild(wrap);
  }

  // ----- coupon
  function toggleCoupon(ev, outcome) {
    if (ev.resolved_outcome_index !== null && ev.resolved_outcome_index !== undefined) return;
    const idx = state.coupon.findIndex(c => c.eventId === ev.id);
    if (idx >= 0) {
      if (state.coupon[idx].outcomeIdx === outcome.idx) {
        state.coupon.splice(idx, 1);
      } else {
        state.coupon[idx] = { eventId: ev.id, outcomeIdx: outcome.idx };
      }
    } else {
      state.coupon.push({ eventId: ev.id, outcomeIdx: outcome.idx });
    }
    renderCoupon();
    renderEvents();
  }
  function renderCoupon() {
    const list = $('#coupon-items'); const sum = $('#coupon-summary');
    list.innerHTML = '';
    if (state.coupon.length === 0) {
      list.innerHTML = `<div class="coupon-empty" data-i18n="empty_coupon">${T('empty_coupon')}</div>`;
      sum.hidden = true;
      return;
    }
    let total = 1;
    state.coupon.forEach(c => {
      const ev = state.events.find(e => e.id === c.eventId);
      if (!ev) return;
      const o = ev.outcomes[c.outcomeIdx];
      total *= o.odds;
      const item = document.createElement('div'); item.className = 'coupon-item';
      item.innerHTML = `<div><div class="ci-title">${ev.emoji} ${ev.title}</div><div class="ci-pick">${o.label}</div></div>
                       <div class="ci-right"><span class="ci-odds">${oddsFmt(o.odds)}</span><button class="btn-ghost ci-remove">✕</button></div>`;
      item.querySelector('.ci-remove').addEventListener('click', () => {
        const i = state.coupon.findIndex(x => x.eventId === c.eventId);
        if (i >= 0) state.coupon.splice(i, 1);
        renderCoupon(); renderEvents();
      });
      list.appendChild(item);
    });
    sum.hidden = false;
    $('#coupon-count').textContent = state.coupon.length;
    $('#coupon-odds').textContent = oddsFmt(total);
    const stake = Number($('#stake').value) || 0;
    $('#coupon-win').textContent = fmt(stake * total);
  }
  $('#stake') && $('#stake').addEventListener('input', renderCoupon);

  async function placeBet() {
    if (!state.user) { openAuth('login'); return; }
    if (state.coupon.length === 0) { toast(T('coupon_empty'), 'err'); return; }
    const stake = Number($('#stake').value);
    if (!Number.isFinite(stake) || stake < 10) { toast(T('stake_too_small'), 'err'); return; }
    if (stake > state.user.balance) { toast(T('insufficient'), 'err'); return; }
    try {
      showLoader(true);
      const oldBal = state.user.balance;
      const bet = await API.placeBet({
        legs: state.coupon.map(c => ({ event_id: c.eventId, outcome_idx: c.outcomeIdx })),
        stake,
      });
      const me = await API.me();
      state.user = me;
      animateBalanceTo(oldBal, me.balance, me.balance > oldBal ? 'up' : 'down');
      state.coupon = [];
      renderCoupon();
      await Promise.all([refreshEvents(), refreshBets()]);
      renderEvents();
      showResolveModal(bet);
      if (bet.status === 'won') launchConfetti();
    } catch (e) {
      toast(prettyErr(e), 'err');
    } finally { showLoader(false); }
  }

  function showResolveModal(bet) {
    const back = $('#resolve-backdrop');
    back.hidden = false;
    const titleKey = bet.status === 'won' ? 'bet_won' : (bet.status === 'lost' ? 'bet_lost' : 'bet_pending');
    $('#resolve-title').textContent = T(titleKey);
    const body = $('#resolve-body');
    body.innerHTML = '';
    const head = document.createElement('div'); head.className = 'resolve-head';
    head.innerHTML = `<div>${T('stake')}: <b>${fmt(bet.stake)}</b></div>
                     <div>${T('total_odds')}: <b>${oddsFmt(bet.total_odds)}</b></div>
                     <div>${bet.status === 'won' ? `🏆 <b>${fmt(bet.payout)}</b>` : (bet.status === 'lost' ? `💀 <b>-${fmt(bet.stake)}</b>` : `⏳ <b>${T('history_pending')}</b>`)}</div>`;
    body.appendChild(head);
    bet.legs.forEach(l => {
      const row = document.createElement('div'); row.className = 'resolve-leg leg-' + l.status;
      const resolved = (l.resolved_outcome_label !== null && l.resolved_outcome_label !== undefined)
        ? ` → ${l.resolved_outcome_label}` : ` (${T('history_pending')})`;
      row.innerHTML = `<span>${l.event_title}</span><span>${l.outcome_label}${resolved}</span>`;
      body.appendChild(row);
    });
  }

  // ----- create event
  let outcomesDraft = [];
  function openAddModal() {
    if (!state.user) { openAuth('login'); return; }
    $('#add-backdrop').hidden = false;
    $('#add-title').value = '';
    $('#add-desc').value = '';
    $('#add-emoji').value = '🎯';
    $('#add-color1').value = '#ff7a18';
    $('#add-color2').value = '#3a8dff';
    outcomesDraft = [
      { label: T('default_yes'), probability: 0.5 },
      { label: T('default_no'), probability: 0.5 },
    ];
    renderOutcomesDraft();
    syncEventPreview();
  }
  function closeAddModal() { $('#add-backdrop').hidden = true; }
  function renderOutcomesDraft() {
    const list = $('#outcomes-list'); list.innerHTML = '';
    outcomesDraft.forEach((o, i) => {
      const row = document.createElement('div'); row.className = 'outcome-draft';
      row.innerHTML = `<input type="text" class="o-label" value="${escapeHtml(o.label)}" placeholder="Label" maxlength="40" />
                      <input type="number" class="o-prob" value="${o.probability}" min="0.01" max="0.99" step="0.01" />
                      <button class="btn-ghost o-del">✕</button>`;
      row.querySelector('.o-label').addEventListener('input', e => o.label = e.target.value);
      row.querySelector('.o-prob').addEventListener('input', e => o.probability = Number(e.target.value));
      row.querySelector('.o-del').addEventListener('click', () => {
        if (outcomesDraft.length > 2) { outcomesDraft.splice(i, 1); renderOutcomesDraft(); }
        else toast(T('need_2_outcomes'), 'err');
      });
      list.appendChild(row);
    });
  }
  function syncEventPreview() {
    $('#ep-emoji').textContent = $('#add-emoji').value || '🎯';
    $('#ep-title').textContent = $('#add-title').value || T('event_preview_title');
    $('#ep-desc').textContent = $('#add-desc').value || T('event_preview_desc');
    const c1 = $('#add-color1').value, c2 = $('#add-color2').value;
    $('#event-preview').style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
  }
  ['#add-title', '#add-desc', '#add-emoji', '#add-color1', '#add-color2'].forEach(s => {
    document.addEventListener('input', e => { if (e.target.matches(s)) syncEventPreview(); });
  });
  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  async function saveCustomEvent() {
    const title = $('#add-title').value.trim();
    if (title.length < 2) { showAddError(T('title_required')); return; }
    if (outcomesDraft.length < 2) { showAddError(T('need_2_outcomes')); return; }
    if (outcomesDraft.some(o => !o.label || !o.probability || o.probability <= 0)) {
      showAddError(T('invalid_outcomes')); return;
    }
    try {
      showLoader(true);
      await API.createEvent({
        title,
        description: $('#add-desc').value.trim(),
        category: 'mine',
        emoji: $('#add-emoji').value || '🎯',
        color1: $('#add-color1').value,
        color2: $('#add-color2').value,
        outcomes: outcomesDraft.map(o => ({ label: o.label, probability: Math.min(0.99, Math.max(0.01, o.probability)) })),
      });
      closeAddModal();
      await refreshEvents();
      renderEvents();
      toast(T('event_created'), 'ok');
    } catch (e) { showAddError(prettyErr(e)); }
    finally { showLoader(false); }
  }
  function showAddError(msg) { const el = $('#add-error'); el.textContent = msg; el.style.display = 'block'; }

  async function deleteEvent(id) {
    if (!confirm(T('delete_confirm'))) return;
    try {
      await API.deleteEvent(id);
      state.coupon = state.coupon.filter(c => c.eventId !== id);
      await refreshEvents();
      renderEvents(); renderCoupon();
      toast(T('deleted'), 'ok');
    } catch (e) { toast(prettyErr(e), 'err'); }
  }

  // ----- streams + chat (real-time via WS)
  let canvasRAF = null;
  function showVideoEl(url, type) {
    const v = $('#stream-video-el');
    v.src = API.mediaUrl(url);
    v.hidden = false;
    $('#stream-iframe').hidden = true;
    $('#stream-canvas').hidden = true;
    if (canvasRAF) cancelAnimationFrame(canvasRAF);
    v.play().catch(() => {});
  }

  async function openStreamFor(ev) {
    state.activeStream.eventId = ev.id;
    $('#stream-backdrop').hidden = false;
    $('#stream-title').textContent = (ev.is_live ? '🔴 ' : '') + ev.title;
    $('#stream-iframe').hidden = true;
    $('#stream-iframe').src = '';
    const ve = $('#stream-video-el');
    ve.hidden = true; ve.pause(); ve.removeAttribute('src'); ve.load();
    const canvas = $('#stream-canvas'); canvas.hidden = false;
    startCanvasAnim(canvas, ev);
    $('#chat-messages').innerHTML = '';
    $('#chat-text').value = '';

    // load existing stream info
    try {
      const s = await API.getStream(ev.id);
      if (s) {
        if (s.media_url && (s.media_type === 'mp4' || s.media_type === 'webm' || s.media_type === 'hls')) {
          showVideoEl(s.media_url, s.media_type);
        } else if (s.url) {
          showIframe(s.url);
        }
      }
      state.activeStream.ownerId = s ? s.owner_id : null;
      $('#stream-stop').hidden = !(s && state.user && s.owner_id === state.user.id);
      $('#stream-set-url').hidden = !state.user;
      $('#stream-upload').hidden = !state.user;
    } catch {}

    // history
    try {
      const hist = await API.chatHistory(ev.id);
      hist.forEach(appendChatMessage);
    } catch {}

    openWebSocket(ev.id);
  }
  function showIframe(url) {
    const fr = $('#stream-iframe');
    fr.src = normalizeStreamUrl(url);
    fr.hidden = false;
    $('#stream-canvas').hidden = true;
    if (canvasRAF) cancelAnimationFrame(canvasRAF);
  }
  function normalizeStreamUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
        let id = u.searchParams.get('v');
        if (!id && u.hostname === 'youtu.be') id = u.pathname.slice(1);
        if (id) return `https://www.youtube.com/embed/${id}`;
      }
      if (u.hostname.includes('twitch.tv')) {
        const path = u.pathname.replace(/\//g, '');
        return `https://player.twitch.tv/?channel=${path}&parent=${location.hostname}&parent=devinapps.com`;
      }
      return url;
    } catch { return url; }
  }
  function startCanvasAnim(canvas, ev) {
    const ctx = canvas.getContext('2d');
    let t = 0;
    function frame() {
      const w = canvas.width, h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, ev.color1); grad.addColorStop(1, ev.color2);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 30; i++) {
        const x = (Math.sin(t * 0.005 + i) * 0.5 + 0.5) * w;
        const y = (Math.cos(t * 0.004 + i * 0.3) * 0.5 + 0.5) * h;
        ctx.beginPath(); ctx.arc(x, y, 2 + (i % 5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText((ev.emoji || '🔴') + ' ' + ev.title, w / 2, h / 2 - 8);
      ctx.font = '18px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('Live · ' + new Date().toLocaleTimeString(), w / 2, h / 2 + 24);
      t++;
      canvasRAF = requestAnimationFrame(frame);
    }
    if (canvasRAF) cancelAnimationFrame(canvasRAF);
    frame();
  }

  function openWebSocket(eventId) {
    closeWebSocket();
    const ws = new WebSocket(API.wsUrl(eventId));
    state.activeStream.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', token: API.getToken() }));
    };
    ws.onmessage = (m) => {
      let data; try { data = JSON.parse(m.data); } catch { return; }
      if (data.type === 'chat' && data.message) appendChatMessage(data.message);
      else if (data.type === 'viewers') $('#stream-viewers').textContent = data.viewers + ' 👀';
      else if (data.type === 'error') {
        if (data.error === 'rate_limited') toast(T('err_rate_limited'), 'err');
        else if (data.error === 'muted') toast(T('err_muted'), 'err');
        else if (data.error === 'banned') toast(T('err_banned'), 'err');
        else if (data.error === 'auth_required') toast(T('err_401'), 'err');
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {};
  }
  function closeWebSocket() {
    if (state.activeStream.ws) {
      try { state.activeStream.ws.close(); } catch {}
      state.activeStream.ws = null;
    }
  }
  function closeStream() {
    closeWebSocket();
    if (canvasRAF) cancelAnimationFrame(canvasRAF);
    $('#stream-backdrop').hidden = true;
    state.activeStream.eventId = null;
  }

  function appendChatMessage(msg) {
    const list = $('#chat-messages');
    const el = document.createElement('div'); el.className = 'chat-msg';
    const ava = msg.avatar_url
      ? `<img class="avatar-img" src="${escapeHtml(API.mediaUrl(msg.avatar_url))}" alt=""/>`
      : `<span class="chat-avatar">${msg.avatar || '🦊'}</span>`;
    const text = msg.is_deleted
      ? `<i class="chat-deleted">[deleted]</i>`
      : escapeHtml(msg.text);
    el.innerHTML = `${ava}<div><div class="chat-author">${escapeHtml(msg.username)}</div><div class="chat-text">${text}</div></div>`;
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
  }
  async function sendChatMessage() {
    if (!state.user) { openAuth('login'); return; }
    const text = $('#chat-text').value.trim();
    if (!text) return;
    $('#chat-text').value = '';
    const ws = state.activeStream.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat', text }));
    } else {
      try { await API.chatPost(state.activeStream.eventId, text); }
      catch (e) { toast(prettyErr(e), 'err'); }
    }
  }
  async function startMyStream() {
    if (!state.user) { openAuth('login'); return; }
    const url = prompt(T('prompt_stream_url'));
    if (url === null) return;
    try {
      const s = await API.startStream(state.activeStream.eventId, { url: url || null });
      if (s.url) showIframe(s.url);
      state.activeStream.ownerId = s.owner_id;
      $('#stream-stop').hidden = false;
      await refreshEvents(); renderEvents();
      toast(T('stream_started'), 'ok');
    } catch (e) { toast(prettyErr(e), 'err'); }
  }
  async function uploadStreamFile(file) {
    if (!state.user || !file) return;
    try {
      showLoader(true);
      const up = await API.uploadStream(file);
      const s = await API.startStream(state.activeStream.eventId, {
        url: null,
        media_url: up.media_url,
        media_type: up.media_type,
      });
      showVideoEl(s.media_url, s.media_type);
      state.activeStream.ownerId = s.owner_id;
      $('#stream-stop').hidden = false;
      await refreshEvents(); renderEvents();
      toast(T('stream_started'), 'ok');
    } catch (e) { toast(prettyErr(e), 'err'); }
    finally { showLoader(false); }
  }
  async function stopMyStream() {
    try {
      await API.stopStream(state.activeStream.eventId);
      $('#stream-stop').hidden = true;
      await refreshEvents(); renderEvents();
      toast(T('stream_stopped'), 'ok');
    } catch (e) { toast(prettyErr(e), 'err'); }
  }

  // ----- confetti
  function launchConfetti() {
    const colors = ['#ff7a18', '#3a8dff', '#3aff8d', '#ffce3a', '#ff3a8d'];
    for (let i = 0; i < 80; i++) {
      const c = document.createElement('div'); c.className = 'confetti';
      c.style.background = colors[i % colors.length];
      c.style.left = Math.random() * 100 + '%';
      c.style.animationDelay = (Math.random() * 0.5) + 's';
      c.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3500);
    }
  }

  // ----- history / bets refresh
  async function refreshBets() {
    if (!state.user) { state.bets = []; return; }
    try { state.bets = await API.listBets(); }
    catch (e) { state.bets = []; }
  }

  // ----- topbar / auth block
  function renderAuthBlock() {
    const el = $('#auth-block');
    el.innerHTML = '';
    if (!state.user) {
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.textContent = T('signin_or_register');
      btn.addEventListener('click', () => openAuth('login'));
      el.appendChild(btn);
      return;
    }
    const wrap = document.createElement('div'); wrap.className = 'user-chip';
    const u = state.user;
    const avaHtml = u.avatar_url
      ? `<img class="avatar-img" src="${escapeHtml(API.mediaUrl(u.avatar_url))}" alt=""/>`
      : `<span>${u.avatar || '🦊'}</span>`;
    const adminPill = u.is_admin
      ? '<span class="user-admin-pill">ADMIN</span>'
      : (u.is_moderator ? '<span class="user-mod-pill">MOD</span>' : '');
    const adminLink = (u.is_admin || u.is_moderator)
      ? `<a class="btn-ghost" href="admin.html" title="${T('admin_panel')}">🛡</a>`
      : '';
    wrap.innerHTML = `
      <button class="balance-btn" id="topup-btn" title="${T('payment_topup')}">+</button>
      <span id="balance" class="balance">${fmt(u.balance)}</span>
      <button class="balance-btn" id="withdraw-btn" title="${T('payment_withdraw')}">↗</button>
      ${adminLink}
      <button class="user-btn" id="user-btn">${avaHtml}<span class="username">${escapeHtml(u.username)}</span>${adminPill}</button>
    `;
    el.appendChild(wrap);
    $('#topup-btn').addEventListener('click', () => openPayment('topup'));
    $('#withdraw-btn').addEventListener('click', () => openPayment('withdraw'));
    $('#user-btn').addEventListener('click', openProfile);
  }

  // ----- export/import
  async function exportData() {
    try {
      const txs = await API.transactions();
      const bets = await API.listBets();
      const data = { user: state.user, transactions: txs, bets, exported_at: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `betslife-${state.user.username}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast(T('exported'), 'ok');
    } catch (e) { toast(prettyErr(e), 'err'); }
  }
  function importData() { $('#profile-import-file').click(); }
  $('#profile-import-file') && $('#profile-import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const msg = $('#profile-msg'); msg.style.display = 'block'; msg.style.color = 'var(--green)';
      msg.textContent = T('imported_summary', { bets: (data.bets || []).length, txs: (data.transactions || []).length });
    } catch { toast(T('import_invalid'), 'err'); }
  });

  // ----- main bootstrap
  async function refreshAll() {
    await Promise.all([refreshEvents(), refreshBets()]);
    renderEvents();
    renderCoupon();
    renderAuthBlock();
    refreshProfileStats();
  }

  async function tryAutoLogin() {
    if (!API.getToken()) return;
    try {
      const me = await API.me();
      state.user = me;
    } catch { state.user = null; }
  }

  // ----- theme
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('worldpari.theme', t); } catch (e) {}
    const btn = $('#theme-toggle');
    if (btn) btn.textContent = (t === 'dark') ? '☀️' : '🌙';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0b0f14' : '#ffffff');
  }
  function initTheme() {
    let t = 'light';
    try { t = localStorage.getItem('worldpari.theme') || 'light'; } catch (e) {}
    applyTheme(t);
  }

  // ----- event wiring
  function wire() {
    initTheme();
    const themeBtn = $('#theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    $$('.tab').forEach(t => t.addEventListener('click', () => {
      state.category = t.dataset.cat;
      $$('.tab').forEach(x => x.classList.toggle('active', x === t));
      renderEvents();
    }));
    const search = $('#search-input');
    let st;
    search.addEventListener('input', () => {
      clearTimeout(st);
      st = setTimeout(async () => {
        state.search = search.value.trim();
        await refreshEvents(); renderEvents();
      }, 250);
    });

    $('#auth-close').addEventListener('click', closeAuth);
    $('#auth-cancel').addEventListener('click', closeAuth);
    $('#auth-submit').addEventListener('click', authSubmit);
    $$('.auth-tab').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));
    $('#auth-username').addEventListener('keydown', e => { if (e.key === 'Enter') authSubmit(); });
    $('#auth-password').addEventListener('keydown', e => { if (e.key === 'Enter') authSubmit(); });
    $('#recovery-shown-close').addEventListener('click', () => { $('#recovery-shown-backdrop').hidden = true; });
    $('#recovery-shown-ok').addEventListener('click', () => { $('#recovery-shown-backdrop').hidden = true; });
    $('#recovery-copy').addEventListener('click', () => {
      navigator.clipboard.writeText($('#recovery-code-display').textContent).then(() => toast(T('copied'), 'ok'));
    });

    $('#payment-close').addEventListener('click', () => $('#payment-backdrop').hidden = true);
    $('#payment-cancel').addEventListener('click', () => $('#payment-backdrop').hidden = true);
    $('#payment-submit').addEventListener('click', paymentSubmit);
    $$('#payment-quick button').forEach(b => b.addEventListener('click', () => $('#payment-amount').value = b.dataset.amt));

    $('#profile-close').addEventListener('click', closeProfile);
    $('#profile-logout').addEventListener('click', logout);
    $('#profile-change-pw').addEventListener('click', async () => {
      const oldp = $('#profile-old-password').value, newp = $('#profile-new-password').value;
      if (!oldp || !newp || newp.length < 3) { toast(T('auth_password_short'), 'err'); return; }
      try { await API.changePassword({ old_password: oldp, new_password: newp });
        $('#profile-old-password').value = ''; $('#profile-new-password').value = '';
        toast(T('password_changed'), 'ok');
      } catch (e) { toast(prettyErr(e), 'err'); }
    });
    $('#profile-export').addEventListener('click', exportData);
    $('#profile-import').addEventListener('click', importData);

    $('#add-event-btn').addEventListener('click', openAddModal);
    $('#add-close').addEventListener('click', closeAddModal);
    $('#add-cancel').addEventListener('click', closeAddModal);
    $('#add-submit').addEventListener('click', saveCustomEvent);
    $('#add-outcome-btn').addEventListener('click', () => {
      if (outcomesDraft.length >= 8) { toast(T('max_outcomes'), 'err'); return; }
      outcomesDraft.push({ label: T('default_outcome'), probability: 0.2 });
      renderOutcomesDraft();
    });

    $('#clear-coupon').addEventListener('click', () => { state.coupon = []; renderCoupon(); renderEvents(); });
    $('#place-bet').addEventListener('click', placeBet);

    $('#resolve-close').addEventListener('click', () => $('#resolve-backdrop').hidden = true);
    $('#resolve-ok').addEventListener('click', () => $('#resolve-backdrop').hidden = true);

    $('#stream-close').addEventListener('click', closeStream);
    $('#stream-set-url').addEventListener('click', startMyStream);
    $('#stream-stop').addEventListener('click', stopMyStream);
    $('#stream-upload').addEventListener('click', () => $('#stream-upload-file').click());
    $('#stream-upload-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) uploadStreamFile(f);
      e.target.value = '';
    });
    $('#chat-send').addEventListener('click', sendChatMessage);
    $('#chat-text').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

    // emoji palette for register
    buildEmojiGrid($('#emoji-grid'), em => { pickedAvatar = em; updateAuthAvatarPreview(); }, pickedAvatar);

    // captcha refresh & avatar file picker (register)
    $('#auth-captcha-refresh').addEventListener('click', refreshCaptcha);
    $('#auth-avatar-pick').addEventListener('click', () => $('#auth-avatar-file').click());
    $('#auth-avatar-file').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast(T('file_too_large'), 'err'); return; }
      pickedAvatarFile = f;
      updateAuthAvatarPreview();
      $('#auth-avatar-clear').hidden = false;
    });
    $('#auth-avatar-clear').addEventListener('click', () => {
      pickedAvatarFile = null;
      $('#auth-avatar-file').value = '';
      $('#auth-avatar-clear').hidden = true;
      updateAuthAvatarPreview();
    });

    // profile avatar upload
    $('#profile-avatar-upload').addEventListener('click', () => $('#profile-avatar-file').click());
    $('#profile-avatar-file').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast(T('file_too_large'), 'err'); return; }
      try {
        showLoader(true);
        state.user = await API.uploadAvatar(f);
        renderProfileAvatar();
        renderAuthBlock();
        toast(T('avatar_updated'), 'ok');
      } catch (err) { toast(prettyErr(err), 'err'); }
      finally { showLoader(false); e.target.value = ''; }
    });
    $('#profile-avatar-remove').addEventListener('click', async () => {
      try { state.user = await API.deleteAvatar(); renderProfileAvatar(); renderAuthBlock(); }
      catch (err) { toast(prettyErr(err), 'err'); }
    });
    $('#profile-save-email').addEventListener('click', async () => {
      const email = $('#profile-email').value.trim();
      try {
        state.user = await API.updateProfile({ email: email || null });
        toast(T('email_saved'), 'ok');
      } catch (err) { toast(prettyErr(err), 'err'); }
    });

    // hamburger toggles tabs on mobile
    $('#hamburger').addEventListener('click', () => {
      document.body.classList.toggle('menu-open');
    });

    // close modals on backdrop click
    $$('.modal-backdrop').forEach(b => b.addEventListener('click', e => {
      if (e.target === b) {
        if (b.id === 'stream-backdrop') closeStream();
        else b.hidden = true;
      }
    }));

    // i18n init
    if (window.I18N) {
      window.I18N.init({
        select: $('#lang-select'),
        currentBadge: $('#lang-current'),
        onChange: () => {
          renderEvents();
          renderCoupon();
          renderAuthBlock();
        },
      });
    }

    // periodic refresh of events (catches resolves from external bets)
    setInterval(async () => {
      if (document.hidden) return;
      await refreshEvents();
      if (state.user) await refreshBets();
      renderEvents();
    }, 30000);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    wire();
    showLoader(true);
    await tryAutoLogin();
    await refreshAll();
    showLoader(false);
  });
})();
