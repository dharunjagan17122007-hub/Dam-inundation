import React, { useState } from 'react';
import {
  FileDown,
  Download,
  FileText,
  FileCode,
  Archive,
  CheckCircle2,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { api, SimulationResult } from '../services/api';

interface GisExportViewProps {
  simulationResult: SimulationResult | null;
}

export const GisExportView: React.FC<GisExportViewProps> = ({ simulationResult }) => {
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);

  if (!simulationResult) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
        <FileDown className="w-8 h-8 mx-auto text-slate-600 mb-2" />
        <p className="text-sm">Run a simulation first to enable GIS deliverables & PDF report generation.</p>
      </div>
    );
  }

  const handleExportShp = async () => {
    try {
      setDownloadingFormat('SHP');
      setDownloadMessage('Generating multi-part ESRI Shapefile package (.shp, .shx, .dbf, .prj)...');
      const res = await api.exportShp(simulationResult.simulation_id);
      window.location.href = res.download_url;
      setDownloadMessage(`Shapefile package ${res.filename} downloaded successfully!`);
    } catch (err: any) {
      setDownloadMessage(`Shapefile export error: ${err.message}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleExportKml = async () => {
    try {
      setDownloadingFormat('KML');
      setDownloadMessage('Generating Google Earth KML with depth-graded polygons...');
      const res = await api.exportKml(simulationResult.simulation_id);
      window.location.href = res.download_url;
      setDownloadMessage(`KML file ${res.filename} downloaded successfully!`);
    } catch (err: any) {
      setDownloadMessage(`KML export error: ${err.message}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleExportGeoJson = async () => {
    try {
      setDownloadingFormat('GEOJSON');
      setDownloadMessage('Compiling WGS84 GeoJSON FeatureCollection...');
      const res = await api.exportGeoJson(simulationResult.simulation_id);
      window.location.href = res.download_url;
      setDownloadMessage(`GeoJSON file ${res.filename} downloaded successfully!`);
    } catch (err: any) {
      setDownloadMessage(`GeoJSON export error: ${err.message}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleDownloadPdfReport = () => {
    setDownloadMessage('Compiling official executive disaster-management PDF report...');
    const url = api.getReportDownloadUrl(simulationResult.simulation_id);
    window.location.href = url;
    setDownloadMessage('PDF report downloaded successfully!');
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="pb-3 border-b border-slate-800">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <FileDown className="w-5 h-5 text-cyan-400" />
            GIS Deliverables & Official Report Generation
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Export genuine spatial vector datasets and executive disaster reports for simulation ID:{' '}
            <span className="font-mono text-cyan-300 font-bold">{simulationResult.simulation_id}</span>
          </p>
        </div>

        {/* Download notification */}
        {downloadMessage && (
          <div className="mt-4 p-3 bg-slate-950 border border-cyan-800/80 rounded-lg text-xs font-mono text-cyan-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>{downloadMessage}</span>
          </div>
        )}

        {/* Deliverables Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {/* ESRI Shapefile Package */}
          <div className="bg-slate-950 border border-slate-800 hover:border-cyan-500/50 rounded-xl p-5 flex flex-col justify-between transition-all">
            <div className="space-y-3">
              <div className="p-3 bg-cyan-950/70 border border-cyan-800/80 rounded-xl w-fit text-cyan-400">
                <Archive className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">ESRI Shapefile (.SHP)</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Complete multi-part GIS archive containing <b>.shp</b>, <b>.shx</b>, <b>.dbf</b> attribute table, and <b>.prj</b> (WGS84 EPSG:4326) in a zipped package.
              </p>
            </div>
            <button
              onClick={handleExportShp}
              disabled={downloadingFormat === 'SHP'}
              className="mt-6 w-full py-2.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{downloadingFormat === 'SHP' ? 'Exporting...' : 'Export .SHP ZIP'}</span>
            </button>
          </div>

          {/* Google Earth KML */}
          <div className="bg-slate-950 border border-slate-800 hover:border-blue-500/50 rounded-xl p-5 flex flex-col justify-between transition-all">
            <div className="space-y-3">
              <div className="p-3 bg-blue-950/70 border border-blue-800/80 rounded-xl w-fit text-blue-400">
                <FileCode className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Google Earth (.KML)</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Standard OGC KML with depth-categorized polygons, semi-transparent color ramp, timestamps, and simulation metadata tags.
              </p>
            </div>
            <button
              onClick={handleExportKml}
              disabled={downloadingFormat === 'KML'}
              className="mt-6 w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-950/50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{downloadingFormat === 'KML' ? 'Exporting...' : 'Export .KML'}</span>
            </button>
          </div>

          {/* WGS84 GeoJSON */}
          <div className="bg-slate-950 border border-slate-800 hover:border-purple-500/50 rounded-xl p-5 flex flex-col justify-between transition-all">
            <div className="space-y-3">
              <div className="p-3 bg-purple-950/70 border border-purple-800/80 rounded-xl w-fit text-purple-400">
                <FileCode className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Open GeoJSON (.GEOJSON)</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Lightweight GeoJSON FeatureCollection ready for web mapping, QGIS, ArcGIS Online, or custom Leaflet / MapLibre visualization.
              </p>
            </div>
            <button
              onClick={handleExportGeoJson}
              disabled={downloadingFormat === 'GEOJSON'}
              className="mt-6 w-full py-2.5 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-950/50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{downloadingFormat === 'GEOJSON' ? 'Exporting...' : 'Export .GEOJSON'}</span>
            </button>
          </div>

          {/* Executive PDF Report */}
          <div className="bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-5 flex flex-col justify-between transition-all">
            <div className="space-y-3">
              <div className="p-3 bg-emerald-950/70 border border-emerald-800/80 rounded-xl w-fit text-emerald-400">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Executive PDF Report</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Official 12-section disaster report containing executive summary, breach mechanics, impact stats, habitations table, and NDMA/SDMA sign-off.
              </p>
            </div>
            <button
              onClick={handleDownloadPdfReport}
              className="mt-6 w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF Report</span>
            </button>
          </div>
        </div>

        {/* Deliverable Specifications & Standards */}
        <div className="mt-8 p-4 bg-slate-950/80 border border-slate-800 rounded-xl text-xs space-y-2">
          <div className="font-bold text-slate-300 uppercase tracking-wider">
            Cartographic & Coordinate Standards:
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-slate-400 font-mono">
            <div>• Datum: WGS 1984 (EPSG:4326)</div>
            <div>• Units: Decimal Degrees & Meters</div>
            <div>• Attributes: Depth min/max, Cell count, Solver</div>
          </div>
        </div>
      </div>
    </div>
  );
};
