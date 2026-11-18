namespace JpegWeb;

public sealed record PresetImageDto(
    string Id,
    string Name,
    string Description,
    int Width,
    int Height,
    string RgbBase64);

public static class Presets
{
    private static readonly Dictionary<char, (byte R, byte G, byte B)> Palette = new()
    {
        ['.'] = (18, 20, 34),    // Deep pixel slate
        [' '] = (24, 28, 48),    // Midnight bg
        ['K'] = (12, 12, 18),    // Outline black
        ['W'] = (255, 241, 232), // Crisp cream white
        ['R'] = (255, 0, 77),    // Ruby red
        ['r'] = (190, 18, 80),   // Dark red shade
        ['P'] = (255, 119, 168), // Highlight pink
        ['Y'] = (255, 236, 39),  // Bright gold
        ['O'] = (255, 163, 0),   // Amber gold
        ['o'] = (171, 82, 54),   // Bronze brown
        ['G'] = (0, 228, 54),    // Lime green
        ['g'] = (0, 135, 81),    // Emerald green
        ['B'] = (41, 173, 255),  // Cyan sky
        ['b'] = (29, 43, 83),    // Deep navy
        ['S'] = (255, 204, 170), // Skin/peach
        ['s'] = (224, 160, 115)  // Shaded peach
    };

    private static byte[] FromGrid(string[] rows, out int w, out int h)
    {
        h = rows.Length;
        w = rows[0].Length;
        var rgb = new byte[w * h * 3];
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                char ch = rows[y][x];
                var (r, g, b) = Palette.TryGetValue(ch, out var c) ? c : ((byte)0, (byte)0, (byte)0);
                int idx = (y * w + x) * 3;
                rgb[idx] = r;
                rgb[idx + 1] = g;
                rgb[idx + 2] = b;
            }
        }
        return rgb;
    }

    public static IReadOnlyList<PresetImageDto> GetAll()
    {
        var list = new List<PresetImageDto>();

        // 1. 8x8 Pixel Heart (1 MCU -> inspect every single byte!)
        byte[] heart = FromGrid(new[]
        {
            ".KK..KK.",
            "KPRKKRRK",
            "KPRRRRrk",
            "KRRRRRrk",
            ".KRRRrk.",
            "..KRrk..",
            "...Kk...",
            "........"
        }.Select(s => s.Replace('k', 'K')).ToArray(), out int hw, out int hh);
        list.Add(new PresetImageDto("heart-8x8", "8x8 Pixel Heart", "Single 8x8 MCU (3 blocks) — ideal to trace every single byte", hw, hh, Convert.ToBase64String(heart)));

        // 2. 8x8 Gold Coin
        byte[] coin = FromGrid(
        [
            "..KKKK..",
            ".KYYYYK.",
            "KYWYYOYK",
            "KYWYYOYK",
            "KYWYYOYK",
            "KYYYYOYK",
            ".KOOOOoK",
            "..KKKK.."
        ], out int cw, out int ch);
        list.Add(new PresetImageDto("coin-8x8", "8x8 Gold Coin", "Single 8x8 MCU with warm shading", cw, ch, Convert.ToBase64String(coin)));

        // 3. 16x16 Mushroom (4 MCUs in 4:4:4 -> demonstrates DC DPCM & 4:2:0 subsampling)
        byte[] mush = FromGrid(
        [
            ".....KKKKKK.....",
            "...KKRRRRRRKK...",
            "..KRRWWRRRRWWK..",
            ".KRWWWRRRRRWWWK.",
            ".KRWWRRRRRRRWRK.",
            "KRRRRRRWWWRRRRRK",
            "KRRRRWWWWWRRRRRK",
            "KRRWRWWWWWRRWWRK",
            "KRRWRRRWRRRRWRRK",
            ".KKKKKKKKKKKKKK.",
            "..KSSSSSSSSSSK..",
            "..KSKSSSSSSKSK..",
            "..KSKSSSSSSKSK..",
            "..KSSSSSSSSSSK..",
            "...KssssssssK...",
            "....KKKKKKKK...."
        ], out int mw, out int mh);
        list.Add(new PresetImageDto("mushroom-16x16", "16x16 Power Mushroom", "4 MCUs (4:4:4) / 1 MCU (4:2:0) — sharp red/white edges", mw, mh, Convert.ToBase64String(mush)));

        // 4. 16x16 Gradient + Checker
        var grad = new byte[16 * 16 * 3];
        for (int y = 0; y < 16; y++)
        {
            for (int x = 0; x < 16; x++)
            {
                int idx = (y * 16 + x) * 3;
                if (x >= 8 && y >= 8)
                {
                    bool chk = ((x + y) & 1) == 0;
                    grad[idx] = chk ? (byte)255 : (byte)20;
                    grad[idx + 1] = chk ? (byte)230 : (byte)30;
                    grad[idx + 2] = chk ? (byte)40 : (byte)210;
                }
                else
                {
                    grad[idx] = (byte)(x * 16);
                    grad[idx + 1] = (byte)(y * 16);
                    grad[idx + 2] = (byte)(255 - x * 12);
                }
            }
        }
        list.Add(new PresetImageDto("gradient-16x16", "16x16 Gradient & Checker", "Low-freq DC gradient vs high-freq Nyquist checkerboard", 16, 16, Convert.ToBase64String(grad)));

        // 5. 32x32 Retro Sunset Scene
        var scene = new byte[32 * 32 * 3];
        for (int y = 0; y < 32; y++)
        {
            for (int x = 0; x < 32; x++)
            {
                int idx = (y * 32 + x) * 3;
                byte r, g, b;
                int dx = x - 16;
                int dy = y - 13;
                if (y >= 22)
                {
                    // Ocean with pixel reflection
                    bool shimmer = (y % 2 == 0) && System.Math.Abs(x - 16) <= (32 - y) / 2;
                    r = shimmer ? (byte)255 : (byte)20;
                    g = shimmer ? (byte)180 : (byte)(50 + (31 - y) * 5);
                    b = shimmer ? (byte)90 : (byte)(140 + (31 - y) * 6);
                }
                else if (dx * dx + dy * dy <= 25)
                {
                    // Sun
                    r = 255;
                    g = (byte)(240 - (y - 8) * 10);
                    b = 50;
                }
                else if (y >= 17 + (int)(2.5 * System.Math.Sin(x * 0.45)))
                {
                    // Mountain silhouette
                    r = 45;
                    g = 24;
                    b = 70;
                }
                else
                {
                    // Dithered sunset sky
                    r = (byte)System.Math.Clamp(60 + y * 9, 0, 255);
                    g = (byte)System.Math.Clamp(30 + y * 5, 0, 255);
                    b = (byte)System.Math.Clamp(160 - y * 4, 40, 255);
                }
                scene[idx] = r;
                scene[idx + 1] = g;
                scene[idx + 2] = b;
            }
        }
        list.Add(new PresetImageDto("sunset-32x32", "32x32 Pixel Sunset", "16 MCUs (4:4:4) — test quality curves & chroma subsampling", 32, 32, Convert.ToBase64String(scene)));

        return list;
    }
}
