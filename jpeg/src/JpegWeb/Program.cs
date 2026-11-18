using System.Diagnostics;
using System.Text.Json;
using JpegCore;
using JpegWeb;

var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

string? FindVerilogDir()
{
    string[] candidates =
    [
        Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "verilog")),
        Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "../verilog")),
        Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "../../verilog")),
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../verilog"))
    ];
    return candidates.FirstOrDefault(Directory.Exists);
}

app.MapGet("/api/presets", () => Results.Ok(Presets.GetAll()));

app.MapPost("/api/encode", (EncodeRequest req) =>
{
    if (req.Width <= 0 || req.Height <= 0 || req.Width > 256 || req.Height > 256)
        return Results.BadRequest(new { error = "Width and height must be between 1 and 256." });

    byte[] rgb;
    try
    {
        rgb = Convert.FromBase64String(req.RgbBase64);
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { error = "Invalid base64 RGB payload." });
    }

    if (rgb.Length < req.Width * req.Height * 3)
        return Results.BadRequest(new { error = $"RGB length mismatch: expected {req.Width * req.Height * 3}, got {rgb.Length}." });

    var subsampling = string.Equals(req.Subsampling, "4:2:0", StringComparison.OrdinalIgnoreCase)
        ? ChromaSubsampling.YCbCr420
        : ChromaSubsampling.YCbCr444;

    var enc = JpegEncoder.Encode(rgb, req.Width, req.Height, new JpegEncodeOptions(req.Quality, subsampling, req.FixedPoint));
    var dec = JpegDecoder.Decode(enc.JpegBytes, req.FixedPoint);

    double mse = 0;
    int len = req.Width * req.Height * 3;
    for (int i = 0; i < len; i++)
    {
        int d = rgb[i] - dec.RgbBytes[i];
        mse += d * d;
    }
    mse /= len;
    double psnr = mse == 0 ? 999.9 : 10.0 * Math.Log10(255.0 * 255.0 / mse);

    return Results.Ok(new
    {
        jpegBase64 = Convert.ToBase64String(enc.JpegBytes),
        reconstructedRgbBase64 = Convert.ToBase64String(dec.RgbBytes),
        rawRgbByteCount = len,
        jpegByteCount = enc.JpegBytes.Length,
        mse = Math.Round(mse, 2),
        psnr = Math.Round(psnr, 2),
        encodeTrace = new
        {
            enc.Width,
            enc.Height,
            enc.PaddedWidth,
            enc.PaddedHeight,
            enc.Subsampling,
            enc.Quality,
            enc.QualityScaleFactor,
            enc.FixedPoint,
            enc.LumaQuantTable64,
            enc.ChromaQuantTable64,
            enc.HuffmanTables,
            enc.Headers,
            enc.ByteLedger,
            enc.Blocks,
            enc.StuffedZeroCount,
            enc.TotalEntropyBits,
            enc.HeaderByteCount,
            enc.EntropyByteCount,
            enc.TrailerByteCount
        },
        decodeTrace = new
        {
            dec.Width,
            dec.Height,
            dec.McuCols,
            dec.McuRows,
            dec.Subsampling,
            dec.RestartInterval,
            dec.FixedPoint,
            dec.Components,
            dec.QuantTables,
            dec.HuffmanTables,
            dec.Headers,
            dec.ByteLedger,
            dec.DestuffEvents,
            dec.Blocks,
            dec.OutputPixelSample,
            dec.ScanStartOffset,
            dec.ScanEndOffset,
            dec.TotalEntropyBits
        }
    });
});

