namespace JpegCore.Tables;

public sealed record HuffmanCodeEntry(byte Symbol, ushort Code, int Length, string BitString);

public sealed record HuffmanLevelInfo(int BitLength, int Count, int MinCode, int MaxCode, int ValPtr);

public sealed class HuffmanTable
{
    public int TableClass { get; } // 0 = DC, 1 = AC
    public int TableId { get; }    // 0 = Luma, 1 = Chroma
    public byte[] Bits { get; }    // Length 16: counts for bit lengths 1..16
    public byte[] Values { get; }

    public IReadOnlyList<HuffmanCodeEntry> Entries { get; }
    public IReadOnlyList<HuffmanLevelInfo> Levels { get; }

    private readonly ushort[] _encodeCodes = new ushort[256];
    private readonly int[] _encodeLengths = new int[256];
    private readonly string[] _encodeBitStrings = new string[256];

    // ITU-T T.81 Annex F.2.2.3 decoder tables indexed by bit length 1..16
    private readonly int[] _minCode = new int[17];
    private readonly int[] _maxCode = new int[17];
    private readonly int[] _valPtr = new int[17];

    public HuffmanTable(int tableClass, int tableId, byte[] bits16, byte[] values)
    {
        if (bits16.Length != 16)
            throw new ArgumentException("BITS array must have exactly 16 entries.", nameof(bits16));

        int totalCount = 0;
        for (int i = 0; i < 16; i++) totalCount += bits16[i];
        if (values.Length != totalCount)
            throw new ArgumentException($"HUFFVAL length ({values.Length}) does not match sum of BITS ({totalCount}).", nameof(values));

        TableClass = tableClass;
        TableId = tableId;
        Bits = (byte[])bits16.Clone();
        Values = (byte[])values.Clone();

        var entries = new List<HuffmanCodeEntry>(totalCount);
        var levels = new List<HuffmanLevelInfo>(16);

        // ITU-T T.81 Annex C.2 canonical code generation
        int code = 0;
        int valIdx = 0;

        for (int len = 1; len <= 16; len++)
        {
            int count = bits16[len - 1];
            if (count == 0)
            {
                _minCode[len] = 0;
                _maxCode[len] = -1;
                _valPtr[len] = 0;
                levels.Add(new HuffmanLevelInfo(len, 0, 0, -1, 0));
            }
            else
            {
                _valPtr[len] = valIdx;
                _minCode[len] = code;

                for (int k = 0; k < count; k++)
                {
                    byte symbol = values[valIdx++];
                    ushort uCode = checked((ushort)code);
                    string bitStr = Convert.ToString(uCode, 2).PadLeft(len, '0');

                    _encodeCodes[symbol] = uCode;
                    _encodeLengths[symbol] = len;
                    _encodeBitStrings[symbol] = bitStr;
                    entries.Add(new HuffmanCodeEntry(symbol, uCode, len, bitStr));

                    code++;
                }

                _maxCode[len] = code - 1;
                levels.Add(new HuffmanLevelInfo(len, count, _minCode[len], _maxCode[len], _valPtr[len]));
            }

            code <<= 1;
        }

        Entries = entries;
        Levels = levels;
    }

    public bool TryGetEncodeCode(byte symbol, out ushort code, out int length, out string bitString)
    {
        length = _encodeLengths[symbol];
        if (length == 0)
        {
            code = 0;
            bitString = string.Empty;
            return false;
        }
        code = _encodeCodes[symbol];
        bitString = _encodeBitStrings[symbol];
        return true;
    }

    /// <summary>
    /// Decodes one Huffman symbol bit-by-bit using ITU-T T.81 Fig. F.16.
    /// </summary>
    public byte DecodeSymbol(Func<int> readBit, out string codeBits)
    {
        int code = 0;
        var chars = new char[16];

        for (int len = 1; len <= 16; len++)
        {
            int bit = readBit();
            code = (code << 1) | bit;
            chars[len - 1] = bit == 1 ? '1' : '0';

            if (code <= _maxCode[len])
            {
                int idx = _valPtr[len] + (code - _minCode[len]);
                codeBits = new string(chars, 0, len);
                return Values[idx];
            }
        }

        throw new InvalidDataException($"Invalid Huffman code sequence in table (class={TableClass}, id={TableId}).");
    }

    public static HuffmanTable StandardDcLuminance { get; } =
        new(0, 0, StandardTables.DcLuminanceBits, StandardTables.DcLuminanceValues);

    public static HuffmanTable StandardDcChrominance { get; } =
        new(0, 1, StandardTables.DcChrominanceBits, StandardTables.DcChrominanceValues);

    public static HuffmanTable StandardAcLuminance { get; } =
        new(1, 0, StandardTables.AcLuminanceBits, StandardTables.AcLuminanceValues);

    public static HuffmanTable StandardAcChrominance { get; } =
        new(1, 1, StandardTables.AcChrominanceBits, StandardTables.AcChrominanceValues);
}

public static class VliCodec
{
    public static int ComputeCategory(int value)
    {
        int absVal = System.Math.Abs(value);
        int size = 0;
        while (absVal > 0)
        {
            size++;
            absVal >>= 1;
        }
        return size;
    }

    /// <summary>
    /// Encodes a signed coefficient into Variable-Length Integer (category, raw bits).
    /// Positive values use binary representation directly; negative values use (1 &lt;&lt; size) - 1 + value.
    /// </summary>
    public static void Encode(int value, out int size, out int rawBits, out string bitString)
    {
        if (value == 0)
        {
            size = 0;
            rawBits = 0;
            bitString = string.Empty;
            return;
        }

        size = ComputeCategory(value);
        rawBits = value > 0 ? value : ((1 << size) - 1 + value);
        bitString = Convert.ToString(rawBits, 2).PadLeft(size, '0');
    }

    /// <summary>
    /// ITU-T T.81 Fig. F.12 EXTEND: reconstructs signed integer from raw VLI bits and category size.
    /// </summary>
    public static int Extend(int rawBits, int size)
    {
        if (size == 0) return 0;
        int vt = 1 << (size - 1);
        return rawBits < vt ? rawBits - ((1 << size) - 1) : rawBits;
    }
}
