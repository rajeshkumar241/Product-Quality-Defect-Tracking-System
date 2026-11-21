# QualiTrack Pro - Product Quality & Defect Tracking System

An enterprise-grade, ISO 9001 / Six Sigma compliant **Product Quality & Defect Tracking System** designed for high-reliability manufacturing and engineering environments (Aerospace, Automotive, Medical Devices, and Electronics).

Built with **Zero External Dependencies** using **Node.js native `node:sqlite` database** and a modern, reactive single-page dashboard with real-time Pareto analytics and dynamic lifecycle workflows.

---

## 🌟 Key Capabilities & Features

### 1. Six Sigma & Quality Performance Dashboard
- **First Pass Yield (FPY %)**: Real-time calculation of units passing without rework on first inspection:
  $$\text{FPY} = \left( \frac{\text{Units Passed First Pass}}{\text{Total Units Inspected}} \right) \times 100$$
- **DPMO (Defects Per Million Opportunities)**: Standard Six Sigma metric:
  $$\text{DPMO} = \frac{\text{Total Defects}}{\text{Total Units Inspected} \times \text{Opportunities per Unit}} \times 1,000,000$$
- **Defect Density**: Total defects per 1,000 units inspected.
- **Mean Time to Resolution (MTTR)**: Average elapsed hours from defect logging to closed verification.
- **Pareto Analysis (80/20 Rule)**: Dual-axis chart with category frequencies and cumulative percentage curve identifying the vital 20% of defect causes generating 80% of failures.

### 2. End-to-End Defect Lifecycle Management
A formal state-machine tracking every non-conformance through required regulatory gates:
1. **NEW**: Logged by inspector or operator at a quality gate with immediate containment.
2. **TRIAGED**: Priority classified (P1 Urgent to P4 Low), assigned to responsible lead engineer.
3. **UNDER INVESTIGATION**: Active physical teardown, CMM dimensional analysis, or lab evaluation.
4. **RCA COMPLETED**: Formal 5-Whys drilldown & Ishikawa (Fishbone) 6M category classification.
5. **CAPA PENDING**: Corrective & Preventive action items scheduled with owners and due dates.
6. **RESOLVED**: Containment and repairs executed with technical resolution summary.
7. **VERIFIED CLOSED**: Quality Assurance re-inspection and effectiveness verification.
*(Supports **REOPENED** state if subsequent audit tests fail)*

### 3. Integrated 5-Whys Root Cause Analysis (RCA) & Ishikawa 6M
- Interactive cascading 5-Whys drill-down directly in the defect workspace.
- Six Sigma 6M categorization:
  - **Machine** (Tool chatter, spindle runout, calibration drift)
  - **Method** (SOP timing, sequence, feed speed)
  - **Material** (Alloy purity, porosity, supplier variance)
  - **Manpower** (Training, shift oversight)
  - **Measurement** (Gauge repeatability, sensor error)
  - **Environment** (Cleanroom humidity, thermal variation)

### 4. CAPA (Corrective and Preventive Action) Tracker
- Track both **Corrective Actions** (eliminating root cause of current non-conformance) and **Preventive Actions** (poka-yoke mistake proofing across other production lines).
- Lifecycle tracking: `PLANNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `IMPLEMENTED` $\rightarrow$ `VERIFIED`.
- Verification notes required before sign-off.

### 5. Production Batches & Inspection Checkpoints
- Production lots with tracking of units produced, inspected, passed, and failed.
- Configured quality gates across 4 manufacturing stages:
  - `INCOMING_MATERIALS`: Raw material spectroscopy and purity.
  - `IN_PROCESS`: CNC GD&T tolerancing and SMT optical inspection (AOI).
  - `FINAL_ASSEMBLY`: Hermetic ultrasonic seal and helium leak tests.
  - `OUTGOING_QC`: Hi-Pot electrical withstand and peel integrity.

### 6. Full Immutable Audit Trail & Collaboration
- Automated tamper-evident logging of every status transition, assignment change, RCA edit, and CAPA update.
- Engineering discussion thread for technician notes and lab updates.

---

## 🛠️ Architecture & Tech Stack

- **Runtime**: Node.js (v22+ / v24+ with native `node:sqlite` - zero npm dependencies)
- **Database**: SQLite (high-performance embedded engine with foreign keys and atomic operations)
- **Backend API**: Pure Node.js HTTP REST API server with custom router, audit logger, and metric computation engine
- **Frontend**: Responsive Single-Page Application (HTML5, Tailwind CSS, Chart.js for dual-axis Pareto charts, vanilla reactive state management)

---

## 🚀 Quick Start Guide

### Run with Python

The Python backend is in `backend/server.py`. It serves the existing frontend
and continues to use `data/quality_system.db`.

Requirements: Python 3.10+ and pip.

From PowerShell in the project directory:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python backend\server.py
```

Then open `http://127.0.0.1:3000`. You may also run `.\run-python.ps1` to
create the virtual environment, install Flask, and start the server.

### 1. Run Automated Test Suite
Verify that all 15 API routes, metrics calculations, RCA, CAPA, and state machines are operating properly:
```bash
agy-node backend/test.js
```

### 2. Seed / Reset Demo Database
Populate realistic aerospace, automotive, medical device, and EV battery defect records:
```bash
agy-node backend/seed.js
```

### 3. Start the Web Server
Launch the server:
```bash
agy-node backend/server.js
```

Open your web browser and navigate to:
```
http://localhost:3000
```

---

## 📡 REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/health` | `GET` | System health check and server timestamp |
| `/api/metrics/overview` | `GET` | FPY %, DPMO, Defect Density, MTTR, critical counts |
| `/api/metrics/pareto` | `GET` | Defect category frequency and cumulative percentages |
| `/api/metrics/distributions` | `GET` | Defect counts grouped by severity and lifecycle status |
| `/api/products` | `GET`, `POST` | List or register products and target FPY |
| `/api/batches` | `GET`, `POST` | List or create production batches and yield rates |
| `/api/checkpoints` | `GET` | List inspection checkpoints and criteria |
| `/api/defects` | `GET`, `POST` | Filterable defect list or log a new non-conformance |
| `/api/defects/:id` | `GET`, `PATCH` | Retrieve deep defect view (RCA, CAPA, audit logs, comments) |
| `/api/defects/:id/status` | `POST` | Advance lifecycle status with audit reason logging |
| `/api/defects/:id/rca` | `PUT` | Save or update 5-Whys and Fishbone root cause analysis |
| `/api/defects/:id/capa` | `POST` | Add a corrective or preventive action item |
| `/api/capa/:id` | `PATCH` | Update CAPA status (`IMPLEMENTED`, `VERIFIED`) |
| `/api/defects/:id/comments` | `POST` | Post engineering collaboration comment |
| `/api/seed` | `POST` | Reset and re-seed database with demonstration dataset |

---

## 📂 Project Structure

```
├── backend/
│   ├── database.js     # SQLite schema, tables, and audit logging
│   ├── seed.js         # Realistic industrial test data seeder
│   ├── server.js       # HTTP REST API server & static file host
│   └── test.js         # Comprehensive 15-test integration suite
├── data/
│   └── quality_system.db # Embedded SQLite database
├── public/
│   ├── index.html      # Responsive dashboard & workspace UI
│   ├── app.js          # Reactive client application logic & Chart.js
│   └── styles.css      # Stepper, Kanban, and custom styling
├── package.json        # Project metadata and run scripts
└── README.md           # System documentation
```
