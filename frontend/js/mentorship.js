(async function () {
  try {
    const user = await requireMember();
    const host = document.getElementById('page-content');
    const [{ requests }, alumniResult] = await Promise.all([api('/mentorship'), user.membershipStatus === 'STUDENT' ? api('/alumni?limit=30') : Promise.resolve({ alumni: [] })]);
    const openMentors = alumniResult.alumni.filter((person) => person.open_to_mentoring);
    host.innerHTML = `<div class="page-heading"><div><p class="eyebrow">LEARN FROM EXPERIENCE</p><h1>Mentorship</h1><p>Build a focused learning relationship with a Rishihood alumnus.</p></div></div>
      ${user.membershipStatus === 'STUDENT' ? `<section class="panel"><div class="section-head"><h2>Alumni open to mentoring</h2><span class="muted">${openMentors.length} people</span></div>${openMentors.length ? `<div class="card-grid">${openMentors.map((person) => `<article class="card person-card">${avatarHtml(person.id, person.full_name, person.avatar_path)}<h3>${escapeHtml(person.full_name)}</h3><p class="person-meta">${escapeHtml(person.company_name || person.course)}${person.job_title ? ` · ${escapeHtml(person.job_title)}` : ''}</p><p class="person-bio">${escapeHtml(person.bio || 'Rishihood alumnus open to mentoring.')}</p>${person.mentoring_interests ? `<p class="muted">Interests: ${escapeHtml(person.mentoring_interests)}</p>` : ''}<form class="mentor-request form-stack" data-mentor="${escapeHtml(person.id)}"><label>Your goals<textarea name="goals" required minlength="10" maxlength="3000" placeholder="What are you working toward?"></textarea></label><label>Topics<textarea name="topics" maxlength="500" placeholder="Topics you’d like to discuss"></textarea></label><button class="button button-dark button-small">Request mentorship</button></form></article>`).join('')}</div>` : '<div class="empty-state"><strong>No mentors are listed right now</strong>Check career guidance availability in the alumni directory, or come back later.</div>'}</section>` : '<div class="notice" style="margin-bottom:20px">Students can request mentorship from alumni who have opted in. You can change your availability under My profile.</div>'}
      <section class="panel profile-section"><div class="section-head"><h2>${user.membershipStatus === 'ALUMNI' ? 'Incoming mentorship requests' : 'Your mentorship requests'}</h2></div>${requests.length ? `<div class="list-stack">${requests.map((item) => {
        const incoming = item.alumnus_id === user.id;
        const other = incoming ? item.student_name : item.alumnus_name;
        return `<article class="list-row"><div><h3>${incoming ? 'From' : 'To'} ${escapeHtml(other)}</h3><p>${escapeHtml(item.goals)}${item.topics ? ` · Topics: ${escapeHtml(item.topics)}` : ''}</p><span class="status-pill ${escapeHtml(item.status.toLowerCase())}">${escapeHtml(item.status.toLowerCase())}</span></div><div class="row-actions">${incoming && item.status === 'PENDING' ? `<button class="button button-dark button-small" data-action="ACCEPTED" data-id="${escapeHtml(item.id)}">Accept</button><button class="button button-light button-small" data-action="DECLINED" data-id="${escapeHtml(item.id)}">Decline</button>` : ''}${!incoming && item.status === 'ACCEPTED' ? `<button class="button button-light button-small" data-action="ENDED" data-id="${escapeHtml(item.id)}">End mentorship</button>` : ''}</div></article>`;
      }).join('')}</div>` : '<div class="empty-state"><strong>No mentorship requests yet</strong>When someone asks to learn with you, it will show here.</div>'}</section>`;
    host.querySelectorAll('.mentor-request').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget)); data.alumnusId = event.currentTarget.dataset.mentor;
      try { await api('/mentorship', { method: 'POST', body: data }); showToast('Mentorship request sent.'); event.currentTarget.reset(); }
      catch (error) { showError(error); }
    }));
    host.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]'); if (!button) return;
      try { await api(`/mentorship/${encodeURIComponent(button.dataset.id)}`, { method: 'PUT', body: { status: button.dataset.action } }); showToast('Mentorship updated.'); location.reload(); }
      catch (error) { showError(error); }
    });
  } catch (error) { showError(error); }
  function showError(error) { if (error.message) showToast(error.message, true); }
})();
