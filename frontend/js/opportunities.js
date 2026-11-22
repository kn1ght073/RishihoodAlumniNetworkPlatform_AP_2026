(async function () {
  const page = document.body.dataset.page;
  try {
    const user = await requireMember();
    const host = document.getElementById('page-content');
    if (page === 'opportunity-details') return await showDetails(host, user);
    const isAlumni = user.membershipStatus === 'ALUMNI';
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">SHARED BY THE COMMUNITY</p><h1>Opportunities</h1><p>Roles and internships passed along by Rishihood alumni.</p></div>${isAlumni ? '<button class="button button-dark" id="toggle-create">Post an opportunity <span>＋</span></button>' : ''}</div>
      ${isAlumni ? `<section class="panel hidden" id="create-panel" style="margin-bottom:22px"><h2>Share an opportunity</h2><form id="create-opportunity" class="form-stack"><div class="form-row"><label>Title<input name="title" required maxlength="180"></label><label>Company<select name="companyId" id="opportunity-company"><option value="">Choose a company</option></select></label></div><div class="form-row"><label>Opportunity type<select name="jobType"><option value="JOB">Job</option><option value="INTERNSHIP">Internship</option><option value="HIRING_ANNOUNCEMENT">Hiring announcement</option></select></label><label>Work arrangement<select name="workMode"><option value="ONSITE">On-site</option><option value="HYBRID">Hybrid</option><option value="REMOTE">Remote</option></select></label></div><div class="form-row"><label>Location<input name="location" maxlength="120"></label><label>Application link<input name="applicationUrl" type="url" placeholder="https://…"></label></div><label>Description<textarea name="description" required minlength="10" maxlength="5000"></textarea></label><div class="form-row"><label>Eligibility<input name="eligibility" maxlength="500"></label><label>Deadline<input name="deadline" type="date"></label></div><button class="button button-gold">Publish opportunity</button></form></section>` : ''}
      <form id="opportunity-filter" class="filter-bar"><input name="search" placeholder="Search roles and companies"><select name="jobType"><option value="">All opportunity types</option><option value="JOB">Jobs</option><option value="INTERNSHIP">Internships</option><option value="HIRING_ANNOUNCEMENT">Hiring announcements</option></select><select name="workMode"><option value="">Any work arrangement</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option><option value="ONSITE">On-site</option></select><input name="location" placeholder="Location"><button class="button button-dark">Filter</button></form><div id="opportunity-results" class="list-stack"></div>`;
    if (isAlumni) {
      document.getElementById('toggle-create').addEventListener('click', () => document.getElementById('create-panel').classList.toggle('hidden'));
      const { companies } = await api('/companies');
      document.getElementById('opportunity-company').innerHTML += companies.map((company) => `<option value="${escapeHtml(company.id)}">${escapeHtml(company.name)}</option>`).join('');
      document.getElementById('create-opportunity').addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        data.companyId = data.companyId || null;
        data.deadline = data.deadline || null;
        try { await api('/opportunities', { method: 'POST', body: data }); event.currentTarget.reset(); document.getElementById('create-panel').classList.add('hidden'); showToast('Opportunity published.'); await load(); }
        catch (error) { showError(error); }
      });
    }
    const filter = document.getElementById('opportunity-filter');
    async function load() {
      const params = new URLSearchParams(Object.fromEntries(new FormData(filter)));
      const { opportunities } = await api(`/opportunities?${params}`);
      document.getElementById('opportunity-results').innerHTML = opportunities.length ? opportunities.map((item) => opportunityRow(item, user)).join('') : '<div class="empty-state"><strong>No opportunities match those filters</strong>Try a different search, or check back later.</div>';
    }
    filter.addEventListener('submit', (event) => { event.preventDefault(); load().catch(showError); });
    document.getElementById('opportunity-results').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      try {
        if (button.dataset.action === 'save') {
          const result = await api(`/opportunities/${encodeURIComponent(button.dataset.id)}/save`, { method: 'POST' });
          button.textContent = result.saved ? 'Saved' : 'Save';
          button.classList.toggle('button-dark', result.saved);
        }
        if (button.dataset.action === 'remove') {
          if (!confirm('Remove this opportunity from the directory?')) return;
          await api(`/opportunities/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
          showToast('Opportunity removed.'); await load();
        }
      } catch (error) { showError(error); }
    });
    await load();
  } catch (error) { showError(error); }

  function opportunityRow(item, user) {
    const owner = item.publisher_id === user.id || user.isAdmin;
    return `<article class="list-row"><div><p class="eyebrow">${escapeHtml(item.job_type.toLowerCase().replaceAll('_', ' '))} · ${escapeHtml(item.work_mode.toLowerCase())}</p><h3><a href="/opportunity-details.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.company_name || 'Rishihood network')} · ${escapeHtml(item.location || 'Location flexible')} · Shared ${formatDate(item.created_at)}</p></div><div class="row-actions"><button class="button button-light button-small" data-action="save" data-id="${escapeHtml(item.id)}">${item.saved ? 'Saved' : 'Save'}</button>${owner ? `<button class="button button-danger button-small" data-action="remove" data-id="${escapeHtml(item.id)}">Remove</button>` : ''}</div></article>`;
  }

  async function showDetails(host, user) {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) throw new Error('Choose an opportunity from the directory.');
    const { opportunity: item } = await api(`/opportunities/${encodeURIComponent(id)}`);
    const owner = item.publisher_id === user.id || user.isAdmin;
    const companies = owner ? (await api('/companies')).companies : [];
    host.innerHTML = `<div class="page-heading"><a href="/opportunities.html">← All opportunities</a></div><div class="detail-layout"><article class="panel"><p class="eyebrow">${escapeHtml(item.job_type.toLowerCase().replaceAll('_', ' '))} · POSTED ${formatDate(item.created_at)}</p><h1 style="font-size:2.8rem">${escapeHtml(item.title)}</h1><p class="muted">${escapeHtml(item.company_name || 'Rishihood network')} · ${escapeHtml(item.work_mode.toLowerCase())} · ${escapeHtml(item.location || 'Flexible location')}</p><div class="detail-copy">${escapeHtml(item.description)}</div>${item.eligibility ? `<section class="profile-section"><h3>Who can apply</h3><p>${escapeHtml(item.eligibility)}</p></section>` : ''}${owner ? `<section id="edit-panel" class="panel profile-section hidden"><h2>Edit opportunity</h2><form id="edit-opportunity" class="form-stack"><label>Title<input name="title" value="${escapeHtml(item.title)}" required maxlength="180"></label><label>Company<select name="companyId"><option value="">No company</option>${companies.map((company) => `<option value="${escapeHtml(company.id)}" ${company.id === item.company_id ? 'selected' : ''}>${escapeHtml(company.name)}</option>`).join('')}</select></label><div class="form-row"><label>Type<select name="jobType"><option value="JOB" ${item.job_type === 'JOB' ? 'selected' : ''}>Job</option><option value="INTERNSHIP" ${item.job_type === 'INTERNSHIP' ? 'selected' : ''}>Internship</option><option value="HIRING_ANNOUNCEMENT" ${item.job_type === 'HIRING_ANNOUNCEMENT' ? 'selected' : ''}>Hiring announcement</option></select></label><label>Work mode<select name="workMode"><option value="ONSITE" ${item.work_mode === 'ONSITE' ? 'selected' : ''}>On-site</option><option value="HYBRID" ${item.work_mode === 'HYBRID' ? 'selected' : ''}>Hybrid</option><option value="REMOTE" ${item.work_mode === 'REMOTE' ? 'selected' : ''}>Remote</option></select></label></div><label>Description<textarea name="description" required minlength="10">${escapeHtml(item.description)}</textarea></label><div class="form-row"><label>Location<input name="location" value="${escapeHtml(item.location || '')}"></label><label>Application URL<input name="applicationUrl" type="url" value="${escapeHtml(item.application_url || '')}"></label></div><div class="form-row"><label>Eligibility<input name="eligibility" value="${escapeHtml(item.eligibility || '')}"></label><label>Deadline<input name="deadline" type="date" value="${escapeHtml(String(item.deadline || '').slice(0, 10))}"></label></div><label>Status<select name="status"><option value="PUBLISHED" ${item.status === 'PUBLISHED' ? 'selected' : ''}>Published</option><option value="CLOSED" ${item.status === 'CLOSED' ? 'selected' : ''}>Closed</option></select></label><button class="button button-dark">Save changes</button></form></section>` : ''}</article><aside class="panel"><p class="eyebrow">NEXT STEP</p><p>Deadline: ${item.deadline ? formatDate(item.deadline) : 'Not specified'}</p>${item.application_url ? `<a class="button button-gold" target="_blank" rel="noopener noreferrer" href="${escapeHtml(item.application_url)}">Open application ↗</a>` : '<p class="muted">Contact the alumnus who posted this opportunity for application details.</p>'}<button id="save-detail" class="button button-light" style="width:100%;margin-top:10px">${item.saved ? 'Unsave opportunity' : 'Save opportunity'}</button>${owner ? '<button id="edit-toggle" class="button button-light" style="width:100%;margin-top:10px">Edit listing</button><button id="remove-detail" class="button button-danger" style="width:100%;margin-top:10px">Remove listing</button>' : ''}<p class="muted" style="margin-top:18px">Shared by ${escapeHtml(item.publisher_name)}. Check the role details before applying.</p></aside></div>`;
    document.getElementById('save-detail').addEventListener('click', async () => {
      try { const result = await api(`/opportunities/${encodeURIComponent(item.id)}/save`, { method: 'POST' }); document.getElementById('save-detail').textContent = result.saved ? 'Unsave opportunity' : 'Save opportunity'; }
      catch (error) { showError(error); }
    });
    document.getElementById('edit-toggle')?.addEventListener('click', () => document.getElementById('edit-panel').classList.toggle('hidden'));
    document.getElementById('edit-opportunity')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget)); data.companyId ||= null; data.deadline ||= null;
      try { await api(`/opportunities/${encodeURIComponent(item.id)}`, { method: 'PUT', body: data }); showToast('Opportunity updated.'); location.reload(); }
      catch (error) { showError(error); }
    });
    document.getElementById('remove-detail')?.addEventListener('click', async () => {
      if (!confirm('Remove this opportunity?')) return;
      try { await api(`/opportunities/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); window.location.href = '/opportunities.html'; }
      catch (error) { showError(error); }
    });
  }

  function showError(error) { if (error.message) showToast(error.message, true); }
})();
