using JpegCore.Math;
using JpegCore.Tables;
using JpegCore.Trace;

namespace JpegCore;

public static class JpegDecoder
{
    private sealed class ComponentState
    {
        public byte Id;
        public string Name = "";
        public int H;
        public int V;
        public byte QuantTableId;
        public byte DcTableId;
        public byte AcTableId;
        public int PrevDc;
    }

    public static JpegDecodeResult Decode(byte[] jpegBytes, bool fixedPoint = false)
    {
        ArgumentNullException.ThrowIfNull(jpegBytes);
        if (jpegBytes.Length < 4)
            throw new InvalidDataException("Input is too small to be a valid JPEG file.");

        var ledger = new ByteTraceEntry?[jpegBytes.Length];
        var sliceBuckets = new List<BitSliceInfo>[jpegBytes.Length];
        for (int i = 0; i < jpegBytes.Length; i++) sliceBuckets[i] = [];

        var headers = new List<HeaderSegmentTrace>();
        var quantTables = new Dictionary<int, int[]>();
        var dcTables = new Dictionary<int, HuffmanTable>();
        var acTables = new Dictionary<int, HuffmanTable>();
        var huffTraces = new List<HuffmanTableTrace>();
        var components = new List<ComponentState>();

        int width = 0, height = 0;
        int restartInterval = 0;
        bool sofParsed = false;
        bool sosParsed = false;
        int scanStartOffset = 0;
        int scanEndOffset = jpegBytes.Length;

        int pos = 0;
        if (jpegBytes[0] != 0xFF || jpegBytes[1] != 0xD8)
            throw new InvalidDataException($"Missing SOI marker (FF D8) at offset 0; found {jpegBytes[0]:X2} {jpegBytes[1]:X2}.");

        MarkHeaderByte(ledger, 0, 0xFF, "MARKER_PREFIX", "SOI", "SOI Marker Prefix");
        MarkHeaderByte(ledger, 1, 0xD8, "MARKER_CODE", "SOI", "SOI Marker Code (Start of Image)");
        headers.Add(new HeaderSegmentTrace("SOI", "FF D8", 0, 2, [new HeaderFieldTrace(0, 2, "FF D8", "SOI", "Start of Image")]));
        pos = 2;

        while (pos < jpegBytes.Length && !sosParsed)
        {
            while (pos < jpegBytes.Length && jpegBytes[pos] != 0xFF)
            {
                MarkHeaderByte(ledger, pos, jpegBytes[pos], "PAD_FILL", "PRE_MARKER", "Unexpected byte skipped before marker");
                pos++;
            }
            if (pos >= jpegBytes.Length) break;

            int ffStart = pos;
            while (pos < jpegBytes.Length && jpegBytes[pos] == 0xFF)
            {
                if (pos > ffStart)
                    MarkHeaderByte(ledger, pos - 1, 0xFF, "PAD_FILL", "FILL", "0xFF fill byte before marker");
                pos++;
            }
            if (pos >= jpegBytes.Length) break;

            int markerOffset = pos - 1;
            byte marker = jpegBytes[pos];
            pos++;

            if (marker == 0x00)
            {
                MarkHeaderByte(ledger, markerOffset, 0xFF, "PAD_FILL", "FILL", "Stuffed FF 00 outside scan");
                MarkHeaderByte(ledger, markerOffset + 1, 0x00, "PAD_FILL", "FILL", "Stuffed FF 00 outside scan");
                continue;
            }

            if (marker == 0xD9) // EOI
            {
                MarkHeaderByte(ledger, markerOffset, 0xFF, "MARKER_PREFIX", "EOI", "EOI Marker Prefix");
                MarkHeaderByte(ledger, markerOffset + 1, 0xD9, "MARKER_CODE", "EOI", "EOI Marker Code");
                headers.Add(new HeaderSegmentTrace("EOI", "FF D9", markerOffset, 2,
                    [new HeaderFieldTrace(markerOffset, 2, "FF D9", "EOI", "End of Image")]));
                break;
            }

            if (pos + 2 > jpegBytes.Length)
                throw new InvalidDataException($"Truncated marker segment FF {marker:X2} at offset {markerOffset}.");

            int segLen = (jpegBytes[pos] << 8) | jpegBytes[pos + 1];
            if (segLen < 2 || pos + segLen > jpegBytes.Length)
                throw new InvalidDataException($"Invalid segment length {segLen} for marker FF {marker:X2} at offset {markerOffset}.");

            int payloadStart = pos + 2;
            int payloadLen = segLen - 2;

            switch (marker)
            {
                case >= 0xE0 and <= 0xEF:
                {
                    string appName = $"APP{marker - 0xE0}";
                    var fields = new List<HeaderFieldTrace>();
                    MarkMarkerAndLen(ledger, markerOffset, marker, segLen, appName, fields);
                    string ascii = DecodeAsciiSafe(jpegBytes, payloadStart, System.Math.Min(5, payloadLen));
                    for (int k = 0; k < payloadLen; k++)
                        MarkHeaderByte(ledger, payloadStart + k, jpegBytes[payloadStart + k], "HEADER_FIELD", appName, $"{appName} payload[{k}]");
                    fields.Add(new HeaderFieldTrace(payloadStart, payloadLen, FormatHexSpan(jpegBytes, payloadStart, System.Math.Min(16, payloadLen)),
                        "Application Data", $"{payloadLen} bytes (prefix='{ascii}')"));
                    headers.Add(new HeaderSegmentTrace(appName, $"FF {marker:X2}", markerOffset, 2 + segLen, fields));
                    break;
                }
                case 0xFE: // COM
                {
                    var fields = new List<HeaderFieldTrace>();
                    MarkMarkerAndLen(ledger, markerOffset, marker, segLen, "COM", fields);
                    string comment = DecodeAsciiSafe(jpegBytes, payloadStart, payloadLen);
                    for (int k = 0; k < payloadLen; k++)
                        MarkHeaderByte(ledger, payloadStart + k, jpegBytes[payloadStart + k], "HEADER_FIELD", "COM", $"Comment[{k}]");
                    fields.Add(new HeaderFieldTrace(payloadStart, payloadLen, FormatHexSpan(jpegBytes, payloadStart, System.Math.Min(16, payloadLen)),
                        "Comment", comment));
                    headers.Add(new HeaderSegmentTrace("COM", "FF FE", markerOffset, 2 + segLen, fields));
                    break;
                }
                case 0xDD: // DRI
                {
                    if (payloadLen != 2) throw new InvalidDataException("Invalid DRI length.");
                    var fields = new List<HeaderFieldTrace>();
                    MarkMarkerAndLen(ledger, markerOffset, marker, segLen, "DRI", fields);
                    restartInterval = (jpegBytes[payloadStart] << 8) | jpegBytes[payloadStart + 1];
                    MarkHeaderByte(ledger, payloadStart, jpegBytes[payloadStart], "HEADER_FIELD", "DRI", "Restart Interval [MSB]");
                    MarkHeaderByte(ledger, payloadStart + 1, jpegBytes[payloadStart + 1], "HEADER_FIELD", "DRI", "Restart Interval [LSB]");
                    fields.Add(new HeaderFieldTrace(payloadStart, 2, $"{jpegBytes[payloadStart]:X2} {jpegBytes[payloadStart + 1]:X2}",
                        "Ri", $"Restart Interval = {restartInterval} MCUs"));
                    headers.Add(new HeaderSegmentTrace("DRI", "FF DD", markerOffset, 2 + segLen, fields));
                    break;
                }
                case 0xDB: // DQT
                {
                    var fields = new List<HeaderFieldTrace>();
                    MarkMarkerAndLen(ledger, markerOffset, marker, segLen, "DQT", fields);
                    int p = payloadStart;
                    int end = payloadStart + payloadLen;
                    while (p < end)
                    {
                        byte pqTq = jpegBytes[p];
                        int pq = pqTq >> 4;
                        int tq = pqTq & 0x0F;
                        MarkHeaderByte(ledger, p, pqTq, "HEADER_FIELD", $"DQT{tq}", $"Pq={pq} ({(pq == 0 ? 8 : 16)}-bit), Tq={tq}");
                        fields.Add(new HeaderFieldTrace(p, 1, $"{pqTq:X2}", $"Pq | Tq (Table {tq})", $"Precision={(pq == 0 ? "8-bit" : "16-bit")}, ID={tq}"));
                        p++;

                        var table = new int[64];
                        int qStart = p;
                        var hexList = new List<string>(64);
                        for (int zz = 0; zz < 64; zz++)
                        {
                            int rasterIdx = StandardTables.ZigZagToRaster[zz];
                            int qVal;
                            if (pq == 0)
                            {
                                qVal = jpegBytes[p];
                                hexList.Add($"{jpegBytes[p]:X2}");
                                MarkHeaderByte(ledger, p, jpegBytes[p], "HEADER_FIELD", $"DQT{tq}", $"Q[zz={zz}] (r={rasterIdx / 8},c={rasterIdx % 8}) = {qVal}");
                                p++;
                            }
                            else
                            {
                                qVal = (jpegBytes[p] << 8) | jpegBytes[p + 1];
                                hexList.Add($"{jpegBytes[p]:X2}{jpegBytes[p + 1]:X2}");
                                MarkHeaderByte(ledger, p, jpegBytes[p], "HEADER_FIELD", $"DQT{tq}", $"Q[zz={zz}] MSB");
                                MarkHeaderByte(ledger, p + 1, jpegBytes[p + 1], "HEADER_FIELD", $"DQT{tq}", $"Q[zz={zz}] LSB = {qVal}");
                                p += 2;
                            }
                            table[rasterIdx] = qVal;
                        }
                        quantTables[tq] = table;
                        fields.Add(new HeaderFieldTrace(qStart, p - qStart, string.Join(" ", hexList), $"QTable #{tq} (ZigZag)", "64 quantization steps"));
                    }
                    headers.Add(new HeaderSegmentTrace("DQT", "FF DB", markerOffset, 2 + segLen, fields));
                    break;
                }
                case 0xC0: // SOF0 Baseline DCT
                {
                    var fields = new List<HeaderFieldTrace>();
                    MarkMarkerAndLen(ledger, markerOffset, marker, segLen, "SOF0", fields);

                    byte precision = jpegBytes[payloadStart];
                    if (precision != 8)
                        throw new NotSupportedException($"Only 8-bit Baseline JPEG is supported (found precision={precision}).");
                    MarkHeaderByte(ledger, payloadStart, precision, "HEADER_FIELD", "SOF0", "Sample Precision = 8 bits");
                    fields.Add(new HeaderFieldTrace(payloadStart, 1, $"{precision:X2}", "Precision", "8 bits"));

                    height = (jpegBytes[payloadStart + 1] << 8) | jpegBytes[payloadStart + 2];
                    width = (jpegBytes[payloadStart + 3] << 8) | jpegBytes[payloadStart + 4];
                    MarkHeaderByte(ledger, payloadStart + 1, jpegBytes[payloadStart + 1], "HEADER_FIELD", "SOF0", $"Height MSB (H={height})");
                    MarkHeaderByte(ledger, payloadStart + 2, jpegBytes[payloadStart + 2], "HEADER_FIELD", "SOF0", $"Height LSB (H={height})");
                    MarkHeaderByte(ledger, payloadStart + 3, jpegBytes[payloadStart + 3], "HEADER_FIELD", "SOF0", $"Width MSB (W={width})");
                    MarkHeaderByte(ledger, payloadStart + 4, jpegBytes[payloadStart + 4], "HEADER_FIELD", "SOF0", $"Width LSB (W={width})");
                    fields.Add(new HeaderFieldTrace(payloadStart + 1, 2, $"{jpegBytes[payloadStart + 1]:X2} {jpegBytes[payloadStart + 2]:X2}", "Height", $"{height} px"));
                    fields.Add(new HeaderFieldTrace(payloadStart + 3, 2, $"{jpegBytes[payloadStart + 3]:X2} {jpegBytes[payloadStart + 4]:X2}", "Width", $"{width} px"));

                    byte nf = jpegBytes[payloadStart + 5];
                    MarkHeaderByte(ledger, payloadStart + 5, nf, "HEADER_FIELD", "SOF0", $"Components Nf = {nf}");
                    fields.Add(new HeaderFieldTrace(payloadStart + 5, 1, $"{nf:X2}", "Nf", $"{nf} components"));

                    if (nf != 1 && nf != 3)
                        throw new NotSupportedException($"Only 1-component (Grayscale) or 3-component (YCbCr) JPEGs are supported (Nf={nf}).");

                    components.Clear();
                    for (int c = 0; c < nf; c++)
                    {
                        int off = payloadStart + 6 + c * 3;
                        byte cid = jpegBytes[off];
                        byte hv = jpegBytes[off + 1];
                        byte tq = jpegBytes[off + 2];
                        int h = hv >> 4;
                        int v = hv & 0x0F;
                        string cname = nf == 1 ? "Y" : c == 0 ? "Y" : c == 1 ? "Cb" : "Cr";

                        MarkHeaderByte(ledger, off, cid, "HEADER_FIELD", "SOF0", $"Comp {cname} ID={cid}");
                        MarkHeaderByte(ledger, off + 1, hv, "HEADER_FIELD", "SOF0", $"Comp {cname} Sampling {h}x{v}");
                        MarkHeaderByte(ledger, off + 2, tq, "HEADER_FIELD", "SOF0", $"Comp {cname} QuantTable Tq={tq}");
                        fields.Add(new HeaderFieldTrace(off, 3, $"{cid:X2} {hv:X2} {tq:X2}", $"Comp {cname}", $"ID={cid}, Sampling={h}x{v}, DQT={tq}"));

                        components.Add(new ComponentState { Id = cid, Name = cname, H = h, V = v, QuantTableId = tq });
                    }

                    sofParsed = true;
                    headers.Add(new HeaderSegmentTrace("SOF0 (Baseline)", "FF C0", markerOffset, 2 + segLen, fields));
                    break;
                }
                case >= 0xC1 and <= 0xC3 or >= 0xC5 and <= 0xCF when marker != 0xC4 && marker != 0xC8 && marker != 0xCC:
                    throw new NotSupportedException($"Unsupported SOF marker FF {marker:X2}. Only Baseline DCT (SOF0 / FF C0) is supported.");

                case 0xC4: // DHT
                {
                    var fields = new List<HeaderFieldTrace>();
                    MarkMarkerAndLen(ledger, markerOffset, marker, segLen, "DHT", fields);
                    int p = payloadStart;
                    int end = payloadStart + payloadLen;
                    while (p < end)
                    {
                        byte tcTh = jpegBytes[p];
                        int tc = tcTh >> 4;
                        int th = tcTh & 0x0F;
                        string tcStr = tc == 0 ? "DC" : "AC";
                        string segName = $"DHT_{tcStr}{th}";

                        MarkHeaderByte(ledger, p, tcTh, "HEADER_FIELD", segName, $"Tc={tc} ({tcStr}), Th={th}");
                        fields.Add(new HeaderFieldTrace(p, 1, $"{tcTh:X2}", $"Tc | Th ({tcStr}{th})", $"Class={tcStr}, Table ID={th}"));
                        p++;

                        var bits = new byte[16];
                        int sum = 0;
                        int bitsStart = p;
                        for (int i = 0; i < 16; i++)
                        {
                            bits[i] = jpegBytes[p];
                            sum += bits[i];
                            MarkHeaderByte(ledger, p, bits[i], "HEADER_FIELD", segName, $"BITS[len={i + 1}] = {bits[i]}");
                            p++;
                        }
                        fields.Add(new HeaderFieldTrace(bitsStart, 16, FormatHexSpan(jpegBytes, bitsStart, 16), $"BITS ({tcStr}{th})", $"Total codes = {sum}"));

                        var vals = new byte[sum];
                        int valsStart = p;
                        for (int i = 0; i < sum; i++)
                        {
                            vals[i] = jpegBytes[p];
                            MarkHeaderByte(ledger, p, vals[i], "HEADER_FIELD", segName, $"HUFFVAL[{i}] = 0x{vals[i]:X2}");
                            p++;
                        }
                        fields.Add(new HeaderFieldTrace(valsStart, sum, FormatHexSpan(jpegBytes, valsStart, System.Math.Min(32, sum)), $"HUFFVAL ({tcStr}{th})", $"{sum} symbol bytes"));

                        var ht = new HuffmanTable(tc, th, bits, vals);
                        if (tc == 0) dcTables[th] = ht;
                        else acTables[th] = ht;

                        huffTraces.Add(new HuffmanTableTrace($"{tcStr}{th}", tc, th, bits, vals, ht.Entries, ht.Levels));
                    }
                    headers.Add(new HeaderSegmentTrace("DHT", "FF C4", markerOffset, 2 + segLen, fields));
                    break;
                }
                case 0xDA: // SOS
                {
                    if (!sofParsed)
                        throw new InvalidDataException("Encountered SOS before SOF0.");

                    var fields = new List<HeaderFieldTrace>();
                    MarkMarkerAndLen(ledger, markerOffset, marker, segLen, "SOS", fields);

                    byte ns = jpegBytes[payloadStart];
                    MarkHeaderByte(ledger, payloadStart, ns, "HEADER_FIELD", "SOS", $"Scan Components Ns={ns}");
                    fields.Add(new HeaderFieldTrace(payloadStart, 1, $"{ns:X2}", "Ns", $"{ns} scan components"));

                    for (int c = 0; c < ns; c++)
                    {
                        int off = payloadStart + 1 + c * 2;
                        byte cs = jpegBytes[off];
                        byte tdTa = jpegBytes[off + 1];
                        byte td = (byte)(tdTa >> 4);
                        byte ta = (byte)(tdTa & 0x0F);

                        ComponentState? comp = components.FirstOrDefault(x => x.Id == cs);
                        if (comp is null)
                            throw new InvalidDataException($"SOS references unknown component ID {cs}.");

                        comp.DcTableId = td;
                        comp.AcTableId = ta;

                        MarkHeaderByte(ledger, off, cs, "HEADER_FIELD", "SOS", $"Scan Comp ID={cs} ({comp.Name})");
                        MarkHeaderByte(ledger, off + 1, tdTa, "HEADER_FIELD", "SOS", $"Comp {comp.Name}: DC={td}, AC={ta}");
                        fields.Add(new HeaderFieldTrace(off, 2, $"{cs:X2} {tdTa:X2}", $"Comp {comp.Name}", $"ID={cs}, DC={td}, AC={ta}"));
                    }

                    int specOff = payloadStart + 1 + ns * 2;
                    for (int k = 0; k < 3; k++)
                        MarkHeaderByte(ledger, specOff + k, jpegBytes[specOff + k], "HEADER_FIELD", "SOS",
                            k == 0 ? "Ss" : k == 1 ? "Se" : "Ah | Al");
                    fields.Add(new HeaderFieldTrace(specOff, 3, FormatHexSpan(jpegBytes, specOff, 3), "Spectral/Approx",
                        $"Ss={jpegBytes[specOff]}, Se={jpegBytes[specOff + 1]}, Ah={jpegBytes[specOff + 2] >> 4}, Al={jpegBytes[specOff + 2] & 0xF}"));

                    headers.Add(new HeaderSegmentTrace("SOS (Start of Scan)", "FF DA", markerOffset, 2 + segLen, fields));
                    sosParsed = true;
                    scanStartOffset = pos + segLen;
                    break;
                }
                default:
                {
                    string segName = $"M_{marker:X2}";
                    var fields = new List<HeaderFieldTrace>();
                    MarkMarkerAndLen(ledger, markerOffset, marker, segLen, segName, fields);
                    for (int k = 0; k < payloadLen; k++)
                        MarkHeaderByte(ledger, payloadStart + k, jpegBytes[payloadStart + k], "HEADER_FIELD", segName, $"Payload[{k}]");
                    fields.Add(new HeaderFieldTrace(payloadStart, payloadLen, FormatHexSpan(jpegBytes, payloadStart, System.Math.Min(16, payloadLen)),
                        "Payload", $"{payloadLen} bytes"));
                    headers.Add(new HeaderSegmentTrace(segName, $"FF {marker:X2}", markerOffset, 2 + segLen, fields));
                    break;
                }
            }

            pos += segLen;
        }

        if (!sofParsed || !sosParsed)
            throw new InvalidDataException("Incomplete JPEG headers: missing SOF0 or SOS.");

        int hMax = components.Max(c => c.H);
        int vMax = components.Max(c => c.V);
        int mcuW = hMax * 8;
        int mcuH = vMax * 8;
        int mcuCols = (width + mcuW - 1) / mcuW;
        int mcuRows = (height + mcuH - 1) / mcuH;
        int totalMcus = mcuCols * mcuRows;

        var bitReader = new TracedBitReader(jpegBytes, scanStartOffset, ledger, sliceBuckets);
        var blocks = new List<BlockDecodeTrace>();
        var rgbOut = new byte[width * height * 3];
        var samplePixels = new List<PixelColorTrace>();

        int blockCounter = 0;
        int mcuCounter = 0;

        for (int my = 0; my < mcuRows; my++)
        {
            for (int mx = 0; mx < mcuCols; mx++)
            {
                if (restartInterval > 0 && mcuCounter > 0 && mcuCounter % restartInterval == 0)
                {
                    bitReader.ConsumeRestartMarker();
                    foreach (var c in components) c.PrevDc = 0;
                }

                // Store decoded 8x8 blocks per component inside this MCU: compBlocks[compIdx][subBlockIdx][64]
                var compBlocks = new byte[components.Count][][];
                for (int ci = 0; ci < components.Count; ci++)
                {
                    var comp = components[ci];
                    int numSub = comp.H * comp.V;
                    compBlocks[ci] = new byte[numSub][];

                    int[] qTable = quantTables[comp.QuantTableId];
                    HuffmanTable dcTable = dcTables[comp.DcTableId];
                    HuffmanTable acTable = acTables[comp.AcTableId];

                    for (int vy = 0; vy < comp.V; vy++)
                    {
                        for (int hx = 0; hx < comp.H; hx++)
                        {
                            int subIdx = vy * comp.H + hx;
                            int originX = mx * mcuW + hx * 8 * (hMax / comp.H);
                            int originY = my * mcuH + vy * 8 * (vMax / comp.V);

                            var blkTrace = DecodeSingleBlock(
                                blockCounter++, mcuCounter, my, mx, comp, originX, originY,
                                qTable, dcTable, acTable, fixedPoint, bitReader);

                            blocks.Add(blkTrace);
                            compBlocks[ci][subIdx] = blkTrace.ClampedChannel64;
                        }
                    }
                }

                // Reconstruct RGB pixels within this MCU
                for (int py = 0; py < mcuH; py++)
                {
                    int imgY = my * mcuH + py;
                    if (imgY >= height) continue;

                    for (int px = 0; px < mcuW; px++)
                    {
                        int imgX = mx * mcuW + px;
                        if (imgX >= width) continue;

                        byte yVal, cbVal, crVal;
                        if (components.Count == 1)
                        {
                            byte g = SampleFromMcuComp(compBlocks[0], components[0], hMax, vMax, px, py);
                            yVal = g;
                            cbVal = 128;
                            crVal = 128;
                            int outIdx = (imgY * width + imgX) * 3;
                            rgbOut[outIdx] = g;
                            rgbOut[outIdx + 1] = g;
                            rgbOut[outIdx + 2] = g;
                            if (samplePixels.Count < 4096)
                                samplePixels.Add(new PixelColorTrace(imgX, imgY, outIdx, false, g, g, g, yVal, cbVal, crVal));
                        }
                        else
                        {
                            yVal = SampleFromMcuComp(compBlocks[0], components[0], hMax, vMax, px, py);
                            cbVal = SampleFromMcuComp(compBlocks[1], components[1], hMax, vMax, px, py);
                            crVal = SampleFromMcuComp(compBlocks[2], components[2], hMax, vMax, px, py);
                            (byte r, byte g, byte b) = ColorSpace.YCbCrToRgb(yVal, cbVal, crVal, fixedPoint);
                            int outIdx = (imgY * width + imgX) * 3;
                            rgbOut[outIdx] = r;
                            rgbOut[outIdx + 1] = g;
                            rgbOut[outIdx + 2] = b;
                            if (samplePixels.Count < 4096)
                                samplePixels.Add(new PixelColorTrace(imgX, imgY, outIdx, false, r, g, b, yVal, cbVal, crVal));
                        }
                    }
                }

                mcuCounter++;
            }
        }

        bitReader.FinalizeRemainingBitsAndEoi(ledger, sliceBuckets, headers, out scanEndOffset);

        // Build complete ByteTraceEntry array for all [0..Length-1]
        var finalLedger = new ByteTraceEntry[jpegBytes.Length];
        for (int i = 0; i < jpegBytes.Length; i++)
        {
            if (ledger[i] is { } existing)
            {
                finalLedger[i] = existing with { BitSlices = sliceBuckets[i].Count > 0 ? sliceBuckets[i].ToArray() : existing.BitSlices };
            }
            else if (i >= scanStartOffset && i < scanEndOffset)
            {
                var slices = sliceBuckets[i];
                string summary = slices.Count > 0
                    ? string.Join(" | ", slices.Select(s => $"b[{s.HighBit}..{s.LowBit}]={s.Kind}"))
                    : "Trailing padding byte in scan";
                int mcuIdx = slices.FirstOrDefault(s => s.McuIndex >= 0)?.McuIndex ?? -1;
                int blkIdx = slices.FirstOrDefault(s => s.BlockIndex >= 0)?.BlockIndex ?? -1;
                finalLedger[i] = new ByteTraceEntry(i, jpegBytes[i], "ENTROPY_DATA", "SCAN", summary, mcuIdx, blkIdx, slices.ToArray());
            }
            else
            {
                finalLedger[i] = new ByteTraceEntry(i, jpegBytes[i], "PAD_FILL", "TRAILING", "Trailing byte after EOI", -1, -1, []);
            }
        }

        string subsamplingStr = components.Count == 1
            ? "Grayscale"
            : (hMax == 1 && vMax == 1) ? "4:4:4"
            : (hMax == 2 && vMax == 1) ? "4:2:2"
            : (hMax == 2 && vMax == 2) ? "4:2:0"
            : $"{hMax}x{vMax}";

        var compInfos = components.Select(c => new DecodeComponentInfo(
            c.Id, c.Name, c.H, c.V, c.QuantTableId, c.DcTableId, c.AcTableId)).ToList();

        return new JpegDecodeResult(
            Width: width,
            Height: height,
            McuCols: mcuCols,
            McuRows: mcuRows,
            Subsampling: subsamplingStr,
            RestartInterval: restartInterval,
            FixedPoint: fixedPoint,
            RgbBytes: rgbOut,
            Components: compInfos,
            QuantTables: quantTables,
            HuffmanTables: huffTraces,
            Headers: headers,
            ByteLedger: finalLedger,
            DestuffEvents: bitReader.DestuffEvents,
            Blocks: blocks,
            OutputPixelSample: samplePixels,
            ScanStartOffset: scanStartOffset,
            ScanEndOffset: scanEndOffset,
            TotalEntropyBits: bitReader.TotalBitsConsumed);
    }

