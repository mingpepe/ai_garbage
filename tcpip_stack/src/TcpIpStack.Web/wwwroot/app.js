let appState = null;
let selectedTraceId = null;
let selectedLayerKey = null;
let autoPlayTimer = null;
let presets = [];

const LAYER_DEFS = [
  { id: 'Application',  label: 'L7: Application',  cls: 'HttpClient / Dns / Dhcp / AutoIP / Script', lowerIface: 'ISocketApi / IDnsClient / IDhcpClient' },
  { id: 'SocketApi',    label: 'L5: BSD Sockets',  cls: 'SocketApiLayer (sockets.c)',                lowerIface: 'ITcpLayer | IUdpLayer | IRawLayer' },
  { id: 'Transport',    label: 'L4: Transport',    cls: 'TcpLayer | UdpLayer | RawLayer',            lowerIface: 'IIp4Layer | IIp6Layer | IIcmpLayer', matchIds: ['TransportTcp','TransportUdp','TransportRaw'] },
  { id: 'Network',      label: 'L3: Network',      cls: 'Ip4Layer | Icmp | Igmp | Ip6Layer',         lowerIface: 'IArpLayer | INdpLayer | ILinkLayer', matchIds: ['NetworkIp4','NetworkIcmp','NetworkIgmp','NetworkIp6'] },
  { id: 'ArpNdp',       label: 'L2.5: ARP / NDP',  cls: 'ArpLayer | NdpLayer',                       lowerIface: 'ILinkLayer.SendFrame()',             matchIds: ['LinkArp','LinkNdp'] },
  { id: 'LinkEthernet', label: 'L2: Ethernet/Netif', cls: 'EthernetLayer + Netif (lo0/eth0)',        lowerIface: 'IOsNetworkInterface / IOsRxCallback' },
  { id: 'OsNic',        label: 'L1: Simulated OS', cls: 'SimulatedOsNic + SimulatedSysArch',         lowerIface: null }
];

