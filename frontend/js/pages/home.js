function homePage(container) {
  container.innerHTML = `
    <section class="hero text-center">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div style="position:relative;z-index:1" class="container-sm">
        <div class="hero-pill glass-subtle animate-fade-in">
          <span class="dot"></span>
          <span class="icon icon-sm">${icons.sparkles}</span>
          AI-powered local business discovery
        </div>
        <h1 class="text-5xl font-extrabold tracking-tight animate-fade-in animate-delay-1" style="margin-bottom:1.25rem;line-height:1.1">
          Discover <span class="gradient-text animate-gradient" style="display:inline-block;background-image:linear-gradient(90deg,var(--primary),var(--accent),var(--primary));background-size:200% auto">Local Businesses</span><br/>Near You
        </h1>
        <p class="text-lg text-muted animate-fade-in animate-delay-2" style="margin-bottom:2rem;max-width:36rem;margin-left:auto;margin-right:auto">
          Find the best independent restaurants, shops, and services in your area. Support local businesses, discover hidden gems.
        </p>
        <div class="flex justify-center gap-3 flex-wrap animate-fade-in animate-delay-3">
          <a href="#/search" class="btn btn-gradient btn-lg glow-primary">${icons.search} Start Exploring ${icons.arrowRight}</a>
        </div>
        <div id="home-stats" class="flex justify-center gap-8 animate-fade-in animate-delay-5" style="margin-top:3.5rem"></div>
      </div>
    </section>

    <section class="container" style="padding-top:3rem;padding-bottom:3rem" id="home-nearby">
      <div class="flex items-center justify-between" style="margin-bottom:1.5rem">
        <h2 class="text-2xl font-bold">Businesses Near You</h2>
        <a href="#/search" class="btn btn-ghost btn-sm text-muted">${icons.arrowRight} View all</a>
      </div>
      <div id="home-map" class="map-container" style="margin-bottom:2rem"></div>
      <div id="home-businesses" class="grid grid-3 gap-4 md-grid-2 lg-grid-3">
        ${renderSkeleton(6)}
      </div>
    </section>

    <section style="padding:5rem 1rem;position:relative">
      <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:600px;height:1px;background:linear-gradient(to right,transparent,hsla(217,91%,60%,0.2),transparent)"></div>
      <div class="container">
        <div class="text-center animate-fade-in" style="margin-bottom:3rem">
          <h2 class="text-3xl font-bold" style="margin-bottom:0.75rem">Why Choose LocalDiscover?</h2>
          <p class="text-muted" style="max-width:32rem;margin:0 auto">Powered by advanced algorithms to connect you with the best independent businesses.</p>
        </div>
        <div class="grid grid-4 gap-4 md-grid-2 lg-grid-4">
          ${[
            { icon: icons.mapPin, title: 'Location-Based', desc: 'Find businesses near you with real-time location detection', color: 'hsl(217,91%,60%)' },
            { icon: icons.shield, title: 'Local Verified', desc: 'Advanced chain detection ensures only independent businesses', color: 'var(--green)' },
            { icon: icons.tag, title: 'Special Deals', desc: 'Discover exclusive coupons and promotions from locals', color: 'var(--yellow)' },
            { icon: icons.messageCircle, title: 'AI Assistant', desc: 'Two-stage AI pipeline for personalized recommendations', color: 'var(--accent)' },
          ].map(f => `
            <div class="glass card-body text-center" style="border-radius:0.75rem">
              <div style="width:3rem;height:3rem;border-radius:0.75rem;background:${f.color}15;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;color:${f.color}">
                <span class="icon icon-xl">${f.icon}</span>
              </div>
              <div class="font-semibold" style="margin-bottom:0.5rem">${f.title}</div>
              <p class="text-sm text-muted leading-relaxed">${f.desc}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <section style="padding:5rem 1rem">
      <div class="container-sm text-center">
        <div class="glass" style="border-radius:1rem;padding:2.5rem;position:relative;overflow:hidden">
          <div style="position:absolute;top:-5rem;right:-5rem;width:10rem;height:10rem;border-radius:9999px;background:hsla(217,91%,60%,0.1);filter:blur(80px);pointer-events:none"></div>
          <div style="position:absolute;bottom:-5rem;left:-5rem;width:10rem;height:10rem;border-radius:9999px;background:hsla(262,83%,58%,0.1);filter:blur(80px);pointer-events:none"></div>
          <div style="position:relative;z-index:1">
            <h2 class="text-2xl font-bold" style="margin-bottom:0.75rem">Ready to explore?</h2>
            <p class="text-muted" style="margin-bottom:1.5rem">Ask our AI assistant to find the perfect local business for you.</p>
            <button class="btn btn-gradient glow-primary" onclick="if(window.openAiChat)openAiChat()">${icons.messageCircle} Chat with AI</button>
          </div>
        </div>
      </div>
    </section>
  `;

  // Stats counter animation
  const statsEl = document.getElementById('home-stats');
  const stats = [
    { value: 10000, suffix: '+', label: 'Local Businesses' },
    { value: 500, suffix: '+', label: 'Cities Covered' },
    { value: 50000, suffix: '+', label: 'Happy Users' },
  ];
  statsEl.innerHTML = stats.map(s => `
    <div class="text-center">
      <div class="text-2xl font-bold" data-count="${s.value}">${s.value.toLocaleString()}${s.suffix}</div>
      <p class="text-xs text-muted" style="margin-top:0.25rem">${s.label}</p>
    </div>
  `).join('');

  // Load businesses
  const loc = locationGet();
  if (!loc) {
    document.getElementById('home-nearby').style.display = 'none';
    locationRequest().then(() => loadHomeBusinesses()).catch(() => {});
  } else {
    loadHomeBusinesses();
  }
}

async function loadHomeBusinesses() {
  const loc = locationGet();
  if (!loc) return;
  document.getElementById('home-nearby').style.display = 'block';

  // Init map
  initHomeMap(loc);

  try {
    const data = await businessApi.search({
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius: 1000,
    });
    const el = document.getElementById('home-businesses');
    if (data.businesses && data.businesses.length > 0) {
      el.innerHTML = data.businesses.map(b => renderBusinessCard(b)).join('');
    } else {
      el.innerHTML = '<div class="text-center text-muted" style="padding:3rem;grid-column:1/-1"><p>No businesses found nearby. Try expanding your search radius.</p></div>';
    }
  } catch (e) {
    console.error('Failed to fetch businesses:', e);
  }
}

function initHomeMap(loc) {
  const mapEl = document.getElementById('home-map');
  if (!mapEl || !window.google) return;
  new google.maps.Map(mapEl, {
    center: { lat: loc.latitude, lng: loc.longitude },
    zoom: 13,
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
    disableDefaultUI: true,
    zoomControl: true,
  });
}
