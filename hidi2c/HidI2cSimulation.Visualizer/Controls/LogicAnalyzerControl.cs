using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using HidI2cSimulation.Simulation;

namespace HidI2cSimulation.Visualizer.Controls;

/// <summary>
/// Retro CRT Phosphor Logic Analyzer with aliased pixel-crisp waveforms,
/// zoom/pan, delta-time measurement cursors, and pixel-beveled I2C protocol decoder pills.
/// </summary>
public sealed class LogicAnalyzerControl : Control
{
    private const double GutterWidth = 152;
    private const double RulerHeight = 26;
    private const double DigitalRowHeight = 46;
    private const double DecoderRowHeight = 30;
    private const double SemanticRowHeight = 28;

    private static readonly IBrush ScreenBg = new SolidColorBrush(Color.Parse("#08060F"));
    private static readonly IBrush GutterBg = new SolidColorBrush(Color.Parse("#181326"));
    private static readonly IBrush RulerBg = new SolidColorBrush(Color.Parse("#130F1F"));
    private static readonly IBrush RowAltBg = new SolidColorBrush(Color.Parse("#0C0915"));
    private static readonly IBrush IntLowShading = new SolidColorBrush(Color.Parse("#30FF3366"));
    private static readonly IBrush ResetLowShading = new SolidColorBrush(Color.Parse("#30FF7A00"));
    private static readonly IBrush SelectionShading = new SolidColorBrush(Color.Parse("#2600E5FF"));

    private static readonly IPen GridPen = new Pen(new SolidColorBrush(Color.Parse("#1F1933")), 1);
    private static readonly IPen DividerPen = new Pen(new SolidColorBrush(Color.Parse("#32294D")), 2);
    private static readonly IPen HoverPen = new Pen(new SolidColorBrush(Color.Parse("#99F6F2E9")), 1);
    private static readonly IPen MeasurePen = new Pen(new SolidColorBrush(PixelArtHelper.RetroAmber), 2);

    private LogicAnalyzerCapture? _capture;
    private long _viewStartNs;
    private long _viewEndNs = 200_000;
    private int? _selectedTransactionId;

    private bool _isPanning;
    private bool _isMeasuring;
    private Point _lastPointerPos;
    private Point _hoverPos;
    private bool _isPointerInside;
    private long? _measureStartNs;
    private long? _measureEndNs;

    public event Action<string>? StatusChanged;
    public event Action<BusTransactionSummary?>? TransactionSelected;

    public LogicAnalyzerControl()
    {
        ClipToBounds = true;
        Focusable = true;
        RenderOptions.SetEdgeMode(this, EdgeMode.Aliased);
    }

    public void AttachCapture(LogicAnalyzerCapture capture)
    {
        if (_capture != null)
            _capture.CaptureUpdated -= OnCaptureUpdated;

        _capture = capture;
        _capture.CaptureUpdated += OnCaptureUpdated;
        ZoomFit();
    }

    private void OnCaptureUpdated()
    {
        if (_capture != null)
        {
            long total = _capture.TotalDurationNs;
            if (_viewStartNs == 0 && _viewEndNs <= total)
            {
                _viewEndNs = Math.Max(total + 30_000, 120_000);
            }
        }
        InvalidateVisual();
    }

    public void ZoomFit()
    {
        if (_capture == null) return;
        _viewStartNs = 0;
        _viewEndNs = Math.Max(_capture.TotalDurationNs + 30_000, 120_000);
        InvalidateVisual();
        UpdateCursorStatus();
    }

    public void ZoomToTransaction(BusTransactionSummary tx)
    {
        _selectedTransactionId = tx.Id;
        long span = Math.Max(20_000, tx.EndTimeNs - tx.StartTimeNs);
        long pad = Math.Max(10_000, span / 5);
        _viewStartNs = Math.Max(0, tx.StartTimeNs - pad);
        _viewEndNs = tx.EndTimeNs + pad;
        InvalidateVisual();
        TransactionSelected?.Invoke(tx);
        UpdateCursorStatus();
    }

