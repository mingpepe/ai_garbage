using JpegCore.Math;
using JpegCore.Tables;
using JpegCore.Trace;

namespace JpegCore;

public enum ChromaSubsampling
{
    YCbCr444,
    YCbCr420
}

public sealed record JpegEncodeOptions(
    int Quality = 75,
    ChromaSubsampling Subsampling = ChromaSubsampling.YCbCr444,
    bool FixedPoint = false);

public static class JpegEncoder
{
    public static JpegEncodeResult Encode(byte[] rgbBytes, int width, int height, JpegEncodeOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(rgbBytes);
        if (width <= 0 || height <= 0)
            throw new ArgumentOutOfRangeException(nameof(width), "Image dimensions must be positive.");
        if (rgbBytes.Length < width * height * 3)
            throw new ArgumentException($"Expected at least {width * height * 3} RGB bytes, got {rgbBytes.Length}.", nameof(rgbBytes));

        options ??= new JpegEncodeOptions();
        int quality = System.Math.Clamp(options.Quality, 1, 100);
        bool is420 = options.Subsampling == ChromaSubsampling.YCbCr420;
        bool fixedPoint = options.FixedPoint;

        int[] lumaQuant = StandardTables.ScaleQuantTable(StandardTables.BaseLuminanceQuant, quality, out int scaleFactor);
        int[] chromaQuant = StandardTables.ScaleQuantTable(StandardTables.BaseChrominanceQuant, quality, out _);

        int mcuW = is420 ? 16 : 8;
        int mcuH = is420 ? 16 : 8;
        int mcuCols = (width + mcuW - 1) / mcuW;
        int mcuRows = (height + mcuH - 1) / mcuH;
        int paddedW = mcuCols * mcuW;
        int paddedH = mcuRows * mcuH;

        // Precompute full padded YCbCr plane so edge replication and 4:2:0 averaging are exact
        var yPlane = new byte[paddedW * paddedH];
        var cbPlane = new byte[paddedW * paddedH];
        var crPlane = new byte[paddedW * paddedH];
        var paddedFlags = new bool[paddedW * paddedH];
        var srcOffsets = new int[paddedW * paddedH];
        var srcRgb = new byte[paddedW * paddedH * 3];

        for (int y = 0; y < paddedH; y++)
        {
            int sy = System.Math.Min(y, height - 1);
            for (int x = 0; x < paddedW; x++)
            {
                int sx = System.Math.Min(x, width - 1);
                bool isPadded = x >= width || y >= height;
                int inIdx = (sy * width + sx) * 3;
                byte r = rgbBytes[inIdx];
                byte g = rgbBytes[inIdx + 1];
                byte b = rgbBytes[inIdx + 2];

                YCbCrPixel ycc = ColorSpace.RgbToYCbCr(r, g, b, fixedPoint);
                int pIdx = y * paddedW + x;
                yPlane[pIdx] = ycc.Y;
                cbPlane[pIdx] = ycc.Cb;
                crPlane[pIdx] = ycc.Cr;
                paddedFlags[pIdx] = isPadded;
                srcOffsets[pIdx] = isPadded ? -1 : inIdx;
                srcRgb[pIdx * 3] = r;
                srcRgb[pIdx * 3 + 1] = g;
                srcRgb[pIdx * 3 + 2] = b;
            }
        }

        var writer = new JpegByteLedgerWriter();
        var headers = new List<HeaderSegmentTrace>();

        // 1. SOI (FF D8)
        headers.Add(WriteMarkerOnly(writer, "SOI", 0xD8, "Start of Image"));

        // 2. APP0 JFIF (FF E0)
        headers.Add(WriteApp0(writer));

        // 3. DQT Luminance (id=0) & Chrominance (id=1)
        headers.Add(WriteDqt(writer, 0, "Luminance", lumaQuant));
        headers.Add(WriteDqt(writer, 1, "Chrominance", chromaQuant));

        // 4. SOF0 Baseline DCT (FF C0)
        headers.Add(WriteSof0(writer, width, height, is420));

        // 5. DHT x4 (DC0, AC0, DC1, AC1)
        var dc0 = HuffmanTable.StandardDcLuminance;
        var ac0 = HuffmanTable.StandardAcLuminance;
        var dc1 = HuffmanTable.StandardDcChrominance;
        var ac1 = HuffmanTable.StandardAcChrominance;

        headers.Add(WriteDht(writer, "DHT_DC0", dc0));
        headers.Add(WriteDht(writer, "DHT_AC0", ac0));
        headers.Add(WriteDht(writer, "DHT_DC1", dc1));
        headers.Add(WriteDht(writer, "DHT_AC1", ac1));

        // 6. SOS Start of Scan (FF DA)
        headers.Add(WriteSos(writer));

        int headerByteCount = writer.Count;

        // 7. Entropy-coded MCUs
        var blocks = new List<BlockEncodeTrace>();
        int[] prevDc = [0, 0, 0]; // Y, Cb, Cr
        int blockCounter = 0;
        int mcuCounter = 0;

        for (int my = 0; my < mcuRows; my++)
        {
            for (int mx = 0; mx < mcuCols; mx++)
            {
                int baseX = mx * mcuW;
                int baseY = my * mcuH;

                if (is420)
                {
                    // 4 Luminance blocks (2x2)
                    for (int by = 0; by < 2; by++)
                    {
                        for (int bx = 0; bx < 2; bx++)
                        {
                            blocks.Add(EncodeSingleBlock(
                                blockCounter++, mcuCounter, my, mx, "Y", 0,
                                baseX + bx * 8, baseY + by * 8, false,
                                paddedW, srcRgb, srcOffsets, paddedFlags, yPlane, cbPlane, crPlane,
                                lumaQuant, dc0, ac0, ref prevDc[0], fixedPoint, writer));
                        }
                    }

                    // 1 Cb block (2x2 averaged)
                    blocks.Add(EncodeSingleBlock(
                        blockCounter++, mcuCounter, my, mx, "Cb", 1,
                        baseX, baseY, true,
                        paddedW, srcRgb, srcOffsets, paddedFlags, yPlane, cbPlane, crPlane,
                        chromaQuant, dc1, ac1, ref prevDc[1], fixedPoint, writer));

                    // 1 Cr block (2x2 averaged)
                    blocks.Add(EncodeSingleBlock(
                        blockCounter++, mcuCounter, my, mx, "Cr", 2,
                        baseX, baseY, true,
                        paddedW, srcRgb, srcOffsets, paddedFlags, yPlane, cbPlane, crPlane,
                        chromaQuant, dc1, ac1, ref prevDc[2], fixedPoint, writer));
                }
                else
                {
                    // 4:4:4 -> Y, Cb, Cr (1x1 each)
                    blocks.Add(EncodeSingleBlock(
                        blockCounter++, mcuCounter, my, mx, "Y", 0,
                        baseX, baseY, false,
                        paddedW, srcRgb, srcOffsets, paddedFlags, yPlane, cbPlane, crPlane,
                        lumaQuant, dc0, ac0, ref prevDc[0], fixedPoint, writer));

                    blocks.Add(EncodeSingleBlock(
                        blockCounter++, mcuCounter, my, mx, "Cb", 1,
                        baseX, baseY, false,
                        paddedW, srcRgb, srcOffsets, paddedFlags, yPlane, cbPlane, crPlane,
                        chromaQuant, dc1, ac1, ref prevDc[1], fixedPoint, writer));

                    blocks.Add(EncodeSingleBlock(
                        blockCounter++, mcuCounter, my, mx, "Cr", 2,
                        baseX, baseY, false,
                        paddedW, srcRgb, srcOffsets, paddedFlags, yPlane, cbPlane, crPlane,
                        chromaQuant, dc1, ac1, ref prevDc[2], fixedPoint, writer));
                }

                mcuCounter++;
            }
        }

        writer.FlushPendingEntropyBits();
        int entropyByteCount = writer.Count - headerByteCount;

        // 8. EOI (FF D9)
        headers.Add(WriteMarkerOnly(writer, "EOI", 0xD9, "End of Image"));
        int trailerByteCount = writer.Count - headerByteCount - entropyByteCount;

        var huffTraces = new List<HuffmanTableTrace>
        {
            ToTrace("DC0 (Luma DC)", dc0),
            ToTrace("AC0 (Luma AC)", ac0),
            ToTrace("DC1 (Chroma DC)", dc1),
            ToTrace("AC1 (Chroma AC)", ac1)
        };

        return new JpegEncodeResult(
            Width: width,
            Height: height,
            PaddedWidth: paddedW,
            PaddedHeight: paddedH,
            Subsampling: is420 ? "4:2:0" : "4:4:4",
            Quality: quality,
            QualityScaleFactor: scaleFactor,
            FixedPoint: fixedPoint,
            JpegBytes: writer.ToArray(),
            LumaQuantTable64: lumaQuant,
            ChromaQuantTable64: chromaQuant,
            HuffmanTables: huffTraces,
            Headers: headers,
            ByteLedger: writer.Ledger,
            Blocks: blocks,
            StuffedZeroCount: writer.StuffedZeroCount,
            TotalEntropyBits: writer.TotalEntropyBits,
            HeaderByteCount: headerByteCount,
            EntropyByteCount: entropyByteCount,
            TrailerByteCount: trailerByteCount);
    }

