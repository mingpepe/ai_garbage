const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 25;
const BUFFER_ROWS = 4;

export class HexViewer {
  constructor({ viewport, spacer, rowsContainer, hoverEls, onByteClick }) {
    this.viewport = viewport;
    this.spacer = spacer;
    this.rowsContainer = rowsContainer;
    this.hoverEls = hoverEls;
    this.onByteClick = onByteClick;

    this.parsed = null;
    this.totalRows = 0;

    this.selStart = -1;
    this.selEnd = -1;

    this.hdrStart = -1;
    this.hdrEnd = -1;
    this.playStart = -1;
    this.playEnd = -1;

    this.lastRenderKey = '';
    this.rafPending = false;

    this._bindEvents();
  }

  _bindEvents() {
    this.viewport.addEventListener('scroll', () => {
      this._scheduleRender();
    });

    window.addEventListener('resize', () => {
      this._scheduleRender();
    });

    this.rowsContainer.addEventListener('mousemove', (e) => {
      const target = e.target;
      if (!target || !target.dataset || target.dataset.off === undefined) return;
      const off = Number(target.dataset.off);
      this._updateHover(off);
    });

    this.rowsContainer.addEventListener('click', (e) => {
      const target = e.target;
      if (!target || !target.dataset || target.dataset.off === undefined) return;
      const off = Number(target.dataset.off);
      if (this.onByteClick) this.onByteClick(off);
    });
  }

  setParsedFile(parsed) {
    this.parsed = parsed;
    this.selStart = -1;
    this.selEnd = -1;
    this.hdrStart = -1;
    this.hdrEnd = -1;
    this.playStart = -1;
    this.playEnd = -1;
    this.lastRenderKey = '';

    if (!parsed) {
      this.totalRows = 0;
      this.spacer.style.height = '0px';
      this.rowsContainer.innerHTML = '';
      return;
    }

    this.totalRows = Math.ceil(parsed.bytes.length / BYTES_PER_ROW);
    this.spacer.style.height = `${this.totalRows * ROW_HEIGHT}px`;
    this.viewport.scrollTop = 0;
    this.render(true);
  }

  setSelection(start, end) {
    this.selStart = start;
    this.selEnd = end;
    this.render(true);
  }

  setPlaybackHighlight(hdrStart, hdrEnd, playStart, playEnd, autoFollow = false) {
    const changed =
      this.hdrStart !== hdrStart ||
      this.hdrEnd !== hdrEnd ||
      this.playStart !== playStart ||
      this.playEnd !== playEnd;

    this.hdrStart = hdrStart;
    this.hdrEnd = hdrEnd;
    this.playStart = playStart;
    this.playEnd = playEnd;

    if (autoFollow && (hdrStart >= 0 || playStart >= 0)) {
      const targetOff = hdrStart >= 0 ? hdrStart : playStart;
      this.scrollToOffset(targetOff, false);
    }

    if (changed) {
      this.render(true);
    }
  }

  scrollToOffset(byteOffset, center = true) {
    if (!this.parsed) return;
    const clamped = Math.max(0, Math.min(this.parsed.bytes.length - 1, byteOffset));
    const row = Math.floor(clamped / BYTES_PER_ROW);
    const rowTop = row * ROW_HEIGHT;
    const viewH = this.viewport.clientHeight || 400;

    if (center) {
      this.viewport.scrollTop = Math.max(0, rowTop - Math.floor(viewH / 3));
    } else {
      const curTop = this.viewport.scrollTop;
      const curBot = curTop + viewH - ROW_HEIGHT * 2;
      if (rowTop < curTop || rowTop > curBot) {
        this.viewport.scrollTop = Math.max(0, rowTop - Math.floor(viewH / 4));
      }
    }
    this.render(true);
  }

  _scheduleRender() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.render(false);
    });
  }

  _updateHover(off) {
    if (!this.parsed || off < 0 || off >= this.parsed.bytes.length) return;
    const b = this.parsed.bytes[off];
    this.hoverEls.offset.textContent = `0x${off.toString(16).toUpperCase().padStart(6, '0')} (${off})`;
    this.hoverEls.hex.textContent = `0x${b.toString(16).toUpperCase().padStart(2, '0')}`;
    this.hoverEls.dec.textContent = String(b);
    this.hoverEls.bin.textContent = b.toString(2).padStart(8, '0');

    const info = this.parsed.getFieldAt(off);
    if (info && info.field) {
      this.hoverEls.field.textContent = `${info.chunk.id} > ${info.field.name}`;
    } else if (info && info.chunk) {
      this.hoverEls.field.textContent = info.chunk.title;
    } else {
      this.hoverEls.field.textContent = 'Unmapped / Padding';
    }
  }

  render(force = false) {
    if (!this.parsed) return;
    const scrollTop = this.viewport.scrollTop;
    const viewH = this.viewport.clientHeight || 480;
    const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const visibleCount = Math.ceil(viewH / ROW_HEIGHT) + BUFFER_ROWS * 2;
    const lastRow = Math.min(this.totalRows - 1, firstRow + visibleCount);

    const key = `${firstRow}:${lastRow}:${this.selStart}:${this.selEnd}:${this.hdrStart}:${this.playStart}:${this.playEnd}`;
    if (!force && key === this.lastRenderKey) return;
    this.lastRenderKey = key;

    const bytes = this.parsed.bytes;
    let html = '';

    for (let r = firstRow; r <= lastRow; r++) {
      const rowStart = r * BYTES_PER_ROW;
      const offStr = rowStart.toString(16).toUpperCase().padStart(8, '0');
      let hexHtml = '';
      let ascHtml = '';

      for (let i = 0; i < BYTES_PER_ROW; i++) {
        const off = rowStart + i;
        if (off >= bytes.length) {
          hexHtml += `<span class="hb${i === 7 ? ' gap-right' : ''}">  </span>`;
          ascHtml += `<span class="ha"> </span>`;
          continue;
        }

        const b = bytes[off];
        const reg = this.parsed.getRegionAt(off);
        let cls = reg ? reg.cls : '';

        if (off >= this.hdrStart && off < this.hdrEnd) {
          cls += ' is-playing-hdr';
        } else if (off >= this.playStart && off < this.playEnd) {
          cls += ' is-playing';
        }

        if (off >= this.selStart && off < this.selEnd) {
          cls += ' is-selected';
        }

        const hexByte = b.toString(16).toUpperCase().padStart(2, '0');
        const ch = b >= 32 && b <= 126 ? escapeHtmlChar(String.fromCharCode(b)) : '.';

        hexHtml += `<span class="hb ${cls}${i === 7 ? ' gap-right' : ''}" data-off="${off}">${hexByte}</span>`;
        ascHtml += `<span class="ha ${cls}" data-off="${off}">${ch}</span>`;
      }

      html += `<div class="hex-row"><span class="hex-off">${offStr}</span><span class="hex-bytes">${hexHtml}</span><span class="hex-ascii">${ascHtml}</span></div>`;
    }

    this.rowsContainer.style.transform = `translateY(${firstRow * ROW_HEIGHT}px)`;
    this.rowsContainer.innerHTML = html;
  }
}

function escapeHtmlChar(ch) {
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  if (ch === '&') return '&amp;';
  return ch;
}