    public void ZoomBy(double factor, double anchorRatio = 0.5)
    {
        long currentSpan = Math.Max(2_000, _viewEndNs - _viewStartNs);
        long anchorNs = _viewStartNs + (long)(currentSpan * anchorRatio);
        long maxSpan = _capture != null ? Math.Max(10_000_000, _capture.TotalDurationNs * 2) : 10_000_000;
        long newSpan = Math.Clamp((long)(currentSpan * factor), 2_000, maxSpan);

        _viewStartNs = Math.Max(0, anchorNs - (long)(newSpan * anchorRatio));
        _viewEndNs = _viewStartNs + newSpan;
        InvalidateVisual();
        UpdateCursorStatus();
    }

    protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
    {
        base.OnPointerWheelChanged(e);
        double waveWidth = Math.Max(1, Bounds.Width - GutterWidth);
        double ratio = Math.Clamp((e.GetPosition(this).X - GutterWidth) / waveWidth, 0.0, 1.0);
        double factor = e.Delta.Y > 0 ? 0.72 : 1.38;
        ZoomBy(factor, ratio);
        e.Handled = true;
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        var pos = e.GetPosition(this);
        var props = e.GetCurrentPoint(this).Properties;

        if (pos.X < GutterWidth) return;

        if (props.IsRightButtonPressed || e.KeyModifiers.HasFlag(KeyModifiers.Shift))
        {
            _isMeasuring = true;
            long ns = PixelToTimeNs(pos.X);
            _measureStartNs = ns;
            _measureEndNs = ns;
            e.Pointer.Capture(this);
            InvalidateVisual();
            UpdateCursorStatus();
        }
        else if (props.IsLeftButtonPressed)
        {
            double semanticTop = RulerHeight + DigitalRowHeight * 4 + DecoderRowHeight;
            if (pos.Y >= semanticTop && pos.Y <= semanticTop + SemanticRowHeight && _capture != null)
            {
                long clickNs = PixelToTimeNs(pos.X);
                var tx = _capture.Transactions.FirstOrDefault(t => clickNs >= t.StartTimeNs && clickNs <= t.EndTimeNs);
                if (tx != null)
                {
                    _selectedTransactionId = tx.Id;
                    TransactionSelected?.Invoke(tx);
                }
            }

            _isPanning = true;
            _lastPointerPos = pos;
            e.Pointer.Capture(this);
            InvalidateVisual();
        }
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        var pos = e.GetPosition(this);
        _hoverPos = pos;
        _isPointerInside = true;

        if (_isMeasuring)
        {
            _measureEndNs = PixelToTimeNs(pos.X);
            InvalidateVisual();
            UpdateCursorStatus();
            return;
        }

        if (_isPanning)
        {
            double dx = pos.X - _lastPointerPos.X;
            double waveWidth = Math.Max(1, Bounds.Width - GutterWidth);
            long span = _viewEndNs - _viewStartNs;
            long deltaNs = (long)(-dx / waveWidth * span);

            long newStart = Math.Max(0, _viewStartNs + deltaNs);
            _viewStartNs = newStart;
            _viewEndNs = newStart + span;
            _lastPointerPos = pos;
        }

        InvalidateVisual();
        UpdateCursorStatus();
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        if (_isPanning || _isMeasuring)
        {
            _isPanning = false;
            _isMeasuring = false;
            e.Pointer.Capture(null);
            InvalidateVisual();
        }
    }

    protected override void OnPointerExited(PointerEventArgs e)
    {
        base.OnPointerExited(e);
        _isPointerInside = false;
        InvalidateVisual();
    }

    private long PixelToTimeNs(double x)
    {
        double waveWidth = Math.Max(1, Bounds.Width - GutterWidth);
        double ratio = Math.Clamp((x - GutterWidth) / waveWidth, 0.0, 1.0);
        return _viewStartNs + (long)(ratio * (_viewEndNs - _viewStartNs));
    }

