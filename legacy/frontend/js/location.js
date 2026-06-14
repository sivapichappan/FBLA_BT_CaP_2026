/* ─── Location State Management ──────────────────────────────────────── */

let _location = null;

try {
  const saved = localStorage.getItem('user_location');
  if (saved) _location = JSON.parse(saved);
} catch (e) {}

function locationGet() { return _location; }

function locationSet(lat, lng) {
  _location = { latitude: lat, longitude: lng };
  localStorage.setItem('user_location', JSON.stringify(_location));
  window.dispatchEvent(new Event('location-changed'));
  // Best-effort server sync
  if (authIsAuthenticated()) {
    apiPut('/auth/location', { latitude: lat, longitude: lng }).catch(() => {});
  }
}

function locationRequest() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locationSet(pos.coords.latitude, pos.coords.longitude);
        resolve(_location);
      },
      (err) => {
        console.error('Geolocation error:', err);
        reject(err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
