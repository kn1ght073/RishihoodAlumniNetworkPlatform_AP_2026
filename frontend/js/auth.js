(function () {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const verifyForm = document.getElementById('verify-form');
  const resendForm = document.getElementById('resend-verification-form');

  function message(element, text, success = false) {
    element.textContent = text;
    element.classList.toggle('success', success);
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = loginForm.querySelector('button[type="submit"],button:not([type])');
      submit.disabled = true;
      const status = document.getElementById('auth-message');
      message(status, 'Signing you in…');
      try {
        await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(loginForm)) });
        window.location.href = '/dashboard.html';
      } catch (error) { message(status, error.message); submit.disabled = false; }
    });
  }

  if (resendForm) {
    const recoveryToggle = document.getElementById('show-verification-recovery');
    recoveryToggle.addEventListener('click', (event) => {
      event.preventDefault();
      resendForm.classList.remove('hidden');
      recoveryToggle.closest('.auth-switch').classList.add('hidden');
      resendForm.elements.email.focus();
    });

    resendForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('resend-message');
      const button = resendForm.querySelector('button[type="submit"],button:not([type])');
      button.disabled = true;
      try {
        const result = await api('/auth/resend-verification', {
          method: 'POST', body: { email: resendForm.elements.email.value }
        });
        if (result.developmentVerificationCode) resendForm.elements.token.value = result.developmentVerificationCode;
        message(status, result.message, true);
      } catch (error) { message(status, error.message); }
      finally { button.disabled = false; }
    });
    document.getElementById('verify-resend-code').addEventListener('click', async () => {
      const status = document.getElementById('resend-message');
      try {
        const result = await api('/auth/verify-email', { method: 'POST', body: { token: resendForm.elements.token.value } });
        message(status, `${result.message} You can sign in now.`, true);
      } catch (error) { message(status, error.message); }
    });
  }

  if (registerForm) {
    const type = document.getElementById('user-type');
    const label = document.getElementById('year-label');
    const year = registerForm.elements.graduationYear;
    const updateYear = () => {
      const alumnus = type.value === 'ALUMNI';
      label.firstChild.textContent = alumnus ? 'Graduation year' : 'Expected graduation year';
      year.min = alumnus ? 1950 : new Date().getFullYear();
      year.max = alumnus ? new Date().getFullYear() : new Date().getFullYear() + 10;
    };
    type.addEventListener('change', updateYear);
    updateYear();
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('auth-message');
      const submit = registerForm.querySelector('button');
      submit.disabled = true;
      try {
        const result = await api('/auth/register', { method: 'POST', body: Object.fromEntries(new FormData(registerForm)) });
        registerForm.classList.add('hidden');
        verifyForm.classList.remove('hidden');
        const target = document.getElementById('verify-message');
        if (result.developmentVerificationCode) verifyForm.elements.token.value = result.developmentVerificationCode;
        message(target, result.message, true);
      } catch (error) { message(status, error.message); submit.disabled = false; }
    });
  }

  if (verifyForm) {
    verifyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = document.getElementById('verify-message');
      try {
        const result = await api('/auth/verify-email', { method: 'POST', body: Object.fromEntries(new FormData(verifyForm)) });
        message(status, `${result.message} Taking you to sign in…`, true);
        setTimeout(() => { window.location.href = '/login.html'; }, 1100);
      } catch (error) { message(status, error.message); }
    });
  }
})();
