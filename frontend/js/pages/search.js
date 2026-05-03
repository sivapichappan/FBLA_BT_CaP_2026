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
const RATING_PRESETS = [
  { label: 'Any', value: 0 },
  { label: '3.5+', value: 3.5 },
  { label: '4.0+', value: 4.0 },
  { label: '4.5+', value: 4.5 },
];

let _searchState = {
  query: '',
  type: null,
  radius: 1000,
  debounceTimer: null,
  locationName: null,
  // Filter state (defaults — non-defaults count toward the Filters badge)
  minRating: 0,
  priceLevels: new Set(),       // empty = "any price"
  independentOnly: true,         // default ON — LocalLens's thesis
  sort: 'best_match',
  // UI state
  filtersOpen: false,
  // Map / hover state
  results: [],
  resultsMap: null,
  resultsMarkers: [],
  resultsInfoWindow: null,
  hoveredId: null,
};

const FILTER_DEFAULTS = {
  radius: 1000,
  minRating: 0,
  priceLevels: 0,        // size, not the set itself
  independentOnly: true,
};

function _activeFilterCount() {
  let n = 0;
  if (_searchState.radius !== FILTER_DEFAULTS.radius) n++;
  if (_searchState.minRating !== FILTER_DEFAULTS.minRating) n++;
  if (_searchState.priceLevels.size !== FILTER_DEFAULTS.priceLevels) n++;
  if (_searchState.independentOnly !== FILTER_DEFAULTS.independentOnly) n++;
  return n;
}

function _refreshFiltersBadge() {
  const badge = document.getElementById('filters-badge');
  if (!badge) return;
  const n = _activeFilterCount();
  badge.textContent = n > 0 ? String(n) : '';
  badge.style.display = n > 0 ? 'inline-flex' : 'none';
}

