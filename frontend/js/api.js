(function () {
  let csrfToken = '';
  let currentUser = null;

  async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    let body = options.body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/auth/csrf' && !csrfToken) {
      const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
      if (tokenResponse.ok) csrfToken = (await tokenResponse.json()).csrfToken;
    }
    if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Token', csrfToken);
    const response = await fetch(`/api${path}`, { ...options, method, headers, body, credentials: 'same-origin' });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && document.body.dataset.page !== 'login' && document.body.dataset.page !== 'register') {
        window.location.href = '/login.html';
      }
      throw new Error(data.error || `Request failed (${response.status}).`);
    }
    if (data.csrfToken) csrfToken = data.csrfToken;
    return data;
  }

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  }

  function avatar(userId, name, imagePath) {
    return imagePath
      ? `<img class="avatar" src="/api/users/${encodeURIComponent(userId)}/picture" alt="" loading="lazy">`
      : `<span class="avatar" aria-hidden="true">${escape(initials(name))}</span>`;
  }

  function toast(message, isError = false) {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('aria-live', 'polite');
      document.body.append(region);
    }
    const item = document.createElement('div');
    item.className = `toast${isError ? ' error' : ''}`;
    item.textContent = message;
    region.append(item);
    window.setTimeout(() => item.remove(), 3800);
  }

  function date(value) {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  async function signedInUser() {
    if (currentUser) return currentUser;
    const result = await request('/auth/me');
    currentUser = result.user;
    return currentUser;
  }

  async function requireMember() {
    try {
      const user = await signedInUser();
      mountShell(user);
      return user;
    } catch (error) {
      window.location.href = '/login.html';
      throw error;
    }
  }

  async function requireAdmin() {
    const user = await requireMember();
    if (!user.isAdmin) {
      window.location.href = '/dashboard.html';
      throw new Error('Administrator access required.');
    }
    return user;
  }

  function mountShell(user) {
    const host = document.getElementById('site-header');
    if (!host) return;
    const page = document.body.dataset.page;
    const links = [
      ['dashboard', '/dashboard.html', 'Home'],
      ['alumni', '/alumni.html', 'Alumni'],
      ['companies', '/companies.html', 'Companies'],
      ['opportunities', '/opportunities.html', 'Opportunities'],
      ['requests', '/requests.html', 'Requests'],
      ['mentorship', '/mentorship.html', 'Mentorship'],
      ['notifications', '/notifications.html', 'Updates'],
      ...(user.membershipStatus ? [['profile', '/profile.html', 'My profile']] : [])
    ];
    if (user.isAdmin) links.push(['admin', '/admin.html', 'Admin']);
    host.innerHTML = `<header class="site-header"><div class="header-inner"><a class="brand" href="/dashboard.html"><span class="brand-mark">R</span><span>Rishihood<span class="brand-sub">ALUMNI NETWORK</span></span></a><nav class="header-nav" aria-label="Main navigation">${links.map(([key, href, label]) => `<a class="${page === key ? 'active' : ''}" href="${href}">${label}</a>`).join('')}</nav><div class="header-actions"><span class="user-chip">${escape(user.fullName.split(' ')[0])}</span><button class="button button-light button-small" id="logout-button">Sign out</button></div></div></header>`;
    document.getElementById('logout-button').addEventListener('click', async () => {
      try { await request('/auth/logout', { method: 'POST' }); window.location.href = '/'; }
      catch (error) { toast(error.message, true); }
    });
    request('/notifications').then(({ unreadCount }) => {
      const updatesLink = host.querySelector('.header-nav a[href="/notifications.html"]');
      if (updatesLink && unreadCount > 0) updatesLink.innerHTML = `Updates <span class="unread-dot" aria-label="${unreadCount} unread"></span>`;
    }).catch(() => {});
  }

  window.api = request;
  window.escapeHtml = escape;
  window.avatarHtml = avatar;
  window.showToast = toast;
  window.formatDate = date;
  window.requireMember = requireMember;
  window.requireAdmin = requireAdmin;
  window.signedInUser = signedInUser;
})();
