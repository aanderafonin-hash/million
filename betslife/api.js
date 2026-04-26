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
      // expired token; clear it and let caller decide what to do
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

  function wsUrl(eventId) {
    const wsBase = BACKEND.replace(/^http/i, 'ws');
    return `${wsBase}/api/chat/ws/${eventId}`;
  }

  window.API = {
    base: BACKEND,
    setBase: (url) => { localStorage.setItem('betslife.apiBase', url); location.reload(); },
    getToken,
    setToken,
    isAuthed: () => !!getToken(),

    // auth
    register: (b) => req('POST', '/api/auth/register', b),
    login: (b) => req('POST', '/api/auth/login', b),
    me: () => req('GET', '/api/auth/me'),
    updateProfile: (b) => req('PATCH', '/api/auth/me', b),
    changePassword: (b) => req('POST', '/api/auth/change-password', b),
    recoveryCheck: (b) => req('POST', '/api/auth/recovery/check', b),
    recoveryConfirm: (b) => req('POST', '/api/auth/recovery/confirm', b),

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
    startStream: (eventId, url) => req('POST', `/api/streams/${eventId}/start`, { url: url || null }),
    stopStream: (eventId) => req('POST', `/api/streams/${eventId}/stop`),

    // chat
    chatHistory: (eventId) => req('GET', `/api/chat/${eventId}`),
    chatPost: (eventId, text) => req('POST', `/api/chat/${eventId}`, { text }),
    wsUrl,
  };
})();
