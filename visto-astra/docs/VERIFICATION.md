# Browser verification — 2026-10-02

Chrome for Testing in the cloud workspace; local repository data only. Command: `CHROMIUM_EXECUTABLE_PATH=/path/to/chrome npm run verify -- http://127.0.0.1:8765/visto-astra/`.

Both 412×915 touch/mobile and 1440×1000 desktop passed nonblank WebGL, initial 16 Trips / 15 countries and regions / 33 cities, rotation, pinch/zoom, China/Shanghai picking, Trip selection, layout bounds, 17 observed replay positions ending at 16, lighting modes, and no JavaScript/console errors. The runner serves an empty favicon response to exclude that optional asset; other errors remain failures.

The run reproduced and fixed these defects:

- Closing the regular information panel left its detail map open and blocked mobile globe controls.
- A pending camera-focus timer could reopen the detail map after closing; close now cancels it. Stale animation frames and asynchronous map initialization are also ignored.
- The initial Leaflet map had no center/zoom before `flyTo`; map creation now sets both.

A separate isolated Chrome cancellation check immediately closed a new focus before the animation frame and async map initialization: the overlay stayed closed, stale map initialization count was zero, and JavaScript errors were empty.

See `verification-2026-10-02.json` for the captured report. Screenshots remain in ignored `artifacts/` and are not committed. Recorded cloud rendering was 6 FPS mobile / 4 FPS desktop; this is functional verification, not Galaxy GPU or heat acceptance. Production Worker writes, sync conflict/recovery, external map accuracy, and physical-device performance remain unverified.
