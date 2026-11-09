/**
 * @file main.js
 * @fileoverview Application logic for the Personal Finance Tracker.
 *
 * ARCHITECTURE: one-way data flow
 *
 *   User event ──► handler ──► state update ──► localStorage ──► render() ──► DOM
 *
 * Golden rule: the DOM is never the source of truth. We only ever change
 * `state`, then call `render()` so the screen matches the state. This is the
 * same mental model used by React, Vue and Svelte.
 *
 * FILE LAYOUT
 *   1. Type definitions     6. Selectors (derived data)
 *   2. Constants            7. Validation
 *   3. State                8. Utilities
 *   4. Persistence          9. Rendering
 *   5. State mutations     10. Event handlers
 *                          11. Initialization
 *
 * @author Yugal Thapa
 * @version 1.0.0
 */
 
'use strict';
 
/* ==========================================================================
   1. TYPE DEFINITIONS (JSDoc only: zero runtime cost, great editor hints)
   ========================================================================== */
 
/** @typedef {'income' | 'expense'} TransactionType */
 
/**
 * A single financial transaction.
 * @typedef {Object} Transaction
 * @property {string} id            Unique identifier.
 * @property {string} description   Short human-readable label.
 * @property {number} amount        Always POSITIVE. The sign comes from `type`.
 * @property {TransactionType} type Whether money came in or went out.
 * @property {string} category      One of the keys in {@link CATEGORIES}.
 * @property {string} date          Calendar date in ISO format (YYYY-MM-DD).
 */
 
/**
 * Active list filters. These are UI state and are not persisted.
 * @typedef {Object} Filters
 * @property {'all' | TransactionType} type
 * @property {string} category  `'all'` or a category name.
 */
 
/**
 * The single source of truth for the whole app.
 * @typedef {Object} AppState
 * @property {Transaction[]} transactions
 * @property {Filters} filters
 */
 
/**
 * @typedef {Object} Totals
 * @property {number} income
 * @property {number} expense
 * @property {number} balance
 */
 
/**
 * @typedef {Object} CategorySummary
 * @property {string} category
 * @property {number} total    Sum of expenses in this category.
 * @property {number} percent  Share of all expenses (0–100).
 */
 
/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid
 * @property {Record<string, string>} errors  Field name → error message.
 * @property {Omit<Transaction, 'id'> | null} values  Clean values, or null if invalid.
 */
 
/* ==========================================================================
   2. CONSTANTS
   ========================================================================== */
 
/**
 * localStorage key. The `v1` suffix lets you migrate the data shape later.
 * @constant {string}
 */
const STORAGE_KEY = 'financeTracker.transactions.v1';
 
/**
 * Category metadata: the single source of truth for names, icons and colours.
 * Add a category here and it appears in every dropdown automatically.
 * @constant {Readonly<Record<string, {icon: string, color: string}>>}
 */
const CATEGORIES = Object.freeze({
  Salary:        { icon: 'briefcase',    color: '#10b981' },
  Freelance:     { icon: 'laptop',       color: '#14b8a6' },
  Investments:   { icon: 'trending-up',  color: '#0ea5e9' },
  Housing:       { icon: 'house',        color: '#6366f1' },
  Food:          { icon: 'utensils',     color: '#f59e0b' },
  Transport:     { icon: 'car',          color: '#3b82f6' },
  Utilities:     { icon: 'zap',          color: '#eab308' },
  Entertainment: { icon: 'film',         color: '#ec4899' },
  Shopping:      { icon: 'shopping-bag', color: '#8b5cf6' },
  Health:        { icon: 'heart-pulse',  color: '#ef4444' },
  Other:         { icon: 'tag',          color: '#64748b' },
});
 
/** @constant {string[]} */
const CATEGORY_NAMES = Object.keys(CATEGORIES);
 
/** @constant {number} */
const MAX_DESCRIPTION_LENGTH = 60;
 
/** @constant {number} */
const MAX_AMOUNT = 1_000_000_000;
 
/** Form field names, in visual order (used to focus the first invalid field). */
const FORM_FIELDS = ['type', 'description', 'amount', 'date', 'category'];
 
/** Reusable formatters (creating these once is faster than per call). */
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
 
/* ==========================================================================
   3. STATE
   ========================================================================== */
 
