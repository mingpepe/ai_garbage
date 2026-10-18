#!/usr/bin/env python3
import sys
import struct
import json
import re

def main():
    if len(sys.argv) < 4:
        print("Usage: bin2hex.py <input.bin> <input.dump> <output.hex> [output_meta.json]")
        sys.exit(1)

    bin_path = sys.argv[1]
    dump_path = sys.argv[2]
    hex_path = sys.argv[3]
    meta_path = sys.argv[4] if len(sys.argv) > 4 else None

    with open(bin_path, "rb") as f:
        data = f.read()

    # Pad to 4-byte boundary
    while len(data) % 4 != 0:
        data += b"\x00"

    words = []
    for i in range(0, len(data), 4):
        w = struct.unpack("<I", data[i:i+4])[0]
        words.append(w)

    # Write 1024-word ROM hex file for Verilog $readmemh and C emulator
    ROM_WORDS = 1024
    with open(hex_path, "w") as f:
        for i in range(ROM_WORDS):
            w = words[i] if i < len(words) else 0x00000013  # NOP (addi x0, x0, 0)
            f.write(f"{w:08x}\n")

    if meta_path:
        disasm = {}
        labels = {}
        with open(dump_path, "r") as f:
            for line in f:
                # Match label header: 0000001c <main>:
                m_lbl = re.match(r"^([0-9a-fA-F]{8})\s+<([^>]+)>:", line.strip())
                if m_lbl:
                    addr = int(m_lbl.group(1), 16)
                    labels[f"0x{addr:04x}"] = m_lbl.group(2)
                    continue
                # Match instruction line:   20: 00050513          mv a0,a0
                m_ins = re.match(r"^\s*([0-9a-fA-F]+):\s+([0-9a-fA-F]{8})\s+(.*)$", line)
                if m_ins:
                    addr = int(m_ins.group(1), 16)
                    asm_text = re.sub(r"\s+", " ", m_ins.group(3).split("#")[0].strip())
                    disasm[f"0x{addr:04x}"] = asm_text

        with open(meta_path, "w") as f:
            json.dump({"disasm": disasm, "labels": labels, "word_count": len(words)}, f, indent=2)

if __name__ == "__main__":
    main()
