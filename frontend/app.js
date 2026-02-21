// app.js — AI Banking Data Assistant
// Handles API calls, result rendering, Chart.js integration

const API_URL = "http://localhost:8000";
let chartInstance = null;
const ENABLE_CHARTS = false;

// ── Example queries (clickable chips) ─────────────────────────
const EXAMPLE_QUERIES = [
    "Show the last 10 transactions where amount is greater than 10000",
    "How many transactions today have amount greater than 10000?",
    "List customers who performed transactions above 50000 this week",
    "Show total credit transactions for today",
    "Display account balance details for customer ID 101",
    "Show recent debit transactions for account number 5001"
];

// ── DOM Elements ──────────────────────────────────────────────
const queryInput   = document.getElementById("queryInput");
const submitBtn    = document.getElementById("submitBtn");
const loadingDiv   = document.getElementById("loading");
const errorBox     = document.getElementById("errorBox");
const resultsSection = document.getElementById("resultsSection");
const sqlDisplay   = document.getElementById("sqlDisplay");
const statsBar     = document.getElementById("statsBar");
const chartContainer = document.getElementById("chartContainer");
const tableContainer = document.getElementById("tableContainer");
const chipsDiv     = document.getElementById("chips");

// ── Build example chips on page load ─────────────────────────
function buildChips() {
    EXAMPLE_QUERIES.forEach(q => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = q.length > 55 ? q.substring(0, 52) + "..." : q;
        chip.title = q;
        chip.addEventListener("click", () => {
            queryInput.value = q;
            queryInput.focus();
        });
        chipsDiv.appendChild(chip);
    });
}

