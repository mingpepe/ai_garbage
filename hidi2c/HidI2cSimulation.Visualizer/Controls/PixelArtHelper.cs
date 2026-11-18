using System.Globalization;
using Avalonia;
using Avalonia.Media;

namespace HidI2cSimulation.Visualizer.Controls;

/// <summary>
/// Shared pixel-art rendering primitives (stepped pixel bevels, hard drop shadows,
/// CRT recessed wells, pixel LEDs, and bitmapped 2px sprite icons).
/// </summary>
public static class PixelArtHelper
{
    public static readonly Typeface PixelMono = new("DejaVu Sans Mono, Liberation Mono, Courier 10 Pitch, Monospace");

    public static readonly Color ChassisBg = Color.Parse("#141020");
    public static readonly Color PanelBg = Color.Parse("#1E182E");
    public static readonly Color PanelHeaderBg = Color.Parse("#2B2242");
    public static readonly Color ScreenBg = Color.Parse("#0B0913");
    public static readonly Color BevelLight = Color.Parse("#5A4C82");
    public static readonly Color BevelDark = Color.Parse("#09070F");
    public static readonly Color HardShadow = Color.Parse("#050409");

    public static readonly Color PhosphorGreen = Color.Parse("#38E54D");
    public static readonly Color ElectricCyan = Color.Parse("#00E5FF");
    public static readonly Color ArcadeMagenta = Color.Parse("#FF3366");
    public static readonly Color RetroAmber = Color.Parse("#FFB800");
    public static readonly Color RetroOrange = Color.Parse("#FF7A00");
    public static readonly Color PixelLavender = Color.Parse("#C084FC");
    public static readonly Color CreamWhite = Color.Parse("#F6F2E9");
    public static readonly Color MutedLavender = Color.Parse("#9B92B8");

    /// <summary>
    /// Draws a classic 16-bit raised pixel frame with stepped corners, inner 2px bevel, and hard drop shadow.
    /// </summary>
    public static void DrawPixelPanel(
        DrawingContext ctx,
        Rect rect,
        Color fillColor,
        Color borderColor,
        string? title = null,
        Color? headerColor = null,
        Color? accentColor = null,
        bool isActive = false)
    {
        double x = Math.Floor(rect.X);
        double y = Math.Floor(rect.Y);
        double w = Math.Floor(rect.Width);
        double h = Math.Floor(rect.Height);
        if (w < 8 || h < 8) return;

        // Hard 3px pixel drop shadow
        ctx.FillRectangle(new SolidColorBrush(HardShadow), new Rect(x + 3, y + 3, w, h));

        // Outer border (notch 2px corners via pixel fill)
        Color outer = isActive && accentColor.HasValue ? accentColor.Value : borderColor;
        ctx.FillRectangle(new SolidColorBrush(outer), new Rect(x + 2, y, w - 4, h));
        ctx.FillRectangle(new SolidColorBrush(outer), new Rect(x, y + 2, w, h - 4));

        // Main panel body
        var bodyRect = new Rect(x + 2, y + 2, w - 4, h - 4);
        ctx.FillRectangle(new SolidColorBrush(fillColor), bodyRect);

        // Top & left bright pixel bevel
        Color lightEdge = isActive && accentColor.HasValue ? accentColor.Value : BevelLight;
        ctx.FillRectangle(new SolidColorBrush(lightEdge, 0.75), new Rect(x + 2, y + 2, w - 4, 2));
        ctx.FillRectangle(new SolidColorBrush(lightEdge, 0.75), new Rect(x + 2, y + 2, 2, h - 4));

        // Bottom & right dark pixel bevel
        ctx.FillRectangle(new SolidColorBrush(BevelDark), new Rect(x + 2, y + h - 4, w - 4, 2));
        ctx.FillRectangle(new SolidColorBrush(BevelDark), new Rect(x + w - 4, y + 2, 2, h - 4));

        // Corner 2x2 pixel rivets
        var rivetBrush = new SolidColorBrush(isActive && accentColor.HasValue ? CreamWhite : BevelLight);
        ctx.FillRectangle(rivetBrush, new Rect(x + 4, y + 4, 2, 2));
        ctx.FillRectangle(rivetBrush, new Rect(x + w - 6, y + 4, 2, 2));

        if (!string.IsNullOrEmpty(title))
        {
            var hdrBg = headerColor ?? PanelHeaderBg;
            var hdrRect = new Rect(x + 4, y + 4, w - 8, 20);
            ctx.FillRectangle(new SolidColorBrush(hdrBg), hdrRect);
            ctx.FillRectangle(new SolidColorBrush(BevelDark), new Rect(x + 4, y + 24, w - 8, 2));

            if (accentColor.HasValue)
            {
                DrawPixelLed(ctx, x + 9, y + 10, 8, accentColor.Value, isActive);
            }

            var txt = CreatePixelText(title, 10, isActive ? CreamWhite : CreamWhite, FontWeight.Bold);
            double textX = accentColor.HasValue ? x + 22 : x + 10;
            ctx.DrawText(txt, new Point(textX, y + 7));
        }
    }