    private static BlockEncodeTrace EncodeSingleBlock(
        int blockIdx,
        int mcuIdx,
        int mcuRow,
        int mcuCol,
        string component,
        int compKind,
        int originX,
        int originY,
        bool subsampled2x2,
        int paddedW,
        byte[] srcRgb,
        int[] srcOffsets,
        bool[] paddedFlags,
        byte[] yPlane,
        byte[] cbPlane,
        byte[] crPlane,
        int[] quantTable,
        HuffmanTable dcTable,
        HuffmanTable acTable,
        ref int prevDc,
        bool fixedPoint,
        JpegByteLedgerWriter writer)
    {
        var pixels = new PixelColorTrace[64];
        var rawChannel = new byte[64];
        var shifted = new int[64];

        for (int r = 0; r < 8; r++)
        {
            for (int c = 0; c < 8; c++)
            {
                int idx64 = r * 8 + c;
                if (!subsampled2x2)
                {
                    int px = originX + c;
                    int py = originY + r;
                    int pIdx = py * paddedW + px;
                    byte ch = compKind == 0 ? yPlane[pIdx] : compKind == 1 ? cbPlane[pIdx] : crPlane[pIdx];

                    pixels[idx64] = new PixelColorTrace(
                        px, py, srcOffsets[pIdx], paddedFlags[pIdx],
                        srcRgb[pIdx * 3], srcRgb[pIdx * 3 + 1], srcRgb[pIdx * 3 + 2],
                        yPlane[pIdx], cbPlane[pIdx], crPlane[pIdx]);
                    rawChannel[idx64] = ch;
                    shifted[idx64] = ch - 128;
                }
                else
                {
                    // 2x2 chroma averaging across 16x16 MCU
                    int px0 = originX + c * 2;
                    int py0 = originY + r * 2;
                    int p00 = py0 * paddedW + px0;
                    int p01 = py0 * paddedW + (px0 + 1);
                    int p10 = (py0 + 1) * paddedW + px0;
                    int p11 = (py0 + 1) * paddedW + (px0 + 1);

                    byte[] plane = compKind == 1 ? cbPlane : crPlane;
                    byte avg = (byte)((plane[p00] + plane[p01] + plane[p10] + plane[p11] + 2) >> 2);

                    pixels[idx64] = new PixelColorTrace(
                        px0, py0, srcOffsets[p00], paddedFlags[p00],
                        srcRgb[p00 * 3], srcRgb[p00 * 3 + 1], srcRgb[p00 * 3 + 2],
                        yPlane[p00],
                        (byte)((cbPlane[p00] + cbPlane[p01] + cbPlane[p10] + cbPlane[p11] + 2) >> 2),
                        (byte)((crPlane[p00] + crPlane[p01] + crPlane[p10] + crPlane[p11] + 2) >> 2));
                    rawChannel[idx64] = avg;
                    shifted[idx64] = avg - 128;
                }
            }
        }

        DctTransform.Forward2D(shifted, out double[] rowDct, out double[] dctFloat, out int[] dctRounded, fixedPoint);

        var quantized = new int[64];
        for (int i = 0; i < 64; i++)
        {
            // Divide exact DCT coefficient (or fixed-point integer) by quant step
            double val = fixedPoint ? dctRounded[i] : dctFloat[i];
            quantized[i] = (int)System.Math.Round(val / quantTable[i], MidpointRounding.AwayFromZero);
        }

        var zigzag = new int[64];
        for (int zz = 0; zz < 64; zz++)
        {
            zigzag[zz] = quantized[StandardTables.ZigZagToRaster[zz]];
        }

        // Entropy encode DC + AC
        var tokens = new List<EntropyTokenTrace>();
        int blockByteStart = writer.CurrentByteTargetOffset;
        long blockBitStart = writer.TotalEntropyBits;
        int tokenIdx = 0;

        string dcTableName = compKind == 0 ? "DC0" : "DC1";
        string acTableName = compKind == 0 ? "AC0" : "AC1";

        // DC DPCM
        int dcPrev = prevDc;
        int dcCurr = zigzag[0];
        int dcDiff = dcCurr - dcPrev;
        prevDc = dcCurr;

        VliCodec.Encode(dcDiff, out int dcSize, out _, out string dcVliBits);
        byte dcSym = (byte)dcSize;
        if (!dcTable.TryGetEncodeCode(dcSym, out _, out _, out string dcHuffBits))
            throw new InvalidOperationException($"Missing DC Huffman code for size {dcSize}.");

        long dcBitOffset = writer.TotalEntropyBits;
        writer.WriteBits(dcHuffBits, mcuIdx, blockIdx, component, tokenIdx, "HUFFMAN",
            $"{component} DC diff={dcDiff} (curr={dcCurr}-prev={dcPrev}) -> cat={dcSize} Huff='{dcHuffBits}'",
            out int dcHuffByteStart, out int dcHuffByteEnd);

        int dcByteEnd = dcHuffByteEnd;
        if (dcSize > 0)
        {
            writer.WriteBits(dcVliBits, mcuIdx, blockIdx, component, tokenIdx, "VLI",
                $"{component} DC diff={dcDiff} VLI({dcSize})='{dcVliBits}'",
                out _, out dcByteEnd);
        }

        string dcCombined = dcHuffBits + dcVliBits;
        tokens.Add(new EntropyTokenTrace(
            TokenIndex: tokenIdx++,
            Kind: "DC",
            ZigZagIndex: 0,
            ZeroRun: 0,
            Size: dcSize,
            PreviousDc: dcPrev,
            Value: dcDiff,
            ReconstructedCoeff: dcCurr,
            SymbolByte: dcSym,
            HuffmanTableName: dcTableName,
            HuffmanBits: dcHuffBits,
            VliBits: dcVliBits,
            CombinedBits: dcCombined,
            BitOffsetStart: dcBitOffset,
            BitLength: dcCombined.Length,
            ByteOffsetStart: dcHuffByteStart,
            ByteOffsetEnd: dcByteEnd));

        // Find last non-zero AC coefficient
        int lastNz = 0;
        for (int zz = 63; zz >= 1; zz--)
        {
            if (zigzag[zz] != 0)
            {
                lastNz = zz;
                break;
            }
        }

        int zeroRun = 0;
        for (int zz = 1; zz <= lastNz; zz++)
        {
            int coeff = zigzag[zz];
            if (coeff == 0)
            {
                zeroRun++;
                if (zeroRun == 16)
                {
                    // Emit ZRL (0xF0)
                    if (!acTable.TryGetEncodeCode(0xF0, out _, out _, out string zrlBits))
                        throw new InvalidOperationException("Missing ZRL (0xF0) code.");

                    long zrlBitOffset = writer.TotalEntropyBits;
                    writer.WriteBits(zrlBits, mcuIdx, blockIdx, component, tokenIdx, "HUFFMAN",
                        $"{component} AC ZRL(0xF0: 16 zeros up to zz={zz}) Huff='{zrlBits}'",
                        out int zrlByteStart, out int zrlByteEnd);

                    tokens.Add(new EntropyTokenTrace(
                        TokenIndex: tokenIdx++,
                        Kind: "ZRL",
                        ZigZagIndex: zz,
                        ZeroRun: 15,
                        Size: 0,
                        PreviousDc: dcPrev,
                        Value: 0,
                        ReconstructedCoeff: 0,
                        SymbolByte: 0xF0,
                        HuffmanTableName: acTableName,
                        HuffmanBits: zrlBits,
                        VliBits: string.Empty,
                        CombinedBits: zrlBits,
                        BitOffsetStart: zrlBitOffset,
                        BitLength: zrlBits.Length,
                        ByteOffsetStart: zrlByteStart,
                        ByteOffsetEnd: zrlByteEnd));

                    zeroRun = 0;
                }
            }
            else
            {
                VliCodec.Encode(coeff, out int acSize, out _, out string acVliBits);
                byte rs = (byte)((zeroRun << 4) | acSize);
                if (!acTable.TryGetEncodeCode(rs, out _, out _, out string acHuffBits))
                    throw new InvalidOperationException($"Missing AC Huffman code for RS=0x{rs:X2} (coeff={coeff}).");

                long acBitOffset = writer.TotalEntropyBits;
                writer.WriteBits(acHuffBits, mcuIdx, blockIdx, component, tokenIdx, "HUFFMAN",
                    $"{component} AC[zz={zz}] run={zeroRun},size={acSize} (0x{rs:X2}) val={coeff} Huff='{acHuffBits}'",
                    out int acByteStart, out int acHuffEnd);

                writer.WriteBits(acVliBits, mcuIdx, blockIdx, component, tokenIdx, "VLI",
                    $"{component} AC[zz={zz}] val={coeff} VLI({acSize})='{acVliBits}'",
                    out _, out int acByteEnd);

                string combined = acHuffBits + acVliBits;
                tokens.Add(new EntropyTokenTrace(
                    TokenIndex: tokenIdx++,
                    Kind: "AC",
                    ZigZagIndex: zz,
                    ZeroRun: zeroRun,
                    Size: acSize,
                    PreviousDc: dcPrev,
                    Value: coeff,
                    ReconstructedCoeff: coeff,
                    SymbolByte: rs,
                    HuffmanTableName: acTableName,
                    HuffmanBits: acHuffBits,
                    VliBits: acVliBits,
                    CombinedBits: combined,
                    BitOffsetStart: acBitOffset,
                    BitLength: combined.Length,
                    ByteOffsetStart: acByteStart,
                    ByteOffsetEnd: acByteEnd));

                zeroRun = 0;
            }
        }

        if (lastNz < 63)
        {
            if (!acTable.TryGetEncodeCode(0x00, out _, out _, out string eobBits))
                throw new InvalidOperationException("Missing EOB (0x00) code.");

            long eobBitOffset = writer.TotalEntropyBits;
            writer.WriteBits(eobBits, mcuIdx, blockIdx, component, tokenIdx, "HUFFMAN",
                $"{component} EOB(0x00) remaining {63 - lastNz} coeffs=0 Huff='{eobBits}'",
                out int eobByteStart, out int eobByteEnd);

            tokens.Add(new EntropyTokenTrace(
                TokenIndex: tokenIdx++,
                Kind: "EOB",
                ZigZagIndex: lastNz + 1,
                ZeroRun: 0,
                Size: 0,
                PreviousDc: dcPrev,
                Value: 0,
                ReconstructedCoeff: 0,
                SymbolByte: 0x00,
                HuffmanTableName: acTableName,
                HuffmanBits: eobBits,
                VliBits: string.Empty,
                CombinedBits: eobBits,
                BitOffsetStart: eobBitOffset,
                BitLength: eobBits.Length,
                ByteOffsetStart: eobByteStart,
                ByteOffsetEnd: eobByteEnd));
        }

        int blockByteEnd = writer.LastTouchedByteOffset;
        int totalBits = (int)(writer.TotalEntropyBits - blockBitStart);

        return new BlockEncodeTrace(
            BlockIndex: blockIdx,
            McuIndex: mcuIdx,
            McuRow: mcuRow,
            McuCol: mcuCol,
            Component: component,
            OriginX: originX,
            OriginY: originY,
            Pixels: pixels,
            RawChannel64: rawChannel,
            Shifted64: shifted,
            RowDct64: rowDct,
            DctFloat64: dctFloat,
            DctRounded64: dctRounded,
            QuantTable64: quantTable,
            Quantized64: quantized,
            ZigZag64: zigzag,
            Tokens: tokens,
            EntropyByteStart: blockByteStart,
            EntropyByteEnd: blockByteEnd,
            TotalBits: totalBits);
    }

