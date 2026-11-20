'use client';
import { useState, useEffect, useRef } from 'react';

interface EVRequest {
  id: string;
  vehicle: string;
  battery_kwh: number;
  start: number;
  end: number;
  profit: number;
}

interface ScheduledJob extends EVRequest {
  base_profit: number;
  port: number;
}

interface DPStepRow {
  step: number;
  id: string;
  vehicle: string;
  window: string;
  profit: number;
  compatible_prev: string;
  include_val: number;
  exclude_val: number;
  dp_optimal: number;
  decision: string;
}

interface AlgoResult {
  selected: ScheduledJob[];
  total_profit: number;
  complexity: string;
  execution_ms: number;
  utilization_pct: number;
  steps?: DPStepRow[];
}

interface OptimizationResponse {
  station: {
    id: string;
    name: string;
    city: string;
    coords: string;
    default_ports: number;
    surge_multiplier: number;
    grid_capacity_kw: number;
    active_multiplier: number;
  };
  telemetry: {
    revenue_prevented: number;
    uplift_percentage: number;
    co2_saved_kg: number;
    energy_delivered_kwh: number;
    total_vehicles: number;
    served_by_dp: number;
    ports: number;
  };
  greedy: AlgoResult;
  dp: AlgoResult;
}

const STATIONS = [
  {
    id: 'cp-hub',
    name: 'Connaught Place SuperHub',
    city: 'Central Delhi',
    coords: '28.6315° N, 77.2167° E',
    x: 54,
    y: 36,
    ports: 2,
    surge: 1.25,
    kw: 240,
  },
  {
    id: 'dwarka-21',
    name: 'Dwarka Sec-21 Metro EV Hub',
    city: 'West Delhi',
    coords: '28.5523° N, 77.0583° E',
    x: 20,
    y: 48,
    ports: 3,
    surge: 1.1,
    kw: 340,
  },
  {
    id: 'aerocity',
    name: 'Aerocity IGI Fast-Charge Plaza',
    city: 'South West Delhi',
    coords: '28.5562° N, 77.1000° E',
    x: 34,
    y: 64,
    ports: 2,
    surge: 1.35,
    kw: 300,
  },
  {
    id: 'nehru-place',
    name: 'Nehru Place Tech Park Grid',
    city: 'South Delhi',
    coords: '28.5494° N, 77.2501° E',
    x: 72,
    y: 66,
    ports: 2,
    surge: 1.15,
    kw: 220,
  },
  {
    id: 'cyber-hub',
    name: 'DLF CyberHub Express Chargers',
    city: 'Gurugram NCR',
    coords: '28.4950° N, 77.0895° E',
    x: 42,
    y: 84,
    ports: 3,
    surge: 1.3,
    kw: 360,
  },
];

const EV_MODELS = [
  { name: 'Tata Nexon EV Max', kwh: 40.5 },
  { name: 'Mahindra XUV400 Pro', kwh: 39.4 },
  { name: 'MG ZS EV Exclusive', kwh: 50.3 },
  { name: 'BYD Atto 3 Extended', kwh: 60.4 },
  { name: 'Hyundai Ioniq 5', kwh: 72.6 },
  { name: 'Tata Tiago.ev LR', kwh: 24.0 },
];

const INITIAL_QUEUE: EVRequest[] = [
  { id: 'DL-01-EV101', vehicle: 'Hyundai Ioniq 5', battery_kwh: 65, start: 0, end: 6, profit: 260 },
  { id: 'DL-03-EV102', vehicle: 'Tata Nexon EV Max', battery_kwh: 38, start: 0, end: 2, profit: 140 },
  { id: 'HR-26-EV103', vehicle: 'BYD Atto 3 Extended', battery_kwh: 52, start: 2, end: 4, profit: 150 },
  { id: 'DL-09-EV104', vehicle: 'MG ZS EV Exclusive', battery_kwh: 44, start: 4, end: 6, profit: 160 },
  { id: 'DL-04-EV105', vehicle: 'Mahindra XUV400 Pro', battery_kwh: 36, start: 1, end: 5, profit: 230 },
];

