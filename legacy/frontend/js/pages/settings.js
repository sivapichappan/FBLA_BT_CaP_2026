async function settingsPage(container) {
  if (!authIsAuthenticated()) {
    container.innerHTML = `<div class="container text-center" style="padding:6rem 1rem"><div class="glass" style="border-radius:0.75rem;padding:3rem;max-width:28rem;margin:0 auto">
      <span style="font-size:3rem;display:block;margin-bottom:1rem;opacity:0.2">${icons.settings}</span>
      <h2 class="text-xl font-semibold" style="margin-bottom:0.5rem">Sign in to access settings</h2>
      <p class="text-sm text-muted" style="margin-bottom:1.5rem">Manage your profile, password, email, and account.</p>
      <a href="#/login" class="btn btn-gradient">Sign In</a>
    </div></div>`;
    return;
  }

  container.innerHTML = `<div class="container-sm" style="padding:2rem 1rem">${renderSkeleton(1, '14rem')}</div>`;

  let profile;
  try {
    const data = await apiGet('/auth/profile');
    profile = data.user;
  } catch (e) {
    console.error('Failed to load settings:', e);
    container.innerHTML = '<div class="container text-center" style="padding:4rem 1rem"><p class="text-muted">Failed to load settings.</p></div>';
    return;
  }

  container.innerHTML = `<div class="container-sm" style="padding:2rem 1rem">
    <div style="margin-bottom:1.5rem">
      <h1 class="text-2xl font-bold">Settings</h1>
      <p class="text-sm text-muted">Manage your account preferences and security.</p>
    </div>

    <!-- Profile -->
    <div class="glass" style="border-radius:0.75rem;padding:1.5rem;margin-bottom:1rem">
      <h2 class="text-lg font-semibold" style="margin-bottom:0.25rem">Profile</h2>
      <p class="text-xs text-muted" style="margin-bottom:1rem">Update your name and default location.</p>
      <form id="profile-form" class="flex flex-col gap-3">
        <div class="grid grid-2 gap-3">
          <div>
            <label class="label">First name</label>
            <input class="input" name="firstName" value="${profile.first_name || ''}" />
          </div>
          <div>
            <label class="label">Last name</label>
            <input class="input" name="lastName" value="${profile.last_name || ''}" />
          </div>
        </div>
        <div class="grid grid-2 gap-3">
          <div>
            <label class="label">City</label>
            <input class="input" name="defaultCity" value="${profile.default_city || ''}" />
          </div>
          <div>
            <label class="label">State</label>
            <input class="input" name="defaultState" value="${profile.default_state || ''}" />
          </div>
        </div>
        <div id="profile-msg" class="text-xs"></div>
        <button type="submit" class="btn btn-gradient" style="align-self:flex-start">Save profile</button>
      </form>
    </div>

    <!-- Email -->
    <div class="glass" style="border-radius:0.75rem;padding:1.5rem;margin-bottom:1rem">
      <h2 class="text-lg font-semibold" style="margin-bottom:0.25rem">Email</h2>
      <p class="text-xs text-muted" style="margin-bottom:1rem">Current: <strong>${profile.email}</strong></p>
      <form id="email-form" class="flex flex-col gap-3">
        <div>
          <label class="label">New email</label>
          <input class="input" name="newEmail" type="email" required />
        </div>
        <div>
          <label class="label">Current password</label>
          <input class="input" name="currentPassword" type="password" required />
        </div>
        <div id="email-msg" class="text-xs"></div>
        <button type="submit" class="btn btn-gradient" style="align-self:flex-start">Update email</button>
      </form>
    </div>

    <!-- Password -->
    <div class="glass" style="border-radius:0.75rem;padding:1.5rem;margin-bottom:1rem">
      <h2 class="text-lg font-semibold" style="margin-bottom:0.25rem">Password</h2>
      <p class="text-xs text-muted" style="margin-bottom:1rem">Use at least 8 characters.</p>
      <form id="password-form" class="flex flex-col gap-3">
        <div>
          <label class="label">Current password</label>
          <input class="input" name="currentPassword" type="password" required />
        </div>
        <div class="grid grid-2 gap-3">
          <div>
            <label class="label">New password</label>
            <input class="input" name="newPassword" type="password" required minlength="8" />
          </div>
          <div>
            <label class="label">Confirm new password</label>
            <input class="input" name="confirmPassword" type="password" required minlength="8" />
          </div>
        </div>
        <div id="password-msg" class="text-xs"></div>
        <button type="submit" class="btn btn-gradient" style="align-self:flex-start">Change password</button>
      </form>
    </div>

    <!-- Danger zone -->
    <div class="glass" style="border-radius:0.75rem;padding:1.5rem;border:1px solid hsla(0,70%,50%,0.25)">
      <h2 class="text-lg font-semibold" style="margin-bottom:0.25rem;color:var(--destructive)">Danger zone</h2>
      <p class="text-xs text-muted" style="margin-bottom:1rem">Permanently delete your account. This cannot be undone.</p>
      <button id="delete-btn" class="btn btn-ghost" style="color:var(--destructive);border:1px solid hsla(0,70%,50%,0.3)">${icons.trash} Delete account</button>
    </div>

    <!-- Delete confirmation modal -->
    <div class="modal-overlay" id="delete-modal">
      <div class="modal-content glass" style="max-width:24rem">
        <h3 class="text-lg font-semibold" style="margin-bottom:0.5rem">Delete your account?</h3>
        <p class="text-sm text-muted" style="margin-bottom:1rem">This will permanently remove your profile, favorites, reviews, and any businesses you own. Enter your password to confirm.</p>
        <form id="delete-form" class="flex flex-col gap-3">
          <input class="input" name="currentPassword" type="password" placeholder="Current password" required />
          <div id="delete-msg" class="text-xs"></div>
          <div class="flex gap-2 justify-end">
            <button type="button" class="btn btn-ghost btn-sm" onclick="closeDeleteModal()">Cancel</button>
            <button type="submit" class="btn btn-sm" style="background:var(--destructive);color:white">Delete forever</button>
          </div>
        </form>
      </div>
    </div>
  </div>`;

  attachSettingsHandlers();
}

