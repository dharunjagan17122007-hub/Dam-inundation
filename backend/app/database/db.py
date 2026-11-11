import sqlite3
import os
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"
DB_PATH = DB_DIR / "floodguard.db"

def get_connection() -> sqlite3.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Create tables as required by SIH specification
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS study_areas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        state TEXT NOT NULL,
        district TEXT NOT NULL,
        river_basin TEXT NOT NULL,
        description TEXT,
        bbox_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rivers (
        id TEXT PRIMARY KEY,
        study_area_id TEXT NOT NULL,
        name TEXT NOT NULL,
        basin_name TEXT,
        length_km REAL,
        avg_slope REAL,
        bankfull_discharge REAL,
        geojson_geometry TEXT,
        FOREIGN KEY (study_area_id) REFERENCES study_areas (id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dams (
        id TEXT PRIMARY KEY,
        study_area_id TEXT NOT NULL,
        name TEXT NOT NULL,
        river_id TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        height_m REAL NOT NULL,
        crest_length_m REAL NOT NULL,
        reservoir_area_sqkm REAL NOT NULL,
        reservoir_volume_mcm REAL NOT NULL,
        full_reservoir_level_m REAL NOT NULL,
        current_water_level_m REAL NOT NULL,
        spillway_capacity_cumec REAL,
        dam_type TEXT,
        built_year INTEGER,
        FOREIGN KEY (study_area_id) REFERENCES study_areas (id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dem_datasets (
        id TEXT PRIMARY KEY,
        study_area_id TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        resolution_m REAL NOT NULL,
        min_elevation_m REAL,
        max_elevation_m REAL,
        mean_elevation_m REAL,
        crs TEXT DEFAULT 'EPSG:4326',
        rows INTEGER,
        cols INTEGER,
        bbox_json TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS simulations (
        id TEXT PRIMARY KEY,
        dam_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL, -- PENDING, RUNNING, COMPLETED, FAILED
        model_type TEXT NOT NULL, -- "Prototype 2D Flood Propagation Engine", "Delft3D Integration Adapter", "SPH Integration Adapter"
        breach_scenario TEXT,
        progress_pct INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS simulation_parameters (
        id TEXT PRIMARY KEY,
        simulation_id TEXT UNIQUE NOT NULL,
        breach_width_m REAL NOT NULL,
        breach_depth_m REAL NOT NULL,
        breach_formation_time_hr REAL NOT NULL,
        breach_type TEXT NOT NULL, -- "overtopping", "piping", "sudden_collapse"
        initial_reservoir_level_m REAL NOT NULL,
        discharge_coefficient REAL DEFAULT 1.7,
        mannings_n REAL DEFAULT 0.035,
        base_river_discharge_cumec REAL DEFAULT 150.0,
        rainfall_intensity_mmhr REAL DEFAULT 0.0,
        downstream_flow_direction_deg REAL DEFAULT 245.0,
        simulation_duration_hr REAL DEFAULT 2.0,
        time_step_min REAL DEFAULT 15.0,
        FOREIGN KEY (simulation_id) REFERENCES simulations (id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS simulation_results (
        id TEXT PRIMARY KEY,
        simulation_id TEXT UNIQUE NOT NULL,
        peak_discharge_cumec REAL NOT NULL,
        max_flood_depth_m REAL NOT NULL,
        flooded_area_sqkm REAL NOT NULL,
        min_arrival_time_min REAL NOT NULL,
        severity_classification TEXT NOT NULL, -- "LOW", "MODERATE", "HIGH", "CRITICAL"
        hydrograph_json TEXT NOT NULL,
        time_series_geojson TEXT NOT NULL,
        final_extent_geojson TEXT NOT NULL,
        depth_grid_summary_json TEXT,
        FOREIGN KEY (simulation_id) REFERENCES simulations (id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dam_id TEXT NOT NULL,
        description TEXT,
        breach_width_m REAL NOT NULL,
        breach_depth_m REAL NOT NULL,
        breach_formation_time_hr REAL NOT NULL,
        reservoir_level_pct REAL NOT NULL,
        peak_discharge_cumec REAL,
        flooded_area_sqkm REAL,
        max_depth_m REAL,
        arrival_time_min REAL,
        affected_villages INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS impact_analysis (
        id TEXT PRIMARY KEY,
        simulation_id TEXT UNIQUE NOT NULL,
        affected_population INTEGER NOT NULL,
        affected_villages_count INTEGER NOT NULL,
        affected_roads_km REAL NOT NULL,
        affected_bridges_count INTEGER NOT NULL,
        affected_schools_count INTEGER NOT NULL,
        affected_hospitals_count INTEGER NOT NULL,
        settlements_detail_json TEXT NOT NULL,
        critical_infrastructure_json TEXT NOT NULL,
        evacuation_routes_json TEXT,
        FOREIGN KEY (simulation_id) REFERENCES simulations (id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS satellite_observations (
        id TEXT PRIMARY KEY,
        study_area_id TEXT NOT NULL,
        satellite_source TEXT NOT NULL, -- "Sentinel-1 SAR", "Sentinel-2 MSI", "Landsat-8"
        acquisition_date TEXT NOT NULL,
        sensor_mode TEXT,
        water_mask_geojson TEXT NOT NULL,
        metadata_json TEXT,
        FOREIGN KEY (study_area_id) REFERENCES study_areas (id)
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS exports (
        id TEXT PRIMARY KEY,
        simulation_id TEXT NOT NULL,
        export_type TEXT NOT NULL, -- "SHP", "KML", "GEOJSON", "PDF_REPORT"
        file_path TEXT NOT NULL,
        file_size_bytes INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (simulation_id) REFERENCES simulations (id)
    );
    """)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database schema successfully initialized.")
