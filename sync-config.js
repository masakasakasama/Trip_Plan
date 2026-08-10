window.TRIP_SYNC_WORKER_URL = "https://trip-plan-sync.masakasakasama-man.workers.dev";

(() => {
  const WORKER_URL = window.TRIP_SYNC_WORKER_URL;
  const originalFetch = window.fetch?.bind(window);

  function applyManilaTiming(data) {
    let changed = false;
    const trips = Array.isArray(data?.trips) ? data.trips : [];
    const trip = trips.find((entry) => entry.id === "australia-2026") || trips[0];
    if (!trip) return false;

    const todo = (trip.todos || []).find((entry) => entry.id === "todo-manila-transit");
    if (todo) {
      const detail = "Hotel Sogo EDSA near Taftを予約済み。8/11 14:00チェックイン、返金不可。16:30にホテルを出発し、17:30までにNAIA Terminal 1へ戻る予定。";
      if (todo.detail !== detail) {
        todo.detail = detail;
        changed = true;
      }
    }

    const day = (trip.days || []).find((entry) => entry.id === "day-flight-out" || entry.date === "2026-08-11");
    if (!day) return changed;

    const patchItem = (id, patch) => {
      const item = (day.items || []).find((entry) => entry.id === id);
      if (!item) return;
      Object.entries(patch).forEach(([key, value]) => {
        if (item[key] !== value) {
          item[key] = value;
          changed = true;
        }
      });
    };

    patchItem("item-mnl-layover-out", {
      memo: "Manila現地時刻。Hotel Sogo EDSA near Taftを予約済み。14:00チェックイン後、16:30に空港へ戻る。"
    });
    patchItem("item-sogo-depart", {
      time: "16:30",
      homeTime: "17:30",
      memo: "渋滞を見込み、16:30に出発。NAIA Terminal 1へ移動する。"
    });
    patchItem("item-naia-t1-return", {
      time: "17:30",
      homeTime: "18:30",
      memo: "PR211搭乗のため17:30までの空港到着を目標にする。"
    });

    if (changed) trip.lastUpdated = new Date().toISOString();
    return changed;
  }

  if (originalFetch) {
    let persistingOverride = false;
    window.fetch = async function patchedFetch(input, init = {}) {
      const url = typeof input === "string" ? input : input?.url || "";
      const method = String(init.method || input?.method || "GET").toUpperCase();
      let nextInit = init;

      if (method === "PUT" && /\/state(?:\?|$)/.test(url) && typeof init.body === "string") {
        try {
          const payload = JSON.parse(init.body);
          applyManilaTiming(payload);
          nextInit = { ...init, body: JSON.stringify(payload) };
        } catch {
          // 通常のfetchへフォールバック
        }
      }

      const response = await originalFetch(input, nextInit);
      const isTripData = method === "GET" && (/\/state(?:\?|$)/.test(url) || /trip-plan\.json(?:\?|$)/.test(url));
      if (!isTripData || !response.ok) return response;

      try {
        const payload = JSON.parse(await response.clone().text());
        const changed = applyManilaTiming(payload);
        if (!changed) return response;

        if (/\/state(?:\?|$)/.test(url) && !persistingOverride) {
          persistingOverride = true;
          originalFetch(`${WORKER_URL}/state`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }).catch(() => {}).finally(() => {
            persistingOverride = false;
          });
        }

        return new Response(JSON.stringify(payload), {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers)
        });
      } catch {
        return response;
      }
    };
  }

  const STYLE_ID = "trip-timeline-state-style";
  const OFFSETS = {
    UTC: 0, GMT: 0,
    JST: 540, KST: 540,
    PHT: 480, SGT: 480, HKT: 480, AWST: 480, MYT: 480,
    ICT: 420,
    AEST: 600, AEDT: 660,
    NZST: 720, NZDT: 780
  };

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .timeline-row { transition: opacity .28s ease, filter .28s ease, transform .28s ease; }
      .timeline-row .event-card { transition: background .28s ease, box-shadow .28s ease, border-color .28s ease, transform .28s ease; border: 1px solid transparent; }
      .timeline-row.is-past { opacity: .56; filter: saturate(.42); }
      .timeline-row.is-past .event-card { background: #f7f4f6; box-shadow: 0 8px 22px rgba(75,62,82,.08); transform: scale(.985); }
      .timeline-row.is-past .event-thumb { filter: grayscale(.72); background: #f0ecef; }
      .timeline-row.is-past time, .timeline-row.is-past .time-cell span { color: #b7afb6; }
      .timeline-row.is-past .dot { border-color: #d9d3d8 !important; background: #f7f4f6; }
      .timeline-row.is-past .dot::after { background: #e5e0e4; }
      .timeline-row.is-current { opacity: 1; filter: none; }
      .timeline-row.is-current .event-card { border-color: #efbfd0; background: linear-gradient(135deg,#fff,#fff7fa); box-shadow: 0 16px 34px rgba(199,116,148,.16); }
      .timeline-row.is-current .dot { box-shadow: 0 0 0 5px rgba(243,182,202,.18); }
      .timeline-state-badge { display:inline-flex; align-items:center; gap:4px; border-radius:999px; padding:4px 9px; font-size:.7rem; font-weight:900; line-height:1; }
      .timeline-state-badge.is-done { background:#efebee; color:#918790; }
      .timeline-state-badge.is-now { background:#fff0f5; color:#c06f91; box-shadow:0 4px 12px rgba(192,111,145,.12); }
      .timeline-state-badge.is-now::before { content:"✦"; font-size:.62rem; }
    `;
    document.head.append(style);
  }

  function parseVisibleDay() {
    const range = document.querySelector("#trip-dates")?.textContent || "";
    const dateText = document.querySelector("#current-day-date")?.textContent || "";
    const year = Number((range.match(/(20\d{2})/) || [])[1]);
    const md = dateText.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!year || !md) return null;
    return { year, month: Number(md[1]), day: Number(md[2]) };
  }

  function localDateNumber(parts) {
    return parts.year * 10000 + parts.month * 100 + parts.day;
  }

  function todayNumber() {
    const now = new Date();
    return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  }

  function instantForRow(row, dateParts) {
    const time = row.querySelector(".time-cell time")?.textContent?.trim() || "";
    const zone = row.querySelector(".time-cell span")?.textContent?.trim()?.toUpperCase() || "";
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    const offset = OFFSETS[zone];
    if (!match || offset === undefined) return null;
    return Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, Number(match[1]), Number(match[2])) - offset * 60000;
  }

  function setBadge(row, state) {
    const foot = row.querySelector(".event-foot");
    if (!foot) return;
    let badge = foot.querySelector(".timeline-state-badge");
    if (!state) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "timeline-state-badge";
      foot.append(badge);
    }
    badge.className = `timeline-state-badge ${state === "past" ? "is-done" : "is-now"}`;
    badge.textContent = state === "past" ? "✓ 完了" : "いま";
  }

  function decorateTimeline() {
    installStyles();
    const dateParts = parseVisibleDay();
    if (!dateParts) return;
    const rows = [...document.querySelectorAll("#timeline .timeline-row")];
    if (!rows.length) return;

    const now = Date.now();
    const selected = localDateNumber(dateParts);
    const today = todayNumber();
    const instants = rows.map((row) => instantForRow(row, dateParts));

    rows.forEach((row, index) => {
      row.classList.remove("is-past", "is-current");
      let state = "";

      if (selected < today) {
        state = "past";
      } else if (selected === today) {
        const current = instants[index];
        const next = instants[index + 1];
        if (current != null && next != null && next <= now) state = "past";
        else if (current != null && current <= now && (next == null || next > now)) state = "current";
      }

      if (state === "past") row.classList.add("is-past");
      if (state === "current") row.classList.add("is-current");
      setBadge(row, state);
    });
  }

  function bootTimelineDecoration() {
    installStyles();
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        decorateTimeline();
      });
    };

    const timeline = document.querySelector("#timeline");
    const dayToolbar = document.querySelector("#day-toolbar");
    if (timeline) new MutationObserver(schedule).observe(timeline, { childList: true, subtree: true });
    if (dayToolbar) new MutationObserver(schedule).observe(dayToolbar, { childList: true, subtree: true, characterData: true });
    schedule();
    setInterval(schedule, 60000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootTimelineDecoration, { once: true });
  } else {
    bootTimelineDecoration();
  }
})();
