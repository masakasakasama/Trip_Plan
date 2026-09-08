(() => {
  "use strict";

  // Keep Astra's original 2048 WebP textures on phones.
  // They are already more than sufficient for the on-screen globe size and
  // avoid the stronger JPEG compression visible in the 4096 JPG assets.
  // Only raise renderer resolution through Astra's built-in High mode.
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
