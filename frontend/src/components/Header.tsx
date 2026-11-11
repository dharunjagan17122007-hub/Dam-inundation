import React, { useEffect, useState } from 'react';
import { Waves, Database } from 'lucide-react';
import { StudyArea } from '../services/api';

interface HeaderProps {
  studyAreas: StudyArea[];
  selectedStudyArea: string;
  onSelectStudyArea: (id: string) => void;
  systemStatus: string;
  activeModel: string;
}

export const Header: React.FC<HeaderProps> = ({
  studyAreas,
  selectedStudyArea,
  onSelectStudyArea,
  systemStatus,
  activeModel
}) => {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-cyan-950/70 bg-[#071827]/95 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* LEFT: Logo, Title, Badge, Subtitle */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-600 to-blue-700 shadow-md shadow-cyan-950/50">
            <Waves className="h-5 w-5 text-white" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-bold tracking-[0.16em] text-white sm:text-lg">FLOODGUARD</h1>
              <span className="rounded-md border border-cyan-700/80 bg-cyan-950/70 px-2 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-cyan-300">
                SIH26161
              </span>
            </div>
            <p className="text-[11px] text-slate-400 sm:text-xs">
              Dam-Break Flood Inundation • Hydrodynamic Simulation • GIS Analysis
            </p>
          </div>
        </div>

        {/* CENTER: Hydrodynamic Model */}
        <div className="hidden items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-900/80 px-3.5 py-1.5 text-xs text-slate-200 lg:flex">
          <span className="text-slate-400">Hydrodynamic Model:</span>
          <span className="font-semibold text-cyan-300">{activeModel}</span>
        </div>

        {/* RIGHT: Study Area selector, System Status, UTC time */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-900/80 px-2.5 py-1.5">
            <Database className="h-3.5 w-3.5 text-cyan-400" />
            <select
              value={selectedStudyArea}
              onChange={(e) => onSelectStudyArea(e.target.value)}
              className="bg-transparent pr-1 text-[11px] font-medium text-slate-200 outline-none cursor-pointer"
            >
              {studyAreas.map((sa) => (
                <option key={sa.id} value={sa.id} className="bg-slate-900 text-slate-200">
                  {sa.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-900/80 px-2.5 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              {systemStatus.includes('ONLINE') ? '● ONLINE' : systemStatus}
            </span>
            <span className="border-l border-slate-700/80 pl-2 text-[10px] font-mono text-slate-400">{time}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
