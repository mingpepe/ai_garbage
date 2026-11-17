const AUDIO_FORMATS = {
  0x0001: 'PCM (Uncompressed Integer)',
  0x0003: 'IEEE Float (Uncompressed Float)',
  0x0006: 'ITU-T G.711 A-law',
  0x0007: 'ITU-T G.711 mu-law',
  0x0011: 'IMA ADPCM',
  0xFFFE: 'WAVE_FORMAT_EXTENSIBLE',
};

const INFO_TAG_NAMES = {
  INAM: '標題 (Title)',
  IART: '演出者 (Artist)',
  IPRD: '專輯 (Product/Album)',
  ICRD: '建立日期 (Creation Date)',
  ISFT: '製作軟體 (Software)',
  ICMT: '備註 (Comment)',
  IGNR: '類型 (Genre)',
  ITRK: '音軌編號 (Track)',
};

function readAscii(bytes, offset, length) {
  let out = '';
  for (let i = 0; i < length && offset + i < bytes.length; i++) {
    const c = bytes[offset + i];
    out += c >= 32 && c <= 126 ? String.fromCharCode(c) : '.';
  }
  return out;
}

function toHexSlice(bytes, offset, length) {
  const arr = [];
  const end = Math.min(bytes.length, offset + length);
  for (let i = offset; i < end; i++) {
    arr.push(bytes[i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return arr.join(' ');
}

export function isWavFile(bytes) {
  if (bytes.length < 12) return false;
  return (
    readAscii(bytes, 0, 4) === 'RIFF' &&
    readAscii(bytes, 8, 4) === 'WAVE'
  );
}

export function parseWav(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (!isWavFile(bytes)) {
    throw new Error('非有效的 RIFF/WAVE (.wav) 檔案：檔頭缺少 RIFF 或 WAVE 識別字。');
  }

  const chunks = [];
  const regions = []; // { start, end, cls, chunkIndex, label }

  const riffSize = view.getUint32(4, true);
  const riffBlock = {
    index: 0,
    id: 'RIFF',
    tagClass: 'tag-riff',
    title: 'RIFF Container Header',
    start: 0,
    end: 12,
    size: 12,
    summary: `Total Declared: ${riffSize + 8} bytes`,
    fields: [
      {
        name: 'ChunkID',
        offset: 0,
        length: 4,
        rawHex: toHexSlice(bytes, 0, 4),
        value: '"RIFF"',
        desc: 'Resource Interchange File Format 識別碼，固定為 ASCII 字串 "RIFF"，代表這是一個標準的 RIFF 容器檔案。',
      },
      {
        name: 'ChunkSize',
        offset: 4,
        length: 4,
        rawHex: toHexSlice(bytes, 4, 4),
        value: `${riffSize} bytes (Little-Endian)`,
        desc: `扣除此欄位本身與 ChunkID (共 8 bytes) 後的剩餘檔案大小。實際總檔長應為 ${riffSize} + 8 = ${riffSize + 8} bytes。`,
      },
      {
        name: 'Format',
        offset: 8,
        length: 4,
        rawHex: toHexSlice(bytes, 8, 4),
        value: '"WAVE"',
        desc: 'RIFF 的子格式類型，固定為 "WAVE"，表示容器內裝載的是 WAV 音訊資料。',
      },
    ],
  };
  chunks.push(riffBlock);
  regions.push({ start: 0, end: 12, cls: 'reg-riff', chunkIndex: 0, label: 'RIFF Header' });

  let fmtInfo = null;
  let dataInfo = null;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const id = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const payloadStart = offset + 8;
    const payloadEnd = Math.min(bytes.length, payloadStart + size);
    const pad = size % 2;
    const nextOffset = Math.min(bytes.length, payloadEnd + pad);
    const chunkIdx = chunks.length;

    const fields = [
      {
        name: 'SubchunkID',
        offset,
        length: 4,
        rawHex: toHexSlice(bytes, offset, 4),
        value: `"${id}"`,
        desc: `4-byte ASCII 區塊識別字，定義此 Chunk 的用途。`,
      },
      {
        name: 'SubchunkSize',
        offset: offset + 4,
        length: 4,
        rawHex: toHexSlice(bytes, offset + 4, 4),
        value: `${size} bytes`,
        desc: `此 Chunk 資料酬載的位元組長度 (不含這 8 bytes 的 Chunk Header)。${pad ? '因長度為奇數，結尾會補 1 byte 0x00 對齊偶數位址。' : ''}`,
      },
    ];

    let tagClass = 'tag-meta';
    let title = `${id.trim() || id} Chunk`;
    let summary = `${size} bytes @ 0x${offset.toString(16).toUpperCase()}`;

    if (id === 'fmt ') {
      tagClass = 'tag-fmt';
      title = 'fmt  (Audio Format Chunk)';
      if (payloadStart + 16 <= bytes.length) {
        const audioFormat = view.getUint16(payloadStart, true);
        const numChannels = view.getUint16(payloadStart + 2, true);
        const sampleRate = view.getUint32(payloadStart + 4, true);
        const byteRate = view.getUint32(payloadStart + 8, true);
        const blockAlign = view.getUint16(payloadStart + 12, true);
        const bitsPerSample = view.getUint16(payloadStart + 14, true);

        fmtInfo = {
          audioFormat,
          formatName: AUDIO_FORMATS[audioFormat] || `Format 0x${audioFormat.toString(16)}`,
          numChannels,
          sampleRate,
          byteRate,
          blockAlign,
          bitsPerSample,
        };
        summary = `${sampleRate} Hz, ${numChannels}ch, ${bitsPerSample}-bit`;

        fields.push(
          {
            name: 'AudioFormat',
            offset: payloadStart,
            length: 2,
            rawHex: toHexSlice(bytes, payloadStart, 2),
            value: `${audioFormat} (${fmtInfo.formatName})`,
            desc: '編碼格式代碼：1 代表未壓縮線性 PCM；3 代表 IEEE 浮點數；其他值代表壓縮或擴展格式。',
          },
          {
            name: 'NumChannels',
            offset: payloadStart + 2,
            length: 2,
            rawHex: toHexSlice(bytes, payloadStart + 2, 2),
            value: `${numChannels} (${numChannels === 1 ? 'Mono 單聲道' : numChannels === 2 ? 'Stereo 立體聲' : `${numChannels} 聲道`})`,
            desc: '音訊聲道數。多聲道在 data 區塊中會以交錯 (Interleaved) 方式排列，例如 L, R, L, R...。',
          },
          {
            name: 'SampleRate',
            offset: payloadStart + 4,
            length: 4,
            rawHex: toHexSlice(bytes, payloadStart + 4, 4),
            value: `${sampleRate} Hz`,
            desc: '取樣率：每秒鐘對類比訊號採樣的次數 (常見為 44100 Hz 或 48000 Hz)。',
          },
          {
            name: 'ByteRate',
            offset: payloadStart + 8,
            length: 4,
            rawHex: toHexSlice(bytes, payloadStart + 8, 4),
            value: `${byteRate} B/s (${((byteRate * 8) / 1000).toFixed(1)} kbps)`,
            desc: `每秒音訊資料量 = SampleRate (${sampleRate}) × NumChannels (${numChannels}) × BitsPerSample (${bitsPerSample}) / 8。`,
          },
          {
            name: 'BlockAlign',
            offset: payloadStart + 12,
            length: 2,
            rawHex: toHexSlice(bytes, payloadStart + 12, 2),
            value: `${blockAlign} bytes/frame`,
            desc: `單一「取樣框架 (Sample Frame)」佔用的總位元組數 = NumChannels × BitsPerSample / 8。播放時每次前進一組完整聲道樣本即為 ${blockAlign} bytes。`,
          },
          {
            name: 'BitsPerSample',
            offset: payloadStart + 14,
            length: 2,
            rawHex: toHexSlice(bytes, payloadStart + 14, 2),
            value: `${bitsPerSample} bits`,
            desc: '位元深度：每個單聲道樣本的解析度 (如 16-bit signed integer 範圍為 -32768 ~ +32767)。',
          }
        );

        if (size >= 18 && payloadStart + 18 <= payloadEnd) {
          const cbSize = view.getUint16(payloadStart + 16, true);
          fields.push({
            name: 'cbSize',
            offset: payloadStart + 16,
            length: 2,
            rawHex: toHexSlice(bytes, payloadStart + 16, 2),
            value: `${cbSize} bytes`,
            desc: '額外格式資訊的位元組長度 (僅當 SubchunkSize > 16 時存在)。',
          });
        }
      }
      regions.push({ start: offset, end: nextOffset, cls: 'reg-fmt', chunkIndex: chunkIdx, label: 'fmt  Chunk' });
    } else if (id === 'data') {
      tagClass = 'tag-data';
      title = 'data (PCM Audio Payload)';
      dataInfo = {
        chunkOffset: offset,
        dataStart: payloadStart,
        dataEnd: payloadEnd,
        dataSize: payloadEnd - payloadStart,
      };
      fields.push({
        name: 'AudioPayload',
        offset: payloadStart,
        length: payloadEnd - payloadStart,
        rawHex: `${toHexSlice(bytes, payloadStart, Math.min(8, payloadEnd - payloadStart))} ...`,
        value: `${(payloadEnd - payloadStart).toLocaleString()} bytes`,
        desc: '實際的音訊樣本陣列。播放時會依據目前時間 t 與 SampleRate、BlockAlign 直接線性定位到此區間內的對應位元組。',
      });
      regions.push({ start: offset, end: payloadStart, cls: 'reg-data-hdr', chunkIndex: chunkIdx, label: 'data Header' });
      regions.push({ start: payloadStart, end: nextOffset, cls: 'reg-data', chunkIndex: chunkIdx, label: 'data PCM Samples' });
    } else if (id === 'LIST' && payloadStart + 4 <= payloadEnd) {
      const listType = readAscii(bytes, payloadStart, 4);
      title = `LIST (${listType} Metadata)`;
      fields.push({
        name: 'ListTypeID',
        offset: payloadStart,
        length: 4,
        rawHex: toHexSlice(bytes, payloadStart, 4),
        value: `"${listType}"`,
        desc: 'LIST 區塊的類型識別碼，常見為 "INFO"，用來存放曲名、作者等詮釋資料。',
      });

      let subOff = payloadStart + 4;
      while (subOff + 8 <= payloadEnd) {
        const subId = readAscii(bytes, subOff, 4);
        const subLen = view.getUint32(subOff + 4, true);
        const valStart = subOff + 8;
        const valEnd = Math.min(payloadEnd, valStart + subLen);
        const textVal = readAscii(bytes, valStart, valEnd - valStart).replace(/\0+$/, '');
        fields.push({
          name: subId,
          offset: subOff,
          length: 8 + (valEnd - valStart),
          rawHex: toHexSlice(bytes, valStart, Math.min(8, valEnd - valStart)),
          value: `"${textVal}"`,
          desc: INFO_TAG_NAMES[subId] || `LIST/${listType} 子標籤 (${subId})`,
        });
        subOff = valEnd + (subLen % 2);
      }
      regions.push({ start: offset, end: nextOffset, cls: 'reg-meta', chunkIndex: chunkIdx, label: `LIST (${listType})` });
    } else {
      fields.push({
        name: 'RawData',
        offset: payloadStart,
        length: payloadEnd - payloadStart,
        rawHex: toHexSlice(bytes, payloadStart, Math.min(8, payloadEnd - payloadStart)),
        value: `${payloadEnd - payloadStart} bytes`,
        desc: `輔助或自訂區塊 (${id})，播放器可依需求讀取或略過。`,
      });
      regions.push({ start: offset, end: nextOffset, cls: 'reg-meta', chunkIndex: chunkIdx, label: `${id} Chunk` });
    }

    chunks.push({
      index: chunkIdx,
      id,
      tagClass,
      title,
      start: offset,
      end: nextOffset,
      size,
      summary,
      fields,
    });

    if (nextOffset <= offset) break;
    offset = nextOffset;
  }

  const durationSec =
    fmtInfo && dataInfo && fmtInfo.byteRate > 0
      ? dataInfo.dataSize / fmtInfo.byteRate
      : 0;

  // Binary search region by byte offset
  function getRegionAt(byteOffset) {
    let lo = 0;
    let hi = regions.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = regions[mid];
      if (byteOffset < r.start) hi = mid - 1;
      else if (byteOffset >= r.end) lo = mid + 1;
      else return r;
    }
    return null;
  }

  function getFieldAt(byteOffset) {
    const reg = getRegionAt(byteOffset);
    if (!reg) return null;
    const chunk = chunks[reg.chunkIndex];
    if (!chunk) return null;
    for (const f of chunk.fields) {
      if (byteOffset >= f.offset && byteOffset < f.offset + f.length) {
        return { chunk, field: f };
      }
    }
    return { chunk, field: null };
  }

  function readSampleAt(sampleIndex) {
    if (!fmtInfo || !dataInfo || fmtInfo.blockAlign <= 0) return [];
    const base = dataInfo.dataStart + sampleIndex * fmtInfo.blockAlign;
    if (base + fmtInfo.blockAlign > dataInfo.dataEnd) return [];
    const bytesPerCh = Math.floor(fmtInfo.blockAlign / fmtInfo.numChannels);
    const out = [];

    for (let ch = 0; ch < fmtInfo.numChannels; ch++) {
      const pos = base + ch * bytesPerCh;
      let val = 0;
      let norm = 0;
      if (fmtInfo.bitsPerSample === 8) {
        val = bytes[pos];
        norm = (val - 128) / 128;
      } else if (fmtInfo.bitsPerSample === 16) {
        val = view.getInt16(pos, true);
        norm = val / 32768;
      } else if (fmtInfo.bitsPerSample === 24) {
        let v = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16);
        if (v & 0x800000) v |= ~0xffffff;
        val = v;
        norm = v / 8388608;
      } else if (fmtInfo.bitsPerSample === 32) {
        if (fmtInfo.audioFormat === 3) {
          val = view.getFloat32(pos, true);
          norm = Math.max(-1, Math.min(1, val));
        } else {
          val = view.getInt32(pos, true);
          norm = val / 2147483648;
        }
      }
      out.push({
        channel: ch + 1,
        offset: pos,
        rawHex: toHexSlice(bytes, pos, bytesPerCh),
        value: typeof val === 'number' && !Number.isInteger(val) ? val.toFixed(5) : val,
        normalized: norm,
      });
    }
    return out;
  }

  function getPlaybackState(timeSec) {
    if (!fmtInfo || !dataInfo || fmtInfo.sampleRate <= 0 || fmtInfo.blockAlign <= 0) {
      return null;
    }
    const totalSamples = Math.floor(dataInfo.dataSize / fmtInfo.blockAlign);
    const sampleIdx = Math.max(0, Math.min(totalSamples - 1, Math.floor(timeSec * fmtInfo.sampleRate)));
    const activeStart = dataInfo.dataStart + sampleIdx * fmtInfo.blockAlign;
    // Highlight a 1-frame window (or up to 16 bytes for visibility) around the playhead
    const windowBytes = Math.max(fmtInfo.blockAlign, 16);
    const activeEnd = Math.min(dataInfo.dataEnd, activeStart + windowBytes);

    return {
      activeStart,
      activeEnd,
      headerStart: -1,
      headerEnd: -1,
      sampleIndex: sampleIdx,
      totalSamples,
      unitLabel: `Sample #${sampleIdx.toLocaleString()} / ${totalSamples.toLocaleString()}`,
      chunkIndex: chunks.findIndex((c) => c.id === 'data'),
      samples: readSampleAt(sampleIdx),
    };
  }

  return {
    format: 'WAV',
    endianness: 'Little-Endian (RIFF)',
    fileSize: bytes.length,
    bytes,
    sampleRate: fmtInfo?.sampleRate ?? 0,
    channels: fmtInfo?.numChannels ?? 0,
    bitsPerSample: fmtInfo?.bitsPerSample ?? 0,
    durationSec,
    chunks,
    fmtInfo,
    dataInfo,
    getRegionAt,
    getFieldAt,
    getPlaybackState,
    timeToOffset(timeSec) {
      if (!fmtInfo || !dataInfo) return 0;
      const sampleIdx = Math.floor(timeSec * fmtInfo.sampleRate);
      return Math.min(dataInfo.dataEnd, dataInfo.dataStart + sampleIdx * fmtInfo.blockAlign);
    },
    offsetToTime(byteOffset) {
      if (!fmtInfo || !dataInfo || byteOffset < dataInfo.dataStart) return 0;
      const rel = Math.min(dataInfo.dataSize, byteOffset - dataInfo.dataStart);
      const sampleIdx = Math.floor(rel / fmtInfo.blockAlign);
      return sampleIdx / fmtInfo.sampleRate;
    },
  };
}
