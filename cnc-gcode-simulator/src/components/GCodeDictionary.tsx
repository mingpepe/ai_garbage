import React, { useState } from 'react';
import { BookOpen, Search, Code, Info } from 'lucide-react';

interface GCodeDoc {
  code: string;
  name: string;
  category: 'motion' | 'setup' | 'mcode';
  description: string;
  parameters: string;
  example: string;
  explanation: string;
}

const DICTIONARY: GCodeDoc[] = [
  {
    code: 'G00',
    name: '快速定位 (Rapid Positioning)',
    category: 'motion',
    description: '以機台的最大速度將刀具快速移動到指定的坐標位置。此指令不進行切削，僅用於快速移動刀具到切削起點或安全位置。',
    parameters: 'X[坐標] Y[坐標] Z[坐標]',
    example: 'G00 X20.0 Y30.0 Z10.0',
    explanation: '將刀具快速移動到 X=20, Y=30, Z=10 的位置，此時主軸通常不接觸工件表面。在模擬器中以橘色虛線標示。'
  },
  {
    code: 'G01',
    name: '直線插補切削 (Linear Interpolation)',
    category: 'motion',
    description: '控制刀具以給定的進給率 (F) 沿直線切削移動到指定的目標坐標位置。這是最常用的切削指令。',
    parameters: 'X[坐標] Y[坐標] Z[坐標] F[進給率(mm/min)]',
    example: 'G01 X50.0 Y0.0 Z-2.0 F1200',
    explanation: '以每分鐘 1200mm 的速度，沿直線切削移動到 X=50, Y=0, Z=-2 的位置。在模擬器中以青色實線標示。'
  },
  {
    code: 'G02',
    name: '順時針圓弧切削 (Clockwise Circular Interpolation)',
    category: 'motion',
    description: '控制刀具以給定的進給率沿順時針圓弧路徑切削移動。圓心可由 X/Y 偏移量 (I/J) 或直接由半徑 (R) 指定。',
    parameters: 'X[終點] Y[終點] Z[終點] I[X圓心偏移] J[Y圓心偏移] 或 R[半徑] F[進給率]',
    example: 'G02 X30.0 Y0.0 I15.0 J0.0 F1000',
    explanation: '以起點為基準，向右偏移 15mm (I15) 的地方為圓心，順時針切削出一個圓弧到目標點 (30, 0)。若加入 Z 軸變化則形成螺旋 (Helical) 加工。'
  },
  {
    code: 'G03',
    name: '逆時針圓弧切削 (Counter-Clockwise Circular Interpolation)',
    category: 'motion',
    description: '控制刀具沿逆時針圓弧路徑進行切削移動。結構與 G02 相同，僅旋轉方向相反。',
    parameters: 'X[終點] Y[終點] Z[終點] I[X圓心偏移] J[Y圓心偏移] 或 R[半徑] F[進給率]',
    example: 'G03 X0.0 Y20.0 R10.0 F800',
    explanation: '逆時針銑削一個半徑為 10mm (R10) 的圓弧到目標點 (0, 20)。'
  },
  {
    code: 'G20',
    name: '英制單位設定 (Imperial Units)',
    category: 'setup',
    description: '將機台的尺寸單位設定為英制（英吋, Inches）。其後輸入的所有座標數值皆會被視為英吋。',
    parameters: '無',
    example: 'G20',
    explanation: '啟用後，X10 表示 10 英吋 (相當於 254 mm)。'
  },
  {
    code: 'G21',
    name: '公制單位設定 (Metric Units)',
    category: 'setup',
    description: '將機台的尺寸單位設定為公制（公釐, Millimeters）。這是大多數 CNC 加工的預設標準。',
    parameters: '無',
    example: 'G21',
    explanation: '啟用後，X10 表示 10 公釐 (10mm)。'
  },
  {
    code: 'G90',
    name: '絕對座標模式 (Absolute Coordinates)',
    category: 'setup',
    description: '設定其後的坐標數值均為相對於「工件原點 (0,0,0)」的絕對位置。這是最常用的座標設定方式。',
    parameters: '無',
    example: 'G90',
    explanation: '若目前在 X10，接著輸入 X30，刀具會移動到絕對位置的 X=30 處（移動距離為 20）。'
  },
  {
    code: 'G91',
    name: '相對座標模式 (Incremental Coordinates)',
    category: 'setup',
    description: '設定其後的坐標數值均為相對於「當前刀具位置」的增量值（移動多少距離）。',
    parameters: '無',
    example: 'G91',
    explanation: '若目前在 X10，接著輸入 X30，刀具會從目前位置再往右移動 30mm，最終到達絕對位置的 X=40 處。'
  },
  {
    code: 'M03',
    name: '主軸正轉啟動 (Spindle ON CW)',
    category: 'mcode',
    description: '開啟 CNC 主軸並使其順時針方向旋轉。通常需搭配主軸轉速 S 指令。',
    parameters: 'S[主軸轉速(RPM)]',
    example: 'M03 S12000',
    explanation: '以 12000 RPM 的轉速啟動雕刻主軸。'
  },
  {
    code: 'M05',
    name: '主軸停止 (Spindle Stop)',
    category: 'mcode',
    description: '關閉主軸旋轉。通常在完成切削、準備換刀或程式結束前使用。',
    parameters: '無',
    example: 'M05',
    explanation: '主軸煞車停止轉動。'
  },
  {
    code: 'M08',
    name: '開啟切削冷卻液 (Coolant ON)',
    category: 'mcode',
    description: '開啟切削液泵浦。冷卻液可帶走切削產生的熱量與鐵屑/木屑，延長刀具壽命並改善表面粗糙度。',
    parameters: '無',
    example: 'M08',
    explanation: '開啟吹氣或噴水冷卻系統。'
  },
  {
    code: 'M09',
    name: '關閉切削冷卻液 (Coolant OFF)',
    category: 'mcode',
    description: '關閉冷卻液系統。',
    parameters: '無',
    example: 'M09',
    explanation: '停止噴灑冷卻液。'
  },
  {
    code: 'M30',
    name: '程式結束並返回首行 (Program End & Rewind)',
    category: 'mcode',
    description: '宣告 G-code 程式結束。機台會停止主軸、關閉冷卻液，並將程式指標倒回第一行，準備下一次執行。',
    parameters: '無',
    example: 'M30',
    explanation: '結束加工流程，重設控制面板狀態。'
  }
];

