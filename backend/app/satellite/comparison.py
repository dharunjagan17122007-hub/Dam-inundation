"""
Satellite Validation & Comparison Engine
========================================
Compares hydrodynamic simulation extent against satellite-observed water masks
using real geometric set operations (Shapely):
1. Intersection (Agreement / True Positive)
2. Difference (Simulated Only / Overprediction)
3. Under-prediction (Observed Only / Uncaptured Water)
4. Critical Success Index (CSI) & Overlap Percentage
"""

from typing import Dict, Any, List
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.ops import unary_union

class SatelliteComparisonEngine:
    @staticmethod
    def compare_simulation_with_satellite(
        simulated_geojson: Dict[str, Any],
        satellite_geojson: Dict[str, Any],
        simulation_id: str = "SIM_DEMO"
    ) -> Dict[str, Any]:
        """
        Performs genuine geometric intersection and difference calculation
        between simulation inundation and satellite observation.
        """
        # Collect and union simulated polygons
        sim_geoms = []
        for feat in simulated_geojson.get("features", []):
            try:
                g = shape(feat.get("geometry"))
                if g.is_valid and not g.is_empty:
                    sim_geoms.append(g)
            except Exception:
                continue

        # Collect and union satellite polygons
        sat_geoms = []
        for feat in satellite_geojson.get("features", []):
            try:
                g = shape(feat.get("geometry"))
                if g.is_valid and not g.is_empty:
                    sat_geoms.append(g)
            except Exception:
                continue

        sim_union = unary_union(sim_geoms) if sim_geoms else Polygon()
        sat_union = unary_union(sat_geoms) if sat_geoms else Polygon()

        # Coordinate conversion factor: 1 deg lat ~ 111 km, 1 deg lon at ~9.7 deg N ~ 109.5 km
        deg_to_sqkm = 111.0 * 109.5

        sim_area_sqkm = round(float(sim_union.area * deg_to_sqkm), 2)
        sat_area_sqkm = round(float(sat_union.area * deg_to_sqkm), 2)

        # Intersection: Both simulated and satellite agree
        intersection_geom = sim_union.intersection(sat_union)
        overlap_area_sqkm = round(float(intersection_geom.area * deg_to_sqkm), 2)

        # False Positive: Simulated but not observed by satellite
        false_pos_geom = sim_union.difference(sat_union)
        false_pos_area_sqkm = round(float(false_pos_geom.area * deg_to_sqkm), 2)

        # Missed Flood: Observed by satellite but not reached by simulation
        missed_geom = sat_union.difference(sim_union)
        missed_area_sqkm = round(float(missed_geom.area * deg_to_sqkm), 2)

        # Statistical metrics
        overlap_pct = round((overlap_area_sqkm / max(0.01, sim_area_sqkm)) * 100.0, 1)
        union_area_sqkm = max(0.01, sim_area_sqkm + sat_area_sqkm - overlap_area_sqkm)
        csi_threat_score = round(overlap_area_sqkm / union_area_sqkm, 3)

        # Construct comparative visualization GeoJSON
        comparison_features = []

        if not intersection_geom.is_empty:
            comparison_features.append({
                "type": "Feature",
                "properties": {
                    "category": "Agreement (True Positive)",
                    "description": "Simulated flood confirmed by Sentinel-1 SAR",
                    "fillColor": "#06b6d4", # Cyan
                    "fillOpacity": 0.65,
                    "strokeColor": "#0891b2",
                    "area_sqkm": overlap_area_sqkm
                },
                "geometry": mapping(intersection_geom)
            })

        if not false_pos_geom.is_empty:
            comparison_features.append({
                "type": "Feature",
                "properties": {
                    "category": "Simulation Model Only",
                    "description": "Model predicted inundation beyond SAR detected threshold",
                    "fillColor": "#f59e0b", # Amber
                    "fillOpacity": 0.55,
                    "strokeColor": "#d97706",
                    "area_sqkm": false_pos_area_sqkm
                },
                "geometry": mapping(false_pos_geom)
            })

        if not missed_geom.is_empty:
            comparison_features.append({
                "type": "Feature",
                "properties": {
                    "category": "Satellite Observed Only",
                    "description": "Pre-existing water bodies or unmodeled tributary flow",
                    "fillColor": "#a855f7", # Violet
                    "fillOpacity": 0.55,
                    "strokeColor": "#9333ea",
                    "area_sqkm": missed_area_sqkm
                },
                "geometry": mapping(missed_geom)
            })

        return {
            "simulation_id": simulation_id,
            "satellite_name": "Sentinel-1A SAR (IW GRD)",
            "acquisition_date": "2024-08-15 01:22 UTC",
            "sensor_type": "C-band Synthetic Aperture Radar",
            "simulated_flood_area_sqkm": sim_area_sqkm,
            "satellite_observed_area_sqkm": sat_area_sqkm,
            "overlap_area_sqkm": overlap_area_sqkm,
            "overlap_percentage": overlap_pct,
            "false_positive_area_sqkm": false_pos_area_sqkm,
            "missed_flood_area_sqkm": missed_area_sqkm,
            "critical_success_index": csi_threat_score,
            "comparison_geojson": {
                "type": "FeatureCollection",
                "features": comparison_features
            },
            "satellite_mask_geojson": satellite_geojson
        }
