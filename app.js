// index.htmlのキャッシュバスティング版(?v=...)と揃えて、更新のたび一緒に上げる。
// 設定ダイアログ下部に小さく表示し、公開リンクに反映されているか確認できるようにする。
const BUILD_VERSION = "20260705-worker2";

const DATA_URL = "trip-plan.json";
const CANONICAL_URL = "https://masakasakasama.github.io/Trip_Plan/";
const WORKER_URL_KEY = "trip-plan-worker-url-v1";
const MAPS_KEY = "trip-plan-google-maps-key-v1";
const CACHE_KEY = "trip-plan-cache-v3";
const POLL_MS = 5000;
const AUTO_SAVE_MS = 1400;

const els = {
  title: document.querySelector("#trip-title"),
  dates: document.querySelector("#trip-dates"),
  place: document.querySelector("#trip-place"),
  weatherIcon: document.querySelector("#weather-icon"),
  tripStatus: document.querySelector("#trip-status"),
  status: document.querySelector("#sync-status"),
  countdown: document.querySelector("#countdown-days"),
  dayTabs: document.querySelector("#day-tabs"),
  timeline: document.querySelector("#timeline"),
  packingScore: document.querySelector("#packing-score"),
  budgetScore: document.querySelector("#budget-score"),
  todoSummary: document.querySelector("#todo-summary"),
  todoList: document.querySelector("#todo-list"),
  spotList: document.querySelector("#spot-list"),
  budgetSummary: document.querySelector("#budget-summary"),
  budgetList: document.querySelector("#budget-list"),
  tripDialog: document.querySelector("#trip-dialog"),
  tripList: document.querySelector("#trip-list"),
  settingsDialog: document.querySelector("#settings-dialog"),
  mapsKey: document.querySelector("#maps-api-key"),
  shareLink: document.querySelector("#share-link"),
  buildVersion: document.querySelector("#build-version"),
  archiveToggle: document.querySelector("#archive-toggle"),
  routeMap: document.querySelector("#route-map"),
  mapDayTitle: document.querySelector("#map-day-title"),
  mapDaySubtitle: document.querySelector("#map-day-subtitle"),
  openDayRoute: document.querySelector("#open-day-route"),
  mapRouteSummary: document.querySelector("#map-route-summary"),
  editorDialog: document.querySelector("#editor-dialog"),
  editorForm: document.querySelector("#editor-form"),
  editorTitle: document.querySelector("#editor-title"),
  editorFields: document.querySelector("#editor-fields"),
  editorSave: document.querySelector("#editor-save"),
  editorDelete: document.querySelector("#editor-delete"),
  editorCancel: document.querySelector("#editor-cancel"),
  editorClose: document.querySelector("#editor-close")
};

let state = null;
let remoteSha = "";
let activeDayIndex = 0;
let activeView = "home";
let dirty = false;
let saving = false;
let autoSaveTimer = null;
let activeEditor = null;

function workerUrl() {
  const configured = window.TRIP_SYNC_WORKER_URL || localStorage.getItem(WORKER_URL_KEY) || "";
  return configured.replace(/\/$/, "");
}

function getMapsKey() {
  return localStorage.getItem(MAPS_KEY) || "";
}

function importTokenFromLink() {
  return false;
}

function clearLegacyToken() {
  localStorage.removeItem("trip-plan-github-token-v1");
}

// 共有リンクは素のURL。埋め込みトークンで同期するので #gh= は付けない。
function buildShareUrl() {
  return CANONICAL_URL;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function setStatus(text, tone = "") {
  if (!els.status) return;
  els.status.textContent = text || "";
  els.status.dataset.tone = tone;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function valueOr(value, fallback = "") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function formValue(name) {
  const field = els.editorForm?.elements?.[name];
  return field ? field.value.trim() : "";
}

function closeEditor() {
  activeEditor = null;
  els.editorDialog?.close();
}

function showEditor({ title, fields, saveLabel = "保存", onSave, onDelete }) {
  activeEditor = { onSave, onDelete };
  els.editorTitle.textContent = title;
  els.editorSave.textContent = saveLabel;
  els.editorDelete.hidden = !onDelete;
  els.editorFields.replaceChildren();

  fields.forEach((field) => {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = field.type === "textarea"
      ? document.createElement("textarea")
      : field.type === "select"
        ? document.createElement("select")
        : document.createElement("input");

    input.name = field.name;
    input.required = Boolean(field.required);
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.type && field.type !== "textarea" && field.type !== "select") input.type = field.type;
    if (field.type === "textarea") input.rows = field.rows || 4;
    if (field.type === "select") {
      (field.options || []).forEach((option) => {
        const opt = document.createElement("option");
        opt.value = option.value;
        opt.textContent = option.label;
        input.append(opt);
      });
    }
    input.value = valueOr(field.value);
    label.append(input);
    els.editorFields.append(label);
  });

  els.editorDialog.showModal();
  const firstInput = els.editorFields.querySelector("input, textarea, select");
  requestAnimationFrame(() => firstInput?.focus());
}

function currentTrip() {
  return state.trips.find((trip) => trip.id === state.activeTripId) || state.trips[0];
}

function currentDay() {
  const trip = currentTrip();
  return trip.days[activeDayIndex] || trip.days[0];
}

function normalizeTrip(trip) {
  return {
    id: trip.id || uid("trip"),
    title: valueOr(trip.title, "新しい旅"),
    destination: valueOr(trip.destination, "行き先未定"),
    startDate: valueOr(trip.startDate),
    endDate: valueOr(trip.endDate),
    travelers: Array.isArray(trip.travelers) ? trip.travelers : ["夫", "Rebecca"],
    mood: valueOr(trip.mood),
    budget: Number(trip.budget) || 0,
    status: valueOr(trip.status, "ラフ設計"),
    lastUpdated: valueOr(trip.lastUpdated, new Date().toISOString()),
    archived: Boolean(trip.archived),
    timezones: trip.timezones || {},
    todos: Array.isArray(trip.todos) ? trip.todos : [],
    pois: Array.isArray(trip.pois) ? trip.pois : [],
    days: Array.isArray(trip.days) ? trip.days : [],
    budgetItems: Array.isArray(trip.budgetItems) ? trip.budgetItems : []
  };
}

function normalize(data) {
  if (Array.isArray(data.trips)) {
    const trips = data.trips.map(normalizeTrip);
    return {
      schemaVersion: 2,
      activeTripId: data.activeTripId || trips[0]?.id || "",
      trips
    };
  }

  const trip = normalizeTrip({
    id: "legacy-trip",
    ...(data.trip || {}),
    pois: data.pois || [],
    days: data.days || []
  });
  return { schemaVersion: 2, activeTripId: trip.id, trips: [trip] };
}

// innerHTML に差し込む前にユーザー入力をエスケープ。
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function formatShortDate(value) {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(date);
}

function formatTabDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const monthDay = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(date);
  const weekday = new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(date);
  return `${monthDay} ${weekday}`;
}

