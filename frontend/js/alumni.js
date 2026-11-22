(async function () {
  const page = document.body.dataset.page;
  try {
    const user = await requireMember();
    const host = document.getElementById('page-content');
    if (page === 'alumni-profile') return await showProfile(host, user);

    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">PEOPLE OF RISHIHOOD</p><h1>Alumni directory</h1><p>Find someone who has taken a path you’re curious about.</p></div></div>
      <form id="alumni-filter" class="filter-bar"><input name="search" placeholder="Search name" aria-label="Search alumni by name"><input name="company" placeholder="Company" aria-label="Filter by company"><input name="jobTitle" placeholder="Job title" aria-label="Filter by job title"><input name="course" placeholder="Course" aria-label="Filter by course"><input name="skill" placeholder="Skill" aria-label="Filter by skill"><input name="location" placeholder="Location" aria-label="Filter by location"><input name="industry" placeholder="Industry" aria-label="Filter by industry"><input name="graduationYear" type="number" placeholder="Graduation year" aria-label="Filter by graduation year"><button class="button button-dark">Search directory</button></form>
      <div id="alumni-results" class="card-grid"></div><div class="section-head" style="margin-top:20px"><button id="previous-page" class="button button-light button-small">← Previous</button><span id="page-count" class="muted"></span><button id="next-page" class="button button-light button-small">Next →</button></div>`;
    let currentPage = 1;
    const form = document.getElementById('alumni-filter');
    async function load() {
      const params = new URLSearchParams(Object.fromEntries(new FormData(form)));
      params.set('page', currentPage);
      params.set('limit', '12');
      const { alumni } = await api(`/alumni?${params}`);
      document.getElementById('alumni-results').innerHTML = alumni.length ? alumni.map(personCard).join('') : '<div class="empty-state" style="grid-column:1/-1"><strong>No alumni match those filters</strong>Try another company, name, or skill.</div>';
      document.getElementById('page-count').textContent = `Page ${currentPage}`;
      document.getElementById('previous-page').disabled = currentPage <= 1;
      document.getElementById('next-page').disabled = alumni.length < 12;
    }
    form.addEventListener('submit', (event) => { event.preventDefault(); currentPage = 1; load().catch(showError); });
    document.getElementById('previous-page').addEventListener('click', () => { if (currentPage > 1) currentPage--; load().catch(showError); });
    document.getElementById('next-page').addEventListener('click', () => { currentPage++; load().catch(showError); });
    document.getElementById('alumni-results').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'connect') {
        try { await api('/connections/request', { method: 'POST', body: { recipientId: button.dataset.id } }); showToast('Connection request sent.'); button.textContent = 'Request sent'; button.disabled = true; }
        catch (error) { showError(error); }
      }
      if (button.dataset.action === 'ask') window.location.href = `/requests.html?to=${encodeURIComponent(button.dataset.id)}`;
    });
    await load();
  } catch (error) { showError(error); }

  function personCard(person) {
    const tags = (person.skills || []).slice(0, 4).map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`).join('');
    return `<article class="card person-card"><div class="person-top">${avatarHtml(person.id, person.full_name, person.avatar_path)}<div><h3><a href="/alumni-profile.html?id=${encodeURIComponent(person.id)}">${escapeHtml(person.full_name)}</a></h3><div class="person-meta">${escapeHtml(person.company_name || person.course)}${person.job_title ? ` · ${escapeHtml(person.job_title)}` : ''}</div></div></div><p class="person-bio">${escapeHtml(person.bio || 'A Rishihood graduate building what comes next.')}</p><div class="person-meta">Class of ${escapeHtml(person.graduation_year || '—')}</div><div class="tag-list" style="margin-top:12px">${tags}</div><div class="person-actions"><button class="button button-light button-small" data-action="connect" data-id="${escapeHtml(person.id)}">Connect</button><button class="button button-dark button-small" data-action="ask" data-id="${escapeHtml(person.id)}">Ask for help</button></div></article>`;
  }

  async function showProfile(host, user) {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) throw new Error('Choose an alumni profile from the directory.');
    const { profile, employment } = await api(`/alumni/${encodeURIComponent(id)}`);
    const me = profile.id === user.id;
    host.innerHTML = `<div class="page-heading"><a href="/alumni.html">← Back to alumni</a></div><section class="profile-hero">${avatarHtml(profile.id, profile.full_name, profile.avatar_path)}<div><p class="eyebrow">RISHIHOOD ALUMNI · CLASS OF ${escapeHtml(profile.graduation_year || '—')}</p><h1>${escapeHtml(profile.full_name)}</h1><p>${escapeHtml(profile.course)}${profile.current_location ? ` · ${escapeHtml(profile.current_location)}` : ''}</p></div></section><div class="detail-layout profile-section"><div><section class="panel"><h2>About</h2><p class="detail-copy">${escapeHtml(profile.bio || 'This alumnus has not added a bio yet.')}</p>${profile.skills?.length ? `<div class="tag-list">${profile.skills.map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`).join('')}</div>` : ''}</section><section class="panel profile-section"><h2>Experience</h2>${employment.length ? employment.map((job) => `<div class="list-row"><div><h3>${escapeHtml(job.job_title)} · ${escapeHtml(job.company_name)}</h3><p>${job.is_current ? 'Current role' : `${formatDate(job.started_on)} – ${formatDate(job.ended_on)}`}${job.verified ? ' · Verified' : ''}</p></div></div>`).join('') : '<div class="empty-state">Employment history is private or hasn’t been added.</div>'}</section></div><aside class="panel"><p class="eyebrow">WAYS TO CONNECT</p><p>Mentorship ${profile.open_to_mentoring ? 'available' : 'not listed'}<br>Career guidance ${profile.open_to_career_guidance ? 'available' : 'not listed'}<br>Referrals ${profile.open_to_referrals ? 'available' : 'not listed'}</p>${profile.open_to_mentoring && profile.mentoring_interests ? `<p class="muted">Mentoring interests: ${escapeHtml(profile.mentoring_interests)}</p>` : ''}<div class="form-stack">${!me ? `<button id="connect-profile" class="button button-light">Send connection request</button><button id="request-profile" class="button button-dark">Start a career request</button>${profile.open_to_mentoring ? '<a class="button button-gold" href="/mentorship.html">Request mentorship</a>' : ''}` : '<a class="button button-dark" href="/profile.html">Edit my profile</a>'}</div>${profile.linkedin_url ? `<p style="margin-top:18px"><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(profile.linkedin_url)}">LinkedIn profile ↗</a></p>` : ''}${profile.github_url ? `<p><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(profile.github_url)}">GitHub ↗</a></p>` : ''}${profile.portfolio_url ? `<p><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(profile.portfolio_url)}">Portfolio ↗</a></p>` : ''}</aside></div>`;
    document.getElementById('request-profile')?.addEventListener('click', () => { location.href = `/requests.html?to=${encodeURIComponent(profile.id)}`; });
    document.getElementById('connect-profile')?.addEventListener('click', async (event) => {
      try { await api('/connections/request', { method: 'POST', body: { recipientId: profile.id } }); event.currentTarget.textContent = 'Request sent'; event.currentTarget.disabled = true; }
      catch (error) { showError(error); }
    });
  }

  function showError(error) { if (error.message) showToast(error.message, true); }
})();
