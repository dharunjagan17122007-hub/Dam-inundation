import React, { useEffect, useState } from 'react';
import {
  Header
} from './components/Header';
import {
  Navigation,
  TabId
} from './components/Navigation';
import {
  MetricsCards
} from './components/MetricsCards';
import {
  MapView
} from './components/MapView';
import {
  SimulationControls
} from './components/SimulationControls';
import {
  LiveModelView
} from './components/LiveModelView';
import {
  GamifiedSimulatorView
} from './components/GamifiedSimulatorView';
import {
  ScenarioComparison
} from './components/ScenarioComparison';
import {
  ImpactView
} from './components/ImpactView';
import {
  SatelliteView
} from './components/SatelliteView';
import {
  GisExportView
} from './components/GisExportView';
import {
  DemTerrainView
} from './components/DemTerrainView';
import {
  api,
  StudyArea,
  DamData,
  RiverData,
  SimulationResult,
  SimulationParamsInput
} from './services/api';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import {
  Activity,
  Waves,
  ShieldAlert,
  Download,
  GitCompare,
  Radio,
  FileText,
  AlertCircle,
  MonitorPlay
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [studyAreas, setStudyAreas] = useState<StudyArea[]>([]);
  const [selectedStudyAreaId, setSelectedStudyAreaId] = useState<string>('STUDY_PERIYAR');
  const [dams, setDams] = useState<DamData[]>([]);
  const [selectedDamId, setSelectedDamId] = useState<string>('DAM_MULLAPERIYAR');
  const [rivers, setRivers] = useState<RiverData[]>([]);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [systemStatus, setSystemStatus] = useState<string>('SYSTEM ONLINE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initial Load: Fetch study areas, dams, rivers, and run baseline simulation
  useEffect(() => {
    const initializePlatform = async () => {
      try {
        const [areasData, damsData, riversData] = await Promise.all([
          api.getStudyAreas(),
          api.getDams(),
          api.getRivers(),
        ]);

        setStudyAreas(areasData);
        setDams(damsData);
        setRivers(riversData);

        // Run baseline simulation for immediate interactive demonstration
        const defaultDam = damsData.find((d) => d.id === 'DAM_MULLAPERIYAR') || damsData[0];
        if (defaultDam) {
          setSelectedDamId(defaultDam.id);
          const defaultParams: SimulationParamsInput = {
            dam_id: defaultDam.id,
            model_type: 'Prototype 2D Flood Propagation Engine',
            breach_width_m: 85.0,
            breach_depth_m: 35.0,
            breach_formation_time_hr: 1.2,
            breach_type: 'overtopping',
            initial_reservoir_level_m: defaultDam.current_water_level_m,
            discharge_coefficient: 1.7,
            mannings_n: 0.035,
            base_river_discharge_cumec: 150.0,
            rainfall_intensity_mmhr: 15.0,
            downstream_flow_direction_deg: 245.0,
            simulation_duration_hr: 2.0,
            time_step_min: 15.0,
          };
          const baselineRes = await api.runSimulation(defaultParams);
          setSimulationResult(baselineRes);
        }
      } catch (err: any) {
        console.error('Initialization error:', err);
        setErrorMessage(err.message || 'Failed to connect to backend server');
      }
    };

    initializePlatform();
  }, []);

  // When study area changes, update dams and selected dam
  const handleSelectStudyArea = async (areaId: string) => {
    setSelectedStudyAreaId(areaId);
    try {
      const filteredDams = await api.getDams(areaId);
      setDams(filteredDams);
      if (filteredDams.length > 0) {
        setSelectedDamId(filteredDams[0].id);
      }
    } catch (err: any) {
      console.error('Error changing study area:', err);
    }
  };

  // Run simulation handler
  const handleRunSimulation = async (params: SimulationParamsInput) => {
    try {
      setIsRunning(true);
      setErrorMessage(null);
      const res = await api.runSimulation(params);
      setSimulationResult(res);
      // If run from simulation tab, stay there or give feedback
    } catch (err: any) {
      console.error('Simulation error:', err);
      setErrorMessage(err.message || 'Simulation execution encountered an error');
    } finally {
      setIsRunning(false);
    }
  };

  const currentDam = dams.find((d) => d.id === selectedDamId) || null;
  const currentRiver = rivers.find((r) => r.study_area_id === selectedStudyAreaId) || rivers[0] || null;

  return (
    <div className="min-h-screen bg-[#061522] text-slate-100 flex flex-col font-sans">
      {/* Command Center Header */}
      <Header
        studyAreas={studyAreas}
        selectedStudyArea={selectedStudyAreaId}
        onSelectStudyArea={handleSelectStudyArea}
        systemStatus={systemStatus}
        activeModel={simulationResult?.model_used || 'Prototype 2D Flood Propagation Engine'}
      />

      {/* Navigation Tabs */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Error alert if any */}
      {errorMessage && (
        <div className="bg-red-950/80 border-b border-red-800 px-6 py-2.5 text-xs text-red-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-200 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* TAB 1: COMMAND CENTER DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top: Warning Banner & Real Calculated Metrics */}
            <MetricsCards result={simulationResult} onNavigateToTab={(t) => setActiveTab(t as TabId)} />

            {/* HYDRODYNAMIC OVERVIEW PANEL */}
            <div
              onClick={() => setActiveTab('game3d')}
              className="flex cursor-pointer flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-800/60 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/70 p-4.5 shadow-2xl transition-all duration-200 hover:scale-[1.01]"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-cyan-600/20 p-3 text-cyan-300 ring-1 ring-cyan-400/40">
                  <MonitorPlay className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">
                      Hydrodynamic Simulation Overview
                    </h3>
                    <span className="rounded-full border border-cyan-700 bg-cyan-950/70 px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-200">
                      LIVE MODEL
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">
                    Dam breach propagation, river flood reach, inundation depth progression, and affected settlements from the active simulation run.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold font-mono text-cyan-300 transition-all group-hover:text-white">
                <span>VIEW MODEL</span>
                <span>→</span>
              </div>
            </div>

            {/* Split Grid: Left Controls & Hydrograph, Right Map */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: 5 Cols */}
              <div className="lg:col-span-5 space-y-6">
                <SimulationControls
                  dams={dams}
                  selectedDamId={selectedDamId}
                  onSelectDam={setSelectedDamId}
                  onRunSimulation={handleRunSimulation}
                  isRunning={isRunning}
                  onOpenLiveModel={() => setActiveTab('livemodel')}
                />

                {/* Hydrograph Curve Chart Card */}
                {simulationResult && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3 text-xs font-bold text-slate-200 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Waves className="w-4 h-4 text-cyan-400" />
                        Breach Outflow Hydrograph Q(t)
                      </span>
                      <span className="font-mono text-cyan-400">
                        Peak: {Math.round(simulationResult.peak_discharge_cumec).toLocaleString()} m³/s
                      </span>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={simulationResult.hydrograph}
                          margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorQ" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="time_min" stroke="#64748b" tick={{ fontSize: 10 }} unit="m" />
                          <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8', fontSize: 11 }}
                            formatter={(v: any) => [`${v} m³/s`, 'Discharge']}
                            labelFormatter={(l) => `Time: T+${l} min`}
                          />
                          <Area type="monotone" dataKey="discharge_cumec" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#colorQ)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-2 flex justify-between">
                      <span>Inception: T+0</span>
                      <span>Breach Formation Peak: T+72m</span>
                      <span>Recession Drawdown</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: 7 Cols Map View */}
              <div className="lg:col-span-7 space-y-4">
                <MapView
                  simulationResult={simulationResult}
                  dam={currentDam}
                  river={currentRiver}
                />
              </div>
            </div>

            {/* Bottom Row: Quick Access Previews */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Quick Live Model Preview */}
              <div
                onClick={() => setActiveTab('livemodel')}
                className="bg-slate-900 border border-slate-800 hover:border-cyan-400/80 rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between group shadow-lg shadow-cyan-950/20"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-cyan-950 border border-cyan-800 rounded-lg text-cyan-400 group-hover:scale-110 transition-transform">
                    <Activity className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                      Live Model
                      <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                        REAL-TIME
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">Scale Model vs Prototype</p>
                  </div>
                </div>
                <span className="text-xs text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">→</span>
              </div>

              {/* Quick Scenarios Preview */}
              <div
                onClick={() => setActiveTab('scenarios')}
                className="bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-950 border border-blue-800 rounded-lg text-blue-400">
                    <GitCompare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase">Parametric Scenarios</h4>
                    <p className="text-[11px] text-slate-400">Compare 50m vs 85m breaches</p>
                  </div>
                </div>
                <span className="text-xs text-cyan-400 font-bold">→</span>
              </div>

              {/* Quick Satellite SAR Preview */}
              <div
                onClick={() => setActiveTab('satellite')}
                className="bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-cyan-950 border border-cyan-800 rounded-lg text-cyan-400">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase">Sentinel-1 SAR</h4>
                    <p className="text-[11px] text-slate-400">Compare radar flood mask</p>
                  </div>
                </div>
                <span className="text-xs text-cyan-400 font-bold">→</span>
              </div>

              {/* Quick GIS Export & Report */}
              <div
                onClick={() => setActiveTab('export')}
                className="bg-slate-900 border border-slate-800 hover:border-cyan-500/50 rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-950 border border-purple-800 rounded-lg text-purple-400">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase">GIS & PDF Report</h4>
                    <p className="text-[11px] text-slate-400">Download .SHP, .KML, .PDF</p>
                  </div>
                </div>
                <span className="text-xs text-cyan-400 font-bold">→</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB: 3D GAMIFIED ACTION SIMULATOR */}
        {activeTab === 'game3d' && (
          <GamifiedSimulatorView
            currentDam={currentDam}
            onNavigateToTab={(t) => setActiveTab(t as TabId)}
          />
        )}

        {/* TAB: LIVE HYDRAULIC MODEL (MODEL VS PROTOTYPE) */}
        {activeTab === 'livemodel' && (
          <LiveModelView
            currentDam={currentDam}
            onApplyToFullSimulation={handleRunSimulation}
            onNavigateToTab={(t) => setActiveTab(t as TabId)}
          />
        )}

        {/* TAB 2: INUNDATION MAP & TIMELINE */}
        {activeTab === 'floodmap' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Interactive Flood Inundation Propagation Map
                </h2>
                <p className="text-xs text-slate-400">
                  Scrub timeline slider or hit Play to visualize flood propagation from breach initiation to downstream reaches.
                </p>
              </div>
              {simulationResult && (
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
                    Dam: {simulationResult.dam_name}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-cyan-300">
                    Peak Q: {Math.round(simulationResult.peak_discharge_cumec).toLocaleString()} m³/s
                  </span>
                </div>
              )}
            </div>

            <MapView
              simulationResult={simulationResult}
              dam={currentDam}
              river={currentRiver}
            />
          </div>
        )}

        {/* TAB 3: SIMULATION SOLVER & HYDROLOGY */}
        {activeTab === 'simulation' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 space-y-6">
              <SimulationControls
                dams={dams}
                selectedDamId={selectedDamId}
                onSelectDam={setSelectedDamId}
                onRunSimulation={handleRunSimulation}
                isRunning={isRunning}
                onOpenLiveModel={() => setActiveTab('livemodel')}
              />
            </div>

            <div className="lg:col-span-6 space-y-6">
              {simulationResult && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold uppercase text-white flex items-center gap-2">
                      <Waves className="w-4 h-4 text-cyan-400" />
                      Dynamic Breach Outflow Hydrograph Q(t)
                    </h3>
                  </div>

                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={simulationResult.hydrograph}
                        margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                      >
                        <defs>
                          <linearGradient id="colorQ2" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="time_min" stroke="#94a3b8" unit=" min" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#38bdf8', fontSize: 12 }}
                          formatter={(v: any) => [`${v} m³/s`, 'Outflow Discharge']}
                          labelFormatter={(l) => `Time Elapsed: T+${l} min`}
                        />
                        <Area type="monotone" dataKey="discharge_cumec" stroke="#38bdf8" strokeWidth={2.5} fill="url(#colorQ2)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="p-4 bg-slate-950 rounded-xl space-y-2 text-xs">
                    <div className="font-bold text-slate-300 uppercase tracking-wide">
                      Hydraulic Weir Formulation Summary:
                    </div>
                    <p className="text-slate-400 leading-relaxed font-mono">
                      Q(t) ≈ C · B(t) · [H(t)]^(1.5)<br />
                      Where C = {simulationResult.parameters.discharge_coefficient}, B = {simulationResult.parameters.breach_width_m}m, H = {simulationResult.parameters.initial_reservoir_level_m}m.<br />
                      Manning's roughness coefficient n = {simulationResult.parameters.mannings_n}.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: DEM & TERRAIN GRID */}
        {activeTab === 'dem' && <DemTerrainView />}

        {/* TAB 5: SCENARIO COMPARISON */}
        {activeTab === 'scenarios' && <ScenarioComparison damId={selectedDamId} />}

        {/* TAB 6: IMPACT & EVACUATION */}
        {activeTab === 'impact' && <ImpactView simulationResult={simulationResult} />}

        {/* TAB 7: SATELLITE MONITORING */}
        {activeTab === 'satellite' && <SatelliteView simulationResult={simulationResult} />}

        {/* TAB 8: GIS EXPORT & REPORTS */}
        {activeTab === 'export' && <GisExportView simulationResult={simulationResult} />}
      </main>

      {/* Footer */}
      <footer className="bg-[#071827] border-t border-cyan-950/70 px-6 py-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <b>FLOODGUARD</b> | Intelligent Dam Break Inundation Simulation Platform • SIH 2026 Problem Statement: SIH26161 (NTRO)
          </div>
          <div className="flex items-center gap-4">
            <span>Model Provenance: <b>Prototype 2D Flood Propagation Engine</b></span>
            <span>•</span>
            <span>GIS Exports: <b>.SHP | .KML | .GEOJSON | .PDF</b></span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