    private double TimeNsToPixel(long timeNs)
    {
        double waveWidth = Math.Max(1, Bounds.Width - GutterWidth);
        long span = Math.Max(1, _viewEndNs - _viewStartNs);
        return Math.Floor(GutterWidth + ((double)(timeNs - _viewStartNs) / span) * waveWidth);
    }

    private void UpdateCursorStatus()
    {
        long span = _viewEndNs - _viewStartNs;
        string viewStr = $"[{FormatTime(_viewStartNs)}..{FormatTime(_viewEndNs)}] SPAN:{FormatTime(span)}";

        if (_measureStartNs.HasValue && _measureEndNs.HasValue && _measureStartNs != _measureEndNs)
        {
            long dt = Math.Abs(_measureEndNs.Value - _measureStartNs.Value);
            double freqKhz = dt > 0 ? 1_000_000.0 / dt : 0;
            StatusChanged?.Invoke($"{viewStr} | dT={FormatTime(dt)} ({freqKhz:F1}kHz)");
            return;
        }

        if (_isPointerInside && _hoverPos.X >= GutterWidth)
        {
            long hoverNs = PixelToTimeNs(_hoverPos.X);
            string frameInfo = "";
            if (_capture != null)
            {
                var frame = _capture.Frames.FirstOrDefault(f => hoverNs >= f.StartTimeNs && hoverNs <= f.EndTimeNs);
                var spanItem = _capture.SemanticSpans.FirstOrDefault(s => hoverNs >= s.StartTimeNs && hoverNs <= s.EndTimeNs);
                if (frame != null)
                    frameInfo = $" | {frame.DetailText}";
                else if (spanItem != null)
                    frameInfo = $" | {spanItem.Label}";
            }
            StatusChanged?.Invoke($"{viewStr} | T={FormatTime(hoverNs)}{frameInfo}");
            return;
        }

        StatusChanged?.Invoke(viewStr);
    }

    public override void Render(DrawingContext context)
    {
        double w = Math.Floor(Bounds.Width);
        double h = Math.Floor(Bounds.Height);
        if (w <= GutterWidth + 10 || h <= RulerHeight + 10) return;

        context.FillRectangle(ScreenBg, new Rect(0, 0, w, h));
        context.FillRectangle(GutterBg, new Rect(0, 0, GutterWidth, h));
        context.FillRectangle(RulerBg, new Rect(GutterWidth, 0, w - GutterWidth, RulerHeight));

        double y = RulerHeight;
        for (int i = 0; i < 4; i++)
        {
            if (i % 2 == 1)
                context.FillRectangle(RowAltBg, new Rect(GutterWidth, y, w - GutterWidth, DigitalRowHeight));
            y += DigitalRowHeight;
        }
        context.FillRectangle(new SolidColorBrush(Color.Parse("#100C1C")), new Rect(GutterWidth, y, w - GutterWidth, DecoderRowHeight));
        y += DecoderRowHeight;
        context.FillRectangle(new SolidColorBrush(Color.Parse("#140F24")), new Rect(GutterWidth, y, w - GutterWidth, SemanticRowHeight));

        // Subtle CRT scanlines across waveform area
        var scanBrush = new SolidColorBrush(Color.Parse("#14FFFFFF"));
        for (double sy = RulerHeight + 2; sy < h; sy += 4)
        {
            context.FillRectangle(scanBrush, new Rect(GutterWidth, sy, w - GutterWidth, 1));
        }

        DrawTimeGridAndRuler(context, w, h);

        using (context.PushClip(new Rect(GutterWidth, RulerHeight, w - GutterWidth, h - RulerHeight)))
        {
            if (_capture != null)
            {
                DrawSelectedTransactionHighlight(context, h);

                double rowY = RulerHeight;
                DrawDigitalChannel(context, LogicChannelId.Scl, rowY, DigitalRowHeight, PixelArtHelper.ElectricCyan, null);
                rowY += DigitalRowHeight;
                DrawDigitalChannel(context, LogicChannelId.Sda, rowY, DigitalRowHeight, PixelArtHelper.PhosphorGreen, null);
                rowY += DigitalRowHeight;
                DrawDigitalChannel(context, LogicChannelId.Int, rowY, DigitalRowHeight, PixelArtHelper.ArcadeMagenta, IntLowShading);
                rowY += DigitalRowHeight;
                DrawDigitalChannel(context, LogicChannelId.Reset, rowY, DigitalRowHeight, PixelArtHelper.RetroOrange, ResetLowShading);
                rowY += DigitalRowHeight;

                DrawProtocolDecoderRow(context, rowY, DecoderRowHeight);
                rowY += DecoderRowHeight;

                DrawSemanticSpanRow(context, rowY, SemanticRowHeight);
            }

            DrawCursorsAndHover(context, h);
        }

        DrawGutterHeaders(context);

        context.FillRectangle(new SolidColorBrush(PixelArtHelper.BevelLight), new Rect(GutterWidth - 2, 0, 2, h));
        context.FillRectangle(new SolidColorBrush(PixelArtHelper.BevelLight), new Rect(0, RulerHeight - 2, w, 2));
    }

