import { useState, useEffect, useMemo, useRef } from 'react';
import { GCodeVisualizer } from './components/GCodeVisualizer';
import { GCodeEditor } from './components/GCodeEditor';
import { ControlPanel } from './components/ControlPanel';
import { GCodeDictionary } from './components/GCodeDictionary';
import { parseGCode } from './utils/gcodeParser';
import { PRESETS } from './utils/presets';
import { Cpu, Wrench } from 'lucide-react';

function App() {
  // Preset Selection
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESETS[0].id);
  const [gcode, setGcode] = useState<string>(PRESETS[0].gcode);

  // Simulation parameters
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<number>(5);
  const [material, setMaterial] = useState<'wood' | 'aluminum' | 'acrylic'>('wood');
  
  // Stock dimensions (mm)
  const [stockX, setStockX] = useState<number>(100);
  const [stockY, setStockY] = useState<number>(100);
  const [stockZ, setStockZ] = useState<number>(20);
  
  // Cutter Settings
  const [toolDiameter, setToolDiameter] = useState<number>(4);
  const [resetTrigger, setResetTrigger] = useState<number>(0);

  // Simulation position pointer
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(0);
  const [progressInSegment, setProgressInSegment] = useState<number>(0);
  const [toolPos, setToolPos] = useState({ x: 0, y: 0, z: 10 });

  // 1. Compile G-Code on text changes
  const parsedResult = useMemo(() => {
    return parseGCode(gcode);
  }, [gcode]);

  // 2. Reset simulator whenever parsed G-code changes
  const resetSimulation = () => {
    setIsPlaying(false);
    setCurrentSegmentIndex(0);
    setProgressInSegment(0);
    
    if (parsedResult.segments.length > 0) {
      setToolPos(parsedResult.segments[0].start);
    } else {
      setToolPos({ x: 0, y: 0, z: 10 });
    }
    
    setResetTrigger(prev => prev + 1);
  };

  useEffect(() => {
    resetSimulation();
  }, [parsedResult]);

  // Handle Preset Changes
  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const p = PRESETS.find(pr => pr.id === presetId);
    if (p) {
      setGcode(p.gcode);
    }
  };

  // 3. Playback Animation Engine (Physics-based Feedrate calculations)
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);

  const advanceSimulation = (dt: number) => {
    const segments = parsedResult.segments;
    if (segments.length === 0 || currentSegmentIndex >= segments.length) {
      setIsPlaying(false);
      return;
    }

    const seg = segments[currentSegmentIndex];
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    const dz = seg.end.z - seg.start.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    let duration = 0.06; // Default short dwell (seconds) for non-movement instructions
    
    if (dist >= 0.001) {
      // Scale G00 rapid feed vs normal G01/G02/G03 cut feedrate
      const feed = seg.type === 'rapid' ? 6000 : seg.feedRate;
      const feedPerSec = feed / 60; // mm/s
      duration = dist / feedPerSec;
    }

    // Animation duration scaled by user's speed slider
    const animDuration = Math.max(0.001, duration / simSpeed);
    const nextProgress = progressInSegment + (dt / animDuration);

    if (nextProgress >= 1) {
      // Segment finished
      if (currentSegmentIndex < segments.length - 1) {
        setCurrentSegmentIndex(prev => prev + 1);
        setProgressInSegment(0);
        setToolPos(segments[currentSegmentIndex + 1].start);
      } else {
        // Complete program finished
        setCurrentSegmentIndex(segments.length);
        setProgressInSegment(1);
        setToolPos(seg.end);
        setIsPlaying(false);
      }
    } else {
      setProgressInSegment(nextProgress);
      
      // Interpolate tool position
      let newPos = { x: 0, y: 0, z: 0 };
      if (seg.points.length === 0) {
        // Linear move
        newPos = {
          x: seg.start.x + nextProgress * dx,
          y: seg.start.y + nextProgress * dy,
          z: seg.start.z + nextProgress * dz
        };
      } else {
        // Arc move interpolation
        const pts = [seg.start, ...seg.points];
        const floatIdx = nextProgress * (pts.length - 1);
        const idx1 = Math.floor(floatIdx);
        const idx2 = Math.min(pts.length - 1, idx1 + 1);
        const alpha = floatIdx - idx1;
        
        newPos = {
          x: pts[idx1].x + alpha * (pts[idx2].x - pts[idx1].x),
          y: pts[idx1].y + alpha * (pts[idx2].y - pts[idx1].y),
          z: pts[idx1].z + alpha * (pts[idx2].z - pts[idx1].z)
        };
      }
      setToolPos(newPos);
    }
  };

  useEffect(() => {
    const tick = (time: number) => {
      if (previousTimeRef.current !== undefined && isPlaying) {
        const deltaTime = (time - previousTimeRef.current) / 1000;
        const dt = Math.min(deltaTime, 0.1); // Prevent tab freeze glitches
        advanceSimulation(dt);
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      previousTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(requestRef.current);
    }

    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, currentSegmentIndex, progressInSegment, simSpeed, parsedResult]);

  // Step Controls
  const handleStepForward = () => {
    setIsPlaying(false);
    const segments = parsedResult.segments;
    if (segments.length === 0) return;

    if (currentSegmentIndex < segments.length - 1) {
      const nextIdx = currentSegmentIndex + 1;
      setCurrentSegmentIndex(nextIdx);
      setProgressInSegment(0);
      setToolPos(segments[nextIdx].start);
    } else if (currentSegmentIndex === segments.length - 1) {
      setCurrentSegmentIndex(segments.length);
      setProgressInSegment(1);
      setToolPos(segments[segments.length - 1].end);
    }
  };

  const handleStepBackward = () => {
    setIsPlaying(false);
    const segments = parsedResult.segments;
    if (segments.length === 0) return;

    if (currentSegmentIndex > 0) {
      const prevIdx = currentSegmentIndex - 1;
      setCurrentSegmentIndex(prevIdx);
      setProgressInSegment(0);
      setToolPos(segments[prevIdx].start);
    } else {
      setCurrentSegmentIndex(0);
      setProgressInSegment(0);
      setToolPos(segments[0].start);
    }
  };

  // Jump tool path to selected line from editor
  const handleSelectLine = (lineIndex: number) => {
    setIsPlaying(false);
    const segmentIdx = parsedResult.segments.findIndex(seg => seg.lineIndex === lineIndex);
    if (segmentIdx !== -1) {
      setCurrentSegmentIndex(segmentIdx);
      setProgressInSegment(0);
      setToolPos(parsedResult.segments[segmentIdx].start);
    }
  };

  // Determine active states for HUD display
  const activeSegment = parsedResult.segments[currentSegmentIndex];
  const activeLineIndex = activeSegment ? activeSegment.lineIndex : (currentSegmentIndex >= parsedResult.segments.length && parsedResult.segments.length > 0 ? parsedResult.segments[parsedResult.segments.length - 1].lineIndex : 0);

  const spindleOn = activeSegment ? activeSegment.spindleOn : false;
  const spindleSpeed = activeSegment ? activeSegment.spindleSpeed : 0;
  const feedRate = activeSegment ? (activeSegment.type === 'rapid' ? 5000 : activeSegment.feedRate) : 0;
  const coolantOn = activeSegment ? activeSegment.coolantOn : false;

  return (
    <div className="flex flex-col min-h-screen">
      {/* 1. Header */}
      <header className="app-header">
        <div className="header-left">
          <h1>
            <Cpu size={24} className="text-accent" />
            CNC G-Code 3D 模擬器
          </h1>
          <p>三維實時刀具切削與材料移除動態 Demo 平台</p>
        </div>
        <div className="header-right">
          <div className="header-badge">
            <Wrench size={14} className="text-accent" />
            <span>刀具直徑: {toolDiameter}mm</span>
          </div>
          <div className="header-badge">
            <span className="glowing-dot" />
            <span>機台狀態: {isPlaying ? '加工切削中' : '暫停中'}</span>
          </div>
        </div>
      </header>

      {/* 2. Main Dashboard Container */}
      <main className="dashboard-grid flex-1">
        {/* Left Column: GCodeEditor */}
        <div className="editor-grid-cell">
          <GCodeEditor
            gcode={gcode}
            onChange={setGcode}
            activeLineIndex={activeLineIndex}
            onSelectLine={handleSelectLine}
            parsedResult={parsedResult}
          />
        </div>

        {/* Right Column Top: 3D Visualizer */}
        <div className="visualizer-grid-cell">
          <GCodeVisualizer
            segments={parsedResult.segments}
            currentSegmentIndex={currentSegmentIndex < parsedResult.segments.length ? currentSegmentIndex : parsedResult.segments.length - 1}
            progressInSegment={progressInSegment}
            toolPos={toolPos}
            isPlaying={isPlaying}
            material={material}
            stockX={stockX}
            stockY={stockY}
            stockZ={stockZ}
            toolDiameter={toolDiameter}
            resetTrigger={resetTrigger}
          />
        </div>

        {/* Right Column Bottom Row: ControlPanel & Dictionary */}
        <div className="lower-panel-row">
          <ControlPanel
            selectedPresetId={selectedPresetId}
            onPresetChange={handlePresetChange}
            isPlaying={isPlaying}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onStop={resetSimulation}
            onStepForward={handleStepForward}
            onStepBackward={handleStepBackward}
            simSpeed={simSpeed}
            onSimSpeedChange={setSimSpeed}
            material={material}
            onMaterialChange={setMaterial}
            stockX={stockX}
            setStockX={setStockX}
            stockY={stockY}
            setStockY={setStockY}
            stockZ={stockZ}
            setStockZ={setStockZ}
            toolDiameter={toolDiameter}
            setToolDiameter={setToolDiameter}
            currentX={toolPos.x}
            currentY={toolPos.y}
            currentZ={toolPos.z}
            spindleOn={spindleOn}
            spindleSpeed={spindleSpeed}
            feedRate={feedRate}
            coolantOn={coolantOn}
          />
          
          <GCodeDictionary />
        </div>
      </main>
    </div>
  );
}

export default App;
