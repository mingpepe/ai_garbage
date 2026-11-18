using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using I3CEmulator.Physical;
using I3CEmulator.Simulation;

namespace I3CEmulator.Gui.Controls;

/// <summary>
/// Saleae / PulseView-inspired multi-channel Logic Analyzer control displaying:
///   - Top decoded protocol swimlane with exact byte/field/arbitration spans
///   - Bus electrical mode track (I3C-PP 12.5MHz / I3C-OD / OD-INIT / I2C-FM / IDLE)
///   - Physical SCL, SDA, and Legacy EEPROM post-50ns-filter internal clock
///   - Per-component 3-state SDA pad driver traces (Push-Pull, Open-Drain Pull-Down, Hi-Z)
///   - Interactive T1/T2 delta-time cursors, zoom, pan, and Compact vs True-Time scales.
/// </summary>
public sealed class LogicAnalyzerControl : Control
{
    public static readonly StyledProperty<IReadOnlyList<BusSample>?> SamplesProperty =
        AvaloniaProperty.Register<LogicAnalyzerControl, IReadOnlyList<BusSample>?>(nameof(Samples));

    public static readonly StyledProperty<IReadOnlyList<DecodedPacket>?> PacketsProperty =
        AvaloniaProperty.Register<LogicAnalyzerControl, IReadOnlyList<DecodedPacket>?>(nameof(Packets));

    public static readonly StyledProperty<IReadOnlyList<ChapterMarker>?> ChaptersProperty =
        AvaloniaProperty.Register<LogicAnalyzerControl, IReadOnlyList<ChapterMarker>?>(nameof(Chapters));

    public static readonly StyledProperty<int> SelectedSampleIndexProperty =
        AvaloniaProperty.Register<LogicAnalyzerControl, int>(nameof(SelectedSampleIndex), -1);

    public static readonly StyledProperty<int> SecondarySampleIndexProperty =
        AvaloniaProperty.Register<LogicAnalyzerControl, int>(nameof(SecondarySampleIndex), -1);

    public static readonly StyledProperty<bool> UseTrueTimeScaleProperty =
        AvaloniaProperty.Register<LogicAnalyzerControl, bool>(nameof(UseTrueTimeScale), false);

    public static readonly StyledProperty<bool> FollowLiveProperty =
        AvaloniaProperty.Register<LogicAnalyzerControl, bool>(nameof(FollowLive), true);

    public static readonly StyledProperty<double> ScrollOffsetXProperty =
        AvaloniaProperty.Register<LogicAnalyzerControl, double>(nameof(ScrollOffsetX), 0.0);

    public IReadOnlyList<BusSample>? Samples
    {
        get => GetValue(SamplesProperty);
        set => SetValue(SamplesProperty, value);
    }

    public IReadOnlyList<DecodedPacket>? Packets
    {
        get => GetValue(PacketsProperty);
        set => SetValue(PacketsProperty, value);
    }

    public IReadOnlyList<ChapterMarker>? Chapters
    {
        get => GetValue(ChaptersProperty);
        set => SetValue(ChaptersProperty, value);
    }

    public int SelectedSampleIndex
    {
        get => GetValue(SelectedSampleIndexProperty);
        set => SetValue(SelectedSampleIndexProperty, value);
    }

    public int SecondarySampleIndex
    {
        get => GetValue(SecondarySampleIndexProperty);
        set => SetValue(SecondarySampleIndexProperty, value);
    }

    public bool UseTrueTimeScale
    {
        get => GetValue(UseTrueTimeScaleProperty);
        set => SetValue(UseTrueTimeScaleProperty, value);
    }

    public bool FollowLive
    {
        get => GetValue(FollowLiveProperty);
        set => SetValue(FollowLiveProperty, value);
    }

    public double ScrollOffsetX
    {
        get => GetValue(ScrollOffsetXProperty);
        set => SetValue(ScrollOffsetXProperty, value);
    }

    public event Action<double, double>? ViewportMetricsChanged;
    public event Action<int>? CursorSampleSelected;

    private const double LeftPaneWidth = 246.0;
    private const double RulerHeight = 32.0;
    private const double ProtoHeight = 32.0;
    private const double ModeHeight = 22.0;
    private const double RowHeight = 26.0;

    private double _pixelsPerSample = 18.0;
    private double _pixelsPerNs = 0.14;

    private double[] _sampleStartX = Array.Empty<double>();
    private double[] _sampleWidth = Array.Empty<double>();
    private double _totalContentWidth;

    private bool _isDraggingCursor;
    private bool _isPanning;
    private double _panStartMouseX;
    private double _panStartScrollX;
    private int _hoveredSampleIndex = -1;

    private static readonly Typeface UiFont = new("JetBrains Mono, Consolas, Monospace", FontStyle.Normal, FontWeight.SemiBold);
    private static readonly Typeface MonoFont = new("JetBrains Mono, Consolas, Monospace", FontStyle.Normal, FontWeight.Normal);
    private static readonly Typeface MonoBold = new("JetBrains Mono, Consolas, Monospace", FontStyle.Normal, FontWeight.Bold);

    // Keysight / R&S Benchtop MSO oscilloscope palette
    private static readonly Color BgDark = Color.FromRgb(0x00, 0x00, 0x00);
    private static readonly Color LeftPaneBg = Color.FromRgb(0x14, 0x17, 0x1E);
    private static readonly Color RowEvenBg = Color.FromRgb(0x02, 0x03, 0x05);
    private static readonly Color RowOddBg = Color.FromRgb(0x06, 0x08, 0x0C);
    private static readonly Color GridLineColor = Color.FromRgb(0x16, 0x1C, 0x24);
    private static readonly Color GraticuleMinorColor = Color.FromRgb(0x1D, 0x25, 0x31);

