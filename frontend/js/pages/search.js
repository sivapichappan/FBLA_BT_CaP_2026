const SEARCH_CATEGORIES = [
  { label: 'Food & Drink', type: 'restaurant' },
  { label: 'Coffee', type: 'cafe' },
  { label: 'Shopping', type: 'clothing_store' },
  { label: 'Groceries', type: 'grocery_store' },
  { label: 'Beauty & Spa', type: 'beauty_salon' },
  { label: 'Fitness', type: 'gym' },
  { label: 'Auto', type: 'car_repair' },
  { label: 'Health', type: 'dentist' },
  { label: 'Nightlife', type: 'bar' },
];
const RADIUS_PRESETS = [
  { label: 'Walking', value: 1000, desc: '1 km' },
  { label: 'Biking', value: 3000, desc: '3 km' },
  { label: 'Driving', value: 10000, desc: '10 km' },
];

let _searchState = { query: '', type: null, radius: 1000, debounceTimer: null, locationName: null };

function searchPage(container) {
  const loc = locationGet();

  container.innerHTML = `
    <div class="container" style="padding-top:2rem;padding-bottom:2rem">
      <h1 class="text-3xl font-bold animate-fade-in" style="margin-bottom:1.5rem">Search Businesses</h1>

      <!-- Location picker -->
      <div class="glass animate-fade-in animate-delay-1" style="padding:0.75rem;border-radius:0.75rem;margin-bottom:1rem">
        <button id="search-loc-toggle" onclick="searchToggleLocationDetails()"
                style="display:flex;align-items:center;gap:0.5rem;width:100%;text-align:left;background:transparent;border:none;cursor:pointer;color:var(--foreground);padding:0;font-family:inherit;font-size:inherit">
          <span class="icon icon-sm text-primary">${icons.mapPin}</span>
          <span class="font-medium text-sm" id="search-loc-label">${loc ? 'Detecting location…' : 'No location set'}</span>
          <span class="icon icon-sm text-muted" id="search-loc-chevron"
                style="margin-left:auto;transition:transform 200ms ease">${icons.chevronRight}</span>
        </button>

        <!-- Expandable details (map + coords) -->
        <div id="search-loc-details" style="display:none;margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border)">
          <div id="search-loc-map" style="width:100%;height:200px;border-radius:6px;overflow:hidden;margin-bottom:0.5rem;background:var(--muted)"></div>
          <div class="flex justify-between items-center text-xs text-muted">
            <span id="search-loc-coords">—</span>
            <button class="btn btn-ghost btn-sm" onclick="searchUseMyLocation()" style="padding:0.25rem 0.5rem;font-size:0.7rem">${icons.navigation} Re-detect</button>
          </div>
        </div>

        <!-- Manual location override (typing a city/address) -->
        <div style="position:relative;margin-top:0.5rem" id="search-loc-wrapper">
          <input class="input" placeholder="Or search a different city, zip, or address…" id="search-loc-input" style="height:2.25rem" />
          <div id="search-predictions" class="autocomplete-dropdown glass-strong" style="display:none"></div>
        </div>
      </div>

      <!-- Search bar -->
      <form id="search-form" class="flex gap-2 flex-wrap" style="margin-bottom:1rem">
        <input class="input" placeholder="Search for anything nearby..." id="search-query" style="flex:1;min-width:0" />
        <button type="submit" class="btn btn-gradient">${icons.search} Search</button>
      </form>

      <!-- Category chips -->
      <div class="flex gap-2 overflow-x-auto scrollbar-hide" style="padding-bottom:0.5rem;margin-bottom:0.75rem" id="search-chips">
        ${SEARCH_CATEGORIES.map(c => `
          <button class="chip" data-type="${c.type}" onclick="searchToggleCategory('${c.type}')">${c.label}</button>
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
      <div id="search-empty" class="text-center glass" style="display:none;padding:4rem 1rem;border-radius:0.75rem">
        <span class="icon icon-xl text-muted" style="margin-bottom:0.75rem;display:block">${icons.search}</span>
        <p class="text-lg text-muted">No businesses found nearby.</p>
        <p class="text-sm text-muted" style="margin-top:0.25rem">Try a larger radius, different category, or change your location.</p>
      </div>
      <div id="search-no-loc" class="text-center glass" style="display:${loc ? 'none' : 'block'};padding:4rem 1rem;border-radius:0.75rem">
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

  // Auto-detect location on entering the search page if we don't have one yet.
  // If we already have a saved location, just refresh its display name.
  if (loc) {
    searchUpdateLocationName();
    searchFetch();
  } else if (navigator.geolocation) {
    document.getElementById('search-loc-label').textContent = 'Detecting your location…';
    locationRequest()
      .then(() => {
        searchUpdateLocationName();
        searchFetch();
      })
      .catch(() => {
        document.getElementById('search-loc-label').textContent = 'Location unavailable — enter one below';
      });
  }
}

