using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows.Input;
using Avalonia.Media;
using Avalonia.Threading;
using McuBusWpf.Core;

namespace McuBusWpf.ViewModels;

public sealed class SignalPoint
{
    public int Cycle { get; set; }
    public string BusWinner { get; set; } = "IDLE";
    public uint BusAddr { get; set; }
    public bool BusWrite { get; set; }
    public byte BusData { get; set; }
    public string DmaState { get; set; } = "IDLE";
    public uint DmaCndtr { get; set; }
    public byte DmaLatch { get; set; }
    public bool UartDreq { get; set; }
    public bool I2cDreq { get; set; }
    public bool DmaIrq { get; set; }
    public int UartFifoCnt { get; set; }
    public int I2cFifoCnt { get; set; }
    public byte I2cShiftByte { get; set; }
    public string CpuState { get; set; } = "Running";
    public string Description { get; set; } = string.Empty;
}

public sealed class RelayCommand : ICommand
{
    private readonly Action<object?> execute;
    private readonly Predicate<object?>? canExecute;

    public RelayCommand(Action<object?> execute, Predicate<object?>? canExecute = null)
    {
        this.execute = execute ?? throw new ArgumentNullException(nameof(execute));
        this.canExecute = canExecute;
    }

    public RelayCommand(Action execute) : this(_ => execute(), null) { }

    public bool CanExecute(object? parameter) => canExecute?.Invoke(parameter) ?? true;
    public void Execute(object? parameter) => execute(parameter);
    public event EventHandler? CanExecuteChanged;
    public void RaiseCanExecuteChanged() => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}

public sealed class MainViewModel : INotifyPropertyChanged
{
    private readonly McuSystem sys = new();
    private readonly DispatcherTimer timer = new();

