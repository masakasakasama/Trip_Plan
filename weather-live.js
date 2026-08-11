(() => {
  const CACHE_KEY = "trip-plan-live-weather-v1";
  const REFRESH_MS = 3 * 60 * 60 * 1000;
  const CHECK_MS = 60 * 1000;
  const SYDNEY_TIMEZONE = "Australia/Sydney";

  let liveWeather = loadCache();
  let fetching = false;
  let lastAttempt = 0;

  function loadCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function saveCache(value) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    } catch (_) {
      // キャッシュ不可でも、その場の取得結果は表示できる。
    }
  }

  function dateInSydney() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SYDNEY_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  function cityName() {
    if (!state?.trips?.length) return "";
    return currentTrip().destination.split("/")[0].trim() || "Sydney";
  }

  function weatherLabel(code) {
    if (code === 0) return { icon: "☀️", label: "快晴" };
    if (code <= 2) return { icon: "🌤️", label: "晴れ時々くもり" };
    if (code === 3) return { icon: "☁️", label: "くもり" };
    if (code === 45 || code === 48) return { icon: "🌫️", label: "霧" };
    if (code >= 51 && code <= 57) return { icon: "🌦️", label: "霧雨" };
    if (code >= 61 && code <= 67) return { icon: "🌧️", label: "雨" };
    if (code >= 71 && code <= 77) return { icon: "🌨️", label: "雪" };
    if (code >= 80 && code <= 82) return { icon: "🌦️", label: "にわか雨" };
    if (code >= 85 && code <= 86) return { icon: "🌨️", label: "にわか雪" };
    if (code >= 95) return { icon: "⛈️", label: "雷雨" };
    return { icon: "🌡️", label: "天気情報" };
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Weather ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchWeather(city, date) {
    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ja&format=json`;
    const geocode = await fetchJson(geocodeUrl);
    const place = geocode.results?.[0];
    if (!place) throw new Error("Weather location not found");

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", place.latitude);
    forecastUrl.searchParams.set("longitude", place.longitude);
    forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
    forecastUrl.searchParams.set("timezone", SYDNEY_TIMEZONE);
    forecastUrl.searchParams.set("forecast_days", "7");
    const forecast = await fetchJson(forecastUrl.toString());
    const index = forecast.daily?.time?.indexOf(date) ?? -1;
    if (index < 0) throw new Error("Weather date not found");

    return {
      city,
      date,
      code: Number(forecast.daily.weather_code[index]),
      high: Math.round(Number(forecast.daily.temperature_2m_max[index])),
      low: Math.round(Number(forecast.daily.temperature_2m_min[index])),
      fetchedAt: Date.now()
    };
  }

  const fallbackRenderHeader = renderHeader;
  renderHeader = function renderHeaderWithLiveWeather() {
    fallbackRenderHeader();
    const city = cityName();
    const today = dateInSydney();
    if (!liveWeather || liveWeather.city !== city || liveWeather.date !== today) return;
    const weather = weatherLabel(liveWeather.code);
    if (els.weatherIcon) els.weatherIcon.textContent = weather.icon;
    if (els.place) els.place.textContent = `${city}・${weather.label} ${liveWeather.high}° / ${liveWeather.low}°`;
    if (els.statusCard) els.statusCard.title = `Open-Meteo・${today}の予報`;
  };

  async function refreshWeather({ force = false } = {}) {
    const city = cityName();
    if (!city || fetching) return;
    const today = dateInSydney();
    const cacheCurrent = liveWeather?.city === city && liveWeather?.date === today;
    const cacheFresh = cacheCurrent && Date.now() - Number(liveWeather.fetchedAt || 0) < REFRESH_MS;
    if (!force && cacheFresh) {
      renderHeader();
      return;
    }
    if (!force && Date.now() - lastAttempt < CHECK_MS) return;

    fetching = true;
    lastAttempt = Date.now();
    try {
      liveWeather = await fetchWeather(city, today);
      saveCache(liveWeather);
      renderHeader();
    } catch (_) {
      renderHeader();
    } finally {
      fetching = false;
    }
  }

  function initializeWhenReady(attempt = 0) {
    if (!state?.trips?.length) {
      if (attempt < 100) setTimeout(() => initializeWhenReady(attempt + 1), 100);
      return;
    }
    refreshWeather();
  }

  setInterval(() => refreshWeather(), CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshWeather({ force: true });
  });
  window.addEventListener("focus", () => refreshWeather());
  window.addEventListener("online", () => refreshWeather({ force: true }));
  initializeWhenReady();
})();
