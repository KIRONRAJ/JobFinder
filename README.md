# JobFinder 🚀
> **Production-Grade Full-Stack Job Search Engine & Autonomous AI Workspace**

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![GSAP](https://img.shields.io/badge/GSAP-3.15-88CE02?logo=greensock&logoColor=white)](https://gsap.com/)
[![MCP](https://img.shields.io/badge/MCP-Standard-purple)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**JobFinder** is an advanced, local-first application tracking system and career automation engine. Built originally to replace disjointed spreadsheets and manual Notion databases, JobFinder delivers an enterprise-grade operational cockpit for high-volume, precision job searching — featuring automated multi-dimensional ATS evaluation, strict anti-hallucination document pipelines, real-time Telegram telemetry, and native Model Context Protocol (MCP) agent tools.

> 🔒 **Code-Only Showcase Note**: This repository contains the complete source code for the full-stack application and its toolchains. No real personal resumes, employer communications, or credentials are included. A zero-PII demo dataset is bundled (`npm run seed`) so reviewers can immediately run and explore a fully populated dashboard.

---

## 🏛️ System Architecture

```
                                  +---------------------------------------+
                                  |    Mobile Assistant (Telegram Bot)    |
                                  |  - Audit Alerts  - Voice Debriefs     |
                                  |  - STAR Flashcards  - Quick Commands  |
                                  +-------------------+-------------------+
                                                      |
                                                      v (Long Polling / Webhook)
+--------------------------------+        +-----------+-----------+        +---------------------------------+
|   React 18 + Vite Frontend     |        |   Node / Express API  |        |    Model Context Protocol (MCP) |
|  - Kanban Board / Dense Table  | <----> |  - Atomic JSON Engine | <----> |  - Agent Search & Logging Tools |
|  - ATS Scoring & Evidence Maps | (REST) |  - Scrypt Auth Gate   | (stdio)|  - Multi-Agent Orchestration    |
|  - SOT Hub & Interview Bank    |        |  - Document Streaming |        +---------------------------------+
|  - GSAP Motion & Recharts      |        +-----------+-----------+
+--------------------------------+                    |
                                                      v (Atomic File I/O)
                                          +-----------+-----------+
                                          | Local JSON Data Store |
                                          | - applications.json   |
                                          | - audit-log.jsonl     |
                                          | - outreach.json       |
                                          +-----------------------+
```

---

## ✨ Core Engineering Capabilities

### 1. Dual-View Pipeline Cockpit (Kanban + Dense Table)
- **Kanban Board**: Drag-and-drop status flow (`Researching` -> `Applied` -> `Interview` -> `Offer` / `Rejected` / `Withdrawn`) powered by fluid GSAP micro-animations.
- **High-Density Spreadsheet View**: Keyboard-navigable, compact table with sortable columns, inline status toggles, and instant status updates.
- **Glassmorphic Command Header**: Adaptive Bauhaus navigation capsule that morphs into an ultra-compact floating pill on scroll, complete with global shortcut palette (`Ctrl+K`) and integrated AI terminal drawer (`Ctrl+J`).

### 2. Multi-Dimensional ATS Keyword & Gap Scoring Rubric
- Automatically parses job descriptions and evaluates candidate alignment against an 8-field rubric:
  - **Keyword Saturation** (Hard skills & technical tooling)
  - **Semantic Context Alignment** (Domain familiarity & responsibility mapping)
  - **Experience & Seniority Thresholds**
  - **Recruiter Readability & Layout Gate**
  - **Parsing Risk Evaluation** (Detects multi-column, table, or font parsing hazards)
- Computes actionable apply/skip verdicts (`strong-apply`, `apply`, `borderline`, `skip`) to guide time allocation.

### 3. Grounded Evidence-Mapping (Anti-Hallucination Guarantee)
- Generates tailored CV and cover letter documents with an ironclad rule: **never fabricate experience**.
- Tracks a bidirectional evidence map (`matched` / `gap` / `unsupported`) linking every generated claim directly back to authenticated candidate facts.
- Includes automated verification scripts (`scripts/verify-docs.py`) validating text-layer ATS keyword presence, 2-page A4 geometry, and word-count tolerances.

### 4. Summer of Tech (SOT) Career Fair Hub
- Purpose-built tactical module for university & graduate tech recruitment events:
  - **Company Dossiers**: Deep technical profiles on participating employers, tech stacks, and team cultures.
  - **Strategic Talking Points**: Role-grounded elevator pitches engineered to bridge candidate backgrounds to specific employer needs.
  - **Interactive Preparation**: Stand dossier filters, booth checklists, and elevator pitch drills with confidence scoring.

### 5. Mobile Command Center (Telegram Bot Integration)
- 24/7 remote operations via a companion Telegram bot:
  - **Real-Time Push Alerts**: Dispatches instant audit log notifications for application updates, interviews, and deadlines.
  - **Voice Memo Debriefs**: Accepts voice notes recorded immediately after interviews and automatically transcribes and synthesizes them into structured application notes.
  - **Interactive Drills**: On-the-go STAR story interview flashcards and technical practice quizzes.

### 6. Local-First Atomic JSON Persistence
- Built around privacy and data sovereignty without external database complexity:
  - Read-modify-write operations are serialized with atomic `temp-file-then-rename` semantics to guarantee zero file corruption even during unexpected crashes.
  - Structural data guards (`scripts/check-data.mjs`) verify that IDs never disappear across commits.

### 7. Model Context Protocol (MCP) Server
- Implements Anthropic's open **Model Context Protocol** (`mcp-server/`):
  - Exposes standardized tools (`fetch-applications`, `log-job`, `update-status`, `search-applications`) enabling autonomous AI agents to query and manage the pipeline safely.

---

## 🛠️ Tech Stack

| Domain | Technology | Description |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite | Fast, typed single-page application |
| **Styling & UI** | TailwindCSS, Lucide Icons | Responsive modern design system |
| **Motion & Audio** | GSAP, @gsap/react, Web Audio API | Physics-based animations & feedback cues |
| **Visualizations** | Recharts | Conversion funnels, response velocity, and heatmaps |
| **Backend API** | Node.js, Express.js | High-throughput REST API with serialized persistence |
| **Security & Auth** | Node Crypto (`scrypt`), HttpOnly Cookies | Password gating with rate-limiting & origin boundary |
| **AI & Protocols** | Model Context Protocol (`@modelcontextprotocol/sdk`) | Agentic tooling for external LLM assistants |
| **Mobile Integration**| Telegram Bot API | Two-way mobile alerting, voice processing, and triage |

---

## 🚀 Quickstart Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Clone & Install
```bash
git clone https://github.com/KIRONRAJ/JobFinder.git
cd JobFinder
npm install
```

### 2. Configure Environment
Copy the sample environment file:
```bash
cp .env.example .env
```
*(The app runs out-of-the-box in local mode without third-party API keys).*

### 3. Initialize Password & Seed Demo Data
Set a local login password and populate the dashboard with realistic showcase data:
```bash
# Set an admin password (writes a secure scrypt hash to .env)
node scripts/set-password.mjs

# Seed realistic demo applications (Datacom, Xero, Kiwibank, Trade Me)
npm run seed
```

### 4. Start Development Server
```bash
npm run dev
```
- Web Application: **http://localhost:5177**
- REST API Server: **http://localhost:5178**

---

## 📊 Insights & Analytics Dashboard

The built-in **Insights** engine tracks:
- **Conversion Velocity**: Time-to-response distributions and ghost-rate trajectory across recruitment stages.
- **ATS Outcome Correlation**: Scatter analysis comparing initial ATS match scores against interview conversion rates.
- **Recurring Gap Learning Loop**: Consolidates feedback across historical declines to surface high-frequency skill gaps (e.g. AWS IAM, ServiceNow) to prioritize weekend upskilling.

---

## 📄 License & Attribution

This project is open-source under the [MIT License](LICENSE).  
Designed and engineered by **Kironraj Odatt Peringode**.
