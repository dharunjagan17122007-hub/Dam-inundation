"""
Simulation Metrics & Severity Classification Module
===================================================
Computes hydrological summary indicators, classifies disaster risk severity,
and formulates actionable early-warning banners according to SIH standards.
"""

from typing import Dict, Any

def classify_flood_severity(
    peak_discharge_cumec: float,
    max_flood_depth_m: float,
    min_arrival_time_min: float,
    flooded_area_sqkm: float,
    affected_population: int = 0
) -> Dict[str, str]:
    """
    Classifies flood severity into LOW, MODERATE, HIGH, CRITICAL.
    Produces an actionable decision-support early-warning banner.
    """
    if (
        peak_discharge_cumec >= 10000.0
        or min_arrival_time_min <= 35.0
        or max_flood_depth_m >= 4.0
        or flooded_area_sqkm >= 20.0
        or affected_population >= 5000
    ):
        severity = "CRITICAL"
        warning = (
            f"⚠ CRITICAL FLOOD RISK: Flood arrival expected in approximately {int(min_arrival_time_min)} minutes. "
            f"Peak discharge of {int(peak_discharge_cumec):,} m³/s anticipated with depths exceeding {max_flood_depth_m:.1f} m. "
            f"Immediate downstream evacuation assessment recommended."
        )
    elif (
        peak_discharge_cumec >= 4500.0
        or min_arrival_time_min <= 60.0
        or max_flood_depth_m >= 2.0
        or flooded_area_sqkm >= 10.0
    ):
        severity = "HIGH"
        warning = (
            f"⚠ HIGH FLOOD RISK: Flood arrival in downstream reach within {int(min_arrival_time_min)} minutes. "
            f"Maximum inundation depth {max_flood_depth_m:.1f} m. Prepare low-lying areas for emergency relocation."
        )
    elif peak_discharge_cumec >= 1500.0 or max_flood_depth_m >= 1.0 or flooded_area_sqkm >= 4.0:
        severity = "MODERATE"
        warning = (
            f"⚡ MODERATE FLOOD RISK: Water level rise projected along river banks. "
            f"Arrival time approximately {int(min_arrival_time_min)} minutes. Caution advised near bridge crossings."
        )
    else:
        severity = "LOW"
        warning = (
            f"ℹ LOW FLOOD RISK: Breach flow contained largely within riparian buffer. "
            f"Continuous hydrological telemetry monitoring recommended."
        )

    return {
        "severity": severity,
        "warning_banner": warning
    }