/**
 * The application state. Read it anywhere; change it ONLY through the
 * mutation functions in section 5.
 *
 * Tip: because this is a top-level `const` in a classic script, you can type
 * `state` in the DevTools Console to inspect it live.
 *
 * @type {AppState}
 */
const state = {
  transactions: [],
  filters: { type: 'all', category: 'all' },
};
 
/**
 * Cached DOM references, filled once by {@link cacheDom}.
 * Looking elements up once avoids repeated `getElementById` calls.
 * @type {Object<string, any>}
 */
const dom = {};
 
/** @type {number | undefined} Timer id for auto-hiding the toast. */
let toastTimer;
 
/* ==========================================================================
   4. PERSISTENCE (localStorage)
   ========================================================================== */
 
/**
 * Loads transactions from localStorage.
 *
 * localStorage only stores STRINGS, so we must `JSON.parse` the stored value.
 * Any failure (corrupt JSON, wrong shape) falls back to an empty array so
 * the app never crashes on startup.
 *
 * @returns {Transaction[]} The saved transactions, or `[]` if none or invalid.
 */
function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return []; // First visit: nothing saved yet.
 
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new TypeError('Stored data is not an array.');
    }
 
    // Defensive: drop malformed entries and coerce amounts back to numbers.
    return parsed
      .filter(isValidTransaction)
      .map((t) => ({ ...t, amount: Number(t.amount) }));
  } catch (error) {
    console.error('[storage] Failed to load transactions:', error);
    return [];
  }
}
 
/**
 * Persists transactions to localStorage as a JSON string.
 *
 * @param {Transaction[]} transactions - The full list to save.
 * @returns {boolean} `true` if saved, `false` if the browser refused
 *   (e.g. storage full or disabled in private mode).
 */
function saveTransactions(transactions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    return true;
  } catch (error) {
    console.error('[storage] Failed to save transactions:', error);
    showToast('Could not save. Browser storage may be full or disabled.', 'error');
    return false;
  }
}
 
/**
 * Runtime shape check for data coming from storage (which we don't fully trust).
 *
 * @param {unknown} t - A value read from storage.
 * @returns {boolean} `true` if `t` looks like a valid {@link Transaction}.
 */
function isValidTransaction(t) {
  return (
    t !== null &&
    typeof t === 'object' &&
    typeof t.id === 'string' &&
    typeof t.description === 'string' &&
    Number.isFinite(Number(t.amount)) &&
    (t.type === 'income' || t.type === 'expense') &&
    typeof t.category === 'string' &&
    typeof t.date === 'string'
  );
}
 
/* ==========================================================================
   5. STATE MUTATIONS (the ONLY place state.transactions changes)
   ========================================================================== */
 
/**
 * Replaces the transaction list, persists it, and re-renders the UI.
 *
 * Every data change funnels through here. That gives us one place to
 * log, debug, or add features like undo. It is the vanilla equivalent of
 * React's `setState`.
 *
 * @param {Transaction[]} nextTransactions - The new, complete list.
 * @returns {void}
 */
function commitTransactions(nextTransactions) {
  state.transactions = nextTransactions;
  saveTransactions(state.transactions);
  render();
}
 
/**
 * Adds a transaction to the start of the list (newest first).
 * Uses the spread operator to create a NEW array instead of mutating with
 * `push`. Immutable updates make changes easy to track.
 *
 * @param {Transaction} transaction - A fully validated transaction.
 * @returns {void}
 */
function addTransaction(transaction) {
  commitTransactions([transaction, ...state.transactions]);
}
 
/**
 * Removes a transaction by id.
 *
 * @param {string} id - The id of the transaction to delete.
 * @returns {void}
 */
function deleteTransaction(id) {
  commitTransactions(state.transactions.filter((t) => t.id !== id));
}
 
/**
 * Updates a single filter and re-renders. Filters are UI state, so they
 * are not saved to localStorage.
 *
 * @param {keyof Filters} key - `'type'` or `'category'`.
 * @param {string} value - The new filter value.
 * @returns {void}
 */
function setFilter(key, value) {
  state.filters = { ...state.filters, [key]: value };
  render();
}
 
/* ==========================================================================
   6. SELECTORS (pure functions: same input → same output, no side effects)
   ========================================================================== */
 
