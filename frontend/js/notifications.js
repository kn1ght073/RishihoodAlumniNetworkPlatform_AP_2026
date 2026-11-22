(async function () {
  try {
    await requireMember();
    const host = document.getElementById('page-content');
    async function load() {
      const { notifications, unreadCount } = await api('/notifications');
      host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">YOUR COMMUNITY, IN THE LOOP</p><h1>Notifications</h1><p>${unreadCount} unread update${unreadCount === 1 ? '' : 's'}.</p></div>${unreadCount ? '<button id="read-all" class="button button-light">Mark all as read</button>' : ''}</div>${notifications.length ? `<div class="list-stack">${notifications.map((item) => `<article class="list-row"><div><p class="eyebrow">${escapeHtml(item.notification_type.toLowerCase().replaceAll('_', ' '))} · ${formatDate(item.created_at)}</p><h3>${escapeHtml(item.title)} ${!item.read_at ? '<span class="unread-dot"></span>' : ''}</h3><p>${escapeHtml(item.body)}</p>${item.reference_id ? `<a href="${notificationLink(item)}">Open update →</a>` : ''}</div>${!item.read_at ? `<button class="button button-light button-small" data-read="${escapeHtml(item.id)}">Mark read</button>` : ''}</article>`).join('')}</div>` : '<div class="empty-state"><strong>You’re all caught up</strong>New requests, replies, and updates will appear here.</div>'}`;
      document.getElementById('read-all')?.addEventListener('click', async () => { try { await api('/notifications/read-all', { method: 'PUT' }); await load(); } catch (error) { showError(error); } });
      host.querySelectorAll('[data-read]').forEach((button) => button.addEventListener('click', async () => { try { await api(`/notifications/${encodeURIComponent(button.dataset.read)}/read`, { method: 'PUT' }); await load(); } catch (error) { showError(error); } }));
    }
    await load();
  } catch (error) { showError(error); }
  function notificationLink(item) {
    if (item.notification_type.startsWith('CAREER')) return `/requests.html?id=${encodeURIComponent(item.reference_id)}`;
    if (item.notification_type.startsWith('MENTORSHIP')) return '/mentorship.html';
    if (item.notification_type.startsWith('CONNECTION')) return '/requests.html';
    return '/notifications.html';
  }
  function showError(error) { if (error.message) showToast(error.message, true); }
})();
