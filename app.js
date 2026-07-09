/**
 * app.js — ISS Mission Operations Dashboard
 * ---------------------------------------------------------------------------
 * Live "right now" telemetry comes from wheretheiss.at (simple, one value).
 * Everything forward-looking — the 90-minute predicted ground track and the
 * multi-day pass search — comes from local SGP4 propagation in
 * orbital-engine.js. See that file for why: the obvious alternative (asking
 * wheretheiss.at for a batch of future positions) caps out at 10 timestamps
 * per request, which isn't enough for either feature.
 * ---------------------------------------------------------------------------
 */

const NASA_API_KEY = 'WuH5oGz6EjiJvWsc1rbnQtqnqodOmmAucfLR5YS7'; // Replace with your free NASA API key from https://api.nasa.gov before publishing. Keep DEMO_KEY only for quick local testing.
const ISS_ID = 25544;
const NASA_EXPEDITION_URL = 'https://www.nasa.gov/mission/expedition-74/';
const PASS_SEARCH_DAYS = 5;
const MIN_ELEVATION_DEG = 10;

const state = { samples: [], user: null, nextPass: null, passes: [], notified: false, apiHealth: {} };

// ---------------------------------------------------------------------------
// Mission map (self-contained SVG, no external map tiles)
// ---------------------------------------------------------------------------

// The previous Leaflet tile map looked good when every tile loaded, but public
// tile services can leave blank/repeated regions on GitHub Pages or Live Server.
// This version uses a self-contained equirectangular SVG map so the dashboard's
// focal point always renders while still plotting real ISS coordinates.
const MAP_W = 1000;
const MAP_H = 500;
const issSvgMarker = document.getElementById('issSvgMarker');
const trailTrackGroup = document.getElementById('trailTrackGroup');
const futureTrackGroup = document.getElementById('futureTrackGroup');
const userLocationGroup = document.getElementById('userLocationGroup');
const gridGroup = document.querySelector('.map-grid');

function buildMapGrid() {
  if (!gridGroup) return;
  let html = '';
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * MAP_W;
    html += `<line x1="${x}" y1="0" x2="${x}" y2="${MAP_H}" />`;
    if (lon !== 0 && lon !== -180 && lon !== 180) html += `<text x="${x + 4}" y="492">${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}</text>`;
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * MAP_H;
    html += `<line x1="0" y1="${y}" x2="${MAP_W}" y2="${y}" />`;
    html += `<text x="8" y="${y - 5}">${lat === 0 ? 'EQ' : Math.abs(lat) + '°' + (lat < 0 ? 'S' : 'N')}</text>`;
  }
  gridGroup.innerHTML = html;
}

function projectPoint(lat, lon) {
  return {
    x: ((lon + 180) / 360) * MAP_W,
    y: ((90 - lat) / 180) * MAP_H,
  };
}

function pathFromSegment(segment) {
  return segment.map((p) => {
    const xy = projectPoint(p.lat, p.lon);
    return `${xy.x.toFixed(1)},${xy.y.toFixed(1)}`;
  }).join(' ');
}

function renderSegments(group, segments, className) {
  group.innerHTML = segments.map((seg) => `<polyline class="${className}" points="${pathFromSegment(seg)}" />`).join('');
}

function updateIssMarker(lat, lon) {
  const xy = projectPoint(lat, lon);
  issSvgMarker.setAttribute('transform', `translate(${xy.x.toFixed(1)} ${xy.y.toFixed(1)})`);
}

function updateUserMarker(lat, lon) {
  const xy = projectPoint(lat, lon);
  userLocationGroup.style.display = 'block';
  userLocationGroup.setAttribute('transform', `translate(${xy.x.toFixed(1)} ${xy.y.toFixed(1)})`);
}

buildMapGrid();

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

const chart = new Chart(document.getElementById('telemetryChart'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Altitude (km)', data: [], borderWidth: 2, tension: 0.35, yAxisID: 'altitudeAxis' },
      { label: 'Velocity (km/h)', data: [], borderWidth: 2, tension: 0.35, yAxisID: 'velocityAxis' },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#c8e8f7' } } },
    scales: {
      x: { ticks: { color: '#8aa8ba' }, grid: { color: 'rgba(82,210,255,0.08)' } },
      altitudeAxis: { type: 'linear', position: 'left', ticks: { color: '#8aa8ba' }, grid: { color: 'rgba(82,210,255,0.08)' }, title: { display: true, text: 'Altitude km', color: '#8aa8ba' } },
      velocityAxis: { type: 'linear', position: 'right', ticks: { color: '#8aa8ba' }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Velocity km/h', color: '#8aa8ba' } },
    },
  },
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fmt(num, digits = 2) { return Number(num).toLocaleString(undefined, { maximumFractionDigits: digits }); }
function initials(name) { return name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0,2).join('').toUpperCase(); }
function preloadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('No image URL'));
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error('APOD image failed to load'));
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}
function setText(id, text) { document.getElementById(id).textContent = text; }
function utcClock() { setText('utcClock', 'UTC ' + new Date().toISOString().slice(11, 19)); }
setInterval(utcClock, 1000); utcClock();

