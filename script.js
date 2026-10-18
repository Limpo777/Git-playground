(function () {
  "use strict";

  const STORAGE_KEY = "ledgerly-expenses";
  const icons = {
    "Food & dining": ["food", "☕"],
    Transport: ["transport", "↗"],
    Shopping: ["shopping", "◇"],
    Entertainment: ["entertainment", "♪"],
    "Bills & utilities": ["bills", "⌂"],
    Health: ["health", "+"],
    Other: ["other", "·"]
  };
  let expenses = loadExpenses();
  let toastTimer;

  const $ = (id) => document.getElementById(id);
  const modal = $("expense-modal");
  const form = $("expense-form");

  function loadExpenses() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Could not load saved expenses.", error);
      return [];
    }
  }

  function saveExpenses() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
    } catch (error) {
      console.error("Could not save expenses.", error);
      showToast("Could not save this expense.");
    }
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  }

  function render() {
    const query = $("search-input").value.trim().toLowerCase();
    const filter = $("category-filter").value;
    const visible = expenses
      .filter((expense) => filter === "all" || expense.category === filter)
      .filter((expense) => `${expense.description} ${expense.note} ${expense.category}`.toLowerCase().includes(query))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const average = expenses.length ? total / expenses.length : 0;

    $("total-spent").textContent = formatCurrency(total);
    $("average-spent").textContent = formatCurrency(average);
    $("entry-count").textContent = `${expenses.length} ${expenses.length === 1 ? "entry" : "entries"} recorded`;
    renderTopCategory(total);
    renderList(visible);
    renderCategorySummary(total);
    updateCategoryFilter();
  }

  function renderTopCategory(total) {
    const totals = getCategoryTotals();
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    $("top-category").textContent = top ? top[0] : "—";
    $("top-category-detail").textContent = top ? `${formatCurrency(top[1])} of your spending` : "Add an expense to see your biggest spend.";
    $("top-category-bar").style.width = top && total ? `${Math.round((top[1] / total) * 100)}%` : "0";
  }

  function renderList(visible) {
    const list = $("expense-list");
    $("empty-state").hidden = visible.length > 0;
    list.innerHTML = visible.map((expense) => {
      const icon = icons[expense.category] || icons.Other;
      return `<article class="expense-row">
        <div class="expense-icon ${icon[0]}" aria-hidden="true">${icon[1]}</div>
        <div class="expense-info"><p class="expense-name">${escapeHtml(expense.description)}</p><p class="expense-meta">${escapeHtml(expense.category)} · ${formatDate(expense.date)}${expense.note ? ` · ${escapeHtml(expense.note)}` : ""}</p></div>
        <strong class="expense-amount">${formatCurrency(expense.amount)}</strong>
        <div class="row-actions"><button class="icon-button" type="button" data-action="edit" data-id="${expense.id}" aria-label="Edit ${escapeHtml(expense.description)}">✎</button><button class="icon-button" type="button" data-action="delete" data-id="${expense.id}" aria-label="Delete ${escapeHtml(expense.description)}">⌫</button></div>
      </article>`;
    }).join("");
  }

  function renderCategorySummary(total) {
    const totals = getCategoryTotals();
    const categories = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $("category-summary").innerHTML = categories.length ? categories.map(([category, value]) => `
      <div class="category-line"><div class="category-line-head"><span>${escapeHtml(category)}</span><strong>${formatCurrency(value)}</strong></div><div class="category-progress"><span style="width: ${total ? Math.max(4, value / total * 100) : 0}%"></span></div></div>
    `).join("") : `<p class="muted">Your category breakdown will appear after your first entry.</p>`;
    $("spending-tip").textContent = categories.length ? `${categories[0][0]} is your biggest category. A quick review can reveal useful patterns.` : "Your spending story will appear here.";
  }

  function getCategoryTotals() {
    return expenses.reduce((totals, expense) => {
      totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
      return totals;
    }, {});
  }

  function updateCategoryFilter() {
    const select = $("category-filter");
    const current = select.value;
    const categories = [...new Set(expenses.map((expense) => expense.category))].sort();
    select.innerHTML = `<option value="all">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
    select.value = categories.includes(current) ? current : "all";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
  }

  function openForm(expense) {
    form.reset();
    clearErrors();
    $("expense-id").value = expense ? expense.id : "";
    $("modal-title").textContent = expense ? "Edit expense" : "Add an expense";
    if (expense) {
      $("description").value = expense.description;
      $("amount").value = expense.amount;
      $("date").value = expense.date;
      $("category").value = expense.category;
      $("note").value = expense.note || "";
    } else {
      $("date").value = new Date().toISOString().slice(0, 10);
    }
    modal.hidden = false;
    $("description").focus();
  }

  function closeForm() { modal.hidden = true; }
  function clearErrors() { document.querySelectorAll(".field-error").forEach((element) => { element.textContent = ""; }); }

  function validate() {
    clearErrors();
    let valid = true;
    const fields = [["description", "description-error", "Add a description."], ["amount", "amount-error", "Enter an amount greater than zero."], ["date", "date-error", "Choose a date."], ["category", "category-error", "Choose a category."]];
    fields.forEach(([fieldId, errorId, message]) => {
      const field = $(fieldId);
      if (!field.value || (fieldId === "amount" && Number(field.value) <= 0)) { $(errorId).textContent = message; valid = false; }
    });
    return valid;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validate()) return;
    const id = $("expense-id").value;
    const expense = { id: id || `${Date.now()}-${Math.random().toString(16).slice(2)}`, description: $("description").value.trim(), amount: Number($("amount").value), date: $("date").value, category: $("category").value, note: $("note").value.trim() };
    const index = expenses.findIndex((item) => item.id === id);
    if (index >= 0) expenses[index] = expense; else expenses.push(expense);
    saveExpenses();
    closeForm();
    render();
    showToast(index >= 0 ? "Expense updated." : "Expense saved.");
  });

  $("expense-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const expense = expenses.find((item) => item.id === button.dataset.id);
    if (!expense) return;
    if (button.dataset.action === "edit") openForm(expense);
    if (button.dataset.action === "delete") {
      expenses = expenses.filter((item) => item.id !== expense.id);
      saveExpenses();
      render();
      showToast("Expense deleted.");
    }
  });

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
  }

  $("open-form").addEventListener("click", () => openForm());
  $("empty-add").addEventListener("click", () => openForm());
  $("close-form").addEventListener("click", closeForm);
  $("cancel-form").addEventListener("click", closeForm);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeForm(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) closeForm(); });
  $("search-input").addEventListener("input", render);
  $("category-filter").addEventListener("change", render);
  render();
})();