    private static HeaderSegmentTrace WriteMarkerOnly(JpegByteLedgerWriter w, string name, byte code, string desc)
    {
        int start = w.Count;
        var fields = new List<HeaderFieldTrace>();
        w.WriteHeaderByte(0xFF, "MARKER_PREFIX", name, $"{name} Marker Prefix");
        w.WriteHeaderByte(code, "MARKER_CODE", name, $"{name} Marker Code ({desc})");
        fields.Add(new HeaderFieldTrace(start, 2, $"FF {code:X2}", name, desc));
        return new HeaderSegmentTrace(name, $"FF {code:X2}", start, 2, fields);
    }

    private static HeaderSegmentTrace WriteApp0(JpegByteLedgerWriter w)
    {
        int start = w.Count;
        var fields = new List<HeaderFieldTrace>();

        w.WriteHeaderByte(0xFF, "MARKER_PREFIX", "APP0", "APP0 Marker Prefix");
        w.WriteHeaderByte(0xE0, "MARKER_CODE", "APP0", "APP0 Marker Code");
        fields.Add(new HeaderFieldTrace(start, 2, "FF E0", "Marker", "APP0 JFIF Application Segment"));

        w.WriteHeaderUInt16(16, "SEGMENT_LEN", "APP0", "Segment Length (16 bytes)");
        fields.Add(new HeaderFieldTrace(start + 2, 2, "00 10", "Length", "16 bytes (excluding marker)"));

        byte[] id = [(byte)'J', (byte)'F', (byte)'I', (byte)'F', 0x00];
        w.WriteHeaderBytes(id, "HEADER_FIELD", "APP0", "Identifier 'JFIF\\0'");
        fields.Add(new HeaderFieldTrace(start + 4, 5, "4A 46 49 46 00", "Identifier", "ASCII 'JFIF\\0'"));

        w.WriteHeaderByte(1, "HEADER_FIELD", "APP0", "JFIF Version Major (1)");
        w.WriteHeaderByte(1, "HEADER_FIELD", "APP0", "JFIF Version Minor (1)");
        fields.Add(new HeaderFieldTrace(start + 9, 2, "01 01", "Version", "JFIF v1.01"));

        w.WriteHeaderByte(0, "HEADER_FIELD", "APP0", "Density Units = 0 (aspect ratio)");
        w.WriteHeaderUInt16(1, "HEADER_FIELD", "APP0", "Xdensity = 1");
        w.WriteHeaderUInt16(1, "HEADER_FIELD", "APP0", "Ydensity = 1");
        fields.Add(new HeaderFieldTrace(start + 11, 5, "00 00 01 00 01", "Pixel Density", "Units=0 (no units), X=1, Y=1"));

        w.WriteHeaderByte(0, "HEADER_FIELD", "APP0", "Xthumbnail = 0");
        w.WriteHeaderByte(0, "HEADER_FIELD", "APP0", "Ythumbnail = 0");
        fields.Add(new HeaderFieldTrace(start + 16, 2, "00 00", "Thumbnail", "0 x 0 (no embedded thumbnail)"));

        return new HeaderSegmentTrace("APP0 (JFIF)", "FF E0", start, w.Count - start, fields);
    }

