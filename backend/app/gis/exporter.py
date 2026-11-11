"""
GIS Export Engine: Real Shapefile (.SHP), KML (.KML), and GeoJSON
=================================================================
Generates mathematically valid GIS deliverables:
1. Multi-part ESRI Shapefile bundle (.shp, .shx, .dbf, .prj) in a zipped archive
2. Google Earth KML with color-graded depth layers, timestamps, and metadata
3. WGS84 GeoJSON FeatureCollection
"""

import os
import json
import zipfile
import shapefile
import simplekml
from pathlib import Path
from typing import Dict, Any, List

OUTPUTS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "outputs"
WGS84_PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

def ensure_outputs_dir():
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

def export_to_shapefile(
    simulation_id: str,
    final_extent_geojson: Dict[str, Any],
    metadata: Dict[str, Any]
) -> str:
    """
    Creates an ESRI Shapefile package (.shp, .shx, .dbf, .prj) and packages it into a zip file.
    Returns the absolute path to the generated .zip file.
    """
    ensure_outputs_dir()
    base_name = f"floodguard_inundation_{simulation_id}"
    shp_base_path = OUTPUTS_DIR / base_name
    zip_path = OUTPUTS_DIR / f"{base_name}.zip"

    # Initialize PyShp writer for Polygon shapefile
    w = shapefile.Writer(str(shp_base_path), shapeType=shapefile.POLYGON)
    
    # Define attribute fields (DBF table)
    w.field("ZONE_NAME", "C", size=50)
    w.field("MIN_DEPTH", "F", decimal=2)
    w.field("MAX_DEPTH", "F", decimal=2)
    w.field("CELL_COUNT", "N", size=10)
    w.field("MODEL_NAME", "C", size=50)
    w.field("SIM_ID", "C", size=36)

    features = final_extent_geojson.get("features", [])
    model_name = metadata.get("model_used", "Prototype 2D Flood Propagation Engine")[:50]

    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        gtype = geom.get("type")
        coords = geom.get("coordinates", [])

        rings = []
        if gtype == "Polygon":
            for ring in coords:
                # ring is list of [lon, lat]
                rings.append([[float(pt[0]), float(pt[1])] for pt in ring])
        elif gtype == "MultiPolygon":
            for poly in coords:
                for ring in poly:
                    rings.append([[float(pt[0]), float(pt[1])] for pt in ring])

        if rings:
            w.poly(rings)
            w.record(
                ZONE_NAME=str(props.get("depth_range", "Flooded Zone"))[:50],
                MIN_DEPTH=float(props.get("depth_min", 0.0)),
                MAX_DEPTH=float(props.get("depth_max", 1.0)),
                CELL_COUNT=int(props.get("cell_count", 1)),
                MODEL_NAME=model_name,
                SIM_ID=simulation_id[:36]
            )

    w.close()

    # Write .prj projection file
    prj_file = OUTPUTS_DIR / f"{base_name}.prj"
    with open(prj_file, "w", encoding="utf-8") as f:
        f.write(WGS84_PRJ)

    # Package into ZIP archive
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for ext in [".shp", ".shx", ".dbf", ".prj"]:
            file_to_add = OUTPUTS_DIR / f"{base_name}{ext}"
            if file_to_add.exists():
                zf.write(file_to_add, arcname=f"{base_name}{ext}")

    return str(zip_path)

