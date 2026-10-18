#include "soc.h"
#include <stdio.h>
#include <string.h>
#include <stdarg.h>

const char *mesi_str(mesi_state_t s) {
    switch (s) {
        case MESI_I: return "I";
        case MESI_S: return "S";
        case MESI_E: return "E";
        case MESI_M: return "M";
        default:     return "?";
    }
}

const char *bus_cmd_str(bus_cmd_t c) {
    switch (c) {
        case BUS_NONE: return "IDLE";
        case BUS_RD:   return "BusRd";
        case BUS_RDX:  return "BusRdX";
        case BUS_UPGR: return "BusUpgr";
        case BUS_WB:   return "BusWB";
        default:       return "?";
    }
}

const char *rob_state_str(rob_state_t s) {
    switch (s) {
        case ROB_EMPTY:    return "EMPTY";
        case ROB_READY:    return "READY";
        case ROB_WAIT_DEP: return "WAIT_DEP";
        case ROB_MEM_WAIT: return "MEM_WAIT";
        case ROB_DONE:     return "OOO_DONE";
        default:           return "?";
    }
}

static void add_event(soc_t *soc, const char *fmt, ...) {
    if (soc->event_count >= MAX_EVENTS) return;
    va_list args;
    va_start(args, fmt);
    vsnprintf(soc->events[soc->event_count], sizeof(soc->events[0]), fmt, args);
    va_end(args);
    soc->event_count++;
}

void soc_init(soc_t *soc) {
    memset(soc, 0, sizeof(*soc));
    for (int i = 0; i < ROM_WORDS; i++) {
        soc->rom[i] = 0x00000013u; /* NOP */
    }
    for (int c = 0; c < NUM_CORES; c++) {
        soc->cores[c].hartid = (uint32_t)c;
        soc->cores[c].pc = 0x00000000u;
        soc->cores[c].ooo_enable = 1u;
        for (int l = 0; l < L1_LINES; l++) {
            soc->cores[c].l1[l].state = MESI_I;
            soc->cores[c].l1[l].addr  = 0x1000u + (uint32_t)(l * 4);
            soc->cores[c].l1[l].tag   = soc->cores[c].l1[l].addr >> 5;
        }
    }
}

int soc_load_hex(soc_t *soc, const char *hex_path) {
    FILE *f = fopen(hex_path, "r");
    if (!f) return -1;
    char line[128];
    int idx = 0;
    while (fgets(line, sizeof(line), f) && idx < ROM_WORDS) {
        uint32_t val = 0;
        if (sscanf(line, "%x", &val) == 1) {
            soc->rom[idx++] = val;
        }
    }
    fclose(f);
    return idx;
}

/* Sign-extension helpers */
static inline int32_t sign_ext(uint32_t val, int bits) {
    uint32_t m = 1u << (bits - 1);
    return (int32_t)((val ^ m) - m);
}

/* Decode instruction fields for ROB tracking */
static void decode_rob_entry(rob_entry_t *e, uint32_t pc, uint32_t inst) {
    memset(e, 0, sizeof(*e));
    e->valid = true;
    e->pc    = pc;
    e->inst  = inst;
    e->state = ROB_READY;

    uint32_t opcode = inst & 0x7Fu;
    uint32_t rd     = (inst >> 7) & 0x1Fu;
    uint32_t rs1    = (inst >> 15) & 0x1Fu;
    uint32_t rs2    = (inst >> 20) & 0x1Fu;

    switch (opcode) {
        case 0x33: /* R-type ALU */
            e->has_rd = (rd != 0); e->rd = rd; e->rs1 = rs1; e->rs2 = rs2;
            break;
        case 0x13: /* I-type ALU */
        case 0x03: /* Load (lw) */
            e->has_rd = (rd != 0); e->rd = rd; e->rs1 = rs1; e->rs2 = 0;
            break;
        case 0x23: /* Store (sw) */
            e->has_rd = false; e->rd = 0; e->rs1 = rs1; e->rs2 = rs2;
            break;
        case 0x37: /* LUI */
        case 0x17: /* AUIPC */
            e->has_rd = (rd != 0); e->rd = rd; e->rs1 = 0; e->rs2 = 0;
            break;
        case 0x63: /* Branch */
            e->has_rd = false; e->rd = 0; e->rs1 = rs1; e->rs2 = rs2;
            e->is_branch_stop = true;
            break;
        case 0x6F: /* JAL */
            e->has_rd = (rd != 0); e->rd = rd; e->rs1 = 0; e->rs2 = 0;
            e->is_branch_stop = true;
            break;
        case 0x67: /* JALR */
            e->has_rd = (rd != 0); e->rd = rd; e->rs1 = rs1; e->rs2 = 0;
            e->is_branch_stop = true;
            break;
        case 0x0F: /* FENCE */
            e->has_rd = false; e->rd = 0; e->rs1 = 0; e->rs2 = 0;
            e->is_branch_stop = true;
            break;
        case 0x2F: /* Atomic RV32A (lr.w, sc.w, amo*.w) */
            e->has_rd = (rd != 0); e->rd = rd; e->rs1 = rs1;
            e->rs2 = (((inst >> 27) & 0x1Fu) == 0x02u) ? 0 : rs2;
            e->is_branch_stop = true;
            break;
        case 0x73: /* SYSTEM / CSR / EBREAK */
            e->has_rd = (rd != 0); e->rd = rd; e->rs1 = rs1; e->rs2 = 0;
            e->is_branch_stop = true;
            break;
        default:
            break;
    }
}

