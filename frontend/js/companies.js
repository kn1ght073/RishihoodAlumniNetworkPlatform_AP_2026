(async function () {
  const page = document.body.dataset.page;
  try {
    await requireMember();
    const host = document.getElementById('page-content');
    if (page === 'company-profile') return await companyProfile(host);
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">WHERE OUR PEOPLE BUILD</p><h1>Company directory</h1><p>Explore organizations with Rishihood alumni in the room.</p></div></div>
      <form id="company-filter" class="filter-bar"><input name="search" placeholder="Search company name"><input name="industry" placeholder="Industry"><button class="button button-dark">Search</button></form>
      <div id="company-results" class="card-grid"></div>
      <section class="panel profile-section"><div class="section-head"><div><p class="eyebrow">MISSING A COMPANY?</p><h2>Suggest a company</h2></div></div><form id="suggest-company" class="form-row"><label>Company name<input name="name" required maxlength="160"></label><label>Website<input name="websiteUrl" type="url" placeholder="https://example.com"></label><label>Industry<input name="industry" maxlength="100"></label><div style="align-self:end"><button class="button button-dark">Send for review</button></div></form></section>`;
    const form = document.getElementById('company-filter');
    async function load() {
      const params = new URLSearchParams(Object.fromEntries(new FormData(form)));
      const { companies } = await api(`/companies?${params}`);
      document.getElementById('company-results').innerHTML = companies.length ? companies.map((company) => `<article class="card company-card"><span class="company-initial">${escapeHtml(company.name[0]?.toUpperCase() || 'C')}</span><div><h3><a href="/company-profile.html?id=${encodeURIComponent(company.id)}">${escapeHtml(company.name)}</a></h3><p class="muted">${escapeHtml(company.industry || 'Organization')} · ${company.alumni_count} visible ${company.alumni_count === 1 ? 'alumnus' : 'alumni'}</p></div><a class="button button-light button-small" href="/company-profile.html?id=${encodeURIComponent(company.id)}">Explore company →</a></article>`).join('') : '<div class="empty-state" style="grid-column:1/-1"><strong>No companies found</strong>Try another search, or suggest a company below.</div>';
    }
    form.addEventListener('submit', (event) => { event.preventDefault(); load().catch(showError); });
    document.getElementById('suggest-company').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('/companies/suggestions', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) });
        event.currentTarget.reset(); showToast('Suggestion sent to an administrator.');
      } catch (error) { showError(error); }
    });
    await load();
  } catch (error) { showError(error); }

  async function companyProfile(host) {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) throw new Error('Choose a company from the directory.');
    const [{ company }, { alumni }] = await Promise.all([api(`/companies/${encodeURIComponent(id)}`), api(`/companies/${encodeURIComponent(id)}/alumni`)]);
    host.innerHTML = `<div class="page-heading"><a href="/companies.html">← Company directory</a></div><section class="profile-hero"><span class="company-initial">${escapeHtml(company.name[0]?.toUpperCase() || 'C')}</span><div><p class="eyebrow">ALUMNI COMPANY</p><h1>${escapeHtml(company.name)}</h1><p>${escapeHtml(company.industry || 'Organization')}${company.location ? ` · ${escapeHtml(company.location)}` : ''}</p></div></section><div class="detail-layout profile-section"><div class="panel"><div class="section-head"><h2>Rishihood alumni here</h2><span class="status-pill">${alumni.length} visible</span></div>${alumni.length ? `<div class="card-grid">${alumni.map((person) => `<article class="card person-card">${avatarHtml(person.id, person.full_name, person.avatar_path)}<h3><a href="/alumni-profile.html?id=${encodeURIComponent(person.id)}">${escapeHtml(person.full_name)}</a></h3><p class="person-meta">${escapeHtml(person.job_title)} · Class of ${escapeHtml(person.graduation_year || '—')}</p><p class="person-bio">${escapeHtml(person.bio || '')}</p><div class="tag-list">${person.skills.slice(0, 3).map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`).join('')}</div><div class="person-actions">${person.open_to_mentoring ? '<span class="tag">Open to mentorship</span>' : ''}${person.open_to_career_guidance ? '<span class="tag">Career guidance</span>' : ''}${person.open_to_referrals ? '<span class="tag">Referral requests</span>' : ''}</div>${person.open_to_mentoring && person.mentoring_interests ? `<p class="muted">Mentoring: ${escapeHtml(person.mentoring_interests)}</p>` : ''}<a class="button button-dark button-small" href="/alumni-profile.html?id=${encodeURIComponent(person.id)}">View profile →</a></article>`).join('')}</div>` : '<div class="empty-state"><strong>No visible alumni listed</strong>Alumni control whether their profile and employment are shown in the company directory.</div>'}</div><aside class="panel"><p class="eyebrow">ABOUT</p><p>${escapeHtml(company.description || 'Company details have not been added yet.')}</p>${company.website_url ? `<a class="button button-light" href="${escapeHtml(company.website_url)}" target="_blank" rel="noopener noreferrer">Visit website ↗</a>` : ''}</aside></div>`;
  }

  function showError(error) { if (error.message) showToast(error.message, true); }
})();