    private static readonly Color SclPpColor = Color.FromRgb(0xFF, 0xD4, 0x00);
    private static readonly Color SclOdColor = Color.FromRgb(0xFF, 0x98, 0x00);
    private static readonly Color SclInitColor = Color.FromRgb(0xFF, 0xE5, 0x66);
    private static readonly Color SclI2CColor = Color.FromRgb(0xFF, 0x40, 0xC8);
    private static readonly Color SdaPpColor = Color.FromRgb(0x00, 0xE5, 0xFF);
    private static readonly Color SdaOdColor = Color.FromRgb(0xFF, 0x98, 0x00);
    private static readonly Color EepromClkColor = Color.FromRgb(0xFF, 0x40, 0xC8);
    private static readonly Color HiZLineColor = Color.FromRgb(0x5A, 0x66, 0x7A);
    private static readonly Color RedCursor = Color.FromRgb(0xFF, 0x9E, 0x00);  // MSO X1 Marker (Amber)
    private static readonly Color BlueCursor = Color.FromRgb(0x00, 0xE5, 0xFF); // MSO X2 Marker (Cyan)
    private static readonly Color AlertColor = Color.FromRgb(0xFF, 0x2E, 0x4C);

    private sealed record SignalRowDef(string Tag, Color TagColor, string Label, int DeviceIndex, RowKind Kind);

    private enum RowKind
    {
        SclWire,
        SdaWire,
        EepromFilteredScl,
        DevicePad
    }

    private static readonly SignalRowDef[] SignalRows =
    [
        new("CH1", Color.FromRgb(0xFF, 0xD4, 0x00), "SCL (Bus Clock)",         -1, RowKind.SclWire),
        new("CH2", Color.FromRgb(0x00, 0xE5, 0xFF), "SDA (Bus Data)",          -1, RowKind.SdaWire),
        new("F50", Color.FromRgb(0xFF, 0x40, 0xC8), "EEPROM 50ns Filt SCL",     5, RowKind.EepromFilteredScl),
        new("D0",  Color.FromRgb(0x00, 0xE5, 0xFF), "Master SDA Pad",           0, RowKind.DevicePad),
        new("D1",  Color.FromRgb(0x4C, 0xFF, 0x72), "TargetA-Gyro SDA",         1, RowKind.DevicePad),
        new("D2",  Color.FromRgb(0xFF, 0xD4, 0x00), "TargetB-Temp SDA",         2, RowKind.DevicePad),
        new("D3",  Color.FromRgb(0xFF, 0x8A, 0x00), "TargetC-Alert SDA",        3, RowKind.DevicePad),
        new("D4",  Color.FromRgb(0xB3, 0x88, 0xFF), "TargetD-HotPlug SDA",      4, RowKind.DevicePad),
        new("D5",  Color.FromRgb(0xFF, 0x40, 0xC8), "Legacy-24C02 SDA",         5, RowKind.DevicePad)
    ];

    static LogicAnalyzerControl()
    {
        AffectsRender<LogicAnalyzerControl>(
            SamplesProperty,
            PacketsProperty,
            ChaptersProperty,
            SelectedSampleIndexProperty,
            SecondarySampleIndexProperty,
            UseTrueTimeScaleProperty,
            ScrollOffsetXProperty);
    }

