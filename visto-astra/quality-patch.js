(() => {
  "use strict";

  // Galaxy-class phones should use the same 4K earth textures as desktop.
  // Three.js TextureLoader assigns image.src directly, so rewrite only Astra's
  // earth texture URLs before app.js starts loading them.
  try {
    const proto = HTMLImageElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "src");
    if (descriptor?.get && descriptor?.set) {
      Object.defineProperty(proto, "src", {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          let next = value;
          if (typeof next === "string") {
            next = next.replace(
              /earth_(day|night|bump_roughness_clouds)_2048\.webp/g,
              "earth_$1_4096.jpg",
            );
          }
          return descriptor.set.call(this, next);
        },
      });
    }
  } catch (error) {
    console.warn("Astra 4K texture override unavailable", error);
  }

  // Once Astra has initialized, switch the built-in quality control to High.
  // This raises renderer DPR to 2 on high-DPR phones and also prevents the
  // automatic FPS fallback from silently reducing render resolution.
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const settings = document.querySelector("#settings");
    if (!settings || !window.astra) {
      if (attempts > 40) clearInterval(timer);
      return;
    }

    settings.click();
    const quality = document.querySelector("#quality");
    if (!quality) {
      document.querySelector("#close-panel")?.click();
      if (attempts > 40) clearInterval(timer);
      return;
    }

    quality.value = "high";
    quality.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#close-panel")?.click();
    clearInterval(timer);
  }, 250);
})();