/** Splits a run of {lat, lon} points into segments so the SVG map does not draw
 *  a line straight across the projection when the ground track crosses ±180°. */
function splitAtAntimeridian(points) {
  const segments = [[]];
  for (const p of points) {
    const seg = segments[segments.length - 1];
    if (seg.length > 0 && Math.abs(p.lon - seg[seg.length - 1].lon) > 180) segments.push([]);
    segments[segments.length - 1].push(p);
  }
  return segments.filter((s) => s.length > 1);
}

function formatClockDuration(ms) {
  if (ms <= 0) return 'Now';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

// ---------------------------------------------------------------------------
// Fetch wrapper with timeout + latency tracking, feeding the diagnostics panel
// ---------------------------------------------------------------------------

async function getJSON(url, timeoutMs = 8000, serviceName = null) {
  const controller = new AbortController();
  const started = performance.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    if (serviceName) markService(serviceName, true, Math.round(performance.now() - started));
    return json;
  } catch (error) {
    if (serviceName) markService(serviceName, false, Math.round(performance.now() - started));
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function markService(service, ok, latency) {
  state.apiHealth[service] = { ok, latency, updated: Date.now() };
  const latencyText = latency ? `Latency ${latency} ms` : 'Latency --';
  const registry = {
    iss: ['issApi', 'issLatency', 'sourceIss', 'ONLINE', 'ERROR'],
    tle: ['tleApi', 'tleLatency', 'sourceTle', 'ONLINE', 'ERROR'],
    nasa: ['nasaApi', 'nasaLatency', 'sourceNasa', 'ONLINE', 'LIMITED'],
    crew: ['crewApi', 'crewLatency', 'sourceCrew', 'ONLINE', 'FALLBACK'],
  };
  const cfg = registry[service];
  if (!cfg) return;
  const [valueId, latId, pillId, okText, badText] = cfg;
  setText(valueId, ok ? okText : badText);
  setText(latId, latencyText);
  const pill = document.getElementById(pillId);
  if (pill) {
    pill.className = ok ? 'pill' : (service === 'nasa' ? 'pill warn' : 'pill error');
    pill.textContent = ok ? 'ACTIVE' : (service === 'nasa' ? 'FALLBACK' : 'DEGRADED');
  }
}

// ---------------------------------------------------------------------------
// Live "right now" telemetry
// ---------------------------------------------------------------------------

async function updateTelemetry() {
  try {
    const data = await getJSON(`https://api.wheretheiss.at/v1/satellites/${ISS_ID}`, 8000, 'iss');
    const lat = data.latitude;
    const lon = data.longitude;
    updateIssMarker(lat, lon);
    setText('lat', fmt(lat, 4) + '°');
    setText('lon', fmt(lon, 4) + '°');
    setText('alt', fmt(data.altitude, 1));
    setText('vel', fmt(data.velocity, 0));
    setText('footprint', fmt(data.footprint, 0));
    setText('visState', data.visibility === 'daylight' ? 'Sunlit' : 'In Shadow');
    setText('refreshStatus', 'Updated ' + new Date().toLocaleTimeString());

    state.samples.push({ time: Date.now(), lat, lon, alt: data.altitude, vel: data.velocity });
    state.samples = state.samples.slice(-720); // up to roughly one hour at the 5-second refresh cadence
    renderSegments(trailTrackGroup, splitAtAntimeridian(state.samples), 'trail-polyline');
    updateChart();
  } catch (err) {
    setText('refreshStatus', 'Telemetry degraded');
  }
}

function updateChart() {
  const samples = state.samples.filter((p) => Date.now() - p.time <= 60 * 60 * 1000).filter((_, i, arr) => arr.length <= 60 || i % Math.ceil(arr.length / 60) === 0);
  chart.data.labels = samples.map((p) => new Date(p.time).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' }));
  chart.data.datasets[0].data = samples.map((p) => p.alt);
  chart.data.datasets[1].data = samples.map((p) => p.vel);
  chart.update();
}

// ---------------------------------------------------------------------------
// Orbit prediction (local SGP4, no API call)
// ---------------------------------------------------------------------------

function updateOrbitPrediction() {
  const track = ISSOrbital.getGroundTrack(new Date(), 90, 300); // 19 points, 5 min apart
  const segments = splitAtAntimeridian(track);
  renderSegments(futureTrackGroup, segments, 'future-polyline');
}

// ---------------------------------------------------------------------------
// Pass predictor (local SGP4 + sun/eclipse check, 5-day search)
// ---------------------------------------------------------------------------

function computePass() {
  if (!state.user || !ISSOrbital.getTleMeta()) return;

  const passes = ISSOrbital.findPasses(
    { lat: state.user.lat, lon: state.user.lon, altM: 0 },
    { startDate: new Date(), days: PASS_SEARCH_DAYS, minElevationDeg: MIN_ELEVATION_DEG, stepSeconds: 20, maxPasses: 8 }
  );
  state.passes = passes;
  setText('passWindowNote', `next ${PASS_SEARCH_DAYS} days`);

  if (!passes.length) {
    setText('nextPass', '--');
    state.nextPass = null;
    document.getElementById('passDetails').textContent =
      `No passes above ${MIN_ELEVATION_DEG}\u00b0 elevation found in the next ${PASS_SEARCH_DAYS} days for this location.`;
    document.getElementById('passList').innerHTML = '';
    return;
  }

  const visiblePass = passes.find((p) => p.visible);
  const chosen = visiblePass || passes[0];
  state.nextPass = chosen;

  setText('nextPass', chosen.aos.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const dir = `${ISSOrbital.compassDirection(chosen.aosAzimuthDeg)} \u2192 ${ISSOrbital.compassDirection(chosen.losAzimuthDeg)}`;
  if (visiblePass) {
    document.getElementById('passDetails').innerHTML =
      `The ISS will be visible over your location.<br>Max elevation: <strong>${chosen.maxElevationDeg.toFixed(0)}\u00b0</strong><br>` +
      `Direction: <strong>${dir}</strong><br>Duration: <strong>${ISSOrbital.formatDuration(chosen.durationSec)}</strong>`;
  } else {
    const why = chosen.reason === 'daylight' ? 'in daylight' : "in Earth's shadow";
    document.getElementById('passDetails').innerHTML =
      `No visible passes in the next ${PASS_SEARCH_DAYS} days. The next pass will be ${why} and won't be visible.<br>` +
      `Max elevation: <strong>${chosen.maxElevationDeg.toFixed(0)}\u00b0</strong><br>Direction: <strong>${dir}</strong>`;
  }

  renderPassList(passes);
}

function renderPassList(passes) {
  document.getElementById('passList').innerHTML = passes.map((p) => {
    const tagClass = p.visible ? 'tag-visible' : p.reason === 'daylight' ? 'tag-daylight' : 'tag-eclipsed';
    const tagText = p.visible ? 'Visible' : p.reason === 'daylight' ? 'Daylight' : 'Eclipsed';
    const dateLabel = p.aos.toISOString().slice(0, 10);
    return `<div class="pass-row">
      <div class="pass-row-when"><strong>${p.aos.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong><small>${dateLabel}</small></div>
      <div class="pass-row-stats">
        <span>${p.maxElevationDeg.toFixed(0)}&deg; max</span>
        <span>${ISSOrbital.formatDuration(p.durationSec)}</span>
        <span>${ISSOrbital.compassDirection(p.aosAzimuthDeg)}&rarr;${ISSOrbital.compassDirection(p.losAzimuthDeg)}</span>
      </div>
      <span class="pass-tag ${tagClass}">${tagText}</span>
    </div>`;
  }).join('');
}

function updateCountdown() {
  if (!state.nextPass) { setText('countdown', '--'); return; }
  const diff = state.nextPass.aos.getTime() - Date.now();
  setText('countdown', formatClockDuration(diff));
  if (diff < 10 * 60 * 1000 && diff > 0 && Notification.permission === 'granted' && !state.notified) {
    new Notification('ISS pass approaching', { body: 'The ISS is expected to pass near your location in about 10 minutes.' });
    state.notified = true;
  }
  if (diff <= 0) state.notified = false; // reset so the next pass can notify too
}

// ---------------------------------------------------------------------------
// NASA APOD
// ---------------------------------------------------------------------------

async function loadApod() {
  const apodCard = document.getElementById('apodCard');
  const apodLink = document.getElementById('apodLink');
  const dateLabel = document.getElementById('apodDateLabel');

  // Official APOD only: this panel does not substitute random NASA Image
  // Library results. If the API is unavailable, the UI shows a transparent
  // service state and links to the official APOD page instead of pretending
  // another image is today's APOD.
  try {
    if (dateLabel) dateLabel.textContent = 'Contacting official NASA APOD API';
    const apod = await getJSON(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(NASA_API_KEY)}&thumbs=true`, 12000, 'nasa');
    const title = apod.title || 'NASA Astronomy Picture of the Day';
    const date = apod.date ? `NASA APOD • ${apod.date}` : 'NASA APOD • today';
    const explanation = apod.explanation || 'Official NASA Astronomy Picture of the Day loaded successfully.';

    setText('apodTitle', title);
    setText('apodText', explanation.length > 260 ? explanation.slice(0, 260).trim() + '...' : explanation);
    if (dateLabel) dateLabel.textContent = date;

    const imageUrl = apod.media_type === 'image' ? (apod.hdurl || apod.url) : (apod.thumbnail_url || apod.url);
    try {
      const confirmedImage = await preloadImage(imageUrl);
      apodCard.style.backgroundImage = `linear-gradient(90deg, rgba(3,7,13,0.76), rgba(3,7,13,0.12)), url('${confirmedImage}')`;
    } catch (imageErr) {
      apodCard.style.backgroundImage = '';
      setText('apodText', (explanation.length > 240 ? explanation.slice(0, 240).trim() + '...' : explanation) + ' Image preview could not be embedded, but the official APOD link is available.');
    }

    if (apodLink) {
      apodLink.href = apod.url || 'https://apod.nasa.gov/apod/astropix.html';
      apodLink.textContent = apod.media_type === 'video' ? 'Open NASA APOD video' : 'Open official APOD media';
    }
  } catch (err) {
    markService('nasa', false, 0);
    apodCard.style.backgroundImage = '';
    if (dateLabel) dateLabel.textContent = 'NASA APOD service unavailable';
    setText('apodTitle', 'Official NASA APOD did not load');
    setText('apodText', 'This panel is wired only to NASA’s official Astronomy Picture of the Day API. If it fails, check that a personal NASA API key is set in app.js, then retry after refresh. Until then, use the official APOD link.');
    if (apodLink) {
      apodLink.href = 'https://apod.nasa.gov/apod/astropix.html';
      apodLink.textContent = 'Open official APOD website';
    }
  }
}

// ---------------------------------------------------------------------------
// Crew manifest
// ---------------------------------------------------------------------------

async function tryLoadCrewPortrait(name, elementId) {
  try {
    const query = encodeURIComponent(`astronaut portrait ${name}`);
    const data = await getJSON(`https://images-api.nasa.gov/search?q=${query}&media_type=image`, 9000, null);
    const item = (data.collection?.items || []).find((entry) => entry.links?.[0]?.href);
    const href = item?.links?.[0]?.href;
    if (!href) return;
    const confirmed = await preloadImage(href);
    const avatar = document.getElementById(elementId);
    if (avatar) {
      avatar.style.backgroundImage = `linear-gradient(180deg, rgba(3,7,13,0.05), rgba(3,7,13,0.18)), url('${confirmed}')`;
      avatar.textContent = '';
      avatar.classList.add('has-photo');
    }
  } catch (err) {
    // Portrait loading is a visual enhancement only. Initials remain as a reliable fallback.
  }
}

function loadCrew() {
  const list = document.getElementById('crewList');
  const sourceNote = document.getElementById('crewSourceNote');
  const started = performance.now();

  // NASA does not currently provide a simple official "current ISS crew" REST API.
  // For credibility, the dashboard uses NASA's active Expedition page as the
  // authoritative source and labels it clearly instead of pretending an unofficial
  // feed is NASA-owned. Portraits are attempted through NASA's public image
  // library; initials remain when a portrait is unavailable.
  const nasaExpeditionCrew = [
    { name: 'Sergey Kud-Sverchkov', agency: 'Roscosmos', role: 'Commander' },
    { name: 'Chris Williams', agency: 'NASA', role: 'Flight Engineer' },
    { name: 'Sergei Mikaev', agency: 'Roscosmos', role: 'Flight Engineer' },
    { name: 'Jessica Meir', agency: 'NASA', role: 'Flight Engineer' },
    { name: 'Jack Hathaway', agency: 'NASA', role: 'Flight Engineer' },
    { name: 'Sophie Adenot', agency: 'ESA', role: 'Flight Engineer' },
    { name: 'Andrey Fedyaev', agency: 'Roscosmos', role: 'Flight Engineer' },
  ];

  list.classList.add('crew-cards', 'crew-portrait-grid');
  list.innerHTML = nasaExpeditionCrew.map((person, index) => `
    <div class="crew-card crew-card-portrait">
      <div class="crew-avatar crew-photo" id="crewPhoto${index}" aria-hidden="true">${initials(person.name)}</div>
      <div class="crew-copy"><strong>${person.name}</strong><span>${person.agency}</span><em>${person.role}</em></div>
    </div>
  `).join('');

  nasaExpeditionCrew.forEach((person, index) => {
    if (person.agency === 'NASA' || person.agency === 'ESA') tryLoadCrewPortrait(person.name, `crewPhoto${index}`);
  });

  if (sourceNote) {
    sourceNote.innerHTML = `Source: <a href="${NASA_EXPEDITION_URL}" target="_blank" rel="noreferrer">NASA Expedition 74 mission page</a>. Portraits use NASA Image Library when available; initials are shown as the fallback.`;
  }
  markService('crew', true, Math.round(performance.now() - started));
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

document.getElementById('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    document.getElementById('passDetails').innerHTML = '<span class="error">Geolocation is not supported in this browser.</span>';
    return;
  }
  setText('gpsStatus', 'Requesting GPS');
  navigator.geolocation.getCurrentPosition((pos) => {
    state.user = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    setText('gpsStatus', 'GPS connected');
    updateUserMarker(state.user.lat, state.user.lon);
    if (ISSOrbital.getTleMeta()) {
      computePass();
    } else {
      document.getElementById('passDetails').textContent = 'Loading orbital elements — pass search will start automatically.';
    }
  }, () => {
    setText('gpsStatus', 'GPS denied');
    document.getElementById('passDetails').innerHTML = '<span class="error">Location permission was denied.</span>';
  });
});

document.getElementById('notifyBtn').addEventListener('click', async () => {
  if (!('Notification' in window)) return alert('Notifications are not available in this browser.');
  const permission = await Notification.requestPermission();
  alert(permission === 'granted' ? 'Pass alerts enabled.' : 'Notifications were not enabled.');
});


function updateOrbitProfile(tle) {
  if (!tle || !tle.line2) return;
  const parts = tle.line2.trim().split(/\s+/);
  const inclination = Number(parts[2]);
  const meanMotion = Number(parts[7]);
  const periodMinutes = Number.isFinite(meanMotion) && meanMotion > 0 ? 1440 / meanMotion : null;
  if (document.getElementById('orbitInclination') && Number.isFinite(inclination)) {
    setText('orbitInclination', `${inclination.toFixed(2)}° relative to Earth's equator`);
  }
  if (document.getElementById('orbitPeriod') && periodMinutes) {
    setText('orbitPeriod', `${periodMinutes.toFixed(2)} minutes per orbit`);
  }
  if (document.getElementById('orbitMeanMotion') && Number.isFinite(meanMotion)) {
    setText('orbitMeanMotion', `${meanMotion.toFixed(5)} revolutions per day`);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initOrbitalEngine() {
  const started = performance.now();
  try {
    const tle = await ISSOrbital.fetchTLE();
    markService('tle', true, Math.round(performance.now() - started));
    if (document.getElementById('tleName')) setText('tleName', tle.name || 'ISS (ZARYA)');
    if (document.getElementById('tleAge')) setText('tleAge', `Fetched ${new Date(tle.fetchedAt).toLocaleString()} from ${tle.source || 'CelesTrak'}`);
    updateOrbitProfile(tle);
    updateOrbitPrediction();
    if (state.user) computePass();
    setInterval(updateOrbitPrediction, 120000);
    setInterval(() => { if (state.user) computePass(); }, 5 * 60000);
  } catch (err) {
    markService('tle', false, Math.round(performance.now() - started));
    document.getElementById('passDetails').textContent =
      'Could not load orbital elements — pass prediction is unavailable right now. The live map still works.';
  }
}

updateTelemetry();
initOrbitalEngine();
loadApod();
loadCrew();
setInterval(updateTelemetry, 5000);
setInterval(updateCountdown, 1000);
