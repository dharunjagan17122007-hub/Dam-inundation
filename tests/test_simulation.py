"""
FLOODGUARD End-to-End Integration & Unit Test Suite
===================================================
Tests all core subsystems:
1. Physical dam-break breach discharge calculation
2. 2D hydrodynamic propagation and arrival time
3. Spatial impact analysis & critical facility intersections
4. Genuine GIS export (SHP ZIP, KML, GeoJSON)
5. Satellite SAR observation comparison
6. Executive PDF simulation report compilation
"""

import sys
import os
import json
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from backend.app.database.db import init_db
from backend.app.services.demo_data import seed_database_if_empty
from backend.app.simulation.terrain import generate_calibrated_periyar_dem
from backend.app.simulation.dam_break import DamBreakModel
from backend.app.simulation.flood_model import FloodPropagationEngine
from backend.app.services.impact import ImpactAnalysisEngine
from backend.app.satellite.sentinel_adapter import SatelliteDataAdapter
from backend.app.satellite.comparison import SatelliteComparisonEngine
from backend.app.gis.exporter import export_to_shapefile, export_to_kml, export_to_geojson
from backend.app.services.report import generate_pdf_report

def run_integration_tests():
    print("==================================================")
    print("FLOODGUARD SIH 2026: Running Integration Tests...")
    print("==================================================")

    # 1. Database Init & Seed
    print("[1/7] Testing SQLite database initialization & seeding...")
    init_db()
    seed_database_if_empty()
    print("   [OK] Database initialized & seeded with Indian study areas.")

    # 2. DEM Model
    print("[2/7] Testing DEM terrain grid and slopes...")
    dem = generate_calibrated_periyar_dem()
    stats = dem.statistics
    assert stats["rows"] > 50 and stats["cols"] > 50
    assert stats["min_elevation_m"] < stats["max_elevation_m"]
    print(f"   [OK] DEM validated: {stats['rows']}x{stats['cols']}, Elev: {stats['min_elevation_m']}m - {stats['max_elevation_m']}m, Area: {stats['area_sqkm']} km²")

    # 3. Dam Break Mechanics
    print("[3/7] Testing Dam Break hydraulic equations...")
    dam_model = DamBreakModel(
        dam_height_m=53.6,
        reservoir_volume_mcm=443.2,
        initial_water_level_m=108.0,
        breach_width_m=85.0,
        breach_depth_m=35.0,
        breach_formation_time_hr=1.2,
        breach_type="overtopping"
    )
    peak_q = dam_model.calculate_peak_discharge()
    hydrograph = dam_model.generate_breach_hydrograph(duration_hr=2.0)
    assert peak_q > 5000.0, f"Peak Q {peak_q} too low"
    assert len(hydrograph) > 10
    print(f"   [OK] Peak breach outflow calculated: {int(peak_q):,} m³/s across {len(hydrograph)} time steps.")

    # 4. 2D Hydrodynamic Simulation
    print("[4/7] Testing 2D flood propagation engine...")
    engine = FloodPropagationEngine(
        terrain=dem,
        dam_break=dam_model,
        dam_coords=(77.143, 9.529),
        model_name="Prototype 2D Flood Propagation Engine"
    )
    sim_result = engine.run_simulation(duration_hr=2.0)
    assert sim_result["flooded_area_sqkm"] > 5.0
    assert sim_result["max_flood_depth_m"] > 1.0
    assert len(sim_result["timeline_steps"]) == 7
    print(f"   [OK] Simulation executed successfully: Flooded Area = {sim_result['flooded_area_sqkm']} km², Max Depth = {sim_result['max_flood_depth_m']} m, Arrival = {sim_result['min_arrival_time_min']} min")

    # 5. Downstream Impact Analysis
    print("[5/7] Testing Downstream Impact Assessment & Evacuation...")
    impact = ImpactAnalysisEngine.assess_impact(
        final_extent_geojson=sim_result["final_extent_geojson"],
        simulation_id="TEST_SIM_001"
    )
    assert impact["affected_population"] > 0
    assert impact["affected_villages_count"] > 0
    print(f"   [OK] Impact computed: {impact['affected_villages_count']} villages affected, {impact['affected_population']:,} population at risk, {impact['affected_bridges_count']} bridges inundated.")

    # 6. GIS Export
    print("[6/7] Testing GIS exports (.SHP ZIP, .KML, .GeoJSON)...")
    shp_zip = export_to_shapefile("TEST_SIM_001", sim_result["final_extent_geojson"], sim_result)
    kml_file = export_to_kml("TEST_SIM_001", sim_result["final_extent_geojson"], sim_result)
    geojson_file = export_to_geojson("TEST_SIM_001", sim_result["final_extent_geojson"], sim_result)
    assert os.path.exists(shp_zip) and os.path.getsize(shp_zip) > 0
    assert os.path.exists(kml_file) and os.path.getsize(kml_file) > 0
    assert os.path.exists(geojson_file) and os.path.getsize(geojson_file) > 0
    print(f"   [OK] Shapefile package generated: {Path(shp_zip).name} ({os.path.getsize(shp_zip)} bytes)")
    print(f"   [OK] KML generated: {Path(kml_file).name} ({os.path.getsize(kml_file)} bytes)")
    print(f"   [OK] GeoJSON generated: {Path(geojson_file).name} ({os.path.getsize(geojson_file)} bytes)")

    # 7. Satellite Comparison & PDF Report
    print("[7/7] Testing Sentinel-1 SAR comparison & PDF report generation...")
    sat_adapter = SatelliteDataAdapter()
    sat_mask = sat_adapter.load_calibrated_water_mask()
    comparison = SatelliteComparisonEngine.compare_simulation_with_satellite(
        simulated_geojson=sim_result["final_extent_geojson"],
        satellite_geojson=sat_mask,
        simulation_id="TEST_SIM_001"
    )
    assert comparison["overlap_percentage"] > 0.0

    pdf_file = generate_pdf_report(
        simulation_id="TEST_SIM_001",
        sim_data=sim_result,
        params={"breach_width_m": 85.0, "breach_formation_time_hr": 1.2, "initial_reservoir_level_m": 108.0},
        impact_data=impact,
        dam_info={"name": "Mullaperiyar Dam"}
    )
    assert os.path.exists(pdf_file) and os.path.getsize(pdf_file) > 0
    print(f"   [OK] Satellite comparison: {comparison['overlap_percentage']}% overlap with Sentinel-1 SAR.")
    print(f"   [OK] PDF report compiled: {Path(pdf_file).name} ({os.path.getsize(pdf_file)} bytes)")

    print("==================================================")
    print("ALL TESTS PASSED: 100% Backend Subsystems Verified!")
    print("==================================================")

if __name__ == "__main__":
    run_integration_tests()
