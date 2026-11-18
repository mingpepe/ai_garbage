using System.Globalization;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using I3CEmulator.Physical;
using I3CEmulator.Simulation;

namespace I3CEmulator.Gui.Controls;

public sealed record DeviceCardMetadata(
    string DeviceName,
    string RoleTag,
    string Subtitle,
    string ExtraStatus,
    bool HasPendingEvent);

/// <summary>
/// Renders an oscilloscope MSO Logic Probe Pod deck displaying shared CH1 (SCL) and CH2 (SDA)
/// physical wires, switched Rp pull-up state, digital pod probe status (D0..D5), 50ns spike
/// filter gates, arbitration loss faults, and live TX/RX directional indicators.
/// </summary>
public sealed class BusTopologyControl : Control
{
    public static readonly StyledProperty<BusSample?> SampleProperty =
        AvaloniaProperty.Register<BusTopologyControl, BusSample?>(nameof(Sample));

    public static readonly StyledProperty<DecodedPacket?> ActivePacketProperty =
        AvaloniaProperty.Register<BusTopologyControl, DecodedPacket?>(nameof(ActivePacket));

    public static readonly StyledProperty<IReadOnlyDictionary<string, DeviceCardMetadata>?> MetadataProperty =
        AvaloniaProperty.Register<BusTopologyControl, IReadOnlyDictionary<string, DeviceCardMetadata>?>(nameof(Metadata));

    public BusSample? Sample
    {
        get => GetValue(SampleProperty);
        set => SetValue(SampleProperty, value);
    }

    public DecodedPacket? ActivePacket
    {
        get => GetValue(ActivePacketProperty);
        set => SetValue(ActivePacketProperty, value);
    }

    public IReadOnlyDictionary<string, DeviceCardMetadata>? Metadata
    {
        get => GetValue(MetadataProperty);
        set => SetValue(MetadataProperty, value);
    }

    private static readonly Typeface MonoFont = new("JetBrains Mono, Consolas, Monospace", FontStyle.Normal, FontWeight.Normal);
    private static readonly Typeface MonoBold = new("JetBrains Mono, Consolas, Monospace", FontStyle.Normal, FontWeight.Bold);

    // Keysight / R&S Benchtop MSO screen palette
    private static readonly Color ScreenBg = Color.FromRgb(0x00, 0x00, 0x00);
    private static readonly Color StripBg = Color.FromRgb(0x0D, 0x10, 0x15);
    private static readonly Color PodBg = Color.FromRgb(0x09, 0x0C, 0x10);
    private static readonly Color PodOfflineBg = Color.FromRgb(0x05, 0x06, 0x08);
    private static readonly Color HairlineDim = Color.FromRgb(0x26, 0x2D, 0x38);
    private static readonly Color TextPrimary = Color.FromRgb(0xE6, 0xEC, 0xF5);
    private static readonly Color TextMuted = Color.FromRgb(0x7D, 0x89, 0x9C);

    private static readonly Color Ch1SclYellow = Color.FromRgb(0xFF, 0xD4, 0x00);
    private static readonly Color Ch2SdaCyan = Color.FromRgb(0x00, 0xE5, 0xFF);
    private static readonly Color OpenDrainAmber = Color.FromRgb(0xFF, 0x98, 0x00);
    private static readonly Color LegacyMagenta = Color.FromRgb(0xFF, 0x40, 0xC8);
    private static readonly Color RxGreen = Color.FromRgb(0x4C, 0xFF, 0x72);
    private static readonly Color FaultRed = Color.FromRgb(0xFF, 0x2E, 0x4C);

    private static readonly Color[] PodChannelColors =
    [
        Color.FromRgb(0x00, 0xE5, 0xFF), // D0 Master
        Color.FromRgb(0x4C, 0xFF, 0x72), // D1 Target A
        Color.FromRgb(0xFF, 0xD4, 0x00), // D2 Target B
        Color.FromRgb(0xFF, 0x8A, 0x00), // D3 Target C
        Color.FromRgb(0xB3, 0x88, 0xFF), // D4 Target D
        Color.FromRgb(0xFF, 0x40, 0xC8)  // D5 Legacy EEPROM
    ];

