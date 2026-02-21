(function () {
  const state = {
    columns: [],
    rows: [],
    chartData: null,
    sort: { index: -1, direction: "asc" }
  };

  const el = {
    apiBaseUrl: document.getElementById("api-base-url"),
    healthForm: document.getElementById("health-form"),
    healthOutput: document.getElementById("health-output"),
    presetQueries: document.getElementById("preset-queries"),
    queryForm: document.getElementById("query-form"),
    userQuery: document.getElementById("user-query"),
    queryStatus: document.getElementById("query-status"),
    sqlOutput: document.getElementById("sql-output"),
    rawOutput: document.getElementById("raw-output"),
    metricsBody: document.getElementById("metrics-body"),
    tableWrapper: document.getElementById("table-wrapper"),
    clearButton: document.getElementById("clear-button"),
    downloadCsv: document.getElementById("download-csv"),
    chartCanvas: document.getElementById("chart-canvas"),
    chartNote: document.getElementById("chart-note")
  };

  function formatMoney(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "N/A";
    }
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    });
  }

  function getApiBase() {
    return el.apiBaseUrl.value.trim().replace(/\/$/, "");
  }

  function setStatus(text) {
    el.queryStatus.textContent = `Status: ${text}`;
  }

  async function checkHealth(event) {
    event.preventDefault();
    el.healthOutput.textContent = "Health: checking...";

    try {
      const response = await fetch(`${getApiBase()}/health`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      el.healthOutput.textContent = `Health: ${data.status}, DB: ${data.database}, API: ${data.api}`;
    } catch (error) {
      el.healthOutput.textContent = `Health: failed (${error.message})`;
    }
  }

  function normalizeValue(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }

  function toNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      const cleaned = value.replace(/,/g, "").trim();
      if (!cleaned) {
        return null;
      }
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function buildMetrics(columns, rows, chartData) {
    let numericColumnCount = 0;
    let amountIndex = -1;

    for (let i = 0; i < columns.length; i += 1) {
      const columnName = String(columns[i] || "").toLowerCase();
      if (columnName === "amount") {
        amountIndex = i;
      }

      const hasNumber = rows.some((row) => toNumber(row[i]) !== null);
      if (hasNumber) {
        numericColumnCount += 1;
      }
    }

    let amountSum = null;
    let amountAvg = null;
    if (amountIndex >= 0) {
      const numericValues = rows
        .map((row) => toNumber(row[amountIndex]))
        .filter((v) => v !== null);

      if (numericValues.length > 0) {
        amountSum = numericValues.reduce((sum, v) => sum + v, 0);
        amountAvg = amountSum / numericValues.length;
      }
    }

    const metrics = [
      ["Rows Returned", rows.length],
      ["Columns Returned", columns.length],
      ["Numeric Columns", numericColumnCount],
      ["Amount Sum", formatMoney(amountSum)],
      ["Amount Average", formatMoney(amountAvg)],
      ["Chart Data", chartData ? `Yes (${chartData.type})` : "Not available"]
    ];

    const fragment = document.createDocumentFragment();
    for (const metric of metrics) {
      const tr = document.createElement("tr");
      const keyCell = document.createElement("td");
      const valueCell = document.createElement("td");
      keyCell.textContent = String(metric[0]);
      valueCell.textContent = String(metric[1]);
      tr.appendChild(keyCell);
      tr.appendChild(valueCell);
      fragment.appendChild(tr);
    }

    el.metricsBody.innerHTML = "";
    el.metricsBody.appendChild(fragment);
  }

  function compareValues(a, b) {
    const numA = toNumber(a);
    const numB = toNumber(b);

    if (numA !== null && numB !== null) {
      return numA - numB;
    }

    return normalizeValue(a).localeCompare(normalizeValue(b));
  }

  function sortRows(rows, columnIndex, direction) {
    const sorted = [...rows].sort((left, right) => compareValues(left[columnIndex], right[columnIndex]));
    if (direction === "desc") {
      sorted.reverse();
    }
    return sorted;
  }

  function renderTable(columns, rows) {
    if (!columns.length) {
      el.tableWrapper.innerHTML = "<p>No tabular columns returned.</p>";
      el.downloadCsv.disabled = true;
      return;
    }

    const table = document.createElement("table");
    table.setAttribute("border", "1");

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    columns.forEach((columnName, index) => {
      const th = document.createElement("th");
      const button = document.createElement("button");
      button.type = "button";
      let marker = "";
      if (state.sort.index === index) {
        marker = state.sort.direction === "asc" ? " ▲" : " ▼";
      }
      button.textContent = `${columnName}${marker}`;
      button.addEventListener("click", function () {
        if (state.sort.index === index) {
          state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
        } else {
          state.sort.index = index;
          state.sort.direction = "asc";
        }
        state.rows = sortRows(state.rows, state.sort.index, state.sort.direction);
        renderTable(state.columns, state.rows);
      });
      th.appendChild(button);
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((_, colIndex) => {
        const td = document.createElement("td");
        td.textContent = normalizeValue(row[colIndex]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    el.tableWrapper.innerHTML = "";
    el.tableWrapper.appendChild(table);
    el.downloadCsv.disabled = rows.length === 0;
  }

  function escapeCsvCell(value) {
    const text = normalizeValue(value);
    if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
      return `"${text.replace(/\"/g, '""')}"`;
    }
    return text;
  }

  function downloadCsv() {
    if (!state.columns.length) {
      return;
    }

    const lines = [];
    lines.push(state.columns.map(escapeCsvCell).join(","));

    state.rows.forEach((row) => {
      lines.push(row.map(escapeCsvCell).join(","));
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "query_results.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function clearChart() {
    const ctx = el.chartCanvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, el.chartCanvas.width, el.chartCanvas.height);
  }

  function renderChart(chartData) {
    clearChart();
    const ctx = el.chartCanvas.getContext("2d");
    if (!ctx) {
      el.chartNote.textContent = "Cannot render chart: canvas not supported.";
      return;
    }

    if (!chartData || !Array.isArray(chartData.labels) || !Array.isArray(chartData.values) || chartData.labels.length === 0) {
      el.chartNote.textContent = "No chart data available for this query.";
      return;
    }

    const labels = chartData.labels;
    const values = chartData.values.map((v) => Number(v) || 0);
    const maxValue = Math.max(...values, 1);

    const width = el.chartCanvas.width;
    const height = el.chartCanvas.height;
    const left = 60;
    const right = 20;
    const top = 20;
    const bottom = 60;

    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const barWidth = Math.max(20, Math.floor(chartWidth / Math.max(labels.length, 1)) - 10);

    ctx.strokeRect(left, top, chartWidth, chartHeight);

    for (let i = 0; i < labels.length; i += 1) {
      const value = values[i];
      const barHeight = (value / maxValue) * (chartHeight - 10);
      const x = left + i * (barWidth + 10) + 5;
      const y = top + chartHeight - barHeight;

      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillText(String(value.toFixed(2)), x, y - 4);

      const label = String(labels[i]);
      const clippedLabel = label.length > 10 ? `${label.slice(0, 10)}...` : label;
      ctx.fillText(clippedLabel, x, top + chartHeight + 16);
    }

    ctx.fillText("0", left - 14, top + chartHeight);
    ctx.fillText(String(maxValue.toFixed(2)), left - 42, top + 10);

    el.chartNote.textContent = `Chart rendered from API chart_data (${chartData.type}).`;
  }

  async function runQuery(event) {
    event.preventDefault();

    const userQuery = el.userQuery.value.trim();
    if (!userQuery) {
      setStatus("query cannot be empty");
      return;
    }

    setStatus("running query...");
    el.sqlOutput.textContent = "Generating SQL...";

    try {
      const response = await fetch(`${getApiBase()}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ user_query: userQuery })
      });

      const data = await response.json();
      el.rawOutput.textContent = JSON.stringify(data, null, 2);

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (data.error) {
        setStatus(`error from API: ${data.error}`);
      } else {
        setStatus("query successful");
      }

      const columns = Array.isArray(data.columns) ? data.columns : [];
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const chartData = data.chart_data || null;

      state.columns = columns;
      state.rows = rows;
      state.chartData = chartData;
      state.sort = { index: -1, direction: "asc" };

      el.sqlOutput.textContent = data.sql || "No SQL returned.";

      buildMetrics(columns, rows, chartData);
      renderTable(columns, rows);
      renderChart(chartData);
    } catch (error) {
      setStatus(`request failed (${error.message})`);
      el.sqlOutput.textContent = "No SQL generated due to request failure.";
      state.columns = [];
      state.rows = [];
      state.chartData = null;
      buildMetrics([], [], null);
      renderTable([], []);
      renderChart(null);
      el.rawOutput.textContent = `Error: ${error.message}`;
    }
  }

  function clearOutput() {
    state.columns = [];
    state.rows = [];
    state.chartData = null;
    state.sort = { index: -1, direction: "asc" };

    setStatus("idle");
    el.sqlOutput.textContent = "No SQL generated yet.";
    el.rawOutput.textContent = "No response yet.";
    buildMetrics([], [], null);
    renderTable([], []);
    renderChart(null);
  }

  function applyPreset() {
    const value = el.presetQueries.value;
    if (value) {
      el.userQuery.value = value;
    }
  }

  function init() {
    el.healthForm.addEventListener("submit", checkHealth);
    el.queryForm.addEventListener("submit", runQuery);
    el.clearButton.addEventListener("click", clearOutput);
    el.presetQueries.addEventListener("change", applyPreset);
    el.downloadCsv.addEventListener("click", downloadCsv);

    buildMetrics([], [], null);
    renderChart(null);
  }

  init();
})();
