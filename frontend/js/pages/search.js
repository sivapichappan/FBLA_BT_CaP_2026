const SEARCH_CATEGORIES = [
  { label: 'Food & Drink', type: 'restaurant', emoji: '🍽️' },
  { label: 'Coffee', type: 'cafe', emoji: '☕' },
  { label: 'Shopping', type: 'clothing_store', emoji: '🛍️' },
  { label: 'Groceries', type: 'grocery_store', emoji: '🛒' },
  { label: 'Beauty & Spa', type: 'beauty_salon', emoji: '💆' },
  { label: 'Fitness', type: 'gym', emoji: '🏋️' },
  { label: 'Auto', type: 'car_repair', emoji: '🚗' },
  { label: 'Health', type: 'dentist', emoji: '🏥' },
  { label: 'Nightlife', type: 'bar', emoji: '🍸' },
];
const RADIUS_PRESETS = [
  { label: 'Walking', value: 1000, desc: '1 km' },
  { label: 'Biking', value: 3000, desc: '3 km' },
  { label: 'Driving', value: 10000, desc: '10 km' },
];

let _searchState = { query: '', type: null, radius: 1000, debounceTimer: null };

function searchPage(container) {
  const loc = locationGet();

  container.innerHTML = `
    <div class="container" style="padding-top:2rem;padding-bottom:2rem">
      <h1 class="text-3xl font-bold animate-fade-in" style="margin-bottom:1.5rem">Search Businesses</h1>

      <!-- Location picker -->
      <div class="glass animate-fade-in animate-delay-1" style="padding:0.75rem;border-radius:0.75rem;margin-bottom:1rem">
        <div class="flex items-center gap-2 text-sm" style="margin-bottom:0.5rem">
          <span class="icon icon-sm text-primary">${icons.mapPin}</span>
          <span class="font-medium" id="search-loc-label">${loc ? 'Current location' : 'No location set'}</span>
        </div>
        <div class="flex gap-2" style="position:relative" id="search-loc-wrapper">
          <div style="position:relative;flex:1">
            <input class="input" placeholder="Enter city, zip code, or address..." id="search-loc-input" style="height:2.25rem" />
            <div id="search-predictions" class="autocomplete-dropdown glass-strong" style="display:none"></div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="searchUseMyLocation()">${icons.navigation} My Location</button>
        </div>
      </div>

      <!-- Search bar -->
      <form id="search-form" class="flex gap-2" style="margin-bottom:1rem">
        <input class="input" placeholder="Search for anything nearby..." id="search-query" style="flex:1" />
        <button type="submit" class="btn btn-gradient">${icons.search} Search</button>
      </form>

      <!-- Category chips -->
      <div class="flex gap-2 overflow-x-auto scrollbar-hide" style="padding-bottom:0.5rem;margin-bottom:0.75rem" id="search-chips">
        ${SEARCH_CATEGORIES.map(c => `
          <button class="chip" data-type="${c.type}" onclick="searchToggleCategory('${c.type}')">${c.emoji} ${c.label}</button>
        `).join('')}
      </div>

      <!-- Radius presets -->
      <div class="flex gap-2" style="margin-bottom:1.5rem" id="search-radius">
        ${RADIUS_PRESETS.map(p => `
          <button class="chip ${p.value === _searchState.radius ? 'active' : ''}" data-radius="${p.value}" onclick="searchSetRadius(${p.value})">${p.label} (${p.desc})</button>
        `).join('')}
      </div>

      <!-- Results -->
      <div id="search-results" class="grid grid-3 gap-4 md-grid-2 lg-grid-3">
        ${loc ? renderSkeleton(6) : ''}
      </div>
      <div id="search-empty" style="display:none" class="text-center glass" style="padding:4rem 1rem;border-radius:0.75rem">
        <span class="icon icon-xl text-muted" style="margin-bottom:0.75rem;display:block">${icons.search}</span>
        <p class="text-lg text-muted">No businesses found nearby.</p>
        <p class="text-sm text-muted" style="margin-top:0.25rem">Try a larger radius, different category, or change your location.</p>
      </div>
      <div id="search-no-loc" style="display:${loc ? 'none' : 'block'}" class="text-center glass" style="padding:4rem 1rem;border-radius:0.75rem">
        <span class="icon icon-xl text-muted" style="margin-bottom:0.75rem;display:block">${icons.mapPin}</span>
        <p class="text-lg text-muted">Set a location to discover businesses.</p>
        <button class="btn btn-gradient" style="margin-top:1rem" onclick="searchUseMyLocation()">Enable Location</button>
      </div>
    </div>`;

  // Event listeners
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    _searchState.query = document.getElementById('search-query').value;
    searchFetch();
  });

  const locInput = document.getElementById('search-loc-input');
  locInput.addEventListener('input', () => searchAutocomplete(locInput.value));
  locInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = document.querySelector('#search-predictions .autocomplete-item');
      if (first) first.click();
    }
  });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('search-loc-wrapper')?.contains(e.target)) {
      document.getElementById('search-predictions').style.display = 'none';
    }
  });

  if (loc) searchFetch();
}

