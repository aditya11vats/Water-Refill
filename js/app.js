/* ---------- CONSTANTS (edit these to match your sourced figures) ---------- */
const PLASTIC_PER_BOTTLE_G = 12.7;   // avg weight of a single-use PET bottle (g)
const CO2_PER_BOTTLE_G = 82.8;       // avg CO2e footprint per bottle produced+shipped (g)
const COST_PER_BOTTLE = 1.5;         // avg price of a bottled water on campus (USD)

/* Campus configuration - EDIT THESE for your campus */
const CAMPUS_CONFIG = {
  name: 'Campus',
  defaultLat: 29.7604,
  defaultLng: -95.3698,
  defaultZoom: 16,
  bounds: null // e.g., [[south, west], [north, east]]
};

/* Seed stations - sample data only, replace with verified locations in data/stations.json */
const seedStations = [
  {id:'s1', name:'Student Union Fountain', building:'Student Union', lat:29.7604, lng:-95.3698, type:'fountain', status:'ok', verified: false},
  {id:'s2', name:'Library Main Entrance', building:'Library', lat:29.7614, lng:-95.3688, type:'bottle-filler', status:'ok', verified: false},
  {id:'s3', name:'Rec Center Lobby', building:'Rec Center', lat:29.7594, lng:-95.3708, type:'cooler', status:'ok', verified: false},
  {id:'s4', name:'Science Building 1F', building:'Science Hall', lat:29.7624, lng:-95.3678, type:'bottle-filler', status:'ok', verified: false}
];

/* Validation constants */
const MAX_BOTTLES_PER_LOG = 100;
const MAX_LEADERBOARD_BOTTLES = 10000;
const MIN_STATION_NAME_LENGTH = 2;
const MAX_STATION_NAME_LENGTH = 100;

/* ---------- UTILITIES ---------- */
function loadLS(key, fallback, validator = null) {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const parsed = JSON.parse(v);
    if (validator && !validator(parsed)) {
      console.warn(`Invalid data in localStorage for ${key}, using fallback`);
      return fallback;
    }
    return parsed;
  } catch (e) {
    console.warn(`Failed to load ${key} from localStorage:`, e);
    return fallback;
  }
}

