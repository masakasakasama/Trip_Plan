const GITHUB = {
  owner: "masakasakasama",
  repo: "Trip_Plan",
  branch: "main",
  path: "trip-plan.json"
};

const API_URL = `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${GITHUB.path}`;
const DATA_URL = "trip-plan.json";
const TOKEN_KEY = "trip-plan-github-token-v1";
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
  shareLink: document.querySelector("#share-link"),
  archiveToggle: document.querySelector("#archive-toggle")
};

let state = null;
let remoteSha = "";
let activeDayIndex = 0;
let activeView = "home";
let dirty = false;
let saving = false;
let autoSaveTimer = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
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
  els.status.textContent = "";
  els.status.dataset.tone = tone;
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function valueOr(value, fallback = "") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
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

function daysUntil(value) {
  if (!value) return "--";
  const start = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((start - today) / 86400000));
}

function poiById(id) {
  return currentTrip().pois.find((poi) => poi.id === id);
}

function mapsUrl(poi) {
  if (poi.mapsUrl) return poi.mapsUrl;
  const q = encodeURIComponent(`${poi.name} ${poi.area} ${currentTrip().destination}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
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
    activeDayIndex = 0;
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
    button.textContent = day.title || `Day ${index + 1}`;
    button.addEventListener("click", () => {
      activeDayIndex = index;
      renderTimeline();
      renderDayTabs();
    });
    els.dayTabs.append(button);
  });
}

function renderTimeline() {
  const day = currentDay();
  els.timeline.replaceChildren();
  if (!day) {
    els.timeline.innerHTML = `<p class="empty">日程を追加すると、ここにタイムラインが出ます。</p>`;
    return;
  }
  day.items.forEach((item, index) => {
    const poi = poiById(item.poiId);
    const zone = item.timezone ? `<span>${item.timezone}</span>` : "";
    const homeTime = item.homeTime ? `<em>JST ${item.homeTime}</em>` : "";
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
        ${homeTime}
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

function renderNotes() {
  const trip = currentTrip();
  els.noteList.replaceChildren();
  trip.notes.forEach((note, index) => {
    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `<strong>Memo ${index + 1}</strong><p>${note || "空のメモ"}</p>`;
    card.addEventListener("click", () => {
      const next = prompt("メモ", note);
      if (next === null) return;
      trip.notes[index] = next;
      render();
      markDirty();
    });
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
  const name = prompt("場所の名前");
  if (!name) return;
  const trip = currentTrip();
  trip.pois.unshift({
    id: uid("poi"),
    name,
    area: prompt("エリア・住所", trip.destination) || "",
    category: "spot",
    priority: "medium",
    mapsUrl: prompt("Google Maps URL", "") || "",
    memo: prompt("メモ", "") || ""
  });
  render();
  markDirty();
}

function editPoi(id) {
  const poi = currentTrip().pois.find((item) => item.id === id);
  if (!poi) return;
  poi.name = prompt("場所の名前", poi.name) || poi.name;
  poi.area = prompt("エリア", poi.area) ?? poi.area;
  poi.memo = prompt("メモ", poi.memo) ?? poi.memo;
  render();
  markDirty();
}

function editDay(id) {
  const day = currentTrip().days.find((item) => item.id === id);
  if (!day) return;
  day.title = prompt("タイトル", day.title) || day.title;
  day.theme = prompt("テーマ", day.theme) ?? day.theme;
  render();
  markDirty();
}

function editItem(dayId, itemId) {
  const day = currentTrip().days.find((item) => item.id === dayId);
  const item = day?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.time = prompt("時間", item.time) || item.time;
  item.title = prompt("予定", item.title) || item.title;
  item.memo = prompt("メモ", item.memo) ?? item.memo;
  render();
  markDirty();
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
  currentTrip().notes.push("新しいメモ");
  render();
  markDirty();
}

function addTodo() {
  const title = prompt("やること");
  if (!title) return;
  currentTrip().todos.push({
    id: uid("todo"),
    title,
    detail: prompt("メモ", "") || "",
    due: prompt("期限", "出発1か月前") || "",
    priority: "medium",
    owner: "2人",
    status: "open"
  });
  render();
  markDirty();
}

function editTodo(id) {
  const todo = currentTrip().todos.find((item) => item.id === id);
  if (!todo) return;
  todo.title = prompt("やること", todo.title) || todo.title;
  todo.detail = prompt("メモ", todo.detail) ?? todo.detail;
  todo.due = prompt("期限", todo.due) ?? todo.due;
  todo.owner = prompt("担当", todo.owner) ?? todo.owner;
  render();
  markDirty();
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
  document.querySelector("#open-map-search").addEventListener("click", () => {
    const trip = currentTrip();
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.destination)}`, "_blank", "noreferrer");
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
