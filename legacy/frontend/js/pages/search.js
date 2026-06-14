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

const RATING_PRESETS = [
  { label: 'Any rating', value: 0 },
  { label: '3★ & up', value: 3 },
  { label: '4★ & up', value: 4 },
  { label: '4.5★ & up', value: 4.5 },
];

const SORT_OPTIONS = [
  { label: 'Best', value: 'best_match' },
  { label: 'Closest', value: 'distance' },
  { label: 'Top rated', value: 'rating' },
];

const FILTER_DEFAULTS = {
  openNow: false,
  priceLevels: 0,         // size of the Set
  minRating: 0,
  maxDistanceKm: 5,
  categoriesSize: 0,      // size of the Set
  localOnly: false,        // OFF by default — the differentiator badges still
                           // ride on every card; turning the toggle ON hides
                           // anything not flagged. Defaulting ON in sparse
                           // areas can produce zero results.
};

let _searchState = {
  query: '',
  debounceTimer: null,
  locationName: null,
  // Filter state
  openNow: false,
  priceLevels: new Set(),
  minRating: 0,
  maxDistanceKm: 5,
  categories: new Set(),  // Set of type slugs
  localOnly: false,
  sort: 'best_match',
  // Mobile sidebar toggle
  sidebarOpen: false,
  // Map / hover state
  results: [],
  resultsMap: null,
  resultsMarkers: [],
  resultsInfoWindow: null,
  hoveredId: null,
};

/* ─── URL state persistence ───────────────────────────────────────────── */

/* Encode + decode filter state in the URL hash query so users can share
   filtered searches. URL shape: #/search?q=coffee&min_rating=4&local=1 */

function _readUrlState() {
  const hash = window.location.hash || '';
  const qIdx = hash.indexOf('?');
  if (qIdx < 0) return;
  const params = new URLSearchParams(hash.slice(qIdx + 1));

  if (params.has('q')) _searchState.query = params.get('q');
  if (params.has('sort')) _searchState.sort = params.get('sort');
  if (params.has('min_rating')) {
    const v = parseFloat(params.get('min_rating'));
    if (!Number.isNaN(v)) _searchState.minRating = v;
  }
  if (params.has('dist')) {
    const v = parseInt(params.get('dist'), 10);
    if (!Number.isNaN(v) && v >= 1 && v <= 25) _searchState.maxDistanceKm = v;
  }
  if (params.has('price')) {
    _searchState.priceLevels = new Set(
      params.get('price').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 4)
    );
  }
  if (params.has('cat')) {
    _searchState.categories = new Set(params.get('cat').split(',').filter(Boolean));
  }
  if (params.has('local')) _searchState.localOnly = params.get('local') === '1';
  if (params.has('open')) _searchState.openNow = params.get('open') === '1';
}

function _writeUrlState() {
  const params = new URLSearchParams();
  if (_searchState.query) params.set('q', _searchState.query);
  if (_searchState.sort && _searchState.sort !== 'best_match') params.set('sort', _searchState.sort);
  if (_searchState.minRating) params.set('min_rating', String(_searchState.minRating));
  if (_searchState.maxDistanceKm !== FILTER_DEFAULTS.maxDistanceKm) params.set('dist', String(_searchState.maxDistanceKm));
  if (_searchState.priceLevels.size) params.set('price', Array.from(_searchState.priceLevels).sort().join(','));
  if (_searchState.categories.size) params.set('cat', Array.from(_searchState.categories).join(','));
  if (_searchState.localOnly !== FILTER_DEFAULTS.localOnly) params.set('local', _searchState.localOnly ? '1' : '0');
  if (_searchState.openNow !== FILTER_DEFAULTS.openNow) params.set('open', _searchState.openNow ? '1' : '0');

  const qs = params.toString();
  // Rebuild hash: keep #/search (or whatever path is current), append ?qs if any.
  // history.replaceState avoids triggering a route re-render.
  const newHash = '#/search' + (qs ? '?' + qs : '');
  if (newHash !== window.location.hash) {
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search + newHash);
    } catch (e) {
      // SecurityError on file:// — silently ignore; URL state is best-effort
    }
  }
}

