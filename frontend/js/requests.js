(async function () {
  try {
    const user = await requireMember();
    const host = document.getElementById('page-content');
    const [career, connection] = await Promise.all([api('/career-requests'), api('/connections/requests')]);
    const existingId = new URLSearchParams(location.search).get('id');
    const targetId = new URLSearchParams(location.search).get('to');
    const studentsCanAsk = user.membershipStatus === 'STUDENT';
    const alumni = studentsCanAsk ? (await api('/alumni?limit=30')).alumni : [];
    const companies = studentsCanAsk ? (await api('/companies')).companies : [];

    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">PRIVATE, PERSON TO PERSON</p><h1>Career requests</h1><p>Ask one alumnus at a time. A referral is a request for consideration, never a promise.</p></div></div>
      ${studentsCanAsk ? `<section class="panel" style="margin-bottom:22px"><h2>Ask an alumnus for help</h2><form id="career-form" class="form-stack"><div class="form-row"><label>Alumnus<select name="recipientId" required><option value="">Choose a person</option>${alumni.map((person) => `<option value="${escapeHtml(person.id)}" ${person.id === targetId ? 'selected' : ''}>${escapeHtml(person.full_name)}${person.company_name ? ` · ${escapeHtml(person.company_name)}` : ''}</option>`).join('')}</select></label><label>Type of help<select name="requestType"><option value="CAREER_GUIDANCE">Career guidance</option><option value="RESUME_REVIEW">Resume review</option><option value="INTERVIEW_PREP">Interview preparation</option><option value="REFERRAL">Referral consideration</option><option value="GENERAL_ADVICE">General professional advice</option></select></label></div><div class="form-row"><label>Subject<input name="subject" required maxlength="160" placeholder="A specific question or role"></label><label>Related company, if relevant<select name="companyId"><option value="">No company selected</option>${companies.map((company) => `<option value="${escapeHtml(company.id)}">${escapeHtml(company.name)}</option>`).join('')}</select></label></div><label>Message<textarea name="message" required minlength="10" maxlength="5000" placeholder="Share context and what kind of guidance would be useful."></textarea></label><div class="form-row"><label>Job or internship link (optional)<input name="jobUrl" type="url" placeholder="https://…"></label><label>Resume attachment (optional PDF, up to 5 MB)<input name="resume" type="file" accept="application/pdf"></label></div><p class="muted">Requests are private to you, the alumnus, and authorized administrators.</p><button class="button button-dark">Send private request <span>→</span></button></form></section>` : '<div class="notice" style="margin-bottom:22px">Career assistance requests can be sent by current students to verified alumni who are open to the selected type of help.</div>'}
      <section class="panel"><div class="subnav"><button class="active" data-tab="career">Career requests (${career.requests.length})</button><button data-tab="connections">Connection requests (${connection.requests.length})</button></div><div id="request-list"></div></section><section id="request-detail" class="panel hidden profile-section"></section>`;

    if (studentsCanAsk) {
      document.getElementById('career-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (data.get('resume')?.size > 5 * 1024 * 1024) { showToast('Resume must be under 5 MB.', true); return; }
        try { await api('/career-requests', { method: 'POST', body: data }); showToast('Private request sent.'); event.currentTarget.reset(); await loadCareer(); }
        catch (error) { showError(error); }
      });
    }
    let activeTab = 'career';
    const list = document.getElementById('request-list');
    document.querySelector('.subnav').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-tab]'); if (!tab) return;
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.subnav button').forEach((item) => item.classList.toggle('active', item === tab));
      if (activeTab === 'career') loadCareer().catch(showError); else renderConnections();
    });

    async function loadCareer() {
      const result = await api('/career-requests');
      list.innerHTML = result.requests.length ? `<div class="list-stack">${result.requests.map((item) => `<article class="list-row"><div><p class="eyebrow">${escapeHtml(item.request_type.toLowerCase().replaceAll('_', ' '))}</p><h3><a href="/requests.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.subject)}</a></h3><p>${item.requester_id === user.id ? `To ${escapeHtml(item.recipient_name)}` : `From ${escapeHtml(item.requester_name)}`} · Updated ${formatDate(item.updated_at)}</p></div><span class="status-pill ${escapeHtml(item.status.toLowerCase())}">${escapeHtml(item.status.toLowerCase().replaceAll('_', ' '))}</span></article>`).join('')}</div>` : '<div class="empty-state"><strong>No career requests yet</strong>Requests you send or receive will appear here.</div>';
    }
    function renderConnections() {
      list.innerHTML = connection.requests.length ? `<div class="list-stack">${connection.requests.map((item) => {
        const incoming = item.recipient_id === user.id;
        const other = incoming ? item.sender_name : item.recipient_name;
        const controls = item.status !== 'PENDING' ? `<span class="status-pill ${escapeHtml(item.status.toLowerCase())}">${escapeHtml(item.status.toLowerCase())}</span>` : incoming ? `<button class="button button-dark button-small" data-connect-action="ACCEPTED" data-id="${escapeHtml(item.id)}">Accept</button><button class="button button-light button-small" data-connect-action="DECLINED" data-id="${escapeHtml(item.id)}">Decline</button>` : `<button class="button button-light button-small" data-connect-action="CANCELLED" data-id="${escapeHtml(item.id)}">Cancel</button>`;
        return `<article class="list-row"><div><h3>${incoming ? 'From' : 'To'} ${escapeHtml(other)}</h3><p>Sent ${formatDate(item.created_at)} · ${incoming ? 'Received request' : 'Sent request'}</p></div><div class="row-actions">${controls}</div></article>`;
      }).join('')}</div>` : '<div class="empty-state"><strong>No pending connection requests</strong>Send a request from an alumnus profile to start a connection.</div>';
    }
    list.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-connect-action]'); if (!button) return;
      try { await api(`/connections/requests/${encodeURIComponent(button.dataset.id)}`, { method: 'PUT', body: { action: button.dataset.connectAction } }); showToast('Connection request updated.'); location.reload(); }
      catch (error) { showError(error); }
    });

    if (existingId) await renderDetail(existingId);
    else await loadCareer();

    async function renderDetail(id) {
      const result = await api(`/career-requests/${encodeURIComponent(id)}`);
      const item = result.request;
      const detail = document.getElementById('request-detail'); detail.classList.remove('hidden');
      const recipient = item.recipient_id === user.id;
      const actions = recipient ? ({
        PENDING: ['ACCEPTED', 'DECLINED', 'NEEDS_INFORMATION'],
        ACCEPTED: ['IN_PROGRESS', 'COMPLETED'],
        NEEDS_INFORMATION: ['ACCEPTED', 'DECLINED', 'COMPLETED'],
        IN_PROGRESS: ['NEEDS_INFORMATION', 'REFERRED', 'COMPLETED']
      }[item.status] || []) : (item.status === 'PENDING' ? ['CANCELLED'] : []);
      detail.innerHTML = `<div class="section-head"><div><p class="eyebrow">${escapeHtml(item.request_type.toLowerCase().replaceAll('_', ' '))}</p><h2>${escapeHtml(item.subject)}</h2><p class="muted">From ${escapeHtml(item.requester_name)} to ${escapeHtml(item.recipient_name)} · <span class="status-pill ${escapeHtml(item.status.toLowerCase())}">${escapeHtml(item.status.toLowerCase().replaceAll('_', ' '))}</span></p>${item.has_resume ? `<a href="/api/career-requests/${encodeURIComponent(item.id)}/resume">Download attached resume ↓</a>` : ""}</div><button class="button button-light button-small" id="close-detail">Close</button></div><div class="conversation">${result.messages.map((message) => `<div class="message ${message.sender_id === user.id ? 'mine' : ''}"><strong>${escapeHtml(message.sender_name)}</strong><p>${escapeHtml(message.message)}</p><small>${formatDate(message.created_at)}</small></div>`).join('')}</div>${actions.length ? `<div class="row-actions" style="margin:16px 0">${actions.map((status) => `<button class="button ${status === 'DECLINED' || status === 'CANCELLED' ? 'button-light' : 'button-dark'} button-small" data-career-status="${status}">${status.toLowerCase().replaceAll('_', ' ')}</button>`).join('')}</div>` : ''}${!['COMPLETED', 'CANCELLED', 'DECLINED'].includes(item.status) ? `<form id="reply-form" class="form-row" style="margin-top:15px"><label>Reply<textarea name="message" required maxlength="5000"></textarea></label><div style="align-self:end"><button class="button button-dark">Send reply</button></div></form>` : ''}<p class="notice" style="margin-top:16px">A referral request is not a guarantee of a referral, interview, or job.</p>`;
      document.getElementById('close-detail').addEventListener('click', () => { detail.classList.add('hidden'); history.replaceState({}, '', '/requests.html'); });
      detail.querySelectorAll('[data-career-status]').forEach((button) => button.addEventListener('click', async () => {
        try { await api(`/career-requests/${encodeURIComponent(id)}/status`, { method: 'PUT', body: { status: button.dataset.careerStatus } }); showToast('Request updated.'); await renderDetail(id); await loadCareer(); }
        catch (error) { showError(error); }
      }));
      detail.querySelector('#reply-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        try { await api(`/career-requests/${encodeURIComponent(id)}/messages`, { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) }); await renderDetail(id); await loadCareer(); }
        catch (error) { showError(error); }
      });
    }
  } catch (error) { showError(error); }

  function showError(error) { if (error.message) showToast(error.message, true); }
})();
