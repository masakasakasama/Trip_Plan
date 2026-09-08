# Visto Astra

An independent, read-only globe for Visto travel history. All implementation, assets, build configuration and tests live in this directory. Neither sibling implementation is modified.

## Build

```sh
npm ci
npm run build
npm test
```

Serve the repository root, then open `/visto-astra/`. `app.js` is the checked-in production bundle; GitHub Pages needs no build changes. `node_modules` and test screenshots must never be committed.

## Data

- Reads the existing Cloudflare `/state` endpoint on the production origin, with a six-second timeout and read-only `../trip-plan.json` fallback.
- Merges `../visto/history-seed.js` by trip ID, preserving cloud values and deduplicating cities.
- Uses `../visto/flight-seed.js` for confirmed flown routes. Dates bind flights to trips; a one-day tolerance handles documented return-date discrepancies. Ambiguous overlapping trips require an endpoint-country match.
- City visits count distinct Trips, not POIs or airport transits. Hong Kong follows the original source's separate region classification. Archived, future and cancelled trips are excluded.
- Solid routes are recorded flights. Dashed arcs connect the listed cities; they are not claims about actual transport, order within a day, or exact ground routes.
- No write requests, original localStorage writes, service-worker registration or shared data migrations.

## Rendering

Three.js WebGL2 with custom surface, cloud and atmosphere shaders. Day/night textures, elevation-derived normals, ocean highlights, cloud shadows, a separate cloud shell, day/night terminator, emissive night lights, atmosphere and a single star field. City points are a single GPU draw. Curved routes use low-resolution tubes, draw-on reveals and animated light pulses.

Mobile and desktop load 4096-pixel WebP textures. Devices reporting less than 4 GB memory start with 2048-pixel textures, with a mobile close-up upgrade. Pixel ratio starts at up to 2.25 on mobile and 2 on desktop; automatic quality reduces rendering resolution when measured frame rate drops, while preserving 4K imagery. High quality allows up to 2.75. Country, cloud and night textures remain independent of CSS sizing. The mobile canvas stays square and centered in the available space, including when a detail panel opens.

Route geometry is batched by Trip and route type; the full history uses 28 draw calls. Geometry is shared for the planet layers; removed travel overlays are disposed. Background tabs skip rendering. Reduced-motion preference disables idle motion. Auto rotation resumes after ten seconds without interaction. Replay time uses elapsed wall time independently of the bounded controls delta, so low rendering frame rates do not slow playback.

Replay accumulates countries and cities across chronological trips and eases the camera to each destination. Playback pauses on direct manipulation and when the tab becomes hidden. Year buttons, direct Trip selection, a continuous scrubber and 1x/2x/4x playback provide navigation.

## Assets and References

- Earth day, night and packed elevation/roughness/cloud imagery: [Solar System Scope](https://www.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), distributed in the [Three.js Earth example](https://threejs.org/examples/webgpu_tsl_earth.html). Mobile versions are resized and encoded to WebP.
- Geography: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) public domain, via [world-atlas](https://github.com/topojson/world-atlas).
- [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html): touch rotation, inertia, pinch zoom.
- [Three.js responsive rendering](https://threejs.org/manual/en/responsive.html): drawing-buffer resolution and device-pixel-ratio tradeoffs.
- [NASA Blue Marble](https://visibleearth.nasa.gov/collection/1484/blue-marble): visual reference for surface, cloud and atmospheric appearance.
- Icons: Lucide, ISC license. Three.js, d3-geo and topojson-client: MIT/ISC as recorded in their package licenses.

## Browser Verification

From the repository root, after installing this package's dependencies and Playwright Chromium:

```sh
node visto-astra/tools/verify.mjs http://127.0.0.1:8765/visto-astra/
node visto-astra/tools/verify.mjs https://masakasakasama.github.io/Trip_Plan/visto-astra/
```

The runner checks both desktop and 412x915 Android-emulated viewports, canvas pixels, real pointer rotation, multi-touch pinch, country and city picking, Trip selection, the full 16-trip replay, layout bounds and JavaScript errors. Screenshots and metrics go to the ignored `artifacts` directory. Emulation validates touch and layout; it does not establish physical Galaxy S26 Ultra GPU performance.