    /// <summary>
    /// Draws a sunken CRT / recessed LCD screen well with dark top/left edge and light bottom/right rim.
    /// </summary>
    public static void DrawPixelWell(DrawingContext ctx, Rect rect, Color bg, Color? borderHighlight = null)
    {
        double x = Math.Floor(rect.X);
        double y = Math.Floor(rect.Y);
        double w = Math.Floor(rect.Width);
        double h = Math.Floor(rect.Height);
        if (w < 6 || h < 6) return;

        ctx.FillRectangle(new SolidColorBrush(bg), new Rect(x, y, w, h));
        // Dark inset shadow (top + left)
        ctx.FillRectangle(new SolidColorBrush(HardShadow), new Rect(x, y, w, 2));
        ctx.FillRectangle(new SolidColorBrush(HardShadow), new Rect(x, y, 2, h));
        // Light inner rim (bottom + right)
        Color rim = borderHighlight ?? BevelLight;
        ctx.FillRectangle(new SolidColorBrush(rim, 0.55), new Rect(x, y + h - 2, w, 2));
        ctx.FillRectangle(new SolidColorBrush(rim, 0.55), new Rect(x + w - 2, y, 2, h));
    }

    /// <summary>
    /// Draws a square retro pixel LED with dark outline and specular pixel highlight.
    /// </summary>
    public static void DrawPixelLed(DrawingContext ctx, double x, double y, double size, Color color, bool lit)
    {
        double px = Math.Floor(x);
        double py = Math.Floor(y);
        double s = Math.Floor(size);

        ctx.FillRectangle(new SolidColorBrush(HardShadow), new Rect(px, py, s, s));
        Color body = lit ? color : Color.FromArgb(255, (byte)(color.R / 4), (byte)(color.G / 4), (byte)(color.B / 4));
        ctx.FillRectangle(new SolidColorBrush(body), new Rect(px + 1, py + 1, s - 2, s - 2));

        if (lit)
        {
            ctx.FillRectangle(new SolidColorBrush(CreamWhite), new Rect(px + 2, py + 2, 2, 2));
        }
    }

    /// <summary>
    /// Renders an 8x8 or custom bitmap pixel sprite ('#' = primary, '+' = secondary, '.' = empty).
    /// </summary>
    public static void DrawPixelSprite(
        DrawingContext ctx,
        double x,
        double y,
        int pixelScale,
        string[] rows,
        Color primary,
        Color? secondary = null)
    {
        var primBrush = new SolidColorBrush(primary);
        var secBrush = new SolidColorBrush(secondary ?? CreamWhite);

        for (int r = 0; r < rows.Length; r++)
        {
            string line = rows[r];
            for (int c = 0; c < line.Length; c++)
            {
                char ch = line[c];
                if (ch == '.') continue;
                var brush = ch == '+' ? secBrush : primBrush;
                ctx.FillRectangle(brush, new Rect(
                    Math.Floor(x + c * pixelScale),
                    Math.Floor(y + r * pixelScale),
                    pixelScale,
                    pixelScale));
            }
        }
    }

    public static FormattedText CreatePixelText(string text, double size, Color color, FontWeight weight = FontWeight.Normal)
    {
        var tf = new Typeface(PixelMono.FontFamily, FontStyle.Normal, weight);
        return new FormattedText(text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight, tf, size, new SolidColorBrush(color));
    }
}
