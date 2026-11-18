using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;

namespace HidI2cSimulation.Visualizer.Controls;

/// <summary>
/// Retro pixel-art 4096x4096 capacitive Precision Touchpad surface.
/// </summary>
public sealed class TouchpadCanvasControl : Control
{
    private static readonly string[] FingerSprite =
    {
        "..###...",
        ".#+++#..",
        ".#+++#..",
        ".#####..",
        "###+###.",
        "#+++++#.",
        "#+++++#.",
        ".#####.."
    };

    private readonly List<Point> _trail = new();
    private bool _isTouching;
    private ushort _lastHidX = 2048;
    private ushort _lastHidY = 2048;
    private DateTime _lastEmitTime = DateTime.MinValue;

    public event Action<ushort, ushort, bool, bool>? TouchGenerated;
    public event Action? TouchReleased;

    public TouchpadCanvasControl()
    {
        ClipToBounds = true;
        RenderOptions.SetEdgeMode(this, EdgeMode.Aliased);
    }

    public void ShowExternalTouch(ushort x, ushort y, bool inContact)
    {
        _lastHidX = x;
        _lastHidY = y;
        _isTouching = inContact;
        if (inContact && Bounds.Width > 0 && Bounds.Height > 0)
        {
            var pt = HidToPixel(x, y);
            _trail.Add(pt);
            if (_trail.Count > 20)
                _trail.RemoveAt(0);
        }
        else if (!inContact)
        {
            _trail.Clear();
        }
        InvalidateVisual();
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        var pt = e.GetCurrentPoint(this);
        var pos = pt.Position;
        var (hx, hy) = PixelToHid(pos);

        _isTouching = true;
        _trail.Clear();
        _trail.Add(pos);
        _lastHidX = hx;
        _lastHidY = hy;
        _lastEmitTime = DateTime.UtcNow;

        bool leftBtn = pt.Properties.IsLeftButtonPressed && pos.Y > Bounds.Height * 0.80 && pos.X < Bounds.Width * 0.5;
        bool rightBtn = pt.Properties.IsRightButtonPressed || (pos.Y > Bounds.Height * 0.80 && pos.X >= Bounds.Width * 0.5);

        e.Pointer.Capture(this);
        TouchGenerated?.Invoke(hx, hy, leftBtn, rightBtn);
        InvalidateVisual();
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        if (!_isTouching) return;

        var pos = e.GetPosition(this);
        var (hx, hy) = PixelToHid(pos);

        _trail.Add(pos);
        if (_trail.Count > 20)
            _trail.RemoveAt(0);

        var now = DateTime.UtcNow;
        int dist = Math.Abs(hx - _lastHidX) + Math.Abs(hy - _lastHidY);
        if ((now - _lastEmitTime).TotalMilliseconds >= 70 && dist >= 60)
        {
            _lastHidX = hx;
            _lastHidY = hy;
            _lastEmitTime = now;
            TouchGenerated?.Invoke(hx, hy, false, false);
        }
        InvalidateVisual();
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        if (!_isTouching) return;

        _isTouching = false;
        e.Pointer.Capture(null);
        TouchReleased?.Invoke();
        InvalidateVisual();
    }

    private (ushort X, ushort Y) PixelToHid(Point p)
    {
        double w = Math.Max(1, Bounds.Width);
        double h = Math.Max(1, Bounds.Height);
        ushort hx = (ushort)Math.Clamp((p.X / w) * 4095.0, 0, 4095);
        ushort hy = (ushort)Math.Clamp((p.Y / h) * 4095.0, 0, 4095);
        return (hx, hy);
    }

    private Point HidToPixel(ushort hx, ushort hy)
    {
        return new Point(Math.Floor((hx / 4095.0) * Bounds.Width), Math.Floor((hy / 4095.0) * Bounds.Height));
    }

