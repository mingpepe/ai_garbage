const CONTAINER_BOXES = new Set([
  'moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts', 'udta',
]);

const BOX_DESCRIPTIONS = {
  ftyp: 'File Type Box：宣告檔案遵循的 MP4 / M4A 規範與相容品牌 (如 M4A 、mp42、isom)。',
  moov: 'Movie Box：儲存整個檔案的 Metadata 與索引表 (Container Box)，不包含實際音訊壓縮資料。',
  mvhd: 'Movie Header Box：記錄整個媒體的時間刻度 (Timescale)、總時長與預設播放速率。',
  trak: 'Track Box：代表一條獨立的媒體軌道 (音訊軌)。',
  tkhd: 'Track Header Box：記錄此軌道的 ID、時長與音量等基本屬性。',
  mdia: 'Media Box：包含媒體時間刻度、編碼資訊與 Sample 索引表的容器。',
  mdhd: 'Media Header Box：定義此音訊軌的 Timescale (通常等於取樣率如 44100) 與總樣本刻度數。',
  hdlr: 'Handler Reference Box：宣告軌道類型 ("soun" 代表 Sound 音訊軌)。',
  minf: 'Media Information Box：包含音訊媒體標頭 (smhd) 與 Sample Table (stbl)。',
  smhd: 'Sound Media Header Box：音訊專屬標頭，包含左右聲道平衡 (Balance)。',
  stbl: 'Sample Table Box：核心索引結構！將時間戳記映射至 mdat 中的位元組位置與大小。',
  stsd: 'Sample Description Box：包含編碼格式細節 (如 mp4a 與 esds AudioSpecificConfig)。',
  stts: 'Decoding Time-to-Sample Box：記錄每個 AAC Frame 佔用的時間長度 (通常為 1024 ticks)。',
  stsc: 'Sample-to-Chunk Box：描述每個 Chunk 包含幾個 AAC Samples。',
  stsz: 'Sample Size Box：記錄 mdat 內每一個 AAC Frame 的位元組長度 (因 VBR 各 Frame 長度不同)。',
  stco: 'Chunk Offset Box (32-bit)：記錄每個 Chunk 在檔案中的絕對起始位元組位址。',
  co64: 'Chunk Offset Box (64-bit)：大檔案用的 64-bit Chunk 起始位址表。',
  mdat: 'Media Data Box：實際存放壓縮後的 AAC Raw Access Units (無 ADTS 7-byte Header)。',
  free: 'Free Space Box：預留填充空間，解碼器直接略過。',
  skip: 'Skip Box：可略過的填充區塊。',
  meta: 'Metadata Box：存放專輯封面、曲名、演出者等 iTunes/MP4 標籤。',
};

const AOT_NAMES = {
  1: 'AAC Main',
  2: 'AAC LC (Low Complexity)',
  3: 'AAC SSR',
  4: 'AAC LTP',
  5: 'SBR (HE-AAC)',
  29: 'PS (HE-AAC v2)',
};

const SF_TABLE = [
  96000, 88200, 64000, 48000,
  44100, 32000, 24000, 22050,
  16000, 12000, 11025, 8000,
  7350,
];

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

export function isMp4Container(bytes) {
  if (bytes.length < 12) return false;
  return readAscii(bytes, 4, 4) === 'ftyp';
}

