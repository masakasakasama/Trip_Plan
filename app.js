const GITHUB = {
  owner: "masakasakasama",
  repo: "Trip_Plan",
  branch: "main",
  path: "trip-plan.json"
};

const API_URL = `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${GITHUB.path}`;
const TOKEN_KEY = "trip-plan-github-token-v1";
const CACHE_KEY = "trip-plan-last-good-cache-v2";
const POLL_MS = 5000;
const AUTO_SAVE_MS = 1500;
const SAVE_RETRY_MS = 10000;

const els = {
  title: document.querySelector("#trip-title"),
  mood: document.querySelector("#trip-mood"),
  facts: document.querySelector("#trip-facts"),
  status: document.querySelector("#sync-status"),
  saveState: document.querySelector("#save-state"),
  lastUpdated: document.querySelector("#last-updated"),
  syncHelp: document.querySelector("#sync-help"),
  qualityScore: document.querySelector("#quality-score"),
  qualityList: document.querySelector("#quality-list"),
  tripList: document.querySelector("#trip-list"),
  tripForm: document.querySelector("#trip-form"),
  poiForm: document.querySelector("#poi-form"),
  poiList: document.querySelector("#poi-list"),
  schedule: document.querySelector("#schedule"),
  notes: document.querySelector("#notes"),
  saveRemote: document.querySelector("#save-remote"),
  refreshRemote: document.querySelector("#refresh-remote"),
  syncSettings: document.querySelector("#sync-settings"),
  exportJson: document.querySelector("#export-json"),
  newTrip: document.querySelector("#new-trip"),
  archiveToggle: document.querySelector("#archive-toggle"),
  addDay: document.querySelector("#add-day"),
  addNote: document.querySelector("#add-note"),
  openMapSearch: document.querySelector("#open-map-search"),
  settingsDialog: document.querySelector("#settings-dialog"),
  githubToken: document.querySelector("#github-token"),
  saveToken: document.querySelector("#save-token"),
  clearToken: document.querySelector("#clear-token"),
  jsonDialog: document.querySelector("#json-dialog"),
  jsonOutput: document.querySelector("#json-output")
};

let state = null;
let remoteSha = "";
let lastRemoteJson = "";
let isDirty = false;
let isSaving = false;
let pendingSaveRequested = false;
let autoSaveTimer = null;

function token() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function valueOr(value, fallback = "") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function clear(node) {
  node.replaceChildren();
}

function setSync(message, tone = "normal") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function setSaveState(message) {
  els.saveState.textContent = message;
}

