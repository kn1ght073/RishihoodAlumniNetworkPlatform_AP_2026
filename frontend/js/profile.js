(async function () {
  try {
    const user = await requireMember();
    const profileResult = await api('/profile');
    const companiesResult = profileResult.profile.verification_status === 'VERIFIED'
      ? await api('/companies')
      : { companies: [] };
    const { profile, employment } = profileResult;
    const { companies } = companiesResult;
    const host = document.getElementById('page-content');
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">YOUR UNIVERSITY STORY</p><h1>My profile</h1><p>Keep your profile current and choose what the community can see.</p></div><span class="status-pill ${profile.verification_status.toLowerCase()}">${escapeHtml(profile.verification_status.toLowerCase())} affiliation</span></div>
      <div class="content-grid"><section class="panel" style="grid-column:span 7"><h2>Professional profile</h2><div class="person-top" style="margin:0 0 20px">${avatarHtml(user.id, profile.full_name, profile.avatar_path)}<form id="picture-form"><label class="button button-light button-small">Update picture<input type="file" name="picture" accept="image/jpeg,image/png,image/webp" hidden></label><small class="muted">JPG, PNG or WebP · 3 MB max</small></form></div>
      <form id="profile-form" class="form-stack"><div class="form-row"><label>Full name<input name="fullName" value="${escapeHtml(profile.full_name)}" required minlength="2" maxlength="100"></label><label>Course or degree<input name="course" value="${escapeHtml(profile.course)}" required maxlength="120"></label></div><label>Short professional bio<textarea name="bio" maxlength="1200" placeholder="What are you working on? What do you enjoy helping with?">${escapeHtml(profile.bio || '')}</textarea></label><div class="form-row"><label>Current location<input name="location" value="${escapeHtml(profile.current_location || '')}" maxlength="120"></label><label>Skills, separated by commas<input name="skills" value="${escapeHtml((profile.skills || []).join(', '))}" placeholder="Product design, Research, Python"></label></div><div class="form-row"><label>LinkedIn URL<input name="linkedinUrl" type="url" value="${escapeHtml(profile.linkedin_url || '')}" placeholder="https://linkedin.com/in/…"></label><label>GitHub URL<input name="githubUrl" type="url" value="${escapeHtml(profile.github_url || '')}" placeholder="https://github.com/…"></label></div><label>Portfolio URL<input name="portfolioUrl" type="url" value="${escapeHtml(profile.portfolio_url || '')}" placeholder="https://…"></label><button class="button button-dark">Save profile</button></form></section>
      <section class="panel" style="grid-column:span 5"><h2>Privacy & ways to help</h2><form id="preferences-form" class="form-stack"><label>Profile visibility<select name="profileVisibility">${option('MEMBERS','All verified members',profile.profile_visibility)}${option('CONNECTIONS','Accepted connections',profile.profile_visibility)}${option('PRIVATE','Only me',profile.profile_visibility)}</select></label><label>Employment visibility<select name="employmentVisibility">${option('MEMBERS','All verified members',profile.employment_visibility)}${option('CONNECTIONS','Accepted connections',profile.employment_visibility)}${option('PRIVATE','Only me',profile.employment_visibility)}</select></label><label>Contact visibility<select name="contactVisibility">${option('PRIVATE','Only me',profile.contact_visibility)}${option('CONNECTIONS','Accepted connections',profile.contact_visibility)}${option('MEMBERS','All verified members',profile.contact_visibility)}</select></label><label class="check-row"><input name="openToMentoring" type="checkbox" ${profile.open_to_mentoring ? 'checked' : ''}> Open to mentorship</label><label class="check-row"><input name="openToCareerGuidance" type="checkbox" ${profile.open_to_career_guidance ? 'checked' : ''}> Open to career guidance</label><label class="check-row"><input name="openToReferrals" type="checkbox" ${profile.open_to_referrals ? 'checked' : ''}> Open to referral requests</label><label>Mentoring interests<textarea name="mentoringInterests" maxlength="500" placeholder="Topics you can help with">${escapeHtml(profile.mentoring_interests || '')}</textarea></label><button class="button button-dark">Save preferences</button></form></section>
      <section class="panel" style="grid-column:span 7"><div class="section-head"><h2>Employment history</h2><span class="muted">Manual entry</span></div>${user.membershipStatus === 'ALUMNI' ? `<form id="employment-form" class="form-row"><label>Company<select name="companyId" required><option value="">Select company</option>${companies.map((company) => `<option value="${escapeHtml(company.id)}">${escapeHtml(company.name)}</option>`).join('')}</select></label><label>Job title<input name="jobTitle" required maxlength="120"></label><label>Start date<input name="startedOn" type="date"></label><label>End date<input name="endedOn" type="date"></label><label class="check-row"><input name="isCurrent" type="checkbox"> Current position</label><div><button class="button button-light">Add position</button></div></form>` : '<div class="notice">Employment history can be added after your membership transitions to Alumni.</div>'}<div class="list-stack" style="margin-top:16px">${employment.length ? employment.map((job) => `<div class="list-row"><div><h3>${escapeHtml(job.job_title)} · ${escapeHtml(job.company_name)}</h3><p>${job.is_current ? 'Current role' : `${formatDate(job.started_on)} – ${formatDate(job.ended_on)}`}${job.verified ? ' · University verified' : ' · Self-reported'}</p></div><button class="button button-danger button-small" data-delete-employment="${escapeHtml(job.id)}">Remove</button></div>`).join('') : '<div class="empty-state">No employment history yet.</div>'}</div></section>
      <section class="panel" style="grid-column:span 5"><p class="eyebrow">UNIVERSITY AFFILIATION</p><h2>Verification</h2><p class="muted">${escapeHtml(profile.university)} · ${escapeHtml(profile.membership_status)} · Class of ${escapeHtml(profile.graduation_year || profile.expected_graduation_year || '—')}</p>${profile.verification_status === 'VERIFIED' ? '<div class="success-panel">Your affiliation is verified.</div>' : `<form id="verification-form" class="form-stack"><label>Help us verify your affiliation<textarea name="evidenceNote" required minlength="5" maxlength="1200" placeholder="Course, cohort, student ID, or other context for the university admin"></textarea></label><button class="button button-gold">Submit for review</button></form>`}</section></div>`;

    document.getElementById('profile-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      data.skills = data.skills.split(',').map((skill) => skill.trim()).filter(Boolean);
      data.preferences = {
        openToMentoring: document.querySelector('[name="openToMentoring"]').checked,
        openToCareerGuidance: document.querySelector('[name="openToCareerGuidance"]').checked,
        openToReferrals: document.querySelector('[name="openToReferrals"]').checked,
        mentoringInterests: document.querySelector('[name="mentoringInterests"]').value
      };
      data.profileVisibility = document.querySelector('[name="profileVisibility"]').value;
      data.employmentVisibility = document.querySelector('[name="employmentVisibility"]').value;
      data.contactVisibility = document.querySelector('[name="contactVisibility"]').value;
      try { await api('/profile', { method: 'PUT', body: data }); showToast('Profile updated.'); }
      catch (error) { showError(error); }
    });
    document.getElementById('preferences-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const profileForm = document.getElementById('profile-form');
      const data = Object.fromEntries(new FormData(profileForm));
      data.skills = data.skills.split(',').map((skill) => skill.trim()).filter(Boolean);
      data.profileVisibility = values.profileVisibility; data.employmentVisibility = values.employmentVisibility; data.contactVisibility = values.contactVisibility;
      data.preferences = { openToMentoring: document.querySelector('[name="openToMentoring"]').checked, openToCareerGuidance: document.querySelector('[name="openToCareerGuidance"]').checked, openToReferrals: document.querySelector('[name="openToReferrals"]').checked, mentoringInterests: values.mentoringInterests };
      try { await api('/profile', { method: 'PUT', body: data }); showToast('Privacy preferences saved.'); }
      catch (error) { showError(error); }
    });
    document.getElementById('picture-form').elements.picture.addEventListener('change', async (event) => {
      if (!event.target.files[0]) return;
      const form = new FormData(); form.append('picture', event.target.files[0]);
      try { await api('/profile/picture', { method: 'POST', body: form }); showToast('Profile picture updated.'); location.reload(); }
      catch (error) { showError(error); }
    });
    document.getElementById('employment-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget)); data.isCurrent = event.currentTarget.elements.isCurrent.checked;
      try { await api('/profile/employment', { method: 'POST', body: data }); showToast('Position added.'); location.reload(); }
      catch (error) { showError(error); }
    });
    document.getElementById('page-content').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-delete-employment]');
      if (!button || !confirm('Remove this position from your profile?')) return;
      try { await api(`/profile/employment/${encodeURIComponent(button.dataset.deleteEmployment)}`, { method: 'DELETE' }); location.reload(); }
      catch (error) { showError(error); }
    });
    document.getElementById('verification-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { await api('/profile/verification', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) }); showToast('Verification sent for review.'); event.currentTarget.reset(); }
      catch (error) { showError(error); }
    });
  } catch (error) { showError(error); }

  function option(value, label, selected) { return `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`; }
  function showError(error) { if (error.message) showToast(error.message, true); }
})();
