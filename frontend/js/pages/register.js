function registerPage(container) {
  container.innerHTML = `
    <div class="flex justify-center items-center" style="min-height:calc(100vh - 12rem);padding:1rem;position:relative">
      <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none">
        <div style="position:absolute;top:25%;left:25%;width:16rem;height:16rem;border-radius:9999px;background:hsla(217,91%,60%,0.05);filter:blur(80px)"></div>
        <div style="position:absolute;bottom:25%;right:25%;width:16rem;height:16rem;border-radius:9999px;background:hsla(262,83%,58%,0.05);filter:blur(80px)"></div>
      </div>
      <div class="card glass" style="width:100%;max-width:28rem;position:relative;z-index:1">
        <div class="card-header text-center">
          <div class="card-title text-2xl" style="margin-bottom:0.25rem">Create Account</div>
          <p class="text-sm text-muted">Join LocalDiscover to find businesses near you</p>
        </div>
        <form id="register-form" class="card-body" style="display:flex;flex-direction:column;gap:1rem">
          <div id="register-error" style="display:none"></div>
          <div>
            <label class="label" for="reg-name">Full Name</label>
            <input class="input" id="reg-name" placeholder="John Doe" />
          </div>
          <div>
            <label class="label" for="reg-email">Email</label>
            <input class="input" type="email" id="reg-email" required />
          </div>
          <div>
            <label class="label" for="reg-password">Password</label>
            <input class="input" type="password" id="reg-password" required />
          </div>
          <div>
            <label class="label" for="reg-confirm">Confirm Password</label>
            <input class="input" type="password" id="reg-confirm" required />
          </div>
          <button type="submit" class="btn btn-gradient w-full" id="reg-btn">Sign Up</button>
          <p class="text-sm text-muted text-center">
            Already have an account? <a href="#/login" class="text-primary font-medium">Sign in</a>
          </p>
        </form>
      </div>
    </div>`;

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('reg-btn');
    const errEl = document.getElementById('register-error');
    const fullName = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    errEl.style.display = 'none';

    if (password !== confirm) {
      errEl.textContent = 'Passwords do not match';
      errEl.style.display = 'block';
      errEl.style.padding = '0.75rem';
      errEl.style.borderRadius = 'var(--radius)';
      errEl.style.background = 'hsla(0,84%,60%,0.1)';
      errEl.style.color = 'var(--destructive)';
      return;
    }
    if (password.length < 8) {
      errEl.textContent = 'Password must be at least 8 characters';
      errEl.style.display = 'block';
      errEl.style.padding = '0.75rem';
      errEl.style.borderRadius = 'var(--radius)';
      errEl.style.background = 'hsla(0,84%,60%,0.1)';
      errEl.style.color = 'var(--destructive)';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating account...';

    const parts = fullName.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    try {
      await authRegister(email, password, firstName, lastName);
      navigate('');
    } catch (err) {
      errEl.textContent = err.message || 'Registration failed';
      errEl.style.display = 'block';
      errEl.style.padding = '0.75rem';
      errEl.style.borderRadius = 'var(--radius)';
      errEl.style.background = 'hsla(0,84%,60%,0.1)';
      errEl.style.color = 'var(--destructive)';
      btn.disabled = false;
      btn.textContent = 'Sign Up';
    }
  });
}
