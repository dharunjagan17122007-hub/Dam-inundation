import React from 'react';
import {
  LayoutDashboard,
  Waves,
  Map,
  Mountain,
  GitCompare,
  AlertTriangle,
  Radio,
  FileDown,
  Activity,
  MonitorPlay
} from 'lucide-react';

export type TabId =
  | 'dashboard'
  | 'game3d'
  | 'livemodel'
  | 'floodmap'
  | 'simulation'
  | 'dem'
  | 'scenarios'
  | 'impact'
  | 'satellite'
  | 'export';

interface NavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  simulationCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const navItems = [
    { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard },
    { id: 'game3d', label: '3D Flood Visualization', icon: MonitorPlay },
    { id: 'livemodel', label: 'Live Hydraulic Model', icon: Activity },
    { id: 'floodmap', label: 'Inundation Map & Timeline', icon: Map },
    { id: 'simulation', label: 'Simulation Solver', icon: Waves },
    { id: 'dem', label: 'DEM & Terrain Grid', icon: Mountain },
    { id: 'scenarios', label: 'Scenario Comparison', icon: GitCompare },
    { id: 'impact', label: 'Impact & Evacuation', icon: AlertTriangle },
    { id: 'satellite', label: 'Sentinel-1 SAR Monitoring', icon: Radio },
    { id: 'export', label: 'GIS Export & Report', icon: FileDown },
  ];

  return (
    <nav className="overflow-x-auto border-b border-slate-800 bg-slate-900 px-6 scrollbar-none">
      <div className="flex min-w-max space-x-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id as TabId)}
              className={`flex cursor-pointer items-center gap-2.5 border-b-2 px-4 py-3 text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'border-cyan-400 bg-slate-800/60 text-cyan-400 shadow-sm'
                  : 'border-transparent text-slate-400 hover:bg-slate-800/30 hover:text-slate-200'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
