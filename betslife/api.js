/* BetLife API client. Wraps fetch() against the backend, manages JWT token. */
(function () {
  'use strict';

  const BACKEND = (function () {
    const fromQuery = new URLSearchParams(location.search).get('api');
    if (fromQuery) return fromQuery.replace(/\/+$/, '');
    const fromStorage = localStorage.getItem('betslife.apiBase');
    if (fromStorage) return fromStorage.replace(/\/+$/, '');
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }
    // WorldPari domains and any host that proxies /api/* to the backend (Caddy / nginx).
    const host = location.hostname;
    if (host === 'worldpari.ru' || host === 'www.worldpari.ru' ||
        host === 'worldpari.com' || host === 'www.worldpari.com' ||
        host === '111.88.149.53') {
      return ''; // same-origin — Caddy routes /api/* to backend container
    }
    return 'https://betslife-backend-attcywev.fly.dev';
  })();

  const TOKEN_KEY = 'betslife.token';

  function getToken() { return localStorage.getItem(TOKEN_KEY) || null; }
  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    let res;
    try {
      res = await fetch(BACKEND + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      const err = new Error('network');
      err.network = true;
      throw err;
    }
    if (res.status === 401) {
      setToken(null);
    }
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { data = null; }
    } else {
      try { data = await res.text(); } catch { data = null; }
    }
    if (!res.ok) {
      const err = new Error((data && data.detail) || res.statusText || 'error');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function upload(path, file, fieldName = 'file') {
    const headers = {};
    const t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const fd = new FormData();
    fd.append(fieldName, file);
    let res;
    try {
      res = await fetch(BACKEND + path, { method: 'POST', headers, body: fd });
    } catch (e) {
      const err = new Error('network');
      err.network = true;
      throw err;
    }
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { data = null; }
    } else {
      try { data = await res.text(); } catch { data = null; }
    }
    if (!res.ok) {
      const err = new Error((data && data.detail) || res.statusText || 'error');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function wsUrl(eventId) {
    let wsBase;
    if (BACKEND) {
      wsBase = BACKEND.replace(/^http/i, 'ws');
    } else {
      // Same-origin via Caddy
      wsBase = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    }
    return `${wsBase}/api/chat/ws/${eventId}`;
  }

  function mediaUrl(relPath) {
    if (!relPath) return null;
    if (/^https?:\/\//i.test(relPath)) return relPath;
    return BACKEND + relPath;
  }

  window.API = {
    base: BACKEND,
    setBase: (url) => { localStorage.setItem('betslife.apiBase', url); location.reload(); },
    getToken,
    setToken,
    isAuthed: () => !!getToken(),
    mediaUrl,

    // auth
    captcha: () => req('GET', '/api/auth/captcha'),
    register: (b) => req('POST', '/api/auth/register', b),
    login: (b) => req('POST', '/api/auth/login', b),
    me: () => req('GET', '/api/auth/me'),
    updateProfile: (b) => req('PATCH', '/api/auth/me', b),
    changePassword: (b) => req('POST', '/api/auth/change-password', b),
    recoveryCheck: (b) => req('POST', '/api/auth/recovery/check', b),
    recoveryConfirm: (b) => req('POST', '/api/auth/recovery/confirm', b),

    // uploads
    uploadAvatar: (file) => upload('/api/uploads/avatar', file),
    deleteAvatar: () => req('DELETE', '/api/uploads/avatar'),
    uploadStream: (file) => upload('/api/uploads/stream', file),

    // events
    listEvents: ({ category = null, q = null, showResolved = false } = {}) => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (q) params.set('q', q);
      if (showResolved) params.set('show_resolved', '1');
      const qs = params.toString();
      return req('GET', '/api/events' + (qs ? '?' + qs : ''));
    },
    getEvent: (id) => req('GET', `/api/events/${id}`),
    createEvent: (b) => req('POST', '/api/events', b),
    deleteEvent: (id) => req('DELETE', `/api/events/${id}`),

    // bets
    placeBet: (b) => req('POST', '/api/bets', b),
    listBets: (status = null) => {
      const qs = status ? '?status=' + status : '';
      return req('GET', '/api/bets' + qs);
    },

    // payments
    topup: (amount) => req('POST', '/api/payments/topup', { amount }),
    withdraw: (amount) => req('POST', '/api/payments/withdraw', { amount }),
    transactions: () => req('GET', '/api/payments/transactions'),

    // streams
    listStreams: () => req('GET', '/api/streams'),
    getStream: (eventId) => req('GET', `/api/streams/${eventId}`),
    startStream: (eventId, payload) => {
      const body = (typeof payload === 'string' || payload === null || payload === undefined)
        ? { url: payload || null }
        : payload;
      return req('POST', `/api/streams/${eventId}/start`, body);
    },
    stopStream: (eventId) => req('POST', `/api/streams/${eventId}/stop`),

    // chat
    chatHistory: (eventId) => req('GET', `/api/chat/${eventId}`),
    chatPost: (eventId, text) => req('POST', `/api/chat/${eventId}`, { text }),
    wsUrl,

    // admin
    adminListUsers: (q = null) => {
      const qs = q ? '?q=' + encodeURIComponent(q) : '';
      return req('GET', '/api/admin/users' + qs);
    },
    adminBan: (userId, banned, reason = null) =>
      req('POST', `/api/admin/users/${userId}/ban`, { banned, reason }),
    adminMute: (userId, minutes) =>
      req('POST', `/api/admin/users/${userId}/mute`, { minutes }),
    adminSetRole: (userId, body) =>
      req('POST', `/api/admin/users/${userId}/role`, body),
    adminSetBalance: (userId, balance, note = null) =>
      req('POST', `/api/admin/users/${userId}/balance`, { balance, note }),
    adminDeleteUser: (userId) => req('DELETE', `/api/admin/users/${userId}`),
    adminListEvents: (q = null, showResolved = true) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('show_resolved', showResolved ? '1' : '0');
      return req('GET', '/api/admin/events?' + params.toString());
    },
    adminDeleteEvent: (id) => req('DELETE', `/api/admin/events/${id}`),
    // social
    leaderboard: (period = 'all', limit = 20) =>
      req('GET', `/api/social/leaderboard?period=${encodeURIComponent(period)}&limit=${limit}`),
    publicProfile: (username) =>
      req('GET', `/api/social/profile/${encodeURIComponent(username)}`),
    bonusStatus: () => req('GET', '/api/social/bonus/status'),
    bonusClaim: () => req('POST', '/api/social/bonus/claim'),

    adminListChat: (eventId = null, limit = 200) => {
      const params = new URLSearchParams();
      if (eventId !== null && eventId !== undefined && eventId !== '')
        params.set('event_id', String(eventId));
      params.set('limit', String(limit));
      return req('GET', '/api/admin/chat?' + params.toString());
    },
    adminDeleteChat: (msgId) => req('DELETE', `/api/admin/chat/${msgId}`),
    adminAudit: (limit = 200) => req('GET', `/api/admin/audit?limit=${limit}`),
  };
})();