function searchPage(container) {
  const loc = locationGet();

  container.innerHTML = `
    <div class="container" style="padding-top:2rem;padding-bottom:2rem">
      <h1 class="text-3xl font-bold animate-fade-in" style="margin-bottom:1.5rem">Search Businesses</h1>

      <!-- Location pill (auto-detect + click to expand map) -->
      <div class="glass animate-fade-in animate-delay-1" style="padding:0.75rem;border-radius:0.75rem;margin-bottom:1rem">
        <button id="search-loc-toggle" onclick="searchToggleLocationDetails()"
                style="display:flex;align-items:center;gap:0.5rem;width:100%;text-align:left;background:transparent;border:none;cursor:pointer;color:var(--foreground);padding:0;font-family:inherit;font-size:inherit">
          <span class="icon icon-sm text-primary">${icons.mapPin}</span>
          <span class="font-medium text-sm" id="search-loc-label">${loc ? 'Detecting location…' : 'No location set'}</span>
          <span class="icon icon-sm text-muted" id="search-loc-chevron"
                style="margin-left:auto;transition:transform 200ms ease">${icons.chevronRight}</span>
        </button>
        <div id="search-loc-details" style="display:none;margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border)">
          <div id="search-loc-map" style="width:100%;height:200px;border-radius:6px;overflow:hidden;margin-bottom:0.5rem;background:var(--muted)"></div>
          <div class="flex justify-between items-center text-xs text-muted">
            <span id="search-loc-coords">—</span>
            <button class="btn btn-ghost btn-sm" onclick="searchUseMyLocation()" style="padding:0.25rem 0.5rem;font-size:0.7rem">${icons.navigation} Re-detect</button>
          </div>
        </div>
        <div style="position:relative;margin-top:0.5rem" id="search-loc-wrapper">
          <input class="input" placeholder="Or search a different city, zip, or address…" id="search-loc-input" style="height:2.25rem" />
          <div id="search-predictions" class="autocomplete-dropdown glass-strong" style="display:none"></div>
        </div>
      </div>

      <!-- Search bar -->
      <form id="search-form" class="flex gap-2 flex-wrap" style="margin-bottom:0.75rem">
        <input class="input" placeholder="Search for anything nearby…" id="search-query" style="flex:1;min-width:0" />
        <button type="submit" class="btn btn-gradient">${icons.search} Search</button>
      </form>

      <!-- Compact toolbar: Filters · Sort · category chips -->
      <div class="search-toolbar" style="margin-bottom:0.75rem">
        <button class="btn btn-outline btn-sm" id="filters-btn" onclick="searchToggleFilters()">
          ${icons.shield} Filters
          <span class="filters-btn-badge" id="filters-badge" style="display:none"></span>
        </button>
        <div class="flex items-center gap-1" style="font-size:0.8125rem">
          <label class="text-xs text-muted" for="toolbar-sort">Sort</label>
          <select id="toolbar-sort" class="input" style="height:2rem;width:auto;padding:0.125rem 1.5rem 0.125rem 0.5rem;font-size:0.8125rem"
                  onchange="searchSetSort(this.value)">
            <option value="best_match">Best match</option>
            <option value="distance">Distance</option>
            <option value="rating">Rating</option>
            <option value="most_reviewed">Most reviewed</option>
          </select>
        </div>
        <div class="search-toolbar-chips flex gap-2 overflow-x-auto scrollbar-hide" id="search-chips">
          ${SEARCH_CATEGORIES.map(c => `
            <button class="chip chip-sm" data-type="${c.type}" onclick="searchToggleCategory('${c.type}')">${c.label}</button>
          `).join('')}
        </div>
      </div>

      <!-- Filter panel (collapsed by default; opens via Filters button) -->
      <div class="search-filters-panel glass" id="search-filters-panel" style="margin-bottom:0.75rem">
        <div class="filters-panel-inner" style="padding:1rem">
          <div class="flex items-center justify-between" style="margin-bottom:0.75rem">
            <span class="font-semibold text-sm">Filters</span>
            <button class="btn btn-ghost btn-icon-sm" onclick="searchToggleFilters()" aria-label="Close filters">${icons.x}</button>
          </div>

          <!-- Distance -->
          <div style="margin-bottom:0.875rem">
            <div class="text-xs text-muted" style="margin-bottom:0.375rem">Distance</div>
            <div class="flex gap-2 flex-wrap" id="search-radius">
              ${RADIUS_PRESETS.map(p => `
                <button class="chip chip-sm ${p.value === _searchState.radius ? 'active' : ''}" data-radius="${p.value}" onclick="searchSetRadius(${p.value})">${p.label} (${p.desc})</button>
              `).join('')}
            </div>
          </div>

          <!-- Independent only -->
          <div style="margin-bottom:0.875rem">
            <label class="flex items-center gap-2" style="cursor:pointer;font-size:0.875rem">
              <input type="checkbox" id="filter-independent" ${_searchState.independentOnly ? 'checked' : ''}
                     onchange="searchSetIndependentOnly(this.checked)" style="width:1rem;height:1rem;accent-color:var(--primary)" />
              <span class="font-medium">Independent only</span>
              <span class="text-xs text-muted" title="LocalLens prioritizes independent businesses by default">${icons.shield}</span>
            </label>
          </div>

          <!-- Min rating -->
          <div style="margin-bottom:0.875rem">
            <div class="text-xs text-muted" style="margin-bottom:0.375rem">Min rating</div>
            <div class="flex gap-2 flex-wrap">
              ${RATING_PRESETS.map(r => `
                <button class="chip chip-sm ${r.value === _searchState.minRating ? 'active' : ''}"
                        data-rating="${r.value}" onclick="searchSetMinRating(${r.value})">${r.label}</button>
              `).join('')}
            </div>
          </div>

          <!-- Price -->
          <div style="margin-bottom:0.875rem">
            <div class="text-xs text-muted" style="margin-bottom:0.375rem">Price</div>
            <div class="flex gap-2 flex-wrap">
              ${[1, 2, 3, 4].map(p => `
                <button class="chip chip-sm" data-price="${p}" onclick="searchTogglePrice(${p})">${'$'.repeat(p)}</button>
              `).join('')}
            </div>
          </div>

          <div class="flex items-center justify-between" style="padding-top:0.5rem;border-top:1px solid var(--border)">
            <button class="btn btn-ghost btn-sm" onclick="searchResetFilters()">Reset</button>
            <button class="btn btn-gradient btn-sm" onclick="searchToggleFilters()">Done</button>
          </div>
        </div>
      </div>

      <!-- Result count -->
      <div id="search-count" class="text-sm text-muted" style="margin-bottom:0.75rem">&nbsp;</div>

      <!-- Split view: results list + map -->
      <div class="search-layout">
        <div id="search-list-col">
          <div id="search-results" class="grid grid-2 gap-3 search-results-list">
            ${loc ? renderSkeleton(6) : ''}
          </div>
          <div id="search-empty" class="glass" style="display:none;padding:1.5rem;border-radius:0.75rem;margin-top:1rem">
            <p class="font-semibold" style="margin-bottom:0.25rem" id="search-empty-title">No matches in this area.</p>
            <p class="text-sm text-muted" id="search-empty-sub" style="margin-bottom:0.875rem">Try a larger radius, fewer filters, or change your location.</p>
            <div id="search-fallback" class="grid grid-2 gap-3"></div>
          </div>
          <div id="search-no-loc" class="text-center glass" style="display:${loc ? 'none' : 'block'};padding:4rem 1rem;border-radius:0.75rem">
            <span class="icon icon-xl text-muted" style="margin-bottom:0.75rem;display:block">${icons.mapPin}</span>
            <p class="text-lg text-muted">Set a location to discover businesses.</p>
            <button class="btn btn-gradient" style="margin-top:1rem" onclick="searchUseMyLocation()">Enable Location</button>
          </div>
        </div>

        <div id="search-map-col" class="search-map-col">
          <div id="search-results-map" class="search-results-map"></div>
        </div>
      </div>
    </div>`;

  // Form submit
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    _searchState.query = document.getElementById('search-query').value;
    searchFetch();
  });

  // Location autocomplete
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
      const pred = document.getElementById('search-predictions');
      if (pred) pred.style.display = 'none';
    }
  });

  // Auto-detect location on entry
  if (loc) {
    searchUpdateLocationName();
    searchFetch();
  } else if (navigator.geolocation) {
    document.getElementById('search-loc-label').textContent = 'Detecting your location…';
    locationRequest()
      .then(() => { searchUpdateLocationName(); searchFetch(); })
      .catch(() => {
        document.getElementById('search-loc-label').textContent = 'Location unavailable — enter one below';
      });
  }
}

