(async function () {
  try {
    await requireAdmin();
    const host = document.getElementById('page-content');
    const [stats, verifications, suggestions, companyData, opportunities] = await Promise.all([
      api('/admin/dashboard'), api('/admin/verifications'), api('/admin/company-suggestions'), api('/admin/companies'), api('/admin/opportunities')
    ]);
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">UNIVERSITY OPERATIONS</p><h1>Administration</h1><p>Manage membership, verification, companies, and shared opportunities.</p></div></div>
      <div class="stat-grid">${Object.entries({ 'Total users': stats.statistics.total_users, Students: stats.statistics.students, Alumni: stats.statistics.alumni, 'Pending verification': stats.statistics.pending_verifications, Companies: stats.statistics.companies, 'Career requests': stats.statistics.career_requests, Mentorship: stats.statistics.mentorship_requests, Opportunities: stats.statistics.opportunities }).map(([label, value]) => `<div class="stat-card"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('')}</div>
      <section class="panel admin-section"><div class="section-head"><div><p class="eyebrow">MEMBERSHIP LIFECYCLE</p><h2>Find a user</h2></div></div><form id="user-search" class="filter-bar"><input name="search" placeholder="Name or email"><button class="button button-dark">Search users</button></form><div id="user-results"></div></section>
      <section class="panel admin-section"><div class="section-head"><div><p class="eyebrow">UNIVERSITY AFFILIATION</p><h2>Pending verifications</h2></div><span class="status-pill pending">${verifications.verifications.length} pending</span></div><div class="list-stack">${verifications.verifications.length ? verifications.verifications.map((item) => `<article class="list-row"><div><h3>${escapeHtml(item.full_name)} · ${escapeHtml(item.membership_status || 'Member')}</h3><p>${escapeHtml(item.email)} · ${escapeHtml(item.course || '')} · Submitted ${formatDate(item.created_at)}</p><p>${escapeHtml(item.evidence_note)}</p></div><div class="row-actions"><button class="button button-dark button-small" data-verification="APPROVED" data-id="${escapeHtml(item.id)}">Approve</button><button class="button button-light button-small" data-verification="REJECTED" data-id="${escapeHtml(item.id)}">Reject</button></div></article>`).join('') : '<div class="empty-state">No affiliation reviews are waiting.</div>'}</div></section>
      <section class="panel admin-section"><div class="section-head"><div><p class="eyebrow">CANONICAL DIRECTORY</p><h2>Company suggestions</h2></div></div><div class="list-stack">${suggestions.suggestions.length ? suggestions.suggestions.map((item) => `<article class="list-row"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.industry || 'Industry not specified')} · Suggested by ${escapeHtml(item.submitted_by_name)}</p></div><div class="row-actions"><button class="button button-dark button-small" data-suggestion="APPROVED" data-id="${escapeHtml(item.id)}">Approve</button><button class="button button-light button-small" data-suggestion="REJECTED" data-id="${escapeHtml(item.id)}">Reject</button></div></article>`).join('') : '<div class="empty-state">No company suggestions waiting for review.</div>'}</div></section>
      <section class="panel admin-section"><div class="section-head"><div><p class="eyebrow">DIRECTORY QUALITY</p><h2>Companies</h2></div></div><div class="list-stack">${companyData.companies.slice(0, 30).map((company) => `<form class="company-edit list-row" data-id="${escapeHtml(company.id)}"><label>Company name<input name="name" value="${escapeHtml(company.name)}" required></label><label>Industry<input name="industry" value="${escapeHtml(company.industry || '')}"></label><label>Website<input name="websiteUrl" value="${escapeHtml(company.website_url || '')}" placeholder="https://…"></label><label>Location<input name="location" value="${escapeHtml(company.location || '')}"></label><label>Size<input name="size" value="${escapeHtml(company.size || '')}"></label><button class="button button-light button-small">Save company</button></form>`).join('') || '<div class="empty-state">No companies in the directory yet.</div>'}</div></section>
      <section class="panel admin-section"><div class="section-head"><div><p class="eyebrow">COMMUNITY CONTENT</p><h2>Recent opportunities</h2></div></div><div class="list-stack">${opportunities.opportunities.slice(0, 30).map((item) => `<article class="list-row"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.company_name || 'Community')} · ${escapeHtml(item.publisher_name)} · ${escapeHtml(item.status.toLowerCase())}</p></div><div class="row-actions"><button class="button button-light button-small" data-moderate="CLOSED" data-id="${escapeHtml(item.id)}">Close</button><button class="button button-danger button-small" data-moderate="REMOVED" data-id="${escapeHtml(item.id)}">Remove</button></div></article>`).join('') || '<div class="empty-state">No opportunities posted yet.</div>'}</div></section>`;

    const userForm = document.getElementById('user-search');
    async function searchUsers() {
      const params = new URLSearchParams(Object.fromEntries(new FormData(userForm)));
      const { users } = await api(`/admin/users?${params}`);
      const result = document.getElementById('user-results');
      result.innerHTML = users.length ? `<div class="list-stack">${users.map((person) => `<article class="list-row"><div style="min-width:220px"><h3>${escapeHtml(person.full_name)}</h3><p>${escapeHtml(person.email)}</p><p>${escapeHtml(person.membership_status || 'Admin')} · ${escapeHtml(person.course || '')} · ${escapeHtml(person.account_status.toLowerCase())}</p></div>${person.membership_status ? `<form class="membership-form form-row" data-id="${escapeHtml(person.id)}"><label>Status<select name="membershipStatus"><option value="STUDENT" ${person.membership_status === 'STUDENT' ? 'selected' : ''}>Student</option><option value="ALUMNI" ${person.membership_status === 'ALUMNI' ? 'selected' : ''}>Alumni</option></select></label><label>Graduation year<input name="graduationYear" type="number" min="1950" max="2200" value="${person.graduation_year || person.expected_graduation_year || new Date().getFullYear()}" required></label><label>Reason<input name="reason" required minlength="5" placeholder="Official roster confirmed"></label><button class="button button-light button-small">Update membership</button></form>` : ''}<div class="row-actions"><button class="button button-small ${person.account_status === 'ACTIVE' ? 'button-light' : 'button-dark'}" data-account="${person.account_status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}" data-id="${escapeHtml(person.id)}">${person.account_status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button></div></article>`).join('')}</div>` : '<div class="empty-state">No users match your search.</div>';
    }
    userForm.addEventListener('submit', (event) => { event.preventDefault(); searchUsers().catch(showError); });
    await searchUsers();

    host.addEventListener('submit', async (event) => {
      const form = event.target.closest('.membership-form');
      if (form) {
        event.preventDefault();
        try { await api(`/admin/users/${encodeURIComponent(form.dataset.id)}/status`, { method: 'PUT', body: Object.fromEntries(new FormData(form)) }); showToast('Membership updated. Existing account history remains intact.'); await searchUsers(); }
        catch (error) { showError(error); }
      }
      const companyForm = event.target.closest('.company-edit');
      if (companyForm) {
        event.preventDefault();
        try { await api(`/admin/companies/${encodeURIComponent(companyForm.dataset.id)}`, { method: 'PUT', body: Object.fromEntries(new FormData(companyForm)) }); showToast('Company updated.'); }
        catch (error) { showError(error); }
      }
    });
    host.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-id]'); if (!button) return;
      try {
        if (button.dataset.verification) {
          const reason = button.dataset.verification === 'REJECTED' ? (prompt('Why is the evidence being rejected?') || '') : 'University affiliation confirmed';
          if (button.dataset.verification === 'REJECTED' && !reason) return;
          await api(`/admin/verifications/${encodeURIComponent(button.dataset.id)}`, { method: 'PUT', body: { status: button.dataset.verification, reason } });
          showToast('Verification reviewed.'); location.reload();
        }
        if (button.dataset.suggestion) {
          const reason = button.dataset.suggestion === 'REJECTED' ? (prompt('Reason for rejecting this company?') || '') : 'Company approved';
          if (button.dataset.suggestion === 'REJECTED' && !reason) return;
          await api(`/admin/company-suggestions/${encodeURIComponent(button.dataset.id)}`, { method: 'PUT', body: { status: button.dataset.suggestion, reason } });
          showToast('Company suggestion reviewed.'); location.reload();
        }
        if (button.dataset.moderate) {
          const reason = prompt('Record a moderation reason:'); if (!reason) return;
          await api(`/admin/opportunities/${encodeURIComponent(button.dataset.id)}/moderate`, { method: 'PUT', body: { status: button.dataset.moderate, reason } });
          showToast('Opportunity moderation recorded.'); location.reload();
        }
        if (button.dataset.account) {
          const reason = prompt('Record a reason for this account change:'); if (!reason) return;
          await api(`/admin/users/${encodeURIComponent(button.dataset.id)}/account`, { method: 'PUT', body: { accountStatus: button.dataset.account, reason } });
          showToast('Account status changed.'); await searchUsers();
        }
      } catch (error) { showError(error); }
    });
  } catch (error) { showError(error); }
  function showError(error) { if (error.message) showToast(error.message, true); }
})();