/* ─── Filter helpers ──────────────────────────────────────────────────── */

function _activeFilterCount() {
  let n = 0;
  if (_searchState.openNow !== FILTER_DEFAULTS.openNow) n++;
  if (_searchState.priceLevels.size !== FILTER_DEFAULTS.priceLevels) n++;
  if (_searchState.minRating !== FILTER_DEFAULTS.minRating) n++;
  if (_searchState.maxDistanceKm !== FILTER_DEFAULTS.maxDistanceKm) n++;
  if (_searchState.categories.size !== FILTER_DEFAULTS.categoriesSize) n++;
  if (_searchState.localOnly !== FILTER_DEFAULTS.localOnly) n++;
  return n;
}

function _debouncedFetch() {
  clearTimeout(_searchState.debounceTimer);
  _searchState.debounceTimer = setTimeout(() => {
    _writeUrlState();
    searchFetch();
  }, 250);
}

/* ─── Page render ─────────────────────────────────────────────────────── */

function searchPage(container) {
  _readUrlState();
  const loc = locationGet();

  container.innerHTML = `
    <div class="container" style="padding-top:2rem;padding-bottom:2rem">
      <h1 class="text-3xl font-bold animate-fade-in" style="margin-bottom:1.5rem">Search Businesses</h1>

      <!-- TOP BAR: location pill + search input + segmented sort -->
      <div class="sidebar-topbar animate-fade-in animate-delay-1">
        <button class="location-pill" id="search-loc-toggle" onclick="searchToggleLocationDetails()">
          <span class="icon icon-md">${icons.mapPin}</span>
          <span id="search-loc-label">${loc ? 'Detecting location…' : 'No location set'}</span>
          <span style="font-size:0.65rem;opacity:0.6" id="search-loc-chevron">▾</span>
        </button>

        <form id="search-form" class="search-input-wrap" style="position:relative;flex:1;min-width:200px">
          <span class="icon icon-md icon-abs">${icons.search}</span>
          <input class="input" placeholder="Search businesses…" id="search-query" value="${_searchState.query || ''}" style="height:2.25rem" />
        </form>

        <div class="seg-sort" role="tablist" id="seg-sort">
          ${SORT_OPTIONS.map((s) => `
            <button data-sort="${s.value}" class="${s.value === _searchState.sort ? 'active' : ''}" onclick="searchSetSort('${s.value}')">${s.label}</button>
          `).join('')}
        </div>

        <button class="mobile-filters-fab btn btn-gradient btn-sm" onclick="searchToggleSidebar()">
          ${icons.shield} Filters <span class="filters-btn-badge" id="mobile-filters-badge" style="display:none"></span>
        </button>
      </div>

      <!-- Location details panel (collapsible map under the location pill) -->
      <div id="search-loc-details" class="glass" style="display:none;margin-bottom:0.75rem;padding:0.75rem;border-radius:0.75rem">
        <div id="search-loc-map" style="width:100%;height:200px;border-radius:6px;overflow:hidden;margin-bottom:0.5rem;background:var(--muted)"></div>
        <div class="flex justify-between items-center text-xs text-muted">
          <span id="search-loc-coords">—</span>
          <button class="btn btn-ghost btn-sm" onclick="searchUseMyLocation()" style="padding:0.25rem 0.5rem;font-size:0.7rem">${icons.navigation} Re-detect</button>
        </div>
        <div style="position:relative;margin-top:0.5rem" id="search-loc-wrapper">
          <input class="input" placeholder="Or search a different city, zip, or address…" id="search-loc-input" style="height:2.25rem" />
          <div id="search-predictions" class="autocomplete-dropdown glass-strong" style="display:none"></div>
        </div>
      </div>

      <!-- Results count line -->
      <div id="search-count" class="text-sm text-muted" style="margin-bottom:0.75rem">&nbsp;</div>

      <!-- 3-COLUMN LAYOUT: sidebar | results | map -->
      <div class="search-layout">

        <!-- ── FILTER SIDEBAR ── -->
        <aside class="filter-sidebar" id="filter-sidebar">
          <div class="flex items-center justify-between">
            <h4 style="margin:0">Filters</h4>
            <button class="sb-clear" onclick="searchClearFilters()">Clear all</button>
          </div>

          <!-- Open now -->
          <div class="sb-toggle ${_searchState.openNow ? 'is-on' : ''}" id="sb-open-toggle" onclick="searchToggleOpenNow()" role="switch" aria-checked="${_searchState.openNow}">
            <span class="label">Open now</span>
            <span class="switch"></span>
          </div>

          <!-- Price -->
          <div class="sb-section">
            <h4>Price</h4>
            <div class="price-row" id="sb-price-row">
              ${[1, 2, 3, 4].map((p) => `
                <button class="price-btn ${_searchState.priceLevels.has(p) ? 'active' : ''}" data-price="${p}" onclick="searchTogglePrice(${p})">${'$'.repeat(p)}</button>
              `).join('')}
            </div>
          </div>

          <!-- Minimum rating -->
          <div class="sb-section">
            <h4>Minimum rating</h4>
            ${RATING_PRESETS.map((r) => `
              <label class="row">
                <input type="radio" name="sb-rating" value="${r.value}" ${r.value === _searchState.minRating ? 'checked' : ''} onchange="searchSetMinRating(${r.value})" />
                ${r.label}
              </label>
            `).join('')}
          </div>

          <!-- Distance -->
          <div class="sb-section">
            <h4>Distance</h4>
            <input type="range" min="1" max="25" value="${_searchState.maxDistanceKm}" id="sb-distance" oninput="searchSetMaxDistanceKm(this.value)"
                   style="accent-color:var(--primary);width:100%" />
            <div class="flex justify-between text-xs text-muted" style="margin-top:0.25rem">
              <span>1 km</span>
              <span id="sb-distance-current">${_searchState.maxDistanceKm} km</span>
              <span>25 km</span>
            </div>
          </div>

          <!-- Category -->
          <div class="sb-section">
            <h4>Category</h4>
            ${SEARCH_CATEGORIES.map((c) => `
              <label class="row">
                <input type="checkbox" value="${c.type}" ${_searchState.categories.has(c.type) ? 'checked' : ''} onchange="searchToggleCategoryCheckbox('${c.type}', this.checked)" />
                ${c.label}
              </label>
            `).join('')}
          </div>

          <!-- Verified local only -->
          <div class="sb-toggle green ${_searchState.localOnly ? 'is-on' : ''}" id="sb-local-toggle" onclick="searchToggleLocalOnly()" role="switch" aria-checked="${_searchState.localOnly}">
            <span class="label" style="display:flex;align-items:center;gap:0.375rem">
              <span style="width:6px;height:6px;border-radius:50%;background:var(--green)"></span>
              Verified local only
            </span>
            <span class="switch"></span>
          </div>
        </aside>

        <!-- ── RESULTS GRID ── -->
        <div class="search-results-col">
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

        <!-- ── MAP COLUMN ── -->
        <div class="search-map-col">
          <div id="search-results-map" class="search-results-map"></div>
        </div>
      </div>

      <!-- Mobile-only backdrop for the sidebar bottom sheet -->
      <div class="sidebar-backdrop" id="sidebar-backdrop" onclick="searchToggleSidebar()"></div>
    </div>`;

  // Form submit
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    _searchState.query = document.getElementById('search-query').value;
    searchFetch();
  });

  // Location autocomplete (only fires when the details panel is open)
  const locInput = document.getElementById('search-loc-input');
  if (locInput) {
    locInput.addEventListener('input', () => searchAutocomplete(locInput.value));
    locInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#search-predictions .autocomplete-item');
        if (first) first.click();
      }
    });
  }
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
        document.getElementById('search-loc-label').textContent = 'Location unavailable';
      });
  }

  _refreshMobileBadge();
}