function saveLS(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage:`, e);
    showToast('Storage full or unavailable. Data may not persist.', 'error');
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'");
}

/* CSV injection prevention: prefix dangerous starters with a zero-width space */
function sanitizeForCsv(str) {
  const s = String(str);
  if (/^[=+\-@]/.test(s.trim())) {
    return '\u200B' + s; // zero-width space prefix
  }
  return s.replace(/"/g, '""');
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function validateStationData(data) {
  return Array.isArray(data) && data.every(s =>
    s && typeof s.id === 'string' &&
    typeof s.name === 'string' && s.name.trim().length >= MIN_STATION_NAME_LENGTH &&
    typeof s.building === 'string' && s.building.trim().length >= 2 &&
    typeof s.lat === 'number' && isFinite(s.lat) && s.lat >= -90 && s.lat <= 90 &&
    typeof s.lng === 'number' && isFinite(s.lng) && s.lng >= -180 && s.lng <= 180 &&
    ['fountain', 'bottle-filler', 'cooler'].includes(s.type) &&
    ['ok', 'issue'].includes(s.status)
  );
}

function validateLogs(data) {
  return Array.isArray(data) && data.every(l =>
    l && typeof l.id === 'string' &&
    typeof l.stationId === 'string' &&
    typeof l.bottles === 'number' && isFinite(l.bottles) && l.bottles > 0 &&
    typeof l.date === 'string' && !isNaN(Date.parse(l.date))
  );
}

function validateFavorites(data) {
  return Array.isArray(data) && data.every(id => typeof id === 'string');
}

function validateLeaders(data) {
  return Array.isArray(data) && data.every(l =>
    l && typeof l.name === 'string' && l.name.trim().length > 0 &&
    typeof l.bottles === 'number' && isFinite(l.bottles) && l.bottles >= 0
  );
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h3 id="modal-title">${escapeHtml(message)}</h3>
      <div class="modal-actions">
        <button class="btn ghost" id="modal-cancel">Cancel</button>
        <button class="btn danger" id="modal-ok">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cleanup = () => {
    overlay.classList.add('hiding');
    setTimeout(() => overlay.remove(), 200);
  };

  overlay.querySelector('#modal-ok').addEventListener('click', () => {
    cleanup();
    onConfirm();
  });
  overlay.querySelector('#modal-cancel').addEventListener('click', cleanup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cleanup();
  });

  const cancelBtn = overlay.querySelector('#modal-cancel');
  cancelBtn.focus();
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cleanup();
  });
}

/* ---------- STATE ---------- */
let stations = loadLS('refill_stations', null, validateStationData);
let logs = loadLS('refill_logs', [], validateLogs);
let favorites = loadLS('refill_favorites', [], validateFavorites);
let leaders = loadLS('refill_leaders', [], validateLeaders);
let activeTypeFilter = 'all';
let favoritesOnly = false;
let userLocation = null;
let map = null;
let markers = {};
let mapLoaded = false;
let leafletLoadFailed = false;

/* Type icons with accessible labels */
const typeIcon = {
  fountain: { symbol: '\u26F2', label: 'Drinking Fountain' },
  'bottle-filler': { symbol: '\u1F6B0', label: 'Bottle Filler' },
  cooler: { symbol: '\u1F9CA', label: 'Water Cooler' }
};

const statusLabel = { ok: 'Working', issue: 'Issue Reported' };

/* ---------- THEME ---------- */
const themeBtn = document.getElementById('themeToggle');

(function initTheme() {
  const saved = localStorage.getItem('refill_theme');
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  if (themeBtn) themeBtn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\u1F319';
})();

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  if (themeBtn) themeBtn.textContent = t === 'dark' ? '\u2600\uFE0F' : '\u1F319';
  saveLS('refill_theme', t);
}

themeBtn?.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

/* ---------- NAV ---------- */
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    const viewId = btn.dataset.view;
    document.getElementById(viewId).classList.add('active');
    if (viewId === 'finder' && map) {
      setTimeout(() => map.invalidateSize(), 60);
    }
    if (viewId === 'tracker') {
      renderStationSelect();
    }
  });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      btn.click();
    }
  });
});

/* ---------- FILTERS ---------- */
const typeFiltersEl = document.getElementById('typeFilters');
typeFiltersEl?.addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;

  if (pill.dataset.favorites) {
    favoritesOnly = !favoritesOnly;
    pill.classList.toggle('active', favoritesOnly);
    pill.setAttribute('aria-pressed', favoritesOnly);
  } else {
    activeTypeFilter = pill.dataset.type;
    document.querySelectorAll('#typeFilters .pill[data-type]').forEach(p =>
      p.classList.toggle('active', p === pill)
    );
    pill.setAttribute('aria-pressed', 'true');
  }
  renderStationList(document.getElementById('searchBox').value);
});

typeFiltersEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    const pill = e.target.closest('.pill');
    if (pill) {
      e.preventDefault();
      pill.click();
    }
  }
});

/* ---------- SEARCH ---------- */
const searchBox = document.getElementById('searchBox');
searchBox?.addEventListener('input', (e) => renderStationList(e.target.value));

/* ---------- INIT DATA then APP ---------- */
async function initStations() {
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.classList.add('map-loading');

  if (stations) {
    startApp();
    return;
  }

  try {
    const res = await fetch('data/stations.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    stations = await res.json();

    if (!validateStationData(stations)) {
      throw new Error('Invalid station data format');
    }

    stations = stations.map(s => ({ ...s, verified: true }));
  } catch (e) {
    console.warn('Failed to load stations.json, using seed data:', e);
    stations = seedStations.map(s => ({ ...s }));
    showToast('Using sample station data. Replace data/stations.json with real campus data.', 'warn');
  }

  saveLS('refill_stations', stations);
  startApp();
}

/* ---------- MAP INITIALIZATION ---------- */
function initMap() {
  return new Promise((resolve, reject) => {
    if (typeof L === 'undefined') {
      leafletLoadFailed = true;
      reject(new Error('Leaflet failed to load from CDN'));
      return;
    }

    const mapEl = document.getElementById('map');
    if (!mapEl) {
      reject(new Error('Map container not found'));
      return;
    }

    mapEl.classList.remove('map-loading');

    let initialLat = CAMPUS_CONFIG.defaultLat;
    let initialLng = CAMPUS_CONFIG.defaultLng;
    let initialZoom = CAMPUS_CONFIG.defaultZoom;

    if (stations.length > 0) {
      initialLat = stations[0].lat;
      initialLng = stations[0].lng;
    }

    try {
      map = L.map('map', {
        zoomControl: true,
        attributionControl: true
      }).setView([initialLat, initialLng], initialZoom);

      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        crossOrigin: true
      });

      tileLayer.on('tileerror', (e) => {
        console.warn('Map tile failed to load:', e.tile.src);
      });

      tileLayer.addTo(map);

      if (CAMPUS_CONFIG.bounds) {
        map.setMaxBounds(CAMPUS_CONFIG.bounds);
      }

      map.on('click', (e) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        if (isValidCoordinate(lat, lng)) {
          document.getElementById('addLat').value = lat.toFixed(6);
          document.getElementById('addLng').value = lng.toFixed(6);
          document.querySelector('nav button[data-view="add"]').click();
          showToast('Coordinates filled. Complete the form to add station.', 'info');
        }
      });

      mapLoaded = true;
      setTimeout(() => map.invalidateSize(), 150);
      resolve(map);
    } catch (e) {
      reject(e);
    }
  });
}

function isValidCoordinate(lat, lng) {
  return typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90 &&
         typeof lng === 'number' && isFinite(lng) && lng >= -180 && lng <= 180;
}

/* ---------- DISTANCE CALCULATION (Haversine) ---------- */
function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---------- GEOLOCATION ---------- */
const locateBtn = document.getElementById('locateBtn');
const distanceInfo = document.getElementById('distanceInfo');

locateBtn?.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported in this browser.', 'error');
    return;
  }

  locateBtn.disabled = true;
  locateBtn.textContent = '\u1F4CD Locating\u2026';
  distanceInfo.textContent = 'Locating\u2026';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      distanceInfo.textContent = 'Sorted by distance from you';

      // Show "Load real stations" button
      const loadRealBtn = document.getElementById('loadRealBtn');
      if (loadRealBtn) loadRealBtn.style.display = 'inline-block';

      if (map && mapLoaded) {
        L.marker([userLocation.lat, userLocation.lng], {
          title: 'Your Location',
          icon: L.divIcon({
            className: 'user-location-marker',
            html: '<div style="width:20px;height:20px;border-radius:50%;background:#0d9488;border:3px solid white;box-shadow:0 0 0 2px #0d9488;"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(map).bindPopup('You are here').openPopup();

        map.setView([userLocation.lat, userLocation.lng], 16);
      }

      renderStationList(searchBox.value);
      locateBtn.disabled = false;
      locateBtn.textContent = '\u1F4CD Find stations near me';
    },
    (err) => {
      distanceInfo.textContent = '';
      locateBtn.disabled = false;
      locateBtn.textContent = '\u1F4CD Find stations near me';

      let msg = 'Could not get your location.';
      if (err.code === err.PERMISSION_DENIED) msg = 'Location permission denied. Please enable in browser settings.';
      else if (err.code === err.TIMEOUT) msg = 'Location request timed out.';
      else if (err.code === err.POSITION_UNAVAILABLE) msg = 'Location unavailable.';

      showToast(msg, 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
});

/* ---------- REAL-TIME STATIONS (Overpass API) ---------- */
const loadRealBtn = document.getElementById('loadRealBtn');
let realStationsLoaded = false;

async function fetchRealStations(lat, lng, radiusKm = 2) {
  const radiusM = radiusKm * 1000;
  const overpassQuery = `
    [out:json][timeout:25];
    (
      node["amenity"="drinking_water"](around:${radiusM},${lat},${lng});
      node["man_made"="water_tap"](around:${radiusM},${lat},${lng});
      node["drinking_water"="yes"](around:${radiusM},${lat},${lng});
    );
    out body;
    >;
    out skel qt;
  `;

  const url = 'https://overpass-api.de/api/interpreter';
  const res = await fetch(url, {
    method: 'POST',
    body: overpassQuery,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (!res.ok) throw new Error(`Overpass API error: ${res.status}`);
  const data = await res.json();

  const newStations = [];
  for (const el of data.elements) {
    if (el.type !== 'node' || !el.lat || !el.lon) continue;

    const tags = el.tags || {};
    let type = 'fountain';
    let name = tags.name || 'Water Point';
    let building = '';

    if (tags['man_made'] === 'water_tap' || tags['drinking_water:bottle'] === 'yes') {
      type = 'bottle-filler';
    } else if (tags.amenity === 'drinking_water') {
      type = 'fountain';
    }

    if (tags.building) building = tags.building;
    else if (tags.operator) building = tags.operator;
    else if (tags.brand) building = tags.brand;
    else building = 'OpenStreetMap';

    const isDuplicate = stations.some(s =>
      distKm(s.lat, s.lng, el.lat, el.lon) < 0.02
    );
    if (isDuplicate) continue;

    newStations.push({
      id: uid('osm'),
      name: name.length > 50 ? name.slice(0, 47) + '...' : name,
      building: building.length > 50 ? building.slice(0, 47) + '...' : building,
      lat: el.lat,
      lng: el.lon,
      type,
      status: 'ok',
      verified: false,
      source: 'openstreetmap',
      osmId: el.id
    });
  }

  return newStations;
}

loadRealBtn?.addEventListener('click', async () => {
  if (!userLocation) {
    showToast('Please click "Find stations near me" first.', 'error');
    return;
  }
  if (realStationsLoaded) {
    showToast('Real stations already loaded.', 'info');
    return;
  }

  loadRealBtn.disabled = true;
  loadRealBtn.textContent = '🌐 Loading...';

  try {
    const newStations = await fetchRealStations(userLocation.lat, userLocation.lng, 3);

    if (newStations.length === 0) {
      showToast('No water stations found in OpenStreetMap nearby.', 'info');
      return;
    }

    stations.push(...newStations);
    saveLS('refill_stations', stations);

    renderMarkers();
    renderStationList(searchBox.value);
    renderStationSelect();
    renderAdminTable();

    realStationsLoaded = true;
    loadRealBtn.style.display = 'none';
    showToast(`Loaded ${newStations.length} real stations from OpenStreetMap!`, 'success');

  } catch (e) {
    console.error('Failed to fetch real stations:', e);
    showToast('Failed to load real stations. Check internet connection.', 'error');
  } finally {
    loadRealBtn.disabled = false;
    loadRealBtn.textContent = '🌐 Load real stations';
  }
});

/* ---------- STATION LIST RENDERING ---------- */
function renderStationList(filter = '') {
  const wrap = document.getElementById('stationList');
  if (!wrap) return;

  const f = filter.trim().toLowerCase();
  let list = stations.filter(s =>
    !f || s.name.toLowerCase().includes(f) || s.building.toLowerCase().includes(f)
  );

  if (activeTypeFilter !== 'all') {
    list = list.filter(s => s.type === activeTypeFilter);
  }
  if (favoritesOnly) {
    list = list.filter(s => favorites.includes(s.id));
  }

  if (userLocation) {
    list = list.map(s => ({
      ...s,
      _dist: distKm(userLocation.lat, userLocation.lng, s.lat, s.lng)
    })).sort((a, b) => a._dist - b._dist);
  }

  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty" role="status">No stations match.</div>';
    return;
  }

  wrap.innerHTML = list.map(s => {
    const typeInfo = typeIcon[s.type] || { symbol: '', label: s.type };
    const status = s.status || 'ok';
    const isFavorite = favorites.includes(s.id);
    const verifiedBadge = s.verified ? ' <span class="badge verified" title="Verified location">\u2713</span>' : '';

    return `
      <div class="station" data-station-id="${escapeHtml(s.id)}">
        <div class="info">
          <b>
            <span aria-hidden="true">${typeInfo.symbol}</span>
            <span class="sr-only">${typeInfo.label}</span>
            ${escapeHtml(s.name)}
            <span class="badge ${status === 'issue' ? 'issue' : 'ok'}">${escapeHtml(statusLabel[status])}</span>
            ${verifiedBadge}
          </b>
          <span>
            ${escapeHtml(s.building)}
            ${s._dist !== undefined ? ' \u2022 ' + s._dist.toFixed(2) + ' km away' : ''}
          </span>
        </div>
        <div class="station-actions" style="display:flex; gap:6px; align-items:center;">
          <button class="star-btn" aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${isFavorite}" data-action="favorite" data-id="${escapeHtml(s.id)}">${isFavorite ? '\u2B50' : '\u2606'}</button>
          <button class="btn secondary" aria-label="Center map on ${escapeHtml(s.name)}" data-action="focus" data-id="${escapeHtml(s.id)}">Map</button>
          <button class="btn ghost" aria-label="${status === 'issue' ? 'Mark as working' : 'Report issue'} for ${escapeHtml(s.name)}" data-action="report" data-id="${escapeHtml(s.id)}">\u26A0 ${status === 'issue' ? 'Fixed' : 'Report'}</button>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('.station-actions button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'favorite') toggleFavorite(id);
      else if (action === 'focus') focusStation(id);
      else if (action === 'report') reportIssue(id);
    });
  });
}

