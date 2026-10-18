#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-all}"

run_verilog() {
    echo ""
    echo ">>> [VERILOG RTL] Compiling & Running Testbench (iverilog + vvp)..."
    bash "$ROOT_DIR/verilog_mcu_bus/run_sim.sh"
}

run_c() {
    echo ""
    echo ">>> [C99 ENGINE] Compiling & Running C Simulator..."
    make -C "$ROOT_DIR/c_mcu_bus" clean
    make -C "$ROOT_DIR/c_mcu_bus" run
}

build_csharp() {
    echo ""
    echo ">>> [C# WPF UI] Building .NET WPF Application..."
    dotnet build "$ROOT_DIR/csharp_wpf_mcu_bus"
}

build_ts_web() {
    echo ""
    echo ">>> [TYPESCRIPT WEB UI] Building Web App (with GTKWave Viewer & VCD Loader)..."
    npm run build --prefix "$ROOT_DIR/ts_web_mcu_bus"
}

case "$MODE" in
    --verilog|verilog)
        run_verilog
        ;;
    --c|c)
        run_c
        ;;
    --csharp|csharp)
        build_csharp
        ;;
    --web|web)
        run_verilog
        build_ts_web
        echo ""
        echo ">>> Starting TypeScript Web App Dev Server..."
        npm run dev --prefix "$ROOT_DIR/ts_web_mcu_bus"
        ;;
    --gtkwave|gtkwave)
        bash "$ROOT_DIR/verilog_mcu_bus/run_sim.sh" --gtkwave
        ;;
    all|*)
        run_verilog
        run_c
        build_csharp
        build_ts_web
        echo ""
        echo "================================================================================"
        echo "  ALL SIMULATIONS & BUILDS COMPLETED SUCCESSFULLY!"
        echo "--------------------------------------------------------------------------------"
        echo "  1. Verilog VCD File : verilog_mcu_bus/mcu_bus.vcd"
        echo "     GTKWave Config   : verilog_mcu_bus/mcu_bus.gtkw"
        echo "     Open in GTKWave  : ./run_sim.sh --gtkwave"
        echo "  2. C99 VCD File     : c_mcu_bus/mcu_bus_c.vcd"
        echo "  3. C# WPF App       : dotnet run --project csharp_wpf_mcu_bus"
        echo "  4. TS Web App UI    : ./run_sim.sh --web"
        echo "================================================================================"
        ;;
esac