function mapLayerGroup(layerId) {
  for (const d of LAYER_DEFS) {
    if (d.id === layerId) return d.id;
    if (d.matchIds && d.matchIds.includes(layerId)) return d.id;
  }
  return layerId;
}

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`);
  return await res.json();
}

async function init() {
  presets = await api('GET', '/api/script/presets');
  const sel = document.getElementById('sel-preset');
  sel.innerHTML = presets.map(p => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
  if (presets.length > 0) {
    document.getElementById('script-editor').value = presets[0].code;
  }
  await refreshState();
}

async function refreshState() {
  appState = await api('GET', '/api/state');
  renderAll();
}

function applyState(st) {
  appState = st;
  if (st.traces && st.traces.length > 0) {
    selectedTraceId = st.traces[st.traces.length - 1].id;
  }
  renderAll();
}

// --- Controls ---
async function stepHop() {
  applyState(await api('POST', '/api/step'));
}
async function stepN(n) {
  applyState(await api('POST', '/api/step-n', { count: n }));
}
async function runIdle() {
  stopAutoPlay();
  applyState(await api('POST', '/api/run-idle'));
}
async function advanceClock(deltaMs) {
  applyState(await api('POST', '/api/clock', { deltaMs }));
}
async function resetSim() {
  stopAutoPlay();
  selectedTraceId = null;
  applyState(await api('POST', '/api/reset'));
}
async function clearTraces() {
  selectedTraceId = null;
  applyState(await api('POST', '/api/clear-traces'));
}
async function updateFaults() {
  const payload = {
    dropNextClientTx: document.getElementById('chk-drop-next').checked,
    corruptNextChecksum: document.getElementById('chk-corrupt-next').checked,
    duplicateNextPacket: document.getElementById('chk-dup-next').checked,
    mtu: parseInt(document.getElementById('sel-mtu').value, 10)
  };
  applyState(await api('POST', '/api/faults', payload));
}

function toggleAutoPlay() {
  if (autoPlayTimer) { stopAutoPlay(); return; }
  const btn = document.getElementById('btn-autoplay');
  btn.classList.add('active-toggle');
  btn.textContent = '⏸ Pause';
  const tick = async () => {
    if (!autoPlayTimer) return;
    const prevCount = appState ? appState.traces.length : 0;
    const prevPending = appState ? appState.pendingCount : 0;
    const st = await api('POST', '/api/step');
    applyState(st);
    const activeScript = st.script && (st.script.status === 'RUNNING');
    if (st.pendingCount === 0 && !activeScript && prevPending === 0 && st.traces.length === prevCount) {
      stopAutoPlay();
      return;
    }
    const ms = parseInt(document.getElementById('sel-speed').value, 10) || 300;
    autoPlayTimer = setTimeout(tick, ms);
  };
  autoPlayTimer = setTimeout(tick, 50);
}

function stopAutoPlay() {
  if (autoPlayTimer) clearTimeout(autoPlayTimer);
  autoPlayTimer = null;
  const btn = document.getElementById('btn-autoplay');
  if (btn) {
    btn.classList.remove('active-toggle');
    btn.textContent = '⏵ Auto-Play';
  }
}

// --- Quick Actions ---
async function quickPing(ip, payloadSize) {
  applyState(await api('POST', '/api/action/ping', { ip, payloadSize }));
}
async function quickFragPing() {
  document.getElementById('sel-mtu').value = '100';
  await api('POST', '/api/faults', { mtu: 100 });
  applyState(await api('POST', '/api/action/ping', { ip: '192.168.1.1', payloadSize: 220 }));
}
async function quickPing6() {
  applyState(await api('POST', '/api/action/ping6', { ip6: 'fe80::1' }));
}
async function quickDns() {
  applyState(await api('POST', '/api/action/dns', { hostname: 'example.com' }));
}
async function quickDhcp() {
  applyState(await api('POST', '/api/action/dhcp'));
}
async function quickAutoIp() {
  applyState(await api('POST', '/api/action/autoip'));
}
async function quickIgmp() {
  applyState(await api('POST', '/api/action/igmp', { group: '224.0.1.100', leave: false }));
}
async function flushCaches() {
  applyState(await api('POST', '/api/action/flush-caches'));
}

// --- Socket IDE ---
function loadSelectedPreset() {
  const id = document.getElementById('sel-preset').value;
  const p = presets.find(x => x.id === id);
  if (p) {
    document.getElementById('script-editor').value = p.code;
    loadScriptFromEditor();
  }
}
async function loadScriptFromEditor() {
  const code = document.getElementById('script-editor').value;
  applyState(await api('POST', '/api/script/load', { code }));
}
async function stepScriptLine() {
  applyState(await api('POST', '/api/script/step-line'));
}
async function runScriptAll() {
  stopAutoPlay();
  if (!appState || !appState.script || appState.script.status === 'IDLE' || appState.script.status === 'COMPLETED') {
    await api('POST', '/api/script/load', { code: document.getElementById('script-editor').value });
  }
  applyState(await api('POST', '/api/run-idle'));
}

// --- HTTP Browser ---
async function startHttp(autoRun) {
  const spec = {
    method: document.getElementById('http-method').value,
    url: document.getElementById('http-url').value,
    body: document.getElementById('http-body').value || null,
    flushDnsBefore: document.getElementById('http-flush-dns').checked,
    flushArpBefore: document.getElementById('http-flush-arp').checked
  };
  let st = await api('POST', '/api/http/start', spec);
  if (autoRun) st = await api('POST', '/api/run-idle');
  applyState(st);
}

// --- Tabs ---
function switchTab(tabId) {
  document.querySelectorAll('.w95-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tabId));
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.toggle('active', el.id === tabId));
}

// --- Rendering ---
function renderAll() {
  if (!appState) return;
  renderStatusAndBanner();
  renderStackDiagram();
  renderLayerInspector();
  renderTraceTable();
  renderDissector();
  renderSocketIde();
  renderHttpTracer();
  renderInternals();
}

function renderStatusAndBanner() {
  document.getElementById('chk-drop-next').checked = appState.faults.dropNextClientTx;
  document.getElementById('chk-corrupt-next').checked = appState.faults.corruptNextChecksum;
  document.getElementById('chk-dup-next').checked = appState.faults.duplicateNextPacket;
  document.getElementById('sel-mtu').value = String(appState.client.netif.mtu);

  document.getElementById('sb-clock').textContent = `Virtual Clock: ${appState.nowMs} ms`;
  document.getElementById('sb-pending').textContent = `Pending Hops: ${appState.pendingCount}`;
  document.getElementById('sb-client-ip').textContent = `Client eth0: ${appState.client.netif.ip4} (MTU ${appState.client.netif.mtu})`;
  document.getElementById('sb-traces').textContent = `Captured Hops: ${appState.traces.length}`;
  document.getElementById('phase-badge').textContent = appState.activePhaseTag ? `[Phase: ${appState.activePhaseTag}]` : '';

  const banner = document.getElementById('next-hop-banner');
  const txt = document.getElementById('next-hop-text');
  document.getElementById('next-hop-queue-badge').textContent = `Pending Hops: ${appState.pendingCount}`;
  if (appState.nextPending && appState.nextPending.length > 0) {
    const n = appState.nextPending[0];
    banner.classList.remove('idle');
    txt.innerHTML = `<b>NEXT STEP &rarr;</b> [${esc(n.nodeLabel)}] <b>${esc(n.fromLayer)} &rarr; ${esc(n.toLayer)}</b> via <code>${esc(n.interfaceCall)}</code> | ${esc(n.summary)}`;
  } else {
    banner.classList.add('idle');
    txt.textContent = 'Step Queue Idle — Click a protocol button, step your Socket Program, or start an HTTP Request.';
  }

  const wireBar = document.getElementById('virtual-wire-bar');
  const last = appState.lastTrace;
  const wireActive = last && (last.fromLayer === 'VirtualWire' || last.toLayer === 'VirtualWire');
  wireBar.classList.toggle('active-wire', !!wireActive);
  document.getElementById('wire-stats').textContent =
    `Forwarded: ${appState.faults.framesForwarded} | Dropped: ${appState.faults.framesDropped} | Corrupted: ${appState.faults.framesCorrupted}`;
}

function renderStackDiagram() {
  const container = document.getElementById('stack-diagram');
  const nodes = [
    { key: 'client', data: appState.client, cls: '', role: 'Host / Browser / Socket App' },
    { key: 'gateway', data: appState.gateway, cls: 'gw', role: 'IPv4 Router + DNS:53 + DHCP:67' },
    { key: 'server', data: appState.server, cls: 'srv', role: 'HTTP/1.1:80 + Echo:7' }
  ];

  const last = appState.lastTrace;
  const next = (appState.nextPending && appState.nextPending.length > 0) ? appState.nextPending[0] : null;

  container.innerHTML = nodes.map(n => {
    const d = n.data;
    const boxes = LAYER_DEFS.map((ld, idx) => {
      const isLastNode = last && last.nodeId === n.key;
      const fromG = isLastNode ? mapLayerGroup(last.fromLayer) : null;
      const toG = isLastNode ? mapLayerGroup(last.toLayer) : null;

      let cls = 'layer-box';
      if (selectedLayerKey === `${n.key}:${ld.id}`) cls += ' selected';
      if (isLastNode && last.dropped && (fromG === ld.id || toG === ld.id)) cls += ' active-drop';
      else if (isLastNode && fromG === ld.id) cls += ' active-from';
      else if (isLastNode && toG === ld.id) cls += ' active-to';

      if (next && next.nodeId === n.key && mapLayerGroup(next.fromLayer) === ld.id) cls += ' queued-next';

      const meta = getLayerMeta(d, ld.id);

      let ifaceHtml = '';
      if (ld.lowerIface) {
        const nextDef = LAYER_DEFS[idx + 1];
        let ifCls = 'iface-bar';
        let arrow = '&#8597;';
        if (isLastNode) {
          if (fromG === ld.id && toG === nextDef.id) { ifCls += ' active-tx'; arrow = '&#11015; TX'; }
          else if (fromG === nextDef.id && toG === ld.id) { ifCls += ' active-rx'; arrow = '&#11014; RX'; }
        }
        ifaceHtml = `<div class="${ifCls}"><span>${arrow}</span><span>${esc(ld.lowerIface)}</span><span>${arrow}</span></div>`;
      }

      return `
        <div class="${cls}" onclick="selectLayer('${n.key}','${ld.id}')">
          <div class="layer-title"><span>${esc(ld.label)}</span><span class="layer-class">${esc(meta.badge)}</span></div>
          <div class="layer-meta">${esc(meta.summary)}</div>
        </div>
        ${ifaceHtml}
      `;
    }).join('');

    return `
      <div class="node-column">
        <div class="node-header ${n.cls}">
          <span>${esc(d.nodeLabel)}</span>
          <span style="font-weight:normal;">${esc(n.role)}</span>
        </div>
        ${boxes}
      </div>
    `;
  }).join('');
}

function getLayerMeta(node, layerGroup) {
  switch (layerGroup) {
    case 'Application':
      return { badge: `DNS:${node.dnsCache.length} DHCP:${node.dhcp.stateName}`, summary: `DNS Cache=${node.dnsCache.length} | AutoIP=${node.autoIp.stateName}` };
    case 'SocketApi':
      return { badge: `FDs: ${node.sockets.length}`, summary: node.sockets.length ? `Active FDs: ${node.sockets.map(s=>'#'+s.fd).join(', ')}` : 'No open sockets' };
    case 'Transport':
      return {
        badge: `TCP:${node.tcpPcbs.length} UDP:${node.udpPcbs.length}`,
        summary: `TCP TX:${node.stats.tcp.xmit} RX:${node.stats.tcp.recv} | UDP TX:${node.stats.udp.xmit} RX:${node.stats.udp.recv}`
      };
    case 'Network':
      return {
        badge: `IP:${node.netif.ip4}`,
        summary: `IP4 TX:${node.stats.ip4.xmit} RX:${node.stats.ip4.recv} FW:${node.stats.ip4.fw} Frag:${node.stats.ip4_frag.xmit} | IP6:${node.stats.ip6.xmit}/${node.stats.ip6.recv}`
      };
    case 'ArpNdp':
      return {
        badge: `ARP:${node.arpCache.length} NDP:${node.ndpCache.length}`,
        summary: `ARP Cache=${node.arpCache.length} (Hits:${node.stats.etharp.cacheHit}) | NDP=${node.ndpCache.length}`
      };
    case 'LinkEthernet':
      return {
        badge: `MTU:${node.netif.mtu}`,
        summary: `MAC ${node.netif.mac} | Eth TX:${node.stats.link.xmit} RX:${node.stats.link.recv}`
      };
    case 'OsNic':
      return {
        badge: node.netif.isUp ? 'LINK UP' : 'DOWN',
        summary: `vnic0 | TX:${node.netif.nicTxFrames} frames | RX:${node.netif.nicRxFrames} frames`
      };
    default:
      return { badge: '', summary: '' };
  }
}

function selectLayer(nodeKey, layerId) {
  selectedLayerKey = `${nodeKey}:${layerId}`;
  renderStackDiagram();
  renderLayerInspector();
}

function renderLayerInspector() {
  if (!selectedLayerKey || !appState) return;
  const [nodeKey, layerId] = selectedLayerKey.split(':');
  const node = appState[nodeKey];
  if (!node) return;
  const def = LAYER_DEFS.find(d => d.id === layerId);
  document.getElementById('layer-inspector-title').textContent =
    `[${node.nodeLabel}] ${def.label} — Class: ${def.cls}`;

  const el = document.getElementById('layer-inspector-body');
  if (layerId === 'Transport') {
    const tcps = node.tcpPcbs.map(p =>
      `TCP PCB#${p.id} [${p.state}] ${p.local} <-> ${p.remote} | SND.UNA=${p.sndUna} SND.NXT=${p.sndNxt} RCV.NXT=${p.rcvNxt} Wnd=${p.sndWnd} Cwnd=${p.cwnd} RTO=${p.rtoMs}ms Unacked=${p.unackedCount}`
    ).join('\n') || '(No active TCP PCBs)';
    const udps = node.udpPcbs.map(p => `UDP PCB#${p.id} ${p.local} -> ${p.remote}`).join('\n');
    el.innerText = tcps + (udps ? '\n' + udps : '');
  } else if (layerId === 'ArpNdp') {
    const arps = node.arpCache.map(a => `ARP ${a.ip} => ${a.mac} [${a.state}] age=${a.ageSeconds}s pending=${a.pending}`).join('\n') || '(ARP cache empty)';
    const ndps = node.ndpCache.map(a => `NDP ${a.ip6} => ${a.mac} [${a.state}]`).join('\n');
    el.innerText = arps + (ndps ? '\n' + ndps : '');
  } else if (layerId === 'Network') {
    const routes = node.routes.map(r => `ROUTE ${r.network}/${r.netmask} -> ${r.nextHop} dev ${r.interfaceName} metric ${r.metric}`).join('\n');
    el.innerText = `IPv4: ${node.netif.ip4} Mask: ${node.netif.netmask} GW: ${node.netif.gateway} Forwarding: ${node.netif.forwarding}\nIPv6 Link-Local: ${node.netif.ip6LinkLocal} | IGMP Groups: [${node.igmpGroups.join(', ')}]\n${routes}`;
  } else if (layerId === 'SocketApi') {
    el.innerText = node.sockets.map(s =>
      `fd=${s.fd} ${s.family} ${s.type} PCB#${s.pcbId} Connected=${s.isConnected} TcpState=${s.tcpState || '-'} RxBuf=${s.rxBuffered}B`
    ).join('\n') || '(No open BSD sockets)';
  } else if (layerId === 'Application') {
    const dns = node.dnsCache.map(c => `DNS ${c.hostname} => ${c.ip} (TTL ${c.ttlSeconds}s)`).join('\n') || '(DNS cache empty)';
    el.innerText = `DHCP State: ${node.dhcp.stateName} (Offered=${node.dhcp.offeredIp}, Lease=${node.dhcp.leaseTimeSeconds}s) | AutoIP: ${node.autoIp.stateName}\n${dns}`;
  } else {
    el.innerText = `Netif: ${node.netif.name} | MAC: ${node.netif.mac} | MTU: ${node.netif.mtu} | Flags: ${node.netif.flags}\nLower Interface: ${def.lowerIface || 'VirtualNetworkSwitch (Simulated Wire)'}`;
  }
}

