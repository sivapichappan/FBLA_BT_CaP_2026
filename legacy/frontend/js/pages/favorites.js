async function favoritesPage(container) {
  if (!authIsAuthenticated()) {
    container.innerHTML = `<div class="container text-center" style="padding:6rem 1rem"><div class="glass" style="border-radius:0.75rem;padding:3rem;max-width:28rem;margin:0 auto"><p class="text-muted">Please log in to view your favorites.</p><a href="#/login" class="btn btn-gradient" style="margin-top:1rem">Sign In</a></div></div>`;
    return;
  }

  container.innerHTML = `<div class="container" style="padding:2rem 1rem">
    <div class="flex items-center gap-3 animate-fade-in" style="margin-bottom:1.5rem">
      <div style="width:2.25rem;height:2.25rem;border-radius:0.75rem;background:hsla(0,84%,60%,0.1);display:flex;align-items:center;justify-content:center;color:hsl(0,70%,60%)">${icons.heart}</div>
      <h1 class="text-3xl font-bold">My Favorites</h1>
      <span class="badge badge-secondary" id="fav-count"></span>
    </div>
    <div id="fav-grid" class="grid grid-3 gap-4 md-grid-2 lg-grid-3">${renderSkeleton(6)}</div>
    <div id="fav-empty" style="display:none" class="text-center glass" style="padding:5rem 1rem;border-radius:0.75rem">
      <span style="font-size:3.5rem;display:block;margin-bottom:1rem;opacity:0.2">${icons.heart}</span>
      <h2 class="text-xl font-semibold" style="margin-bottom:0.5rem">No favorites yet</h2>
      <p class="text-sm text-muted" style="margin-bottom:1.5rem">Browse businesses and click the heart to save your favorites.</p>
      <a href="#/search" class="btn btn-gradient">Explore Businesses</a>
    </div>
  </div>`;

  try {
    const data = await favoriteApi.getAll();
    const favs = data.favorites || [];
    document.getElementById('fav-count').textContent = favs.length;

    if (favs.length === 0) {
      document.getElementById('fav-grid').innerHTML = '';
      document.getElementById('fav-empty').style.display = 'block';
      return;
    }

    document.getElementById('fav-grid').innerHTML = favs.map(f => `
      <div class="fav-card-wrap" style="position:relative" id="fav-${f.id}">
        ${renderBusinessCard(f)}
        <button class="fav-btn fav-btn-overlay is-fav" onclick="event.stopPropagation();removeFav('${f.id}')" aria-label="Remove from favorites" title="Remove from favorites">
          ${icons.heartFilled}
        </button>
      </div>
    `).join('');
  } catch (e) {
    console.error('Failed to load favorites:', e);
    document.getElementById('fav-grid').innerHTML = '<p class="text-muted text-center" style="padding:2rem;grid-column:1/-1">Failed to load favorites.</p>';
  }
}

async function removeFav(id) {
  try {
    await favoriteApi.remove(id);
    const el = document.getElementById(`fav-${id}`);
    if (el) el.remove();
    const count = document.getElementById('fav-count');
    if (count) count.textContent = Math.max(0, parseInt(count.textContent || '0') - 1);
  } catch (e) {
    console.error('Remove favorite failed:', e);
  }
}