    private static HeaderSegmentTrace WriteDqt(JpegByteLedgerWriter w, byte tableId, string label, int[] quant64)
    {
        string seg = $"DQT{tableId}";
        int start = w.Count;
        var fields = new List<HeaderFieldTrace>();

        w.WriteHeaderByte(0xFF, "MARKER_PREFIX", seg, $"{seg} Marker Prefix");
        w.WriteHeaderByte(0xDB, "MARKER_CODE", seg, $"{seg} Marker Code");
        fields.Add(new HeaderFieldTrace(start, 2, "FF DB", "Marker", $"Define Quantization Table #{tableId} ({label})"));

        w.WriteHeaderUInt16(67, "SEGMENT_LEN", seg, "Segment Length (67 bytes)");
        fields.Add(new HeaderFieldTrace(start + 2, 2, "00 43", "Length", "67 bytes (2 len + 1 PqTq + 64 table)"));

        w.WriteHeaderByte(tableId, "HEADER_FIELD", seg, $"Pq=0 (8-bit precision), Tq={tableId} ({label})");
        fields.Add(new HeaderFieldTrace(start + 4, 1, $"{tableId:X2}", "Pq | Tq", $"Precision=8-bit (0), Table ID={tableId}"));

        int qStart = w.Count;
        var hexParts = new string[64];
        for (int zz = 0; zz < 64; zz++)
        {
            int rasterIdx = StandardTables.ZigZagToRaster[zz];
            byte qByte = checked((byte)quant64[rasterIdx]);
            hexParts[zz] = $"{qByte:X2}";
            w.WriteHeaderByte(qByte, "HEADER_FIELD", seg, $"Q[zz={zz}] (row={rasterIdx / 8},col={rasterIdx % 8}) = {qByte}");
        }
        fields.Add(new HeaderFieldTrace(qStart, 64, string.Join(" ", hexParts), "Quantization Values (ZigZag)", $"64 8-bit steps in zig-zag order"));

        return new HeaderSegmentTrace($"DQT #{tableId} ({label})", "FF DB", start, w.Count - start, fields);
    }