    private static byte SampleFromMcuComp(byte[][] subBlocks, ComponentState comp, int hMax, int vMax, int mcuPx, int mcuPy)
    {
        int sx = (mcuPx * comp.H) / hMax;
        int sy = (mcuPy * comp.V) / vMax;
        int bx = sx >> 3;
        int by = sy >> 3;
        int subIdx = by * comp.H + bx;
        return subBlocks[subIdx][((sy & 7) << 3) | (sx & 7)];
    }

    private static BlockDecodeTrace DecodeSingleBlock(
        int blockIdx,
        int mcuIdx,
        int mcuRow,
        int mcuCol,
        ComponentState comp,
        int originX,
        int originY,
        int[] quantTable,
        HuffmanTable dcTable,
        HuffmanTable acTable,
        bool fixedPoint,
        TracedBitReader reader)
    {
        var zigzag = new int[64];
        var tokens = new List<EntropyTokenTrace>();
        int tokenIdx = 0;

        string dcTableName = $"DC{comp.DcTableId}";
        string acTableName = $"AC{comp.AcTableId}";

        // 1. Decode DC coefficient
        long dcBitStart = reader.TotalBitsConsumed;
        int dcPrev = comp.PrevDc;
        reader.BeginToken(mcuIdx, blockIdx, comp.Name, tokenIdx);
        byte dcSym = dcTable.DecodeSymbol(() => reader.ReadBit("HUFFMAN", $"{comp.Name} DC Huff"), out string dcHuffBits);
        int dcSize = dcSym & 0x0F;
        int dcRaw = reader.ReadBits(dcSize, "VLI", $"{comp.Name} DC VLI({dcSize})", out string dcVliBits);
        int dcDiff = VliCodec.Extend(dcRaw, dcSize);
        int dcVal = dcPrev + dcDiff;
        comp.PrevDc = dcVal;
        zigzag[0] = dcVal;
        reader.EndToken(out int dcByteStart, out int dcByteEnd);

        tokens.Add(new EntropyTokenTrace(
            TokenIndex: tokenIdx++,
            Kind: "DC",
            ZigZagIndex: 0,
            ZeroRun: 0,
            Size: dcSize,
            PreviousDc: dcPrev,
            Value: dcDiff,
            ReconstructedCoeff: dcVal,
            SymbolByte: dcSym,
            HuffmanTableName: dcTableName,
            HuffmanBits: dcHuffBits,
            VliBits: dcVliBits,
            CombinedBits: dcHuffBits + dcVliBits,
            BitOffsetStart: dcBitStart,
            BitLength: dcHuffBits.Length + dcVliBits.Length,
            ByteOffsetStart: dcByteStart,
            ByteOffsetEnd: dcByteEnd));

        int blockByteStart = dcByteStart;
        int blockByteEnd = dcByteEnd;

        // 2. Decode AC coefficients [1..63]
        int zz = 1;
        while (zz < 64)
        {
            long acBitStart = reader.TotalBitsConsumed;
            reader.BeginToken(mcuIdx, blockIdx, comp.Name, tokenIdx);
            byte rs = acTable.DecodeSymbol(() => reader.ReadBit("HUFFMAN", $"{comp.Name} AC Huff"), out string acHuffBits);

            if (rs == 0x00) // EOB
            {
                reader.EndToken(out int bStart, out int bEnd);
                blockByteEnd = bEnd;
                tokens.Add(new EntropyTokenTrace(
                    TokenIndex: tokenIdx++,
                    Kind: "EOB",
                    ZigZagIndex: zz,
                    ZeroRun: 0,
                    Size: 0,
                    PreviousDc: dcPrev,
                    Value: 0,
                    ReconstructedCoeff: 0,
                    SymbolByte: 0x00,
                    HuffmanTableName: acTableName,
                    HuffmanBits: acHuffBits,
                    VliBits: string.Empty,
                    CombinedBits: acHuffBits,
                    BitOffsetStart: acBitStart,
                    BitLength: acHuffBits.Length,
                    ByteOffsetStart: bStart,
                    ByteOffsetEnd: bEnd));
                break;
            }

            if (rs == 0xF0) // ZRL (16 zeros)
            {
                reader.EndToken(out int bStart, out int bEnd);
                blockByteEnd = bEnd;
                zz += 16;
                tokens.Add(new EntropyTokenTrace(
                    TokenIndex: tokenIdx++,
                    Kind: "ZRL",
                    ZigZagIndex: System.Math.Min(zz - 1, 63),
                    ZeroRun: 15,
                    Size: 0,
                    PreviousDc: dcPrev,
                    Value: 0,
                    ReconstructedCoeff: 0,
                    SymbolByte: 0xF0,
                    HuffmanTableName: acTableName,
                    HuffmanBits: acHuffBits,
                    VliBits: string.Empty,
                    CombinedBits: acHuffBits,
                    BitOffsetStart: acBitStart,
                    BitLength: acHuffBits.Length,
                    ByteOffsetStart: bStart,
                    ByteOffsetEnd: bEnd));
                continue;
            }

            int run = rs >> 4;
            int size = rs & 0x0F;
            zz += run;
            if (zz >= 64)
                throw new InvalidDataException($"AC coefficient zig-zag index overflow ({zz}) in block {blockIdx}.");

            int acRaw = reader.ReadBits(size, "VLI", $"{comp.Name} AC[zz={zz}] VLI({size})", out string acVliBits);
            int acVal = VliCodec.Extend(acRaw, size);
            zigzag[zz] = acVal;
            reader.EndToken(out int acByteStart, out int acByteEnd);
            blockByteEnd = acByteEnd;

            tokens.Add(new EntropyTokenTrace(
                TokenIndex: tokenIdx++,
                Kind: "AC",
                ZigZagIndex: zz,
                ZeroRun: run,
                Size: size,
                PreviousDc: dcPrev,
                Value: acVal,
                ReconstructedCoeff: acVal,
                SymbolByte: rs,
                HuffmanTableName: acTableName,
                HuffmanBits: acHuffBits,
                VliBits: acVliBits,
                CombinedBits: acHuffBits + acVliBits,
                BitOffsetStart: acBitStart,
                BitLength: acHuffBits.Length + acVliBits.Length,
                ByteOffsetStart: acByteStart,
                ByteOffsetEnd: acByteEnd));

            zz++;
        }

        // 3. Un-zigzag & Dequantize
        var quantized = new int[64];
        var dequantized = new int[64];
        for (int z = 0; z < 64; z++)
        {
            int rasterIdx = StandardTables.ZigZagToRaster[z];
            quantized[rasterIdx] = zigzag[z];
            dequantized[rasterIdx] = zigzag[z] * quantTable[rasterIdx];
        }

        // 4. 2D IDCT + level shift (+128) + clamp [0..255]
        DctTransform.Inverse2D(dequantized, out double[] rowIdct, out double[] idctFloat, out int[] idctRounded, out byte[] clamped, fixedPoint);

        return new BlockDecodeTrace(
            BlockIndex: blockIdx,
            McuIndex: mcuIdx,
            McuRow: mcuRow,
            McuCol: mcuCol,
            Component: comp.Name,
            OriginX: originX,
            OriginY: originY,
            QuantTableId: comp.QuantTableId,
            Tokens: tokens,
            ZigZag64: zigzag,
            Quantized64: quantized,
            QuantTable64: quantTable,
            Dequantized64: dequantized,
            RowIdct64: rowIdct,
            IdctFloat64: idctFloat,
            IdctRounded64: idctRounded,
            ClampedChannel64: clamped,
            EntropyByteStart: blockByteStart,
            EntropyByteEnd: blockByteEnd);
    }

