async function profilePage(container) {
  if (!authIsAuthenticated()) {
    container.innerHTML = `<div class="container text-center" style="padding:6rem 1rem"><div class="glass" style="border-radius:0.75rem;padding:3rem;max-width:28rem;margin:0 auto">
      <span style="font-size:3rem;display:block;margin-bottom:1rem;opacity:0.2">${icons.user}</span>
      <h2 class="text-xl font-semibold" style="margin-bottom:0.5rem">Sign in to view your profile</h2>
      <p class="text-sm text-muted" style="margin-bottom:1.5rem">Track your favorites, reviews, and activity.</p>
      <a href="#/login" class="btn btn-gradient">Sign In</a>
    </div></div>`;
    return;
  }

  container.innerHTML = `<div class="container-sm" style="padding:2rem 1rem"><div class="skeleton" style="height:12rem"></div></div>`;

  try {
    const [profileData, favsData] = await Promise.all([
      apiGet('/auth/profile'),
      favoriteApi.getAll().catch(() => ({ favorites: [] })),
    ]);
    const p = profileData.user;
    const favCount = favsData.favorites?.length || 0;
    const initials = ((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || '') || p.email[0].toUpperCase();
    const displayName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username || p.email.split('@')[0];
    const levelProgress = (p.total_points || 0) % 100;

    container.innerHTML = `<div class="container-sm" style="padding:2rem 1rem">
      <!-- Header card -->
      <div class="glass animate-fade-in" style="border-radius:1rem;padding:1.5rem;margin-bottom:1rem;position:relative;overflow:hidden">
        <div style="position:absolute;top:-5rem;right:-5rem;width:12rem;height:12rem;border-radius:9999px;background:hsla(217,91%,60%,0.08);filter:blur(80px);pointer-events:none"></div>
        <div style="position:absolute;bottom:-5rem;left:-5rem;width:12rem;height:12rem;border-radius:9999px;background:hsla(262,83%,58%,0.08);filter:blur(80px);pointer-events:none"></div>
        <div class="flex items-center gap-5" style="position:relative;z-index:1">
          <div class="gradient-primary" style="width:5rem;height:5rem;border-radius:1rem;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700;color:white">${initials}</div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-bold truncate">${displayName}</h1>
            <p class="text-sm text-muted">@${p.username || p.email.split('@')[0]}</p>
            <div class="flex items-center gap-2" style="margin-top:0.5rem">
              <span class="badge glass-subtle">${icons.trophy} Level ${p.level || 1}</span>
              ${p.is_admin ? `<span class="badge" style="background:hsla(217,91%,60%,0.2);color:var(--primary);border:1px solid hsla(217,91%,60%,0.3)">${icons.shield} Admin</span>` : ''}
            </div>
          </div>
        </div>
        <div style="position:relative;z-index:1;margin-top:1.25rem">
          <div class="flex justify-between text-xs text-muted" style="margin-bottom:0.375rem">
            <span>${p.total_points || 0} XP</span>
            <span>Next level: ${(p.level || 1) * 100} XP</span>
          </div>
          <div class="progress-bar"><div class="progress-fill gradient-primary" style="width:${Math.min(levelProgress, 100)}%"></div></div>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-3 gap-3 animate-fade-in animate-delay-1" style="margin-bottom:1rem">
        <div class="glass text-center" style="border-radius:0.75rem;padding:1rem">
          <span style="color:hsl(0,70%,60%);display:block;margin-bottom:0.375rem">${icons.heart}</span>
          <p class="text-lg font-bold">${favCount}</p>
          <p class="text-xs text-muted">Favorites</p>
        </div>
        <div class="glass text-center" style="border-radius:0.75rem;padding:1rem">
          <span style="color:var(--yellow);display:block;margin-bottom:0.375rem">${icons.star}</span>
          <p class="text-lg font-bold">${Number(p.trust_score || 50).toFixed(0)}</p>
          <p class="text-xs text-muted">Trust Score</p>
        </div>
        <div class="glass text-center" style="border-radius:0.75rem;padding:1rem">
          <span style="color:var(--primary);display:block;margin-bottom:0.375rem">${icons.calendar}</span>
          <p class="text-lg font-bold">${p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}</p>
          <p class="text-xs text-muted">Member Since</p>
        </div>
      </div>

      <!-- Info -->
      <div class="glass animate-fade-in animate-delay-2" style="border-radius:0.75rem;overflow:hidden">
        <div class="flex items-center gap-3" style="padding:0.875rem 1rem;border-bottom:1px solid var(--rule)">
          <span class="icon icon-md text-muted">${icons.mail}</span>
          <div><p class="text-xs text-muted">Email</p><p class="text-sm">${p.email}</p></div>
        </div>
        <div class="flex items-center gap-3" style="padding:0.875rem 1rem;border-bottom:1px solid var(--rule)">
          <span class="icon icon-md text-muted">${icons.mapPin}</span>
          <div><p class="text-xs text-muted">Location</p><p class="text-sm">${p.default_city && p.default_state ? p.default_city + ', ' + p.default_state : locationGet() ? 'Using current location' : 'Not set'}</p></div>
        </div>
        ${p.last_login_at ? `<div class="flex items-center gap-3" style="padding:0.875rem 1rem">
          <span class="icon icon-md text-muted">${icons.calendar}</span>
          <div><p class="text-xs text-muted">Last Active</p><p class="text-sm">${new Date(p.last_login_at).toLocaleString()}</p></div>
        </div>` : ''}
      </div>

      <!-- Quick links -->
      <div class="glass animate-fade-in animate-delay-3" style="border-radius:0.75rem;overflow:hidden;margin-top:1rem">
        <a href="#/favorites" class="flex items-center gap-3" style="padding:0.875rem 1rem;border-bottom:1px solid var(--rule);transition:background 0.15s" onmouseover="this.style.background='var(--rule)'" onmouseout="this.style.background=''">
          <span style="color:hsl(0,70%,60%)">${icons.heart}</span>
          <span class="text-sm flex-1">My Favorites</span>
          <span class="text-muted">${icons.chevronRight}</span>
        </a>
        <a href="#/search" class="flex items-center gap-3" style="padding:0.875rem 1rem;transition:background 0.15s" onmouseover="this.style.background='var(--rule)'" onmouseout="this.style.background=''">
          <span style="color:var(--primary)">${icons.messageCircle}</span>
          <span class="text-sm flex-1">My Reviews</span>
          <span class="text-muted">${icons.chevronRight}</span>
        </a>
      </div>

      <!-- Logout -->
      <button class="btn btn-ghost w-full animate-fade-in animate-delay-4" style="margin-top:1rem;color:var(--destructive)" onclick="authLogout();navigate('')">
        ${icons.logOut} Sign Out
      </button>
    </div>`;
  } catch (e) {
    console.error('Failed to load profile:', e);
    container.innerHTML = '<div class="container text-center" style="padding:4rem 1rem"><p class="text-muted">Failed to load profile.</p></div>';
  }
}
