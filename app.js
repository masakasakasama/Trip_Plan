const STORAGE_KEY = "sydney-trip-plan-v1";

const els = {
  title: document.querySelector("#trip-title"),
  range: document.querySelector("#trip-range"),
  timezone: document.querySelector("#timezone-note"),
  dateJump: document.querySelector("#date-jump"),
  editMode: document.querySelector("#edit-mode"),
  reset: document.querySelector("#reset-data"),
  alerts: document.querySelector("#alerts"),
  alertCount: document.querySelector("#alert-count"),
  flights: document.querySelector("#flight-summary"),
  hotel: document.querySelector("#hotel-summary"),
  timeline: document.querySelector("#timeline"),
  mapLinks: document.querySelector("#map-links"),
  checklist: document.querySelector("#checklist"),
  checklistProgress: document.querySelector("#checklist-progress")
};

let data = loadData();
let editMode = false;
let draggingId = "";
let resetArmed = false;
normalizeData();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  const initial = clone(window.INITIAL_TRIP_DATA);
  initial.checklistState = {};
  return initial;
}

function saveData() {
  normalizeData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function normalizeData() {
  const counters = {};
  data.events.forEach((event) => {
    if (typeof event.order !== "number") {
      counters[event.date] = counters[event.date] || 0;
      event.order = counters[event.date];
    }
    counters[event.date] = Math.max(counters[event.date] || 0, event.order + 1);
  });
  data.checklistState = data.checklistState || {};
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateLabel(date) {
  const d = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short"
  }).format(d);
}

function dateRange(start, end) {
  const result = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last) {
    result.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function toMinutes(time) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function eventStartMs(event) {
  return Date.parse(`${event.date}T${event.start || "00:00"}:00`);
}

function eventEndMs(event) {
  const endDate = event.endDate || event.date;
  let ms = Date.parse(`${endDate}T${event.end || event.start || "00:00"}:00`);
  if (!event.endDate && event.end && event.start && toMinutes(event.end) < toMinutes(event.start)) {
    ms += 86400000;
  }
  return ms;
}

function durationLabel(event) {
  const diff = Math.max(0, Math.round((eventEndMs(event) - eventStartMs(event)) / 60000));
  if (!diff) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h && m) return `${h}時間${m}分`;
  if (h) return `${h}時間`;
  return `${m}分`;
}

function place(id) {
  return id ? data.places[id] : null;
}

function placeName(id) {
  const p = place(id);
  return p ? p.displayName || p.name : "";
}

function mapUrlForEvent(event) {
  if (event.routeUrl) return event.routeUrl;
  const p = place(event.placeId || event.toPlaceId || event.fromPlaceId);
  return p?.mapUrl || "";
}

function sortedEvents() {
  return [...data.events].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const diff = (a.order ?? 0) - (b.order ?? 0);
    if (diff) return diff;
    const timeDiff = toMinutes(a.start) - toMinutes(b.start);
    if (timeDiff) return timeDiff;
    return data.events.indexOf(a) - data.events.indexOf(b);
  });
}

function eventsForDate(date) {
  return sortedEvents().filter((event) => event.date === date);
}

function flightById(id) {
  return data.flights.find((flight) => flight.id === id);
}

function render() {
  const meta = data.meta;
  els.title.textContent = meta.title;
  els.range.textContent = `${meta.startDate.replaceAll("-", ".")} - ${meta.endDate.slice(5).replace("-", ".")}`;
  els.timezone.textContent = meta.timezoneNote || "時刻は各現地時刻";
  renderDateJump();
  renderAlerts();
  renderFlights();
  renderHotel();
  renderTimeline();
  renderMapLinks();
  renderChecklist();
  document.body.classList.toggle("is-editing", editMode);
}

function renderDateJump() {
  els.dateJump.replaceChildren();
  dateRange(data.meta.startDate, data.meta.endDate).forEach((date) => {
    const link = document.createElement("a");
    link.href = `#day-${date}`;
    link.textContent = dateLabel(date);
    els.dateJump.append(link);
  });
}

