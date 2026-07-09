# ISS Mission Operations Center — Portfolio Version

A professional, aerospace-inspired web dashboard for tracking the International Space Station and predicting visible passes over the user's location.

## What makes this portfolio-ready

This is designed as a **mission operations console**, not a simple class demo. It shows front-end development, API integration, geolocation, orbital prediction, data visualization, error handling, and clear source transparency.

## Core features

- Live ISS latitude, longitude, altitude, velocity, illumination state, and ground footprint
- Interactive dark operations-style world map with ISS marker, observed trail, and predicted ground track
- 90-minute orbit prediction using local SGP4 propagation
- Five-day ISS pass search using the browser's Geolocation API
- Azimuth/elevation pass analysis with visibility tags: Visible, Daylight, or Eclipsed
- Countdown timer and optional browser notifications before a pass
- NASA Astronomy Picture of the Day integration through NASA’s official APOD API
- Personal NASA API key configured in `app.js` so visitors do not need to enter a key
- NASA Expedition-sourced crew manifest with transparent source labeling
- System diagnostics with API status and latency
- Data provenance panel explaining exactly where each dataset comes from
- Chart.js telemetry analytics
- Separate `index.html`, `styles.css`, `app.js`, and `orbital-engine.js` for maintainability

## Data sources

| Feature | Source | Notes |
|---|---|---|
| Live ISS telemetry | `wheretheiss.at` | Used for current position, altitude, velocity, visibility, and footprint. |
| Orbital elements | CelesTrak current GP/TLE data | ISS NORAD catalog ID 25544. Cached locally and refreshed periodically. |
| Orbit prediction | SGP4 via `satellite.js` | TLE is propagated locally in the browser instead of requesting hundreds of future timestamps. |
| Pass visibility | Local calculations | Uses SGP4 position, observer location, azimuth/elevation math, and sunlight/eclipse checks. |
| NASA media | NASA APOD API | Official Astronomy Picture of the Day. Configure your personal key in `app.js` before publishing. |
| Crew roster | NASA Expedition 74 mission page | NASA does not currently offer a simple official current-ISS-crew REST API, so the app labels this as NASA Expedition-page sourced. |
| Map | Self-contained SVG mission map | No external map tiles; plots live ISS position plus SGP4 prediction reliably on GitHub Pages. |
| Browser features | Geolocation + Notifications | Used for pass prediction and alerts. |

## NASA API key

This version removes the public-facing API key form so visitors do not have to configure anything. Before publishing to GitHub Pages:

1. Get a free NASA API key at api.nasa.gov.
2. Open `app.js`.
3. Replace `PASTE_YOUR_NASA_API_KEY_HERE` with your personal NASA key.
4. Save, commit, push, and reload the deployed site.

Because this is a static GitHub Pages project, the key is visible in browser developer tools. That is normal for public front-end demos using NASA’s public data APIs, but it should not be treated like a password.

## Why TLE + SGP4 matters

A TLE, or Two-Line Element set, describes the ISS orbit. SGP4 is the standard public orbit-propagation model used by satellite tracking tools. Instead of asking an API for dozens or hundreds of future positions, this project fetches one current TLE and calculates the orbit locally. That is more scalable and more technically impressive.

## Important honesty note

NASA is used for official media and the crew source page. NASA is **not** the source for every dataset because NASA does not provide every ISS tracking function through one public API. A professional architecture uses the best source for each job: NASA for media, CelesTrak for orbital elements, wheretheiss.at for current telemetry, and local SGP4 for predictions.

## v8 map reliability update

The ground-track focal point was changed from public map tiles to a self-contained SVG mission map. This avoids blank map tiles, repeated tile seams, and GitHub Pages/Live Server tile-loading issues while still plotting real live ISS latitude/longitude and SGP4-predicted future positions.


## NASA API Key for Publishing

This version removes the public-facing API key form. Before publishing to GitHub Pages, open `app.js` and replace `PASTE_YOUR_NASA_API_KEY_HERE` with your free NASA API key from api.nasa.gov. Visitors will not need to enter a key; APOD will load automatically from NASA's official APOD API.

## v15 visual polish update

This version tones down the previous bright blue sci-fi palette and moves toward a more professional aerospace/enterprise interface: graphite panels, subtle dividers, muted teal status accents, less glow, and a more balanced two-column feature layout. The functionality is unchanged: APOD still uses NASA's official APOD API, telemetry remains live, and prediction remains CelesTrak TLE + SGP4.
