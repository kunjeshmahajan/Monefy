const STORAGE_KEY = "personalFinanceData_v1";

const EXPENSE_CATEGORIES = [
  "Food & Groceries",
  "Entertainment",
  "Transport",
  "Housing",
  "Utilities",
  "Shopping",
  "Health",
  "Education",
  "Subscriptions",
  "Personal Care",
  "Gifts & Donations",
  "Other",
];

const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Bonus",
  "Investments",
  "Rental",
  "Refund",
  "Other Income",
];

const CATEGORY_ICONS = {
  "Food & Groceries": "🍽️",
  Entertainment: "🎬",
  Transport: "🚗",
  Housing: "🏠",
  Utilities: "💡",
  Shopping: "🛍️",
  Health: "🏥",
  Education: "📚",
  Subscriptions: "📱",
  "Personal Care": "💆",
  "Gifts & Donations": "🎁",
  Other: "📦",
  Salary: "💼",
  Freelance: "💻",
  Bonus: "🎉",
  Investments: "📈",
  Rental: "🏘️",
  Refund: "↩️",
  "Other Income": "💰",
};

let transactions = [];
let currentType = "expense";
let charts = {};
let pendingDeleteId = null;
let summaryValues = { income: 0, expenses: 0, balance: 0, count: 0 };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

function formatCurrency(amount) {
  return "₹" + Math.round(amount).toLocaleString("en-IN");
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getCategoryIcon(cat) {
  return CATEGORY_ICONS[cat] || (currentType === "income" ? "💰" : "📦");
}

function showToast(msg, type = "default") {
  let toast = $(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  const icons = { success: "✓", error: "✕", default: "●" };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.default}</span> ${msg}`;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function animateValue(el, from, to, formatter, duration = 600) {
  if (from === to) {
    el.textContent = formatter(to);
    el.dataset.value = to;
    return;
  }
  const start = performance.now();
  const diff = to - from;
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + diff * eased;
    el.textContent = formatter(current);
    if (progress < 1) requestAnimationFrame(tick);
    else {
      el.textContent = formatter(to);
      el.dataset.value = to;
    }
  }
  requestAnimationFrame(tick);
}

function pulseCard(selector) {
  const card = document.querySelector(selector);
  if (card) {
    card.classList.remove("pulse");
    void card.offsetWidth;
    card.classList.add("pulse");
  }
}

function updateSummary() {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const balance = income - expenses;
  const count = transactions.length;

  animateValue($("#totalIncome"), summaryValues.income, income, formatCurrency);
  animateValue($("#totalExpenses"), summaryValues.expenses, expenses, formatCurrency);
  animateValue($("#balance"), summaryValues.balance, balance, formatCurrency);

  const countEl = $("#txCount");
  animateValue(countEl, summaryValues.count, count, (v) => Math.round(v).toString());

  const balanceEl = $("#balance");
  balanceEl.style.color = balance >= 0 ? "var(--green)" : "var(--red)";

  if (income !== summaryValues.income) pulseCard(".card-income");
  if (expenses !== summaryValues.expenses) pulseCard(".card-expense");
  if (balance !== summaryValues.balance) pulseCard(".card-balance");
  if (count !== summaryValues.count) pulseCard(".card-count");

  summaryValues = { income, expenses, balance, count };
}

function populateCategories(type) {
  const sel = $("#category");
  const cats = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  sel.innerHTML = '<option value="" disabled selected>Select category</option>';
  cats.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = `${CATEGORY_ICONS[c] || "📦"} ${c}`;
    sel.appendChild(opt);
  });
  renderCategoryChips(cats);
}

function renderCategoryChips(cats) {
  const container = $("#categoryChips");
  container.innerHTML = cats
    .slice(0, 6)
    .map(
      (c) =>
        `<button type="button" class="chip" data-cat="${c}">${CATEGORY_ICONS[c] || "📦"} ${c.split(" ")[0]}</button>`
    )
    .join("");

  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $("#category").value = chip.dataset.cat;
      container.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
    });
  });
}

function populateFilterCategories() {
  const sel = $("#filterCategory");
  const cats = new Set(transactions.map((t) => t.category));
  sel.innerHTML = '<option value="all">All categories</option>';
  [...cats].sort().forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

function getFilteredTransactions() {
  const typeFilter = $("#filterType").value;
  const catFilter = $("#filterCategory").value;
  const monthFilter = $("#filterMonth").value;

  return transactions
    .filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (catFilter !== "all" && t.category !== catFilter) return false;
      if (monthFilter && !t.date.startsWith(monthFilter)) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function renderTransactions() {
  const list = getFilteredTransactions();
  const container = $("#txList");
  $("#txBadge").textContent = list.length;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No transactions found.<br>Add your first expense or income!</p>
        <button type="button" class="empty-cta" id="emptyCta">+ Add transaction</button>
      </div>`;
    $("#emptyCta")?.addEventListener("click", () => switchTab("add"));
    return;
  }

  container.innerHTML = list
    .map(
      (t, i) => `
    <div class="tx-item" data-id="${t.id}" style="animation-delay:${i * 0.04}s">
      <div class="tx-icon ${t.type}">${CATEGORY_ICONS[t.category] || (t.type === "income" ? "💰" : "📦")}</div>
      <div class="tx-info">
        <div class="tx-desc">${escapeHtml(t.description)}</div>
        <div class="tx-meta">${formatDate(t.date)} · ${escapeHtml(t.category)} · ${t.type}</div>
      </div>
      <span class="tx-amount ${t.type}">${t.type === "expense" ? "−" : "+"}${formatCurrency(t.amount)}</span>
      <div class="tx-actions">
        <button class="delete-btn" data-id="${t.id}" title="Delete">✕</button>
      </div>
    </div>`
    )
    .join("");

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => openDeleteModal(btn.dataset.id));
  });
}

