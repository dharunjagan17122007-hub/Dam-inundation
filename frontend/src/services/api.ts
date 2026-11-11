/**
 * FLOODGUARD API Client
 * Interacts with FastAPI backend at /api
 */

const API_BASE = '/api';

export interface HealthData {
  status: string;
  service: string;
  version: string;
  active_solvers: string[];
}

export interface StudyArea {
  id: string;
  name: string;
  state: string;
  district: string;
  river_basin: string;
  description: string;
  bbox?: number[];
}

export interface DamData {
  id: string;
  study_area_id: string;
  name: string;
  river_id?: string;
  latitude: number;
  longitude: number;
  height_m: number;
  crest_length_m: number;
  reservoir_area_sqkm: number;
  reservoir_volume_mcm: number;
  full_reservoir_level_m: number;
  current_water_level_m: number;
  spillway_capacity_cumec: number;
  dam_type: string;
  built_year: number;
}

export interface RiverData {
  id: string;
  study_area_id: string;
  name: string;
  basin_name?: string;
  length_km?: number;
  avg_slope?: number;
  bankfull_discharge?: number;
  geojson_geometry?: any;
}

export interface DemStatsData {
  id: string;
  name: string;
  resolution_m: number;
  min_elevation_m: number;
  max_elevation_m: number;
  mean_elevation_m: number;
  std_elevation_m: number;
  rows: number;
  cols: number;
  area_sqkm: number;
  crs: string;
  bbox: number[];
}

export interface SimulationParamsInput {
  dam_id: string;
  model_type: string;
  breach_width_m: number;
  breach_depth_m: number;
  breach_formation_time_hr: number;
  breach_type: string;
  initial_reservoir_level_m: number;
  discharge_coefficient: number;
  mannings_n: number;
  base_river_discharge_cumec: number;
  rainfall_intensity_mmhr: number;
  downstream_flow_direction_deg: number;
  simulation_duration_hr: number;
  time_step_min: number;
}

export interface HydrographPoint {
  time_min: number;
  discharge_cumec: number;
  reservoir_head_m: number;
}

export interface TimelineStep {
  time_min: number;
  label: string;
  inundated_area_sqkm: number;
  max_depth_m: number;
  front_distance_km: number;
  geojson: any;
}

export interface SimulationResult {
  simulation_id: string;
  dam_id: string;
  dam_name: string;
  model_used: string;
  status: string;
  peak_discharge_cumec: number;
  max_flood_depth_m: number;
  flooded_area_sqkm: number;
  min_arrival_time_min: number;
  severity_classification: string;
  warning_banner: string;
  hydrograph: HydrographPoint[];
  timeline_steps: TimelineStep[];
  final_extent_geojson: any;
  affected_settlements_count: number;
  affected_population: number;
  affected_roads_km: number;
  affected_bridges_count: number;
  affected_schools_count: number;
  affected_hospitals_count: number;
  parameters: SimulationParamsInput;
  dam_info: DamData;
  impact_result?: any;
  created_at: string;
}

export interface ScenarioItem {
  scenario_id: string;
  name: string;
  breach_width_m: number;
  breach_depth_m: number;
  peak_discharge_cumec: number;
  flooded_area_sqkm: number;
  max_depth_m: number;
  arrival_time_min: number;
  affected_villages: number;
  model_type: string;
}

export interface SatelliteComparisonData {
  simulation_id: string;
  satellite_name: string;
  acquisition_date: string;
  sensor_type: string;
  simulated_flood_area_sqkm: number;
  satellite_observed_area_sqkm: number;
  overlap_area_sqkm: number;
  overlap_percentage: number;
  false_positive_area_sqkm: number;
  missed_flood_area_sqkm: number;
  critical_success_index: number;
  comparison_geojson: any;
  satellite_mask_geojson: any;
}

export const api = {
  async getHealth(): Promise<HealthData> {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  async getStudyAreas(): Promise<StudyArea[]> {
    const res = await fetch(`${API_BASE}/study-areas`);
    if (!res.ok) throw new Error('Failed to fetch study areas');
    return res.json();
  },

  async getDams(studyAreaId?: string): Promise<DamData[]> {
    const url = studyAreaId ? `${API_BASE}/dams?study_area_id=${studyAreaId}` : `${API_BASE}/dams`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch dams');
    return res.json();
  },

  async getRivers(studyAreaId?: string): Promise<RiverData[]> {
    const url = studyAreaId ? `${API_BASE}/rivers?study_area_id=${studyAreaId}` : `${API_BASE}/rivers`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch rivers');
    return res.json();
  },

  async getDemStats(): Promise<DemStatsData> {
    const res = await fetch(`${API_BASE}/dem/stats`);
    if (!res.ok) throw new Error('Failed to fetch DEM stats');
    return res.json();
  },

  async uploadDem(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/dem/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('DEM upload failed');
    return res.json();
  },

  async runSimulation(params: SimulationParamsInput): Promise<SimulationResult> {
    const res = await fetch(`${API_BASE}/simulation/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Simulation run failed');
    return res.json();
  },

  async getSimulation(id: string): Promise<SimulationResult> {
    const res = await fetch(`${API_BASE}/simulation/${id}`);
    if (!res.ok) throw new Error('Failed to get simulation');
    return res.json();
  },

  async getScenarios(damId: string = 'DAM_MULLAPERIYAR'): Promise<ScenarioItem[]> {
    const res = await fetch(`${API_BASE}/scenarios?dam_id=${damId}`);
    if (!res.ok) throw new Error('Failed to fetch scenarios');
    return res.json();
  },

  async getImpact(simId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/impact/${simId}`);
    if (!res.ok) throw new Error('Failed to fetch impact analysis');
    return res.json();
  },

  async getSatellite(simId: string): Promise<SatelliteComparisonData> {
    const res = await fetch(`${API_BASE}/satellite/${simId}`);
    if (!res.ok) throw new Error('Failed to fetch satellite comparison');
    return res.json();
  },

  async exportShp(simId: string): Promise<{ download_url: string; filename: string }> {
    const res = await fetch(`${API_BASE}/export/shp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation_id: simId }),
    });
    if (!res.ok) throw new Error('Shapefile export failed');
    return res.json();
  },

  async exportKml(simId: string): Promise<{ download_url: string; filename: string }> {
    const res = await fetch(`${API_BASE}/export/kml`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation_id: simId }),
    });
    if (!res.ok) throw new Error('KML export failed');
    return res.json();
  },

  async exportGeoJson(simId: string): Promise<{ download_url: string; filename: string }> {
    const res = await fetch(`${API_BASE}/export/geojson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation_id: simId }),
    });
    if (!res.ok) throw new Error('GeoJSON export failed');
    return res.json();
  },

  getReportDownloadUrl(simId: string): string {
    return `${API_BASE}/report/${simId}/download`;
  }
};
