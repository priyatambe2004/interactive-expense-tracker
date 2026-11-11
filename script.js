
"use strict";

// ========================================
// SPENDWISE - EXPENSE TRACKER
// ========================================

const KEY = "spendwise-expenses-v2";
const BKEY = "spendwise-budget-v2";
const TKEY = "spendwise-theme";

const CATS = {
  Food: ["🍽️", "#f28b52"],
  Transport: ["🚌", "#5798e8"],
  Shopping: ["🛍️", "#df79ad"],
  Bills: ["💡", "#d9ad45"],
  Health: ["💊", "#4bbd91"],
  Entertainment: ["🎬", "#9b83e8"],
  Education: ["📚", "#46b6c5"],
  Other: ["📦", "#8990a8"]
};

const $ = s => document.querySelector(s);

const money = n =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(n) || 0);

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

const today = () => {
  const d = new Date();
  return new Date(
    d.getTime() - d.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);
};

const prettyDate = d =>
  new Date(d + "T00:00:00").toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );

const monthKey = d => d.slice(0, 7);


// ========================================
// LOCAL STORAGE
// ========================================

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast("Storage is full. Export a backup to keep your data.");
    return false;
  }
}

let expenses = read(KEY, []);

if (!Array.isArray(expenses)) {
  expenses = [];
}

// Migrate existing data from your original project.
if (!expenses.length) {
  const old = read("spendwise-expenses-v1", []);

  if (Array.isArray(old) && old.length) {
    expenses = old;
    write(KEY, expenses);
  }
}

let budget = Number(
  read(BKEY, 0)
) || 0;

let editingId = null;
let lastDeleted = null;
let toastTimer;

const currentDate = new Date(today() + "T00:00:00");

let viewedMonth = new Date(
  currentDate.getFullYear(),
  currentDate.getMonth(),
  1
);


// ========================================
// INITIAL SETUP
// ========================================

Object.keys(CATS).forEach(category => {

  $("#category").insertAdjacentHTML(
    "beforeend",
    `<option value="${category}">${category}</option>`
  );

  $("#fCategory").insertAdjacentHTML(
    "beforeend",
    `<option value="${category}">${category}</option>`
  );

});

$("#date").value = today();
$("#budget").value = budget || "";
$("#year").textContent = new Date().getFullYear();


// ========================================
// FORM VALIDATION
// ========================================

function validate() {

  const title = $("#title").value.trim();
  const amount = Number($("#amount").value);
  const date = $("#date").value;

  const errors = {

    Title:
      title.length < 2
        ? "Enter at least 2 characters."
        : "",

    Amount:
      !(amount > 0)
        ? "Enter an amount greater than zero."
        : amount > 1e9
          ? "Amount is too large."
          : "",

    Date:
      !date
        ? "Choose a date."
        : date > today()
          ? "Date cannot be in the future."
          : ""

  };

  Object.entries(errors).forEach(([key, message]) => {

    $("#e" + key).textContent = message;

    $("#" + key.toLowerCase())
      .setAttribute("aria-invalid", String(!!message));

  });

  return !Object.values(errors).some(Boolean);
}


// ========================================
// FORM RESET
// ========================================

function resetForm() {

  editingId = null;

  $("#form").reset();
  $("#date").value = today();

  $("#form").classList.remove("editing");

  $("#formTitle").textContent = "Add an expense";
  $("#submitBtn").textContent = "＋ Add expense";

  $("#cancelBtn").hidden = true;

  ["Title", "Amount", "Date"].forEach(key => {

    $("#e" + key).textContent = "";

    $("#" + key.toLowerCase())
      .removeAttribute("aria-invalid");

  });

}


// ========================================
// ADD / UPDATE EXPENSE
// ========================================

$("#form").addEventListener("submit", e => {

  e.preventDefault();

  if (!validate()) {

    document
      .querySelector('[aria-invalid="true"]')
      ?.focus();

    return;
  }

  const data = {

    title: $("#title").value.trim(),

    amount:
      Math.round(Number($("#amount").value) * 100) / 100,

    category: $("#category").value,

    date: $("#date").value,

    note: $("#note").value.trim()

  };

  if (editingId) {

    expenses = expenses.map(item =>
      item.id === editingId
        ? { ...item, ...data }
        : item
    );

    toast("Expense updated successfully");

  } else {

    expenses.push({

      id:
        crypto.randomUUID?.() ||
        String(Date.now() + Math.random()),

      ...data

    });

    toast("Expense added successfully");

  }

  if (!write(KEY, expenses)) return;

  resetForm();
  render();

});

