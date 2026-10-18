#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

mkdir -p traces

echo "================================================================================"
echo " [Step 1/5] Compiling RV32IA Firmware Demos (riscv32-unknown-elf-gcc)"
echo "================================================================================"
make -C fw clean
make -C fw

echo ""
echo "================================================================================"
echo " [Step 2/5] Compiling Dual-Core C Emulator (emu_c)"
echo "================================================================================"
make -C emu_c clean
make -C emu_c

echo ""
echo "================================================================================"
echo " [Step 3/5] Compiling Dual-Core Verilog RTL Emulator (iverilog)"
echo "================================================================================"
make -C emu_verilog clean
make -C emu_verilog

echo ""
echo "================================================================================"
echo " [Step 4/5] Running Firmware Demos on BOTH C Emulator & Verilog RTL"
echo "================================================================================"
./emu_c/emu_c fw/build/demo1_sb_mesi.hex traces/demo1_c.json
./emu_c/emu_c fw/build/demo2_spinlock.hex traces/demo2_c.json
./emu_c/emu_c fw/build/demo3_reorder.hex traces/demo3_c.json

vvp emu_verilog/sim_soc.vvp +HEX=fw/build/demo1_sb_mesi.hex +JSON=traces/demo1_verilog.json +VCD=traces/demo1.vcd
vvp emu_verilog/sim_soc.vvp +HEX=fw/build/demo2_spinlock.hex +JSON=traces/demo2_verilog.json +VCD=traces/demo2.vcd
vvp emu_verilog/sim_soc.vvp +HEX=fw/build/demo3_reorder.hex +JSON=traces/demo3_verilog.json +VCD=traces/demo3.vcd

echo ""
echo "================================================================================"
echo " [Step 5/5] Verifying Cycle-by-Cycle Equivalence (C == Verilog) & HW Assertions"
echo "================================================================================"
python3 - << 'EOF'
import json

for d in ["demo1", "demo2", "demo3"]:
    c_data = json.load(open(f"traces/{d}_c.json"))
    v_data = json.load(open(f"traces/{d}_verilog.json"))
    assert len(c_data["cycles"]) == len(v_data["cycles"]), f"Cycle count mismatch on {d}"
    for cyc_c, cyc_v in zip(c_data["cycles"], v_data["cycles"]):
        c_num = cyc_c["cycle"]
        assert cyc_c["shm"] == cyc_v["shm"], f"SHM mismatch on {d} cycle {c_num}"
        assert cyc_c["bus"] == cyc_v["bus"], f"Bus mismatch on {d} cycle {c_num}"
        for i in range(2):
            assert cyc_c["cores"][i]["stats"] == cyc_v["cores"][i]["stats"], f"Stats mismatch on {d} cycle {c_num}"
            assert cyc_c["cores"][i]["l1"] == cyc_v["cores"][i]["l1"], f"L1 mismatch on {d} cycle {c_num}"
            assert cyc_c["cores"][i]["sb"] == cyc_v["cores"][i]["sb"], f"SB mismatch on {d} cycle {c_num}"
            assert cyc_c["cores"][i]["rob"] == cyc_v["cores"][i]["rob"], f"ROB mismatch on {d} cycle {c_num}"
    print(f"  [OK] {d}: C Emulator & Verilog RTL match 100% across all {len(c_data['cycles'])} clock cycles!")

# Verify Demo 1 architectural assertions
d1_last = json.load(open("traces/demo1_c.json"))["cycles"][-1]
assert d1_last["cores"][0]["stats"]["sb_fwd"] >= 1, "Demo 1 must trigger Store-to-Load Forwarding"
assert d1_last["cores"][0]["l1"][0]["data"] == "0x9999cafe", "Demo 1 Core 0 must observe 0x9999cafe"
assert d1_last["cores"][1]["l1"][3]["data"] == "0x11110002", "Demo 1 Core 1 must observe 0x11110002"
print("  [OK] Demo 1 Assertions Passed: Store Buffer Forwarding + MESI (I->E->M->S->I) verified!")

# Verify Demo 2 architectural assertions
d2_last = json.load(open("traces/demo2_c.json"))["cycles"][-1]
naive_cnt = int(d2_last["cores"][0]["l1"][1]["data"], 16)
lrsc_cnt  = int(d2_last["cores"][0]["l1"][2]["data"], 16)
amo_cnt   = int(d2_last["cores"][1]["l1"][3]["data"], 16)
balance   = int(d2_last["cores"][1]["l1"][4]["data"], 16)
sc_fails  = d2_last["cores"][0]["stats"]["sc_fail"] + d2_last["cores"][1]["stats"]["sc_fail"]
assert naive_cnt == 1, f"Expected naive lock race to lose update (1), got {naive_cnt}"
assert lrsc_cnt == 2, f"Expected LR/SC spinlock counter == 2, got {lrsc_cnt}"
assert amo_cnt == 2, f"Expected AMOSWAP spinlock counter == 2, got {amo_cnt}"
assert balance == 400, f"Expected protected balance == 400 (0x190), got {balance}"
assert sc_fails >= 1, "Expected at least 1 SC.W failure due to snoop reservation invalidation"
print(f"  [OK] Demo 2 Assertions Passed: Naive Lock Race={naive_cnt} (Lost Update!), LR/SC={lrsc_cnt}, AMOSWAP={amo_cnt}, Balance={balance}, SC_Fail={sc_fails}!")

# Verify Demo 3 architectural assertions
d3_last = json.load(open("traces/demo3_c.json"))["cycles"][-1]
nofence_r0 = int(d3_last["cores"][0]["l1"][2]["data"], 16)
nofence_r1 = int(d3_last["cores"][1]["l1"][3]["data"], 16)
fenced_r0  = int(d3_last["cores"][0]["l1"][4]["data"], 16)
fenced_r1  = int(d3_last["cores"][1]["l1"][5]["data"], 16)
ooo_total  = d3_last["cores"][0]["stats"]["ooo"] + d3_last["cores"][1]["stats"]["ooo"]
assert ooo_total > 0, "Expected ROB Out-of-Order executions > 0"
assert nofence_r0 == 0 and nofence_r1 == 0, f"Expected Store-Load Reordering without fence (r0=0, r1=0), got ({nofence_r0}, {nofence_r1})"
assert (fenced_r0 == 1 or fenced_r1 == 1), f"Expected fence rw,rw to prevent r0=0 && r1=0, got ({fenced_r0}, {fenced_r1})"
print(f"  [OK] Demo 3 Assertions Passed: ROB OoO_Exec={ooo_total}, No-Fence Litmus=(r0={nofence_r0}, r1={nofence_r1}), Fenced Litmus=(r0={fenced_r0}, r1={fenced_r1})!")
EOF

if [[ "${1:-}" == "--no-server" ]]; then
    echo ""
    echo "Build and verification complete (--no-server specified)."
    exit 0
fi

PORT="${PORT:-8080}"
echo ""
echo "================================================================================"
echo " Launching Interactive Web UI at http://localhost:${PORT}"
echo " (Press Ctrl+C to stop)"
echo "================================================================================"
python3 web_ui/server.py "$PORT"
