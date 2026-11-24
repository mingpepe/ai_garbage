using System.Buffers.Binary;
using System.Net;

namespace TcpIpStack.Core.Common;

public enum LwipErr
{
    Ok = 0,
    Mem = -1,
    Buf = -2,
    Timeout = -3,
    Rte = -4,
    InProgress = -5,
    Val = -6,
    WouldBlock = -7,
    Use = -8,
    Already = -9,
    IsConn = -10,
    Conn = -11,
    If = -12,
    Abrt = -13,
    Rst = -14,
    Clsd = -15,
    Arg = -16
}

public readonly record struct MacAddress(byte B0, byte B1, byte B2, byte B3, byte B4, byte B5)
{
    public static readonly MacAddress Broadcast = new(0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF);
    public static readonly MacAddress Zero = new(0, 0, 0, 0, 0, 0);

    public bool IsBroadcast => this == Broadcast;
    public bool IsMulticast => (B0 & 0x01) != 0;
    public bool IsZero => this == Zero;

    public byte[] ToBytes() => [B0, B1, B2, B3, B4, B5];

    public void WriteTo(Span<byte> dst)
    {
        dst[0] = B0; dst[1] = B1; dst[2] = B2;
        dst[3] = B3; dst[4] = B4; dst[5] = B5;
    }

    public static MacAddress FromSpan(ReadOnlySpan<byte> src) =>
        new(src[0], src[1], src[2], src[3], src[4], src[5]);

    public static MacAddress Parse(string s)
    {
        var parts = s.Split(':', '-');
        if (parts.Length != 6) throw new FormatException($"Invalid MAC address: {s}");
        return new MacAddress(
            Convert.ToByte(parts[0], 16), Convert.ToByte(parts[1], 16), Convert.ToByte(parts[2], 16),
            Convert.ToByte(parts[3], 16), Convert.ToByte(parts[4], 16), Convert.ToByte(parts[5], 16));
    }

    public static MacAddress ForIpv4Multicast(Ip4Address ip) =>
        new(0x01, 0x00, 0x5E, (byte)(ip.B1 & 0x7F), ip.B2, ip.B3);

    public static MacAddress ForIpv6Multicast(Ip6Address ip)
    {
        var bytes = ip.ToBytes();
        return new MacAddress(0x33, 0x33, bytes[12], bytes[13], bytes[14], bytes[15]);
    }

    public override string ToString() => $"{B0:X2}:{B1:X2}:{B2:X2}:{B3:X2}:{B4:X2}:{B5:X2}";
}

public readonly record struct Ip4Address(uint Value)
{
    public static readonly Ip4Address Any = new(0);
    public static readonly Ip4Address Broadcast = new(0xFFFFFFFF);
    public static readonly Ip4Address Loopback = new(0x7F000001);

    public Ip4Address(byte b0, byte b1, byte b2, byte b3)
        : this(((uint)b0 << 24) | ((uint)b1 << 16) | ((uint)b2 << 8) | b3) { }

    public byte B0 => (byte)(Value >> 24);
    public byte B1 => (byte)(Value >> 16);
    public byte B2 => (byte)(Value >> 8);
    public byte B3 => (byte)Value;

    public bool IsAny => Value == 0;
    public bool IsBroadcast => Value == 0xFFFFFFFF;
    public bool IsLoopback => B0 == 127;
    public bool IsMulticast => (B0 & 0xF0) == 0xE0;
    public bool IsLinkLocal => B0 == 169 && B1 == 254;

    public bool InSameSubnet(Ip4Address other, Ip4Address netmask) =>
        (Value & netmask.Value) == (other.Value & netmask.Value);

    public bool IsSubnetBroadcast(Ip4Address subnet, Ip4Address netmask) =>
        IsBroadcast || (InSameSubnet(subnet, netmask) && (Value & ~netmask.Value) == ~netmask.Value);

    public byte[] ToBytes() => [B0, B1, B2, B3];

    public void WriteTo(Span<byte> dst) => BinaryPrimitives.WriteUInt32BigEndian(dst, Value);

    public static Ip4Address FromSpan(ReadOnlySpan<byte> src) =>
        new(BinaryPrimitives.ReadUInt32BigEndian(src));

    public static Ip4Address Parse(string s)
    {
        var parts = s.Trim().Split('.');
        if (parts.Length != 4) throw new FormatException($"Invalid IPv4 address: {s}");
        return new Ip4Address(byte.Parse(parts[0]), byte.Parse(parts[1]), byte.Parse(parts[2]), byte.Parse(parts[3]));
    }

    public static bool TryParse(string s, out Ip4Address addr)
    {
        addr = Any;
        var parts = s.Trim().Split('.');
        if (parts.Length != 4) return false;
        if (!byte.TryParse(parts[0], out var b0) || !byte.TryParse(parts[1], out var b1) ||
            !byte.TryParse(parts[2], out var b2) || !byte.TryParse(parts[3], out var b3))
            return false;
        addr = new Ip4Address(b0, b1, b2, b3);
        return true;
    }

    public override string ToString() => $"{B0}.{B1}.{B2}.{B3}";
}