    private void DrawTimeGridAndRuler(DrawingContext context, double w, double h)
    {
        double waveWidth = w - GutterWidth;
        long span = Math.Max(1, _viewEndNs - _viewStartNs);
        double targetTickCount = Math.Max(3, waveWidth / 110.0);
        long rawStep = (long)(span / targetTickCount);
        long step = ChooseNiceStep(rawStep);

        long firstTick = ((_viewStartNs / step) + (_viewStartNs % step == 0 ? 0 : 1)) * step;
        for (long t = firstTick; t <= _viewEndNs; t += step)
        {
            double px = TimeNsToPixel(t);
            context.DrawLine(GridPen, new Point(px, RulerHeight), new Point(px, h));
            context.FillRectangle(new SolidColorBrush(PixelArtHelper.RetroAmber), new Rect(px, RulerHeight - 6, 2, 6));

            var label = PixelArtHelper.CreatePixelText(FormatTime(t), 10, PixelArtHelper.MutedLavender, FontWeight.Bold);
            context.DrawText(label, new Point(px + 4, 5));
        }
    }

    private void DrawSelectedTransactionHighlight(DrawingContext context, double h)
    {
        if (_capture == null || !_selectedTransactionId.HasValue) return;
        var tx = _capture.Transactions.FirstOrDefault(t => t.Id == _selectedTransactionId.Value);
        if (tx == null || tx.EndTimeNs < _viewStartNs || tx.StartTimeNs > _viewEndNs) return;

        double x1 = Math.Max(GutterWidth, TimeNsToPixel(tx.StartTimeNs));
        double x2 = TimeNsToPixel(tx.EndTimeNs);
        if (x2 > x1)
            context.FillRectangle(SelectionShading, new Rect(x1, RulerHeight, x2 - x1, h - RulerHeight));
    }

