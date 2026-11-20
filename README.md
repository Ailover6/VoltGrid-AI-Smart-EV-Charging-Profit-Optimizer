# ⚡ VoltGrid AI — EV Charging Station Slot Profit Maximization

A full-stack algorithmic optimization and grid telemetry platform designed to solve **overlapping EV charging slot allocation** at multi-port public charging hubs. 

Built as a practical implementation of **Design & Analysis of Algorithms (DAA)** concepts, comparing a **Path-Compressed DSU Greedy Heuristic** against **Dynamic Programming (Weighted Interval Scheduling)** across real-world Delhi NCR charging hubs.

---

## 🎯 Problem Statement
Public EV charging stations receive overlapping booking requests with varying charging durations, surge pricing bids, and strict departure deadlines. Because charger ports cannot serve multiple vehicles simultaneously, the station must select an optimal non-conflicting subset of requests per port to maximize total station revenue.

---

## 🧠 Algorithmic Architecture & Complexity

| Approach | DAA Paradigm | Time Complexity | Space Complexity | Optimality Guarantee |
| :--- | :--- | :--- | :--- | :--- |
| **Greedy Sequencing** | Greedy Strategy (Job Sequencing with Deadlines + Disjoint Set Union) | $O(N \log N)$ amortized via Path Compression | $O(D)$ where $D$ is max deadline | **Sub-optimal** for arbitrary interval lengths |
| **Weighted Interval Scheduling** | Dynamic Programming + Binary Search (`bisect_right`) | $O(N \log N)$ | $O(N)$ via boolean backtracking | **Globally Optimal** revenue allocation |

### DP Recurrence Relation
After sorting requests by finish time $f_1 \le f_2 \le \dots \le f_n$:
$$DP[i] = \max\Big(w_i + DP[p(i)],\; DP[i-1]\Big)$$
where $p(i)$ is the largest index $j < i$ such that $f_j \le s_i$, computed in $O(\log N)$ using binary search.

---

## ✨ Key Features
- **Interactive Delhi NCR Grid Radar:** Switch between Connaught Place, Aerocity, Nehru Place, Dwarka Sec-21, and DLF CyberHub with live grid capacities and surge multipliers.
- **Multi-Port Gantt Timeline:** Visualizes non-overlapping vehicle allocations per charger port for both algorithms side-by-side.
- **Live Rush Hour Simulator:** Streams real Indian EV models (Tata Nexon EV, Mahindra XUV400, MG ZS EV, BYD Atto 3, Hyundai Ioniq 5) into the queue dynamically.
- **Interactive DP State-Space Debugger:** Step-by-step scrubber showing `INCLUDE` vs. `SKIP` decisions, compatible prior jobs $p(i)$, and cumulative DP values.
- **Sustainability & Revenue Telemetry:** Tracks Revenue Leakage Prevented (₹), Port Utilization (%), and $\text{CO}_2$ Offset (kg), with one-click CSV report export.

---

## 🛠️ Tech Stack
- **Backend:** Python, FastAPI, Pydantic, Uvicorn, Docker
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Deployment:** Render (Docker Web Service) & Vercel

---

## 🚀 Local Setup

### 1. Backend (FastAPI)
```bash
cd backend
python -m venv venv
# Windows PowerShell:
venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
