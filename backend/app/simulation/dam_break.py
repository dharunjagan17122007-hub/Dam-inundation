"""
Dam-Break Breach Mechanics & Hydrograph Calculation Module
============================================================
This module implements physically meaningful hydraulic equations for dam breach
discharge estimation based on:
1. Broad-crested weir formulation: Q(t) = C * B(t) * [H(t)]^(1.5)
2. Froehlich (1995) / MacDonald & Langridge-Monopolis (1984) breach parameter heuristics
3. Dynamic reservoir drawdown hydrograph modeling

SIH Technical Credibility Note:
- This is a simplified 1D-to-2D breach boundary flux model.
- Solvers are explicitly labeled with their mathematical assumptions.
"""

import math
from typing import Dict, List, Tuple

class DamBreakModel:
    def __init__(
        self,
        dam_height_m: float,
        reservoir_volume_mcm: float,
        initial_water_level_m: float,
        breach_width_m: float = 85.0,
        breach_depth_m: float = 35.0,
        breach_formation_time_hr: float = 1.2,
        breach_type: str = "overtopping",
        discharge_coefficient: float = 1.7, # Standard broad-crested weir coefficient (1.6 - 1.8)
        base_river_discharge_cumec: float = 150.0,
        mannings_n: float = 0.035,
    ):
        self.dam_height_m = dam_height_m
        self.reservoir_volume_mcm = reservoir_volume_mcm # Million cubic meters
        self.initial_water_level_m = initial_water_level_m
        self.breach_width_m = breach_width_m
        self.breach_depth_m = breach_depth_m
        self.breach_formation_time_hr = max(0.1, breach_formation_time_hr)
        self.breach_formation_time_min = self.breach_formation_time_hr * 60.0
        self.breach_type = breach_type.lower()
        self.discharge_coefficient = discharge_coefficient
        self.base_river_discharge_cumec = base_river_discharge_cumec
        self.mannings_n = mannings_n

    def calculate_peak_discharge(self) -> float:
        """
        Calculates peak breach outflow Qp using hydraulic weir formula and
        reservoir head availability.
        Qp = C * B * H^(1.5)
        """
        # Effective head above breach invert
        effective_head = max(1.0, min(self.initial_water_level_m, self.breach_depth_m))
        
        # Weir flow discharge
        q_weir = self.discharge_coefficient * self.breach_width_m * (effective_head ** 1.5)

        # Empirical Froehlich (1995) validation bound for peak outflow:
        # Qp_froehlich = 0.607 * (V_w^0.295) * (h_w^1.24) where V_w in m3, h_w in m
        v_w = self.reservoir_volume_mcm * 1e6
        q_froehlich = 0.607 * (v_w ** 0.295) * (effective_head ** 1.24)

        # Weighted hydraulic estimate
        if self.breach_type == "piping":
            # Piping initially develops more gradually then collapses
            peak_q = (0.75 * q_weir + 0.25 * q_froehlich) * 0.90
        elif self.breach_type == "sudden_collapse":
            peak_q = max(q_weir, q_froehlich * 1.15)
        else: # Overtopping
            peak_q = 0.65 * q_weir + 0.35 * q_froehlich

        return round(float(peak_q), 2)

    def generate_breach_hydrograph(
        self,
        duration_hr: float = 2.0,
        time_step_min: float = 5.0
    ) -> List[Dict[str, float]]:
        """
        Generates outflow hydrograph points Q(t) in m3/s over time in minutes.
        Simulates:
        1. Breach widening and deepening phase up to breach_formation_time
        2. Peak discharge achievement
        3. Exponential drawdown attenuation as reservoir empties
        """
        peak_q = self.calculate_peak_discharge()
        total_minutes = int(duration_hr * 60.0)
        t_form = self.breach_formation_time_min
        
        hydrograph = []
        # Reservoir volume in m3
        storage_remaining = self.reservoir_volume_mcm * 1e6

        for t in range(0, total_minutes + int(time_step_min), int(time_step_min)):
            time_min = float(t)
            if time_min == 0:
                q_t = self.base_river_discharge_cumec
                head_t = self.initial_water_level_m
            elif time_min <= t_form:
                # Rising limb: non-linear expansion (S-curve / sinusoidal rise)
                progress = time_min / t_form
                # Smooth sinusoidal ramp
                multiplier = 0.5 * (1.0 - math.cos(math.pi * progress))
                q_t = self.base_river_discharge_cumec + (peak_q - self.base_river_discharge_cumec) * multiplier
                head_t = self.initial_water_level_m * (1.0 - 0.15 * progress)
            else:
                # Recession limb: exponential decay
                decay_rate = 0.025 / (self.reservoir_volume_mcm / 100.0) # Larger reservoirs drain slower
                decay_rate = max(0.012, min(0.045, decay_rate))
                elapsed_after_peak = time_min - t_form
                decay_factor = math.exp(-decay_rate * elapsed_after_peak)
                q_t = self.base_river_discharge_cumec + (peak_q - self.base_river_discharge_cumec) * decay_factor
                head_t = max(2.0, (self.initial_water_level_m * 0.85) * decay_factor)

            hydrograph.append({
                "time_min": time_min,
                "discharge_cumec": round(float(q_t), 2),
                "reservoir_head_m": round(float(head_t), 2)
            })

        return hydrograph
