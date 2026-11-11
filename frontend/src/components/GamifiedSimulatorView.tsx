import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  CloudRain,
  Sun,
  Moon,
  Sliders,
  Waves,
  Eye,
  Compass,
  Mountain,
  MapPin
} from 'lucide-react';
import { DamData } from '../services/api';

interface GamifiedSimulatorViewProps {
  currentDam: DamData | null;
  onNavigateToTab?: (tab: string) => void;
}

type CameraMode = 'overview' | 'villagePOV' | 'chaseCam' | 'damCrest' | 'orbit' | 'droneOverhead';
type WeatherMode = 'day' | 'monsoon' | 'nightOps';

interface VillageBuilding {
  mesh: THREE.Mesh;
  roofMesh: THREE.Mesh;
  baseY: number;
  height: number;
  x: number;
  z: number;
  name: string;
}

// CSS2D-style label data for 3D landmark annotations
interface LandmarkLabel {
  name: string;
  type: 'dam' | 'village' | 'bridge' | 'shelter' | 'town';
  position: THREE.Vector3;
  sprite?: THREE.Sprite;
}

export const GamifiedSimulatorView: React.FC<GamifiedSimulatorViewProps> = ({
  currentDam,
  onNavigateToTab
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Simulator State
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [cameraMode, setCameraMode] = useState<CameraMode>('overview');
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('day');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [screenShake, setScreenShake] = useState<boolean>(true);

  // Live Flood Wave Front Progression (From Dam Z=0 to Village Z=160)
  const [flowFrontZ, setFlowFrontZ] = useState<number>(145.0);
  const [isAutoFlowing, setIsAutoFlowing] = useState<boolean>(true);

  // Live Disaster Sliders
  const [reservoirLevel, setReservoirLevel] = useState<number>(49.0);
  const [breachWidth, setBreachWidth] = useState<number>(75.0);
  const [gateOpeningPct, setGateOpeningPct] = useState<number>(85);
  const [simSpeed, setSimSpeed] = useState<number>(1.0);

  // Calculated Real-Time Metrics
  const peakDischarge = Math.round(
    0.65 * breachWidth * Math.sqrt(2 * 9.81) * Math.pow(Math.max(0.5, reservoirLevel - 38), 1.5) * 4.2 +
      (gateOpeningPct / 100) * 1400
  );
  const surgeSpeedKmh = Math.min(48, Math.max(14, 16 + (peakDischarge / 220)));

  // Village Inundation Depth (m)
  const villageWaterDepth =
    flowFrontZ > 105 ? Math.min(6.2, Math.max(0.3, ((flowFrontZ - 105) / 50) * 4.5 + (peakDischarge / 2500))) : 0.0;

  const villageStatus =
    villageWaterDepth >= 4.0
      ? 'CATASTROPHIC INUNDATION'
      : villageWaterDepth >= 2.0
      ? 'SEVERE FLOODING — 1ST FLOOR SUBMERGED'
      : villageWaterDepth > 0.4
      ? 'MODERATE FLOODING — STREETS SUBMERGED'
      : 'DRY / PRE-IMPACT';

  const severityColor =
    villageWaterDepth >= 4.0
      ? 'text-red-400'
      : villageWaterDepth >= 2.0
      ? 'text-amber-400'
      : villageWaterDepth > 0.4
      ? 'text-yellow-400'
      : 'text-emerald-400';

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // 3D Animated Objects
  const riverWaterMeshRef = useRef<THREE.Mesh | null>(null);
  const villageFloodLakeMeshRef = useRef<THREE.Mesh | null>(null);
  const resWaterMeshRef = useRef<THREE.Mesh | null>(null);
  const damLeftRef = useRef<THREE.Mesh | null>(null);
  const damRightRef = useRef<THREE.Mesh | null>(null);
  const breachCascadeMeshRef = useRef<THREE.Mesh | null>(null);
  const waveFrontCrestRef = useRef<THREE.Mesh | null>(null);
  const flowParticlesRef = useRef<THREE.Points | null>(null);
  const rainParticlesRef = useRef<THREE.Points | null>(null);
  const lightningLightRef = useRef<THREE.PointLight | null>(null);
  const villageBuildingsRef = useRef<VillageBuilding[]>([]);
  const landmarkLabelsRef = useRef<LandmarkLabel[]>([]);

  // Orbit controls state
  const mouseStateRef = useRef<{ isDown: boolean; prevX: number; prevY: number; theta: number; phi: number; radius: number }>({
    isDown: false,
    prevX: 0,
    prevY: 0,
    theta: 0.9,
    phi: 0.55,
    radius: 210
  });

  // Sound Engine using Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null);
  const waterGainRef = useRef<GainNode | null>(null);

  // Parametric river centerline function from Dam (z=0) to Village (z=180)
  const getRiverPoint = (z: number) => {
    const x = Math.sin(z * 0.02) * 32;
    const y = -z * 0.11 + 6;
    const width = 22 + Math.max(0, (z - 75) * 0.65);
    return { x, y, z, width };
  };

  // Create text sprite for 3D landmark labels
  const createTextSprite = (text: string, type: string): THREE.Sprite => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 512;
    canvas.height = 128;

    // Background pill shape
    ctx.fillStyle = type === 'dam' ? 'rgba(2, 132, 199, 0.92)' :
                    type === 'bridge' ? 'rgba(245, 158, 11, 0.88)' :
                    type === 'shelter' ? 'rgba(16, 185, 129, 0.88)' :
                    'rgba(15, 23, 42, 0.88)';
    const radius = 20;
    const w = canvas.width, h = canvas.height;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.fill();

    // Border
    ctx.strokeStyle = type === 'dam' ? '#38bdf8' :
                      type === 'bridge' ? '#fbbf24' :
                      type === 'shelter' ? '#34d399' :
                      '#94a3b8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pin icon circle
    ctx.beginPath();
    ctx.arc(50, h / 2, 18, 0, Math.PI * 2);
    ctx.fillStyle = type === 'dam' ? '#0ea5e9' :
                    type === 'bridge' ? '#f59e0b' :
                    type === 'shelter' ? '#10b981' :
                    '#64748b';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('📍', 50, h / 2 + 8);

    // Label text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px -apple-system, BlinkMacSystemFont, Arial';
    ctx.textAlign = 'left';
    ctx.fillText(text, 84, h / 2 + 14);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(30, 7.5, 1);
    return sprite;
  };

  // Initialize Web Audio Engine
  const startAudioEngine = useCallback(() => {
    try {
      if (audioCtxRef.current) return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.96 * b1 + white * 0.1;
        output[i] = (b0 + b1) * 0.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const waterFilter = ctx.createBiquadFilter();
      waterFilter.type = 'lowpass';
      waterFilter.frequency.setValueAtTime(360, ctx.currentTime);

      const waterGain = ctx.createGain();
      waterGain.gain.setValueAtTime(0.15, ctx.currentTime);

      noise.connect(waterFilter);
      waterFilter.connect(waterGain);
      waterGain.connect(ctx.destination);
      noise.start();

      audioCtxRef.current = ctx;
      waterGainRef.current = waterGain;
    } catch (e) {
      console.warn('Audio synthesis failed or autoplay blocked', e);
    }
  }, []);

  const stopAudioEngine = useCallback(() => {
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (e) {}
      audioCtxRef.current = null;
      waterGainRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (soundEnabled) {
      startAudioEngine();
    } else {
      stopAudioEngine();
    }
    return () => {
      stopAudioEngine();
    };
  }, [soundEnabled, startAudioEngine, stopAudioEngine]);

  // Initialize Three.js 3D Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.fog = new THREE.FogExp2(0x0a192f, 0.002);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(52, width / height, 0.5, 2500);
    camera.position.set(130, 95, 80);
    camera.lookAt(0, 10, 80);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. Lighting Engine
    const ambientLight = new THREE.AmbientLight(0x88bbee, 0.55);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
    sunLight.position.set(160, 240, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    scene.add(sunLight);

    // Rim light for depth
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.3);
    rimLight.position.set(-100, 60, -80);
    scene.add(rimLight);

    const lightningLight = new THREE.PointLight(0x60a5fa, 0, 800);
    lightningLight.position.set(-60, 200, 50);
    scene.add(lightningLight);
    lightningLightRef.current = lightningLight;

    // 5. Canyon Terrain with height-based color
    const terrainGeo = new THREE.PlaneGeometry(550, 550, 100, 100);
    terrainGeo.rotateX(-Math.PI / 2);
    const pos = terrainGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const riv = getRiverPoint(z);
      const distFromRiver = Math.abs(x - riv.x);

      let elevation = 0;
      if (z < 0) {
        elevation = distFromRiver < 80 ? -15 : Math.pow((distFromRiver - 80) * 0.4, 1.25);
      } else if (distFromRiver > riv.width * 0.55) {
        const excess = distFromRiver - riv.width * 0.55;
        elevation = riv.y + Math.pow(excess * 0.45, 1.3) + Math.sin(x * 0.05) * 4 + Math.sin(z * 0.03) * 3;
      } else {
        const channelProfile = Math.cos((distFromRiver / (riv.width * 0.55)) * (Math.PI / 2));
        elevation = riv.y - channelProfile * 4.5;
      }

      pos.setY(i, elevation);

      // Height-based vertex coloring (green valleys → brown ridges → grey peaks)
      const h = elevation;
      let r, g, b;
      if (h < -8) {
        // Deep river bed — dark sediment
        r = 0.08; g = 0.12; b = 0.10;
      } else if (h < 0) {
        // Low land — green
        const t = (h + 8) / 8;
        r = 0.08 + t * 0.06; g = 0.20 + t * 0.10; b = 0.06 + t * 0.05;
      } else if (h < 15) {
        // Mid slopes — forest green to brown
        const t = h / 15;
        r = 0.14 + t * 0.18; g = 0.30 - t * 0.10; b = 0.11 - t * 0.04;
      } else if (h < 40) {
        // Higher slopes — brown earth
        const t = (h - 15) / 25;
        r = 0.32 + t * 0.12; g = 0.20 + t * 0.05; b = 0.07 + t * 0.04;
      } else {
        // Ridge peaks — grey rock
        r = 0.44; g = 0.40; b = 0.38;
      }

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.08,
      flatShading: false
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // Tree generation on hillsides
    const treeGeo = new THREE.ConeGeometry(2.2, 6, 6);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9 });
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2817, roughness: 0.9 });

    for (let i = 0; i < 250; i++) {
      const tx = (Math.random() - 0.5) * 400;
      const tz = Math.random() * 200 - 40;
      const riv = getRiverPoint(tz);
      const distFromRiver = Math.abs(tx - riv.x);
      if (distFromRiver < riv.width * 0.7) continue; // don't place trees in river

      let elev = riv.y + Math.pow(Math.max(0, distFromRiver - riv.width * 0.55) * 0.45, 1.3);
      if (elev > 40 || elev < -5) continue;

      const tree = new THREE.Mesh(treeGeo, treeMat.clone());
      (tree.material as THREE.MeshStandardMaterial).color.setHSL(
        0.28 + Math.random() * 0.08,
        0.5 + Math.random() * 0.3,
        0.15 + Math.random() * 0.12
      );
      const s = 0.6 + Math.random() * 0.8;
      tree.scale.set(s, s, s);
      tree.position.set(tx, elev + 2.5 * s, tz);
      tree.castShadow = true;
      scene.add(tree);

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.scale.set(s, s, s);
      trunk.position.set(tx, elev + 0.8 * s, tz);
      scene.add(trunk);
    }

    // 6. Concrete Dam Mega-Structure (At Z = 0)
    const damHeight = 46;
    const damThickness = 28;
    const damGeo = new THREE.BoxGeometry(70, damHeight, damThickness);
    const damMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.55, metalness: 0.25 });

    const damLeft = new THREE.Mesh(damGeo, damMat);
    damLeft.position.set(-50, damHeight * 0.5 - 2, 0);
    damLeft.castShadow = true;
    damLeft.receiveShadow = true;
    scene.add(damLeft);
    damLeftRef.current = damLeft;

    const damRight = new THREE.Mesh(damGeo, damMat);
    damRight.position.set(50, damHeight * 0.5 - 2, 0);
    damRight.castShadow = true;
    damRight.receiveShadow = true;
    scene.add(damRight);
    damRightRef.current = damRight;

    // Dam crest walkway
    const crestGeo = new THREE.BoxGeometry(180, 2, 32);
    const crestMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, roughness: 0.7 });
    const crest = new THREE.Mesh(crestGeo, crestMat);
    crest.position.set(0, damHeight - 1, 0);
    scene.add(crest);

    // Warning strobe lights on dam crest
    const strobeGeo = new THREE.CylinderGeometry(1.0, 1.0, 2.5, 12);
    const strobeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    [-25, 25].forEach(xp => {
      const strobe = new THREE.Mesh(strobeGeo, strobeMat);
      strobe.position.set(xp, damHeight + 2, 0);
      scene.add(strobe);
    });

    // 7. Upstream Reservoir Water Plane (Z < 0)
    const resGeo = new THREE.PlaneGeometry(280, 220, 40, 40);
    resGeo.rotateX(-Math.PI / 2);
    const resWaterMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      roughness: 0.08,
      metalness: 0.85,
      transparent: true,
      opacity: 0.88
    });
    const resWater = new THREE.Mesh(resGeo, resWaterMat);
    resWater.position.set(0, 36, -110);
    scene.add(resWater);
    resWaterMeshRef.current = resWater;

    // 8. Cascading Waterfall / Breach Torrent
    const cascadeGeo = new THREE.PlaneGeometry(40, 52, 20, 20);
    cascadeGeo.rotateX(Math.PI * 0.38);
    const cascadeMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      roughness: 0.12,
      metalness: 0.6,
      transparent: true,
      opacity: 0.94
    });
    const cascadeMesh = new THREE.Mesh(cascadeGeo, cascadeMat);
    cascadeMesh.position.set(0, 18, 14);
    scene.add(cascadeMesh);
    breachCascadeMeshRef.current = cascadeMesh;

    // 9. Continuous Flowing River Water Mesh (Dam Z=0 to Village Z=180)
    const riverSegments = 60;
    const riverGeo = new THREE.PlaneGeometry(30, 180, 8, riverSegments);
    riverGeo.rotateX(-Math.PI / 2);
    const riverWaterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.10,
      metalness: 0.80,
      transparent: true,
      opacity: 0.88
    });
    const riverWaterMesh = new THREE.Mesh(riverGeo, riverWaterMat);
    riverWaterMesh.position.set(0, 0, 0);
    scene.add(riverWaterMesh);
    riverWaterMeshRef.current = riverWaterMesh;

    // 10. Advancing Wave Front Crest
    const waveCrestGeo = new THREE.CylinderGeometry(14, 22, 14, 24, 4, false, 0, Math.PI);
    waveCrestGeo.rotateZ(Math.PI / 2);
    const waveCrestMat = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      roughness: 0.25,
      metalness: 0.35,
      transparent: true,
      opacity: 0.92
    });
    const waveFrontCrest = new THREE.Mesh(waveCrestGeo, waveCrestMat);
    waveFrontCrest.position.set(0, 0, 50);
    scene.add(waveFrontCrest);
    waveFrontCrestRef.current = waveFrontCrest;

    // 11. Village Flood Lake
    const villageLakeGeo = new THREE.PlaneGeometry(160, 110, 30, 30);
    villageLakeGeo.rotateX(-Math.PI / 2);
    const villageLakeMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      roughness: 0.10,
      metalness: 0.75,
      transparent: true,
      opacity: 0.85
    });
    const villageLakeMesh = new THREE.Mesh(villageLakeGeo, villageLakeMat);
    villageLakeMesh.position.set(0, -9.5, 145);
    scene.add(villageLakeMesh);
    villageFloodLakeMeshRef.current = villageLakeMesh;

    // 12. Detailed 3D Village with labeled landmarks
    const houseGeo = new THREE.BoxGeometry(7, 6, 9);
    const roofGeo = new THREE.ConeGeometry(6.5, 4.5, 4);
    roofGeo.rotateY(Math.PI / 4);

    const houseColors = [0xd4c8a8, 0xcfb98a, 0xc7b89a, 0xb8a888, 0xe8dcc4];
    const roofColors = [0x8b4513, 0xa0522d, 0x6b3410];

    const villagePositions = [
      { x: -32, z: 120, name: 'Village 1' },
      { x: -44, z: 135, name: 'Farm Settlement' },
      { x: -28, z: 148, name: 'Village Clinic' },
      { x: -42, z: 162, name: 'Village 2' },
      { x: -26, z: 172, name: 'South Hamlet' },
      { x: 30, z: 122, name: 'East Settlement' },
      { x: 42, z: 136, name: 'Grain Depot' },
      { x: 32, z: 152, name: 'Town Center' },
      { x: 45, z: 165, name: 'Riverside Colony' },
      { x: 26, z: 176, name: 'Village 3' }
    ];

    const buildings: VillageBuilding[] = [];

    villagePositions.forEach((vp, idx) => {
      const hMat = new THREE.MeshStandardMaterial({
        color: houseColors[idx % houseColors.length],
        roughness: 0.75,
        metalness: 0.05
      });
      const rMat = new THREE.MeshStandardMaterial({
        color: roofColors[idx % roofColors.length],
        roughness: 0.6
      });

      const house = new THREE.Mesh(houseGeo, hMat);
      house.position.set(vp.x, -7.0, vp.z);
      house.castShadow = true;
      house.receiveShadow = true;
      scene.add(house);

      const roof = new THREE.Mesh(roofGeo, rMat);
      roof.position.set(vp.x, -2.0, vp.z);
      roof.castShadow = true;
      scene.add(roof);

      buildings.push({
        mesh: house,
        roofMesh: roof,
        baseY: -10.0,
        height: 6.0,
        x: vp.x,
        z: vp.z,
        name: vp.name
      });
    });

    // Clock Tower / Church
    const towerGeo = new THREE.BoxGeometry(9, 22, 9);
    const spireGeo = new THREE.ConeGeometry(7, 10, 4);
    spireGeo.rotateY(Math.PI / 4);

    const towerMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.4 });

    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(-6, -0.5, 145);
    tower.castShadow = true;
    scene.add(tower);

    const spire = new THREE.Mesh(spireGeo, spireMat);
    spire.position.set(-6, 14.5, 145);
    scene.add(spire);

    // Highway Bridge (At Z = 92)
    const bridgeDeckGeo = new THREE.BoxGeometry(80, 2, 8);
    const bridgePillarGeo = new THREE.BoxGeometry(4, 12, 4);
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });
    const bridgeRailMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 });

    const bridgeDeck = new THREE.Mesh(bridgeDeckGeo, bridgeMat);
    bridgeDeck.position.set(0, -2.5, 92);
    bridgeDeck.castShadow = true;
    scene.add(bridgeDeck);

    // Bridge pillars
    [-30, -10, 10, 30].forEach(xp => {
      const pillar = new THREE.Mesh(bridgePillarGeo, bridgeMat);
      pillar.position.set(xp, -8, 92);
      scene.add(pillar);
    });

    // Bridge railing (yellow)
    const railGeo = new THREE.BoxGeometry(80, 1.5, 0.6);
    [-3.5, 3.5].forEach(zoff => {
      const rail = new THREE.Mesh(railGeo, bridgeRailMat);
      rail.position.set(0, -1, 92 + zoff);
      scene.add(rail);
    });

    villageBuildingsRef.current = buildings;

    // 13. 3D Landmark Labels (Like the reference images)
    const landmarks: LandmarkLabel[] = [
      { name: currentDam?.name || 'Dam', type: 'dam', position: new THREE.Vector3(0, damHeight + 12, 0) },
      { name: 'Village 1', type: 'village', position: new THREE.Vector3(-36, 8, 128) },
      { name: 'Village 2', type: 'village', position: new THREE.Vector3(-40, 8, 160) },
      { name: 'Bridge', type: 'bridge', position: new THREE.Vector3(0, 8, 92) },
      { name: 'Town Center', type: 'town', position: new THREE.Vector3(32, 8, 152) },
      { name: 'Village 3', type: 'village', position: new THREE.Vector3(26, 8, 176) },
    ];

    landmarks.forEach(lm => {
      const sprite = createTextSprite(lm.name, lm.type);
      sprite.position.copy(lm.position);
      scene.add(sprite);
      lm.sprite = sprite;
    });
    landmarkLabelsRef.current = landmarks;

    // 14. Flow Particles
    const particleCount = 2200;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const z = Math.random() * 180;
      const riv = getRiverPoint(z);
      pPos[i * 3] = riv.x + (Math.random() - 0.5) * riv.width * 0.8;
      pPos[i * 3 + 1] = riv.y + 0.5 + Math.random() * 1.5;
      pPos[i * 3 + 2] = z;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 2.0,
      transparent: true,
      opacity: 0.8
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);
    flowParticlesRef.current = particles;

    // 15. Rain System
    const rainCount = 1800;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 450;
      rainPos[i * 3 + 1] = Math.random() * 200;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 450;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0x93c5fd, size: 1.2, transparent: true, opacity: 0.5 });
    const rain = new THREE.Points(rainGeo, rainMat);
    scene.add(rain);
    rainParticlesRef.current = rain;

    // Mouse drag handlers for Orbit Camera
    const handleMouseDown = (e: MouseEvent) => {
      mouseStateRef.current.isDown = true;
      mouseStateRef.current.prevX = e.clientX;
      mouseStateRef.current.prevY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseStateRef.current.isDown) return;
      const dx = e.clientX - mouseStateRef.current.prevX;
      const dy = e.clientY - mouseStateRef.current.prevY;
      mouseStateRef.current.prevX = e.clientX;
      mouseStateRef.current.prevY = e.clientY;

      mouseStateRef.current.theta -= dx * 0.007;
      mouseStateRef.current.phi = Math.max(0.12, Math.min(Math.PI * 0.46, mouseStateRef.current.phi - dy * 0.007));
    };

    const handleMouseUp = () => {
      mouseStateRef.current.isDown = false;
    };

    const handleWheel = (e: WheelEvent) => {
      mouseStateRef.current.radius = Math.max(50, Math.min(340, mouseStateRef.current.radius + e.deltaY * 0.18));
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('wheel', handleWheel);

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);

      if (rendererRef.current && rendererRef.current.domElement) {
        container.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);

  // Update Dynamic Dam Breach Walls and Reservoir from Sliders
  useEffect(() => {
    if (damLeftRef.current && damRightRef.current) {
      const halfGap = (breachWidth / 140) * 26 + 6;
      damLeftRef.current.position.x = -35 - halfGap;
      damRightRef.current.position.x = 35 + halfGap;
    }

    if (resWaterMeshRef.current) {
      const targetWaterY = (reservoirLevel / 55) * 42 - 4;
      resWaterMeshRef.current.position.y = targetWaterY;
    }

    if (breachCascadeMeshRef.current) {
      const widthScale = Math.max(0.3, breachWidth / 60);
      breachCascadeMeshRef.current.scale.set(widthScale, 1, 1);
    }
  }, [breachWidth, reservoirLevel]);

  // Update Weather Settings
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (weatherMode === 'day') {
      scene.background = new THREE.Color(0x87ceeb);
      scene.fog = new THREE.FogExp2(0xbae6fd, 0.0015);
      if (rainParticlesRef.current) rainParticlesRef.current.visible = false;
    } else if (weatherMode === 'monsoon') {
      scene.background = new THREE.Color(0x0f172a);
      scene.fog = new THREE.FogExp2(0x0f172a, 0.004);
      if (rainParticlesRef.current) rainParticlesRef.current.visible = true;
    } else if (weatherMode === 'nightOps') {
      scene.background = new THREE.Color(0x0a1628);
      scene.fog = new THREE.FogExp2(0x061522, 0.004);
      if (rainParticlesRef.current) rainParticlesRef.current.visible = false;
    }
  }, [weatherMode]);

  // Main Render Loop: Real-Time Water Flow from Dam to Village
  useEffect(() => {
    let animId = 0;

    const animate = () => {
      const time = performance.now() * 0.001;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;

      if (camera && renderer && scene) {
        // 1. Advance Water Surge Wave Front
        let currentZ = flowFrontZ;
        if (isAutoFlowing && isPlaying) {
          const speedStep = (surgeSpeedKmh * 0.02 * simSpeed);
          currentZ += speedStep;
          if (currentZ > 190) currentZ = 12;
          setFlowFrontZ(currentZ);
        }

        // 2. Screen Shake / Rumble
        let shakeX = 0;
        let shakeY = 0;
        if (screenShake && peakDischarge > 2200) {
          const shakeMag = Math.min(1.2, (peakDischarge / 5000) * 0.8);
          shakeX = (Math.random() - 0.5) * shakeMag;
          shakeY = (Math.random() - 0.5) * shakeMag;
        }

        // 3. Camera Modes
        if (cameraMode === 'overview') {
          camera.position.set(125 + shakeX, 85 + shakeY, 80);
          camera.lookAt(0, 5, 85);
        } else if (cameraMode === 'villagePOV') {
          camera.position.set(-8 + shakeX, -4 + shakeY, 155);
          camera.lookAt(0, 10, 60);
        } else if (cameraMode === 'chaseCam') {
          const riv = getRiverPoint(currentZ);
          camera.position.set(riv.x + shakeX, riv.y + 22 + shakeY, currentZ - 38);
          camera.lookAt(riv.x, riv.y + 2, currentZ + 25);
        } else if (cameraMode === 'damCrest') {
          camera.position.set(-18 + shakeX, 48 + shakeY, 4);
          camera.lookAt(0, 10, 70);
        } else if (cameraMode === 'droneOverhead') {
          camera.position.set(0 + shakeX, 150 + shakeY, currentZ * 0.7);
          camera.lookAt(0, 0, currentZ);
        } else if (cameraMode === 'orbit') {
          const { theta, phi, radius } = mouseStateRef.current;
          camera.position.x = radius * Math.sin(phi) * Math.sin(theta) + shakeX;
          camera.position.y = radius * Math.cos(phi) + 10 + shakeY;
          camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
          camera.lookAt(0, 5, 75);
        }

        // 4. Update Flowing River Mesh
        if (riverWaterMeshRef.current) {
          const geo = riverWaterMeshRef.current.geometry as THREE.PlaneGeometry;
          const pos = geo.attributes.position;
          const segments = 60;

          for (let row = 0; row <= segments; row++) {
            const zNorm = row / segments;
            const z = zNorm * 180;
            const riv = getRiverPoint(z);

            const isWet = z <= currentZ;
            const waterSurfaceY = isWet
              ? riv.y + 1.2 + Math.sin(z * 0.18 - time * 10) * 0.5 + Math.sin(z * 0.05 + time * 3) * 0.3
              : riv.y - 4.0;

            for (let col = 0; col <= 8; col++) {
              const colNorm = (col / 8) - 0.5;
              const vertIdx = row * 9 + col;
              const x = riv.x + colNorm * (isWet ? riv.width : riv.width * 0.6);
              pos.setXYZ(vertIdx, x, waterSurfaceY, z);
            }
          }
          pos.needsUpdate = true;
          geo.computeVertexNormals();
        }

        // 5. Update Wave Front Crest
        if (waveFrontCrestRef.current) {
          const riv = getRiverPoint(currentZ);
          waveFrontCrestRef.current.position.set(riv.x, riv.y + 2.5, currentZ);
          waveFrontCrestRef.current.scale.set(
            (riv.width / 22) * 1.1,
            1 + Math.sin(time * 6) * 0.15,
            1
          );
        }

        // 6. Update Village Inundation Lake
        if (villageFloodLakeMeshRef.current) {
          if (currentZ > 105) {
            villageFloodLakeMeshRef.current.visible = true;
            const lakeY = -10.0 + villageWaterDepth;
            villageFloodLakeMeshRef.current.position.y = lakeY + Math.sin(time * 3) * 0.15;
          } else {
            villageFloodLakeMeshRef.current.visible = false;
          }
        }

        // 7. Animate Flow Particles
        if (flowParticlesRef.current) {
          const pGeo = flowParticlesRef.current.geometry;
          const pos = pGeo.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            let pz = pos.getZ(i);
            pz += (surgeSpeedKmh * 0.035 * simSpeed);
            if (pz > currentZ || pz > 185) {
              pz = Math.random() * 8;
            }

            const riv = getRiverPoint(pz);
            const px = riv.x + (Math.sin(i * 13) * riv.width * 0.42);
            const py = riv.y + 1.2 + Math.sin(i + time * 8) * 0.4;

            pos.setXYZ(i, px, py, pz);
          }
          pos.needsUpdate = true;
        }

        // 8. Rain Particles & Lightning
        if (weatherMode === 'monsoon') {
          if (rainParticlesRef.current) {
            const rPos = rainParticlesRef.current.geometry.attributes.position;
            for (let i = 0; i < rPos.count; i++) {
              let ry = rPos.getY(i) - 4.8 * simSpeed;
              if (ry < -20) ry = 200;
              rPos.setY(i, ry);
            }
            rPos.needsUpdate = true;
          }

          if (lightningLightRef.current) {
            if (Math.random() > 0.985) {
              lightningLightRef.current.intensity = 3.0 + Math.random() * 2.5;
            } else {
              lightningLightRef.current.intensity *= 0.85;
            }
          }
        }

        // Audio modulation
        if (waterGainRef.current && audioCtxRef.current) {
          const vol = Math.min(0.3, Math.max(0.05, (peakDischarge / 5000) * 0.25));
          waterGainRef.current.gain.setValueAtTime(vol, audioCtxRef.current.currentTime);
        }

        renderer.render(scene, camera);
      }

      if (isPlaying) {
        animId = requestAnimationFrame(animate);
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [
    isPlaying,
    isAutoFlowing,
    flowFrontZ,
    cameraMode,
    weatherMode,
    peakDischarge,
    surgeSpeedKmh,
    simSpeed,
    screenShake,
    soundEnabled,
    villageWaterDepth
  ]);

  // Restart Flood Surge from the Dam
  const handleRestartSurge = () => {
    setFlowFrontZ(10.0);
    setIsAutoFlowing(true);
    setIsPlaying(true);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-[#071827] border border-cyan-900/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-cyan-600 to-blue-700 rounded-xl text-white shadow-lg shadow-cyan-950/60">
            <Waves className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white uppercase tracking-wider">
                3D Dam-Break Flood Propagation
              </h1>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded font-bold bg-cyan-950 border border-cyan-700 text-cyan-300">
                REAL-TIME 3D
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Interactive hydrodynamic visualization — dam breach cascade → river surge → village inundation
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRestartSurge}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-950/80 flex items-center gap-2 border border-cyan-400/40 transition-all hover:scale-105 cursor-pointer active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            Release Flood Wave
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-cyan-950 border-cyan-700 text-cyan-300 shadow-lg shadow-cyan-950/50'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title={soundEnabled ? 'Mute Audio' : 'Enable Ambient Audio'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 3D VIEWPORT CONTAINER */}
      <div className="relative w-full h-[620px] rounded-2xl overflow-hidden border border-cyan-900/40 shadow-2xl bg-[#061522]">
        {/* Three.js Canvas Mount */}
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* 1. REAL-TIME INUNDATION STATUS (TOP-LEFT) */}
        <div className="absolute top-4 left-4 z-20 space-y-2 pointer-events-none">
          {/* Impact Status Badge */}
          <div
            className={`backdrop-blur-md border rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-3 transition-colors ${
              villageWaterDepth > 3.0
                ? 'bg-red-950/90 border-red-500/60'
                : villageWaterDepth > 0.5
                ? 'bg-amber-950/90 border-amber-500/60'
                : 'bg-[#071827]/90 border-slate-700/60'
            }`}
          >
            <span
              className={`w-3 h-3 rounded-full ${
                villageWaterDepth > 0.5 ? 'bg-red-500 animate-ping' : 'bg-emerald-400'
              }`}
            />
            <div>
              <span className="text-[9px] uppercase font-mono tracking-widest text-slate-400 block font-semibold">
                SETTLEMENT IMPACT STATUS
              </span>
              <span className={`text-xs font-bold tracking-wider font-mono ${severityColor}`}>
                {villageStatus}
              </span>
            </div>
          </div>

          {/* Telemetry Panel */}
          <div className="bg-[#071827]/90 backdrop-blur-md border border-slate-800/80 rounded-xl p-3 shadow-xl space-y-1.5 text-xs font-mono text-slate-200 min-w-[230px]">
            <div className="flex justify-between items-center pb-1 border-b border-slate-800">
              <span className="text-slate-400">WATER DEPTH:</span>
              <span className={`font-bold ${severityColor}`}>
                {villageWaterDepth.toFixed(1)} m
              </span>
            </div>
            <div className="flex justify-between items-center pb-1 border-b border-slate-800">
              <span className="text-slate-400">FLOOD WAVEFRONT:</span>
              <span className="text-cyan-300 font-bold">
                {flowFrontZ.toFixed(0)}m / 160m
              </span>
            </div>
            <div className="flex justify-between items-center pb-1 border-b border-slate-800">
              <span className="text-slate-400">BREACH DISCHARGE:</span>
              <span className="text-cyan-300 font-bold">
                {peakDischarge.toLocaleString()} m³/s
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">FLOOD VELOCITY:</span>
              <span className="text-amber-300 font-bold">
                {surgeSpeedKmh.toFixed(1)} km/h
              </span>
            </div>
          </div>
        </div>

        {/* 2. FLOOD WAVEFRONT SCRUBBER (TOP-CENTER) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#071827]/92 backdrop-blur-md border border-cyan-800/50 rounded-xl px-5 py-2.5 shadow-2xl flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-cyan-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              FLOOD WAVEFRONT:
            </span>
            <span className="font-mono text-white font-bold">{flowFrontZ.toFixed(0)}m</span>
          </div>

          <div className="w-44 flex items-center gap-2">
            <span className="text-[9px] font-mono text-slate-500">DAM</span>
            <input
              type="range"
              min={10}
              max={180}
              step={1}
              value={flowFrontZ}
              onChange={(e) => {
                setIsAutoFlowing(false);
                setFlowFrontZ(parseFloat(e.target.value));
              }}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span className="text-[9px] font-mono text-red-400 font-bold">VILLAGE</span>
          </div>

          <button
            onClick={() => setIsAutoFlowing(!isAutoFlowing)}
            className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[10px] transition-all cursor-pointer ${
              isAutoFlowing ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {isAutoFlowing ? 'Auto-Flowing' : 'Manual'}
          </button>
        </div>

        {/* 3. CAMERA SELECTOR (BOTTOM-LEFT) */}
        <div className="absolute bottom-4 left-4 z-20 bg-[#071827]/92 backdrop-blur-md border border-slate-800/80 rounded-xl p-2 shadow-2xl flex items-center gap-1 text-xs">
          <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 px-1.5 font-semibold">
            VIEW:
          </span>
          {[
            { id: 'overview', label: 'Overview', icon: '🌐' },
            { id: 'villagePOV', label: 'Village', icon: '🏘️' },
            { id: 'chaseCam', label: 'Wave Chase', icon: '🌊' },
            { id: 'damCrest', label: 'Dam Crest', icon: '🏗️' },
            { id: 'droneOverhead', label: 'Drone', icon: '🛸' },
            { id: 'orbit', label: 'Free Orbit', icon: '🔄' },
          ].map(cam => (
            <button
              key={cam.id}
              onClick={() => setCameraMode(cam.id as CameraMode)}
              className={`px-2 py-1.5 rounded-lg font-medium transition-all cursor-pointer text-[11px] flex items-center gap-1 ${
                cameraMode === cam.id
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>{cam.icon}</span>
              <span className="hidden sm:inline">{cam.label}</span>
            </button>
          ))}
        </div>

        {/* 4. WEATHER & EFFECTS (BOTTOM-RIGHT) */}
        <div className="absolute bottom-4 right-4 z-20 bg-[#071827]/92 backdrop-blur-md border border-slate-800/80 rounded-xl p-2 shadow-2xl flex items-center gap-2 text-xs">
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setWeatherMode('day')}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                weatherMode === 'day' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Clear Day"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setWeatherMode('monsoon')}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                weatherMode === 'monsoon' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Monsoon Storm"
            >
              <CloudRain className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setWeatherMode('nightOps')}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                weatherMode === 'nightOps' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Night / Low-Light"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => setScreenShake(!screenShake)}
            className={`px-2 py-1.5 rounded-lg font-mono font-medium text-[10px] transition-all cursor-pointer ${
              screenShake ? 'bg-cyan-950 border border-cyan-800 text-cyan-300' : 'bg-slate-900 text-slate-500'
            }`}
          >
            Rumble: {screenShake ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* 5. INTERACTIVE BREACH PARAMETER SLIDERS */}
      <div className="bg-[#071827] border border-cyan-900/40 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Sliders className="w-4.5 h-4.5 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Real-Time Dam Breach Parameters
            </h3>
          </div>
          <button
            onClick={() => {
              setReservoirLevel(44.0);
              setBreachWidth(45.0);
              setGateOpeningPct(40);
              setFlowFrontZ(10.0);
            }}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Slider 1: Reservoir Water Level */}
          <div className="bg-[#0B1F2A] p-3.5 rounded-xl border border-slate-800/60 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                Reservoir Water Elevation
              </label>
              <span className="font-mono text-cyan-400 font-bold text-sm">
                {reservoirLevel.toFixed(1)} m
              </span>
            </div>
            <input
              type="range"
              min={38.0}
              max={55.0}
              step={0.5}
              value={reservoirLevel}
              onChange={(e) => setReservoirLevel(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>38m (Safe)</span>
              <span>48m (Surcharge)</span>
              <span className="text-rose-400 font-bold">55m (Overtopping)</span>
            </div>
          </div>

          {/* Slider 2: Dam Breach Width */}
          <div className="bg-[#0B1F2A] p-3.5 rounded-xl border border-slate-800/60 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                Dam Breach Gap Width
              </label>
              <span className="font-mono text-rose-400 font-bold text-sm">
                {breachWidth.toFixed(0)} m
              </span>
            </div>
            <input
              type="range"
              min={10.0}
              max={140.0}
              step={5.0}
              value={breachWidth}
              onChange={(e) => setBreachWidth(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-400"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>10m (Small)</span>
              <span>65m (Severe)</span>
              <span className="text-rose-400 font-bold">140m (Total Collapse)</span>
            </div>
          </div>

          {/* Slider 3: Spillway Gate Opening */}
          <div className="bg-[#0B1F2A] p-3.5 rounded-xl border border-slate-800/60 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Spillway Gates Opened
              </label>
              <span className="font-mono text-amber-400 font-bold text-sm">
                {gateOpeningPct}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={gateOpeningPct}
              onChange={(e) => setGateOpeningPct(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>0% (Closed)</span>
              <span>50% (Half)</span>
              <span className="text-amber-400 font-bold">100% (Max Release)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
