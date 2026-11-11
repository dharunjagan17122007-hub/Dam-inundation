from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    active_solvers: List[str]

class StudyAreaSchema(BaseModel):
    id: str
    name: str
    state: str
    district: str
    river_basin: str
    description: Optional[str] = None
    bbox: Optional[List[float]] = None

class DamSchema(BaseModel):
    id: str
    study_area_id: str
    name: str
    river_id: Optional[str] = None
    latitude: float
    longitude: float
    height_m: float
    crest_length_m: float
    reservoir_area_sqkm: float
    reservoir_volume_mcm: float
    full_reservoir_level_m: float
    current_water_level_m: float
    spillway_capacity_cumec: Optional[float] = 3500.0
    dam_type: Optional[str] = "Gravity Dam"
    built_year: Optional[int] = 1976

class RiverSchema(BaseModel):
    id: str
    study_area_id: str
    name: str
    basin_name: Optional[str] = None
    length_km: Optional[float] = 244.0
    avg_slope: Optional[float] = 0.004
    bankfull_discharge: Optional[float] = 1200.0
    geojson_geometry: Optional[Dict[str, Any]] = None

class DEMStats(BaseModel):
    id: str
    name: str
    resolution_m: float
    min_elevation_m: float
    max_elevation_m: float
    mean_elevation_m: float
    crs: str
    rows: int
    cols: int
    area_covered_sqkm: float
    bbox: List[float]

class DamBreakParametersInput(BaseModel):
    dam_id: str
    model_type: str = Field(default="Prototype 2D Flood Propagation Engine", description="Solver engine name")
    breach_width_m: float = Field(default=85.0, ge=10.0, le=500.0, description="Breach width in meters")
    breach_depth_m: float = Field(default=35.0, ge=5.0, le=150.0, description="Breach depth in meters")
    breach_formation_time_hr: float = Field(default=1.2, ge=0.1, le=10.0, description="Breach formation time in hours")
    breach_type: str = Field(default="overtopping", description="overtopping, piping, sudden_collapse")
    initial_reservoir_level_m: float = Field(default=108.0, description="Initial reservoir water level in meters")
    discharge_coefficient: float = Field(default=1.7, description="Broad-crested weir coefficient C")
    mannings_n: float = Field(default=0.035, ge=0.015, le=0.15, description="Manning's roughness coefficient")
    base_river_discharge_cumec: float = Field(default=150.0, description="Baseflow discharge in m3/s")
    rainfall_intensity_mmhr: float = Field(default=12.5, description="Downstream catchment rainfall in mm/hr")
    downstream_flow_direction_deg: float = Field(default=245.0, description="General flow bearing in degrees")
    simulation_duration_hr: float = Field(default=2.0, description="Total simulation duration in hours")
    time_step_min: float = Field(default=15.0, description="Interval for animation snapshots in minutes")

class HydrographPoint(BaseModel):
    time_min: float
    discharge_cumec: float
    reservoir_head_m: float

class TimelineStep(BaseModel):
    time_min: int
    label: str
    inundated_area_sqkm: float
    max_depth_m: float
    front_distance_km: float
    geojson: Dict[str, Any]

class SimulationResultSchema(BaseModel):
    simulation_id: str
    dam_id: str
    dam_name: str
    model_used: str
    status: str
    peak_discharge_cumec: float
    max_flood_depth_m: float
    flooded_area_sqkm: float
    min_arrival_time_min: float
    severity_classification: str # LOW, MODERATE, HIGH, CRITICAL
    warning_banner: str
    hydrograph: List[HydrographPoint]
    timeline_steps: List[TimelineStep]
    final_extent_geojson: Dict[str, Any]
    affected_settlements_count: int
    affected_population: int
    affected_roads_km: float
    affected_bridges_count: int
    affected_schools_count: int
    affected_hospitals_count: int

class ScenarioComparisonItem(BaseModel):
    scenario_id: str
    name: str
    breach_width_m: float
    peak_discharge_cumec: float
    flooded_area_sqkm: float
    max_depth_m: float
    arrival_time_min: float
    affected_villages: int
    model_type: str

class SatelliteComparisonResult(BaseModel):
    simulation_id: str
    satellite_name: str
    acquisition_date: str
    sensor_type: str
    simulated_flood_area_sqkm: float
    satellite_observed_area_sqkm: float
    overlap_area_sqkm: float
    overlap_percentage: float
    false_positive_area_sqkm: float
    missed_flood_area_sqkm: float
    kappa_coefficient: float
    comparison_geojson: Dict[str, Any]
    satellite_mask_geojson: Dict[str, Any]

class EvacuationRoute(BaseModel):
    route_id: str
    origin_settlement: str
    destination_shelter: str
    length_km: float
    travel_time_min: float
    status: str # "SAFE", "HIGH_RISK", "BLOCKED"
    geometry: Dict[str, Any]

class ImpactAssessmentSchema(BaseModel):
    simulation_id: str
    total_population_at_risk: int
    affected_settlements: List[Dict[str, Any]]
    critical_infrastructure: List[Dict[str, Any]]
    evacuation_routes: List[EvacuationRoute]
    evacuation_shelters: List[Dict[str, Any]]
