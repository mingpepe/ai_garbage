`ifndef DEFINES_VH
`define DEFINES_VH

// MESI Cache States
`define MESI_I 2'd0
`define MESI_S 2'd1
`define MESI_E 2'd2
`define MESI_M 2'd3

// Coherence Bus Commands
`define BUS_NONE 3'd0
`define BUS_RD   3'd1
`define BUS_RDX  3'd2
`define BUS_UPGR 3'd3
`define BUS_WB   3'd4

// ROB Entry States
`define ROB_EMPTY    3'd0
`define ROB_READY    3'd1
`define ROB_WAIT_DEP 3'd2
`define ROB_MEM_WAIT 3'd3
`define ROB_DONE     3'd4

// Pending Request Source
`define REQ_NONE 2'd0
`define REQ_SB   2'd1
`define REQ_CPU  2'd2

`endif