export const GCodeDictionary: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'motion' | 'setup' | 'mcode'>('all');
  const [selectedCode, setSelectedCode] = useState<GCodeDoc | null>(DICTIONARY[0]);

  const filteredDocs = DICTIONARY.filter(doc => {
    const matchesSearch = 
      doc.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
      doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = activeCategory === 'all' || doc.category === activeCategory;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="dictionary-container glass-card">
      <div className="dictionary-header">
        <div className="title-area">
          <BookOpen className="header-icon text-accent" size={18} />
          <h3>G-Code 語法字典</h3>
        </div>
        <p className="subtitle">了解每一行 CNC 指令背後代表的機台動作</p>
      </div>

      <div className="dictionary-search-bar">
        <div className="search-input-wrapper">
          <Search className="search-icon" size={16} />
          <input
            type="text"
            placeholder="搜尋指令 (例如: G01, M03)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="category-filters">
        <button
          className={`filter-btn ${activeCategory === 'all' ? 'active' : ''}`}
          onClick={() => setActiveCategory('all')}
        >
          全部
        </button>
        <button
          className={`filter-btn ${activeCategory === 'motion' ? 'active' : ''}`}
          onClick={() => setActiveCategory('motion')}
        >
          切削運動 (G0-G3)
        </button>
        <button
          className={`filter-btn ${activeCategory === 'setup' ? 'active' : ''}`}
          onClick={() => setActiveCategory('setup')}
        >
          機台設定 (G90/G21)
        </button>
        <button
          className={`filter-btn ${activeCategory === 'mcode' ? 'active' : ''}`}
          onClick={() => setActiveCategory('mcode')}
        >
          輔助指令 (M碼)
        </button>
      </div>

      <div className="dictionary-body">
        <div className="code-list">
          {filteredDocs.length > 0 ? (
            filteredDocs.map((doc) => (
              <div
                key={doc.code}
                className={`code-item ${selectedCode?.code === doc.code ? 'selected' : ''}`}
                onClick={() => setSelectedCode(doc)}
              >
                <span className={`code-badge ${doc.category}`}>
                  {doc.code}
                </span>
                <span className="code-name">{doc.name.split(' (')[0]}</span>
              </div>
            ))
          ) : (
            <div className="no-results">找不到相符的指令</div>
          )}
        </div>

        <div className="code-details">
          {selectedCode ? (
            <div className="details-card">
              <div className="details-header">
                <span className={`details-badge ${selectedCode.category}`}>
                  {selectedCode.code}
                </span>
                <h4>{selectedCode.name}</h4>
              </div>
              
              <div className="detail-section">
                <div className="section-label">
                  <Info size={14} /> <span>功能說明</span>
                </div>
                <p className="section-desc">{selectedCode.description}</p>
              </div>

              <div className="detail-section">
                <div className="section-label">
                  <Code size={14} /> <span>常用格式</span>
                </div>
                <code className="section-code">{selectedCode.parameters}</code>
              </div>

              <div className="detail-section">
                <div className="section-label">
                  <BookOpen size={14} /> <span>範例示範</span>
                </div>
                <code className="section-code example">{selectedCode.example}</code>
                <p className="example-explanation">{selectedCode.explanation}</p>
              </div>
            </div>
          ) : (
            <div className="select-prompt">
              <Info size={24} className="text-muted" />
              <p>請從左側列表選擇一個指令查看詳細說明</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
