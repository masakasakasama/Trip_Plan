const GITHUB = {
  owner: "masakasakasama",
  repo: "Trip_Plan",
  branch: "main",
  path: "trip-plan.json"
};

const API_URL = `https://api.github.com/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${GITHUB.path}`;
const RAW_URL = `https://raw.githubusercontent.com/${GITHUB.owner}/${GITHUB.repo}/${GITHUB.branch}/${GITHUB.path}`;
const TOKEN_KEY = "trip-plan-github-token-v1";
const CACHE_KEY = "trip-plan-last-good-cache-v1";
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
  tripForm: document.querySelector("#trip-form"),
  poiForm: document.querySelector("#poi-form"),
  poiList: document.querySelector("#poi-list"),
  schedule: document.querySelector("#schedule"),
  notes: document.querySelector("#notes"),
  saveRemote: document.querySelector("#save-remote"),
  refreshRemote: document.querySelector("#refresh-remote"),
  syncSettings: document.querySelector("#sync-settings"),
  exportJson: document.querySelector("#export-json"),
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
let isDirty = false;
let lastRemoteJson = "";
let autoSaveTimer = null;
let isSaving = false;
let pendingSaveRequested = false;

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function valueOr(value, fallback = "") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function token() {
  return localStorage.getItem(TOKEN_KEY) || "";
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

function mapsUrl(poi) {
  if (poi.mapsUrl) return poi.mapsUrl;
  const query = encodeURIComponent([poi.name, poi.area, state.trip.destination].filter(Boolean).join(" "));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function clear(node) {
  node.replaceChildren();
}

function button(label, onClick, className = "") {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.className = className;
  node.addEventListener("click", onClick);
  return node;
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

function normalize(data) {
  return {
    trip: {
      title: "ふたりの旅プラン",
      destination: "行き先未定",
      startDate: "",
      endDate: "",
      travelers: ["夫", "妻"],
      mood: "",
      budget: 0,
      status: "ラフ作成中",
      lastUpdated: new Date().toISOString(),
      ...(data.trip || {})
    },
    pois: Array.isArray(data.pois) ? data.pois : [],
    days: Array.isArray(data.days) ? data.days : [],
    notes: Array.isArray(data.notes) ? data.notes : []
  };
}

async function fetchRemote() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(`${API_URL}?ref=${GITHUB.branch}&t=${Date.now()}`, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`GitHub読み込み失敗: ${response.status}`);
  const payload = await response.json();
  const json = decodeBase64Unicode(payload.content);
  return { data: normalize(JSON.parse(json)), sha: payload.sha, json };
}

async function loadRemote({ force = false } = {}) {
  if (isDirty && !force) {
    setSync("未同期の変更があります", "warn");
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
    setSaveState("同期済み");
    setSync(token() ? "自動同期ON" : "保存設定が必要");
    els.lastUpdated.textContent = `前回更新 ${timeLabel(state.trip.lastUpdated)}`;
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
    setSaveState("保存設定が必要");
    setSync("自動保存にはGitHub tokenが必要です", "warn");
    return;
  }
  setSaveState("自動同期待ち");
  autoSaveTimer = window.setTimeout(() => {
    saveRemote({ automatic: true });
  }, AUTO_SAVE_MS);
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
  setSaveState(automatic ? "自動同期中" : "同期中");
  setSync(automatic ? "自動同期中" : "今すぐ同期中");
  state.trip.lastUpdated = new Date().toISOString();
  const nextJson = `${JSON.stringify(state, null, 2)}\n`;
  try {
    let response = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(API_URL, {
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
      });
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
    els.lastUpdated.textContent = `前回更新 ${timeLabel(state.trip.lastUpdated)}`;
  } catch (error) {
    setSaveState("同期失敗");
    setSync(error.message, "error");
    if (token() && !/401|403/.test(error.message)) {
      window.clearTimeout(autoSaveTimer);
      autoSaveTimer = window.setTimeout(() => {
        saveRemote({ automatic: true });
      }, SAVE_RETRY_MS);
    }
  } finally {
    isSaving = false;
    if (pendingSaveRequested) {
      pendingSaveRequested = false;
      scheduleAutoSave();
    }
  }
}

function renderHero() {
  const trip = state.trip;
  els.title.textContent = valueOr(trip.title, "ふたりの旅プラン");
  els.mood.textContent = valueOr(trip.mood, "旅の雰囲気を入力");
  clear(els.facts);

  [
    ["行き先", trip.destination],
    ["日程", `${dateLabel(trip.startDate)} - ${dateLabel(trip.endDate)}`],
    ["予算", money(trip.budget)],
    ["旅行者", (trip.travelers || []).join("・")]
  ].forEach(([label, value]) => {
    const fact = document.createElement("div");
    fact.className = "fact";
    const small = document.createElement("span");
    const strong = document.createElement("strong");
    small.textContent = label;
    strong.textContent = valueOr(value, "未定");
    fact.append(small, strong);
    els.facts.append(fact);
  });
}

function syncTripForm() {
  Object.entries(state.trip).forEach(([key, value]) => {
    const field = els.tripForm.elements[key];
    if (field) field.value = Array.isArray(value) ? value.join(", ") : valueOr(value);
  });
}

function renderPois() {
  clear(els.poiList);
  if (!state.pois.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "候補なし";
    els.poiList.append(empty);
    return;
  }

  state.pois.forEach((poi) => {
    const card = document.createElement("article");
    card.className = "poi";
    const top = document.createElement("div");
    top.className = "poi__top";

    const body = document.createElement("div");
    const title = document.createElement("h3");
    const meta = document.createElement("p");
    title.textContent = poi.name;
    meta.className = "meta";
    meta.textContent = `${valueOr(poi.area, "エリア未定")} / ${valueOr(poi.memo, "メモなし")}`;
    body.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "mini-actions";
    const map = document.createElement("a");
    map.href = mapsUrl(poi);
    map.target = "_blank";
    map.rel = "noreferrer";
    map.textContent = "Map";
    actions.append(map, button("編集", () => editPoi(poi.id)), button("削除", () => removePoi(poi.id)));
    top.append(body, actions);

    const chips = document.createElement("div");
    chips.className = "chip-row";
    [categoryLabel(poi.category), priorityLabel(poi.priority)].forEach((text, index) => {
      const chip = document.createElement("span");
      chip.className = index === 0 ? "chip is-mint" : "chip";
      chip.textContent = text;
      chips.append(chip);
    });
    card.append(top, chips);
    els.poiList.append(card);
  });
}

function categoryLabel(value) {
  return {
    cafe: "カフェ",
    food: "ごはん",
    spot: "観光",
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
  return state.pois.find((poi) => poi.id === id);
}

function renderSchedule() {
  clear(els.schedule);
  state.days.forEach((day) => {
    const wrap = document.createElement("article");
    wrap.className = "day";

    const top = document.createElement("div");
    top.className = "day__top";
    const heading = document.createElement("div");
    const h3 = document.createElement("h3");
    const meta = document.createElement("p");
    h3.textContent = `${day.title} / ${dateLabel(day.date)}`;
    meta.className = "meta";
    meta.textContent = day.theme;
    heading.append(h3, meta);

    const topActions = document.createElement("div");
    topActions.className = "mini-actions";
    topActions.append(button("編集", () => editDay(day.id)), button("削除", () => removeDay(day.id)));
    top.append(heading, topActions);

    const items = document.createElement("div");
    items.className = "day__items";
    day.items.forEach((item) => items.append(renderItem(day.id, item)));

    const add = document.createElement("form");
    add.className = "add-item";
    add.innerHTML = `
      <input name="time" type="time" value="10:00" aria-label="時間">
      <input name="title" placeholder="予定を追加" aria-label="予定">
      <button type="submit">追加</button>
    `;
    add.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(add);
      addItem(day.id, data.get("time"), data.get("title"));
      add.reset();
    });

    wrap.append(top, items, add);
    els.schedule.append(wrap);
  });
}

function renderItem(dayId, item) {
  const row = document.createElement("div");
  row.className = "item";
  const poi = poiById(item.poiId);

  const body = document.createElement("div");
  const title = document.createElement("h3");
  const meta = document.createElement("p");
  const time = document.createElement("time");
  time.textContent = valueOr(item.time, "未定");
  title.append(time, document.createTextNode(` ${valueOr(item.title, "予定")}`));
  meta.className = "meta";
  meta.textContent = `${poi ? poi.name : "POI未設定"} / ${valueOr(item.memo, "メモなし")}`;
  body.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "mini-actions";
  if (poi) {
    const map = document.createElement("a");
    map.href = mapsUrl(poi);
    map.target = "_blank";
    map.rel = "noreferrer";
    map.textContent = "Map";
    actions.append(map);
  }
  actions.append(button("編集", () => editItem(dayId, item.id)), button("削除", () => removeItem(dayId, item.id)));
  row.append(body, actions);
  return row;
}

function renderNotes() {
  clear(els.notes);
  state.notes.forEach((note, index) => {
    const row = document.createElement("div");
    row.className = "note-row";
    const input = document.createElement("input");
    input.value = note;
    input.addEventListener("input", () => {
      state.notes[index] = input.value;
      markDirty();
    });
    row.append(input, button("削除", () => {
      state.notes.splice(index, 1);
      renderNotes();
      markDirty();
    }));
    els.notes.append(row);
  });
}

function renderAll() {
  renderHero();
  syncTripForm();
  renderPois();
  renderSchedule();
  renderNotes();
  els.githubToken.value = token();
  els.syncHelp.textContent = token()
    ? "入力後すぐに自動保存します。他端末の更新も数秒ごとに自動反映します。"
    : "全端末で同じデータを読みます。編集内容を自動保存するにはGitHub tokenを設定してください。";
}

function markDirty() {
  isDirty = true;
  setSaveState("未同期");
  setSync("変更を検知: 自動同期待ち", "warn");
  scheduleAutoSave();
}

function addPoi(values) {
  state.pois.unshift({
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
  state.pois = state.pois.filter((poi) => poi.id !== id);
  state.days.forEach((day) => day.items.forEach((item) => {
    if (item.poiId === id) item.poiId = "";
  }));
  renderAll();
  markDirty();
}

function addItem(dayId, time, title) {
  const day = state.days.find((item) => item.id === dayId);
  if (!day) return;
  day.items.push({
    id: uid("item"),
    time: valueOr(time, "10:00"),
    title: valueOr(title, "新しい予定"),
    poiId: state.pois[0]?.id || "",
    memo: ""
  });
  renderSchedule();
  markDirty();
}

function editItem(dayId, itemId) {
  const day = state.days.find((entry) => entry.id === dayId);
  const item = day?.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.time = prompt("時間", item.time) ?? item.time;
  item.title = prompt("予定", item.title) ?? item.title;
  const poiName = prompt("紐づけるPOI名", poiById(item.poiId)?.name || "");
  const poi = state.pois.find((entry) => entry.name === poiName);
  item.poiId = poi ? poi.id : item.poiId;
  item.memo = prompt("メモ", item.memo) ?? item.memo;
  renderSchedule();
  markDirty();
}

function removeItem(dayId, itemId) {
  const day = state.days.find((entry) => entry.id === dayId);
  if (!day) return;
  day.items = day.items.filter((entry) => entry.id !== itemId);
  renderSchedule();
  markDirty();
}

function editDay(dayId) {
  const day = state.days.find((entry) => entry.id === dayId);
  if (!day) return;
  day.title = prompt("タイトル", day.title) ?? day.title;
  day.date = prompt("日付", day.date) ?? day.date;
  day.theme = prompt("テーマ", day.theme) ?? day.theme;
  renderSchedule();
  markDirty();
}

function removeDay(dayId) {
  state.days = state.days.filter((entry) => entry.id !== dayId);
  renderSchedule();
  markDirty();
}

function bindEvents() {
  els.tripForm.addEventListener("input", () => {
    const data = new FormData(els.tripForm);
    ["title", "destination", "startDate", "endDate", "status", "mood"].forEach((key) => {
      state.trip[key] = valueOr(data.get(key));
    });
    state.trip.budget = Number(data.get("budget")) || 0;
    renderHero();
    markDirty();
  });

  els.poiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addPoi(new FormData(els.poiForm));
    els.poiForm.reset();
  });

  els.saveRemote.addEventListener("click", saveRemote);
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
    setSync("GitHub tokenを削除しました");
  });
  els.exportJson.addEventListener("click", () => {
    els.jsonOutput.value = `${JSON.stringify(state, null, 2)}\n`;
    els.jsonDialog.showModal();
  });
  els.addDay.addEventListener("click", () => {
    state.days.push({
      id: uid("day"),
      date: state.trip.startDate,
      title: `Day ${state.days.length + 1}`,
      theme: "新しい日",
      items: []
    });
    renderAll();
    markDirty();
  });
  els.addNote.addEventListener("click", () => {
    state.notes.push("");
    renderNotes();
    markDirty();
  });
  els.openMapSearch.addEventListener("click", () => {
    const query = encodeURIComponent(`${state.trip.destination || ""} ${state.trip.mood || ""}`);
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
      els.lastUpdated.textContent = `前回更新 ${timeLabel(state.trip.lastUpdated)}`;
    }
  } catch {
    setSync("最新チェック失敗: 表示中データを維持", "warn");
  }
}

bindEvents();
loadRemote().catch(() => {});
setInterval(pollRemote, POLL_MS);