    private void DrawDigitalChannel(
        DrawingContext context,
        LogicChannelId channel,
        double topY,
        double rowHeight,
        Color lineColor,
        IBrush? lowHighlightBrush)
    {
        if (_capture == null) return;

        var edges = _capture.GetChannelEdges(channel);
        if (edges.Count == 0) return;

        double w = Math.Floor(Bounds.Width);
        double yHigh = Math.Floor(topY + 9);
        double yLow = Math.Floor(topY + rowHeight - 9);

        int idx = _capture.FindFirstEdgeIndex(channel, _viewStartNs);
        byte currentLevel = edges[idx].Level;

        var geometry = new StreamGeometry();
        using (var ctx = geometry.Open())
        {
            double startY = currentLevel == 1 ? yHigh : yLow;
            ctx.BeginFigure(new Point(GutterWidth, startY), false);

            long lastEdgeTime = _viewStartNs;
            double lastY = startY;
            int lastPixelX = (int)GutterWidth;
            int edgesInPixel = 0;

            for (int i = idx + 1; i < edges.Count; i++)
            {
                var edge = edges[i];
                if (edge.TimeNs > _viewEndNs) break;

                double px = TimeNsToPixel(edge.TimeNs);
                double nextY = edge.Level == 1 ? yHigh : yLow;

                if (lowHighlightBrush != null && currentLevel == 0)
                {
                    double x1 = Math.Max(GutterWidth, TimeNsToPixel(lastEdgeTime));
                    if (px > x1)
                        context.FillRectangle(lowHighlightBrush, new Rect(x1, yHigh, px - x1, yLow - yHigh));
                }

                int pixelBucket = (int)px;
                if (pixelBucket == lastPixelX)
                {
                    edgesInPixel++;
                    if (edgesInPixel <= 2)
                    {
                        ctx.LineTo(new Point(px, lastY));
                        ctx.LineTo(new Point(px, nextY));
                    }
                    else if (edgesInPixel == 3)
                    {
                        context.FillRectangle(new SolidColorBrush(lineColor, 0.8), new Rect(pixelBucket, yHigh, 2, yLow - yHigh));
                    }
                }
                else
                {
                    ctx.LineTo(new Point(px, lastY));
                    ctx.LineTo(new Point(px, nextY));
                    lastPixelX = pixelBucket;
                    edgesInPixel = 1;
                }

                lastY = nextY;
                currentLevel = edge.Level;
                lastEdgeTime = edge.TimeNs;
            }

            if (lowHighlightBrush != null && currentLevel == 0)
            {
                double x1 = Math.Max(GutterWidth, TimeNsToPixel(lastEdgeTime));
                if (w > x1)
                    context.FillRectangle(lowHighlightBrush, new Rect(x1, yHigh, w - x1, yLow - yHigh));
            }
            ctx.LineTo(new Point(w, lastY));
        }

        var pen = new Pen(new SolidColorBrush(lineColor), 2);
        context.DrawGeometry(null, pen, geometry);
        context.DrawLine(DividerPen, new Point(GutterWidth, topY + rowHeight), new Point(Bounds.Width, topY + rowHeight));
    }

    private void DrawProtocolDecoderRow(DrawingContext context, double topY, double rowHeight)
    {
        if (_capture == null) return;

        foreach (var frame in _capture.Frames)
        {
            if (frame.EndTimeNs < _viewStartNs || frame.StartTimeNs > _viewEndNs)
                continue;

            double x1 = TimeNsToPixel(frame.StartTimeNs);
            double x2 = TimeNsToPixel(frame.EndTimeNs);
            double width = Math.Max(2.0, x2 - x1);

            Color fillColor = frame.Kind switch
            {
                I2cFrameKind.Start => Color.Parse("#15803D"),
                I2cFrameKind.RepeatedStart => Color.Parse("#B45309"),
                I2cFrameKind.Stop => Color.Parse("#B91C1C"),
                I2cFrameKind.AddressWrite => Color.Parse("#1D4ED8"),
                I2cFrameKind.AddressRead => Color.Parse("#6D28D9"),
                I2cFrameKind.RegisterAddress => Color.Parse("#7E22CE"),
                I2cFrameKind.DataWrite => Color.Parse("#0F766E"),
                I2cFrameKind.DataRead => Color.Parse("#0284C7"),
                I2cFrameKind.Ack => Color.Parse("#16A34A"),
                I2cFrameKind.Nack => Color.Parse("#E11D48"),
                _ => Color.Parse("#334155")
            };

            double rw = Math.Max(2, width - 1);
            var rect = new Rect(x1, topY + 4, rw, rowHeight - 8);
            context.FillRectangle(new SolidColorBrush(fillColor), rect);
            if (rw >= 4)
            {
                // Sharp 1px pixel bevel top & bottom
                context.FillRectangle(new SolidColorBrush(PixelArtHelper.CreamWhite, 0.35), new Rect(rect.X, rect.Y, rw, 1));
                context.FillRectangle(new SolidColorBrush(PixelArtHelper.HardShadow), new Rect(rect.X, rect.Bottom - 1, rw, 1));
            }

            if (width >= 16)
            {
                string labelText = frame.ShortText;
                if (width < 48 && labelText.Length > 4)
                    labelText = frame.ByteValue.HasValue ? $"{frame.ByteValue.Value:X2}" : labelText[..Math.Min(2, labelText.Length)];

                var txt = PixelArtHelper.CreatePixelText(labelText, 9.5, PixelArtHelper.CreamWhite, FontWeight.Bold);
                if (txt.Width <= width - 4)
                {
                    context.DrawText(txt, new Point(Math.Floor(x1 + (width - txt.Width) / 2.0), Math.Floor(topY + (rowHeight - txt.Height) / 2.0)));
                }
            }
        }

        context.DrawLine(DividerPen, new Point(GutterWidth, topY + rowHeight), new Point(Bounds.Width, topY + rowHeight));
    }

