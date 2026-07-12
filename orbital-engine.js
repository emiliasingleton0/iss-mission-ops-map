/**
 
 * Data sources:
 *  - TLE:   https://tle.ivanstanojevic.me/api/tle/25544   (NORAD ID 25544 = ISS)
 *  - Crew:  see js/crew.js
 */

const ISSOrbital = (() => {
  const NORAD_ID = 25544;
  const TLE_URL = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${NORAD_ID}&FORMAT=TLE`; // Authoritative public TLE source
  const TLE_CACHE_KEY = 'iss-tracker:tle-cache';
  const TLE_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 6; // refetch every 6 hours
  const EARTH_RADIUS_KM = 6371;
  const DEG = 180 / Math.PI;
  const RAD = Math.PI / 180;

  let satrec = null;
  let tleMeta = null; // { line1, line2, name, fetchedAt }

  // TLE acquisition
  
  function readTleCache() {
    try {
      const raw = localStorage.getItem(TLE_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.fetchedAt > TLE_CACHE_MAX_AGE_MS) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function writeTleCache(meta) {
    try {
      localStorage.setItem(TLE_CACHE_KEY, JSON.stringify(meta));
    } catch (err) {
      // Storage can fail in private-browsing modes; not fatal.
    }
  }

  /**
   * Fetches a fresh TLE, falling back to a cached copy (any age) if the
   * network request fails. Throws only if there is truly no data available.
   */
  async function fetchTLE(force = false) {
    if (!force) {
      const cached = readTleCache();
      if (cached) {
        tleMeta = cached;
        satrec = satellite.twoline2satrec(cached.line1, cached.line2);
        return tleMeta;
      }
    }

    const res = await fetch(TLE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`TLE fetch failed: ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const line1 = lines.find((line) => line.startsWith('1 25544'));
    const line2 = lines.find((line) => line.startsWith('2 25544'));
    const name = lines[0] && !lines[0].startsWith('1 ') ? lines[0] : 'ISS (ZARYA)';
    if (!line1 || !line2) throw new Error('TLE response did not include ISS lines');
    tleMeta = { name, line1, line2, fetchedAt: Date.now(), source: 'CelesTrak' };
    satrec = satellite.twoline2satrec(line1, line2);
    writeTleCache(tleMeta);
    return tleMeta;
  }

  function getTleMeta() {
    return tleMeta;
  }
  
  // Propagation

  /**
   * Returns { lat, lon, altKm, speedKmS, speedKmH, eci, date } for a given
   * moment. lat/lon are in degrees; lon is normalized to [-180, 180].
   */
  function getState(date) {
    if (!satrec) throw new Error('ISSOrbital not initialized — call fetchTLE() first.');
    const pv = satellite.propagate(satrec, date);
    if (!pv || !pv.position) return null;

    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    const lat = satellite.degreesLat(geo.latitude);
    let lon = satellite.degreesLong(geo.longitude);
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;

    const v = pv.velocity;
    const speedKmS = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

    return {
      lat,
      lon,
      altKm: geo.height,
      speedKmS,
      speedKmH: speedKmS * 3600,
      eci: pv.position,
      date,
    };
  }

  function getGroundTrack(date, minutes, stepSeconds = 30) {
    const points = [];
    const totalSteps = Math.ceil((minutes * 60) / stepSeconds);
    for (let i = 0; i <= totalSteps; i++) {
      const t = new Date(date.getTime() + i * stepSeconds * 1000);
      const s = getState(t);
      if (s) points.push({ lat: s.lat, lon: s.lon, altKm: s.altKm, speedKmH: s.speedKmH, date: t });
    }
    return points;
  }

// sun geo
  
  function sunUnitVector(date) {
    const JD = date.getTime() / 86400000 + 2440587.5;
    const n = JD - 2451545.0; // days since J2000.0
    const L = (280.46 + 0.9856474 * n) % 360; // mean longitude
    const g = ((357.528 + 0.9856003 * n) % 360) * RAD; // mean anomaly
    const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const epsilon = (23.439 - 0.0000004 * n) * RAD; // obliquity of ecliptic

    return {
      x: Math.cos(lambda),
      y: Math.cos(epsilon) * Math.sin(lambda),
      z: Math.sin(epsilon) * Math.sin(lambda),
    };
  }

  function isIlluminated(eciPositionKm, date) {
    const sunHat = sunUnitVector(date);
    const dot =
      eciPositionKm.x * sunHat.x + eciPositionKm.y * sunHat.y + eciPositionKm.z * sunHat.z;
    if (dot > 0) return true; // on the sun side of Earth's center — always lit

    const perp = {
      x: eciPositionKm.x - dot * sunHat.x,
      y: eciPositionKm.y - dot * sunHat.y,
      z: eciPositionKm.z - dot * sunHat.z,
    };
    const perpDist = Math.sqrt(perp.x * perp.x + perp.y * perp.y + perp.z * perp.z);
    return perpDist > EARTH_RADIUS_KM;
  }

  /** Sun altitude in degrees at an observer's location — used to decide if
   *  the ground is dark enough for the ISS to be visible against the sky. */
  function sunAltitudeDeg(date, lat, lon) {
    const pos = SunCalc.getPosition(date, lat, lon);
    return pos.altitude * DEG;
  }

  
  // Look angles (azimuth / elevation from an observer to the satellite)
  
  function getLookAngles(date, observer) {
    const pv = satellite.propagate(satrec, date);
    if (!pv || !pv.position) return null;
    const gmst = satellite.gstime(date);
    const positionEcf = satellite.eciToEcf(pv.position, gmst);
    const observerGd = {
      longitude: observer.lon * RAD,
      latitude: observer.lat * RAD,
      height: (observer.altM || 0) / 1000,
    };
    const look = satellite.ecfToLookAngles(observerGd, positionEcf);
    return {
      azimuthDeg: look.azimuth * DEG,
      elevationDeg: look.elevation * DEG,
      rangeKm: look.rangeSat,
      eci: pv.position,
    };
  }

  function compassDirection(azimuthDeg) {
    const dirs = [
      'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
    ];
    const idx = Math.round(((azimuthDeg % 360) / 22.5)) % 16;
    return dirs[idx];
  }

  function findPasses(observer, { startDate = new Date(), days = 5, minElevationDeg = 10, stepSeconds = 20, maxPasses = 8 } = {}) {
    const passes = [];
    const totalSteps = Math.floor((days * 86400) / stepSeconds);

    let prevElevation = null;
    let prevTime = null;
    let current = null; // in-progress pass being tracked

    for (let i = 0; i <= totalSteps && passes.length < maxPasses; i++) {
      const t = new Date(startDate.getTime() + i * stepSeconds * 1000);
      const look = getLookAngles(t, observer);
      if (!look) continue;
      const el = look.elevationDeg;

      if (prevElevation !== null && prevElevation < minElevationDeg && el >= minElevationDeg) {
        // Rising edge — refine AOS time by bisection between prevTime and t.
        const aosTime = refineCrossing(observer, prevTime, t, minElevationDeg, true);
        current = {
          aos: aosTime,
          aosAzimuthDeg: getLookAngles(aosTime, observer).azimuthDeg,
          maxElevationDeg: el,
          tca: t,
          tcaAzimuthDeg: look.azimuthDeg,
        };
      }

      if (current && el > current.maxElevationDeg) {
        current.maxElevationDeg = el;
        current.tca = t;
        current.tcaAzimuthDeg = look.azimuthDeg;
      }

      if (current && prevElevation !== null && prevElevation >= minElevationDeg && el < minElevationDeg) {
        // Falling edge — refine LOS time.
        const losTime = refineCrossing(observer, prevTime, t, minElevationDeg, false);
        current.los = losTime;
        current.losAzimuthDeg = getLookAngles(losTime, observer).azimuthDeg;
        current.durationSec = Math.round((current.los.getTime() - current.aos.getTime()) / 1000);

        // Visibility: needs the satellite lit by the sun AND the observer's
        // sky dark enough (civil twilight or darker) at closest approach.
        const tcaLook = getLookAngles(current.tca, observer);
        const lit = isIlluminated(tcaLook.eci, current.tca);
        const skyDark = sunAltitudeDeg(current.tca, observer.lat, observer.lon) < -6;

        if (lit && skyDark) {
          current.visible = true;
          current.reason = 'visible';
        } else if (!skyDark) {
          current.visible = false;
          current.reason = 'daylight';
        } else {
          current.visible = false;
          current.reason = 'eclipsed';
        }

        passes.push(current);
        current = null;
      }

      prevElevation = el;
      prevTime = t;
    }

    return passes;
  }

  /** Bisects between two timestamps to find when elevation crosses
   *  `thresholdDeg`, to within ~1 second. `rising` indicates the direction
   *  of the crossing so we know which half to keep at each step. */
  function refineCrossing(observer, t0, t1, thresholdDeg, rising) {
    let lo = t0.getTime();
    let hi = t1.getTime();
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const el = getLookAngles(new Date(mid), observer).elevationDeg;
      const midIsAbove = el >= thresholdDeg;
      if (midIsAbove === rising) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return new Date(Math.round((lo + hi) / 2));
  }

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  return {
    NORAD_ID,
    EARTH_RADIUS_KM,
    fetchTLE,
    getTleMeta,
    getState,
    getGroundTrack,
    getLookAngles,
    compassDirection,
    isIlluminated,
    sunAltitudeDeg,
    findPasses,
    formatDuration,
  };
})();