function daysUntil(value) {
  if (!value) return "--";
  const start = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((start - today) / 86400000));
}

// 都市名(小文字)ごとの月別平年値。実測予報ではなく季節の目安。
const CLIMATE_BY_CITY = {
  sydney: [
    { high: 26, icon: "☀️", label: "夏・晴れ多め" },
    { high: 26, icon: "☀️", label: "夏・晴れ多め" },
    { high: 24, icon: "🌤️", label: "晩夏・穏やか" },
    { high: 22, icon: "🌤️", label: "秋・過ごしやすい" },
    { high: 19, icon: "⛅", label: "秋・肌寒い朝" },
    { high: 17, icon: "⛅", label: "冬・肌寒い" },
    { high: 16, icon: "🌥️", label: "冬・涼しい" },
    { high: 17, icon: "🌤️", label: "冬・涼しく乾燥" },
    { high: 19, icon: "🌤️", label: "春先・穏やか" },
    { high: 22, icon: "🌤️", label: "春・過ごしやすい" },
    { high: 23, icon: "☀️", label: "初夏・晴れ増加" },
    { high: 25, icon: "☀️", label: "夏・晴れ多め" }
  ],
  tokyo: [
    { high: 10, icon: "🌥️", label: "冬・乾燥" },
    { high: 11, icon: "🌥️", label: "冬・乾燥" },
    { high: 14, icon: "🌤️", label: "春先" },
    { high: 19, icon: "🌤️", label: "春・穏やか" },
    { high: 23, icon: "🌦️", label: "初夏" },
    { high: 26, icon: "🌧️", label: "梅雨" },
    { high: 30, icon: "☀️", label: "夏・蒸し暑い" },
    { high: 31, icon: "☀️", label: "夏・蒸し暑い" },
    { high: 27, icon: "🌦️", label: "台風シーズン" },
    { high: 22, icon: "🌤️", label: "秋・過ごしやすい" },
    { high: 17, icon: "🌤️", label: "晩秋" },
    { high: 12, icon: "🌥️", label: "冬・乾燥" }
  ],
  manila: [
    { high: 30, icon: "☀️", label: "乾季・暑い" },
    { high: 31, icon: "☀️", label: "乾季・暑い" },
    { high: 32, icon: "☀️", label: "乾季・暑い" },
    { high: 33, icon: "☀️", label: "乾季・猛暑" },
    { high: 33, icon: "⛈️", label: "雨季入り" },
    { high: 32, icon: "⛈️", label: "雨季・スコール" },
    { high: 31, icon: "🌧️", label: "雨季・スコール" },
    { high: 31, icon: "🌧️", label: "雨季・スコール" },
    { high: 31, icon: "🌧️", label: "雨季・スコール" },
    { high: 31, icon: "🌦️", label: "雨季後半" },
    { high: 31, icon: "🌤️", label: "乾季入り" },
    { high: 30, icon: "☀️", label: "乾季・暑い" }
  ]
};

// destinationの文字列から都市キーを推定し、月の平年値を返す（実測天気予報ではなく季節目安）。
function climateEstimate(destination, dateStr) {
  if (!destination || !dateStr) return null;
  const lower = destination.toLowerCase();
  const key = Object.keys(CLIMATE_BY_CITY).find((city) => lower.includes(city));
  if (!key) return null;
  const month = Number(dateStr.slice(5, 7)) - 1;
  const entry = CLIMATE_BY_CITY[key][month];
  return entry ? { ...entry } : null;
}

// タイムゾーン略称 -> UTCオフセット(分)。trip.timezones に無い略称の保険。
const TZ_OFFSETS = {
  UTC: 0, GMT: 0,
  JST: 540, KST: 540,
  PHT: 480, SGT: 480, HKT: 480, AWST: 480, CST: 480, MYT: 480, WITA: 480,
  ICT: 420, WIB: 420,
  NPT: 345, IST: 330,
  GST: 240,
  CET: 60, BST: 60, WAT: 60,
  CEST: 120, EET: 120,
  ACST: 570, ACDT: 630,
  AEST: 600, ChST: 600,
  AEDT: 660,
  NZST: 720, NZDT: 780,
  HST: -600, AKST: -540, PST: -480, PDT: -420,
  MST: -420, MDT: -360, EST: -300, CDT: -300,
  EDT: -240, AST: -240, BRT: -180, ART: -180
};

// "JST UTC+9" や "AEST UTC+10:30" から {略称, オフセット分} を取り出す。
function parseZoneString(raw) {
  const str = String(raw || "");
  const abbr = (str.match(/\b([A-Za-z]{2,5})\b/) || [])[1];
  const off = str.match(/UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i);
  if (!abbr || !off) return null;
  const sign = off[1] === "-" ? -1 : 1;
  const minutes = sign * (Number(off[2]) * 60 + Number(off[3] || 0));
  return { abbr: abbr.toUpperCase(), offset: minutes };
}