function buildWarnings() {
  const warnings = [];
  const byId = Object.fromEntries(data.events.map((event) => [event.id, event]));
  const rules = data.validationRules || {};

  for (const rule of Object.values(rules)) {
    const event = byId[rule.eventId];
    if (event && event.date === rule.date && toMinutes(event.start) > toMinutes(rule.latestStart)) {
      warnings.push(rule.message);
    }
  }

  for (const flight of data.flights) {
    const departEvent = data.events.find((event) => event.flightId === flight.id && event.date === flight.date);
    if (!departEvent) continue;
    const airportEvents = data.events
      .filter((event) => event.date === flight.date && event.type === "airport" && event.placeId === flight.fromPlaceId)
      .filter((event) => eventStartMs(event) <= eventStartMs(departEvent))
      .sort((a, b) => eventStartMs(b) - eventStartMs(a));
    const arrival = airportEvents[0];
    if (arrival) {
      const buffer = (eventStartMs(departEvent) - eventStartMs(arrival)) / 60000;
      if (buffer < 120) {
        warnings.push(`${flight.flightNo} 出発2時間前を切って空港到着予定です。`);
      }
    }
  }

  for (const date of dateRange(data.meta.startDate, data.meta.endDate)) {
    const events = eventsForDate(date);
    for (let i = 1; i < events.length; i += 1) {
      if (eventStartMs(events[i]) < eventEndMs(events[i - 1])) {
        warnings.push(`${dateLabel(date)}: 「${events[i - 1].title}」と「${events[i].title}」の時間が重なっています。`);
      }
    }
  }

  return Array.from(new Set(warnings));
}

function renderAlerts() {
  const warnings = buildWarnings();
  els.alertCount.textContent = warnings.length ? `${warnings.length}件` : "OK";
  els.alerts.replaceChildren();

  const list = warnings.length
    ? warnings.map((message) => ({ tone: "danger", message }))
    : [{ tone: "ok", message: "現在、締切・重複・空港到着バッファの警告はありません。" }];

  data.alerts.slice(0, 7).forEach((message) => list.push({ tone: "note", message }));

  list.forEach((item) => {
    const row = document.createElement("article");
    row.className = `alert-item ${item.tone}`;
    row.innerHTML = `<span>${item.tone === "danger" ? "!" : item.tone === "ok" ? "✓" : "i"}</span><p>${escapeHtml(item.message)}</p>`;
    els.alerts.append(row);
  });
}

function renderFlights() {
  els.flights.replaceChildren();
  data.flights.forEach((flight) => {
    const from = placeName(flight.fromPlaceId) || flight.from;
    const to = placeName(flight.toPlaceId) || flight.to;
    const card = document.createElement("article");
    card.className = "flight-card";
    card.innerHTML = `
      <strong>${escapeHtml(flight.flightNo)} ${escapeHtml(flight.from)} → ${escapeHtml(flight.to)}</strong>
      <p>${escapeHtml(flight.airline)} / ${escapeHtml(dateLabel(flight.date))}</p>
      <div class="flight-times">
        <span>${escapeHtml(flight.depart)} 発<br>${escapeHtml(from)}</span>
        <span>${escapeHtml(flight.arrive)} 着${flight.arriveDate ? `<br>${escapeHtml(dateLabel(flight.arriveDate))}` : ""}<br>${escapeHtml(to)}</span>
      </div>
    `;
    els.flights.append(card);
  });
}

