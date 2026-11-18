using JpegCore.Tables;

namespace JpegCore.Trace;

public sealed record BitSliceInfo(
    int HighBit,
    int LowBit,
    string Bits,
    int McuIndex,
    int BlockIndex,
    string Component,
    int SymbolIndex,
    string Kind,
    string Detail);

public sealed record ByteTraceEntry(
    int Offset,
    byte Value,
    string Category,
    string Segment,
    string FieldName,
    int McuIndex,
    int BlockIndex,
    IReadOnlyList<BitSliceInfo> BitSlices);

public sealed record HeaderFieldTrace(
    int Offset,
    int Length,
    string HexBytes,
    string Name,
    string Interpretation);

public sealed record HeaderSegmentTrace(
    string Name,
    string MarkerHex,
    int StartOffset,
    int Length,
    IReadOnlyList<HeaderFieldTrace> Fields);

public sealed record PixelColorTrace(
    int X,
    int Y,
    int InputByteOffset,
    bool IsEdgePadded,
    byte R,
    byte G,
    byte B,
    byte YVal,
    byte CbVal,
    byte CrVal);

public sealed record EntropyTokenTrace(
    int TokenIndex,
    string Kind,
    int ZigZagIndex,
    int ZeroRun,
    int Size,
    int PreviousDc,
    int Value,
    int ReconstructedCoeff,
    byte SymbolByte,
    string HuffmanTableName,
    string HuffmanBits,
    string VliBits,
    string CombinedBits,
    long BitOffsetStart,
    int BitLength,
    int ByteOffsetStart,
    int ByteOffsetEnd);

public sealed record BlockEncodeTrace(
    int BlockIndex,
    int McuIndex,
    int McuRow,
    int McuCol,
    string Component,
    int OriginX,
    int OriginY,
    IReadOnlyList<PixelColorTrace> Pixels,
    byte[] RawChannel64,
    int[] Shifted64,
    double[] RowDct64,
    double[] DctFloat64,
    int[] DctRounded64,
    int[] QuantTable64,
    int[] Quantized64,
    int[] ZigZag64,
    IReadOnlyList<EntropyTokenTrace> Tokens,
    int EntropyByteStart,
    int EntropyByteEnd,
    int TotalBits);

public sealed record HuffmanTableTrace(
    string Name,
    int TableClass,
    int TableId,
    byte[] Bits,
    byte[] Values,
    IReadOnlyList<HuffmanCodeEntry> Entries,
    IReadOnlyList<HuffmanLevelInfo> Levels);

public sealed record DestuffEventTrace(
    int FfRawOffset,
    int ZeroRawOffset,
    int LogicalByteIndex,
    string Description);

public sealed record BlockDecodeTrace(
    int BlockIndex,
    int McuIndex,
    int McuRow,
    int McuCol,
    string Component,
    int OriginX,
    int OriginY,
    int QuantTableId,
    IReadOnlyList<EntropyTokenTrace> Tokens,
    int[] ZigZag64,
    int[] Quantized64,
    int[] QuantTable64,
    int[] Dequantized64,
    double[] RowIdct64,
    double[] IdctFloat64,
    int[] IdctRounded64,
    byte[] ClampedChannel64,
    int EntropyByteStart,
    int EntropyByteEnd);

public sealed record JpegEncodeResult(
    int Width,
    int Height,
    int PaddedWidth,
    int PaddedHeight,
    string Subsampling,
    int Quality,
    int QualityScaleFactor,
    bool FixedPoint,
    byte[] JpegBytes,
    int[] LumaQuantTable64,
    int[] ChromaQuantTable64,
    IReadOnlyList<HuffmanTableTrace> HuffmanTables,
    IReadOnlyList<HeaderSegmentTrace> Headers,
    IReadOnlyList<ByteTraceEntry> ByteLedger,
    IReadOnlyList<BlockEncodeTrace> Blocks,
    int StuffedZeroCount,
    long TotalEntropyBits,
    int HeaderByteCount,
    int EntropyByteCount,
    int TrailerByteCount);

public sealed record DecodeComponentInfo(
    byte ComponentId,
    string Name,
    int HorizontalSampling,
    int VerticalSampling,
    byte QuantTableId,
    byte DcTableId,
    byte AcTableId);

public sealed record JpegDecodeResult(
    int Width,
    int Height,
    int McuCols,
    int McuRows,
    string Subsampling,
    int RestartInterval,
    bool FixedPoint,
    byte[] RgbBytes,
    IReadOnlyList<DecodeComponentInfo> Components,
    IReadOnlyDictionary<int, int[]> QuantTables,
    IReadOnlyList<HuffmanTableTrace> HuffmanTables,
    IReadOnlyList<HeaderSegmentTrace> Headers,
    IReadOnlyList<ByteTraceEntry> ByteLedger,
    IReadOnlyList<DestuffEventTrace> DestuffEvents,
    IReadOnlyList<BlockDecodeTrace> Blocks,
    IReadOnlyList<PixelColorTrace> OutputPixelSample,
    int ScanStartOffset,
    int ScanEndOffset,
    long TotalEntropyBits);
