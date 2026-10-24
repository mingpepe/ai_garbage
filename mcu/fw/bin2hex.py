#!/usr/bin/env python3
import sys

def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.bin> <output.hex>")
        sys.exit(1)

    in_path, out_path = sys.argv[1], sys.argv[2]
    with open(in_path, "rb") as f:
        data = f.read()

    # Pad to 4-byte boundary
    if len(data) % 4 != 0:
        data += b"\x00" * (4 - (len(data) % 4))

    total_words = 4096  # 16 KB = 4096 32-bit words
    words_written = 0

    with open(out_path, "w") as out:
        for i in range(0, len(data), 4):
            word = int.from_bytes(data[i:i+4], byteorder="little")
            out.write(f"{word:08x}\n")
            words_written += 1
        while words_written < total_words:
            out.write("00000000\n")
            words_written += 1

if __name__ == "__main__":
    main()
