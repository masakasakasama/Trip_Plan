# Verification

Checked on 2026-09-09 against the public GitHub Pages URL.

- Desktop Chromium: 1440x1000.
- Android touch emulation: 412x915, DPR 2.
- Live source: 16 trips, 15 countries/regions, 33 cities; no unresolved city names.
- Actual pointer drag, two-finger pinch (including over city labels), country picking, city picking, Trip selection, home and zoom controls passed.
- Full replay passed on both sizes: all 16 trips and the final cumulative state were observed. No JavaScript errors.
- Mobile CSS viewport and WebGL drawing buffer are square. Expanded detail panel begins at y=539.6; the globe stage ends at y=495.6. No horizontal overflow.
- Canvas screenshots were checked for nonblank globe pixels on both sizes. Surface, city lights, atmosphere, routes and the final replay state were visually reviewed.
- 4096-pixel textures, 28 draw calls, approximately 79,488 triangles, 4 GPU textures. Measured JS heap at the end of the test: 23 MiB mobile emulation, 40 MiB desktop.
- Test browser uses Vulkan SwiftShader software rendering: measured frame rates were 22 and 9 FPS respectively. These are not physical Galaxy S26 Ultra or hardware-accelerated desktop benchmarks. Real-device 60 FPS has not been verified.

Fixes found during verification: five missing flight assignments, excessive individual city/route draws, replay slowing with capped frame deltas, camera reset during adaptive resolution changes, labels intercepting pinch gestures, mobile square-layout positioning, and country overlay opacity washing out night lights.

Protected trees match their pre-task commit `b53fcdc`:

- `visto`: `11b625dcfa215a00f88db4111725ce2035831510`
- `visto-sol`: `05094ea23f65e25b9409314ba62671a5fa326410`

All authored changes are confined to `visto-astra/`. Shared trip data is read only.