    private static void MarkHeaderByte(ByteTraceEntry?[] ledger, int offset, byte val, string category, string segment, string fieldName)
    {
        if (offset >= 0 && offset < ledger.Length)
            ledger[offset] = new ByteTraceEntry(offset, val, category, segment, fieldName, -1, -1, []);
    }

    private static void MarkMarkerAndLen(ByteTraceEntry?[] ledger, int markerOffset, byte marker, int segLen, string segName, List<HeaderFieldTrace> fields)
    {
        MarkHeaderByte(ledger, markerOffset, 0xFF, "MARKER_PREFIX", segName, $"{segName} Marker Prefix");
        MarkHeaderByte(ledger, markerOffset + 1, marker, "MARKER_CODE", segName, $"{segName} Marker Code");
        MarkHeaderByte(ledger, markerOffset + 2, (byte)(segLen >> 8), "SEGMENT_LEN", segName, "Segment Length [MSB]");
        MarkHeaderByte(ledger, markerOffset + 3, (byte)(segLen & 0xFF), "SEGMENT_LEN", segName, "Segment Length [LSB]");
        fields.Add(new HeaderFieldTrace(markerOffset, 2, $"FF {marker:X2}", "Marker", segName));
        fields.Add(new HeaderFieldTrace(markerOffset + 2, 2, $"{segLen >> 8:X2} {segLen & 0xFF:X2}", "Length", $"{segLen} bytes"));
    }

