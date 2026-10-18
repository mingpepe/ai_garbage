namespace McuBusWpf.Core;

public sealed class Sram
{
    public const uint BaseAddress = 0x20000000U;
    public const int Size = 256;
    private readonly byte[] memory = new byte[Size];

    public byte[] RawMemory => memory;

    public void Reset()
    {
        Array.Clear(memory, 0, memory.Length);
    }

    public uint Read(uint addr)
    {
        uint offset = addr - BaseAddress;
        if (offset < Size) return memory[offset];
        return 0;
    }

    public void Write(uint addr, uint data)
    {
        uint offset = addr - BaseAddress;
        if (offset < Size)
        {
            memory[offset] = (byte)(data & 0xFF);
        }
    }
}