/* ---------- FAVORITES ---------- */
function toggleFavorite(id) {
  if (!stations.find(s => s.id === id)) {
    showToast('Station not found.', 'error');
    return;
  }

  favorites = favorites.includes(id)
    ? favorites.filter(x => x !== id)
    : [...favorites, id];

  saveLS('refill_favorites', favorites);
  renderStationList(searchBox.value);
}

/* ---------- REPORT ISSUE ---------- */
function reportIssue(id) {
  const s = stations.find(x => x.id === id);
  if (!s) {
    showToast('Station not found.', 'error');
    return;
  }

  s.status = s.status === 'issue' ? 'ok' : 'issue';
  saveLS('refill_stations', stations);
  renderMarkers();
  renderStationList(searchBox.value);
  renderAdminTable();
  showToast(`Station marked as ${s.status === 'issue' ? 'having an issue' : 'working'}.`, 'info');
}

/* ---------- FOCUS STATION ON MAP ---------- */
function focusStation(id) {
  const s = stations.find(x => x.id === id);
  if (!s) {
    showToast('Station not found.', 'error');
    return;
  }

  document.querySelector('nav button[data-view="finder"]').click();
  setTimeout(() => {
    if (map && markers[id]) {
      map.setView([s.lat, s.lng], 18);
      markers[id].openPopup();
    }
  }, 70);
}