function openDeleteModal(id) {
  const tx = transactions.find((t) => t.id === id);
  if (!tx) return;
  pendingDeleteId = id;
  $("#deleteModalText").textContent = `"${tx.description}" — ${formatCurrency(tx.amount)}`;
  $("#deleteModal").classList.add("show");
}

function closeDeleteModal() {
  pendingDeleteId = null;
  $("#deleteModal").classList.remove("show");
}

function confirmDelete() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  const item = document.querySelector(`.tx-item[data-id="${id}"]`);
  closeDeleteModal();

  if (item) {
    item.classList.add("removing");
    setTimeout(() => {
      transactions = transactions.filter((t) => t.id !== id);
      saveData();
      refresh();
      showToast("Transaction deleted", "success");
    }, 300);
  } else {
    transactions = transactions.filter((t) => t.id !== id);
    saveData();
    refresh();
    showToast("Transaction deleted", "success");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getMonthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function getMonthLabels() {
  const labels = [];
  const keys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }));
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return { labels, keys };
}

const chartAnim = {
  duration: 900,
  easing: "easeOutCubic",
};

const chartTheme = {
  tick: "#94a3b8",
  grid: "rgba(148, 163, 184, 0.12)",
  legend: "#94a3b8",
};

function chartScaleOptions() {
  return {
    x: {
      ticks: { color: chartTheme.tick },
      grid: { color: chartTheme.grid },
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: chartTheme.tick,
        callback: (v) => "₹" + v.toLocaleString("en-IN"),
      },
      grid: { color: chartTheme.grid },
    },
  };
}

function renderCharts() {
  const expenseByCat = {};
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      expenseByCat[t.category] = (expenseByCat[t.category] || 0) + t.amount;
    });

  const catLabels = Object.keys(expenseByCat);
  const catValues = Object.values(expenseByCat);

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const { labels: monthLabels, keys: monthKeys } = getMonthLabels();
  const monthlyIncome = monthKeys.map((k) =>
    transactions
      .filter((t) => t.type === "income" && getMonthKey(t.date) === k)
      .reduce((s, t) => s + t.amount, 0)
  );
  const monthlyExpense = monthKeys.map((k) =>
    transactions
      .filter((t) => t.type === "expense" && getMonthKey(t.date) === k)
      .reduce((s, t) => s + t.amount, 0)
  );

  const palette = [
    "#3b82f6", "#22c55e", "#f97316", "#a78bfa", "#06b6d4",
    "#ef4444", "#eab308", "#ec4899", "#6366f1", "#10b981",
    "#f59e0b", "#8b5cf6",
  ];

  destroyCharts();

  charts.category = new Chart($("#categoryChart"), {
    type: "doughnut",
    data: {
      labels: catLabels.length ? catLabels : ["No data"],
      datasets: [{
        data: catValues.length ? catValues : [1],
        backgroundColor: catLabels.length ? palette.slice(0, catLabels.length) : ["#2e3344"],
        borderWidth: 0,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      animation: chartAnim,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 }, padding: 14, color: chartTheme.legend } },
      },
    },
  });

  charts.incomeExpense = new Chart($("#incomeExpenseChart"), {
    type: "bar",
    data: {
      labels: ["Income", "Expenses"],
      datasets: [{
        data: [totalIncome, totalExpenses],
        backgroundColor: ["#22c55e", "#f97316"],
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      animation: chartAnim,
      plugins: { legend: { display: false } },
      scales: chartScaleOptions(),
    },
  });

  charts.trend = new Chart($("#trendChart"), {
    type: "line",
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: "Income",
          data: monthlyIncome,
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.15)",
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 8,
        },
        {
          label: "Expenses",
          data: monthlyExpense,
          borderColor: "#f97316",
          backgroundColor: "rgba(249, 115, 22, 0.15)",
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      animation: chartAnim,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { color: chartTheme.legend } } },
      scales: chartScaleOptions(),
    },
  });
}