function attachSettingsHandlers() {
  const showMsg = (id, text, ok) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? 'var(--green, hsl(142,71%,45%))' : 'var(--destructive, hsl(0,70%,55%))';
  };

  // Profile form
  const profileForm = document.getElementById('profile-form');
  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = profileForm.querySelector('button[type="submit"]');
    const fd = new FormData(profileForm);
    showMsg('profile-msg', '', true);
    setButtonLoading(btn, true);
    try {
      await apiPut('/auth/profile', {
        firstName: fd.get('firstName') || null,
        lastName: fd.get('lastName') || null,
        defaultCity: fd.get('defaultCity') || null,
        defaultState: fd.get('defaultState') || null,
      });
      await authFetchProfile();
      showMsg('profile-msg', 'Profile updated.', true);
    } catch (err) {
      showMsg('profile-msg', err.message || 'Failed to update profile', false);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  // Email form
  const emailForm = document.getElementById('email-form');
  emailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = emailForm.querySelector('button[type="submit"]');
    const fd = new FormData(emailForm);
    showMsg('email-msg', '', true);
    setButtonLoading(btn, true);
    try {
      await apiPut('/auth/email', {
        newEmail: fd.get('newEmail'),
        currentPassword: fd.get('currentPassword'),
      });
      await authFetchProfile();
      showMsg('email-msg', 'Email updated.', true);
      emailForm.reset();
      setTimeout(() => router(), 800);
    } catch (err) {
      showMsg('email-msg', err.message || 'Failed to update email', false);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  // Password form
  const passwordForm = document.getElementById('password-form');
  passwordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = passwordForm.querySelector('button[type="submit"]');
    const fd = new FormData(passwordForm);
    const newPw = fd.get('newPassword');
    const confirmPw = fd.get('confirmPassword');
    showMsg('password-msg', '', true);
    if (newPw !== confirmPw) {
      showMsg('password-msg', 'New passwords do not match.', false);
      return;
    }
    setButtonLoading(btn, true);
    try {
      await apiPut('/auth/password', {
        currentPassword: fd.get('currentPassword'),
        newPassword: newPw,
      });
      showMsg('password-msg', 'Password changed.', true);
      passwordForm.reset();
    } catch (err) {
      showMsg('password-msg', err.message || 'Failed to change password', false);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  // Delete account
  document.getElementById('delete-btn')?.addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('open');
  });

  const deleteForm = document.getElementById('delete-form');
  deleteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = deleteForm.querySelector('button[type="submit"]');
    const fd = new FormData(deleteForm);
    showMsg('delete-msg', '', true);
    setButtonLoading(btn, true, 'Deleting...');
    try {
      await apiDelete('/auth/account', {
        currentPassword: fd.get('currentPassword'),
      });
      authLogout();
      navigate('');
    } catch (err) {
      showMsg('delete-msg', err.message || 'Failed to delete account', false);
      setButtonLoading(btn, false);
    }
  });
}

function closeDeleteModal() {
  document.getElementById('delete-modal')?.classList.remove('open');
}