    private static string DecodeAsciiSafe(byte[] bytes, int start, int len)
    {
        if (len <= 0 || start >= bytes.Length) return string.Empty;
        int actual = System.Math.Min(len, bytes.Length - start);
        var chars = new char[actual];
        for (int i = 0; i < actual; i++)
        {
            byte b = bytes[start + i];
            chars[i] = b is >= 0x20 and <= 0x7E ? (char)b : '.';
        }
        return new string(chars);
    }

    private static string FormatHexSpan(byte[] bytes, int start, int count)
    {
        if (count <= 0 || start >= bytes.Length) return string.Empty;
        int actual = System.Math.Min(count, bytes.Length - start);
        return string.Join(" ", Enumerable.Range(start, actual).Select(i => $"{bytes[i]:X2}"));
    }

    private sealed class TracedBitReader
    {
        private readonly byte[] _data;
        private readonly ByteTraceEntry?[] _ledger;
        private readonly List<BitSliceInfo>[] _sliceBuckets;

        private int _rawPos;
        private int _currentRawByteOffset = -1;
        private byte _currentByte;
        private int _bitsRemaining;
        private int _logicalByteCount;

        // Active token bit-slice tracking
        private int _curMcu;
        private int _curBlock;
        private string _curComp = "";
        private int _curSym;
        private int _tokFirstByte = -1;
        private int _tokLastByte = -1;

