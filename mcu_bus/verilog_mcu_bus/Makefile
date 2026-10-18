IVERILOG ?= iverilog
VVP      ?= vvp
GTKWAVE  ?= gtkwave

RTL_SRCS = rtl/bus_arbiter.v \
           rtl/uart_rx.v \
           rtl/i2c_tx.v \
           rtl/sram.v \
           rtl/nvic.v \
           rtl/dma_controller.v \
           rtl/cpu_core.v \
           rtl/mcu_top.v

TB_SRC   = tb/tb_mcu_top.v
SIM_BIN  = mcu_bus_tb.vvp
VCD_FILE = mcu_bus.vcd
GTKW_FILE = mcu_bus.gtkw

.PHONY: all sim wave clean

all: $(VCD_FILE)

$(SIM_BIN): $(RTL_SRCS) $(TB_SRC)
	$(IVERILOG) -Wall -g2012 -o $(SIM_BIN) $(RTL_SRCS) $(TB_SRC)

$(VCD_FILE): $(SIM_BIN)
	$(VVP) $(SIM_BIN)

sim: $(VCD_FILE)

wave: $(VCD_FILE)
	$(GTKWAVE) $(VCD_FILE) $(GTKW_FILE) &

clean:
	rm -f $(SIM_BIN) $(VCD_FILE)