$("#cancelBtn").addEventListener(
  "click",
  resetForm
);


// ========================================
// EDIT EXPENSE
// ========================================

function startEdit(id) {

  const item = expenses.find(x => x.id === id);

  if (!item) return;

  editingId = id;

  $("#title").value = item.title;
  $("#amount").value = item.amount;
  $("#date").value = item.date;
  $("#category").value = item.category;
  $("#note").value = item.note || "";

  $("#form").classList.add("editing");

  $("#formTitle").textContent = "Edit expense";
  $("#submitBtn").textContent = "Save changes";

  $("#cancelBtn").hidden = false;

  $("#form").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  $("#title").focus();

}


// ========================================
// DELETE EXPENSE + UNDO
// ========================================

function removeExpense(id) {

  const index = expenses.findIndex(x => x.id === id);

  if (index < 0) return;

  if (!confirm(`Delete "${expenses[index].title}"?`)) {
    return;
  }

  lastDeleted = {
    item: expenses[index],
    index
  };

  expenses.splice(index, 1);

  if (!write(KEY, expenses)) return;

  if (editingId === id) {
    resetForm();
  }

  render();

  toast("Expense deleted", true);

}


// ========================================
// FILTER AND SORT
// ========================================

function visible() {

  const category = $("#fCategory").value;

  const from = $("#fFrom").value;

  const to = $("#fTo").value;

  const query = $("#fSearch")
    .value.trim().toLowerCase();

  const sorters = {

    newest: (a, b) =>
      b.date.localeCompare(a.date),

    oldest: (a, b) =>
      a.date.localeCompare(b.date),

    high: (a, b) =>
      b.amount - a.amount,

    low: (a, b) =>
      a.amount - b.amount,

    az: (a, b) =>
      a.title.localeCompare(b.title)

  };

  return expenses

    .filter(x =>
      category === "all" ||
      x.category === category
    )

    .filter(x =>
      !from || x.date >= from
    )

    .filter(x =>
      !to || x.date <= to
    )

    .filter(x =>
      !query ||
      `${x.title} ${x.note || ""} ${x.category}`
        .toLowerCase()
        .includes(query)
    )

    .sort(
      sorters[$("#fSort").value] ||
      sorters.newest
    );

}

function sum(arr) {

  return arr.reduce(
    (total, item) => total + Number(item.amount || 0),
    0
  );

}


// ========================================
// MONTHLY EXPENSES
// ========================================

function monthItems() {

  const key =
    `${viewedMonth.getFullYear()}-` +
    `${String(viewedMonth.getMonth() + 1).padStart(2, "0")}`;

  return expenses.filter(
    x => monthKey(x.date) === key
  );

}


// ========================================
// MAIN RENDER FUNCTION
// ========================================