        // Active contiguous slice within current byte
        private int _pendingSliceByteOffset = -1;
        private int _pendingHighBit = -1;
        private string _pendingKind = "";
        private string _pendingDetail = "";
        private readonly List<char> _pendingBits = [];

        public List<DestuffEventTrace> DestuffEvents { get; } = [];
        public long TotalBitsConsumed { get; private set; }

        public TracedBitReader(byte[] data, int scanStart, ByteTraceEntry?[] ledger, List<BitSliceInfo>[] sliceBuckets)
        {
            _data = data;
            _rawPos = scanStart;
            _ledger = ledger;
            _sliceBuckets = sliceBuckets;
        }

        public void BeginToken(int mcu, int block, string comp, int sym)
        {
            _curMcu = mcu;
            _curBlock = block;
            _curComp = comp;
            _curSym = sym;
            _tokFirstByte = -1;
            _tokLastByte = -1;
        }

        public void EndToken(out int byteStart, out int byteEnd)
        {
            FlushPendingSlice();
            byteStart = _tokFirstByte >= 0 ? _tokFirstByte : _rawPos;
            byteEnd = _tokLastByte >= 0 ? _tokLastByte : byteStart;
        }

        public int ReadBit(string kind, string detail)
        {
            if (_bitsRemaining == 0)
            {
                FlushPendingSlice();
                FetchNextByte();
            }

            int bitIdx = _bitsRemaining - 1; // 7 down to 0
            int bit = (_currentByte >> bitIdx) & 1;
            _bitsRemaining--;
            TotalBitsConsumed++;

            if (_tokFirstByte < 0) _tokFirstByte = _currentRawByteOffset;
            _tokLastByte = _currentRawByteOffset;

            if (_pendingSliceByteOffset == _currentRawByteOffset && _pendingKind == kind && _pendingDetail == detail)
            {
                _pendingBits.Add(bit == 1 ? '1' : '0');
            }
            else
            {
                FlushPendingSlice();
                _pendingSliceByteOffset = _currentRawByteOffset;
                _pendingHighBit = bitIdx;
                _pendingKind = kind;
                _pendingDetail = detail;
                _pendingBits.Add(bit == 1 ? '1' : '0');
            }

            return bit;
        }

