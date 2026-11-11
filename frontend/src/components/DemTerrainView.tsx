import React, { useEffect, useState } from 'react';
import {
  Mountain,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Compass,
  Layers,
  ArrowDownRight,
  Info
} from 'lucide-react';
import { api, DemStatsData } from '../services/api';

export const DemTerrainView: React.FC = () => {
  const [stats, setStats] = useState<DemStatsData | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  useEffect(() => {
    api.getDemStats()
      .then((data) => setStats(data))
      .catch((err) => console.error('Failed to load DEM statistics:', err));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadStatus(`Uploading and parsing '${file.name}'...`);
      const res = await api.uploadDem(file);
      setUploadStatus(`Validated: ${file.name} successfully imported into hydrodynamic pipeline!`);
      if (res.dem_statistics) {
        setStats({ ...res.dem_statistics, name: file.name, id: 'CUSTOM_DEM' });
      }
    } catch (err: any) {
      setUploadStatus(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* DEM Stats Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-950 border border-cyan-800 rounded-lg text-cyan-400">
              <Mountain className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                Digital Elevation Model (DEM) & Topographic Processing
              </h2>
              <p className="text-xs text-slate-400">
                Active Terrain: {stats ? stats.name : 'Periyar Basin High-Resolution 30m DEM (Calibrated)'}
              </p>
            </div>
          </div>

          {/* Upload Button */}
          <label className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-950/40">
            <Upload className="w-4 h-4" />
            <span>Upload Custom DEM (.tif, .dem, .asc)</span>
            <input
              type="file"
              accept=".tif,.tiff,.dem,.asc,.xyz,.npy"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {uploadStatus && (
          <div className="mt-4 p-3 bg-slate-950 border border-cyan-800 rounded-lg text-xs font-mono text-cyan-300 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>{uploadStatus}</span>
          </div>
        )}

        {/* Elevation Metrics */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mt-6">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Min Elevation</div>
              <div className="text-xl font-bold font-mono text-cyan-300">
                {stats.min_elevation_m} <span className="text-xs font-sans text-slate-400">m</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Valley Outlet Level</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Max Elevation</div>
              <div className="text-xl font-bold font-mono text-emerald-300">
                {stats.max_elevation_m} <span className="text-xs font-sans text-slate-400">m</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">High Ridge Crest</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Mean Elevation</div>
              <div className="text-xl font-bold font-mono text-blue-300">
                {stats.mean_elevation_m} <span className="text-xs font-sans text-slate-400">m</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Basin Average</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Spatial Resolution</div>
              <div className="text-xl font-bold font-mono text-amber-300">
                {stats.resolution_m} <span className="text-xs font-sans text-slate-400">m</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Grid Cell Pitch</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Catchment Area</div>
              <div className="text-xl font-bold font-mono text-purple-300">
                {stats.area_sqkm} <span className="text-xs font-sans text-slate-400">km²</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Domain Boundary</div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Grid Dimensions</div>
              <div className="text-xl font-bold font-mono text-slate-200">
                {stats.rows} × {stats.cols}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">CRS: {stats.crs}</div>
            </div>
          </div>
        )}

        {/* Topographic Processing Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <ArrowDownRight className="w-4 h-4 text-cyan-400" />
              Downstream Hydraulic Slope & Flow Direction
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Terrain gradient is computed via second-order central difference operators across the 2D grid matrix. The river valley channel establishes an average longitudinal slope of <b>0.0035 m/m</b> directing peak outflow from Mullaperiyar (East) westward through the Periyar gorge towards the Arabian Sea basin.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-emerald-400" />
              Coordinate Reference System & Bounds
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              Bounding Box: [{stats?.bbox?.[0]}, {stats?.bbox?.[1]}] to [{stats?.bbox?.[2]}, {stats?.bbox?.[3]}]<br />
              Vertical Datum: EGM96 Mean Sea Level (MSL)<br />
              Horizontal Datum: WGS 1984 (EPSG:4326)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