/**
 * Returns the transactions that match the active filters, newest date first.
 * `.filter()` returns a new array, so the `.sort()` never mutates state.
 *
 * @param {Transaction[]} transactions - All transactions.
 * @param {Filters} filters - Active filters.
 * @returns {Transaction[]} A new, filtered and sorted array.
 */
function getVisibleTransactions(transactions, filters) {
  return transactions
    .filter((t) => filters.type === 'all' || t.type === filters.type)
    .filter((t) => filters.category === 'all' || t.category === filters.category)
    .sort((a, b) => b.date.localeCompare(a.date)); // ISO dates sort alphabetically.
}
 
/**
 * Calculates income, expense and balance totals.
 *
 * Money math is done in integer CENTS to avoid floating-point errors
 * (in JS, 0.1 + 0.2 === 0.30000000000000004).
 *
 * @param {Transaction[]} transactions - Transactions to total.
 * @returns {Totals} Totals in dollars.
 * @example
 * calculateTotals([{ amount: 10, type: 'income' }, { amount: 4, type: 'expense' }]);
 * // → { income: 10, expense: 4, balance: 6 }
 */
function calculateTotals(transactions) {
  let incomeCents = 0;
  let expenseCents = 0;
 
  for (const t of transactions) {
    const cents = toCents(t.amount);
    if (t.type === 'income') incomeCents += cents;
    else expenseCents += cents;
  }
 
  return {
    income: incomeCents / 100,
    expense: expenseCents / 100,
    balance: (incomeCents - expenseCents) / 100,
  };
}
 
/**
 * Groups EXPENSES by category and computes each category's share.
 *
 * @param {Transaction[]} transactions - All transactions.
 * @returns {CategorySummary[]} Categories sorted from largest to smallest spend.
 */
function getCategoryBreakdown(transactions) {
  /** @type {Map<string, number>} category → cents */
  const centsByCategory = new Map();
  let totalCents = 0;
 
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const cents = toCents(t.amount);
    centsByCategory.set(t.category, (centsByCategory.get(t.category) ?? 0) + cents);
    totalCents += cents;
  }
 
  return [...centsByCategory]
    .map(([category, cents]) => ({
      category,
      total: cents / 100,
      percent: totalCents > 0 ? (cents / totalCents) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}
 
/* ==========================================================================
   7. VALIDATION
   ========================================================================== */
 
/**
 * Validates and normalizes raw form input.
 *
 * Never trust form input: values arrive as STRINGS and may be empty,
 * malformed, or tampered with in DevTools.
 *
 * @param {FormData} formData - Data from the transaction form.
 * @returns {ValidationResult} Whether the input is valid, any errors, and clean values.
 */
function validateTransactionInput(formData) {
  const description = String(formData.get('description') ?? '').trim();
  const amountRaw = String(formData.get('amount') ?? '').trim();
  const amount = Number(amountRaw);
  const type = formData.get('type');
  const category = String(formData.get('category') ?? '');
  const date = String(formData.get('date') ?? '');
 
  /** @type {Record<string, string>} */
  const errors = {};
 
  if (type !== 'income' && type !== 'expense') {
    errors.type = 'Choose income or expense.';
  }
 
  if (!description) {
    errors.description = 'Please enter a description.';
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Keep it under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }
 
  if (amountRaw === '') {
    errors.amount = 'Please enter an amount.';
  } else if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Amount must be greater than 0.';
  } else if (amount > MAX_AMOUNT) {
    errors.amount = 'That amount is too large.';
  }
 
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
    errors.date = 'Please pick a valid date.';
  }
 
  if (!CATEGORY_NAMES.includes(category)) {
    errors.category = 'Please choose a category.';
  }
 
  const isValid = Object.keys(errors).length === 0;
 
  return {
    isValid,
    errors,
    values: isValid
      ? {
          description,
          amount: toCents(amount) / 100, // Round to 2 decimal places.
          type: /** @type {TransactionType} */ (type),
          category,
          date,
        }
      : null,
  };
}
 
/* ==========================================================================
   8. UTILITIES
   ========================================================================== */
 
/**
 * Generates a unique id. Uses the built-in `crypto.randomUUID` when
 * available (secure contexts), otherwise a timestamp + random fallback.
 *
 * @returns {string} A unique id string.
 */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
 
