#!/usr/bin/env python3
import os
import sys
import json
import subprocess
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ROOT_DIR   = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_DIR    = os.path.abspath(os.path.dirname(__file__))
TRACES_DIR = os.path.join(ROOT_DIR, "traces")
FW_DIR     = os.path.join(ROOT_DIR, "fw")

DEMO_MAP = {
    "demo1": {
        "id": "demo1",
        "name": "Demo 1: Store Buffer Forwarding, Drain & MESI Protocol",
        "fw_name": "demo1_sb_mesi",
        "c_src": "demo1_sb_mesi.c",
        "shm_labels": [
            "SHARED_DATA (0x1000)",
            "SYNC_STEP (0x1004)",
            "CORE0_OBS (0x1008)",
            "CORE1_OBS (0x100C)",
            "SHM_4 (0x1010)",
            "SHM_5 (0x1014)",
            "SHM_6 (0x1018)",
            "SHM_7 (0x101C)"
        ]
    },
    "demo2": {
        "id": "demo2",
        "name": "Demo 2: Naive Lock Race vs Atomic Spinlocks (LR/SC & AMOSWAP)",
        "fw_name": "demo2_spinlock",
        "c_src": "demo2_spinlock.c",
        "shm_labels": [
            "LOCK_VAR (0x1000)",
            "NAIVE_COUNTER (0x1004)",
            "LRSC_COUNTER (0x1008)",
            "AMO_COUNTER (0x100C)",
            "SHARED_BALANCE (0x1010)",
            "BARRIER_SYNC (0x1014)",
            "SHM_6 (0x1018)",
            "SHM_7 (0x101C)"
        ]
    },
    "demo3": {
        "id": "demo3",
        "name": "Demo 3: CPU Instruction Reordering (ROB OoO & Store-Load Litmus Test)",
        "fw_name": "demo3_reorder",
        "c_src": "demo3_reorder.c",
        "shm_labels": [
            "VAR_X (0x1000)",
            "VAR_Y (0x1004)",
            "NOFENCE_R0 (0x1008)",
            "NOFENCE_R1 (0x100C)",
            "FENCED_R0 (0x1010)",
            "FENCED_R1 (0x1014)",
            "FAST_HIT_VAR (0x1018)",
            "SYNC_BARRIER (0x101C)"
        ]
    }
}

def load_demo_bundle(demo_id):
    if demo_id not in DEMO_MAP:
        return None
    info = DEMO_MAP[demo_id]
    fw_name = info["fw_name"]

    c_trace_path = os.path.join(TRACES_DIR, f"{demo_id}_c.json")
    v_trace_path = os.path.join(TRACES_DIR, f"{demo_id}_verilog.json")
    meta_path    = os.path.join(FW_DIR, "build", f"{fw_name}_meta.json")
    c_src_path   = os.path.join(FW_DIR, info["c_src"])
    hdr_path     = os.path.join(FW_DIR, "atomic_spinlock.h")

    c_trace = json.load(open(c_trace_path)) if os.path.exists(c_trace_path) else None
    v_trace = json.load(open(v_trace_path)) if os.path.exists(v_trace_path) else None
    meta    = json.load(open(meta_path))    if os.path.exists(meta_path)    else {"disasm": {}, "labels": {}}
    c_code  = open(c_src_path).read()       if os.path.exists(c_src_path)   else ""
    h_code  = open(hdr_path).read()         if os.path.exists(hdr_path)     else ""

    return {
        "info": info,
        "meta": meta,
        "c_code": c_code,
        "h_code": h_code,
        "c_trace": c_trace,
        "verilog_trace": v_trace
    }

class EmulatorRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        pass

    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/trace":
            qs = parse_qs(parsed.query)
            demo_id = qs.get("demo", ["demo1"])[0]
            bundle = load_demo_bundle(demo_id)
            if not bundle:
                self._send_json({"error": f"Unknown demo {demo_id}"}, 404)
                return
            self._send_json(bundle)
            return
        elif parsed.path == "/api/demos":
            self._send_json({"demos": list(DEMO_MAP.values())})
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/rebuild":
            try:
                script = os.path.join(ROOT_DIR, "build_and_run.sh")
                proc = subprocess.run(
                    ["bash", script, "--no-server"],
                    cwd=ROOT_DIR,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                self._send_json({
                    "ok": proc.returncode == 0,
                    "stdout": proc.stdout,
                    "stderr": proc.stderr
                })
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, 500)
            return
        self._send_json({"error": "Not found"}, 404)

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = HTTPServer(("0.0.0.0", port), EmulatorRequestHandler)
    print(f"[Web UI Server] Listening on http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")

if __name__ == "__main__":
    main()
