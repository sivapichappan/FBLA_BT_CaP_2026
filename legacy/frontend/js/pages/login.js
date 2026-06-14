function loginPage(container) {
  container.innerHTML = `
    <div class="flex justify-center items-center" style="min-height:calc(100vh - 12rem);padding:1rem;position:relative">
      <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none">
        <div style="position:absolute;top:25%;left:25%;width:16rem;height:16rem;border-radius:9999px;background:hsla(217,91%,60%,0.05);filter:blur(80px)"></div>
        <div style="position:absolute;bottom:25%;right:25%;width:16rem;height:16rem;border-radius:9999px;background:hsla(262,83%,58%,0.05);filter:blur(80px)"></div>
      </div>
      <div class="card glass" style="width:100%;max-width:28rem;position:relative;z-index:1">
        <div class="card-header text-center">
          <div class="card-title text-2xl" style="margin-bottom:0.25rem">Welcome Back</div>
          <p class="text-sm text-muted">Sign in to your account</p>
        </div>
        <form id="login-form" class="card-body" style="display:flex;flex-direction:column;gap:1rem">
          <div id="login-error" style="display:none" class="text-sm" style="padding:0.75rem;border-radius:var(--radius);background:hsla(0,84%,60%,0.1);color:var(--destructive)"></div>
          <div>
            <label class="label" for="login-email">Email</label>
            <input class="input" type="email" id="login-email" required />
          </div>
          <div>
            <label class="label" for="login-password">Password</label>
            <input class="input" type="password" id="login-password" required />
          </div>
          <button type="submit" class="btn btn-gradient w-full" id="login-btn">Sign In</button>
          <p class="text-sm text-muted text-center">
            Don't have an account? <a href="#/register" class="text-primary font-medium">Sign up</a>
          </p>
        </form>
      </div>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('login-error');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    setButtonLoading(btn, true, 'Signing in...');
    errEl.style.display = 'none';

    try {
      await authLogin(email, password);
      navigate('');
    } catch (err) {
      errEl.textContent = err.message || 'Login failed';
      errEl.style.display = 'block';
      errEl.style.padding = '0.75rem';
      errEl.style.borderRadius = 'var(--radius)';
      errEl.style.background = 'hsla(0,84%,60%,0.1)';
      errEl.style.color = 'var(--destructive)';
      setButtonLoading(btn, false);
    }
  });
}