public readonly struct Ip6Address : IEquatable<Ip6Address>
{
    public readonly ulong High;
    public readonly ulong Low;

    public static readonly Ip6Address Any = new(0, 0);
    public static readonly Ip6Address Loopback = new(0, 1);
    public static readonly Ip6Address AllNodesMulticast = Parse("ff02::1");
    public static readonly Ip6Address AllRoutersMulticast = Parse("ff02::2");

    public Ip6Address(ulong high, ulong low)
    {
        High = high;
        Low = low;
    }

    public bool IsAny => High == 0 && Low == 0;
    public bool IsLoopback => High == 0 && Low == 1;
    public bool IsMulticast => (High >> 56) == 0xFF;
    public bool IsLinkLocal => (High >> 48) == 0xFE80;

    public byte[] ToBytes()
    {
        var buf = new byte[16];
        BinaryPrimitives.WriteUInt64BigEndian(buf.AsSpan(0, 8), High);
        BinaryPrimitives.WriteUInt64BigEndian(buf.AsSpan(8, 8), Low);
        return buf;
    }

    public void WriteTo(Span<byte> dst)
    {
        BinaryPrimitives.WriteUInt64BigEndian(dst[..8], High);
        BinaryPrimitives.WriteUInt64BigEndian(dst.Slice(8, 8), Low);
    }

    public static Ip6Address FromSpan(ReadOnlySpan<byte> src) =>
        new(BinaryPrimitives.ReadUInt64BigEndian(src[..8]), BinaryPrimitives.ReadUInt64BigEndian(src.Slice(8, 8)));

    public static Ip6Address SolicitedNodeMulticast(Ip6Address target)
    {
        var b = target.ToBytes();
        byte[] sn = [0xFF, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0xFF, b[13], b[14], b[15]];
        return FromSpan(sn);
    }

    public static Ip6Address Parse(string s)
    {
        var ip = IPAddress.Parse(s.Trim());
        var bytes = ip.GetAddressBytes();
        if (bytes.Length != 16) throw new FormatException($"Not IPv6: {s}");
        return FromSpan(bytes);
    }

    public static bool TryParse(string s, out Ip6Address addr)
    {
        addr = Any;
        if (!IPAddress.TryParse(s.Trim(), out var ip)) return false;
        var bytes = ip.GetAddressBytes();
        if (bytes.Length != 16) return false;
        addr = FromSpan(bytes);
        return true;
    }

    public bool Equals(Ip6Address other) => High == other.High && Low == other.Low;
    public override bool Equals(object? obj) => obj is Ip6Address o && Equals(o);
    public override int GetHashCode() => HashCode.Combine(High, Low);
    public static bool operator ==(Ip6Address a, Ip6Address b) => a.Equals(b);
    public static bool operator !=(Ip6Address a, Ip6Address b) => !a.Equals(b);
    public override string ToString() => new IPAddress(ToBytes()).ToString();
}

