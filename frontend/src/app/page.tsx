'use client';
import { useState } from 'react';

interface EVRequest {
  id: string;
  start: number;
  end: number;
  profit: number;
}

export default function Home() {
  const [requests, setRequests] = useState<EVRequest[]>([
    { id: 'EV-101', start: 0, end: 3, profit: 150 },
    { id: 'EV-102', start: 1, end: 5, profit: 200 },
    { id: 'EV-103', start: 3, end: 6, profit: 300 },
    { id: 'EV-104', start: 5, end: 8, profit: 250 },
  ]);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runOptimization = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      });
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="border-b border-slate-800 pb-4">
          <h1 className="text-3xl font-bold tracking-tight text-emerald-400">EV Charging Slot Profit Maximization</h1>
          <p className="text-slate-400 mt-1">Comparing Greedy Job Sequencing vs. Dynamic Programming (Weighted Interval Scheduling)</p>
        </header>

        {/* Input Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Incoming EV Booking Requests</h2>
          <div className="space-y-3">
            {requests.map((req, idx) => (
              <div key={idx} className="flex gap-4 items-center bg-slate-950 p-3 rounded-lg border border-slate-800">
                <input 
                  type="text" value={req.id} 
                  onChange={(e) => {
                    const updated = [...requests];
                    updated[idx].id = e.target.value;
                    setRequests(updated);
                  }}
                  className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded w-28 text-sm"
                />
                <span className="text-sm text-slate-400">Start:</span>
                <input 
                  type="number" value={req.start} 
                  onChange={(e) => {
                    const updated = [...requests];
                    updated[idx].start = Number(e.target.value);
                    setRequests(updated);
                  }}
                  className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded w-20 text-sm"
                />
                <span className="text-sm text-slate-400">Deadline/End:</span>
                <input 
                  type="number" value={req.end} 
                  onChange={(e) => {
                    const updated = [...requests];
                    updated[idx].end = Number(e.target.value);
                    setRequests(updated);
                  }}
                  className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded w-20 text-sm"
                />
                <span className="text-sm text-slate-400">Surge Profit (₹):</span>
                <input 
                  type="number" value={req.profit} 
                  onChange={(e) => {
                    const updated = [...requests];
                    updated[idx].profit = Number(e.target.value);
                    setRequests(updated);
                  }}
                  className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded w-24 text-sm"
                />
              </div>
            ))}
          </div>
          <button 
            onClick={runOptimization}
            disabled={loading}
            className="mt-6 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold px-6 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            {loading ? 'Optimizing Port Allocation...' : 'Run Optimization'}
          </button>
        </div>

        {/* Results Comparison */}
        {results && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Greedy */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold text-amber-400">Greedy Approach (Job Sequencing)</h3>
              <p className="text-xs text-slate-400 mt-1">Complexity: {results.greedy.complexity}</p>
              <div className="mt-4 text-2xl font-extrabold text-emerald-400">₹{results.greedy.total_profit}</div>
              <div className="mt-4 space-y-2">
                {results.greedy.selected.map((j: any) => (
                  <div key={j.id} className="bg-slate-950 p-2.5 rounded border border-slate-800 text-sm flex justify-between">
                    <span>{j.id} (Slot {j.start}–{j.end})</span>
                    <span className="text-emerald-400">₹{j.profit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* DP */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-lg font-bold text-cyan-400">Dynamic Programming (Weighted Intervals)</h3>
              <p className="text-xs text-slate-400 mt-1">Complexity: {results.dp.complexity}</p>
              <div className="mt-4 text-2xl font-extrabold text-emerald-400">₹{results.dp.total_profit}</div>
              <div className="mt-4 space-y-2">
                {results.dp.selected.map((j: any) => (
                  <div key={j.id} className="bg-slate-950 p-2.5 rounded border border-slate-800 text-sm flex justify-between">
                    <span>{j.id} (Slot {j.start}–{j.end})</span>
                    <span className="text-emerald-400">₹{j.profit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}