function renderHotel() {
  const hotel = data.hotel;
  const p = place(hotel.placeId);
  els.hotel.innerHTML = `
    <strong>${escapeHtml(hotel.name)}</strong>
    <p>${escapeHtml(hotel.displayName || hotel.name)}</p>
    <dl>
      <div><dt>チェックイン</dt><dd>${escapeHtml(dateLabel(hotel.checkInDate))} ${escapeHtml(hotel.checkInTime)}</dd></div>
      <div><dt>チェックアウト</dt><dd>${escapeHtml(dateLabel(hotel.checkOutDate))} ${escapeHtml(hotel.checkOutTime)}</dd></div>
      <div><dt>泊数</dt><dd>${escapeHtml(hotel.nights)}泊 / ${escapeHtml(hotel.guests)}名</dd></div>
    </dl>
    ${p?.mapUrl ? `<a class="map-button" href="${escapeHtml(p.mapUrl)}" target="_blank" rel="noreferrer">Google Maps</a>` : ""}
  `;
}

function renderTimeline() {
  els.timeline.replaceChildren();
  dateRange(data.meta.startDate, data.meta.endDate).forEach((date) => {
    const section = document.createElement("section");
    section.className = "day-section";
    section.id = `day-${date}`;
    section.innerHTML = `<h3>${escapeHtml(dateLabel(date))}</h3>`;

    const list = document.createElement("div");
    list.className = "event-list";
    list.dataset.date = date;
    list.addEventListener("dragover", onDragOver);
    list.addEventListener("drop", onDrop);

    const dayEvents = eventsForDate(date);
    if (!dayEvents.length) {
      list.innerHTML = `<p class="empty">予定なし</p>`;
    } else {
      dayEvents.forEach((event) => list.append(renderEventCard(event)));
    }

    section.append(list);
    els.timeline.append(section);
  });
}

function renderEventCard(event) {
  const card = document.createElement("article");
  card.className = `event-card type-${event.type} ${event.locked ? "is-locked" : ""}`;
  card.dataset.eventId = event.id;
  const disabled = !editMode || event.locked;
  const flight = flightById(event.flightId);
  const mapUrl = mapUrlForEvent(event);
  const details = [
    event.note,
    event.placeId ? placeName(event.placeId) : "",
    event.fromPlaceId && event.toPlaceId ? `${placeName(event.fromPlaceId)} → ${placeName(event.toPlaceId)}` : "",
    flight ? `${flight.airline} ${flight.from} → ${flight.to}` : ""
  ].filter(Boolean);

  card.innerHTML = `
    <div class="event-main">
      <button class="drag-handle" type="button" draggable="${editMode ? "true" : "false"}" aria-label="並び替え">≡</button>
      <div class="event-time">
        <strong>${escapeHtml(event.start || "--:--")}</strong>
        <span>${escapeHtml(event.end || "")}</span>
      </div>
      <div class="event-body">
        <div class="event-title">
          <strong>${escapeHtml(event.title)}</strong>
          ${event.locked ? `<span class="lock-badge">LOCK</span>` : ""}
        </div>
        ${details.map((detail) => `<p>${escapeHtml(detail)}</p>`).join("")}
        <div class="event-meta">
          <span>${escapeHtml(durationLabel(event))}</span>
          <span>${escapeHtml(event.type)}</span>
          ${mapUrl ? `<a href="${escapeHtml(mapUrl)}" target="_blank" rel="noreferrer">Map</a>` : ""}
        </div>
      </div>
    </div>
    <div class="event-edit">
      <label>日付<select data-field="date" ${disabled ? "disabled" : ""}>${dateRange(data.meta.startDate, data.meta.endDate).map((date) => `<option value="${date}" ${date === event.date ? "selected" : ""}>${escapeHtml(dateLabel(date))}</option>`).join("")}</select></label>
      <label>開始<input data-field="start" type="time" step="900" value="${escapeHtml(event.start || "")}" ${disabled ? "disabled" : ""}></label>
      <label>終了<input data-field="end" type="time" step="900" value="${escapeHtml(event.end || "")}" ${disabled ? "disabled" : ""}></label>
      <label class="unlock"><input data-field="locked" type="checkbox" ${event.locked ? "" : "checked"} ${editMode ? "" : "disabled"}> ロック解除</label>
    </div>
  `;

  card.querySelector(".drag-handle").addEventListener("dragstart", (e) => {
    if (!editMode) return e.preventDefault();
    draggingId = event.id;
    e.dataTransfer.effectAllowed = "move";
  });

  card.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("change", () => updateEvent(event.id, input.dataset.field, input));
  });

  return card;
}

