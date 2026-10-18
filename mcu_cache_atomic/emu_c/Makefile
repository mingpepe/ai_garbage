CC      := gcc
CFLAGS  := -O0 -g -Wall -Wextra -std=c11

all: emu_c

emu_c: main.c soc.c gdb_stub.c soc.h gdb_stub.h
	$(CC) $(CFLAGS) main.c soc.c gdb_stub.c -o emu_c

clean:
	rm -f emu_c

.PHONY: all clean
