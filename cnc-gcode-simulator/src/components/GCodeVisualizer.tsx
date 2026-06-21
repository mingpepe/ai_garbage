import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PathSegment, PathPoint } from '../utils/gcodeParser';

interface GCodeVisualizerProps {
  segments: PathSegment[];
  currentSegmentIndex: number;
  progressInSegment: number; // 0 to 1
  toolPos: PathPoint;
  isPlaying: boolean;
  material: 'wood' | 'aluminum' | 'acrylic';
  stockX: number; // Workpiece length
  stockY: number; // Workpiece width
  stockZ: number; // Workpiece height (thickness)
  toolDiameter: number;
  resetTrigger: number; // Increments to force full reset
}

export const GCodeVisualizer: React.FC<GCodeVisualizerProps> = ({
  segments,
  currentSegmentIndex,
  progressInSegment,
  toolPos,
  isPlaying,
  material,
  stockX,
  stockY,
  stockZ,
  toolDiameter,
  resetTrigger
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  // Keep refs of Three.js objects to update them during props changes
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  // Toolpath lines
  const pathLinesGroupRef = useRef<THREE.Group | null>(null);
  
  // Tool head spindle model
  const toolHeadGroupRef = useRef<THREE.Group | null>(null);
  const toolTipLightRef = useRef<THREE.PointLight | null>(null);
  
  // Stock material
  const stockMeshRef = useRef<THREE.Mesh | null>(null);
  const stockBaseMeshRef = useRef<THREE.Mesh | null>(null);
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  
  // Heightmap data
  const GRID_SIZE = 80;
  const heightMapRef = useRef<Float32Array>(new Float32Array(GRID_SIZE * GRID_SIZE));
  const vertexColorsRef = useRef<Float32Array>(new Float32Array(GRID_SIZE * GRID_SIZE * 3));
  
  // Tracks the last index cut to avoid redundant parsing
  const lastProcessedSegmentRef = useRef<number>(-1);
  
  // Particles
  const particlesRef = useRef<{ mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[]>([]);
  const particleGroupRef = useRef<THREE.Group | null>(null);

  // Material Palette (Surface & Cut Colors)
  const getMaterialColors = (mat: 'wood' | 'aluminum' | 'acrylic') => {
    switch (mat) {
      case 'wood':
        return {
          surface: new THREE.Color(0xd7a15c), // Warm yellow-brown
          cut: new THREE.Color(0x7d4f27),     // Dark wood brown
          roughness: 0.8,
          metalness: 0.1,
          opacity: 1.0,
          transparent: false
        };
      case 'aluminum':
        return {
          surface: new THREE.Color(0xd0d5db), // Shiny brushed aluminum
          cut: new THREE.Color(0x6b7280),     // Matte grey cut
          roughness: 0.25,
          metalness: 0.9,
          opacity: 1.0,
          transparent: false
        };
      case 'acrylic':
        return {
          surface: new THREE.Color(0x00e5ff), // Neon cyan translucent acrylic
          cut: new THREE.Color(0x006064),     // Deep cyan-blue interior
          roughness: 0.15,
          metalness: 0.1,
          opacity: 0.6,
          transparent: true
        };
    }
  };

  // 1. Initialize Scene, Camera, Renderer and Orbit Controls
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f111a); // Deep workspace background
    sceneRef.current = scene;
    
    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      1,
      1000
    );
    camera.position.set(90, 80, 110);
    cameraRef.current = camera;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent camera going below floor
    controls.minDistance = 30;
    controls.maxDistance = 300;
    controlsRef.current = controls;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(80, 120, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    const d = 80;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // Subtle blue accent light from underneath machine table
    const pointAccent = new THREE.PointLight(0x0066ff, 0.4, 150);
    pointAccent.position.set(0, -50, 0);
    scene.add(pointAccent);
    
    // Grid Helper (Machine Bed)
    const gridHelper = new THREE.GridHelper(200, 40, 0x3b82f6, 0x1e293b);
    gridHelper.position.y = -stockZ - 2; // Offset grid below workpiece
    scene.add(gridHelper);

    // Machine Bed Base Solid Plate
    const bedGeo = new THREE.BoxGeometry(210, 3, 210);
    const bedMat = new THREE.MeshStandardMaterial({
      color: 0x1e2230,
      roughness: 0.7,
      metalness: 0.4
    });
    const bedMesh = new THREE.Mesh(bedGeo, bedMat);
    bedMesh.position.y = -stockZ - 3.5;
    bedMesh.receiveShadow = true;
    scene.add(bedMesh);
    
    // RGB Axes Helper (Custom arrows)
    const arrowLength = 25;
    const origin = new THREE.Vector3(-95, -stockZ - 1.5, 95);
    
    const axisX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, arrowLength, 0xef4444, 4, 1.5);
    const axisY = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), origin, arrowLength, 0x22c55e, 4, 1.5); // Three.js Y is up, but standard Y in CNC is depth. We render Y depth along -Z in Three coordinates
    const axisZ = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, arrowLength, 0x3b82f6, 4, 1.5); // Three.js Y up is Z CNC up
    scene.add(axisX);
    scene.add(axisY);
    scene.add(axisZ);

    // Text labels for Axes
    // (We render simple visual cues, e.g. arrows are colored: Red=X, Green=Y, Blue=Z)
    
    // Path segments group
    const pathLinesGroup = new THREE.Group();
    scene.add(pathLinesGroup);
    pathLinesGroupRef.current = pathLinesGroup;

    // Spindle / Tool Head Group
    const toolHeadGroup = new THREE.Group();
    scene.add(toolHeadGroup);
    toolHeadGroupRef.current = toolHeadGroup;

    // Spindle Body collet
    const colletGeo = new THREE.CylinderGeometry(6, 4, 18, 16);
    const colletMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.3,
      metalness: 0.8
    });
    const collet = new THREE.Mesh(colletGeo, colletMat);
    collet.position.y = 19; // Raise it up relative to drill tip
    collet.castShadow = true;
    toolHeadGroup.add(collet);

    // Spindle top fan/ring
    const ringGeo = new THREE.CylinderGeometry(7, 7, 3, 16);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 28;
    toolHeadGroup.add(ring);

    // Drill Bit (End mill cutter)
    const cutterGeo = new THREE.CylinderGeometry(1.5, 1.5, 12, 12);
    const cutterMat = new THREE.MeshStandardMaterial({
      color: 0xca8a04, // Brass / Carbide color
      roughness: 0.2,
      metalness: 0.9
    });
    const cutter = new THREE.Mesh(cutterGeo, cutterMat);
    cutter.position.y = 6; // Position relative to drill tip
    cutter.castShadow = true;
    toolHeadGroup.add(cutter);

    // Drill tip cone (drill point)
    const tipGeo = new THREE.ConeGeometry(1.5, 2, 12);
    const tip = new THREE.Mesh(tipGeo, cutterMat);
    tip.position.y = 0; // The bottom-most tip is exactly at the local origin (0, 0, 0)
    tip.rotation.x = Math.PI; // Point downwards
    toolHeadGroup.add(tip);

    // Glowing tool LED spotlight
    const toolTipLight = new THREE.PointLight(0xfffbeb, 0.8, 25);
    toolTipLight.position.set(0, 1, 0);
    toolHeadGroup.add(toolTipLight);
    toolTipLightRef.current = toolTipLight;

    // Particle Group
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);
    particleGroupRef.current = particleGroup;
    
    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      // Update orbit controls
      if (controlsRef.current) controlsRef.current.update();

      // Spin the spindle tool if it is running
      if (isPlaying && toolHeadGroupRef.current) {
        // Spin the collet and cutter around Y-axis
        collet.rotation.y += 0.25;
        cutter.rotation.y += 0.25;
        ring.rotation.y += 0.25;
      }
      
      // Update Particles
      updateParticles();
      
      // Render
      if (rendererRef.current && cameraRef.current && sceneRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();
    
    // Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !renderer || !camera) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    
    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      
      if (rendererRef.current && rendererRef.current.domElement && mountRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      
      // Dispose materials/geometries
      colletGeo.dispose();
      colletMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      cutterGeo.dispose();
      cutterMat.dispose();
      tipGeo.dispose();
      bedGeo.dispose();
      bedMat.dispose();
      
      // Clean scene
      scene.clear();
    };
  }, []);

  // 2. Spawn and update particle shavings
  const spawnParticles = (x: number, y: number, z: number, mat: 'wood' | 'aluminum' | 'acrylic') => {
    if (!sceneRef.current || !particleGroupRef.current) return;
    
    let color = 0xd7a15c; // wood default
    let count = 1;
    let particleSize = 0.35 + Math.random() * 0.4;
    
    if (mat === 'aluminum') {
      color = Math.random() > 0.4 ? 0xffea00 : 0xe0e5eb; // Spark yellow or silver
      count = Math.random() > 0.3 ? 2 : 1;
      particleSize = 0.25 + Math.random() * 0.25;
    } else if (mat === 'acrylic') {
      color = 0x00e5ff; // Cyan plastic chips
      count = 2;
    }
    
    const partGeo = new THREE.BoxGeometry(particleSize, particleSize, particleSize);
    const partMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.95
    });
    
    for (let i = 0; i < count; i++) {
      const pMesh = new THREE.Mesh(partGeo, partMat);
      // Position at cutting tip
      pMesh.position.set(x, z, -y); // Map CNC coordinates: X->X, Y->-Z, Z->Y
      
      // Velocity vector (outward spray with some upward speed)
      const theta = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.5;
      const vx = Math.cos(theta) * speed;
      const vy = 1.0 + Math.random() * 1.8; // Upwards speed in Three coordinates (Y is up)
      const vz = Math.sin(theta) * speed;
      
      particleGroupRef.current.add(pMesh);
      
      particlesRef.current.push({
        mesh: pMesh,
        velocity: new THREE.Vector3(vx, vy, vz),
        life: 1.0 // decays to 0
      });
    }
  };

  const updateParticles = () => {
    if (!particleGroupRef.current) return;
    
    const active = particlesRef.current;
    const remaining: typeof active = [];
    
    for (const p of active) {
      // Apply gravity to Y velocity (Three Y is up)
      p.velocity.y -= 0.08;
      
      // Update position
      p.mesh.position.add(p.velocity);
      
      // Decay life
      p.life -= 0.025;
      
      // Update opacity and size
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life;
      p.mesh.scale.setScalar(p.life);
      
      if (p.life > 0 && p.mesh.position.y > -stockZ - 2) {
        remaining.push(p);
      } else {
        particleGroupRef.current.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach((m) => m.dispose());
        } else {
          p.mesh.material.dispose();
        }
      }
    }
    
    particlesRef.current = remaining;
  };

  // 3. Draw entire G-Code Toolpath in advance (Cyan lines for cutting, Orange dashed for rapids)
  useEffect(() => {
    const scene = sceneRef.current;
    const pathGroup = pathLinesGroupRef.current;
    if (!scene || !pathGroup) return;
    
    // Clear previous path lines
    while (pathGroup.children.length > 0) {
      const obj = pathGroup.children[0];
      pathGroup.remove(obj);
    }
    
    if (segments.length === 0) return;
    
    // Categorize movements into contiguous blocks to compile lines
    // (This saves WebGL draw calls and makes rendering faster)
    segments.forEach((seg) => {
      // Standardize CNC coordinate axis to Three.js coordinates
      // CNC X -> Three X
      // CNC Y -> Three -Z (Front/Back)
      // CNC Z -> Three Y (Up/Down)
      
      if (seg.type === 'rapid') {
        const p1 = new THREE.Vector3(seg.start.x, seg.start.z, -seg.start.y);
        const p2 = new THREE.Vector3(seg.end.x, seg.end.z, -seg.end.y);
        
        const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const mat = new THREE.LineDashedMaterial({
          color: 0xf97316, // Orange
          dashSize: 1.5,
          gapSize: 1.0
        });
        const line = new THREE.Line(geom, mat);
        line.computeLineDistances(); // Required for dashed lines
        pathGroup.add(line);
      } else {
        // Cut segments (could be G1 straight or G2/3 arcs)
        const pts: THREE.Vector3[] = [];
        // Add start point
        pts.push(new THREE.Vector3(seg.start.x, seg.start.z, -seg.start.y));
        // Add intermediate interpolated points
        seg.points.forEach((pt) => {
          pts.push(new THREE.Vector3(pt.x, pt.z, -pt.y));
        });
        
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: 0x06b6d4, // Cyan/Teal
          linewidth: 1.5 // Note: linewidth > 1 usually ignored by WebGL implementations, but standard lines are fine
        });
        const line = new THREE.Line(geom, mat);
        pathGroup.add(line);
      }
    });
  }, [segments, stockZ]);

  // 4. Create Stock Material Block & Heightmap
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    
    // Clear previous stock meshes
    if (stockMeshRef.current) {
      scene.remove(stockMeshRef.current);
      stockMeshRef.current.geometry.dispose();
      if (Array.isArray(stockMeshRef.current.material)) {
        stockMeshRef.current.material.forEach((m) => m.dispose());
      } else {
        stockMeshRef.current.material.dispose();
      }
      stockMeshRef.current = null;
    }
    
    if (stockBaseMeshRef.current) {
      scene.remove(stockBaseMeshRef.current);
      stockBaseMeshRef.current.geometry.dispose();
      if (Array.isArray(stockBaseMeshRef.current.material)) {
        stockBaseMeshRef.current.material.forEach((m) => m.dispose());
      } else {
        stockBaseMeshRef.current.material.dispose();
      }
      stockBaseMeshRef.current = null;
    }
    
    // Define material properties
    const matProps = getMaterialColors(material);
    
    // 4a. Heightmap Plane Geometry representing workpiece top surface
    // X goes from -stockX/2 to stockX/2. Y goes from -stockY/2 to stockY/2 (in Three.js coordinates, this is Z)
    const geometry = new THREE.PlaneGeometry(stockX, stockY, GRID_SIZE - 1, GRID_SIZE - 1);
    // Rotate PlaneGeometry to lie flat on X-Z plane
    geometry.rotateX(-Math.PI / 2);
    
    // Setup arrays
    const posAttr = geometry.attributes.position;
    const vertexCount = posAttr.count;
    
    const heightMap = new Float32Array(vertexCount);
    const colors = new Float32Array(vertexCount * 3);
    
    // Initialize heights and colors
    for (let i = 0; i < vertexCount; i++) {
      heightMap[i] = 0; // Top surface Z = 0
      
      // Set Z height of vertex (which is index 1/Y in Three.js coordinates since we rotated it flat!)
      // Wait, PlaneGeometry coordinates after rotation: Y coordinate is height!
      posAttr.setY(i, 0); 
      
      // Set color attribute to surface color
      colors[i * 3] = matProps.surface.r;
      colors[i * 3 + 1] = matProps.surface.g;
      colors[i * 3 + 2] = matProps.surface.b;
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometryRef.current = geometry;
    
    // Custom Material supporting vertex colors
    const materialMesh = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: matProps.roughness,
      metalness: matProps.metalness,
      transparent: matProps.transparent,
      opacity: matProps.opacity,
      flatShading: false
    });
    
    const stockMesh = new THREE.Mesh(geometry, materialMesh);
    stockMesh.castShadow = true;
    stockMesh.receiveShadow = true;
    scene.add(stockMesh);
    stockMeshRef.current = stockMesh;
    
    // 4b. Stock base solid plate (the backing / bottom box)
    // Renders the solid thickness of the workpiece down to Z = -stockZ
    const baseGeo = new THREE.BoxGeometry(stockX, stockZ, stockY);
    const baseMat = new THREE.MeshStandardMaterial({
      color: matProps.surface.clone().multiplyScalar(0.7), // Slightly darker
      roughness: matProps.roughness + 0.1,
      metalness: matProps.metalness,
      transparent: matProps.transparent,
      opacity: matProps.opacity
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    // Offset Y so its top face is at 0, bottom face is at -stockZ
    baseMesh.position.set(0, -stockZ / 2 - 0.05, 0); 
    baseMesh.receiveShadow = true;
    scene.add(baseMesh);
    stockBaseMeshRef.current = baseMesh;
    
    // Reset arrays refs
    heightMapRef.current = heightMap;
    vertexColorsRef.current = colors;
    lastProcessedSegmentRef.current = -1; // Reset processed tracker
    
  }, [stockX, stockY, stockZ, material, resetTrigger]);

  // 5. Tool Head Position update
  useEffect(() => {
    const head = toolHeadGroupRef.current;
    if (!head) return;
    
    // Map CNC coordinate to Three.js coordinates:
    // CNC X -> Three X
    // CNC Y -> Three -Z
    // CNC Z -> Three Y
    head.position.set(toolPos.x, toolPos.z, -toolPos.y);

    // Turn LED color green if cutting, amber/white if rapid
    const light = toolTipLightRef.current;
    if (light && segments[currentSegmentIndex]) {
      const seg = segments[currentSegmentIndex];
      const isCutting = seg.type === 'cut' && seg.spindleOn && toolPos.z <= 0;
      light.color.setHex(isCutting ? 0x22c55e : 0xffffff);
      light.intensity = isCutting ? 1.5 : 0.8;
      
      // Spawn particles
      if (isCutting && isPlaying && Math.random() > 0.25) {
        spawnParticles(toolPos.x, toolPos.y, toolPos.z, material);
      }
    }
  }, [toolPos, material, isPlaying, currentSegmentIndex, segments]);

  // 6. Heightmap Carving / Material Removal Simulation
  // Performs dynamic intersection checks and updates vertex Z coordinates
  const carveHeightmap = (
    startX: number, startY: number, startZ: number,
    endX: number, endY: number, endZ: number,
    tDiameter: number
  ) => {
    const geom = geometryRef.current;
    const heightMap = heightMapRef.current;
    const colors = vertexColorsRef.current;
    
    if (!geom || !heightMap || !colors) return;
    
    const posAttr = geom.attributes.position;
    const colorAttr = geom.attributes.color;
    const count = posAttr.count;
    
    const matProps = getMaterialColors(material);
    const radius = tDiameter / 2;
    const rSq = radius * radius;
    
    // To carve along a linear path from start to end, we subdivide the segment
    // into discrete steps and check vertex distances.
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Number of division steps along segment
    const steps = Math.max(1, Math.ceil(length / 0.5)); 
    
    let heightUpdated = false;
    
    for (let s = 0; s <= steps; s++) {
      const alpha = s / steps;
      // Interpolated tool position in XY plane (CNC coords)
      const tx = startX + alpha * dx;
      const ty = startY + alpha * dy;
      // Interpolated tool height (CNC Z coords)
      const tz = startZ + alpha * (endZ - startZ);
      
      // If the tool is above the workpiece surface, it cannot cut
      if (tz >= 0) continue;
      
      // Bound check box to speed up search (only check vertices near tool center)
      const xMin = tx - radius;
      const xMax = tx + radius;
      const yMin = ty - radius;
      const yMax = ty + radius;
      
      for (let i = 0; i < count; i++) {
        // Vertex coordinates in Three space:
        // Due to rotateX(-Math.PI/2) flat rotation:
        // Plane x is Three X
        // Plane y is Three Z (which represents CNC -Y)
        // Plane z is Three Y (which represents CNC Z)
        
        const vx = posAttr.getX(i);
        const vy = -posAttr.getZ(i); // Map back to CNC positive Y coordinates
        
        // Quick bounding box filter
        if (vx < xMin || vx > xMax || vy < yMin || vy > yMax) continue;
        
        // Exact distance check
        const distSq = (vx - tx) ** 2 + (vy - ty) ** 2;
        if (distSq <= rSq) {
          const currentHeight = heightMap[i]; // Height relative to Z = 0 (so negative number)
          
          // Cutter cut depth (cannot cut below stock bottom Z = -stockZ)
          const cutDepth = Math.max(-stockZ, tz); 
          
          if (cutDepth < currentHeight) {
            heightMap[i] = cutDepth;
            posAttr.setY(i, cutDepth); // Y is height in Three.js rotated coordinate!
            
            // Set cutting color (darker shade to reveal cut surface texture)
            colors[i * 3] = matProps.cut.r;
            colors[i * 3 + 1] = matProps.cut.g;
            colors[i * 3 + 2] = matProps.cut.b;
            
            heightUpdated = true;
          }
        }
      }
    }
    
    if (heightUpdated) {
      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      geom.computeVertexNormals();
    }
  };

  // 7. Track current simulation pointer and update workpiece carve shape
  useEffect(() => {
    if (segments.length === 0) return;
    
    const geom = geometryRef.current;
    const heightMap = heightMapRef.current;
    const colors = vertexColorsRef.current;
    
    if (!geom || !heightMap || !colors) return;
    
    const matProps = getMaterialColors(material);
    
    // Check if we jumped backwards or did a fresh reset
    if (currentSegmentIndex < lastProcessedSegmentRef.current || lastProcessedSegmentRef.current === -1) {
      // 7a. Full Reset: restore flat surface and initial color attributes
      const posAttr = geom.attributes.position;
      const colorAttr = geom.attributes.color;
      const count = posAttr.count;
      
      for (let i = 0; i < count; i++) {
        heightMap[i] = 0;
        posAttr.setY(i, 0);
        colors[i * 3] = matProps.surface.r;
        colors[i * 3 + 1] = matProps.surface.g;
        colors[i * 3 + 2] = matProps.surface.b;
      }
      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      geom.computeVertexNormals();
      
      lastProcessedSegmentRef.current = -1;
    }
    
    // 7b. Bulk catch-up: carve from lastProcessedSegment+1 up to currentSegmentIndex - 1
    let startIdx = lastProcessedSegmentRef.current + 1;
    for (let idx = startIdx; idx < currentSegmentIndex; idx++) {
      const seg = segments[idx];
      // Only cut if it is a feed cut and the spindle is spinning
      if (seg.type === 'cut' && seg.spindleOn) {
        // Carve entire segment path
        carveHeightmap(
          seg.start.x, seg.start.y, seg.start.z,
          seg.end.x, seg.end.y, seg.end.z,
          toolDiameter
        );
      }
    }
    
    // 7c. Real-time incremental carve for the active segment
    const activeSeg = segments[currentSegmentIndex];
    if (activeSeg && activeSeg.type === 'cut' && activeSeg.spindleOn) {
      // Interpolate start coordinates up to current progressInSegment
      const targetX = activeSeg.start.x + progressInSegment * (activeSeg.end.x - activeSeg.start.x);
      const targetY = activeSeg.start.y + progressInSegment * (activeSeg.end.y - activeSeg.start.y);
      const targetZ = activeSeg.start.z + progressInSegment * (activeSeg.end.z - activeSeg.start.z);
      
      carveHeightmap(
        toolPos.x, toolPos.y, toolPos.z, // Previous visualizer tool position
        targetX, targetY, targetZ,       // Current interpolated tool position
        toolDiameter
      );
    }
    
    // Update marker
    lastProcessedSegmentRef.current = currentSegmentIndex;
    
  }, [segments, currentSegmentIndex, progressInSegment, toolDiameter, stockZ, material]);

  return (
    <div className="visualizer-canvas-container">
      <div ref={mountRef} className="canvas-mount" />
      {/* 3D Viewport Indicators overlay */}
      <div className="viewport-overlay-labels">
        <div className="color-legend">
          <span className="legend-item"><span className="legend-dot rapid" />G00 快速定位 (橘)</span>
          <span className="legend-item"><span className="legend-dot cut" />G01/02/03 切削 (青)</span>
        </div>
        <div className="view-tip">
          滑鼠左鍵旋轉 | 右鍵平移 | 滾輪縮放
        </div>
      </div>
    </div>
  );
};
