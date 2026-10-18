CC ?= gcc
CFLAGS ?= -Wall -Wextra -O2 -std=c99 -Iinclude

SRCS = src/sram.c \
       src/uart.c \
       src/i2c.c \
       src/nvic.c \
       src/dma.c \
       src/cpu.c \
       src/bus.c \
       src/mcu_system.c \
       main.c

OBJS = $(SRCS:.c=.o)
TARGET = mcu_bus_sim

.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $(OBJS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(OBJS) $(TARGET)
