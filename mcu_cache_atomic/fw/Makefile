CROSS   ?= /opt/riscv/bin/riscv32-unknown-elf-
CC      := $(CROSS)gcc
OBJCOPY := $(CROSS)objcopy
OBJDUMP := $(CROSS)objdump

CFLAGS  := -march=rv32ia_zicsr -mabi=ilp32 -O1 -gdwarf-4 -ffreestanding -nostdlib \
           -fno-builtin -mstrict-align -Wall -Wextra -T link.ld

DEMOS   := demo1_sb_mesi demo2_spinlock demo3_reorder
BUILD   := build

all: $(patsubst %,$(BUILD)/%.hex,$(DEMOS))

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/%.elf: start.S %.c atomic_spinlock.h link.ld | $(BUILD)
	$(CC) $(CFLAGS) start.S $*.c -o $@

$(BUILD)/%.bin: $(BUILD)/%.elf
	$(OBJCOPY) -O binary $< $@

$(BUILD)/%.dump: $(BUILD)/%.elf
	$(OBJDUMP) -d -M no-aliases $< > $@

$(BUILD)/%.hex: $(BUILD)/%.bin $(BUILD)/%.dump
	python3 bin2hex.py $(BUILD)/$*.bin $(BUILD)/$*.dump $@ $(BUILD)/$*_meta.json

clean:
	rm -rf $(BUILD)

.PHONY: all clean
.PRECIOUS: $(BUILD)/%.elf $(BUILD)/%.bin $(BUILD)/%.dump