    static BusTopologyControl()
    {
        AffectsRender<BusTopologyControl>(SampleProperty, ActivePacketProperty, MetadataProperty);
    }

    public override void Render(DrawingContext ctx)
    {
        base.Render(ctx);
        double w = Bounds.Width;
        double h = Bounds.Height;
        if (w < 120 || h < 120)
            return;

        // Pure oscilloscope screen canvas + subtle horizontal graticule
        ctx.FillRectangle(new SolidColorBrush(ScreenBg), new Rect(0, 0, w, h));

        var sample = Sample;
        var packet = ActivePacket;
        bool scl = sample?.Scl ?? true;
        bool sda = sample?.Sda ?? true;
        var busMode = sample?.ResolvedBusMode ?? DriveMode.HighZ;
        var profile = sample?.Profile;

        double leftMargin = 166;
        double rightMargin = 16;
        double railEndX = w - rightMargin;
        double sclY = 40;
        double sdaY = 62;

        // 1. Top oscilloscope bus telemetry readout strip
        DrawTelemetryHeader(ctx, w, sample, packet, profile);

        // 2. Switched Rp pull-up resistor probe on right side of rails
        DrawPullUpProbe(ctx, railEndX - 188, 3, sdaY, busMode);

        // 3. Shared CH1 (SCL) & CH2 (SDA) instrument bus rails
        Color sclColor = GetProfileColor(profile);
        Color sdaColor = busMode switch
        {
            DriveMode.PushPull => Ch2SdaCyan,
            DriveMode.OpenDrain => OpenDrainAmber,
            _ => TextMuted
        };

        DrawChannelTag(ctx, 10, sclY - 8, 32, 16, Ch1SclYellow, "CH1");
        DrawText(ctx, $"SCL={(scl ? "1" : "0")}", new Point(48, sclY - 7), MonoBold, 11, sclColor);

        DrawChannelTag(ctx, 10, sdaY - 8, 32, 16, Ch2SdaCyan, "CH2");
        DrawText(ctx, $"SDA={(sda ? "1" : "0")}", new Point(48, sdaY - 7), MonoBold, 11, sdaColor);

        string modeTag = busMode switch
        {
            DriveMode.PushPull => "PP",
            DriveMode.OpenDrain => "OD",
            _ => "Rp"
        };
        DrawSharpBadge(ctx, new Rect(116, sdaY - 8, 36, 16), Color.FromArgb(40, sdaColor.R, sdaColor.G, sdaColor.B), sdaColor, modeTag);

        ctx.DrawLine(new Pen(new SolidColorBrush(sclColor), scl ? 2.6 : 1.8), new Point(leftMargin, sclY), new Point(railEndX, sclY));
        ctx.DrawLine(new Pen(new SolidColorBrush(sdaColor), busMode == DriveMode.HighZ ? 1.8 : 2.6), new Point(leftMargin, sdaY), new Point(railEndX, sdaY));

        // 4. Probe Pod Modules (D0..D5)
        DeviceSampleSnapshot[] devices = sample?.Devices ?? CreateDefaultSnapshots();
        int count = devices.Length;
        if (count == 0)
            return;

        double podsLeft = 10;
        double podsWidth = w - 20;
        double gap = 6;
        double podW = Math.Max(104, (podsWidth - gap * (count - 1)) / count);
        double podTop = 94;
        double podH = Math.Max(82, h - podTop - 6);

        var activeTxPoints = new List<double>();
        var activeRxPoints = new List<double>();

        for (int i = 0; i < count; i++)
        {
            var dev = devices[i];
            Color podChColor = i < PodChannelColors.Length ? PodChannelColors[i] : Ch2SdaCyan;
            double podX = podsLeft + i * (podW + gap);
            double centerX = podX + podW * 0.5;
            double sclStubX = Math.Max(leftMargin + 8, centerX - 24);
            double sdaStubX = Math.Max(leftMargin + 30, centerX + 24);

            bool isController = dev.DeviceName == "I3C-MainController";
            bool isDrivingSda = dev.PadMode == DriveMode.PushPull ||
                                (dev.PadMode == DriveMode.OpenDrain && !dev.PadLevel);
            bool isListeningSda = IsActivelyListening(dev);

            if (isDrivingSda) activeTxPoints.Add(sdaStubX);
            else if (isListeningSda) activeRxPoints.Add(sdaStubX);

            DrawSclStub(ctx, sclStubX, sclY, podTop, dev, isController, sclColor);
            DrawSdaStub(ctx, sdaStubX, sdaY, podTop, dev, isDrivingSda, isListeningSda);

            DeviceCardMetadata? meta = null;
            Metadata?.TryGetValue(dev.DeviceName, out meta);
            DrawProbePod(ctx, new Rect(podX, podTop, podW, podH), i, podChColor, dev, meta, isController, isDrivingSda, isListeningSda);
        }

        // 5. Active bus directional markers along SDA rail
        if (activeTxPoints.Count > 0 && activeRxPoints.Count > 0)
        {
            double txAvg = activeTxPoints.Average();
            foreach (double rxX in activeRxPoints)
            {
                if (Math.Abs(rxX - txAvg) < 14)
                    continue;
                double midX = (txAvg + rxX) * 0.5;
                DrawHorizontalChevron(ctx, midX, sdaY, rxX > txAvg, sdaColor);
            }
        }
    }