function renderTraceTable() {
  const filter = document.getElementById('trace-filter-node').value;
  const tbody = document.getElementById('trace-tbody');
  const rows = appState.traces.filter(t => filter === 'ALL' || t.nodeId === filter);

  tbody.innerHTML = rows.map(t => {
    let rowCls = '';
    if (t.dropped) rowCls = 'dir-drop';
    else if (t.direction === 'DownTx') rowCls = 'dir-down';
    else if (t.direction === 'UpRx') rowCls = 'dir-up';
    else if (t.direction === 'Wire') rowCls = 'dir-wire';
    if (t.id === selectedTraceId) rowCls += ' selected-row';

    return `
      <tr class="${rowCls}" onclick="selectTrace(${t.id})">
        <td>${t.id}</td>
        <td>${t.timestampMs}</td>
        <td>${esc(t.nodeId)}</td>
        <td>${esc(t.fromLayer)} &rarr; ${esc(t.toLayer)}</td>
        <td><span class="badge-proto badge-${esc(t.protocol)}">${esc(t.protocol)}</span></td>
        <td>${t.byteLength}B</td>
        <td title="${esc(t.summary)}">${esc(t.summary)}</td>
      </tr>
    `;
  }).join('');

  const wrap = document.getElementById('trace-table-wrap');
  wrap.scrollTop = wrap.scrollHeight;
}