/* ─── Location label + reverse geocode ────────────────────────────────── */

async function searchReverseGeocode(lat, lng) {
  if (!window.google || !google.maps || !google.maps.Geocoder) return null;
  return new Promise((resolve) => {
    try {
      new google.maps.Geocoder().geocode(
        { location: { lat, lng } },
        (results, status) => {
          if (status !== 'OK' || !results || !results[0]) { resolve(null); return; }
          const comps = results[0].address_components || [];
          const find = (type) => comps.find((c) => (c.types || []).includes(type));
          const city = find('locality') || find('postal_town') || find('sublocality');
          const neighborhood = find('neighborhood');
          const state = find('administrative_area_level_1');
          const country = find('country');
          const primary = (neighborhood && neighborhood.short_name)
                       || (city && city.short_name)
                       || results[0].formatted_address.split(',')[0];
          const secondary = (state && state.short_name) || (country && country.short_name) || '';
          resolve(secondary ? `${primary}, ${secondary}` : primary);
        }
      );
    } catch (e) { resolve(null); }
  });
}

async function searchUpdateLocationName() {
  const loc = locationGet();
  const labelEl = document.getElementById('search-loc-label');
  const coordsEl = document.getElementById('search-loc-coords');
  if (!loc) {
    if (labelEl) labelEl.textContent = 'No location set';
    return;
  }
  if (coordsEl) {
    coordsEl.textContent = `Lat ${loc.latitude.toFixed(4)}, Lng ${loc.longitude.toFixed(4)}`;
  }
  if (labelEl) labelEl.textContent = 'Detecting location…';
  const name = await searchReverseGeocode(loc.latitude, loc.longitude);
  _searchState.locationName = name;
  if (labelEl) labelEl.textContent = name || `Lat ${loc.latitude.toFixed(3)}, Lng ${loc.longitude.toFixed(3)}`;
}

function searchToggleLocationDetails() {
  const details = document.getElementById('search-loc-details');
  const chevron = document.getElementById('search-loc-chevron');
  if (!details) return;
  const isOpen = details.style.display !== 'none';
  details.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';

  if (!isOpen) {
    // Lazy-init the embedded map on first open
    const loc = locationGet();
    const mapEl = document.getElementById('search-loc-map');
    if (loc && mapEl && window.google && google.maps) {
      mapEl.innerHTML = '';
      const map = new google.maps.Map(mapEl, {
        center: { lat: loc.latitude, lng: loc.longitude },
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
      });
      new google.maps.Marker({ position: { lat: loc.latitude, lng: loc.longitude }, map });
    } else if (mapEl && !loc) {
      mapEl.innerHTML = '<div class="flex items-center justify-center text-sm text-muted" style="height:100%">No location to display</div>';
    }
  }
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
  document.getElementById('search-loc-label').textContent = 'Finding location…';

  try {
    const data = await businessApi.geocode(description);
    locationSet(data.latitude, data.longitude);
    // Reset cached map so the next "expand" re-renders for the new spot
    const details = document.getElementById('search-loc-details');
    if (details) { details.style.display = 'none'; }
    const chevron = document.getElementById('search-loc-chevron');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    await searchUpdateLocationName();
    searchFetch();
  } catch (e) {
    document.getElementById('search-loc-label').textContent = 'Location failed';
  }
}

function searchUseMyLocation() {
  document.getElementById('search-loc-label').textContent = 'Detecting your location…';
  locationRequest().then(async () => {
    const noLocEl = document.getElementById('search-no-loc');
    if (noLocEl) noLocEl.style.display = 'none';
    const details = document.getElementById('search-loc-details');
    if (details) { details.style.display = 'none'; }
    const chevron = document.getElementById('search-loc-chevron');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    await searchUpdateLocationName();
    searchFetch();
  }).catch(() => {
    document.getElementById('search-loc-label').textContent = 'Location unavailable';
  });
}