        public int ReadBits(int count, string kind, string detail, out string bitStr)
        {
            if (count == 0)
            {
                bitStr = string.Empty;
                return 0;
            }
            int acc = 0;
            var chars = new char[count];
            for (int i = 0; i < count; i++)
            {
                int b = ReadBit(kind, detail);
                acc = (acc << 1) | b;
                chars[i] = b == 1 ? '1' : '0';
            }
            bitStr = new string(chars);
            return acc;
        }

        public void ConsumeRestartMarker()
        {
            FlushPendingSlice();
            // Discard remaining padding bits in current byte
            if (_bitsRemaining > 0 && _currentRawByteOffset >= 0)
            {
                int high = _bitsRemaining - 1;
                var padBits = new char[_bitsRemaining];
                for (int i = 0; i < _bitsRemaining; i++)
                    padBits[i] = ((_currentByte >> (high - i)) & 1) == 1 ? '1' : '0';
                _sliceBuckets[_currentRawByteOffset].Add(new BitSliceInfo(
                    high, 0, new string(padBits), -1, -1, "PAD", -1, "PAD_1S", "Alignment padding before RST marker"));
                _bitsRemaining = 0;
            }

            while (_rawPos + 1 < _data.Length && _data[_rawPos] == 0xFF && _data[_rawPos + 1] == 0xFF)
            {
                _ledger[_rawPos] = new ByteTraceEntry(_rawPos, 0xFF, "PAD_FILL", "RST", "0xFF fill before RST", -1, -1, []);
                _rawPos++;
            }

            if (_rawPos + 1 < _data.Length && _data[_rawPos] == 0xFF && _data[_rawPos + 1] is >= 0xD0 and <= 0xD7)
            {
                byte rst = _data[_rawPos + 1];
                int rstNum = rst - 0xD0;
                _ledger[_rawPos] = new ByteTraceEntry(_rawPos, 0xFF, "RESTART_MARKER", $"RST{rstNum}", $"Restart Marker Prefix", -1, -1, []);
                _ledger[_rawPos + 1] = new ByteTraceEntry(_rawPos + 1, rst, "RESTART_MARKER", $"RST{rstNum}", $"Restart Marker RST{rstNum} (resets DC predictors)", -1, -1, []);
                _rawPos += 2;
            }
        }