    private void DrawTelemetryHeader(
        DrawingContext ctx,
        double width,
        BusSample? sample,
        DecodedPacket? packet,
        SclClockProfile? profile)
    {
        ctx.FillRectangle(new SolidColorBrush(StripBg), new Rect(0, 0, width, 24));
        ctx.DrawLine(new Pen(new SolidColorBrush(HairlineDim), 1.0), new Point(0, 24), new Point(width, 24));

        string timeText = sample is null ? "0 ns [IDLE]" : $"{sample.StartTimeNs:N0} ns ({sample.Kind})";
        DrawText(ctx, $"ACQ t={timeText}", new Point(10, 5), MonoBold, 11, TextPrimary);

        string profText = profile?.Name ?? "IDLE / FRAMING";
        Color profCol = GetProfileColor(profile);
        DrawSharpBadge(ctx, new Rect(240, 3, 152, 18), Color.FromArgb(30, profCol.R, profCol.G, profCol.B), profCol, profText);

        double msgMaxW = Math.Max(80, width - 606);
        if (msgMaxW > 90)
        {
            string summary = packet is null
                ? (sample?.Annotation ?? "BUS IDLE - READY")
                : $"{packet.Summary}  [{packet.InitiatorOrDriver}]";
            DrawText(ctx, summary, new Point(402, 5), MonoFont, 11, Color.FromRgb(0xB8, 0xC4, 0xD8), msgMaxW);
        }
    }

    private void DrawPullUpProbe(DrawingContext ctx, double x, double topY, double sdaY, DriveMode busMode)
    {
        bool rpActive = busMode != DriveMode.PushPull;
        Color rpCol = rpActive ? OpenDrainAmber : TextMuted;
        var rect = new Rect(x, topY, 180, 18);
        string lbl = rpActive ? "RP_PU: ACTIVE (OD/Z)" : "RP_PU: ISOLATED (0mA)";
        DrawSharpBadge(ctx, rect, Color.FromArgb(rpActive ? (byte)32 : (byte)15, rpCol.R, rpCol.G, rpCol.B), rpCol, lbl);

        var pen = new Pen(new SolidColorBrush(rpCol), rpActive ? 1.5 : 1.0,
            rpActive ? null : new DashStyle([3, 3], 0));
        ctx.DrawLine(pen, new Point(x + 90, rect.Bottom), new Point(x + 90, sdaY));
        ctx.FillRectangle(new SolidColorBrush(rpCol), new Rect(x + 87, sdaY - 3, 6, 6));
    }

