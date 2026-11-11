import React from 'react';
import {
  AlertTriangle,
  Building2,
  Car,
  Home,
  Hospital,
  GraduationCap,
  Navigation,
  ShieldCheck,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { SimulationResult } from '../services/api';

interface ImpactViewProps {
  simulationResult: SimulationResult | null;
}

export const ImpactView: React.FC<ImpactViewProps> = ({ simulationResult }) => {
  const impact = simulationResult?.impact_result;

  if (!impact) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
        <p className="text-sm">Run a simulation first to generate downstream spatial vulnerability & impact data.</p>
      </div>
    );
  }

  const settlements = impact.settlements_detail || [];
  const facilities = impact.critical_facilities || [];
  const shelters = impact.shelters || [];
  const evacRoutes = impact.evacuation_routes || [];

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-lg text-red-400">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Affected Habitations</div>
            <div className="text-xl font-bold font-mono text-red-300">
              {impact.affected_villages_count}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-3 bg-orange-950/70 border border-orange-800/80 rounded-lg text-orange-400">
            <Car className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Inundated Roadways</div>
            <div className="text-xl font-bold font-mono text-orange-300">
              {impact.affected_roads_km} <span className="text-xs font-sans">km</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-3 bg-amber-950/70 border border-amber-800/80 rounded-lg text-amber-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Impacted Bridges</div>
            <div className="text-xl font-bold font-mono text-amber-300">
              {impact.affected_bridges_count}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-3 bg-purple-950/70 border border-purple-800/80 rounded-lg text-purple-400">
            <Hospital className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400">Critical Hospitals</div>
            <div className="text-xl font-bold font-mono text-purple-300">
              {impact.affected_hospitals_count}
            </div>
          </div>
        </div>
      </div>

      {/* Habitations Breakdown Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          Downstream Habitation Vulnerability Status
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/90 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Settlement Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Population</th>
                <th className="py-2.5 px-3">Terrain Elev.</th>
                <th className="py-2.5 px-3">Inundation Status</th>
                <th className="py-2.5 px-3">Est. Flood Depth</th>
                <th className="py-2.5 px-3">Est. Arrival</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
              {settlements.map((s: any) => {
                const isFlooded = s.inundation_status === 'FLOODED';
                return (
                  <tr key={s.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-sans font-medium text-white">{s.name}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-400">{s.type}</td>
                    <td className="py-2.5 px-3">{s.population.toLocaleString()}</td>
                    <td className="py-2.5 px-3">{s.elevation_m} m</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isFlooded
                            ? 'bg-red-950 text-red-300 border border-red-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {s.inundation_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-cyan-300">{s.estimated_depth_m} m</td>
                    <td className="py-2.5 px-3 text-amber-400">T+{s.estimated_arrival_min} min</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evacuation Shelters & Corridors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Designated Safe Shelters */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Designated High-Ground Relief Shelters
          </h3>
          <div className="space-y-3">
            {shelters.map((sh: any) => (
              <div
                key={sh.id}
                className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-lg flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-emerald-300">{sh.name}</div>
                  <div className="text-[11px] text-slate-400">
                    Safe Ground Elevation: <span className="text-slate-200 font-mono">{sh.elevation_m} m MSL</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs px-2.5 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono font-bold">
                    Capacity: {sh.capacity.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Evacuation Transit Corridors */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <Navigation className="w-4 h-4 text-cyan-400" />
            Recommended Evacuation Transit Corridors
          </h3>
          <div className="space-y-3">
            {evacRoutes.map((r: any) => (
              <div
                key={r.route_id}
                className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-lg space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-200">
                    {r.origin_settlement} → {r.destination_shelter.split(' ')[0]}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono font-bold">
                    {r.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>Distance: {r.length_km} km</span>
                  <span>Est. Evacuation Transit: {r.travel_time_min} min</span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 italic mt-3">
            * Operational Warning: Evacuation routes represent demonstrative GIS decision support based on terrain clearance; field evacuation must follow official district administration orders.
          </div>
        </div>
      </div>
    </div>
  );
};