    public override void Render(DrawingContext context)
    {
        double w = Math.Floor(Bounds.Width);
        double h = Math.Floor(Bounds.Height);
        if (w < 40 || h < 40) return;

        PixelArtHelper.DrawPixelWell(context, new Rect(0, 0, w, h), PixelArtHelper.ScreenBg, PixelArtHelper.BevelLight);

        // Pixel capacitive electrode grid
        var gridBrush = new SolidColorBrush(Color.Parse("#1F1936"));
        for (int i = 1; i < 8; i++)
        {
            double gx = Math.Floor(w * i / 8.0);
            double gy = Math.Floor(h * i / 8.0);
            context.FillRectangle(gridBrush, new Rect(gx, 3, 1, h - 6));
            context.FillRectangle(gridBrush, new Rect(3, gy, w - 6, 1));
        }

        // Physical click zones at bottom 20%
        double clickY = Math.Floor(h * 0.80);
        context.FillRectangle(new SolidColorBrush(PixelArtHelper.BevelLight, 0.7), new Rect(4, clickY, w - 8, 2));
        context.FillRectangle(new SolidColorBrush(PixelArtHelper.BevelLight, 0.7), new Rect(Math.Floor(w * 0.5), clickY, 2, h - clickY - 4));

        var lTxt = PixelArtHelper.CreatePixelText("L-BTN", 8.5, PixelArtHelper.MutedLavender, FontWeight.Bold);
        var rTxt = PixelArtHelper.CreatePixelText("R-BTN", 8.5, PixelArtHelper.MutedLavender, FontWeight.Bold);
        context.DrawText(lTxt, new Point(Math.Floor(w * 0.25 - lTxt.Width / 2), clickY + 6));
        context.DrawText(rTxt, new Point(Math.Floor(w * 0.75 - rTxt.Width / 2), clickY + 6));

        // Blocky pixel trail
        for (int i = 0; i < _trail.Count; i++)
        {
            double alpha = (double)(i + 1) / _trail.Count * 0.75;
            var pt = _trail[i];
            int sz = i > _trail.Count - 5 ? 6 : 4;
            context.FillRectangle(
                new SolidColorBrush(PixelArtHelper.ElectricCyan, alpha),
                new Rect(Math.Floor(pt.X - sz / 2.0), Math.Floor(pt.Y - sz / 2.0), sz, sz));
        }

        // Pixel crosshair lines
        var curPx = HidToPixel(_lastHidX, _lastHidY);
        var crossBrush = new SolidColorBrush(PixelArtHelper.ElectricCyan, 0.35);
        context.FillRectangle(crossBrush, new Rect(curPx.X, 3, 1, h - 6));
        context.FillRectangle(crossBrush, new Rect(3, curPx.Y, w - 6, 1));

        if (_isTouching)
        {
            // Glowing pixel target box + finger sprite
            context.DrawRectangle(null, new Pen(new SolidColorBrush(PixelArtHelper.PhosphorGreen), 2),
                new Rect(curPx.X - 10, curPx.Y - 10, 20, 20));
            PixelArtHelper.DrawPixelSprite(context, curPx.X - 8, curPx.Y - 8, 2, FingerSprite,
                PixelArtHelper.ElectricCyan, PixelArtHelper.CreamWhite);
        }
        else
        {
            context.DrawRectangle(null, new Pen(new SolidColorBrush(PixelArtHelper.MutedLavender), 1),
                new Rect(curPx.X - 4, curPx.Y - 4, 8, 8));
        }

        context.FillRectangle(new SolidColorBrush(PixelArtHelper.HardShadow, 0.8), new Rect(4, 4, w - 8, 15));
        var hud = PixelArtHelper.CreatePixelText(
            $"X:{_lastHidX,4} Y:{_lastHidY,4} [{(_isTouching ? "TOUCH" : "IDLE")}]",
            9.5,
            _isTouching ? PixelArtHelper.PhosphorGreen : PixelArtHelper.CreamWhite,
            FontWeight.Bold);
        context.DrawText(hud, new Point(8, 5));
    }
}
