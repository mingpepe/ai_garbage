namespace TcpIpStack.Core.Common;

public enum PbufLayer
{
    Transport = 54,
    Ip = 34,
    Link = 14,
    Raw = 0
}

public enum PbufType
{
    Ram,
    Pool,
    Ref
}

/// <summary>
/// lwIP-style packet buffer supporting header prepending (headroom) and decapsulation slicing.
/// </summary>
public sealed class Pbuf
{
    private byte[] _buffer;
    private int _offset;
    private int _length;
    private readonly PbufPool? _pool;

    public int Id { get; }
    public PbufType Type { get; }
    public int Length => _length;
    public int Headroom => _offset;
    public int RefCount { get; private set; } = 1;
    public Pbuf? Next { get; set; }

    public int TotalLength
    {
        get
        {
            int total = _length;
            var cur = Next;
            while (cur != null) { total += cur._length; cur = cur.Next; }
            return total;
        }
    }

    public Span<byte> PayloadSpan => _buffer.AsSpan(_offset, _length);
    public ReadOnlySpan<byte> ReadOnlyPayload => _buffer.AsSpan(_offset, _length);

    internal Pbuf(int id, int payloadLength, int headroom, PbufType type, PbufPool? pool)
    {
        Id = id;
        Type = type;
        _pool = pool;
        _offset = headroom;
        _length = payloadLength;
        _buffer = new byte[headroom + payloadLength];
    }

    public static Pbuf Alloc(PbufLayer layer, int payloadLength, PbufType type = PbufType.Ram, PbufPool? pool = null)
    {
        int headroom = (int)layer;
        if (pool != null) return pool.Allocate(layer, payloadLength, type);
        return new Pbuf(Interlocked.Increment(ref PbufPool.GlobalId), payloadLength, headroom, type, null);
    }

    public static Pbuf FromBytes(ReadOnlySpan<byte> data, PbufLayer layer = PbufLayer.Raw, PbufPool? pool = null)
    {
        var p = Alloc(layer, data.Length, PbufType.Ram, pool);
        data.CopyTo(p.PayloadSpan);
        return p;
    }

    /// <summary>Moves payload pointer backward to prepend a lower-layer header (lwIP pbuf_add_header).</summary>
    public bool PrependHeader(int headerSize)
    {
        if (headerSize < 0) return false;
        if (_offset >= headerSize)
        {
            _offset -= headerSize;
            _length += headerSize;
            return true;
        }

        // Reallocate with extra headroom to avoid failing encapsulation
        int extraHeadroom = 64;
        var newBuf = new byte[extraHeadroom + headerSize + _length];
        _buffer.AsSpan(_offset, _length).CopyTo(newBuf.AsSpan(extraHeadroom + headerSize));
        _buffer = newBuf;
        _offset = extraHeadroom;
        _length += headerSize;
        return true;
    }

    /// <summary>Moves payload pointer forward to strip an outer header (lwIP pbuf_remove_header).</summary>
    public bool StripHeader(int headerSize)
    {
        if (headerSize < 0 || headerSize > _length) return false;
        _offset += headerSize;
        _length -= headerSize;
        return true;
    }

    public byte[] ToLinearArray()
    {
        if (Next == null) return _buffer.AsSpan(_offset, _length).ToArray();
        var result = new byte[TotalLength];
        int pos = 0;
        for (var cur = this; cur != null; cur = cur.Next)
        {
            cur.ReadOnlyPayload.CopyTo(result.AsSpan(pos));
            pos += cur._length;
        }
        return result;
    }

    public Pbuf Clone(PbufPool? pool = null)
    {
        var bytes = ToLinearArray();
        return FromBytes(bytes, PbufLayer.Transport, pool ?? _pool);
    }

    public void AddRef() => RefCount++;

    public void Free()
    {
        if (RefCount > 0) RefCount--;
        if (RefCount == 0) _pool?.Release(this);
    }
}

public sealed class PbufPool
{
    internal static int GlobalId;
    public int TotalAllocated { get; private set; }
    public int CurrentlyInUse { get; private set; }
    public int PeakInUse { get; private set; }
    public long TotalBytesAllocated { get; private set; }

    public Pbuf Allocate(PbufLayer layer, int payloadLength, PbufType type = PbufType.Pool)
    {
        TotalAllocated++;
        CurrentlyInUse++;
        if (CurrentlyInUse > PeakInUse) PeakInUse = CurrentlyInUse;
        TotalBytesAllocated += payloadLength + (int)layer;
        return new Pbuf(Interlocked.Increment(ref GlobalId), payloadLength, (int)layer, type, this);
    }

    internal void Release(Pbuf pbuf)
    {
        if (CurrentlyInUse > 0) CurrentlyInUse--;
    }

    public void Reset()
    {
        TotalAllocated = 0;
        CurrentlyInUse = 0;
        PeakInUse = 0;
        TotalBytesAllocated = 0;
    }
}