function destroyCharts() {
  Object.values(charts).forEach((c) => c.destroy());
  charts = {};
}

window.destroyFinanceCharts = destroyCharts;

function renderInsights() {
  const container = $("#insightsContainer");
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const balance = income - expenses;
  const savingsRate = income > 0 ? ((balance / income) * 100).toFixed(1) : 0;

  const expenseByCat = {};
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      expenseByCat[t.category] = (expenseByCat[t.category] || 0) + t.amount;
    });

  const sortedCats = Object.entries(expenseByCat).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCats[0];
  const avgExpense =
    transactions.filter((t) => t.type === "expense").length > 0
      ? expenses / transactions.filter((t) => t.type === "expense").length
      : 0;

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const thisMonthExp = transactions
    .filter((t) => t.type === "expense" && getMonthKey(t.date) === thisMonth)
    .reduce((s, t) => s + t.amount, 0);
  const lastMonthExp = transactions
    .filter((t) => t.type === "expense" && getMonthKey(t.date) === lastMonth)
    .reduce((s, t) => s + t.amount, 0);

  let monthChange = "";
  if (lastMonthExp > 0) {
    const pct = (((thisMonthExp - lastMonthExp) / lastMonthExp) * 100).toFixed(1);
    monthChange =
      thisMonthExp > lastMonthExp
        ? `↑ ${pct}% more than last month`
        : `↓ ${Math.abs(pct)}% less than last month`;
  }

  const tips = generateTips(income, expenses, balance, sortedCats, savingsRate);
  const topIcon = topCategory ? (CATEGORY_ICONS[topCategory[0]] || "📦") : "—";

  container.innerHTML = `
    <div class="insight-card highlight">
      <h3>Financial Summary</h3>
      <div class="value">${formatCurrency(balance)}</div>
      <div class="detail">
        ${balance >= 0 ? "✅ You are saving money overall." : "⚠️ You are spending more than you earn."}
        Savings rate: ${savingsRate}%
      </div>
    </div>

    <div class="insight-card ${topCategory ? "warning" : "info"}">
      <h3>Biggest Expense Category</h3>
      <div class="value">${topCategory ? `${topIcon} ${topCategory[0]}` : "—"}</div>
      <div class="detail">
        ${topCategory ? `${formatCurrency(topCategory[1])} total spent` : "No expenses recorded yet"}
      </div>
    </div>

    <div class="insight-card info">
      <h3>Average Expense</h3>
      <div class="value">${formatCurrency(Math.round(avgExpense))}</div>
      <div class="detail">Per transaction across all expenses</div>
    </div>

    <div class="insight-card ${thisMonthExp > lastMonthExp ? "warning" : "success"}">
      <h3>This Month's Spending</h3>
      <div class="value">${formatCurrency(thisMonthExp)}</div>
      <div class="detail">${monthChange || "Add more data to compare months"}</div>
    </div>

    <div class="insight-card highlight">
      <h3>Smart Tips</h3>
      <ul class="tip-list">
        ${tips.map((t) => `<li>${t}</li>`).join("")}
      </ul>
    </div>
  `;
}

function generateTips(income, expenses, balance, sortedCats, savingsRate) {
  const tips = [];

  if (transactions.length === 0) {
    tips.push("Start by adding your existing expenses and income using any past date.");
    tips.push("Use categories to see where your money goes in the Charts tab.");
    return tips;
  }

  if (balance < 0) {
    tips.push("Your expenses exceed income. Review your top spending categories.");
  } else if (Number(savingsRate) >= 20) {
    tips.push(`Great job! You're saving ${savingsRate}% of your income.`);
  } else if (income > 0) {
    tips.push(`Try to save at least 20% of income. You're currently at ${savingsRate}%.`);
  }

  if (sortedCats.length > 0) {
    const [topName, topAmt] = sortedCats[0];
    const pct = expenses > 0 ? ((topAmt / expenses) * 100).toFixed(0) : 0;
    tips.push(`${topName} is ${pct}% of total spending — consider setting a budget here.`);
  }

  const entertainment = sortedCats.find(([n]) => n === "Entertainment");
  if (entertainment && expenses > 0 && entertainment[1] / expenses > 0.15) {
    tips.push("Entertainment is over 15% of spending. Look for free or cheaper alternatives.");
  }

  const food = sortedCats.find(([n]) => n === "Food & Groceries");
  if (food && expenses > 0 && food[1] / expenses > 0.3) {
    tips.push("Food takes a large share. Meal planning can help cut grocery costs.");
  }

  if (tips.length < 3) {
    tips.push("Add transactions regularly to get more accurate insights over time.");
  }

  return tips.slice(0, 5);
}

