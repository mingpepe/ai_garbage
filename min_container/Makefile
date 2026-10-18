CC = gcc
CFLAGS = -Wall -Wextra -O2

all: min_container

min_container: container.c
	$(CC) $(CFLAGS) -o min_container container.c

rootfs:
	chmod +x prepare_rootfs.sh
	./prepare_rootfs.sh

run: min_container rootfs
	sudo ./min_container ./rootfs /bin/sh

clean:
	rm -f min_container
	rm -rf rootfs

.PHONY: all rootfs run clean
