/* ─── Theme: light / dark / system tri-state ─────────────────────────── */

const THEME_KEY = 'locallens.theme';

function themeRead() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

function themeApply(mode) {
  const html = document.documentElement;
  if (mode === 'system') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', mode);
}

function themeSet(mode) {
  localStorage.setItem(THEME_KEY, mode);
  themeApply(mode);
  window.dispatchEvent(new Event('theme-changed'));
}

function themeCycle() {
  const next = { light: 'dark', dark: 'system', system: 'light' }[themeRead()];
  themeSet(next);
}

// Apply on load (script tag in HTML head already applied; this is the no-flash
// re-apply for SPA navigations and to keep state consistent if storage changes)
themeApply(themeRead());