    private static HeaderSegmentTrace WriteSof0(JpegByteLedgerWriter w, int width, int height, bool is420)
    {
        int start = w.Count;
        var fields = new List<HeaderFieldTrace>();

        w.WriteHeaderByte(0xFF, "MARKER_PREFIX", "SOF0", "SOF0 Marker Prefix");
        w.WriteHeaderByte(0xC0, "MARKER_CODE", "SOF0", "SOF0 Marker Code (Baseline DCT)");
        fields.Add(new HeaderFieldTrace(start, 2, "FF C0", "Marker", "Start of Frame 0 (Baseline DCT)"));

        w.WriteHeaderUInt16(17, "SEGMENT_LEN", "SOF0", "Segment Length (17 bytes)");
        fields.Add(new HeaderFieldTrace(start + 2, 2, "00 11", "Length", "17 bytes (8 + 3 * 3 components)"));

        w.WriteHeaderByte(8, "HEADER_FIELD", "SOF0", "Sample Precision = 8 bits");
        fields.Add(new HeaderFieldTrace(start + 4, 1, "08", "Precision", "8 bits per sample"));

        w.WriteHeaderUInt16((ushort)height, "HEADER_FIELD", "SOF0", $"Image Height = {height}");
        fields.Add(new HeaderFieldTrace(start + 5, 2, $"{height >> 8:X2} {height & 0xFF:X2}", "Height", $"{height} pixels"));

        w.WriteHeaderUInt16((ushort)width, "HEADER_FIELD", "SOF0", $"Image Width = {width}");
        fields.Add(new HeaderFieldTrace(start + 7, 2, $"{width >> 8:X2} {width & 0xFF:X2}", "Width", $"{width} pixels"));

        w.WriteHeaderByte(3, "HEADER_FIELD", "SOF0", "Number of Components = 3 (Y, Cb, Cr)");
        fields.Add(new HeaderFieldTrace(start + 9, 1, "03", "Components (Nf)", "3 color components"));

        byte ySampling = is420 ? (byte)0x22 : (byte)0x11;
        w.WriteHeaderByte(1, "HEADER_FIELD", "SOF0", "Component 1 (Y) ID = 1");
        w.WriteHeaderByte(ySampling, "HEADER_FIELD", "SOF0", $"Component 1 (Y) Sampling H={(ySampling >> 4)}, V={(ySampling & 0xF)}");
        w.WriteHeaderByte(0, "HEADER_FIELD", "SOF0", "Component 1 (Y) Quant Table Tq = 0");
        fields.Add(new HeaderFieldTrace(start + 10, 3, $"01 {ySampling:X2} 00", "Comp 1 (Y)", $"ID=1, Sampling={ySampling >> 4}x{ySampling & 0xF}, DQT=0"));

        w.WriteHeaderByte(2, "HEADER_FIELD", "SOF0", "Component 2 (Cb) ID = 2");
        w.WriteHeaderByte(0x11, "HEADER_FIELD", "SOF0", "Component 2 (Cb) Sampling H=1, V=1");
        w.WriteHeaderByte(1, "HEADER_FIELD", "SOF0", "Component 2 (Cb) Quant Table Tq = 1");
        fields.Add(new HeaderFieldTrace(start + 13, 3, "02 11 01", "Comp 2 (Cb)", "ID=2, Sampling=1x1, DQT=1"));

        w.WriteHeaderByte(3, "HEADER_FIELD", "SOF0", "Component 3 (Cr) ID = 3");
        w.WriteHeaderByte(0x11, "HEADER_FIELD", "SOF0", "Component 3 (Cr) Sampling H=1, V=1");
        w.WriteHeaderByte(1, "HEADER_FIELD", "SOF0", "Component 3 (Cr) Quant Table Tq = 1");
        fields.Add(new HeaderFieldTrace(start + 16, 3, "03 11 01", "Comp 3 (Cr)", "ID=3, Sampling=1x1, DQT=1"));

        return new HeaderSegmentTrace("SOF0 (Baseline Frame)", "FF C0", start, w.Count - start, fields);
    }

