#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "===================================================================="
echo "  [1/3] Compiling Verilog RTL & Testbench with Icarus Verilog..."
echo "===================================================================="
iverilog -Wall -g2012 -o mcu_bus_tb.vvp \
    rtl/bus_arbiter.v \
    rtl/uart_rx.v \
    rtl/i2c_tx.v \
    rtl/sram.v \
    rtl/nvic.v \
    rtl/dma_controller.v \
    rtl/cpu_core.v \
    rtl/mcu_top.v \
    tb/tb_mcu_top.v

echo ""
echo "===================================================================="
echo "  [2/3] Running Simulation & Generating VCD (mcu_bus.vcd)..."
echo "===================================================================="
vvp mcu_bus_tb.vvp

if [ -d "../ts_web_mcu_bus/public" ]; then
    cp -f mcu_bus.vcd ../ts_web_mcu_bus/public/mcu_bus.vcd
    echo "[INFO] Synced mcu_bus.vcd -> ../ts_web_mcu_bus/public/mcu_bus.vcd"
fi

echo ""
echo "===================================================================="
echo "  [3/3] VCD Artifact Ready: $SCRIPT_DIR/mcu_bus.vcd"
echo "===================================================================="

if [[ "${1:-}" == "--gtkwave" || "${1:-}" == "--wave" ]]; then
    echo "[INFO] Launching GTKWave..."
    gtkwave mcu_bus.vcd mcu_bus.gtkw &
fi