function updateEvent(id, field, input) {
  const event = data.events.find((item) => item.id === id);
  if (!event) return;
  if (field === "locked") {
    event.locked = !input.checked;
  } else {
    event[field] = input.value;
    if (field === "date") {
      const sameDay = data.events.filter((item) => item.id !== id && item.date === event.date);
      event.order = sameDay.length ? Math.max(...sameDay.map((item) => item.order || 0)) + 1 : 0;
    }
  }
  saveData();
  render();
}

function onDragOver(event) {
  if (!editMode || !draggingId) return;
  event.preventDefault();
}

function onDrop(event) {
  if (!editMode || !draggingId) return;
  event.preventDefault();
  const targetList = event.currentTarget;
  const targetCard = event.target.closest(".event-card");
  const moved = data.events.find((item) => item.id === draggingId);
  if (!moved) return;

  moved.date = targetList.dataset.date;
  const withoutMoved = data.events.filter((item) => item.id !== draggingId);
  const sameDay = withoutMoved.filter((item) => item.date === moved.date);
  const insertBeforeId = targetCard?.dataset.eventId;
  let newDayEvents = [];
  for (const item of sameDay) {
    if (item.id === insertBeforeId) newDayEvents.push(moved);
    newDayEvents.push(item);
  }
  if (!insertBeforeId || !sameDay.some((item) => item.id === insertBeforeId)) newDayEvents.push(moved);

  newDayEvents.forEach((item, index) => {
    item.order = index;
  });
  data.events = withoutMoved.filter((item) => item.date !== moved.date).concat(newDayEvents);
  draggingId = "";
  saveData();
  render();
}

function renderMapLinks() {
  els.mapLinks.replaceChildren();
  const used = new Map();
  for (const event of data.events) {
    for (const id of [event.placeId, event.fromPlaceId, event.toPlaceId]) {
      const p = place(id);
      if (p?.mapUrl && !used.has(id)) used.set(id, p);
    }
  }
  for (const [id, p] of used) {
    const link = document.createElement("a");
    link.className = "map-link";
    link.href = p.mapUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.innerHTML = `<strong>${escapeHtml(p.displayName || p.name)}</strong><span>${escapeHtml(p.country || "")}</span>`;
    els.mapLinks.append(link);
  }
}

function renderChecklist() {
  els.checklist.replaceChildren();
  const state = data.checklistState || {};
  data.checklistState = state;
  const done = data.checklist.filter((item) => state[item]).length;
  els.checklistProgress.textContent = `${done}/${data.checklist.length}`;

  data.checklist.forEach((item) => {
    const label = document.createElement("label");
    label.className = "check-item";
    label.innerHTML = `<input type="checkbox" ${state[item] ? "checked" : ""}> <span>${escapeHtml(item)}</span>`;
    label.querySelector("input").addEventListener("change", (event) => {
      state[item] = event.target.checked;
      saveData();
      renderChecklist();
    });
    els.checklist.append(label);
  });
}

els.editMode.addEventListener("change", () => {
  editMode = els.editMode.checked;
  render();
});

els.reset.addEventListener("click", () => {
  if (!resetArmed) {
    resetArmed = true;
    els.reset.textContent = "もう一度押す";
    window.setTimeout(() => {
      resetArmed = false;
      els.reset.textContent = "初期状態に戻す";
    }, 3500);
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  data = loadData();
  resetArmed = false;
  els.reset.textContent = "初期状態に戻す";
  render();
});

render();