    private static HeaderSegmentTrace WriteDht(JpegByteLedgerWriter w, string segName, HuffmanTable table)
    {
        int start = w.Count;
        var fields = new List<HeaderFieldTrace>();
        int segLen = 2 + 1 + 16 + table.Values.Length;
        string classStr = table.TableClass == 0 ? "DC" : "AC";

        w.WriteHeaderByte(0xFF, "MARKER_PREFIX", segName, $"{segName} Marker Prefix");
        w.WriteHeaderByte(0xC4, "MARKER_CODE", segName, $"{segName} Marker Code");
        fields.Add(new HeaderFieldTrace(start, 2, "FF C4", "Marker", $"Define Huffman Table ({classStr} ID={table.TableId})"));

        w.WriteHeaderUInt16((ushort)segLen, "SEGMENT_LEN", segName, $"Segment Length ({segLen} bytes)");
        fields.Add(new HeaderFieldTrace(start + 2, 2, $"{segLen >> 8:X2} {segLen & 0xFF:X2}", "Length", $"{segLen} bytes"));

        byte tcTh = (byte)((table.TableClass << 4) | table.TableId);
        w.WriteHeaderByte(tcTh, "HEADER_FIELD", segName, $"Tc={table.TableClass} ({classStr}), Th={table.TableId}");
        fields.Add(new HeaderFieldTrace(start + 4, 1, $"{tcTh:X2}", "Tc | Th", $"Class={classStr} ({table.TableClass}), Table ID={table.TableId}"));

        int bitsStart = w.Count;
        var bitsHex = new string[16];
        for (int i = 0; i < 16; i++)
        {
            byte count = table.Bits[i];
            bitsHex[i] = $"{count:X2}";
            w.WriteHeaderByte(count, "HEADER_FIELD", segName, $"BITS[len={i + 1}] = {count} codes");
        }
        fields.Add(new HeaderFieldTrace(bitsStart, 16, string.Join(" ", bitsHex), "BITS[1..16]", $"Code counts per bit-length (total={table.Values.Length})"));

        int valsStart = w.Count;
        var valsHex = new string[table.Values.Length];
        for (int i = 0; i < table.Values.Length; i++)
        {
            byte v = table.Values[i];
            valsHex[i] = $"{v:X2}";
            w.WriteHeaderByte(v, "HEADER_FIELD", segName, $"HUFFVAL[{i}] = 0x{v:X2}");
        }
        fields.Add(new HeaderFieldTrace(valsStart, table.Values.Length, string.Join(" ", valsHex), "HUFFVAL", $"{table.Values.Length} symbol bytes"));

        return new HeaderSegmentTrace($"DHT ({classStr}{table.TableId})", "FF C4", start, w.Count - start, fields);
    }

