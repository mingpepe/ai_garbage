using System.Diagnostics;
using JpegCore;
using JpegCore.Tables;
using Xunit;

namespace JpegCore.Tests;

public class EncoderDecoderTests
{
    private static byte[] MakeSyntheticImage(int w, int h, int seed = 42)
    {
        var rng = new Random(seed);
        var rgb = new byte[w * h * 3];
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int idx = (y * w + x) * 3;
                rgb[idx] = (byte)System.Math.Clamp((x * 255) / System.Math.Max(1, w - 1) + rng.Next(-12, 13), 0, 255);
                rgb[idx + 1] = (byte)System.Math.Clamp((y * 255) / System.Math.Max(1, h - 1) + rng.Next(-12, 13), 0, 255);
                rgb[idx + 2] = (byte)System.Math.Clamp(((x + y) * 128) / System.Math.Max(1, w + h - 2), 0, 255);
            }
        }
        return rgb;
    }

    private static byte[] MakeHighEntropyChecker(int w, int h)
    {
        var rng = new Random(1337);
        var rgb = new byte[w * h * 3];
        for (int i = 0; i < rgb.Length; i++)
        {
            rgb[i] = (byte)rng.Next(0, 256);
        }
        return rgb;
    }

    private static double ComputePsnr(byte[] a, byte[] b)
    {
        double mse = 0;
        for (int i = 0; i < a.Length; i++)
        {
            int d = a[i] - b[i];
            mse += d * d;
        }
        mse /= a.Length;
        if (mse == 0) return double.PositiveInfinity;
        return 10.0 * System.Math.Log10(255.0 * 255.0 / mse);
    }

    [Theory]
    [InlineData(8, 8, 90, ChromaSubsampling.YCbCr444, false)]
    [InlineData(16, 16, 75, ChromaSubsampling.YCbCr444, false)]
    [InlineData(16, 16, 75, ChromaSubsampling.YCbCr420, false)]
    [InlineData(13, 11, 80, ChromaSubsampling.YCbCr444, false)]
    [InlineData(19, 17, 80, ChromaSubsampling.YCbCr420, false)]
    [InlineData(32, 24, 95, ChromaSubsampling.YCbCr444, true)]
    [InlineData(32, 24, 50, ChromaSubsampling.YCbCr420, true)]
    public void RoundTrip_EncodeThenDecode_ProducesAccurateImage(
        int width, int height, int quality, ChromaSubsampling subsampling, bool fixedPoint)
    {
        byte[] src = MakeSyntheticImage(width, height);
        var enc = JpegEncoder.Encode(src, width, height, new JpegEncodeOptions(quality, subsampling, fixedPoint));

        Assert.True(enc.JpegBytes.Length > 100);
        Assert.Equal(0xFF, enc.JpegBytes[0]);
        Assert.Equal(0xD8, enc.JpegBytes[1]);
        Assert.Equal(0xFF, enc.JpegBytes[^2]);
        Assert.Equal(0xD9, enc.JpegBytes[^1]);

        var dec = JpegDecoder.Decode(enc.JpegBytes, fixedPoint);
        Assert.Equal(width, dec.Width);
        Assert.Equal(height, dec.Height);
        Assert.Equal(src.Length, dec.RgbBytes.Length);

        double psnr = ComputePsnr(src, dec.RgbBytes);
        double minPsnr = quality >= 90 ? 31.0 : quality >= 70 ? 27.0 : 24.0;
        Assert.True(psnr >= minPsnr, $"Expected PSNR >= {minPsnr}, got {psnr:F2} dB");
    }

    [Fact]
    public void ByteStuffing_IsTriggeredAndDestuffedCorrectly()
    {
        byte[] noisy = MakeHighEntropyChecker(64, 64);
        var enc = JpegEncoder.Encode(noisy, 64, 64, new JpegEncodeOptions(98, ChromaSubsampling.YCbCr444));
        Assert.True(enc.StuffedZeroCount > 0, "Expected at least one 0xFF 0x00 byte-stuffing event on high-entropy image.");

        var dec = JpegDecoder.Decode(enc.JpegBytes);
        Assert.Equal(enc.StuffedZeroCount, dec.DestuffEvents.Count);

        double psnr = ComputePsnr(noisy, dec.RgbBytes);
        Assert.True(psnr > 34.0, $"High quality roundtrip PSNR too low: {psnr:F2}");
    }

    [Fact]
    public void VliCodec_RoundTripsAllRanges()
    {
        for (int v = -2047; v <= 2047; v++)
        {
            VliCodec.Encode(v, out int size, out int bits, out string str);
            Assert.Equal(size, str.Length);
            int decoded = VliCodec.Extend(bits, size);
            Assert.Equal(v, decoded);
        }
    }

    [Fact]
    public void CrossCompatibility_WithPythonPillow()
    {
        byte[] src = MakeSyntheticImage(24, 16, seed: 77);
        var enc = JpegEncoder.Encode(src, 24, 16, new JpegEncodeOptions(85, ChromaSubsampling.YCbCr444));

        string tmpDir = Path.Combine(Path.GetTempPath(), $"jpeg_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tmpDir);
        try
        {
            string csJpg = Path.Combine(tmpDir, "from_cs.jpg");
            string pyJpg420 = Path.Combine(tmpDir, "from_py_420.jpg");
            string pyJpgOpt = Path.Combine(tmpDir, "from_py_opt.jpg");
            string pyGray = Path.Combine(tmpDir, "from_py_gray.jpg");
            string csDecodedRaw = Path.Combine(tmpDir, "cs_decoded_by_py.raw");
            string pySrcRaw = Path.Combine(tmpDir, "py_src.raw");
            File.WriteAllBytes(csJpg, enc.JpegBytes);
            File.WriteAllBytes(pySrcRaw, src);

            string pyScript = $"""
                from PIL import Image
                # 1. Decode C# JPEG using Pillow
                im = Image.open(r"{csJpg}")
                assert im.size == (24, 16), f"Unexpected size: " + str(im.size)
                with open(r"{csDecodedRaw}", "wb") as f:
                    f.write(im.convert("RGB").tobytes())

                # 2. Encode fresh JPEGs using Pillow (4:2:0, optimize=True, and Grayscale)
                with open(r"{pySrcRaw}", "rb") as f:
                    raw = f.read()
                src = Image.frombytes("RGB", (24, 16), raw)
                src.save(r"{pyJpg420}", format="JPEG", quality=85, subsampling="4:2:0")
                src.save(r"{pyJpgOpt}", format="JPEG", quality=85, optimize=True, subsampling="4:4:4")
                src.convert("L").save(r"{pyGray}", format="JPEG", quality=85)
                """;

            var psi = new ProcessStartInfo("python3")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };
            psi.ArgumentList.Add("-c");
            psi.ArgumentList.Add(pyScript);

            using var proc = Process.Start(psi)!;
            string stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit(10000);
            Assert.True(proc.ExitCode == 0, $"Python Pillow failed: {stderr}");

            // Verify Pillow decoded C# JPEG accurately AND matches C# Decoder closely
            byte[] pyDecoded = File.ReadAllBytes(csDecodedRaw);
            var csDecoded = JpegDecoder.Decode(enc.JpegBytes);
            Assert.True(ComputePsnr(src, pyDecoded) > 30.0);
            Assert.True(ComputePsnr(pyDecoded, csDecoded.RgbBytes) > 45.0,
                $"C# decoder diverged from libjpeg: {ComputePsnr(pyDecoded, csDecoded.RgbBytes):F2} dB");

            // Verify C# decodes Pillow 4:2:0, Pillow optimize=True (dynamic DHT), and Pillow Grayscale
            var dec420 = JpegDecoder.Decode(File.ReadAllBytes(pyJpg420));
            Assert.Equal(24, dec420.Width);
            Assert.Equal(16, dec420.Height);
            Assert.True(ComputePsnr(src, dec420.RgbBytes) > 29.0);

            var decOpt = JpegDecoder.Decode(File.ReadAllBytes(pyJpgOpt));
            Assert.True(ComputePsnr(src, decOpt.RgbBytes) > 30.0);

            var decGray = JpegDecoder.Decode(File.ReadAllBytes(pyGray));
            Assert.Equal("Grayscale", decGray.Subsampling);
            Assert.Equal(24 * 16 * 3, decGray.RgbBytes.Length);
        }
        finally
        {
            Directory.Delete(tmpDir, true);
        }
    }
}
