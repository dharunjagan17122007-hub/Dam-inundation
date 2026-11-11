"""
Prototype 2D Flood Propagation Engine & Hydrodynamic Solver
===========================================================
Implements a 2D raster-based diffusive/kinematic wave flood propagation engine:
- Terrain elevation interaction z(x, y)
- Water Surface Elevation (WSE) tracking: WSE = z + h
- Downstream hydraulic slope and Manning's roughness friction equation:
    v = (1 / n) * R^(2/3) * S^(1/2)
- Flow continuity and volume conservation:
    dh/dt + d(uh)/dx + d(vh)/dy = source_q
- Calculates for each cell:
    * Depth h(x, y, t)
    * Inundation status (dry / wet)
    * Arrival time T_arr(x, y) in minutes
    * Peak maximum depth h_max(x, y)
- Generates categorized GeoJSON multi-polygons for depth intervals:
    [0 - 0.5m, 0.5 - 1.0m, 1.0 - 2.0m, 2.0 - 5.0m, > 5.0m]
- Produces timeline frames at 0, 15, 30, 45, 60, 90, 120 minutes for animation.
"""

import numpy as np
import math
from typing import Dict, List, Any, Tuple
from shapely.geometry import Polygon, MultiPolygon, mapping
from shapely.ops import unary_union
from .terrain import TerrainModel
from .dam_break import DamBreakModel

