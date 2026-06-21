import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  SkipBack,
  Gauge,
  Layers,
  Settings,
  Droplet,
  Zap
} from 'lucide-react';
import { PRESETS } from '../utils/presets';

interface ControlPanelProps {
  // Preset States
  selectedPresetId: string;
  onPresetChange: (presetId: string) => void;
  
  // Playback Controls
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  
  // Speed
  simSpeed: number; // 1 to 10
  onSimSpeedChange: (val: number) => void;
  
  // Material Settings
  material: 'wood' | 'aluminum' | 'acrylic';
  onMaterialChange: (val: 'wood' | 'aluminum' | 'acrylic') => void;
  
  // Dimensions
  stockX: number;
  setStockX: (val: number) => void;
  stockY: number;
  setStockY: (val: number) => void;
  stockZ: number;
  setStockZ: (val: number) => void;
  
  // Cutter
  toolDiameter: number;
  setToolDiameter: (val: number) => void;
  
  // Active Machine Status
  currentX: number;
  currentY: number;
  currentZ: number;
  spindleOn: boolean;
  spindleSpeed: number;
  feedRate: number;
  coolantOn: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  selectedPresetId,
  onPresetChange,
  isPlaying,
  onPlayPause,
  onStop,
  onStepForward,
  onStepBackward,
  simSpeed,
  onSimSpeedChange,
  material,
  onMaterialChange,
  stockX, setStockX,
  stockY, setStockY,
  stockZ, setStockZ,
  toolDiameter, setToolDiameter,
  currentX, currentY, currentZ,
  spindleOn, spindleSpeed, feedRate, coolantOn
}) => {
  return (
    <div className="control-panel-container">
      {/* 1. Presets Selector */}
      <div className="panel-section glass-card">
        <div className="section-title">
          <Layers size={16} className="text-accent" />
          <h4>選擇加工範例 (G-Code Presets)</h4>
        </div>
        <div className="preset-select-wrapper">
          <select
            value={selectedPresetId}
            onChange={(e) => onPresetChange(e.target.value)}
            className="preset-select"
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <p className="preset-desc">
          {PRESETS.find((p) => p.id === selectedPresetId)?.description}
        </p>
      </div>

      {/* 2. Playback Control Panel */}
      <div className="panel-section glass-card">
        <div className="section-title">
          <Gauge size={16} className="text-accent" />
          <h4>模擬控制 (Simulation Controls)</h4>
        </div>
        
        {/* Buttons Grid */}
        <div className="playback-controls">
          <button
            onClick={onStepBackward}
            className="ctrl-btn secondary"
            title="上一步 (Step Backward)"
          >
            <SkipBack size={18} />
          </button>
          
          <button
            onClick={onPlayPause}
            className={`ctrl-btn primary ${isPlaying ? 'playing' : ''}`}
            title={isPlaying ? '暫停 (Pause)' : '播放 (Play)'}
          >
            {isPlaying ? <Pause size={22} /> : <Play size={22} />}
          </button>
          
          <button
            onClick={onStepForward}
            className="ctrl-btn secondary"
            title="下一步 (Step Forward)"
          >
            <SkipForward size={18} />
          </button>
          
          <button
            onClick={onStop}
            className="ctrl-btn danger"
            title="重設模擬 (Reset Stock)"
          >
            <RotateCcw size={18} />
          </button>
        </div>

        {/* Speed Slider */}
        <div className="speed-slider-wrapper">
          <div className="slider-label">
            <span>模擬加速倍率 (Sim Speed)</span>
            <span className="text-accent font-mono font-bold">{simSpeed}x</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            value={simSpeed}
            onChange={(e) => onSimSpeedChange(parseInt(e.target.value))}
            className="speed-range"
          />
        </div>
      </div>

      {/* 3. Machine State HUD */}
      <div className="panel-section glass-card state-hud">
        <div className="section-title">
          <Zap size={16} className="text-accent" />
          <h4>機台當前狀態 (Machine HUD)</h4>
        </div>
        
        {/* Position Coordinate Readout */}
        <div className="coords-display">
          <div className="coord-box">
            <span className="axis-label x">X</span>
            <span className="coord-val">{currentX.toFixed(3)}</span>
          </div>
          <div className="coord-box">
            <span className="axis-label y">Y</span>
            <span className="coord-val">{currentY.toFixed(3)}</span>
          </div>
          <div className="coord-box">
            <span className="axis-label z">Z</span>
            <span className="coord-val">{currentZ.toFixed(3)}</span>
          </div>
        </div>

        {/* State Attributes Grid */}
        <div className="status-attributes">
          <div className={`status-item ${spindleOn ? 'active' : ''}`}>
            <span className="attr-label">主軸旋轉 (Spindle)</span>
            <span className="attr-val">
              {spindleOn ? `${spindleSpeed} RPM` : '已停止'}
            </span>
          </div>
          <div className="status-item font-mono">
            <span className="attr-label">進給速度 (Feedrate)</span>
            <span className="attr-val">{feedRate} mm/min</span>
          </div>
          <div className={`status-item ${coolantOn ? 'active-coolant' : ''}`}>
            <span className="attr-label flex items-center gap-1">
              <Droplet size={12} className={coolantOn ? 'animate-bounce' : ''} />
              切削水 (Coolant)
            </span>
            <span className="attr-val">{coolantOn ? '開啟 (M08)' : '關閉 (M09)'}</span>
          </div>
        </div>
      </div>

      {/* 4. Physical Material & Tool Parameters */}
      <div className="panel-section glass-card">
        <div className="section-title">
          <Settings size={16} className="text-accent" />
          <h4>參數設定 (Material & Tool Settings)</h4>
        </div>

        {/* Material selector */}
        <div className="config-group">
          <label className="config-label">工件材質 (Stock Material)</label>
          <div className="material-options">
            <button
              onClick={() => onMaterialChange('wood')}
              className={`mat-btn wood ${material === 'wood' ? 'selected' : ''}`}
            >
              橡木 (Wood)
            </button>
            <button
              onClick={() => onMaterialChange('aluminum')}
              className={`mat-btn aluminum ${material === 'aluminum' ? 'selected' : ''}`}
            >
              鋁合金 (Alum)
            </button>
            <button
              onClick={() => onMaterialChange('acrylic')}
              className={`mat-btn acrylic ${material === 'acrylic' ? 'selected' : ''}`}
            >
              壓克力 (Acrylic)
            </button>
          </div>
        </div>

        {/* Stock Dimensions */}
        <div className="config-row-group">
          <span className="group-header-label">工件尺寸 (mm)</span>
          <div className="config-row">
            <div className="config-col">
              <label>長度 (X)</label>
              <input
                type="number"
                min="50"
                max="150"
                value={stockX}
                onChange={(e) => setStockX(Math.max(50, parseInt(e.target.value) || 50))}
              />
            </div>
            <div className="config-col">
              <label>寬度 (Y)</label>
              <input
                type="number"
                min="50"
                max="150"
                value={stockY}
                onChange={(e) => setStockY(Math.max(50, parseInt(e.target.value) || 50))}
              />
            </div>
            <div className="config-col">
              <label>厚度 (Z)</label>
              <input
                type="number"
                min="10"
                max="40"
                value={stockZ}
                onChange={(e) => setStockZ(Math.max(10, parseInt(e.target.value) || 10))}
              />
            </div>
          </div>
        </div>

        {/* Tool Diameter */}
        <div className="config-group">
          <div className="slider-label">
            <span>刀具直徑 (Cutter Dia.)</span>
            <span className="text-accent font-bold">{toolDiameter} mm</span>
          </div>
          <input
            type="range"
            min="2"
            max="12"
            step="1"
            value={toolDiameter}
            onChange={(e) => setToolDiameter(parseInt(e.target.value))}
            className="diameter-range"
          />
        </div>
      </div>
    </div>
  );
};