function selectTrace(id) {
  selectedTraceId = id;
  renderTraceTable();
  renderDissector();
}

function renderDissector() {
  const body = document.getElementById('dissector-body');
  const meta = document.getElementById('dissector-meta');
  const t = appState.traces.find(x => x.id === selectedTraceId);
  if (!t) {
    meta.textContent = 'Select a hop row';
    return;
  }

  meta.textContent = `Hop #${t.id} | ${t.nodeLabel} | ${t.timestampMs}ms`;
  let html = `
    <div style="margin-bottom:6px; padding:4px; background:#ffffe0; border:1px solid #808080;">
      <div><b>Boundary Call:</b> <code>${esc(t.interfaceCall)}</code></div>
      <div><b>Transition:</b> ${esc(t.fromLayer)} &rarr; ${esc(t.toLayer)} (${esc(t.direction)}) ${t.phaseTag ? '| <b>' + esc(t.phaseTag) + '</b>' : ''}</div>
      <div><b>Detail:</b> ${esc(t.detail)}</div>
      ${t.dropped ? `<div style="color:#c00;font-weight:bold;">DROPPED: ${esc(t.dropReason || '')}</div>` : ''}
    </div>
  `;

  if (t.headers && t.headers.length > 0) {
    html += t.headers.map(h => `
      <div class="hdr-block">
        <div class="hdr-block-title">${esc(h.protocol)} (offset=${h.offset}, len=${h.length}B) &mdash; ${esc(h.summary)}</div>
        <div class="hdr-fields">
          ${h.fields.map(f => `<div><b>${esc(f.name)}:</b> ${esc(f.value)}</div>`).join('')}
        </div>
      </div>
    `).join('');
  }

  if (t.hexDump) {
    html += `<div style="font-weight:bold;">Raw Pbuf Bytes at this Layer (${t.byteLength} bytes):</div><div class="hex-box">${esc(t.hexDump)}</div>`;
  }
  body.innerHTML = html;
}

