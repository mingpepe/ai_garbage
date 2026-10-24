# ============================================================================
# Top-Level Makefile for Dual-Core RISC-V SoC (Verilog + FW + C# + GDB Debug)
# ============================================================================

RISCV_PREFIX ?= /opt/riscv/bin/riscv32-unknown-elf-
CC           := $(RISCV_PREFIX)gcc
OBJCOPY      := $(RISCV_PREFIX)objcopy
OBJDUMP      := $(RISCV_PREFIX)objdump
GDB          := $(RISCV_PREFIX)gdb
DOTNET       := /home/kk/.dotnet/dotnet

CFLAGS       := -g -O1 -march=rv32ima_zicsr -mabi=ilp32 -nostdlib -ffreestanding -Wall -Wextra

BUILD_DIR    := fw/build
RTL_SRCS     := rtl/sram.v rtl/clint_ipi_boot.v rtl/i2c_regbank_subsys.v rtl/soc_interconnect.v rtl/riscv_core.v rtl/dual_core_soc.v
TB_SRCS      := tb/tb_soc.v
VCD_FILE     := soc_wave.vcd
GTKW_FILE    := tb/view_wave.gtkw

.PHONY: all fw sim csharp wave gdb-server gdb-test clean

all: fw sim csharp

# ----------------------------------------------------------------------------
# 1. Build Core 0 & Core 1 Firmware (.elf, .bin, .hex, .dump)
# ----------------------------------------------------------------------------
fw: $(BUILD_DIR)/fw_core0.hex $(BUILD_DIR)/fw_core1.hex

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/fw_core0.elf: fw/core0/start_core0.S fw/core0/main_core0.c fw/core0/link_core0.ld fw/common/*.h | $(BUILD_DIR)
	$(CC) $(CFLAGS) -T fw/core0/link_core0.ld fw/core0/start_core0.S fw/core0/main_core0.c -o $@
	$(OBJDUMP) -d -S $@ > $(BUILD_DIR)/fw_core0.dump

$(BUILD_DIR)/fw_core0.bin: $(BUILD_DIR)/fw_core0.elf
	$(OBJCOPY) -O binary $< $@

$(BUILD_DIR)/fw_core0.hex: $(BUILD_DIR)/fw_core0.bin fw/bin2hex.py
	python3 fw/bin2hex.py $< $@

$(BUILD_DIR)/fw_core1.elf: fw/core1/start_core1.S fw/core1/main_core1.c fw/core1/link_core1.ld fw/common/*.h | $(BUILD_DIR)
	$(CC) $(CFLAGS) -T fw/core1/link_core1.ld fw/core1/start_core1.S fw/core1/main_core1.c -o $@
	$(OBJDUMP) -d -S $@ > $(BUILD_DIR)/fw_core1.dump

$(BUILD_DIR)/fw_core1.bin: $(BUILD_DIR)/fw_core1.elf
	$(OBJCOPY) -O binary $< $@

$(BUILD_DIR)/fw_core1.hex: $(BUILD_DIR)/fw_core1.bin fw/bin2hex.py
	python3 fw/bin2hex.py $< $@

# ----------------------------------------------------------------------------
# 2. Compile & Run Verilog SoC Simulation (generates soc_wave.vcd)
# ----------------------------------------------------------------------------
$(BUILD_DIR)/soc_sim.vvp: $(RTL_SRCS) $(TB_SRCS) fw
	iverilog -g2012 -o $@ $(RTL_SRCS) $(TB_SRCS)

sim: $(BUILD_DIR)/soc_sim.vvp
	vvp $(BUILD_DIR)/soc_sim.vvp

# ----------------------------------------------------------------------------
# 3. View Waveform in GTKWave
# ----------------------------------------------------------------------------
wave: $(VCD_FILE)
	gtkwave $(VCD_FILE) $(GTKW_FILE) &

$(VCD_FILE): sim

# ----------------------------------------------------------------------------
# 4. Run C# Multi-Threaded Dual-Core SoC Simulator
# ----------------------------------------------------------------------------
csharp: fw
	$(DOTNET) run --project csharp_soc

# ----------------------------------------------------------------------------
# 5. Start GDB Remote Debugging Server for VSCode Single-Stepping
# ----------------------------------------------------------------------------
gdb-server: fw
	$(DOTNET) run --project csharp_soc -- --gdb

# ----------------------------------------------------------------------------
# 6. Automated GDB Single-Step Verification Test (Core 0 & Core 1)
# ----------------------------------------------------------------------------
gdb-test: fw
	chmod +x fw/start_gdb_server.sh
	./fw/start_gdb_server.sh
	$(GDB) -batch \
		-ex "target remote 127.0.0.1:3333" \
		-ex "tbreak main" \
		-ex "break core0_ipi_isr" \
		-ex "continue" \
		-ex "printf \"[GDB Core0] Stopped at main: PC=0x%08x\n\", \$$pc" \
		-ex "next" \
		-ex "next" \
		-ex "next" \
		-ex "continue" \
		-ex "printf \"[GDB Core0] Hit core0_ipi_isr! msg=0x%08x\n\", *(unsigned int*)0x2000000C" \
		-ex "step" \
		-ex "disconnect" \
		$(BUILD_DIR)/fw_core0.elf
	$(GDB) -batch \
		-ex "target remote 127.0.0.1:3334" \
		-ex "tbreak main" \
		-ex "continue" \
		-ex "printf \"[GDB Core1] Stopped at Core1 main (Booted by Core0!): PC=0x%08x\n\", \$$pc" \
		-ex "next" \
		-ex "next" \
		-ex "info registers pc sp a0" \
		-ex "disconnect" \
		$(BUILD_DIR)/fw_core1.elf
	@if [ -f /tmp/soc_gdb_server.pid ]; then kill $$(cat /tmp/soc_gdb_server.pid) 2>/dev/null || true; rm -f /tmp/soc_gdb_server.pid; fi

clean:
	rm -rf $(BUILD_DIR) $(VCD_FILE) csharp_soc/bin csharp_soc/obj
