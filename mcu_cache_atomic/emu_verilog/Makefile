IVERILOG := iverilog
VVP      := vvp

SRCS     := store_buffer.v l1_cache.v mesi_bus.v rv32_core.v dual_core_soc.v tb_soc.v

all: sim_soc.vvp

sim_soc.vvp: $(SRCS) defines.vh
	$(IVERILOG) -g2005 -o $@ $(SRCS)

clean:
	rm -f sim_soc.vvp *.vcd

.PHONY: all clean
