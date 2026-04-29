async function businessDetailPage(container, id) {
  if (!id) { container.innerHTML = '<div class="container text-center" style="padding:4rem 1rem"><h1 class="text-2xl font-bold">Business not found</h1></div>'; return; }

  container.innerHTML = `<div class="container-md" style="padding:2rem 1rem"><div class="grid grid-2 gap-4 md-grid-2">${renderSkeleton(2, '12rem')}</div></div>`;

  try {
    const data = await businessApi.getById(id);
    const biz = data.business;
    if (!biz) { container.innerHTML = '<div class="container text-center" style="padding:4rem 1rem"><h1 class="text-2xl font-bold">Business not found</h1></div>'; return; }

    const isGP = String(id).startsWith('gp_');
    const photos = biz.photos || [];
    let isFav = false;
    if (authIsAuthenticated()) {
      try { const f = await favoriteApi.check(id); isFav = f.isFavorite; } catch (e) {}
    }

    // Photo gallery
    const photoHtml = photos.length > 0 ? `
      <div class="photo-gallery animate-fade-in">
        <div class="photo-hero" id="detail-hero">
          <img src="${photos[0].url}" alt="${biz.name}" id="detail-hero-img" />
        </div>
        ${photos.length > 1 ? `<div class="photo-thumbs">${photos.map((p, i) => `
          <div class="photo-thumb ${i === 0 ? 'active' : ''}" onclick="detailSetPhoto(${i}, '${p.url}')"><img src="${p.url}" alt="" loading="lazy" /></div>
        `).join('')}</div>` : ''}
      </div>` : '';

    // Status
    const statusHtml = biz.is_open_now === true ? '<span class="badge badge-green">Open Now</span>'
      : biz.is_open_now === false ? '<span class="badge badge-red">Closed</span>'
      : biz.business_status === 'CLOSED_PERMANENTLY' ? '<span class="badge badge-red">Permanently Closed</span>' : '';

    // Price
    const priceHtml = biz.price_level ? `<span class="badge badge-outline">${'$'.repeat(biz.price_level)}</span>` : '';

    // Categories
    const catHtml = (biz.primary_type_display_name ? `<span class="badge badge-secondary">${biz.primary_type_display_name}</span>` : '')
      + (biz.categories || []).map(c => `<span class="badge badge-secondary">${c.name}</span>`).join('');

    // CTA buttons
    const ctaHtml = `<div class="flex flex-wrap gap-2" style="margin-bottom:1.5rem">
      ${biz.google_maps_uri ? `<a href="${biz.google_maps_uri}" target="_blank" class="btn btn-outline btn-sm">${icons.navigation} Directions</a>` : ''}
      ${biz.phone ? `<a href="tel:${biz.phone}" class="btn btn-outline btn-sm">${icons.phone} Call</a>` : ''}
      ${biz.website ? `<a href="${biz.website}" target="_blank" class="btn btn-outline btn-sm">${icons.globe} Website</a>` : ''}
      <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText(location.href);alert('Link copied!')">${icons.share} Share</button>
    </div>`;

    // Favorite button — minimal icon-only, red when favorited
    const favBtnHtml = authIsAuthenticated() ? `
      <button class="fav-btn ${isFav ? 'is-fav' : ''}" id="detail-fav-btn" onclick="detailToggleFav('${id}')" aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
        ${isFav ? icons.heartFilled : icons.heart}
      </button>` : '';

    // Details card
    const detailsCard = `<div class="card glass" style="border-color:hsla(0,0%,100%,0.1)"><div class="card-header"><div class="card-title">Details</div></div><div class="card-body text-sm" style="display:flex;flex-direction:column;gap:0.75rem">
      ${biz.address_line_1 ? `<div class="flex items-start gap-2"><span class="icon icon-md text-muted">${icons.mapPin}</span><span>${biz.address_line_1}${biz.city ? ', ' + biz.city : ''}${biz.state ? ', ' + biz.state : ''}${biz.zip_code ? ' ' + biz.zip_code : ''}</span></div>` : ''}
      ${biz.phone ? `<div class="flex items-center gap-2"><span class="icon icon-md text-muted">${icons.phone}</span><a href="tel:${biz.phone}">${biz.phone}</a></div>` : ''}
      ${biz.website ? `<div class="flex items-center gap-2"><span class="icon icon-md text-muted">${icons.globe}</span><a href="${biz.website}" target="_blank" class="text-primary truncate" style="max-width:min(16rem,60vw)">${biz.website.replace(/^https?:\/\/(www\.)?/, '')}</a></div>` : ''}
    </div></div>`;

    // Hours card
    const hoursCard = (biz.weekday_descriptions && biz.weekday_descriptions.length > 0) ? `
      <div class="card glass" style="border-color:hsla(0,0%,100%,0.1)"><div class="card-header"><div class="card-title flex items-center gap-2">${icons.clock} Hours ${biz.is_open_now != null ? `<span class="text-xs font-medium" style="color:${biz.is_open_now ? 'var(--green)' : 'var(--red)'}">${biz.is_open_now ? '• Open now' : '• Closed'}</span>` : ''}</div></div>
        <div class="card-body text-sm" style="display:flex;flex-direction:column;gap:0.375rem">
          ${biz.weekday_descriptions.map(t => { const p = t.split(': '); return `<div class="flex justify-between"><span class="font-medium">${p[0]}</span><span class="text-muted">${p.slice(1).join(': ')}</span></div>`; }).join('')}
        </div>
      </div>` : '';

    // Reviews
    const reviews = biz.reviews || [];
    const reviewsHtml = `<div style="margin-top:2rem"><h2 class="text-xl font-bold" style="margin-bottom:1rem">Reviews (${reviews.length})</h2>
      ${reviews.length === 0 ? '<p class="text-muted text-center" style="padding:1.5rem">No reviews yet.</p>' :
        reviews.map(r => `<div class="card glass" style="margin-bottom:0.75rem;border-color:hsla(0,0%,100%,0.1)"><div class="card-body">
          <div class="flex items-center justify-between" style="margin-bottom:0.75rem">
            <div class="flex items-center gap-3">
              <div style="width:2.25rem;height:2.25rem;border-radius:9999px;background:hsla(217,91%,60%,0.1);display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:600">${(r.user?.firstName || r.user?.username || '?')[0]}</div>
              <div><p class="font-medium text-sm">${r.user?.firstName || ''} ${r.user?.lastName || ''}</p><p class="text-xs text-muted">${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</p></div>
            </div>
            <div>${renderStars(r.rating)}</div>
          </div>
          ${r.title ? `<p class="font-semibold text-sm" style="margin-bottom:0.25rem">${r.title}</p>` : ''}
          ${r.content ? `<p class="text-sm text-muted leading-relaxed">${r.content}</p>` : ''}
        </div></div>`).join('')}
    </div>`;

    // Editorial
    const editorialHtml = biz.editorial_summary ? `<p class="text-muted text-sm" style="border-left:2px solid hsla(217,91%,60%,0.3);padding-left:1rem;margin-bottom:1.5rem;font-style:italic">${biz.editorial_summary}</p>` : '';

    container.innerHTML = `<div class="container-md" style="padding:2rem 1rem">
      ${photoHtml}
      <div class="animate-fade-in animate-delay-1">
        <div class="flex justify-between items-start gap-4 flex-wrap" style="margin-bottom:1rem">
          <div>
            <div class="flex items-center gap-3 flex-wrap"><h1 class="text-3xl font-bold">${biz.name}</h1>${statusHtml}</div>
            <div class="flex flex-wrap items-center gap-2" style="margin-top:0.5rem">${catHtml}${priceHtml}</div>
            <div class="flex items-center gap-4 text-sm text-muted" style="margin-top:0.75rem">
              <span class="flex items-center gap-1">${renderStars(biz.average_rating || 0)} <span class="font-medium" style="margin-left:0.25rem">${Number(biz.average_rating || 0).toFixed(1)}</span> <span>(${biz.review_count || 0} reviews)</span></span>
            </div>
          </div>
          ${favBtnHtml}
        </div>
      </div>
      <div class="animate-fade-in animate-delay-2">${ctaHtml}</div>
      <div class="animate-fade-in animate-delay-3">${editorialHtml}</div>
      <div class="grid md-grid-2 gap-6 animate-fade-in animate-delay-4" style="margin-bottom:2rem">${detailsCard}${hoursCard}</div>
      <div class="animate-fade-in animate-delay-5">${reviewsHtml}</div>
    </div>`;
  } catch (e) {
    console.error('Failed to load business:', e);
    container.innerHTML = '<div class="container text-center" style="padding:4rem 1rem"><h1 class="text-2xl font-bold">Failed to load business</h1></div>';
  }
}

function detailSetPhoto(index, url) {
  document.getElementById('detail-hero-img').src = url;
  document.querySelectorAll('.photo-thumb').forEach((t, i) => t.classList.toggle('active', i === index));
}

async function detailToggleFav(id) {
  const btn = document.getElementById('detail-fav-btn');
  try {
    const check = await favoriteApi.check(id);
    if (check.isFavorite) {
      await favoriteApi.remove(id);
      btn.classList.remove('is-fav');
      btn.innerHTML = icons.heart;
      btn.setAttribute('aria-label', 'Add to favorites');
      btn.setAttribute('title', 'Add to favorites');
    } else {
      const isGP = String(id).startsWith('gp_');
      if (isGP) {
        const titleEl = document.querySelector('h1');
        await favoriteApi.add({ googlePlaceId: id.slice(3), placeName: titleEl?.textContent || '' });
      } else {
        await favoriteApi.add({ businessId: parseInt(id) });
      }
      btn.classList.add('is-fav');
      btn.innerHTML = icons.heartFilled;
      btn.setAttribute('aria-label', 'Remove from favorites');
      btn.setAttribute('title', 'Remove from favorites');
    }
  } catch (e) {
    console.error('Toggle favorite failed:', e);
  }
}