function money(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function dateLabel(value) {
  if (!value) return "未定";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(date);
}

function timeLabel(value) {
  if (!value) return "未取得";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function encodeBase64Unicode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64Unicode(text) {
  const binary = atob(text.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function mapsUrl(poi) {
  if (poi.mapsUrl) return poi.mapsUrl;
  const trip = currentTrip();
  const query = encodeURIComponent([poi.name, poi.area, trip.destination].filter(Boolean).join(" "));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function normalizeTrip(trip) {
  return {
    id: trip.id || uid("trip"),
    title: valueOr(trip.title, "新しいTrip"),
    destination: valueOr(trip.destination, "行き先未定"),
    startDate: valueOr(trip.startDate),
    endDate: valueOr(trip.endDate),
    travelers: Array.isArray(trip.travelers) ? trip.travelers : ["夫", "Rebecca"],
    mood: valueOr(trip.mood),
    budget: Number(trip.budget) || 0,
    status: valueOr(trip.status, "ラフ設計"),
    lastUpdated: valueOr(trip.lastUpdated, new Date().toISOString()),
    archived: Boolean(trip.archived),
    source: valueOr(trip.source),
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

  const migrated = normalizeTrip({
    id: "legacy-trip",
    ...(data.trip || {}),
    pois: data.pois || [],
    days: data.days || [],
    notes: data.notes || []
  });
  return { schemaVersion: 2, activeTripId: migrated.id, trips: [migrated] };
}

function currentTrip() {
  return state.trips.find((trip) => trip.id === state.activeTripId) || state.trips[0];
}

function visibleTrips() {
  return [...state.trips].sort((a, b) => Number(a.archived) - Number(b.archived) || b.startDate.localeCompare(a.startDate));
}

function quality(trip) {
  const checks = [
    ["日付", Boolean(trip.startDate && trip.endDate), "開始日と終了日"],
    ["行きたい場所", trip.pois.length >= 3, "候補3件以上"],
    ["日程", trip.days.some((day) => day.items.length), "予定入りの日程"],
    ["休憩余白", trip.notes.some((note) => /休憩|無理|疲れ|余裕/.test(note)), "疲れない設計メモ"],
    ["予算", trip.budget > 0, "予算の目安"]
  ];
  const done = checks.filter((item) => item[1]).length;
  return { score: Math.round((done / checks.length) * 100), checks };
}

async function fetchRemote() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetchWithTimeout(`${API_URL}?ref=${GITHUB.branch}&t=${Date.now()}`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`GitHub読み込み失敗: ${response.status}`);
  const payload = await response.json();
  const json = decodeBase64Unicode(payload.content);
  return { data: normalize(JSON.parse(json)), sha: payload.sha, json };
}

async function loadRemote({ force = false } = {}) {
  if (isDirty && !force) {
    setSync("自動保存待ちの変更があります", "warn");
    return;
  }
  setSync("GitHubから読み込み中");
  try {
    const remote = await fetchRemote();
    state = remote.data;
    remoteSha = remote.sha;
    lastRemoteJson = remote.json;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: state, sha: remoteSha, fetchedAt: new Date().toISOString() }));
    isDirty = false;
    renderAll();
    setSaveState(token() ? "自動同期ON" : "自動保存OFF");
    setSync(token() ? "自動同期ON" : "token未設定");
    els.lastUpdated.textContent = `前回更新 ${timeLabel(currentTrip().lastUpdated)}`;
  } catch (error) {
    const cache = localStorage.getItem(CACHE_KEY);
    if (!cache) {
      setSync(error.message, "error");
      throw error;
    }
    const cached = JSON.parse(cache);
    state = normalize(cached.data);
    remoteSha = cached.sha || "";
    renderAll();
    setSync("通信失敗: 最後の成功データを表示", "warn");
    setSaveState("キャッシュ表示");
    els.lastUpdated.textContent = `前回取得 ${timeLabel(cached.fetchedAt)}`;
  }
}

function scheduleAutoSave() {
  window.clearTimeout(autoSaveTimer);
  if (!token()) {
    setSaveState("自動保存OFF");
    setSync("token設定後に自動保存します", "warn");
    return;
  }
  setSaveState("自動同期待ち");
  autoSaveTimer = window.setTimeout(() => saveRemote({ automatic: true }), AUTO_SAVE_MS);
}

async function saveRemote({ automatic = false } = {}) {
  window.clearTimeout(autoSaveTimer);
  if (isSaving) {
    pendingSaveRequested = true;
    return;
  }
  if (!token()) {
    els.settingsDialog.showModal();
    setSync("自動保存にはGitHub tokenが必要です", "warn");
    return;
  }
  if (!state) return;

  isSaving = true;
  const trip = currentTrip();
  trip.lastUpdated = new Date().toISOString();
  setSaveState(automatic ? "自動同期中" : "同期中");
  setSync(automatic ? "自動同期中" : "今すぐ同期中");

  const nextJson = `${JSON.stringify(state, null, 2)}\n`;
  try {
    let response = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetchWithTimeout(API_URL, {
        method: "PUT",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token()}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          message: `Update trip plan ${new Date().toISOString()}`,
          content: encodeBase64Unicode(nextJson),
          sha: remoteSha,
          branch: GITHUB.branch
        })
      }, 12000);
      if (response.status !== 409) break;
      const latest = await fetchRemote();
      remoteSha = latest.sha;
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`保存失敗: ${response.status} ${detail.slice(0, 120)}`);
    }
    const payload = await response.json();
    remoteSha = payload.content.sha;
    lastRemoteJson = nextJson;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data: state, sha: remoteSha, fetchedAt: new Date().toISOString() }));
    isDirty = false;
    renderAll();
    setSaveState("同期済み");
    setSync("自動同期済み");
    els.lastUpdated.textContent = `前回更新 ${timeLabel(currentTrip().lastUpdated)}`;
  } catch (error) {
    setSaveState("同期失敗");
    setSync(error.message, "error");
    if (token() && !/401|403/.test(error.message)) {
      autoSaveTimer = window.setTimeout(() => saveRemote({ automatic: true }), SAVE_RETRY_MS);
    }
  } finally {
    isSaving = false;
    if (pendingSaveRequested) {
      pendingSaveRequested = false;
      scheduleAutoSave();
    }
  }
}

function markDirty() {
  isDirty = true;
  setSaveState("未同期");
  setSync("変更を検知: 自動同期待ち", "warn");
  scheduleAutoSave();
}