    private void DrawSclStub(
        DrawingContext ctx,
        double x,
        double sclY,
        double podTop,
        DeviceSampleSnapshot dev,
        bool isController,
        Color sclColor)
    {
        Color lineCol = !dev.IsConnected
            ? Color.FromArgb(55, 0x64, 0x74, 0x8B)
            : dev.SpikeFilterBlockedPulse
                ? FaultRed
                : sclColor;

        var pen = new Pen(new SolidColorBrush(lineCol), isController ? 2.2 : 1.3,
            !dev.IsConnected || dev.SpikeFilterBlockedPulse ? new DashStyle([3, 3], 0) : null);
        ctx.DrawLine(pen, new Point(x, sclY), new Point(x, podTop));
        ctx.FillRectangle(new SolidColorBrush(lineCol), new Rect(x - 2.5, sclY - 2.5, 5, 5));

        if (isController)
        {
            DrawArrowHead(ctx, x, sclY + 2, up: true, lineCol);
            DrawSharpBadge(ctx, new Rect(x - 23, podTop - 19, 46, 15), ScreenBg, Ch1SclYellow, "SCL PP");
        }
        else if (dev.IsConnected && dev.IsSpikeFilterEnabled)
        {
            Color fCol = dev.SpikeFilterBlockedPulse ? FaultRed : LegacyMagenta;
            string fLbl = dev.SpikeFilterBlockedPulse ? "F50:BLK" : "F50:ON";
            DrawSharpBadge(ctx, new Rect(x - 24, podTop - 19, 48, 15), ScreenBg, fCol, fLbl);
        }
    }

    private void DrawSdaStub(
        DrawingContext ctx,
        double x,
        double sdaY,
        double podTop,
        DeviceSampleSnapshot dev,
        bool isDrivingSda,
        bool isListeningSda)
    {
        if (!dev.IsConnected)
        {
            var offPen = new Pen(new SolidColorBrush(Color.FromArgb(50, 0x64, 0x74, 0x8B)), 1.0, new DashStyle([2, 3], 0));
            ctx.DrawLine(offPen, new Point(x, sdaY), new Point(x, podTop));
            return;
        }

        Color stubCol;
        double thickness;
        DashStyle? dash = null;

        if (dev.LostArbitrationOnEdge)
        {
            stubCol = FaultRed;
            thickness = 2.4;
        }
        else if (dev.PadMode == DriveMode.PushPull)
        {
            stubCol = Ch2SdaCyan;
            thickness = 2.6;
        }
        else if (dev.PadMode == DriveMode.OpenDrain && !dev.PadLevel)
        {
            stubCol = OpenDrainAmber;
            thickness = 2.6;
        }
        else if (dev.PadMode == DriveMode.OpenDrain && dev.PadLevel)
        {
            stubCol = Color.FromArgb(170, OpenDrainAmber.R, OpenDrainAmber.G, OpenDrainAmber.B);
            thickness = 1.4;
            dash = new DashStyle([4, 2], 0);
        }
        else if (isListeningSda)
        {
            stubCol = RxGreen;
            thickness = 1.8;
        }
        else
        {
            stubCol = Color.FromArgb(95, 0x7D, 0x89, 0x9C);
            thickness = 1.1;
            dash = new DashStyle([3, 3], 0);
        }

        ctx.DrawLine(new Pen(new SolidColorBrush(stubCol), thickness, dash), new Point(x, sdaY), new Point(x, podTop));
        ctx.FillRectangle(new SolidColorBrush(stubCol), new Rect(x - 2.5, sdaY - 2.5, 5, 5));

        if (isDrivingSda)
            DrawArrowHead(ctx, x, sdaY + 2, up: true, stubCol);
        else if (isListeningSda)
            DrawArrowHead(ctx, x, podTop - 2, up: false, stubCol);

        string padBadge = dev.LostArbitrationOnEdge
            ? "ARB_LOSS"
            : dev.PadMode switch
            {
                DriveMode.PushPull => dev.PadLevel ? "TX PP:1" : "TX PP:0",
                DriveMode.OpenDrain => dev.PadLevel ? "OD:Z" : "TX OD:0",
                _ => isListeningSda ? "RX Z" : "HI-Z"
            };

        DrawSharpBadge(ctx, new Rect(x - 27, podTop - 19, 54, 15), ScreenBg, stubCol, padBadge);
    }