/**
 * Converts a dollar value to integer cents.
 *
 * @param {number | string} value - A dollar amount.
 * @returns {number} Whole cents (NaN if `value` is not numeric, a common bug source!).
 */
function toCents(value) {
  return Math.round(Number(value) * 100);
}
 
/**
 * Formats a number as US currency.
 *
 * @param {number} value - Amount in dollars.
 * @returns {string} e.g. `"$1,234.50"`.
 */
function formatCurrency(value) {
  return currencyFormatter.format(value);
}
 
/**
 * Formats an ISO date for display. The date is parsed as LOCAL time on purpose.
 * `new Date('2026-11-04')` is parsed as UTC midnight, which can show up as the
 * previous day in American time zones.
 *
 * @param {string} isoDate - Date in `YYYY-MM-DD` format.
 * @returns {string} e.g. `"Nov 4, 2026"`.
 */
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return dateFormatter.format(new Date(year, month - 1, day));
}
 
/**
 * Converts a Date to a local `YYYY-MM-DD` string.
 *
 * @param {Date} date - Any Date object.
 * @returns {string} The local calendar date in ISO format.
 */
function toISODate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
 
/**
 * @returns {string} Today's local date as `YYYY-MM-DD`.
 */
function getTodayISO() {
  return toISODate(new Date());
}
 
/**
 * Escapes HTML special characters so user text can be safely inserted with
 * `innerHTML`. Without this, a description like `<img src=x onerror=alert(1)>`
 * would execute code (an XSS attack).
 *
 * @param {unknown} value - Any value to display.
 * @returns {string} HTML-safe string.
 */
function escapeHTML(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (ch) => map[ch]);
}
 
/**
 * Returns a count with the correctly pluralized noun.
 *
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural] - Defaults to `singular + 's'`.
 * @returns {string} e.g. `"1 transaction"`, `"3 transactions"`.
 */
function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
 
/**
 * Builds demo transactions dated relative to today.
 *
 * @returns {Transaction[]} Sample data for exploring the UI.
 */
function buildSampleTransactions() {
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return toISODate(d);
  };
 
  /** @type {Array<[string, number, TransactionType, string, number]>} */
  const samples = [
    ['Monthly salary',   4200,   'income',  'Salary',        2],
    ['Logo design gig',   650,   'income',  'Freelance',     9],
    ['Rent',             1450,   'expense', 'Housing',       3],
    ['Weekly groceries',  128.45,'expense', 'Food',          1],
    ['Electricity bill',   86.2, 'expense', 'Utilities',     5],
    ['Monthly bus pass',   55,   'expense', 'Transport',     6],
    ['Concert tickets',   120,   'expense', 'Entertainment', 8],
    ['Coffee & lunch',     23.75,'expense', 'Food',          0],
  ];
 
  return samples.map(([description, amount, type, category, ago]) => ({
    id: generateId(),
    description,
    amount,
    type,
    category,
    date: daysAgo(ago),
  }));
}
 
/* ==========================================================================
   9. RENDERING (state → DOM)
   ========================================================================== */
 
/**
 * Re-draws every dynamic part of the UI from the current state.
 * Rendering everything is simple and predictable; frameworks optimize this
 * same idea with a "virtual DOM" or fine-grained reactivity.
 *
 * @returns {void}
 */
function render() {
  const visible = getVisibleTransactions(state.transactions, state.filters);
 
  renderMetrics(calculateTotals(state.transactions));
  renderTransactions(visible);
  renderBreakdown(getCategoryBreakdown(state.transactions));
  renderFilterControls();
  refreshIcons();
}
 
/**
 * Updates the three metric cards.
 *
 * @param {Totals} totals - Computed totals.
 * @returns {void}
 */
function renderMetrics({ income, expense, balance }) {
  dom.balanceAmount.textContent = formatCurrency(balance);
  dom.balanceAmount.classList.toggle('text-rose-600', balance < 0);
 
  dom.incomeAmount.textContent = formatCurrency(income);
  dom.expenseAmount.textContent = formatCurrency(expense);
 
  const incomeCount = state.transactions.filter((t) => t.type === 'income').length;
  const expenseCount = state.transactions.length - incomeCount;
  dom.incomeCaption.textContent = pluralize(incomeCount, 'transaction');
  dom.expenseCaption.textContent = pluralize(expenseCount, 'transaction');
}
 
