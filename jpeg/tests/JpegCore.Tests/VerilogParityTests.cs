using System.Diagnostics;
using JpegCore;
using Xunit;

namespace JpegCore.Tests;

public class VerilogParityTests
{
    [Fact]
    public void VerilogEncoderAndDecoder_MatchCSharpFixedPoint_BitExact()
    {
        string vvpPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../verilog/build/tb_block_sim.vvp"));
        Assert.True(File.Exists(vvpPath), $"Compiled Verilog simulation binary not found at {vvpPath}");

        const int w = 16;
        const int h = 16;
        var rgb = new byte[w * h * 3];
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                int idx = (y * w + x) * 3;
                rgb[idx] = (byte)(x * 15 + y * 2);
                rgb[idx + 1] = (byte)(y * 15 + 10);
                rgb[idx + 2] = (byte)((15 - x) * 14 + 20);
            }
        }

        var csEnc = JpegEncoder.Encode(rgb, w, h, new JpegEncodeOptions(50, ChromaSubsampling.YCbCr444, FixedPoint: true));
        var csDec = JpegDecoder.Decode(csEnc.JpegBytes, fixedPoint: true);

        string tmpDir = Path.Combine(Path.GetTempPath(), $"v_parity_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tmpDir);
        try
        {
            string hexIn = Path.Combine(tmpDir, "in.hex");
            string jpgOut = Path.Combine(tmpDir, "out.jpg");
            string rgbOut = Path.Combine(tmpDir, "out.rgb");

            File.WriteAllLines(hexIn, rgb.Select(b => $"{b:x2}"));

            var psi = new ProcessStartInfo("vvp")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };
            psi.ArgumentList.Add(vvpPath);
            psi.ArgumentList.Add($"+W={w}");
            psi.ArgumentList.Add($"+H={h}");
            psi.ArgumentList.Add($"+HEX_IN={hexIn}");
            psi.ArgumentList.Add($"+JPG_OUT={jpgOut}");
            psi.ArgumentList.Add($"+RGB_OUT={rgbOut}");

            using var proc = Process.Start(psi)!;
            string stdout = proc.StandardOutput.ReadToEnd();
            string stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit(10000);
            Assert.True(proc.ExitCode == 0, $"vvp failed: {stdout}\n{stderr}");

            byte[] vJpg = File.ReadAllBytes(jpgOut);
            byte[] vRgb = File.ReadAllBytes(rgbOut);

            Assert.Equal(csEnc.JpegBytes, vJpg);
            Assert.Equal(csDec.RgbBytes, vRgb);
        }
        finally
        {
            Directory.Delete(tmpDir, true);
        }
    }
}