    private void DrawProbePod(
        DrawingContext ctx,
        Rect rect,
        int podIndex,
        Color podChColor,
        DeviceSampleSnapshot dev,
        DeviceCardMetadata? meta,
        bool isController,
        bool isDrivingSda,
        bool isListeningSda)
    {
        Color borderCol = !dev.IsConnected
            ? Color.FromRgb(0x2A, 0x30, 0x3A)
            : dev.LostArbitrationOnEdge
                ? FaultRed
                : isDrivingSda
                    ? (dev.PadMode == DriveMode.PushPull ? Ch2SdaCyan : OpenDrainAmber)
                    : isListeningSda
                        ? RxGreen
                        : HairlineDim;

        bool active = dev.IsConnected && (isDrivingSda || isListeningSda || dev.LostArbitrationOnEdge);
        Color bg = !dev.IsConnected ? PodOfflineBg : PodBg;
        var borderPen = new Pen(new SolidColorBrush(borderCol), active ? 1.8 : 1.0,
            !dev.IsConnected ? new DashStyle([4, 3], 0) : null);

        // Sharp 0px rectangular instrument probe housing
        ctx.DrawRectangle(new SolidColorBrush(bg), borderPen, rect);

        // Solid channel number header bar (Keysight MSO style)
        const double hdrH = 18;
        Color hdrBg = dev.IsConnected ? podChColor : Color.FromRgb(0x2F, 0x36, 0x42);
        Color hdrFg = dev.IsConnected ? Colors.Black : TextMuted;
        ctx.FillRectangle(new SolidColorBrush(hdrBg), new Rect(rect.X, rect.Y, rect.Width, hdrH));

        string addrTag = !dev.IsConnected
            ? "OFF"
            : isController
                ? "CTRL"
                : dev.DynamicAddress.HasValue
                    ? $"0x{dev.DynamicAddress:X2}"
                    : "UNASGN";

        DrawText(ctx, $"D{podIndex} {ShortDevName(dev.DeviceName)} [{addrTag}]",
            new Point(rect.X + 5, rect.Y + 2), MonoBold, 10, hdrFg, rect.Width - 8);

        double x = rect.X + 6;
        double y = rect.Y + hdrH + 5;
        double maxW = rect.Width - 12;

        Color phaseColor = dev.PhaseName is "Idle" or "IdleWaitingForStart" or "IgnoreUntilStartOrStop" or "IgnoringUntilNextStartOrStop"
            ? TextMuted
            : dev.SpikeFilterBlockedPulse
                ? FaultRed
                : TextPrimary;

        DrawText(ctx, $"FSM: {dev.PhaseName}", new Point(x, y), MonoBold, 9.8, phaseColor, maxW);
        y += 15;

        if (meta is not null && !string.IsNullOrWhiteSpace(meta.Subtitle))
        {
            DrawText(ctx, meta.Subtitle, new Point(x, y), MonoFont, 9.3, TextMuted, maxW);
            y += 14;
        }

        if (meta is not null && !string.IsNullOrWhiteSpace(meta.ExtraStatus) && y + 13 < rect.Bottom)
        {
            Color statusCol = meta.HasPendingEvent ? OpenDrainAmber : Ch2SdaCyan;
            DrawText(ctx, meta.ExtraStatus, new Point(x, y), MonoBold, 9.3, statusCol, maxW);
        }
    }

    private static string ShortDevName(string name) => name switch
    {
        "I3C-MainController" => "MASTER",
        "TargetA-Gyro" => "TGT-A",
        "TargetB-Temp" => "TGT-B",
        "TargetC-Alert" => "TGT-C",
        "TargetD-HotPlug" => "TGT-D",
        "Legacy-EEPROM-24C02" => "24C02",
        _ => name
    };

