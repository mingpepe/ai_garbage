#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HEX_FILE="${1:-fw/build/demo2_spinlock.hex}"
PORT="${2:-3333}"

# Build firmware and C emulator with debug symbols
make -C fw >/dev/null
make -C emu_c >/dev/null

# Kill any existing emu_c GDB server on this port
pkill -f "emu_c.*--gdb ${PORT}" 2>/dev/null || true
sleep 0.1

# Start emu_c GDB server in background
nohup ./emu_c/emu_c "$HEX_FILE" --gdb "$PORT" > /tmp/emu_c_gdb.log 2>&1 &

# Wait until port is listening
for _ in {1..20}; do
    if grep -q "listening on" /tmp/emu_c_gdb.log 2>/dev/null; then
        echo "[OK] GDB Server ready on 127.0.0.1:${PORT} for ${HEX_FILE}"
        exit 0
    fi
    sleep 0.1
done

cat /tmp/emu_c_gdb.log
exit 1
