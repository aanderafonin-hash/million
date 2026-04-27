/* BetLife admin panel — separate page for moderators/admins. */
(function () {
  'use strict';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const state = {
    me: null,
    activeTab: 'users',
    users: [],
    events: [],
    chat: [],
    audit: [],
    eventFilter: '',
    chatEventId: '',
    userQuery: '',
    eventShowResolved: true,
  };

  function fmt(n) {
    return Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
  }
  function dt(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString('ru-RU');
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function avaCell(u) {
    if (!u) return '';
    if (u.avatar_url) {
      return `<div class="ava-cell"><div class="ava"><img src="${escapeHtml(API.mediaUrl(u.avatar_url))}" alt=""/></div><span>${escapeHtml(u.username)}</span></div>`;
    }
    return `<div class="ava-cell"><div class="ava">${escapeHtml(u.avatar || '🦊')}</div><span>${escapeHtml(u.username)}</span></div>`;
  }
  function pills(u) {
    const out = [];
    if (u.is_admin) out.push('<span class="pill admin">ADMIN</span>');
    else if (u.is_moderator) out.push('<span class="pill mod">MOD</span>');
    if (u.is_banned) out.push('<span class="pill banned">BANNED</span>');
    if (u.chat_muted_until && new Date(u.chat_muted_until) > new Date()) out.push('<span class="pill muted">MUTED</span>');
    return out.join(' ');
  }

  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3500);
  }
  function err(e) {
    toast((e && e.message) || 'error', 'err');
  }
  function showLoader(on) { $('#loader').hidden = !on; }

  // ----- bootstrap
  async function ensureAuth() {
    if (!API.isAuthed()) {
      location.href = 'index.html';
      return false;
    }
    try {
      state.me = await API.me();
    } catch {
      location.href = 'index.html';
      return false;
    }
    if (!(state.me.is_admin || state.me.is_moderator)) {
      $('#admin-pane').innerHTML = '<div class="empty">У вас нет прав модератора.<br/><a class="btn-ghost" href="index.html">Вернуться на сайт</a></div>';
      $('#admin-role').textContent = 'NO ACCESS';
      return false;
    }
    $('#admin-role').textContent = state.me.is_admin ? `ADMIN · ${state.me.username}` : `MOD · ${state.me.username}`;
    return true;
  }

  function setTab(tab) {
    state.activeTab = tab;
    $$('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'users') loadUsers();
    if (tab === 'events') loadEvents();
    if (tab === 'chat') loadChat();
    if (tab === 'audit') loadAudit();
  }

  // ----- users
  async function loadUsers() {
    $('#admin-pane').innerHTML = `
      <div class="admin-search">
        <input type="search" id="user-search" placeholder="Поиск по логину…" value="${escapeHtml(state.userQuery)}" />
        <button class="btn-ghost" id="user-refresh">↻</button>
      </div>
      <div id="users-list" class="empty">Загрузка…</div>
    `;
    $('#user-search').addEventListener('input', e => { state.userQuery = e.target.value; renderUsersDebounced(); });
    $('#user-refresh').addEventListener('click', () => loadUsers());
    try {
      state.users = await API.adminListUsers(state.userQuery || null);
      renderUsers();
    } catch (e) { err(e); }
  }
  let userTimer = null;
  function renderUsersDebounced() {
    clearTimeout(userTimer);
    userTimer = setTimeout(async () => {
      try {
        state.users = await API.adminListUsers(state.userQuery || null);
        renderUsers();
      } catch (e) { err(e); }
    }, 300);
  }
  function renderUsers() {
    const root = $('#users-list');
    if (!state.users.length) { root.innerHTML = '<div class="empty">Пользователей не найдено.</div>'; return; }
    const isAdmin = !!state.me.is_admin;
    const rows = state.users.map(u => `
      <tr class="${u.is_banned ? 'row-banned' : ''} ${u.username.startsWith('deleted_') ? 'row-deleted' : ''}" data-id="${u.id}">
        <td>#${u.id}</td>
        <td>${avaCell(u)} ${pills(u)}</td>
        <td>${escapeHtml(u.email || '—')}</td>
        <td>${fmt(u.balance)}</td>
        <td>${u.bets_count}/${u.events_count}</td>
        <td><span class="small">${dt(u.created_at)}</span></td>
        <td>
          <div class="admin-actions">
            ${u.is_banned
              ? `<button class="btn-ghost ok" data-act="unban">unban</button>`
              : `<button class="btn-ghost danger" data-act="ban">ban</button>`}
            <button class="btn-ghost warn" data-act="mute">mute 5m</button>
            <button class="btn-ghost" data-act="unmute">unmute</button>
            ${isAdmin ? `
              <button class="btn-ghost" data-act="toggle-mod">${u.is_moderator ? '−mod' : '+mod'}</button>
              <button class="btn-ghost" data-act="toggle-admin">${u.is_admin ? '−admin' : '+admin'}</button>
              <button class="btn-ghost" data-act="balance">balance</button>
              ${u.is_admin || u.username.startsWith('deleted_') ? '' : '<button class="btn-ghost danger" data-act="delete">delete</button>'}
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
    root.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>ID</th><th>Юзер</th><th>Email</th><th>Баланс</th><th>Bets/Events</th><th>Создан</th><th>Действия</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    $$('#users-list tbody tr').forEach(tr => {
      const id = Number(tr.dataset.id);
      tr.querySelectorAll('button[data-act]').forEach(b => {
        b.addEventListener('click', () => userAction(id, b.dataset.act));
      });
    });
  }
  async function userAction(id, act) {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    try {
      showLoader(true);
      let updated;
      if (act === 'ban') {
        const reason = prompt('Reason?') || '';
        updated = await API.adminBan(id, true, reason);
      } else if (act === 'unban') {
        updated = await API.adminBan(id, false);
      } else if (act === 'mute') {
        const m = Number(prompt('Mute minutes', '5')) || 5;
        updated = await API.adminMute(id, m);
      } else if (act === 'unmute') {
        updated = await API.adminMute(id, 0);
      } else if (act === 'toggle-mod') {
        updated = await API.adminSetRole(id, { is_moderator: !u.is_moderator });
      } else if (act === 'toggle-admin') {
        if (!confirm(u.is_admin ? 'Revoke admin?' : 'Grant admin (full power)?')) return;
        updated = await API.adminSetRole(id, { is_admin: !u.is_admin });
      } else if (act === 'balance') {
        const v = Number(prompt('New balance', String(u.balance)));
        if (!Number.isFinite(v)) return;
        updated = await API.adminSetBalance(id, v, 'admin override');
      } else if (act === 'delete') {
        if (!confirm('Delete user (soft)? Their balance/bets stay; username will be scrubbed.')) return;
        await API.adminDeleteUser(id);
        await loadUsers();
        toast('user deleted', 'ok');
        return;
      }
      if (updated) {
        const idx = state.users.findIndex(x => x.id === id);
        if (idx >= 0) state.users[idx] = updated;
        renderUsers();
        toast(act + ' ok', 'ok');
      }
    } catch (e) { err(e); }
    finally { showLoader(false); }
  }

  // ----- events
  async function loadEvents() {
    $('#admin-pane').innerHTML = `
      <div class="filter-row admin-search">
        <input type="search" id="evt-search" placeholder="Поиск по заголовку…" value="${escapeHtml(state.eventFilter)}" />
        <label><input type="checkbox" id="evt-show-resolved" ${state.eventShowResolved ? 'checked' : ''}/> с резолвом</label>
        <button class="btn-ghost" id="evt-refresh">↻</button>
      </div>
      <div id="events-list" class="empty">Загрузка…</div>
    `;
    $('#evt-search').addEventListener('input', e => { state.eventFilter = e.target.value; loadEventsDebounced(); });
    $('#evt-show-resolved').addEventListener('change', e => { state.eventShowResolved = e.target.checked; loadEvents(); });
    $('#evt-refresh').addEventListener('click', loadEvents);
    try {
      state.events = await API.adminListEvents(state.eventFilter || null, state.eventShowResolved);
      renderEvents();
    } catch (e) { err(e); }
  }
  let evtTimer = null;
  function loadEventsDebounced() {
    clearTimeout(evtTimer);
    evtTimer = setTimeout(loadEvents, 300);
  }
  function renderEvents() {
    const root = $('#events-list');
    if (!state.events.length) { root.innerHTML = '<div class="empty">Событий не найдено.</div>'; return; }
    const rows = state.events.map(e => `
      <tr data-id="${e.id}">
        <td>#${e.id}</td>
        <td><span style="font-size:18px">${escapeHtml(e.emoji || '🎯')}</span> ${escapeHtml(e.title)}</td>
        <td><span class="small">${escapeHtml(e.category)} · ${escapeHtml(e.source)}</span></td>
        <td>${escapeHtml(e.author_name || '—')}</td>
        <td>${e.is_live ? '<span class="pill admin">LIVE</span>' : ''} ${e.resolved_outcome_index != null ? '<span class="pill muted">RESOLVED</span>' : ''}</td>
        <td><span class="small">${dt(e.created_at)}</span></td>
        <td>
          <div class="admin-actions">
            <button class="btn-ghost danger" data-act="delete">delete</button>
          </div>
        </td>
      </tr>
    `).join('');
    root.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>ID</th><th>Заголовок</th><th>Кат/источник</th><th>Автор</th><th>Статус</th><th>Создано</th><th>Действия</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    $$('#events-list tbody tr').forEach(tr => {
      const id = Number(tr.dataset.id);
      tr.querySelectorAll('button[data-act]').forEach(b => {
        b.addEventListener('click', async () => {
          if (b.dataset.act === 'delete') {
            if (!confirm('Delete event #' + id + '? Pending bets will be refunded.')) return;
            try {
              await API.adminDeleteEvent(id);
              state.events = state.events.filter(x => x.id !== id);
              renderEvents();
              toast('event deleted', 'ok');
            } catch (e) { err(e); }
          }
        });
      });
    });
  }

  // ----- chat moderation
  async function loadChat() {
    $('#admin-pane').innerHTML = `
      <div class="filter-row admin-search">
        <input type="number" id="chat-event-id" placeholder="event_id (опционально)" value="${escapeHtml(state.chatEventId)}" min="1"/>
        <button class="btn-ghost" id="chat-refresh">↻ Загрузить</button>
      </div>
      <div id="chat-list" class="empty">Загрузка…</div>
    `;
    $('#chat-event-id').addEventListener('change', e => { state.chatEventId = e.target.value; loadChatList(); });
    $('#chat-refresh').addEventListener('click', loadChatList);
    loadChatList();
  }
  async function loadChatList() {
    try {
      const eid = state.chatEventId ? Number(state.chatEventId) : null;
      state.chat = await API.adminListChat(eid, 200);
      renderChat();
    } catch (e) { err(e); }
  }
  function renderChat() {
    const root = $('#chat-list');
    if (!state.chat.length) { root.innerHTML = '<div class="empty">Сообщений нет.</div>'; return; }
    const rows = state.chat.map(m => `
      <tr data-id="${m.id}" class="${m.is_deleted ? 'row-deleted' : ''}">
        <td>#${m.id}</td>
        <td>e#${m.event_id}</td>
        <td>${escapeHtml(m.username)}</td>
        <td>${m.is_deleted ? '<span class="delete-msg">[deleted]</span>' : escapeHtml(m.text)}</td>
        <td><span class="small">${dt(m.created_at)}</span></td>
        <td>
          ${m.is_deleted ? '' : '<button class="btn-ghost danger" data-act="delete">delete</button>'}
        </td>
      </tr>
    `).join('');
    root.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>ID</th><th>Event</th><th>User</th><th>Text</th><th>When</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    $$('#chat-list tbody tr').forEach(tr => {
      const id = Number(tr.dataset.id);
      tr.querySelectorAll('button[data-act]').forEach(b => {
        b.addEventListener('click', async () => {
          if (b.dataset.act === 'delete') {
            try {
              await API.adminDeleteChat(id);
              const m = state.chat.find(x => x.id === id);
              if (m) { m.is_deleted = true; m.text = '[deleted]'; }
              renderChat();
              toast('chat deleted', 'ok');
            } catch (e) { err(e); }
          }
        });
      });
    });
  }

  // ----- audit
  async function loadAudit() {
    $('#admin-pane').innerHTML = `<div id="audit-list" class="empty">Загрузка…</div>`;
    if (!state.me.is_admin) {
      $('#audit-list').innerHTML = '<div class="empty">Audit log виден только админам.</div>';
      return;
    }
    try {
      state.audit = await API.adminAudit(200);
      renderAudit();
    } catch (e) { err(e); }
  }
  function renderAudit() {
    const root = $('#audit-list');
    if (!state.audit.length) { root.innerHTML = '<div class="empty">Audit log пуст.</div>'; return; }
    const rows = state.audit.map(a => `
      <tr>
        <td>#${a.id}</td>
        <td>${escapeHtml(a.actor_username || '?')}</td>
        <td>${escapeHtml(a.action)}</td>
        <td>${a.target_user_id ? `u#${a.target_user_id}` : ''}${a.target_event_id ? ` e#${a.target_event_id}` : ''}${a.target_chat_msg_id ? ` c#${a.target_chat_msg_id}` : ''}</td>
        <td>${escapeHtml(a.note || '')}</td>
        <td><span class="small">${dt(a.created_at)}</span></td>
      </tr>
    `).join('');
    root.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>ID</th><th>Кто</th><th>Действие</th><th>Цель</th><th>Заметка</th><th>Когда</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ----- wire
  document.addEventListener('DOMContentLoaded', async () => {
    showLoader(true);
    const ok = await ensureAuth();
    showLoader(false);
    if (!ok) return;

    $$('.admin-tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
    $('#admin-logout').addEventListener('click', () => {
      API.setToken(null);
      location.href = 'index.html';
    });

    setTab('users');
  });
})();