    private void DrawSemanticSpanRow(DrawingContext context, double topY, double rowHeight)
    {
        if (_capture == null) return;

        foreach (var span in _capture.SemanticSpans)
        {
            if (span.EndTimeNs < _viewStartNs || span.StartTimeNs > _viewEndNs)
                continue;

            double x1 = Math.Max(GutterWidth, TimeNsToPixel(span.StartTimeNs));
            double x2 = Math.Min(Bounds.Width, TimeNsToPixel(span.EndTimeNs));
            double width = Math.Max(3.0, x2 - x1);

            bool selected = _selectedTransactionId == span.TransactionId;
            Color fill = selected ? Color.Parse("#007A99") : Color.Parse("#241C3A");
            Color border = selected ? PixelArtHelper.ElectricCyan : Color.Parse("#5A4C82");

            var rect = new Rect(x1, topY + 3, Math.Max(2, width - 1), rowHeight - 6);
            context.FillRectangle(new SolidColorBrush(fill), rect);
            context.DrawRectangle(null, new Pen(new SolidColorBrush(border), 1.5), rect);

            if (width >= 36)
            {
                var txt = PixelArtHelper.CreatePixelText(span.Label, 10, PixelArtHelper.CreamWhite, FontWeight.Bold);
                using (context.PushClip(new Rect(rect.X + 4, rect.Y, Math.Max(0, rect.Width - 8), rect.Height)))
                {
                    context.DrawText(txt, new Point(rect.X + 6, Math.Floor(topY + (rowHeight - txt.Height) / 2.0)));
                }
            }
        }
    }

    private void DrawCursorsAndHover(DrawingContext context, double h)
    {
        if (_measureStartNs.HasValue && _measureEndNs.HasValue && _measureStartNs != _measureEndNs)
        {
            double x1 = TimeNsToPixel(_measureStartNs.Value);
            double x2 = TimeNsToPixel(_measureEndNs.Value);
            double minX = Math.Min(x1, x2);
            double maxX = Math.Max(x1, x2);

            context.FillRectangle(new SolidColorBrush(PixelArtHelper.RetroAmber, 0.14), new Rect(minX, RulerHeight, maxX - minX, h - RulerHeight));
            context.DrawLine(MeasurePen, new Point(x1, RulerHeight), new Point(x1, h));
            context.DrawLine(MeasurePen, new Point(x2, RulerHeight), new Point(x2, h));
        }

        if (_isPointerInside && _hoverPos.X >= GutterWidth)
        {
            double hx = Math.Floor(_hoverPos.X);
            context.DrawLine(HoverPen, new Point(hx, RulerHeight), new Point(hx, h));
        }
    }