    private static HeaderSegmentTrace WriteSos(JpegByteLedgerWriter w)
    {
        int start = w.Count;
        var fields = new List<HeaderFieldTrace>();

        w.WriteHeaderByte(0xFF, "MARKER_PREFIX", "SOS", "SOS Marker Prefix");
        w.WriteHeaderByte(0xDA, "MARKER_CODE", "SOS", "SOS Marker Code");
        fields.Add(new HeaderFieldTrace(start, 2, "FF DA", "Marker", "Start of Scan"));

        w.WriteHeaderUInt16(12, "SEGMENT_LEN", "SOS", "Segment Length (12 bytes)");
        fields.Add(new HeaderFieldTrace(start + 2, 2, "00 0C", "Length", "12 bytes"));

        w.WriteHeaderByte(3, "HEADER_FIELD", "SOS", "Components in scan Ns = 3");
        fields.Add(new HeaderFieldTrace(start + 4, 1, "03", "Ns", "3 components in interleaved scan"));

        w.WriteHeaderByte(1, "HEADER_FIELD", "SOS", "Scan Comp 1 (Y) ID = 1");
        w.WriteHeaderByte(0x00, "HEADER_FIELD", "SOS", "Y Huffman Tables: DC=0, AC=0");
        fields.Add(new HeaderFieldTrace(start + 5, 2, "01 00", "Comp 1 (Y)", "Cs=1, Td=0 (DC0), Ta=0 (AC0)"));

        w.WriteHeaderByte(2, "HEADER_FIELD", "SOS", "Scan Comp 2 (Cb) ID = 2");
        w.WriteHeaderByte(0x11, "HEADER_FIELD", "SOS", "Cb Huffman Tables: DC=1, AC=1");
        fields.Add(new HeaderFieldTrace(start + 7, 2, "02 11", "Comp 2 (Cb)", "Cs=2, Td=1 (DC1), Ta=1 (AC1)"));

        w.WriteHeaderByte(3, "HEADER_FIELD", "SOS", "Scan Comp 3 (Cr) ID = 3");
        w.WriteHeaderByte(0x11, "HEADER_FIELD", "SOS", "Cr Huffman Tables: DC=1, AC=1");
        fields.Add(new HeaderFieldTrace(start + 9, 2, "03 11", "Comp 3 (Cr)", "Cs=3, Td=1 (DC1), Ta=1 (AC1)"));

        w.WriteHeaderByte(0, "HEADER_FIELD", "SOS", "Ss = 0 (Spectral selection start)");
        w.WriteHeaderByte(63, "HEADER_FIELD", "SOS", "Se = 63 (Spectral selection end)");
        w.WriteHeaderByte(0, "HEADER_FIELD", "SOS", "Ah=0, Al=0 (Successive approx)");
        fields.Add(new HeaderFieldTrace(start + 11, 3, "00 3F 00", "Spectral/Approx", "Ss=0, Se=63, Ah=0, Al=0 (Baseline sequential)"));

        return new HeaderSegmentTrace("SOS (Start of Scan)", "FF DA", start, w.Count - start, fields);
    }