function renderHero() {
  const trip = currentTrip();
  els.title.textContent = trip.title;
  els.mood.textContent = valueOr(trip.mood, "旅の雰囲気を入力");
  clear(els.facts);
  [
    ["行き先", trip.destination],
    ["日程", `${dateLabel(trip.startDate)} - ${dateLabel(trip.endDate)}`],
    ["予算", money(trip.budget)],
    ["旅行者", trip.travelers.join("・")]
  ].forEach(([label, value]) => {
    const fact = document.createElement("div");
    fact.className = "fact";
    fact.innerHTML = `<span>${label}</span><strong>${valueOr(value, "未定")}</strong>`;
    els.facts.append(fact);
  });
}

function renderQuality() {
  const result = quality(currentTrip());
  els.qualityScore.textContent = `${result.score}%`;
  clear(els.qualityList);
  result.checks.forEach(([label, ok, hint]) => {
    const item = document.createElement("div");
    item.className = `quality-item${ok ? " is-ok" : ""}`;
    item.innerHTML = `<strong>${ok ? "OK" : "TODO"}</strong><span>${label}</span><small>${hint}</small>`;
    els.qualityList.append(item);
  });
}

function renderTripList() {
  clear(els.tripList);
  visibleTrips().forEach((trip) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `trip-card${trip.id === state.activeTripId ? " is-active" : ""}${trip.archived ? " is-archived" : ""}`;
    item.innerHTML = `
      <span>${trip.archived ? "Past" : "Active"}</span>
      <strong>${trip.title}</strong>
      <small>${trip.destination} / ${dateLabel(trip.startDate)}</small>
    `;
    item.addEventListener("click", () => {
      state.activeTripId = trip.id;
      renderAll();
      markDirty();
    });
    els.tripList.append(item);
  });
}

function syncTripForm() {
  const trip = currentTrip();
  Object.entries(trip).forEach(([key, value]) => {
    const field = els.tripForm.elements[key];
    if (field) field.value = Array.isArray(value) ? value.join(", ") : valueOr(value);
  });
  els.archiveToggle.textContent = trip.archived ? "現在Tripに戻す" : "過去Tripへ移動";
}

function categoryLabel(value) {
  return {
    cafe: "カフェ",
    food: "ごはん",
    spot: "観光",
    nature: "自然",
    shop: "買い物",
    hotel: "ホテル",
    transport: "移動"
  }[value] || "候補";
}

function priorityLabel(value) {
  return {
    high: "絶対行きたい",
    medium: "できれば",
    low: "余裕があれば"
  }[value] || "候補";
}

function poiById(id) {
  return currentTrip().pois.find((poi) => poi.id === id);
}

function renderPois() {
  const trip = currentTrip();
  clear(els.poiList);
  if (!trip.pois.length) {
    els.poiList.innerHTML = `<p class="empty">Google Mapsで見つけた場所をここに貯めます。</p>`;
    return;
  }
  trip.pois.forEach((poi) => {
    const card = document.createElement("article");
    card.className = "poi";
    card.innerHTML = `
      <div class="poi__top">
        <div>
          <h3>${poi.name}</h3>
          <p class="meta">${valueOr(poi.area, "エリア未定")} / ${valueOr(poi.memo, "メモなし")}</p>
        </div>
        <div class="mini-actions">
          <a href="${mapsUrl(poi)}" target="_blank" rel="noreferrer">Map</a>
        </div>
      </div>
      <div class="chip-row">
        <span class="chip is-mint">${categoryLabel(poi.category)}</span>
        <span class="chip">${priorityLabel(poi.priority)}</span>
      </div>
    `;
    card.querySelector(".mini-actions").append(
      button("編集", () => editPoi(poi.id)),
      button("削除", () => removePoi(poi.id))
    );
    els.poiList.append(card);
  });
}

