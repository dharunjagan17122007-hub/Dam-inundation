"""
Bundled Indian Demonstration Datasets & Database Seed Service
============================================================
Provides preconfigured, calibrated Indian study areas, rivers, dams,
downstream infrastructure, and DEM parameters so that the application works
immediately without requiring external internet downloads or paid APIs.
All demo data is clearly marked as: DEMONSTRATION DATA.
"""

import json
from typing import Dict, Any, List
from ..database.db import get_connection
from ..simulation.terrain import generate_calibrated_periyar_dem

def get_demo_study_areas() -> List[Dict[str, Any]]:
    return [
        {
            "id": "STUDY_PERIYAR",
            "name": "Periyar River Basin (Idukki - Mullaperiyar Corridor)",
            "state": "Kerala",
            "district": "Idukki",
            "river_basin": "Periyar Basin",
            "description": "DEMONSTRATION DATA: Downstream Western Ghats river valley from Mullaperiyar dam to Idukki reservoir.",
            "bbox": [76.90, 9.55, 77.20, 9.85]
        },
        {
            "id": "STUDY_BHAGIRATHI",
            "name": "Bhagirathi River Basin (Tehri Gorge)",
            "state": "Uttarakhand",
            "district": "Tehri Garhwal",
            "river_basin": "Ganga Upper Basin",
            "description": "DEMONSTRATION DATA: Himalayan deep river gorge downstream of Tehri Dam.",
            "bbox": [78.35, 30.25, 78.60, 30.50]
        }
    ]

def get_demo_dams() -> List[Dict[str, Any]]:
    return [
        {
            "id": "DAM_MULLAPERIYAR",
            "study_area_id": "STUDY_PERIYAR",
            "name": "Mullaperiyar Dam (Demonstration Baseline)",
            "river_id": "RIV_PERIYAR",
            "latitude": 9.5290,
            "longitude": 77.1430,
            "height_m": 53.6,
            "crest_length_m": 365.7,
            "reservoir_area_sqkm": 26.0,
            "reservoir_volume_mcm": 443.2,
            "full_reservoir_level_m": 43.3,
            "current_water_level_m": 41.5,
            "spillway_capacity_cumec": 3450.0,
            "dam_type": "Surkhi-Lime Composite Gravity Dam",
            "built_year": 1895
        },
        {
            "id": "DAM_IDUKKI",
            "study_area_id": "STUDY_PERIYAR",
            "name": "Idukki Arch Dam (Demonstration Baseline)",
            "river_id": "RIV_PERIYAR",
            "latitude": 9.8450,
            "longitude": 76.9730,
            "height_m": 168.9,
            "crest_length_m": 365.8,
            "reservoir_area_sqkm": 60.0,
            "reservoir_volume_mcm": 1996.0,
            "full_reservoir_level_m": 165.0,
            "current_water_level_m": 158.0,
            "spillway_capacity_cumec": 5000.0,
            "dam_type": "Double Curvature Arch Dam",
            "built_year": 1976
        },
        {
            "id": "DAM_TEHRI",
            "study_area_id": "STUDY_BHAGIRATHI",
            "name": "Tehri Dam (Demonstration Baseline)",
            "river_id": "RIV_BHAGIRATHI",
            "latitude": 30.3780,
            "longitude": 78.4800,
            "height_m": 260.5,
            "crest_length_m": 575.0,
            "reservoir_area_sqkm": 52.0,
            "reservoir_volume_mcm": 3540.0,
            "full_reservoir_level_m": 255.0,
            "current_water_level_m": 248.0,
            "spillway_capacity_cumec": 15540.0,
            "dam_type": "Earth and Rockfill Dam",
            "built_year": 2006
        }
    ]

def get_demo_rivers() -> List[Dict[str, Any]]:
    # Detailed centerline coordinates for Periyar river downstream
    periyar_coords = [
        [77.1430, 9.5290],
        [77.1320, 9.5580],
        [77.1180, 9.5820],
        [77.0850, 9.5850],
        [77.0650, 9.6100],
        [77.0400, 9.6350],
        [77.0150, 9.6480],
        [76.9850, 9.6600],
        [76.9650, 9.6820],
        [76.9400, 9.7050],
        [76.9200, 9.7150],
        [76.9050, 9.7350],
        [76.8900, 9.7550]
    ]

    return [
        {
            "id": "RIV_PERIYAR",
            "study_area_id": "STUDY_PERIYAR",
            "name": "Periyar River",
            "basin_name": "Periyar River Basin",
            "length_km": 244.0,
            "avg_slope": 0.0035,
            "bankfull_discharge": 1200.0,
            "geojson_geometry": {
                "type": "LineString",
                "coordinates": periyar_coords
            }
        }
    ]

def seed_database_if_empty():
    """
    Seeds the SQLite database with bundled Indian demonstration datasets.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM study_areas")
    count = cursor.fetchone()[0]

    if count == 0:
        for sa in get_demo_study_areas():
            cursor.execute(
                """
                INSERT INTO study_areas (id, name, state, district, river_basin, description, bbox_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (sa["id"], sa["name"], sa["state"], sa["district"], sa["river_basin"], sa["description"], json.dumps(sa["bbox"]))
            )

        for riv in get_demo_rivers():
            cursor.execute(
                """
                INSERT INTO rivers (id, study_area_id, name, basin_name, length_km, avg_slope, bankfull_discharge, geojson_geometry)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (riv["id"], riv["study_area_id"], riv["name"], riv["basin_name"], riv["length_km"], riv["avg_slope"], riv["bankfull_discharge"], json.dumps(riv["geojson_geometry"]))
            )

        for dam in get_demo_dams():
            cursor.execute(
                """
                INSERT INTO dams (id, study_area_id, name, river_id, latitude, longitude, height_m, crest_length_m, reservoir_area_sqkm, reservoir_volume_mcm, full_reservoir_level_m, current_water_level_m, spillway_capacity_cumec, dam_type, built_year)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (dam["id"], dam["study_area_id"], dam["name"], dam["river_id"], dam["latitude"], dam["longitude"], dam["height_m"], dam["crest_length_m"], dam["reservoir_area_sqkm"], dam["reservoir_volume_mcm"], dam["full_reservoir_level_m"], dam["current_water_level_m"], dam["spillway_capacity_cumec"], dam["dam_type"], dam["built_year"])
            )

        # Seed initial DEM dataset metadata
        dem = generate_calibrated_periyar_dem()
        stats = dem.statistics
        cursor.execute(
            """
            INSERT INTO dem_datasets (id, study_area_id, name, file_path, resolution_m, min_elevation_m, max_elevation_m, mean_elevation_m, crs, rows, cols, bbox_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("DEM_PERIYAR_30M", "STUDY_PERIYAR", "Periyar Basin High-Resolution 30m DEM (Calibrated)", "bundled://periyar_30m", stats["resolution_m"], stats["min_elevation_m"], stats["max_elevation_m"], stats["mean_elevation_m"], "EPSG:4326", stats["rows"], stats["cols"], json.dumps(stats["bbox"]))
        )

        conn.commit()

    conn.close()