    private static bool IsActivelyListening(DeviceSampleSnapshot dev)
    {
        if (!dev.IsConnected || dev.SpikeFilterBlockedPulse)
            return false;

        return dev.PhaseName is not ("Idle"
            or "IdleWaitingForStart"
            or "IgnoreUntilStartOrStop"
            or "IgnoringUntilNextStartOrStop"
            or "EntdaaWaitingForNextRoundSr"
            or "SpikeFiltered");
    }

    private static Color GetProfileColor(SclClockProfile? profile)
    {
        if (profile == Timing.I3CPushPull) return Ch1SclYellow;
        if (profile == Timing.I3COpenDrain) return OpenDrainAmber;
        if (profile == Timing.FirstBroadcastOpenDrain) return Color.FromRgb(0xFF, 0xE5, 0x66);
        if (profile == Timing.LegacyI2CFastMode) return LegacyMagenta;
        return TextMuted;
    }

    private static void DrawChannelTag(DrawingContext ctx, double x, double y, double w, double h, Color bg, string text)
    {
        ctx.FillRectangle(new SolidColorBrush(bg), new Rect(x, y, w, h));
        var ft = new FormattedText(text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight, MonoBold, 10, Brushes.Black);
        ctx.DrawText(ft, new Point(x + (w - ft.Width) * 0.5, y + (h - ft.Height) * 0.5));
    }

    private static void DrawArrowHead(DrawingContext ctx, double x, double tipY, bool up, Color color)
    {
        double dy = up ? 6 : -6;
        var brush = new SolidColorBrush(color);
        var geo = new StreamGeometry();
        using (var g = geo.Open())
        {
            g.BeginFigure(new Point(x, tipY), true);
            g.LineTo(new Point(x - 4, tipY + dy));
            g.LineTo(new Point(x + 4, tipY + dy));
            g.EndFigure(true);
        }
        ctx.DrawGeometry(brush, null, geo);
    }

    private static void DrawHorizontalChevron(DrawingContext ctx, double x, double y, bool right, Color color)
    {
        double dx = right ? -6 : 6;
        var pen = new Pen(new SolidColorBrush(color), 2.0);
        ctx.DrawLine(pen, new Point(x + dx, y - 4), new Point(x, y));
        ctx.DrawLine(pen, new Point(x + dx, y + 4), new Point(x, y));
    }

    private static void DrawSharpBadge(DrawingContext ctx, Rect rect, Color bg, Color fg, string text)
    {
        ctx.DrawRectangle(new SolidColorBrush(bg), new Pen(new SolidColorBrush(fg), 1.0), rect);
        var ft = new FormattedText(text, CultureInfo.InvariantCulture, FlowDirection.LeftToRight, MonoBold, 9.2, new SolidColorBrush(fg));
        double tx = rect.X + Math.Max(2, (rect.Width - ft.Width) * 0.5);
        double ty = rect.Y + Math.Max(0, (rect.Height - ft.Height) * 0.5);
        ctx.DrawText(ft, new Point(tx, ty));
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

    private static DeviceSampleSnapshot[] CreateDefaultSnapshots() =>
    [
        new("I3C-MainController", DriveMode.HighZ, true, "Idle", null, true, false, false, false),
        new("TargetA-Gyro", DriveMode.HighZ, true, "Idle", null, true, false, false, false),
        new("TargetB-Temp", DriveMode.HighZ, true, "Idle", 0x48, true, true, false, false),
        new("TargetC-Alert", DriveMode.HighZ, true, "Idle", null, true, false, false, false),
        new("TargetD-HotPlug", DriveMode.HighZ, true, "Offline", null, false, false, false, false),
        new("Legacy-EEPROM-24C02", DriveMode.HighZ, true, "IdleWaitingForStart", 0x50, true, true, false, false)
    ];
}
