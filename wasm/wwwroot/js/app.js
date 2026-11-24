(() => {
  const state = {
    presets: [],
    currentCode: "",
    editMode: false,
    parsedWasm: null,
    m3Internals: null,
    debugState: null,
    cBreakpoints: new Set(),
    wasmBreakpoints: new Set(),
    specCatalog: [],
    specFiles: null,
    selectedSpecOpcode: null,
    memOffset: 0
  };

  const $ = (id) => document.getElementById(id);

  async function api(url, method = "GET", body = null) {
    const opts = { method, headers: {} };
    if (body !== null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hexByte(n) {
    return "0x" + (n & 0xFF).toString(16).toUpperCase().padStart(2, "0");
  }

  function parseNum(str) {
    const s = String(str || "").trim();
    if (s.startsWith("0x") || s.startsWith("0X")) return parseInt(s, 16) || 0;
    return parseInt(s, 10) || 0;
  }

  // ── Tab switching ────────────────────────────────────────────────────────────
  document.querySelectorAll(".tab-strip").forEach((strip) => {
    strip.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      const targetId = btn.dataset.tab;
      strip.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const allTargetIds = Array.from(strip.querySelectorAll(".tab-btn")).map((b) => b.dataset.tab);
      allTargetIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("active", id === targetId);
      });
    });
  });

  // ── Initialization ───────────────────────────────────────────────────────────
  async function init() {
    const [presets, specData, regSnap] = await Promise.all([
      api("/api/presets"),
      api("/api/spec/instructions"),
      api("/api/registers")
    ]);

    state.presets = presets;
    state.specCatalog = specData.instructions || [];
    state.specFiles = specData.specFiles;

    const sel = $("presetSelect");
    sel.innerHTML = presets.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");
    sel.addEventListener("change", () => {
      const p = state.presets.find((x) => x.id === sel.value);
      if (p) {
        state.currentCode = p.code;
        $("cEditor").value = p.code;
        renderCSource();
      }
    });

    if (presets.length > 0) {
      state.currentCode = presets[0].code;
      $("cEditor").value = presets[0].code;
    }

    renderRegisters(regSnap);
    renderSpecDrawer();
    await compileAndLoad();
  }

  // ── Compile & Load ───────────────────────────────────────────────────────────
  async function compileAndLoad() {
    if (state.editMode) {
      state.currentCode = $("cEditor").value;
    }
    const optLevel = $("optSelect").value;
    setStatusSeal("compiling", "COMPILING...");

    try {
      const res = await api("/api/compile", "POST", {
        code: state.currentCode,
        optLevel
      });

      if (!res.compiled) {
        setStatusSeal("trap", "BUILD ERROR");
        state.debugState = res.state;
        renderAll();
        alert("Clang Wasm32 compilation failed:\n\n" + (res.error || "Unknown error"));
        return;
      }

      state.parsedWasm = res.parsedWasm;
      state.m3Internals = res.m3Internals;
      state.debugState = res.state;

      if (state.editMode) {
        toggleEditMode(false);
      }

      await syncBreakpoints();
      renderAll();
      await loadMemoryView(state.memOffset);
    } catch (err) {
      setStatusSeal("trap", "ERROR");
      console.error(err);
    }
  }

  function toggleEditMode(force) {
    state.editMode = typeof force === "boolean" ? force : !state.editMode;
    if (state.editMode) {
      $("cEditor").value = state.currentCode;
      $("cEditor").classList.remove("hidden");
      $("cDebugView").classList.add("hidden");
      $("btnToggleEditMode").textContent = "Debug View";
    } else {
      state.currentCode = $("cEditor").value;
      $("cEditor").classList.add("hidden");
      $("cDebugView").classList.remove("hidden");
      $("btnToggleEditMode").textContent = "Edit Source";
      renderCSource();
    }
  }

  async function syncBreakpoints() {
    await api("/api/debug/breakpoints", "POST", {
      cLines: Array.from(state.cBreakpoints),
      wasmOffsets: Array.from(state.wasmBreakpoints)
    });
  }

  // ── Stepping Actions ─────────────────────────────────────────────────────────
  async function runStep(endpoint) {
    try {
      const ds = await api(endpoint, "POST");
      state.debugState = ds;
      renderAll();
      await loadMemoryView(state.memOffset);
    } catch (err) {
      console.error(err);
    }
  }

  async function resetExecution() {
    try {
      const res = await api("/api/debug/reset", "POST");
      if (res.m3Internals) state.m3Internals = res.m3Internals;
      if (res.state) state.debugState = res.state;
      renderAll();
      await loadMemoryView(state.memOffset);
    } catch (err) {
      console.error(err);
    }
  }

  // ── Renderers ────────────────────────────────────────────────────────────────
  function setStatusSeal(kind, text) {
    const seal = $("statusSeal");
    seal.className = "hanko-seal";
    if (kind === "paused") seal.classList.add("seal-paused");
    else if (kind === "completed") seal.classList.add("seal-completed");
    else if (kind === "trap") seal.classList.add("seal-trap");
    else seal.classList.add("seal-idle");
    seal.textContent = text;
  }

  function renderAll() {
    const ds = state.debugState;
    if (!ds) return;

    const sealMap = {
      idle: ["idle", "IDLE"],
      paused: ["paused", "PAUSED"],
      completed: ["completed", "DONE"],
      trap: ["trap", "TRAP"]
    };
    const [sk, st] = sealMap[ds.status] || ["idle", String(ds.status).toUpperCase()];
    setStatusSeal(sk, st);

    $("lblStepCount").textContent = ds.stepCount ?? 0;
    $("lblFuncName").textContent = ds.funcName || "—";
    $("lblCLine").textContent = ds.cLine != null ? `L${ds.cLine}` : "prologue";
    $("lblWasmPc").textContent = ds.wasmOffsetHex || "0x0000";
    $("lblOpcode").textContent = ds.mnemonic ? `${ds.mnemonic} (${ds.opcodeHex})` : "—";
    $("lblM3R0").textContent = ds.wasm3State ? `${ds.wasm3State.r0} (${ds.wasm3State.r0Hex})` : "0";

    const isPaused = ds.status === "paused";
    ["btnStepC", "btnStepOverC", "btnStepWasm", "btnStepOverWasm", "btnStepOut", "btnContinue"]
      .forEach((id) => { $(id).disabled = !isPaused; });

    renderCSource();
    renderWasmDisasm();
    renderAnatomy(ds.instructionSpec, ds);
    renderBinarySections();
    renderCallStackAndVars(ds);
    renderM3Internals(ds);
    renderRegisters(ds.hardware);
    renderConsoleAndBus(ds.hardware);
  }

  function renderCSource() {
    const lines = state.currentCode.split(/\r?\n/);
    const activeLine = state.debugState?.cLine ?? null;

    $("cDebugView").innerHTML = lines.map((txt, idx) => {
      const ln = idx + 1;
      const isActive = activeLine === ln;
      const hasBp = state.cBreakpoints.has(ln);
      return `<div class="c-line-row ${isActive ? "active-line" : ""}" data-cline="${ln}">
        <span class="bp-dot ${hasBp ? "bp-on" : ""}" title="Toggle C line breakpoint"></span>
        <span class="c-lineno">${ln}</span>
        <span class="c-code-text">${esc(txt || " ")}</span>
      </div>`;
    }).join("");

    const activeEl = $("cDebugView").querySelector(".active-line");
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function renderWasmDisasm() {
    const box = $("wasmDisasmList");
    const parsed = state.parsedWasm;
    if (!parsed || !parsed.instructions) {
      box.innerHTML = `<p class="empty-hint">No Wasm bytecode loaded.</p>`;
      return;
    }

    const activeOff = state.debugState?.status === "paused" ? state.debugState.wasmOffset : -1;
    let lastFunc = -1;
    const html = [];

    for (const instr of parsed.instructions) {
      if (instr.funcIndex !== lastFunc) {
        lastFunc = instr.funcIndex;
        const fnInfo = parsed.functions.find((f) => f.funcIndex === lastFunc);
        const localsStr = fnInfo && fnInfo.locals.length > 0 ? ` | locals: [${fnInfo.locals.join(", ")}]` : "";
        html.push(`<div class="disasm-func-hdr">fn[${lastFunc}] ${esc(instr.funcName)} ${esc(fnInfo?.signature || "")}${esc(localsStr)}</div>`);
      }

      const isActive = instr.fileOffset === activeOff;
      const hasBp = state.wasmBreakpoints.has(instr.fileOffset);
      const indent = "&nbsp;".repeat(Math.max(0, instr.depth - 1) * 2);
      const cLineLabel = instr.cLine != null ? `L${instr.cLine}` : "";

      html.push(`<div class="disasm-row ${isActive ? "active-pc" : ""}" data-offset="${instr.fileOffset}" data-opcode="${esc(instr.opcodeHex)}" data-mnem="${esc(instr.mnemonic)}" data-cline="${instr.cLine ?? ""}">
        <span class="bp-dot ${hasBp ? "bp-on" : ""}" data-bp-off="${instr.fileOffset}" title="Toggle Wasm instruction breakpoint"></span>
        <span class="wasm-off">0x${instr.fileOffset.toString(16).padStart(4, "0")}</span>
        <span class="wasm-hex" title="${esc(instr.rawHex)}">${esc(instr.rawHex)}</span>
        <span>${indent}<span class="wasm-mnem">${esc(instr.mnemonic)}</span> <span class="wasm-ops">${esc(instr.operands)}</span></span>
        <span class="wasm-cline">${cLineLabel}</span>
      </div>`);
    }

    box.innerHTML = html.join("");
    const activeRow = box.querySelector(".active-pc");
    if (activeRow) activeRow.scrollIntoView({ block: "nearest" });
  }

  function renderAnatomy(spec, ds) {
    const box = $("instructionAnatomyBox");
    if (!spec) {
      box.innerHTML = `<p class="empty-hint">No active instruction, or click an instruction in the disassembly view.</p>`;
      return;
    }

    box.innerHTML = `<div class="anatomy-card">
      <div class="anatomy-title">
        <code>${esc(spec.mnemonic)}</code>
        <span class="kv-tag">${esc(spec.opcodeHex)} · ${esc(spec.category)}</span>
      </div>
      <dl class="anatomy-kv">
        <dt>Binary Encoding</dt><dd>${esc(spec.binaryEncoding)}</dd>
        <dt>Stack Effect</dt><dd>${esc(spec.stackEffect)}</dd>
        <dt>Summary</dt><dd>${esc(spec.summary)}</dd>
        <dt>W3C Execution</dt><dd>${esc(spec.formalExecution)}</dd>
        <dt>Traps</dt><dd>${esc(spec.traps)}</dd>
        <dt>Wasm3 Internals</dt><dd>${esc(spec.wasm3Internals)}</dd>
      </dl>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <a href="/spec/${esc(spec.specAnchor)}" target="_blank" class="mini-btn btn-gold-outline">Open in W3C Spec ↗</a>
        ${ds?.returnValue ? `<span class="kv-tag">Return: ${esc(ds.returnValue.formatted)}</span>` : ""}
        ${ds?.trapMessage ? `<span class="kv-tag" style="color:var(--shuiro-red)">Trap: ${esc(ds.trapMessage)}</span>` : ""}
      </div>
    </div>`;
  }

  function renderBinarySections() {
    const box = $("wasmSectionsBox");
    const parsed = state.parsedWasm;
    if (!parsed) {
      box.innerHTML = `<p class="empty-hint">No Wasm module loaded.</p>`;
      return;
    }

    const rows = parsed.sections.map((s) => `<tr>
      <td>${s.id}</td>
      <td><strong>${esc(s.name)}</strong></td>
      <td>0x${s.fileOffset.toString(16).padStart(4, "0")}</td>
      <td>0x${s.payloadOffset.toString(16).padStart(4, "0")}</td>
      <td>${s.payloadLength} B</td>
      <td>${esc(s.summary)}</td>
    </tr>`).join("");

    box.innerHTML = `
      <div style="margin-bottom:8px;font-family:var(--font-mono);font-size:11px;">
        Magic: <strong>${esc(parsed.magicHex)}</strong> | Version: <strong>${parsed.version}</strong> | Total: <strong>${parsed.totalBytes} bytes</strong>
      </div>
      <table class="table-mini">
        <thead><tr><th>ID</th><th>Section</th><th>Header</th><th>Payload</th><th>Size</th><th>Summary</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderCallStackAndVars(ds) {
    // Call stack
    const csBox = $("callStackList");
    if (!ds.callStack || ds.callStack.length === 0) {
      csBox.innerHTML = `<div class="kv-item"><span>(No active call frames)</span></div>`;
    } else {
      csBox.innerHTML = [...ds.callStack].reverse().map((f) => `
        <div class="kv-item ${f.isActive ? "active-frame" : ""}">
          <span>#${f.depth} <strong>${esc(f.funcName)}</strong> @ ${esc(f.wasmOffsetHex)} ${f.cLine ? `(C L${f.cLine})` : ""}</span>
          <span class="kv-tag">_sp+${f.spSlotOffset}</span>
        </div>`).join("");
    }

    // Operand stack
    const osBox = $("operandStackList");
    if (!ds.operandStack || ds.operandStack.length === 0) {
      osBox.innerHTML = `<div class="kv-item"><span>(Stack empty)</span></div>`;
    } else {
      osBox.innerHTML = [...ds.operandStack].reverse().map((o) => `
        <div class="kv-item">
          <span>[${o.depthIndex}] <strong>${esc(o.type)}</strong> = ${esc(o.formatted)}</span>
          <span class="kv-tag">${esc(o.storage)}</span>
        </div>`).join("");
    }

    // DWARF C Variables
    const cvBox = $("cVarsList");
    if (!ds.cVariables || ds.cVariables.length === 0) {
      cvBox.innerHTML = `<div class="kv-item"><span>(No DWARF C variables in scope or optimized out by -O1/-O2)</span></div>`;
    } else {
      cvBox.innerHTML = ds.cVariables.map((v) => `
        <div class="kv-item">
          <span><strong>${esc(v.type)} ${esc(v.name)}</strong> = ${esc(v.value)} ${v.hex ? `(${esc(v.hex)})` : ""}</span>
          <span class="kv-tag">${esc(v.location)}</span>
        </div>`).join("");
    }

    // Wasm Locals
    const locBox = $("wasmLocalsList");
    locBox.innerHTML = (ds.wasmLocals || []).length === 0
      ? `<div class="kv-item"><span>(No locals)</span></div>`
      : ds.wasmLocals.map((l) => `
        <div class="kv-item">
          <span>local[${l.index}] (${esc(l.type)}) = ${esc(l.formatted)}</span>
          <span class="kv-tag">${esc(l.storage)}</span>
        </div>`).join("");

    // Wasm Globals
    const glBox = $("wasmGlobalsList");
    glBox.innerHTML = (ds.wasmGlobals || []).length === 0
      ? `<div class="kv-item"><span>(No globals)</span></div>`
      : ds.wasmGlobals.map((g) => `
        <div class="kv-item">
          <span>global[${g.index}] <strong>${esc(g.name)}</strong> (${esc(g.type)}) = ${esc(g.formatted)}</span>
          <span class="kv-tag">${g.mutable ? "mut" : "const"}</span>
        </div>`).join("");
  }

  function renderM3Internals(ds) {
    const m3 = ds.wasm3State;
    const box = $("m3InternalsBox");
    if (!m3) {
      box.innerHTML = `<p class="empty-hint">Wasm3 engine not active.</p>`;
    } else {
      const slotHtml = (m3.rawSlots || []).map((s) => `
        <div class="slot-pill" title="Signed i64: ${s.i64}">
          <strong>_sp[${s.slot}]</strong><br/>i32:${s.i32}<br/><span style="color:#7e6e58">${esc(s.hex.slice(0, 10))}..</span>
        </div>`).join("");

      box.innerHTML = `
        <div class="m3-reg-grid">
          <div class="m3-reg-card"><span class="lbl">M3 Threaded _pc</span><span class="val">${esc(m3.pc)}</span></div>
          <div class="m3-reg-card"><span class="lbl">M3 Value Stack _sp (slot +${m3.spSlotOffset})</span><span class="val">${esc(m3.sp)}</span></div>
          <div class="m3-reg-card"><span class="lbl">M3 Int Accumulator _r0</span><span class="val">${m3.r0} (${esc(m3.r0Hex)})</span></div>
          <div class="m3-reg-card"><span class="lbl">M3 Float Accumulator _fp0</span><span class="val">${m3.fp0}</span></div>
          <div class="m3-reg-card"><span class="lbl">M3CodePages (Total / Active)</span><span class="val">${m3.numCodePages} / ${m3.numActiveCodePages}</span></div>
          <div class="m3-reg-card"><span class="lbl">Frame Slots / LocalBytes / ConstBytes</span><span class="val">${m3.maxStackSlots} slots / ${m3.numLocalBytes}B / ${m3.numConstantBytes}B</span></div>
          <div class="m3-reg-card"><span class="lbl">M3MemoryHeader (_mem)</span><span class="val">${esc(m3.memHeader)}</span></div>
          <div class="m3-reg-card"><span class="lbl">Linear Memory Data Ptr (Size)</span><span class="val">${esc(m3.memData)} (${m3.memSizeBytes} B)</span></div>
        </div>
        <div style="margin-bottom:4px;font-weight:700;">Active Function M3 Stack Slots (_sp[0 .. ${Math.max(0, (m3.rawSlots?.length || 1) - 1)}]):</div>
        <div class="slot-pills">${slotHtml}</div>`;
    }

    // M3CodePage compiled traces summary
    const cpBox = $("m3CodePageBox");
    const intern = state.m3Internals;
    if (!intern || !intern.functions) {
      cpBox.innerHTML = `<p class="empty-hint">No M3CodePage compilation data available.</p>`;
    } else {
      cpBox.innerHTML = intern.functions.map((f) => `
        <div style="margin-bottom:8px;border:1px solid var(--washi-border);padding:6px;border-radius:3px;background:var(--washi-inset);">
          <div><strong>fn[${f.index}] ${esc(f.name)}</strong> ${f.isImport ? "(Host Import)" : `| compiledPc: ${esc(f.compiledPc)} | maxSlots: ${f.maxStackSlots} | localBytes: ${f.numLocalBytes} | traces: ${f.traces.length}`}</div>
          ${f.traces.length > 0 ? `<div style="margin-top:4px;font-size:10px;color:var(--sumi-soft);">
            ${f.traces.slice(0, 24).map((t) => `[#${t.id} wasm:0x${t.wasmOffset.toString(16)} op:0x${t.opcode.toString(16)} → pg${t.pageSeq}:${t.pageLine}]`).join(" ")}
            ${f.traces.length > 24 ? ` ... (+${f.traces.length - 24} more)` : ""}
          </div>` : ""}
        </div>`).join("");
    }
  }

  function renderRegisters(hw) {
    if (!hw || !hw.registers) return;

    const watch = hw.registers.filter((r) =>
      r.address <= 0x3F || r.value !== 0 || r.readCount > 0 || r.writeCount > 0
    );

    $("regWatchTable").innerHTML = watch.map((r) => {
      const cls = r.writtenInLastStep ? "reg-written" : (r.readInLastStep ? "reg-read" : "");
      const bin = r.value.toString(2).padStart(8, "0");
      return `<div class="reg-row ${cls}" data-regaddr="${r.address}" data-regval="${r.value}" title="Click to populate register editor">
        <span>${hexByte(r.address)}</span>
        <span>${esc(r.label)}</span>
        <span><strong>${hexByte(r.value)}</strong></span>
        <span>${r.value}</span>
        <span>${bin}</span>
        <span style="color:#7e6e58">R:${r.readCount} W:${r.writeCount}</span>
      </div>`;
    }).join("");

    $("regMatrixGrid").innerHTML = hw.registers.map((r) => {
      const cls = r.writtenInLastStep
        ? "reg-written"
        : (r.readInLastStep ? "reg-read" : (r.value !== 0 ? "nonzero" : ""));
      return `<div class="reg-cell ${cls}" data-regaddr="${r.address}" data-regval="${r.value}" title="${hexByte(r.address)} (${esc(r.label)}) = ${hexByte(r.value)} (${r.value})">
        <div style="font-size:8px;color:#8b7b63">${r.address.toString(16).toUpperCase().padStart(2, "0")}</div>
        <div>${r.value.toString(16).toUpperCase().padStart(2, "0")}</div>
      </div>`;
    }).join("");
  }

  function renderConsoleAndBus(hw) {
    if (!hw) return;

    const conBox = $("consoleLogBox");
    const logs = hw.consoleLog || [];
    conBox.innerHTML = logs.length === 0
      ? `<div class="log-line">(No console output yet)</div>`
      : logs.map((c) => `<div class="log-line log-kind-${esc(c.kind)}">[${esc(c.timestamp)} #${c.wasmStep}] [${esc(c.kind)}] ${esc(c.message)}</div>`).join("");
    conBox.scrollTop = conBox.scrollHeight;

    const busBox = $("busLogBox");
    const bus = hw.busLog || [];
    busBox.innerHTML = bus.length === 0
      ? `<div class="log-line">(No register I/O bus transactions yet)</div>`
      : bus.map((b) => `<div class="log-line">[#${b.wasmStep}] <strong>${esc(b.direction)}</strong> addr=${hexByte(b.address)} data=${hexByte(b.data)} (${b.data})</div>`).join("");
    busBox.scrollTop = busBox.scrollHeight;
  }

  async function loadMemoryView(offset) {
    state.memOffset = Math.max(0, offset);
    $("memOffsetInput").value = "0x" + state.memOffset.toString(16).toUpperCase().padStart(4, "0");

    try {
      const data = await api(`/api/debug/memory?offset=${state.memOffset}&length=256`);
      const box = $("linearMemDump");
      if (!data.bytes || data.bytes.length === 0) {
        box.innerHTML = `<p class="empty-hint">Linear memory size: ${data.totalSize} bytes (no data at offset)</p>`;
        return;
      }

      const binStr = atob(data.bytes);
      const changed = new Set(data.changedOffsets || []);
      const rows = [];

      for (let row = 0; row < binStr.length; row += 16) {
        const absRow = data.offset + row;
        const hexCells = [];
        let ascii = "";
        for (let col = 0; col < 16; col++) {
          if (row + col < binStr.length) {
            const b = binStr.charCodeAt(row + col);
            const abs = absRow + col;
            const cls = changed.has(abs) ? "changed" : (b !== 0 ? "nz" : "z");
            hexCells.push(`<span class="mem-b ${cls}">${b.toString(16).toUpperCase().padStart(2, "0")}</span>`);
            ascii += (b >= 32 && b <= 126) ? esc(String.fromCharCode(b)) : ".";
          }
        }
        rows.push(`<div class="mem-row">
          <span class="mem-addr">0x${absRow.toString(16).toUpperCase().padStart(4, "0")}</span>
          <span class="mem-bytes">${hexCells.join("")}</span>
          <span class="mem-ascii">${ascii}</span>
        </div>`);
      }

      box.innerHTML = rows.join("");
    } catch (err) {
      console.error(err);
    }
  }

  // ── W3C Spec Drawer ──────────────────────────────────────────────────────────
  function renderSpecDrawer(filter = "") {
    if (state.specFiles) {
      const okCount = state.specFiles.files.filter((f) => f.exists && f.bytes > 0).length;
      $("specFileStatus").textContent = `Local W3C Spec Cache: ${okCount}/${state.specFiles.files.length} files downloaded (${state.specFiles.files.map((f) => `${f.file}: ${(f.bytes / 1024).toFixed(0)}KB`).join(", ")})`;
    }

    const q = filter.trim().toLowerCase();
    const list = q
      ? state.specCatalog.filter((s) =>
          s.mnemonic.toLowerCase().includes(q) ||
          s.opcodeHex.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q))
      : state.specCatalog;

    $("specOpcodeList").innerHTML = list.map((s) => `
      <div class="spec-op-item ${state.selectedSpecOpcode === s.opcodeHex ? "selected" : ""}" data-op="${esc(s.opcodeHex)}">
        <span>${esc(s.opcodeHex)}</span>
        <span>${esc(s.mnemonic)}</span>
        <span style="color:#7e6e58;font-size:10px">${esc(s.category)}</span>
      </div>`).join("");

    if (!state.selectedSpecOpcode && list.length > 0) {
      selectSpecItem(list[0].opcodeHex);
    }
  }

  function selectSpecItem(opcodeHex) {
    const s = state.specCatalog.find((x) => x.opcodeHex === opcodeHex);
    if (!s) return;
    state.selectedSpecOpcode = opcodeHex;
    $("specOpcodeList").querySelectorAll(".spec-op-item").forEach((el) => {
      el.classList.toggle("selected", el.dataset.op === opcodeHex);
    });

    $("specDetailPane").innerHTML = `<div class="anatomy-card">
      <div class="anatomy-title">
        <code>${esc(s.mnemonic)}</code>
        <span class="kv-tag">${esc(s.opcodeHex)} · ${esc(s.category)}</span>
      </div>
      <dl class="anatomy-kv">
        <dt>Binary Encoding</dt><dd>${esc(s.binaryEncoding)}</dd>
        <dt>Stack Effect</dt><dd>${esc(s.stackEffect)}</dd>
        <dt>Summary</dt><dd>${esc(s.summary)}</dd>
        <dt>Execution Rule</dt><dd>${esc(s.formalExecution)}</dd>
        <dt>Trap Conditions</dt><dd>${esc(s.traps)}</dd>
        <dt>Wasm3 Internals</dt><dd>${esc(s.wasm3Internals)}</dd>
      </dl>
      <div style="margin-top:12px;">
        <a href="/spec/${esc(s.specAnchor)}" target="_blank" class="mini-btn btn-gold-outline">Open section in offline W3C Spec ↗</a>
      </div>
    </div>`;
  }

  // ── Event Bindings ───────────────────────────────────────────────────────────
  $("btnCompile").addEventListener("click", compileAndLoad);
  $("btnToggleEditMode").addEventListener("click", () => toggleEditMode());
  $("btnStepC").addEventListener("click", () => runStep("/api/debug/step-c"));
  $("btnStepOverC").addEventListener("click", () => runStep("/api/debug/step-over-c"));
  $("btnStepWasm").addEventListener("click", () => runStep("/api/debug/step-wasm"));
  $("btnStepOverWasm").addEventListener("click", () => runStep("/api/debug/step-over-wasm"));
  $("btnStepOut").addEventListener("click", () => runStep("/api/debug/step-out"));
  $("btnContinue").addEventListener("click", () => runStep("/api/debug/continue"));
  $("btnResetExec").addEventListener("click", resetExecution);

  $("cDebugView").addEventListener("click", async (e) => {
    const row = e.target.closest(".c-line-row");
    if (!row) return;
    const ln = parseInt(row.dataset.cline, 10);
    if (state.cBreakpoints.has(ln)) state.cBreakpoints.delete(ln);
    else state.cBreakpoints.add(ln);
    await syncBreakpoints();
    renderCSource();
  });

  $("cDebugView").addEventListener("mouseover", (e) => {
    const row = e.target.closest(".c-line-row");
    if (!row) return;
    const ln = row.dataset.cline;
    $("wasmDisasmList").querySelectorAll(".disasm-row").forEach((r) => {
      r.classList.toggle("c-mapped-hl", r.dataset.cline === ln);
    });
  });

  $("wasmDisasmList").addEventListener("click", async (e) => {
    const bpDot = e.target.closest("[data-bp-off]");
    if (bpDot) {
      const off = parseInt(bpDot.dataset.bpOff, 10);
      if (state.wasmBreakpoints.has(off)) state.wasmBreakpoints.delete(off);
      else state.wasmBreakpoints.add(off);
      await syncBreakpoints();
      renderWasmDisasm();
      return;
    }

    const row = e.target.closest(".disasm-row");
    if (row) {
      const opHex = row.dataset.opcode;
      const mnem = row.dataset.mnem;
      const spec = state.specCatalog.find((s) => s.opcodeHex === opHex || s.mnemonic === mnem);
      if (spec) {
        renderAnatomy(spec, state.debugState);
      }
    }
  });

  $("btnWriteReg").addEventListener("click", async () => {
    const addr = parseNum($("regEditAddr").value) & 0xFF;
    const val = parseNum($("regEditVal").value) & 0xFF;
    const hw = await api("/api/registers/write", "POST", { address: addr, data: val });
    renderRegisters(hw);
    renderConsoleAndBus(hw);
  });

  $("btnResetRegs").addEventListener("click", async () => {
    const hw = await api("/api/registers/reset", "POST");
    renderRegisters(hw);
    renderConsoleAndBus(hw);
  });

  const onRegClick = (e) => {
    const el = e.target.closest("[data-regaddr]");
    if (!el) return;
    $("regEditAddr").value = hexByte(parseInt(el.dataset.regaddr, 10));
    $("regEditVal").value = hexByte(parseInt(el.dataset.regval, 10));
  };
  $("regWatchTable").addEventListener("click", onRegClick);
  $("regMatrixGrid").addEventListener("click", onRegClick);

  $("btnMemLoad").addEventListener("click", () => loadMemoryView(parseNum($("memOffsetInput").value)));
  $("btnMemZero").addEventListener("click", () => loadMemoryView(0));
  $("btnMemSP").addEventListener("click", () => {
    const sp = state.debugState?.memory?.stackPointer ?? 0;
    const aligned = Math.max(0, sp - 128) & ~15;
    loadMemoryView(aligned);
  });

  $("btnOpenSpec").addEventListener("click", () => {
    $("specModal").classList.remove("hidden");
    renderSpecDrawer($("specSearchInput").value);
  });
  $("btnCloseSpec").addEventListener("click", () => $("specModal").classList.add("hidden"));
  $("specSearchInput").addEventListener("input", (e) => renderSpecDrawer(e.target.value));
  $("specOpcodeList").addEventListener("click", (e) => {
    const item = e.target.closest(".spec-op-item");
    if (item) selectSpecItem(item.dataset.op);
  });
  $("btnRefreshSpec").addEventListener("click", async () => {
    $("specFileStatus").textContent = "Downloading latest W3C WebAssembly Core Specification...";
    try {
      const files = await api("/api/spec/download", "POST");
      state.specFiles = files;
      renderSpecDrawer($("specSearchInput").value);
    } catch (err) {
      $("specFileStatus").textContent = "Download failed: " + err.message;
    }
  });

  init();
})();
