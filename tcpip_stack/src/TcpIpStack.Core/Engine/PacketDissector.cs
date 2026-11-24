using System.Buffers.Binary;
using System.Text;
using TcpIpStack.Core.Common;

namespace TcpIpStack.Core.Engine;

public static class PacketDissector
{
    public static string FormatHexDump(ReadOnlySpan<byte> data, int maxBytes = 512)
    {
        if (data.Length == 0) return "(0 bytes)";
        int len = Math.Min(data.Length, maxBytes);
        var sb = new StringBuilder();
        for (int i = 0; i < len; i += 16)
        {
            sb.Append($"{i:X4}  ");
            int lineLen = Math.Min(16, len - i);
            for (int j = 0; j < 16; j++)
            {
                if (j < lineLen) sb.Append($"{data[i + j]:X2} ");
                else sb.Append("   ");
                if (j == 7) sb.Append(' ');
            }
            sb.Append(" |");
            for (int j = 0; j < lineLen; j++)
            {
                byte b = data[i + j];
                sb.Append(b is >= 32 and <= 126 ? (char)b : '.');
            }
            sb.Append('|');
            if (i + 16 < len) sb.AppendLine();
        }
        if (data.Length > maxBytes)
            sb.AppendLine().Append($"... ({data.Length - maxBytes} more bytes)");
        return sb.ToString();
    }

    public static string FormatAsciiPreview(ReadOnlySpan<byte> data, int maxChars = 160)
    {
        if (data.Length == 0) return "";
        int len = Math.Min(data.Length, maxChars);
        var sb = new StringBuilder(len);
        for (int i = 0; i < len; i++)
        {
            byte b = data[i];
            if (b is >= 32 and <= 126) sb.Append((char)b);
            else if (b == '\r') sb.Append("\\r");
            else if (b == '\n') sb.Append("\\n");
            else sb.Append('.');
        }
        if (data.Length > maxChars) sb.Append("...");
        return sb.ToString();
    }

    public static List<DecodedHeader> Dissect(ReadOnlySpan<byte> data, string startProtocol)
    {
        var headers = new List<DecodedHeader>();
        if (data.Length == 0) return headers;

        switch (startProtocol.ToUpperInvariant())
        {
            case "ETHERNET":
                DissectEthernet(data, 0, headers);
                break;
            case "ARP":
                DissectArp(data, 0, headers);
                break;
            case "IPV4":
                DissectIpv4(data, 0, headers);
                break;
            case "IPV6":
                DissectIpv6(data, 0, headers);
                break;
            case "ICMP":
                DissectIcmp(data, 0, headers);
                break;
            case "ICMPV6":
            case "NDP":
                DissectIcmp6(data, 0, headers);
                break;
            case "IGMP":
                DissectIgmp(data, 0, headers);
                break;
            case "UDP":
                DissectUdp(data, 0, headers);
                break;
            case "TCP":
                DissectTcp(data, 0, headers);
                break;
            case "DNS":
                DissectDns(data, 0, headers);
                break;
            case "DHCP":
                DissectDhcp(data, 0, headers);
                break;
            case "HTTP":
                DissectAppPayload("HTTP", data, 0, headers);
                break;
            default:
                DissectAppPayload(startProtocol, data, 0, headers);
                break;
        }
        return headers;
    }

    private static void DissectEthernet(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 14) return;
        var slice = data[offset..];
        var dst = MacAddress.FromSpan(slice[..6]);
        var src = MacAddress.FromSpan(slice.Slice(6, 6));
        ushort etherType = BinaryPrimitives.ReadUInt16BigEndian(slice.Slice(12, 2));
        string etName = etherType switch
        {
            ProtocolNumbers.EtherTypeIpv4 => "0x0800 (IPv4)",
            ProtocolNumbers.EtherTypeArp => "0x0806 (ARP)",
            ProtocolNumbers.EtherTypeIpv6 => "0x86DD (IPv6)",
            _ => $"0x{etherType:X4}"
        };

        headers.Add(new DecodedHeader("Ethernet II", offset, 14, $"{src} -> {dst} [{etName}]",
        [
            new("Dst MAC", dst.ToString()),
            new("Src MAC", src.ToString()),
            new("EtherType", etName),
            new("Frame Len", $"{data.Length - offset} bytes")
        ]));