export default function VoltGridCommandCenter() {
  const [darkMode, setDarkMode] = useState(true);
  const [stationId, setStationId] = useState('cp-hub');
  const [applySurge, setApplySurge] = useState(true);
  const [ports, setPorts] = useState<number>(1);
  const [requests, setRequests] = useState<EVRequest[]>(INITIAL_QUEUE);
  const [results, setResults] = useState<OptimizationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live Rush Hour Simulator state
  const [isSimulating, setIsSimulating] = useState(false);
  const simCounter = useRef(106);

  // Interactive DP Scrubber state
  const [activeStep, setActiveStep] = useState<number>(0);

  const activeStation = STATIONS.find((s) => s.id === stationId) || STATIONS[0];

  const handleSelectStation = (st: (typeof STATIONS)[number]) => {
    setStationId(st.id);
    setPorts(st.ports);
  };

  const triggerOptimization = async (
    customQueue = requests,
    customPorts = ports,
    customStation = stationId,
    customSurge = applySurge
  ) => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: customQueue,
          ports: customPorts,
          station_id: customStation,
          apply_surge: customSurge,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail?.[0]?.msg || data.detail || 'Optimization failed');
      }
      setResults(data);
      if (data.dp?.steps?.length) {
        setActiveStep(data.dp.steps.length - 1);
      }
    } catch (err: any) {
      setError(err?.message || 'FastAPI engine offline on port 8000.');
      setIsSimulating(false);
    } finally {
      setLoading(false);
    }
  };

  // Initial auto-run on mount so dashboard is immediately alive
  useEffect(() => {
    triggerOptimization(INITIAL_QUEUE, 1, 'cp-hub', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live Rush Hour Auto-Stream interval
  useEffect(() => {
    if (!isSimulating) return;
    const timer = setInterval(() => {
      const model = EV_MODELS[Math.floor(Math.random() * EV_MODELS.length)];
      const start = Math.floor(Math.random() * 8);
      const duration = Math.floor(Math.random() * 3) + 1;
      const end = start + duration;
      const profit = Math.round((duration * 75 + Math.random() * 90) / 10) * 10;
      const prefixes = ['DL-01', 'DL-03', 'DL-08', 'HR-26', 'UP-16'];
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const newEV: EVRequest = {
        id: `${prefix}-EV${simCounter.current++}`,
        vehicle: model.name,
        battery_kwh: model.kwh,
        start,
        end,
        profit,
      };

      setRequests((prev) => {
        const updated = prev.length >= 10 ? [...prev.slice(1), newEV] : [...prev, newEV];
        triggerOptimization(updated, ports, stationId, applySurge);
        return updated;
      });
    }, 2200);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimulating, ports, stationId, applySurge]);

  const addManualEV = () => {
    const model = EV_MODELS[requests.length % EV_MODELS.length];
    const nextItem: EVRequest = {
      id: `DL-01-EV${simCounter.current++}`,
      vehicle: model.name,
      battery_kwh: model.kwh,
      start: 1,
      end: 4,
      profit: 190,
    };
    setRequests([...requests, nextItem]);
  };

  const removeEV = (idx: number) => {
    if (requests.length <= 1) return;
    setRequests(requests.filter((_, i) => i !== idx));
  };

  const updateField = (idx: number, field: keyof EVRequest, value: string | number) => {
    const updated = [...requests];
    if (field === 'id' || field === 'vehicle') {
      updated[idx][field] = String(value);
    } else {
      updated[idx][field] = Number(value);
    }
    setRequests(updated);
  };

  const exportReportCSV = () => {
    if (!results) return;
    const rows = [
      ['Algorithm', 'Hub_Name', 'Port', 'Vehicle_ID', 'Model', 'Start_Hr', 'End_Hr', 'Revenue_INR'],
      ...results.greedy.selected.map((j) => [
        'Greedy_DSU',
        results.station.name,
        String(j.port),
        j.id,
        j.vehicle,
        String(j.start),
        String(j.end),
        String(j.profit),
      ]),
      ...results.dp.selected.map((j) => [
        'Dynamic_Programming_WIS',
        results.station.name,
        String(j.port),
        j.id,
        j.vehicle,
        String(j.start),
        String(j.end),
        String(j.profit),
      ]),
    ];
    const csv = 'data:text/csv;charset=utf-8,' + rows.map((r) => r.join(',')).join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `VoltGrid_${results.station.id}_Report.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const maxTimeline = Math.max(10, ...requests.map((r) => r.end));

  // Theme tokens: Glowing Teal & Gold Neon on Dark Glass vs Clean Daylight Telemetry
  const shellClass = darkMode
    ? 'bg-[#060911] text-slate-100 selection:bg-teal-400 selection:text-slate-950'
    : 'bg-slate-100 text-slate-900 selection:bg-teal-600 selection:text-white';

  const glassCard = darkMode
    ? 'bg-slate-900/65 backdrop-blur-xl border border-teal-500/20 shadow-[0_0_30px_rgba(20,184,166,0.06)]'
    : 'bg-white/90 backdrop-blur-xl border border-slate-200/90 shadow-sm';

  const subSurface = darkMode
    ? 'bg-slate-950/80 border border-slate-800/90'
    : 'bg-slate-50 border border-slate-200';

  const inputStyle = darkMode
    ? 'bg-slate-900 border-slate-700 text-slate-100 focus:border-teal-400 outline-none'
    : 'bg-white border-slate-300 text-slate-900 focus:border-teal-600 outline-none';

  const muted = darkMode ? 'text-slate-400' : 'text-slate-600';

  const renderPortGantt = (jobs: ScheduledJob[], numPorts: number, variant: 'gold' | 'teal') => {
    const barTheme =
      variant === 'gold'
        ? 'bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 shadow-[0_0_12px_rgba(251,191,36,0.45)]'
        : 'bg-gradient-to-r from-teal-400 to-cyan-300 text-slate-950 shadow-[0_0_12px_rgba(45,212,191,0.45)]';

    return (
      <div className="mt-4 space-y-2.5">
        <div className={`flex justify-between text-xs ${muted}`}>
          <span>Live Charger Port Allocation</span>
          <span>0h — {maxTimeline}h</span>
        </div>
        {Array.from({ length: numPorts }, (_, i) => i + 1).map((portNum) => {
          const portJobs = jobs.filter((j) => j.port === portNum);
          return (
            <div key={portNum} className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className={`font-semibold ${muted}`}>Charger Port #{portNum}</span>
                <span className={muted}>{portJobs.length} EVs scheduled</span>
              </div>
              <div className={`relative h-10 w-full rounded-lg overflow-hidden ${subSurface}`}>
                {portJobs.map((job) => {
                  const leftPct = Math.max(0, (job.start / maxTimeline) * 100);
                  const widthPct = Math.max(6, ((job.end - job.start) / maxTimeline) * 100);
                  return (
                    <div
                      key={`${portNum}-${job.id}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={`${job.id} (${job.vehicle}): ${job.start}h–${job.end}h | ₹${job.profit}`}
                      className={`absolute top-1 bottom-1 rounded-md px-2 flex items-center justify-center text-[11px] font-extrabold truncate transition-all duration-300 ${barTheme}`}
                    >
                      {job.id.split('-').pop()} • ₹{job.profit}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const currentDPTrace = results?.dp?.steps || [];
  const scrubbedStep = currentDPTrace[Math.min(activeStep, Math.max(0, currentDPTrace.length - 1))];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${shellClass}`}>
      {/* Subtle Neon Ambient Glow in Dark Mode */}
      {darkMode && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/4 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl" />
          <div className="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        </div>
      )}

      <div className="relative max-w-7xl mx-auto p-5 md:p-8 space-y-6">
        {/* Top Command Header */}
        <header className={`rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${glassCard}`}>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/30">
                <span className="h-2 w-2 rounded-full bg-teal-400 animate-ping" />
                VoltGrid NCR Telemetry
              </span>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                DAA: Weighted Interval DP vs. DSU Greedy
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 via-cyan-300 to-amber-300 bg-clip-text text-transparent">
              EV Charging Station Slot Profit Maximization
            </h1>
            <p className={`text-xs md:text-sm mt-1 ${muted}`}>
              Autonomous multi-port revenue allocation & grid load optimizer across Delhi NCR fast-charging hubs
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsSimulating(!isSimulating)}
              className={`text-xs font-bold px-4 py-2 rounded-xl border transition-all cursor-pointer ${
                isSimulating
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                  : 'bg-teal-500/20 border-teal-500/40 text-teal-300 hover:bg-teal-500/30'
              }`}
            >
              {isSimulating ? '⏹ Stop Rush Hour Stream' : '⚡ Simulate Live Rush Hour'}
            </button>

            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className={`text-xs font-bold px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                darkMode
                  ? 'bg-amber-400/15 border-amber-400/40 text-amber-300 hover:bg-amber-400/25'
                  : 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {darkMode ? '☀ Daylight Mode' : '🌙 Neon Dark Mode'}
            </button>
          </div>
        </header>

        {/* 4 Live KPI Telemetry Gauges */}
        {results && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`rounded-2xl p-4 ${glassCard}`}>
              <div className={`text-xs font-medium ${muted}`}>DP Optimal Station Profit</div>
              <div className="text-2xl md:text-3xl font-extrabold text-teal-400 mt-1">
                ₹{results.dp.total_profit}
              </div>
              <div className="text-[11px] text-teal-400/80 mt-1">
                {results.telemetry.served_by_dp} of {results.telemetry.total_vehicles} EVs served
              </div>
            </div>

            <div className={`rounded-2xl p-4 ${glassCard}`}>
              <div className={`text-xs font-medium ${muted}`}>Revenue Leakage Prevented</div>
              <div className="text-2xl md:text-3xl font-extrabold text-amber-400 mt-1">
                +₹{results.telemetry.revenue_prevented}
              </div>
              <div className="text-[11px] text-amber-400/80 mt-1">
                +{results.telemetry.uplift_percentage}% uplift over Greedy
              </div>
            </div>

            <div className={`rounded-2xl p-4 ${glassCard}`}>
              <div className={`text-xs font-medium ${muted}`}>Clean Energy & CO₂ Offset</div>
              <div className="text-2xl md:text-3xl font-extrabold text-emerald-400 mt-1">
                {results.telemetry.co2_saved_kg} kg
              </div>
              <div className={`text-[11px] mt-1 ${muted}`}>
                {results.telemetry.energy_delivered_kwh} kWh green dispatch
              </div>
            </div>

            <div className={`rounded-2xl p-4 ${glassCard}`}>
              <div className={`text-xs font-medium ${muted}`}>Grid Port Utilization</div>
              <div className="text-2xl md:text-3xl font-extrabold text-cyan-400 mt-1">
                {results.dp.utilization_pct}%
              </div>
              <div className={`text-[11px] mt-1 ${muted}`}>
                {results.station.grid_capacity_kw} kW Transformer Cap
              </div>
            </div>
          </section>
        )}

        {/* Interactive Delhi NCR Radar Map + Station Inspector */}
        <section className="grid lg:grid-cols-12 gap-6">
          {/* Interactive Radar Grid Map */}
          <div className={`lg:col-span-5 rounded-2xl p-5 flex flex-col justify-between ${glassCard}`}>
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-teal-400">
                  Delhi NCR Charging Grid Map
                </h2>
                <span className={`text-[11px] ${muted}`}>Click hub node</span>
              </div>

              {/* Stylized Radar Grid Canvas */}
              <div
                className={`relative h-64 w-full rounded-xl overflow-hidden border ${
                  darkMode
                    ? 'bg-[#04070d] border-teal-500/25'
                    : 'bg-slate-900 border-slate-300'
                }`}
              >
                {/* SVG Grid & Corridor Lines */}
                <svg className="absolute inset-0 w-full h-full opacity-35" viewBox="0 0 100 100">
                  <defs>
                    <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#14b8a6" strokeWidth="0.3" />
                    </pattern>
                  </defs>
                  <rect width="100" height="100" fill="url(#grid)" />
                  {/* Corridor Connections */}
                  <line x1="20" y1="48" x2="54" y2="36" stroke="#2dd4bf" strokeWidth="0.6" strokeDasharray="2,2" />
                  <line x1="54" y1="36" x2="72" y2="66" stroke="#2dd4bf" strokeWidth="0.6" strokeDasharray="2,2" />
                  <line x1="34" y1="64" x2="54" y2="36" stroke="#fbbf24" strokeWidth="0.6" strokeDasharray="2,2" />
                  <line x1="34" y1="64" x2="42" y2="84" stroke="#2dd4bf" strokeWidth="0.6" strokeDasharray="2,2" />
                  <circle cx="50" cy="52" r="34" fill="none" stroke="#14b8a6" strokeWidth="0.35" />
                </svg>

                {/* Interactive Station Nodes */}
                {STATIONS.map((st) => {
                  const isSelected = st.id === stationId;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleSelectStation(st)}
                      style={{ left: `${st.x}%`, top: `${st.y}%` }}
                      className="group absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer focus:outline-none"
                    >
                      <span
                        className={`h-4 w-4 rounded-full flex items-center justify-center transition-transform ${
                          isSelected
                            ? 'bg-amber-400 scale-125 shadow-[0_0_16px_#fbbf24]'
                            : 'bg-teal-400 group-hover:scale-110 shadow-[0_0_10px_#2dd4bf]'
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-950" />
                      </span>
                      <span
                        className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                          isSelected
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-slate-950/85 text-teal-200 border border-teal-500/30'
                        }`}
                      >
                        {st.name.split(' ')[0]} ({st.surge}x)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Hub Telemetry Footer */}
            <div className={`mt-4 rounded-xl p-3.5 space-y-2 ${subSurface}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-teal-400">{activeStation.name}</div>
                  <div className={`text-[11px] ${muted}`}>
                    {activeStation.city} • {activeStation.coords}
                  </div>
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-amber-400/15 text-amber-400 border border-amber-400/30">
                  {activeStation.surge}x Surge
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applySurge}
                    onChange={(e) => setApplySurge(e.target.checked)}
                    className="accent-teal-400 w-4 h-4"
                  />
                  <span>Enable Dynamic Surge Pricing</span>
                </label>

                <label className="inline-flex items-center gap-1.5">
                  <span className={muted}>Ports:</span>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={ports}
                    onChange={(e) => setPorts(Math.max(1, Math.min(8, Number(e.target.value))))}
                    className={`w-12 text-center font-bold rounded border py-0.5 ${inputStyle}`}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Live Vehicle Booking Queue */}
          <div className={`lg:col-span-7 rounded-2xl p-5 flex flex-col justify-between ${glassCard}`}>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-bold">Incoming EV Charging Queue</h2>
                  <p className={`text-xs ${muted}`}>
                    Edit arrival, deadline, or surge bid — or stream live vehicles automatically
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addManualEV}
                  className="text-xs font-bold bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 border border-teal-500/30 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  + Add EV Request
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {requests.map((req, idx) => (
                  <div
                    key={`${req.id}-${idx}`}
                    className={`flex flex-wrap items-center gap-2 p-2.5 rounded-xl text-xs ${subSurface}`}
                  >
                    <input
                      type="text"
                      value={req.id}
                      onChange={(e) => updateField(idx, 'id', e.target.value)}
                      className={`border rounded px-2 py-1 w-24 font-mono font-bold ${inputStyle}`}
                    />
                    <input
                      type="text"
                      value={req.vehicle}
                      onChange={(e) => updateField(idx, 'vehicle', e.target.value)}
                      className={`border rounded px-2 py-1 w-36 ${inputStyle}`}
                    />
                    <div className="flex items-center gap-1">
                      <span className={muted}>In:</span>
                      <input
                        type="number"
                        min={0}
                        value={req.start}
                        onChange={(e) => updateField(idx, 'start', e.target.value)}
                        className={`border rounded px-1.5 py-1 w-12 ${inputStyle}`}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={muted}>Out:</span>
                      <input
                        type="number"
                        min={1}
                        value={req.end}
                        onChange={(e) => updateField(idx, 'end', e.target.value)}
                        className={`border rounded px-1.5 py-1 w-12 ${inputStyle}`}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={muted}>₹:</span>
                      <input
                        type="number"
                        min={0}
                        value={req.profit}
                        onChange={(e) => updateField(idx, 'profit', e.target.value)}
                        className={`border rounded px-1.5 py-1 w-16 font-semibold ${inputStyle}`}
                      />
                    </div>
                    {requests.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEV(idx)}
                        className="ml-auto text-rose-400 hover:text-rose-300 font-bold px-1.5 cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => triggerOptimization()}
                disabled={loading}
                className="bg-gradient-to-r from-teal-400 to-cyan-400 hover:from-teal-300 hover:to-cyan-300 text-slate-950 font-extrabold text-sm px-6 py-2.5 rounded-xl shadow-[0_0_20px_rgba(45,212,191,0.35)] transition-all cursor-pointer"
              >
                {loading ? 'Computing Optimal Allocation...' : 'Run Profit Maximization Engine'}
              </button>

              {results && (
                <button
                  type="button"
                  onClick={exportReportCSV}
                  className={`text-xs font-bold px-4 py-2.5 rounded-xl border transition-colors cursor-pointer ${
                    darkMode
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                      : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-900'
                  }`}
                >
                  ⬇ Download Audit CSV
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Side-by-Side Algorithmic Comparison */}
        {results && (
          <section className="grid lg:grid-cols-2 gap-6">
            {/* Greedy Card */}
            <div className={`rounded-2xl p-6 ${glassCard}`}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    Baseline Heuristic
                  </span>
                  <h3 className="text-xl font-bold mt-0.5">Greedy (DSU Job Sequencing)</h3>
                  <p className={`text-xs mt-0.5 ${muted}`}>{results.greedy.complexity}</p>
                </div>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-lg ${subSurface}`}>
                  {results.greedy.execution_ms} ms
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <div className="text-3xl font-extrabold text-amber-400">
                  ₹{results.greedy.total_profit}
                </div>
                <div className={`text-xs ${muted}`}>
                  Utilization: <span className="font-bold text-amber-400">{results.greedy.utilization_pct}%</span>
                </div>
              </div>

              {renderPortGantt(results.greedy.selected, results.telemetry.ports, 'gold')}

              <div className="mt-4 space-y-2">
                {results.greedy.selected.map((job) => (
                  <div
                    key={`g-${job.port}-${job.id}`}
                    className={`p-2.5 rounded-xl text-xs flex items-center justify-between ${subSurface}`}
                  >
                    <div>
                      <span className="font-bold text-amber-400 mr-2">[P{job.port}]</span>
                      <span className="font-mono font-semibold">{job.id}</span>
                      <span className={`ml-2 ${muted}`}>
                        ({job.vehicle} • {job.start}h–{job.end}h)
                      </span>
                    </div>
                    <span className="font-bold text-amber-400">₹{job.profit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* DP Card */}
            <div className={`rounded-2xl p-6 ${glassCard}`}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                    Global Optimal Solution
                  </span>
                  <h3 className="text-xl font-bold mt-0.5">Dynamic Programming (Weighted Intervals)</h3>
                  <p className={`text-xs mt-0.5 ${muted}`}>{results.dp.complexity}</p>
                </div>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-lg ${subSurface}`}>
                  {results.dp.execution_ms} ms
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <div className="text-3xl font-extrabold text-teal-400">
                  ₹{results.dp.total_profit}
                </div>
                <div className={`text-xs ${muted}`}>
                  Utilization: <span className="font-bold text-teal-400">{results.dp.utilization_pct}%</span>
                </div>
              </div>

              {renderPortGantt(results.dp.selected, results.telemetry.ports, 'teal')}

              <div className="mt-4 space-y-2">
                {results.dp.selected.map((job) => (
                  <div
                    key={`dp-${job.port}-${job.id}`}
                    className={`p-2.5 rounded-xl text-xs flex items-center justify-between ${subSurface}`}
                  >
                    <div>
                      <span className="font-bold text-teal-400 mr-2">[P{job.port}]</span>
                      <span className="font-mono font-semibold">{job.id}</span>
                      <span className={`ml-2 ${muted}`}>
                        ({job.vehicle} • {job.start}h–{job.end}h)
                      </span>
                    </div>
                    <span className="font-bold text-teal-400">₹{job.profit}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Interactive DP State-Space Scrubber (Viva Showcase) */}
        {results && currentDPTrace.length > 0 && (
          <section className={`rounded-2xl p-6 space-y-4 ${glassCard}`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-teal-400">
                  Interactive DP State-Space Debugger (Port #1 Recurrence)
                </h3>
                <p className={`text-xs ${muted}`}>
                  Scrub through each sorted EV request to inspect how DP evaluates Include vs. Exclude via Binary Search
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-teal-400">
                  Step {Math.min(activeStep + 1, currentDPTrace.length)} / {currentDPTrace.length}
                </span>
                <input
                  type="range"
                  min={0}
                  max={currentDPTrace.length - 1}
                  value={Math.min(activeStep, currentDPTrace.length - 1)}
                  onChange={(e) => setActiveStep(Number(e.target.value))}
                  className="accent-teal-400 cursor-pointer"
                />
              </div>
            </div>

            {scrubbedStep && (
              <div className={`grid md:grid-cols-4 gap-3 p-4 rounded-xl text-xs ${subSurface}`}>
                <div>
                  <div className={muted}>Evaluating Vehicle</div>
                  <div className="text-sm font-bold mt-0.5">
                    {scrubbedStep.id} ({scrubbedStep.window})
                  </div>
                  <div className="text-teal-400 mt-0.5">{scrubbedStep.vehicle}</div>
                </div>
                <div>
                  <div className={muted}>Compatible Prior Job p(i)</div>
                  <div className="text-sm font-bold mt-0.5">{scrubbedStep.compatible_prev}</div>
                </div>
                <div>
                  <div className={muted}>Include vs. Exclude Profit</div>
                  <div className="text-sm font-bold mt-0.5">
                    <span className="text-teal-400">₹{scrubbedStep.include_val}</span> vs.{' '}
                    <span className="text-amber-400">₹{scrubbedStep.exclude_val}</span>
                  </div>
                </div>
                <div>
                  <div className={muted}>DP[i] Optimal Decision</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-base font-extrabold text-teal-400">
                      ₹{scrubbedStep.dp_optimal}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-extrabold ${
                        scrubbedStep.decision === 'INCLUDE'
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {scrubbedStep.decision}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}