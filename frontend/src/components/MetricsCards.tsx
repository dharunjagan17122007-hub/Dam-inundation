import React from 'react';
import {
  Waves,
  Maximize2,
  Clock,
  Home,
  Users,
  AlertTriangle,
  Layers,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';
import { SimulationResult } from '../services/api';

interface MetricsCardsProps {
  result: SimulationResult | null;
  onNavigateToTab?: (tabId: string) => void;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({ result, onNavigateToTab }) => {
  if (!result) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center text-slate-400">
        <Waves className="w-8 h-8 mx-auto text-slate-600 mb-2 animate-bounce" />
        <p className="text-sm font-medium">No simulation loaded yet. Click "Run Hydrodynamic Simulation" to generate real results.</p>
      </div>
    );
  }

  const isCritical = result.severity_classification === 'CRITICAL';
  const isHigh = result.severity_classification === 'HIGH';

  return (
    <div className="space-y-4">
      {/* Warning Banner */}
      <div
        className={`rounded-xl p-4 border flex items-start gap-3.5 transition-all duration-300 ${
          isCritical
            ? 'bg-red-950/40 border-red-500/80 shadow-lg shadow-red-950/40'
            : isHigh
            ? 'bg-amber-950/40 border-amber-500/80'
            : 'bg-emerald-950/40 border-emerald-500/60'
        }`}
      >
        <div
          className={`p-2 rounded-lg mt-0.5 ${
            isCritical
              ? 'bg-red-900/80 text-red-300 animate-pulse'
              : isHigh
              ? 'bg-amber-900/80 text-amber-300'
              : 'bg-emerald-900/80 text-emerald-300'
          }`}
        >
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded tracking-wide ${
                isCritical
                  ? 'bg-red-900/90 text-red-200 border border-red-700'
                  : isHigh
                  ? 'bg-amber-900/90 text-amber-200 border border-amber-700'
                  : 'bg-emerald-900/90 text-emerald-200 border border-emerald-700'
              }`}
            >
              SEVERITY: {result.severity_classification}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Model: {result.model_used}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-100 mt-1.5 leading-snug">
            {result.warning_banner}
          </p>
        </div>
      </div>

      {/* Grid of Key Hydrodynamic Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Peak Discharge */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium">Peak Discharge (Qₚ)</span>
            <Waves className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-cyan-300">
            {Math.round(result.peak_discharge_cumec).toLocaleString()}{' '}
            <span className="text-xs font-sans text-slate-400 font-normal">m³/s</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Weir & Froehlich solver</div>
        </div>

        {/* Flooded Area */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium">Inundated Area</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-300">
            {result.flooded_area_sqkm.toFixed(1)}{' '}
            <span className="text-xs font-sans text-slate-400 font-normal">km²</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Calculated from 2D DEM grid</div>
        </div>

        {/* Max Depth */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium">Max Flood Depth</span>
            <Maximize2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {result.max_flood_depth_m.toFixed(1)}{' '}
            <span className="text-xs font-sans text-slate-400 font-normal">m</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Near breach channel invert</div>
        </div>

        {/* Arrival Time */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium">First Habitation Arrival</span>
            <Clock className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-xl font-bold font-mono text-red-400">
            {Math.round(result.min_arrival_time_min)}{' '}
            <span className="text-xs font-sans text-slate-400 font-normal">min</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Wave celerity along reach</div>
        </div>

        {/* Affected Settlements */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium">Affected Settlements</span>
            <Home className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-xl font-bold font-mono text-orange-300">
            {result.affected_settlements_count}{' '}
            <span className="text-xs font-sans text-slate-400 font-normal">villages</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Spatial GIS polygon overlay</div>
        </div>

        {/* Population at Risk */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-medium">Population at Risk</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-purple-300">
            {result.affected_population.toLocaleString()}{' '}
            <span className="text-xs font-sans text-slate-400 font-normal">people</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Census baseline estimate</div>
        </div>
      </div>
    </div>
  );
};