// ── Submit query ──────────────────────────────────────────────
async function submitQuery() {
    const userQuery = queryInput.value.trim();
    if (!userQuery) {
        queryInput.focus();
        return;
    }

    // Reset UI state
    setLoading(true);
    hideError();
    hideResults();

    try {
        const response = await fetch(`${API_URL}/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_query: userQuery })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.error) {
            showError(data.error, data.sql);
        } else {
            renderResults(data);
        }

    } catch (err) {
        if (err.name === "TypeError" && err.message.includes("fetch")) {
            showError("Cannot connect to the backend server. Make sure it is running on port 8000.\n\nRun: uvicorn backend.main:app --reload");
        } else {
            showError(err.message);
        }
    } finally {
        setLoading(false);
    }
}

// ── Render full results ───────────────────────────────────────
function renderResults(data) {
    resultsSection.style.display = "block";

    // Show generated SQL
    sqlDisplay.textContent = formatSQL(data.sql);

    // Stats bar
    statsBar.innerHTML = `
        <span class="badge">${data.row_count} row${data.row_count !== 1 ? "s" : ""}</span>
        <span>returned</span>
    `;

    // Empty result
    if (data.row_count === 0) {
        renderEmpty();
        return;
    }

    // Keep output tabular by default; chart can be enabled if needed.
    if (ENABLE_CHARTS && data.chart_data) {
        renderChart(data.chart_data);
    } else {
        hideChart();
    }

    // Data table
    renderTable(data.columns, data.rows);
}

// ── Empty result ──────────────────────────────────────────────
function renderEmpty() {
    tableContainer.innerHTML = `
        <div class="empty-result">
            <div class="empty-icon">🔍</div>
            <p>No records found for this query.</p>
        </div>
    `;
    tableContainer.style.display = "block";
    hideChart();
}

// ── Chart rendering ───────────────────────────────────────────
function renderChart(chartData) {
    chartContainer.style.display = "block";

    destroyChart();

    const ctx = document.getElementById("myChart").getContext("2d");
    chartInstance = new Chart(ctx, {
        type: chartData.type || "bar",
        data: {
            labels: chartData.labels,
            datasets: [{
                label: "Amount (₹)",
                data: chartData.values,
                backgroundColor: [
                    "rgba(15, 52, 96, 0.8)",
                    "rgba(22, 33, 62, 0.8)",
                    "rgba(100, 255, 218, 0.6)",
                    "rgba(52, 152, 219, 0.8)",
                    "rgba(155, 89, 182, 0.8)",
                ],
                borderColor: "#0f3460",
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => " ₹" + Number(ctx.raw).toLocaleString("en-IN")
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: val => "₹" + Number(val).toLocaleString("en-IN")
                    }
                }
            }
        }
    });
}

// ── Table rendering ───────────────────────────────────────────
function renderTable(columns, rows) {
    tableContainer.innerHTML = `
        <h3>Results</h3>
        <div class="table-scroll">
            <table id="resultsTable">
                <thead></thead>
                <tbody></tbody>
            </table>
        </div>
    `;
    tableContainer.style.display = "block";
    const resultsTable = document.getElementById("resultsTable");

    // Build header
    const thead = resultsTable.querySelector("thead") || resultsTable.createTHead();
    thead.innerHTML = "";
    const headerRow = thead.insertRow();
    columns.forEach(col => {
        const th = document.createElement("th");
        th.textContent = formatColumnName(col);
        headerRow.appendChild(th);
    });

    // Build body
    const tbody = resultsTable.querySelector("tbody") || resultsTable.createTBody();
    tbody.innerHTML = "";
    rows.forEach(row => {
        const tr = tbody.insertRow();
        row.forEach((val, idx) => {
            const td = tr.insertCell();
            const colName = columns[idx].toLowerCase();

            // Format cell value
            td.textContent = formatValue(val, colName);

            // Add CSS classes for styling
            if (colName === "transaction_type" || colName === "type") {
                td.classList.add(val === "credit" ? "credit" : "debit");
            }
            if (colName === "amount" || colName.includes("balance") || colName.includes("total")) {
                td.classList.add("amount");
                td.textContent = val != null ? "₹" + Number(val).toLocaleString("en-IN") : "—";
            }
        });
        tr.style.cursor = "default";
    });
}

function destroyChart() {
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
}

function hideChart() {
    destroyChart();
    chartContainer.style.display = "none";
}

// ── Format helpers ────────────────────────────────────────────
function formatColumnName(col) {
    return col
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(val, colName = "") {
    if (val === null || val === undefined) return "—";
    const col = colName.toLowerCase();
    if (col.includes("amount") || col.includes("balance") || col.includes("total")) {
        return "₹" + Number(val).toLocaleString("en-IN");
    }
    if (col.includes("date") || col.includes("created_at")) {
        return formatDate(val);
    }
    return val;
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    try {
        const d = new Date(dateStr);
        return d.toLocaleString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    } catch {
        return dateStr;
    }
}

function formatSQL(sql) {
    if (!sql) return "";
    // Simple SQL formatter — add newlines at keywords
    return sql
        .replace(/\bSELECT\b/gi,  "\nSELECT")
        .replace(/\bFROM\b/gi,    "\nFROM")
        .replace(/\bJOIN\b/gi,    "\nJOIN")
        .replace(/\bWHERE\b/gi,   "\nWHERE")
        .replace(/\bGROUP BY\b/gi,"\nGROUP BY")
        .replace(/\bORDER BY\b/gi,"\nORDER BY")
        .replace(/\bLIMIT\b/gi,   "\nLIMIT")
        .replace(/\bAND\b/gi,     "\n  AND")
        .trim();
}

// ── UI State helpers ──────────────────────────────────────────
function setLoading(show) {
    loadingDiv.style.display = show ? "block" : "none";
    submitBtn.disabled = show;
    submitBtn.textContent = show ? "Thinking..." : "Ask";
}

function showError(message, sql = null) {
    errorBox.style.display = "block";
    errorBox.innerHTML = `
        <strong>⚠ Error</strong><br>
        ${escapeHtml(message)}
        ${sql ? `<br><br><small style="opacity:0.7">Generated SQL: <code>${escapeHtml(sql)}</code></small>` : ""}
    `;
}

function hideError() {
    errorBox.style.display = "none";
    errorBox.innerHTML = "";
}

function hideResults() {
    resultsSection.style.display = "none";
    hideChart();
    tableContainer.style.display = "none";
    tableContainer.innerHTML = "";
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── Event listeners ───────────────────────────────────────────
submitBtn.addEventListener("click", submitQuery);
queryInput.addEventListener("keydown", e => {
    if (e.key === "Enter") submitQuery();
});

// ── Init ──────────────────────────────────────────────────────
buildChips();