        public void FinalizeRemainingBitsAndEoi(
            ByteTraceEntry?[] ledger,
            List<BitSliceInfo>[] sliceBuckets,
            List<HeaderSegmentTrace> headers,
            out int scanEndOffset)
        {
            FlushPendingSlice();
            if (_bitsRemaining > 0 && _currentRawByteOffset >= 0)
            {
                int high = _bitsRemaining - 1;
                var padBits = new char[_bitsRemaining];
                for (int i = 0; i < _bitsRemaining; i++)
                    padBits[i] = ((_currentByte >> (high - i)) & 1) == 1 ? '1' : '0';
                sliceBuckets[_currentRawByteOffset].Add(new BitSliceInfo(
                    high, 0, new string(padBits), -1, -1, "PAD", -1, "PAD_1S",
                    $"End-of-scan alignment padding ({_bitsRemaining} bits)"));
                _bitsRemaining = 0;
            }

            while (_rawPos < _data.Length)
            {
                if (_rawPos + 1 < _data.Length && _data[_rawPos] == 0xFF && _data[_rawPos + 1] == 0x00)
                {
                    // Trailing stuffed zero after an entropy 0xFF at end of stream
                    _ledger[_rawPos + 1] = new ByteTraceEntry(_rawPos + 1, 0x00, "STUFFED_ZERO", "SCAN",
                        $"Stuffed 0x00 after final 0xFF at 0x{_rawPos:X4}", -1, -1,
                        [new BitSliceInfo(7, 0, "00000000", -1, -1, "STUFF", -1, "STUFF_00", $"Escapes 0xFF @ 0x{_rawPos:X4}")]);
                    _rawPos += 2;
                    continue;
                }
                if (_data[_rawPos] == 0xFF && _rawPos + 1 < _data.Length && _data[_rawPos + 1] == 0xFF)
                {
                    ledger[_rawPos] = new ByteTraceEntry(_rawPos, 0xFF, "PAD_FILL", "EOI", "0xFF fill before EOI", -1, -1, []);
                    _rawPos++;
                    continue;
                }
                if (_data[_rawPos] == 0xFF && _rawPos + 1 < _data.Length && _data[_rawPos + 1] == 0xD9)
                {
                    scanEndOffset = _rawPos;
                    ledger[_rawPos] = new ByteTraceEntry(_rawPos, 0xFF, "MARKER_PREFIX", "EOI", "EOI Marker Prefix", -1, -1, []);
                    ledger[_rawPos + 1] = new ByteTraceEntry(_rawPos + 1, 0xD9, "MARKER_CODE", "EOI", "EOI Marker Code (End of Image)", -1, -1, []);
                    headers.Add(new HeaderSegmentTrace("EOI", "FF D9", _rawPos, 2,
                        [new HeaderFieldTrace(_rawPos, 2, "FF D9", "EOI", "End of Image")]));
                    return;
                }
                break;
            }

            scanEndOffset = _rawPos;
        }