public readonly record struct IpAddress
{
    public bool IsV6 { get; }
    public Ip4Address V4 { get; }
    public Ip6Address V6 { get; }

    public IpAddress(Ip4Address v4) { IsV6 = false; V4 = v4; V6 = Ip6Address.Any; }
    public IpAddress(Ip6Address v6) { IsV6 = true; V4 = Ip4Address.Any; V6 = v6; }

    public static IpAddress AnyV4 => new(Ip4Address.Any);
    public static IpAddress AnyV6 => new(Ip6Address.Any);

    public bool IsAny => IsV6 ? V6.IsAny : V4.IsAny;
    public bool IsLoopback => IsV6 ? V6.IsLoopback : V4.IsLoopback;

    public static IpAddress Parse(string s)
    {
        if (Ip4Address.TryParse(s, out var v4)) return new IpAddress(v4);
        if (Ip6Address.TryParse(s, out var v6)) return new IpAddress(v6);
        throw new FormatException($"Invalid IP address: {s}");
    }

    public static bool TryParse(string s, out IpAddress addr)
    {
        if (Ip4Address.TryParse(s, out var v4)) { addr = new IpAddress(v4); return true; }
        if (Ip6Address.TryParse(s, out var v6)) { addr = new IpAddress(v6); return true; }
        addr = AnyV4;
        return false;
    }

    public override string ToString() => IsV6 ? V6.ToString() : V4.ToString();
}

public static class Checksum
{
    /// <summary>RFC 1071 one's complement internet checksum.</summary>
    public static ushort Compute(ReadOnlySpan<byte> data)
    {
        uint sum = Accumulate(0, data);
        return Fold(sum);
    }

    public static uint Accumulate(uint sum, ReadOnlySpan<byte> data)
    {
        int i = 0;
        while (i + 1 < data.Length)
        {
            sum += (uint)((data[i] << 8) | data[i + 1]);
            i += 2;
        }
        if (i < data.Length)
        {
            sum += (uint)(data[i] << 8);
        }
        return sum;
    }

    public static ushort Fold(uint sum)
    {
        while ((sum >> 16) != 0)
        {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }
        return (ushort)(~sum & 0xFFFF);
    }

    public static ushort ComputePseudoIpv4(Ip4Address src, Ip4Address dst, byte protocol, ReadOnlySpan<byte> payload)
    {
        Span<byte> pseudo = stackalloc byte[12];
        src.WriteTo(pseudo[..4]);
        dst.WriteTo(pseudo.Slice(4, 4));
        pseudo[8] = 0;
        pseudo[9] = protocol;
        BinaryPrimitives.WriteUInt16BigEndian(pseudo.Slice(10, 2), (ushort)payload.Length);

        uint sum = Accumulate(0, pseudo);
        sum = Accumulate(sum, payload);
        return Fold(sum);
    }

    public static ushort ComputePseudoIpv6(Ip6Address src, Ip6Address dst, byte nextHeader, ReadOnlySpan<byte> payload)
    {
        Span<byte> pseudo = stackalloc byte[40];
        src.WriteTo(pseudo[..16]);
        dst.WriteTo(pseudo.Slice(16, 16));
        BinaryPrimitives.WriteUInt32BigEndian(pseudo.Slice(32, 4), (uint)payload.Length);
        pseudo[36] = 0; pseudo[37] = 0; pseudo[38] = 0;
        pseudo[39] = nextHeader;

        uint sum = Accumulate(0, pseudo);
        sum = Accumulate(sum, payload);
        return Fold(sum);
    }
}

public static class ProtocolNumbers
{
    public const ushort EtherTypeIpv4 = 0x0800;
    public const ushort EtherTypeArp = 0x0806;
    public const ushort EtherTypeIpv6 = 0x86DD;

    public const byte IpProtoIcmp = 1;
    public const byte IpProtoIgmp = 2;
    public const byte IpProtoTcp = 6;
    public const byte IpProtoUdp = 17;
    public const byte IpProtoIcmpv6 = 58;
}
