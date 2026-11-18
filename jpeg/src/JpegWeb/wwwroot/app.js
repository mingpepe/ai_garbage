(() => {
  'use strict';

  const ZIGZAG_TO_RASTER = [
     0,  1,  8, 16,  9,  2,  3, 10,
    17, 24, 32, 25, 18, 11,  4,  5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13,  6,  7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63
  ];

  const PICO8_PALETTE = [
    '#000000', '#1d2b53', '#7e2553', '#008751',
    '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
    '#ff004d', '#ffa300', '#ffec27', '#00e436',
    '#29adff', '#83769c', '#ff77a8', '#ffccaa'
  ];

  const ENC_STAGE_NAMES = [
    '01. RGB BYTES -> YCbCr',
    '02. LEVEL SHIFT (-128)',
    '03. 2D FDCT (ROW/COL)',
    '04. QUANTIZATION',
    '05. ZIG-ZAG SCAN',
    '06. DPCM / RLE / VLI',
    '07. HUFFMAN + BIT PACK',
    '08. JFIF & STUFFING'
  ];

  const DEC_STAGE_NAMES = [
    '01. MARKERS & DHT',
    '02. BYTE DESTUFFING',
    '03. HUFFMAN + VLI DEC',
    '04. RLE + DC PRED',
    '05. ZIG-ZAG UNSCAN',
    '06. DEQUANTIZATION',
    '07. 2D IDCT + 128',
    '08. YCbCr -> RGB BYTES'
  ];

  const state = {
    presets: [],
    srcWidth: 8,
    srcHeight: 8,
    srcRgb: new Uint8Array(8 * 8 * 3),
    decRgb: new Uint8Array(8 * 8 * 3),
    decWidth: 8,
    decHeight: 8,
    jpegBytes: new Uint8Array(0),
    encodeData: null,
    decodeData: null,
    activeTab: 'encode',
    selectedComp: 'Y',
    selectedBlockIdx: 0,
    encStageFilter: -1, // -1 = ALL
    decStageFilter: -1,
    encAutoTimer: null,
    decAutoTimer: null,
    byteSource: 'encode',
    selectedByteOffset: 0,
    highlightBlockBytes: true,
    paintMode: false,
    paintColorHex: '#ff004d',
    isDrawing: false,
    verilogModules: [],
    activeVerilogModule: null,
    lastStuffCursor: -1,
    decodeOnlyMode: false
  };

  // DOM helpers
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const b64ToBytes = (b64) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  const bytesToB64 = (bytes) => {
    let bin = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  };

  const hex2 = (n) => (n & 0xFF).toString(16).toUpperCase().padStart(2, '0');
  const hex4 = (n) => (n >>> 0).toString(16).toUpperCase().padStart(4, '0');
  const bin8 = (n) => (n & 0xFF).toString(2).padStart(8, '0');

  function drawRgbToCanvas(canvas, rgb, w, h) {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0, p = 0; i < w * h; i++, p += 3) {
      const q = i * 4;
      img.data[q] = rgb[p];
      img.data[q + 1] = rgb[p + 1];
      img.data[q + 2] = rgb[p + 2];
      img.data[q + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function drawGridOverlay() {
    const grid = $('gridCanvas');
    const w = state.srcWidth;
    const h = state.srcHeight;
    // Scale overlay logically to keep 1px sharp grid lines on screen
    const scale = Math.max(1, Math.floor(280 / Math.max(w, h)));
    grid.width = w * scale;
    grid.height = h * scale;
    const ctx = grid.getContext('2d');
    ctx.clearRect(0, 0, grid.width, grid.height);

    const trace = state.decodeOnlyMode ? state.decodeData?.decodeTrace : state.encodeData?.encodeTrace;
    const is420 = trace?.subsampling === '4:2:0';
    const step = is420 ? 16 : 8;

    // Subtle 8x8 block grid
    ctx.strokeStyle = 'rgba(41, 173, 255, 0.35)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x * scale + 0.5, 0);
      ctx.lineTo(x * scale + 0.5, h * scale);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale + 0.5);
      ctx.lineTo(w * scale, y * scale + 0.5);
      ctx.stroke();
    }

    if (is420) {
      ctx.strokeStyle = 'rgba(255, 163, 0, 0.55)';
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x * scale + 0.5, 0);
        ctx.lineTo(x * scale + 0.5, h * scale);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y * scale + 0.5);
        ctx.lineTo(w * scale, y * scale + 0.5);
        ctx.stroke();
      }
    }

    // Highlight active selected block
    const blk = getActiveBlock('encode') || getActiveBlock('decode');
    if (blk) {
      const bw = (is420 && blk.component !== 'Y') ? 16 : 8;
      ctx.strokeStyle = '#ffec27';
      ctx.lineWidth = 2;
      ctx.strokeRect(blk.originX * scale + 1, blk.originY * scale + 1, bw * scale - 2, bw * scale - 2);
    }
  }

  function getActiveTrace(which) {
    if (which === 'encode') return state.encodeData?.encodeTrace || null;
    return state.decodeOnlyMode ? (state.decodeData?.decodeTrace || null) : (state.encodeData?.decodeTrace || null);
  }

  function getActiveBlock(which) {
    const trace = getActiveTrace(which);
    if (!trace || !trace.blocks?.length) return null;
    const idx = Math.max(0, Math.min(state.selectedBlockIdx, trace.blocks.length - 1));
    return trace.blocks[idx];
  }

  // API Calls
  async function loadPresets() {
    const res = await fetch('/api/presets');
    state.presets = await res.json();
    const sel = $('presetSelect');
    sel.innerHTML = '';
    for (const p of state.presets) {
      const opt = el('option', '', `${p.name} (${p.width}x${p.height})`);
      opt.value = p.id;
      sel.appendChild(opt);
    }
    selectPreset(state.presets[0].id);
  }

  async function selectPreset(id) {
    const p = state.presets.find((x) => x.id === id);
    if (!p) return;
    state.decodeOnlyMode = false;
    state.srcWidth = p.width;
    state.srcHeight = p.height;
    state.srcRgb = b64ToBytes(p.rgbBase64);
    state.selectedBlockIdx = 0;
    await runEncode();
  }

  async function runEncode() {
    state.decodeOnlyMode = false;
    const quality = parseInt($('qualityRange').value, 10);
    const subsampling = $('subsamplingSelect').value;
    const fixedPoint = $('mathModeSelect').value === 'fixed';

    const res = await fetch('/api/encode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        width: state.srcWidth,
        height: state.srcHeight,
        rgbBase64: bytesToB64(state.srcRgb),
        quality,
        subsampling,
        fixedPoint
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Encode failed');
      return;
    }

    state.encodeData = data;
    state.jpegBytes = b64ToBytes(data.jpegBase64);
    state.decRgb = b64ToBytes(data.reconstructedRgbBase64);
    state.decWidth = state.srcWidth;
    state.decHeight = state.srcHeight;

    syncAfterCodecUpdate();
  }

  async function runDecodeFile(jpegBytes) {
    const fixedPoint = $('mathModeSelect').value === 'fixed';
    const res = await fetch('/api/decode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jpegBase64: bytesToB64(jpegBytes),
        fixedPoint
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Decode failed');
      return;
    }

    state.decodeOnlyMode = true;
    state.decodeData = data;
    state.jpegBytes = jpegBytes;
    state.decRgb = b64ToBytes(data.rgbBase64);
    state.decWidth = data.decodeTrace.width;
    state.decHeight = data.decodeTrace.height;
    state.srcWidth = state.decWidth;
    state.srcHeight = state.decHeight;
    state.srcRgb = state.decRgb;
    state.selectedBlockIdx = 0;
    state.byteSource = 'decode';

    switchTab('decode');
    syncAfterCodecUpdate();
  }

  function syncAfterCodecUpdate() {
    drawRgbToCanvas($('srcCanvas'), state.srcRgb, state.srcWidth, state.srcHeight);
    drawRgbToCanvas($('decCanvas'), state.decRgb, state.decWidth, state.decHeight);
    $('srcDimsLabel').textContent = state.decodeOnlyMode ? '(JPG)' : `${state.srcWidth}x${state.srcHeight}`;
    $('decDimsLabel').textContent = `${state.decWidth}x${state.decHeight}`;

    populateBlockSelector();
    drawGridOverlay();
    renderMetrics();
    renderEncodeStages();
    renderDecodeStages();
    renderByteMap();
  }

  function populateBlockSelector() {
    const trace = getActiveTrace(state.decodeOnlyMode ? 'decode' : 'encode');
    const sel = $('blockSelect');
    sel.innerHTML = '';
    if (!trace || !trace.blocks.length) return;

    if (state.selectedBlockIdx >= trace.blocks.length) state.selectedBlockIdx = 0;
    $('blockCountLabel').textContent = `${trace.blocks.length} BLKS`;

    for (const b of trace.blocks) {
      const opt = el('option', '', `#${b.blockIndex} [MCU ${b.mcuIndex}] ${b.component} (${b.originX},${b.originY})`);
      opt.value = b.blockIndex;
      sel.appendChild(opt);
    }
    sel.value = String(state.selectedBlockIdx);

    const active = trace.blocks[state.selectedBlockIdx];
    document.querySelectorAll('#compPills .px-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.comp === active.component);
    });

    const meta = $('activeBlockMeta');
    meta.innerHTML = '';
    const items = [
      ['MCU INDEX', `#${active.mcuIndex} (r=${active.mcuRow},c=${active.mcuCol})`],
      ['COMPONENT', active.component],
      ['ORIGIN PX', `(${active.originX}, ${active.originY})`],
      ['SCAN BYTES', `0x${hex4(active.entropyByteStart)}..0x${hex4(active.entropyByteEnd)}`]
    ];
    for (const [k, v] of items) {
      const c = el('div', 'kv-cell');
      c.appendChild(el('div', 'kv-label', k));
      c.appendChild(el('div', 'kv-val', v));
      meta.appendChild(c);
    }
  }

  function renderMetrics() {
    const grid = $('metricsGrid');
    grid.innerHTML = '';
    let items = [];
    if (state.decodeOnlyMode && state.decodeData) {
      const dt = state.decodeData.decodeTrace;
      items = [
        ['JPEG SIZE', `${state.decodeData.jpegByteCount} B`],
        ['DECODED RGB', `${state.decodeData.rawRgbByteCount} B`],
        ['CHROMA', dt.subsampling],
        ['ENTROPY BITS', `${dt.totalEntropyBits} b`],
        ['DESTUFF FF00', `${dt.destuffEvents.length}`],
        ['SCAN RANGE', `0x${hex4(dt.scanStartOffset)}..0x${hex4(dt.scanEndOffset)}`]
      ];
    } else if (state.encodeData) {
      const e = state.encodeData;
      const et = e.encodeTrace;
      const ratio = (e.rawRgbByteCount / e.jpegByteCount).toFixed(2);
      items = [
        ['RAW RGB', `${e.rawRgbByteCount} B`],
        ['JPEG FILE', `${e.jpegByteCount} B (${ratio}x)`],
        ['HEADERS', `${et.headerByteCount} B`],
        ['ENTROPY', `${et.entropyByteCount} B (${et.totalEntropyBits}b)`],
        ['PSNR', e.psnr >= 900 ? 'INF (0 MSE)' : `${e.psnr} dB`],
        ['STUFFED 00', `${et.stuffedZeroCount} bytes`]
      ];
    }
    for (const [k, v] of items) {
      const c = el('div', 'kv-cell');
      c.appendChild(el('div', 'kv-label', k));
      c.appendChild(el('div', 'kv-val', v));
      grid.appendChild(c);
    }
  }

  // Matrix Builder Helper
  function buildMatrix8x8(title, values, opts = {}) {
    const box = el('div', 'matrix-box');
    box.appendChild(el('div', 'matrix-title', title));
    const grid = el('div', 'grid-8x8');
    const formulaLine = el('div', 'matrix-hover-formula mono', opts.defaultInfo || 'HOVER CELL FOR EXACT INDEX & FORMULA');

    let maxAbs = 1;
    for (const v of values) maxAbs = Math.max(maxAbs, Math.abs(v));

    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8);
      const c = i % 8;
      const v = values[i];
      const cell = el('div', `mcell${i === 0 && opts.markDc ? ' dc-cell' : ''}`);

      if (opts.heatmap) {
        const norm = Math.min(1, Math.abs(v) / maxAbs);
        if (v >= 0) cell.style.background = `rgba(41, 173, 255, ${(0.08 + norm * 0.45).toFixed(2)})`;
        else cell.style.background = `rgba(255, 0, 77, ${(0.08 + norm * 0.45).toFixed(2)})`;
      } else if (opts.grayscale) {
        const lum = Math.max(0, Math.min(255, Math.round(v)));
        cell.style.background = `rgb(${lum},${lum},${lum})`;
        cell.style.color = lum > 140 ? '#000' : '#fff';
      }

      const txt = opts.decimals !== undefined ? Number(v).toFixed(opts.decimals) : String(v);
      cell.appendChild(el('span', '', txt));
      if (opts.subValues) {
        cell.appendChild(el('span', 'mcell-sub', opts.subValues[i]));
      }

      cell.addEventListener('mouseenter', () => {
        if (opts.cellFormula) formulaLine.textContent = opts.cellFormula(i, r, c, v);
      });
      grid.appendChild(cell);
    }

    box.appendChild(grid);
    if (opts.cellFormula) box.appendChild(formulaLine);
    return box;
  }

  // Render Encoder 8 Stages
  function renderEncodeStages() {
    const container = $('encodeStagesContainer');
    container.innerHTML = '';

    const pills = $('encStagePills');
    pills.innerHTML = '';
    ENC_STAGE_NAMES.forEach((name, idx) => {
      const p = el('button', `stage-pill${state.encStageFilter === idx ? ' active' : ''}`, name);
      p.addEventListener('click', () => {
        state.encStageFilter = idx;
        $('encShowAllBtn').classList.remove('active');
        renderEncodeStages();
      });
      pills.appendChild(p);
    });

    if (state.decodeOnlyMode || !state.encodeData) {
      container.appendChild(el('div', 'pixel-box stage-card', 'Loaded external .JPG in Decode-Only mode. Select a preset or upload a source image to trace Encoder stages.'));
      return;
    }

    const et = state.encodeData.encodeTrace;
    const blk = getActiveBlock('encode');
    if (!blk) return;

    const show = (idx) => state.encStageFilter === -1 || state.encStageFilter === idx;

    // Stage 1: Raw RGB Bytes -> YCbCr
    if (show(0)) {
      const card = makeStageCard(1, 'RAW INPUT RGB BYTES -> YCbCr COLOR CONVERSION',
        et.fixedPoint
          ? 'Y=(77R+150G+29B+128)>>8 | Cb=((-43R-85G+128B+128)>>8)+128 | Cr=((128R-107G-21B+128)>>8)+128'
          : 'Y=0.299R+0.587G+0.114B | Cb=-0.1687R-0.3313G+0.5B+128 | Cr=0.5R-0.4187G-0.0813B+128');

      const wrap = el('div', 'px-table-wrap');
      const tbl = el('table', 'px-table');
      tbl.innerHTML = `<thead><tr>
        <th>IDX</th><th>PIXEL (X,Y)</th><th>RAW BYTE OFFSETS</th><th>INPUT RGB (HEX / DEC)</th>
        <th>COLOR</th><th>OUTPUT Y (HEX/DEC)</th><th>OUTPUT Cb</th><th>OUTPUT Cr</th><th>USED (${blk.component})</th>
      </tr></thead>`;
      const tbody = el('tbody');
      for (let i = 0; i < blk.pixels.length; i++) {
        const px = blk.pixels[i];
        const tr = el('tr');
        const offStr = px.isEdgePadded ? 'PADDED' : `${px.inputByteOffset}..${px.inputByteOffset + 2}`;
        tr.innerHTML = `
          <td>${i}</td>
          <td>(${px.x}, ${px.y})${px.isEdgePadded ? ' <span class="badge badge-amber">PAD</span>' : ''}</td>
          <td>${offStr}</td>
          <td><span class="bits-huff">${hex2(px.r)} ${hex2(px.g)} ${hex2(px.b)}</span> (${px.r},${px.g},${px.b})</td>
          <td><span class="color-swatch-inline" style="background:rgb(${px.r},${px.g},${px.b})"></span></td>
          <td>0x${hex2(px.yVal)} (${px.yVal})</td>
          <td>0x${hex2(px.cbVal)} (${px.cbVal})</td>
          <td>0x${hex2(px.crVal)} (${px.crVal})</td>
          <td><b>0x${hex2(blk.rawChannel64[i])}</b> (${blk.rawChannel64[i]})</td>`;
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      card.appendChild(wrap);

      container.appendChild(card);
    }

    // Stage 2: Level Shift (-128)
    if (show(1)) {
      const card = makeStageCard(2, `8x8 BLOCK PARTITION & LEVEL SHIFT (-128) [${blk.component}]`,
        'f(y,x) = ChannelByte(y,x) - 128  ->  Range [-128 .. +127]');
      const row = el('div', 'matrix-row');
      row.appendChild(buildMatrix8x8(`UNSIGNED ${blk.component} BYTES [0..255]`, blk.rawChannel64, {
        grayscale: true,
        cellFormula: (i, r, c, v) => `(${r},${c}) Raw Byte = 0x${hex2(v)} (${v})`
      }));
      row.appendChild(buildMatrix8x8(`LEVEL-SHIFTED [-128..127]`, blk.shifted64, {
        heatmap: true,
        cellFormula: (i, r, c, v) => `(${r},${c}) ${blk.rawChannel64[i]} - 128 = ${v}`
      }));
      card.appendChild(row);
      container.appendChild(card);
    }

    // Stage 3: 2D FDCT
    if (show(2)) {
      const card = makeStageCard(3, 'SEPARABLE 2D FDCT (1D ROW DCT -> 1D COL DCT)',
        'F(v,u) = 1/4 * C(u)C(v) * sum_x sum_y f(y,x) cos((2x+1)u*pi/16) cos((2y+1)v*pi/16)');
      const row = el('div', 'matrix-row');
      row.appendChild(buildMatrix8x8('STAGE 3A: 1D ROW DCT', blk.rowDct64, {
        heatmap: true, decimals: 1,
        cellFormula: (i, r, c, v) => `RowDCT[r=${r}, u=${c}] = ${v.toFixed(2)}`
      }));
      row.appendChild(buildMatrix8x8('STAGE 3B: 2D FDCT COEFFS', blk.dctFloat64, {
        heatmap: true, decimals: 1, markDc: true,
        cellFormula: (i, r, c, v) => `F[v=${r}, u=${c}] = ${v.toFixed(2)} (rounded=${blk.dctRounded64[i]})`
      }));
      card.appendChild(row);
      container.appendChild(card);
    }

    // Stage 4: Quantization
    if (show(3)) {
      const card = makeStageCard(4, `QUANTIZATION (QUALITY=${et.quality}, SCALE=${et.qualityScaleFactor}%)`,
        'Quant[v,u] = round( F[v,u] / Q[v,u] )');
      const row = el('div', 'matrix-row');
      row.appendChild(buildMatrix8x8('FDCT F[v,u]', blk.dctRounded64, {
        heatmap: true, markDc: true,
        cellFormula: (i, r, c, v) => `F[${r},${c}] = ${v}`
      }));
      row.appendChild(buildMatrix8x8(`Q TABLE (${blk.component === 'Y' ? 'LUMA DQT0' : 'CHROMA DQT1'})`, blk.quantTable64, {
        cellFormula: (i, r, c, v) => `Q[${r},${c}] = ${v} (0x${hex2(v)})`
      }));
      row.appendChild(buildMatrix8x8('QUANTIZED OUTPUT', blk.quantized64, {
        heatmap: true, markDc: true,
        cellFormula: (i, r, c, v) => `round(${blk.dctFloat64[i].toFixed(2)} / ${blk.quantTable64[i]}) = ${v}`
      }));
      card.appendChild(row);
      container.appendChild(card);
    }

    // Stage 5: Zig-Zag Scan
    if (show(4)) {
      const card = makeStageCard(5, 'ZIG-ZAG SCAN REORDERING (8x8 -> 1D[0..63])',
        'Orders low-frequency DC & near-DC coefficients first so trailing high frequencies become zero runs');
      const row = el('div', 'matrix-row');

      const zzWrapper = el('div', 'zz-wrapper');
      const zzLabels = new Array(64);
      for (let zz = 0; zz < 64; zz++) zzLabels[ZIGZAG_TO_RASTER[zz]] = `z${zz}`;
      zzWrapper.appendChild(buildMatrix8x8('QUANTIZED 8x8 WITH ZIG-ZAG PATH', blk.quantized64, {
        heatmap: true, markDc: true, subValues: zzLabels,
        cellFormula: (i, r, c, v) => {
          const zz = ZIGZAG_TO_RASTER.indexOf(i);
          return `Raster(${r},${c}) -> ZZ[${zz}] = ${v}`;
        }
      }));
      zzWrapper.appendChild(buildZigZagSvgOverlay());
      row.appendChild(zzWrapper);
      card.appendChild(row);

      const strip = el('div', 'zz-1d-strip');
      for (let zz = 0; zz < 64; zz++) {
        const val = blk.zigZag64[zz];
        const chip = el('div', `zz-chip${zz === 0 ? ' dc' : val !== 0 ? ' nonzero' : ''}`, `${zz}:${val}`);
        strip.appendChild(chip);
      }
      card.appendChild(strip);
      container.appendChild(card);
    }

    // Stage 6 & 7: DPCM/RLE/VLI + Huffman/BitPacker
    if (show(5) || show(6)) {
      const card = makeStageCard(6, 'DC DPCM + AC RLE + VLI + HUFFMAN BITSTREAM PACKING',
        'Every token emits Huffman(Symbol) + VLI(Amplitude) bits -> packed MSB-first into exact output bytes');
      const wrap = el('div', 'px-table-wrap');
      const tbl = el('table', 'px-table');
      tbl.innerHTML = `<thead><tr>
        <th>#</th><th>TYPE</th><th>ZZ</th><th>RUN / SIZE</th><th>SYMBOL</th>
        <th>VALUE / DIFF</th><th>TABLE</th><th>HUFFMAN BITS</th><th>VLI BITS</th>
        <th>BIT OFFSET</th><th>OUT BYTES (CLICK TO INSPECT)</th>
      </tr></thead>`;
      const tbody = el('tbody');
      for (const t of blk.tokens) {
        const tr = el('tr', 'clickable');
        const diffInfo = t.kind === 'DC'
          ? `${t.value} (curr=${t.reconstructedCoeff} - prev=${t.previousDc})`
          : `${t.value}`;
        const byteSpan = t.byteOffsetStart === t.byteOffsetEnd
          ? `0x${hex4(t.byteOffsetStart)}`
          : `0x${hex4(t.byteOffsetStart)}..0x${hex4(t.byteOffsetEnd)}`;
        tr.innerHTML = `
          <td>${t.tokenIndex}</td>
          <td><span class="badge ${t.kind === 'DC' ? 'badge-ruby' : t.kind === 'EOB' ? 'badge-amber' : 'badge-lime'}">${t.kind}</span></td>
          <td>${t.zigZagIndex}</td>
          <td>run=${t.zeroRun}, sz=${t.size}</td>
          <td>0x${hex2(t.symbolByte)}</td>
          <td>${diffInfo}</td>
          <td>${t.huffmanTableName}</td>
          <td class="bits-huff">${t.huffmanBits}</td>
          <td class="bits-vli">${t.vliBits || '-'}</td>
          <td>@${t.bitOffsetStart} (+${t.bitLength}b)</td>
          <td><span class="badge badge-cyan">${byteSpan}</span></td>`;
        tr.addEventListener('click', () => jumpToByte(t.byteOffsetStart, 'encode'));
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      card.appendChild(wrap);

      container.appendChild(card);
    }

    // Stage 8: JFIF Headers & Stuffing Summary
    if (show(7)) {
      const card = makeStageCard(8, `JFIF HEADER SEGMENTS & BYTE STUFFING (${et.stuffedZeroCount}x 0xFF->0x00)`,
        'Click any field row to inspect the exact bytes in the Byte & Bit Map');
      const wrap = el('div', 'px-table-wrap');
      const tbl = el('table', 'px-table');
      tbl.innerHTML = `<thead><tr>
        <th>SEGMENT</th><th>MARKER</th><th>OFFSET</th><th>LEN</th><th>FIELD</th><th>HEX BYTES</th><th>INTERPRETATION</th>
      </tr></thead>`;
      const tbody = el('tbody');
      for (const seg of et.headers) {
        for (const f of seg.fields) {
          const tr = el('tr', 'clickable');
          const hexPreview = f.hexBytes.length > 36 ? f.hexBytes.slice(0, 36) + ' ...' : f.hexBytes;
          tr.innerHTML = `
            <td>${seg.name}</td>
            <td><span class="badge badge-pink">${seg.markerHex}</span></td>
            <td>0x${hex4(f.offset)}</td>
            <td>${f.length} B</td>
            <td>${f.name}</td>
            <td class="bits-huff">${hexPreview}</td>
            <td>${f.interpretation}</td>`;
          tr.addEventListener('click', () => jumpToByte(f.offset, 'encode'));
          tbody.appendChild(tr);
        }
      }
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      card.appendChild(wrap);
      container.appendChild(card);
    }
  }

  // Render Decoder 8 Stages
  function renderDecodeStages() {
    const container = $('decodeStagesContainer');
    container.innerHTML = '';

    const pills = $('decStagePills');
    pills.innerHTML = '';
    DEC_STAGE_NAMES.forEach((name, idx) => {
      const p = el('button', `stage-pill${state.decStageFilter === idx ? ' active' : ''}`, name);
      p.addEventListener('click', () => {
        state.decStageFilter = idx;
        $('decShowAllBtn').classList.remove('active');
        renderDecodeStages();
      });
      pills.appendChild(p);
    });

    const dt = getActiveTrace('decode');
    const blk = getActiveBlock('decode');
    if (!dt || !blk) return;

    const show = (idx) => state.decStageFilter === -1 || state.decStageFilter === idx;

    // Stage 1: Markers & DHT Tables
    if (show(0)) {
      const card = makeStageCard(1, 'JFIF MARKER PARSER & CANONICAL HUFFMAN RECONSTRUCTION',
        `Image ${dt.width}x${dt.height} | Sampling=${dt.subsampling} | MCUs=${dt.mcuCols}x${dt.mcuRows} | Huffman Tables=${dt.huffmanTables.length}`);
      const wrap = el('div', 'px-table-wrap');
      const tbl = el('table', 'px-table');
      tbl.innerHTML = `<thead><tr>
        <th>SEGMENT</th><th>MARKER</th><th>OFFSET</th><th>LEN</th><th>FIELD</th><th>HEX</th><th>PARSED VALUE</th>
      </tr></thead>`;
      const tbody = el('tbody');
      for (const seg of dt.headers) {
        for (const f of seg.fields) {
          const tr = el('tr', 'clickable');
          const hexPreview = f.hexBytes.length > 36 ? f.hexBytes.slice(0, 36) + ' ...' : f.hexBytes;
          tr.innerHTML = `
            <td>${seg.name}</td>
            <td><span class="badge badge-pink">${seg.markerHex}</span></td>
            <td>0x${hex4(f.offset)}</td>
            <td>${f.length} B</td>
            <td>${f.name}</td>
            <td class="bits-huff">${hexPreview}</td>
            <td>${f.interpretation}</td>`;
          tr.addEventListener('click', () => jumpToByte(f.offset, 'decode'));
          tbody.appendChild(tr);
        }
      }
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      card.appendChild(wrap);

      appendHuffmanDetails(card, dt.huffmanTables);

      container.appendChild(card);
    }

    // Stage 2: Destuffing Events
    if (show(1)) {
      const card = makeStageCard(2, `SCAN STREAM DESTUFFING (${dt.destuffEvents.length} EVENTS)`,
        `Scan bytes [0x${hex4(dt.scanStartOffset)} .. 0x${hex4(dt.scanEndOffset)}] -> removes 0x00 inserted after 0xFF`);
      if (dt.destuffEvents.length === 0) {
        card.appendChild(el('div', 'hover-info', 'No 0xFF 0x00 byte-stuffing sequences occurred in this scan stream.'));
      } else {
        const wrap = el('div', 'px-table-wrap');
        const tbl = el('table', 'px-table');
        tbl.innerHTML = `<thead><tr><th>#</th><th>0xFF OFFSET</th><th>0x00 STUFF OFFSET</th><th>LOGICAL ENTROPY IDX</th><th>DESCRIPTION</th></tr></thead>`;
        const tbody = el('tbody');
        dt.destuffEvents.forEach((ev, idx) => {
          const tr = el('tr', 'clickable');
          tr.innerHTML = `<td>${idx}</td><td>0x${hex4(ev.ffRawOffset)}</td><td class="bits-stf">0x${hex4(ev.zeroRawOffset)}</td><td>#${ev.logicalByteIndex}</td><td>${ev.description}</td>`;
          tr.addEventListener('click', () => jumpToByte(ev.zeroRawOffset, 'decode'));
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);
        card.appendChild(wrap);
      }
      container.appendChild(card);
    }

    // Stage 3 & 4: Bit-by-Bit Huffman + VLI + RLE Decode
    if (show(2) || show(3)) {
      const card = makeStageCard(3, `HUFFMAN + VLI EXTEND + RLE DECODE [BLOCK #${blk.blockIndex} ${blk.component}]`,
        'Matches canonical prefix bits -> symbol 0xRS -> reads size bits -> EXTEND(raw, size) -> fills ZZ[0..63]');
      const wrap = el('div', 'px-table-wrap');
      const tbl = el('table', 'px-table');
      tbl.innerHTML = `<thead><tr>
        <th>#</th><th>KIND</th><th>BIT POS</th><th>HUFFMAN BITS</th><th>SYM</th>
        <th>VLI BITS</th><th>DECODED VAL</th><th>ZZ IDX</th><th>RECON COEFF</th><th>RAW BYTES</th>
      </tr></thead>`;
      const tbody = el('tbody');
      for (const t of blk.tokens) {
        const tr = el('tr', 'clickable');
        const byteSpan = t.byteOffsetStart === t.byteOffsetEnd
          ? `0x${hex4(t.byteOffsetStart)}`
          : `0x${hex4(t.byteOffsetStart)}..0x${hex4(t.byteOffsetEnd)}`;
        tr.innerHTML = `
          <td>${t.tokenIndex}</td>
          <td><span class="badge ${t.kind === 'DC' ? 'badge-ruby' : t.kind === 'EOB' ? 'badge-amber' : 'badge-lime'}">${t.kind}</span></td>
          <td>@${t.bitOffsetStart}</td>
          <td class="bits-huff">${t.huffmanBits}</td>
          <td>0x${hex2(t.symbolByte)}</td>
          <td class="bits-vli">${t.vliBits || '-'}</td>
          <td>${t.value}</td>
          <td>${t.zigZagIndex}</td>
          <td><b>${t.reconstructedCoeff}</b></td>
          <td><span class="badge badge-cyan">${byteSpan}</span></td>`;
        tr.addEventListener('click', () => jumpToByte(t.byteOffsetStart, 'decode'));
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      card.appendChild(wrap);

      container.appendChild(card);
    }

    // Stage 5 & 6: ZigZag Unscan & Dequantization
    if (show(4) || show(5)) {
      const card = makeStageCard(5, `ZIG-ZAG UNSCAN & DEQUANTIZATION (DQT #${blk.quantTableId})`,
        'F\'[v,u] = Quant[v,u] * Q[v,u]');
      const row = el('div', 'matrix-row');
      row.appendChild(buildMatrix8x8('UNSCANNED QUANT[v,u]', blk.quantized64, {
        heatmap: true, markDc: true,
        cellFormula: (i, r, c, v) => `Quant[${r},${c}] = ${v}`
      }));
      row.appendChild(buildMatrix8x8(`DQT #${blk.quantTableId} STEPS`, blk.quantTable64, {
        cellFormula: (i, r, c, v) => `Q[${r},${c}] = ${v}`
      }));
      row.appendChild(buildMatrix8x8('DEQUANTIZED F\'[v,u]', blk.dequantized64, {
        heatmap: true, markDc: true,
        cellFormula: (i, r, c, v) => `${blk.quantized64[i]} * ${blk.quantTable64[i]} = ${v}`
      }));
      card.appendChild(row);
      container.appendChild(card);
    }

    // Stage 7: 2D IDCT + 128 Shift
    if (show(6)) {
      const card = makeStageCard(7, '2D IDCT (1D ROW -> 1D COL) + LEVEL SHIFT (+128) & CLAMP [0..255]',
        'f(y,x) = clamp(round(IDCT2D(F\')) + 128, 0, 255)');
      const row = el('div', 'matrix-row');
      row.appendChild(buildMatrix8x8('1D ROW IDCT', blk.rowIdct64, {
        heatmap: true, decimals: 1,
        cellFormula: (i, r, c, v) => `RowIDCT[${r},${c}] = ${v.toFixed(2)}`
      }));
      row.appendChild(buildMatrix8x8('2D IDCT (PRE +128)', blk.idctFloat64, {
        heatmap: true, decimals: 1,
        cellFormula: (i, r, c, v) => `IDCT[${r},${c}] = ${v.toFixed(2)} (rounded=${blk.idctRounded64[i]})`
      }));
      row.appendChild(buildMatrix8x8(`CLAMPED ${blk.component} BYTES`, blk.clampedChannel64, {
        grayscale: true,
        cellFormula: (i, r, c, v) => `clamp(${blk.idctRounded64[i]} + 128) = ${v} (0x${hex2(v)})`
      }));
      card.appendChild(row);
      container.appendChild(card);
    }

    // Stage 8: Output RGB Bytes
    if (show(7)) {
      const card = makeStageCard(8, 'CHROMA UPSAMPLING & YCbCr -> OUTPUT RGB BYTES',
        dt.fixedPoint
          ? 'R=(256Y+359(Cr-128)+128)>>8 | G=(256Y-88(Cb-128)-183(Cr-128)+128)>>8 | B=(256Y+454(Cb-128)+128)>>8'
          : 'R=Y+1.402(Cr-128) | G=Y-0.3441(Cb-128)-0.7141(Cr-128) | B=Y+1.772(Cb-128)');
      const wrap = el('div', 'px-table-wrap');
      const tbl = el('table', 'px-table');
      tbl.innerHTML = `<thead><tr><th>PIXEL (X,Y)</th><th>Y</th><th>Cb</th><th>Cr</th><th>OUT OFFSET</th><th>OUT RGB (HEX / DEC)</th><th>COLOR</th></tr></thead>`;
      const tbody = el('tbody');
      const maxRows = Math.min(dt.width * dt.height, 256);
      for (let i = 0; i < maxRows; i++) {
        const x = i % dt.width;
        const y = Math.floor(i / dt.width);
        const off = i * 3;
        const r = state.decRgb[off], g = state.decRgb[off + 1], b = state.decRgb[off + 2];
        const tr = el('tr');
        const samp = dt.outputPixelSample?.[i];
        tr.innerHTML = `
          <td>(${x}, ${y})</td>
          <td>${samp ? samp.yVal : '-'}</td>
          <td>${samp ? samp.cbVal : '-'}</td>
          <td>${samp ? samp.crVal : '-'}</td>
          <td>${off}..${off + 2}</td>
          <td class="bits-vli">${hex2(r)} ${hex2(g)} ${hex2(b)} <span class="muted">(${r},${g},${b})</span></td>
          <td><span class="color-swatch-inline" style="background:rgb(${r},${g},${b})"></span></td>`;
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      card.appendChild(wrap);

      container.appendChild(card);
    }
  }

  function appendHuffmanDetails(card, huffmanTables) {
    if (!huffmanTables || huffmanTables.length === 0) return;
    for (const ht of huffmanTables) {
      const det = el('details');
      det.style.marginTop = '8px';
      const sum = el('summary', 'px-btn btn-sm btn-cyan', `DHT ${ht.name}: ${ht.entries.length} CODES (CLICK TO INSPECT CANONICAL TABLE)`);
      det.appendChild(sum);
      const hWrap = el('div', 'px-table-wrap');
      hWrap.style.marginTop = '6px';
      const hTbl = el('table', 'px-table');
      hTbl.innerHTML = `<thead><tr><th>SYMBOL (HEX)</th><th>RUN / SIZE</th><th>BIT LEN</th><th>CANONICAL CODE (BIN)</th><th>HEX</th></tr></thead>`;
      const hBody = el('tbody');
      for (const ent of ht.entries.slice(0, 48)) {
        const tr = el('tr');
        const run = ent.symbol >> 4;
        const sz = ent.symbol & 0x0F;
        const rsLabel = ht.tableClass === 0 ? `DC cat=${sz}` : (ent.symbol === 0 ? 'EOB' : ent.symbol === 0xF0 ? 'ZRL (16 zeros)' : `run=${run}, sz=${sz}`);
        tr.innerHTML = `<td>0x${hex2(ent.symbol)}</td><td>${rsLabel}</td><td>${ent.length}</td><td class="bits-huff">${ent.bitString}</td><td>0x${ent.code.toString(16).toUpperCase()}</td>`;
        hBody.appendChild(tr);
      }
      if (ht.entries.length > 48) {
        const tr = el('tr');
        tr.innerHTML = `<td colspan="5" class="muted">... +${ht.entries.length - 48} additional Huffman entries (total ${ht.entries.length})</td>`;
        hBody.appendChild(tr);
      }
      hTbl.appendChild(hBody);
      hWrap.appendChild(hTbl);
      det.appendChild(hWrap);
      card.appendChild(det);
    }
  }

  function makeStageCard(num, title, formula) {
    const card = el('div', 'pixel-box stage-card');
    const head = el('div', 'stage-card-head');
    const left = el('div');
    left.appendChild(el('span', 'stage-num', `S${num}`));
    left.appendChild(el('span', 'stage-name', title));
    head.appendChild(left);
    head.appendChild(el('div', 'stage-formula mono', formula));
    card.appendChild(head);
    return card;
  }

  function buildZigZagSvgOverlay() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'zz-svg');
    // grid-8x8 has 8 cells * 38px + 7 gaps * 2px = 318px width, 8 * 30 + 7 * 2 = 254px height, inside 8px padding + 20px title
    svg.setAttribute('viewBox', '0 0 338 292');
    const pts = [];
    for (let zz = 0; zz < 64; zz++) {
      const rIdx = ZIGZAG_TO_RASTER[zz];
      const r = Math.floor(rIdx / 8);
      const c = rIdx % 8;
      const x = 10 + c * 40 + 19;
      const y = 30 + r * 32 + 15;
      pts.push(`${x},${y}`);
    }
    const poly = document.createElementNS(svgNS, 'polyline');
    poly.setAttribute('points', pts.join(' '));
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', 'rgba(255, 236, 39, 0.45)');
    poly.setAttribute('stroke-width', '1.5');
    svg.appendChild(poly);
    return svg;
  }

  // Tab 3: Complete Byte & Bit Map
  function renderByteMap() {
    const source = state.decodeOnlyMode ? 'decode' : state.byteSource;
    const trace = getActiveTrace(source);
    const hexContainer = $('hexDumpContainer');
    const legend = $('segmentLegend');
    hexContainer.innerHTML = '';
    legend.innerHTML = '';

    document.querySelectorAll('[data-byte-source]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.byteSource === source);
      btn.disabled = state.decodeOnlyMode && btn.dataset.byteSource === 'encode';
    });

    if (!trace || !trace.byteLedger?.length) return;

    // Segment legend jump pills
    for (const seg of trace.headers) {
      const p = el('button', 'seg-pill', `${seg.name} @0x${hex4(seg.startOffset)} (${seg.length}B)`);
      p.style.color = seg.name.startsWith('SOI') || seg.name.startsWith('EOI') ? 'var(--pink)'
        : seg.name.startsWith('DQT') ? 'var(--gold)'
        : seg.name.startsWith('SOF') ? 'var(--lime)'
        : seg.name.startsWith('DHT') ? 'var(--cyan)'
        : 'var(--amber)';
      p.addEventListener('click', () => selectByte(seg.startOffset));
      legend.appendChild(p);
    }

    const activeBlk = getActiveBlock(source);
    const ledger = trace.byteLedger;

    for (let rowOff = 0; rowOff < ledger.length; rowOff += 16) {
      const row = el('div', 'hex-row');
      row.appendChild(el('span', 'hex-addr', `0x${hex4(rowOff)}`));

      const bytesGrid = el('div', 'hex-bytes');
      let ascii = '';

      for (let col = 0; col < 16; col++) {
        const idx = rowOff + col;
        if (idx >= ledger.length) break;
        const entry = ledger[idx];
        const bEl = el('span', `hbyte cat-${entry.category}`, hex2(entry.value));
        bEl.dataset.offset = String(idx);

        if (idx === state.selectedByteOffset) bEl.classList.add('selected');
        if (state.highlightBlockBytes && activeBlk &&
            idx >= activeBlk.entropyByteStart && idx <= activeBlk.entropyByteEnd &&
            (entry.category === 'ENTROPY_DATA' || entry.category === 'STUFFED_ZERO')) {
          bEl.classList.add('blk-hilite');
        }

        bEl.title = `0x${hex4(idx)}: 0x${hex2(entry.value)} [${entry.segment}] ${entry.fieldName}`;
        bEl.addEventListener('click', () => selectByte(idx));
        bytesGrid.appendChild(bEl);

        const ch = entry.value;
        ascii += (ch >= 0x20 && ch <= 0x7E) ? String.fromCharCode(ch) : '.';
      }

      row.appendChild(bytesGrid);
      row.appendChild(el('span', 'hex-ascii', ascii));
      hexContainer.appendChild(row);
    }

    renderByteDetail();
  }

  function selectByte(offset) {
    const source = state.decodeOnlyMode ? 'decode' : state.byteSource;
    const trace = getActiveTrace(source);
    if (!trace || offset < 0 || offset >= trace.byteLedger.length) return;
    state.selectedByteOffset = offset;

    document.querySelectorAll('.hbyte.selected').forEach((n) => n.classList.remove('selected'));
    const target = document.querySelector(`.hbyte[data-offset="${offset}"]`);
    if (target) {
      target.classList.add('selected');
      target.scrollIntoView({ block: 'nearest' });
    }
    renderByteDetail();
  }

  function renderByteDetail() {
    const panel = $('byteDetailPanel');
    const source = state.decodeOnlyMode ? 'decode' : state.byteSource;
    const trace = getActiveTrace(source);
    if (!trace || state.selectedByteOffset >= trace.byteLedger.length) return;

    const e = trace.byteLedger[state.selectedByteOffset];
    const bits = bin8(e.value);
    panel.innerHTML = '';

    const hdr = el('div', 'card-head');
    hdr.appendChild(el('span', '', `BYTE 0x${hex4(e.offset)} (${e.offset})`));
    hdr.appendChild(el('span', 'badge badge-gold', `0x${hex2(e.value)} | ${e.value} | ${bits}`));
    panel.appendChild(hdr);

    const meta = el('div', 'meta-grid');
    for (const [k, v] of [
      ['CATEGORY', e.category],
      ['SEGMENT', e.segment],
      ['MCU / BLOCK', e.blockIndex >= 0 ? `MCU #${e.mcuIndex} / BLK #${e.blockIndex}` : 'HEADER / TRAILER'],
      ['ROLE', e.fieldName]
    ]) {
      const c = el('div', 'kv-cell');
      c.appendChild(el('div', 'kv-label', k));
      c.appendChild(el('div', 'kv-val', v));
      meta.appendChild(c);
    }
    panel.appendChild(meta);

    // 8-bit Anatomy Ruler (b7 down to b0)
    const rulerTitle = el('div', 'matrix-title', '8-BIT PROVENANCE RULER (BIT 7 MSB -> BIT 0 LSB)');
    rulerTitle.style.marginTop = '12px';
    panel.appendChild(rulerTitle);

    const ruler = el('div', 'bit-ruler');
    for (let bit = 7; bit >= 0; bit--) {
      const slice = e.bitSlices?.find((s) => bit <= s.highBit && bit >= s.lowBit);
      const kindCls = slice ? `kind-${slice.kind}` : '';
      const box = el('div', `bit-box ${kindCls}`);
      box.appendChild(el('div', 'bit-idx', `b${bit}`));
      box.appendChild(el('div', 'bit-val', bits[7 - bit]));
      box.title = slice ? slice.detail : e.fieldName;
      ruler.appendChild(box);
    }
    panel.appendChild(ruler);

    if (e.bitSlices?.length) {
      for (const s of e.bitSlices) {
        const sc = el('div', 'slice-card');
        sc.innerHTML = `
          <div><span class="badge ${s.kind === 'HUFFMAN' ? 'badge-cyan' : s.kind === 'VLI' ? 'badge-lime' : s.kind === 'STUFF_00' ? 'badge-ruby' : 'badge-amber'}">${s.kind}</span>
          <b>bits [${s.highBit}..${s.lowBit}] = "${s.bits}"</b></div>
          <div class="muted" style="margin-top:4px">${s.detail}</div>`;
        if (s.blockIndex >= 0) {
          sc.addEventListener('click', () => {
            state.selectedBlockIdx = s.blockIndex;
            populateBlockSelector();
            drawGridOverlay();
            switchTab(source === 'encode' ? 'encode' : 'decode');
          });
        }
        panel.appendChild(sc);
      }
    } else {
      const info = el('div', 'slice-card');
      info.textContent = `Header / Marker Structural Byte: ${e.fieldName}`;
      panel.appendChild(info);
    }
  }

  function jumpToByte(offset, source) {
    state.byteSource = source;
    state.selectedByteOffset = offset;
    switchTab('bytemap');
    renderByteMap();
    selectByte(offset);
  }

  // Tab 4: Verilog RTL & Live Sim
  async function loadVerilogModules() {
    const res = await fetch('/api/verilog/modules');
    if (!res.ok) return;
    const data = await res.json();
    state.verilogModules = data.modules || [];

    const orderEnc = [
      'rgb_to_ycbcr', 'dct_1d', 'fdct_2d', 'quantizer',
      'zigzag_scanner', 'rle_dc_encoder', 'huffman_lut_rom',
      'huffman_encoder', 'bit_packer_stuffer', 'jpeg_header_gen', 'jpeg_encoder_top'
    ];
    const orderDec = [
      'jpeg_marker_parser', 'byte_destuffer', 'bit_reader',
      'huffman_decoder', 'rle_dc_decoder', 'zigzag_unscanner',
      'dequantizer', 'idct_1d', 'idct_2d', 'ycbcr_to_rgb', 'jpeg_decoder_top'
    ];
    const orderCom = ['zigzag_lut', 'quant_table_rom'];

    const renderGroup = (containerId, order) => {
      const box = $(containerId);
      box.innerHTML = '';
      order.forEach((name, idx) => {
        const mod = state.verilogModules.find((m) => m.name === name);
        if (!mod) return;
        if (idx > 0) box.appendChild(el('div', 'vmod-arrow', '▼'));
        const node = el('div', `vmod-node${state.activeVerilogModule === name ? ' active' : ''}`);
        node.appendChild(el('div', 'vmod-name', `${mod.fileName} (${mod.lineCount}L)`));
        node.appendChild(el('div', 'vmod-desc', mod.summary || 'RTL module'));
        node.addEventListener('click', () => selectVerilogModule(name));
        box.appendChild(node);
      });
    };

    renderGroup('verilogEncDiagram', orderEnc);
    renderGroup('verilogDecDiagram', orderDec);
    renderGroup('verilogComDiagram', orderCom);

    if (!state.activeVerilogModule && state.verilogModules.length) {
      selectVerilogModule('jpeg_encoder_top');
    }
  }

  function selectVerilogModule(name) {
    state.activeVerilogModule = name;
    const mod = state.verilogModules.find((m) => m.name === name);
    if (!mod) return;

    document.querySelectorAll('.vmod-node').forEach((n) => {
      n.classList.toggle('active', n.querySelector('.vmod-name')?.textContent.startsWith(mod.fileName));
    });

    $('verilogCodeTitle').textContent = `rtl/${mod.group}/${mod.fileName}`;
    $('verilogCodeMeta').textContent = `${mod.lineCount} LINES`;
    const numbered = mod.source.split('\n').map((l, i) => `${String(i + 1).padStart(4, ' ')} | ${l}`).join('\n');
    $('verilogCodeView').textContent = numbered;
  }

  async function runLiveVerilogSim() {
    const outBox = $('verilogSimResult');
    outBox.classList.remove('hidden');
    outBox.innerHTML = '<span class="badge badge-gold">RUNNING IVERILOG / VVP HARDWARE SIMULATION...</span>';

    if (state.srcWidth > 32 || state.srcHeight > 32) {
      outBox.innerHTML = '<span class="badge badge-ruby">LIVE SIM REQUIRES IMAGE &le; 32x32 (SELECT AN 8x8..32x32 PRESET)</span>';
      return;
    }

    const res = await fetch('/api/verilog/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        width: state.srcWidth,
        height: state.srcHeight,
        rgbBase64: bytesToB64(state.srcRgb)
      })
    });
    const data = await res.json();
    if (!res.ok) {
      outBox.innerHTML = `<span class="badge badge-ruby">ERROR: ${data.error || data.detail || 'Simulation failed'}</span>`;
      return;
    }

    outBox.innerHTML = '';
    const grid = el('div', 'vsim-grid');

    const cWrap = el('div');
    cWrap.appendChild(el('div', 'canvas-title', 'VERILOG DECODED RGB'));
    const cvs = el('canvas', 'vsim-canvas');
    drawRgbToCanvas(cvs, b64ToBytes(data.verilogRgbBase64), data.width, data.height);
    cWrap.appendChild(cvs);
    grid.appendChild(cWrap);

    const info = el('div', 'mono');
    info.innerHTML = `
      <div><span class="badge ${data.exactJpgMatch ? 'badge-lime' : 'badge-ruby'}">${data.exactJpgMatch ? 'BIT-EXACT JPG MATCH (VERILOG == C# Q50 FIXED-PT)' : `DIFF @ BYTE ${data.firstJpgDiff}`}</span>
           <span class="badge ${data.exactRgbMatch ? 'badge-lime' : 'badge-ruby'}" style="margin-left:6px">${data.exactRgbMatch ? 'BIT-EXACT RGB MATCH' : 'RGB DIFF'}</span></div>
      <div style="margin-top:6px">Verilog JPEG Output: <b>${data.verilogByteCount} bytes</b> | C# Fixed-Pt Q50: <b>${data.csByteCount} bytes</b></div>
      <div class="muted" style="margin-top:4px">${data.vvpLog}</div>
    `;
    grid.appendChild(info);
    outBox.appendChild(grid);
  }

  // Pixel Painter & Canvas Interaction
  function initPalette() {
    const bar = $('paletteBar');
    for (const hex of PICO8_PALETTE) {
      const sw = el('div', `swatch${hex === state.paintColorHex ? ' active' : ''}`);
      sw.style.background = hex;
      sw.addEventListener('click', () => {
        state.paintColorHex = hex;
        bar.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
      });
      bar.appendChild(sw);
    }
  }

  function hexToRgbTuple(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function canvasCoordFromEvent(ev) {
    const grid = $('gridCanvas');
    const rect = grid.getBoundingClientRect();
    const x = Math.max(0, Math.min(state.srcWidth - 1, Math.floor(((ev.clientX - rect.left) / rect.width) * state.srcWidth)));
    const y = Math.max(0, Math.min(state.srcHeight - 1, Math.floor(((ev.clientY - rect.top) / rect.height) * state.srcHeight)));
    return [x, y];
  }

  function paintPixelAt(x, y) {
    const [r, g, b] = hexToRgbTuple(state.paintColorHex);
    const off = (y * state.srcWidth + x) * 3;
    state.srcRgb[off] = r;
    state.srcRgb[off + 1] = g;
    state.srcRgb[off + 2] = b;
    drawRgbToCanvas($('srcCanvas'), state.srcRgb, state.srcWidth, state.srcHeight);
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-view').forEach((v) => v.classList.toggle('active', v.id === `tab-${tabName}`));
  }

  function initEvents() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    $('presetSelect').addEventListener('change', (e) => selectPreset(e.target.value));
    $('qualityRange').addEventListener('input', (e) => { $('qualityLabel').textContent = e.target.value; });
    $('qualityRange').addEventListener('change', () => { if (!state.decodeOnlyMode) runEncode(); });
    $('subsamplingSelect').addEventListener('change', () => { if (!state.decodeOnlyMode) runEncode(); });
    $('mathModeSelect').addEventListener('change', () => {
      if (state.decodeOnlyMode) runDecodeFile(state.jpegBytes);
      else runEncode();
    });

    // Block navigation
    $('blockSelect').addEventListener('change', (e) => {
      state.selectedBlockIdx = parseInt(e.target.value, 10) || 0;
      syncBlockSelection();
    });
    $('prevBlockBtn').addEventListener('click', () => {
      if (state.selectedBlockIdx > 0) {
        state.selectedBlockIdx--;
        syncBlockSelection();
      }
    });
    $('nextBlockBtn').addEventListener('click', () => {
      const trace = getActiveTrace(state.decodeOnlyMode ? 'decode' : 'encode');
      if (trace && state.selectedBlockIdx + 1 < trace.blocks.length) {
        state.selectedBlockIdx++;
        syncBlockSelection();
      }
    });

    document.querySelectorAll('#compPills .px-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const comp = btn.dataset.comp;
        state.selectedComp = comp;
        const trace = getActiveTrace(state.decodeOnlyMode ? 'decode' : 'encode');
        if (!trace) return;
        const curMcu = trace.blocks[state.selectedBlockIdx]?.mcuIndex ?? 0;
        const match = trace.blocks.find((b) => b.mcuIndex === curMcu && b.component === comp)
          || trace.blocks.find((b) => b.component === comp);
        if (match) {
          state.selectedBlockIdx = match.blockIndex;
          syncBlockSelection();
        }
      });
    });

    // Stage stepping controls (Encoder & Decoder)
    $('encShowAllBtn').addEventListener('click', () => {
      state.encStageFilter = -1;
      $('encShowAllBtn').classList.add('active');
      renderEncodeStages();
    });
    $('encPrevStageBtn').addEventListener('click', () => {
      state.encStageFilter = state.encStageFilter <= 0 ? ENC_STAGE_NAMES.length - 1 : state.encStageFilter - 1;
      $('encShowAllBtn').classList.remove('active');
      renderEncodeStages();
    });
    $('encNextStageBtn').addEventListener('click', () => {
      state.encStageFilter = (state.encStageFilter + 1) % ENC_STAGE_NAMES.length;
      $('encShowAllBtn').classList.remove('active');
      renderEncodeStages();
    });
    $('encAutoStageBtn').addEventListener('click', () => {
      if (state.encAutoTimer) {
        clearInterval(state.encAutoTimer);
        state.encAutoTimer = null;
        $('encAutoStageBtn').textContent = 'AUTO';
        return;
      }
      $('encAutoStageBtn').textContent = 'STOP';
      $('encShowAllBtn').classList.remove('active');
      if (state.encStageFilter < 0) state.encStageFilter = 0;
      renderEncodeStages();
      state.encAutoTimer = setInterval(() => {
        state.encStageFilter = (state.encStageFilter + 1) % ENC_STAGE_NAMES.length;
        renderEncodeStages();
      }, 1400);
    });

    $('decShowAllBtn').addEventListener('click', () => {
      state.decStageFilter = -1;
      $('decShowAllBtn').classList.add('active');
      renderDecodeStages();
    });
    $('decPrevStageBtn').addEventListener('click', () => {
      state.decStageFilter = state.decStageFilter <= 0 ? DEC_STAGE_NAMES.length - 1 : state.decStageFilter - 1;
      $('decShowAllBtn').classList.remove('active');
      renderDecodeStages();
    });
    $('decNextStageBtn').addEventListener('click', () => {
      state.decStageFilter = (state.decStageFilter + 1) % DEC_STAGE_NAMES.length;
      $('decShowAllBtn').classList.remove('active');
      renderDecodeStages();
    });
    $('decAutoStageBtn').addEventListener('click', () => {
      if (state.decAutoTimer) {
        clearInterval(state.decAutoTimer);
        state.decAutoTimer = null;
        $('decAutoStageBtn').textContent = 'AUTO';
        return;
      }
      $('decAutoStageBtn').textContent = 'STOP';
      $('decShowAllBtn').classList.remove('active');
      if (state.decStageFilter < 0) state.decStageFilter = 0;
      renderDecodeStages();
      state.decAutoTimer = setInterval(() => {
        state.decStageFilter = (state.decStageFilter + 1) % DEC_STAGE_NAMES.length;
        renderDecodeStages();
      }, 1400);
    });

    // Byte Map controls
    document.querySelectorAll('[data-byte-source]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.byteSource = btn.dataset.byteSource;
        state.selectedByteOffset = 0;
        renderByteMap();
      });
    });
    $('highlightBlkBytesBtn').addEventListener('click', () => {
      state.highlightBlockBytes = !state.highlightBlockBytes;
      $('highlightBlkBytesBtn').classList.toggle('active', state.highlightBlockBytes);
      renderByteMap();
    });
    $('jumpStuffBtn').addEventListener('click', () => {
      const source = state.decodeOnlyMode ? 'decode' : state.byteSource;
      const trace = getActiveTrace(source);
      if (!trace) return;
      const stuffed = trace.byteLedger.filter((b) => b.category === 'STUFFED_ZERO');
      if (!stuffed.length) {
        alert('No 0xFF 0x00 byte stuffing in current JPEG (try 32x32 Sunset at Quality 98!).');
        return;
      }
      const next = stuffed.find((b) => b.offset > state.lastStuffCursor) || stuffed[0];
      state.lastStuffCursor = next.offset;
      selectByte(next.offset);
    });

    // Paint toggle & canvas mouse
    $('paintToggleBtn').addEventListener('click', () => {
      if (state.decodeOnlyMode) return;
      state.paintMode = !state.paintMode;
      $('paintToggleBtn').textContent = state.paintMode ? 'PAINT: ON' : 'PAINT: OFF';
      $('paintToggleBtn').classList.toggle('active', state.paintMode);
      $('paletteBar').classList.toggle('hidden', !state.paintMode);
    });

    const gridCanvas = $('gridCanvas');
    gridCanvas.addEventListener('mousedown', (ev) => {
      const [x, y] = canvasCoordFromEvent(ev);
      if (state.paintMode && !state.decodeOnlyMode) {
        state.isDrawing = true;
        paintPixelAt(x, y);
      } else {
        selectBlockAtPixel(x, y);
      }
    });
    gridCanvas.addEventListener('mousemove', (ev) => {
      const [x, y] = canvasCoordFromEvent(ev);
      const off = (y * state.srcWidth + x) * 3;
      const r = state.srcRgb[off], g = state.srcRgb[off + 1], b = state.srcRgb[off + 2];
      $('pixelHoverInfo').textContent =
        `PX(${x},${y}) OFF[${off}..${off + 2}] RGB=#${hex2(r)}${hex2(g)}${hex2(b)} (${r},${g},${b})`;
      if (state.isDrawing && state.paintMode) paintPixelAt(x, y);
    });
    window.addEventListener('mouseup', () => {
      if (state.isDrawing) {
        state.isDrawing = false;
        runEncode();
      }
    });

    // Uploads & Download
    $('uploadImgInput').addEventListener('change', (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        const maxDim = 64;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          const s = Math.min(maxDim / w, maxDim / h);
          w = Math.max(8, Math.round(w * s));
          h = Math.max(8, Math.round(h * s));
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const idata = ctx.getImageData(0, 0, w, h).data;
        const rgb = new Uint8Array(w * h * 3);
        for (let i = 0; i < w * h; i++) {
          rgb[i * 3] = idata[i * 4];
          rgb[i * 3 + 1] = idata[i * 4 + 1];
          rgb[i * 3 + 2] = idata[i * 4 + 2];
        }
        state.srcWidth = w;
        state.srcHeight = h;
        state.srcRgb = rgb;
        state.selectedBlockIdx = 0;
        runEncode();
      };
      img.src = URL.createObjectURL(file);
      ev.target.value = '';
    });

    $('uploadJpgInput').addEventListener('change', async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const buf = new Uint8Array(await file.arrayBuffer());
      await runDecodeFile(buf);
      ev.target.value = '';
    });

    $('downloadJpgBtn').addEventListener('click', () => {
      if (!state.jpegBytes.length) return;
      const blob = new Blob([state.jpegBytes], { type: 'image/jpeg' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `jpeg_pixel_lab_${state.srcWidth}x${state.srcHeight}.jpg`;
      a.click();
    });

    $('runVerilogSimBtn').addEventListener('click', runLiveVerilogSim);
  }

  function selectBlockAtPixel(x, y) {
    const trace = getActiveTrace(state.decodeOnlyMode ? 'decode' : 'encode');
    if (!trace) return;
    const is420 = trace.subsampling === '4:2:0';
    const match = trace.blocks.find((b) => {
      const bw = (is420 && b.component !== 'Y') ? 16 : 8;
      return b.component === state.selectedComp &&
        x >= b.originX && x < b.originX + bw &&
        y >= b.originY && y < b.originY + bw;
    }) || trace.blocks.find((b) => x >= b.originX && x < b.originX + 8 && y >= b.originY && y < b.originY + 8);

    if (match) {
      state.selectedBlockIdx = match.blockIndex;
      syncBlockSelection();
    }
  }

  function syncBlockSelection() {
    populateBlockSelector();
    drawGridOverlay();
    renderEncodeStages();
    renderDecodeStages();
    renderByteMap();
  }

  async function boot() {
    initPalette();
    initEvents();
    await Promise.all([loadPresets(), loadVerilogModules()]);
  }

  boot();
})();