/* ─── Filter setters (debounced refetch) ──────────────────────────────── */

function _debouncedFetch() {
  clearTimeout(_searchState.debounceTimer);
  _searchState.debounceTimer = setTimeout(() => searchFetch(), 250);
}

function searchSetIndependentOnly(on) {
  _searchState.independentOnly = !!on;
  _refreshFiltersBadge();
  _debouncedFetch();
}

function searchSetMinRating(value) {
  _searchState.minRating = value;
  document.querySelectorAll('[data-rating]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.rating) === value);
  });
  _refreshFiltersBadge();
  _debouncedFetch();
}

function searchTogglePrice(p) {
  if (_searchState.priceLevels.has(p)) _searchState.priceLevels.delete(p);
  else _searchState.priceLevels.add(p);
  document.querySelectorAll('[data-price]').forEach((btn) => {
    btn.classList.toggle('active', _searchState.priceLevels.has(Number(btn.dataset.price)));
  });
  _refreshFiltersBadge();
  _debouncedFetch();
}

function searchSetSort(value) {
  _searchState.sort = value;
  // Sort isn't an "active filter" — keep both selectors in sync but don't badge it
  document.querySelectorAll('select#toolbar-sort, select#filter-sort').forEach((el) => {
    if (el.value !== value) el.value = value;
  });
  _debouncedFetch();
}

function searchToggleFilters() {
  _searchState.filtersOpen = !_searchState.filtersOpen;
  const panel = document.getElementById('search-filters-panel');
  if (panel) panel.classList.toggle('open', _searchState.filtersOpen);
}

