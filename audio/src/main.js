import { isWavFile, parseWav } from './parsers/wavParser.js';
import { isAdtsAac, parseAac } from './parsers/aacParser.js';
import { isMp4Container, parseMp4Aac } from './parsers/mp4AacParser.js';
import { generateSampleChiptuneWav } from './utils/sampleGenerator.js';
import { HexViewer } from './ui/hexViewer.js';
import { InspectorUI } from './ui/inspector.js';
import { PixelAudioPlayer } from './audio/player.js';

const $ = (id) => document.getElementById(id);

const els = {
  fileInput: $('fileInput'),
  btnSampleWav: $('btnSampleWav'),
  formatBadge: $('formatBadge'),
  btnPlayPause: $('btnPlayPause'),
  btnStop: $('btnStop'),
  timeCurrent: $('timeCurrent'),
  timeTotal: $('timeTotal'),
  seekBar: $('seekBar'),
  volumeBar: $('volumeBar'),
  chkFollow: $('chkFollow'),
  visCanvas: $('visCanvas'),
  visModeWave: $('visModeWave'),
  visModeSpec: $('visModeSpec'),
  teleFileSize: $('teleFileSize'),
  teleSampleRate: $('teleSampleRate'),
  teleChannels: $('teleChannels'),
  teleActiveOffset: $('teleActiveOffset'),
  teleActiveUnit: $('teleActiveUnit'),
  teleEndian: $('teleEndian'),
  hexTotalBytes: $('hexTotalBytes'),
  jumpOffsetInput: $('jumpOffsetInput'),
  btnJumpOffset: $('btnJumpOffset'),
  btnJumpActive: $('btnJumpActive'),
  dropOverlay: $('dropOverlay'),
};

let parsedFile = null;
let isSeeking = false;

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

const hexViewer = new HexViewer({
  viewport: $('hexViewport'),
  spacer: $('hexSpacer'),
  rowsContainer: $('hexRows'),
  hoverEls: {
    offset: $('hoverOffset'),
    hex: $('hoverHex'),
    dec: $('hoverDec'),
    bin: $('hoverBin'),
    field: $('hoverField'),
  },
  onByteClick: (byteOffset) => {
    if (!parsedFile) return;
    const info = parsedFile.getFieldAt(byteOffset);
    if (!info || !info.chunk) return;
    inspector.selectChunk(info.chunk.index, info.field ? info.field.name : null);
    if (info.field) {
      hexViewer.setSelection(info.field.offset, info.field.offset + info.field.length);
    } else {
      hexViewer.setSelection(info.chunk.start, info.chunk.end);
    }
  },
});

const inspector = new InspectorUI({
  chunkListEl: $('chunkList'),
  chunkCountEl: $('chunkCountLabel'),
  selectedTitleEl: $('selectedBlockTitle'),
  selectedRangeEl: $('selectedBlockRange'),
  fieldDetailsEl: $('fieldDetails'),
  bitSampleEl: $('bitSampleView'),
  onSelectChunk: (chunk) => {
    hexViewer.setSelection(chunk.start, chunk.end);
    hexViewer.scrollToOffset(chunk.start, true);
  },
  onSelectField: (start, end) => {
    hexViewer.setSelection(start, end);
    hexViewer.scrollToOffset(start, true);
  },
});

const player = new PixelAudioPlayer({
  canvas: els.visCanvas,
  onTick: (timeSec, isPlaying) => {
    updatePlaybackUI(timeSec, isPlaying);
  },
  onEnded: () => {
    els.btnPlayPause.textContent = '[▶ PLAY]';
  },
});

function updatePlaybackUI(timeSec, isPlaying) {
  els.timeCurrent.textContent = formatTime(timeSec);
  if (!isSeeking && player.duration > 0) {
    els.seekBar.value = Math.round((timeSec / player.duration) * 1000);
  }
  els.btnPlayPause.textContent = isPlaying ? '[❚❚ PAUSE]' : '[▶ PLAY]';

  if (!parsedFile) return;
  const state = parsedFile.getPlaybackState(timeSec);
  if (!state) return;

  const offHex = `0x${(state.headerStart >= 0 ? state.headerStart : state.activeStart).toString(16).toUpperCase().padStart(6, '0')}`;
  els.teleActiveOffset.textContent = `${offHex} .. 0x${(state.activeEnd - 1).toString(16).toUpperCase()}`;
  els.teleActiveUnit.textContent = state.unitLabel;

  hexViewer.setPlaybackHighlight(
    state.headerStart,
    state.headerEnd,
    state.activeStart,
    state.activeEnd,
    isPlaying && els.chkFollow.checked
  );

  inspector.setPlayingChunk(state.chunkIndex, state);
}