        private void FetchNextByte()
        {
            if (_rawPos >= _data.Length)
                throw new InvalidDataException("Unexpected end of JPEG entropy stream before EOI.");

            int offset = _rawPos;
            byte b = _data[_rawPos++];

            if (b == 0xFF)
            {
                if (_rawPos >= _data.Length)
                    throw new InvalidDataException($"Dangling 0xFF at end of stream (offset 0x{offset:X4}).");

                byte next = _data[_rawPos];
                if (next == 0x00)
                {
                    int zeroOff = _rawPos++;
                    DestuffEvents.Add(new DestuffEventTrace(
                        offset, zeroOff, _logicalByteCount,
                        $"Escaped 0xFF 0x00 at raw 0x{offset:X4}..0x{zeroOff:X4} -> logical entropy byte #{_logicalByteCount} = 0xFF"));

                    _ledger[zeroOff] = new ByteTraceEntry(
                        zeroOff, 0x00, "STUFFED_ZERO", "SCAN",
                        $"Byte-stuffing 0x00 removed (escapes 0xFF at 0x{offset:X4})",
                        _curMcu, _curBlock,
                        [new BitSliceInfo(7, 0, "00000000", _curMcu, _curBlock, _curComp, _curSym, "STUFF_00", $"Removed by destuffer after 0xFF @ 0x{offset:X4}")]);
                }
                else if (next == 0xD9)
                {
                    // Premature EOI (some encoders omit trailing zeros if implicit, pad 0s)
                    _rawPos--;
                    _currentRawByteOffset = offset;
                    _currentByte = 0x00;
                    _bitsRemaining = 8;
                    return;
                }
                else
                {
                    throw new InvalidDataException($"Unexpected marker FF {next:X2} inside entropy scan at offset 0x{offset:X4}.");
                }
            }

            _currentRawByteOffset = offset;
            _currentByte = b;
            _bitsRemaining = 8;
            _logicalByteCount++;
        }

        private void FlushPendingSlice()
        {
            if (_pendingBits.Count == 0 || _pendingSliceByteOffset < 0) return;
            int lowBit = _pendingHighBit - _pendingBits.Count + 1;
            _sliceBuckets[_pendingSliceByteOffset].Add(new BitSliceInfo(
                _pendingHighBit,
                lowBit,
                new string(_pendingBits.ToArray()),
                _curMcu,
                _curBlock,
                _curComp,
                _curSym,
                _pendingKind,
                _pendingDetail));
            _pendingBits.Clear();
            _pendingSliceByteOffset = -1;
        }
    }
}
