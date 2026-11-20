from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from typing import List, Dict, Any
import bisect
import time

app = FastAPI(title="VoltGrid AI — Smart EV Charging Profit & Grid Optimizer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATION_HUBS: Dict[str, Dict[str, Any]] = {
    "cp-hub": {
        "name": "Connaught Place SuperHub",
        "city": "Central Delhi",
        "coords": "28.6315° N, 77.2167° E",
        "map_x": 52,
        "map_y": 44,
        "default_ports": 2,
        "surge_multiplier": 1.25,
        "grid_capacity_kw": 240,
    },
    "aerocity": {
        "name": "Aerocity IGI Fast-Charge Plaza",
        "city": "South West Delhi",
        "coords": "28.5562° N, 77.1000° E",
        "map_x": 28,
        "map_y": 68,
        "default_ports": 2,
        "surge_multiplier": 1.35,
        "grid_capacity_kw": 300,
    },
    "nehru-place": {
        "name": "Nehru Place Tech Park Grid",
        "city": "South Delhi",
        "coords": "28.5494° N, 77.2501° E",
        "map_x": 64,
        "map_y": 72,
        "default_ports": 2,
        "surge_multiplier": 1.15,
        "grid_capacity_kw": 220,
    },
    "dwarka-21": {
        "name": "Dwarka Sec-21 Metro EV Hub",
        "city": "West Delhi",
        "coords": "28.5523° N, 77.0583° E",
        "map_x": 16,
        "map_y": 54,
        "default_ports": 3,
        "surge_multiplier": 1.10,
        "grid_capacity_kw": 340,
    },
    "cyber-hub": {
        "name": "DLF CyberHub Express Chargers",
        "city": "Gurugram NCR",
        "coords": "28.4950° N, 77.0895° E",
        "map_x": 34,
        "map_y": 86,
        "default_ports": 3,
        "surge_multiplier": 1.30,
        "grid_capacity_kw": 360,
    },
}


class EVRequest(BaseModel):
    id: str
    vehicle: str = Field(default="Tata Nexon EV")
    battery_kwh: float = Field(default=30.0, gt=0)
    start: int = Field(..., ge=0)
    end: int = Field(..., gt=0)
    profit: float = Field(..., ge=0)

    @model_validator(mode="after")
    def validate_times(self):
        if self.end <= self.start:
            raise ValueError(f"{self.id}: Deadline ({self.end}h) must be greater than arrival ({self.start}h).")
        return self


class OptimizationRequest(BaseModel):
    requests: List[EVRequest]
    ports: int = Field(default=2, ge=1, le=8)
    station_id: str = Field(default="cp-hub")
    apply_surge: bool = Field(default=True)


class DSU:
    def __init__(self, n: int):
        self.parent = list(range(n + 1))

    def find(self, s: int) -> int:
        if self.parent[s] == s:
            return s
        self.parent[s] = self.find(self.parent[s])
        return self.parent[s]

    def union(self, u: int, v: int):
        self.parent[v] = u


def solve_greedy_dsu(jobs: List[EVRequest], ports: int, multiplier: float):
    t0 = time.perf_counter()
    enriched = [
        {
            "id": j.id,
            "vehicle": j.vehicle,
            "battery_kwh": j.battery_kwh,
            "start": j.start,
            "end": j.end,
            "base_profit": j.profit,
            "profit": round(j.profit * multiplier, 2),
        }
        for j in jobs
    ]

    remaining = sorted(enriched, key=lambda x: x["profit"], reverse=True)
    max_deadline = max((j["end"] for j in enriched), default=0)

    selected_all = []
    total_profit = 0.0

    for port_idx in range(ports):
        if not remaining:
            break
        dsu = DSU(max_deadline)
        next_remaining = []

        for job in remaining:
            slot = dsu.find(min(job["end"], max_deadline))
            if slot > job["start"]:
                dsu.union(dsu.find(slot - 1), slot)
                selected_all.append({**job, "port": port_idx + 1})
                total_profit += job["profit"]
            else:
                next_remaining.append(job)

        remaining = next_remaining

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 4)
    return selected_all, round(total_profit, 2), elapsed_ms