/* ─── Filter handlers ─────────────────────────────────────────────────── */

function _refreshMobileBadge() {
  const badge = document.getElementById('mobile-filters-badge');
  if (!badge) return;
  const n = _activeFilterCount();
  badge.textContent = n > 0 ? String(n) : '';
  badge.style.display = n > 0 ? 'inline-flex' : 'none';
}

function searchToggleOpenNow() {
  _searchState.openNow = !_searchState.openNow;
  const el = document.getElementById('sb-open-toggle');
  if (el) {
    el.classList.toggle('is-on', _searchState.openNow);
    el.setAttribute('aria-checked', String(_searchState.openNow));
  }
  _refreshMobileBadge();
  _debouncedFetch();
}

function searchToggleLocalOnly() {
  _searchState.localOnly = !_searchState.localOnly;
  const el = document.getElementById('sb-local-toggle');
  if (el) {
    el.classList.toggle('is-on', _searchState.localOnly);
    el.setAttribute('aria-checked', String(_searchState.localOnly));
  }
  _refreshMobileBadge();
  _debouncedFetch();
}

function searchTogglePrice(p) {
  if (_searchState.priceLevels.has(p)) _searchState.priceLevels.delete(p);
  else _searchState.priceLevels.add(p);
  document.querySelectorAll('#sb-price-row [data-price]').forEach((btn) => {
    btn.classList.toggle('active', _searchState.priceLevels.has(Number(btn.dataset.price)));
  });
  _refreshMobileBadge();
  _debouncedFetch();
}

