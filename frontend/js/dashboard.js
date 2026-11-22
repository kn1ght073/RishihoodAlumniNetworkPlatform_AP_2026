(async function () {
  try {
    const user = await requireMember();
    const host = document.getElementById('page-content');
    const isAdmin = user.isAdmin;
    if (!isAdmin && user.verificationStatus !== 'VERIFIED') {
      host.innerHTML = `<section class="welcome-band"><div><p class="eyebrow">WELCOME TO THE COMMUNITY</p><h1>Your Rishihood story starts here.</h1><p>Complete your profile and submit affiliation details so an administrator can verify your membership.</p></div><a class="button button-gold" href="/profile.html">Complete profile <span>→</span></a></section><div class="panel"><p class="eyebrow">WHAT HAPPENS NEXT</p><h2>One account, every university chapter.</h2><p class="muted">Once verified, you can search the alumni directory, connect with members, and use career and mentorship requests. If you register as an alumnus, an administrator reviews your alumni status before your profile appears in search.</p></div>`;
      return;
    }
    const [opportunities, requests, mentorship, notifications] = await Promise.all([
      api('/opportunities'), api('/career-requests'), api('/mentorship'), api('/notifications')
    ]);
    let statistics = null;
    if (isAdmin) statistics = (await api('/admin/dashboard')).statistics;
    const openRequests = requests.requests.filter((item) => ['PENDING', 'ACCEPTED', 'NEEDS_INFORMATION', 'IN_PROGRESS'].includes(item.status));
    const openMentorship = mentorship.requests.filter((item) => ['PENDING', 'ACCEPTED'].includes(item.status));
    host.innerHTML = `
      <section class="welcome-band"><div><p class="eyebrow">${escapeHtml(user.membershipStatus || 'ADMIN')} · RISHIHOOD COMMUNITY</p><h1>Good to see you, ${escapeHtml(user.fullName.split(' ')[0])}.</h1><p>Your next connection can start with a question.</p></div><a class="button button-gold" href="/alumni.html">Find alumni <span>↗</span></a></section>
      ${user.membershipStatus && user.verificationStatus !== 'VERIFIED' && !user.isAdmin ? `<div class="notice" style="margin-bottom:20px">Your university affiliation is ${escapeHtml(user.verificationStatus.toLowerCase())}. You can complete your profile now; verified alumni appear in the directory after admin review. <a href="/profile.html">Review your profile →</a></div>` : ''}
      ${statistics ? `<div class="stat-grid">${Object.entries({ 'Community members': statistics.total_users, Students: statistics.students, Alumni: statistics.alumni, 'Pending verifications': statistics.pending_verifications }).map(([label, value]) => `<div class="stat-card"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div>` : ''}
      <div class="dashboard-grid" style="margin-top:20px"><section class="dashboard-column">
        <div class="panel"><div class="section-head"><h2>Make a move</h2><span class="eyebrow">YOUR NETWORK</span></div><div class="dashboard-links">
          <a class="dashboard-link" href="/alumni.html"><span>01</span>Discover alumni <span>↗</span></a><a class="dashboard-link" href="/companies.html"><span>02</span>Explore companies <span>↗</span></a>
          <a class="dashboard-link" href="/opportunities.html"><span>03</span>Find opportunities <span>↗</span></a><a class="dashboard-link" href="/mentorship.html"><span>04</span>Find a mentor <span>↗</span></a>
        </div></div>
        <div class="panel"><div class="section-head"><h2>Recent opportunities</h2><a href="/opportunities.html">See all →</a></div>
          ${opportunities.opportunities.length ? opportunities.opportunities.slice(0, 4).map((item) => `<div class="opportunity-card"><div><h3><a href="/opportunity-details.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.company_name || item.job_type)} · ${escapeHtml(item.location || item.work_mode.toLowerCase())} · ${escapeHtml(item.publisher_name)}</p></div><span class="status-pill">${escapeHtml(item.job_type.toLowerCase().replaceAll('_', ' '))}</span></div>`).join('') : '<div class="empty-state"><strong>No opportunities yet</strong>Check back soon or ask an alumnus to share one.</div>'}
        </div>
      </section><aside class="dashboard-column">
        <div class="panel"><div class="section-head"><h2>Your requests</h2><a href="/requests.html">Open inbox →</a></div>
          ${openRequests.length ? openRequests.slice(0, 3).map((item) => `<div class="request-card"><h3>${escapeHtml(item.subject)}</h3><p>${escapeHtml(item.request_type.toLowerCase().replaceAll('_', ' '))} · ${escapeHtml(item.recipient_id === user.id ? item.requester_name : item.recipient_name)}</p><span class="status-pill ${escapeHtml(item.status.toLowerCase())}">${escapeHtml(item.status.toLowerCase().replaceAll('_', ' '))}</span></div>`).join('') : '<div class="empty-state"><strong>Clear for now</strong>Your active career requests will appear here.</div>'}
        </div>
        <div class="panel"><div class="section-head"><h2>Mentorship</h2><a href="/mentorship.html">View all →</a></div>
          ${openMentorship.length ? openMentorship.slice(0, 3).map((item) => `<div class="request-card"><h3>${escapeHtml(item.student_id === user.id ? item.alumnus_name : item.student_name)}</h3><p>${escapeHtml(item.goals.slice(0, 100))}</p><span class="status-pill ${escapeHtml(item.status.toLowerCase())}">${escapeHtml(item.status.toLowerCase())}</span></div>`).join('') : '<div class="empty-state"><strong>Good conversations start here</strong>Meet an alumnus who is open to mentoring.</div>'}
        </div>
        <div class="panel"><div class="section-head"><h2>Latest update</h2><a href="/notifications.html">All updates →</a></div>${notifications.notifications[0] ? `<p><strong>${escapeHtml(notifications.notifications[0].title)}</strong></p><p class="muted">${escapeHtml(notifications.notifications[0].body)}</p>` : '<p class="muted">You are all caught up.</p>'}</div>
      </aside></div>`;
  } catch (error) {
    if (error.message) showToast(error.message, true);
  }
})();
