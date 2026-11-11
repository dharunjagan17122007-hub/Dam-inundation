import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import {
  Play,
  Pause,
  RotateCcw,
  Layers,
  Clock,
  Compass
} from 'lucide-react';
import { SimulationResult, RiverData, DamData, TimelineStep } from '../services/api';

interface MapViewProps {
  simulationResult: SimulationResult | null;
  dam: DamData | null;
  river: RiverData | null;
  satelliteComparisonGeoJson?: any;
}

interface MapFlowParticle {
  distKm: number;
  speedKmS: number;
  lateralOffsetPx: number;
  size: number;
  color: string;
  alpha: number;
}

interface DepthStyle {
  label: string;
  className: string;
  interval: string;
  fillColor: string;
  strokeColor: string;
  fillOpacity: number;
}

// Fallback Periyar River Coordinates if river data is loading
const DEFAULT_PERIYAR_COORDS: [number, number][] = [
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
];

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Maps raw simulation depth properties to the professional scientific blue-water palette:
 * - 0–0.5 m: light blue (#38bdf8)
 * - 0.5–1 m: cyan (#06b6d4)
 * - 1–2 m: medium blue (#0284c7)
 * - 2–5 m: dark blue (#0369a1)
 * - >5 m: very dark blue (#0c4a6e)
 */
function getDepthStyle(p: any): DepthStyle {
  let min = typeof p.depth_min === 'number' ? p.depth_min : 0;
  let max = typeof p.depth_max === 'number' ? p.depth_max : min;

  if (p.depth_range && typeof p.depth_range === 'string') {
    if (p.depth_range.includes('> 5') || p.depth_range.includes('>5')) {
      min = 5.0;
      max = 12.0;
    } else if (p.depth_range.includes('2') && p.depth_range.includes('5')) {
      min = 2.0;
      max = 5.0;
    } else if (p.depth_range.includes('1') && p.depth_range.includes('2')) {
      min = 1.0;
      max = 2.0;
    } else if (p.depth_range.includes('0.5') && p.depth_range.includes('1')) {
      min = 0.5;
      max = 1.0;
    } else if (p.depth_range.includes('0') && p.depth_range.includes('0.5')) {
      min = 0.0;
      max = 0.5;
    }
  }

  if (min >= 5.0 || max > 5.0) {
    return {
      label: '> 5.0 m',
      className: '> 5.0 m (Critical Depth)',
      interval: '> 5.0 m',
      fillColor: '#0c4a6e',
      strokeColor: '#075985',
      fillOpacity: 0.82
    };
  } else if (min >= 2.0) {
    return {
      label: '2–5 m',
      className: '2.0 – 5.0 m (High Depth)',
      interval: '2.0 – 5.0 m',
      fillColor: '#0369a1',
      strokeColor: '#0284c7',
      fillOpacity: 0.70
    };
  } else if (min >= 1.0) {
    return {
      label: '1–2 m',
      className: '1.0 – 2.0 m (Medium Depth)',
      interval: '1.0 – 2.0 m',
      fillColor: '#0284c7',
      strokeColor: '#0ea5e9',
      fillOpacity: 0.58
    };
  } else if (min >= 0.5) {
    return {
      label: '0.5–1 m',
      className: '0.5 – 1.0 m (Moderate Depth)',
      interval: '0.5 – 1.0 m',
      fillColor: '#06b6d4',
      strokeColor: '#38bdf8',
      fillOpacity: 0.48
    };
  } else {
    return {
      label: '0–0.5 m',
      className: '0.0 – 0.5 m (Shallow Water)',
      interval: '0.0 – 0.5 m',
      fillColor: '#38bdf8',
      strokeColor: '#7dd3fc',
      fillOpacity: 0.40
    };
  }
}

export const MapView: React.FC<MapViewProps> = ({
  simulationResult,
  dam,
  river,
  satelliteComparisonGeoJson
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const flowCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Layer references
  const riverLayerRef = useRef<L.GeoJSON | null>(null);
  const damMarkerRef = useRef<L.Marker | null>(null);
  const floodGeoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const settlementsLayerRef = useRef<L.LayerGroup | null>(null);
  const sheltersLayerRef = useRef<L.LayerGroup | null>(null);
  const satelliteLayerRef = useRef<L.GeoJSON | null>(null);
  const baseTileLayersRef = useRef<L.LayerGroup | null>(null);

  // Animation player state
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x, 2x, 3x

  // Layer visibility toggles
  const [showRiver, setShowRiver] = useState<boolean>(true);
  const [showDam, setShowDam] = useState<boolean>(true);
  const [showFlood, setShowFlood] = useState<boolean>(true);
  const [showSettlements, setShowSettlements] = useState<boolean>(true);
  const [showShelters, setShowShelters] = useState<boolean>(true);
  const [showSatellite, setShowSatellite] = useState<boolean>(false);

  // Hydrodynamic Simulation Display Controls
  const [flowVisualizationMode, setFlowVisualizationMode] = useState<boolean>(true);
  const [showRiskZones, setShowRiskZones] = useState<boolean>(true);
  const [basemapStyle, setBasemapStyle] = useState<'dark' | 'satellite' | 'streets'>('dark');
  const [mapReady, setMapReady] = useState<boolean>(false);

  const timelineSteps: TimelineStep[] = simulationResult?.timeline_steps || [];
  const currentStep = timelineSteps[currentStepIndex] || null;

  // Precompute river path geometry and distance interpolator
  const riverPathData = useMemo(() => {
    const rawCoords: [number, number][] =
      river?.geojson_geometry?.coordinates && Array.isArray(river.geojson_geometry.coordinates)
        ? (river.geojson_geometry.coordinates as [number, number][])
        : DEFAULT_PERIYAR_COORDS;

    const segments: Array<{
      lat1: number;
      lon1: number;
      lat2: number;
      lon2: number;
      segDistKm: number;
      cumStartKm: number;
      cumEndKm: number;
    }> = [];

    let cum = 0;
    for (let i = 0; i < rawCoords.length - 1; i++) {
      const lon1 = rawCoords[i][0];
      const lat1 = rawCoords[i][1];
      const lon2 = rawCoords[i + 1][0];
      const lat2 = rawCoords[i + 1][1];
      const d = haversineDistance(lat1, lon1, lat2, lon2);
      segments.push({
        lat1,
        lon1,
        lat2,
        lon2,
        segDistKm: d,
        cumStartKm: cum,
        cumEndKm: cum + d
      });
      cum += d;
    }

    const totalLengthKm = Math.max(0.1, cum);

    const interpolate = (distKm: number) => {
      const target = Math.max(0, Math.min(totalLengthKm, distKm));
      const seg =
        segments.find((s) => target >= s.cumStartKm && target <= s.cumEndKm) ||
        segments[segments.length - 1];

      if (!seg || seg.segDistKm <= 0) {
        const last = rawCoords[rawCoords.length - 1];
        return { lat: last[1], lon: last[0], angleRad: 0 };
      }

      const ratio = Math.max(0, Math.min(1, (target - seg.cumStartKm) / seg.segDistKm));
      const lat = seg.lat1 + (seg.lat2 - seg.lat1) * ratio;
      const lon = seg.lon1 + (seg.lon2 - seg.lon1) * ratio;
      const angleRad = Math.atan2(seg.lat2 - seg.lat1, seg.lon2 - seg.lon1);
      return { lat, lon, angleRad };
    };

    return { segments, totalLengthKm, interpolate, rawCoords };
  }, [river]);

  // Particles system reference
  const particlesRef = useRef<MapFlowParticle[]>([]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const defaultLat = dam?.latitude || 9.62;
    const defaultLon = dam?.longitude || 77.06;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLon],
      zoom: 11,
      zoomControl: true,
    });

    mapInstanceRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Update Basemap Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    if (baseTileLayersRef.current) {
      map.removeLayer(baseTileLayersRef.current);
      baseTileLayersRef.current = null;
    }

    const group = L.layerGroup();

    if (basemapStyle === 'dark') {
      const darkBase = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; Esri &mdash; World Dark Gray Base',
          maxZoom: 18,
        }
      );
      const darkLabels = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 18,
          opacity: 0.85,
        }
      );
      group.addLayer(darkBase);
      group.addLayer(darkLabels);
    } else if (basemapStyle === 'satellite') {
      const sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '&copy; Esri &mdash; World Imagery',
          maxZoom: 18,
        }
      );
      group.addLayer(sat);
    } else {
      const streets = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }
      );
      group.addLayer(streets);
    }

    group.addTo(map);
    baseTileLayersRef.current = group;
  }, [basemapStyle, mapReady]);

  // Center map when dam changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !dam) return;
    map.flyTo([dam.latitude, dam.longitude], 11, { duration: 1.2 });
  }, [dam?.latitude, dam?.longitude]);

  // Update Dam Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (damMarkerRef.current) {
      map.removeLayer(damMarkerRef.current);
      damMarkerRef.current = null;
    }

    if (dam && showDam) {
      const damIcon = L.divIcon({
        className: 'custom-dam-marker',
        html: `
          <div style="background: linear-gradient(135deg, #0284c7, #075985); width: 30px; height: 30px; border-radius: 8px; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.6);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 21h18"/>
              <path d="M5 21V5l7-2 7 2v16"/>
              <path d="M9 10h6"/>
              <path d="M9 14h6"/>
              <path d="M9 18h6"/>
            </svg>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([dam.latitude, dam.longitude], { icon: damIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: inherit; font-size: 12px; line-height: 1.5; color: #e2e8f0; min-width: 220px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 4px; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 13px; color: #38bdf8;">${dam.name}</span>
              <span style="font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(2, 132, 199, 0.2); color: #38bdf8; border: 1px solid rgba(2, 132, 199, 0.4);">
                DAM STRUCTURE
              </span>
            </div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 11px;">
              <span style="color: #94a3b8;">Dam Type:</span>
              <b style="color: #f8fafc;">${dam.dam_type}</b>
              <span style="color: #94a3b8;">Height:</span>
              <b style="color: #f8fafc;">${dam.height_m} m</b>
              <span style="color: #94a3b8;">Crest Length:</span>
              <b style="color: #f8fafc;">${dam.crest_length_m} m</b>
              <span style="color: #94a3b8;">Storage:</span>
              <b style="color: #f8fafc;">${dam.reservoir_volume_mcm} MCM</b>
              <span style="color: #94a3b8;">Current Water Level:</span>
              <b style="color: #38bdf8;">${dam.current_water_level_m} m</b>
              <span style="color: #94a3b8;">FRL:</span>
              <b style="color: #f8fafc;">${dam.full_reservoir_level_m} m</b>
              <span style="color: #94a3b8;">Spillway Capacity:</span>
              <b style="color: #f8fafc;">${dam.spillway_capacity_cumec.toLocaleString()} m³/s</b>
            </div>
          </div>
        `);

      damMarkerRef.current = marker;
    }
  }, [dam, showDam]);

  // Update River Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (riverLayerRef.current) {
      map.removeLayer(riverLayerRef.current);
      riverLayerRef.current = null;
    }

    if (river?.geojson_geometry && showRiver) {
      const layer = L.geoJSON(river.geojson_geometry as any, {
        style: {
          color: '#0284c7',
          weight: 3.5,
          opacity: 0.65,
          dashArray: '3, 6',
        },
      }).addTo(map);

      riverLayerRef.current = layer;
    }
  }, [river, showRiver]);

  // Update Settlements and Shelters Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (settlementsLayerRef.current) {
      map.removeLayer(settlementsLayerRef.current);
      settlementsLayerRef.current = null;
    }
    if (sheltersLayerRef.current) {
      map.removeLayer(sheltersLayerRef.current);
      sheltersLayerRef.current = null;
    }

    const impact = simulationResult?.impact_result;

    if (impact && showSettlements) {
      const sGroup = L.layerGroup();
      const settlements = impact.settlements_detail || [];

      settlements.forEach((s: any) => {
        const isFlooded = s.inundation_status === 'FLOODED';
        const isAtRisk =
          s.inundation_status === 'AT_RISK' ||
          (!isFlooded && currentStep && s.estimated_arrival_min <= (currentStepIndex + 1) * 15 + 15);

        // Flooded settlement: red marker
        // At-risk settlement: amber marker
        // Safe: green/blue marker
        const statusColor = isFlooded ? '#ef4444' : isAtRisk ? '#f59e0b' : '#10b981';
        const statusBadgeBg = isFlooded
          ? 'rgba(239, 68, 68, 0.18)'
          : isAtRisk
          ? 'rgba(245, 158, 11, 0.18)'
          : 'rgba(16, 185, 129, 0.18)';
        const statusText = isFlooded ? 'INUNDATED' : isAtRisk ? 'AT RISK' : 'SAFE';
        const arrivalText = isFlooded
          ? 'Inundated'
          : s.estimated_arrival_min
          ? `T+${s.estimated_arrival_min} min`
          : 'Not Reached';

        const sIcon = L.divIcon({
          className: isFlooded ? 'hazard-pulse-marker' : '',
          html: `
            <div style="background-color: ${statusColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 10px ${statusColor}99;"></div>
          `,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const m = L.marker([s.lat, s.lon], { icon: sIcon }).bindPopup(`
          <div style="font-family: inherit; font-size: 12px; line-height: 1.5; color: #e2e8f0; min-width: 190px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 4px; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 13px; color: #ffffff;">${s.name}</span>
              <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${statusBadgeBg}; color: ${statusColor}; border: 1px solid ${statusColor}44;">
                ${statusText}
              </span>
            </div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 11px;">
              <span style="color: #94a3b8;">Population:</span>
              <b style="color: #f8fafc;">${s.population.toLocaleString()}</b>
              <span style="color: #94a3b8;">Elevation:</span>
              <b style="color: #f8fafc;">${s.elevation_m} m</b>
              <span style="color: #94a3b8;">Inundation Status:</span>
              <b style="color: ${statusColor};">${statusText}</b>
              <span style="color: #94a3b8;">Estimated Flood Arrival:</span>
              <b style="color: #38bdf8;">${arrivalText}</b>
            </div>
          </div>
        `);
        sGroup.addLayer(m);
      });

      sGroup.addTo(map);
      settlementsLayerRef.current = sGroup;
    }

    if (impact && showShelters) {
      const shGroup = L.layerGroup();
      const shelters = impact.shelters || [];

      shelters.forEach((sh: any) => {
        const shIcon = L.divIcon({
          html: `
            <div style="background-color: #10b981; width: 20px; height: 20px; border-radius: 5px; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);">
              <span style="color: white; font-size: 12px; font-weight: bold; line-height: 1;">+</span>
            </div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const m = L.marker([sh.lat, sh.lon], { icon: shIcon }).bindPopup(`
          <div style="font-family: inherit; font-size: 12px; line-height: 1.5; color: #e2e8f0; min-width: 190px;">
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 4px; margin-bottom: 6px;">
              <span style="font-weight: 700; font-size: 13px; color: #10b981;">${sh.name}</span>
              <span style="font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4);">
                SAFE SHELTER
              </span>
            </div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 11px;">
              <span style="color: #94a3b8;">Facility Type:</span>
              <b style="color: #f8fafc;">Designated Safe Shelter</b>
              <span style="color: #94a3b8;">Elevation:</span>
              <b style="color: #f8fafc;">${sh.elevation_m} m (Safe High Ground)</b>
              <span style="color: #94a3b8;">Shelter Capacity:</span>
              <b style="color: #10b981;">${sh.capacity.toLocaleString()} persons</b>
            </div>
          </div>
        `);
        shGroup.addLayer(m);
      });

      shGroup.addTo(map);
      sheltersLayerRef.current = shGroup;
    }
  }, [simulationResult, showSettlements, showShelters, currentStep, currentStepIndex]);

  // Update Inundation Layer based on Timeline Step using Scientific Depth Palettes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (floodGeoJsonLayerRef.current) {
      map.removeLayer(floodGeoJsonLayerRef.current);
      floodGeoJsonLayerRef.current = null;
    }

    if (!showFlood || !currentStep || !currentStep.geojson) return;

    const layer = L.geoJSON(currentStep.geojson, {
      style: (feature) => {
        const p = feature?.properties || {};
        const style = getDepthStyle(p);
        return {
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
          color: style.strokeColor,
          weight: 1.5,
        };
      },
      onEachFeature: (feature, l) => {
        const p = feature.properties || {};
        const depthInfo = getDepthStyle(p);
        const cellCount = p.cell_count || p.flooded_cells || p.count || 'N/A';
        l.bindPopup(`
          <div style="font-family: inherit; font-size: 12px; line-height: 1.5; color: #e2e8f0; min-width: 180px;">
            <div style="font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; color: #38bdf8; margin-bottom: 3px;">
              Flood Depth Class
            </div>
            <div style="font-weight: 700; color: #ffffff; font-size: 13px; margin-bottom: 6px;">
              ${depthInfo.label}
            </div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; font-size: 11px; border-top: 1px solid #1e293b; padding-top: 4px;">
              <span style="color: #94a3b8;">Depth Interval:</span>
              <b style="color: #67e8f9;">${p.depth_min ?? '0'} – ${p.depth_max ?? '0.5'} m</b>
              <span style="color: #94a3b8;">Flooded Cells:</span>
              <b style="color: #f1f5f9;">${typeof cellCount === 'number' ? cellCount.toLocaleString() : cellCount}</b>
            </div>
          </div>
        `);
      },
    }).addTo(map);

    floodGeoJsonLayerRef.current = layer;
  }, [currentStep, showFlood]);

  // Update Satellite Comparison Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (satelliteLayerRef.current) {
      map.removeLayer(satelliteLayerRef.current);
      satelliteLayerRef.current = null;
    }

    if (showSatellite && satelliteComparisonGeoJson) {
      const layer = L.geoJSON(satelliteComparisonGeoJson, {
        style: () => ({
          fillColor: '#06b6d4',
          fillOpacity: 0.55,
          color: '#0891b2',
          weight: 2,
        }),
        onEachFeature: (feature, l) => {
          const p = feature.properties || {};
          l.bindPopup(`
            <div style="font-family: inherit; font-size: 12px; line-height: 1.5; color: #e2e8f0;">
              <div style="font-weight: 700; color: #06b6d4; font-size: 13px; margin-bottom: 4px;">${p.category || 'Sentinel-1 SAR Extent'}</div>
              <div>${p.description || 'Observed SAR water mask'}</div>
              <div><b>Area:</b> ${p.area_sqkm ? `${p.area_sqkm} km²` : 'N/A'}</div>
            </div>
          `);
        },
      }).addTo(map);

      satelliteLayerRef.current = layer;
    }
  }, [showSatellite, satelliteComparisonGeoJson]);

  // Timeline Animation Loop
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && timelineSteps.length > 0) {
      interval = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= timelineSteps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1600 / playbackSpeed);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, timelineSteps.length, playbackSpeed]);

  const handleRestart = () => {
    setCurrentStepIndex(0);
    setIsPlaying(true);
  };

  // Resize canvas with map container
  useEffect(() => {
    const handleResize = () => {
      const canvas = flowCanvasRef.current;
      const container = mapContainerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Scientific Real-Time Hydrodynamic Flood Flow & Wavefront Canvas Engine
  useEffect(() => {
    let animId: number;
    const canvas = flowCanvasRef.current;
    const map = mapInstanceRef.current;
    if (!canvas || !map) return;

    // Initialize hydrodynamic water particles along the river corridor
    if (particlesRef.current.length === 0) {
      const colors = ['#38bdf8', '#0ea5e9', '#0284c7', '#7dd3fc', '#bae6fd'];
      for (let i = 0; i < 200; i++) {
        particlesRef.current.push({
          distKm: Math.random() * riverPathData.totalLengthKm,
          speedKmS: 0.07 + Math.random() * 0.11, // Realistic flow velocity
          lateralOffsetPx: (Math.random() - 0.5) * 14,
          size: 1.4 + Math.random() * 1.8,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 0.5 + Math.random() * 0.4
        });
      }
    }

    const render = () => {
      const time = performance.now() * 0.001;
      const ctx = canvas.getContext('2d');
      const mapInstance = mapInstanceRef.current;

      if (ctx && mapInstance) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (flowVisualizationMode) {
          // Current active wavefront reach from current timeline step (km)
          const currentReachKm = currentStep ? currentStep.front_distance_km : 0;
          const activeReachKm = Math.min(riverPathData.totalLengthKm, Math.max(0.4, currentReachKm));

          // 1. Draw River Corridor Water Channel Streamlines
          ctx.beginPath();
          let started = false;
          const sampleStep = 0.5; // km
          for (let d = 0; d <= activeReachKm; d += sampleStep) {
            const ptGeo = riverPathData.interpolate(d);
            const ptScreen = mapInstance.latLngToContainerPoint([ptGeo.lat, ptGeo.lon]);
            if (!started) {
              ctx.moveTo(ptScreen.x, ptScreen.y);
              started = true;
            } else {
              ctx.lineTo(ptScreen.x, ptScreen.y);
            }
          }

          // Outer river water stream
          ctx.strokeStyle = 'rgba(2, 132, 199, 0.32)';
          ctx.lineWidth = 10;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();

          // Animated flowing core line
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
          ctx.lineWidth = 3.5;
          ctx.setLineDash([12, 16]);
          ctx.lineDashOffset = -time * 50 * playbackSpeed;
          ctx.stroke();
          ctx.setLineDash([]);

          // 2. Hydrodynamic Flow Particles (Water droplets flowing along river)
          const particles = particlesRef.current;
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.distKm += p.speedKmS * playbackSpeed * 0.35;
            if (p.distKm > activeReachKm) {
              p.distKm = Math.random() * 0.4; // Respawn at dam inlet
            }

            const geoPos = riverPathData.interpolate(p.distKm);
            const screenPos = mapInstance.latLngToContainerPoint([geoPos.lat, geoPos.lon]);

            const perpAngle = geoPos.angleRad + Math.PI / 2;
            const px = screenPos.x + Math.cos(perpAngle) * p.lateralOffsetPx;
            const py = screenPos.y + Math.sin(perpAngle) * p.lateralOffsetPx;

            // Draw particle
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(px, py, p.size, 0, Math.PI * 2);
            ctx.fill();

            // Velocity vector tail
            const tailLen = p.speedKmS * 28;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size * 0.6;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(
              px - Math.cos(geoPos.angleRad) * tailLen,
              py - Math.sin(geoPos.angleRad) * tailLen
            );
            ctx.stroke();
          }

          // 3. Professional Flood Wavefront Visualization
          if (activeReachKm > 0.4) {
            const frontGeo = riverPathData.interpolate(activeReachKm);
            const frontScreen = mapInstance.latLngToContainerPoint([frontGeo.lat, frontGeo.lon]);

            // Subtle wavefront advancing line (perpendicular to flow)
            const crestAngle = frontGeo.angleRad + Math.PI / 2;
            const arcWidth = 24;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(
              frontScreen.x - Math.cos(crestAngle) * arcWidth,
              frontScreen.y - Math.sin(crestAngle) * arcWidth
            );
            ctx.lineTo(
              frontScreen.x + Math.cos(crestAngle) * arcWidth,
              frontScreen.y + Math.sin(crestAngle) * arcWidth
            );
            ctx.stroke();

            // Soft wavefront marker beacon
            ctx.fillStyle = '#0ea5e9';
            ctx.beginPath();
            ctx.arc(frontScreen.x, frontScreen.y, 4, 0, Math.PI * 2);
            ctx.fill();

            // Scientific Floating Badge pinned to Wavefront
            const badgeW = 160;
            const badgeH = 24;
            const badgeX = frontScreen.x + 18;
            const badgeY = frontScreen.y - 24;

            // Badge container
            ctx.fillStyle = 'rgba(7, 24, 39, 0.92)';
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
            ctx.fill();
            ctx.stroke();

            // Connector line
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
            ctx.beginPath();
            ctx.moveTo(frontScreen.x, frontScreen.y);
            ctx.lineTo(badgeX, badgeY + badgeH / 2);
            ctx.stroke();

            // Badge Text
            ctx.font = 'bold 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText('FLOOD WAVEFRONT', badgeX + 8, badgeY + 11);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '9px monospace';
            ctx.fillText(`Reach: ${activeReachKm.toFixed(1)} km`, badgeX + 8, badgeY + 20);
          }

          // 4. Subtle Settlement Hazard Bounds (if enabled)
          if (showRiskZones && simulationResult?.impact_result) {
            const settlements = simulationResult.impact_result.settlements_detail || [];
            settlements.forEach((s: any) => {
              const sPos = mapInstance.latLngToContainerPoint([s.lat, s.lon]);
              const isFlooded = s.inundation_status === 'FLOODED';
              const isAtRisk =
                s.inundation_status === 'AT_RISK' ||
                (!isFlooded && currentStep && s.estimated_arrival_min <= (currentStepIndex + 1) * 15 + 15);

              if (isFlooded) {
                // Soft warning perimeter circle
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(sPos.x, sPos.y, 18, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
                ctx.font = 'bold 8.5px monospace';
                ctx.fillText('INUNDATED', sPos.x - 24, sPos.y - 21);
              } else if (isAtRisk) {
                // Soft warning perimeter circle
                ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(sPos.x, sPos.y, 16, 0, Math.PI * 2);
                ctx.stroke();

                const timeRemaining = Math.max(1, s.estimated_arrival_min - currentStepIndex * 15);
                ctx.fillStyle = '#f59e0b';
                ctx.font = 'bold 8.5px monospace';
                ctx.fillText(`EST. ARRIVAL T+${timeRemaining}m`, sPos.x - 42, sPos.y - 19);
              }
            });
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [flowVisualizationMode, currentStep, currentStepIndex, riverPathData, playbackSpeed, showRiskZones, simulationResult]);

  return (
    <div className="relative w-full h-[640px] rounded-xl overflow-hidden border border-cyan-950/70 shadow-2xl bg-[#061522] flex flex-col">
      {/* Leaflet Map Canvas */}
      <div ref={mapContainerRef} className="w-full flex-1 z-0 relative" />

      {/* Real-time Scientific Flood Flow Canvas Overlay */}
      <canvas
        ref={flowCanvasRef}
        className="absolute inset-0 pointer-events-none z-[350]"
      />

      {/* Top Floating Control: Professional GIS Panel */}
      <div className="absolute top-4 right-4 z-[400] w-72 max-w-[calc(100%-2rem)] max-h-[calc(100%-8.5rem)] overflow-y-auto rounded-xl border border-cyan-900/40 bg-[#071827]/95 p-3.5 shadow-2xl backdrop-blur-md text-xs space-y-3 pointer-events-auto">
        {/* Panel Header */}
        <div className="border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-white text-xs">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              FLOOD SIMULATION
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-[9px] font-semibold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            2D Hydrodynamic GIS Analysis
          </div>
        </div>

        {/* Compact Telemetry Cards */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">Reach</div>
            <div className="font-mono text-xs font-bold text-cyan-300 mt-0.5">
              {currentStep ? `${currentStep.front_distance_km} km` : '0.0 km'}
            </div>
          </div>
          <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">Area</div>
            <div className="font-mono text-xs font-bold text-blue-300 mt-0.5">
              {currentStep ? `${currentStep.inundated_area_sqkm} km²` : '0.0 km²'}
            </div>
          </div>
          <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800">
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">Max Depth</div>
            <div className="font-mono text-xs font-bold text-amber-300 mt-0.5">
              {currentStep ? `${currentStep.max_depth_m} m` : '0.0 m'}
            </div>
          </div>
        </div>

        {/* Simulation Display Controls */}
        <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Simulation Display</span>
            <span className="text-[9px] font-mono text-cyan-400">REAL-TIME</span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-300">Flood Wave Animation</span>
            <button
              type="button"
              onClick={() => setFlowVisualizationMode(!flowVisualizationMode)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                flowVisualizationMode
                  ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-900/40'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {flowVisualizationMode ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-300">Flood Risk Zones</span>
            <button
              type="button"
              onClick={() => setShowRiskZones(!showRiskZones)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all cursor-pointer ${
                showRiskZones
                  ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-900/40'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {showRiskZones ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Basemap Provider Selector */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Basemap Provider
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
            {(['dark', 'satellite', 'streets'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBasemapStyle(mode)}
                className={`py-1 px-1 rounded text-[11px] font-medium capitalize transition-all cursor-pointer ${
                  basemapStyle === mode
                    ? 'bg-cyan-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* GIS Layers */}
        <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
            <Layers className="w-3 h-3 text-cyan-400" />
            GIS Layers
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={showFlood}
                onChange={(e) => setShowFlood(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              <span>Flood Extent</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={showRiver}
                onChange={(e) => setShowRiver(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              <span>River Network</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={showDam}
                onChange={(e) => setShowDam(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              <span>Dam</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={showSettlements}
                onChange={(e) => setShowSettlements(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              <span>Settlements</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={showShelters}
                onChange={(e) => setShowShelters(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              <span>Safe Shelters</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={showSatellite}
                onChange={(e) => setShowSatellite(e.target.checked)}
                className="rounded accent-cyan-500 cursor-pointer"
              />
              <span>Sentinel-1</span>
            </label>
          </div>
        </div>

        {/* Scientific Water Depth Legend */}
        <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>WATER DEPTH</span>
            <span className="font-mono text-cyan-400 text-[9px]">METERS (m)</span>
          </div>
          <div className="grid grid-cols-5 gap-1 rounded-lg bg-slate-950/80 p-1 border border-slate-800/80">
            <div className="text-center py-1 rounded text-[9.5px] font-bold text-slate-900 bg-[#38bdf8]">0–0.5</div>
            <div className="text-center py-1 rounded text-[9.5px] font-bold text-slate-900 bg-[#06b6d4]">0.5–1</div>
            <div className="text-center py-1 rounded text-[9.5px] font-bold text-white bg-[#0284c7]">1–2</div>
            <div className="text-center py-1 rounded text-[9.5px] font-bold text-white bg-[#0369a1]">2–5</div>
            <div className="text-center py-1 rounded text-[9.5px] font-bold text-white bg-[#0c4a6e]">&gt;5m</div>
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-500 px-0.5">
            <span>Shallow</span>
            <span>Critical Depth</span>
          </div>
        </div>
      </div>

      {/* Bottom Floating Control: Simulation Timeline */}
      <div className="absolute bottom-4 left-4 right-4 z-[400] rounded-xl border border-cyan-900/40 bg-[#071827]/95 p-3.5 shadow-2xl backdrop-blur-md pointer-events-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Controls: Play/Pause, Restart, Speed */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded-lg font-bold flex items-center justify-center transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/40'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/40'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              onClick={handleRestart}
              title="Restart Simulation Timeline"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Speed Toggle */}
            <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-lg p-0.5 text-xs">
              {[1, 2, 3].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`px-2 py-0.5 rounded font-mono font-medium cursor-pointer ${
                    playbackSpeed === speed
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Time Scrubber Slider */}
          <div className="flex-1 min-w-[200px] flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-300 font-bold whitespace-nowrap flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              {currentStep ? currentStep.label : 'T+0 min'}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0, timelineSteps.length - 1)}
              step={1}
              value={currentStepIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentStepIndex(Number(e.target.value));
              }}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="text-xs font-mono text-slate-400 whitespace-nowrap">
              {timelineSteps[timelineSteps.length - 1]?.label || 'T+0 min'}
            </span>
          </div>

          {/* Dynamic Scientific Telemetry Readout */}
          {currentStep && (
            <div className="hidden sm:flex items-center gap-4 text-xs font-mono border-l border-slate-800 pl-4">
              <div>
                <span className="text-slate-400">Flood Reach: </span>
                <span className="text-cyan-300 font-bold">{currentStep.front_distance_km} km</span>
              </div>
              <div>
                <span className="text-slate-400">Inundated Area: </span>
                <span className="text-blue-300 font-bold">{currentStep.inundated_area_sqkm} km²</span>
              </div>
              <div>
                <span className="text-slate-400">Max Depth: </span>
                <span className="text-amber-300 font-bold">{currentStep.max_depth_m} m</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
