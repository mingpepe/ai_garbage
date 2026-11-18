using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;
using HidI2cSimulation.Device;
using HidI2cSimulation.Hardware;
using HidI2cSimulation.Protocol;
using HidI2cSimulation.Simulation;

namespace HidI2cSimulation.Visualizer.Controls;

/// <summary>
/// Retro 16-bit Pixel-Art PCB &amp; OS Stack Architecture Visualizer.
/// Renders pixel IC packages, solder pads, zig-zag pull-up resistors, live INT#/RESET# LEDs,
/// register cells, FIFO cassette slots, and animated 8-bit data packets.
/// </summary>
public sealed class ArchitectureDiagramControl : Control
{
    private static readonly string[] CursorSprite =
    {
        "#.......",
        "##......",
        "#+#.....",
        "#++#....",
        "#+++#...",
        "#++++#..",
        "###+##..",
        "..#..#.."
    };

    private static readonly string[] ChipSprite =
    {
        ".#.##.#.",
        "########",
        "#++++++#",
        "#+####+#",
        "#+####+#",
        "#++++++#",
        "########",
        ".#.##.#."
    };

    private static readonly string[] RomSprite =
    {
        ".######.",
        "#+####+#",
        "########",
        "#+#++#+#",
        "########",
        "#+####+#",
        ".######.",
        ".#.#.#.#"
    };

    private static readonly string[] PadSprite =
    {
        "########",
        "#......#",
        "#..++..#",
        "#.++++.#",
        "#..++..#",
        "#......#",
        "#..##..#",
        "########"
    };

    private HidI2cSimulationSession? _session;
    private ComponentCommEvent? _activeEvent;
    private readonly DispatcherTimer _animTimer;
    private double _animProgress = 1.0;

