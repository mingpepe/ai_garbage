const ADTS_SAMPLE_RATES = [
  96000, 88200, 64000, 48000,
  44100, 32000, 24000, 22050,
  16000, 12000, 11025, 8000,
  7350, 0, 0, 0,
];

const ADTS_PROFILES = {
  0: 'AAC Main',
  1: 'AAC LC (Low Complexity)',
  2: 'AAC SSR (Scalable Sample Rate)',
  3: 'AAC LTP (Long Term Prediction)',
};

const ADTS_CHANNELS = {
  0: 'Defined in AOT / PCE',
  1: '1 (Mono 單聲道)',
  2: '2 (Stereo 立體聲)',
  3: '3 (3.0: C, L, R)',
  4: '4 (4.0: C, L, R, Cs)',
  5: '5 (5.0: C, L, R, Ls, Rs)',
  6: '6 (5.1 Surround)',
  7: '8 (7.1 Surround)',
};

function toHexSlice(bytes, offset, length) {
  const arr = [];
  const end = Math.min(bytes.length, offset + length);
  for (let i = offset; i < end; i++) {
    arr.push(bytes[i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return arr.join(' ');
}

function readBits(bytes, startByte, bitOffset, bitLength) {
  let val = 0;
  for (let i = 0; i < bitLength; i++) {
    const absBit = bitOffset + i;
    const byteIdx = startByte + (absBit >> 3);
    const bitInByte = 7 - (absBit & 7);
    const bit = (bytes[byteIdx] >> bitInByte) & 1;
    val = (val << 1) | bit;
  }
  return val >>> 0;
}

function toBinStr(val, bits) {
  return val.toString(2).padStart(bits, '0');
}

export function isAdtsAac(bytes) {
  if (bytes.length < 7) return false;
  // Check optional ID3v2 header
  let pos = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 && bytes.length >= 10) {
    const id3Size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    pos = 10 + id3Size;
  }
  if (pos + 7 > bytes.length) return false;
  return bytes[pos] === 0xff && (bytes[pos + 1] & 0xf0) === 0xf0;
}

export function parseAac(buffer) {
  const bytes = new Uint8Array(buffer);

  // Detect MP4/M4A container to give an informative error
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    throw new Error(
      '偵測到 MP4/M4A 容器 (ftyp)，目前 AAC 解析器支援的是原始 ADTS (.aac) 串流格式 (以 0xFFF Syncword 開頭)。'
    );
  }

  const chunks = [];
  const frames = [];
  let offset = 0;

  // Optional ID3v2 Tag
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const verMajor = bytes[3];
    const verMinor = bytes[4];
    const flags = bytes[5];
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    const totalId3 = Math.min(bytes.length, 10 + tagSize);

    chunks.push({
      index: 0,
      id: 'ID3v2',
      tagClass: 'tag-meta',
      title: `ID3v2.${verMajor}.${verMinor} Metadata Tag`,
      start: 0,
      end: totalId3,
      size: totalId3,
      summary: `${totalId3} bytes`,
      isId3: true,
      fields: [
        {
          name: 'Identifier',
          offset: 0,
          length: 3,
          rawHex: toHexSlice(bytes, 0, 3),
          value: '"ID3"',
          desc: 'ID3v2 標籤開頭識別字，部分 .aac 檔案會在 ADTS 串流前附加歌曲資訊標籤。',
        },
        {
          name: 'Version & Flags',
          offset: 3,
          length: 3,
          rawHex: toHexSlice(bytes, 3, 3),
          value: `v2.${verMajor}.${verMinor}, Flags=0x${flags.toString(16).padStart(2, '0')}`,
          desc: 'ID3v2 版本號與旗標位元。',
        },
        {
          name: 'Synchsafe Size',
          offset: 6,
          length: 4,
          rawHex: toHexSlice(bytes, 6, 4),
          value: `${tagSize} bytes (Total ${totalId3} bytes)`,
          desc: '每個 byte 僅使用低 7 bits (避開 0xFF 偽同步字元) 編碼的標籤長度。',
        },
      ],
    });
    offset = totalId3;
  }

  let currentTime = 0;
  let primarySampleRate = 0;
  let primaryChannels = 0;
  let primaryProfile = '';

  while (offset + 7 <= bytes.length) {
    // Find next 0xFFF syncword
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xf0) !== 0xf0) {
      offset++;
      continue;
    }

    const syncword = readBits(bytes, offset, 0, 12);
    const id = readBits(bytes, offset, 12, 1);
    const layer = readBits(bytes, offset, 13, 2);
    const protectionAbsent = readBits(bytes, offset, 15, 1);
    const profile = readBits(bytes, offset, 16, 2);
    const sfIndex = readBits(bytes, offset, 18, 4);
    const privateBit = readBits(bytes, offset, 22, 1);
    const channelConfig = readBits(bytes, offset, 23, 3);
    const originalCopy = readBits(bytes, offset, 26, 1);
    const home = readBits(bytes, offset, 27, 1);
    const copyrightIdBit = readBits(bytes, offset, 28, 1);
    const copyrightIdStart = readBits(bytes, offset, 29, 1);
    const frameLength = readBits(bytes, offset, 30, 13);
    const bufferFullness = readBits(bytes, offset, 43, 11);
    const numRdb = readBits(bytes, offset, 54, 2);

    const headerLength = protectionAbsent === 1 ? 7 : 9;
    if (frameLength < headerLength || offset + frameLength > bytes.length) {
      // Invalid or truncated frame at EOF
      break;
    }

    const sampleRate = ADTS_SAMPLE_RATES[sfIndex] || 44100;
    const samplesInFrame = (numRdb + 1) * 1024;
    const frameDuration = samplesInFrame / sampleRate;
    const startTime = currentTime;
    const endTime = currentTime + frameDuration;
    currentTime = endTime;

    if (frames.length === 0) {
      primarySampleRate = sampleRate;
      primaryChannels = channelConfig;
      primaryProfile = ADTS_PROFILES[profile] || `Profile ${profile}`;
    }

    const crcCheck =
      protectionAbsent === 0 && offset + 9 <= bytes.length
        ? readBits(bytes, offset, 56, 16)
        : null;

    const frameIdx = frames.length;
    const chunkIdx = chunks.length;

    const fields = [
      {
        name: 'syncword (12b)',
        offset,
        length: 2,
        bitStart: 0,
        bitLen: 12,
        rawHex: `0b${toBinStr(syncword, 12)}`,
        value: `0x${syncword.toString(16).toUpperCase()}`,
        desc: '12-bit 固定同步字元 (1111 1111 1111)，用來在位元流中定位每個 ADTS Frame 的起點。',
      },
      {
        name: 'ID (1b)',
        offset: offset + 1,
        length: 1,
        bitStart: 12,
        bitLen: 1,
        rawHex: `0b${id}`,
        value: `${id} (${id === 0 ? 'MPEG-4' : 'MPEG-2'})`,
        desc: 'MPEG 版本識別：0 代表 MPEG-4 AAC，1 代表 MPEG-2 AAC。',
      },
      {
        name: 'layer (2b)',
        offset: offset + 1,
        length: 1,
        bitStart: 13,
        bitLen: 2,
        rawHex: `0b${toBinStr(layer, 2)}`,
        value: `${layer} (固定 00)`,
        desc: '沿用 MPEG Audio 語法，在 AAC ADTS 中固定為 00。',
      },
      {
        name: 'protection_absent (1b)',
        offset: offset + 1,
        length: 1,
        bitStart: 15,
        bitLen: 1,
        rawHex: `0b${protectionAbsent}`,
        value: `${protectionAbsent} (${protectionAbsent === 1 ? '無 CRC (7B Header)' : '含 CRC (9B Header)'})`,
        desc: '決定 Header 長度：1 表示沒有 CRC 校驗碼 (Header 佔 7 bytes)；0 表示後方附帶 16-bit CRC (Header 佔 9 bytes)。',
      },
      {
        name: 'profile (2b)',
        offset: offset + 2,
        length: 1,
        bitStart: 16,
        bitLen: 2,
        rawHex: `0b${toBinStr(profile, 2)}`,
        value: `${profile} (${ADTS_PROFILES[profile] || 'Unknown'})`,
        desc: 'AudioObjectType - 1：最常見為 1 (AAC-LC 低複雜度)，兼顧壓縮率與解碼效能。',
      },
      {
        name: 'sampling_frequency_index (4b)',
        offset: offset + 2,
        length: 1,
        bitStart: 18,
        bitLen: 4,
        rawHex: `0b${toBinStr(sfIndex, 4)}`,
        value: `${sfIndex} (${sampleRate} Hz)`,
        desc: '查表索引值 (0=96kHz, 3=48kHz, 4=44.1kHz...)，用以指定本 Frame 的取樣率。',
      },
      {
        name: 'private_bit (1b)',
        offset: offset + 2,
        length: 1,
        bitStart: 22,
        bitLen: 1,
        rawHex: `0b${privateBit}`,
        value: `${privateBit}`,
        desc: '保留給私有應用的位元，解碼器通常忽略。',
      },
      {
        name: 'channel_configuration (3b)',
        offset: offset + 2,
        length: 2,
        bitStart: 23,
        bitLen: 3,
        rawHex: `0b${toBinStr(channelConfig, 3)}`,
        value: `${ADTS_CHANNELS[channelConfig] || channelConfig}`,
        desc: '聲道配置代碼：1=單聲道、2=雙聲道立體聲、6=5.1 環繞聲道。',
      },
      {
        name: 'flags (orig/home/copy) (4b)',
        offset: offset + 3,
        length: 1,
        bitStart: 26,
        bitLen: 4,
        rawHex: `0b${originalCopy}${home}${copyrightIdBit}${copyrightIdStart}`,
        value: `orig=${originalCopy}, home=${home}`,
        desc: '版權與原版標記位元 (original_copy, home, copyright_id_bit, copyright_id_start)。',
      },
      {
        name: 'aac_frame_length (13b)',
        offset: offset + 3,
        length: 3,
        bitStart: 30,
        bitLen: 13,
        rawHex: `0b${toBinStr(frameLength, 13)}`,
        value: `${frameLength} bytes (Header ${headerLength}B + Payload ${frameLength - headerLength}B)`,
        desc: '此 ADTS Frame 的總位元組長度 (含 Header 與壓縮音訊 Payload)。因 VBR 特性，每個 Frame 的長度都可能不同！',
      },
      {
        name: 'adts_buffer_fullness (11b)',
        offset: offset + 5,
        length: 2,
        bitStart: 43,
        bitLen: 11,
        rawHex: `0b${toBinStr(bufferFullness, 11)}`,
        value: bufferFullness === 0x7ff ? '0x7FF (VBR 可變位元率)' : `${bufferFullness} (CBR 位元庫狀態)`,
        desc: '解碼器位元緩衝區滿度；若為 0x7FF (全 1) 代表 VBR 串流。',
      },
      {
        name: 'number_of_raw_data_blocks (2b)',
        offset: offset + 6,
        length: 1,
        bitStart: 54,
        bitLen: 2,
        rawHex: `0b${toBinStr(numRdb, 2)}`,
        value: `${numRdb} (${numRdb + 1} block = ${samplesInFrame} samples)`,
        desc: '本 Frame 內含的 Raw Data Block 數量減 1。0 代表有 1 個 Block (解碼出 1024 個 PCM 樣本)。',
      },
    ];

    if (crcCheck !== null) {
      fields.push({
        name: 'crc_check (16b)',
        offset: offset + 7,
        length: 2,
        bitStart: 56,
        bitLen: 16,
        rawHex: toHexSlice(bytes, offset + 7, 2),
        value: `0x${crcCheck.toString(16).toUpperCase().padStart(4, '0')}`,
        desc: '16-bit CRC 錯誤檢查碼 (僅當 protection_absent = 0 時存在)。',
      });
    }

    fields.push({
      name: 'raw_data_block (Payload)',
      offset: offset + headerLength,
      length: frameLength - headerLength,
      rawHex: `${toHexSlice(bytes, offset + headerLength, Math.min(8, frameLength - headerLength))} ...`,
      value: `${frameLength - headerLength} bytes (Compressed MDCT + Huffman)`,
      desc: `壓縮後的 AAC 音訊資料 (包含 SCE/CPE 語法元素、比例因子與量化後的 MDCT 頻譜係數)，解碼後對應時間 ${(startTime * 1000).toFixed(1)}ms ~ ${(endTime * 1000).toFixed(1)}ms。`,
    });

    const frameObj = {
      frameIndex: frameIdx,
      chunkIndex: chunkIdx,
      start: offset,
      end: offset + frameLength,
      headerLength,
      frameLength,
      sampleRate,
      channelConfig,
      profile,
      protectionAbsent,
      bufferFullness,
      numRdb,
      samplesInFrame,
      startTime,
      endTime,
      fields,
    };

    frames.push(frameObj);
    chunks.push({
      index: chunkIdx,
      id: `ADTS #${frameIdx}`,
      tagClass: 'tag-adts',
      title: `ADTS Frame #${frameIdx}`,
      start: offset,
      end: offset + frameLength,
      size: frameLength,
      summary: `${frameLength}B | ${(startTime * 1000).toFixed(1)}ms`,
      frameIndex: frameIdx,
      fields,
    });

    offset += frameLength;
  }

  if (frames.length === 0) {
    throw new Error('找不到有效的 ADTS 同步字元 (0xFFF)，請確認檔案為有效的 ADTS .aac 串流。');
  }

  function findFrameAtOffset(byteOffset) {
    let lo = 0;
    let hi = frames.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const f = frames[mid];
      if (byteOffset < f.start) hi = mid - 1;
      else if (byteOffset >= f.end) lo = mid + 1;
      else return f;
    }
    return null;
  }

  function findFrameAtTime(timeSec) {
    let lo = 0;
    let hi = frames.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const f = frames[mid];
      if (timeSec < f.startTime) hi = mid - 1;
      else if (timeSec >= f.endTime) lo = mid + 1;
      else return f;
    }
    return frames[Math.min(frames.length - 1, Math.max(0, lo))];
  }

  function getRegionAt(byteOffset) {
    if (chunks[0]?.isId3 && byteOffset >= chunks[0].start && byteOffset < chunks[0].end) {
      return { start: chunks[0].start, end: chunks[0].end, cls: 'reg-meta', chunkIndex: 0, label: 'ID3v2 Tag' };
    }
    const f = findFrameAtOffset(byteOffset);
    if (!f) return null;
    const isHdr = byteOffset < f.start + f.headerLength;
    return {
      start: isHdr ? f.start : f.start + f.headerLength,
      end: isHdr ? f.start + f.headerLength : f.end,
      cls: isHdr ? 'reg-adts-hdr' : 'reg-adts-data',
      chunkIndex: f.chunkIndex,
      frameIndex: f.frameIndex,
      label: isHdr ? `ADTS #${f.frameIndex} Header` : `ADTS #${f.frameIndex} Payload`,
    };
  }

  function getFieldAt(byteOffset) {
    const reg = getRegionAt(byteOffset);
    if (!reg) return null;
    const chunk = chunks[reg.chunkIndex];
    if (!chunk) return null;
    for (const field of chunk.fields) {
      if (byteOffset >= field.offset && byteOffset < field.offset + field.length) {
        return { chunk, field };
      }
    }
    return { chunk, field: null };
  }

  function getPlaybackState(timeSec) {
    const f = findFrameAtTime(timeSec);
    if (!f) return null;
    return {
      headerStart: f.start,
      headerEnd: f.start + f.headerLength,
      activeStart: f.start + f.headerLength,
      activeEnd: f.end,
      frameIndex: f.frameIndex,
      totalFrames: frames.length,
      unitLabel: `Frame #${f.frameIndex} / ${frames.length - 1} (${f.frameLength}B)`,
      chunkIndex: f.chunkIndex,
      frame: f,
    };
  }

  return {
    format: 'AAC',
    endianness: 'Big-Endian Bitstream (ADTS)',
    fileSize: bytes.length,
    bytes,
    sampleRate: primarySampleRate,
    channels: primaryChannels,
    bitsPerSample: null,
    profile: primaryProfile,
    durationSec: currentTime,
    chunks,
    frames,
    getRegionAt,
    getFieldAt,
    getPlaybackState,
    timeToOffset(timeSec) {
      const f = findFrameAtTime(timeSec);
      return f ? f.start : 0;
    },
    offsetToTime(byteOffset) {
      const f = findFrameAtOffset(byteOffset);
      return f ? f.startTime : 0;
    },
  };
}