/**
 * Renders the transaction list, or the empty state when nothing matches.
 *
 * @param {Transaction[]} visible - Already-filtered transactions.
 * @returns {void}
 */
function renderTransactions(visible) {
  const total = state.transactions.length;
  const isEmpty = visible.length === 0;
 
  // replaceChildren swaps all rows in one DOM operation.
  dom.list.replaceChildren(...visible.map(createTransactionRow));
 
  dom.list.hidden = isEmpty;
  dom.emptyState.hidden = !isEmpty;
  dom.resultCount.textContent = `Showing ${visible.length} of ${pluralize(total, 'transaction')}`;
 
  if (isEmpty) {
    const hasData = total > 0;
    dom.emptyTitle.textContent = hasData ? 'No matching transactions' : 'No transactions yet';
    dom.emptyText.textContent = hasData
      ? 'Try a different type or category filter.'
      : 'Add your first transaction with the form, or load sample data to explore.';
    dom.seedBtn.hidden = hasData;
  }
}
 
/**
 * Creates the `<li>` element for a single transaction.
 * User-provided text is passed through {@link escapeHTML} before use in `innerHTML`.
 *
 * @param {Transaction} transaction - The transaction to display.
 * @param {number} index - Position in the list (drives the stagger animation).
 * @returns {HTMLLIElement} The row element.
 */
function createTransactionRow(transaction, index) {
  const { id, description, amount, type, category, date } = transaction;
  const meta = CATEGORIES[category] ?? CATEGORIES.Other;
  const isIncome = type === 'income';
  const safeDescription = escapeHTML(description);
 
  const li = document.createElement('li');
  li.className = 'tx-row flex items-center gap-4 px-5 py-3.5';
  li.style.setProperty('--i', String(index));
  li.dataset.id = id;
 
  li.innerHTML = `
    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style="background:${meta.color}1a;color:${meta.color}">
      <i data-lucide="${meta.icon}" class="h-5 w-5"></i>
    </span>
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-slate-800">${safeDescription}</p>
      <p class="text-xs text-slate-500">${escapeHTML(category)} · ${formatDate(date)}</p>
    </div>
    <p class="whitespace-nowrap text-sm font-semibold tabular-nums ${isIncome ? 'text-emerald-600' : 'text-rose-600'}">
      ${isIncome ? '+' : '−'}${formatCurrency(amount)}
    </p>
    <button type="button" data-action="delete" data-id="${escapeHTML(id)}"
            class="delete-btn rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            aria-label="Delete ${safeDescription}">
      <i data-lucide="trash-2" class="h-4 w-4"></i>
    </button>
  `;
 
  return li;
}
 
/**
 * Renders the expense-by-category progress bars.
 * Bars start at 0% width, then grow on the next frame so the CSS
 * transition animates them.
 *
 * @param {CategorySummary[]} breakdown - Sorted category summaries.
 * @returns {void}
 */
function renderBreakdown(breakdown) {
  if (breakdown.length === 0) {
    dom.breakdownTotal.textContent = '';
    dom.breakdownList.innerHTML =
      '<li class="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No expenses recorded yet.</li>';
    return;
  }
 
  const totalExpense = breakdown.reduce((sum, item) => sum + item.total, 0);
  dom.breakdownTotal.textContent =
    `${formatCurrency(totalExpense)} across ${pluralize(breakdown.length, 'category', 'categories')}`;
 
  dom.breakdownList.innerHTML = breakdown
    .map(({ category, total, percent }) => {
      const { color } = CATEGORIES[category] ?? CATEGORIES.Other;
      return `
        <li>
          <div class="mb-1.5 flex items-center justify-between gap-2 text-sm">
            <span class="flex items-center gap-2 font-medium text-slate-700">
              <span class="h-2.5 w-2.5 rounded-full" style="background:${color}"></span>
              ${escapeHTML(category)}
            </span>
            <span class="tabular-nums text-slate-500">
              ${formatCurrency(total)} <span class="text-slate-400">· ${percent.toFixed(0)}%</span>
            </span>
          </div>
          <div class="progress-track" role="progressbar" aria-label="${escapeHTML(category)}"
               aria-valuenow="${percent.toFixed(0)}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-fill" style="width:0;background:${color}" data-width="${percent.toFixed(2)}"></div>
          </div>
        </li>`;
    })
    .join('');
 
  // Double rAF: wait until the browser has painted width:0, then animate.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      dom.breakdownList.querySelectorAll('.progress-fill').forEach((bar) => {
        bar.style.width = `${bar.dataset.width}%`;
      });
    })
  );
}
 
