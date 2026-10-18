#ifndef SOC_H
#define SOC_H

#include <stdint.h>
#include <stdbool.h>

#define NUM_CORES       2
#define ROM_WORDS       1024
#define SHM_WORDS       64
#define DTCM_WORDS      1024
#define L1_LINES        8
#define SB_SIZE         4
#define ROB_SIZE        4
#define MAX_EVENTS      16

/* MESI Cache Line States */
typedef enum {
    MESI_I = 0, /* Invalid   */
    MESI_S = 1, /* Shared    */
    MESI_E = 2, /* Exclusive */
    MESI_M = 3  /* Modified  */
} mesi_state_t;

/* Coherence Bus Commands */
typedef enum {
    BUS_NONE = 0,
    BUS_RD   = 1, /* Read miss -> fetch line */
    BUS_RDX  = 2, /* Write miss -> fetch exclusive & invalidate peer */
    BUS_UPGR = 3, /* Shared write -> upgrade S->M & invalidate peer */
    BUS_WB   = 4  /* Write-back dirty line on replacement */
} bus_cmd_t;

/* Reorder Buffer (ROB) Entry States */
typedef enum {
    ROB_EMPTY    = 0,
    ROB_READY    = 1, /* Decoded & ready to issue */
    ROB_WAIT_DEP = 2, /* Waiting on RAW/pipeline dependency */
    ROB_MEM_WAIT = 3, /* Stalled waiting for L1 Cache / Bus / Fence */
    ROB_DONE     = 4  /* Execution complete (in-order or Out-of-Order!) */
} rob_state_t;

/* L1 Cache Request Source */
typedef enum {
    REQ_NONE = 0,
    REQ_SB   = 1, /* Store Buffer head draining to L1 */
    REQ_CPU  = 2  /* CPU ROB head (Load Miss / LR / SC / AMO) */
} l1_req_src_t;

typedef struct {
    bool     valid;
    uint32_t pc;
    uint32_t inst;
    rob_state_t state;
    uint8_t  rd;
    uint8_t  rs1;
    uint8_t  rs2;
    uint8_t  wait_reg;     /* Which register is causing ROB_WAIT_DEP */
    uint32_t result;       /* Computed result to write to rd on commit */
    bool     has_rd;
    bool     executed_ooo; /* True if completed Out-of-Order ahead of ROB[0]! */
    bool     is_branch_stop;
} rob_entry_t;

typedef struct {
    bool     valid;
    uint32_t addr;
    uint32_t data;
    uint32_t pc;
} sb_entry_t;

typedef struct {
    mesi_state_t state;
    uint32_t     tag;      /* addr[31:5] */
    uint32_t     addr;     /* Full aligned word address for UI clarity */
    uint32_t     data;
} l1_line_t;

typedef struct {
    uint32_t    hartid;
    uint32_t    pc;
    uint32_t    regs[32];
    bool        halted;
    uint32_t    ooo_enable;
    uint32_t    phase_tag;

    /* Hardware Reservation Register for LR/SC (lr.w / sc.w) */
    bool        res_valid;
    uint32_t    res_addr;

    /* 4-Entry Out-of-Order Instruction Window / Reorder Buffer (ROB) */
    rob_entry_t rob[ROB_SIZE];
    uint32_t    rob_count;

    /* 4-Entry Store Buffer */
    sb_entry_t  sb[SB_SIZE];
    uint32_t    sb_count;

    /* 8-Line L1 Data Cache (MESI) */
    l1_line_t   l1[L1_LINES];

    /* Core-Local Stack / Scratchpad DTCM (0x2000..0x2FFF) */
    uint32_t    dtcm[DTCM_WORDS];

    /* Active L1/Bus Miss Request tracking */
    l1_req_src_t pend_src;
    bus_cmd_t    pend_cmd;
    uint32_t     pend_addr;
    uint32_t     pend_wdata;

    /* Event counters & per-cycle visual flags */
    uint32_t    cnt_inst_ret;
    uint32_t    cnt_ooo_exec;
    uint32_t    cnt_sb_enq;
    uint32_t    cnt_sb_fwd;
    uint32_t    cnt_sb_drain;
    uint32_t    cnt_l1_hit;
    uint32_t    cnt_l1_miss;
    uint32_t    cnt_lr;
    uint32_t    cnt_sc_ok;
    uint32_t    cnt_sc_fail;
    uint32_t    cnt_amo;

    /* Transient visual indicators for current cycle */
    bool        vis_sb_fwd;
    uint32_t    vis_sb_fwd_addr;
    uint32_t    vis_sb_fwd_data;
    bool        vis_sb_drain;
    uint32_t    vis_sb_drain_addr;
    bool        vis_l1_hit;
    uint32_t    vis_l1_hit_addr;
    bool        vis_ooo_fire;
    uint32_t    vis_ooo_pc;
    uint32_t    last_commit_pc;
    uint32_t    last_commit_inst;
    bool        last_commit_valid;
} core_t;

typedef struct {
    bool        busy;
    uint32_t    owner;       /* 0 or 1 */
    bus_cmd_t   cmd;
    uint32_t    addr;
    uint32_t    wdata;
    uint32_t    rdata;
    uint32_t    timer;       /* 1 = Snoop/Broadcast phase, 0 = Data/Complete phase */
    uint32_t    last_grant;  /* Round-robin state */
    bool        snoop_hit;
    bool        snoop_dirty; /* Peer had 'M' and flushed data onto bus */
    bool        snoop_inv_res; /* Peer LR reservation was invalidated */
} mesi_bus_t;

typedef struct {
    uint32_t    cycle;
    uint32_t    rom[ROM_WORDS];
    uint32_t    shm[SHM_WORDS]; /* Shared Memory 0x1000..0x10FC */
    core_t      cores[NUM_CORES];
    mesi_bus_t  bus;

    /* Cycle event log strings */
    char        events[MAX_EVENTS][160];
    int         event_count;
} soc_t;

void soc_init(soc_t *soc);
int  soc_load_hex(soc_t *soc, const char *hex_path);
void soc_step_cycle(soc_t *soc);
const char *mesi_str(mesi_state_t s);
const char *bus_cmd_str(bus_cmd_t c);
const char *rob_state_str(rob_state_t s);

#endif /* SOC_H */