export function parseMp4Aac(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (!isMp4Container(bytes)) {
    throw new Error('非有效的 MP4/M4A 容器 (缺少 ftyp Box)。');
  }

  const chunks = [];
  const regions = []; // { start, end, cls, chunkIndex }

  let timescale = 44100;
  let sampleRate = 44100;
  let channels = 2;
  let bitsPerSample = 16;
  let profile = 'AAC LC';
  let mdatRange = null;

  // Sample table arrays
  let sttsEntries = [];
  let stscEntries = [];
  let stszConstant = 0;
  let stszSizes = [];
  let chunkOffsets = [];

  function addBoxFields(type, start, headerSize, end) {
    const fields = [
      {
        name: 'BoxSize (32b BE)',
        offset: start,
        length: 4,
        rawHex: toHexSlice(bytes, start, 4),
        value: `${end - start} bytes`,
        desc: 'Big-Endian 32-bit 無符號整數，表示整個 Box 的總長度 (含 8 bytes Header)。',
      },
      {
        name: 'BoxType (4B ASCII)',
        offset: start + 4,
        length: 4,
        rawHex: toHexSlice(bytes, start + 4, 4),
        value: `"${type}"`,
        desc: BOX_DESCRIPTIONS[type] || `ISO BMFF Box "${type}"`,
      },
    ];

    const payloadStart = start + headerSize;
    const payloadLen = end - payloadStart;

    if (type === 'ftyp' && payloadLen >= 8) {
      const majorBrand = readAscii(bytes, payloadStart, 4);
      const minorVer = view.getUint32(payloadStart + 4, false);
      const compat = [];
      for (let p = payloadStart + 8; p + 4 <= end; p += 4) {
        compat.push(readAscii(bytes, p, 4));
      }
      fields.push(
        {
          name: 'major_brand',
          offset: payloadStart,
          length: 4,
          rawHex: toHexSlice(bytes, payloadStart, 4),
          value: `"${majorBrand}"`,
          desc: '主要相容品牌識別碼 (例如 "M4A "、"mp42"、"isom")。',
        },
        {
          name: 'minor_version',
          offset: payloadStart + 4,
          length: 4,
          rawHex: toHexSlice(bytes, payloadStart + 4, 4),
          value: `${minorVer}`,
          desc: '主要品牌的次要版本號。',
        },
        {
          name: 'compatible_brands',
          offset: payloadStart + 8,
          length: Math.max(0, end - (payloadStart + 8)),
          rawHex: toHexSlice(bytes, payloadStart + 8, Math.min(8, end - (payloadStart + 8))),
          value: compat.join(', ') || '-',
          desc: '此檔案相容的其他標準品牌清單。',
        }
      );
    } else if (type === 'mdhd' && payloadLen >= 20) {
      const version = bytes[payloadStart];
      if (version === 0 && payloadLen >= 24) {
        timescale = view.getUint32(payloadStart + 12, false) || 44100;
        const dur = view.getUint32(payloadStart + 16, false);
        fields.push(
          {
            name: 'timescale',
            offset: payloadStart + 12,
            length: 4,
            rawHex: toHexSlice(bytes, payloadStart + 12, 4),
            value: `${timescale} ticks/sec`,
            desc: '每秒的時間刻度數，音訊軌通常設為與取樣率相同 (例如 44100 或 48000)。',
          },
          {
            name: 'duration',
            offset: payloadStart + 16,
            length: 4,
            rawHex: toHexSlice(bytes, payloadStart + 16, 4),
            value: `${dur} ticks (${(dur / timescale).toFixed(3)} s)`,
            desc: '以 timescale 為單位的軌道總長度。',
          }
        );
      }
    } else if (type === 'stsd' && payloadLen >= 16) {
      const entryCount = view.getUint32(payloadStart + 4, false);
      const entryPos = payloadStart + 8;
      if (entryPos + 36 <= end) {
        const format = readAscii(bytes, entryPos + 4, 4);
        channels = view.getUint16(entryPos + 24, false) || 2;
        bitsPerSample = view.getUint16(entryPos + 26, false) || 16;
        const srFixed = view.getUint32(entryPos + 32, false) >>> 16;
        if (srFixed > 0) sampleRate = srFixed;

        fields.push(
          {
            name: 'entry_count / format',
            offset: entryPos + 4,
            length: 4,
            rawHex: toHexSlice(bytes, entryPos + 4, 4),
            value: `"${format}" (${entryCount} entry)`,
            desc: '編碼格式識別碼，"mp4a" 代表 MPEG-4 Audio (通常為 AAC)。',
          },
          {
            name: 'channels / sampleSize',
            offset: entryPos + 24,
            length: 4,
            rawHex: toHexSlice(bytes, entryPos + 24, 4),
            value: `${channels} ch / ${bitsPerSample}-bit`,
            desc: '聲道數與解碼後的樣本位元深度。',
          },
          {
            name: 'sampleRate (16.16)',
            offset: entryPos + 32,
            length: 4,
            rawHex: toHexSlice(bytes, entryPos + 32, 4),
            value: `${sampleRate} Hz`,
            desc: '16.16 定點數表示的音訊取樣率。',
          }
        );

        // Scan for esds inside mp4a
        for (let p = entryPos + 36; p + 8 <= end; p++) {
          if (readAscii(bytes, p + 4, 4) === 'esds') {
            // Find DecoderSpecificInfo tag 0x05 inside esds
            for (let q = p + 12; q + 4 <= end; q++) {
              if (bytes[q] === 0x05) {
                let lenBytePos = q + 1;
                while (lenBytePos < end && (bytes[lenBytePos] & 0x80)) lenBytePos++;
                const ascPos = lenBytePos + 1;
                if (ascPos + 2 <= end) {
                  const b0 = bytes[ascPos];
                  const b1 = bytes[ascPos + 1];
                  const aot = (b0 >> 3) & 0x1f;
                  const sfIdx = ((b0 & 0x07) << 1) | ((b1 >> 7) & 0x01);
                  const chCfg = (b1 >> 3) & 0x0f;
                  if (AOT_NAMES[aot]) profile = AOT_NAMES[aot];
                  if (SF_TABLE[sfIdx]) sampleRate = SF_TABLE[sfIdx];
                  if (chCfg > 0) channels = chCfg;

                  fields.push({
                    name: 'esds AudioSpecificConfig',
                    offset: ascPos,
                    length: 2,
                    rawHex: toHexSlice(bytes, ascPos, 2),
                    value: `${profile}, ${sampleRate} Hz, ${channels} ch`,
                    desc: '取代 ADTS Header 的全域組態！MP4 容器把 Profile/取樣率/聲道集中存放在 esds，因此 mdat 裡的每個 AAC Frame 不需要再重複帶 7-byte ADTS Header。',
                  });
                }
                break;
              }
            }
            break;
          }
        }
      }
    } else if (type === 'stts' && payloadLen >= 8) {
      const count = view.getUint32(payloadStart + 4, false);
      for (let i = 0; i < count && payloadStart + 8 + i * 8 + 8 <= end; i++) {
        const sCount = view.getUint32(payloadStart + 8 + i * 8, false);
        const sDelta = view.getUint32(payloadStart + 12 + i * 8, false);
        sttsEntries.push({ count: sCount, delta: sDelta });
      }
      fields.push({
        name: 'stts entries',
        offset: payloadStart + 4,
        length: Math.min(12, end - (payloadStart + 4)),
        rawHex: toHexSlice(bytes, payloadStart + 4, Math.min(8, end - (payloadStart + 4))),
        value: `${count} entries (${sttsEntries[0]?.delta || 1024} ticks/frame)`,
        desc: '記錄每個 AAC Frame 對應的解碼時間增量 (通常為 1024 samples)。',
      });
    } else if (type === 'stsc' && payloadLen >= 8) {
      const count = view.getUint32(payloadStart + 4, false);
      for (let i = 0; i < count && payloadStart + 8 + i * 12 + 12 <= end; i++) {
        const firstChunk = view.getUint32(payloadStart + 8 + i * 12, false);
        const samplesPerChunk = view.getUint32(payloadStart + 12 + i * 12, false);
        stscEntries.push({ firstChunk, samplesPerChunk });
      }
      fields.push({
        name: 'stsc entries',
        offset: payloadStart + 4,
        length: Math.min(16, end - (payloadStart + 4)),
        rawHex: toHexSlice(bytes, payloadStart + 4, Math.min(8, end - (payloadStart + 4))),
        value: `${count} entries`,
        desc: '對照表：定義每個 Chunk 裡裝了幾個 AAC Samples。',
      });
    } else if (type === 'stsz' && payloadLen >= 12) {
      stszConstant = view.getUint32(payloadStart + 4, false);
      const sampleCount = view.getUint32(payloadStart + 8, false);
      if (stszConstant === 0) {
        for (let i = 0; i < sampleCount && payloadStart + 12 + i * 4 + 4 <= end; i++) {
          stszSizes.push(view.getUint32(payloadStart + 12 + i * 4, false));
        }
      } else {
        for (let i = 0; i < sampleCount; i++) stszSizes.push(stszConstant);
      }
      fields.push({
        name: 'sample_count / sizes',
        offset: payloadStart + 4,
        length: Math.min(16, end - (payloadStart + 4)),
        rawHex: toHexSlice(bytes, payloadStart + 4, Math.min(8, end - (payloadStart + 4))),
        value: `${sampleCount} AAC frames (${stszConstant === 0 ? 'VBR 可變長度' : `CBR ${stszConstant}B`})`,
        desc: '列出 mdat 中每一個壓縮 AAC Frame 的精確位元組長度。播放定位時需靠此表計算位址！',
      });
    } else if (type === 'stco' && payloadLen >= 8) {
      const count = view.getUint32(payloadStart + 4, false);
      for (let i = 0; i < count && payloadStart + 8 + i * 4 + 4 <= end; i++) {
        chunkOffsets.push(view.getUint32(payloadStart + 8 + i * 4, false));
      }
      fields.push({
        name: 'chunk_offsets',
        offset: payloadStart + 4,
        length: Math.min(12, end - (payloadStart + 4)),
        rawHex: toHexSlice(bytes, payloadStart + 4, Math.min(8, end - (payloadStart + 4))),
        value: `${count} chunks (first @ 0x${(chunkOffsets[0] || 0).toString(16).toUpperCase()})`,
        desc: '各 Chunk 在檔案中的絕對起始位址，指向 mdat 內的音訊資料。',
      });
    } else if (type === 'co64' && payloadLen >= 8) {
      const count = view.getUint32(payloadStart + 4, false);
      for (let i = 0; i < count && payloadStart + 8 + i * 8 + 8 <= end; i++) {
        const hi = view.getUint32(payloadStart + 8 + i * 8, false);
        const lo = view.getUint32(payloadStart + 12 + i * 8, false);
        chunkOffsets.push(hi * 4294967296 + lo);
      }
      fields.push({
        name: 'chunk_offsets_64',
        offset: payloadStart + 4,
        length: Math.min(12, end - (payloadStart + 4)),
        rawHex: toHexSlice(bytes, payloadStart + 4, Math.min(8, end - (payloadStart + 4))),
        value: `${count} chunks (64-bit)`,
        desc: '64-bit 版本的 Chunk 起始位址表。',
      });
    } else if (type === 'mdat') {
      mdatRange = { start: payloadStart, end };
      fields.push({
        name: 'MediaPayload (Raw AAC)',
        offset: payloadStart,
        length: payloadLen,
        rawHex: `${toHexSlice(bytes, payloadStart, Math.min(8, payloadLen))} ...`,
        value: `${payloadLen.toLocaleString()} bytes`,
        desc: '存放純 AAC 壓縮 Access Units。與 ADTS 不同，這裡沒有 0xFFF 檔頭，必須靠 moov/stbl 索引表定位！',
      });
    } else if (payloadLen > 0) {
      fields.push({
        name: 'BoxPayload',
        offset: payloadStart,
        length: payloadLen,
        rawHex: toHexSlice(bytes, payloadStart, Math.min(8, payloadLen)),
        value: `${payloadLen.toLocaleString()} bytes`,
        desc: BOX_DESCRIPTIONS[type] || `${type} 區塊資料。`,
      });
    }

    return fields;
  }

  function walkBoxes(start, end, depth) {
    let pos = start;
    while (pos + 8 <= end) {
      let size = view.getUint32(pos, false);
      const type = readAscii(bytes, pos + 4, 4);
      let headerSize = 8;

      if (size === 1 && pos + 16 <= end) {
        const hi = view.getUint32(pos + 8, false);
        const lo = view.getUint32(pos + 12, false);
        size = hi * 4294967296 + lo;
        headerSize = 16;
      } else if (size === 0) {
        size = end - pos;
      }

      if (size < headerSize || pos + size > end) break;

      const boxEnd = pos + size;
      const chunkIdx = chunks.length;
      const isContainer = CONTAINER_BOXES.has(type);

      const tagClass =
        type === 'ftyp' ? 'tag-riff' :
        type === 'mdat' ? 'tag-data' :
        type === 'moov' || type === 'stbl' || type === 'stsd' ? 'tag-fmt' : 'tag-meta';

      const indent = depth > 0 ? `${'  '.repeat(depth)}└ ` : '';
      const fields = addBoxFields(type, pos, headerSize, boxEnd);

      chunks.push({
        index: chunkIdx,
        id: type,
        tagClass,
        title: `${indent}${type} Box`,
        start: pos,
        end: boxEnd,
        size,
        summary: `${size.toLocaleString()} B @ 0x${pos.toString(16).toUpperCase()}`,
        fields,
      });

      const regCls =
        type === 'ftyp' ? 'reg-riff' :
        type === 'mdat' ? 'reg-data' :
        type === 'stsd' || type === 'stsz' || type === 'stco' || type === 'stts' ? 'reg-fmt' : 'reg-meta';

      if (isContainer) {
        regions.push({ start: pos, end: pos + headerSize, cls: regCls, chunkIndex: chunkIdx });
        walkBoxes(pos + headerSize, boxEnd, depth + 1);
      } else if (type === 'mdat') {
        regions.push({ start: pos, end: pos + headerSize, cls: 'reg-data-hdr', chunkIndex: chunkIdx });
        regions.push({ start: pos + headerSize, end: boxEnd, cls: 'reg-data', chunkIndex: chunkIdx });
      } else {
        regions.push({ start: pos, end: boxEnd, cls: regCls, chunkIndex: chunkIdx });
      }

      pos = boxEnd;
    }
  }

  walkBoxes(0, bytes.length, 0);

  // Build exact sample timeline from stco + stsc + stsz + stts
  const samples = [];
  if (chunkOffsets.length > 0 && stszSizes.length > 0) {
    let sampleIdx = 0;
    let sttsIdx = 0;
    let sttsRemaining = sttsEntries[0]?.count || stszSizes.length;
    let curTick = 0;
    const effTimescale = timescale || sampleRate || 44100;

    for (let c = 0; c < chunkOffsets.length && sampleIdx < stszSizes.length; c++) {
      const chunkNum = c + 1;
      let spc = 1;
      for (let k = 0; k < stscEntries.length; k++) {
        if (stscEntries[k].firstChunk <= chunkNum) {
          spc = stscEntries[k].samplesPerChunk;
        } else {
          break;
        }
      }

      let bytePos = chunkOffsets[c];
      for (let s = 0; s < spc && sampleIdx < stszSizes.length; s++) {
        const sSize = stszSizes[sampleIdx];
        const delta = sttsEntries[sttsIdx]?.delta || 1024;
        const startTime = curTick / effTimescale;
        curTick += delta;
        const endTime = curTick / effTimescale;

        samples.push({
          index: sampleIdx,
          start: bytePos,
          end: Math.min(bytes.length, bytePos + sSize),
          size: sSize,
          startTime,
          endTime,
        });

        bytePos += sSize;
        sampleIdx++;
        sttsRemaining--;
        if (sttsRemaining <= 0 && sttsIdx + 1 < sttsEntries.length) {
          sttsIdx++;
          sttsRemaining = sttsEntries[sttsIdx].count;
        }
      }
    }
  }

  const durationSec = samples.length > 0 ? samples[samples.length - 1].endTime : 0;

  function getRegionAt(byteOffset) {
    // Leaf-most region wins (last matching in regions array)
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (byteOffset >= r.start && byteOffset < r.end) return r;
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

  function findSampleAtTime(timeSec) {
    if (samples.length === 0) return null;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = samples[mid];
      if (timeSec < s.startTime) hi = mid - 1;
      else if (timeSec >= s.endTime) lo = mid + 1;
      else return s;
    }
    return samples[Math.min(samples.length - 1, Math.max(0, lo))];
  }

  function getPlaybackState(timeSec) {
    const s = findSampleAtTime(timeSec);
    const mdatChunkIdx = chunks.findIndex((c) => c.id === 'mdat');
    if (s) {
      return {
        headerStart: -1,
        headerEnd: -1,
        activeStart: s.start,
        activeEnd: s.end,
        unitLabel: `MP4 AAC Unit #${s.index} / ${samples.length - 1} (${s.size}B)`,
        chunkIndex: mdatChunkIdx,
      };
    }
    if (mdatRange) {
      return {
        headerStart: -1,
        headerEnd: -1,
        activeStart: mdatRange.start,
        activeEnd: Math.min(mdatRange.end, mdatRange.start + 16),
        unitLabel: 'mdat Payload',
        chunkIndex: mdatChunkIdx,
      };
    }
    return null;
  }

  return {
    format: 'AAC (MP4)',
    endianness: 'Big-Endian (ISO BMFF)',
    fileSize: bytes.length,
    bytes,
    sampleRate,
    channels,
    bitsPerSample,
    profile,
    durationSec,
    chunks,
    samples,
    getRegionAt,
    getFieldAt,
    getPlaybackState,
  };
}
