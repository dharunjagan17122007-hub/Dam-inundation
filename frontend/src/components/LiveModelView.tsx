import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Waves,
  Sliders,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Activity,
  Maximize2,
  Columns,
  Gauge,
  HelpCircle,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
  Info
} from 'lucide-react';
import { DamData, SimulationParamsInput } from '../services/api';

interface LiveModelViewProps {
  currentDam: DamData | null;
  onApplyToFullSimulation?: (params: SimulationParamsInput) => void;
  onNavigateToTab?: (tab: string) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  type: 'water' | 'foam' | 'spray';
}

export const LiveModelView: React.FC<LiveModelViewProps> = ({
  currentDam,
  onApplyToFullSimulation,
  onNavigateToTab
}) => {
  // View mode: 'split' | 'prototype' | 'model'
  const [viewMode, setViewMode] = useState<'split' | 'prototype' | 'model'>('split');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showVectors, setShowVectors] = useState<boolean>(true);
  const [showParticles, setShowParticles] = useState<boolean>(true);

  // Live Hydraulic Interactive Parameters (changes update instantly!)
  const [reservoirLevel, setReservoirLevel] = useState<number>(
    currentDam ? currentDam.current_water_level_m : 42.0
  );
  const [gateOpening, setGateOpening] = useState<number>(4.5); // meters of gate lift / breach opening
  const [crestLength, setCrestLength] = useState<number>(
    currentDam ? Math.min(currentDam.crest_length_m, 120) : 65.0
  );
  const [spillwayHeight, setSpillwayHeight] = useState<number>(
    currentDam ? currentDam.height_m : 52.0
  );
  const [inflowRate, setInflowRate] = useState<number>(650); // m³/s
  const [chuteSlopeDeg, setChuteSlopeDeg] = useState<number>(45); // degrees
  const [scaleRatio, setScaleRatio] = useState<number>(50); // 1:50 physical scale

  // Canvas references
  const prototypeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Particle systems for both views
  const prototypeParticlesRef = useRef<Particle[]>([]);
  const modelParticlesRef = useRef<Particle[]>([]);
  const wavePhaseRef = useRef<number>(0);

  // Hydraulic Calculations (Derived live based on physical fluid mechanics)
  // Weir / Gate discharge formulation:
  // Q = C_d * b * sqrt(2g) * H^(3/2) or free surface weir discharge
  const g = 9.81;
  const cd = 0.68;
  const maxDamHeight = currentDam ? currentDam.height_m : 55.0;
  // Head over crest (m)
  const headOverCrest = Math.max(0.2, (reservoirLevel - (maxDamHeight - 12)) + (gateOpening * 0.8));
  // Discharge Q in m³/s (Prototype)
  const dischargePrototype = Math.max(
    50,
    cd * crestLength * Math.sqrt(2 * g) * Math.pow(Math.max(0.1, headOverCrest), 1.5) + (inflowRate * 0.4)
  );

  // Chute velocity v = sqrt(2 * g * (H_fall + headOverCrest))
  const chuteFallM = Math.max(10, spillwayHeight - 6);
  const chuteVelocity = Math.sqrt(2 * g * (chuteFallM + headOverCrest * 0.5)); // m/s
  // Chute water thickness y1 = Q / (b * v)
  const chuteDepthY1 = Math.max(0.15, dischargePrototype / (crestLength * chuteVelocity));

  // Froude number at chute toe Fr1 = v / sqrt(g * y1)
  const froudeNumber1 = chuteVelocity / Math.sqrt(g * chuteDepthY1);

  // Belanger Sequent Depth for Hydraulic Jump:
  // y2 = (y1 / 2) * (sqrt(1 + 8 * Fr1^2) - 1)
  const sequentDepthY2 = (chuteDepthY1 / 2) * (Math.sqrt(1 + 8 * Math.pow(froudeNumber1, 2)) - 1);
  const tailwaterDepth = Math.min(18, Math.max(2.0, sequentDepthY2 * 0.85 + (dischargePrototype / 800)));
  const tailwaterVelocity = dischargePrototype / (crestLength * tailwaterDepth);
  const froudeNumber2 = tailwaterVelocity / Math.sqrt(g * tailwaterDepth);

  // Froude Similitude Laws (Scale Model calculations):
  // Length scale = 1 / lambda
  // Velocity scale = sqrt(1 / lambda)
  // Discharge scale = (1 / lambda)^(2.5)
  const lambda = scaleRatio;
  const scaleLength = 1 / lambda;
  const scaleVelocity = Math.sqrt(scaleLength);
  const scaleDischarge = Math.pow(scaleLength, 2.5);

  const modelDischargeLps = (dischargePrototype * scaleDischarge) * 1000; // Liters per second in lab
  const modelVelocity = chuteVelocity * scaleVelocity; // m/s in lab flume
  const modelHeadCm = (headOverCrest * scaleLength) * 100; // cm in lab
  const modelTailwaterCm = (tailwaterDepth * scaleLength) * 100; // cm in lab

  // Energy dissipation in hydraulic jump:
  // Delta E = (y2 - y1)^3 / (4 * y1 * y2)
  const energyHeadLossM = Math.pow(Math.max(0, sequentDepthY2 - chuteDepthY1), 3) / (4 * chuteDepthY1 * sequentDepthY2);
  const powerDissipatedMW = (1000 * g * dischargePrototype * energyHeadLossM) / 1e6;

  // Preset Configurations
  const applyPreset = (preset: 'normal' | 'monsoon' | 'emergency' | 'overtop' | 'lab') => {
    if (preset === 'normal') {
      setReservoirLevel(maxDamHeight - 8);
      setGateOpening(2.0);
      setInflowRate(300);
      setChuteSlopeDeg(45);
    } else if (preset === 'monsoon') {
      setReservoirLevel(maxDamHeight - 2.5);
      setGateOpening(6.0);
      setInflowRate(1800);
      setChuteSlopeDeg(45);
    } else if (preset === 'emergency') {
      setReservoirLevel(maxDamHeight - 0.5);
      setGateOpening(10.0);
      setInflowRate(3800);
      setChuteSlopeDeg(50);
    } else if (preset === 'overtop') {
      setReservoirLevel(maxDamHeight + 1.8);
      setGateOpening(12.0);
      setInflowRate(5500);
      setChuteSlopeDeg(55);
    } else if (preset === 'lab') {
      setReservoirLevel(maxDamHeight - 4);
      setGateOpening(4.0);
      setInflowRate(800);
      setScaleRatio(50);
    }
  };

  // Canvas Drawing Routine
  const renderPrototype = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Sky & Background Canyon
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.5);
      skyGrad.addColorStop(0, '#0c1b30');
      skyGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Distant Western Ghats Mountain Silhouettes
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(0, height * 0.45);
      ctx.bezierCurveTo(width * 0.25, height * 0.28, width * 0.4, height * 0.4, width * 0.7, height * 0.32);
      ctx.bezierCurveTo(width * 0.85, height * 0.28, width * 0.95, height * 0.38, width, height * 0.35);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Geometry coordinates
      // Reservoir: left (x: 0 to width * 0.32)
      // Dam Wall: x: width * 0.32 to width * 0.44
      // Spillway chute: down to x: width * 0.65, y: height * 0.76
      // Stilling basin: x: width * 0.65 to width * 0.8
      // River downstream: x: width * 0.8 to width
      const resWidth = width * 0.32;
      const crestX = width * 0.38;
      const toeX = width * 0.62;
      const groundY = height * 0.82;
      const damCrestY = height * 0.32;

      // Res Level mapped to Y:
      const minWaterY = damCrestY + 70;
      const maxWaterY = damCrestY - 20;
      const waterNorm = (reservoirLevel - (maxDamHeight - 20)) / 25; // 0 to 1
      const resWaterY = minWaterY - Math.max(0, Math.min(1.2, waterNorm)) * (minWaterY - maxWaterY);

      // 1. Draw Reservoir Water (Behind Dam)
      const resGrad = ctx.createLinearGradient(0, resWaterY, 0, groundY);
      resGrad.addColorStop(0, '#0284c7');
      resGrad.addColorStop(0.4, '#0369a1');
      resGrad.addColorStop(1, '#082f49');
      ctx.fillStyle = resGrad;
      ctx.beginPath();
      ctx.moveTo(0, resWaterY);
      // Gentle surface ripples
      for (let x = 0; x <= resWidth; x += 15) {
        const wave = Math.sin(x * 0.04 + time * 3) * 2;
        ctx.lineTo(x, resWaterY + wave);
      }
      ctx.lineTo(resWidth, groundY);
      ctx.lineTo(0, groundY);
      ctx.closePath();
      ctx.fill();

      // 2. Concrete Dam Structure
      const damGrad = ctx.createLinearGradient(resWidth, damCrestY, toeX, groundY);
      damGrad.addColorStop(0, '#64748b');
      damGrad.addColorStop(0.3, '#475569');
      damGrad.addColorStop(0.8, '#334155');
      damGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = damGrad;
      ctx.beginPath();
      ctx.moveTo(resWidth, groundY);
      ctx.lineTo(resWidth, damCrestY + 12);
      ctx.lineTo(crestX, damCrestY);
      // Ogee spillway curve
      ctx.bezierCurveTo(crestX + 25, damCrestY, toeX - 30, groundY - 25, toeX, groundY - 10);
      ctx.lineTo(toeX + 80, groundY - 10); // Baffle sill
      ctx.lineTo(toeX + 85, groundY);
      ctx.lineTo(width, groundY);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Dam details: Piers & Crest Railing
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(resWidth - 10, damCrestY - 6);
      ctx.lineTo(crestX + 15, damCrestY - 6);
      ctx.stroke();

      // Piers
      for (let px = resWidth; px <= crestX; px += 22) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(px, damCrestY - 16, 6, 16);
      }

      // Gate opening illustration (sluice/radial gate)
      const gateHeightPx = Math.max(2, gateOpening * 3);
      ctx.fillStyle = '#e11d48';
      ctx.fillRect(resWidth + 8, damCrestY + 6 - gateHeightPx, 14, 5);

      // 3. Flow Cascade Down Spillway
      // Calculate depth profile of flow
      const flowDepthPx = Math.max(3, chuteDepthY1 * 4.5);
      const isOvertopping = resWaterY < damCrestY;

      // Cascading water stream
      const cascadeGrad = ctx.createLinearGradient(crestX, damCrestY, toeX, groundY);
      cascadeGrad.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
      cascadeGrad.addColorStop(0.4, 'rgba(14, 165, 233, 0.85)');
      cascadeGrad.addColorStop(0.8, 'rgba(224, 242, 254, 0.95)');
      cascadeGrad.addColorStop(1, '#ffffff');

      ctx.fillStyle = cascadeGrad;
      ctx.beginPath();
      // Flow top surface
      ctx.moveTo(resWidth, isOvertopping ? resWaterY : damCrestY + 6);
      ctx.lineTo(crestX, damCrestY - (isOvertopping ? (damCrestY - resWaterY) : 2));
      ctx.bezierCurveTo(
        crestX + 25,
        damCrestY - flowDepthPx,
        toeX - 30,
        groundY - 25 - flowDepthPx,
        toeX,
        groundY - 10 - flowDepthPx
      );
      // Down to hydraulic jump
      ctx.lineTo(toeX + 45, groundY - tailwaterDepth * 3.5);
      // Downstream water surface with waves
      for (let x = toeX + 45; x <= width; x += 15) {
        const wave = Math.sin((x - toeX) * 0.05 - time * 6) * (dischargePrototype > 2500 ? 5 : 2.5);
        ctx.lineTo(x, groundY - tailwaterDepth * 3.5 + wave);
      }
      ctx.lineTo(width, groundY);
      ctx.lineTo(toeX + 85, groundY);
      ctx.lineTo(toeX, groundY - 10);
      ctx.bezierCurveTo(toeX - 30, groundY - 25, crestX + 25, damCrestY, crestX, damCrestY);
      ctx.lineTo(resWidth, damCrestY + 6);
      ctx.closePath();
      ctx.fill();

      // 4. White-Water Aeration & Hydraulic Jump Churn
      // Supercritical to Subcritical jump zone
      const jumpX = toeX + 15;
      const jumpY = groundY - 10;
      const jumpH = tailwaterDepth * 4.2;

      const foamGrad = ctx.createRadialGradient(jumpX + 20, jumpY - jumpH * 0.5, 5, jumpX + 20, jumpY - jumpH * 0.5, 45);
      foamGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      foamGrad.addColorStop(0.6, 'rgba(224, 242, 254, 0.7)');
      foamGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = foamGrad;
      ctx.beginPath();
      ctx.ellipse(jumpX + 20, jumpY - jumpH * 0.5, 45, jumpH * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      // 5. Dynamic Water Particles (Spillway velocity particles & spray)
      if (showParticles) {
        // Spawn particles
        const spawnCount = Math.min(10, Math.max(2, Math.floor(dischargePrototype / 400)));
        for (let i = 0; i < spawnCount; i++) {
          if (prototypeParticlesRef.current.length < 350) {
            prototypeParticlesRef.current.push({
              x: crestX + Math.random() * 15,
              y: damCrestY + Math.random() * flowDepthPx,
              vx: (chuteVelocity * 0.18) + Math.random() * 2,
              vy: (chuteVelocity * 0.12) + Math.random() * 2,
              size: 2 + Math.random() * 3,
              alpha: 0.8 + Math.random() * 0.2,
              life: 0,
              maxLife: 60 + Math.random() * 40,
              type: Math.random() > 0.4 ? 'water' : 'foam'
            });
          }
        }

        // Jump spray particles
        if (dischargePrototype > 500 && Math.random() > 0.3) {
          for (let s = 0; s < 3; s++) {
            prototypeParticlesRef.current.push({
              x: jumpX + 10 + Math.random() * 25,
              y: jumpY - jumpH * 0.4 - Math.random() * 10,
              vx: 1 + Math.random() * 3,
              vy: -(Math.random() * 4 + 2),
              size: 1.5 + Math.random() * 2.5,
              alpha: 1.0,
              life: 0,
              maxLife: 30 + Math.random() * 20,
              type: 'spray'
            });
          }
        }

        // Update and draw particles
        for (let i = prototypeParticlesRef.current.length - 1; i >= 0; i--) {
          const p = prototypeParticlesRef.current[i];
          p.life++;
          if (p.life >= p.maxLife || p.x > width || p.y > height) {
            prototypeParticlesRef.current.splice(i, 1);
            continue;
          }

          if (p.type === 'spray') {
            p.vy += 0.25; // gravity
            p.x += p.vx;
            p.y += p.vy;
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - p.life / p.maxLife)})`;
          } else {
            // Flow along profile
            if (p.x < toeX) {
              p.vy += 0.18;
              p.x += p.vx;
              p.y += p.vy;
            } else {
              // In stilling basin / downstream
              p.vx = tailwaterVelocity * 0.15 + 1.2;
              p.vy = Math.sin(p.x * 0.05 + time * 5) * 0.5;
              p.x += p.vx;
              p.y = groundY - tailwaterDepth * 2.5 + (Math.random() - 0.5) * 8;
            }
            ctx.fillStyle =
              p.type === 'foam'
                ? `rgba(255, 255, 255, ${p.alpha})`
                : `rgba(186, 230, 253, ${p.alpha * 0.8})`;
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 6. Velocity Vectors (HUD Overlay)
      if (showVectors) {
        ctx.strokeStyle = '#38bdf8';
        ctx.fillStyle = '#38bdf8';
        ctx.lineWidth = 1.5;

        // Vector 1: Approach velocity
        drawArrow(ctx, resWidth - 50, resWaterY + 30, resWidth - 10, resWaterY + 30, 'V₀ ≈ 1.2 m/s');

        // Vector 2: Chute high velocity
        const midChuteX = (crestX + toeX) * 0.5;
        const midChuteY = (damCrestY + groundY) * 0.5;
        drawArrow(
          ctx,
          midChuteX - 25,
          midChuteY - 25,
          midChuteX + 25,
          midChuteY + 25,
          `V₁ = ${chuteVelocity.toFixed(1)} m/s (Fr₁=${froudeNumber1.toFixed(1)})`
        );

        // Vector 3: Downstream tailwater
        drawArrow(
          ctx,
          toeX + 110,
          groundY - tailwaterDepth * 2,
          toeX + 160,
          groundY - tailwaterDepth * 2,
          `V₂ = ${tailwaterVelocity.toFixed(1)} m/s (Fr₂=${froudeNumber2.toFixed(2)})`
        );
      }

      // 7. Labels & Badges on Prototype
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Dam Height: ${spillwayHeight.toFixed(1)} m`, resWidth - 120, damCrestY + 40);
      ctx.fillText(`Reservoir: ${reservoirLevel.toFixed(1)} m`, 20, resWaterY - 12);
      ctx.fillText(`Tailwater: ${tailwaterDepth.toFixed(1)} m`, width - 130, groundY - tailwaterDepth * 3.5 - 12);
    },
    [
      reservoirLevel,
      gateOpening,
      crestLength,
      spillwayHeight,
      inflowRate,
      maxDamHeight,
      dischargePrototype,
      chuteVelocity,
      chuteDepthY1,
      froudeNumber1,
      tailwaterDepth,
      tailwaterVelocity,
      froudeNumber2,
      showParticles,
      showVectors
    ]
  );

  // Render Laboratory Scale Model (Left flume view matching user's photo!)
  const renderModel = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
      ctx.clearRect(0, 0, width, height);

      // Lab Background (Industrial workshop / hydraulic flume laboratory)
      const labGrad = ctx.createLinearGradient(0, 0, 0, height);
      labGrad.addColorStop(0, '#1e293b');
      labGrad.addColorStop(0.5, '#334155');
      labGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = labGrad;
      ctx.fillRect(0, 0, width, height);

      // Laboratory ceiling beams & overhead lights
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 25);
      ctx.lineTo(width, 25);
      ctx.moveTo(0, 45);
      ctx.lineTo(width, 45);
      ctx.stroke();

      // Flume dimensions
      const towerX = width * 0.28;
      const flumeStart = towerX + 30;
      const flumeFloorY = height * 0.78;
      const towerTopY = height * 0.22;

      // 1. Blue Head Tank / Supply Tower (Matching User Photo!)
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(towerX - 60, towerTopY, 70, flumeFloorY - towerTopY);

      // Tower Steel Scaffolding Frame
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      for (let y = towerTopY; y <= flumeFloorY; y += 35) {
        ctx.strokeRect(towerX - 60, y, 70, 35);
        ctx.beginPath();
        ctx.moveTo(towerX - 60, y);
        ctx.lineTo(towerX + 10, y + 35);
        ctx.stroke();
      }

      // Overhead supply pipe (yellow, matching user photo!)
      ctx.fillStyle = '#eab308';
      ctx.fillRect(0, towerTopY + 20, towerX - 60, 16);
      ctx.strokeRect(0, towerTopY + 20, towerX - 60, 16);

      // 2. Clear Acrylic / Glass Flume Channel
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(flumeStart, flumeFloorY - 140, width - flumeStart - 20, 140);

      // Glass Flume Wall Grid (Centimeter measurement markers)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      for (let x = flumeStart; x <= width - 20; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, flumeFloorY - 130);
        ctx.lineTo(x, flumeFloorY);
        ctx.stroke();
      }
      for (let y = flumeFloorY - 130; y <= flumeFloorY; y += 25) {
        ctx.beginPath();
        ctx.moveTo(flumeStart, y);
        ctx.lineTo(width - 20, y);
        ctx.stroke();
      }

      // 3. Sandbag / Riprap Embankments (Matching User Photo!)
      ctx.fillStyle = '#64748b';
      // Left side sandbags along channel
      for (let x = flumeStart + 10; x <= width - 30; x += 22) {
        ctx.beginPath();
        ctx.ellipse(x, flumeFloorY - 5, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.stroke();
      }

      // Miniature Acrylic Model Dam
      const modelDamCrestX = flumeStart + 50;
      const modelToeX = flumeStart + 115;
      const modelDamHeightPx = (spillwayHeight / lambda) * 120;
      const modelCrestY = flumeFloorY - Math.min(100, Math.max(30, modelDamHeightPx));

      ctx.fillStyle = 'rgba(203, 213, 225, 0.85)';
      ctx.beginPath();
      ctx.moveTo(flumeStart, flumeFloorY);
      ctx.lineTo(flumeStart, modelCrestY);
      ctx.lineTo(modelDamCrestX, modelCrestY);
      ctx.bezierCurveTo(modelDamCrestX + 15, modelCrestY, modelToeX - 15, flumeFloorY - 12, modelToeX, flumeFloorY);
      ctx.lineTo(flumeStart, flumeFloorY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.stroke();

      // 4. Model Water Flow (Miniature Cascade)
      const modelDepthPx = Math.max(2, (chuteDepthY1 * 100 * scaleLength) * 1.5);
      const modelTailDepthPx = Math.max(6, (tailwaterDepth * 100 * scaleLength) * 1.8);

      // Cascading miniature stream
      const modelWaterGrad = ctx.createLinearGradient(modelDamCrestX, modelCrestY, modelToeX, flumeFloorY);
      modelWaterGrad.addColorStop(0, '#38bdf8');
      modelWaterGrad.addColorStop(0.7, '#7dd3fc');
      modelWaterGrad.addColorStop(1, '#ffffff');

      ctx.fillStyle = modelWaterGrad;
      ctx.beginPath();
      ctx.moveTo(flumeStart, modelCrestY - modelDepthPx);
      ctx.lineTo(modelDamCrestX, modelCrestY - modelDepthPx);
      ctx.bezierCurveTo(
        modelDamCrestX + 15,
        modelCrestY - modelDepthPx,
        modelToeX - 15,
        flumeFloorY - modelTailDepthPx,
        modelToeX,
        flumeFloorY - modelTailDepthPx
      );
      // Downstream flume surface
      for (let x = modelToeX; x <= width - 20; x += 15) {
        const wave = Math.sin((x - modelToeX) * 0.1 - time * 8) * 1.5;
        ctx.lineTo(x, flumeFloorY - modelTailDepthPx + wave);
      }
      ctx.lineTo(width - 20, flumeFloorY);
      ctx.lineTo(modelToeX, flumeFloorY);
      ctx.closePath();
      ctx.fill();

      // Mini hydraulic jump foam in lab flume
      const miniJumpX = modelToeX + 10;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.ellipse(miniJumpX, flumeFloorY - modelTailDepthPx * 0.6, 18, modelTailDepthPx * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Miniature particles in model flume
      if (showParticles) {
        if (modelParticlesRef.current.length < 120 && Math.random() > 0.3) {
          modelParticlesRef.current.push({
            x: modelDamCrestX,
            y: modelCrestY - Math.random() * modelDepthPx,
            vx: modelVelocity * 0.8 + 1,
            vy: modelVelocity * 0.5 + 1,
            size: 1 + Math.random() * 1.5,
            alpha: 0.9,
            life: 0,
            maxLife: 40,
            type: 'water'
          });
        }

        for (let i = modelParticlesRef.current.length - 1; i >= 0; i--) {
          const mp = modelParticlesRef.current[i];
          mp.life++;
          if (mp.life >= mp.maxLife || mp.x > width - 20) {
            modelParticlesRef.current.splice(i, 1);
            continue;
          }
          if (mp.x < modelToeX) {
            mp.x += mp.vx;
            mp.y += mp.vy;
          } else {
            mp.x += 1.5;
            mp.y = flumeFloorY - modelTailDepthPx * 0.6 + (Math.random() - 0.5) * 3;
          }
          ctx.fillStyle = `rgba(255, 255, 255, ${mp.alpha})`;
          ctx.beginPath();
          ctx.arc(mp.x, mp.y, mp.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Miniature Human Observers / Lab Engineers (matching user photo!)
      drawMiniEngineer(ctx, flumeStart + 25, flumeFloorY, 28);
      drawMiniEngineer(ctx, flumeStart + 45, flumeFloorY, 28);

      // Water Level Point Gauge Needle
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(modelToeX + 70, flumeFloorY - 70);
      ctx.lineTo(modelToeX + 70, flumeFloorY - modelTailDepthPx);
      ctx.stroke();
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(modelToeX + 70, flumeFloorY - 70, 3, 0, Math.PI * 2);
      ctx.fill();

      // Lab Telemetry Overlay
      ctx.font = 'bold 11px JetBrains Mono, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`Scale 1:${lambda}`, flumeStart + 10, flumeFloorY - 145);
      ctx.fillStyle = '#fde047';
      ctx.fillText(`Q_model = ${modelDischargeLps.toFixed(2)} L/s`, flumeStart + 10, flumeFloorY - 128);
      ctx.fillText(`V_model = ${modelVelocity.toFixed(2)} m/s`, flumeStart + 10, flumeFloorY - 112);
      ctx.fillText(`h_tail = ${modelTailwaterCm.toFixed(1)} cm`, modelToeX + 80, flumeFloorY - 55);
    },
    [
      lambda,
      spillwayHeight,
      chuteDepthY1,
      scaleLength,
      tailwaterDepth,
      modelDischargeLps,
      modelVelocity,
      modelTailwaterCm,
      showParticles
    ]
  );

  // Helper: Draw vector arrows
  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    label: string
  ) => {
    const headLen = 8;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#e0f2fe';
    ctx.fillText(label, fromX + 5, fromY - 8);
  };

  // Helper: Draw miniature laboratory engineers in hi-vis jackets (as in photo)
  const drawMiniEngineer = (ctx: CanvasRenderingContext2D, x: number, y: number, height: number) => {
    // Head
    ctx.fillStyle = '#fde047'; // Safety helmet
    ctx.beginPath();
    ctx.arc(x, y - height + 4, 3, 0, Math.PI * 2);
    ctx.fill();
    // Torso (hi-vis vest)
    ctx.fillStyle = '#84cc16';
    ctx.fillRect(x - 3, y - height + 8, 6, 10);
    // Legs
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 3, y - height + 18, 2.5, 10);
    ctx.fillRect(x + 0.5, y - height + 18, 2.5, 10);
  };

  // Continuous Animation Loop (60 FPS)
  useEffect(() => {
    let animId: number;

    const render = () => {
      const time = performance.now() * 0.001;
      wavePhaseRef.current = time;

      // Render Prototype Canvas
      if (prototypeCanvasRef.current) {
        const pCanvas = prototypeCanvasRef.current;
        const ctx = pCanvas.getContext('2d');
        if (ctx) {
          renderPrototype(ctx, pCanvas.width, pCanvas.height, time);
        }
      }

      // Render Laboratory Model Canvas
      if (modelCanvasRef.current) {
        const mCanvas = modelCanvasRef.current;
        const ctx = mCanvas.getContext('2d');
        if (ctx) {
          renderModel(ctx, mCanvas.width, mCanvas.height, time);
        }
      }

      if (isPlaying) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, renderPrototype, renderModel]);

  // Handle Resize of Canvases
  useEffect(() => {
    const resizeCanvases = () => {
      if (prototypeCanvasRef.current) {
        const rect = prototypeCanvasRef.current.parentElement?.getBoundingClientRect();
        if (rect) {
          prototypeCanvasRef.current.width = rect.width;
          prototypeCanvasRef.current.height = Math.max(340, rect.height);
        }
      }
      if (modelCanvasRef.current) {
        const rect = modelCanvasRef.current.parentElement?.getBoundingClientRect();
        if (rect) {
          modelCanvasRef.current.width = rect.width;
          modelCanvasRef.current.height = Math.max(340, rect.height);
        }
      }
    };

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [viewMode]);

  // Propagate Live Parameters to Full Geospatial Inundation Engine
  const handleApplyToEngine = () => {
    if (!currentDam) return;
    const params: SimulationParamsInput = {
      dam_id: currentDam.id,
      model_type: 'Prototype 2D Flood Propagation Engine',
      breach_width_m: crestLength,
      breach_depth_m: Math.min(spillwayHeight, reservoirLevel - (maxDamHeight - spillwayHeight)),
      breach_formation_time_hr: 1.0,
      breach_type: reservoirLevel > maxDamHeight ? 'overtopping' : 'piping',
      initial_reservoir_level_m: reservoirLevel,
      discharge_coefficient: cd,
      mannings_n: 0.035,
      base_river_discharge_cumec: dischargePrototype,
      rainfall_intensity_mmhr: 25.0,
      downstream_flow_direction_deg: 245.0,
      simulation_duration_hr: 2.0,
      time_step_min: 15.0
    };

    if (onApplyToFullSimulation) {
      onApplyToFullSimulation(params);
    }
    if (onNavigateToTab) {
      onNavigateToTab('floodmap');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </span>
            <h1 className="text-base font-bold text-white uppercase tracking-wider">
              Live Hydraulic Simulation Engine: Model vs. Prototype
            </h1>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-400">
              REAL-TIME
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Drag any parameter slider below to see <strong className="text-cyan-300">live hydrodynamic changes</strong> in real-time fluid particles, spillway cascade velocity, and hydraulic jump.
          </p>
        </div>

        {/* View Switchers & Canvas Controls */}
        <div className="flex items-center gap-2.5">
          <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1 rounded font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'split' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              Split Dual View
            </button>
            <button
              onClick={() => setViewMode('prototype')}
              className={`px-3 py-1 rounded font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'prototype' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Prototype Only
            </button>
            <button
              onClick={() => setViewMode('model')}
              className={`px-3 py-1 rounded font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'model' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Scale Model Only
            </button>
          </div>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-2 rounded-lg font-bold transition-all flex items-center justify-center cursor-pointer ${
              isPlaying ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
            title={isPlaying ? 'Pause Simulation' : 'Resume Simulation'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* QUICK PRESETS BAR */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-slate-300 flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-400" />
          Hydraulic Event Presets:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => applyPreset('normal')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
          >
            Normal Controlled Spillway
          </button>
          <button
            onClick={() => applyPreset('monsoon')}
            className="px-2.5 py-1 rounded bg-blue-950 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-800 transition-all cursor-pointer"
          >
            Monsoon High Surcharge
          </button>
          <button
            onClick={() => applyPreset('emergency')}
            className="px-2.5 py-1 rounded bg-amber-950 hover:bg-amber-900 text-amber-300 hover:text-white border border-amber-800 transition-all cursor-pointer font-semibold"
          >
            Full Emergency Release
          </button>
          <button
            onClick={() => applyPreset('overtop')}
            className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-800 transition-all cursor-pointer font-bold animate-pulse"
          >
            Overtopping Failure Breach
          </button>
          <button
            onClick={() => applyPreset('lab')}
            className="px-2.5 py-1 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 hover:text-white border border-cyan-800 transition-all cursor-pointer"
          >
            Laboratory Flume Benchmark
          </button>
        </div>
      </div>

      {/* MAIN SIMULATION DISPLAY: CANVASES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Physical Scale Model (Lab Flume) */}
        {(viewMode === 'split' || viewMode === 'model') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-2`}>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
              {/* Badge matching user photo */}
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white bg-fuchsia-600 shadow-lg shadow-fuchsia-900/50">
                  Model
                </span>
                <span className="text-[11px] font-mono text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                  Physical Scale Flume (1:{lambda})
                </span>
              </div>

              {/* Canvas element */}
              <div className="w-full h-[380px] bg-slate-950 flex items-center justify-center">
                <canvas ref={modelCanvasRef} className="w-full h-full block" />
              </div>

              {/* Sub-footer telemetry */}
              <div className="bg-slate-950/90 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Lab Flume Width: {(crestLength / lambda).toFixed(2)} m</span>
                <span className="text-yellow-400 font-bold">Discharge: {modelDischargeLps.toFixed(2)} L/s</span>
                <span className="text-cyan-400">Velocity: {modelVelocity.toFixed(2)} m/s</span>
              </div>
            </div>
          </div>
        )}

        {/* Right Side: Full-Scale Prototype Dam (Real Mega Structure) */}
        {(viewMode === 'split' || viewMode === 'prototype') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-2`}>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
              {/* Badge matching user photo */}
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white bg-purple-600 shadow-lg shadow-purple-900/50">
                  Prototype
                </span>
                <span className="text-[11px] font-mono text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                  Full-Scale Civil Dam (1:1)
                </span>
              </div>

              {/* Canvas element */}
              <div className="w-full h-[380px] bg-slate-950 flex items-center justify-center">
                <canvas ref={prototypeCanvasRef} className="w-full h-full block" />
              </div>

              {/* Sub-footer telemetry */}
              <div className="bg-slate-950/90 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Spillway Width: {crestLength} m</span>
                <span className="text-cyan-400 font-bold">Discharge Q: {Math.round(dischargePrototype).toLocaleString()} m³/s</span>
                <span className="text-amber-400">Toe Velocity: {chuteVelocity.toFixed(1)} m/s</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* LIVE INTERACTIVE CONTROLS (VALUES CAN BE INCREASED HERE) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sliders Control Panel */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Live Parameter Controls (Instant Reaction)
              </h3>
            </div>
            <button
              onClick={() => applyPreset('normal')}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Values
            </button>
          </div>

          <div className="space-y-4">
            {/* Slider 1: Reservoir Water Level */}
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                  Reservoir Water Level (H)
                </label>
                <span className="font-mono text-cyan-400 font-bold text-sm">
                  {reservoirLevel.toFixed(1)} m{' '}
                  <span className="text-xs text-slate-500 font-normal">
                    (Max: {maxDamHeight}m)
                  </span>
                </span>
              </div>
              <input
                type="range"
                min={maxDamHeight - 20}
                max={maxDamHeight + 3}
                step={0.2}
                value={reservoirLevel}
                onChange={(e) => setReservoirLevel(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>{(maxDamHeight - 20).toFixed(0)}m (Low Storage)</span>
                <span>{(maxDamHeight - 4).toFixed(0)}m (Rule Curve)</span>
                <span className="text-rose-400">{(maxDamHeight + 3).toFixed(0)}m (Overtopping)</span>
              </div>
            </div>

            {/* Slider 2: Spillway Gate Opening / Breach Depth */}
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                  Spillway Gate Opening / Breach Lift
                </label>
                <span className="font-mono text-rose-400 font-bold text-sm">
                  {gateOpening.toFixed(1)} m
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={15.0}
                step={0.5}
                value={gateOpening}
                onChange={(e) => setGateOpening(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0.5m (Trickle Discharge)</span>
                <span>7.5m (Half Open)</span>
                <span>15.0m (Maximum Full Gate Bore)</span>
              </div>
            </div>

            {/* Slider 3: Spillway Crest Width / Breach Width */}
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
                  Spillway Active Crest Width (B)
                </label>
                <span className="font-mono text-yellow-400 font-bold text-sm">
                  {crestLength.toFixed(0)} m
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={200}
                step={5}
                value={crestLength}
                onChange={(e) => setCrestLength(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>15m (1-2 Bay Gate)</span>
                <span>85m (Calibrated Baseline)</span>
                <span>200m (Full Dam Crest)</span>
              </div>
            </div>

            {/* Slider 4: Upstream Catchment Inflow Rate */}
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
                  Upstream Catchment Flood Inflow (Q_in)
                </label>
                <span className="font-mono text-blue-400 font-bold text-sm">
                  {inflowRate.toLocaleString()} m³/s
                </span>
              </div>
              <input
                type="range"
                min={100}
                max={8000}
                step={100}
                value={inflowRate}
                onChange={(e) => setInflowRate(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>100 m³/s (Base Flow)</span>
                <span>2,500 m³/s (10-Yr Monsoon Peak)</span>
                <span className="text-rose-400">8,000 m³/s (PMF Extreme Event)</span>
              </div>
            </div>

            {/* Slider 5: Scale Model Similitude Ratio */}
            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
                  Laboratory Model Scale Ratio (1 : λ)
                </label>
                <span className="font-mono text-purple-400 font-bold text-sm">
                  1 : {scaleRatio}
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={scaleRatio}
                onChange={(e) => setScaleRatio(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>1:20 (Large Flume)</span>
                <span>1:50 (Standard CWPRS / NIH Model)</span>
                <span>1:100 (River Valley Basin Model)</span>
              </div>
            </div>
          </div>

          {/* Action button to sync live parameters with geospatial 2D flood propagation engine */}
          <div className="pt-2">
            <button
              onClick={handleApplyToEngine}
              className="w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              Apply Live Values to 2D Flood Inundation Engine & Map
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>

        {/* Right Side: Real-Time Telemetry & Similitude Analysis */}
        <div className="lg:col-span-5 space-y-5">
          {/* Real-time Calculated Hydraulic Gauges */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Gauge className="w-4 h-4 text-cyan-400" />
                Hydrodynamic Telemetry
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                Live Equations
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Prototype Discharge (Q)</span>
                <span className="text-lg font-bold font-mono text-cyan-400">
                  {Math.round(dischargePrototype).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 ml-1">m³/s</span>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Laboratory Model (Q)</span>
                <span className="text-lg font-bold font-mono text-yellow-400">
                  {modelDischargeLps.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 ml-1">L/s</span>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Chute Toe Velocity (V₁)</span>
                <span className="text-lg font-bold font-mono text-blue-400">
                  {chuteVelocity.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-500 ml-1">m/s</span>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Tailwater Sequent Depth (y₂)</span>
                <span className="text-lg font-bold font-mono text-emerald-400">
                  {tailwaterDepth.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-500 ml-1">m</span>
              </div>
            </div>

            {/* Froude Number Regime Indicator */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-300 font-semibold">Chute Froude Number (Fr₁):</span>
                <span className="text-amber-400 font-bold">{froudeNumber1.toFixed(2)}</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (froudeNumber1 / 8) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>Subcritical (&lt;1)</span>
                <span>Critical (=1)</span>
                <span className="text-rose-400">Supercritical (&gt;1.7)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                {froudeNumber1 > 1.7
                  ? 'High-energy supercritical jet cascading down spillway. A strong hydraulic jump dissipates energy into downstream tailwater.'
                  : 'Low-energy flow regime without turbulent hydraulic jump.'}
              </p>
            </div>

            {/* Power Dissipation in Hydraulic Jump */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block">Stilling Basin Energy Dissipation</span>
                <span className="text-sm font-mono font-bold text-rose-400">
                  {powerDissipatedMW.toFixed(1)} Megawatts (MW)
                </span>
              </div>
              <div className="p-2 rounded-lg bg-rose-950 border border-rose-800 text-rose-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Froude Similitude Laws Comparison Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Columns className="w-4 h-4 text-purple-400" />
              Froude Similitude Laws (Model 1:{scaleRatio} vs Prototype)
            </h4>
            <div className="overflow-x-auto text-[11px]">
              <table className="w-full font-mono text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-1.5 font-semibold">Quantity</th>
                    <th className="pb-1.5 font-semibold">Scaling Law</th>
                    <th className="pb-1.5 font-semibold">Lab Model</th>
                    <th className="pb-1.5 font-semibold">Prototype</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="py-1.5 text-cyan-300">Length (L)</td>
                    <td className="py-1.5 text-slate-400">1 : λ</td>
                    <td className="py-1.5">{(crestLength / lambda).toFixed(2)} m</td>
                    <td className="py-1.5">{crestLength} m</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-cyan-300">Head (H)</td>
                    <td className="py-1.5 text-slate-400">1 : λ</td>
                    <td className="py-1.5">{modelHeadCm.toFixed(1)} cm</td>
                    <td className="py-1.5">{headOverCrest.toFixed(1)} m</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-cyan-300">Velocity (V)</td>
                    <td className="py-1.5 text-slate-400">1 : λ^(1/2)</td>
                    <td className="py-1.5">{modelVelocity.toFixed(2)} m/s</td>
                    <td className="py-1.5">{chuteVelocity.toFixed(1)} m/s</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-cyan-300">Discharge (Q)</td>
                    <td className="py-1.5 text-slate-400">1 : λ^(5/2)</td>
                    <td className="py-1.5 font-bold text-yellow-400">{modelDischargeLps.toFixed(2)} L/s</td>
                    <td className="py-1.5 font-bold text-cyan-400">{Math.round(dischargePrototype).toLocaleString()} m³/s</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
