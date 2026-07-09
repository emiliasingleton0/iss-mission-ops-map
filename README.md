# ISS Mission Operations Center

A dashboard for tracking the International Space Station and predicting visible passes over the user's location. 
This is designed as a **mission operations console**, it shows front-end development, API integration, geolocation, 
orbital prediction, data visualization, error handling, and clear source transparency.

## Core features

- Live ISS latitude, longitude, altitude, velocity, illumination state, and ground footprint
- Interactive dark operations-style world map with ISS marker, observed trail, and predicted ground track
- 90-minute orbit prediction using local SGP4 propagation
- Five-day ISS pass search using the browser's Geolocation API
- Azimuth/elevation pass analysis with visibility tags: Visible, Daylight, or Eclipsed
- Countdown timer and optional browser notifications before a pass
- NASA Astronomy Picture of the Day integration with NASA Image Library fallback
- NASA API key input saved locally in the browser for better reliability than `DEMO_KEY`
- NASA Expedition-sourced crew manifest with transparent source labeling
- System diagnostics with API status and latency
- Data provenance panel explaining exactly where each dataset comes from
- Chart.js telemetry analytics
- Separate `index.html`, `styles.css`, `app.js`, and `orbital-engine.js` for maintainability

## Data sources

| Live ISS telemetry | `wheretheiss.at` | Used for current position, altitude, velocity, visibility, and footprint. |
| Orbital elements | CelesTrak current GP/TLE data | ISS NORAD catalog ID 25544. Cached locally and refreshed periodically. |
| Orbit prediction | SGP4 via `satellite.js` | TLE is propagated locally in the browser instead of requesting hundreds of future timestamps. |
| Pass visibility | Local calculations | Uses SGP4 position, observer location, azimuth/elevation math, and sunlight/eclipse checks. |
| NASA media | NASA APOD API | Official NASA media. Uses `DEMO_KEY` by default, but a personal key is recommended. |
| NASA fallback media | NASA Image and Video Library API | Used if APOD fails or hits rate limits. |
| Crew roster | NASA Expedition 74 mission page | NASA does not currently offer a simple official current-ISS-crew REST API, so the app labels this as NASA Expedition-page sourced. |
| Map | Leaflet + OpenStreetMap | Standard OSM tiles with a custom dark mission-console treatment for reliability. |
| Browser features | Geolocation + Notifications | Used for pass prediction and alerts. |

## NASA API key

The app ships with NASA's public `DEMO_KEY`, which has low rate limits. For a stronger portfolio demo:

1. Get a free key at NASA Open APIs.
2. Open the dashboard.
3. Paste the key into the **NASA API Key** panel.
4. Click **Save Key**.

The key is saved only in that browser's `localStorage`. For a public GitHub Pages demo, do not commit private secrets into code.

## Why TLE + SGP4 matters

A TLE, or Two-Line Element set, describes the ISS orbit. SGP4 is the standard public orbit-propagation model used by satellite tracking tools. Instead of asking an API for dozens or hundreds of future positions, this project fetches one current TLE and calculates the orbit locally. That is more scalable and more technically impressive.

## Important honesty note

NASA is used for official media and the crew source page. NASA is **not** the source for every dataset because NASA does not provide every ISS tracking function through one public API. A professional architecture uses the best source for each job: NASA for media, CelesTrak for orbital elements, wheretheiss.at for current telemetry, and local SGP4 for predictions.

## v8 map reliability update

The ground-track focal point was changed from public map tiles to a self-contained SVG mission map. This avoids blank map tiles, repeated tile seams, and GitHub Pages/Live Server tile-loading issues while still plotting real live ISS latitude/longitude and SGP4-predicted future positions.