    private static HuffmanTableTrace ToTrace(string name, HuffmanTable table) =>
        new(name, table.TableClass, table.TableId, table.Bits, table.Values, table.Entries, table.Levels);

    private sealed class JpegByteLedgerWriter
    {
        private readonly List<byte> _bytes = [];
        private readonly List<ByteTraceEntry> _ledger = [];
        private byte _currentByte;
        private int _bitsInCurrent;
        private readonly List<BitSliceInfo> _currentSlices = [];
        private int _lastTouchedByteOffset;

        public int Count => _bytes.Count;
        public int CurrentByteTargetOffset => _bytes.Count;
        public int LastTouchedByteOffset => _lastTouchedByteOffset;
        public int StuffedZeroCount { get; private set; }
        public long TotalEntropyBits { get; private set; }
        public IReadOnlyList<ByteTraceEntry> Ledger => _ledger;

        public void WriteHeaderByte(byte val, string category, string segment, string fieldName)
        {
            int offset = _bytes.Count;
            _bytes.Add(val);
            _ledger.Add(new ByteTraceEntry(offset, val, category, segment, fieldName, -1, -1, []));
            _lastTouchedByteOffset = offset;
        }

        public void WriteHeaderUInt16(ushort val, string category, string segment, string fieldName)
        {
            WriteHeaderByte((byte)(val >> 8), category, segment, $"{fieldName} [MSB]");
            WriteHeaderByte((byte)(val & 0xFF), category, segment, $"{fieldName} [LSB]");
        }

        public void WriteHeaderBytes(ReadOnlySpan<byte> data, string category, string segment, string fieldName)
        {
            for (int i = 0; i < data.Length; i++)
            {
                WriteHeaderByte(data[i], category, segment, $"{fieldName} [{i}]");
            }
        }

        public void WriteBits(
            string bitStr,
            int mcuIdx,
            int blockIdx,
            string comp,
            int symIdx,
            string kind,
            string detail,
            out int byteStart,
            out int byteEnd)
        {
            byteStart = _bytes.Count;
            byteEnd = _bytes.Count;

            int pos = 0;
            while (pos < bitStr.Length)
            {
                int space = 8 - _bitsInCurrent;
                int take = System.Math.Min(space, bitStr.Length - pos);
                string sliceStr = bitStr.Substring(pos, take);

                int highBit = 7 - _bitsInCurrent;
                int lowBit = highBit - take + 1;

                for (int i = 0; i < take; i++)
                {
                    _currentByte = (byte)((_currentByte << 1) | (bitStr[pos + i] == '1' ? 1 : 0));
                }

                _currentSlices.Add(new BitSliceInfo(
                    highBit, lowBit, sliceStr, mcuIdx, blockIdx, comp, symIdx, kind, detail));

                _bitsInCurrent += take;
                TotalEntropyBits += take;
                pos += take;

                int targetOffset = _bytes.Count;
                byteEnd = targetOffset;
                _lastTouchedByteOffset = targetOffset;

                if (_bitsInCurrent == 8)
                {
                    EmitCompletedEntropyByte(mcuIdx, blockIdx, comp, symIdx);
                }
            }
        }

        public void FlushPendingEntropyBits()
        {
            if (_bitsInCurrent == 0) return;

            int padCount = 8 - _bitsInCurrent;
            int highBit = 7 - _bitsInCurrent;
            for (int i = 0; i < padCount; i++)
            {
                _currentByte = (byte)((_currentByte << 1) | 1);
            }

            string padBits = new('1', padCount);
            _currentSlices.Add(new BitSliceInfo(
                highBit, 0, padBits, -1, -1, "PAD", -1, "PAD_1S",
                $"End-of-scan bit padding ({padCount} trailing '1' bits)"));

            _lastTouchedByteOffset = _bytes.Count;
            EmitCompletedEntropyByte(-1, -1, "PAD", -1);
        }

        private void EmitCompletedEntropyByte(int mcuIdx, int blockIdx, string comp, int symIdx)
        {
            int offset = _bytes.Count;
            byte val = _currentByte;
            _bytes.Add(val);

            string summary = string.Join(" | ", _currentSlices.Select(s => $"b[{s.HighBit}..{s.LowBit}]={s.Kind}"));
            _ledger.Add(new ByteTraceEntry(
                offset, val, "ENTROPY_DATA", "SCAN", summary, mcuIdx, blockIdx, _currentSlices.ToArray()));

            if (val == 0xFF)
            {
                int stuffOffset = _bytes.Count;
                _bytes.Add(0x00);
                StuffedZeroCount++;
                _ledger.Add(new ByteTraceEntry(
                    stuffOffset,
                    0x00,
                    "STUFFED_ZERO",
                    "SCAN",
                    $"Byte-stuffing 0x00 inserted after entropy 0xFF at 0x{offset:X4}",
                    mcuIdx,
                    blockIdx,
                    [new BitSliceInfo(7, 0, "00000000", mcuIdx, blockIdx, comp, symIdx, "STUFF_00", $"Escapes preceding 0xFF @ 0x{offset:X4}")]));
            }

            _currentByte = 0;
            _bitsInCurrent = 0;
            _currentSlices.Clear();
        }

        public byte[] ToArray() => _bytes.ToArray();
    }
}