    private void DrawGutterHeaders(DrawingContext context)
    {
        long hoverNs = (_isPointerInside && _hoverPos.X >= GutterWidth)
            ? PixelToTimeNs(_hoverPos.X)
            : (_capture?.Timeline.CurrentTimeNs ?? 0);

        var rows = new (string Name, string Sub, Color Accent, LogicChannelId? Channel, double Height)[]
        {
            ("D0: SCL", "400KHz CLK", PixelArtHelper.ElectricCyan, LogicChannelId.Scl, DigitalRowHeight),
            ("D1: SDA", "OPEN-DRAIN", PixelArtHelper.PhosphorGreen, LogicChannelId.Sda, DigitalRowHeight),
            ("D2: INT#", "ACTIVE-LOW", PixelArtHelper.ArcadeMagenta, LogicChannelId.Int, DigitalRowHeight),
            ("D3: RST#", "HW RESET", PixelArtHelper.RetroOrange, LogicChannelId.Reset, DigitalRowHeight),
            ("P0: I2C", "DECODER", PixelArtHelper.PixelLavender, null, DecoderRowHeight),
            ("P1: MSG", "HID-I2C", PixelArtHelper.RetroAmber, null, SemanticRowHeight)
        };

        context.DrawText(PixelArtHelper.CreatePixelText("CH PROBES", 10, PixelArtHelper.RetroAmber, FontWeight.Bold), new Point(10, 6));

        double y = RulerHeight;
        foreach (var r in rows)
        {
            context.FillRectangle(new SolidColorBrush(r.Accent), new Rect(2, y + 4, 4, r.Height - 8));
            context.DrawText(PixelArtHelper.CreatePixelText(r.Name, 11, PixelArtHelper.CreamWhite, FontWeight.Bold), new Point(10, y + 6));

            if (r.Height >= DigitalRowHeight)
            {
                context.DrawText(PixelArtHelper.CreatePixelText(r.Sub, 9, PixelArtHelper.MutedLavender), new Point(10, y + 23));
            }

            if (r.Channel.HasValue && _capture != null)
            {
                byte lvl = _capture.GetLevelAt(r.Channel.Value, hoverNs);
                bool lit = lvl == 0;
                double bx = GutterWidth - 32;
                double by = y + 13;
                context.FillRectangle(new SolidColorBrush(PixelArtHelper.HardShadow), new Rect(bx + 2, by + 2, 22, 18));
                context.FillRectangle(new SolidColorBrush(lit ? r.Accent : PixelArtHelper.ScreenBg), new Rect(bx, by, 22, 18));
                context.DrawRectangle(null, new Pen(new SolidColorBrush(r.Accent), 1), new Rect(bx + 0.5, by + 0.5, 21, 17));
                context.DrawText(PixelArtHelper.CreatePixelText(lvl == 1 ? "H" : "L", 10, lit ? PixelArtHelper.HardShadow : r.Accent, FontWeight.Bold),
                    new Point(bx + 7, by + 2));
            }

            context.DrawLine(DividerPen, new Point(0, y + r.Height), new Point(GutterWidth, y + r.Height));
            y += r.Height;
        }
    }

    private static long ChooseNiceStep(long rawStep)
    {
        long[] candidates =
        {
            100, 250, 500,
            1_000, 2_000, 5_000,
            10_000, 20_000, 50_000,
            100_000, 200_000, 500_000,
            1_000_000, 2_000_000, 5_000_000,
            10_000_000, 20_000_000, 50_000_000
        };
        foreach (long c in candidates)
        {
            if (c >= rawStep) return c;
        }
        return Math.Max(100, rawStep);
    }

    private static string FormatTime(long ns)
    {
        if (ns < 1_000) return $"{ns}ns";
        if (ns < 1_000_000) return $"{ns / 1000.0:F1}us";
        return $"{ns / 1_000_000.0:F2}ms";
    }
}
