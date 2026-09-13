(() => {
  "use strict";

  const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  let leafletPromise;
  let map;
  let marker;
  let satelliteLayer;
  let streetLayer;
  let currentLayer = "satellite";
  let shell;
  let titleEl;
  let mapEl;

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-astra-leaflet]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = LEAFLET_CSS;
        link.dataset.astraLeaflet = "1";
        document.head.append(link);
      }

      const existing = document.querySelector('script[data-astra-leaflet]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.L), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = LEAFLET_JS;
      script.defer = true;
      script.dataset.astraLeaflet = "1";
      script.onload = () => resolve(window.L);
      script.onerror = reject;
      document.head.append(script);
    });

    return leafletPromise;
  }

  function addStyles() {
    if (document.querySelector("#astra-detail-map-style")) return;
    const style = document.createElement("style");
    style.id = "astra-detail-map-style";
    style.textContent = `
      #detail-map-shell {
        position: fixed;
        z-index: 12;
        right: 18px;
        bottom: 18px;
        width: min(560px, calc(100vw - 36px));
        height: min(56dvh, 520px);
        border: 1px solid rgba(182,239,215,.18);
        border-radius: 18px;
        overflow: hidden;
        background: rgba(6,11,16,.96);
        box-shadow: 0 24px 70px rgba(0,0,0,.55);
        backdrop-filter: blur(20px);
        transform: translateY(calc(100% + 32px));
        opacity: 0;
        pointer-events: none;
        transition: transform .45s cubic-bezier(.22,.8,.2,1), opacity .3s ease;
      }
      #detail-map-shell.open {
        transform: translateY(0);
        opacity: 1;
        pointer-events: auto;
      }
      #detail-map-shell[hidden] { display: block !important; visibility: hidden; }
      #detail-map-shell.open[hidden] { visibility: visible; }
      .detail-map-head {
        position: absolute;
        z-index: 1001;
        left: 12px;
        right: 12px;
        top: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        pointer-events: none;
      }
      .detail-map-title {
        min-width: 0;
        max-width: 68%;
        padding: 9px 12px;
        border-radius: 999px;
        background: rgba(6,11,16,.82);
        border: 1px solid rgba(255,255,255,.12);
        color: #eef4f4;
        font: 600 12px/1.2 "DM Sans","Noto Sans JP",sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        backdrop-filter: blur(12px);
        pointer-events: auto;
      }
      .detail-map-actions {
        display: flex;
        align-items: center;
        gap: 7px;
        pointer-events: auto;
      }
      .detail-map-actions button {
        min-width: 42px;
        height: 36px;
        padding: 0 11px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 999px;
        background: rgba(6,11,16,.82);
        color: #dbe7e8;
        font-size: 11px;
        backdrop-filter: blur(12px);
      }
      .detail-map-actions button.active {
        color: #10251d;
        background: #b6efd7;
        border-color: #b6efd7;
      }
      .detail-map-actions .close-detail-map {
        min-width: 36px;
        width: 36px;
        padding: 0;
        font-size: 20px;
        line-height: 1;
      }
      #detail-map {
        position: absolute;
        inset: 0;
        background: #071015;
      }
      #detail-map .leaflet-control-attribution {
        background: rgba(6,11,16,.72);
        color: #91a4a8;
        font-size: 8px;
      }
      #detail-map .leaflet-control-attribution a { color: #b6efd7; }
      #detail-map .leaflet-control-zoom a {
        background: rgba(6,11,16,.88);
        color: #eef4f4;
        border-color: rgba(255,255,255,.12);
      }
      .astra-focus-marker {
        width: 16px !important;
        height: 16px !important;
        margin-left: -8px !important;
        margin-top: -8px !important;
        border-radius: 50%;
        border: 2px solid #fff;
        background: #b6efd7;
        box-shadow: 0 0 0 6px rgba(182,239,215,.18), 0 0 24px rgba(182,239,215,.7);
      }
      body.detail-map-open #replay {
        opacity: .18;
        pointer-events: none;
        transition: opacity .25s;
      }
      @media (max-width: 700px) {
        #detail-map-shell {
          left: 12px;
          right: 12px;
          bottom: max(12px, env(safe-area-inset-bottom));
          width: auto;
          height: 43dvh;
          min-height: 320px;
          max-height: 430px;
          border-radius: 18px;
        }
        .detail-map-head { top: 10px; left: 10px; right: 10px; }
        .detail-map-title { max-width: 55%; font-size: 11px; }
        .detail-map-actions button { height: 34px; min-width: 40px; padding: 0 9px; }
        body.detail-map-open .view-tools,
        body.detail-map-open .scene-caption {
          opacity: .18;
          pointer-events: none;
        }
      }
    `;
    document.head.append(style);
  }

  function ensureShell() {
    if (shell) return shell;
    addStyles();
    shell = document.createElement("section");
    shell.id = "detail-map-shell";
    shell.hidden = true;
    shell.setAttribute("aria-label", "フォーカス地点の詳細地図");
    shell.innerHTML = `
      <div class="detail-map-head">
        <div class="detail-map-title">詳細地図</div>
        <div class="detail-map-actions">
          <button type="button" data-map-mode="satellite" class="active">衛星</button>
          <button type="button" data-map-mode="street">地図</button>
          <button type="button" class="close-detail-map" aria-label="詳細地図を閉じる">×</button>
        </div>
      </div>
      <div id="detail-map"></div>
    `;
    document.body.append(shell);
    titleEl = shell.querySelector(".detail-map-title");
    mapEl = shell.querySelector("#detail-map");

    shell.querySelector(".close-detail-map").addEventListener("click", close);
    shell.querySelectorAll("[data-map-mode]").forEach((button) => {
      button.addEventListener("click", () => setBaseLayer(button.dataset.mapMode));
    });

    return shell;
  }

  function close() {
    if (!shell) return;
    shell.classList.remove("open");
    document.body.classList.remove("detail-map-open");
    setTimeout(() => {
      if (!shell.classList.contains("open")) shell.hidden = true;
    }, 460);
  }

  function setBaseLayer(mode) {
    if (!map || !satelliteLayer || !streetLayer) return;
    if (currentLayer === mode) return;
    map.removeLayer(currentLayer === "satellite" ? satelliteLayer : streetLayer);
    currentLayer = mode;
    (currentLayer === "satellite" ? satelliteLayer : streetLayer).addTo(map);
    shell?.querySelectorAll("[data-map-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mapMode === currentLayer);
    });
  }

  function focusName() {
    const panelTitle = document.querySelector("#panel:not([hidden]) #panel-title")?.textContent?.trim();
    if (panelTitle) return panelTitle;
    const caption = document.querySelector("#scene-caption")?.textContent?.trim();
    return caption && caption !== "すべての旅" ? caption : "詳細地図";
  }

  async function show(detail) {
    if (!detail || !Number.isFinite(detail.lat) || !Number.isFinite(detail.lng)) return;
    ensureShell();
    shell.hidden = false;
    titleEl.textContent = focusName();
    requestAnimationFrame(() => {
      shell.classList.add("open");
      document.body.classList.add("detail-map-open");
    });

    try {
      const L = await loadLeaflet();
      if (!map) {
        map = L.map(mapEl, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
          worldCopyJump: true,
        });

        satelliteLayer = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 19,
            attribution:
              "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          },
        );

        streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        });

        satelliteLayer.addTo(map);
        L.control.zoom({ position: "bottomright" }).addTo(map);

        marker = L.marker([detail.lat, detail.lng], {
          icon: L.divIcon({ className: "astra-focus-marker", html: "" }),
          interactive: false,
        }).addTo(map);
      }

      marker.setLatLng([detail.lat, detail.lng]);
      const targetZoom =
        detail.distance <= 2.05 ? 12 : detail.distance <= 2.35 ? 9 : 7;

      setTimeout(() => {
        map.invalidateSize();
        map.flyTo([detail.lat, detail.lng], targetZoom, {
          animate: true,
          duration: 2.6,
          easeLinearity: 0.18,
        });
      }, 80);
    } catch (error) {
      console.warn("Astra detail map unavailable", error);
      titleEl.textContent = "詳細地図を読み込めませんでした";
    }
  }

  window.addEventListener("astra:focus", (event) => show(event.detail));
  document.addEventListener("click", (event) => {
    if (event.target.closest("#home")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && shell?.classList.contains("open")) close();
  });
})();