/* ---------- MARKERS ---------- */
function renderMarkers() {
  if (!map || !mapLoaded) return;

  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  stations.forEach(s => {
    if (!isValidCoordinate(s.lat, s.lng)) return;

    const typeInfo = typeIcon[s.type] || { symbol: '', label: s.type };
    const status = s.status || 'ok';

    const m = L.marker([s.lat, s.lng], {
      title: `${s.name} (${s.building})`
    }).addTo(map)
      .bindPopup(`
        <strong>${escapeHtml(s.name)}</strong><br>
        ${escapeHtml(s.building)}<br>
        <span aria-hidden="true">${typeInfo.symbol}</span> ${escapeHtml(typeInfo.label)}
        ${status === 'issue' ? '<br><span style="color:#e0564a">\u26A0 Issue reported</span>' : ''}
        ${s.verified ? '<br><span style="color:#0d9488">\u2713 Verified location</span>' : '<br><span style="color:#d99a1f">\u26A0 Sample data (not verified)</span>'}
      `);

    markers[s.id] = m;
  });
}

/* ---------- STATION SELECT (for log form) ---------- */
function renderStationSelect() {
  const sel = document.getElementById('logStation');
  if (!sel) return;

  const workingStations = stations.filter(s => s.status === 'ok');
  if (workingStations.length === 0) {
    sel.innerHTML = '<option value="" disabled>No working stations available</option>';
    return;
  }

  sel.innerHTML = workingStations.map(s => {
    const typeInfo = typeIcon[s.type] || { symbol: '', label: s.type };
    return `<option value="${escapeHtml(s.id)}"><span aria-hidden="true">${typeInfo.symbol}</span> ${escapeHtml(s.name)} (${escapeHtml(s.building)})</option>`;
  }).join('');
}

