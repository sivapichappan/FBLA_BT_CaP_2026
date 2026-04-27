/* ─── SVG Icons ──────────────────────────────────────────────────────── */

const icons = {
  mapPin: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  search: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  star: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  heart: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  tag: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
  user: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  send: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>',
  sparkles: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>',
  x: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  menu: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>',
  logOut: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>',
  arrowRight: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  clock: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  dollar: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  phone: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  globe: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
  navigation: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
  share: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>',
  trash: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
  shield: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>',
  chevronRight: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  trophy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  mail: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  calendar: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
  bot: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
  messageCircle: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  settings: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
};

/* ─── Reusable Render Functions ──────────────────────────────────────── */

function renderStars(rating, size = 14) {
  let html = '';
  for (let i = 0; i < 5; i++) {
    const filled = i < Math.round(rating);
    html += `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${filled ? 'fill="var(--yellow)"' : 'fill="none"'} stroke="${filled ? 'var(--yellow)' : 'hsla(0,0%,100%,0.1)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  }
  return `<span class="stars">${html}</span>`;
}

function renderPriceLevel(level) {
  if (!level) return '';
  return '$'.repeat(level);
}

function renderBusinessCard(biz) {
  const photoHtml = biz.photo_url ? `
    <div class="biz-photo">
      <img src="${biz.photo_url}" alt="${biz.name}" loading="lazy" />
      <div class="overlay"></div>
      ${biz.is_open_now != null ? `<span class="status-badge ${biz.is_open_now ? 'status-open' : 'status-closed'}">${biz.is_open_now ? 'Open' : 'Closed'}</span>` : ''}
      ${biz.price_level ? `<span class="status-badge glass-subtle" style="top:0.625rem;left:0.625rem;right:auto;">${renderPriceLevel(biz.price_level)}</span>` : ''}
    </div>` : '';

  const localBadge = biz.local_badge === 'verified_local'
    ? '<span class="badge badge-green">✓ Verified Local</span>'
    : biz.local_badge === 'likely_local'
    ? '<span class="badge badge-outline" style="border-color:hsla(142,71%,45%,0.2);color:hsl(142,60%,55%)">~ Likely Local</span>'
    : '';

  const categoryBadge = (biz.primary_type_display_name || biz.category_name)
    ? `<span class="badge badge-secondary">${biz.primary_type_display_name || biz.category_name}</span>` : '';

  return `
    <div class="biz-card glass" onclick="navigate('business/${biz.id}')">
      ${photoHtml}
      <div class="biz-body">
        <div class="biz-name line-clamp-1">${biz.name}</div>
        <div class="flex flex-wrap gap-1" style="margin-bottom:0.5rem">
          ${categoryBadge}${localBadge}
        </div>
        <div class="flex items-center gap-2" style="margin-bottom:0.5rem">
          ${renderStars(biz.average_rating || 0)}
          <span class="text-sm font-semibold">${Number(biz.average_rating || 0).toFixed(1)}</span>
          <span class="text-xs text-muted">(${biz.review_count || 0})</span>
        </div>
        ${biz.address_line_1 ? `<div class="flex items-center gap-1-5 text-xs text-muted"><span class="icon icon-sm">${icons.mapPin}</span><span class="line-clamp-1">${biz.address_line_1}</span></div>` : ''}
        <div class="biz-bottom flex items-center justify-between text-xs text-muted">
          ${!biz.photo_url && biz.is_open_now != null ? `<span class="flex items-center gap-1 font-medium" style="color:${biz.is_open_now ? 'var(--green)' : 'var(--red)'}">${icons.clock} ${biz.is_open_now ? 'Open now' : 'Closed'}</span>` : '<span></span>'}
          <span class="flex items-center gap-2">
            ${biz.distance_km != null ? `<span class="flex items-center gap-1"><span class="icon icon-sm">${icons.mapPin}</span>${Number(biz.distance_km).toFixed(1)} km</span>` : ''}
          </span>
        </div>
      </div>
    </div>`;
}

function renderSkeleton(count, height = '16rem') {
  return Array.from({ length: count }, () =>
    `<div class="skeleton" style="height:${height}"></div>`
  ).join('');
}

function setButtonLoading(button, loading, loadingLabel = 'Saving...') {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.innerHTML;
    }
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> ${loadingLabel}`;
  } else {
    button.disabled = false;
    if (button.dataset.originalLabel) {
      button.innerHTML = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }
}

/* ─── Header ─────────────────────────────────────────────────────────── */

function renderHeader() {
  const el = document.getElementById('app-header');
  const user = authGetUser();
  const isAuth = authIsAuthenticated();

  const navLinks = `
    <a href="#/" class="btn btn-ghost btn-sm">${icons.mapPin} Home</a>
    <a href="#/search" class="btn btn-ghost btn-sm">${icons.search} Search</a>
    <a href="#/deals" class="btn btn-ghost btn-sm">${icons.tag} Deals</a>
    ${isAuth ? `<a href="#/favorites" class="btn btn-ghost btn-sm">${icons.heart} Favorites</a>` : ''}
  `;

  const authSection = isAuth ? `
    <div class="dropdown">
      <button class="btn btn-ghost btn-sm glass-subtle" style="border-radius:9999px;padding-left:0.5rem" onclick="toggleDropdown(this)">
        <span class="gradient-primary" style="width:1.5rem;height:1.5rem;border-radius:9999px;display:flex;align-items:center;justify-content:center">
          <span style="color:white;font-size:0.65rem">${icons.user}</span>
        </span>
        <span class="text-sm">${user?.first_name || user?.firstName || user?.email?.split('@')[0] || 'User'}</span>
      </button>
      <div class="dropdown-content" id="user-dropdown">
        <button class="dropdown-item" onclick="navigate('profile');closeDropdowns()">${icons.user} Profile</button>
        <button class="dropdown-item" onclick="navigate('favorites');closeDropdowns()">${icons.heart} Favorites</button>
        <button class="dropdown-item" onclick="navigate('settings');closeDropdowns()">${icons.settings} Settings</button>
        <div class="dropdown-separator"></div>
        <button class="dropdown-item" style="color:var(--destructive)" onclick="authLogout();closeDropdowns()">${icons.logOut} Logout</button>
      </div>
    </div>
  ` : `
    <a href="#/login" class="btn btn-ghost btn-sm">Login</a>
    <a href="#/register" class="btn btn-gradient btn-sm">Sign Up</a>
  `;

  el.innerHTML = `
    <div class="site-header">
      <div class="container flex items-center justify-between inner">
        <a href="#/" class="header-logo">
          <span class="logo-icon gradient-primary"><span style="color:white">${icons.mapPin}</span></span>
          LocalDiscover
        </a>
        <nav class="flex items-center gap-1 md-hidden sm-hidden" style="display:none" id="desktop-nav">
          ${navLinks}
        </nav>
        <div class="flex items-center gap-2 md-hidden sm-hidden" style="display:none" id="desktop-auth">
          ${authSection}
        </div>
        <button class="btn btn-ghost btn-icon" onclick="toggleMobileMenu()" id="mobile-menu-btn">
          ${icons.menu}
        </button>
      </div>
    </div>
    <div class="sheet-overlay" id="mobile-overlay" onclick="closeMobileMenu()"></div>
    <div class="sheet" id="mobile-sheet">
      <nav class="flex flex-col gap-1" style="margin-top:2rem">
        ${navLinks.replace(/btn-sm/g, 'btn-sm" style="justify-content:flex-start')}
        ${isAuth ? `
          <a href="#/profile" class="btn btn-ghost btn-sm" style="justify-content:flex-start" onclick="closeMobileMenu()">${icons.user} Profile</a>
          <a href="#/settings" class="btn btn-ghost btn-sm" style="justify-content:flex-start" onclick="closeMobileMenu()">${icons.settings} Settings</a>
          <div class="separator"></div>
          <button class="btn btn-ghost btn-sm" style="justify-content:flex-start;color:var(--destructive)" onclick="authLogout();closeMobileMenu()">${icons.logOut} Logout</button>
        ` : `
          <div class="separator"></div>
          <a href="#/login" class="btn btn-ghost btn-sm" style="justify-content:flex-start" onclick="closeMobileMenu()">Login</a>
          <a href="#/register" class="btn btn-gradient btn-sm" style="justify-content:flex-start" onclick="closeMobileMenu()">Sign Up</a>
        `}
      </nav>
    </div>
  `;

  // Show desktop nav on wider screens
  const mq = window.matchMedia('(min-width: 768px)');
  function updateNav() {
    const dn = document.getElementById('desktop-nav');
    const da = document.getElementById('desktop-auth');
    const mb = document.getElementById('mobile-menu-btn');
    if (dn) dn.style.display = mq.matches ? 'flex' : 'none';
    if (da) da.style.display = mq.matches ? 'flex' : 'none';
    if (mb) mb.style.display = mq.matches ? 'none' : 'flex';
  }
  updateNav();
  mq.addEventListener('change', updateNav);
}

function toggleDropdown(btn) {
  const dd = btn.parentElement.querySelector('.dropdown-content');
  dd.classList.toggle('open');
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!btn.parentElement.contains(e.target)) {
        dd.classList.remove('open');
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

function closeDropdowns() {
  document.querySelectorAll('.dropdown-content').forEach(d => d.classList.remove('open'));
}

function toggleMobileMenu() {
  document.getElementById('mobile-overlay').classList.toggle('open');
  document.getElementById('mobile-sheet').classList.toggle('open');
}

function closeMobileMenu() {
  document.getElementById('mobile-overlay').classList.remove('open');
  document.getElementById('mobile-sheet').classList.remove('open');
}

/* ─── Footer ─────────────────────────────────────────────────────────── */

function renderFooter() {
  document.getElementById('app-footer').innerHTML = `
    <div class="site-footer">
      <div class="container">
        <div class="grid grid-3 footer-grid">
          <div>
            <div class="header-logo" style="margin-bottom:0.75rem">
              <span class="logo-icon gradient-primary" style="width:1.75rem;height:1.75rem;border-radius:0.375rem"><span style="color:white;font-size:0.7rem">${icons.mapPin}</span></span>
              <span class="font-bold text-lg">LocalDiscover</span>
            </div>
            <p class="text-sm text-muted">Discover and support local businesses in your community.</p>
          </div>
          <div class="footer-section">
            <h3>Explore</h3>
            <a href="#/search" class="footer-link">Search Businesses</a>
            <a href="#/deals" class="footer-link">Deals & Offers</a>
          </div>
          <div class="footer-section">
            <h3>Account</h3>
            <a href="#/login" class="footer-link">Login</a>
            <a href="#/register" class="footer-link">Sign Up</a>
            <a href="#/favorites" class="footer-link">Favorites</a>
          </div>
        </div>
        <div class="footer-bottom text-center">
          &copy; ${new Date().getFullYear()} LocalDiscover. Built for FBLA Business Technology.
        </div>
      </div>
    </div>`;
}

// Re-render header on auth changes
window.addEventListener('auth-changed', renderHeader);