def export_to_kml(
    simulation_id: str,
    final_extent_geojson: Dict[str, Any],
    metadata: Dict[str, Any]
) -> str:
    """
    Creates a valid OGC KML file with depth color ramps and extended data attributes.
    Returns the absolute path to the generated .kml file.
    """
    ensure_outputs_dir()
    kml_path = OUTPUTS_DIR / f"floodguard_inundation_{simulation_id}.kml"

    kml = simplekml.Kml(name=f"FloodGuard Simulation: {simulation_id}")
    doc = kml.document
    doc.description = (
        f"Dam Break Inundation Simulation Deliverable\n"
        f"Model: {metadata.get('model_used', 'Prototype 2D Flood Propagation Engine')}\n"
        f"Peak Discharge: {metadata.get('peak_discharge_cumec', 0)} m3/s\n"
        f"Max Flood Depth: {metadata.get('max_flood_depth_m', 0)} m\n"
        f"Flooded Area: {metadata.get('flooded_area_sqkm', 0)} km2"
    )

    color_mapping = {
        "0.0 - 0.5 m": simplekml.Color.changealphaint(130, simplekml.Color.green),
        "0.5 - 1.0 m": simplekml.Color.changealphaint(150, simplekml.Color.yellow),
        "1.0 - 2.0 m": simplekml.Color.changealphaint(170, simplekml.Color.orange),
        "2.0 - 5.0 m": simplekml.Color.changealphaint(190, simplekml.Color.red),
        "> 5.0 m": simplekml.Color.changealphaint(220, simplekml.Color.darkred),
    }

    features = final_extent_geojson.get("features", [])
    for idx, feat in enumerate(features):
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        depth_label = props.get("depth_range", f"Zone {idx}")
        
        # Match color
        poly_color = simplekml.Color.changealphaint(160, simplekml.Color.cyan)
        for k, col in color_mapping.items():
            if k in depth_label:
                poly_color = col
                break

        coords = geom.get("coordinates", [])
        gtype = geom.get("type")

        if gtype == "Polygon" and coords:
            outer_ring = [(pt[0], pt[1]) for pt in coords[0]]
            inner_rings = [[(pt[0], pt[1]) for pt in ring] for ring in coords[1:]]
            pol = doc.newpolygon(name=f"Inundation {depth_label}", outerboundaryis=outer_ring, innerboundaryis=inner_rings)
            pol.style.polystyle.color = poly_color
            pol.style.linestyle.color = poly_color
            pol.style.linestyle.width = 2
            pol.description = f"Depth Interval: {depth_label}\nMin Depth: {props.get('depth_min')}m\nMax Depth: {props.get('depth_max')}m"

        elif gtype == "MultiPolygon" and coords:
            for p_idx, poly_coords in enumerate(coords):
                outer_ring = [(pt[0], pt[1]) for pt in poly_coords[0]]
                inner_rings = [[(pt[0], pt[1]) for pt in ring] for ring in poly_coords[1:]]
                pol = doc.newpolygon(name=f"Inundation {depth_label} Part {p_idx+1}", outerboundaryis=outer_ring, innerboundaryis=inner_rings)
                pol.style.polystyle.color = poly_color
                pol.style.linestyle.color = poly_color
                pol.style.linestyle.width = 2
                pol.description = f"Depth Interval: {depth_label}\nMin Depth: {props.get('depth_min')}m\nMax Depth: {props.get('depth_max')}m"

    kml.save(str(kml_path))
    return str(kml_path)

def export_to_geojson(
    simulation_id: str,
    final_extent_geojson: Dict[str, Any],
    metadata: Dict[str, Any]
) -> str:
    """
    Exports clean WGS84 GeoJSON with complete simulation metadata header.
    """
    ensure_outputs_dir()
    geojson_path = OUTPUTS_DIR / f"floodguard_inundation_{simulation_id}.geojson"

    payload = {
        "type": "FeatureCollection",
        "metadata": {
            "simulation_id": simulation_id,
            "system": "FLOODGUARD Disaster Management Platform",
            "model_used": metadata.get("model_used"),
            "peak_discharge_cumec": metadata.get("peak_discharge_cumec"),
            "max_flood_depth_m": metadata.get("max_flood_depth_m"),
            "flooded_area_sqkm": metadata.get("flooded_area_sqkm"),
            "crs": "urn:ogc:def:crs:OGC:1.3:CRS84"
        },
        "features": final_extent_geojson.get("features", [])
    }

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return str(geojson_path)
