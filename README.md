# AI Banking Data Assistant

## Problem Statement

Banking systems manage large volumes of structured data across multiple relational entities such as customers, accounts, and transactions. Business teams frequently require access to operational and transactional data for monitoring, compliance, auditing, and decision-making. However, accessing this data typically requires technical expertise in database querying and system knowledge, creating delays and dependency on engineering teams.

This project solves that by providing an AI-powered Banking Data Assistant that allows users to retrieve banking data through natural language interaction. The system accurately interprets user queries and retrieves correct data from a structured relational database while ensuring secure and validated execution.

---

## Solution

We built a full-stack AI-powered assistant that acts as a bridge between non-technical business users and the banking database. Users simply type a plain English question — the system handles everything else automatically.

The core idea is a 3-layer pipeline:

1. **AI Layer** — Converts the user's natural language question into a valid SQL query using an OpenAI model (configurable, default `gpt-4o-mini`). The full database schema is passed to the model so it understands table relationships and generates accurate JOINs.

2. **Security Layer** — Every AI-generated SQL query is validated before execution. Only SELECT statements are allowed. Any query containing INSERT, UPDATE, DELETE, DROP, or other harmful keywords is blocked immediately and never reaches the database.

3. **Data Layer** — The validated SQL executes against a Supabase PostgreSQL database containing customers, accounts, and transactions. Results are returned as structured JSON and displayed on the frontend as a table or Chart.js visualization.

---

## Working Flow

```
User types a natural language question in the browser
        │
        ▼
Frontend (index.html + app.js)
        │  POST /query  { "user_query": "..." }
        ▼
Go Backend (`backend-go/cmd/server/main.go`)
        │  JSON request validation
        ▼
NLP Service (`backend-go/internal/nlp/service.go`)
        │  Sends query + database schema to the OpenAI API
        │  Receives back a SQL SELECT statement
        ▼
Validator (`backend-go/internal/validator/validator.go`)
        │  Checks SQL is read-only (SELECT only)
        │  Blocks INSERT / UPDATE / DELETE / DROP / ALTER
        ▼
DB Service (`backend-go/internal/db/service.go`)
        │  Executes validated SQL against Supabase Postgres
        │  Returns column names + rows + optional chart data
        ▼
Go HTTP Response
        │  Returns structured JSON { columns, rows, row_count, chart_data, error }
        ▼
Frontend renders results
        │  Table for list queries
        │  Large number for COUNT / SUM queries
        └  Chart.js bar chart for aggregate queries
```

---

## Tech Stack

### Backend
- Go 1.22+
- net/http
- Supabase Postgres
- OpenAI API (chat completions)
- Configurable model (default `gpt-4o-mini`)

### Frontend
- HTML5
- JavaScript
- Chart.js

### Voice Assistant — Sarvam AI
- **Sarvam AI Speech-to-Text (STT)** — Converts voice input to text (supports Hindi, Tamil, Telugu, Bengali, Kannada, Malayalam, English India)
- **Sarvam AI Text-to-Speech (TTS)** — Reads query results aloud in a natural Indian voice
- **Sarvam AI Translate API** *(optional)* — Translates regional language queries to English before LLM processing

---

## Run Backend (Go)

```bash
cd backend-go
go mod tidy
go run ./cmd/server
```

The API starts on `http://127.0.0.1:8000` by default.