function render() {

  const list = visible();

  const none = list.length === 0;

  const filtered =
    $("#fCategory").value !== "all" ||
    $("#fFrom").value ||
    $("#fTo").value ||
    $("#fSearch").value.trim();

  // TRANSACTION LIST

  $("#list").innerHTML = list.map((x, i) => {

    const [icon, color] =
      CATS[x.category] || CATS.Other;

    return `

      <li class="transaction"
          style="--cat:${color};animation-delay:${Math.min(i, 8) * 25}ms">

        <span class="transaction-icon" aria-hidden="true">
          ${icon}
        </span>

        <div>

          <div class="transaction-title">
            ${esc(x.title)}
          </div>

          <div class="transaction-meta">
            ${esc(x.category)}
            · ${prettyDate(x.date)}
            ${x.note ? " · " + esc(x.note) : ""}
          </div>

        </div>

        <strong class="transaction-amount">
          ${money(x.amount)}
        </strong>

        <div class="transaction-actions">

          <button type="button"
                  data-edit="${esc(x.id)}"
                  aria-label="Edit ${esc(x.title)}"
                  title="Edit">
            ✎
          </button>

          <button type="button"
                  class="delete"
                  data-del="${esc(x.id)}"
                  aria-label="Delete ${esc(x.title)}"
                  title="Delete">
            ⌫
          </button>

        </div>

      </li>

    `;

  }).join("");


  // EMPTY STATE

  $("#empty").hidden = !none;

  $("#sampleBtn").hidden = !(
    none && expenses.length === 0
  );

  $("#emptyTitle").textContent =
    expenses.length
      ? "No matching expenses"
      : "Nothing here yet";

  $("#emptyText").textContent =
    expenses.length
      ? "Try adjusting your search or filters."
      : "Add your first expense or load sample data to explore the dashboard.";

  $("#clearBtn").hidden = !expenses.length;


  // FILTER COUNT

  $("#resultCount").textContent =
    `Showing ${list.length} of ${expenses.length} transactions` +
    (filtered ? " · filters applied" : "");


  // MONTHLY SUMMARY

  const currentMonthKey = monthKey(today());

  const currentMonthExpenses = expenses.filter(
    x => monthKey(x.date) === currentMonthKey
  );

  const monthlyTotal = sum(currentMonthExpenses);

  const allTotal = sum(expenses);

  const currentDays = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();

  const elapsedDays = currentDate.getDate();

  const average =
    monthlyTotal / Math.max(1, elapsedDays);


  $("#sMonth").textContent = money(monthlyTotal);

  $("#sMonthNote").textContent =
    `${currentMonthExpenses.length} transactions this month`;

  $("#sAll").textContent = money(allTotal);

  $("#sAverage").textContent = money(average);

  // Current viewed month total in hero card

  const viewedItems = monthItems();

  const viewedTotal = sum(viewedItems);

  $("#heroTotal").textContent =
    money(viewedTotal);


  // TOP CATEGORY - CURRENT MONTH

  const totals = {};

  currentMonthExpenses.forEach(x => {

    totals[x.category] =
      (totals[x.category] || 0) + Number(x.amount);

  });

  const categories = Object.entries(totals)
    .sort((a, b) => b[1] - a[1]);

  $("#sTop").textContent =
    categories[0]?.[0] || "—";

  $("#sTopNote").textContent =
    categories[0]
      ? `${money(categories[0][1])} this month`
      : "Add expenses to discover";


  // CATEGORY BREAKDOWN - VIEWED MONTH

  const breakdownTotals = {};

  viewedItems.forEach(x => {

    breakdownTotals[x.category] =
      (breakdownTotals[x.category] || 0) +
      Number(x.amount);

  });

  const breakdownRows = Object.entries(breakdownTotals)
    .sort((a, b) => b[1] - a[1]);

  $("#breakdown").innerHTML = breakdownRows.length

    ? breakdownRows.map(([category, value]) => {

        const [icon, color] =
          CATS[category] || CATS.Other;

        const percent = viewedTotal
          ? Math.round(value / viewedTotal * 100)
          : 0;

        return `

          <div>

            <div class="bd-top">

              <span>${icon} ${esc(category)}</span>

              <span>
                ${money(value)} · ${percent}%
              </span>

            </div>

            <div class="bd-bar">
              <i style="width:${percent}%;background:${color}"></i>
            </div>

          </div>

        `;

      }).join("")

    : '<p class="muted">No expenses recorded for this month yet.</p>';


  // BUDGET

  const spent = monthlyTotal;

  const progress = budget
    ? spent / budget
    : 0;

  $("#budgetSpent").textContent =
    `${money(spent)} spent`;

  $("#budgetPercent").textContent =
    budget ? `${Math.round(progress * 100)}%` : "—";

  $("#meterFill").style.width =
    budget
      ? Math.min(progress * 100, 100) + "%"
      : "0%";

  $(".progress-track").classList.toggle(
    "warn",
    progress >= 0.8 && progress <= 1
  );

  $(".progress-track").classList.toggle(
    "over",
    progress > 1
  );

  $("#meterText").textContent =

    !budget

      ? "Set a budget to start tracking your progress."

      : progress > 1

        ? `You've exceeded your budget by ${money(spent - budget)}.`

        : progress >= 0.8

          ? `${money(budget - spent)} remaining. You're getting close to your limit.`

          : `${money(budget - spent)} left to spend. You're doing well!`;


  // CHART

  renderChart(viewedItems, viewedTotal);

}


// ========================================
// MONTHLY CHART
// ========================================

