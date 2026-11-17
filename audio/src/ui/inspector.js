const BIT_FIELD_COLORS = [
  { name: 'syncword', start: 0, len: 12, color: '#41a6f6' },
  { name: 'ID', start: 12, len: 1, color: '#a7f070' },
  { name: 'layer', start: 13, len: 2, color: '#ffcd75' },
  { name: 'prot', start: 15, len: 1, color: '#ef7d57' },
  { name: 'profile', start: 16, len: 2, color: '#b16cea' },
  { name: 'sf_idx', start: 18, len: 4, color: '#38b764' },
  { name: 'priv', start: 22, len: 1, color: '#8b93b5' },
  { name: 'ch_cfg', start: 23, len: 3, color: '#41a6f6' },
  { name: 'flags', start: 26, len: 4, color: '#ef7d57' },
  { name: 'frame_len', start: 30, len: 13, color: '#ffcd75' },
  { name: 'fullness', start: 43, len: 11, color: '#a7f070' },
  { name: 'rdb', start: 54, len: 2, color: '#b16cea' },
  { name: 'crc', start: 56, len: 16, color: '#e43b44' },
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class InspectorUI {
  constructor({
    chunkListEl,
    chunkCountEl,
    selectedTitleEl,
    selectedRangeEl,
    fieldDetailsEl,
    bitSampleEl,
    onSelectChunk,
    onSelectField,
  }) {
    this.chunkListEl = chunkListEl;
    this.chunkCountEl = chunkCountEl;
    this.selectedTitleEl = selectedTitleEl;
    this.selectedRangeEl = selectedRangeEl;
    this.fieldDetailsEl = fieldDetailsEl;
    this.bitSampleEl = bitSampleEl;
    this.onSelectChunk = onSelectChunk;
    this.onSelectField = onSelectField;

    this.parsed = null;
    this.selectedChunkIndex = -1;
    this.selectedFieldName = null;
    this.playingChunkIndex = -1;
    this.windowStart = 0;
    this.MAX_VISIBLE_ITEMS = 250;
  }

  setParsedFile(parsed) {
    this.parsed = parsed;
    this.selectedChunkIndex = parsed && parsed.chunks.length > 0 ? 0 : -1;
    this.selectedFieldName = null;
    this.playingChunkIndex = -1;
    this.windowStart = 0;

    if (!parsed) {
      this.chunkCountEl.textContent = '0 items';
      this.chunkListEl.innerHTML = `<div class="empty-state"><p>請上傳 .WAV 或 .AAC 檔案</p></div>`;
      this.fieldDetailsEl.innerHTML = '';
      this.bitSampleEl.innerHTML = '';
      return;
    }

    this.chunkCountEl.textContent = `${parsed.chunks.length.toLocaleString()} items`;
    this.renderChunkList();
    if (this.selectedChunkIndex >= 0) {
      this.renderFieldDetails(parsed.chunks[this.selectedChunkIndex]);
    }
    this.renderBitOrSampleView(null);
  }

  selectChunk(chunkIndex, fieldName = null) {
    if (!this.parsed || chunkIndex < 0 || chunkIndex >= this.parsed.chunks.length) return;
    this.selectedChunkIndex = chunkIndex;
    this.selectedFieldName = fieldName;

    // Ensure chunk is within visible window for large AAC files
    if (
      chunkIndex < this.windowStart ||
      chunkIndex >= this.windowStart + this.MAX_VISIBLE_ITEMS
    ) {
      this.windowStart = Math.max(0, chunkIndex - Math.floor(this.MAX_VISIBLE_ITEMS / 2));
    }

    this.renderChunkList();
    this.renderFieldDetails(this.parsed.chunks[chunkIndex]);

    if (this.parsed.format === 'AAC') {
      this.renderBitOrSampleView(null);
    }
  }

  setPlayingChunk(chunkIndex, playbackState) {
    const changed = this.playingChunkIndex !== chunkIndex;
    this.playingChunkIndex = chunkIndex;

    if (changed && this.parsed) {
      const prev = this.chunkListEl.querySelector('.chunk-item.playing-now');
      if (prev) prev.classList.remove('playing-now');
      const cur = this.chunkListEl.querySelector(`.chunk-item[data-idx="${chunkIndex}"]`);
      if (cur) cur.classList.add('playing-now');
    }

    if (playbackState) {
      this.renderBitOrSampleView(playbackState);
    }
  }

  renderChunkList() {
    if (!this.parsed) return;
    const chunks = this.parsed.chunks;
    const total = chunks.length;
    const end = Math.min(total, this.windowStart + this.MAX_VISIBLE_ITEMS);

    let html = '';
    if (this.windowStart > 0) {
      html += `<button class="mini-btn" id="btnPrevChunks" type="button">▲ 載入較前區塊 (0..${this.windowStart - 1})</button>`;
    }

    for (let i = this.windowStart; i < end; i++) {
      const c = chunks[i];
      const sel = i === this.selectedChunkIndex ? ' selected' : '';
      const play = i === this.playingChunkIndex ? ' playing-now' : '';
      const rangeHex = `0x${c.start.toString(16).toUpperCase()}..0x${(c.end - 1).toString(16).toUpperCase()}`;

      html += `
        <div class="chunk-item${sel}${play}" data-idx="${i}">
          <span class="chunk-tag ${c.tagClass}">${escapeHtml(c.id)}</span>
          <span>${escapeHtml(c.title)}</span>
          <span class="chunk-meta">${escapeHtml(c.summary)} (${rangeHex})</span>
        </div>
      `;
    }

    if (end < total) {
      html += `<button class="mini-btn" id="btnNextChunks" type="button">▼ 載入後續區塊 (${end}..${total - 1})</button>`;
    }

    this.chunkListEl.innerHTML = html;

    this.chunkListEl.querySelectorAll('.chunk-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.idx);
        this.selectChunk(idx);
        if (this.onSelectChunk) this.onSelectChunk(this.parsed.chunks[idx]);
      });
    });

    const btnPrev = this.chunkListEl.querySelector('#btnPrevChunks');
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        this.windowStart = Math.max(0, this.windowStart - this.MAX_VISIBLE_ITEMS);
        this.renderChunkList();
      });
    }
    const btnNext = this.chunkListEl.querySelector('#btnNextChunks');
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        this.windowStart = Math.min(total - 1, this.windowStart + this.MAX_VISIBLE_ITEMS);
        this.renderChunkList();
      });
    }
  }

  renderFieldDetails(chunk) {
    if (!chunk) return;
    this.selectedTitleEl.textContent = chunk.title;
    this.selectedRangeEl.textContent = `0x${chunk.start.toString(16).toUpperCase()} - 0x${(chunk.end - 1).toString(16).toUpperCase()} (${chunk.size.toLocaleString()} B)`;

    let rows = '';
    for (const f of chunk.fields) {
      const isAct = this.selectedFieldName === f.name ? ' class="active-field"' : '';
      const offHex = `0x${f.offset.toString(16).toUpperCase()}`;
      rows += `
        <tr${isAct} data-off="${f.offset}" data-len="${f.length}" data-name="${escapeHtml(f.name)}">
          <td>
            <div class="field-name">${escapeHtml(f.name)}</div>
            <div class="muted">${offHex} (${f.length}B)</div>
          </td>
          <td class="field-hex">${escapeHtml(f.rawHex)}</td>
          <td>
            <div class="field-val">${escapeHtml(f.value)}</div>
            <div class="field-desc">${escapeHtml(f.desc)}</div>
          </td>
        </tr>
      `;
    }

    this.fieldDetailsEl.innerHTML = `
      <table class="field-table">
        <thead>
          <tr>
            <th style="width: 26%">FIELD / OFFSET</th>
            <th style="width: 22%">RAW HEX / BIN</th>
            <th>VALUE &amp; EXPLANATION</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    this.fieldDetailsEl.querySelectorAll('tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => {
        const off = Number(tr.dataset.off);
        const len = Number(tr.dataset.len);
        const name = tr.dataset.name;
        this.selectedFieldName = name;
        this.fieldDetailsEl.querySelectorAll('tbody tr').forEach((r) => r.classList.remove('active-field'));
        tr.classList.add('active-field');
        if (this.onSelectField) this.onSelectField(off, off + len);
      });
    });
  }

  renderBitOrSampleView(playbackState) {
    if (!this.parsed) return;

    if (this.parsed.format === 'WAV') {
      const samples = playbackState?.samples || [];
      if (samples.length === 0) {
        this.bitSampleEl.innerHTML = `<div class="empty-state"><p class="muted">按下 PLAY 或拖曳進度條，即可即時檢視目前播放位置的 PCM Sample 二進位與振幅數值。</p></div>`;
        return;
      }

      const cards = samples
        .map((s) => {
          const pct = Math.round(((s.normalized + 1) / 2) * 100);
          return `
            <div class="pcm-card">
              <div class="field-name">CHANNEL ${s.channel}</div>
              <div class="muted">Offset: 0x${s.offset.toString(16).toUpperCase()}</div>
              <div style="margin-top:6px;">Raw LE Hex: <span class="field-hex">${escapeHtml(s.rawHex)}</span></div>
              <div>Decoded Value: <span class="field-val">${escapeHtml(s.value)}</span> (${(s.normalized * 100).toFixed(1)}%)</div>
              <div class="pcm-bar-track">
                <div class="pcm-bar-fill" style="width:${pct}%"></div>
              </div>
            </div>
          `;
        })
        .join('');

      this.bitSampleEl.innerHTML = `
        <div class="section-header" style="border:2px solid var(--border-light)">
          <span>LIVE PCM SAMPLE INSPECTOR</span>
          <span>${escapeHtml(playbackState.unitLabel)}</span>
        </div>
        <div class="pcm-channels">${cards}</div>
      `;
      return;
    }

    if (this.parsed.format === 'AAC (MP4)') {
      const unitInfo = playbackState
        ? `${escapeHtml(playbackState.unitLabel)} @ 0x${playbackState.activeStart.toString(16).toUpperCase()}..0x${(playbackState.activeEnd - 1).toString(16).toUpperCase()}`
        : `Total ${this.parsed.samples?.length || 0} Access Units in mdat`;

      this.bitSampleEl.innerHTML = `
        <div class="section-header" style="border:2px solid var(--border-light)">
          <span>MP4 / M4A AAC ACCESS UNIT</span>
          <span>${unitInfo}</span>
        </div>
        <div class="guide-card" style="margin-top:8px;">
          <h4>為什麼 MP4/M4A 封裝的 AAC 沒有 ADTS 7-Byte Header？</h4>
          <p class="muted" style="line-height:1.6;">
            在 MP4 (ISO BMFF) 容器中，Profile、取樣率與聲道數已集中存放於 <code>moov &gt; trak &gt; mdia &gt; minf &gt; stbl &gt; stsd &gt; mp4a &gt; esds</code> 的 <strong>AudioSpecificConfig</strong> 中；每個 Frame 的長度與偏移則記錄在 <code>stsz</code> 與 <code>stco</code> 索引表。<br/>
            因此 <code>mdat</code> 內存放的是「純裸 AAC Access Unit」，省去了每個 Frame 重複攜帶 7 bytes ADTS Header 的開銷。
          </p>
        </div>
      `;
      return;
    }

    // AAC ADTS 56-bit / 72-bit Header Bit-Field Diagram
    let frame = playbackState?.frame;
    if (!frame) {
      const selChunk = this.parsed.chunks[this.selectedChunkIndex];
      if (selChunk && selChunk.frameIndex !== undefined) {
        frame = this.parsed.frames[selChunk.frameIndex];
      } else {
        frame = this.parsed.frames[0];
      }
    }
    if (!frame) return;

    const totalBits = frame.headerLength * 8;
    const bytes = this.parsed.bytes;
    let bitCells = '';

    for (let b = 0; b < totalBits; b++) {
      const byteIdx = frame.start + (b >> 3);
      const bitInByte = 7 - (b & 7);
      const bitVal = (bytes[byteIdx] >> bitInByte) & 1;
      const meta = BIT_FIELD_COLORS.find((m) => b >= m.start && b < m.start + m.len);
      const bg = meta ? meta.color : '#8b93b5';
      const lbl = meta && b === meta.start ? meta.name : b % 8 === 0 ? `B${b >> 3}` : '';

      bitCells += `
        <div class="bit-cell" style="background:${bg}; color:#000;" title="Bit ${b} (${meta ? meta.name : ''})">
          <span class="b-lbl">${lbl || '&nbsp;'}</span>
          <span class="b-val">${bitVal}</span>
        </div>
      `;
    }

    this.bitSampleEl.innerHTML = `
      <div class="section-header" style="border:2px solid var(--border-light)">
        <span>ADTS FRAME #${frame.frameIndex} BIT-FIELD MAP (${totalBits} BITS)</span>
        <span>0x${frame.start.toString(16).toUpperCase()} (${frame.frameLength}B)</span>
      </div>
      <div class="bit-grid">${bitCells}</div>
      <div class="muted" style="font-size:11px; line-height:1.5;">
        每個色塊代表 1 個 Bit (共 ${frame.headerLength} Bytes = ${totalBits} Bits)，每列 8 Bits = 1 Byte。<br/>
        注意 <code>aac_frame_length (13b)</code> 與 <code>adts_buffer_fullness (11b)</code> 如何跨越 Byte 邊界打包！
      </div>
    `;
  }
}