function renderSchedule() {
  const trip = currentTrip();
  clear(els.schedule);
  if (!trip.days.length) {
    els.schedule.innerHTML = `<p class="empty">まずは日を追加して、移動・食事・休憩を置きます。</p>`;
    return;
  }
  trip.days.forEach((day) => {
    const wrap = document.createElement("article");
    wrap.className = "day";
    const items = day.items.map((item) => {
      const poi = poiById(item.poiId);
      return `
        <div class="item">
          <div>
            <h3><time>${valueOr(item.time, "未定")}</time> ${valueOr(item.title, "予定")}</h3>
            <p class="meta">${poi ? poi.name : "POI未設定"} / ${valueOr(item.memo, "メモなし")}</p>
          </div>
          <div class="mini-actions" data-item="${item.id}"></div>
        </div>
      `;
    }).join("");
    wrap.innerHTML = `
      <div class="day__top">
        <div>
          <h3>${day.title} / ${dateLabel(day.date)}</h3>
          <p class="meta">${valueOr(day.theme, "テーマ未設定")}</p>
        </div>
        <div class="mini-actions day-actions"></div>
      </div>
      <div class="day__items">${items}</div>
      <form class="add-item">
        <input name="time" type="time" value="10:00" aria-label="時間">
        <input name="title" placeholder="予定を追加" aria-label="予定">
        <button type="submit">追加</button>
      </form>
    `;
    wrap.querySelector(".day-actions").append(button("編集", () => editDay(day.id)), button("削除", () => removeDay(day.id)));
    day.items.forEach((item) => {
      const actions = wrap.querySelector(`[data-item="${item.id}"]`);
      const poi = poiById(item.poiId);
      if (poi) {
        const link = document.createElement("a");
        link.href = mapsUrl(poi);
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Map";
        actions.append(link);
      }
      actions.append(button("編集", () => editItem(day.id, item.id)), button("削除", () => removeItem(day.id, item.id)));
    });
    wrap.querySelector(".add-item").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      addItem(day.id, data.get("time"), data.get("title"));
      event.currentTarget.reset();
    });
    els.schedule.append(wrap);
  });
}

function renderNotes() {
  const trip = currentTrip();
  clear(els.notes);
  trip.notes.forEach((note, index) => {
    const row = document.createElement("div");
    row.className = "note-row";
    const input = document.createElement("input");
    input.value = note;
    input.addEventListener("input", () => {
      trip.notes[index] = input.value;
      markDirty();
    });
    row.append(input, button("削除", () => {
      trip.notes.splice(index, 1);
      renderNotes();
      markDirty();
    }));
    els.notes.append(row);
  });
}

function renderAll() {
  renderHero();
  renderQuality();
  renderTripList();
  syncTripForm();
  renderPois();
  renderSchedule();
  renderNotes();
  els.githubToken.value = token();
  els.syncHelp.textContent = token()
    ? "入力後すぐに自動保存します。他端末の更新も数秒ごとに自動反映します。"
    : "全端末で同じデータを読みます。編集内容を自動保存するにはGitHub tokenを設定してください。";
}

function addPoi(values) {
  const trip = currentTrip();
  trip.pois.unshift({
    id: uid("poi"),
    name: valueOr(values.get("name"), "新しい候補"),
    area: valueOr(values.get("area"), "TBD"),
    category: valueOr(values.get("category"), "spot"),
    priority: valueOr(values.get("priority"), "medium"),
    mapsUrl: valueOr(values.get("mapsUrl")),
    memo: valueOr(values.get("memo"))
  });
  renderAll();
  markDirty();
}

function editPoi(id) {
  const poi = poiById(id);
  if (!poi) return;
  const name = prompt("場所の名前", poi.name);
  if (name === null) return;
  poi.name = name.trim() || poi.name;
  poi.area = prompt("エリア・住所", poi.area) ?? poi.area;
  poi.mapsUrl = prompt("Google Maps URL", poi.mapsUrl) ?? poi.mapsUrl;
  poi.memo = prompt("メモ", poi.memo) ?? poi.memo;
  renderAll();
  markDirty();
}

function removePoi(id) {
  const trip = currentTrip();
  trip.pois = trip.pois.filter((poi) => poi.id !== id);
  trip.days.forEach((day) => day.items.forEach((item) => {
    if (item.poiId === id) item.poiId = "";
  }));
  renderAll();
  markDirty();
}

function addItem(dayId, time, title) {
  const trip = currentTrip();
  const day = trip.days.find((item) => item.id === dayId);
  if (!day) return;
  day.items.push({
    id: uid("item"),
    time: valueOr(time, "10:00"),
    title: valueOr(title, "新しい予定"),
    poiId: trip.pois[0]?.id || "",
    memo: ""
  });
  renderAll();
  markDirty();
}

