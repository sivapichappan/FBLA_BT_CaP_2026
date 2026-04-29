async function dealsPage(container) {
  container.innerHTML = `<div class="container" style="padding:2rem 1rem">
    <div class="flex items-center gap-3 animate-fade-in" style="margin-bottom:1.5rem">
      <div style="width:2.25rem;height:2.25rem;border-radius:0.75rem;background:hsla(45,93%,47%,0.1);display:flex;align-items:center;justify-content:center;color:var(--yellow)">${icons.tag}</div>
      <h1 class="text-3xl font-bold">Deals & Offers</h1>
    </div>
    <div id="deals-grid" class="grid grid-3 gap-4 md-grid-2 lg-grid-3">${renderSkeleton(6)}</div>
    <div id="deals-empty" style="display:none" class="text-center glass" style="padding:5rem 1rem;border-radius:0.75rem">
      <span style="font-size:3.5rem;display:block;margin-bottom:1rem;opacity:0.2">${icons.tag}</span>
      <h2 class="text-xl font-semibold" style="margin-bottom:0.5rem">No deals available</h2>
      <p class="text-sm text-muted">Check back later for new deals and offers.</p>
    </div>
  </div>`;

  try {
    const loc = locationGet();
    const params = { limit: 50 };
    if (loc) { params.latitude = loc.latitude; params.longitude = loc.longitude; params.radius = 25; }

    const data = await dealApi.getAllActive(params);
    const deals = data.deals || [];

    if (deals.length === 0) {
      document.getElementById('deals-grid').innerHTML = '';
      document.getElementById('deals-empty').style.display = 'block';
      return;
    }

    document.getElementById('deals-grid').innerHTML = deals.map(d => `
      <div class="glass" style="border-radius:0.75rem;overflow:hidden">
        <div class="card-body">
          <div class="flex items-start justify-between gap-2" style="margin-bottom:0.5rem">
            <h3 class="font-semibold text-base">${d.title}</h3>
            <span class="badge badge-gradient">${d.discount_type === 'percent' ? d.discount_value + '% off' : '$' + d.discount_value + ' off'}</span>
          </div>
          ${d.business_name ? `<a href="#/business/${d.business_id}" class="text-sm text-primary flex items-center gap-1" style="margin-bottom:0.75rem"><span class="icon icon-sm">${icons.mapPin}</span>${d.business_name}</a>` : ''}
          ${d.description ? `<p class="text-sm text-muted line-clamp-2" style="margin-bottom:1rem">${d.description}</p>` : ''}
          <div class="flex items-center justify-between" style="padding-top:0.75rem;border-top:1px solid var(--rule)">
            ${d.end_date ? `<span class="text-xs text-muted flex items-center gap-1">${icons.clock} Expires ${new Date(d.end_date).toLocaleDateString()}</span>` : '<span></span>'}
            ${authIsAuthenticated() ? `<button class="btn btn-gradient btn-sm" onclick="claimDeal(${d.id})">Claim</button>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Failed to load deals:', e);
    document.getElementById('deals-grid').innerHTML = '<p class="text-muted text-center" style="padding:2rem;grid-column:1/-1">Failed to load deals.</p>';
  }
}

async function claimDeal(dealId) {
  try {
    const data = await dealApi.redeem(dealId);
    alert('Deal claimed! Your code: ' + (data.claim?.redemption_code || 'N/A'));
  } catch (e) {
    alert(e.message || 'Failed to claim deal');
  }
}