function searchSetMinRating(value) {
  _searchState.minRating = Number(value);
  _refreshMobileBadge();
  _debouncedFetch();
}

function searchSetMaxDistanceKm(value) {
  _searchState.maxDistanceKm = Number(value);
  const lab = document.getElementById('sb-distance-current');
  if (lab) lab.textContent = `${_searchState.maxDistanceKm} km`;
  _refreshMobileBadge();
  _debouncedFetch();
}

function searchToggleCategoryCheckbox(slug, checked) {
  if (checked) _searchState.categories.add(slug);
  else _searchState.categories.delete(slug);
  _refreshMobileBadge();
  _debouncedFetch();
}

function searchSetSort(value) {
  _searchState.sort = value;
  document.querySelectorAll('#seg-sort button').forEach((b) =>
    b.classList.toggle('active', b.dataset.sort === value));
  _debouncedFetch();
}

function searchClearFilters() {
  _searchState.openNow = FILTER_DEFAULTS.openNow;
  _searchState.priceLevels = new Set();
  _searchState.minRating = FILTER_DEFAULTS.minRating;
  _searchState.maxDistanceKm = FILTER_DEFAULTS.maxDistanceKm;
  _searchState.categories = new Set();
  _searchState.localOnly = FILTER_DEFAULTS.localOnly;
  // Refresh visual state of all sidebar controls
  const openEl = document.getElementById('sb-open-toggle');
  if (openEl) { openEl.classList.toggle('is-on', _searchState.openNow); openEl.setAttribute('aria-checked', String(_searchState.openNow)); }
  const localEl = document.getElementById('sb-local-toggle');
  if (localEl) { localEl.classList.toggle('is-on', _searchState.localOnly); localEl.setAttribute('aria-checked', String(_searchState.localOnly)); }
  document.querySelectorAll('#sb-price-row [data-price]').forEach((btn) => btn.classList.remove('active'));
  document.querySelectorAll('input[name="sb-rating"]').forEach((r) => { r.checked = (Number(r.value) === _searchState.minRating); });
  const dist = document.getElementById('sb-distance');
  if (dist) dist.value = String(_searchState.maxDistanceKm);
  const distLab = document.getElementById('sb-distance-current');
  if (distLab) distLab.textContent = `${_searchState.maxDistanceKm} km`;
  document.querySelectorAll('.filter-sidebar input[type="checkbox"]').forEach((c) => { c.checked = false; });
  _refreshMobileBadge();
  searchFetch();
}

