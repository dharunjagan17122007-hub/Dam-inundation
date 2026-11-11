import React, { useEffect, useState } from 'react';
import {
  GitCompare,
  BarChart2,
  TrendingUp,
  Layers,
  Clock,
  Home,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { api, ScenarioItem } from '../services/api';

interface ScenarioComparisonProps {
  damId: string;
}

export const ScenarioComparison: React.FC<ScenarioComparisonProps> = ({ damId }) => {
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchScenarios = async () => {
    try {
      setLoading(true);
      const data = await api.getScenarios(damId);
      setScenarios(data);
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScenarios();
  }, [damId]);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
        <p className="text-xs">Computing multi-scenario parametric models...</p>
      </div>
    );
  }

  const chartData = scenarios.map((s) => ({
    name: s.name.split(':')[0], // e.g. Scenario A
    breachWidth: s.breach_width_m,
    peakFlow: Math.round(s.peak_discharge_cumec),
    floodArea: s.flooded_area_sqkm,
    maxDepth: s.max_depth_m,
    arrivalTime: Math.round(s.arrival_time_min),
    villages: s.affected_villages,
  }));

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Multi-Scenario Parametric Inundation Comparison
            </h2>
          </div>
          <button
            onClick={fetchScenarios}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recompute
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-2">
          Compare downstream flood risk across varying breach width scales (50m Piping failure vs 85m Design overtopping vs 150m PMF Catastrophic collapse).
        </p>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Chart 1: Peak Outflow vs Flooded Area */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-cyan-400" />
                Peak Breach Discharge (m³/s)
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="peakFlow" fill="#06b6d4" name="Peak Discharge (m³/s)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Inundated Area vs Arrival Time */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-400" />
                Inundated Extent (km²) & Affected Villages
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#f59e0b', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="floodArea" fill="#3b82f6" name="Flooded Area (km²)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="villages" fill="#f59e0b" name="Affected Villages" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Structured Comparison Matrix Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/90 text-slate-400 font-semibold">
                <th className="py-3 px-4">Scenario Description</th>
                <th className="py-3 px-4">Breach Width</th>
                <th className="py-3 px-4">Peak Discharge (Qₚ)</th>
                <th className="py-3 px-4">Inundated Area</th>
                <th className="py-3 px-4">Max Depth</th>
                <th className="py-3 px-4">First Arrival</th>
                <th className="py-3 px-4">Habitations Impacted</th>
                <th className="py-3 px-4">Model Engine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-slate-200">
              {scenarios.map((s, idx) => (
                <tr key={s.scenario_id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-sans font-medium text-white">
                    {s.name}
                  </td>
                  <td className="py-3 px-4 text-cyan-400">{s.breach_width_m} m</td>
                  <td className="py-3 px-4 text-cyan-300 font-bold">
                    {Math.round(s.peak_discharge_cumec).toLocaleString()} m³/s
                  </td>
                  <td className="py-3 px-4 text-blue-300">{s.flooded_area_sqkm} km²</td>
                  <td className="py-3 px-4 text-amber-300">{s.max_depth_m} m</td>
                  <td className="py-3 px-4 text-red-400">T+{Math.round(s.arrival_time_min)} min</td>
                  <td className="py-3 px-4 text-orange-400 font-bold">{s.affected_villages} villages</td>
                  <td className="py-3 px-4 text-slate-400 font-sans text-[11px]">{s.model_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