function renderChart(items, total) {

  const days = new Date(
    viewedMonth.getFullYear(),
    viewedMonth.getMonth() + 1,
    0
  ).getDate();

  const monthName = viewedMonth.toLocaleDateString(
    "en-IN",
    {
      month: "short",
      year: "numeric"
    }
  );

  $("#monthLabel").textContent = monthName;

  $("#chartTotal").textContent = money(total);

  $("#chartCount").textContent =
    `${items.length} transaction${items.length === 1 ? "" : "s"}`;

  $("#overviewCaption").textContent =
    `Daily activity for ${viewedMonth.toLocaleDateString(
      "en-IN",
      { month: "long", year: "numeric" }
    )}.`;


  const dailyValues = Array(days).fill(0);

  items.forEach(x => {

    const day = Number(x.date.slice(8, 10)) - 1;

    if (day >= 0 && day < days) {
      dailyValues[day] += Number(x.amount);
    }

  });

  const max = Math.max(...dailyValues, 1);

  $("#monthlyChart").innerHTML =
    dailyValues.map((value, index) => {

      const height = value
        ? Math.max(5, value / max * 100)
        : 2;

      return `

        <div class="chart-day"
             title="Day ${index + 1}: ${money(value)}">

          <div class="chart-bar-wrap">

            <i class="chart-bar"
               style="height:${height}%"></i>

          </div>

          <small>${index + 1}</small>

        </div>

      `;

    }).join("");


  $("#chartHint").textContent = total
    ? `Highest day: ${money(max)}`
    : "No spending recorded this month";

}


// ========================================
// TRANSACTION BUTTON EVENTS
// ========================================

$("#list").addEventListener("click", e => {

  const button = e.target.closest("button");

  if (!button) return;

  if (button.dataset.edit) {
    startEdit(button.dataset.edit);
  }

  if (button.dataset.del) {
    removeExpense(button.dataset.del);
  }

});


// ========================================
// FILTER EVENTS
// ========================================

[
  "#fCategory",
  "#fFrom",
  "#fTo",
  "#fSort"
].forEach(selector => {

  $(selector).addEventListener("change", render);

});

$("#fSearch").addEventListener("input", render);


$("#resetBtn").addEventListener("click", () => {

  $("#fCategory").value = "all";

  $("#fFrom").value = "";
  $("#fTo").value = "";

  $("#fSearch").value = "";

  $("#fSort").value = "newest";

  render();

});


// ========================================
// MONTHLY BUDGET
// ========================================

$("#budget").addEventListener("input", e => {

  budget = Math.max(
    0,
    Number(e.target.value) || 0
  );

  write(BKEY, budget);

  render();

});


// ========================================
// MONTH NAVIGATION
// ========================================

$("#prevMonth").addEventListener("click", () => {

  viewedMonth.setMonth(
    viewedMonth.getMonth() - 1
  );

  render();

});


$("#nextMonth").addEventListener("click", () => {

  viewedMonth.setMonth(
    viewedMonth.getMonth() + 1
  );

  render();

});


// ========================================
// DELETE ALL EXPENSES
// ========================================

$("#clearBtn").addEventListener("click", () => {

  if (!expenses.length) return;

  if (!confirm(
    "Delete all saved expenses? This cannot be undone."
  )) return;

  expenses = [];

  if (!write(KEY, expenses)) return;

  lastDeleted = null;

  resetForm();

  render();

  toast("All expenses deleted");

});


// ========================================
// SAMPLE DATA
// ========================================

$("#sampleBtn").addEventListener("click", () => {

  const daysAgo = n => {

    const d = new Date();

    d.setDate(d.getDate() - n);

    return new Date(
      d.getTime() - d.getTimezoneOffset() * 60000
    ).toISOString().slice(0, 10);

  };

  const sample = [

    ["Lunch with friends", 450, "Food", 1],

    ["Metro recharge", 500, "Transport", 2],

    ["Electricity bill", 1850, "Bills", 4],

    ["Movie night", 720, "Entertainment", 5],

    ["Online course", 1299, "Education", 7],

    ["Groceries", 2310.50, "Food", 9],

    ["Pharmacy", 380, "Health", 11],

    ["Headphones", 1999, "Shopping", 13]

  ];

  expenses = sample.map((x, i) => ({

    id: "sample-" + Date.now() + "-" + i,

    title: x[0],

    amount: x[1],

    category: x[2],

    date: daysAgo(x[3]),

    note: ""

  }));

  if (!write(KEY, expenses)) return;

  render();

  toast("Sample transactions added");

});


// ========================================
// DOWNLOAD HELPER
// ========================================

