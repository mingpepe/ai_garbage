using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using McuBusWpf.ViewModels;

namespace McuBusWpf.Controls;

public sealed class GtkWaveControl : Control
{
    public static readonly StyledProperty<IList<SignalPoint>?> SamplesProperty =
        AvaloniaProperty.Register<GtkWaveControl, IList<SignalPoint>?>(nameof(Samples));

    public IList<SignalPoint>? Samples
    {
        get => GetValue(SamplesProperty);
        set => SetValue(SamplesProperty, value);
    }

    public double PixelsPerCycle { get; set; } = 48.0;
    public int ScrollOffset { get; set; } = 0;
    public int CursorIndex { get; set; } = 0;
    public int SelectedRow { get; set; } = 5;

    private const double LeftPaneWidth = 250.0;
    private const double RulerHeight = 26.0;
    private const double RowHeight = 21.0;

    private record TrackDef(string Group, string Name, bool IsBit, Color Color, Func<SignalPoint, string> ValueGetter);

    private static readonly TrackDef[] Tracks =
    [
        new("CLK",  "clk (100MHz)",          true,  Color.FromRgb(0x00, 0xFF, 0x66), _ => "1/0"),
        new("BUS",  "bus_master[1:0]",       false, Color.FromRgb(0x38, 0xBD, 0xF8), s => s.BusWinner),
        new("BUS",  "haddr[31:0]",           false, Color.FromRgb(0xFB, 0xBF, 0x24), s => $"0x{s.BusAddr:X8}"),
        new("BUS",  "hwrite",                true,  Color.FromRgb(0xF5, 0x9E, 0x0B), s => s.BusWrite ? "1" : "0"),
        new("BUS",  "hdata[7:0]",            false, Color.FromRgb(0xA7, 0x8B, 0xFA), s => $"0x{s.BusData:X2}"),
        new("DMA",  "u_dma.state[2:0]",      false, Color.FromRgb(0x10, 0xB9, 0x81), s => s.DmaState),
        new("DMA",  "u_dma.cndtr[15:0]",     false, Color.FromRgb(0x34, 0xD3, 0x99), s => s.DmaCndtr.ToString()),
        new("DMA",  "u_dma.data_latch[7:0]", false, Color.FromRgb(0xC0, 0x84, 0xFC), s => $"0x{s.DmaLatch:X2}"),
        new("DMA",  "dreq_uart_rx",          true,  Color.FromRgb(0x00, 0xFF, 0x66), s => s.UartDreq ? "1" : "0"),
        new("DMA",  "dreq_i2c_tx",           true,  Color.FromRgb(0x38, 0xBD, 0xF8), s => s.I2cDreq ? "1" : "0"),
        new("DMA",  "irq_dma_tc",            true,  Color.FromRgb(0xF4, 0x3F, 0x5E), s => s.DmaIrq ? "1" : "0"),
        new("UART", "u_uart.fifo_cnt[2:0]",  false, Color.FromRgb(0x4A, 0xDE, 0x80), s => s.UartFifoCnt.ToString()),
        new("I2C",  "u_i2c.fifo_cnt[1:0]",   false, Color.FromRgb(0x60, 0xA5, 0xFA), s => s.I2cFifoCnt.ToString()),
        new("I2C",  "u_i2c.shift_byte[7:0]", false, Color.FromRgb(0xFB, 0xBF, 0x24), s => $"0x{s.I2cShiftByte:X2}"),
        new("CPU",  "u_cpu.state[1:0]",      false, Color.FromRgb(0x60, 0xA5, 0xFA), s => s.CpuState)
    ];

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);
        if (change.Property == SamplesProperty)
        {
            if (change.OldValue is INotifyCollectionChanged oldObs)
                oldObs.CollectionChanged -= OnCollectionChanged;
            if (change.NewValue is INotifyCollectionChanged newObs)
                newObs.CollectionChanged += OnCollectionChanged;
            SyncLatestCursor();
            InvalidateVisual();
        }
    }

    private void OnCollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        SyncLatestCursor();
        InvalidateVisual();
    }

    private void SyncLatestCursor()
    {
        if (Samples != null && Samples.Count > 0)
        {
            CursorIndex = Samples.Count - 1;
            double plotW = Math.Max(100, Bounds.Width - LeftPaneWidth);
            int visible = (int)(plotW / PixelsPerCycle);
            if (visible > 2 && Samples.Count > visible - 1)
                ScrollOffset = Math.Max(0, Samples.Count - visible + 1);
        }
    }

    public void ZoomIn()
    {
        PixelsPerCycle = Math.Min(110.0, PixelsPerCycle * 1.25);
        InvalidateVisual();
    }

    public void ZoomOut()
    {
        PixelsPerCycle = Math.Max(14.0, PixelsPerCycle / 1.25);
        InvalidateVisual();
    }

    public void ZoomFit()
    {
        if (Samples == null || Samples.Count <= 1) return;
        double plotW = Math.Max(100, Bounds.Width - LeftPaneWidth - 16);
        PixelsPerCycle = Math.Clamp(plotW / Samples.Count, 12.0, 90.0);
        ScrollOffset = 0;
        InvalidateVisual();
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        Point pt = e.GetPosition(this);
        if (pt.Y > RulerHeight)
        {
            int row = (int)((pt.Y - RulerHeight) / RowHeight);
            if (row >= 0 && row < Tracks.Length)
                SelectedRow = row;
        }
        if (pt.X > LeftPaneWidth && Samples != null && Samples.Count > 0)
        {
            int idx = ScrollOffset + (int)((pt.X - LeftPaneWidth) / PixelsPerCycle);
            CursorIndex = Math.Clamp(idx, 0, Samples.Count - 1);
        }
        InvalidateVisual();
    }

    protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
    {
        base.OnPointerWheelChanged(e);
        if (e.KeyModifiers.HasFlag(KeyModifiers.Control))
        {
            if (e.Delta.Y > 0) ZoomIn();
            else ZoomOut();
        }
        else if (Samples != null)
        {
            ScrollOffset = Math.Clamp(ScrollOffset + (e.Delta.Y < 0 ? 3 : -3), 0, Math.Max(0, Samples.Count - 2));
            InvalidateVisual();
        }
        e.Handled = true;
    }

    public override void Render(DrawingContext dc)
    {
        double w = Bounds.Width;
        double h = Bounds.Height;
        if (w <= 10 || h <= 10) return;

        var typeface = new Typeface(FontFamily.Default, FontStyle.Normal, FontWeight.Bold);

        // 1. Pitch-black GTKWave background
        dc.DrawRectangle(new SolidColorBrush(Color.FromRgb(0x05, 0x08, 0x0F)), null, new Rect(0, 0, w, h));

        // 2. Left Signal Hierarchy Pane
        dc.DrawRectangle(new SolidColorBrush(Color.FromRgb(0x08, 0x0D, 0x17)), null, new Rect(0, 0, LeftPaneWidth, h));
        dc.DrawRectangle(new SolidColorBrush(Color.FromRgb(0x0F, 0x17, 0x2A)), null, new Rect(0, 0, w, RulerHeight));

        var borderPen = new Pen(new SolidColorBrush(Color.FromRgb(0x26, 0x33, 0x4D)), 1.0);
        var rowGridPen = new Pen(new SolidColorBrush(Color.FromRgb(0x11, 0x18, 0x27)), 1.0);
        var colGridPen = new Pen(new SolidColorBrush(Color.FromRgb(0x11, 0x1A, 0x2E)), 1.0);

        dc.DrawLine(borderPen, new Point(0, RulerHeight), new Point(w, RulerHeight));
        dc.DrawLine(borderPen, new Point(LeftPaneWidth, 0), new Point(LeftPaneWidth, h));

        var hdrText = new FormattedText("SIGNALS              VALUE @ MARKER", CultureInfo.InvariantCulture,
            FlowDirection.LeftToRight, typeface, 10, new SolidColorBrush(Color.FromRgb(0x94, 0xA3, 0xB8)));
        dc.DrawText(hdrText, new Point(8, 7));

        var list = Samples;
        int count = list?.Count ?? 0;
        SignalPoint? curSample = (count > 0 && CursorIndex >= 0 && CursorIndex < count) ? list![CursorIndex] : null;

        int visibleCols = (int)Math.Ceiling((w - LeftPaneWidth) / PixelsPerCycle) + 1;
        int startIdx = Math.Clamp(ScrollOffset, 0, Math.Max(0, count - 1));
        int endIdx = Math.Min(count, startIdx + visibleCols);

        // 3. Draw Time Ruler Ticks
        for (int i = startIdx; i < endIdx; i++)
        {
            double x = LeftPaneWidth + (i - startIdx) * PixelsPerCycle;
            dc.DrawLine(colGridPen, new Point(x, RulerHeight), new Point(x, h));

            int cyc = list![i].Cycle;
            var tText = new FormattedText($"{cyc * 10}ns (c{cyc})", CultureInfo.InvariantCulture,
                FlowDirection.LeftToRight, typeface, 9, new SolidColorBrush(Color.FromRgb(0x94, 0xA3, 0xB8)));
            dc.DrawText(tText, new Point(x + 3, 7));
        }

        // 4. Draw Signal Rows & Waveform Envelopes
        for (int r = 0; r < Tracks.Length; r++)
        {
            var tr = Tracks[r];
            double yTop = RulerHeight + r * RowHeight;
            double yBot = yTop + RowHeight;
            double wTop = yTop + 3;
            double wBot = yBot - 3;
            double wMid = (wTop + wBot) / 2.0;

            if (r == SelectedRow)
            {
                dc.DrawRectangle(new SolidColorBrush(Color.FromArgb(60, 0x25, 0x63, 0xEB)), null, new Rect(0, yTop, w, RowHeight));
            }
            dc.DrawLine(rowGridPen, new Point(0, yBot), new Point(w, yBot));

            var sigBrush = new SolidColorBrush(tr.Color);
            var nameFt = new FormattedText($"[{tr.Group}] {tr.Name}", CultureInfo.InvariantCulture,
                FlowDirection.LeftToRight, typeface, 10, new SolidColorBrush(Color.FromRgb(0xE2, 0xE8, 0xF0)));
            dc.DrawText(nameFt, new Point(6, yTop + 4));

            if (curSample != null)
            {
                string vStr = tr.ValueGetter(curSample);
                var valFt = new FormattedText(vStr, CultureInfo.InvariantCulture,
                    FlowDirection.LeftToRight, typeface, 10, sigBrush);
                dc.DrawText(valFt, new Point(LeftPaneWidth - valFt.Width - 8, yTop + 4));
            }

            if (count == 0) continue;

            var wavePen = new Pen(sigBrush, 1.5);
            var fillBrush = new SolidColorBrush(Color.FromArgb(35, tr.Color.R, tr.Color.G, tr.Color.B));

            if (tr.Name.StartsWith("clk"))
            {
                for (int i = startIdx; i < endIdx; i++)
                {
                    double x0 = LeftPaneWidth + (i - startIdx) * PixelsPerCycle;
                    double xMid = x0 + PixelsPerCycle / 2.0;
                    double x1 = x0 + PixelsPerCycle;
                    dc.DrawRectangle(fillBrush, null, new Rect(x0, wTop, PixelsPerCycle / 2.0, wBot - wTop));
                    dc.DrawLine(wavePen, new Point(x0, wBot), new Point(x0, wTop));
                    dc.DrawLine(wavePen, new Point(x0, wTop), new Point(xMid, wTop));
                    dc.DrawLine(wavePen, new Point(xMid, wTop), new Point(xMid, wBot));
                    dc.DrawLine(wavePen, new Point(xMid, wBot), new Point(x1, wBot));
                }
            }
            else if (tr.IsBit)
            {
                for (int i = startIdx; i < endIdx; i++)
                {
                    double x0 = LeftPaneWidth + (i - startIdx) * PixelsPerCycle;
                    double x1 = x0 + PixelsPerCycle;
                    bool high = tr.ValueGetter(list![i]) == "1";
                    double y = high ? wTop : wBot;

                    if (high)
                        dc.DrawRectangle(fillBrush, null, new Rect(x0, wTop, PixelsPerCycle, wBot - wTop));

                    if (i > startIdx)
                    {
                        bool prevHigh = tr.ValueGetter(list[i - 1]) == "1";
                        if (prevHigh != high)
                            dc.DrawLine(wavePen, new Point(x0, prevHigh ? wTop : wBot), new Point(x0, y));
                    }
                    dc.DrawLine(wavePen, new Point(x0, y), new Point(x1, y));
                }
            }
            else
            {
                int segStart = startIdx;
                while (segStart < endIdx)
                {
                    string segVal = tr.ValueGetter(list![segStart]);
                    int segEnd = segStart + 1;
                    while (segEnd < endIdx && tr.ValueGetter(list[segEnd]) == segVal)
                        segEnd++;

                    double x0 = LeftPaneWidth + (segStart - startIdx) * PixelsPerCycle;
                    double x1 = LeftPaneWidth + (segEnd - startIdx) * PixelsPerCycle;
                    double slant = Math.Min(4.0, (x1 - x0) / 4.0);

                    var geom = new StreamGeometry();
                    using (var gctx = geom.Open())
                    {
                        gctx.BeginFigure(new Point(x0, wMid), true);
                        gctx.LineTo(new Point(x0 + slant, wTop));
                        gctx.LineTo(new Point(x1 - slant, wTop));
                        gctx.LineTo(new Point(x1, wMid));
                        gctx.LineTo(new Point(x1 - slant, wBot));
                        gctx.LineTo(new Point(x0 + slant, wBot));
                        gctx.EndFigure(true);
                    }
                    dc.DrawGeometry(fillBrush, wavePen, geom);

                    if (x1 - x0 >= 28)
                    {
                        var busFt = new FormattedText(segVal, CultureInfo.InvariantCulture,
                            FlowDirection.LeftToRight, typeface, 9.5, Brushes.White);
                        double tx = x0 + Math.Max(4, ((x1 - x0) - busFt.Width) / 2.0);
                        using (dc.PushClip(new Rect(x0 + 2, wTop, Math.Max(0, x1 - x0 - 4), wBot - wTop)))
                        {
                            dc.DrawText(busFt, new Point(tx, wTop + 1));
                        }
                    }

                    segStart = segEnd;
                }
            }
        }

        // 5. Primary Red Marker Line
        if (count > 0 && CursorIndex >= startIdx && CursorIndex < endIdx)
        {
            double cx = LeftPaneWidth + (CursorIndex - startIdx) * PixelsPerCycle + PixelsPerCycle / 2.0;
            var cursorPen = new Pen(new SolidColorBrush(Color.FromRgb(0xFF, 0x2E, 0x4C)), 1.5);
            dc.DrawLine(cursorPen, new Point(cx, 0), new Point(cx, h));
        }
    }
}