app.MapPost("/api/decode", (DecodeRequest req) =>
{
    byte[] jpegBytes;
    try
    {
        jpegBytes = Convert.FromBase64String(req.JpegBase64);
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { error = "Invalid base64 JPEG payload." });
    }

    try
    {
        var dec = JpegDecoder.Decode(jpegBytes, req.FixedPoint);
        return Results.Ok(new
        {
            rgbBase64 = Convert.ToBase64String(dec.RgbBytes),
            jpegByteCount = jpegBytes.Length,
            rawRgbByteCount = dec.RgbBytes.Length,
            decodeTrace = new
            {
                dec.Width,
                dec.Height,
                dec.McuCols,
                dec.McuRows,
                dec.Subsampling,
                dec.RestartInterval,
                dec.FixedPoint,
                dec.Components,
                dec.QuantTables,
                dec.HuffmanTables,
                dec.Headers,
                dec.ByteLedger,
                dec.DestuffEvents,
                dec.Blocks,
                dec.OutputPixelSample,
                dec.ScanStartOffset,
                dec.ScanEndOffset,
                dec.TotalEntropyBits
            }
        });
    }
    catch (Exception ex) when (ex is InvalidDataException or NotSupportedException)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapGet("/api/verilog/modules", () =>
{
    string? vDir = FindVerilogDir();
    if (vDir is null)
        return Results.NotFound(new { error = "Verilog directory not found." });

    string rtlDir = Path.Combine(vDir, "rtl");
    var modules = new List<object>();

    foreach (string group in new[] { "common", "encoder", "decoder" })
    {
        string gDir = Path.Combine(rtlDir, group);
        if (!Directory.Exists(gDir)) continue;
        foreach (string file in Directory.GetFiles(gDir, "*.v").OrderBy(f => f))
        {
            string code = File.ReadAllText(file);
            string[] lines = code.Split('\n');
            string summary = lines.FirstOrDefault(l => l.TrimStart().StartsWith("//"))?.TrimStart('/').Trim() ?? "";
            modules.Add(new
            {
                name = Path.GetFileNameWithoutExtension(file),
                fileName = Path.GetFileName(file),
                group,
                lineCount = lines.Length,
                summary,
                source = code
            });
        }
    }

    return Results.Ok(new { verilogDir = vDir, modules });
});

app.MapPost("/api/verilog/simulate", (VerilogSimRequest req) =>
{
    if (req.Width <= 0 || req.Height <= 0 || req.Width > 32 || req.Height > 32)
        return Results.BadRequest(new { error = "Live Verilog simulation supports images up to 32x32 pixels." });

    string? vDir = FindVerilogDir();
    if (vDir is null)
        return Results.NotFound(new { error = "Verilog directory not found." });

    byte[] rgb;
    try
    {
        rgb = Convert.FromBase64String(req.RgbBase64);
    }
    catch (FormatException)
    {
        return Results.BadRequest(new { error = "Invalid base64 RGB payload." });
    }

    if (rgb.Length < req.Width * req.Height * 3)
        return Results.BadRequest(new { error = "RGB payload shorter than width*height*3." });

    string vvpBin = Path.Combine(vDir, "build", "tb_block_sim.vvp");
    if (!File.Exists(vvpBin))
    {
        var makePsi = new ProcessStartInfo("make")
        {
            WorkingDirectory = vDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        makePsi.ArgumentList.Add("sim_block_compile");
        using var makeProc = Process.Start(makePsi);
        if (makeProc is null)
            return Results.Problem("Failed to start make for Verilog compilation.");
        makeProc.WaitForExit(10000);
        if (makeProc.ExitCode != 0 || !File.Exists(vvpBin))
            return Results.Problem("Failed to compile Verilog simulation binary.");
    }

    // Reference C# fixed-point Q50 4:4:4
    var csEnc = JpegEncoder.Encode(rgb, req.Width, req.Height, new JpegEncodeOptions(50, ChromaSubsampling.YCbCr444, FixedPoint: true));
    var csDec = JpegDecoder.Decode(csEnc.JpegBytes, fixedPoint: true);

    string tmpDir = Path.Combine(Path.GetTempPath(), $"jpeg_vsim_{Guid.NewGuid():N}");
    Directory.CreateDirectory(tmpDir);
    try
    {
        string hexIn = Path.Combine(tmpDir, "in.hex");
        string jpgOut = Path.Combine(tmpDir, "out.jpg");
        string rgbOut = Path.Combine(tmpDir, "out.rgb");

        File.WriteAllLines(hexIn, rgb.Take(req.Width * req.Height * 3).Select(b => $"{b:x2}"));

        var psi = new ProcessStartInfo("vvp")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        psi.ArgumentList.Add(vvpBin);
        psi.ArgumentList.Add($"+W={req.Width}");
        psi.ArgumentList.Add($"+H={req.Height}");
        psi.ArgumentList.Add($"+HEX_IN={hexIn}");
        psi.ArgumentList.Add($"+JPG_OUT={jpgOut}");
        psi.ArgumentList.Add($"+RGB_OUT={rgbOut}");

        using var proc = Process.Start(psi);
        if (proc is null)
            return Results.Problem("Failed to launch vvp simulator.");

        string stdout = proc.StandardOutput.ReadToEnd();
        string stderr = proc.StandardError.ReadToEnd();
        if (!proc.WaitForExit(10000))
        {
            proc.Kill(true);
            return Results.Problem("Verilog simulation timed out.");
        }

        if (proc.ExitCode != 0 || !File.Exists(jpgOut) || !File.Exists(rgbOut))
            return Results.Problem($"Verilog simulation failed: {stdout}\n{stderr}");

        byte[] vJpg = File.ReadAllBytes(jpgOut);
        byte[] vRgb = File.ReadAllBytes(rgbOut);

        bool exactJpgMatch = vJpg.AsSpan().SequenceEqual(csEnc.JpegBytes);
        bool exactRgbMatch = vRgb.AsSpan().SequenceEqual(csDec.RgbBytes);
        int firstJpgDiff = -1;
        if (!exactJpgMatch)
        {
            int minLen = Math.Min(vJpg.Length, csEnc.JpegBytes.Length);
            firstJpgDiff = minLen;
            for (int i = 0; i < minLen; i++)
            {
                if (vJpg[i] != csEnc.JpegBytes[i])
                {
                    firstJpgDiff = i;
                    break;
                }
            }
        }

        return Results.Ok(new
        {
            width = req.Width,
            height = req.Height,
            verilogJpegBase64 = Convert.ToBase64String(vJpg),
            verilogRgbBase64 = Convert.ToBase64String(vRgb),
            csJpegBase64 = Convert.ToBase64String(csEnc.JpegBytes),
            csRgbBase64 = Convert.ToBase64String(csDec.RgbBytes),
            verilogByteCount = vJpg.Length,
            csByteCount = csEnc.JpegBytes.Length,
            exactJpgMatch,
            exactRgbMatch,
            firstJpgDiff,
            vvpLog = stdout.Trim()
        });
    }
    finally
    {
        try { Directory.Delete(tmpDir, true); } catch { }
    }
});

app.Run();

public sealed record EncodeRequest(int Width, int Height, string RgbBase64, int Quality = 75, string Subsampling = "4:4:4", bool FixedPoint = false);
public sealed record DecodeRequest(string JpegBase64, bool FixedPoint = false);
public sealed record VerilogSimRequest(int Width, int Height, string RgbBase64);