function renderSocketIde() {
  const s = appState.script;
  document.getElementById('script-status-badge').textContent =
    `Status: ${s.status}${s.waitReason ? ' — ' + s.waitReason : ''}`;

  const lineView = document.getElementById('script-line-view');
  lineView.innerHTML = (s.lines || []).map((ln, idx) => {
    let cls = 'code-line';
    let ptr = ' ';
    if (idx === s.currentLine) {
      cls += (s.status === 'WAITING_NETWORK') ? ' waiting' : ' current';
      ptr = (s.status === 'WAITING_NETWORK') ? '⌛' : '►';
    }
    return `<div class="${cls}"><span class="ln">${idx + 1}</span><span>${ptr}</span><span>${esc(ln)}</span></div>`;
  }).join('');

  const con = document.getElementById('script-console');
  con.textContent = (s.consoleOutput || []).join('\n') || '(Console ready — press Step 1 Code Line or Run To Completion)';
  con.scrollTop = con.scrollHeight;

  const varsHtml = Object.entries(s.variables || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
    || '<tr><td colspan="2">(none)</td></tr>';
  const socksHtml = appState.client.sockets.map(sk =>
    `<tr><td>fd=${sk.fd}</td><td>${esc(sk.type)}</td><td>${esc(sk.tcpState || '-')}</td><td>${sk.rxBuffered}B</td></tr>`
  ).join('') || '<tr><td colspan="4">(no open sockets)</td></tr>';

  document.getElementById('script-vars-sockets').innerHTML = `
    <table class="w95-table" style="margin-bottom:6px;">
      <thead><tr><th>Variable</th><th>Value</th></tr></thead>
      <tbody>${varsHtml}</tbody>
    </table>
    <table class="w95-table">
      <thead><tr><th>FD</th><th>Type</th><th>TCP State</th><th>RX Buf</th></tr></thead>
      <tbody>${socksHtml}</tbody>
    </table>
  `;
}

function renderHttpTracer() {
  const tx = appState.http;
  const order = ['DNS_LOOKUP', 'TCP_HANDSHAKE', 'HTTP_SEND', 'HTTP_RECV', 'TCP_CLOSE', 'COMPLETED'];
  const curIdx = tx ? order.indexOf(tx.phase) : -1;
  order.forEach((p, idx) => {
    const el = document.getElementById('ph-' + p);
    if (!el) return;
    el.classList.remove('done', 'active');
    if (curIdx > idx || (tx && tx.completed && p === 'COMPLETED')) el.classList.add('done');
    else if (curIdx === idx) el.classList.add('active');
  });

  if (!tx) return;
  document.getElementById('http-status-label').textContent =
    tx.statusCode ? `${tx.statusCode} ${tx.statusText} (${tx.phase})` : tx.phase;

  document.getElementById('http-milestones').innerHTML =
    (tx.milestones || []).map(m => `<div>[${m.timeMs}ms] <b>${esc(m.phase)}</b>: ${esc(m.description)}</div>`).join('');

  document.getElementById('http-raw').textContent =
    `=== REQUEST ===\n${tx.rawRequest}\n\n=== RESPONSE ===\n${tx.rawResponse || '(waiting for server response...)'}`;

  const rendered = document.getElementById('http-rendered');
  if (tx.responseBody) {
    const ct = (tx.responseHeaders && (tx.responseHeaders['Content-Type'] || tx.responseHeaders['content-type'])) || '';
    if (ct.includes('text/html')) {
      rendered.innerHTML = tx.responseBody;
    } else {
      rendered.innerHTML = `<pre style="margin:0;white-space:pre-wrap;">${esc(tx.responseBody)}</pre>`;
    }
  } else if (tx.error) {
    rendered.innerHTML = `<div style="color:#c00;font-weight:bold;">${esc(tx.error)}</div>`;
  }
}

function renderInternals() {
  const c = appState.client;
  document.getElementById('tbl-tcp-pcbs').innerHTML = `
    <table class="w95-table">
      <thead><tr><th>ID</th><th>State</th><th>Local</th><th>Remote</th><th>SND.NXT</th><th>RCV.NXT</th><th>Cwnd</th><th>RTO</th><th>Unack</th></tr></thead>
      <tbody>${c.tcpPcbs.map(p => `<tr><td>${p.id}</td><td><b>${p.state}</b></td><td>${p.local}</td><td>${p.remote}</td><td>${p.sndNxt}</td><td>${p.rcvNxt}</td><td>${p.cwnd}</td><td>${p.rtoMs}ms</td><td>${p.unackedCount}</td></tr>`).join('') || '<tr><td colspan="9">(none)</td></tr>'}</tbody>
    </table>`;

  document.getElementById('tbl-arp-ndp').innerHTML = `
    <table class="w95-table">
      <thead><tr><th>Proto</th><th>IP Address</th><th>MAC Address</th><th>State</th><th>Age</th></tr></thead>
      <tbody>
        ${c.arpCache.map(a => `<tr><td>ARP</td><td>${a.ip}</td><td>${a.mac}</td><td>${a.state}</td><td>${a.ageSeconds}s</td></tr>`).join('')}
        ${c.ndpCache.map(n => `<tr><td>NDP</td><td>${n.ip6}</td><td>${n.mac}</td><td>${n.state}</td><td>${n.ageSeconds}s</td></tr>`).join('')}
        ${(c.arpCache.length + c.ndpCache.length === 0) ? '<tr><td colspan="5">(empty)</td></tr>' : ''}
      </tbody>
    </table>`;

  document.getElementById('tbl-routes-apps').innerHTML = `
    <table class="w95-table">
      <thead><tr><th>Network</th><th>Netmask</th><th>NextHop</th><th>Dev</th></tr></thead>
      <tbody>${c.routes.map(r => `<tr><td>${r.network}</td><td>${r.netmask}</td><td>${r.nextHop}</td><td>${r.interfaceName}</td></tr>`).join('')}</tbody>
    </table>
    <div style="padding:4px;font-family:'Courier New',monospace;font-size:11px;">
      <b>DHCP:</b> ${esc(c.dhcp.stateName)} | <b>AutoIP:</b> ${esc(c.autoIp.stateName)} | <b>IGMP:</b> [${esc(c.igmpGroups.join(', '))}] | <b>DNS Cache:</b> ${c.dnsCache.map(d => d.hostname + '=' + d.ip).join(', ') || '(empty)'}
    </div>`;

  const statsRows = Object.entries(c.stats).map(([k, v]) =>
    `<tr><td><b>${esc(k)}</b></td><td>${v.xmit}</td><td>${v.recv}</td><td>${v.fw}</td><td>${v.drop}</td><td>${v.chkErr}</td><td>${v.cacheHit}</td></tr>`
  ).join('');
  document.getElementById('tbl-mib-stats').innerHTML = `
    <table class="w95-table">
      <thead><tr><th>Subsystem</th><th>Xmit</th><th>Recv</th><th>Fw</th><th>Drop</th><th>ChkErr</th><th>CacheHit</th></tr></thead>
      <tbody>${statsRows}</tbody>
    </table>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Keyboard shortcut: F10 = Step 1 Hop
window.addEventListener('keydown', e => {
  if (e.key === 'F10') {
    e.preventDefault();
    stepHop();
  }
});

init();
