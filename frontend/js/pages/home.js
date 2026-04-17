function homePage(container) {
  container.innerHTML = `

    <!-- ═══ Section 1: Hero — Emotional Hook ═══ -->
    <section class="hero text-center">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div style="position:relative;z-index:1" class="container-sm">
        <div class="hero-pill glass-subtle animate-fade-in">
          <span class="dot"></span>
          Support local. Discover more.
        </div>
        <h1 class="font-extrabold tracking-tight animate-fade-in animate-delay-1" style="font-size:clamp(2.5rem,6vw,4.5rem);margin-bottom:1.25rem;line-height:1.08">
          Your neighborhood has<br/>
          <span class="gradient-text animate-gradient" style="display:inline-block;background-image:linear-gradient(90deg,var(--primary),var(--accent),var(--primary));background-size:200% auto">hidden gems</span>
        </h1>
        <p class="text-lg text-muted animate-fade-in animate-delay-2" style="margin-bottom:2.5rem;max-width:32rem;margin-left:auto;margin-right:auto;line-height:1.7">
          Independent coffee shops, family-owned restaurants, one-of-a-kind boutiques — they're all around you. We help you find them.
        </p>
        <div class="flex justify-center gap-3 flex-wrap animate-fade-in animate-delay-3">
          <a href="#/search" class="btn btn-gradient btn-lg glow-primary">
            ${icons.search} Explore Nearby ${icons.arrowRight}
          </a>
          <button class="btn btn-outline btn-lg" onclick="if(window.openAiChat)openAiChat()">
            ${icons.sparkles} Ask AI
          </button>
        </div>
      </div>
    </section>

    <!-- ═══ Section 2: How It Works — 3-Step Flow ═══ -->
    <section style="padding:5rem 1rem;position:relative">
      <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:600px;height:1px;background:linear-gradient(to right,transparent,hsla(217,91%,60%,0.2),transparent)"></div>
      <div class="container">
        <div class="text-center animate-fade-in" style="margin-bottom:3rem">
          <span class="badge badge-secondary" style="margin-bottom:0.75rem">How it works</span>
          <h2 class="text-3xl font-bold">Three steps to local discovery</h2>
        </div>
        <div class="grid grid-3 gap-6 md-grid-3" id="how-it-works">
          ${[
            {
              step: '01',
              icon: icons.search,
              title: 'Search or Ask',
              desc: 'Tell us what you need — type a query or ask our AI concierge in plain language.',
              color: 'var(--primary)',
              link: '#/search',
              cta: 'Try searching',
            },
            {
              step: '02',
              icon: icons.shield,
              title: 'We Verify Local',
              desc: 'Our chain-detection algorithm filters 500+ chains and scores every business for independence.',
              color: 'var(--green)',
              link: null,
              cta: null,
            },
            {
              step: '03',
              icon: icons.sparkles,
              title: 'Discover Gems',
              desc: 'Get ranked, curated results — verified local businesses with ratings, distance, and real reviews.',
              color: 'var(--accent)',
              link: null,
              cta: null,
            },
          ].map((s, i) => `
            <div class="glass animate-fade-in" style="border-radius:0.75rem;padding:1.75rem;animation-delay:${0.1 + i * 0.15}s;position:relative;overflow:hidden">
              <div style="position:absolute;top:1rem;right:1rem;font-size:3rem;font-weight:800;opacity:0.04;line-height:1">${s.step}</div>
              <div style="width:2.75rem;height:2.75rem;border-radius:0.75rem;background:${s.color}15;display:flex;align-items:center;justify-content:center;margin-bottom:1rem;color:${s.color}">
                <span class="icon icon-lg">${s.icon}</span>
              </div>
              <h3 class="font-semibold text-lg" style="margin-bottom:0.5rem">${s.title}</h3>
              <p class="text-sm text-muted leading-relaxed" style="margin-bottom:${s.cta ? '1rem' : '0'}">${s.desc}</p>
              ${s.cta ? `<a href="${s.link}" class="text-sm text-primary font-medium flex items-center gap-1" style="transition:gap 0.2s" onmouseover="this.style.gap='0.5rem'" onmouseout="this.style.gap='0.25rem'">${s.cta} ${icons.arrowRight}</a>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- ═══ Section 3: Live Preview — Curated Highlights ═══ -->
    <section style="padding:4rem 1rem">
      <div class="container">
        <div class="flex items-center justify-between flex-wrap gap-2 animate-fade-in" style="margin-bottom:2rem">
          <div>
            <h2 class="text-2xl font-bold" style="margin-bottom:0.25rem">Near you right now</h2>
            <p class="text-sm text-muted">Curated picks based on your location</p>
          </div>
          <a href="#/search" class="btn btn-ghost btn-sm text-muted">See all ${icons.arrowRight}</a>
        </div>
        <div id="home-highlights" class="grid grid-3 gap-4 md-grid-2 lg-grid-3">
          ${renderSkeleton(3)}
        </div>
      </div>
    </section>

    <!-- ═══ Section 4: AI Spotlight — Interactive Teaser ═══ -->
    <section style="padding:4rem 1rem;position:relative">
      <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:600px;height:1px;background:linear-gradient(to right,transparent,hsla(262,83%,58%,0.2),transparent)"></div>
      <div class="container" style="max-width:56rem">
        <div class="grid md-grid-2 gap-8 items-center">
          <!-- Left: explanation -->
          <div class="animate-fade-in">
            <span class="badge badge-secondary" style="margin-bottom:0.75rem;background:hsla(262,83%,58%,0.1);color:var(--accent);border-color:hsla(262,83%,58%,0.2)">AI-Powered</span>
            <h2 class="text-3xl font-bold" style="margin-bottom:1rem;line-height:1.2">Ask anything about<br/>local businesses</h2>
            <p class="text-muted leading-relaxed" style="margin-bottom:1.5rem">
              Our two-stage AI pipeline first understands your intent — are you looking for the cheapest option? The closest? The best rated? — then ranks every nearby business using 8 weighted signals including distance, Bayesian ratings, and independence score.
            </p>
            <button class="btn btn-gradient glow-primary" onclick="if(window.openAiChat)openAiChat()">
              ${icons.sparkles} Try the AI Assistant
            </button>
          </div>
          <!-- Right: mock conversation -->
          <div class="glass animate-fade-in animate-delay-2" style="border-radius:1rem;padding:1.25rem;max-width:24rem;margin-left:auto">
            <div class="flex items-center gap-2" style="margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid hsla(0,0%,100%,0.05)">
              <div class="gradient-primary" style="width:1.75rem;height:1.75rem;border-radius:0.375rem;display:flex;align-items:center;justify-content:center;color:white">${icons.sparkles}</div>
              <span class="text-sm font-semibold">AI Assistant</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.75rem">
              <div class="msg-row user">
                <div class="msg-bubble user gradient-primary" style="font-size:0.8rem">Best coffee shop near me?</div>
              </div>
              <div class="msg-row">
                <div class="msg-avatar gradient-primary" style="color:white;width:1.25rem;height:1.25rem">${icons.bot}</div>
                <div class="msg-bubble assistant" style="font-size:0.8rem">
                  I'd check out <strong>Oak & Bean</strong> — it's a cozy neighborhood roaster just 0.3 miles away with a 4.6 rating. ☕ Regulars love the oat milk latte!
                  <div class="suggestion-card" style="margin-top:0.5rem;pointer-events:none;cursor:default">
                    <div class="flex items-center justify-between">
                      <span class="font-medium" style="font-size:0.7rem">Oak & Bean Coffee</span>
                      <span class="badge badge-green" style="font-size:0.5rem;padding:0 0.25rem">✓</span>
                    </div>
                    <div class="flex items-center gap-1-5 text-xs text-muted" style="margin-top:0.125rem;font-size:0.65rem">
                      <span>⭐ 4.6</span>
                      <span>0.3km</span>
                      <span style="color:var(--green)">Open</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ Section 5: Quick Actions — Category Grid ═══ -->
    <section style="padding:4rem 1rem">
      <div class="container">
        <div class="text-center animate-fade-in" style="margin-bottom:2rem">
          <h2 class="text-2xl font-bold" style="margin-bottom:0.5rem">What are you looking for?</h2>
          <p class="text-sm text-muted">Jump straight to a category</p>
        </div>
        <div class="grid grid-3 gap-3 md-grid-3 lg-grid-3" style="max-width:48rem;margin:0 auto">
          ${[
            { emoji: '🍽️', label: 'Food & Drink', type: 'restaurant' },
            { emoji: '☕', label: 'Coffee', type: 'cafe' },
            { emoji: '🛍️', label: 'Shopping', type: 'clothing_store' },
            { emoji: '💆', label: 'Beauty & Spa', type: 'beauty_salon' },
            { emoji: '🏋️', label: 'Fitness', type: 'gym' },
            { emoji: '🍸', label: 'Nightlife', type: 'bar' },
          ].map((c, i) => `
            <a href="#/search" onclick="setTimeout(()=>searchToggleCategory&&searchToggleCategory('${c.type}'),100)"
               class="glass text-center animate-fade-in" style="border-radius:0.75rem;padding:1.5rem 1rem;cursor:pointer;transition:all 0.2s;animation-delay:${0.05 * i}s"
               onmouseover="this.style.background='hsla(224,30%,14%,0.6)';this.style.transform='translateY(-2px)'"
               onmouseout="this.style.background='';this.style.transform=''">
              <div style="font-size:2rem;margin-bottom:0.5rem">${c.emoji}</div>
              <div class="font-medium text-sm">${c.label}</div>
            </a>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- ═══ Section 6: Community CTA ═══ -->
    <section style="padding:4rem 1rem 5rem">
      <div class="container-sm">
        <div class="glass animate-fade-in" style="border-radius:1.25rem;padding:3rem 2rem;position:relative;overflow:hidden;text-align:center">
          <div style="position:absolute;top:-5rem;right:-5rem;width:12rem;height:12rem;border-radius:9999px;background:hsla(217,91%,60%,0.08);filter:blur(80px);pointer-events:none"></div>
          <div style="position:absolute;bottom:-5rem;left:-5rem;width:12rem;height:12rem;border-radius:9999px;background:hsla(262,83%,58%,0.08);filter:blur(80px);pointer-events:none"></div>
          <div style="position:relative;z-index:1">
            <h2 class="text-2xl font-bold" style="margin-bottom:0.5rem">Every search supports a local business</h2>
            <p class="text-muted" style="margin-bottom:2rem;max-width:28rem;margin-left:auto;margin-right:auto">
              Our algorithms ensure chains never overshadow the independent shops, restaurants, and services that make your neighborhood unique.
            </p>
            <div class="flex justify-center gap-8" style="margin-bottom:2rem">
              <div class="text-center">
                <div class="text-2xl font-bold">500+</div>
                <div class="text-xs text-muted">Chains filtered</div>
              </div>
              <div class="text-center">
                <div class="text-2xl font-bold">8</div>
                <div class="text-xs text-muted">Scoring signals</div>
              </div>
              <div class="text-center">
                <div class="text-2xl font-bold">2-stage</div>
                <div class="text-xs text-muted">AI pipeline</div>
              </div>
            </div>
            <div class="flex justify-center gap-3 flex-wrap">
              <a href="#/search" class="btn btn-gradient glow-primary">${icons.search} Start Exploring</a>
              ${!authIsAuthenticated() ? `<a href="#/register" class="btn btn-outline">Create Account</a>` : ''}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  // Load curated highlights (only 3, not a full dump)
  loadHomeHighlights();
}

async function loadHomeHighlights() {
  const loc = locationGet();
  if (!loc) {
    const el = document.getElementById('home-highlights');
    if (el) el.innerHTML = `
      <div class="glass text-center" style="grid-column:1/-1;border-radius:0.75rem;padding:3rem 1rem">
        <span class="icon icon-xl text-muted" style="margin-bottom:0.75rem;display:block">${icons.mapPin}</span>
        <p class="text-muted" style="margin-bottom:1rem">Enable location to see businesses near you</p>
        <button class="btn btn-outline" onclick="locationRequest().then(()=>loadHomeHighlights()).catch(()=>{})">
          ${icons.navigation} Enable Location
        </button>
      </div>`;
    return;
  }

  try {
    const data = await businessApi.search({
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius: 2000,
    });

    const el = document.getElementById('home-highlights');
    if (!el) return;

    const businesses = data.businesses || [];
    if (businesses.length === 0) {
      el.innerHTML = '<div class="text-center text-muted" style="padding:2rem;grid-column:1/-1"><p>No businesses found nearby yet.</p></div>';
      return;
    }

    // Pick 3 curated highlights with labels
    const picks = [];

    // "Verified Local" — highest independence score
    const verified = businesses.find(b => b.local_badge === 'verified_local');
    if (verified) picks.push({ biz: verified, label: '✓ Verified Local', sublabel: 'Confirmed independent business' });

    // "Highest Rated" — best rating with enough reviews
    const rated = [...businesses].sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0)).find(b => !picks.some(p => p.biz.id === b.id));
    if (rated) picks.push({ biz: rated, label: '⭐ Highest Rated', sublabel: `${Number(rated.average_rating || 0).toFixed(1)} stars from ${rated.review_count || 0} reviews` });

    // "Closest" — nearest business
    const closest = businesses.find(b => !picks.some(p => p.biz.id === b.id));
    if (closest) picks.push({ biz: closest, label: '📍 Closest to You', sublabel: `${Number(closest.distance_km || 0).toFixed(1)} km away` });

    el.innerHTML = picks.map((pick, i) => `
      <div class="glass animate-fade-in" style="border-radius:0.75rem;overflow:hidden;cursor:pointer;transition:all 0.3s;animation-delay:${i * 0.1}s"
           onclick="navigate('business/${pick.biz.id}')"
           onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        ${pick.biz.photo_url ? `
          <div style="height:10rem;overflow:hidden;position:relative">
            <img src="${pick.biz.photo_url}" alt="${pick.biz.name}" style="width:100%;height:100%;object-fit:cover" loading="lazy" />
            <div style="position:absolute;inset:0;background:linear-gradient(to top,hsla(0,0%,0%,0.7),transparent)"></div>
            <div style="position:absolute;bottom:0.75rem;left:0.75rem;right:0.75rem">
              <span class="badge badge-gradient" style="font-size:0.65rem;margin-bottom:0.375rem">${pick.label}</span>
              <div class="font-semibold text-base" style="color:white;text-shadow:0 1px 3px rgba(0,0,0,0.5)">${pick.biz.name}</div>
            </div>
          </div>
        ` : `
          <div style="padding:1.25rem 1.25rem 0">
            <span class="badge badge-gradient" style="font-size:0.65rem;margin-bottom:0.5rem">${pick.label}</span>
            <div class="font-semibold text-lg">${pick.biz.name}</div>
          </div>
        `}
        <div style="padding:0.75rem 1.25rem 1.25rem">
          <p class="text-xs text-muted" style="margin-bottom:0.5rem">${pick.sublabel}</p>
          <div class="flex items-center gap-3 text-xs text-muted">
            <span class="flex items-center gap-1">${renderStars(pick.biz.average_rating || 0, 12)} ${Number(pick.biz.average_rating || 0).toFixed(1)}</span>
            ${pick.biz.primary_type_display_name ? `<span>${pick.biz.primary_type_display_name}</span>` : ''}
            ${pick.biz.is_open_now != null ? `<span style="color:${pick.biz.is_open_now ? 'var(--green)' : 'var(--red)'}">${pick.biz.is_open_now ? 'Open' : 'Closed'}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');

  } catch (e) {
    console.error('Failed to load highlights:', e);
  }
}
