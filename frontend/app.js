const API_URL = "https://ai-banking-data-assistant-backend.onrender.com";
let chartInstance = null;
let lastData = null;

const EXAMPLE_QUERIES = [
    "Show the last 10 transactions where amount is greater than 10000",
    "How many transactions today have amount greater than 10000?",
    "List customers who performed transactions above 50000 this week",
    "Show total credit transactions for today",
    "Display account balance details for customer ID 101",
    "Show recent debit transactions for account number 5001"
];

const queryInput     = document.getElementById("queryInput");
const submitBtn      = document.getElementById("submitBtn");
const loadingDiv     = document.getElementById("loading");
const errorBox       = document.getElementById("errorBox");
const resultsSection = document.getElementById("resultsSection");
const statsBar       = document.getElementById("statsBar");
const tabData        = document.getElementById("tabData");
const tabChart       = document.getElementById("tabChart");
const panelData      = document.getElementById("panelData");
const panelChart     = document.getElementById("panelChart");
const summaryBox     = document.getElementById("summaryBox");
const chipsDiv       = document.getElementById("chips");

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

tabData.addEventListener("click", () => switchTab("data"));
tabChart.addEventListener("click", () => {
    switchTab("chart");
    if (lastData) buildChartFromData(lastData);
});

function switchTab(tab) {
    if (tab === "data") {
        tabData.classList.add("active");
        tabChart.classList.remove("active");
        panelData.style.display = "block";
        panelChart.style.display = "none";
    } else {
        tabChart.classList.add("active");
        tabData.classList.remove("active");
        panelChart.style.display = "block";
        panelData.style.display = "none";
    }
}