/* ---------- ADMIN TABLE ---------- */
function renderAdminTable() {
  const tbody = document.getElementById('adminTable');
  if (!tbody) return;

  if (stations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No stations added yet.</td></tr>';
    return;
  }

  tbody.innerHTML = stations.map(s => {
    const typeInfo = typeIcon[s.type] || { symbol: '', label: s.type };
    const status = s.status || 'ok';
    const verified = s.verified ? '\u2713' : '\u26A0';

    return `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.building)}</td>
        <td><span aria-hidden="true">${typeInfo.symbol}</span> ${escapeHtml(typeInfo.label)}</td>
        <td><span class="badge ${status === 'issue' ? 'issue' : 'ok'}">${escapeHtml(statusLabel[status])}</td>
        <td>
          <span class="verified-indicator" title="${s.verified ? 'Verified location' : 'Sample data - not verified'}">${verified}</span>
          <button class="btn danger" aria-label="Remove ${escapeHtml(s.name)}" data-action="remove" data-id="${escapeHtml(s.id)}">Remove</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('button[data-action="remove"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      showConfirm(`Remove "${stations.find(s => s.id === id)?.name || 'this station'}"? This cannot be undone.`, () => removeStation(id));
    });
  });
}

/* ---------- REMOVE STATION ---------- */
function removeStation(id) {
  const station = stations.find(s => s.id === id);
  if (!station) {
    showToast('Station not found.', 'error');
    return;
  }

  stations = stations.filter(s => s.id !== id);
  favorites = favorites.filter(f => f !== id);

  saveLS('refill_stations', stations);
  saveLS('refill_favorites', favorites);

  renderMarkers();
  renderStationList(searchBox.value);
  renderStationSelect();
  renderAdminTable();
  renderTracker();
  showToast(`Removed "${escapeHtml(station.name)}".`, 'info');
}

/* ---------- ADD STATION FORM ---------- */
const addForm = document.getElementById('addForm');
addForm?.addEventListener('submit', (e) => {
  e.preventDefault();

  const nameEl = document.getElementById('addName');
  const buildingEl = document.getElementById('addBuilding');
  const latEl = document.getElementById('addLat');
  const lngEl = document.getElementById('addLng');
  const typeEl = document.getElementById('addType');

  const name = nameEl.value.trim();
  const building = buildingEl.value.trim();
  const lat = parseFloat(latEl.value);
  const lng = parseFloat(lngEl.value);
  const type = typeEl.value;

  const errors = [];

  if (!name || name.length < MIN_STATION_NAME_LENGTH || name.length > MAX_STATION_NAME_LENGTH) {
    errors.push(`Station name must be ${MIN_STATION_NAME_LENGTH}-${MAX_STATION_NAME_LENGTH} characters.`);
    nameEl.setAttribute('aria-invalid', 'true');
  } else {
    nameEl.removeAttribute('aria-invalid');
  }

  if (!building || building.length < 2 || building.length > MAX_STATION_NAME_LENGTH) {
    errors.push('Building/area must be at least 2 characters.');
    buildingEl.setAttribute('aria-invalid', 'true');
  } else {
    buildingEl.removeAttribute('aria-invalid');
  }

  if (!isValidCoordinate(lat, lng)) {
    errors.push('Valid coordinates required (lat: -90 to 90, lng: -180 to 180).');
    latEl.setAttribute('aria-invalid', 'true');
    lngEl.setAttribute('aria-invalid', 'true');
  } else {
    latEl.removeAttribute('aria-invalid');
    lngEl.removeAttribute('aria-invalid');
  }

  const duplicate = stations.find(s =>
    s.name.toLowerCase() === name.toLowerCase() &&
    s.building.toLowerCase() === building.toLowerCase() &&
    distKm(s.lat, s.lng, lat, lng) < 0.01
  );
  if (duplicate) {
    errors.push('A station with this name and location already exists.');
    nameEl.setAttribute('aria-invalid', 'true');
    buildingEl.setAttribute('aria-invalid', 'true');
  }

  if (errors.length > 0) {
    showToast(errors.join(' '), 'error');
    return;
  }

  const newStation = {
    id: uid('s'),
    name,
    building,
    lat,
    lng,
    type,
    status: 'ok',
    verified: false
  };

  stations.push(newStation);
  saveLS('refill_stations', stations);

  e.target.reset();
  latEl.value = '';
  lngEl.value = '';

  renderMarkers();
  renderStationList(searchBox.value);
  renderStationSelect();
  renderAdminTable();

  showToast(`Added "${escapeHtml(name)}".`, 'success');
  document.querySelector('nav button[data-view="finder"]').click();
  setTimeout(() => {
    if (map && markers[newStation.id]) {
      map.setView([lat, lng], 18);
      markers[newStation.id].openPopup();
    }
  }, 100);
});

/* ---------- TRACKER / LOG REFILL ---------- */
const logForm = document.getElementById('logForm');
logForm?.addEventListener('submit', (e) => {
  e.preventDefault();

  const stationId = document.getElementById('logStation').value;
  const bottlesInput = document.getElementById('logBottles');
  const bottlesRaw = bottlesInput.value.trim();
  const bottles = parseInt(bottlesRaw, 10);

  if (!stationId) {
    showToast('Please select a station.', 'error');
    return;
  }

  const station = stations.find(s => s.id === stationId);
  if (!station) {
    showToast('Selected station no longer exists.', 'error');
    renderStationSelect();
    return;
  }

  if (station.status === 'issue') {
    showConfirm('This station has a reported issue. Log anyway?', () => proceedLog(stationId, bottles));
    return;
  }

  proceedLog(stationId, bottles);

  function proceedLog(stationId, bottles) {
    if (isNaN(bottles) || bottles < 1) {
      showToast('Please enter a valid number of bottles (1 or more).', 'error');
      bottlesInput.setAttribute('aria-invalid', 'true');
      return;
    }
    if (bottles > MAX_BOTTLES_PER_LOG) {
      showToast(`Maximum ${MAX_BOTTLES_PER_LOG} bottles per entry.`, 'error');
      bottlesInput.setAttribute('aria-invalid', 'true');
      return;
    }
    bottlesInput.removeAttribute('aria-invalid');

    logs.push({
      id: uid('l'),
      stationId,
      bottles,
      date: new Date().toISOString()
    });
    saveLS('refill_logs', logs);

    bottlesInput.value = 1;
    renderTracker();
    showToast(`Logged ${bottles} bottle${bottles !== 1 ? 's' : ''} at ${escapeHtml(station.name)}.`, 'success');
  }
});

/* ---------- TRACKER RENDERING ---------- */
function renderTracker() {
  const totalBottles = logs.reduce((sum, l) => sum + l.bottles, 0);

  document.getElementById('statBottles').textContent = totalBottles.toLocaleString();
  document.getElementById('statPlastic').textContent = (totalBottles * PLASTIC_PER_BOTTLE_G / 1000).toFixed(2) + ' kg';
  document.getElementById('statCo2').textContent = (totalBottles * CO2_PER_BOTTLE_G / 1000).toFixed(2) + ' kg';
  document.getElementById('statMoney').textContent = '$' + (totalBottles * COST_PER_BOTTLE).toFixed(2);

  renderHistory();
  renderWeekChart();
}

/* ---------- HISTORY ---------- */
function renderHistory() {
  const wrap = document.getElementById('historyWrap');
  if (!wrap) return;

  if (logs.length === 0) {
    wrap.innerHTML = '<div class="empty" role="status">No refills logged yet.</div>';
    return;
  }

  const rows = [...logs].reverse().slice(0, 50).map(l => {
    const st = stations.find(s => s.id === l.stationId);
    const d = new Date(l.date);
    return `
      <tr>
        <td>${escapeHtml(d.toLocaleDateString())} ${escapeHtml(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</td>
        <td>${st ? escapeHtml(st.name) : '<em>Removed station</em>'}</td>
        <td>${l.bottles}</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>When</th><th>Station</th><th>Bottles</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${logs.length > 50 ? `<p style="color:var(--muted);font-size:.8rem;margin-top:8px;">Showing latest 50 of ${logs.length} entries. <button class="btn ghost" id="showAllHistory">Show all</button></p>` : ''}
  `;

  const showAllBtn = document.getElementById('showAllHistory');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => renderFullHistory());
  }
}

function renderFullHistory() {
  const wrap = document.getElementById('historyWrap');
  if (!wrap) return;

  const rows = [...logs].reverse().map(l => {
    const st = stations.find(s => s.id === l.stationId);
    const d = new Date(l.date);
    return `
      <tr>
        <td>${escapeHtml(d.toLocaleDateString())} ${escapeHtml(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</td>
        <td>${st ? escapeHtml(st.name) : '<em>Removed station</em>'}</td>
        <td>${l.bottles}</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>When</th><th>Station</th><th>Bottles</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:var(--muted);font-size:.8rem;margin-top:8px;">Showing all ${logs.length} entries. <button class="btn ghost" id="showLessHistory">Show less</button></p>
  `;

  document.getElementById('showLessHistory')?.addEventListener('click', renderHistory);
}

/* ---------- WEEKLY CHART ---------- */
function renderWeekChart() {
  const chartEl = document.getElementById('weekChart');
  if (!chartEl) return;

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayMidnight);
    d.setDate(todayMidnight.getDate() - i);
    const key = d.toISOString().split('T')[0];
    days.push({
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      key,
      total: 0
    });
  }

  logs.forEach(l => {
    const logDate = new Date(l.date);
    const logKey = logDate.toISOString().split('T')[0];
    const day = days.find(d => d.key === logKey);
    if (day) day.total += l.bottles;
  });

  const max = Math.max(1, ...days.map(d => d.total));

  chartEl.innerHTML = days.map(d => `
    <div class="bar-col">
      <div class="bar" style="height:${Math.max(2, (d.total / max) * 100)}%" title="${d.total} bottle${d.total !== 1 ? 's' : ''}" role="img" aria-label="${d.label}: ${d.total} bottle${d.total !== 1 ? 's' : ''}"></div>
      <div class="bar-label">${escapeHtml(d.label)}</div>
    </div>
  `).join('');
}

/* ---------- CSV EXPORT ---------- */
document.getElementById('exportCsv')?.addEventListener('click', () => {
  if (logs.length === 0) {
    showToast('No refills logged yet.', 'info');
    return;
  }

  const exportBtn = document.getElementById('exportCsv');
  exportBtn.disabled = true;
  exportBtn.textContent = '\u2B07 Exporting\u2026';

  try {
    const rows = [['Date', 'Station', 'Bottles']];
    logs.forEach(l => {
      const st = stations.find(s => s.id === l.stationId);
      rows.push([
        sanitizeForCsv(new Date(l.date).toISOString()),
        sanitizeForCsv(st ? st.name : 'Removed station'),
        l.bottles
      ]);
    });

    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `refill_history_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    showToast('CSV downloaded successfully.', 'success');
  } catch (e) {
    console.error('CSV export failed:', e);
    showToast('Export failed. Please try again.', 'error');
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = '\u2B07 Export CSV';
  }
});

/* ---------- LEADERBOARD ---------- */
const leaderForm = document.getElementById('leaderForm');
leaderForm?.addEventListener('submit', (e) => {
  e.preventDefault();

  const nameEl = document.getElementById('leaderName');
  const bottlesEl = document.getElementById('leaderBottles');

  const name = nameEl.value.trim();
  const bottlesRaw = bottlesEl.value.trim();
  const bottles = parseInt(bottlesRaw, 10);

  if (!name) {
    showToast('Please enter a name.', 'error');
    nameEl.setAttribute('aria-invalid', 'true');
    return;
  }
  nameEl.removeAttribute('aria-invalid');

  if (isNaN(bottles) || bottles < 0) {
    showToast('Bottles must be a non-negative number.', 'error');
    bottlesEl.setAttribute('aria-invalid', 'true');
    return;
  }
  if (bottles > MAX_LEADERBOARD_BOTTLES) {
    showToast(`Maximum ${MAX_LEADERBOARD_BOTTLES.toLocaleString()} bottles.`, 'error');
    bottlesEl.setAttribute('aria-invalid', 'true');
    return;
  }
  bottlesEl.removeAttribute('aria-invalid');

  const existing = leaders.find(l => l.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.bottles = bottles;
    showToast(`Updated ${escapeHtml(name)} to ${bottles} bottles.`, 'success');
  } else {
    leaders.push({ name, bottles });
    showToast(`Added ${escapeHtml(name)} with ${bottles} bottles.`, 'success');
  }

  saveLS('refill_leaders', leaders);
  e.target.reset();
  renderLeaderboard();
});

function renderLeaderboard() {
  const wrap = document.getElementById('leaderList');
  if (!wrap) return;

  const totalBottles = logs.reduce((sum, l) => sum + l.bottles, 0);

  const combined = [
    ...leaders,
    { name: 'You', bottles: totalBottles, isYou: true }
  ].sort((a, b) => b.bottles - a.bottles);

  if (combined.length === 1 && combined[0].isYou && combined[0].bottles === 0) {
    wrap.innerHTML = '<div class="empty" role="status">No entries yet. Log refills or add names above.</div>';
    return;
  }

  wrap.innerHTML = combined.map((l, i) => `
    <div class="leader-row" ${l.isYou ? 'style="font-weight:600;"' : ''}>
      <span>${i + 1}. ${escapeHtml(l.name)}${l.isYou ? ' (you)' : ''}</span>
      <span><b>${l.bottles.toLocaleString()}</b> bottle${l.bottles !== 1 ? 's' : ''}</span>
    </div>
  `).join('');
}

/* ---------- APP START ---------- */
async function startApp() {
  try {
    await initMap();
  } catch (e) {
    console.error('Map initialization failed:', e);
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.classList.remove('map-loading');
      mapEl.innerHTML = `
        <div class="map-error" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:20px;text-align:center;color:var(--muted);">
          <div style="font-size:3rem;margin-bottom:12px;">\u1F5FA\uFE0F</div>
          <strong>Map unavailable</strong>
          <p style="margin:8px 0 0;font-size:.85rem;">Leaflet failed to load. Check internet connection or try a local server.</p>
          <button class="btn" onclick="location.reload()" style="margin-top:12px;">Retry</button>
        </div>
      `;
    }
    leafletLoadFailed = true;
  }

  renderMarkers();
  renderStationList();
  renderStationSelect();
  renderAdminTable();
  renderTracker();
  renderLeaderboard();

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (map && mapLoaded) map.invalidateSize();
    }, 100);
  });
}

/* ---------- GO ---------- */
initStations();