/**
 * Syncs filter controls with `state.filters` (state → UI, never the reverse).
 *
 * @returns {void}
 */
function renderFilterControls() {
  dom.typeFilterButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.filterType === state.filters.type));
  });
  dom.categoryFilter.value = state.filters.category;
}
 
/**
 * Shows (or clears) validation messages under each form field.
 *
 * @param {Record<string, string>} errors - Field name → message. Missing = valid.
 * @returns {void}
 */
function renderFormErrors(errors) {
  FORM_FIELDS.forEach((field) => setFieldError(field, errors[field] ?? ''));
}
 
/**
 * Sets or clears the error state for one field.
 *
 * @param {string} field - The input's `name` attribute.
 * @param {string} message - Error text, or `''` to clear.
 * @returns {void}
 */
function setFieldError(field, message) {
  const errorEl = dom.form.querySelector(`[data-error-for="${field}"]`);
  if (errorEl) errorEl.textContent = message;
 
  // For radio groups, namedItem() returns a RadioNodeList (not an element), so we skip styling.
  const control = dom.form.elements.namedItem(field);
  if (control instanceof HTMLElement) {
    control.classList.toggle('input-error', Boolean(message));
    control.setAttribute('aria-invalid', String(Boolean(message)));
  }
}
 
/**
 * Displays a short notification at the bottom of the screen.
 *
 * @param {string} message - Text to show (set via textContent, so it's XSS-safe).
 * @param {'success' | 'error'} [variant='success'] - Visual style.
 * @returns {void}
 */
function showToast(message, variant = 'success') {
  dom.toast.textContent = message;
  dom.toast.dataset.variant = variant;
  dom.toast.classList.add('is-visible');
 
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 2500);
}
 
/**
 * Converts any new `<i data-lucide="...">` placeholders into SVG icons.
 * Must run after every render because new rows bring new placeholders.
 *
 * @returns {void}
 */
function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  } else {
    console.warn('[icons] Lucide did not load. Check the Network tab for the CDN request.');
  }
}
 
/* ==========================================================================
   10. EVENT HANDLERS (UI → state)
   ========================================================================== */
 
/**
 * Handles form submission: validate → add to state → reset form.
 *
 * @param {SubmitEvent} event
 * @returns {void}
 */
function handleFormSubmit(event) {
  event.preventDefault(); // Stop the browser from reloading the page.
 
  const result = validateTransactionInput(new FormData(dom.form));
  renderFormErrors(result.errors);
 
  if (!result.isValid) {
    const firstInvalid = FORM_FIELDS.find((field) => result.errors[field]);
    dom.form.querySelector(`[name="${firstInvalid}"]`)?.focus();
    return; // Guard clause: bad data never reaches state.
  }
 
  addTransaction({ id: generateId(), ...result.values });
  resetForm();
  showToast(`Added "${result.values.description}"`);
}
 
/**
 * Clears a field's error as soon as the user starts fixing it.
 *
 * @param {Event} event - An `input` or `change` event from the form.
 * @returns {void}
 */
function handleFormInput(event) {
  const { name } = /** @type {HTMLInputElement} */ (event.target);
  if (FORM_FIELDS.includes(name)) setFieldError(name, '');
}
 
/**
 * Handles clicks anywhere in the transaction list (EVENT DELEGATION).
 * One listener on the parent `<ul>` handles every delete button, including
 * rows created later. No need to attach a listener per row.
 *
 * @param {MouseEvent} event
 * @returns {void}
 */
function handleListClick(event) {
  const button = /** @type {HTMLElement} */ (event.target).closest('[data-action="delete"]');
  if (!button) return; // Click was not on a delete button.
 
  const { id } = button.dataset;
  const transaction = state.transactions.find((t) => t.id === id);
 
  if (!transaction) {
    console.warn('[delete] No transaction found with id:', id);
    return;
  }
 
  if (!window.confirm(`Delete "${transaction.description}"?`)) return;
 
  deleteTransaction(id);
  showToast('Transaction deleted');
}
 
