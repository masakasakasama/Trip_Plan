(() => {
  const FX_CACHE_KEY = "trip-plan-fx-jpy-v1";
  const FX_API_BASE = "https://api.frankfurter.dev/v2/rate";
  const FX_CODES = ["AUD", "USD", "PHP", "EUR"];
  const FX_FALLBACK = {
    AUD: { rate: 111.69, date: "2026-08-11" },
    USD: { rate: 158.41, date: "2026-08-11" },
    PHP: { rate: 2.6054, date: "2026-08-11" },
    EUR: { rate: 183.07, date: "2026-08-11" }
  };

  let fxCache = { ...FX_FALLBACK, ...loadFxCache() };

  function loadFxCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveFxCache() {
    try {
      localStorage.setItem(FX_CACHE_KEY, JSON.stringify(fxCache));
    } catch (_) {
      // localStorageが使えなくても、同期データ側に保存したレートで動かす。
    }
  }

  function latestRate(code) {
    if (code === "JPY") return { rate: 1, date: localDateKey() };
    const item = fxCache[code];
    return item && Number(item.rate) > 0 ? item : null;
  }

  async function fetchRate(code) {
    const response = await fetch(`${FX_API_BASE}/${encodeURIComponent(code)}/JPY`, { cache: "no-store" });
    if (!response.ok) throw new Error(`FX ${code}/JPY ${response.status}`);
    const data = await response.json();
    const rate = Number(data.rate);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`FX ${code}/JPY invalid`);
    return {
      rate,
      date: String(data.date || localDateKey()),
      fetchedAt: new Date().toISOString()
    };
  }

  async function refreshRates() {
    const results = await Promise.allSettled(FX_CODES.map(async (code) => [code, await fetchRate(code)]));
    let updated = false;
    results.forEach((result) => {
      if (result.status !== "fulfilled") return;
      const [code, value] = result.value;
      fxCache[code] = value;
      updated = true;
    });
    if (updated) saveFxCache();
    return updated;
  }

  function rateForEntry(entry, kind = "actual") {
    const code = budgetCurrency(entry.currency).code;
    if (code === "JPY") return 1;
    const key = kind === "planned" ? "plannedFxRateToJPY" : "actualFxRateToJPY";
    const saved = Number(entry?.[key]);
    if (Number.isFinite(saved) && saved > 0) return saved;
    return Number(latestRate(code)?.rate) || 0;
  }

  function toJPY(entry, kind = "actual") {
    return budgetAmount(entry, kind) * rateForEntry(entry, kind);
  }

  function rateSymbol(code) {
    if (code === "AUD") return "A$";
    if (code === "USD") return "US$";
    if (code === "PHP") return "₱";
    return "€";
  }

  function rateSummary() {
    return FX_CODES.map((code) => {
      const info = latestRate(code);
      if (!info) return "";
      const rate = Number(info.rate).toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `1 ${rateSymbol(code)} = ¥${rate}`;
    }).filter(Boolean).join(" / ");
  }

  function rateSummaryDate() {
    const dates = FX_CODES.map((code) => latestRate(code)?.date).filter(Boolean).sort();
    return dates.at(-1) || localDateKey();
  }

  function stampRate(entry, kind) {
    const code = budgetCurrency(entry.currency).code;
    const rateInfo = latestRate(code);
    if (!rateInfo) return false;
    const rateKey = kind === "planned" ? "plannedFxRateToJPY" : "actualFxRateToJPY";
    const dateKey = kind === "planned" ? "plannedFxRateDate" : "actualFxRateDate";
    const capturedKey = kind === "planned" ? "plannedFxCapturedAt" : "actualFxCapturedAt";
    entry[rateKey] = code === "JPY" ? 1 : Number(rateInfo.rate);
    entry[dateKey] = String(rateInfo.date || localDateKey());
    entry[capturedKey] = new Date().toISOString();
    return true;
  }

  function backfillRates(trip) {
    let changed = false;
    (trip.budgetItems || []).forEach((entry) => {
      const code = budgetCurrency(entry.currency).code;
      if (code === "JPY") {
        if (entry.plannedFxRateToJPY !== 1) {
          entry.plannedFxRateToJPY = 1;
          entry.plannedFxRateDate = entry.plannedFxRateDate || localDateKey();
          changed = true;
        }
        if (entry.actualFxRateToJPY !== 1) {
          entry.actualFxRateToJPY = 1;
          entry.actualFxRateDate = entry.actualFxRateDate || localDateKey();
          changed = true;
        }
        return;
      }
      if (budgetAmount(entry, "planned") && !(Number(entry.plannedFxRateToJPY) > 0)) {
        changed = stampRate(entry, "planned") || changed;
      }
      if (budgetAmount(entry, "actual") && !(Number(entry.actualFxRateToJPY) > 0)) {
        changed = stampRate(entry, "actual") || changed;
      }
    });
    return changed;
  }

  const legacyUpdateBudgetFromForm = updateBudgetFromForm;
  updateBudgetFromForm = function updateBudgetFromFormJpy(entry, trip = currentTrip()) {
    const beforeCurrency = budgetCurrency(entry.currency).code;
    const beforePlanned = budgetAmount(entry, "planned");
    const beforeActual = budgetAmount(entry, "actual");

    legacyUpdateBudgetFromForm(entry, trip);

    const afterCurrency = budgetCurrency(entry.currency).code;
    const currencyChanged = beforeCurrency !== afterCurrency;
    const plannedStarted = !beforePlanned && budgetAmount(entry, "planned") > 0;
    const actualStarted = !beforeActual && budgetAmount(entry, "actual") > 0;

    if (afterCurrency === "JPY") {
      stampRate(entry, "planned");
      stampRate(entry, "actual");
      return;
    }

    if (currencyChanged || plannedStarted || !(Number(entry.plannedFxRateToJPY) > 0)) {
      stampRate(entry, "planned");
    }
    if (currencyChanged || actualStarted || !(Number(entry.actualFxRateToJPY) > 0)) {
      stampRate(entry, "actual");
    }
  };

  budgetStats = function budgetStatsJpy(trip) {
    let planned = 0;
    let spent = 0;
    let plannedPerPerson = 0;
    let spentPerPerson = 0;

    const totalsByCurrency = {};
    BUDGET_CURRENCIES.forEach((currency) => {
      totalsByCurrency[currency.code] = { planned: 0, spent: 0, plannedPerPerson: 0, spentPerPerson: 0 };
    });

    (trip.budgetItems || []).forEach((entry) => {
      const people = budgetPeopleCount(entry, trip);
      const plannedJpy = toJPY(entry, "planned");
      const spentJpy = toJPY(entry, "actual");
      planned += plannedJpy;
      spent += spentJpy;
      plannedPerPerson += plannedJpy / people;
      spentPerPerson += spentJpy / people;

      const code = budgetCurrency(entry.currency).code;
      const originalPlanned = budgetAmount(entry, "planned");
      const originalSpent = budgetAmount(entry, "actual");
      totalsByCurrency[code].planned += originalPlanned;
      totalsByCurrency[code].spent += originalSpent;
      totalsByCurrency[code].plannedPerPerson += originalPlanned / people;
      totalsByCurrency[code].spentPerPerson += originalSpent / people;
    });

    planned = Math.round(planned);
    spent = Math.round(spent);
    plannedPerPerson = Math.round(plannedPerPerson);
    spentPerPerson = Math.round(spentPerPerson);
    const total = Number(trip.budget) || 0;
    const percent = total ? Math.min(100, Math.round((spent / total) * 100)) : 0;
    return { spent, planned, total, percent, plannedPerPerson, spentPerPerson, totalsByCurrency };
  };

  settlementStats = function settlementStatsJpy(trip) {
    const travelers = trip.travelers?.length ? trip.travelers : ["夫", "Rebecca"];
    const group = {
      code: "JPY",
      balances: Object.fromEntries(travelers.map((name) => [name, 0])),
      count: 0,
      transfers: []
    };

    (trip.budgetItems || []).forEach((entry) => {
      const amount = toJPY(entry, "actual");
      if (!amount || entry.settled) return;
      const payer = budgetPayer(entry, trip);
      const beneficiaries = budgetBeneficiaries(entry, trip);
      group.count += 1;
      group.balances[payer] = roundMoney((group.balances[payer] || 0) + amount);
      const share = amount / beneficiaries.length;
      beneficiaries.forEach((name) => {
        group.balances[name] = roundMoney((group.balances[name] || 0) - share);
      });
    });

    const debtors = Object.entries(group.balances)
      .filter(([, balance]) => balance < -0.5)
      .map(([name, balance]) => ({ name, amount: -balance }));
    const creditors = Object.entries(group.balances)
      .filter(([, balance]) => balance > 0.5)
      .map(([name, balance]) => ({ name, amount: balance }));
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtors[debtorIndex] && creditors[creditorIndex]) {
      const debtor = debtors[debtorIndex];
      const creditor = creditors[creditorIndex];
      const amount = Math.round(Math.min(debtor.amount, creditor.amount));
      group.transfers.push({ from: debtor.name, to: creditor.name, amount });
      debtor.amount -= amount;
      creditor.amount -= amount;
      if (debtor.amount <= 0.5) debtorIndex += 1;
      if (creditor.amount <= 0.5) creditorIndex += 1;
    }

    return { JPY: group };
  };

  settleCurrency = function settleAllAsJpy() {
    const trip = currentTrip();
    const group = settlementStats(trip).JPY;
    if (!group?.transfers?.length) return;
    const transferText = group.transfers
      .map((transfer) => `${transfer.from} → ${transfer.to} ${formatMoney(transfer.amount, "JPY")}`)
      .join("、");
    if (!window.confirm(`${transferText}\nすべての通貨の立替分を円換算で精算済みにしますか？`)) return;
    commitChange(() => {
      trip.budgetItems.forEach((entry) => {
        if (!entry.settled && budgetAmount(entry, "actual")) {
          entry.settled = true;
          entry.settledAt = new Date().toISOString();
        }
      });
    });
  };

  renderBudget = function renderBudgetJpy() {
    const trip = currentTrip();
    const stats = budgetStats(trip);

    if (els.budgetSummary) {
      const exchangeRateDetailsOpen = Boolean(els.budgetSummary.querySelector(".exchange-rate-details")?.open);
      els.budgetSummary.innerHTML = `
        <div class="budget-overview">
          <section><span>総予算</span><strong>${formatMoney(stats.total, "JPY")}</strong></section>
          <section><span>支出</span><strong>${formatMoney(stats.spent, "JPY")}</strong></section>
          <section><span>残り</span><strong>${formatMoney(stats.total - stats.spent, "JPY")}</strong></section>
        </div>
        <details class="exchange-rate-details"${exchangeRateDetailsOpen ? " open" : ""}>
          <summary>
            <span>換算レート</span>
            <small>${escapeHtml(rateSummaryDate().replaceAll("-", "/"))}</small>
          </summary>
          <section class="exchange-rate-note">
            <span>${escapeHtml(rateSummary())}</span>
            <small>Frankfurter（中央銀行参照レート）</small>
          </section>
        </details>
        <meter min="0" max="100" value="${stats.percent}"></meter>
      `;
    }

    if (!els.budgetList) return;
    renderSettlement(trip);
    els.budgetList.replaceChildren();
    if (!trip.budgetItems.length) {
      appendEmptyState(els.budgetList, "予算項目はまだありません。");
      return;
    }

    [...trip.budgetItems].reverse().forEach((entry) => {
      const currency = budgetCurrency(entry.currency);
      const actualJpy = Math.round(toJPY(entry, "actual"));
      const foreign = currency.code !== "JPY";
      const actualRate = rateForEntry(entry, "actual");
      const expenseDate = budgetExpenseDate(entry);
      const payer = budgetPayer(entry, trip);
      const husbandPaid = payer === trip.travelers[0];
      const payerClass = husbandPaid ? "payer-husband" : "payer-wife";
      const payerLabel = `${payer}が支払い`;
      const rateLine = foreign && actualRate
        ? `<small class="fx-detail">${formatMoney(budgetAmount(entry, "actual"), currency.code)} × ¥${Number(actualRate).toLocaleString("ja-JP", { maximumFractionDigits: 4 })}</small>`
        : "";

      const card = document.createElement("article");
      card.className = `list-card budget-card ${payerClass}`;
      card.innerHTML = `
        <div class="budget-icon" aria-hidden="true">${budgetIcon(entry)}</div>
        <div class="budget-body">
          <div class="budget-title-row">
            <strong>${escapeHtml(entry.label)}</strong>
            <span class="amount">${formatMoney(actualJpy, "JPY")}</span>
          </div>
          <p>${escapeHtml(entry.category || "未分類")}${entry.memo ? `・${escapeHtml(entry.memo)}` : ""}</p>
          <div class="budget-meta">
            ${expenseDate ? `<span class="budget-currency expense-date">${escapeHtml(formatShortDate(expenseDate))} 支払</span>` : ""}
            <span class="budget-currency payer-badge">${escapeHtml(payerLabel)}</span>
            <span class="budget-currency settlement-state ${entry.settled ? "is-settled" : "is-open"}">${entry.settled ? "精算済み" : "未精算"}</span>
          </div>
          ${rateLine}
        </div>
      `;
      card.addEventListener("click", () => editBudgetItem(entry.id));
      els.budgetList.append(card);
    });
  };

  async function initializeFx() {
    await refreshRates();
    let attempts = 0;
    const applyWhenReady = () => {
      attempts += 1;
      if (!state?.trips?.length) {
        if (attempts < 100) setTimeout(applyWhenReady, 100);
        return;
      }
      let changed = false;
      state.trips.forEach((trip) => {
        changed = backfillRates(trip) || changed;
      });
      render();
      if (changed) markDirty();
    };
    applyWhenReady();
  }

  initializeFx().catch(() => {
    // API取得に失敗しても、すでに同期データへ保存されたレートがあれば円換算を継続する。
  });
})();
