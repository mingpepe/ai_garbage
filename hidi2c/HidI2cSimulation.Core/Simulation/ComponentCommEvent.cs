namespace HidI2cSimulation.Simulation;

public enum SimComponent
{
    OsInput,
    HostDriver,
    AcpiBios,
    SocController,
    PhysicalBus,
    HidDevice
}

public enum CommChannel
{
    AcpiMethod,
    DriverInternal,
    ResetPin,
    IntPin,
    I2cWrite,
    I2cRead,
    HidInputReport,
    DeviceInternal
}

public enum SimulationPhase
{
    Idle,
    AcpiDiscovery,
    HardwareReset,
    HidDescriptorRead,
    SoftReset,
    ReportDescriptorRead,
    SetPowerOn,
    TouchInterrupt,
    HostIsrRead,
    FeatureReport,
    SetPowerSleep
}

/// <summary>
/// Represents a single cross-component interaction for sequence/flow visualization.
/// </summary>
public sealed record ComponentCommEvent(
    int Sequence,
    long StartTimeNs,
    long EndTimeNs,
    SimComponent From,
    SimComponent To,
    CommChannel Channel,
    SimulationPhase Phase,
    string Title,
    string Detail,
    string? HexPayload = null,
    int? TransactionId = null
);