function editItem(dayId, itemId) {
  const day = currentTrip().days.find((entry) => entry.id === dayId);
  const item = day?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.time = prompt("時間", item.time) ?? item.time;
  item.title = prompt("予定", item.title) ?? item.title;
  const poiName = prompt("紐づけるPOI名", poiById(item.poiId)?.name || "");
  const poi = currentTrip().pois.find((entry) => entry.name === poiName);
  item.poiId = poi ? poi.id : item.poiId;
  item.memo = prompt("メモ", item.memo) ?? item.memo;
  renderAll();
  markDirty();
}

function removeItem(dayId, itemId) {
  const day = currentTrip().days.find((entry) => entry.id === dayId);
  if (!day) return;
  day.items = day.items.filter((entry) => entry.id !== itemId);
  renderAll();
  markDirty();
}

function editDay(dayId) {
  const day = currentTrip().days.find((entry) => entry.id === dayId);
  if (!day) return;
  day.title = prompt("タイトル", day.title) ?? day.title;
  day.date = prompt("日付", day.date) ?? day.date;
  day.theme = prompt("テーマ", day.theme) ?? day.theme;
  renderAll();
  markDirty();
}

function removeDay(dayId) {
  const trip = currentTrip();
  trip.days = trip.days.filter((entry) => entry.id !== dayId);
  renderAll();
  markDirty();
}

function newTrip() {
  const id = uid("trip");
  state.trips.unshift(normalizeTrip({
    id,
    title: "新しいTrip",
    destination: "行き先未定",
    status: "ラフ設計",
    archived: false,
    notes: ["まず行きたい場所を3つ入れる。"]
  }));
  state.activeTripId = id;
  renderAll();
  markDirty();
}

function bindEvents() {
  els.tripForm.addEventListener("input", () => {
    const trip = currentTrip();
    const data = new FormData(els.tripForm);
    ["title", "destination", "startDate", "endDate", "status", "mood"].forEach((key) => {
      trip[key] = valueOr(data.get(key));
    });
    trip.budget = Number(data.get("budget")) || 0;
    renderHero();
    renderQuality();
    renderTripList();
    markDirty();
  });

  els.poiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addPoi(new FormData(els.poiForm));
    els.poiForm.reset();
  });

  els.saveRemote.addEventListener("click", () => saveRemote({ automatic: false }));
  els.refreshRemote.addEventListener("click", () => loadRemote({ force: true }));
  els.syncSettings.addEventListener("click", () => els.settingsDialog.showModal());
  els.saveToken.addEventListener("click", () => {
    localStorage.setItem(TOKEN_KEY, els.githubToken.value.trim());
    els.settingsDialog.close();
    renderAll();
    setSync("自動同期ON");
    if (isDirty) scheduleAutoSave();
  });
  els.clearToken.addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    els.githubToken.value = "";
    renderAll();
    setSync("tokenを削除しました", "warn");
  });
  els.exportJson.addEventListener("click", () => {
    els.jsonOutput.value = `${JSON.stringify(state, null, 2)}\n`;
    els.jsonDialog.showModal();
  });
  els.newTrip.addEventListener("click", newTrip);
  els.archiveToggle.addEventListener("click", () => {
    const trip = currentTrip();
    trip.archived = !trip.archived;
    renderAll();
    markDirty();
  });
  els.addDay.addEventListener("click", () => {
    const trip = currentTrip();
    trip.days.push({
      id: uid("day"),
      date: trip.startDate,
      title: `Day ${trip.days.length + 1}`,
      theme: "新しい日",
      items: []
    });
    renderAll();
    markDirty();
  });
  els.addNote.addEventListener("click", () => {
    currentTrip().notes.push("");
    renderNotes();
    markDirty();
  });
  els.openMapSearch.addEventListener("click", () => {
    const trip = currentTrip();
    const query = encodeURIComponent(`${trip.destination || ""} ${trip.mood || ""}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank", "noreferrer");
  });
}

async function pollRemote() {
  if (isDirty || isSaving) return;
  try {
    const remote = await fetchRemote();
    if (remote.sha !== remoteSha && remote.json !== lastRemoteJson) {
      state = remote.data;
      remoteSha = remote.sha;
      lastRemoteJson = remote.json;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: state, sha: remoteSha, fetchedAt: new Date().toISOString() }));
      renderAll();
      setSaveState("同期済み");
      setSync("他端末の更新を反映しました");
      els.lastUpdated.textContent = `前回更新 ${timeLabel(currentTrip().lastUpdated)}`;
    }
  } catch {
    setSync("最新チェック失敗: 表示中データを維持", "warn");
  }
}

bindEvents();
loadRemote().catch(() => {});
setInterval(pollRemote, POLL_MS);