function refresh() {
  updateSummary();
  populateFilterCategories();
  renderTransactions();
  renderInsights();

  const activeTab = $(".tab.active")?.dataset.tab;
  if (activeTab === "charts") renderCharts();
}

function updateTabIndicator(tab) {
  const indicator = $("#tabIndicator");
  const tabs = $("#tabsNav");
  if (!indicator || !tab || !tabs) return;

  const tabsRect = tabs.getBoundingClientRect();
  const tabRect = tab.getBoundingClientRect();

  indicator.style.width = `${tabRect.width}px`;
  indicator.style.height = `${tabRect.height}px`;
  indicator.style.transform = `translate(${tabRect.left - tabsRect.left}px, ${tabRect.top - tabsRect.top}px)`;
  indicator.classList.add("ready");
}

function scheduleTabIndicatorUpdate() {
  const tab = $(".tab.active");
  if (!tab) return;
  requestAnimationFrame(() => updateTabIndicator(tab));
}

function switchTab(tabName) {
  const tab = $(`.tab[data-tab="${tabName}"]`);
  if (!tab) return;

  $$(".tab").forEach((t) => t.classList.remove("active"));
  $$(".panel").forEach((p) => p.classList.remove("active"));
  tab.classList.add("active");

  const panel = $(`#panel-${tabName}`);
  panel.classList.add("active");

  updateTabIndicator(tab);
  if (tabName === "charts") renderCharts();
}

function initTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  scheduleTabIndicatorUpdate();
  window.addEventListener("resize", scheduleTabIndicatorUpdate);
  window.addEventListener("load", scheduleTabIndicatorUpdate);

  const tabsNav = $("#tabsNav");
  if (tabsNav && window.ResizeObserver) {
    new ResizeObserver(scheduleTabIndicatorUpdate).observe(tabsNav);
  }
}

function updateTypeSlider(type) {
  const slider = $("#typeSlider");
  slider.classList.toggle("income", type === "income");
}

function initForm() {
  $("#date").value = new Date().toISOString().slice(0, 10);
  populateCategories("expense");
  updateTypeSlider("expense");

  $$(".type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".type-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type;
      updateTypeSlider(currentType);
      populateCategories(currentType);
      $("#categoryChips").querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
    });
  });

  $("#category").addEventListener("change", () => {
    const val = $("#category").value;
    $("#categoryChips").querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("selected", c.dataset.cat === val);
    });
  });

  $("#txForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const description = $("#description").value.trim();
    const amount = parseFloat($("#amount").value);
    const category = $("#category").value;
    const date = $("#date").value;

    if (!description || !amount || amount <= 0 || !category || !date) {
      showToast("Please fill all fields", "error");
      return;
    }

    const btn = $("#submitBtn");
    btn.classList.add("loading");

    setTimeout(() => {
      transactions.push({
        id: uid(),
        type: currentType,
        description,
        amount,
        category,
        date,
      });

      saveData();
      refresh();

      btn.classList.remove("loading");
      btn.classList.add("success");
      btn.querySelector(".btn-text").textContent = "✓ Added!";
      showToast(`${currentType === "expense" ? "Expense" : "Income"} added!`, "success");

      setTimeout(() => {
        btn.classList.remove("success");
        btn.querySelector(".btn-text").textContent = "+ Add transaction";
      }, 1500);

      $("#description").value = "";
      $("#amount").value = "";
      $("#category").selectedIndex = 0;
      $("#categoryChips").querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
    }, 400);
  });
}

function initFilters() {
  ["filterType", "filterCategory", "filterMonth"].forEach((id) => {
    $(`#${id}`).addEventListener("change", renderTransactions);
  });

  $("#clearFilters").addEventListener("click", () => {
    $("#filterType").value = "all";
    $("#filterCategory").value = "all";
    $("#filterMonth").value = "";
    renderTransactions();
    showToast("Filters cleared", "success");
  });
}

function initModal() {
  $("#cancelDelete").addEventListener("click", closeDeleteModal);
  $("#confirmDelete").addEventListener("click", confirmDelete);
  $("#deleteModal").addEventListener("click", (e) => {
    if (e.target === $("#deleteModal")) closeDeleteModal();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  transactions = loadData();
  initTabs();
  initForm();
  initFilters();
  initModal();
  refresh();
  setTimeout(scheduleTabIndicatorUpdate, 100);
});
