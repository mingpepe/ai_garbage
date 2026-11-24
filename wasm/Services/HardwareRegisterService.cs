namespace WasmIde.Services;

public sealed record BusTransaction(
    long Seq,
    string Direction,
    byte Address,
    byte Data,
    ulong WasmStep,
    string Timestamp
);

public sealed record ConsoleEntry(
    long Seq,
    string Kind,
    string Message,
    ulong WasmStep,
    string Timestamp
);

public sealed record RegisterSlotInfo(
    byte Address,
    string Label,
    byte Value,
    long ReadCount,
    long WriteCount,
    bool ReadInLastStep,
    bool WrittenInLastStep
);

public sealed class HardwareRegisterService
{
    private readonly object _lock = new();
    private readonly byte[] _registers = new byte[256];
    private readonly long[] _readCounts = new long[256];
    private readonly long[] _writeCounts = new long[256];
    private readonly HashSet<byte> _stepReads = new();
    private readonly HashSet<byte> _stepWrites = new();
    private readonly List<BusTransaction> _busLog = new();
    private readonly List<ConsoleEntry> _consoleLog = new();
    private readonly System.Text.StringBuilder _stdoutLineBuf = new();

    private long _seqCounter;
    private long _consoleSeq;
    private ulong _currentWasmStep;

    private static readonly Dictionary<byte, string> WellKnownLabels = new()
    {
        [0x00] = "SYS_STATUS",
        [0x01] = "SYS_CTRL",
        [0x02] = "IRQ_MASK",
        [0x03] = "IRQ_FLAGS",
        [0x10] = "SENSOR_A",
        [0x11] = "ACTUATOR_B",
        [0x12] = "ADC_CH0",
        [0x13] = "ADC_CH1",
        [0x14] = "GPIO_IN",
        [0x18] = "GPIO_OUT",
        [0x19] = "LED_BANK",
        [0x20] = "UART_TX",
        [0x21] = "UART_HEX",
        [0x30] = "SCRATCH_0",
        [0x31] = "SCRATCH_1",
        [0x32] = "SCRATCH_2",
        [0x33] = "SCRATCH_3"
    };

    public HardwareRegisterService()
    {
        ResetDefaults();
    }

    public void SetCurrentStep(ulong step)
    {
        lock (_lock)
        {
            _currentWasmStep = step;
        }
    }

    public void BeginStepDelta()
    {
        lock (_lock)
        {
            _stepReads.Clear();
            _stepWrites.Clear();
        }
    }

    /// <summary>
    /// Host function injected into Wasm3: byte ReadRegister(byte address)
    /// </summary>
    public byte ReadRegister(byte address)
    {
        lock (_lock)
        {
            byte val = _registers[address];
            _readCounts[address]++;
            _stepReads.Add(address);
            AddBusLogLocked("READ", address, val);
            return val;
        }
    }

    /// <summary>
    /// Host function injected into Wasm3: void WriteRegister(byte address, byte data)
    /// </summary>
    public void WriteRegister(byte address, byte data)
    {
        lock (_lock)
        {
            _registers[address] = data;
            _writeCounts[address]++;
            _stepWrites.Add(address);
            AddBusLogLocked("WRITE", address, data);

            if (address == 0x20)
            {
                char ch = data >= 0x20 && data <= 0x7E ? (char)data : '.';
                if (data == '\n')
                {
                    FlushStdoutBufferLocked();
                }
                else
                {
                    _stdoutLineBuf.Append(ch);
                }
            }
            else if (address == 0x21)
            {
                AddConsoleLocked("UART_HEX", $"[REG 0x21 UART_HEX] 0x{data:X2} ({data})");
            }
        }
    }

