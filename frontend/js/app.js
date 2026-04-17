/* ─── SPA Router ─────────────────────────────────────────────────────── */

function navigate(path) {
  window.location.hash = '#/' + path;
}

function getRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/');
  return { page: parts[0] || '', param: parts.slice(1).join('/') };
}

async function router() {
  const { page, param } = getRoute();
  const main = document.getElementById('app-main');
  main.scrollTop = 0;
  window.scrollTo(0, 0);

  closeMobileMenu();
  closeDropdowns();

  switch (page) {
    case '':
      homePage(main);
      break;
    case 'login':
      loginPage(main);
      break;
    case 'register':
      registerPage(main);
      break;
    case 'search':
      searchPage(main);
      break;
    case 'business':
      await businessDetailPage(main, param);
      break;
    case 'favorites':
      await favoritesPage(main);
      break;
    case 'deals':
      await dealsPage(main);
      break;
    case 'profile':
      await profilePage(main);
      break;
    default:
      main.innerHTML = `<div class="container text-center" style="padding:6rem 1rem">
        <h1 class="text-6xl font-bold gradient-text" style="margin-bottom:1rem">404</h1>
        <p class="text-muted">Page not found</p>
      </div>`;
  }
}

/* ─── Init ───────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderFooter();
  initAiChat();
  router();

  // Request location on first load
  if (!locationGet()) {
    locationRequest().catch(() => {});
  }
});

window.addEventListener('hashchange', router);
window.addEventListener('location-changed', () => {
  // Re-fetch if on home or search page
  const { page } = getRoute();
  if (page === '' || page === 'search') router();
});