function searchResetFilters() {
  _searchState.radius = FILTER_DEFAULTS.radius;
  _searchState.minRating = FILTER_DEFAULTS.minRating;
  _searchState.priceLevels = new Set();
  _searchState.independentOnly = FILTER_DEFAULTS.independentOnly;
  // Refresh visual state of all chips/inputs in the panel
  document.querySelectorAll('[data-radius]').forEach((btn) =>
    btn.classList.toggle('active', Number(btn.dataset.radius) === _searchState.radius));
  document.querySelectorAll('[data-rating]').forEach((btn) =>
    btn.classList.toggle('active', Number(btn.dataset.rating) === _searchState.minRating));
  document.querySelectorAll('[data-price]').forEach((btn) => btn.classList.remove('active'));
  const indep = document.getElementById('filter-independent');
  if (indep) indep.checked = _searchState.independentOnly;
  _refreshFiltersBadge();
  searchFetch();
}

/* ─── Reverse geocode + location pill ─────────────────────────────────── */

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
  if (coordsEl) coordsEl.textContent = `Lat ${loc.latitude.toFixed(4)}, Lng ${loc.longitude.toFixed(4)}`;
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
    const loc = locationGet();
    const mapEl = document.getElementById('search-loc-map');
    if (loc && mapEl && window.google && google.maps) {
      mapEl.innerHTML = '';
      const map = new google.maps.Map(mapEl, {
        center: { lat: loc.latitude, lng: loc.longitude },
        zoom: 15, disableDefaultUI: true, zoomControl: true, clickableIcons: false,
      });
      new google.maps.Marker({ position: { lat: loc.latitude, lng: loc.longitude }, map });
    } else if (mapEl && !loc) {
      mapEl.innerHTML = '<div class="flex items-center justify-center text-sm text-muted" style="height:100%">No location to display</div>';
    }
  }
}

/* ─── Fetch + render ──────────────────────────────────────────────────── */

async function searchFetch() {
  const loc = locationGet();
  if (!loc) return;

  const resultsEl = document.getElementById('search-results');
  const emptyEl = document.getElementById('search-empty');
  const noLocEl = document.getElementById('search-no-loc');
  const countEl = document.getElementById('search-count');
  if (noLocEl) noLocEl.style.display = 'none';

  resultsEl.innerHTML = renderSkeleton(6);
  emptyEl.style.display = 'none';
  if (countEl) countEl.innerHTML = '&nbsp;';

  try {
    const params = {
      latitude: loc.latitude, longitude: loc.longitude, radius: _searchState.radius,
      independent_only: _searchState.independentOnly,
      sort: _searchState.sort,
    };
    if (_searchState.query) params.query = _searchState.query;
    if (_searchState.type) params.type = _searchState.type;
    if (_searchState.minRating) params.min_rating = _searchState.minRating;
    if (_searchState.priceLevels.size) params.price_levels = Array.from(_searchState.priceLevels).sort().join(',');

    const data = await businessApi.search(params);
    const businesses = data.businesses || [];
    _searchState.results = businesses;

    if (countEl) {
      const total = data.total ?? businesses.length;
      const unfiltered = data.unfiltered_total;
      countEl.textContent = unfiltered && unfiltered !== total
        ? `Showing ${total} of ${unfiltered} nearby (filters applied)`
        : `Showing ${total} ${total === 1 ? 'result' : 'results'}`;
    }

    if (businesses.length > 0) {
      resultsEl.innerHTML = businesses.map((b, i) => `
        <div class="search-card-wrap" data-biz-id="${b.id}" data-index="${i}"
             onmouseenter="searchHoverCard('${b.id}')" onmouseleave="searchHoverCard(null)">
          ${renderBusinessCard(b)}
        </div>
      `).join('');
      emptyEl.style.display = 'none';
      _renderResultsMap(businesses, loc);
    } else {
      resultsEl.innerHTML = '';
      _renderResultsMap([], loc);
      // Zero-results: show fallback if backend offered the closest pre-filter survivors
      const fallback = data.nearest_fallback || [];
      const titleEl = document.getElementById('search-empty-title');
      const subEl = document.getElementById('search-empty-sub');
      const fbEl = document.getElementById('search-fallback');
      if (fallback.length) {
        if (titleEl) titleEl.textContent = "No matches with those filters in this area.";
        if (subEl) subEl.textContent = `Here are the ${fallback.length} closest local businesses:`;
        if (fbEl) fbEl.innerHTML = fallback.map(b => renderBusinessCard(b)).join('');
      } else {
        if (titleEl) titleEl.textContent = 'No matches in this area.';
        if (subEl) subEl.textContent = 'Try a larger radius, fewer filters, or change your location.';
        if (fbEl) fbEl.innerHTML = '';
      }
      emptyEl.style.display = 'block';
    }
  } catch (e) {
    console.error('Search failed:', e);
    resultsEl.innerHTML = '';
    if (countEl) countEl.textContent = 'Search failed.';
  }
}

