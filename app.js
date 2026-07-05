const GITHUB = {
  owner: "masakasakasama",
  repo: "Trip_Plan",
  branch: "main",
  path: "trip-plan.json"
};

const API_URL = `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${GITHUB.path}`;
const DATA_URL = "trip-plan.json";
const TOKEN_KEY = "trip-plan-github-token-v1";
const MAPS_KEY = "trip-plan-google-maps-key-v1";
const CACHE_KEY = "trip-plan-cache-v3";
const SHARE_TOKEN_PARAM = "gh";
const POLL_MS = 5000;
const AUTO_SAVE_MS = 1400;

const els = {
  title: document.querySelector("#trip-title"),
  dates: document.querySelector("#trip-dates"),
  place: document.querySelector("#trip-place"),
  tripStatus: document.querySelector("#trip-status"),
  status: document.querySelector("#sync-status"),
  countdown: document.querySelector("#countdown-days"),
  dayTabs: document.querySelector("#day-tabs"),
  timeline: document.querySelector("#timeline"),
  packingScore: document.querySelector("#packing-score"),
  budgetScore: document.querySelector("#budget-score"),
  todoSummary: document.querySelector("#todo-summary"),
  todoList: document.querySelector("#todo-list"),
  dayList: document.querySelector("#day-list"),
  spotList: document.querySelector("#spot-list"),
  noteList: document.querySelector("#note-list"),
  tripDialog: document.querySelector("#trip-dialog"),
  tripList: document.querySelector("#trip-list"),
  settingsDialog: document.querySelector("#settings-dialog"),
  token: document.querySelector("#github-token"),
  mapsKey: document.querySelector("#maps-api-key"),
  shareLink: document.querySelector("#share-link"),
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

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function getMapsKey() {
  return localStorage.getItem(MAPS_KEY) || "";
}

function getHashParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function importTokenFromLink() {
  const params = getHashParams();
  const token = params.get(SHARE_TOKEN_PARAM);
  if (!token) return false;
  localStorage.setItem(TOKEN_KEY, token);
  params.delete(SHARE_TOKEN_PARAM);
  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`;
  window.history.replaceState(null, "", nextUrl);
  return true;
}

function buildShareUrl() {
  const token = getToken();
  const url = new URL(window.location.href);
  url.hash = "";
  if (token) {
    url.hash = `${SHARE_TOKEN_PARAM}=${encodeURIComponent(token)}`;
  }
  return url.toString();
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
    flights: Array.isArray(trip.flights) ? trip.flights : [],
    todos: Array.isArray(trip.todos) ? trip.todos : [],
    pois: Array.isArray(trip.pois) ? trip.pois : [],
    days: Array.isArray(trip.days) ? trip.days : [],
    notes: Array.isArray(trip.notes) ? trip.notes : []
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
    days: data.days || [],
    notes: data.notes || []
  });
  return { schemaVersion: 2, activeTripId: trip.id, trips: [trip] };
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

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64(text) {
  const binary = atob(text.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

async function loadRemote() {
  const previousDayId = state?.trips?.length ? currentDay()?.id : "";
  try {
    const token = getToken();
    if (token) {
      const response = await request(`${API_URL}?ref=${GITHUB.branch}&t=${Date.now()}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28"
        },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`同期できません (${response.status})`);
      const payload = await response.json();
      remoteSha = payload.sha;
      state = normalize(JSON.parse(decodeBase64(payload.content)));
    } else {
      const response = await request(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`読み込めません (${response.status})`);
      state = normalize(JSON.parse(await response.text()));
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    if (previousDayId) {
      const nextDayIndex = currentTrip().days.findIndex((day) => day.id === previousDayId);
      activeDayIndex = nextDayIndex >= 0 ? nextDayIndex : 0;
    } else {
      activeDayIndex = Math.min(activeDayIndex, Math.max(0, currentTrip().days.length - 1));
    }
    render();
    setStatus(token ? "共有リンク同期中" : "共有リンク待ち", token ? "" : "soft");
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
  setStatus(getToken() ? "保存待ち" : "共有リンク待ち", "soft");
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveRemote, AUTO_SAVE_MS);
}

async function saveRemote() {
  if (!dirty || saving || !getToken()) return;
  saving = true;
  setStatus("自動保存中");
  const trip = currentTrip();
  trip.lastUpdated = new Date().toISOString();
  const body = `${JSON.stringify(state, null, 2)}\n`;
  try {
    if (!remoteSha) {
      const latest = await request(`${API_URL}?ref=${GITHUB.branch}&t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json" }
      });
      if (latest.ok) remoteSha = (await latest.json()).sha;
    }
    let response = await request(API_URL, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${getToken()}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        message: `Update trip plan ${new Date().toISOString()}`,
        content: encodeBase64(body),
        sha: remoteSha,
        branch: GITHUB.branch
      })
    }, 15000);
    if (response.status === 409) {
      const latest = await request(`${API_URL}?ref=${GITHUB.branch}&t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json" }
      });
      if (latest.ok) remoteSha = (await latest.json()).sha;
      response = await request(API_URL, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          message: `Update trip plan ${new Date().toISOString()}`,
          content: encodeBase64(body),
          sha: remoteSha,
          branch: GITHUB.branch
        })
      }, 15000);
    }
    if (!response.ok) throw new Error(`保存失敗 (${response.status})`);
    const payload = await response.json();
    remoteSha = payload.content.sha;
    dirty = false;
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    setStatus("保存済み");
  } catch (error) {
    setStatus(error.message, "warn");
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
  renderDayList();
  renderSpots();
  renderMap();
  renderTrips();
  renderView();
  renderShareLink();
}

