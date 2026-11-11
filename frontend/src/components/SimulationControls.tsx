import React, { useState } from 'react';
import {
  Waves,
  Play,
  RotateCcw,
  Sliders,
  Settings2,
  Cpu,
  Info,
  CheckCircle,
  AlertCircle,
  Zap
} from 'lucide-react';
import { DamData, SimulationParamsInput } from '../services/api';

interface SimulationControlsProps {
  dams: DamData[];
  selectedDamId: string;
  onSelectDam: (damId: string) => void;
  onRunSimulation: (params: SimulationParamsInput) => Promise<void>;
  isRunning: boolean;
  onOpenLiveModel?: () => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  dams,
  selectedDamId,
  onSelectDam,
  onRunSimulation,
  isRunning,
  onOpenLiveModel
}) => {
  const currentDam = dams.find((d) => d.id === selectedDamId) || dams[0];

  // Configurable parameters
  const [modelType, setModelType] = useState<string>('Prototype 2D Flood Propagation Engine');
  const [breachWidth, setBreachWidth] = useState<number>(85.0);
  const [breachDepth, setBreachDepth] = useState<number>(35.0);
  const [formationTime, setFormationTime] = useState<number>(1.2);
  const [breachType, setBreachType] = useState<string>('overtopping');
  const [waterLevel, setWaterLevel] = useState<number>(
    currentDam ? currentDam.current_water_level_m : 108.0
  );
  const [manningsN, setManningsN] = useState<number>(0.035);
  const [dischargeCoeff, setDischargeCoeff] = useState<number>(1.7);
  const [baseDischarge, setBaseDischarge] = useState<number>(150.0);
  const [rainfall, setRainfall] = useState<number>(15.0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const params: SimulationParamsInput = {
      dam_id: selectedDamId,
      model_type: modelType,
      breach_width_m: Number(breachWidth),
      breach_depth_m: Number(breachDepth),
      breach_formation_time_hr: Number(formationTime),
      breach_type: breachType,
      initial_reservoir_level_m: Number(waterLevel),
      discharge_coefficient: Number(dischargeCoeff),
      mannings_n: Number(manningsN),
      base_river_discharge_cumec: Number(baseDischarge),
      rainfall_intensity_mmhr: Number(rainfall),
      downstream_flow_direction_deg: 245.0,
      simulation_duration_hr: 2.0,
      time_step_min: 15.0,
    };
    await onRunSimulation(params);
  };

  const handleResetDefaults = () => {
    setBreachWidth(85.0);
    setBreachDepth(35.0);
    setFormationTime(1.2);
    setBreachType('overtopping');
    setManningsN(0.035);
    setDischargeCoeff(1.7);
    setBaseDischarge(150.0);
    setRainfall(15.0);
    if (currentDam) setWaterLevel(currentDam.current_water_level_m);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Hydrodynamic Simulation Configuration
          </h2>
        </div>
        <button
          onClick={handleResetDefaults}
          type="button"
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Defaults
        </button>
      </div>

      {/* Live Hydraulic Model Quick Callout */}
      {onOpenLiveModel && (
        <div
          onClick={onOpenLiveModel}
          className="bg-gradient-to-r from-cyan-950/70 via-slate-900 to-blue-950/70 border border-cyan-800/80 hover:border-cyan-400 rounded-xl p-3.5 flex items-center justify-between cursor-pointer transition-all group shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-900/60 border border-cyan-700/60 rounded-lg text-cyan-300 group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Live Simulation Model</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800 font-semibold">
                  REAL-TIME
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Move sliders with instant fluid reaction & Model vs Prototype view
              </p>
            </div>
          </div>
          <span className="text-xs text-cyan-400 font-bold group-hover:translate-x-1 transition-transform">
            Launch →
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Dam & Reservoir Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Target Dam & Reservoir</label>
          <select
            value={selectedDamId}
            onChange={(e) => {
              onSelectDam(e.target.value);
              const found = dams.find((d) => d.id === e.target.value);
              if (found) setWaterLevel(found.current_water_level_m);
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-medium focus:border-cyan-400 outline-none"
          >
            {dams.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} (Height: {d.height_m}m | Vol: {d.reservoir_volume_mcm} MCM)
              </option>
            ))}
          </select>
        </div>

        {/* Model Engine Selector (Section 3 Provenance Attribution) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Hydrodynamic Model Engine
            </label>
            <span className="text-[11px] text-cyan-400 font-mono">Provenanced Solver</span>
          </div>
          <select
            value={modelType}
            onChange={(e) => setModelType(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-medium focus:border-cyan-400 outline-none"
          >
            <option value="Prototype 2D Flood Propagation Engine">
              Prototype 2D Flood Propagation Engine (Active 2D Diffusive Wave)
            </option>
            <option value="Delft3D Integration Adapter">
              Delft3D Flexible Mesh Integration Adapter (Open-Source Architecture)
            </option>
            <option value="SPH Particle Solver Adapter">
              Smooth Particle Hydrodynamics (SPH) Solver Adapter (Architecture)
            </option>
          </select>
          <div className="text-[11px] text-slate-500 italic">
            * Note: SIH Scientific Credibility mandates clear attribution between active solvers and architectural adapters.
          </div>
        </div>

        {/* Dam Break Breach Mechanics */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
          <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5" />
            Breach Failure Parameters
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Breach Type */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Breach Mechanism</label>
              <select
                value={breachType}
                onChange={(e) => setBreachType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none"
              >
                <option value="overtopping">Overtopping (Monsoon Spillway Inundation)</option>
                <option value="piping">Piping Failure (Internal Erosion / Seepage)</option>
                <option value="sudden_collapse">Sudden Structural Collapse (Seismic / PMF)</option>
              </select>
            </div>

            {/* Initial Water Level */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Reservoir Head Level</span>
                <span className="font-mono text-cyan-300">{waterLevel} m</span>
              </div>
              <input
                type="number"
                step="0.5"
                value={waterLevel}
                onChange={(e) => setWaterLevel(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none font-mono"
              />
            </div>

            {/* Breach Width */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Breach Width (B)</span>
                <span className="font-mono text-cyan-300">{breachWidth} m</span>
              </div>
              <input
                type="range"
                min={20}
                max={250}
                step={5}
                value={breachWidth}
                onChange={(e) => setBreachWidth(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Formation Time */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Formation Time (T_f)</span>
                <span className="font-mono text-cyan-300">{formationTime} hrs</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={4.0}
                step={0.1}
                value={formationTime}
                onChange={(e) => setFormationTime(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Downstream Hydrology & Friction */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
            <Waves className="w-3.5 h-3.5" />
            Downstream Hydraulics & Friction
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">Manning's n (Roughness)</label>
              <input
                type="number"
                step="0.005"
                min="0.015"
                max="0.08"
                value={manningsN}
                onChange={(e) => setManningsN(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">Weir Coefficient (C)</label>
              <input
                type="number"
                step="0.1"
                min="1.2"
                max="2.2"
                value={dischargeCoeff}
                onChange={(e) => setDischargeCoeff(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">Catchment Rain (mm/hr)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={rainfall}
                onChange={(e) => setRainfall(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Run Simulation Button */}
        <button
          type="submit"
          disabled={isRunning}
          className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 shadow-xl transition-all cursor-pointer ${
            isRunning
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-950/60'
          }`}
        >
          {isRunning ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Executing 2D Hydrodynamic Engine...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              <span>RUN HYDRODYNAMIC SIMULATION</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