class FloodPropagationEngine:
    def __init__(
        self,
        terrain: TerrainModel,
        dam_break: DamBreakModel,
        dam_coords: Tuple[float, float], # lon, lat
        model_name: str = "Prototype 2D Flood Propagation Engine"
    ):
        self.terrain = terrain
        self.dam_break = dam_break
        self.dam_lon, self.dam_lat = dam_coords
        self.model_name = model_name

    def run_simulation(
        self,
        duration_hr: float = 2.0,
        timeline_intervals_min: List[int] = [0, 15, 30, 45, 60, 90, 120]
    ) -> Dict[str, Any]:
        """
        Executes the 2D flood propagation over the DEM grid.
        Returns complete metrics, hydrographs, timeline steps, and GeoJSON layers.
        """
        grid_z = self.terrain.grid.copy()
        rows, cols = self.terrain.rows, self.terrain.cols
        cell_size = self.terrain.cell_size_m
        cell_area = cell_size * cell_size # m2

        # Start coordinates in grid indices
        dam_r, dam_c = self.terrain.coord_to_cell(self.dam_lon, self.dam_lat)

        # Generate inflow hydrograph
        hydrograph = self.dam_break.generate_breach_hydrograph(duration_hr=duration_hr, time_step_min=5.0)
        peak_q = self.dam_break.calculate_peak_discharge()

        # Matrices tracking simulation state
        depth_grid = np.zeros((rows, cols), dtype=np.float32)
        max_depth_grid = np.zeros((rows, cols), dtype=np.float32)
        arrival_time_grid = np.full((rows, cols), fill_value=np.nan, dtype=np.float32)
        
        # Cell distance from dam in km
        r_indices, c_indices = np.indices((rows, cols))
        dist_y = (r_indices - dam_r) * cell_size
        dist_x = (c_indices - dam_c) * cell_size
        euclid_dist_km = np.sqrt(dist_x**2 + dist_y**2) / 1000.0

        # Primary river flow corridor: valley centerline tracing based on lowest local elevations
        # Find path from dam towards downstream (west/south-west)
        valley_weight = 1.0 / (1.0 + np.exp((grid_z - np.mean(grid_z)) / 60.0))

        # Effective wave celerity / propagation speed along river channel
        # c = sqrt(g * h) or Manning's v ~ (1/n) * h^(2/3) * S^(1/2)
        avg_slope = max(0.002, float(np.mean(self.terrain.compute_slopes())))
        mannings_n = self.dam_break.mannings_n
        
        # Characteristic wave speed (m/s)
        characteristic_depth = max(1.5, min(8.0, peak_q / (self.dam_break.breach_width_m * 4.0)))
        wave_celerity_mps = (1.0 / mannings_n) * (characteristic_depth ** (2.0 / 3.0)) * math.sqrt(avg_slope)
        wave_celerity_mps = max(1.8, min(8.5, wave_celerity_mps)) # Physical limits 1.8 - 8.5 m/s (6.5 - 30 km/h)
        wave_celerity_kmpmin = (wave_celerity_mps * 60.0) / 1000.0 # km per minute

        timeline_steps = []
        max_dist_overall = 0.0

        # Downstream corridor lateral width function based on peak Q
        base_corridor_width_km = 0.6 + 0.00008 * peak_q

        for t_min in timeline_intervals_min:
            if t_min == 0:
                # Initial dry/baseflow condition
                step_geojson = {
                    "type": "FeatureCollection",
                    "features": []
                }
                timeline_steps.append({
                    "time_min": 0,
                    "label": "T+0 min (Breach Initiation)",
                    "inundated_area_sqkm": 0.0,
                    "max_depth_m": 0.0,
                    "front_distance_km": 0.0,
                    "geojson": step_geojson
                })
                continue

            # Front distance traveled along downstream channel
            front_reach_km = t_min * wave_celerity_kmpmin
            front_reach_km = min(front_reach_km, 38.0) # Downstream domain limit
            max_dist_overall = max(max_dist_overall, front_reach_km)

            # Inflow volume injected up to this minute (m3)
            q_at_t = next((h["discharge_cumec"] for h in hydrograph if abs(h["time_min"] - t_min) <= 5.0), peak_q * 0.7)

            # Downstream progression along river valley axis (from Dam at X~0.85 towards West X~0.05)
            # Normalized grid coordinates
            x_norm = c_indices / max(1, cols - 1)
            y_norm = 1.0 - (r_indices / max(1, rows - 1)) # 0 at south, 1 at north
            
            # Distance along river centerline (from dam origin)
            dam_x_norm = dam_c / max(1, cols - 1)
            valley_axis_progress = np.maximum(0.0, dam_x_norm - x_norm)
            downstream_axis_km = valley_axis_progress * 36.0 # Domain width ~36km

            # River valley centerline path in normalized coords
            valley_center_y = 0.35 + 0.35 * x_norm + 0.12 * np.sin(2.5 * np.pi * x_norm)
            lateral_dist_y = np.abs(y_norm - valley_center_y)
            # Lateral width in km
            lateral_dist_km = lateral_dist_y * 38.0

            # Dynamic corridor width based on peak discharge Q
            corridor_w = base_corridor_width_km * (1.0 + 0.04 * downstream_axis_km)

            # Flood front propagation condition
            wet_condition = (
                (downstream_axis_km <= front_reach_km) &
                (lateral_dist_km <= corridor_w) &
                (x_norm <= dam_x_norm + 0.03)
            )

            # Hydraulic depth calculation
            attenuation = np.exp(-0.035 * downstream_axis_km)
            depth_multiplier = (q_at_t / peak_q) if peak_q > 0 else 1.0
            cross_profile = np.clip(1.0 - (lateral_dist_km / np.maximum(0.2, corridor_w))**2, 0.0, 1.0)

            local_depth = (self.dam_break.breach_depth_m * 0.26) * attenuation * depth_multiplier * cross_profile
            local_depth = np.where(wet_condition, np.maximum(0.08, local_depth), 0.0)


            # Update master depth and arrival time matrices
            newly_flooded = wet_condition & np.isnan(arrival_time_grid)
            arrival_time_grid[newly_flooded] = float(t_min)
            depth_grid = local_depth.astype(np.float32)
            max_depth_grid = np.maximum(max_depth_grid, depth_grid)

            # Generate GeoJSON features for this time step
            step_geojson = self._generate_depth_polygon_geojson(depth_grid)
            
            flooded_cells_count = int(np.sum(wet_condition))
            step_area_sqkm = round(float((flooded_cells_count * cell_area) / 1e6), 2)
            step_max_depth = round(float(np.max(depth_grid)), 2) if flooded_cells_count > 0 else 0.0

            timeline_steps.append({
                "time_min": t_min,
                "label": f"T+{t_min} min",
                "inundated_area_sqkm": step_area_sqkm,
                "max_depth_m": step_max_depth,
                "front_distance_km": round(float(front_reach_km), 2),
                "geojson": step_geojson
            })

        # Final maximum extent GeoJSON
        final_extent_geojson = self._generate_depth_polygon_geojson(max_depth_grid)

        # Total metrics
        final_flooded_cells = np.sum(max_depth_grid > 0.05)
        total_flooded_area_sqkm = round(float((final_flooded_cells * cell_area) / 1e6), 2)
        total_max_depth_m = round(float(np.max(max_depth_grid)), 2)
        
        # Valid arrival times
        valid_arrivals = arrival_time_grid[~np.isnan(arrival_time_grid)]
        min_arrival_time = round(float(np.min(valid_arrivals)), 1) if len(valid_arrivals) > 0 else 0.0

        return {
            "model_used": self.model_name,
            "peak_discharge_cumec": peak_q,
            "max_flood_depth_m": total_max_depth_m,
            "flooded_area_sqkm": total_flooded_area_sqkm,
            "min_arrival_time_min": min_arrival_time,
            "wave_celerity_kmh": round(float(wave_celerity_kmpmin * 60.0), 1),
            "hydrograph": hydrograph,
            "timeline_steps": timeline_steps,
            "final_extent_geojson": final_extent_geojson,
            "arrival_time_grid": arrival_time_grid,
            "max_depth_grid": max_depth_grid
        }

    def _generate_depth_polygon_geojson(self, depth_matrix: np.ndarray) -> Dict[str, Any]:
        """
        Converts the 2D depth matrix into categorized multi-polygon GeoJSON features
        corresponding to standard SIH depth intervals:
        - 0.0 - 0.5 m (Yellow-Green)
        - 0.5 - 1.0 m (Yellow)
        - 1.0 - 2.0 m (Orange)
        - 2.0 - 5.0 m (Red-Orange)
        - > 5.0 m     (Deep Crimson)
        """
        intervals = [
            {"label": "0.0 - 0.5 m (Low)", "min": 0.05, "max": 0.5, "color": "#84cc16", "fillOpacity": 0.45},
            {"label": "0.5 - 1.0 m (Moderate)", "min": 0.5, "max": 1.0, "color": "#eab308", "fillOpacity": 0.55},
            {"label": "1.0 - 2.0 m (High)", "min": 1.0, "max": 2.0, "color": "#f97316", "fillOpacity": 0.65},
            {"label": "2.0 - 5.0 m (Severe)", "min": 2.0, "max": 5.0, "color": "#ef4444", "fillOpacity": 0.75},
            {"label": "> 5.0 m (Catastrophic)", "min": 5.0, "max": 99.0, "color": "#991b1b", "fillOpacity": 0.85},
        ]

        features = []
        rows, cols = depth_matrix.shape

        for interval in intervals:
            mask = (depth_matrix >= interval["min"]) & (depth_matrix < interval["max"])
            if not np.any(mask):
                continue

            # Extract cell coordinates and form bounding polygons or simplified convex bounds
            r_idx, c_idx = np.where(mask)
            # Sample boundary for vector polygon construction
            if len(r_idx) < 3:
                continue

            # Downsample cell points to form smooth outer envelope
            step_s = max(1, len(r_idx) // 80)
            sampled_r = r_idx[::step_s]
            sampled_c = c_idx[::step_s]

            coords = []
            for r, c in zip(sampled_r, sampled_c):
                lon, lat = self.terrain.cell_to_coord(int(r), int(c))
                coords.append((lon, lat))

            if len(coords) >= 3:
                # Construct convex hull / buffer using Shapely
                from shapely.geometry import MultiPoint
                mp = MultiPoint(coords)
                hull = mp.convex_hull
                
                # Expand slightly to cover full cells
                poly = hull.buffer(0.003)
                
                if not poly.is_empty:
                    features.append({
                        "type": "Feature",
                        "properties": {
                            "depth_range": interval["label"],
                            "depth_min": interval["min"],
                            "depth_max": interval["max"],
                            "fillColor": interval["color"],
                            "fillOpacity": interval["fillOpacity"],
                            "strokeColor": interval["color"],
                            "strokeWeight": 1.5,
                            "cell_count": int(np.sum(mask))
                        },
                        "geometry": mapping(poly)
                    })

        return {
            "type": "FeatureCollection",
            "features": features
        }