function download(filename, content, type) {

  const blob = new Blob(
    [content],
    { type }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

}


// ========================================
// EXPORT CSV
// ========================================

$("#exportBtn").addEventListener("click", () => {

  if (!expenses.length) {
    toast("No expenses to export yet");
    return;
  }

  const quote = value =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const rows = [

    ["Title", "Amount", "Category", "Date", "Note"],

    ...visible().map(x => [

      x.title,
      x.amount,
      x.category,
      x.date,
      x.note || ""

    ])

  ];

  const csv = rows
    .map(row => row.map(quote).join(","))
    .join("\n");

  download(
    "spendwise-expenses.csv",
    csv,
    "text/csv;charset=utf-8"
  );

  toast("CSV export prepared");

});


// ========================================
// JSON BACKUP
// ========================================

$("#backupBtn").addEventListener("click", () => {

  const backup = {

    app: "SpendWise",

    version: 2,

    exportedAt: new Date().toISOString(),

    budget,

    expenses

  };

  download(
    "spendwise-backup.json",
    JSON.stringify(backup, null, 2),
    "application/json"
  );

  toast("Backup downloaded successfully");

});


// ========================================
// RESTORE JSON BACKUP
// ========================================

$("#importFile").addEventListener("change", async e => {

  const file = e.target.files[0];

  if (!file) return;

  try {

    const data = JSON.parse(
      await file.text()
    );

    const valid = Array.isArray(data.expenses) &&
      data.expenses.every(x =>
        x &&
        typeof x.title === "string" &&
        Number(x.amount) > 0 &&
        CATS[x.category] &&
        /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
        !Number.isNaN(Date.parse(x.date + "T00:00:00")) &&
        x.date <= today()
      );

    if (!valid) {
      throw new Error("Invalid backup");
    }

    if (!confirm(
      `Restore ${data.expenses.length} expenses? This will replace current saved expenses.`
    )) {
      return;
    }

    const oldExpenses = expenses;
    const oldBudget = budget;

    expenses = data.expenses.map(x => ({
      ...x,
      id: String(
        x.id || crypto.randomUUID?.() || Date.now()
      )
    }));

    budget = Math.max(
      0,
      Number(data.budget) || 0
    );

    if (
      !write(KEY, expenses) ||
      !write(BKEY, budget)
    ) {

      expenses = oldExpenses;
      budget = oldBudget;

      write(KEY, expenses);
      write(BKEY, budget);

      $("#budget").value = budget || "";

      render();

      return;
    }

    $("#budget").value = budget || "";

    resetForm();

    render();

    toast("Backup restored successfully");

  } catch {

    alert(
      "Could not restore this file. Please select a valid SpendWise JSON backup."
    );

  } finally {

    e.target.value = "";

  }

});


// ========================================
// TOAST NOTIFICATIONS
// ========================================

function toast(message, undo = false) {

  clearTimeout(toastTimer);

  $("#toastMsg").textContent = message;

  $("#toastUndo").hidden = !undo;

  $("#toast").hidden = false;

  toastTimer = setTimeout(() => {

    $("#toast").hidden = true;

  }, 5000);

}


// ========================================
// UNDO DELETE
// ========================================

$("#toastUndo").addEventListener("click", () => {

  if (!lastDeleted) return;

  expenses.splice(
    lastDeleted.index,
    0,
    lastDeleted.item
  );

  lastDeleted = null;

  if (!write(KEY, expenses)) return;

  render();

  $("#toast").hidden = true;

});


// ========================================
// DARK / LIGHT MODE
// ========================================

function setTheme(theme) {

  document.documentElement.dataset.theme = theme;

  $("#themeBtn").textContent =
    theme === "dark" ? "☀" : "☾";

  $("#themeBtn").setAttribute(
    "aria-label",
    theme === "dark"
      ? "Switch to light mode"
      : "Switch to dark mode"
  );

}

let savedTheme = null;

try {

  savedTheme = localStorage.getItem(TKEY);

} catch {}

setTheme(
  savedTheme ||
  (
    matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  )
);

$("#themeBtn").addEventListener("click", () => {

  const nextTheme =
    document.documentElement.dataset.theme === "dark"
      ? "light"
      : "dark";

  setTheme(nextTheme);

  try {

    localStorage.setItem(TKEY, nextTheme);

  } catch {}

});


// ========================================
// INITIALIZE APPLICATION
// ========================================

render();
