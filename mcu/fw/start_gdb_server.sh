#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# 1. Ensure firmware and C# simulator are built
make fw
/home/kk/.dotnet/dotnet build csharp_soc -v q

# 2. If GDB server is already listening on 3333 & 3334, reuse it
if python3 -c "import socket; s=socket.socket(); s.settimeout(0.2); s.connect(('127.0.0.1', 3333)); s.close()" 2>/dev/null; then
    echo "[SoC GDB Server] Already running on ports 3333 (Core 0) & 3334 (Core 1)."
    exit 0
fi

# 3. Start C# Dual-Core SoC GDB Server in background
nohup /home/kk/.dotnet/dotnet run --no-build --project csharp_soc -- --gdb > /tmp/soc_gdb_server.log 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > /tmp/soc_gdb_server.pid

# 4. Wait until ports 3333 & 3334 are ready
for i in {1..30}; do
    if python3 -c "import socket; s=socket.socket(); s.settimeout(0.2); s.connect(('127.0.0.1', 3333)); s.close()" 2>/dev/null; then
        echo "[SoC GDB Server] Started (PID $SERVER_PID) on ports 3333 (Core 0) & 3334 (Core 1)."
        exit 0
    fi
    sleep 0.1
done

echo "[SoC GDB Server] ERROR: Failed to start GDB server. Log:"
cat /tmp/soc_gdb_server.log
exit 1