function searchToggleCategory(type) {
  _searchState.type = _searchState.type === type ? null : type;
  document.querySelectorAll('#search-chips .chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === _searchState.type);
  });
  searchFetch();
}

function searchSetRadius(val) {
  _searchState.radius = val;
  document.querySelectorAll('#search-radius .chip').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.radius) === val);
  });
  _refreshFiltersBadge();
  searchFetch();
}

/* ─── Map + hover sync (Wave 2) ───────────────────────────────────────── */

function _badgeColor(badge) {
  // Pin color encodes our differentiator: chain-vs-local
  if (badge === 'verified_local') return '#1f8a4c';   // strong green
  if (badge === 'likely_local') return '#7fb98a';     // light green
  return '#9aa1ac';                                    // neutral gray
}

function _pinSvg(color, label) {
  // Simple teardrop pin with a numeric label centered above the point.
  const safe = String(label).slice(0, 3);
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='42' viewBox='0 0 32 42'>
        <path d='M16 0C7.2 0 0 7.2 0 16c0 12 16 26 16 26s16-14 16-26C32 7.2 24.8 0 16 0z' fill='${color}' stroke='#fff' stroke-width='1.5'/>
        <circle cx='16' cy='16' r='10' fill='#fff'/>
        <text x='16' y='20' text-anchor='middle' font-family='-apple-system,system-ui,sans-serif' font-size='11' font-weight='700' fill='${color}'>${safe}</text>
      </svg>`
    ),
    scaledSize: new google.maps.Size(32, 42),
    anchor: new google.maps.Point(16, 42),
  };
}

function _renderResultsMap(businesses, center) {
  const mapEl = document.getElementById('search-results-map');
  if (!mapEl || !window.google || !google.maps) return;

  // Clear any previous pins / info window
  if (_searchState.resultsMarkers.length) {
    _searchState.resultsMarkers.forEach((m) => m.setMap(null));
    _searchState.resultsMarkers = [];
  }
  if (_searchState.resultsInfoWindow) {
    _searchState.resultsInfoWindow.close();
  }

  if (!_searchState.resultsMap) {
    _searchState.resultsMap = new google.maps.Map(mapEl, {
      center: { lat: center.latitude, lng: center.longitude },
      zoom: 14, disableDefaultUI: true, zoomControl: true, clickableIcons: false,
    });
    _searchState.resultsInfoWindow = new google.maps.InfoWindow();
  } else {
    _searchState.resultsMap.setCenter({ lat: center.latitude, lng: center.longitude });
  }

  if (!businesses.length) return;

  const bounds = new google.maps.LatLngBounds();
  bounds.extend({ lat: center.latitude, lng: center.longitude });

  businesses.forEach((biz, idx) => {
    if (typeof biz.latitude !== 'number' || typeof biz.longitude !== 'number') return;
    const pos = { lat: biz.latitude, lng: biz.longitude };
    const color = _badgeColor(biz.local_badge);
    const marker = new google.maps.Marker({
      position: pos,
      map: _searchState.resultsMap,
      icon: _pinSvg(color, idx + 1),
      title: biz.name,
      zIndex: 100 + (1000 - idx),
    });
    marker._bizId = biz.id;
    marker._bizIndex = idx;

    marker.addListener('mouseover', () => searchHoverPin(biz.id));
    marker.addListener('mouseout', () => searchHoverPin(null));
    marker.addListener('click', () => {
      const html = `
        <div style="font-family:inherit;min-width:160px">
          <div style="font-weight:600;margin-bottom:0.25rem">${biz.name}</div>
          <div style="font-size:0.75rem;color:#666;margin-bottom:0.375rem">${biz.address_line_1 || ''}</div>
          <a href="#/business/${biz.id}" style="color:#1f6dd6;font-size:0.8125rem">View details →</a>
        </div>`;
      _searchState.resultsInfoWindow.setContent(html);
      _searchState.resultsInfoWindow.open({ anchor: marker, map: _searchState.resultsMap });
    });

    _searchState.resultsMarkers.push(marker);
    bounds.extend(pos);
  });

  // Fit bounds with a sensible cap so a single far-away result doesn't zoom way out
  if (_searchState.resultsMarkers.length > 1) {
    _searchState.resultsMap.fitBounds(bounds, 60);
    const listener = google.maps.event.addListenerOnce(_searchState.resultsMap, 'bounds_changed', () => {
      if (_searchState.resultsMap.getZoom() > 16) _searchState.resultsMap.setZoom(16);
    });
  }
}

/* Hover state: card → pin */
function searchHoverCard(bizId) {
  if (_searchState.hoveredId === bizId) return;
  _searchState.hoveredId = bizId;
  _searchState.resultsMarkers.forEach((marker) => {
    const idx = marker._bizIndex;
    const biz = _searchState.results[idx];
    if (!biz) return;
    const isHovered = marker._bizId === bizId;
    marker.setIcon(_pinSvg(_badgeColor(biz.local_badge), idx + 1));
    if (isHovered) {
      marker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
      // Bigger pin for hover via re-icon at larger size
      const icon = marker.getIcon();
      if (icon && typeof icon === 'object') {
        marker.setIcon({ ...icon, scaledSize: new google.maps.Size(40, 52), anchor: new google.maps.Point(20, 52) });
      }
    } else {
      marker.setZIndex(100 + (1000 - idx));
    }
  });
}

/* Hover state: pin → card */
function searchHoverPin(bizId) {
  // Reuse the same hover logic, then highlight + scroll the card
  document.querySelectorAll('.search-card-wrap.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
  if (bizId) {
    const card = document.querySelector(`.search-card-wrap[data-biz-id="${bizId}"]`);
    if (card) {
      card.classList.add('is-highlighted');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  searchHoverCard(bizId);
}

/* ─── Location autocomplete ───────────────────────────────────────────── */

function searchAutocomplete(value) {
  clearTimeout(_searchState.debounceTimer);
  const predEl = document.getElementById('search-predictions');
  if (value.length < 2) { predEl.style.display = 'none'; return; }

  _searchState.debounceTimer = setTimeout(async () => {
    try {
      const data = await businessApi.autocomplete(value);
      if (data.predictions && data.predictions.length > 0) {
        predEl.innerHTML = data.predictions.map((p) => `
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
    } catch (e) { predEl.style.display = 'none'; }
  }, 300);
}

async function searchSelectPrediction(description) {
  document.getElementById('search-predictions').style.display = 'none';
  document.getElementById('search-loc-input').value = '';
  document.getElementById('search-loc-label').textContent = 'Finding location…';
  try {
    const data = await businessApi.geocode(description);
    locationSet(data.latitude, data.longitude);
    const details = document.getElementById('search-loc-details');
    if (details) details.style.display = 'none';
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
    if (details) details.style.display = 'none';
    const chevron = document.getElementById('search-loc-chevron');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    await searchUpdateLocationName();
    searchFetch();
  }).catch(() => {
    document.getElementById('search-loc-label').textContent = 'Location unavailable';
  });
}