    public ArchitectureDiagramControl()
    {
        ClipToBounds = true;
        RenderOptions.SetEdgeMode(this, EdgeMode.Aliased);
        _animTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(32) };
        _animTimer.Tick += (_, _) =>
        {
            _animProgress += 0.06;
            if (_animProgress >= 1.0)
            {
                _animProgress = 1.0;
                _animTimer.Stop();
            }
            InvalidateVisual();
        };
    }

    public void AttachSession(HidI2cSimulationSession session)
    {
        _session = session;
        _session.OnCommEvent += evt =>
        {
            Dispatcher.UIThread.Post(() =>
            {
                _activeEvent = evt;
                _animProgress = 0.0;
                if (!_animTimer.IsEnabled)
                    _animTimer.Start();
                InvalidateVisual();
            });
        };
        _session.TouchpadDevice.StateUpdated += () => Dispatcher.UIThread.Post(InvalidateVisual);
        _session.InterruptPin.StateChanged += (_, _) => Dispatcher.UIThread.Post(InvalidateVisual);
        _session.ResetPin.StateChanged += (_, _) => Dispatcher.UIThread.Post(InvalidateVisual);
        _session.HostDriver.OnStepStateChanged += (_, _) => Dispatcher.UIThread.Post(InvalidateVisual);
        InvalidateVisual();
    }

    public void HighlightEvent(ComponentCommEvent evt)
    {
        _activeEvent = evt;
        _animProgress = 0.0;
        if (!_animTimer.IsEnabled)
            _animTimer.Start();
        InvalidateVisual();
    }

    public override void Render(DrawingContext context)
    {
        double w = Math.Floor(Bounds.Width);
        double h = Math.Floor(Bounds.Height);
        if (w < 300 || h < 220) return;

        // PCB substrate background + pixel dot grid
        context.FillRectangle(new SolidColorBrush(Color.Parse("#0D0A17")), new Rect(0, 0, w, h));
        var dotBrush = new SolidColorBrush(Color.Parse("#231C3A"));
        for (double gx = 8; gx < w; gx += 16)
        {
            for (double gy = 8; gy < h; gy += 16)
            {
                context.FillRectangle(dotBrush, new Rect(gx, gy, 2, 2));
            }
        }

        // PCB Silkscreen watermark
        context.DrawText(
            PixelArtHelper.CreatePixelText("HID-I2C_SYS_BOARD // REV 1.0", 9, Color.Parse("#3B315E"), FontWeight.Bold),
            new Point(w - 196, 4));

        double pad = 12;
        double leftColW = Math.Floor(Math.Max(220, w * 0.37));
        double midColW = Math.Floor(Math.Max(155, w * 0.24));
        double rightColX = pad + leftColW + midColW;
        double rightColW = Math.Floor(Math.Max(220, w - rightColX - pad));

        double leftX = pad;
        double midX = pad + leftColW;

        double osH = Math.Floor(Math.Max(64, (h - pad * 5) * 0.22));
        double drvAcpiH = Math.Floor(Math.Max(92, (h - pad * 5) * 0.43));
        double socH = Math.Floor(Math.Max(70, h - pad * 4 - osH - drvAcpiH));

        var osRect = new Rect(leftX, pad, leftColW, osH);
        double drvW = Math.Floor(leftColW * 0.54);
        double acpiW = leftColW - drvW - 10;
        var drvRect = new Rect(leftX, osRect.Bottom + pad, drvW, drvAcpiH);
        var acpiRect = new Rect(drvRect.Right + 10, osRect.Bottom + pad, acpiW, drvAcpiH);
        var socRect = new Rect(leftX, drvRect.Bottom + pad, leftColW, socH);
        var devRect = new Rect(rightColX, pad + 6, rightColW, h - pad * 2 - 6);

        double busTopY = Math.Floor(socRect.Y + 6);
        double busBottomY = Math.Floor(Math.Min(devRect.Bottom - 26, socRect.Bottom - 4));
        if (busBottomY - busTopY < 80)
        {
            busTopY = Math.Floor(h * 0.30);
            busBottomY = Math.Floor(h * 0.85);
        }
        double wireStep = (busBottomY - busTopY) / 3.5;
        double sclY = Math.Floor(busTopY + wireStep * 0.4);
        double sdaY = Math.Floor(busTopY + wireStep * 1.3);
        double intY = Math.Floor(busTopY + wireStep * 2.2);
        double rstY = Math.Floor(busTopY + wireStep * 3.1);

        DrawHostLinks(context, osRect, drvRect, acpiRect, socRect);
        DrawPhysicalBus(context, midX, rightColX, sclY, sdaY, intY, rstY);

        DrawOsInputBox(context, osRect);
        DrawHostDriverBox(context, drvRect);
        DrawAcpiBiosBox(context, acpiRect);
        DrawSocControllerBox(context, socRect);
        DrawSlaveDeviceBox(context, devRect);

        DrawActivePixelPacket(context, osRect, drvRect, acpiRect, socRect, midX, rightColX, sdaY, intY, rstY);
    }

    private void DrawHostLinks(DrawingContext ctx, Rect osRect, Rect drvRect, Rect acpiRect, Rect socRect)
    {
        bool osActive = IsPathActive(SimComponent.HostDriver, SimComponent.OsInput);
        bool acpiActive = IsPathActive(SimComponent.HostDriver, SimComponent.AcpiBios);
        bool socActive = IsPathActive(SimComponent.HostDriver, SimComponent.SocController)
            || IsChannelActive(CommChannel.I2cRead)
            || IsChannelActive(CommChannel.I2cWrite)
            || IsChannelActive(CommChannel.ResetPin)
            || IsChannelActive(CommChannel.IntPin);

        double linkX = Math.Floor(drvRect.X + drvRect.Width * 0.5);
        DrawPixelBusBar(ctx, linkX, osRect.Bottom, linkX, drvRect.Y,
            osActive ? PixelArtHelper.PhosphorGreen : Color.Parse("#362E54"), "HID_EVT");

        double midY = Math.Floor(drvRect.Y + drvRect.Height * 0.5);
        DrawPixelBusBar(ctx, drvRect.Right, midY, acpiRect.X, midY,
            acpiActive ? PixelArtHelper.PixelLavender : Color.Parse("#362E54"), null);

        DrawPixelBusBar(ctx, linkX, drvRect.Bottom, linkX, socRect.Y,
            socActive ? PixelArtHelper.ElectricCyan : Color.Parse("#362E54"), "MMIO/IRQ");
    }

    private static void DrawPixelBusBar(DrawingContext ctx, double x1, double y1, double x2, double y2, Color col, string? label)
    {
        var brush = new SolidColorBrush(col);
        if (Math.Abs(x1 - x2) < 1)
        {
            ctx.FillRectangle(brush, new Rect(Math.Floor(x1) - 1, Math.Min(y1, y2), 3, Math.Abs(y2 - y1)));
            if (!string.IsNullOrEmpty(label))
            {
                ctx.DrawText(PixelArtHelper.CreatePixelText(label, 8.5, PixelArtHelper.MutedLavender, FontWeight.Bold),
                    new Point(x1 + 6, (y1 + y2) / 2 - 5));
            }
        }
        else
        {
            ctx.FillRectangle(brush, new Rect(Math.Min(x1, x2), Math.Floor(y1) - 1, Math.Abs(x2 - x1), 3));
        }
    }

    private void DrawPhysicalBus(DrawingContext ctx, double x1, double x2, double sclY, double sdaY, double intY, double rstY)
    {
        bool intLow = _session?.InterruptPin.CurrentState == PinState.Low;
        bool rstLow = _session?.ResetPin.CurrentState == PinState.Low;
        bool i2cActive = _animProgress < 1.0 && (IsChannelActive(CommChannel.I2cRead) || IsChannelActive(CommChannel.I2cWrite));

        double vddY = Math.Floor(Math.Max(22, sclY - 50));
        // VDD 1.8V rail
        ctx.FillRectangle(new SolidColorBrush(PixelArtHelper.RetroAmber), new Rect(x1 + 14, vddY, x2 - x1 - 28, 3));
        var vddTxt = PixelArtHelper.CreatePixelText("VDD +1.8V RAIL", 9, PixelArtHelper.RetroAmber, FontWeight.Bold);
        ctx.DrawText(vddTxt, new Point(Math.Floor((x1 + x2 - vddTxt.Width) / 2), vddY - 14));

        // Pixel zig-zag pull-up resistors
        double rx1 = Math.Floor(x1 + (x2 - x1) * 0.24);
        double rx2 = Math.Floor(x1 + (x2 - x1) * 0.50);
        double rx3 = Math.Floor(x1 + (x2 - x1) * 0.78);
        DrawPixelResistor(ctx, rx1, vddY, sclY, "2.2K");
        DrawPixelResistor(ctx, rx2, vddY, sdaY, "2.2K");
        DrawPixelResistor(ctx, rx3, vddY, intY, "10K");

        DrawPcbTrace(ctx, x1, x2, sclY, i2cActive ? PixelArtHelper.ElectricCyan : Color.Parse("#155A6B"),
            "SCL 400KHz ->", true, false, PixelArtHelper.ElectricCyan);

        DrawPcbTrace(ctx, x1, x2, sdaY, i2cActive ? PixelArtHelper.PhosphorGreen : Color.Parse("#195729"),
            "<- SDA DATA ->", true, true, PixelArtHelper.PhosphorGreen);

        DrawPcbTrace(ctx, x1, x2, intY, intLow ? PixelArtHelper.ArcadeMagenta : Color.Parse("#4D2337"),
            intLow ? "<- INT# [0V IRQ!]" : "<- INT# [1.8V HI]", false, true,
            intLow ? PixelArtHelper.ArcadeMagenta : PixelArtHelper.MutedLavender, hot: intLow);

        DrawPcbTrace(ctx, x1, x2, rstY, rstLow ? PixelArtHelper.RetroOrange : Color.Parse("#4F3219"),
            rstLow ? "RST# [0V LOW!] ->" : "RST# [HIGH] ->", true, false,
            rstLow ? PixelArtHelper.RetroOrange : PixelArtHelper.MutedLavender, hot: rstLow);
    }

    private static void DrawPixelResistor(DrawingContext ctx, double x, double vddY, double wireY, string label)
    {
        var wireBrush = new SolidColorBrush(Color.Parse("#74689E"));
        double bodyTop = vddY + 8;
        ctx.FillRectangle(wireBrush, new Rect(x, vddY + 3, 2, 5));

        // Stepped zig-zag resistor in 2px pixel blocks
        int[] offsets = { 0, -4, 4, -4, 4, 0 };
        double py = bodyTop;
        for (int i = 0; i < offsets.Length; i++)
        {
            ctx.FillRectangle(new SolidColorBrush(PixelArtHelper.RetroAmber), new Rect(x + offsets[i] - 1, py, 4, 2));
            py += 2;
        }
        ctx.FillRectangle(wireBrush, new Rect(x, py, 2, Math.Max(2, wireY - py)));
        // Solder dot on bus wire
        ctx.FillRectangle(new SolidColorBrush(PixelArtHelper.RetroAmber), new Rect(x - 2, wireY - 2, 6, 6));
        ctx.DrawText(PixelArtHelper.CreatePixelText(label, 8, PixelArtHelper.MutedLavender), new Point(x + 7, bodyTop + 1));
    }

    private static void DrawPcbTrace(
        DrawingContext ctx,
        double x1,
        double x2,
        double y,
        Color traceCol,
        string label,
        bool arrowRight,
        bool arrowLeft,
        Color badgeCol,
        bool hot = false)
    {
        var traceBrush = new SolidColorBrush(traceCol);
        ctx.FillRectangle(traceBrush, new Rect(x1, y - 1, x2 - x1, 3));

        // Square gold solder pads at ends
        DrawSolderPad(ctx, x1 + 2, y);
        DrawSolderPad(ctx, x2 - 2, y);

        if (arrowRight) DrawPixelArrow(ctx, x2 - 10, y, true, traceCol);
        if (arrowLeft) DrawPixelArrow(ctx, x1 + 10, y, false, traceCol);

        var txt = PixelArtHelper.CreatePixelText(label, 9, hot ? PixelArtHelper.CreamWhite : badgeCol, FontWeight.Bold);
        double tagW = Math.Floor(txt.Width + 10);
        double tagX = Math.Floor((x1 + x2 - tagW) / 2);
        double tagY = y - 16;

        ctx.FillRectangle(new SolidColorBrush(PixelArtHelper.HardShadow), new Rect(tagX + 2, tagY + 2, tagW, 14));
        ctx.FillRectangle(new SolidColorBrush(hot ? traceCol : PixelArtHelper.ScreenBg), new Rect(tagX, tagY, tagW, 14));
        ctx.DrawRectangle(null, new Pen(new SolidColorBrush(traceCol), 1), new Rect(tagX + 0.5, tagY + 0.5, tagW - 1, 13));
        ctx.DrawText(txt, new Point(tagX + 5, tagY + 2));
    }

    private static void DrawSolderPad(DrawingContext ctx, double x, double y)
    {
        ctx.FillRectangle(new SolidColorBrush(PixelArtHelper.RetroAmber), new Rect(x - 3, y - 3, 6, 6));
        ctx.FillRectangle(new SolidColorBrush(PixelArtHelper.ScreenBg), new Rect(x - 1, y - 1, 2, 2));
    }

    private static void DrawPixelArrow(DrawingContext ctx, double tipX, double y, bool right, Color col)
    {
        var b = new SolidColorBrush(col);
        int dir = right ? -1 : 1;
        ctx.FillRectangle(b, new Rect(tipX, y - 1, 2, 3));
        ctx.FillRectangle(b, new Rect(tipX + dir * 2, y - 3, 2, 7));
        ctx.FillRectangle(b, new Rect(tipX + dir * 4, y - 5, 2, 11));
    }

    private void DrawOsInputBox(DrawingContext ctx, Rect rect)
    {
        bool active = IsComponentActive(SimComponent.OsInput);
        PixelArtHelper.DrawPixelPanel(ctx, rect, PixelArtHelper.PanelBg, Color.Parse("#3D325E"),
            "OS INPUT SUBSYSTEM", null, PixelArtHelper.PhosphorGreen, active);

        PixelArtHelper.DrawPixelSprite(ctx, rect.Right - 24, rect.Y + 28, 2, CursorSprite, PixelArtHelper.PhosphorGreen, PixelArtHelper.CreamWhite);

        var rpt = _session?.HostDriver.LastReceivedReport;
        string l1 = rpt != null
            ? $"XY:({rpt.X},{rpt.Y}) FINGERS:{rpt.ContactCount} {(rpt.TipSwitch ? "[DOWN]" : "[UP]")}"
            : "STATUS: WAITING FOR HID INPUT REPORT...";
        string l2 = rpt != null
            ? $"BTN:[{(rpt.LeftButton ? "L" : "-")}{(rpt.RightButton ? "R" : "-")}] PRESSURE:{rpt.Pressure}/63"
            : "OS DECODES X/Y/BTN FROM HOST DRIVER ISR";

        ctx.DrawText(PixelArtHelper.CreatePixelText(l1, 10, rpt != null ? PixelArtHelper.PhosphorGreen : PixelArtHelper.MutedLavender, FontWeight.Bold),
            new Point(rect.X + 10, rect.Y + 30));
        ctx.DrawText(PixelArtHelper.CreatePixelText(l2, 9.5, PixelArtHelper.CreamWhite),
            new Point(rect.X + 10, rect.Y + 46));
    }

    private void DrawHostDriverBox(DrawingContext ctx, Rect rect)
    {
        bool active = IsComponentActive(SimComponent.HostDriver);
        PixelArtHelper.DrawPixelPanel(ctx, rect, PixelArtHelper.PanelBg, Color.Parse("#3D325E"),
            "HOST DRIVER (HIDI2C)", null, PixelArtHelper.ElectricCyan, active);

        PixelArtHelper.DrawPixelSprite(ctx, rect.Right - 24, rect.Y + 28, 2, ChipSprite, PixelArtHelper.ElectricCyan, PixelArtHelper.PanelHeaderBg);

        var drv = _session?.HostDriver;
        string st = drv?.IsEnumerated == true ? "[READY: ISR ARMED]" :
                    drv?.IsAcpiDiscovered == true ? "[BOOTING...]" : "[UNINITIALIZED]";
        Color stCol = drv?.IsEnumerated == true ? PixelArtHelper.PhosphorGreen :
                      drv?.IsAcpiDiscovered == true ? PixelArtHelper.RetroAmber : PixelArtHelper.MutedLavender;

        double y = rect.Y + 30;
        ctx.DrawText(PixelArtHelper.CreatePixelText(st, 9.5, stCol, FontWeight.Bold), new Point(rect.X + 10, y));
        y += 17;

        if (drv?.DeviceDescriptor != null)
        {
            var d = drv.DeviceDescriptor;
            ctx.DrawText(PixelArtHelper.CreatePixelText($"VID:0x{d.VendorId:X4} PID:0x{d.ProductId:X4}", 9, PixelArtHelper.CreamWhite), new Point(rect.X + 10, y));
            y += 15;
            ctx.DrawText(PixelArtHelper.CreatePixelText($"IN:0x{d.InputRegister:X4} CMD:0x{d.CommandRegister:X4}", 9, PixelArtHelper.MutedLavender), new Point(rect.X + 10, y));
            y += 15;
            ctx.DrawText(PixelArtHelper.CreatePixelText($"RPT:0x{d.ReportDescRegister:X4} ({d.ReportDescLength}B)", 9, PixelArtHelper.MutedLavender), new Point(rect.X + 10, y));
        }
        else
        {
            ctx.DrawText(PixelArtHelper.CreatePixelText("1. QUERY ACPI _DSM", 9, PixelArtHelper.MutedLavender), new Point(rect.X + 10, y));
            y += 15;
            ctx.DrawText(PixelArtHelper.CreatePixelText("2. READ 30B HID DESC", 9, PixelArtHelper.MutedLavender), new Point(rect.X + 10, y));
            y += 15;
            ctx.DrawText(PixelArtHelper.CreatePixelText("3. RESET + PWR ON", 9, PixelArtHelper.MutedLavender), new Point(rect.X + 10, y));
        }
    }

    private void DrawAcpiBiosBox(DrawingContext ctx, Rect rect)
    {
        bool active = IsComponentActive(SimComponent.AcpiBios);
        PixelArtHelper.DrawPixelPanel(ctx, rect, PixelArtHelper.PanelBg, Color.Parse("#3D325E"),
            "BIOS / ACPI", null, PixelArtHelper.PixelLavender, active);

        PixelArtHelper.DrawPixelSprite(ctx, rect.Right - 22, rect.Y + 28, 2, RomSprite, PixelArtHelper.PixelLavender, PixelArtHelper.PanelHeaderBg);

        double y = rect.Y + 30;
        ctx.DrawText(PixelArtHelper.CreatePixelText("_HID: PNP0C50", 9, PixelArtHelper.CreamWhite, FontWeight.Bold), new Point(rect.X + 8, y));
        y += 16;
        ctx.DrawText(PixelArtHelper.CreatePixelText("_CRS: 0x20 400K", 9, PixelArtHelper.MutedLavender), new Point(rect.X + 8, y));
        y += 15;
        ctx.DrawText(PixelArtHelper.CreatePixelText("      GPIO14 INT#", 9, PixelArtHelper.MutedLavender), new Point(rect.X + 8, y));
        y += 16;
        ctx.DrawText(PixelArtHelper.CreatePixelText("_DSM->0x0001", 9, PixelArtHelper.PixelLavender, FontWeight.Bold), new Point(rect.X + 8, y));
    }

    private void DrawSocControllerBox(DrawingContext ctx, Rect rect)
    {
        bool active = IsComponentActive(SimComponent.SocController);
        PixelArtHelper.DrawPixelPanel(ctx, rect, PixelArtHelper.PanelBg, Color.Parse("#3D325E"),
            "HOST SoC CONTROLLERS", null, PixelArtHelper.ElectricCyan, active);

        double y = rect.Y + 30;
        ctx.DrawText(PixelArtHelper.CreatePixelText("I2C1 MASTER: 400kHz (\\_SB.PCI0.I2C1)", 9, PixelArtHelper.CreamWhite), new Point(rect.X + 10, y));
        y += 16;
        bool intLow = _session?.InterruptPin.CurrentState == PinState.Low;
        PixelArtHelper.DrawPixelLed(ctx, rect.X + 10, y + 1, 8, PixelArtHelper.ArcadeMagenta, intLow);
        ctx.DrawText(PixelArtHelper.CreatePixelText(
            intLow ? "GPIO14 INT#: LOW -> IRQ TRIGGERED!" : "GPIO14 INT#: HIGH (IDLE)",
            9, intLow ? PixelArtHelper.ArcadeMagenta : PixelArtHelper.MutedLavender, FontWeight.Bold),
            new Point(rect.X + 22, y));
        y += 16;
        ctx.DrawText(PixelArtHelper.CreatePixelText("GPIO15 RST#: PUSH-PULL OUT", 9, PixelArtHelper.MutedLavender), new Point(rect.X + 10, y));
    }

    private void DrawSlaveDeviceBox(DrawingContext ctx, Rect rect)
    {
        bool active = IsComponentActive(SimComponent.HidDevice);
        var dev = _session?.TouchpadDevice;
        PixelArtHelper.DrawPixelPanel(ctx, rect, PixelArtHelper.PanelBg, Color.Parse("#3D325E"),
            $"SLAVE IC 0x{dev?.I2CAddress ?? 0x20:X2} (TOUCHPAD)", null, PixelArtHelper.RetroAmber, active);

        if (dev == null) return;

        PixelArtHelper.DrawPixelSprite(ctx, rect.Right - 24, rect.Y + 29, 2, PadSprite, PixelArtHelper.RetroAmber, PixelArtHelper.ElectricCyan);

        double y = rect.Y + 30;
        bool isOn = dev.PowerState == HidPowerState.On;
        PixelArtHelper.DrawPixelLed(ctx, rect.X + 10, y + 3, 10, PixelArtHelper.PhosphorGreen, isOn);
        ctx.DrawText(PixelArtHelper.CreatePixelText(
            $"PWR:{(isOn ? "ON" : "SLEEP")}  MODE:{(dev.DeviceMode == 1 ? "PTP" : "MOUSE")}  HAP:{dev.HapticClickIntensity}%",
            9.5, isOn ? PixelArtHelper.PhosphorGreen : PixelArtHelper.MutedLavender, FontWeight.Bold),
            new Point(rect.X + 24, y + 2));

        y += 22;
        ctx.DrawText(PixelArtHelper.CreatePixelText("REGISTERS (16-BIT SUB-ADDR)", 9, PixelArtHelper.MutedLavender, FontWeight.Bold),
            new Point(rect.X + 10, y));
        y += 14;

        var regs = new (ushort Addr, string Name, string Desc)[]
        {
            (HidI2cDevice.RegHidDesc, "HID_DESC", "30B"),
            (HidI2cDevice.RegReportDesc, "RPT_DESC", "134B"),
            (HidI2cDevice.RegInput, "INPUT", "FIFO"),
            (HidI2cDevice.RegOutput, "OUTPUT", "OUT"),
            (HidI2cDevice.RegCommand, "COMMAND", "CMD"),
            (HidI2cDevice.RegData, "DATA", "DATA")
        };

        double cellW = Math.Floor((rect.Width - 26) / 2.0);
        double cellH = 30;
        for (int i = 0; i < regs.Length; i++)
        {
            int col = i % 2;
            int row = i / 2;
            double cx = Math.Floor(rect.X + 10 + col * (cellW + 6));
            double cy = Math.Floor(y + row * (cellH + 5));

            var r = regs[i];
            bool hit = dev.LastAccessedRegister == r.Addr;
            Color accent = dev.LastAccessWasWrite ? PixelArtHelper.RetroAmber : PixelArtHelper.ElectricCyan;

            PixelArtHelper.DrawPixelWell(ctx, new Rect(cx, cy, cellW, cellH),
                hit ? Color.FromArgb(255, (byte)(accent.R / 5), (byte)(accent.G / 5), (byte)(accent.B / 5)) : PixelArtHelper.ScreenBg,
                hit ? accent : PixelArtHelper.BevelLight);

            ctx.DrawText(PixelArtHelper.CreatePixelText($"0x{r.Addr:X4} {r.Name}", 9, hit ? PixelArtHelper.CreamWhite : PixelArtHelper.MutedLavender, FontWeight.Bold),
                new Point(cx + 5, cy + 3));
            ctx.DrawText(PixelArtHelper.CreatePixelText(hit ? $"{(dev.LastAccessWasWrite ? "[WR]" : "[RD]")} {r.Desc}" : r.Desc, 8.5, hit ? accent : PixelArtHelper.MutedLavender),
                new Point(cx + 5, cy + 16));
        }

        y += 3 * (cellH + 5) + 8;
        int fifoCount = dev.InputQueueCount;
        ctx.DrawText(PixelArtHelper.CreatePixelText($"INPUT FIFO [{fifoCount} PKT]", 9, PixelArtHelper.MutedLavender, FontWeight.Bold),
            new Point(rect.X + 10, y));
        y += 14;

        double slotW = Math.Floor(Math.Max(22, (rect.Width - 20 - 5 * 4) / 6.0));
        for (int s = 0; s < 6; s++)
        {
            double sx = rect.X + 10 + s * (slotW + 4);
            bool filled = s < fifoCount;
            PixelArtHelper.DrawPixelWell(ctx, new Rect(sx, y, slotW, 18),
                filled ? Color.Parse("#4D1027") : PixelArtHelper.ScreenBg,
                filled ? PixelArtHelper.ArcadeMagenta : null);
            if (filled)
                ctx.DrawText(PixelArtHelper.CreatePixelText("PKT", 8.5, PixelArtHelper.CreamWhite, FontWeight.Bold), new Point(sx + 4, y + 3));
        }

        double actY = Math.Floor(Math.Max(y + 24, rect.Bottom - 26));
        PixelArtHelper.DrawPixelWell(ctx, new Rect(rect.X + 10, actY, rect.Width - 20, 18), PixelArtHelper.ScreenBg);
        ctx.DrawText(PixelArtHelper.CreatePixelText(dev.LastDeviceAction, 8.5, PixelArtHelper.RetroAmber, FontWeight.Bold),
            new Point(rect.X + 15, actY + 3));
    }

    private void DrawActivePixelPacket(
        DrawingContext ctx,
        Rect osRect,
        Rect drvRect,
        Rect acpiRect,
        Rect socRect,
        double midX,
        double rightColX,
        double sdaY,
        double intY,
        double rstY)
    {
        if (_activeEvent == null || _animProgress >= 1.0) return;

        Point pStart;
        Point pEnd;
        Color pktColor;

        switch (_activeEvent.Channel)
        {
            case CommChannel.AcpiMethod:
                pStart = _activeEvent.From == SimComponent.AcpiBios
                    ? new Point(acpiRect.X, acpiRect.Y + acpiRect.Height * 0.5)
                    : new Point(drvRect.Right, drvRect.Y + drvRect.Height * 0.5);
                pEnd = _activeEvent.From == SimComponent.AcpiBios
                    ? new Point(drvRect.Right, drvRect.Y + drvRect.Height * 0.5)
                    : new Point(acpiRect.X, acpiRect.Y + acpiRect.Height * 0.5);
                pktColor = PixelArtHelper.PixelLavender;
                break;

            case CommChannel.HidInputReport:
                pStart = new Point(drvRect.X + drvRect.Width * 0.5, drvRect.Y);
                pEnd = new Point(osRect.X + drvRect.Width * 0.5, osRect.Bottom);
                pktColor = PixelArtHelper.PhosphorGreen;
                break;

            case CommChannel.IntPin:
                pStart = new Point(rightColX, intY);
                pEnd = new Point(midX, intY);
                pktColor = PixelArtHelper.ArcadeMagenta;
                break;

            case CommChannel.ResetPin:
                pStart = new Point(midX, rstY);
                pEnd = new Point(rightColX, rstY);
                pktColor = PixelArtHelper.RetroOrange;
                break;

            case CommChannel.I2cRead:
                pStart = _activeEvent.From == SimComponent.HidDevice ? new Point(rightColX, sdaY) : new Point(midX, sdaY);
                pEnd = _activeEvent.From == SimComponent.HidDevice ? new Point(midX, sdaY) : new Point(rightColX, sdaY);
                pktColor = PixelArtHelper.ElectricCyan;
                break;

            default:
                pStart = new Point(midX, sdaY);
                pEnd = new Point(rightColX, sdaY);
                pktColor = PixelArtHelper.PhosphorGreen;
                break;
        }

        double t = _animProgress;
        double cx = Math.Floor(pStart.X + (pEnd.X - pStart.X) * t);
        double cy = Math.Floor(pStart.Y + (pEnd.Y - pStart.Y) * t);

        // Trailing pixel dust squares
        for (int k = 1; k <= 3; k++)
        {
            double kt = Math.Max(0, t - k * 0.06);
            double tx = Math.Floor(pStart.X + (pEnd.X - pStart.X) * kt);
            double ty = Math.Floor(pStart.Y + (pEnd.Y - pStart.Y) * kt);
            int sz = 6 - k;
            ctx.FillRectangle(new SolidColorBrush(pktColor, 0.75 - k * 0.2), new Rect(tx - sz / 2.0, ty - sz / 2.0, sz, sz));
        }

        // 8x8 Pixel packet block
        ctx.FillRectangle(new SolidColorBrush(PixelArtHelper.HardShadow), new Rect(cx - 4, cy - 4, 10, 10));
        ctx.FillRectangle(new SolidColorBrush(pktColor), new Rect(cx - 5, cy - 5, 10, 10));
        ctx.FillRectangle(new SolidColorBrush(PixelArtHelper.CreamWhite), new Rect(cx - 3, cy - 3, 4, 4));

        string badge = _activeEvent.Title;
        if (badge.Length > 32) badge = badge[..32] + "..";
        var txt = PixelArtHelper.CreatePixelText(badge, 9.5, PixelArtHelper.CreamWhite, FontWeight.Bold);
        double bx = Math.Floor(Math.Clamp(cx - txt.Width / 2 - 6, 8, Bounds.Width - txt.Width - 20));
        double by = Math.Floor(Math.Max(6, cy - 26));
        ctx.FillRectangle(new SolidColorBrush(PixelArtHelper.HardShadow), new Rect(bx + 2, by + 2, txt.Width + 12, 16));
        ctx.FillRectangle(new SolidColorBrush(pktColor), new Rect(bx, by, txt.Width + 12, 16));
        ctx.DrawRectangle(null, new Pen(new SolidColorBrush(PixelArtHelper.CreamWhite), 1), new Rect(bx + 0.5, by + 0.5, txt.Width + 11, 15));
        ctx.DrawText(txt, new Point(bx + 6, by + 2));
    }

    private bool IsComponentActive(SimComponent comp) =>
        _activeEvent != null && _animProgress < 1.0 && (_activeEvent.From == comp || _activeEvent.To == comp);

    private bool IsPathActive(SimComponent a, SimComponent b) =>
        _activeEvent != null && _animProgress < 1.0 &&
        ((_activeEvent.From == a && _activeEvent.To == b) || (_activeEvent.From == b && _activeEvent.To == a));

    private bool IsChannelActive(CommChannel ch) =>
        _activeEvent != null && _animProgress < 1.0 && _activeEvent.Channel == ch;
}
