using System.Text.Json;
using System.Text.Json.Serialization;
using TcpIpStack.Core.Engine;
using TcpIpStack.Core.Interfaces;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(opts =>
{
    opts.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

var sim = new SimulationEngine();
var simLock = new object();

IResult Snapshot()
{
    lock (simLock) return Results.Ok(sim.BuildSnapshot());
}

app.MapGet("/api/state", Snapshot);

app.MapPost("/api/step", () =>
{
    lock (simLock)
    {
        sim.StepOneHop();
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/step-n", (StepNReq req) =>
{
    lock (simLock)
    {
        int count = Math.Clamp(req.Count, 1, 500);
        for (int i = 0; i < count; i++)
        {
            if (!sim.StepOneHop()) break;
        }
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/run-idle", () =>
{
    lock (simLock)
    {
        sim.RunUntilIdle(600);
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/clock", (ClockReq req) =>
{
    lock (simLock)
    {
        sim.AdvanceClockMs(Math.Clamp(req.DeltaMs, 1, 30000));
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/reset", () =>
{
    lock (simLock)
    {
        sim.Reset();
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/clear-traces", () =>
{
    lock (simLock)
    {
        sim.ClearTraces();
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/faults", (FaultsReq req) =>
{
    lock (simLock)
    {
        if (req.DropNextClientTx.HasValue) sim.VirtualSwitch.Faults.DropNextClientTx = req.DropNextClientTx.Value;
        if (req.CorruptNextChecksum.HasValue) sim.VirtualSwitch.Faults.CorruptNextChecksum = req.CorruptNextChecksum.Value;
        if (req.DuplicateNextPacket.HasValue) sim.VirtualSwitch.Faults.DuplicateNextPacket = req.DuplicateNextPacket.Value;
        if (req.DropPercent.HasValue) sim.VirtualSwitch.Faults.DropPercent = Math.Clamp(req.DropPercent.Value, 0, 100);
        if (req.Mtu.HasValue) sim.SetClientMtu(req.Mtu.Value);
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/action/ping", (PingReq req) =>
{
    lock (simLock)
    {
        sim.TriggerPing(string.IsNullOrWhiteSpace(req.Ip) ? "93.184.216.34" : req.Ip, req.PayloadSize <= 0 ? 32 : req.PayloadSize);
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/action/ping6", (Ping6Req req) =>
{
    lock (simLock)
    {
        sim.TriggerPing6(string.IsNullOrWhiteSpace(req.Ip6) ? "fe80::1" : req.Ip6);
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/action/dns", (DnsReq req) =>
{
    lock (simLock)
    {
        sim.TriggerDnsLookup(string.IsNullOrWhiteSpace(req.Hostname) ? "example.com" : req.Hostname);
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/action/dhcp", () =>
{
    lock (simLock) { sim.TriggerDhcp(); return Results.Ok(sim.BuildSnapshot()); }
});

app.MapPost("/api/action/autoip", () =>
{
    lock (simLock) { sim.TriggerAutoIp(); return Results.Ok(sim.BuildSnapshot()); }
});

app.MapPost("/api/action/igmp", (IgmpReq req) =>
{
    lock (simLock)
    {
        string grp = string.IsNullOrWhiteSpace(req.Group) ? "224.0.1.100" : req.Group;
        if (req.Leave) sim.TriggerIgmpLeave(grp); else sim.TriggerIgmpJoin(grp);
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/action/garp", () =>
{
    lock (simLock) { sim.TriggerGratuitousArp(); return Results.Ok(sim.BuildSnapshot()); }
});

app.MapPost("/api/action/flush-caches", () =>
{
    lock (simLock)
    {
        sim.Client.Arp.FlushCache();
        sim.Client.Ndp.FlushCache();
        sim.Client.Dns.FlushCache();
        sim.Gateway.Arp.FlushCache();
        sim.RemoteServer.Arp.FlushCache();
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapGet("/api/script/presets", () =>
{
    var presets = SocketScriptRunner.GetPresets()
        .Select(kv => new { id = kv.Key, title = kv.Value.Title, description = kv.Value.Description, code = kv.Value.Code });
    return Results.Ok(presets);
});

app.MapPost("/api/script/load", (ScriptLoadReq req) =>
{
    lock (simLock)
    {
        sim.ScriptRunner.Load(req.Code ?? "");
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/script/step-line", () =>
{
    lock (simLock)
    {
        sim.ScriptRunner.ActivateIfIdle();
        sim.ScriptRunner.StepStatement();
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.MapPost("/api/http/start", (HttpStartReq req) =>
{
    lock (simLock)
    {
        sim.Client.Http.StartRequest(new HttpRequestSpec(
            req.Method ?? "GET",
            string.IsNullOrWhiteSpace(req.Url) ? "http://example.com/" : req.Url,
            req.Headers,
            req.Body,
            req.FlushDnsBefore,
            req.FlushArpBefore));
        return Results.Ok(sim.BuildSnapshot());
    }
});

app.Run();

record StepNReq(int Count);
record ClockReq(long DeltaMs);
record FaultsReq(bool? DropNextClientTx, bool? CorruptNextChecksum, bool? DuplicateNextPacket, int? DropPercent, int? Mtu);
record PingReq(string Ip, int PayloadSize);
record Ping6Req(string Ip6);
record DnsReq(string Hostname);
record IgmpReq(string Group, bool Leave);
record ScriptLoadReq(string Code);
record HttpStartReq(string? Method, string Url, Dictionary<string, string>? Headers, string? Body, bool FlushDnsBefore, bool FlushArpBefore);