async function searchFetch() {
  const loc = locationGet();
  if (!loc) return;

  const resultsEl = document.getElementById('search-results');
  const emptyEl = document.getElementById('search-empty');
  const noLocEl = document.getElementById('search-no-loc');
  if (noLocEl) noLocEl.style.display = 'none';

  resultsEl.innerHTML = renderSkeleton(6);
  emptyEl.style.display = 'none';

  try {
    const params = { latitude: loc.latitude, longitude: loc.longitude, radius: _searchState.radius };
    if (_searchState.query) params.query = _searchState.query;
    if (_searchState.type) params.type = _searchState.type;

    const data = await businessApi.search(params);
    if (data.businesses && data.businesses.length > 0) {
      resultsEl.innerHTML = data.businesses.map(b => renderBusinessCard(b)).join('');
      emptyEl.style.display = 'none';
    } else {
      resultsEl.innerHTML = '';
      emptyEl.style.display = 'block';
    }
  } catch (e) {
    console.error('Search failed:', e);
    resultsEl.innerHTML = '';
  }
}

function searchToggleCategory(type) {
  _searchState.type = _searchState.type === type ? null : type;
  document.querySelectorAll('#search-chips .chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === _searchState.type);
  });
  searchFetch();
}

function searchSetRadius(val) {
  _searchState.radius = val;
  document.querySelectorAll('#search-radius .chip').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.radius) === val);
  });
  searchFetch();
}

function searchAutocomplete(value) {
  clearTimeout(_searchState.debounceTimer);
  const predEl = document.getElementById('search-predictions');
  if (value.length < 2) { predEl.style.display = 'none'; return; }

  _searchState.debounceTimer = setTimeout(async () => {
    try {
      const data = await businessApi.autocomplete(value);
      if (data.predictions && data.predictions.length > 0) {
        predEl.innerHTML = data.predictions.map(p => `
          <button class="autocomplete-item" onclick="searchSelectPrediction('${p.description.replace(/'/g, "\\'")}')">
            <span class="icon icon-sm text-muted" style="margin-top:0.125rem">${icons.mapPin}</span>
            <div>
              <div class="text-sm font-medium">${p.main_text}</div>
              <div class="text-xs text-muted">${p.secondary_text}</div>
            </div>
          </button>
        `).join('');
        predEl.style.display = 'block';
      } else {
        predEl.style.display = 'none';
      }
    } catch (e) {
      predEl.style.display = 'none';
    }
  }, 300);
}

async function searchSelectPrediction(description) {
  document.getElementById('search-predictions').style.display = 'none';
  document.getElementById('search-loc-input').value = '';
  document.getElementById('search-loc-label').textContent = 'Finding location...';

  try {
    const data = await businessApi.geocode(description);
    locationSet(data.latitude, data.longitude);
    document.getElementById('search-loc-label').textContent = description;
    searchFetch();
  } catch (e) {
    document.getElementById('search-loc-label').textContent = 'Location failed';
  }
}

function searchUseMyLocation() {
  document.getElementById('search-loc-label').textContent = 'Finding location...';
  locationRequest().then(() => {
    document.getElementById('search-loc-label').textContent = 'Current location';
    const noLocEl = document.getElementById('search-no-loc');
    if (noLocEl) noLocEl.style.display = 'none';
    searchFetch();
  }).catch(() => {
    document.getElementById('search-loc-label').textContent = 'Location unavailable';
  });
}