async function loadArrayBuffer(buffer, fileName = 'audio') {
  const bytes = new Uint8Array(buffer);
  let parsed = null;

  try {
    if (isWavFile(bytes)) {
      parsed = parseWav(buffer);
    } else if (isMp4Container(bytes)) {
      parsed = parseMp4Aac(buffer);
    } else if (isAdtsAac(bytes) || fileName.toLowerCase().endsWith('.aac')) {
      parsed = parseAac(buffer);
    } else {
      throw new Error('不支援的檔案格式。請上傳標準 .wav (RIFF/WAVE) 或 .aac / .m4a (ADTS / MP4) 檔案。');
    }
  } catch (err) {
    alert(`解析失敗：\n${err.message}`);
    return;
  }

  parsedFile = parsed;

  // Update Format Badge & Telemetry
  els.formatBadge.className = `format-badge ${parsed.format === 'WAV' ? 'badge-wav' : 'badge-aac'}`;
  els.formatBadge.textContent = `${parsed.format} | ${fileName}`;

  els.teleFileSize.textContent = `${parsed.fileSize.toLocaleString()} bytes`;
  els.teleSampleRate.textContent = parsed.sampleRate ? `${parsed.sampleRate.toLocaleString()} Hz` : '-';
  els.teleChannels.textContent =
    parsed.format === 'WAV'
      ? `${parsed.channels} ch / ${parsed.bitsPerSample}-bit`
      : `${parsed.channels} ch / ${parsed.profile || 'AAC'}`;
  els.teleEndian.textContent = parsed.endianness;
  els.hexTotalBytes.textContent = `${parsed.fileSize.toLocaleString()} bytes`;

  // Populate Inspector & Hex Viewer
  inspector.setParsedFile(parsed);
  hexViewer.setParsedFile(parsed);

  // Load into Web Audio Player
  els.btnPlayPause.disabled = true;
  els.btnStop.disabled = true;
  els.seekBar.disabled = true;

  try {
    await player.load(buffer, parsed.durationSec);
    const totalDur = player.duration || parsed.durationSec;
    els.timeTotal.textContent = formatTime(totalDur);
    els.btnPlayPause.disabled = false;
    els.btnStop.disabled = false;
    els.seekBar.disabled = false;
  } catch (err) {
    els.timeTotal.textContent = formatTime(parsed.durationSec);
    alert(err.message);
  }

  updatePlaybackUI(0, false);
}

// Event Listeners
els.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  await loadArrayBuffer(buf, file.name);
  e.target.value = '';
});

els.btnSampleWav.addEventListener('click', async () => {
  const buf = generateSampleChiptuneWav();
  await loadArrayBuffer(buf, 'demo_chiptune.wav');
});

els.btnPlayPause.addEventListener('click', () => {
  if (player.isPlaying) {
    player.pause();
  } else {
    player.play();
  }
});

els.btnStop.addEventListener('click', () => {
  player.stop();
});

els.seekBar.addEventListener('input', () => {
  isSeeking = true;
  const targetTime = (Number(els.seekBar.value) / 1000) * player.duration;
  els.timeCurrent.textContent = formatTime(targetTime);
});

els.seekBar.addEventListener('change', () => {
  const targetTime = (Number(els.seekBar.value) / 1000) * player.duration;
  isSeeking = false;
  player.seek(targetTime);
});

els.volumeBar.addEventListener('input', () => {
  player.setVolume(Number(els.volumeBar.value) / 100);
});

els.visModeWave.addEventListener('click', () => {
  els.visModeWave.classList.add('active');
  els.visModeSpec.classList.remove('active');
  player.setVisMode('wave');
});

els.visModeSpec.addEventListener('click', () => {
  els.visModeSpec.classList.add('active');
  els.visModeWave.classList.remove('active');
  player.setVisMode('spec');
});

els.btnJumpOffset.addEventListener('click', () => {
  if (!parsedFile) return;
  const raw = els.jumpOffsetInput.value.trim();
  if (!raw) return;
  const off = raw.toLowerCase().startsWith('0x') ? parseInt(raw, 16) : parseInt(raw, 10);
  if (Number.isFinite(off)) {
    hexViewer.scrollToOffset(off, true);
    hexViewer.setSelection(off, off + 1);
  }
});

els.jumpOffsetInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.btnJumpOffset.click();
});

els.btnJumpActive.addEventListener('click', () => {
  if (!parsedFile) return;
  const state = parsedFile.getPlaybackState(player.getCurrentTime());
  if (!state) return;
  const off = state.headerStart >= 0 ? state.headerStart : state.activeStart;
  hexViewer.scrollToOffset(off, true);
});

// Tabs
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    const target = $(`tab-${btn.dataset.tab}`);
    if (target) target.classList.add('active');
  });
});

// Drag & Drop
let dragCounter = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  els.dropOverlay.classList.remove('hidden');
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    els.dropOverlay.classList.add('hidden');
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
});

window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  els.dropOverlay.classList.add('hidden');
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  await loadArrayBuffer(buf, file.name);
});
