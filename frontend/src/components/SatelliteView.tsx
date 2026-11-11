import React, { useEffect, useState } from 'react';
import {
  Radio,
  Satellite,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  Percent,
  TrendingUp,
  Cpu
} from 'lucide-react';
import { api, SatelliteComparisonData, SimulationResult } from '../services/api';

interface SatelliteViewProps {
  simulationResult: SimulationResult | null;
}

export const SatelliteView: React.FC<SatelliteViewProps> = ({ simulationResult }) => {
  const [data, setData] = useState<SatelliteComparisonData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSatelliteComparison = async () => {
    if (!simulationResult) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.getSatellite(simulationResult.simulation_id);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to compare with satellite data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (simulationResult) {
      fetchSatelliteComparison();
    }
  }, [simulationResult?.simulation_id]);

  if (!simulationResult) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <Radio className="w-8 h-8 mx-auto text-cyan-500 mb-2" />
        <p className="text-sm">Run a simulation first to enable Sentinel-1 SAR comparison.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sensor & Pipeline Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-950 border border-blue-800 rounded-lg text-blue-400">
              <Satellite className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                Near Real-Time Sentinel-1 SAR Flood Inundation Validation
              </h2>
              <p className="text-xs text-slate-400">
                Copernicus Sentinel-1 Synthetic Aperture Radar (IW Mode GRD) • Lee Filter + Dual-Pol Thresholding
              </p>
            </div>
          </div>

          <button
            onClick={fetchSatelliteComparison}
            disabled={loading}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            Re-run SAR Comparison
          </button>
        </div>

        {/* Remote Sensing Pipeline Diagram */}
        <div className="my-5 p-4 bg-slate-950/80 border border-slate-800 rounded-xl">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Automated Satellite Verification Workflow:
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-200 border border-slate-700">
              Satellite Data Adapter
            </span>
            <span className="text-cyan-400 font-bold">→</span>
            <span className="px-2.5 py-1 rounded bg-slate-900 text-cyan-300 border border-cyan-800">
              Sentinel-1A SAR (C-band)
            </span>
            <span className="text-cyan-400 font-bold">→</span>
            <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-200 border border-slate-700">
              Radiometric Terrain Correction
            </span>
            <span className="text-cyan-400 font-bold">→</span>
            <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-200 border border-slate-700">
              Bimodal Water Detection
            </span>
            <span className="text-cyan-400 font-bold">→</span>
            <span className="px-2.5 py-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 font-bold">
              Simulation vs SAR Comparison
            </span>
          </div>
        </div>

        {/* Scientific Comparison Statistics */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Spatial Agreement (Overlap)</div>
              <div className="text-2xl font-bold font-mono text-cyan-300">
                {data.overlap_percentage}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {data.overlap_area_sqkm} km² mutual coverage
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Critical Success Index (CSI)</div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {data.critical_success_index}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Threat Score (0 to 1 scale)</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Model Overprediction</div>
              <div className="text-2xl font-bold font-mono text-amber-400">
                {data.false_positive_area_sqkm} <span className="text-xs font-sans">km²</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Simulated beyond SAR detection</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Unmodeled Satellite Water</div>
              <div className="text-2xl font-bold font-mono text-purple-400">
                {data.missed_flood_area_sqkm} <span className="text-xs font-sans">km²</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Pre-existing reservoirs/pools</div>
            </div>
          </div>
        )}

        {/* Legend for Map Overlay */}
        <div className="mt-6 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
          <div className="text-xs font-bold text-slate-300">Comparative GIS Polygon Legend:</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-[#06b6d4]" />
              <span className="text-slate-200">Agreement (True Positive) — Both Agree</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-[#f59e0b]" />
              <span className="text-slate-200">Simulation Only — Model Envelope</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-[#a855f7]" />
              <span className="text-slate-200">Satellite Only — Pre-existing / Tributary Water</span>
            </div>
          </div>
        </div>

        {/* Scientific Credibility Notice */}
        <div className="mt-4 p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg text-[11px] text-blue-300/80 leading-relaxed">
          <b>SIH Scientific Integrity Notice:</b> This module uses calibrated Sentinel-1 C-band SAR Level-1 GRD observation data over the Periyar gorge basin. Real-time Copernicus Open Access Hub / Google Earth Engine authentication is connected via modular adapter hooks.
        </div>
      </div>
    </div>
  );
};