// trip.timezones の値を優先し、無ければ組み込みテーブルから解決。
function tzOffsetMinutes(abbr, trip) {
  if (!abbr) return null;
  const key = String(abbr).trim().toUpperCase();
  const zones = trip?.timezones || {};
  for (const value of Object.values(zones)) {
    const parsed = parseZoneString(value);
    if (parsed && parsed.abbr === key) return parsed.offset;
  }
  if (key in TZ_OFFSETS) return TZ_OFFSETS[key];
  const upperMap = Object.fromEntries(Object.entries(TZ_OFFSETS).map(([k, v]) => [k.toUpperCase(), v]));
  return key in upperMap ? upperMap[key] : null;
}

// 現地の日付+時刻+タイムゾーンから、絶対時刻(UTC epoch ms)を求める。
function eventInstant(dateStr, timeStr, abbr, trip) {
  if (!dateStr || !timeStr) return null;
  const offset = tzOffsetMinutes(abbr, trip);
  if (offset === null || offset === undefined) return null;
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if ([y, mo, d, hh, mm].some((n) => Number.isNaN(n))) return null;
  return Date.UTC(y, mo - 1, d, hh, mm) - offset * 60000;
}

// ミリ秒差を "8h25m" / "45m" / "-30m" 形式に。
function formatDuration(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "";
  const totalMin = Math.round(ms / 60000);
  const sign = totalMin < 0 ? "-" : "";
  const abs = Math.abs(totalMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h && m) return `${sign}${h}h${m}m`;
  if (h) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

// このtripの「日本(home)時間」の略称とオフセット。
function homeZone(trip) {
  const parsed = parseZoneString(trip?.timezones?.home) || parseZoneString(trip?.timezones?.tokyo);
  if (parsed) return parsed;
  return { abbr: "JST", offset: 540 };
}

// 絶対時刻を指定オフセットの壁時計 "HH:MM" に。
function clockAt(instant, offsetMinutes) {
  const shifted = new Date(instant + offsetMinutes * 60000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 絶対時刻を指定オフセットの日付 "YYYY-MM-DD" に。
function dateAt(instant, offsetMinutes) {
  const shifted = new Date(instant + offsetMinutes * 60000);
  const y = shifted.getUTCFullYear();
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

// home時間の表示ラベル。現地日付と跨ぐ場合は 翌/前日 を添える。
function homeTimeLabel(instant, localDate, trip) {
  if (instant === null || instant === undefined) return "";
  const home = homeZone(trip);
  const clock = clockAt(instant, home.offset);
  const homeDate = dateAt(instant, home.offset);
  let prefix = "";
  if (localDate && homeDate) {
    const diff = Math.round((Date.parse(`${homeDate}T00:00:00Z`) - Date.parse(`${localDate}T00:00:00Z`)) / 86400000);
    if (diff > 0) prefix = "翌";
    else if (diff < 0) prefix = "前日";
  }
  return `${home.abbr} ${prefix}${clock}`;
}

// 全dayのitemを時系列順にフラット化（前の予定との経過時間計算用）。
function flatTimelineItems(trip) {
  const list = [];
  (trip.days || []).forEach((day, dayIndex) => {
    (day.items || []).forEach((item) => {
      list.push({
        dayIndex,
        date: day.date,
        item,
        instant: eventInstant(day.date, item.time, item.timezone, trip)
      });
    });
  });
  return list;
}

// このtripで実際に使われている（または想定される）タイムゾーン略称一覧。
function tzOptionsForTrip(trip) {
  const found = new Set();
  Object.values(trip.timezones || {}).forEach((value) => {
    const parsed = parseZoneString(value);
    if (parsed) found.add(parsed.abbr);
  });
  (trip.days || []).forEach((day) => {
    (day.items || []).forEach((item) => {
      if (item.timezone) found.add(String(item.timezone).toUpperCase());
    });
  });
  return Array.from(found).sort().map((abbr) => ({ value: abbr, label: abbr }));
}

function poiById(id) {
  return currentTrip().pois.find((poi) => poi.id === id);
}

function mapsUrl(poi) {
  if (poi.mapsUrl) return poi.mapsUrl;
  const q = encodeURIComponent(`${poi.name} ${poi.area} ${currentTrip().destination}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function mapQuery(poi) {
  return [poi.name, poi.area, currentTrip().destination].filter(Boolean).join(", ");
}

// 旅程の予定(item)からGoogleマップのリンクを作る。POIが紐づいていればそのURL、無ければ予定名で検索。
function eventMapsUrl(item) {
  const poi = poiById(item.poiId);
  if (poi) return mapsUrl(poi);
  const q = encodeURIComponent(`${item.title} ${currentTrip().destination}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

// カード用の絵文字サムネイル。手動指定(item/poi.emoji)を優先し、無ければ内容から推測。
function defaultEmoji(item, poi) {
  if (item?.emoji) return item.emoji;
  if (poi?.emoji) return poi.emoji;
  if (item?.flightNumber) return "✈️";
  const text = `${item?.title || ""} ${item?.memo || ""} ${poi?.name || ""} ${poi?.category || ""}`;
  if (/乗継|レイオーバー|layover/i.test(text)) return "🛫";
  if (/ホテル|hotel/i.test(text)) return "🏨";
  if (/ビーチ|beach|mountain|マウンテン|nature|自然|公園/i.test(text)) return "🌿";
  if (/食|カフェ|レストラン|ランチ|ディナー|café|restaurant/i.test(text)) return "🍽️";
  if (/空港|airport/i.test(text)) return "🛫";
  return "📍";
}

// サムネイルはGoogleマップの埋め込み(APIキー不要)。場所名だけでミニ地図を出す。
function mapThumbEmbedUrl(query) {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=14&output=embed`;
}

// サムネイルのHTML。場所が特定できればミニ地図、無ければ絵文字。
function thumbMarkup(query, emoji, className) {
  if (query && query.trim()) {
    return `<div class="${className} is-map" aria-hidden="true"><iframe src="${escapeHtml(mapThumbEmbedUrl(query))}" loading="lazy" tabindex="-1" title=""></iframe></div>`;
  }
  return `<div class="${className}" aria-hidden="true">${escapeHtml(emoji)}</div>`;
}

function uniquePois(items) {
  const seen = new Set();
  return items
    .map((item) => item.poiId && poiById(item.poiId))
    .filter((poi) => {
      if (!poi || seen.has(poi.id)) return false;
      seen.add(poi.id);
      return true;
    });
}

function routePoisForDay() {
  const trip = currentTrip();
  const day = currentDay();
  const dayPois = uniquePois(day?.items || []);
  return dayPois.length ? { pois: dayPois, fallback: false } : { pois: trip.pois || [], fallback: true };
}

function googleMapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&utm_source=trip_studio&utm_campaign=place_details_search`;
}

function googleMapsDirectionsUrl(points) {
  if (points.length < 2) return googleMapsSearchUrl(points[0] || currentTrip().destination);
  const params = new URLSearchParams({
    api: "1",
    origin: points[0],
    destination: points[points.length - 1],
    travelmode: "walking",
    utm_source: "trip_studio",
    utm_campaign: "directions_request"
  });
  const waypoints = points.slice(1, -1);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function googleMapsEmbedUrl(points) {
  const key = getMapsKey();
  if (!key) {
    const query = points[0] || currentTrip().destination;
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  }

  if (points.length < 2) {
    const params = new URLSearchParams({ key, q: points[0] || currentTrip().destination });
    return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
  }

  const params = new URLSearchParams({
    key,
    origin: points[0],
    destination: points[points.length - 1],
    mode: "walking"
  });
  const waypoints = points.slice(1, -1);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
}

function request(url, options = {}, timeoutMs = 10000) {
  if (typeof fetch === "function") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || "GET", url, true);
    xhr.timeout = timeoutMs;
    Object.entries(options.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.onload = () => resolve({
      ok: xhr.status >= 200 && xhr.status < 300,
      status: xhr.status,
      json: async () => JSON.parse(xhr.responseText),
      text: async () => xhr.responseText
    });
    xhr.onerror = () => reject(new Error("通信に失敗しました"));
    xhr.ontimeout = () => reject(new Error("通信がタイムアウトしました"));
    xhr.send(options.body || null);
  });
}

async function fetchStateViaWorker() {
  const endpoint = workerUrl();
  if (!endpoint) return null;
  const response = await request(`${endpoint}/state?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`同期できません (${response.status})`);
  remoteSha = response.headers?.get?.("X-Trip-Sha") || response.headers?.get?.("ETag") || "";
  return normalize(await response.json());
}

// トークン無し/失敗時のフォールバック。Pages配信の静的JSON(反映が遅れることがある)。
async function fetchStateViaStatic() {
  const response = await request(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`読み込めません (${response.status})`);
  return normalize(JSON.parse(await response.text()));
}

async function loadRemote() {
  // まずAPI(最新)を試し、ダメなら静的JSON、それもダメならキャッシュ。
  // API優先なので、保存直後のポーリングで古いPagesを読んで
  // チェックが元に戻る(=同期していないように見える)問題が起きない。
  const previousDayId = state?.trips?.length ? currentDay()?.id : "";
  let next = null;
  try {
    next = await fetchStateViaWorker();
  } catch {
    // APIが失敗(トークン失効・レート制限など)。静的JSONへフォールバック。
  }
  if (!next) {
    try {
      next = await fetchStateViaStatic();
    } catch {
      // 両方失敗。下でキャッシュにフォールバック。
    }
  }
  try {
    if (!next) throw new Error("読み込めません");
    state = next;
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    if (previousDayId) {
      const nextDayIndex = currentTrip().days.findIndex((day) => day.id === previousDayId);
      activeDayIndex = nextDayIndex >= 0 ? nextDayIndex : 0;
    } else {
      activeDayIndex = Math.min(activeDayIndex, Math.max(0, currentTrip().days.length - 1));
    }
    render();
    setStatus(workerUrl() ? "共有リンク同期中" : "Worker未設定・閲覧のみ", workerUrl() ? "" : "soft");
  } catch (error) {
    const cache = localStorage.getItem(CACHE_KEY);
    if (cache) {
      state = normalize(JSON.parse(cache));
      render();
      setStatus("オフライン・前回データ", "warn");
      return;
    }
    setStatus(error.message, "warn");
  }
}

function markDirty() {
  dirty = true;
  setStatus(workerUrl() ? "保存待ち" : "Worker未設定・この端末だけ保存", "soft");
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveRemote, AUTO_SAVE_MS);
}

async function saveRemote() {
  const endpoint = workerUrl();
  if (!dirty || saving || !endpoint) return;
  saving = true;
  setStatus("自動保存中");
  const trip = currentTrip();
  trip.lastUpdated = new Date().toISOString();
  try {
    const response = await request(`${endpoint}/state`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state)
    }, 15000);
    if (!response.ok) throw new Error(`保存失敗 (${response.status})`);
    const payload = await response.json();
    remoteSha = payload.sha || response.headers?.get?.("X-Trip-Sha") || "";
    dirty = false;
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    setStatus("保存済み");
  } catch (error) {
    setStatus(error.message, "warn");
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveRemote, 3000);
  } finally {
    saving = false;
  }
}

function render() {
  if (!state?.trips?.length) return;
  renderHeader();
  renderDayTabs();
  renderTimeline();
  renderProgress();
  renderTodos();
  renderSpots();
  renderBudget();
  renderMap();
  renderTrips();
  renderView();
  renderShareLink();
}

function renderShareLink() {
  const shareUrl = buildShareUrl();
  if (els.shareLink) {
    els.shareLink.value = shareUrl;
  }
  if (els.mapsKey) els.mapsKey.value = getMapsKey();
  if (els.buildVersion) els.buildVersion.textContent = `v${BUILD_VERSION}`;
}

// "2026-08-11" と "2026-08-16" → "2026.8.11 – 8.16"（区切りを混ぜず一貫させる）
function formatHeaderRange(start, end) {
  const parts = (value) => {
    if (!value) return null;
    const [y, m, d] = value.split("-").map(Number);
    if ([y, m, d].some(Number.isNaN)) return null;
    return { y, m, d };
  };
  const s = parts(start);
  const e = parts(end);
  if (!s) return "";
  const startLabel = `${s.y}.${s.m}.${s.d}`;
  if (!e) return startLabel;
  const endLabel = s.y === e.y ? `${e.m}.${e.d}` : `${e.y}.${e.m}.${e.d}`;
  return `${startLabel} – ${endLabel}`;
}

function renderHeader() {
  const trip = currentTrip();
  els.title.textContent = trip.title;
  els.dates.textContent = formatHeaderRange(trip.startDate, trip.endDate);

  const cityLabel = trip.destination.split("/")[0].trim();
  const climate = climateEstimate(trip.destination, trip.startDate);
  if (els.weatherIcon) els.weatherIcon.textContent = climate?.icon || "🌡️";
  els.place.textContent = climate
    ? `${cityLabel}・${climate.label} 平年${climate.high}°`
    : `${cityLabel}・季節の目安なし`;

  if (els.tripStatus) els.tripStatus.textContent = trip.status || "旅行準備中";
  els.countdown.textContent = `${daysUntil(trip.startDate)}日`;
  if (els.archiveToggle) els.archiveToggle.textContent = trip.archived ? "現在Tripに戻す" : "過去Tripへ移動";
}

function renderDayTabs() {
  const trip = currentTrip();
  els.dayTabs.replaceChildren();
  trip.days.forEach((day, index) => {
    const isActive = index === activeDayIndex;
    const button = document.createElement("button");
    button.type = "button";
    button.className = isActive ? "is-active" : "";
    button.innerHTML = `<strong>${escapeHtml(day.title || `Day ${index + 1}`)}</strong><span>${escapeHtml(formatTabDate(day.date))}</span>`;
    button.addEventListener("click", () => {
      // アクティブなタブをもう一度押すと、その日を編集する(旅程タブの代替)。
      if (isActive) {
        editDay(day.id);
        return;
      }
      activeDayIndex = index;
      renderTimeline();
      renderMap();
      renderDayTabs();
    });
    els.dayTabs.append(button);
  });

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "day-tab-add";
  addButton.textContent = "+";
  addButton.setAttribute("aria-label", "日を追加");
  addButton.addEventListener("click", addDay);
  els.dayTabs.append(addButton);
}

function renderTimeline() {
  const trip = currentTrip();
  const day = currentDay();
  els.timeline.replaceChildren();
  if (!day) {
    els.timeline.innerHTML = `<p class="empty">日程を追加すると、ここにタイムラインが出ます。</p>`;
    return;
  }
  const flat = flatTimelineItems(trip);
  const homeAbbr = homeZone(trip).abbr;
  const destAbbr = (parseZoneString(trip.timezones?.destination) || {}).abbr;
  day.items.forEach((item, index) => {
    const poi = poiById(item.poiId);
    const zone = item.timezone ? `<span>${escapeHtml(item.timezone)}</span>` : "";

    const flatIndex = flat.findIndex((entry) => entry.item.id === item.id);
    const current = flat[flatIndex];
    const previous = flatIndex > 0 ? flat[flatIndex - 1] : null;

    // タイムゾーンを跨いでも実際の経過時間を計算して表示。
    let elapsed = "";
    if (current?.instant != null && previous?.instant != null) {
      const label = formatDuration(current.instant - previous.instant);
      if (label) {
        const cross = previous.item.timezone && item.timezone && previous.item.timezone !== item.timezone;
        const suffix = cross ? ` <b>${escapeHtml(previous.item.timezone)}→${escapeHtml(item.timezone)}</b>` : "";
        elapsed = `<span class="elapsed${cross ? " is-cross" : ""}">前から ${label}${suffix}</span>`;
      }
    }

    // JST補助表示は「乗継など中間のタイムゾーンにいる時」だけ。
    // 日本(home)にいる時は同じなので不要。現地(destination)にいる時も本人が言う通り不要。
    const zoneAbbr = (item.timezone || "").toUpperCase();
    const showHome = zoneAbbr && zoneAbbr !== homeAbbr && zoneAbbr !== (destAbbr || "").toUpperCase();
    const computedHome = homeTimeLabel(current?.instant, current?.date, trip);
    const homeText = showHome ? (computedHome || (item.homeTime ? `JST ${item.homeTime}` : "")) : "";
    const homeTime = homeText ? `<em>${escapeHtml(homeText)}</em>` : "";

    // 航空券の便名・航空会社・機材を旅程に統合表示。
    const flightBits = [item.flightNumber, item.airline, item.aircraft].filter(Boolean);
    const flightInfo = flightBits.length ? `<small class="flight-info">${escapeHtml(flightBits.join(" ・ "))}</small>` : "";

    // 地図サムネイルは場所(POI)が紐づく予定だけ。便や乗継などは絵文字のまま。
    const thumbQuery = poi ? mapQuery(poi) : "";

    const row = document.createElement("article");
    row.className = "timeline-row";
    row.innerHTML = `
      <div class="time-cell">
        <time>${escapeHtml(item.time || "--:--")}</time>
        ${zone}
      </div>
      <span class="dot ${index % 2 ? "blue" : "pink"}"></span>
      <article class="event-card">
        ${thumbMarkup(thumbQuery, defaultEmoji(item, poi), "event-thumb")}
        <a class="event-body" href="${escapeHtml(eventMapsUrl(item))}" target="_blank" rel="noreferrer">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(poi ? poi.name : item.memo || "メモなし")}</small>
          ${flightInfo}
          <div class="event-foot">${homeTime}${elapsed}</div>
        </a>
        <button class="event-edit" type="button" aria-label="予定を編集">✏️</button>
      </article>
    `;
    row.querySelector(".event-edit").addEventListener("click", () => editItem(day.id, item.id));
    els.timeline.append(row);
  });
}

function budgetStats(trip) {
  const spent = trip.budgetItems.reduce((sum, entry) => sum + (Number(entry.actual) || 0), 0);
  const planned = trip.budgetItems.reduce((sum, entry) => sum + (Number(entry.planned) || 0), 0);
  const total = trip.budget || 0;
  const percent = total ? Math.min(100, Math.round((spent / total) * 100)) : 0;
  return { spent, planned, total, percent };
}

function renderProgress() {
  const trip = currentTrip();
  const stats = todoStats(trip);
  const packing = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const budget = budgetStats(trip).percent;
  els.packingScore.textContent = `${packing}%`;
  els.budgetScore.textContent = `${budget}%`;
  document.querySelector(".progress-card.pink meter").value = packing;
  document.querySelector(".progress-card.blue meter").value = budget;
}

function todoStats(trip) {
  const total = trip.todos.length;
  const done = trip.todos.filter((todo) => todo.status === "done").length;
  const urgent = trip.todos.filter((todo) => todo.status !== "done" && todo.priority === "high").length;
  return { total, done, urgent };
}

function priorityLabel(priority) {
  if (priority === "high") return "重要";
  if (priority === "medium") return "確認";
  return "あとで";
}

function renderTodos() {
  const trip = currentTrip();
  const stats = todoStats(trip);
  if (els.todoSummary) {
    els.todoSummary.innerHTML = `
      <strong>${stats.done}/${stats.total} 完了</strong>
      <span>${stats.urgent ? `重要 ${stats.urgent}件` : "重要項目は処理済み"}</span>
    `;
  }
  if (!els.todoList) return;
  els.todoList.replaceChildren();
  trip.todos.forEach((todo) => {
    const card = document.createElement("article");
    card.className = `todo-card ${todo.status === "done" ? "is-done" : ""}`;
    card.innerHTML = `
      <button class="todo-check" type="button" aria-label="完了切替">${todo.status === "done" ? "✓" : ""}</button>
      <div>
        <div class="todo-meta">
          <span class="priority ${todo.priority || "medium"}">${escapeHtml(priorityLabel(todo.priority))}</span>
          <span>${escapeHtml(todo.due || "期限未定")}</span>
          <span>${escapeHtml(todo.owner || "2人")}</span>
        </div>
        <strong>${escapeHtml(todo.title)}</strong>
        <p>${escapeHtml(todo.detail || "")}</p>
      </div>
    `;
    card.querySelector(".todo-check").addEventListener("click", () => {
      todo.status = todo.status === "done" ? "open" : "done";
      render();
      markDirty();
    });
    card.addEventListener("click", (event) => {
      if (event.target.classList.contains("todo-check")) return;
      editTodo(todo.id);
    });
    els.todoList.append(card);
  });
}

function renderSpots() {
  const trip = currentTrip();
  els.spotList.replaceChildren();
  trip.pois.forEach((poi) => {
    const card = document.createElement("article");
    card.className = "list-card spot-card";
    card.innerHTML = `
      ${thumbMarkup(mapQuery(poi), defaultEmoji(null, poi), "spot-thumb")}
      <div class="spot-body">
        <strong>${escapeHtml(poi.name)}</strong>
        <p>${escapeHtml(poi.area)}・${escapeHtml(poi.memo || "メモなし")}</p>
        <a href="${escapeHtml(mapsUrl(poi))}" target="_blank" rel="noreferrer">Mapで開く</a>
      </div>
    `;
    card.addEventListener("click", (event) => {
      if (event.target.tagName !== "A") editPoi(poi.id);
    });
    els.spotList.append(card);
  });
}

function renderMap() {
  if (!els.routeMap || !els.openDayRoute) return;
  const day = currentDay();
  const { pois, fallback } = routePoisForDay();
  const points = pois.map(mapQuery);
  const mapTitle = day ? `${day.title || "Day"} / ${formatTabDate(day.date)}` : "Trip map";
  const countLabel = points.length >= 2 ? `${points.length}スポットのルート` : points.length === 1 ? "1スポット" : "目的地";

  if (els.mapDayTitle) els.mapDayTitle.textContent = mapTitle;
  if (els.mapDaySubtitle) {
    els.mapDaySubtitle.textContent = fallback
      ? `この日に場所が未登録なので、旅行全体の${countLabel}を表示`
      : `この日の${countLabel}を表示`;
  }
  els.openDayRoute.href = googleMapsDirectionsUrl(points);
  els.openDayRoute.textContent = points.length >= 2 ? "ルートを開く" : "Mapで開く";
  els.routeMap.src = googleMapsEmbedUrl(points);
  renderRouteSummary(points);
}

function renderRouteSummary(points) {
  if (!els.mapRouteSummary) return;
  els.mapRouteSummary.replaceChildren();
  if (!points.length) {
    const empty = document.createElement("span");
    empty.textContent = currentTrip().destination;
    els.mapRouteSummary.append(empty);
    return;
  }
  points.forEach((point, index) => {
    if (index) {
      const arrow = document.createElement("b");
      arrow.textContent = "→";
      els.mapRouteSummary.append(arrow);
    }
    const chip = document.createElement("span");
    chip.textContent = point.split(",")[0];
    els.mapRouteSummary.append(chip);
  });
}

function renderBudget() {
  const trip = currentTrip();
  const stats = budgetStats(trip);
  if (els.budgetSummary) {
    els.budgetSummary.innerHTML = `
      <div><strong>${stats.total.toLocaleString()}円</strong><span>予算</span></div>
      <div><strong>${stats.spent.toLocaleString()}円</strong><span>使った</span></div>
      <div><strong>${Math.max(0, stats.total - stats.spent).toLocaleString()}円</strong><span>残り</span></div>
      <meter min="0" max="100" value="${stats.percent}"></meter>
    `;
  }
  if (!els.budgetList) return;
  els.budgetList.replaceChildren();
  trip.budgetItems.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "list-card budget-card";
    card.innerHTML = `
      <div>
        <strong>${escapeHtml(entry.label)}</strong>
        <p>${escapeHtml(entry.category || "未分類")}${entry.memo ? `・${escapeHtml(entry.memo)}` : ""}</p>
      </div>
      <div class="amount">
        ${(Number(entry.actual) || 0).toLocaleString()}円
        <small>予定 ${(Number(entry.planned) || 0).toLocaleString()}円</small>
      </div>
    `;
    card.addEventListener("click", () => editBudgetItem(entry.id));
    els.budgetList.append(card);
  });
}

function renderTrips() {
  els.tripList.replaceChildren();
  state.trips.forEach((trip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = trip.id === state.activeTripId ? "trip-choice is-active" : "trip-choice";
    button.innerHTML = `<strong>${escapeHtml(trip.title)}</strong><span>${trip.archived ? "過去Trip" : "現在Trip"}・${escapeHtml(trip.destination)}</span>`;
    button.addEventListener("click", () => {
      state.activeTripId = trip.id;
      activeDayIndex = 0;
      els.tripDialog.close();
      render();
      markDirty();
    });
    els.tripList.append(button);
  });
}

// 日付(day-tabs)がその日の中身を左右するビューだけで表示する。
// 日付タブは「その日のタイムライン」を切り替えるためのもの。ホームだけで意味を持つ。
// やること・スポット・予算では不要。
const DAY_TAB_VIEWS = new Set(["home"]);

function renderView() {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
  document.querySelector(`#view-${activeView}`).classList.add("is-active");
  document.querySelectorAll(".bottom-nav button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === activeView);
  });
  if (els.dayTabs) els.dayTabs.hidden = !DAY_TAB_VIEWS.has(activeView);
}

function addSpot() {
  const trip = currentTrip();
  showEditor({
    title: "スポットを追加",
    fields: [
      { name: "name", label: "場所名", required: true, placeholder: "例: Sydney Opera House" },
      { name: "area", label: "エリア・場所", value: trip.destination },
      { name: "mapsUrl", label: "Google Maps URL" },
      { name: "emoji", label: "画像(絵文字)", placeholder: "例: 🏖️（空欄なら自動）" },
      { name: "memo", label: "メモ", type: "textarea", rows: 3 }
    ],
    onSave: () => {
      trip.pois.unshift({
        id: uid("poi"),
        name: formValue("name"),
        area: formValue("area"),
        category: "spot",
        priority: "medium",
        mapsUrl: formValue("mapsUrl"),
        emoji: formValue("emoji"),
        memo: formValue("memo")
      });
      render();
      markDirty();
    }
  });
}

function editPoi(id) {
  const poi = currentTrip().pois.find((item) => item.id === id);
  if (!poi) return;
  const trip = currentTrip();
  showEditor({
    title: "スポットを編集",
    fields: [
      { name: "name", label: "場所名", value: poi.name, required: true },
      { name: "area", label: "エリア・場所", value: poi.area },
      { name: "mapsUrl", label: "Google Maps URL", value: poi.mapsUrl },
      { name: "emoji", label: "画像(絵文字)", value: poi.emoji, placeholder: "例: 🏖️（空欄なら自動）" },
      { name: "memo", label: "メモ", type: "textarea", value: poi.memo, rows: 3 }
    ],
    onSave: () => {
      poi.name = formValue("name");
      poi.area = formValue("area");
      poi.mapsUrl = formValue("mapsUrl");
      poi.emoji = formValue("emoji");
      poi.memo = formValue("memo");
      render();
      markDirty();
    },
    onDelete: () => {
      trip.pois = trip.pois.filter((item) => item.id !== id);
      trip.days.forEach((day) => {
        day.items.forEach((item) => {
          if (item.poiId === id) item.poiId = "";
        });
      });
      render();
      markDirty();
    }
  });
}

function editDay(id) {
  const day = currentTrip().days.find((item) => item.id === id);
  if (!day) return;
  showEditor({
    title: "日程を編集",
    fields: [
      { name: "title", label: "表示名", value: day.title, required: true },
      { name: "date", label: "日付", type: "date", value: day.date },
      { name: "theme", label: "テーマ", type: "textarea", value: day.theme, rows: 3 }
    ],
    onSave: () => {
      day.title = formValue("title");
      day.date = formValue("date");
      day.theme = formValue("theme");
      render();
      markDirty();
    }
  });
}

function editItem(dayId, itemId) {
  const day = currentTrip().days.find((item) => item.id === dayId);
  const item = day?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  const poiOptions = [
    { value: "", label: "場所なし" },
    ...currentTrip().pois.map((poi) => ({ value: poi.id, label: poi.name }))
  ];
  const tzOptions = tzOptionsForTrip(currentTrip());
  const timezoneOptions = tzOptions.some((option) => option.value === item.timezone)
    ? tzOptions
    : [...tzOptions, { value: item.timezone || "", label: item.timezone || "未設定" }];
  showEditor({
    title: "予定を編集",
    fields: [
      { name: "time", label: "現地時間", type: "time", value: item.time, required: true },
      { name: "timezone", label: "タイムゾーン", type: "select", value: item.timezone, options: timezoneOptions },
      { name: "homeTime", label: "JST補助メモ（空なら自動換算）", type: "time", value: item.homeTime },
      { name: "title", label: "予定名", value: item.title, required: true },
      { name: "poiId", label: "場所", type: "select", value: item.poiId, options: poiOptions },
      { name: "flightNumber", label: "便名（任意）", value: item.flightNumber, placeholder: "例: PR423" },
      { name: "airline", label: "航空会社（任意）", value: item.airline },
      { name: "aircraft", label: "機材（任意）", value: item.aircraft },
      { name: "emoji", label: "画像(絵文字)", value: item.emoji, placeholder: "例: ✈️（空欄なら自動）" },
      { name: "memo", label: "メモ", type: "textarea", value: item.memo, rows: 4 }
    ],
    onSave: () => {
      item.time = formValue("time");
      item.timezone = formValue("timezone");
      item.homeTime = formValue("homeTime");
      item.title = formValue("title");
      item.poiId = formValue("poiId");
      item.flightNumber = formValue("flightNumber");
      item.airline = formValue("airline");
      item.aircraft = formValue("aircraft");
      item.emoji = formValue("emoji");
      item.memo = formValue("memo");
      render();
      markDirty();
    },
    onDelete: () => {
      day.items = day.items.filter((entry) => entry.id !== itemId);
      render();
      markDirty();
    }
  });
}

function addDay() {
  const trip = currentTrip();
  trip.days.push({
    id: uid("day"),
    date: trip.startDate,
    title: `Day ${trip.days.length + 1}`,
    theme: "ゆるく予定を置く日",
    items: []
  });
  activeDayIndex = trip.days.length - 1;
  render();
  markDirty();
}

function addTodo() {
  showEditor({
    title: "やることを追加",
    fields: [
      { name: "title", label: "やること", required: true },
      { name: "detail", label: "メモ", type: "textarea", rows: 3 },
      { name: "due", label: "期限", value: "出発1か月前" },
      { name: "owner", label: "担当", value: "2人" },
      {
        name: "priority",
        label: "重要度",
        type: "select",
        value: "medium",
        options: [
          { value: "high", label: "重要" },
          { value: "medium", label: "確認" },
          { value: "low", label: "あとで" }
        ]
      }
    ],
    onSave: () => {
      currentTrip().todos.push({
        id: uid("todo"),
        title: formValue("title"),
        detail: formValue("detail"),
        due: formValue("due"),
        priority: formValue("priority") || "medium",
        owner: formValue("owner"),
        status: "open"
      });
      render();
      markDirty();
    }
  });
}

function editTodo(id) {
  const todo = currentTrip().todos.find((item) => item.id === id);
  if (!todo) return;
  const trip = currentTrip();
  showEditor({
    title: "やることを編集",
    fields: [
      { name: "title", label: "やること", value: todo.title, required: true },
      { name: "detail", label: "メモ", type: "textarea", value: todo.detail, rows: 3 },
      { name: "due", label: "期限", value: todo.due },
      { name: "owner", label: "担当", value: todo.owner },
      {
        name: "priority",
        label: "重要度",
        type: "select",
        value: todo.priority || "medium",
        options: [
          { value: "high", label: "重要" },
          { value: "medium", label: "確認" },
          { value: "low", label: "あとで" }
        ]
      }
    ],
    onSave: () => {
      todo.title = formValue("title");
      todo.detail = formValue("detail");
      todo.due = formValue("due");
      todo.owner = formValue("owner");
      todo.priority = formValue("priority") || "medium";
      render();
      markDirty();
    },
    onDelete: () => {
      trip.todos = trip.todos.filter((item) => item.id !== id);
      render();
      markDirty();
    }
  });
}

function addBudgetItem() {
  const trip = currentTrip();
  showEditor({
    title: "予算項目を追加",
    fields: [
      { name: "label", label: "項目名", required: true, placeholder: "例: 航空券" },
      { name: "category", label: "カテゴリ", value: "その他" },
      { name: "planned", label: "予定金額", type: "number" },
      { name: "actual", label: "使った金額", type: "number" },
      { name: "memo", label: "メモ", type: "textarea", rows: 3 }
    ],
    onSave: () => {
      trip.budgetItems.push({
        id: uid("budget"),
        label: formValue("label"),
        category: formValue("category"),
        planned: Number(formValue("planned")) || 0,
        actual: Number(formValue("actual")) || 0,
        memo: formValue("memo")
      });
      render();
      markDirty();
    }
  });
}

function editBudgetItem(id) {
  const trip = currentTrip();
  const entry = trip.budgetItems.find((item) => item.id === id);
  if (!entry) return;
  showEditor({
    title: "予算項目を編集",
    fields: [
      { name: "label", label: "項目名", value: entry.label, required: true },
      { name: "category", label: "カテゴリ", value: entry.category },
      { name: "planned", label: "予定金額", type: "number", value: entry.planned },
      { name: "actual", label: "使った金額", type: "number", value: entry.actual },
      { name: "memo", label: "メモ", type: "textarea", value: entry.memo, rows: 3 }
    ],
    onSave: () => {
      entry.label = formValue("label");
      entry.category = formValue("category");
      entry.planned = Number(formValue("planned")) || 0;
      entry.actual = Number(formValue("actual")) || 0;
      entry.memo = formValue("memo");
      render();
      markDirty();
    },
    onDelete: () => {
      trip.budgetItems = trip.budgetItems.filter((item) => item.id !== id);
      render();
      markDirty();
    }
  });
}

function newTrip() {
  const id = uid("trip");
  state.trips.unshift(normalizeTrip({ id, title: "新しい旅", destination: "行き先未定" }));
  state.activeTripId = id;
  els.tripDialog.close();
  render();
  markDirty();
}

function bind() {
  els.editorForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    activeEditor?.onSave?.();
    closeEditor();
  });
  els.editorCancel?.addEventListener("click", closeEditor);
  els.editorClose?.addEventListener("click", closeEditor);
  els.editorDelete?.addEventListener("click", () => {
    activeEditor?.onDelete?.();
    closeEditor();
  });
  document.querySelector("#trip-switcher").addEventListener("click", () => els.tripDialog.showModal());
  document.querySelector("#sync-settings").addEventListener("click", () => {
    renderShareLink();
    els.settingsDialog.showModal();
  });
  document.querySelector("#copy-share-link").addEventListener("click", async () => {
    await copyText(buildShareUrl());
    setStatus("共有リンクをコピー済み");
  });
  document.querySelector("#save-maps-key")?.addEventListener("click", () => {
    localStorage.setItem(MAPS_KEY, els.mapsKey.value.trim());
    renderMap();
  });
  document.querySelector("#clear-maps-key")?.addEventListener("click", () => {
    localStorage.removeItem(MAPS_KEY);
    if (els.mapsKey) els.mapsKey.value = "";
    renderMap();
  });
  document.querySelector("#save-now").addEventListener("click", () => {
    dirty = true;
    saveRemote();
  });
  document.querySelector("#new-trip").addEventListener("click", newTrip);
  document.querySelector("#add-todo").addEventListener("click", addTodo);
  document.querySelector("#add-spot").addEventListener("click", addSpot);
  document.querySelector("#add-budget-item")?.addEventListener("click", addBudgetItem);
  document.querySelector("#archive-toggle")?.addEventListener("click", () => {
    currentTrip().archived = !currentTrip().archived;
    render();
    markDirty();
  });
  document.querySelectorAll(".bottom-nav button").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      renderView();
    });
  });
}

clearLegacyToken();
importTokenFromLink();
bind();
loadRemote();
setInterval(() => {
  if (!dirty && !saving && document.visibilityState === "visible") loadRemote();
}, POLL_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !dirty && !saving) loadRemote();
});
