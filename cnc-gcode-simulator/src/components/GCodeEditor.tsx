import React, { useState, useEffect, useRef } from 'react';
import { Edit3, FileCode, CheckCircle, AlertCircle, Info } from 'lucide-react';
import type { ParserResult } from '../utils/gcodeParser';

interface GCodeEditorProps {
  gcode: string;
  onChange: (newGCode: string) => void;
  activeLineIndex: number;
  onSelectLine: (lineIndex: number) => void;
  parsedResult: ParserResult;
}

export const GCodeEditor: React.FC<GCodeEditorProps> = ({
  gcode,
  onChange,
  activeLineIndex,
  onSelectLine,
  parsedResult
}) => {
  const [activeTab, setActiveTab] = useState<'view' | 'edit'>('view');
  const [editText, setEditText] = useState(gcode);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Update edit text when preset changes externally
  useEffect(() => {
    setEditText(gcode);
  }, [gcode]);

  // Scroll active line into view in simulation mode
  useEffect(() => {
    if (activeTab === 'view' && activeLineIndex >= 0 && lineRefs.current[activeLineIndex]) {
      lineRefs.current[activeLineIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [activeLineIndex, activeTab]);

  const handleApply = () => {
    try {
      if (!editText.trim()) {
        setErrorMsg('G-Code 不能為空！');
        return;
      }
      onChange(editText);
      setErrorMsg(null);
      setActiveTab('view');
    } catch (e: any) {
      setErrorMsg(e.message || '編譯 G-Code 時發生錯誤，請檢查語法。');
    }
  };

  // Helper to format estimated time: (dist / feed) * 60 seconds, etc.
  const getMachiningTime = () => {
    let seconds = 0;
    // Simple calculation: sum of (segment distance / feedrate) in minutes, converted to seconds
    for (const seg of parsedResult.segments) {
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const dz = seg.end.z - seg.start.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      const feed = seg.type === 'rapid' ? 5000 : seg.feedRate; // Assume 5000 mm/min rapid speed
      seconds += (dist / (feed / 60)); // distance / (feed per sec)
      
      // Add a tiny overhead for commands
      seconds += 0.05; 
    }
    
    if (seconds < 60) {
      return `${Math.round(seconds)} 秒`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins} 分 ${secs} 秒`;
  };

  // Generate a friendly explanation of the parsed line on hover
  const getLineTooltip = (lineIdx: number): string => {
    const cmd = parsedResult.commands.find(c => c.lineNum === lineIdx + 1);
    if (!cmd) return '備註 / 空白行';
    
    const parts: string[] = [];
    if (cmd.comment) return `備註: ${cmd.comment}`;
    
    if (cmd.g !== undefined) {
      if (cmd.g === 0) parts.push('G00 快速移動：定位至目標位置');
      else if (cmd.g === 1) parts.push('G01 直線切削：以進給速度進行直线加工');
      else if (cmd.g === 2) parts.push('G02 順時針切削：順時針圓弧切削');
      else if (cmd.g === 3) parts.push('G03 逆時針切削：逆時針圓弧切削');
      else if (cmd.g === 90) parts.push('G90 座標模式：切換至絕對座標');
      else if (cmd.g === 91) parts.push('G91 座標模式：切換至相對座標');
      else if (cmd.g === 21) parts.push('G21 單位設定：公制單位 (mm)');
      else if (cmd.g === 20) parts.push('G20 單位設定：英制單位 (inch)');
    }
    
    if (cmd.m !== undefined) {
      if (cmd.m === 3) parts.push(`M03 主軸啟動：順時針轉速 ${cmd.s || ''} RPM`);
      else if (cmd.m === 5) parts.push('M05 主軸停止：停止刀具旋轉');
      else if (cmd.m === 8) parts.push('M08 開啟冷卻：噴灑切削冷卻液');
      else if (cmd.m === 9) parts.push('M09 關閉冷卻：停止冷卻液');
      else if (cmd.m === 30) parts.push('M30 程式終止：加工結束並返回開頭');
    }
    
    const coords: string[] = [];
    if (cmd.x !== undefined) coords.push(`X=${cmd.x}`);
    if (cmd.y !== undefined) coords.push(`Y=${cmd.y}`);
    if (cmd.z !== undefined) coords.push(`Z=${cmd.z}`);
    
    if (coords.length > 0) {
      parts.push(`目標點 (${coords.join(', ')})`);
    }
    
    if (cmd.f !== undefined) parts.push(`進給速度 F=${cmd.f}`);
    
    return parts.join(' | ') || '設定參數行';
  };

  return (
    <div className="editor-container glass-card">
      <div className="editor-tabs">
        <button
          className={`tab-btn ${activeTab === 'view' ? 'active' : ''}`}
          onClick={() => setActiveTab('view')}
        >
          <FileCode size={16} />
          <span>模擬檢視器</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('edit');
            setEditText(gcode);
          }}
        >
          <Edit3 size={16} />
          <span>代碼編輯器</span>
        </button>
      </div>

      <div className="editor-body">
        {activeTab === 'view' ? (
          <div className="code-viewer-wrapper">
            <div className="code-lines">
              {parsedResult.lines.map((line, idx) => {
                const isActive = idx === activeLineIndex;
                const cmd = parsedResult.commands.find(c => c.lineNum === idx + 1);
                const hasMotion = cmd && (cmd.g === 0 || cmd.g === 1 || cmd.g === 2 || cmd.g === 3);
                
                return (
                  <div
                    key={idx}
                    ref={(el) => { lineRefs.current[idx] = el; }}
                    className={`code-line-row ${isActive ? 'active' : ''} ${hasMotion ? 'motion-line' : ''}`}
                    onClick={() => {
                      if (hasMotion) onSelectLine(idx);
                    }}
                    title={getLineTooltip(idx)}
                  >
                    <span className="line-num">{idx + 1}</span>
                    <span className="line-text">{line || ' '}</span>
                    {isActive && <div className="active-glow-indicator" />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="code-editor-wrapper">
            <textarea
              className="code-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="(在此處輸入你的 G-Code...)"
              spellCheck="false"
            />
            {errorMsg && (
              <div className="editor-error flex items-center gap-2">
                <AlertCircle size={16} className="text-red-500" />
                <span>{errorMsg}</span>
              </div>
            )}
            <button className="apply-btn" onClick={handleApply}>
              <CheckCircle size={16} />
              <span>編譯並套用變更</span>
            </button>
          </div>
        )}
      </div>

      <div className="editor-footer">
        <div className="stats-grid">
          <div className="stat-box">
            <span className="stat-label">預估加工時間</span>
            <span className="stat-value text-accent">{getMachiningTime()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">切削路徑 (G1/2/3)</span>
            <span className="stat-value">{Math.round(parsedResult.totalCutDistance)} mm</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">快速位移 (G0)</span>
            <span className="stat-value">{Math.round(parsedResult.totalRapidDistance)} mm</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">運動指令行數</span>
            <span className="stat-value">{parsedResult.segments.length} 行</span>
          </div>
        </div>
        <div className="tip-box">
          <Info size={12} className="text-accent shrink-0" />
          <span className="tip-text">
            提示：在檢視器中點擊含有 G00/G01 等運動代碼的行數，可以直接讓刀具定位到該加工點。
          </span>
        </div>
      </div>
    </div>
  );
};