    public double TotalContentWidth => _totalContentWidth;
    public double PlotViewportWidth => Math.Max(100.0, Bounds.Width - LeftPaneWidth);

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (change.Property == SamplesProperty || change.Property == UseTrueTimeScaleProperty)
        {
            RebuildSampleLayout();
            if (change.Property == SamplesProperty && FollowLive && Samples is { Count: > 0 })
            {
                ScrollToEndLive();
            }
            RaiseViewportMetrics();
        }
        else if (change.Property == BoundsProperty)
        {
            ClampScroll();
            RaiseViewportMetrics();
        }
        else if (change.Property == ScrollOffsetXProperty)
        {
            ClampScroll();
        }
    }

    public void ZoomIn() => ApplyZoom(1.3, LeftPaneWidth + PlotViewportWidth / 2.0);
    public void ZoomOut() => ApplyZoom(1.0 / 1.3, LeftPaneWidth + PlotViewportWidth / 2.0);

    public void ZoomFit()
    {
        if (Samples is null || Samples.Count == 0)
            return;

        double plotW = PlotViewportWidth;
        if (UseTrueTimeScale)
        {
            long totalEffectiveNs = 0;
            foreach (var s in Samples)
                totalEffectiveNs += s.Kind == BusSampleKind.IdleGap && s.DurationNs > 1500 ? 1500 : s.DurationNs;
            _pixelsPerNs = Math.Clamp((plotW - 24) / Math.Max(1, totalEffectiveNs), 0.004, 1.5);
        }
        else
        {
            _pixelsPerSample = Math.Clamp((plotW - 24) / Math.Max(1, Samples.Count * 1.05), 3.0, 48.0);
        }

        RebuildSampleLayout();
        ScrollOffsetX = 0;
        RaiseViewportMetrics();
        InvalidateVisual();
    }

    public void ScrollToSample(int sampleIndex, bool center = true)
    {
        if (Samples is null || sampleIndex < 0 || sampleIndex >= _sampleStartX.Length)
            return;

        double targetX = _sampleStartX[sampleIndex];
        double plotW = PlotViewportWidth;
        ScrollOffsetX = center
            ? Math.Max(0, targetX - plotW * 0.35)
            : Math.Max(0, targetX - plotW * 0.85);
        ClampScroll();
        RaiseViewportMetrics();
        InvalidateVisual();
    }

    private void ScrollToEndLive()
    {
        double plotW = PlotViewportWidth;
        if (_totalContentWidth > plotW * 0.85)
        {
            ScrollOffsetX = Math.Max(0, _totalContentWidth - plotW * 0.88);
        }
        else
        {
            ScrollOffsetX = 0;
        }
    }

    private void ApplyZoom(double factor, double anchorScreenX)
    {
        double plotX = Math.Max(0, anchorScreenX - LeftPaneWidth);
        int anchorSample = FindSampleAtContentX(ScrollOffsetX + plotX);
        double anchorRatio = 0;
        if (anchorSample >= 0 && anchorSample < _sampleStartX.Length && _sampleWidth[anchorSample] > 0)
        {
            anchorRatio = (ScrollOffsetX + plotX - _sampleStartX[anchorSample]) / _sampleWidth[anchorSample];
        }

        if (UseTrueTimeScale)
            _pixelsPerNs = Math.Clamp(_pixelsPerNs * factor, 0.004, 2.5);
        else
            _pixelsPerSample = Math.Clamp(_pixelsPerSample * factor, 3.0, 72.0);

        RebuildSampleLayout();

        if (anchorSample >= 0 && anchorSample < _sampleStartX.Length)
        {
            double newAnchorContentX = _sampleStartX[anchorSample] + anchorRatio * _sampleWidth[anchorSample];
            ScrollOffsetX = Math.Max(0, newAnchorContentX - plotX);
        }

        ClampScroll();
        RaiseViewportMetrics();
        InvalidateVisual();
    }

    private void RebuildSampleLayout()
    {
        var samples = Samples;
        if (samples is null || samples.Count == 0)
        {
            _sampleStartX = Array.Empty<double>();
            _sampleWidth = Array.Empty<double>();
            _totalContentWidth = 0;
            return;
        }

        int n = samples.Count;
        if (_sampleStartX.Length != n)
        {
            _sampleStartX = new double[n];
            _sampleWidth = new double[n];
        }

        double x = 8.0;
        for (int i = 0; i < n; i++)
        {
            var s = samples[i];
            double w;
            if (UseTrueTimeScale)
            {
                if (s.Kind == BusSampleKind.IdleGap && s.DurationNs > 1500)
                    w = Math.Max(48.0, 1500 * _pixelsPerNs);
                else
                    w = Math.Max(2.0, s.DurationNs * _pixelsPerNs);
            }
            else
            {
                w = s.Kind switch
                {
                    BusSampleKind.IdleGap => Math.Max(36.0, _pixelsPerSample * 2.8),
                    BusSampleKind.StartCondition or BusSampleKind.RepeatedStartCondition or BusSampleKind.StopCondition =>
                        Math.Max(7.0, _pixelsPerSample * 0.85),
                    BusSampleKind.RepeatedStartSetup or BusSampleKind.StopSetup =>
                        Math.Max(5.0, _pixelsPerSample * 0.6),
                    _ => _pixelsPerSample
                };
            }

            _sampleStartX[i] = x;
            _sampleWidth[i] = w;
            x += w;
        }

        _totalContentWidth = x + 32.0;
    }

    private void ClampScroll()
    {
        double maxScroll = Math.Max(0, _totalContentWidth - PlotViewportWidth);
        if (ScrollOffsetX < 0) ScrollOffsetX = 0;
        else if (ScrollOffsetX > maxScroll) ScrollOffsetX = maxScroll;
    }

    private void RaiseViewportMetrics() => ViewportMetricsChanged?.Invoke(_totalContentWidth, PlotViewportWidth);

    private int FindSampleAtContentX(double contentX)
    {
        if (_sampleStartX.Length == 0)
            return -1;
        if (contentX <= _sampleStartX[0])
            return 0;
        int last = _sampleStartX.Length - 1;
        if (contentX >= _sampleStartX[last])
            return last;

        int lo = 0, hi = last;
        while (lo <= hi)
        {
            int mid = (lo + hi) >> 1;
            double start = _sampleStartX[mid];
            double end = start + _sampleWidth[mid];
            if (contentX < start) hi = mid - 1;
            else if (contentX >= end) lo = mid + 1;
            else return mid;
        }
        return Math.Clamp(lo, 0, last);
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        var pt = e.GetPosition(this);
        var props = e.GetCurrentPoint(this).Properties;

        if (pt.X < LeftPaneWidth || Samples is null || Samples.Count == 0)
            return;

        if (props.IsMiddleButtonPressed || (props.IsLeftButtonPressed && e.KeyModifiers.HasFlag(KeyModifiers.Shift)))
        {
            _isPanning = true;
            _panStartMouseX = pt.X;
            _panStartScrollX = ScrollOffsetX;
            e.Pointer.Capture(this);
            return;
        }

        int idx = FindSampleAtContentX(ScrollOffsetX + (pt.X - LeftPaneWidth));
        if (idx < 0)
            return;

        if (props.IsRightButtonPressed)
        {
            SecondarySampleIndex = idx;
            InvalidateVisual();
        }
        else if (props.IsLeftButtonPressed)
        {
            FollowLive = false;
            _isDraggingCursor = true;
            e.Pointer.Capture(this);
            SelectedSampleIndex = idx;
            CursorSampleSelected?.Invoke(idx);
            InvalidateVisual();
        }
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        var pt = e.GetPosition(this);

        if (_isPanning)
        {
            FollowLive = false;
            ScrollOffsetX = _panStartScrollX - (pt.X - _panStartMouseX);
            ClampScroll();
            RaiseViewportMetrics();
            InvalidateVisual();
            return;
        }

        if (_isDraggingCursor && Samples is { Count: > 0 } && pt.X >= LeftPaneWidth)
        {
            int idx = FindSampleAtContentX(ScrollOffsetX + (pt.X - LeftPaneWidth));
            if (idx >= 0 && idx != SelectedSampleIndex)
            {
                SelectedSampleIndex = idx;
                CursorSampleSelected?.Invoke(idx);
                InvalidateVisual();
            }
            return;
        }

        if (pt.X >= LeftPaneWidth && Samples is { Count: > 0 })
        {
            int hovered = FindSampleAtContentX(ScrollOffsetX + (pt.X - LeftPaneWidth));
            if (hovered != _hoveredSampleIndex)
            {
                _hoveredSampleIndex = hovered;
                InvalidateVisual();
            }
        }
        else if (_hoveredSampleIndex != -1)
        {
            _hoveredSampleIndex = -1;
            InvalidateVisual();
        }
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        if (_isDraggingCursor || _isPanning)
        {
            _isDraggingCursor = false;
            _isPanning = false;
            e.Pointer.Capture(null);
        }
    }

    protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
    {
        base.OnPointerWheelChanged(e);
        var pt = e.GetPosition(this);
        if (e.KeyModifiers.HasFlag(KeyModifiers.Shift))
        {
            FollowLive = false;
            ScrollOffsetX -= e.Delta.Y * 60.0;
            ClampScroll();
            RaiseViewportMetrics();
            InvalidateVisual();
        }
        else
        {
            double factor = e.Delta.Y > 0 ? 1.25 : 1.0 / 1.25;
            ApplyZoom(factor, Math.Max(LeftPaneWidth, pt.X));
        }
        e.Handled = true;
    }

    public override void Render(DrawingContext ctx)
    {
        base.Render(ctx);
        double w = Bounds.Width;
        double h = Bounds.Height;
        if (w < LeftPaneWidth + 60 || h < 120)
            return;

        ctx.FillRectangle(new SolidColorBrush(BgDark), new Rect(0, 0, w, h));

        double plotLeft = LeftPaneWidth;
        double plotWidth = w - LeftPaneWidth;
        double rowsTop = RulerHeight + ProtoHeight + ModeHeight;

        var samples = Samples;
        int cursorIdx = samples is { Count: > 0 }
            ? Math.Clamp(SelectedSampleIndex < 0 ? samples.Count - 1 : SelectedSampleIndex, 0, samples.Count - 1)
            : -1;
        BusSample? cursorSample = cursorIdx >= 0 && samples is not null ? samples[cursorIdx] : null;

        // 1. Oscilloscope screen background bands & 10x8 MSO Graticule Grid
        ctx.FillRectangle(new SolidColorBrush(Color.FromRgb(0x0E, 0x11, 0x17)), new Rect(0, 0, w, RulerHeight));
        ctx.FillRectangle(new SolidColorBrush(Color.FromRgb(0x04, 0x06, 0x09)), new Rect(plotLeft, RulerHeight, plotWidth, ProtoHeight));
        ctx.FillRectangle(new SolidColorBrush(Color.FromRgb(0x08, 0x0A, 0x0E)), new Rect(plotLeft, RulerHeight + ProtoHeight, plotWidth, ModeHeight));

        for (int r = 0; r < SignalRows.Length; r++)
        {
            double ry = rowsTop + r * RowHeight;
            var rowBg = r % 2 == 0 ? RowEvenBg : RowOddBg;
            ctx.FillRectangle(new SolidColorBrush(rowBg), new Rect(plotLeft, ry, plotWidth, RowHeight));
            ctx.DrawLine(new Pen(new SolidColorBrush(GridLineColor), 1.0), new Point(0, ry), new Point(w, ry));
        }

        DrawOscilloscopeGraticule(ctx, plotLeft, rowsTop, plotWidth, SignalRows.Length * RowHeight);

        // 2. Render clipped oscilloscope trace viewport
        if (samples is { Count: > 0 } && _sampleStartX.Length == samples.Count)
        {
            using (ctx.PushClip(new Rect(plotLeft, 0, plotWidth, h)))
            {
                double viewStart = ScrollOffsetX;
                double viewEnd = ScrollOffsetX + plotWidth;

                int firstVis = Math.Max(0, FindSampleAtContentX(viewStart) - 1);
                int lastVis = Math.Min(samples.Count - 1, FindSampleAtContentX(viewEnd) + 1);

                DrawRulerAndChapterMarkers(ctx, samples, firstVis, lastVis, plotLeft, viewStart, h);
                DrawModeSwimlane(ctx, samples, firstVis, lastVis, plotLeft, viewStart, RulerHeight + ProtoHeight, ModeHeight);
                DrawProtocolSwimlane(ctx, plotLeft, viewStart, viewEnd, RulerHeight, ProtoHeight);
                DrawSignalTraces(ctx, samples, firstVis, lastVis, plotLeft, viewStart, rowsTop);

                // Hover indicator
                if (_hoveredSampleIndex >= firstVis && _hoveredSampleIndex <= lastVis)
                {
                    double hx = plotLeft + _sampleStartX[_hoveredSampleIndex] - viewStart;
                    double hw = _sampleWidth[_hoveredSampleIndex];
                    ctx.FillRectangle(new SolidColorBrush(Color.FromArgb(24, 0xFF, 0xFF, 0xFF)),
                        new Rect(hx, RulerHeight, hw, h - RulerHeight));
                }

                // Cyan secondary cursor X2
                if (SecondarySampleIndex >= 0 && SecondarySampleIndex < samples.Count)
                {
                    double tx2 = plotLeft + _sampleStartX[SecondarySampleIndex] - viewStart + _sampleWidth[SecondarySampleIndex] * 0.5;
                    ctx.DrawLine(new Pen(new SolidColorBrush(BlueCursor), 1.4, new DashStyle([4, 3], 0)),
                        new Point(tx2, 0), new Point(tx2, h));
                    DrawCursorBadge(ctx, tx2, 2, BlueCursor, "X2");
                }

                // Amber primary cursor X1
                if (cursorIdx >= 0)
                {
                    double tx1 = plotLeft + _sampleStartX[cursorIdx] - viewStart + _sampleWidth[cursorIdx] * 0.5;
                    ctx.DrawLine(new Pen(new SolidColorBrush(RedCursor), 1.6), new Point(tx1, 0), new Point(tx1, h));
                    DrawCursorBadge(ctx, tx1, 2, RedCursor, "X1");
                }
            }
        }
        else
        {
            DrawText(ctx, "TRIG WAIT: PRESS [RUN ALL] OR [STEP] TO CAPTURE I3C/I2C WAVEFORMS",
                new Point(plotLeft + 24, rowsTop + 36), UiFont, 12.0, Color.FromRgb(0x64, 0x74, 0x8B));
        }

        // 3. Left Channel Pod Label & Live Readout Pane
        DrawLeftPane(ctx, cursorSample, cursorIdx, samples, rowsTop, h);
    }

    private static void DrawOscilloscopeGraticule(DrawingContext ctx, double left, double top, double width, double height)
    {
        if (width < 40 || height < 40)
            return;

        var majorPen = new Pen(new SolidColorBrush(GraticuleMinorColor), 1.0, new DashStyle([2, 4], 0));
        const int cols = 10;
        for (int c = 1; c < cols; c++)
        {
            double x = left + (width * c) / cols;
            ctx.DrawLine(majorPen, new Point(x, top), new Point(x, top + height));
        }

        // Center horizontal graticule ticks (5 subdivisions per division)
        double centerX = left + width * 0.5;
        double centerY = top + height * 0.5;
        var axisPen = new Pen(new SolidColorBrush(Color.FromRgb(0x28, 0x32, 0x42)), 1.0);
        for (int i = 0; i <= 40; i++)
        {
            double tx = left + (width * i) / 40.0;
            ctx.DrawLine(axisPen, new Point(tx, centerY - 2.5), new Point(tx, centerY + 2.5));
        }
        for (int j = 0; j <= 32; j++)
        {
            double ty = top + (height * j) / 32.0;
            ctx.DrawLine(axisPen, new Point(centerX - 2.5, ty), new Point(centerX + 2.5, ty));
        }
    }

    private void DrawRulerAndChapterMarkers(
        DrawingContext ctx,
        IReadOnlyList<BusSample> samples,
        int firstVis,
        int lastVis,
        double plotLeft,
        double viewStart,
        double totalH)
    {
        double lastTickLabelX = -100;
        for (int i = firstVis; i <= lastVis; i++)
        {
            double sx = plotLeft + _sampleStartX[i] - viewStart;
            var s = samples[i];
            if (s.Kind is BusSampleKind.StartCondition or BusSampleKind.RepeatedStartCondition or BusSampleKind.StopCondition ||
                sx - lastTickLabelX >= 95)
            {
                ctx.DrawLine(new Pen(new SolidColorBrush(Color.FromRgb(0x3C, 0x46, 0x57)), 1.0),
                    new Point(sx, RulerHeight - 7), new Point(sx, RulerHeight));
                string ts = s.StartTimeNs >= 10_000
                    ? $"{s.StartTimeNs / 1000.0:F1} µs"
                    : $"{s.StartTimeNs:N0} ns";
                DrawText(ctx, ts, new Point(sx + 3, 14), MonoFont, 9.5, Color.FromRgb(0x94, 0xA3, 0xB8));
                lastTickLabelX = sx;
            }
        }

        if (Chapters is not null)
        {
            foreach (var ch in Chapters)
            {
                if (ch.StartSampleIndex < 0 || ch.StartSampleIndex >= _sampleStartX.Length)
                    continue;
                double cx = plotLeft + _sampleStartX[ch.StartSampleIndex] - viewStart;
                if (cx < plotLeft - 40 || cx > plotLeft + PlotViewportWidth + 40)
                    continue;

                var chPen = new Pen(new SolidColorBrush(Color.FromArgb(130, 0xFF, 0xD4, 0x00)), 1.0, new DashStyle([3, 3], 0));
                ctx.DrawLine(chPen, new Point(cx, 0), new Point(cx, totalH));
                ctx.FillRectangle(new SolidColorBrush(Color.FromRgb(0x2F, 0x29, 0x08)), new Rect(cx + 1, 1, 34, 13));
                DrawText(ctx, $"CH{ch.ChapterIndex}", new Point(cx + 4, 1), MonoBold, 9.5, Color.FromRgb(0xFF, 0xD4, 0x00));
            }
        }

        ctx.DrawLine(new Pen(new SolidColorBrush(GridLineColor), 1.0),
            new Point(plotLeft, RulerHeight), new Point(plotLeft + PlotViewportWidth, RulerHeight));
    }

    private void DrawModeSwimlane(
        DrawingContext ctx,
        IReadOnlyList<BusSample> samples,
        int firstVis,
        int lastVis,
        double plotLeft,
        double viewStart,
        double topY,
        double height)
    {
        int runStart = firstVis;
        while (runStart <= lastVis)
        {
            var modeKey = ClassifyBusMode(samples[runStart]);
            int runEnd = runStart;
            while (runEnd + 1 <= lastVis && ClassifyBusMode(samples[runEnd + 1]) == modeKey)
                runEnd++;

            double x1 = plotLeft + _sampleStartX[runStart] - viewStart;
            double x2 = plotLeft + _sampleStartX[runEnd] - viewStart + _sampleWidth[runEnd];
            double w = x2 - x1;

            var (bg, fg, label) = modeKey switch
            {
                "PP" => (Color.FromRgb(0x04, 0x26, 0x33), SdaPpColor, "I3C PP 12.5MHz"),
                "OD" => (Color.FromRgb(0x2E, 0x1A, 0x03), SclOdColor, "I3C OPEN-DRAIN"),
                "INIT" => (Color.FromRgb(0x2D, 0x25, 0x05), SclInitColor, "INIT 7E (tHIGH=200ns)"),
                "I2C" => (Color.FromRgb(0x29, 0x0A, 0x22), SclI2CColor, "LEGACY I2C 400kHz"),
                _ => (Color.FromRgb(0x11, 0x15, 0x1D), Color.FromRgb(0x88, 0x94, 0xA8), "IDLE / EDGE")
            };

            ctx.DrawRectangle(new SolidColorBrush(bg), new Pen(new SolidColorBrush(Color.FromArgb(145, fg.R, fg.G, fg.B)), 1.0),
                new Rect(x1 + 0.5, topY + 2, Math.Max(1, w - 1), height - 4));

            if (w >= 26)
            {
                string shortText = w > 135 ? label : modeKey;
                DrawText(ctx, shortText, new Point(x1 + 4, topY + 5), MonoBold, 9.5, fg, Math.Max(10, w - 8));
            }

            runStart = runEnd + 1;
        }
    }

    private void DrawProtocolSwimlane(
        DrawingContext ctx,
        double plotLeft,
        double viewStart,
        double viewEnd,
        double topY,
        double height)
    {
        var packets = Packets;
        if (packets is null || packets.Count == 0)
            return;

        double top = topY + 3;
        double bot = topY + height - 3;
        double mid = (top + bot) * 0.5;

        foreach (var pkt in packets)
        {
            if (pkt.StartSampleIndex < 0 || pkt.EndSampleIndex >= _sampleStartX.Length)
                continue;

            double x1 = _sampleStartX[pkt.StartSampleIndex];
            double x2 = _sampleStartX[pkt.EndSampleIndex] + _sampleWidth[pkt.EndSampleIndex];
            if (x2 < viewStart || x1 > viewEnd)
                continue;

            double sx = plotLeft + x1 - viewStart;
            double sw = Math.Max(2.0, x2 - x1);
            var (bg, fg) = GetPacketPalette(pkt.Category);

            // Oscilloscope serial-decode hexagonal bus cell polygon
            if (sw >= 12.0)
            {
                double bevel = Math.Min(5.0, sw * 0.22);
                var geo = new StreamGeometry();
                using (var g = geo.Open())
                {
                    g.BeginFigure(new Point(sx + 0.5, mid), true);
                    g.LineTo(new Point(sx + bevel, top));
                    g.LineTo(new Point(sx + sw - bevel, top));
                    g.LineTo(new Point(sx + sw - 0.5, mid));
                    g.LineTo(new Point(sx + sw - bevel, bot));
                    g.LineTo(new Point(sx + bevel, bot));
                    g.EndFigure(true);
                }
                ctx.DrawGeometry(new SolidColorBrush(bg), new Pen(new SolidColorBrush(fg), 1.15), geo);
            }
            else
            {
                ctx.DrawRectangle(new SolidColorBrush(bg), new Pen(new SolidColorBrush(fg), 1.0),
                    new Rect(sx + 0.5, top, Math.Max(1.0, sw - 1.0), bot - top));
            }

            if (sw >= 15)
            {
                string lbl = sw >= 90 ? pkt.ShortLabel : (sw >= 34 ? pkt.ShortLabel : pkt.ShortLabel.Split(' ')[0]);
                DrawText(ctx, lbl, new Point(sx + 6, top + 6), MonoBold, 9.5, fg, Math.Max(8, sw - 12));
            }
        }
    }

    private void DrawSignalTraces(
        DrawingContext ctx,
        IReadOnlyList<BusSample> samples,
        int firstVis,
        int lastVis,
        double plotLeft,
        double viewStart,
        double rowsTop)
    {
        for (int r = 0; r < SignalRows.Length; r++)
        {
            var row = SignalRows[r];
            double yTop = rowsTop + r * RowHeight + 4;
            double yBot = rowsTop + (r + 1) * RowHeight - 4;
            double yMid = (yTop + yBot) * 0.5;

            bool prevDefined = false;
            double prevY = yMid;

            for (int i = firstVis; i <= lastVis; i++)
            {
                var s = samples[i];
                double sx = plotLeft + _sampleStartX[i] - viewStart;
                double sw = _sampleWidth[i];

                // Draw idle gap zigzag break marker
                if (s.Kind == BusSampleKind.IdleGap && s.DurationNs >= 1000)
                {
                    ctx.FillRectangle(new SolidColorBrush(Color.FromArgb(26, 0x64, 0x74, 0x8B)), new Rect(sx, yTop - 3, sw, yBot - yTop + 6));
                    if (r == 0 && sw >= 34)
                    {
                        string gapTxt = s.DurationNs >= 100_000 ? $"// +{s.DurationNs / 1000}µs //" : $"// +{s.DurationNs}ns //";
                        DrawText(ctx, gapTxt, new Point(sx + 4, yMid - 6), MonoBold, 9, Color.FromRgb(0x94, 0xA3, 0xB8), sw - 6);
                    }
                }

                switch (row.Kind)
                {
                    case RowKind.SclWire:
                        DrawDigitalSample(ctx, sx, sw, yTop, yBot, s.Scl, GetProfileColor(s.Profile), ref prevDefined, ref prevY, true);
                        break;

                    case RowKind.SdaWire:
                        Color sdaCol = s.ResolvedBusMode switch
                        {
                            DriveMode.PushPull => SdaPpColor,
                            DriveMode.OpenDrain => SdaOdColor,
                            _ => Color.FromRgb(0x94, 0xA3, 0xB8)
                        };
                        DrawDigitalSample(ctx, sx, sw, yTop, yBot, s.Sda, sdaCol, ref prevDefined, ref prevY, true);
                        break;

                    case RowKind.EepromFilteredScl:
                        if (row.DeviceIndex < s.Devices.Length)
                        {
                            var eep = s.Devices[row.DeviceIndex];
                            bool blocked = eep.SpikeFilterBlockedPulse;
                            bool level = !blocked && s.Scl;
                            if (blocked)
                            {
                                ctx.FillRectangle(new SolidColorBrush(Color.FromArgb(24, 0xF4, 0x3F, 0x5E)), new Rect(sx, yTop, sw, yBot - yTop));
                            }
                            DrawDigitalSample(ctx, sx, sw, yTop, yBot, level, blocked ? Color.FromRgb(0x64, 0x74, 0x8B) : EepromClkColor, ref prevDefined, ref prevY, !blocked);
                        }
                        break;

                    case RowKind.DevicePad:
                        if (row.DeviceIndex < s.Devices.Length)
                        {
                            var dev = s.Devices[row.DeviceIndex];
                            DrawDevicePadSample(ctx, sx, sw, yTop, yBot, yMid, dev, ref prevDefined, ref prevY);
                        }
                        break;
                }
            }
        }
    }

    private static void DrawDigitalSample(
        DrawingContext ctx,
        double sx,
        double sw,
        double yTop,
        double yBot,
        bool level,
        Color color,
        ref bool prevDefined,
        ref double prevY,
        bool shadeHigh)
    {
        double y = level ? yTop : yBot;
        if (shadeHigh && level)
        {
            ctx.FillRectangle(new SolidColorBrush(Color.FromArgb(28, color.R, color.G, color.B)), new Rect(sx, yTop, sw, yBot - yTop));
        }

        var pen = new Pen(new SolidColorBrush(color), 1.8);
        if (prevDefined && Math.Abs(prevY - y) > 0.5)
        {
            ctx.DrawLine(pen, new Point(sx, prevY), new Point(sx, y));
        }
        ctx.DrawLine(pen, new Point(sx, y), new Point(sx + sw, y));

        prevDefined = true;
        prevY = y;
    }

    private static void DrawDevicePadSample(
        DrawingContext ctx,
        double sx,
        double sw,
        double yTop,
        double yBot,
        double yMid,
        DeviceSampleSnapshot dev,
        ref bool prevDefined,
        ref double prevY)
    {
        if (!dev.IsConnected)
        {
            var offPen = new Pen(new SolidColorBrush(Color.FromArgb(70, 0x47, 0x55, 0x69)), 1.0, new DashStyle([2, 3], 0));
            ctx.DrawLine(offPen, new Point(sx, yMid), new Point(sx + sw, yMid));
            prevDefined = false;
            return;
        }

        double y;
        Color col;
        bool isHiZ = false;

        if (dev.PadMode == DriveMode.PushPull)
        {
            y = dev.PadLevel ? yTop : yBot;
            col = SdaPpColor;
            ctx.FillRectangle(new SolidColorBrush(Color.FromArgb(30, col.R, col.G, col.B)), new Rect(sx, yTop, sw, yBot - yTop));
        }
        else if (dev.PadMode == DriveMode.OpenDrain && !dev.PadLevel)
        {
            y = yBot;
            col = SdaOdColor;
            ctx.FillRectangle(new SolidColorBrush(Color.FromArgb(36, col.R, col.G, col.B)), new Rect(sx, yMid, sw, yBot - yMid));
        }
        else if (dev.PadMode == DriveMode.OpenDrain && dev.PadLevel)
        {
            y = yMid;
            col = Color.FromRgb(0xB4, 0x7A, 0x2A);
            isHiZ = true;
        }
        else
        {
            y = yMid;
            col = HiZLineColor;
            isHiZ = true;
        }

        var pen = new Pen(new SolidColorBrush(col), isHiZ ? 1.1 : 1.9, isHiZ ? new DashStyle([3, 3], 0) : null);
        if (prevDefined && Math.Abs(prevY - y) > 0.5)
        {
            ctx.DrawLine(new Pen(new SolidColorBrush(col), 1.5), new Point(sx, prevY), new Point(sx, y));
        }
        ctx.DrawLine(pen, new Point(sx, y), new Point(sx + sw, y));

        if (dev.LostArbitrationOnEdge)
        {
            ctx.DrawLine(new Pen(new SolidColorBrush(AlertColor), 2.2), new Point(sx + sw * 0.5, yTop - 2), new Point(sx + sw * 0.5, yBot + 2));
            ctx.FillRectangle(new SolidColorBrush(AlertColor), new Rect(sx + sw * 0.5 - 3, yMid - 3, 6, 6));
        }

        prevDefined = true;
        prevY = y;
    }

    private void DrawLeftPane(
        DrawingContext ctx,
        BusSample? cursorSample,
        int cursorIdx,
        IReadOnlyList<BusSample>? samples,
        double rowsTop,
        double totalH)
    {
        ctx.FillRectangle(new SolidColorBrush(LeftPaneBg), new Rect(0, 0, LeftPaneWidth, totalH));
        ctx.DrawLine(new Pen(new SolidColorBrush(Color.FromRgb(0x38, 0x40, 0x4E)), 1.5),
            new Point(LeftPaneWidth, 0), new Point(LeftPaneWidth, totalH));

        // Ruler corner: MSO X1 / X2 delta readout
        string deltaText = "X1: L-CLK | X2: R-CLK";
        if (samples is { Count: > 0 } && cursorIdx >= 0)
        {
            long t1 = samples[cursorIdx].StartTimeNs;
            if (SecondarySampleIndex >= 0 && SecondarySampleIndex < samples.Count)
            {
                long t2 = samples[SecondarySampleIndex].StartTimeNs;
                long dt = Math.Abs(t2 - t1);
                deltaText = $"ΔX={dt:N0}ns ({Math.Abs(SecondarySampleIndex - cursorIdx)})";
            }
            else
            {
                deltaText = $"X1={t1:N0}ns (#{cursorIdx})";
            }
        }
        DrawText(ctx, deltaText, new Point(8, 9), MonoBold, 10.2, RedCursor, LeftPaneWidth - 14);
        ctx.DrawLine(new Pen(new SolidColorBrush(GridLineColor), 1.0), new Point(0, RulerHeight), new Point(LeftPaneWidth, RulerHeight));

        // Protocol decode track header
        DrawText(ctx, "BUS   I3C/I2C DECODE", new Point(8, RulerHeight + 9), MonoBold, 10.2, SdaPpColor);
        ctx.DrawLine(new Pen(new SolidColorBrush(GridLineColor), 1.0), new Point(0, RulerHeight + ProtoHeight), new Point(LeftPaneWidth, RulerHeight + ProtoHeight));

        // Electrical mode track header
        DrawText(ctx, "PHY   DRIVE / CLOCK", new Point(8, RulerHeight + ProtoHeight + 4), MonoBold, 10, SclOdColor);
        ctx.DrawLine(new Pen(new SolidColorBrush(GridLineColor), 1.0), new Point(0, rowsTop), new Point(LeftPaneWidth, rowsTop));

        for (int r = 0; r < SignalRows.Length; r++)
        {
            var row = SignalRows[r];
            double ry = rowsTop + r * RowHeight;
            ctx.DrawLine(new Pen(new SolidColorBrush(GridLineColor), 1.0), new Point(0, ry), new Point(LeftPaneWidth, ry));

            // Solid instrument channel tag block on left bezel
            var tagRect = new Rect(6, ry + 5, 28, 16);
            ctx.FillRectangle(new SolidColorBrush(row.TagColor), tagRect);
            var tagFt = new FormattedText(row.Tag, CultureInfo.InvariantCulture, FlowDirection.LeftToRight, MonoBold, 9.5, Brushes.Black);
            ctx.DrawText(tagFt, new Point(tagRect.X + (tagRect.Width - tagFt.Width) * 0.5, tagRect.Y + (tagRect.Height - tagFt.Height) * 0.5));

            DrawText(ctx, row.Label, new Point(40, ry + 6), MonoFont, 10.2, Color.FromRgb(0xD5, 0xDF, 0xEC), 130);

            if (cursorSample is not null)
            {
                var (valText, valCol) = GetCursorCellValue(row, cursorSample);
                DrawText(ctx, valText, new Point(176, ry + 6), MonoBold, 10, valCol, 64);
            }
        }
    }

    private static (string Text, Color Color) GetCursorCellValue(SignalRowDef row, BusSample s)
    {
        switch (row.Kind)
        {
            case RowKind.SclWire:
                return (s.Scl ? "1 (HIGH)" : "0 (LOW)", GetProfileColor(s.Profile));
            case RowKind.SdaWire:
                string mode = s.ResolvedBusMode switch
                {
                    DriveMode.PushPull => "PP",
                    DriveMode.OpenDrain => "OD",
                    _ => "Rp"
                };
                return ($"{(s.Sda ? "1" : "0")} [{mode}]", s.ResolvedBusMode == DriveMode.PushPull ? SdaPpColor : SdaOdColor);
            case RowKind.EepromFilteredScl:
                if (row.DeviceIndex < s.Devices.Length && s.Devices[row.DeviceIndex].SpikeFilterBlockedPulse)
                    return ("BLK <50ns", AlertColor);
                return (s.Scl ? "1 (PASS)" : "0", EepromClkColor);
            case RowKind.DevicePad:
                if (row.DeviceIndex >= s.Devices.Length)
                    return ("-", HiZLineColor);
                var dev = s.Devices[row.DeviceIndex];
                if (!dev.IsConnected)
                    return ("OFFLINE", HiZLineColor);
                if (dev.LostArbitrationOnEdge)
                    return ("ARB_LOSS", AlertColor);
                return dev.PadMode switch
                {
                    DriveMode.PushPull => (dev.PadLevel ? "PP:1" : "PP:0", SdaPpColor),
                    DriveMode.OpenDrain => (dev.PadLevel ? "OD:Z" : "OD:0", SdaOdColor),
                    _ => ("Hi-Z", HiZLineColor)
                };
            default:
                return ("", HiZLineColor);
        }
    }

    private static string ClassifyBusMode(BusSample s)
    {
        if (s.Profile == Timing.LegacyI2CFastMode) return "I2C";
        if (s.Profile == Timing.FirstBroadcastOpenDrain) return "INIT";
        if (s.Profile == Timing.I3CPushPull) return "PP";
        if (s.Profile == Timing.I3COpenDrain || s.ResolvedBusMode == DriveMode.OpenDrain) return "OD";
        return "IDLE";
    }

    private static Color GetProfileColor(SclClockProfile? profile)
    {
        if (profile == Timing.I3CPushPull) return SclPpColor;
        if (profile == Timing.I3COpenDrain) return SclOdColor;
        if (profile == Timing.FirstBroadcastOpenDrain) return SclInitColor;
        if (profile == Timing.LegacyI2CFastMode) return SclI2CColor;
        return Color.FromRgb(0x94, 0xA3, 0xB8);
    }

    private static (Color Bg, Color Fg) GetPacketPalette(PacketCategory cat) => cat switch
    {
        PacketCategory.Framing => (Color.FromRgb(0x16, 0x1B, 0x24), Color.FromRgb(0xE6, 0xEC, 0xF5)),
        PacketCategory.Idle => (Color.FromRgb(0x11, 0x15, 0x1C), Color.FromRgb(0x88, 0x94, 0xA8)),
        PacketCategory.AddressOpenDrain => (Color.FromRgb(0x2E, 0x1A, 0x03), Color.FromRgb(0xFF, 0x98, 0x00)),
        PacketCategory.AddressPushPull => (Color.FromRgb(0x04, 0x26, 0x33), Color.FromRgb(0x00, 0xE5, 0xFF)),
        PacketCategory.Ack => (Color.FromRgb(0x09, 0x2B, 0x14), Color.FromRgb(0x4C, 0xFF, 0x72)),
        PacketCategory.Nack => (Color.FromRgb(0x38, 0x0B, 0x13), Color.FromRgb(0xFF, 0x2E, 0x4C)),
        PacketCategory.CccCommand => (Color.FromRgb(0x10, 0x22, 0x42), Color.FromRgb(0x60, 0xB8, 0xFF)),
        PacketCategory.WriteDataPushPull => (Color.FromRgb(0x05, 0x27, 0x33), Color.FromRgb(0x00, 0xE5, 0xFF)),
        PacketCategory.ReadDataPushPull => (Color.FromRgb(0x06, 0x2C, 0x26), Color.FromRgb(0x2E, 0xFF, 0xC6)),
        PacketCategory.EntdaaArbitration64 => (Color.FromRgb(0x33, 0x1E, 0x04), Color.FromRgb(0xFF, 0xB3, 0x00)),
        PacketCategory.DynamicAddressAssign => (Color.FromRgb(0x0E, 0x2F, 0x17), Color.FromRgb(0x4C, 0xFF, 0x72)),
        PacketCategory.InBandInterrupt => (Color.FromRgb(0x36, 0x0E, 0x23), Color.FromRgb(0xFF, 0x5C, 0xA8)),
        PacketCategory.HotJoin => (Color.FromRgb(0x2C, 0x14, 0x3B), Color.FromRgb(0xD8, 0x8C, 0xFF)),
        PacketCategory.LegacyI2C => (Color.FromRgb(0x2B, 0x0B, 0x24), Color.FromRgb(0xFF, 0x40, 0xC8)),
        _ => (Color.FromRgb(0x3D, 0x08, 0x10), Color.FromRgb(0xFF, 0x2E, 0x4C))
    };

    private static void DrawCursorBadge(DrawingContext ctx, double centerX, double y, Color color, string text)
    {
        var rect = new Rect(centerX - 11, y, 22, 13);
        ctx.FillRectangle(new SolidColorBrush(color), rect);
        var ft = new FormattedText(text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight, MonoBold, 9, Brushes.Black);
        ctx.DrawText(ft, new Point(centerX - ft.Width * 0.5, y + 1));
    }

    private static void DrawText(DrawingContext ctx, string text, Point pos, Typeface font, double size, Color color, double maxWidth = double.PositiveInfinity)
    {
        var ft = new FormattedText(text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight, font, size, new SolidColorBrush(color));
        if (!double.IsInfinity(maxWidth))
        {
            ft.MaxTextWidth = maxWidth;
            ft.MaxLineCount = 1;
            ft.Trimming = TextTrimming.CharacterEllipsis;
        }
        ctx.DrawText(ft, pos);
    }
}