def solve_dp_wis(jobs: List[EVRequest], ports: int, multiplier: float):
    t0 = time.perf_counter()
    enriched = [
        {
            "id": j.id,
            "vehicle": j.vehicle,
            "battery_kwh": j.battery_kwh,
            "start": j.start,
            "end": j.end,
            "base_profit": j.profit,
            "profit": round(j.profit * multiplier, 2),
        }
        for j in jobs
    ]

    remaining = list(enriched)
    selected_all = []
    total_profit = 0.0
    dp_steps = []

    for port_idx in range(ports):
        if not remaining:
            break

        dp_jobs = sorted(remaining, key=lambda x: x["end"])
        n = len(dp_jobs)
        finish_times = [j["end"] for j in dp_jobs]

        p = [bisect.bisect_right(finish_times, dp_jobs[i]["start"]) - 1 for i in range(n)]
        dp = [0.0] * n
        take = [False] * n

        dp[0] = dp_jobs[0]["profit"]
        take[0] = True

        if port_idx == 0:
            dp_steps.append(
                {
                    "step": 1,
                    "id": dp_jobs[0]["id"],
                    "vehicle": dp_jobs[0]["vehicle"],
                    "window": f"{dp_jobs[0]['start']}h → {dp_jobs[0]['end']}h",
                    "profit": dp_jobs[0]["profit"],
                    "compatible_prev": "None (Base Case)",
                    "include_val": dp_jobs[0]["profit"],
                    "exclude_val": 0.0,
                    "dp_optimal": dp[0],
                    "decision": "INCLUDE",
                }
            )

        for i in range(1, n):
            prev_best = dp[p[i]] if p[i] != -1 else 0.0
            inc = round(dp_jobs[i]["profit"] + prev_best, 2)
            exc = round(dp[i - 1], 2)

            if inc > exc:
                dp[i] = inc
                take[i] = True
            else:
                dp[i] = exc
                take[i] = False

            if port_idx == 0:
                dp_steps.append(
                    {
                        "step": i + 1,
                        "id": dp_jobs[i]["id"],
                        "vehicle": dp_jobs[i]["vehicle"],
                        "window": f"{dp_jobs[i]['start']}h → {dp_jobs[i]['end']}h",
                        "profit": dp_jobs[i]["profit"],
                        "compatible_prev": (
                            f"{dp_jobs[p[i]]['id']} (₹{dp[p[i]]})" if p[i] != -1 else "None"
                        ),
                        "include_val": inc,
                        "exclude_val": exc,
                        "dp_optimal": dp[i],
                        "decision": "INCLUDE" if take[i] else "SKIP",
                    }
                )

        chosen = set()
        idx = n - 1
        while idx >= 0:
            if take[idx]:
                chosen.add(idx)
                idx = p[idx]
            else:
                idx -= 1

        port_selected = []
        next_remaining = []
        for i, job in enumerate(dp_jobs):
            if i in chosen:
                port_selected.append({**job, "port": port_idx + 1})
                total_profit += job["profit"]
            else:
                next_remaining.append(job)

        port_selected.reverse()
        selected_all.extend(port_selected)
        remaining = next_remaining

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 4)
    return selected_all, round(total_profit, 2), elapsed_ms, dp_steps


@app.get("/")
def health_check():
    return {"status": "online", "service": "VoltGrid AI Optimization Engine"}


@app.get("/api/stations")
def list_stations():
    return STATION_HUBS


@app.post("/api/optimize")
def optimize_schedule(data: OptimizationRequest):
    try:
        station = STATION_HUBS.get(data.station_id, STATION_HUBS["cp-hub"])
        multiplier = station["surge_multiplier"] if data.apply_surge else 1.0

        greedy_sel, greedy_profit, greedy_ms = solve_greedy_dsu(data.requests, data.ports, multiplier)
        dp_sel, dp_profit, dp_ms, dp_steps = solve_dp_wis(data.requests, data.ports, multiplier)

        max_time = max((j.end for j in data.requests), default=1)
        total_slot_capacity = max_time * data.ports

        greedy_hours = sum(j["end"] - j["start"] for j in greedy_sel)
        dp_hours = sum(j["end"] - j["start"] for j in dp_sel)

        dp_kwh = sum(j["battery_kwh"] for j in dp_sel)
        # ~0.72 kg CO2 saved per kWh clean EV grid charge vs ICE petrol equivalent
        co2_saved_kg = round(dp_kwh * 0.72, 1)

        revenue_prevented = round(dp_profit - greedy_profit, 2)
        uplift_pct = round((revenue_prevented / greedy_profit) * 100, 1) if greedy_profit > 0 else 0.0

        return {
            "station": {
                "id": data.station_id,
                **station,
                "active_multiplier": multiplier,
            },
            "telemetry": {
                "revenue_prevented": revenue_prevented,
                "uplift_percentage": uplift_pct,
                "co2_saved_kg": co2_saved_kg,
                "energy_delivered_kwh": round(dp_kwh, 1),
                "total_vehicles": len(data.requests),
                "served_by_dp": len(dp_sel),
                "ports": data.ports,
            },
            "greedy": {
                "selected": greedy_sel,
                "total_profit": greedy_profit,
                "complexity": "O(N log N) w/ Path-Compressed DSU",
                "execution_ms": greedy_ms,
                "utilization_pct": round((greedy_hours / total_slot_capacity) * 100, 1),
            },
            "dp": {
                "selected": dp_sel,
                "total_profit": dp_profit,
                "complexity": "O(N log N) Time | O(N) Space",
                "execution_ms": dp_ms,
                "utilization_pct": round((dp_hours / total_slot_capacity) * 100, 1),
                "steps": dp_steps,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))