function renderShareLink() {
  const token = getToken();
  const shareUrl = buildShareUrl();
  if (els.shareLink) {
    els.shareLink.value = token ? shareUrl : "同期キー未設定。同期できる端末でリンクをコピー。";
  }
  if (els.token) els.token.value = getToken();
  if (els.mapsKey) els.mapsKey.value = getMapsKey();
}

function renderHeader() {
  const trip = currentTrip();
  els.title.textContent = trip.title;
  els.dates.textContent = `${trip.startDate?.replaceAll("-", "・")} - ${formatShortDate(trip.endDate)}`;
  els.place.textContent = trip.timezones?.destination
    ? `${trip.destination.split("/")[0].trim()}・${trip.timezones.destination}`
    : `${trip.destination.split("/")[0].trim()}・晴れ 26°`;
  if (els.tripStatus) els.tripStatus.textContent = trip.status || "旅行準備中";
  els.countdown.textContent = `${daysUntil(trip.startDate)}日`;
  if (els.archiveToggle) els.archiveToggle.textContent = trip.archived ? "現在Tripに戻す" : "過去Tripへ移動";
}

function renderDayTabs() {
  const trip = currentTrip();
  els.dayTabs.replaceChildren();
  trip.days.forEach((day, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = index === activeDayIndex ? "is-active" : "";
    button.innerHTML = `<strong>${day.title || `Day ${index + 1}`}</strong><span>${formatTabDate(day.date)}</span>`;
    button.addEventListener("click", () => {
      activeDayIndex = index;
      renderTimeline();
      renderMap();
      renderDayTabs();
    });
    els.dayTabs.append(button);
  });
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
  day.items.forEach((item, index) => {
    const poi = poiById(item.poiId);
    const zone = item.timezone ? `<span>${item.timezone}</span>` : "";

    const flatIndex = flat.findIndex((entry) => entry.item.id === item.id);
    const current = flat[flatIndex];
    const previous = flatIndex > 0 ? flat[flatIndex - 1] : null;

    // タイムゾーンを跨いでも実際の経過時間を計算して表示。
    let elapsed = "";
    if (current?.instant != null && previous?.instant != null) {
      const label = formatDuration(current.instant - previous.instant);
      if (label) {
        const cross = previous.item.timezone && item.timezone && previous.item.timezone !== item.timezone;
        const suffix = cross ? ` <b>${previous.item.timezone}→${item.timezone}</b>` : "";
        elapsed = `<span class="elapsed${cross ? " is-cross" : ""}">前から ${label}${suffix}</span>`;
      }
    }

    // JST補助表示は現地時刻から自動換算（手入力 homeTime はフォールバック）。
    const computedHome = homeTimeLabel(current?.instant, current?.date, trip);
    const homeText = computedHome || (item.homeTime ? `JST ${item.homeTime}` : "");
    const homeTime = homeText ? `<em>${homeText}</em>` : "";

    const row = document.createElement("article");
    row.className = "timeline-row";
    row.innerHTML = `
      <div class="time-cell">
        <time>${item.time || "--:--"}</time>
        ${zone}
      </div>
      <span class="dot ${index % 2 ? "blue" : "pink"}"></span>
      <button class="event-card" type="button">
        <strong>${item.title}</strong>
        <small>${poi ? poi.name : item.memo || "メモなし"}</small>
        <div class="event-foot">${homeTime}${elapsed}</div>
      </button>
    `;
    row.querySelector(".event-card").addEventListener("click", () => editItem(day.id, item.id));
    els.timeline.append(row);
  });
}