function searchToggleSidebar() {
  _searchState.sidebarOpen = !_searchState.sidebarOpen;
  const sb = document.getElementById('filter-sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  if (sb) sb.classList.toggle('open', _searchState.sidebarOpen);
  if (bd) bd.classList.toggle('open', _searchState.sidebarOpen);
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
  if (chevron) chevron.textContent = isOpen ? '▾' : '▴';

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
      latitude: loc.latitude, longitude: loc.longitude,
      radius: _searchState.maxDistanceKm * 1000,    // km → m
      independent_only: _searchState.localOnly,
      open_now: _searchState.openNow,
      sort: _searchState.sort,
    };
    if (_searchState.query) params.query = _searchState.query;
    // Backend currently accepts a single `type` — pass the first selected category.
    // Multi-category requires backend changes (parking lot for v2).
    if (_searchState.categories.size) params.type = Array.from(_searchState.categories)[0];
    if (_searchState.minRating) params.min_rating = _searchState.minRating;
    if (_searchState.priceLevels.size) params.price_levels = Array.from(_searchState.priceLevels).sort().join(',');

    const data = await businessApi.search(params);
    const businesses = data.businesses || [];
    _searchState.results = businesses;

    if (countEl) {
      const total = data.total ?? businesses.length;
      const unfiltered = data.unfiltered_total;
      const activeCount = _activeFilterCount();
      const filterText = activeCount > 0 ? ` · ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} applied` : '';
      countEl.textContent = unfiltered && unfiltered !== total
        ? `Showing ${total} of ${unfiltered} nearby${filterText}`
        : `Showing ${total} ${total === 1 ? 'result' : 'results'}${filterText}`;
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
      const fallback = data.nearest_fallback || [];
      const titleEl = document.getElementById('search-empty-title');
      const subEl = document.getElementById('search-empty-sub');
      const fbEl = document.getElementById('search-fallback');
      const activeCount = _activeFilterCount();
      if (fallback.length) {
        if (titleEl) titleEl.textContent = "No matches with those filters in this area.";
        if (subEl) subEl.textContent = `Here are the ${fallback.length} closest local businesses:`;
        if (fbEl) fbEl.innerHTML = fallback.map((b) => renderBusinessCard(b)).join('');
      } else if (activeCount > 0) {
        if (titleEl) titleEl.textContent = 'No matches with the current filters.';
        if (subEl) subEl.innerHTML = 'Try <button onclick="searchClearFilters()" class="text-primary" style="background:none;border:none;cursor:pointer;text-decoration:underline;font:inherit;color:var(--primary);padding:0">clearing all filters</button> or expanding the distance.';
        if (fbEl) fbEl.innerHTML = '';
      } else {
        if (titleEl) titleEl.textContent = 'No local businesses found in this area.';
        if (subEl) subEl.textContent = 'Try a larger distance, a different category, or change your location.';
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

/* ─── Map + hover sync ────────────────────────────────────────────────── */

function _badgeColor(badge) {
  if (badge === 'verified_local') return '#1f8a4c';
  if (badge === 'likely_local') return '#7fb98a';
  return '#9aa1ac';
}

function _pinSvg(color, label) {
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

  if (_searchState.resultsMarkers.length) {
    _searchState.resultsMarkers.forEach((m) => m.setMap(null));
    _searchState.resultsMarkers = [];
  }
  if (_searchState.resultsInfoWindow) _searchState.resultsInfoWindow.close();

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

  if (_searchState.resultsMarkers.length > 1) {
    _searchState.resultsMap.fitBounds(bounds, 60);
    google.maps.event.addListenerOnce(_searchState.resultsMap, 'bounds_changed', () => {
      if (_searchState.resultsMap.getZoom() > 16) _searchState.resultsMap.setZoom(16);
    });
  }
}

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
      const icon = marker.getIcon();
      if (icon && typeof icon === 'object') {
        marker.setIcon({ ...icon, scaledSize: new google.maps.Size(40, 52), anchor: new google.maps.Point(20, 52) });
      }
    } else {
      marker.setZIndex(100 + (1000 - idx));
    }
  });
}

function searchHoverPin(bizId) {
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
    if (chevron) chevron.textContent = '▾';
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
    if (chevron) chevron.textContent = '▾';
    await searchUpdateLocationName();
    searchFetch();
  }).catch(() => {
    document.getElementById('search-loc-label').textContent = 'Location unavailable';
  });
}