/* Evaluate ALU operation for R-type / I-type */
static uint32_t eval_alu(uint32_t inst, uint32_t v1, uint32_t v2) {
    uint32_t opcode = inst & 0x7Fu;
    uint32_t funct3 = (inst >> 12) & 0x7u;
    uint32_t funct7 = (inst >> 25) & 0x7Fu;
    uint32_t b = (opcode == 0x13u) ? (uint32_t)sign_ext(inst >> 20, 12) : v2;

    switch (funct3) {
        case 0x0:
            if (opcode == 0x33u && (funct7 & 0x20u)) return v1 - b;
            return v1 + b;
        case 0x1: return v1 << (b & 0x1Fu);
        case 0x2: return ((int32_t)v1 < (int32_t)b) ? 1u : 0u;
        case 0x3: return (v1 < b) ? 1u : 0u;
        case 0x4: return v1 ^ b;
        case 0x5:
            if (funct7 & 0x20u) return (uint32_t)((int32_t)v1 >> (b & 0x1Fu));
            return v1 >> (b & 0x1Fu);
        case 0x6: return v1 | b;
        case 0x7: return v1 & b;
        default:  return 0u;
    }
}

/* Evaluate AMO operation */
static uint32_t eval_amo(uint32_t funct5, uint32_t old_val, uint32_t src_val) {
    switch (funct5) {
        case 0x01: return src_val;              /* amoswap.w */
        case 0x00: return old_val + src_val;    /* amoadd.w  */
        case 0x04: return old_val ^ src_val;    /* amoxor.w  */
        case 0x0C: return old_val & src_val;    /* amoand.w  */
        case 0x08: return old_val | src_val;    /* amoor.w   */
        default:   return src_val;
    }
}

/* Helper to read operand value (forwarding from completed older ROB entries if ready) */
static bool get_operand(core_t *c, int rob_idx, uint8_t reg, uint32_t *out_val, uint8_t *wait_reg) {
    if (reg == 0) {
        *out_val = 0;
        return true;
    }
    /* Search older ROB entries from youngest (rob_idx - 1) down to oldest (0) */
    for (int j = rob_idx - 1; j >= 0; j--) {
        if (c->rob[j].valid && c->rob[j].has_rd && c->rob[j].rd == reg) {
            if (c->rob[j].state == ROB_DONE) {
                *out_val = c->rob[j].result;
                return true;
            } else {
                *wait_reg = reg;
                return false;
            }
        }
    }
    *out_val = c->regs[reg];
    return true;
}

/* Check if younger ROB entry has WAW or WAR hazard or ordering barrier before it */
static bool has_order_hazard(core_t *c, int rob_idx, uint8_t *wait_reg) {
    uint8_t my_rd = c->rob[rob_idx].has_rd ? c->rob[rob_idx].rd : 0;
    for (int j = 0; j < rob_idx; j++) {
        if (!c->rob[j].valid) continue;
        uint32_t op_j = c->rob[j].inst & 0x7Fu;
        /* Do not reorder across unresolved branches, fences, atomics, or CSRs */
        if (op_j == 0x0Fu || op_j == 0x2Fu || op_j == 0x63u || op_j == 0x6Fu || op_j == 0x67u || op_j == 0x73u) {
            *wait_reg = 0xFF;
            return true;
        }
        /* WAW hazard */
        if (my_rd != 0 && c->rob[j].has_rd && c->rob[j].rd == my_rd && c->rob[j].state != ROB_DONE) {
            *wait_reg = my_rd;
            return true;
        }
    }
    return false;
}

/* Store Buffer lookup (youngest to oldest) for Store-to-Load Forwarding */
static bool sb_lookup_forward(core_t *c, uint32_t addr, uint32_t *data_out) {
    for (int i = (int)c->sb_count - 1; i >= 0; i--) {
        if (c->sb[i].valid && c->sb[i].addr == addr) {
            *data_out = c->sb[i].data;
            return true;
        }
    }
    return false;
}

/* Pop head entry from Store Buffer */
static void sb_pop_head(core_t *c) {
    if (c->sb_count == 0) return;
    for (uint32_t i = 0; i + 1 < c->sb_count; i++) {
        c->sb[i] = c->sb[i + 1];
    }
    c->sb[c->sb_count - 1].valid = false;
    c->sb_count--;
}

