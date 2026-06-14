function homePage(container) {
  container.innerHTML = `

    <!-- ═══ HERO ═══ -->
    <section class="hero text-center">
      <div style="max-width:38rem;margin:0 auto;padding:0 1rem">
        <div class="hero-pill animate-fade-in">
          <span class="dot"></span>
          Independents only · Real-time discovery
        </div>
        <h1 class="hero-headline animate-fade-in animate-delay-1" style="margin-bottom:1.5rem">
          We hide the chains <em class="hero-accent-word">so you can find the originals.</em>
        </h1>
        <p class="text-lg text-muted animate-fade-in animate-delay-2" style="margin-bottom:2.5rem;max-width:34rem;margin-left:auto;margin-right:auto;line-height:1.7">
          Oak &amp; Bean, not Starbucks. Casa Linda, not Chipotle. The bookshop that knows your name, not the one with the airport food court.
        </p>
        <div class="flex justify-center gap-3 flex-wrap animate-fade-in animate-delay-3">
          <a href="#/search" class="btn btn-primary btn-lg">
            ${icons.search} Start exploring
          </a>
          <button class="btn btn-outline btn-lg" onclick="if(window.openAiChat)openAiChat()">
            ${icons.sparkles} Ask the concierge
          </button>
        </div>
      </div>
    </section>

    <!-- ═══ HOW IT WORKS — asymmetric: quote · stat · list ═══ -->
    <section style="padding:5rem 1rem">
      <div class="container">
        <div class="animate-fade-in" style="margin-bottom:2.5rem">
          <span class="eyebrow">How it works</span>
          <h2 class="text-3xl" style="margin-top:0.375rem;text-align:left">The whole point.</h2>
        </div>
        <div class="grid grid-3 gap-6 md-grid-3">
          <!-- 1. Pull-quote -->
          <div class="editorial-quote animate-fade-in animate-delay-1">
            <blockquote>"You type 'cheap dinner.' We hand back the family taqueria, not the chain burrito factory."</blockquote>
            <cite>— how the ranking works, in one sentence.</cite>
          </div>

          <!-- 2. Big statistic -->
          <div class="editorial-stat animate-fade-in animate-delay-2">
            <span class="stat-num">500+</span>
            <p class="stat-cap">chains we filter out before you ever see a result. Starbucks, Chipotle, the lot.</p>
          </div>

          <!-- 3. Ranking list -->
          <div class="editorial-list animate-fade-in animate-delay-3">
            <p class="eyebrow" style="margin-bottom:0.625rem">What we rank by</p>
            <ul class="ranks">
              <li>Independence score</li>
              <li>Distance from you</li>
              <li>Bayesian rating</li>
              <li>Hours, price, reviews</li>
              <li>4 more signals</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ NEAR YOU RIGHT NOW ═══ -->
    <section style="padding:3.5rem 1rem">
      <div class="container">
        <div class="flex items-center justify-between flex-wrap gap-2 animate-fade-in" style="margin-bottom:1.75rem">
          <div>
            <h2 class="text-2xl" style="margin-bottom:0.25rem">Near you right now</h2>
            <p class="text-sm text-muted">Curated picks from your neighborhood</p>
          </div>
          <a href="#/search" class="btn btn-ghost btn-sm">See all ${icons.arrowRight}</a>
        </div>
        <div id="home-highlights" class="grid grid-3 gap-4 md-grid-2 lg-grid-3"></div>
      </div>
    </section>

    <!-- ═══ AI CONCIERGE ═══ -->
    <section style="padding:4rem 1rem">
      <div class="container" style="max-width:56rem">
        <div class="grid md-grid-2 gap-8 items-center">
          <div class="animate-fade-in">
            <span class="eyebrow">AI-Powered</span>
            <h2 class="text-3xl" style="margin-top:0.375rem;margin-bottom:1rem;line-height:1.2">Ask in plain English.<br/>Get an actual answer.</h2>
            <p class="text-muted leading-relaxed" style="margin-bottom:1.5rem">
              We read what you actually mean — cheapest, closest, best, open now — and rank every nearby business across eight signals: independence, distance, Bayesian rating, hours, price, review volume, recency, and category fit.
            </p>
            <div class="flex flex-wrap gap-2" style="margin-bottom:1.5rem">
              <span class="badge">"best ramen open past 11pm"</span>
              <span class="badge">"cozy bookstore café"</span>
              <span class="badge">"where to take my parents"</span>
            </div>
            <button class="btn btn-primary" onclick="if(window.openAiChat)openAiChat()">
              ${icons.sparkles} Try the concierge ${icons.arrowRight}
            </button>
          </div>
          <div class="card animate-fade-in animate-delay-2" style="padding:1.25rem;max-width:min(24rem,calc(100vw - 3rem));margin-left:auto">
            <div class="flex items-center gap-2" style="margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border)">
              <span class="icon icon-md" style="color:var(--primary)">${icons.sparkles}</span>
              <span class="text-sm font-semibold">AI Concierge</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.625rem">
              <div class="msg-row user">
                <div class="msg-bubble user" style="font-size:0.8rem">Best coffee shop near me?</div>
              </div>
              <div class="msg-row">
                <div class="msg-avatar"><span class="icon" style="color:var(--primary)">${icons.bot}</span></div>
                <div class="msg-bubble assistant" style="font-size:0.8rem">
                  I'd check out <strong>Oak &amp; Bean</strong> — a neighborhood roaster 0.3 miles away with a 4.6 rating. Locals love the oat milk latte.
                  <div class="suggestion-card" style="margin-top:0.5rem;pointer-events:none;cursor:default">
                    <div class="flex items-center justify-between">
                      <span class="font-medium" style="font-size:0.7rem">Oak &amp; Bean Coffee</span>
                      <span class="badge badge-green" style="font-size:0.55rem;padding:0 0.3rem">Local</span>
                    </div>
                    <div class="flex items-center gap-1-5 text-xs text-muted" style="margin-top:0.125rem;font-size:0.65rem">
                      <span>4.6</span><span>0.3km</span><span style="color:var(--green)">Open</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ QUICK CATEGORIES ═══ -->
    <section style="padding:4rem 1rem">
      <div class="container">
        <div class="animate-fade-in" style="margin-bottom:1.75rem">
          <span class="eyebrow">Browse</span>
          <h2 class="text-2xl" style="margin-top:0.375rem">What are you looking for?</h2>
        </div>
        <div class="grid grid-2 gap-3 md-grid-3" style="max-width:48rem">
          ${[
            { label: 'Food &amp; Drink', type: 'restaurant' },
            { label: 'Coffee', type: 'cafe' },
            { label: 'Shopping', type: 'clothing_store' },
            { label: 'Beauty &amp; Spa', type: 'beauty_salon' },
            { label: 'Fitness', type: 'gym' },
            { label: 'Nightlife', type: 'bar' },
          ].map((c, i) => `
            <a href="#/search" class="card animate-fade-in" style="padding:1.25rem 1rem;cursor:pointer;animation-delay:${0.05 * i}s">
              <div class="font-medium text-base">${c.label}</div>
            </a>
          `).join('')}
        </div>
      </div>
    </section>

    <!-- ═══ FOOTER CTA ═══ -->
    <section style="padding:4rem 1rem 5rem">
      <div class="container-sm">
        <div class="card animate-fade-in" style="padding:3rem 2rem;text-align:center">
          <h2 class="text-3xl" style="margin-bottom:0.75rem">Every search you run is a vote.</h2>
          <p class="text-muted" style="margin-bottom:2rem;max-width:32rem;margin-left:auto;margin-right:auto;line-height:1.65">
            We rank independents above chains by default. Not a setting. The whole point.
          </p>
          <div class="flex justify-center gap-3 flex-wrap">
            <a href="#/search" class="btn btn-primary">${icons.search} Start exploring</a>
            ${!authIsAuthenticated() ? `<a href="#/register" class="btn btn-outline">Create account</a>` : ''}
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
      <div class="card text-center" style="grid-column:1/-1;padding:3rem 1rem">
        <span class="icon icon-xl text-muted" style="margin-bottom:0.75rem;display:block">${icons.mapPin}</span>
        <p class="text-muted" style="margin-bottom:1rem">Enable location to see businesses near you</p>
        <button class="btn btn-outline" onclick="locationRequest().then(()=>loadHomeHighlights()).catch(()=>{})">
          ${icons.navigation} Enable location
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

    const picks = [];
    const verified = businesses.find(b => b.local_badge === 'verified_local');
    if (verified) picks.push({ biz: verified, label: 'Verified Local', sublabel: 'Confirmed independent' });
    const rated = [...businesses].sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0)).find(b => !picks.some(p => p.biz.id === b.id));
    if (rated) picks.push({ biz: rated, label: 'Highest Rated', sublabel: `${Number(rated.average_rating || 0).toFixed(1)} stars · ${rated.review_count || 0} reviews` });
    const closest = businesses.find(b => !picks.some(p => p.biz.id === b.id));
    if (closest) picks.push({ biz: closest, label: 'Closest to You', sublabel: `${Number(closest.distance_km || 0).toFixed(1)} km away` });

    el.innerHTML = picks.map((pick, i) => `
      <div class="card animate-fade-in" style="cursor:pointer;animation-delay:${i * 0.1}s"
           onclick="navigate('business/${pick.biz.id}')">
        <div style="height:10rem;overflow:hidden;position:relative;border-bottom:1px solid var(--border)">
          ${pick.biz.photo_url
            ? `<img src="${pick.biz.photo_url}" alt="${pick.biz.name}" style="width:100%;height:100%;object-fit:cover" loading="lazy" />`
            : `<div class="biz-photo-ph">${pick.biz.primary_type_display_name || 'business'}</div>`}
        </div>
        <div style="padding:1rem 1.25rem 1.25rem">
          <span class="eyebrow" style="display:block;margin-bottom:0.5rem">${pick.label}</span>
          <div style="font-family:var(--font-display);font-size:1.125rem;font-weight:600;letter-spacing:-0.01em;margin-bottom:0.375rem">${pick.biz.name}</div>
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
