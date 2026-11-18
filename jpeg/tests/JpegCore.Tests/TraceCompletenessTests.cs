using JpegCore;
using JpegCore.Trace;
using Xunit;

namespace JpegCore.Tests;

public class TraceCompletenessTests
{
    private static void AssertCompleteByteAndBitLedger(byte[] jpegBytes, IReadOnlyList<ByteTraceEntry> ledger)
    {
        Assert.Equal(jpegBytes.Length, ledger.Count);

        for (int i = 0; i < jpegBytes.Length; i++)
        {
            ByteTraceEntry entry = ledger[i];
            Assert.Equal(i, entry.Offset);
            Assert.Equal(jpegBytes[i], entry.Value);
            Assert.False(string.IsNullOrWhiteSpace(entry.Category));
            Assert.False(string.IsNullOrWhiteSpace(entry.Segment));
            Assert.False(string.IsNullOrWhiteSpace(entry.FieldName));

            if (entry.Category == "ENTROPY_DATA")
            {
                Assert.True(entry.BitSlices.Count > 0, $"Entropy byte at offset 0x{i:X4} has empty BitSlices.");

                int expectedHighBit = 7;
                string reconstructedBits = "";
                foreach (var slice in entry.BitSlices)
                {
                    Assert.Equal(expectedHighBit, slice.HighBit);
                    Assert.True(slice.LowBit >= 0 && slice.LowBit <= slice.HighBit);
                    Assert.Equal(slice.HighBit - slice.LowBit + 1, slice.Bits.Length);
                    reconstructedBits += slice.Bits;
                    expectedHighBit = slice.LowBit - 1;
                }

                Assert.Equal(-1, expectedHighBit);
                Assert.Equal(8, reconstructedBits.Length);

                byte reconstructedByte = Convert.ToByte(reconstructedBits, 2);
                Assert.Equal(jpegBytes[i], reconstructedByte);
            }
            else if (entry.Category == "STUFFED_ZERO")
            {
                Assert.Equal(0x00, entry.Value);
                Assert.True(i > 0 && jpegBytes[i - 1] == 0xFF, $"STUFFED_ZERO at 0x{i:X4} not preceded by 0xFF.");
            }
        }
    }

    [Theory]
    [InlineData(8, 8, ChromaSubsampling.YCbCr444)]
    [InlineData(16, 16, ChromaSubsampling.YCbCr420)]
    [InlineData(32, 32, ChromaSubsampling.YCbCr444)]
    public void EncodeAndDecode_AccountFor100PercentOfBytesAndBits(int w, int h, ChromaSubsampling sub)
    {
        var rng = new Random(999);
        var rgb = new byte[w * h * 3];
        rng.NextBytes(rgb);

        var enc = JpegEncoder.Encode(rgb, w, h, new JpegEncodeOptions(95, sub));
        AssertCompleteByteAndBitLedger(enc.JpegBytes, enc.ByteLedger);
        Assert.Equal(enc.JpegBytes.Length, enc.HeaderByteCount + enc.EntropyByteCount + enc.TrailerByteCount);

        var dec = JpegDecoder.Decode(enc.JpegBytes);
        AssertCompleteByteAndBitLedger(enc.JpegBytes, dec.ByteLedger);

        // Verify token count and symbols match 1:1 between encoder and decoder
        Assert.Equal(enc.Blocks.Count, dec.Blocks.Count);
        for (int b = 0; b < enc.Blocks.Count; b++)
        {
            Assert.Equal(enc.Blocks[b].ZigZag64, dec.Blocks[b].ZigZag64);
            Assert.Equal(enc.Blocks[b].Tokens.Count, dec.Blocks[b].Tokens.Count);
            for (int t = 0; t < enc.Blocks[b].Tokens.Count; t++)
            {
                Assert.Equal(enc.Blocks[b].Tokens[t].SymbolByte, dec.Blocks[b].Tokens[t].SymbolByte);
                Assert.Equal(enc.Blocks[b].Tokens[t].CombinedBits, dec.Blocks[b].Tokens[t].CombinedBits);
            }
        }
    }
}