/**
 * Handles clicks on the All / Income / Expense segmented control (delegated).
 *
 * @param {MouseEvent} event
 * @returns {void}
 */
function handleTypeFilterClick(event) {
  const button = /** @type {HTMLElement} */ (event.target).closest('[data-filter-type]');
  if (button) setFilter('type', button.dataset.filterType);
}
 
/**
 * Handles changes to the category dropdown.
 *
 * @param {Event} event
 * @returns {void}
 */
function handleCategoryFilterChange(event) {
  setFilter('category', /** @type {HTMLSelectElement} */ (event.target).value);
}
 
/**
 * Loads demo data so the dashboard can be explored immediately.
 *
 * @returns {void}
 */
function handleSeedClick() {
  commitTransactions(buildSampleTransactions());
  showToast('Sample data loaded');
}
 
/**
 * Keeps multiple open tabs in sync. The `storage` event fires in OTHER tabs
 * when localStorage changes.
 *
 * @param {StorageEvent} event
 * @returns {void}
 */
function handleStorageSync(event) {
  if (event.key !== STORAGE_KEY) return;
  state.transactions = loadTransactions();
  render();
}
 
/**
 * Resets the form to its default values and focuses the first field.
 *
 * @returns {void}
 */
function resetForm() {
  dom.form.reset();
  dom.dateInput.value = getTodayISO();
  renderFormErrors({});
  dom.descriptionInput.focus();
}
 
/* ==========================================================================
   11. INITIALIZATION
   ========================================================================== */
 
/**
 * Looks up and caches every DOM element the app needs.
 *
 * @returns {void}
 */
function cacheDom() {
  const byId = (id) => document.getElementById(id);
 
  Object.assign(dom, {
    form: byId('transaction-form'),
    descriptionInput: byId('description'),
    dateInput: byId('date'),
    categorySelect: byId('category'),
 
    balanceAmount: byId('balance-amount'),
    incomeAmount: byId('income-amount'),
    incomeCaption: byId('income-caption'),
    expenseAmount: byId('expense-amount'),
    expenseCaption: byId('expense-caption'),
 
    list: byId('transaction-list'),
    resultCount: byId('result-count'),
    emptyState: byId('empty-state'),
    emptyTitle: byId('empty-title'),
    emptyText: byId('empty-text'),
    seedBtn: byId('seed-btn'),
 
    typeFilter: byId('type-filter'),
    typeFilterButtons: document.querySelectorAll('[data-filter-type]'),
    categoryFilter: byId('category-filter'),
 
    breakdownList: byId('breakdown-list'),
    breakdownTotal: byId('breakdown-total'),
 
    toast: byId('toast'),
    todayLabel: byId('today-label'),
  });
}
 
/**
 * Fills both category dropdowns from the {@link CATEGORIES} constant.
 *
 * @returns {void}
 */
function populateCategorySelects() {
  dom.categorySelect.append(...CATEGORY_NAMES.map((name) => new Option(name, name)));
  dom.categoryFilter.append(...CATEGORY_NAMES.map((name) => new Option(name, name)));
}
 
/**
 * Attaches all event listeners. Kept in one place so you can see every
 * way the user can interact with the app at a glance.
 *
 * @returns {void}
 */
function bindEvents() {
  dom.form.addEventListener('submit', handleFormSubmit);
  dom.form.addEventListener('input', handleFormInput);
  dom.form.addEventListener('change', handleFormInput);
  dom.list.addEventListener('click', handleListClick);
  dom.typeFilter.addEventListener('click', handleTypeFilterClick);
  dom.categoryFilter.addEventListener('change', handleCategoryFilterChange);
  dom.seedBtn.addEventListener('click', handleSeedClick);
  window.addEventListener('storage', handleStorageSync);
}
 
/**
 * App entry point: cache DOM → set up controls → load data → listen → render.
 *
 * @returns {void}
 */
function init() {
  cacheDom();
  populateCategorySelects();
 
  dom.dateInput.value = getTodayISO();
  dom.todayLabel.textContent = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(new Date());
 
  state.transactions = loadTransactions();
  bindEvents();
  render();
}
 
document.addEventListener('DOMContentLoaded', init);