# ISS Mission Operations Center

Aerospace-inspired web dashboard for tracking the International Space Station and predicting visible passes over the user's location.

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

This version removes the public-facing API key form so visitors do not have to configure anything.
Because this is a static GitHub Pages project, the key is visible in browser developer tools. That is normal for public front-end demos using NASA’s public data APIs, but it should not be treated like a password.

A TLE, or Two-Line Element set, describes the ISS orbit. SGP4 is the standard public orbit-propagation model used by satellite tracking tools. Instead of asking an API for dozens or hundreds of future positions, this project fetches one current TLE and calculates the orbit locally.

NASA is used for official media and the crew source page. NASA is not the source for every dataset because NASA does not provide every ISS tracking function through one public API. A professional architecture uses the best source for each job: NASA for media, CelesTrak for orbital elements, wheretheiss.at for current telemetry, and local SGP4 for predictions.

The ground-track focal point was changed from public map tiles to a self-contained SVG mission map. This avoids blank map tiles, repeated tile seams, and GitHub Pages/Live Server tile-loading issues while still plotting real live ISS latitude/longitude and SGP4-predicted future positions.
