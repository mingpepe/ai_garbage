IVERILOG = iverilog
VVP = vvp
FLAGS = -g2001 -Wall

COMMON_RTL = rtl/common/zigzag_lut.v rtl/common/quant_table_rom.v
ENC_RTL = $(wildcard rtl/encoder/*.v)
DEC_RTL = $(wildcard rtl/decoder/*.v)

BUILD_DIR = build

.PHONY: all test clean sim_cs sim_dct sim_ed sim_stuff sim_block_compile

all: test

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

sim_cs: $(BUILD_DIR)
	$(IVERILOG) -g2001 -o $(BUILD_DIR)/tb_cs.vvp rtl/encoder/rgb_to_ycbcr.v rtl/decoder/ycbcr_to_rgb.v tb/tb_color_space.v
	$(VVP) $(BUILD_DIR)/tb_cs.vvp

sim_dct: $(BUILD_DIR)
	$(IVERILOG) -g2001 -o $(BUILD_DIR)/tb_dct.vvp rtl/encoder/dct_1d.v rtl/encoder/fdct_2d.v rtl/decoder/idct_1d.v rtl/decoder/idct_2d.v tb/tb_dct_idct.v
	$(VVP) $(BUILD_DIR)/tb_dct.vvp

sim_ed: $(BUILD_DIR)
	$(IVERILOG) -g2001 -o $(BUILD_DIR)/tb_ed.vvp $(COMMON_RTL) $(ENC_RTL) $(DEC_RTL) tb/tb_encoder_decoder.v
	$(VVP) $(BUILD_DIR)/tb_ed.vvp

sim_stuff: $(BUILD_DIR)
	$(IVERILOG) -g2001 -o $(BUILD_DIR)/tb_stuff.vvp $(COMMON_RTL) $(ENC_RTL) $(DEC_RTL) tb/tb_stuffing_and_420.v
	$(VVP) $(BUILD_DIR)/tb_stuff.vvp

sim_block_compile: $(BUILD_DIR)
	$(IVERILOG) -g2001 -o $(BUILD_DIR)/tb_block_sim.vvp $(COMMON_RTL) $(ENC_RTL) $(DEC_RTL) tb/tb_block_sim.v

test: sim_cs sim_dct sim_ed sim_stuff sim_block_compile
	@echo "ALL VERILOG TESTBENCHES PASSED"

clean:
	rm -rf $(BUILD_DIR)
