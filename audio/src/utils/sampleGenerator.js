/**
 * Generates an 8-bit chiptune-style 16-bit Stereo PCM WAV file with RIFF, fmt, LIST/INFO, and data chunks.
 */
export function generateSampleChiptuneWav() {
  const sampleRate = 22050;
  const numChannels = 2;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const durationSec = 4.0;
  const totalFrames = Math.floor(sampleRate * durationSec);
  const dataSize = totalFrames * blockAlign;

  // Build LIST/INFO metadata chunk
  const infoEntries = [
    ['INAM', 'Pixel Arpeggio 8-Bit'],
    ['IART', 'PIXEL AUDIO HEX'],
    ['ISFT', 'WebAudio Synth v1'],
  ];

  const subChunks = [];
  for (const [id, text] of infoEntries) {
    const strBytes = new TextEncoder().encode(text + '\0');
    const pad = strBytes.length % 2;
    const buf = new Uint8Array(8 + strBytes.length + pad);
    const dv = new DataView(buf.buffer);
    for (let i = 0; i < 4; i++) buf[i] = id.charCodeAt(i);
    dv.setUint32(4, strBytes.length, true);
    buf.set(strBytes, 8);
    subChunks.push(buf);
  }

  const listPayloadLen = 4 + subChunks.reduce((acc, c) => acc + c.length, 0);
  const listChunkLen = 8 + listPayloadLen;
  const fmtChunkLen = 8 + 16;
  const dataChunkLen = 8 + dataSize;
  const totalSize = 12 + fmtChunkLen + listChunkLen + dataChunkLen;

  const buffer = new ArrayBuffer(totalSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i);
  };

  // RIFF Header
  writeStr(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeStr(8, 'WAVE');

  // fmt  Chunk
  let pos = 12;
  writeStr(pos, 'fmt ');
  view.setUint32(pos + 4, 16, true);
  view.setUint16(pos + 8, 1, true); // PCM
  view.setUint16(pos + 10, numChannels, true);
  view.setUint32(pos + 12, sampleRate, true);
  view.setUint32(pos + 16, byteRate, true);
  view.setUint16(pos + 20, blockAlign, true);
  view.setUint16(pos + 22, bitsPerSample, true);
  pos += fmtChunkLen;

  // LIST / INFO Chunk
  writeStr(pos, 'LIST');
  view.setUint32(pos + 4, listPayloadLen, true);
  writeStr(pos + 8, 'INFO');
  let subPos = pos + 12;
  for (const sc of subChunks) {
    bytes.set(sc, subPos);
    subPos += sc.length;
  }
  pos += listChunkLen;

  // data Chunk
  writeStr(pos, 'data');
  view.setUint32(pos + 4, dataSize, true);
  pos += 8;

  // Synthesize retro square + triangle chiptune arpeggio
  const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23, 440.0, 587.33, 440.0, 349.23];
  const noteDur = 0.16;

  for (let i = 0; i < totalFrames; i++) {
    const t = i / sampleRate;
    const noteIdx = Math.floor(t / noteDur) % notes.length;
    const freq = notes[noteIdx];
    const localT = t % noteDur;
    const env = Math.max(0, 1 - localT / noteDur) * 0.45;

    // Left: 25% pulse wave
    const phaseL = (t * freq) % 1;
    const square = phaseL < 0.25 ? 1 : -1;
    // Right: triangle bass an octave down
    const phaseR = (t * (freq * 0.5)) % 1;
    const tri = 4 * Math.abs(phaseR - 0.5) - 1;

    const sampleL = Math.max(-32767, Math.min(32767, Math.floor(square * env * 28000)));
    const sampleR = Math.max(-32767, Math.min(32767, Math.floor(tri * env * 28000)));

    const frameOff = pos + i * blockAlign;
    view.setInt16(frameOff, sampleL, true);
    view.setInt16(frameOff + 2, sampleR, true);
  }

  return buffer;
}