        int next = offset + 14;
        if (etherType == ProtocolNumbers.EtherTypeIpv4) DissectIpv4(data, next, headers);
        else if (etherType == ProtocolNumbers.EtherTypeArp) DissectArp(data, next, headers);
        else if (etherType == ProtocolNumbers.EtherTypeIpv6) DissectIpv6(data, next, headers);
    }

    private static void DissectArp(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 28) return;
        var s = data[offset..];
        ushort htype = BinaryPrimitives.ReadUInt16BigEndian(s[..2]);
        ushort ptype = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        ushort op = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2));
        var sha = MacAddress.FromSpan(s.Slice(8, 6));
        var spa = Ip4Address.FromSpan(s.Slice(14, 4));
        var tha = MacAddress.FromSpan(s.Slice(18, 6));
        var tpa = Ip4Address.FromSpan(s.Slice(24, 4));
        string opStr = op == 1 ? "REQUEST (1)" : op == 2 ? "REPLY (2)" : $"OP({op})";
        string sum = op == 1 ? $"Who has {tpa}? Tell {spa}" : $"{spa} is at {sha}";

        headers.Add(new DecodedHeader("ARP", offset, 28, sum,
        [
            new("HTYPE", $"{htype} (Ethernet)"),
            new("PTYPE", $"0x{ptype:X4} (IPv4)"),
            new("Opcode", opStr),
            new("Sender MAC", sha.ToString()),
            new("Sender IP", spa.ToString()),
            new("Target MAC", tha.ToString()),
            new("Target IP", tpa.ToString())
        ]));
    }

    private static void DissectIpv4(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 20) return;
        var s = data[offset..];
        int ver = s[0] >> 4;
        int ihl = (s[0] & 0x0F) * 4;
        if (ihl < 20 || data.Length - offset < ihl) return;
        byte tos = s[1];
        ushort totalLen = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        ushort id = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        ushort flagsFrag = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2));
        bool df = (flagsFrag & 0x4000) != 0;
        bool mf = (flagsFrag & 0x2000) != 0;
        int fragOffset = (flagsFrag & 0x1FFF) * 8;
        byte ttl = s[8];
        byte proto = s[9];
        ushort checksum = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(10, 2));
        ushort verify = Checksum.Compute(s[..ihl]);
        var src = Ip4Address.FromSpan(s.Slice(12, 4));
        var dst = Ip4Address.FromSpan(s.Slice(16, 4));
        string protoName = proto switch
        {
            ProtocolNumbers.IpProtoIcmp => "ICMP (1)",
            ProtocolNumbers.IpProtoIgmp => "IGMP (2)",
            ProtocolNumbers.IpProtoTcp => "TCP (6)",
            ProtocolNumbers.IpProtoUdp => "UDP (17)",
            _ => $"Proto({proto})"
        };
        string fragStr = $"DF={(df ? 1 : 0)} MF={(mf ? 1 : 0)} Off={fragOffset}";

        headers.Add(new DecodedHeader("IPv4", offset, ihl, $"{src} -> {dst} {protoName} TTL={ttl} Len={totalLen}",
        [
            new("Version / IHL", $"v{ver} / {ihl} bytes"),
            new("DSCP / ECN", $"0x{tos:X2}"),
            new("Total Length", $"{totalLen} bytes"),
            new("Identification", $"0x{id:X4} ({id})"),
            new("Flags / FragOffset", fragStr),
            new("TTL", ttl.ToString()),
            new("Protocol", protoName),
            new("Header Checksum", $"0x{checksum:X4} ({(verify == 0 ? "OK" : "BAD")})"),
            new("Src IP", src.ToString()),
            new("Dst IP", dst.ToString())
        ]));

        if (fragOffset > 0)
        {
            DissectAppPayload($"IPv4 Fragment (off={fragOffset})", data, offset + ihl, headers);
            return;
        }

        int next = offset + ihl;
        int end = Math.Min(data.Length, offset + totalLen);
        var inner = data[..end];
        switch (proto)
        {
            case ProtocolNumbers.IpProtoIcmp: DissectIcmp(inner, next, headers); break;
            case ProtocolNumbers.IpProtoIgmp: DissectIgmp(inner, next, headers); break;
            case ProtocolNumbers.IpProtoUdp: DissectUdp(inner, next, headers); break;
            case ProtocolNumbers.IpProtoTcp: DissectTcp(inner, next, headers); break;
            default: DissectAppPayload($"IP Raw ({proto})", inner, next, headers); break;
        }
    }

    private static void DissectIpv6(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 40) return;
        var s = data[offset..];
        uint vtf = BinaryPrimitives.ReadUInt32BigEndian(s[..4]);
        int ver = (int)(vtf >> 28);
        ushort payloadLen = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        byte nextHeader = s[6];
        byte hopLimit = s[7];
        var src = Ip6Address.FromSpan(s.Slice(8, 16));
        var dst = Ip6Address.FromSpan(s.Slice(24, 16));
        string nhName = nextHeader switch
        {
            ProtocolNumbers.IpProtoTcp => "TCP (6)",
            ProtocolNumbers.IpProtoUdp => "UDP (17)",
            ProtocolNumbers.IpProtoIcmpv6 => "ICMPv6 (58)",
            _ => $"NH({nextHeader})"
        };

        headers.Add(new DecodedHeader("IPv6", offset, 40, $"{src} -> {dst} {nhName} Hop={hopLimit}",
        [
            new("Version", $"v{ver}"),
            new("Payload Length", $"{payloadLen} bytes"),
            new("Next Header", nhName),
            new("Hop Limit", hopLimit.ToString()),
            new("Src IPv6", src.ToString()),
            new("Dst IPv6", dst.ToString())
        ]));

        int next = offset + 40;
        switch (nextHeader)
        {
            case ProtocolNumbers.IpProtoIcmpv6: DissectIcmp6(data, next, headers); break;
            case ProtocolNumbers.IpProtoUdp: DissectUdp(data, next, headers); break;
            case ProtocolNumbers.IpProtoTcp: DissectTcp(data, next, headers); break;
        }
    }

    private static void DissectIcmp(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 8) return;
        var s = data[offset..];
        byte type = s[0];
        byte code = s[1];
        ushort csum = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        ushort id = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        ushort seq = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2));
        string typeName = type switch
        {
            0 => "Echo Reply (0)",
            3 => "Dest Unreachable (3)",
            8 => "Echo Request (8)",
            11 => "Time Exceeded (11)",
            _ => $"Type({type})"
        };
        headers.Add(new DecodedHeader("ICMPv4", offset, 8, $"{typeName} code={code} id={id} seq={seq}",
        [
            new("Type", typeName),
            new("Code", code.ToString()),
            new("Checksum", $"0x{csum:X4}"),
            new("Identifier", id.ToString()),
            new("Sequence", seq.ToString()),
            new("Payload Len", $"{s.Length - 8} bytes")
        ]));
        if (s.Length > 8) DissectAppPayload("ICMP Data", data, offset + 8, headers);
    }

    private static void DissectIcmp6(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 8) return;
        var s = data[offset..];
        byte type = s[0];
        byte code = s[1];
        ushort csum = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        string typeName = type switch
        {
            128 => "Echo Request (128)",
            129 => "Echo Reply (129)",
            135 => "Neighbor Solicitation (135)",
            136 => "Neighbor Advertisement (136)",
            _ => $"ICMPv6({type})"
        };
        var fields = new List<DecodedField>
        {
            new("Type", typeName),
            new("Code", code.ToString()),
            new("Checksum", $"0x{csum:X4}")
        };
        if (type is 135 or 136 && s.Length >= 24)
        {
            var target = Ip6Address.FromSpan(s.Slice(8, 16));
            fields.Add(new("Target Address", target.ToString()));
        }
        else if (type is 128 or 129)
        {
            fields.Add(new("Identifier", BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2)).ToString()));
            fields.Add(new("Sequence", BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2)).ToString()));
        }
        headers.Add(new DecodedHeader("ICMPv6", offset, Math.Min(s.Length, type is 135 or 136 ? 24 : 8), typeName, fields));
    }

    private static void DissectIgmp(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 8) return;
        var s = data[offset..];
        byte type = s[0];
        byte maxResp = s[1];
        ushort csum = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        var group = Ip4Address.FromSpan(s.Slice(4, 4));
        string typeName = type switch
        {
            0x11 => "Membership Query (0x11)",
            0x16 => "V2 Membership Report (0x16)",
            0x17 => "Leave Group (0x17)",
            _ => $"0x{type:X2}"
        };
        headers.Add(new DecodedHeader("IGMPv2", offset, 8, $"{typeName} Group={group}",
        [
            new("Type", typeName),
            new("Max Resp Time", maxResp.ToString()),
            new("Checksum", $"0x{csum:X4}"),
            new("Group Address", group.ToString())
        ]));
    }

    private static void DissectUdp(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 8) return;
        var s = data[offset..];
        ushort srcPort = BinaryPrimitives.ReadUInt16BigEndian(s[..2]);
        ushort dstPort = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        ushort len = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        ushort csum = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2));

        headers.Add(new DecodedHeader("UDP", offset, 8, $"Port {srcPort} -> {dstPort} Len={len}",
        [
            new("Src Port", srcPort.ToString()),
            new("Dst Port", dstPort.ToString()),
            new("Length", $"{len} bytes"),
            new("Checksum", $"0x{csum:X4}")
        ]));

        int next = offset + 8;
        if (next >= data.Length) return;
        if (srcPort == 53 || dstPort == 53) DissectDns(data, next, headers);
        else if ((srcPort is 67 or 68) && (dstPort is 67 or 68)) DissectDhcp(data, next, headers);
        else DissectAppPayload("UDP Payload", data, next, headers);
    }

    private static void DissectTcp(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 20) return;
        var s = data[offset..];
        ushort srcPort = BinaryPrimitives.ReadUInt16BigEndian(s[..2]);
        ushort dstPort = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        uint seq = BinaryPrimitives.ReadUInt32BigEndian(s.Slice(4, 4));
        uint ack = BinaryPrimitives.ReadUInt32BigEndian(s.Slice(8, 4));
        int hdrLen = (s[12] >> 4) * 4;
        if (hdrLen < 20 || hdrLen > s.Length) hdrLen = 20;
        byte flags = s[13];
        ushort win = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(14, 2));
        ushort csum = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(16, 2));
        ushort urg = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(18, 2));

        var flagList = new List<string>();
        if ((flags & 0x02) != 0) flagList.Add("SYN");
        if ((flags & 0x10) != 0) flagList.Add("ACK");
        if ((flags & 0x08) != 0) flagList.Add("PSH");
        if ((flags & 0x01) != 0) flagList.Add("FIN");
        if ((flags & 0x04) != 0) flagList.Add("RST");
        if ((flags & 0x20) != 0) flagList.Add("URG");
        string flagStr = flagList.Count > 0 ? string.Join(",", flagList) : "NONE";

        var fields = new List<DecodedField>
        {
            new("Src Port", srcPort.ToString()),
            new("Dst Port", dstPort.ToString()),
            new("Seq Num", seq.ToString()),
            new("Ack Num", ack.ToString()),
            new("Header Len", $"{hdrLen} bytes"),
            new("Flags", $"0x{flags:X2} [{flagStr}]"),
            new("Window Size", win.ToString()),
            new("Checksum", $"0x{csum:X4}"),
            new("Urgent Ptr", urg.ToString())
        };

        // Parse TCP options if present
        if (hdrLen > 20)
        {
            var optSb = new StringBuilder();
            int i = 20;
            while (i < hdrLen)
            {
                byte kind = s[i];
                if (kind == 0) break;
                if (kind == 1) { i++; continue; }
                if (i + 1 >= hdrLen) break;
                byte olen = s[i + 1];
                if (olen < 2 || i + olen > hdrLen) break;
                if (kind == 2 && olen == 4)
                    optSb.Append($"MSS={BinaryPrimitives.ReadUInt16BigEndian(s.Slice(i + 2, 2))} ");
                else if (kind == 3 && olen == 3)
                    optSb.Append($"WScale={s[i + 2]} ");
                else if (kind == 4 && olen == 2)
                    optSb.Append("SACK_OK ");
                else if (kind == 8 && olen == 10)
                    optSb.Append($"TSval={BinaryPrimitives.ReadUInt32BigEndian(s.Slice(i + 2, 4))} ");
                i += olen;
            }
            if (optSb.Length > 0) fields.Add(new("Options", optSb.ToString().Trim()));
        }

        int payloadLen = s.Length - hdrLen;
        headers.Add(new DecodedHeader("TCP", offset, hdrLen,
            $"{srcPort} -> {dstPort} [{flagStr}] Seq={seq} Ack={ack} Win={win} Len={payloadLen}", fields));

        if (payloadLen > 0)
        {
            string appProto = (srcPort == 80 || dstPort == 80) ? "HTTP" : "TCP Payload";
            DissectAppPayload(appProto, data, offset + hdrLen, headers);
        }
    }

    private static void DissectDns(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 12) return;
        var s = data[offset..];
        ushort txId = BinaryPrimitives.ReadUInt16BigEndian(s[..2]);
        ushort flags = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(2, 2));
        bool isResp = (flags & 0x8000) != 0;
        ushort qd = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(4, 2));
        ushort an = BinaryPrimitives.ReadUInt16BigEndian(s.Slice(6, 2));
        string qname = ReadDnsName(s, 12);
        headers.Add(new DecodedHeader("DNS", offset, s.Length,
            $"{(isResp ? "Response" : "Query")} TxID=0x{txId:X4} Q={qname} (QD={qd}, AN={an})",
        [
            new("Transaction ID", $"0x{txId:X4}"),
            new("Type", isResp ? "Response" : "Standard Query"),
            new("Questions", qd.ToString()),
            new("Answers", an.ToString()),
            new("Query Name", qname)
        ]));
    }

    private static string ReadDnsName(ReadOnlySpan<byte> dns, int pos)
    {
        var sb = new StringBuilder();
        while (pos < dns.Length)
        {
            byte len = dns[pos++];
            if (len == 0) break;
            if ((len & 0xC0) == 0xC0) break;
            if (pos + len > dns.Length) break;
            if (sb.Length > 0) sb.Append('.');
            sb.Append(Encoding.ASCII.GetString(dns.Slice(pos, len)));
            pos += len;
        }
        return sb.Length > 0 ? sb.ToString() : "(root)";
    }

    private static void DissectDhcp(ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (data.Length - offset < 240) return;
        var s = data[offset..];
        byte op = s[0];
        uint xid = BinaryPrimitives.ReadUInt32BigEndian(s.Slice(4, 4));
        var ciaddr = Ip4Address.FromSpan(s.Slice(12, 4));
        var yiaddr = Ip4Address.FromSpan(s.Slice(16, 4));
        var siaddr = Ip4Address.FromSpan(s.Slice(20, 4));
        string msgType = "UNKNOWN";
        int i = 240;
        while (i < s.Length)
        {
            byte opt = s[i++];
            if (opt == 255) break;
            if (opt == 0) continue;
            if (i >= s.Length) break;
            byte olen = s[i++];
            if (opt == 53 && olen >= 1 && i < s.Length)
            {
                msgType = s[i] switch
                {
                    1 => "DISCOVER",
                    2 => "OFFER",
                    3 => "REQUEST",
                    5 => "ACK",
                    6 => "NAK",
                    7 => "RELEASE",
                    _ => $"TYPE({s[i]})"
                };
            }
            i += olen;
        }
        headers.Add(new DecodedHeader("DHCP", offset, s.Length, $"DHCP {msgType} XID=0x{xid:X8} YIADDR={yiaddr}",
        [
            new("Op", op == 1 ? "BOOTREQUEST (1)" : "BOOTREPLY (2)"),
            new("Message Type", msgType),
            new("Transaction ID", $"0x{xid:X8}"),
            new("Client IP", ciaddr.ToString()),
            new("Your IP (Offered)", yiaddr.ToString()),
            new("Server IP", siaddr.ToString())
        ]));
    }

    private static void DissectAppPayload(string proto, ReadOnlySpan<byte> data, int offset, List<DecodedHeader> headers)
    {
        if (offset >= data.Length) return;
        var s = data[offset..];
        string preview = FormatAsciiPreview(s, 200);
        var fields = new List<DecodedField>
        {
            new("Length", $"{s.Length} bytes"),
            new("Preview", preview)
        };
        if (proto == "HTTP")
        {
            string text = Encoding.UTF8.GetString(s);
            var firstLine = text.Split("\r\n", 2)[0];
            fields.Insert(0, new("Start Line", firstLine));
        }
        headers.Add(new DecodedHeader(proto, offset, s.Length, $"{proto} ({s.Length} bytes)", fields));
    }
}