function renderProgress() {
  const trip = currentTrip();
  const stats = todoStats(trip);
  const packing = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const budget = trip.budget ? 64 : 20;
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
          <span class="priority ${todo.priority || "medium"}">${priorityLabel(todo.priority)}</span>
          <span>${todo.due || "期限未定"}</span>
          <span>${todo.owner || "2人"}</span>
        </div>
        <strong>${todo.title}</strong>
        <p>${todo.detail || ""}</p>
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

function renderDayList() {
  const trip = currentTrip();
  els.dayList.replaceChildren();
  trip.days.forEach((day) => {
    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `<strong>${day.title} / ${formatShortDate(day.date)}</strong><p>${day.theme || "テーマ未設定"}</p><small>${day.items.length}予定</small>`;
    card.addEventListener("click", () => editDay(day.id));
    els.dayList.append(card);
  });
}

function renderSpots() {
  const trip = currentTrip();
  els.spotList.replaceChildren();
  trip.pois.forEach((poi) => {
    const card = document.createElement("article");
    card.className = "list-card spot-card";
    card.innerHTML = `<strong>${poi.name}</strong><p>${poi.area}・${poi.memo || "メモなし"}</p><a href="${mapsUrl(poi)}" target="_blank" rel="noreferrer">Mapで開く</a>`;
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

function renderNotes() {
  const trip = currentTrip();
  els.noteList.replaceChildren();
  trip.notes.forEach((note, index) => {
    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `<strong>Memo ${index + 1}</strong><p>${note || "メモなし"}</p>`;
    card.addEventListener("click", () => editNote(index));
    els.noteList.append(card);
  });
}

function renderTrips() {
  els.tripList.replaceChildren();
  state.trips.forEach((trip) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = trip.id === state.activeTripId ? "trip-choice is-active" : "trip-choice";
    button.innerHTML = `<strong>${trip.title}</strong><span>${trip.archived ? "過去Trip" : "現在Trip"}・${trip.destination}</span>`;
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

function renderView() {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
  document.querySelector(`#view-${activeView}`).classList.add("is-active");
  document.querySelectorAll(".bottom-nav button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === activeView);
  });
}

function addSpot() {
  const trip = currentTrip();
  showEditor({
    title: "スポットを追加",
    fields: [
      { name: "name", label: "場所名", required: true, placeholder: "例: Sydney Opera House" },
      { name: "area", label: "エリア・住所", value: trip.destination },
      { name: "mapsUrl", label: "Google Maps URL" },
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
      { name: "area", label: "エリア・住所", value: poi.area },
      { name: "mapsUrl", label: "Google Maps URL", value: poi.mapsUrl },
      { name: "memo", label: "メモ", type: "textarea", value: poi.memo, rows: 3 }
    ],
    onSave: () => {
      poi.name = formValue("name");
      poi.area = formValue("area");
      poi.mapsUrl = formValue("mapsUrl");
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
  showEditor({
    title: "予定を編集",
    fields: [
      { name: "time", label: "現地時間", type: "time", value: item.time, required: true },
      { name: "timezone", label: "タイムゾーン (例: JST / PHT / AEST)", value: item.timezone },
      { name: "homeTime", label: "JST補助メモ（空なら自動換算）", type: "time", value: item.homeTime },
      { name: "title", label: "予定名", value: item.title, required: true },
      { name: "poiId", label: "場所", type: "select", value: item.poiId, options: poiOptions },
      { name: "memo", label: "メモ", type: "textarea", value: item.memo, rows: 4 }
    ],
    onSave: () => {
      item.time = formValue("time");
      item.timezone = formValue("timezone");
      item.homeTime = formValue("homeTime");
      item.title = formValue("title");
      item.poiId = formValue("poiId");
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

function addNote() {
  showEditor({
    title: "メモを追加",
    fields: [
      { name: "note", label: "メモ", type: "textarea", rows: 5, required: true }
    ],
    onSave: () => {
      currentTrip().notes.push(formValue("note"));
      render();
      markDirty();
    }
  });
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

function editNote(index) {
  const trip = currentTrip();
  showEditor({
    title: "メモを編集",
    fields: [
      { name: "note", label: "メモ", type: "textarea", value: trip.notes[index], rows: 5, required: true }
    ],
    onSave: () => {
      trip.notes[index] = formValue("note");
      render();
      markDirty();
    },
    onDelete: () => {
      trip.notes.splice(index, 1);
      render();
      markDirty();
    }
  });
}

function newTrip() {
  const id = uid("trip");
  state.trips.unshift(normalizeTrip({ id, title: "新しい旅", destination: "行き先未定", todos: [], notes: ["まず行きたい場所を3つ入れる。"] }));
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
    if (!getToken()) {
      setStatus("同期キー未設定", "warn");
      return;
    }
    await copyText(buildShareUrl());
    setStatus("共有リンクをコピー済み");
  });
  document.querySelector("#save-token").addEventListener("click", () => {
    localStorage.setItem(TOKEN_KEY, els.token.value.trim());
    els.settingsDialog.close();
    renderShareLink();
    setStatus("共有リンク同期中");
    markDirty();
  });
  document.querySelector("#clear-token").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    els.token.value = "";
    renderShareLink();
    setStatus("共有リンク待ち", "soft");
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
  document.querySelector("#add-day").addEventListener("click", addDay);
  document.querySelector("#add-note")?.addEventListener("click", addNote);
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

importTokenFromLink();
bind();
loadRemote();
setInterval(() => {
  if (!dirty && !saving) loadRemote();
}, POLL_MS);