/* Pop head entry from ROB */
static void rob_pop_head(core_t *c) {
    if (c->rob_count == 0) return;
    for (uint32_t i = 0; i + 1 < c->rob_count; i++) {
        c->rob[i] = c->rob[i + 1];
    }
    memset(&c->rob[c->rob_count - 1], 0, sizeof(rob_entry_t));
    c->rob_count--;
}

void soc_step_cycle(soc_t *soc) {
    soc->cycle++;
    soc->event_count = 0;

    for (int c = 0; c < NUM_CORES; c++) {
        soc->cores[c].vis_sb_fwd       = false;
        soc->cores[c].vis_sb_drain     = false;
        soc->cores[c].vis_l1_hit       = false;
        soc->cores[c].vis_ooo_fire     = false;
        soc->cores[c].last_commit_valid = false;
    }

    /* ========================================================================
     * STAGE 1: MESI Snooping Bus Progress
     * ======================================================================== */
    if (soc->bus.busy) {
        uint32_t owner_id = soc->bus.owner;
        uint32_t peer_id  = 1u - owner_id;
        core_t  *owner    = &soc->cores[owner_id];
        core_t  *peer     = &soc->cores[peer_id];
        uint32_t addr     = soc->bus.addr;
        uint32_t idx      = (addr >> 2) & (L1_LINES - 1u);
        uint32_t tag      = addr >> 5;
        uint32_t shm_idx  = (addr - 0x1000u) >> 2;

        if (soc->bus.timer > 0) {
            /* Phase A: Broadcast & Snoop Check */
            soc->bus.timer--;
            bool peer_hit   = (peer->l1[idx].state != MESI_I) && (peer->l1[idx].tag == tag);
            bool peer_dirty = peer_hit && (peer->l1[idx].state == MESI_M);
            soc->bus.snoop_hit   = peer_hit;
            soc->bus.snoop_dirty = peer_dirty;
            soc->bus.snoop_inv_res = false;

            if ((soc->bus.cmd == BUS_RDX || soc->bus.cmd == BUS_UPGR) &&
                peer->res_valid && peer->res_addr == addr) {
                soc->bus.snoop_inv_res = true;
            }
            soc->bus.rdata = peer_dirty ? peer->l1[idx].data :
                             (shm_idx < SHM_WORDS ? soc->shm[shm_idx] : 0u);

            add_event(soc, "BUS [%s] Core %u -> 0x%04x (Peer Core %u Snoop: %s%s)",
                      bus_cmd_str(soc->bus.cmd), owner_id, addr, peer_id,
                      peer_hit ? mesi_str(peer->l1[idx].state) : "MISS",
                      peer_dirty ? " DIRTY-FLUSH" : "");
        } else {
            /* Phase B: Snoop State Transition, Data Transfer & Request Completion */
            bool peer_hit   = (peer->l1[idx].state != MESI_I) && (peer->l1[idx].tag == tag);
            bool peer_dirty = peer_hit && (peer->l1[idx].state == MESI_M);
            uint32_t data_val = peer_dirty ? peer->l1[idx].data :
                                (shm_idx < SHM_WORDS ? soc->shm[shm_idx] : 0u);
            soc->bus.rdata = data_val;

            if (peer_hit) {
                if (soc->bus.cmd == BUS_RD) {
                    if (peer->l1[idx].state == MESI_M) {
                        if (shm_idx < SHM_WORDS) soc->shm[shm_idx] = peer->l1[idx].data;
                        peer->l1[idx].state = MESI_S;
                        add_event(soc, "MESI Core %u Line[%u] (0x%04x): M -> S (Flushed 0x%08x to Bus/RAM)",
                                  peer_id, idx, addr, peer->l1[idx].data);
                    } else if (peer->l1[idx].state == MESI_E) {
                        peer->l1[idx].state = MESI_S;
                        add_event(soc, "MESI Core %u Line[%u] (0x%04x): E -> S (Shared with Core %u)",
                                  peer_id, idx, addr, owner_id);
                    }
                } else if (soc->bus.cmd == BUS_RDX || soc->bus.cmd == BUS_UPGR) {
                    mesi_state_t old_s = peer->l1[idx].state;
                    if (old_s == MESI_M && shm_idx < SHM_WORDS) {
                        soc->shm[shm_idx] = peer->l1[idx].data;
                    }
                    peer->l1[idx].state = MESI_I;
                    add_event(soc, "MESI Core %u Line[%u] (0x%04x): %s -> I (Invalidated by Core %u %s)",
                              peer_id, idx, addr, mesi_str(old_s), owner_id, bus_cmd_str(soc->bus.cmd));
                }
            }

            /* Snoop Invalidation of Peer Load-Reserved (LR) Reservation Register */
            if ((soc->bus.cmd == BUS_RDX || soc->bus.cmd == BUS_UPGR) &&
                peer->res_valid && peer->res_addr == addr) {
                peer->res_valid = false;
                soc->bus.snoop_inv_res = true;
                add_event(soc, "LR/SC SNOOP: Core %u reservation on 0x%04x CLEARED by Core %u!",
                          peer_id, addr, owner_id);
            }

            /* Complete Owner Request */
            if (owner->pend_src == REQ_SB) {
                /* Store Buffer head drain completes into L1 ('M' state) */
                owner->l1[idx].state = MESI_M;
                owner->l1[idx].tag   = tag;
                owner->l1[idx].addr  = addr;
                owner->l1[idx].data  = owner->sb[0].data;
                owner->vis_sb_drain      = true;
                owner->vis_sb_drain_addr = addr;
                owner->cnt_sb_drain++;
                add_event(soc, "SB DRAIN Core %u: [0x%04x] <= 0x%08x -> L1 Line[%u] = M",
                          owner_id, addr, owner->sb[0].data, idx);
                sb_pop_head(owner);
                owner->pend_src = REQ_NONE;
            } else if (owner->pend_src == REQ_CPU && owner->rob_count > 0) {
                rob_entry_t *r0 = &owner->rob[0];
                uint32_t inst   = r0->inst;
                uint32_t opcode = inst & 0x7Fu;
                uint32_t funct5 = (inst >> 27) & 0x1Fu;

                if (opcode == 0x03u) {
                    /* Load Miss Complete */
                    mesi_state_t new_s = peer_hit ? MESI_S : MESI_E;
                    owner->l1[idx].state = new_s;
                    owner->l1[idx].tag   = tag;
                    owner->l1[idx].addr  = addr;
                    owner->l1[idx].data  = data_val;
                    r0->result = data_val;
                    r0->state  = ROB_DONE;
                    add_event(soc, "L1 FILL Core %u: Line[%u] (0x%04x) = 0x%08x [%s]",
                              owner_id, idx, addr, data_val, mesi_str(new_s));
                } else if (opcode == 0x2Fu && funct5 == 0x02u) {
                    /* LR.W Miss Complete */
                    mesi_state_t new_s = peer_hit ? MESI_S : MESI_E;
                    owner->l1[idx].state = new_s;
                    owner->l1[idx].tag   = tag;
                    owner->l1[idx].addr  = addr;
                    owner->l1[idx].data  = data_val;
                    owner->res_valid     = true;
                    owner->res_addr      = addr;
                    r0->result = data_val;
                    r0->state  = ROB_DONE;
                    add_event(soc, "LR.W Core %u: Reserved 0x%04x (val=0x%08x, L1=%s)",
                              owner_id, addr, data_val, mesi_str(new_s));
                } else if (opcode == 0x2Fu && funct5 == 0x03u) {
                    /* SC.W Upgrade/Write Complete */
                    owner->l1[idx].state = MESI_M;
                    owner->l1[idx].tag   = tag;
                    owner->l1[idx].addr  = addr;
                    owner->l1[idx].data  = owner->pend_wdata;
                    owner->res_valid     = false;
                    r0->result = 0u; /* 0 = SC Success */
                    r0->state  = ROB_DONE;
                    owner->cnt_sc_ok++;
                    add_event(soc, "SC.W SUCCESS Core %u: [0x%04x] <= 0x%08x (L1=M)",
                              owner_id, addr, owner->pend_wdata);
                } else if (opcode == 0x2Fu) {
                    /* AMO Complete */
                    uint32_t old_v = (soc->bus.cmd == BUS_UPGR) ? owner->l1[idx].data : data_val;
                    uint32_t new_v = eval_amo(funct5, old_v, owner->pend_wdata);
                    owner->l1[idx].state = MESI_M;
                    owner->l1[idx].tag   = tag;
                    owner->l1[idx].addr  = addr;
                    owner->l1[idx].data  = new_v;
                    r0->result = old_v;
                    r0->state  = ROB_DONE;
                    owner->cnt_amo++;
                    add_event(soc, "AMO Core %u: [0x%04x] old=0x%08x -> new=0x%08x (L1=M)",
                              owner_id, addr, old_v, new_v);
                }
                owner->pend_src = REQ_NONE;
            }

            soc->bus.busy       = false;
            soc->bus.last_grant = owner_id;
        }
    }

    /* ========================================================================
     * STAGE 2: Per-Core Store Buffer Drain & Pipeline / ROB Execution
     * ======================================================================== */
    for (int c_idx = 0; c_idx < NUM_CORES; c_idx++) {
        core_t *c = &soc->cores[c_idx];

        /* 2A: Store Buffer Autonomous Drain to L1 Cache */
        if (c->sb_count > 0 && c->pend_src == REQ_NONE) {
            uint32_t sb_addr = c->sb[0].addr;
            uint32_t sb_data = c->sb[0].data;
            uint32_t idx     = (sb_addr >> 2) & (L1_LINES - 1u);
            uint32_t tag     = sb_addr >> 5;
            bool     hit     = (c->l1[idx].state != MESI_I) && (c->l1[idx].tag == tag);

            if (hit && (c->l1[idx].state == MESI_M || c->l1[idx].state == MESI_E)) {
                /* Silent upgrade E->M or write hit M->M in 1 cycle! */
                mesi_state_t prev = c->l1[idx].state;
                c->l1[idx].state = MESI_M;
                c->l1[idx].data  = sb_data;
                c->l1[idx].addr  = sb_addr;
                c->vis_sb_drain      = true;
                c->vis_sb_drain_addr = sb_addr;
                c->cnt_sb_drain++;
                add_event(soc, "SB DRAIN Core %d: [0x%04x] <= 0x%08x (L1 Hit %s->M)",
                          c_idx, sb_addr, sb_data, mesi_str(prev));
                sb_pop_head(c);
            } else {
                /* Need BusUpgr (if S) or BusRdX (if I) */
                c->pend_src   = REQ_SB;
                c->pend_cmd   = (hit && c->l1[idx].state == MESI_S) ? BUS_UPGR : BUS_RDX;
                c->pend_addr  = sb_addr;
                c->pend_wdata = sb_data;
            }
        }

        /* 2B: Execute / Issue Instructions in ROB (In-Order Head + Out-of-Order Window) */
        for (uint32_t i = 0; i < c->rob_count; i++) {
            rob_entry_t *e = &c->rob[i];
            if (!e->valid || e->state == ROB_DONE) continue;

            /* If ROB[i] is not head (i > 0), only allow execution if ooo_enable == 1 */
            if (i > 0 && !c->ooo_enable) {
                e->state = ROB_READY;
                continue;
            }

            uint8_t wait_r = 0;
            uint32_t v1 = 0, v2 = 0;
            bool r1_ok = get_operand(c, (int)i, e->rs1, &v1, &wait_r);
            bool r2_ok = get_operand(c, (int)i, e->rs2, &v2, &wait_r);
            if (!r1_ok || !r2_ok || (i > 0 && has_order_hazard(c, (int)i, &wait_r))) {
                e->state    = ROB_WAIT_DEP;
                e->wait_reg = wait_r;
                continue;
            }

            uint32_t inst   = e->inst;
            uint32_t opcode = inst & 0x7Fu;
            uint32_t funct3 = (inst >> 12) & 0x7u;
            uint32_t funct5 = (inst >> 27) & 0x1Fu;

            if (opcode == 0x33u || opcode == 0x13u) {
                /* ALU Op: Can execute at ROB[0] OR Out-of-Order at ROB[1..3]! */
                e->result = eval_alu(inst, v1, v2);
                e->state  = ROB_DONE;
                if (i > 0) {
                    e->executed_ooo = true;
                    c->cnt_ooo_exec++;
                    c->vis_ooo_fire = true;
                    c->vis_ooo_pc   = e->pc;
                    add_event(soc, "OoO EXEC Core %d: ROB[%u] (PC=0x%02x) ALU completed ahead of stalled ROB[0]!",
                              c_idx, i, e->pc);
                }
            } else if (opcode == 0x37u) {
                /* LUI */
                e->result = inst & 0xFFFFF000u;
                e->state  = ROB_DONE;
                if (i > 0) { e->executed_ooo = true; c->cnt_ooo_exec++; }
            } else if (opcode == 0x17u) {
                /* AUIPC */
                e->result = e->pc + (inst & 0xFFFFF000u);
                e->state  = ROB_DONE;
                if (i > 0) { e->executed_ooo = true; c->cnt_ooo_exec++; }
            } else if (opcode == 0x03u) {
                /* LOAD (lw) */
                uint32_t addr = v1 + (uint32_t)sign_ext(inst >> 20, 12);
                if (addr >= 0x2000u && addr < 0x3000u) {
                    /* Local DTCM Stack Access */
                    if (i == 0) {
                        e->result = c->dtcm[(addr - 0x2000u) >> 2];
                        e->state  = ROB_DONE;
                    }
                } else {
                    /* Shared Memory Load */
                    /* Check if an older unexecuted store exists in ROB[0..i-1] */
                    bool older_rob_store = false;
                    for (uint32_t j = 0; j < i; j++) {
                        if ((c->rob[j].inst & 0x7Fu) == 0x23u && c->rob[j].state != ROB_DONE) {
                            older_rob_store = true;
                        }
                    }
                    if (older_rob_store || (!c->ooo_enable && c->sb_count > 0)) {
                        e->state = ROB_MEM_WAIT;
                        continue;
                    }

                    /* 1. Check Store Buffer for Store-to-Load Forwarding */
                    uint32_t fwd_data = 0;
                    if (sb_lookup_forward(c, addr, &fwd_data)) {
                        e->result = fwd_data;
                        e->state  = ROB_DONE;
                        c->cnt_sb_fwd++;
                        c->vis_sb_fwd      = true;
                        c->vis_sb_fwd_addr = addr;
                        c->vis_sb_fwd_data = fwd_data;
                        add_event(soc, "SB FORWARD Core %d: lw [0x%04x] -> 0x%08x directly from Store Buffer!",
                                  c_idx, addr, fwd_data);
                        if (i > 0) { e->executed_ooo = true; c->cnt_ooo_exec++; }
                        continue;
                    }

                    /* 2. Check L1 Cache for 1-cycle Read Hit (bypasses pending SB miss to other addr!) */
                    uint32_t idx = (addr >> 2) & (L1_LINES - 1u);
                    uint32_t tag = addr >> 5;
                    if (c->l1[idx].state != MESI_I && c->l1[idx].tag == tag) {
                        e->result = c->l1[idx].data;
                        e->state  = ROB_DONE;
                        c->cnt_l1_hit++;
                        c->vis_l1_hit      = true;
                        c->vis_l1_hit_addr = addr;
                        if (i > 0) {
                            e->executed_ooo = true;
                            c->cnt_ooo_exec++;
                            c->vis_ooo_fire = true;
                            c->vis_ooo_pc   = e->pc;
                            add_event(soc, "OoO LOAD HIT Core %d: ROB[%u] lw [0x%04x] -> 0x%08x hit L1 (%s) out-of-order!",
                                      c_idx, i, addr, e->result, mesi_str(c->l1[idx].state));
                        } else if (c->sb_count > 0) {
                            add_event(soc, "LOAD BYPASS SB Core %d: lw [0x%04x] -> 0x%08x hit L1 (%s) while SB has %u pending store(s)!",
                                      c_idx, addr, e->result, mesi_str(c->l1[idx].state), c->sb_count);
                        }
                        continue;
                    }

                    /* 3. L1 Read Miss: must be at ROB[0] and issue BusRd */
                    e->state = ROB_MEM_WAIT;
                    if (i == 0 && c->pend_src == REQ_NONE && c->sb_count == 0) {
                        c->pend_src  = REQ_CPU;
                        c->pend_cmd  = BUS_RD;
                        c->pend_addr = addr;
                        c->cnt_l1_miss++;
                    }
                }
            } else if (i == 0) {
                /* Instructions that only execute at ROB[0] (Stores, Branches, Fence, Atomics, CSR) */
                if (opcode == 0x23u) {
                    /* STORE (sw) */
                    uint32_t imm  = ((inst >> 7) & 0x1Fu) | (((inst >> 25) & 0x7Fu) << 5);
                    uint32_t addr = v1 + (uint32_t)sign_ext(imm, 12);
                    if (addr >= 0x2000u && addr < 0x3000u) {
                        c->dtcm[(addr - 0x2000u) >> 2] = v2;
                        e->state = ROB_DONE;
                    } else if (c->sb_count < SB_SIZE) {
                        /* Enqueue into Store Buffer */
                        c->sb[c->sb_count].valid = true;
                        c->sb[c->sb_count].addr  = addr;
                        c->sb[c->sb_count].data  = v2;
                        c->sb[c->sb_count].pc    = e->pc;
                        c->sb_count++;
                        c->cnt_sb_enq++;
                        e->state = ROB_DONE;
                        add_event(soc, "SB ENQUEUE Core %d: sw [0x%04x] <= 0x%08x (SB count=%u)",
                                  c_idx, addr, v2, c->sb_count);
                    } else {
                        e->state = ROB_MEM_WAIT; /* Store Buffer Full Stall */
                    }
                } else if (opcode == 0x0Fu) {
                    /* FENCE: Stall until Store Buffer is completely drained to L1 */
                    if (c->sb_count == 0 && c->pend_src == REQ_NONE) {
                        e->state = ROB_DONE;
                        add_event(soc, "FENCE COMPLETE Core %d: Store Buffer drained (sb_count=0)", c_idx);
                    } else {
                        e->state = ROB_MEM_WAIT;
                    }
                } else if (opcode == 0x2Fu) {
                    /* ATOMIC (LR.W, SC.W, AMO*.W) */
                    uint32_t addr = v1;
                    uint32_t idx  = (addr >> 2) & (L1_LINES - 1u);
                    uint32_t tag  = addr >> 5;
                    bool     hit  = (c->l1[idx].state != MESI_I) && (c->l1[idx].tag == tag);

                    /* Atomics wait for Store Buffer to drain first */
                    if (c->sb_count > 0) {
                        e->state = ROB_MEM_WAIT;
                    } else if (funct5 == 0x02u) {
                        /* LR.W */
                        if (c->pend_src == REQ_NONE) {
                            c->cnt_lr++;
                            if (hit) {
                                c->res_valid = true;
                                c->res_addr  = addr;
                                e->result    = c->l1[idx].data;
                                e->state     = ROB_DONE;
                                add_event(soc, "LR.W HIT Core %d: Reserved 0x%04x (val=0x%08x, L1=%s)",
                                          c_idx, addr, e->result, mesi_str(c->l1[idx].state));
                            } else {
                                c->pend_src  = REQ_CPU;
                                c->pend_cmd  = BUS_RD;
                                c->pend_addr = addr;
                                c->cnt_l1_miss++;
                                e->state     = ROB_MEM_WAIT;
                            }
                        } else {
                            e->state = ROB_MEM_WAIT;
                        }
                    } else if (funct5 == 0x03u) {
                        /* SC.W */
                        if (!c->res_valid || c->res_addr != addr) {
                            /* Reservation lost! Abort SC immediately without writing */
                            c->res_valid = false;
                            if (c->pend_src == REQ_CPU) c->pend_src = REQ_NONE;
                            e->result = 1u; /* 1 = Fail */
                            e->state  = ROB_DONE;
                            c->cnt_sc_fail++;
                            add_event(soc, "SC.W FAILED Core %d: Reservation on 0x%04x was invalidated! (rd=1)",
                                      c_idx, addr);
                        } else if (hit && (c->l1[idx].state == MESI_M || c->l1[idx].state == MESI_E)) {
                            c->l1[idx].state = MESI_M;
                            c->l1[idx].data  = v2;
                            c->res_valid     = false;
                            e->result = 0u; /* 0 = Success */
                            e->state  = ROB_DONE;
                            c->cnt_sc_ok++;
                            add_event(soc, "SC.W SUCCESS Core %d: [0x%04x] <= 0x%08x (L1=M, rd=0)",
                                      c_idx, addr, v2);
                        } else if (c->pend_src == REQ_NONE) {
                            c->pend_src   = REQ_CPU;
                            c->pend_cmd   = (hit && c->l1[idx].state == MESI_S) ? BUS_UPGR : BUS_RDX;
                            c->pend_addr  = addr;
                            c->pend_wdata = v2;
                            e->state      = ROB_MEM_WAIT;
                        } else {
                            e->state = ROB_MEM_WAIT;
                        }
                    } else {
                        /* AMO*.W (amoswap.w, amoadd.w, etc.) */
                        if (hit && (c->l1[idx].state == MESI_M || c->l1[idx].state == MESI_E)) {
                            uint32_t old_v = c->l1[idx].data;
                            uint32_t new_v = eval_amo(funct5, old_v, v2);
                            c->l1[idx].state = MESI_M;
                            c->l1[idx].data  = new_v;
                            e->result = old_v;
                            e->state  = ROB_DONE;
                            c->cnt_amo++;
                            add_event(soc, "AMO HIT Core %d: [0x%04x] old=0x%08x -> new=0x%08x (L1=M)",
                                      c_idx, addr, old_v, new_v);
                        } else if (c->pend_src == REQ_NONE) {
                            c->pend_src   = REQ_CPU;
                            c->pend_cmd   = (hit && c->l1[idx].state == MESI_S) ? BUS_UPGR : BUS_RDX;
                            c->pend_addr  = addr;
                            c->pend_wdata = v2;
                            e->state      = ROB_MEM_WAIT;
                        } else {
                            e->state = ROB_MEM_WAIT;
                        }
                    }
                } else if (opcode == 0x63u) {
                    /* BRANCH */
                    uint32_t imm = (((inst >> 8) & 0xFu) << 1) |
                                   (((inst >> 25) & 0x3Fu) << 5) |
                                   (((inst >> 7) & 0x1u) << 11) |
                                   (((inst >> 31) & 0x1u) << 12);
                    int32_t offset = sign_ext(imm, 13);
                    bool cond = false;
                    switch (funct3) {
                        case 0x0: cond = (v1 == v2); break;
                        case 0x1: cond = (v1 != v2); break;
                        case 0x4: cond = ((int32_t)v1 < (int32_t)v2); break;
                        case 0x5: cond = ((int32_t)v1 >= (int32_t)v2); break;
                        case 0x6: cond = (v1 < v2); break;
                        case 0x7: cond = (v1 >= v2); break;
                    }
                    if (cond) c->pc = (uint32_t)((int32_t)e->pc + offset);
                    e->state = ROB_DONE;
                } else if (opcode == 0x6Fu) {
                    /* JAL */
                    uint32_t imm = (((inst >> 21) & 0x3FFu) << 1) |
                                   (((inst >> 20) & 0x1u) << 11) |
                                   (((inst >> 12) & 0xFFu) << 12) |
                                   (((inst >> 31) & 0x1u) << 20);
                    int32_t offset = sign_ext(imm, 21);
                    e->result = e->pc + 4u;
                    c->pc     = (uint32_t)((int32_t)e->pc + offset);
                    e->state  = ROB_DONE;
                } else if (opcode == 0x67u) {
                    /* JALR */
                    int32_t offset = sign_ext(inst >> 20, 12);
                    e->result = e->pc + 4u;
                    c->pc     = (uint32_t)(((int32_t)v1 + offset) & ~1);
                    e->state  = ROB_DONE;
                } else if (opcode == 0x73u) {
                    /* SYSTEM: EBREAK or CSR */
                    uint32_t csr = (inst >> 20) & 0xFFFu;
                    if (funct3 == 0x0u) {
                        /* EBREAK / ECALL */
                        c->halted = true;
                        e->state  = ROB_DONE;
                    } else {
                        uint32_t old_csr = 0;
                        if (csr == 0xF14u) old_csr = c->hartid;
                        else if (csr == 0x7C0u) old_csr = c->ooo_enable;
                        else if (csr == 0x7C1u) old_csr = c->phase_tag;

                        uint32_t wval = (funct3 & 0x4u) ? e->rs1 : v1;
                        uint32_t new_csr = old_csr;
                        if ((funct3 & 0x3u) == 1u) new_csr = wval;
                        else if ((funct3 & 0x3u) == 2u) new_csr = old_csr | wval;
                        else if ((funct3 & 0x3u) == 3u) new_csr = old_csr & ~wval;

                        if (csr == 0x7C0u) c->ooo_enable = new_csr & 1u;
                        else if (csr == 0x7C1u) {
                            c->phase_tag = new_csr;
                            add_event(soc, "=== PHASE %u START (Core %d) ===", new_csr, c_idx);
                        }
                        e->result = old_csr;
                        e->state  = ROB_DONE;
                    }
                }
            }
        }

        /* 2C: Commit Head of ROB (In-Order Retirement) */
        if (c->rob_count > 0 && c->rob[0].valid && c->rob[0].state == ROB_DONE) {
            rob_entry_t *r0 = &c->rob[0];
            if (r0->has_rd && r0->rd != 0) {
                c->regs[r0->rd] = r0->result;
            }
            c->regs[0] = 0u;
            c->last_commit_valid = true;
            c->last_commit_pc    = r0->pc;
            c->last_commit_inst  = r0->inst;
            c->cnt_inst_ret++;
            rob_pop_head(c);
        }

        /* 2D: Fetch New Instructions into ROB Window (up to 2 per cycle so ROB fills on stall) */
        for (int f = 0; f < 2; f++) {
            if (c->halted || c->rob_count >= ROB_SIZE) break;
            if (c->rob_count > 0 && c->rob[c->rob_count - 1].is_branch_stop) break;

            uint32_t fetch_pc = c->pc;
            uint32_t inst = (fetch_pc >> 2) < ROM_WORDS ? soc->rom[fetch_pc >> 2] : 0x00000013u;
            decode_rob_entry(&c->rob[c->rob_count], fetch_pc, inst);
            c->rob_count++;
            c->pc = fetch_pc + 4u;
            if (c->rob[c->rob_count - 1].is_branch_stop) break;
        }
    }

    /* ========================================================================
     * STAGE 3: Coherence Bus Arbiter (Grants Bus to Next Waiting Request)
     * ======================================================================== */
    if (!soc->bus.busy) {
        /* First check if any waiting SC.W lost its reservation before winning the bus */
        for (int c_idx = 0; c_idx < NUM_CORES; c_idx++) {
            core_t *c = &soc->cores[c_idx];
            if (c->pend_src == REQ_CPU && c->rob_count > 0) {
                uint32_t inst   = c->rob[0].inst;
                uint32_t opcode = inst & 0x7Fu;
                uint32_t funct5 = (inst >> 27) & 0x1Fu;
                if (opcode == 0x2Fu && funct5 == 0x03u && (!c->res_valid || c->res_addr != c->pend_addr)) {
                    c->pend_src       = REQ_NONE;
                    c->res_valid      = false;
                    c->rob[0].result  = 1u; /* SC Failed */
                    c->rob[0].state   = ROB_DONE;
                    c->cnt_sc_fail++;
                    add_event(soc, "SC.W ABORTED Core %d: Reservation on 0x%04x lost before Bus grant! (rd=1)",
                              c_idx, c->pend_addr);
                }
            }
            /* Also if a pending BUS_UPGR line was invalidated to 'I' while waiting, upgrade cmd to BUS_RDX */
            if (c->pend_src != REQ_NONE && c->pend_cmd == BUS_UPGR) {
                uint32_t idx = (c->pend_addr >> 2) & (L1_LINES - 1u);
                if (c->l1[idx].state == MESI_I) {
                    c->pend_cmd = BUS_RDX;
                }
            }
        }

        uint32_t pref = 1u - soc->bus.last_grant;
        uint32_t alt  = soc->bus.last_grant;
        int winner = -1;
        if (soc->cores[pref].pend_src != REQ_NONE) winner = (int)pref;
        else if (soc->cores[alt].pend_src != REQ_NONE) winner = (int)alt;

        if (winner >= 0) {
            core_t *w = &soc->cores[winner];
            soc->bus.busy          = true;
            soc->bus.owner         = (uint32_t)winner;
            soc->bus.cmd           = w->pend_cmd;
            soc->bus.addr          = w->pend_addr;
            soc->bus.wdata         = w->pend_wdata;
            soc->bus.timer         = 1u;
            soc->bus.snoop_hit     = false;
            soc->bus.snoop_dirty   = false;
            soc->bus.snoop_inv_res = false;
        }
    }
}
