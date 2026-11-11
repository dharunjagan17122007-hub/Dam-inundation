"""
Scenario Management & Multi-Scenario Comparison Engine
======================================================
Enables hydrological engineers and disaster managers to:
1. Define and store multiple breach configurations (width, depth, formation time, model type)
2. Run comparative parametric studies (e.g. 50m vs 85m vs 150m breach width)
3. Generate comparison tables and charts comparing peak discharge, flooded area,
   max depth, arrival time, and affected settlements.
"""

from typing import Dict, List, Any
from .dam_break import DamBreakModel
from .terrain import TerrainModel
from .flood_model import FloodPropagationEngine

def get_default_scenarios_config(dam_height_m: float = 53.6, reservoir_volume_mcm: float = 443.2) -> List[Dict[str, Any]]:
    return [
        {
            "id": "scenario_a",
            "name": "Scenario A: Piping Failure (Minor Breach)",
            "description": "Internal erosion piping failure under normal full reservoir level.",
            "breach_width_m": 50.0,
            "breach_depth_m": 25.0,
            "breach_formation_time_hr": 1.5,
            "breach_type": "piping",
            "reservoir_level_pct": 100.0,
            "model_type": "Prototype 2D Flood Propagation Engine"
        },
        {
            "id": "scenario_b",
            "name": "Scenario B: Overtopping Breach (Design Basis)",
            "description": "Standard overtopping breach during heavy monsoon inflow.",
            "breach_width_m": 85.0,
            "breach_depth_m": 35.0,
            "breach_formation_time_hr": 1.2,
            "breach_type": "overtopping",
            "reservoir_level_pct": 105.0,
            "model_type": "Prototype 2D Flood Propagation Engine"
        },
        {
            "id": "scenario_c",
            "name": "Scenario C: PMF Extreme Collapse (Worst Case)",
            "description": "Catastrophic breach under Probable Maximum Flood (PMF) conditions.",
            "breach_width_m": 150.0,
            "breach_depth_m": 50.0,
            "breach_formation_time_hr": 0.8,
            "breach_type": "sudden_collapse",
            "reservoir_level_pct": 115.0,
            "model_type": "Prototype 2D Flood Propagation Engine"
        }
    ]

def evaluate_scenario(
    scenario_cfg: Dict[str, Any],
    terrain: TerrainModel,
    dam_coords: tuple[float, float],
    dam_height_m: float,
    reservoir_volume_mcm: float,
    current_water_level_m: float
) -> Dict[str, Any]:
    """
    Executes a fast parametric evaluation of a specific scenario.
    """
    dam_model = DamBreakModel(
        dam_height_m=dam_height_m,
        reservoir_volume_mcm=reservoir_volume_mcm,
        initial_water_level_m=current_water_level_m * (scenario_cfg.get("reservoir_level_pct", 100.0) / 100.0),
        breach_width_m=scenario_cfg["breach_width_m"],
        breach_depth_m=scenario_cfg["breach_depth_m"],
        breach_formation_time_hr=scenario_cfg["breach_formation_time_hr"],
        breach_type=scenario_cfg.get("breach_type", "overtopping"),
    )

    engine = FloodPropagationEngine(
        terrain=terrain,
        dam_break=dam_model,
        dam_coords=dam_coords,
        model_name=scenario_cfg.get("model_type", "Prototype 2D Flood Propagation Engine")
    )

    results = engine.run_simulation(duration_hr=2.0)

    # Estimate settlements count based on flooded area
    villages = max(2, int(results["flooded_area_sqkm"] * 0.72))

    return {
        "scenario_id": scenario_cfg["id"],
        "name": scenario_cfg["name"],
        "breach_width_m": scenario_cfg["breach_width_m"],
        "breach_depth_m": scenario_cfg["breach_depth_m"],
        "peak_discharge_cumec": results["peak_discharge_cumec"],
        "flooded_area_sqkm": results["flooded_area_sqkm"],
        "max_depth_m": results["max_flood_depth_m"],
        "arrival_time_min": results["min_arrival_time_min"],
        "affected_villages": villages,
        "model_type": scenario_cfg.get("model_type", "Prototype 2D Flood Propagation Engine")
    }