async function submitQuery() {
    const userQuery = queryInput.value.trim();
    if (!userQuery) { queryInput.focus(); return; }

    setLoading(true);
    hideError();
    hideResults();

    try {
        const response = await fetch(`${API_URL}/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_query: userQuery })
        });

        if (!response.ok) throw new Error(`Server error: ${response.status} ${response.statusText}`);

        const data = await response.json();
        if (data.error) {
            showError(data.error, data.sql);
        } else {
            renderResults(data);
            generateSummary(userQuery, data);
        }
    } catch (err) {
        if (err.name === "TypeError" && err.message.includes("fetch")) {
            showError("Cannot connect to the backend server. Make sure it is running on port 8000.");
        } else {
            showError(err.message);
        }
    } finally {
        setLoading(false);
    }
}

function generateSummary(userQuery, data) {
    let summaryText = "";

    if (data.row_count === 0) {
        summaryText = "No records were found matching your query.";
    } else if (data.row_count === 1 && data.columns.length === 1) {
        const val = data.rows[0][0];
        const col = data.columns[0].toLowerCase();
        const formatted = (col.includes("amount") || col.includes("total") || col.includes("sum") || col.includes("balance"))
            ? "₹" + Number(val).toLocaleString("en-IN")
            : val;
        summaryText = `The result is ${formatted}.`;
    } else {
        const colLower = data.columns.map(c => c.toLowerCase());
        summaryText = `Found ${data.row_count} record${data.row_count !== 1 ? "s" : ""}. `;

        const amountIdx = colLower.findIndex(c => c.includes("amount"));
        if (amountIdx !== -1) {
            const amounts = data.rows.map(r => parseFloat(r[amountIdx])).filter(v => !isNaN(v));
            if (amounts.length > 0) {
                const total = amounts.reduce((a, b) => a + b, 0);
                const max = Math.max(...amounts);
                const min = Math.min(...amounts);
                summaryText += `Total amount: ₹${total.toLocaleString("en-IN")}. `;
                summaryText += `Highest: ₹${max.toLocaleString("en-IN")}, Lowest: ₹${min.toLocaleString("en-IN")}. `;
            }
        }

        const typeIdx = colLower.findIndex(c => c === "transaction_type" || c === "type");
        if (typeIdx !== -1) {
            const credits = data.rows.filter(r => r[typeIdx] === "credit").length;
            const debits = data.rows.filter(r => r[typeIdx] === "debit").length;
            if (credits > 0 && debits > 0) summaryText += `${credits} credit${credits !== 1 ? "s" : ""} and ${debits} debit${debits !== 1 ? "s" : ""} found.`;
            else if (credits > 0) summaryText += `All ${credits} transactions are credits.`;
            else if (debits > 0) summaryText += `All ${debits} transactions are debits.`;
        }

        const balanceIdx = colLower.findIndex(c => c.includes("balance"));
        if (balanceIdx !== -1) {
            const balances = data.rows.map(r => parseFloat(r[balanceIdx])).filter(v => !isNaN(v));
            if (balances.length > 0) {
                const total = balances.reduce((a, b) => a + b, 0);
                summaryText += `Total balance: ₹${total.toLocaleString("en-IN")}.`;
            }
        }
    }

    showSummary(summaryText);
}

async function showSummary(text) {
    summaryBox.style.display = "flex";
    summaryBox.querySelector(".summary-text").textContent = text;

    // Voice Assistant Integration — silent fail if not configured
    try {
        if (typeof SARVAM_AI_CONFIG === "undefined") return;
        let textToSpeak = text;
        if (originalQueryLanguage && originalQueryLanguage !== 'en-IN') {
            setVoiceStatus("Translating summary for voice reply...", false);
            textToSpeak = await translateText(text, originalQueryLanguage);
            clearVoiceStatus();
        }
        await speakText(textToSpeak);
    } catch (error) {
        console.error("Could not generate voice reply:", error);
        // Silent fail — don't show voice errors for text queries
    }
}

function renderResults(data) {
    lastData = data;
    resultsSection.style.display = "block";
    statsBar.innerHTML = `<span class="badge">${data.row_count} row${data.row_count !== 1 ? "s" : ""}</span><span>returned</span>`;

    if (data.row_count === 0) {
        renderEmpty();
        tabChart.style.display = "none";
        switchTab("data");
        return;
    }

    if (data.row_count === 1 && data.columns.length === 1) {
        renderSingleValue(data.columns[0], data.rows[0][0]);
        tabChart.style.display = "none";
        switchTab("data");
        return;
    }

    renderTable(data.columns, data.rows);
    tabChart.style.display = "inline-block";
    switchTab("data");
}

function buildChartFromData(data) {
    panelChart.innerHTML = `<canvas id="myChart"></canvas>`;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    const chartData = resolveChartData(data.columns, data.rows);

    if (!chartData) {
        panelChart.innerHTML = `<p style="color:#888;padding:32px;text-align:center;font-size:14px;">Chart not available for this result type.</p>`;
        return;
    }

    const ctx = document.getElementById("myChart").getContext("2d");
    chartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: chartData.labels,
            datasets: [{
                label: "Value",
                data: chartData.values,
                backgroundColor: [
                    "rgba(15,52,96,0.85)", "rgba(6,182,212,0.85)",
                    "rgba(16,185,129,0.85)", "rgba(245,158,11,0.85)",
                    "rgba(139,92,246,0.85)", "rgba(239,68,68,0.85)",
                    "rgba(59,130,246,0.85)", "rgba(249,115,22,0.85)",
                    "rgba(20,184,166,0.85)", "rgba(99,102,241,0.85)"
                ],
                borderRadius: 6,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const val = Number(ctx.raw);
                            return isNaN(val) ? ctx.raw : " ₹" + val.toLocaleString("en-IN");
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: "rgba(0,0,0,0.05)" },
                    ticks: { callback: val => Number(val) >= 1000 ? "₹" + Number(val).toLocaleString("en-IN") : val }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function resolveChartData(columns, rows) {
    const col = columns.map(c => c.toLowerCase());

    const numericKeywords = ["amount", "balance", "total", "sum", "count"];
    const nameKeywords    = ["name", "description"];
    const typeKeywords    = ["transaction_type", "account_type", "type"];

    let numIdx  = null;
    let nameIdx = null;
    let typeIdx = null;

    for (let i = 0; i < col.length; i++) {
        if (numIdx === null && numericKeywords.some(k => col[i].includes(k))) numIdx = i;
        if (nameIdx === null && nameKeywords.some(k => col[i].includes(k))) nameIdx = i;
        if (typeIdx === null && typeKeywords.some(k => col[i].includes(k))) typeIdx = i;
    }

    if (numIdx === null) {
        for (let i = 0; i < col.length; i++) {
            if (rows.every(r => r[i] !== null && !isNaN(Number(r[i])))) { numIdx = i; break; }
        }
    }

    if (numIdx === null) return null;

    let lblIdx = null;

    if (nameIdx !== null) {
        lblIdx = nameIdx;
    } else if (typeIdx !== null) {
        lblIdx = typeIdx;
    } else {
        for (let i = 0; i < col.length; i++) {
            if (i !== numIdx && rows.every(r => typeof r[i] === "string" || r[i] === null)) {
                lblIdx = i;
                break;
            }
        }
    }

    const labels = lblIdx !== null
        ? rows.map(r => String(r[lblIdx] ?? "—"))
        : rows.map((_, i) => `Row ${i + 1}`);

    const values = rows.map(r => { const v = parseFloat(r[numIdx]); return isNaN(v) ? 0 : v; });

    return { labels, values };
}

function renderSingleValue(label, value) {
    panelData.innerHTML = `
        <div class="single-value">
            <div class="value-number">${formatValue(value, label)}</div>
            <div class="value-label">${formatColumnName(label)}</div>
        </div>`;
}

function renderEmpty() {
    panelData.innerHTML = `
        <div class="empty-result">
            <div class="empty-icon">🔍</div>
            <p>No records found for this query.</p>
        </div>`;
}

function renderTable(columns, rows) {
    panelData.innerHTML = `
        <div class="table-scroll">
            <table id="resultsTable">
                <thead></thead>
                <tbody></tbody>
            </table>
        </div>`;

    const table = document.getElementById("resultsTable");
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");

    const headerRow = thead.insertRow();
    columns.forEach(col => {
        const th = document.createElement("th");
        th.textContent = formatColumnName(col);
        headerRow.appendChild(th);
    });

    rows.forEach(row => {
        const tr = tbody.insertRow();
        row.forEach((val, idx) => {
            const td = tr.insertCell();
            const colName = columns[idx].toLowerCase();
            if (colName === "transaction_type" || colName === "type") {
                td.classList.add(val === "credit" ? "credit" : "debit");
                td.textContent = val;
            } else if (colName.includes("amount") || colName.includes("balance") || colName.includes("total")) {
                td.classList.add("amount");
                td.textContent = val != null ? "₹" + Number(val).toLocaleString("en-IN") : "—";
            } else if (colName.includes("date") || colName.includes("created_at")) {
                td.textContent = formatDate(val);
            } else {
                td.textContent = val != null ? val : "—";
            }
        });
    });
}

function formatColumnName(col) {
    return col.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(val, colName) {
    if (val === null || val === undefined) return "—";
    const col = colName.toLowerCase();
    if (col.includes("amount") || col.includes("balance") || col.includes("total") || col.includes("sum")) {
        return "₹" + Number(val).toLocaleString("en-IN");
    }
    return val;
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    try {
        const d = new Date(dateStr);
        return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return dateStr; }
}

function setLoading(show) {
    loadingDiv.style.display = show ? "block" : "none";
    submitBtn.disabled = show;
    submitBtn.textContent = show ? "Thinking..." : "Ask";
}

function showError(message, sql = null) {
    errorBox.style.display = "block";
    errorBox.innerHTML = `
        <strong>⚠ Error</strong><br>${escapeHtml(message)}
        ${sql ? `<br><br><small>Generated SQL: <code>${escapeHtml(sql)}</code></small>` : ""}`;
}

function hideError() {
    errorBox.style.display = "none";
    errorBox.innerHTML = "";
}

function hideResults() {
    lastData = null;
    resultsSection.style.display = "none";
    summaryBox.style.display = "none";
    panelData.innerHTML = "";
    panelChart.innerHTML = "";
    tabChart.style.display = "none";
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

submitBtn.addEventListener("click", submitQuery);
queryInput.addEventListener("keydown", e => { if (e.key === "Enter") submitQuery(); });

buildChips();
initializeVoiceAssistant();