    public void HandleWasmConsole(int kind, int arg0, string? text)
    {
        lock (_lock)
        {
            switch (kind)
            {
                case 1:
                    AddConsoleLocked("STDOUT", $"print_i32 => {arg0}");
                    break;
                case 2:
                    AddConsoleLocked("STDOUT", $"print_hex => 0x{arg0:X8}");
                    break;
                case 3:
                    if (arg0 == '\n')
                    {
                        FlushStdoutBufferLocked();
                    }
                    else
                    {
                        _stdoutLineBuf.Append((char)(arg0 & 0xFF));
                    }
                    break;
                case 4:
                case 5:
                    AddConsoleLocked("STDOUT", text ?? string.Empty);
                    break;
            }
        }
    }

    public void LogSystem(string kind, string message)
    {
        lock (_lock)
        {
            FlushStdoutBufferLocked();
            AddConsoleLocked(kind, message);
        }
    }

    public void HostSetRegister(byte address, byte data)
    {
        lock (_lock)
        {
            _registers[address] = data;
            AddBusLogLocked("HOST_SET", address, data);
        }
    }

    public void ResetDefaults()
    {
        lock (_lock)
        {
            Array.Clear(_registers);
            Array.Clear(_readCounts);
            Array.Clear(_writeCounts);
            _stepReads.Clear();
            _stepWrites.Clear();
            _busLog.Clear();
            _consoleLog.Clear();
            _stdoutLineBuf.Clear();

            // Seed default sensor/status registers so initial hardware demo works out-of-the-box
            _registers[0x00] = 0x01; // SYS_STATUS: READY
            _registers[0x10] = 0x2A; // SENSOR_A: 42
            _registers[0x12] = 0x7F; // ADC_CH0: 127
            _registers[0x13] = 0x15; // ADC_CH1: 21
            _registers[0x14] = 0xA5; // GPIO_IN: 0b10100101
        }
    }

    public void ClearRuntimeLogsOnly()
    {
        lock (_lock)
        {
            Array.Clear(_readCounts);
            Array.Clear(_writeCounts);
            _stepReads.Clear();
            _stepWrites.Clear();
            _busLog.Clear();
            _consoleLog.Clear();
            _stdoutLineBuf.Clear();
        }
    }

    public object GetStateSnapshot()
    {
        lock (_lock)
        {
            var slots = new List<RegisterSlotInfo>(256);
            for (int i = 0; i < 256; i++)
            {
                byte addr = (byte)i;
                WellKnownLabels.TryGetValue(addr, out string? label);
                slots.Add(new RegisterSlotInfo(
                    addr,
                    label ?? $"R{addr:X2}",
                    _registers[addr],
                    _readCounts[addr],
                    _writeCounts[addr],
                    _stepReads.Contains(addr),
                    _stepWrites.Contains(addr)
                ));
            }

            return new
            {
                registers = slots,
                busLog = _busLog.TakeLast(120).ToList(),
                consoleLog = _consoleLog.TakeLast(120).ToList(),
                pendingLine = _stdoutLineBuf.ToString()
            };
        }
    }

    private void AddBusLogLocked(string direction, byte address, byte data)
    {
        _seqCounter++;
        _busLog.Add(new BusTransaction(
            _seqCounter,
            direction,
            address,
            data,
            _currentWasmStep,
            DateTime.Now.ToString("HH:mm:ss.fff")
        ));
        if (_busLog.Count > 500) _busLog.RemoveAt(0);
    }

    private void AddConsoleLocked(string kind, string message)
    {
        _consoleSeq++;
        _consoleLog.Add(new ConsoleEntry(
            _consoleSeq,
            kind,
            message,
            _currentWasmStep,
            DateTime.Now.ToString("HH:mm:ss.fff")
        ));
        if (_consoleLog.Count > 500) _consoleLog.RemoveAt(0);
    }

    private void FlushStdoutBufferLocked()
    {
        if (_stdoutLineBuf.Length > 0)
        {
            AddConsoleLocked("STDOUT", _stdoutLineBuf.ToString());
            _stdoutLineBuf.Clear();
        }
    }
}