    public event PropertyChangedEventHandler? PropertyChanged;
    private void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));

    public ObservableCollection<string> Logs { get; } = new();
    public ObservableCollection<SignalPoint> SignalHistory { get; } = new();

    public ICommand StepCycleCommand { get; }
    public ICommand StepTransferCommand { get; }
    public ICommand ToggleRunCommand { get; }
    public ICommand ResetCommand { get; }
    public ICommand InjectUartByteCommand { get; }
    public ICommand SetupP2PCommand { get; }
    public ICommand SetupP2MCommand { get; }

    private bool isRunning;
    public bool IsRunning
    {
        get => isRunning;
        set
        {
            if (isRunning != value)
            {
                isRunning = value;
                OnPropertyChanged();
                OnPropertyChanged(nameof(RunButtonText));
                if (isRunning) timer.Start();
                else timer.Stop();
            }
        }
    }

    public string RunButtonText => IsRunning ? "⏸ Pause" : "▶ Run";

    private double clockSpeedHz = 4.0;
    public double ClockSpeedHz
    {
        get => clockSpeedHz;
        set
        {
            clockSpeedHz = Math.Clamp(value, 0.5, 50.0);
            timer.Interval = TimeSpan.FromMilliseconds(1000.0 / clockSpeedHz);
            OnPropertyChanged();
        }
    }

    private string injectByteHex = "5A";
    public string InjectByteHex
    {
        get => injectByteHex;
        set { injectByteHex = value; OnPropertyChanged(); }
    }

    /* Properties bound to UI */
    public int Cycle => sys.Cycle;
    public string DmaStateStr => sys.Dma.State.ToString();
    public uint DmaCndtr => sys.Dma.CNDTR;
    public string DmaCcrHex => $"0x{sys.Dma.CCR:X4}";
    public string DmaCparHex => $"0x{sys.Dma.CPAR:X8}";
    public string DmaCmarHex => $"0x{sys.Dma.CMAR:X8}";
    public string DmaDataLatchHex => $"0x{sys.Dma.DataLatch:X2}";
    public bool DmaRxReq => sys.Dma.RxReqLine;
    public bool DmaTxReq => sys.Dma.TxReqLine;
    public bool DmaIrqLine => sys.Dma.IrqLine;
    public IBrush DmaRxReqBrush => sys.Dma.RxReqLine ? SolidColorBrush.Parse("#10B981") : SolidColorBrush.Parse("#475569");
    public IBrush DmaTxReqBrush => sys.Dma.TxReqLine ? SolidColorBrush.Parse("#3B82F6") : SolidColorBrush.Parse("#475569");
    public IBrush DmaIrqBrush => sys.Dma.IrqLine ? SolidColorBrush.Parse("#EF4444") : SolidColorBrush.Parse("#475569");
    public uint DmaTotalTransferred => sys.Dma.TotalTransferred;
    public uint DmaBusStalls => sys.Dma.BusStalls;
    public string DmaEventMsg => sys.Dma.LastEventMsg;

    public string BusWinner => sys.Bus.LastTransaction.Active ? sys.Bus.LastTransaction.GrantedMaster.ToString().ToUpperInvariant() : "IDLE";
    public IBrush BusWinnerBrush => sys.Bus.LastTransaction.GrantedMaster switch
    {
        BusMaster.Dma => SolidColorBrush.Parse("#10B981"),
        BusMaster.Cpu => SolidColorBrush.Parse("#3B82F6"),
        _ => SolidColorBrush.Parse("#6B7280")
    };
    public string BusAddrHex => $"0x{sys.Bus.LastTransaction.Addr:X8}";
    public string BusDataHex => $"0x{(sys.Bus.LastTransaction.IsWrite ? sys.Bus.LastTransaction.WData : sys.Bus.LastTransaction.RData):X2}";
    public string BusIsWriteStr => sys.Bus.LastTransaction.Active ? (sys.Bus.LastTransaction.IsWrite ? "WRITE" : "READ") : "-";
    public string BusDescription => sys.Bus.LastTransaction.Description;
    public uint BusContentions => sys.Bus.BusContentions;
    public uint BusDmaGrants => sys.Bus.DmaGrants;
    public uint BusCpuGrants => sys.Bus.CpuGrants;
    public uint BusIdleCycles => sys.Bus.IdleCycles;

    public int UartFifoCount => sys.Uart.FifoCount;
    public int UartFifoCapacity => sys.Uart.FifoCapacity;
    public string UartFifoDisplay => FormatBytes(sys.Uart.FifoSnapshot);
    public bool UartDmaReq => sys.Uart.DmaReqRx;
    public bool UartOverrun => (sys.Uart.SR & Uart.SrOre) != 0;

    public int I2cFifoCount => sys.I2c.FifoCount;
    public int I2cFifoCapacity => sys.I2c.FifoCapacity;
    public string I2cFifoDisplay => FormatBytes(sys.I2c.FifoSnapshot);
    public bool I2cDmaReq => sys.I2c.DmaReqTx;
    public bool I2cIsTransmitting => sys.I2c.IsTransmitting;
    public double I2cShiftProgress => sys.I2c.CyclesPerByte > 0 ? (sys.I2c.ShiftCounter * 100.0 / sys.I2c.CyclesPerByte) : 0;
    public string I2cShiftByteHex => $"0x{sys.I2c.ShiftByte:X2}";
    public string I2cLastWireHex => $"0x{sys.I2c.LastWireByte:X2}";
    public uint I2cTotalTransmitted => sys.I2c.TotalTransmitted;

    public string CpuStateStr => sys.Cpu.State.ToString();
    public string CpuCurrentOp => sys.Cpu.CurrentOp;
    public uint CpuBusStalls => sys.Cpu.BusStalls;
    public string NvicPendingHex => $"0x{sys.Nvic.ISPR:X2}";

    public string SramDump => FormatSram(sys.Sram.RawMemory, 32);

    public MainViewModel()
    {
        timer.Interval = TimeSpan.FromMilliseconds(250);
        timer.Tick += (s, e) => StepSingleCycle();

        sys.SystemLog += OnLog;

        StepCycleCommand = new RelayCommand(() => StepSingleCycle());
        StepTransferCommand = new RelayCommand(() => StepDmaTransfer());
        ToggleRunCommand = new RelayCommand(() => IsRunning = !IsRunning);
        ResetCommand = new RelayCommand(() => ResetDefault());
        InjectUartByteCommand = new RelayCommand(() => InjectUserByte());
        SetupP2PCommand = new RelayCommand(() => ConfigureP2P());
        SetupP2MCommand = new RelayCommand(() => ConfigureP2M());

        ResetDefault();
        // Run 14 initial cycles so the GTKWave waveform is immediately populated on launch
        for (int i = 0; i < 14; i++)
        {
            StepSingleCycle();
        }
    }

    private void OnLog(string message)
    {
        void AddEntry()
        {
            Logs.Insert(0, $"[Cyc {sys.Cycle:D3}] {message}");
            while (Logs.Count > 300) Logs.RemoveAt(Logs.Count - 1);
        }

        if (Dispatcher.UIThread.CheckAccess())
            AddEntry();
        else
            Dispatcher.UIThread.Post(AddEntry);
    }

    public void ResetDefault()
    {
        IsRunning = false;
        sys.Reset();
        Logs.Clear();
        SignalHistory.Clear();

        /* Default P2P configuration */
        ConfigureP2P();

        /* Schedule initial incoming UART test packets */
        sys.Uart.ScheduleReceive(2, 0x11);
        sys.Uart.ScheduleReceive(3, 0x22);
        sys.Uart.ScheduleReceive(4, 0x33);
        sys.Uart.ScheduleReceive(5, 0x44);
        sys.Uart.ScheduleReceive(6, 0x55);

        UpdateAllProperties();
        OnLog("[SETUP] Default UART->I2C P2P scenario initialized (5 bytes scheduled).");
    }

    public void ConfigureP2P()
    {
        sys.Dma.Configure(
            srcAddr: Uart.BaseAddress + Uart.RegDr,
            dstAddr: I2c.BaseAddress + I2c.RegDr,
            count: 5,
            dirMode: DmaController.CcrDirP2P,
            circ: false,
            pinc: false,
            minc: false,
            priority: 3
        );
        sys.Dma.Start();
        UpdateAllProperties();
    }

    public void ConfigureP2M()
    {
        sys.Dma.Configure(
            srcAddr: Uart.BaseAddress + Uart.RegDr,
            dstAddr: Sram.BaseAddress,
            count: 8,
            dirMode: DmaController.CcrDirP2M,
            circ: false,
            pinc: false,
            minc: true,
            priority: 3
        );
        sys.Dma.Start();
        UpdateAllProperties();
    }

    public void InjectUserByte()
    {
        try
        {
            byte val = Convert.ToByte(InjectByteHex.Trim().Replace("0x", ""), 16);
            sys.Uart.InjectRx(val);
            UpdateAllProperties();
        }
        catch
        {
            OnLog("[UI] Invalid Hex byte format. Please enter e.g. 5A or AA.");
        }
    }

    public void StepSingleCycle()
    {
        var trans = sys.Step();

        /* Record to signal waveform history */
        var pt = new SignalPoint
        {
            Cycle = sys.Cycle - 1,
            BusWinner = trans.Active ? trans.GrantedMaster.ToString().ToUpperInvariant() : "IDLE",
            BusAddr = trans.Active ? trans.Addr : 0,
            BusWrite = trans.Active && trans.IsWrite,
            BusData = (byte)(trans.Active ? (trans.IsWrite ? trans.WData : trans.RData) : 0),
            DmaState = sys.Dma.State.ToString(),
            DmaCndtr = sys.Dma.CNDTR,
            DmaLatch = sys.Dma.DataLatch,
            UartDreq = sys.Uart.DmaReqRx,
            I2cDreq = sys.I2c.DmaReqTx,
            DmaIrq = sys.Dma.IrqLine,
            UartFifoCnt = sys.Uart.FifoCount,
            I2cFifoCnt = sys.I2c.FifoCount,
            I2cShiftByte = sys.I2c.ShiftByte,
            CpuState = sys.Cpu.State.ToString(),
            Description = trans.Description
        };

        SignalHistory.Add(pt);
        while (SignalHistory.Count > 120) SignalHistory.RemoveAt(0);

        UpdateAllProperties();
    }

    public void StepDmaTransfer()
    {
        int maxCycles = 15;
        uint initialDone = sys.Dma.TotalTransferred;
        while (maxCycles-- > 0)
        {
            StepSingleCycle();
            if (sys.Dma.TotalTransferred > initialDone || sys.Dma.State == DmaState.Complete)
            {
                break;
            }
        }
    }

    private void UpdateAllProperties()
    {
        OnPropertyChanged(nameof(Cycle));
        OnPropertyChanged(nameof(DmaStateStr));
        OnPropertyChanged(nameof(DmaCndtr));
        OnPropertyChanged(nameof(DmaCcrHex));
        OnPropertyChanged(nameof(DmaCparHex));
        OnPropertyChanged(nameof(DmaCmarHex));
        OnPropertyChanged(nameof(DmaDataLatchHex));
        OnPropertyChanged(nameof(DmaRxReq));
        OnPropertyChanged(nameof(DmaTxReq));
        OnPropertyChanged(nameof(DmaIrqLine));
        OnPropertyChanged(nameof(DmaRxReqBrush));
        OnPropertyChanged(nameof(DmaTxReqBrush));
        OnPropertyChanged(nameof(DmaIrqBrush));
        OnPropertyChanged(nameof(DmaTotalTransferred));
        OnPropertyChanged(nameof(DmaBusStalls));
        OnPropertyChanged(nameof(DmaEventMsg));

        OnPropertyChanged(nameof(BusWinner));
        OnPropertyChanged(nameof(BusWinnerBrush));
        OnPropertyChanged(nameof(BusAddrHex));
        OnPropertyChanged(nameof(BusDataHex));
        OnPropertyChanged(nameof(BusIsWriteStr));
        OnPropertyChanged(nameof(BusDescription));
        OnPropertyChanged(nameof(BusContentions));
        OnPropertyChanged(nameof(BusDmaGrants));
        OnPropertyChanged(nameof(BusCpuGrants));
        OnPropertyChanged(nameof(BusIdleCycles));

        OnPropertyChanged(nameof(UartFifoCount));
        OnPropertyChanged(nameof(UartFifoCapacity));
        OnPropertyChanged(nameof(UartFifoDisplay));
        OnPropertyChanged(nameof(UartDmaReq));
        OnPropertyChanged(nameof(UartOverrun));

        OnPropertyChanged(nameof(I2cFifoCount));
        OnPropertyChanged(nameof(I2cFifoCapacity));
        OnPropertyChanged(nameof(I2cFifoDisplay));
        OnPropertyChanged(nameof(I2cDmaReq));
        OnPropertyChanged(nameof(I2cIsTransmitting));
        OnPropertyChanged(nameof(I2cShiftProgress));
        OnPropertyChanged(nameof(I2cShiftByteHex));
        OnPropertyChanged(nameof(I2cLastWireHex));
        OnPropertyChanged(nameof(I2cTotalTransmitted));

        OnPropertyChanged(nameof(CpuStateStr));
        OnPropertyChanged(nameof(CpuCurrentOp));
        OnPropertyChanged(nameof(CpuBusStalls));
        OnPropertyChanged(nameof(NvicPendingHex));
        OnPropertyChanged(nameof(SramDump));
    }

    private static string FormatBytes(IReadOnlyList<byte> bytes)
    {
        if (bytes.Count == 0) return "[ Empty ]";
        return string.Join("  ", bytes.Select(b => $"0x{b:X2}"));
    }

    private static string FormatSram(byte[] memory, int count)
    {
        var sb = new System.Text.StringBuilder();
        for (int i = 0; i < count; i += 8)
        {
            sb.Append($"0x{0x20000000U + (uint)i:X8}: ");
            for (int j = 0; j < 8 && (i + j) < count; j++)
            {
                sb.Append($"{memory[i + j]:X2} ");
            }
            sb.AppendLine();
        }
        return sb.ToString().TrimEnd();
    }
}
