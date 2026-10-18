#include "soc.h"
#include "gdb_stub.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void write_escaped_json_str(FILE *f, const char *s) {
    fputc('"', f);
    while (*s) {
        if (*s == '"' || *s == '\\') fputc('\\', f);
        fputc(*s, f);
        s++;
    }
    fputc('"', f);
}

static void dump_cycle_json(FILE *jf, const soc_t *soc, bool first) {
    if (!jf) return;
    if (!first) fprintf(jf, ",\n");
    fprintf(jf, "    {\n");
    fprintf(jf, "      \"cycle\": %u,\n", soc->cycle);

    /* Bus state */
    fprintf(jf, "      \"bus\": {\"busy\": %s, \"owner\": %u, \"cmd\": \"%s\", \"addr\": \"0x%04x\", \"rdata\": \"0x%08x\", \"phase\": %u, \"snoop_hit\": %s, \"snoop_dirty\": %s, \"snoop_inv_res\": %s},\n",
            soc->bus.busy ? "true" : "false",
            soc->bus.owner,
            bus_cmd_str(soc->bus.cmd),
            soc->bus.addr,
            soc->bus.rdata,
            soc->bus.timer,
            soc->bus.snoop_hit ? "true" : "false",
            soc->bus.snoop_dirty ? "true" : "false",
            soc->bus.snoop_inv_res ? "true" : "false");

    /* Shared memory (first 8 words = 0x1000..0x101C) */
    fprintf(jf, "      \"shm\": [");
    for (int i = 0; i < 8; i++) {
        fprintf(jf, "%s\"0x%08x\"", (i > 0 ? ", " : ""), soc->shm[i]);
    }
    fprintf(jf, "],\n");

    /* Cores */
    fprintf(jf, "      \"cores\": [\n");
    for (int c = 0; c < NUM_CORES; c++) {
        const core_t *core = &soc->cores[c];
        fprintf(jf, "        {\n");
        fprintf(jf, "          \"hartid\": %d, \"pc\": \"0x%04x\", \"halted\": %s, \"ooo_enable\": %u, \"phase\": %u,\n",
                c, core->pc, core->halted ? "true" : "false", core->ooo_enable, core->phase_tag);
        fprintf(jf, "          \"res_valid\": %s, \"res_addr\": \"0x%04x\",\n",
                core->res_valid ? "true" : "false", core->res_addr);
        fprintf(jf, "          \"last_commit_valid\": %s, \"last_commit_pc\": \"0x%04x\", \"last_commit_inst\": \"0x%08x\",\n",
                core->last_commit_valid ? "true" : "false", core->last_commit_pc, core->last_commit_inst);
        fprintf(jf, "          \"vis\": {\"sb_fwd\": %s, \"sb_fwd_addr\": \"0x%04x\", \"sb_fwd_data\": \"0x%08x\", \"sb_drain\": %s, \"sb_drain_addr\": \"0x%04x\", \"l1_hit\": %s, \"l1_hit_addr\": \"0x%04x\", \"ooo_fire\": %s, \"ooo_pc\": \"0x%04x\"},\n",
                core->vis_sb_fwd ? "true" : "false", core->vis_sb_fwd_addr, core->vis_sb_fwd_data,
                core->vis_sb_drain ? "true" : "false", core->vis_sb_drain_addr,
                core->vis_l1_hit ? "true" : "false", core->vis_l1_hit_addr,
                core->vis_ooo_fire ? "true" : "false", core->vis_ooo_pc);
        fprintf(jf, "          \"stats\": {\"ret\": %u, \"ooo\": %u, \"sb_enq\": %u, \"sb_fwd\": %u, \"sb_drain\": %u, \"l1_hit\": %u, \"l1_miss\": %u, \"lr\": %u, \"sc_ok\": %u, \"sc_fail\": %u, \"amo\": %u},\n",
                core->cnt_inst_ret, core->cnt_ooo_exec, core->cnt_sb_enq, core->cnt_sb_fwd,
                core->cnt_sb_drain, core->cnt_l1_hit, core->cnt_l1_miss,
                core->cnt_lr, core->cnt_sc_ok, core->cnt_sc_fail, core->cnt_amo);

        /* Key registers */
        fprintf(jf, "          \"regs\": {\"t0\": \"0x%08x\", \"a0\": \"0x%08x\", \"a1\": \"0x%08x\", \"a2\": \"0x%08x\", \"a3\": \"0x%08x\", \"a4\": \"0x%08x\", \"a5\": \"0x%08x\", \"a6\": \"0x%08x\"},\n",
                core->regs[5], core->regs[10], core->regs[11], core->regs[12],
                core->regs[13], core->regs[14], core->regs[15], core->regs[16]);

        /* ROB */
        fprintf(jf, "          \"rob\": [");
        for (uint32_t r = 0; r < core->rob_count; r++) {
            const rob_entry_t *re = &core->rob[r];
            fprintf(jf, "%s{\"pc\": \"0x%04x\", \"inst\": \"0x%08x\", \"state\": \"%s\", \"rd\": %u, \"rs1\": %u, \"rs2\": %u, \"wait_reg\": %u, \"result\": \"0x%08x\", \"ooo\": %s}",
                    (r > 0 ? ", " : ""),
                    re->pc, re->inst,
                    (r == 0 && re->state == ROB_DONE) ? "DONE" : rob_state_str(re->state),
                    re->rd, re->rs1, re->rs2, re->wait_reg, re->result,
                    re->executed_ooo ? "true" : "false");
        }
        fprintf(jf, "],\n");

        /* Store Buffer */
        fprintf(jf, "          \"sb\": [");
        for (uint32_t s = 0; s < core->sb_count; s++) {
            const sb_entry_t *se = &core->sb[s];
            fprintf(jf, "%s{\"addr\": \"0x%04x\", \"data\": \"0x%08x\", \"pc\": \"0x%04x\"}",
                    (s > 0 ? ", " : ""), se->addr, se->data, se->pc);
        }
        fprintf(jf, "],\n");

        /* L1 Cache */
        fprintf(jf, "          \"l1\": [");
        for (int l = 0; l < L1_LINES; l++) {
            const l1_line_t *ln = &core->l1[l];
            fprintf(jf, "%s{\"line\": %d, \"state\": \"%s\", \"addr\": \"0x%04x\", \"data\": \"0x%08x\"}",
                    (l > 0 ? ", " : ""), l, mesi_str(ln->state), ln->addr, ln->data);
        }
        fprintf(jf, "]\n");
        fprintf(jf, "        }%s\n", (c + 1 < NUM_CORES) ? "," : "");
    }
    fprintf(jf, "      ],\n");

    /* Events */
    fprintf(jf, "      \"events\": [");
    for (int e = 0; e < soc->event_count; e++) {
        if (e > 0) fprintf(jf, ", ");
        write_escaped_json_str(jf, soc->events[e]);
    }
    fprintf(jf, "]\n");
    fprintf(jf, "    }");
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <firmware.hex> [trace_out.json | --gdb [port]] [max_cycles]\n", argv[0]);
        return 1;
    }

    const char *hex_path   = argv[1];
    const char *trace_path = NULL;
    uint32_t    max_cycles = 600u;
    int         gdb_port   = -1;

    if (argc >= 3 && strcmp(argv[2], "--gdb") == 0) {
        gdb_port = (argc >= 4) ? atoi(argv[3]) : 3333;
    } else {
        trace_path = (argc >= 3) ? argv[2] : NULL;
        max_cycles = (argc >= 4) ? (uint32_t)atoi(argv[3]) : 600u;
    }

    soc_t *soc = (soc_t *)calloc(1, sizeof(soc_t));
    soc_init(soc);

    if (soc_load_hex(soc, hex_path) < 0) {
        fprintf(stderr, "Failed to load firmware hex: %s\n", hex_path);
        free(soc);
        return 1;
    }

    if (gdb_port > 0) {
        int rc = gdb_server_run(soc, hex_path, gdb_port);
        free(soc);
        return rc;
    }

    FILE *jf = NULL;
    if (trace_path) {
        jf = fopen(trace_path, "w");
        if (jf) {
            fprintf(jf, "{\n  \"engine\": \"c_emulator\",\n  \"firmware\": \"%s\",\n  \"cycles\": [\n", hex_path);
        }
    }

    printf("================================================================================\n");
    printf(" [C Emulator] Running Dual-Core RV32IA SoC on %s\n", hex_path);
    printf("================================================================================\n");

    bool first_cycle = true;
    while (soc->cycle < max_cycles) {
        soc_step_cycle(soc);
        dump_cycle_json(jf, soc, first_cycle);
        first_cycle = false;

        for (int e = 0; e < soc->event_count; e++) {
            printf("  [Cycle %3u] %s\n", soc->cycle, soc->events[e]);
        }

        if (soc->cores[0].halted && soc->cores[1].halted &&
            soc->cores[0].sb_count == 0 && soc->cores[1].sb_count == 0 &&
            !soc->bus.busy) {
            break;
        }
    }

    if (jf) {
        fprintf(jf, "\n  ]\n}\n");
        fclose(jf);
    }

    printf("--------------------------------------------------------------------------------\n");
    printf(" Simulation finished in %u cycles.\n", soc->cycle);
    for (int c = 0; c < NUM_CORES; c++) {
        const core_t *core = &soc->cores[c];
        printf(" Core %d Stats: Retired=%u, OoO_Exec=%u, SB_Enq=%u, SB_Fwd=%u, SB_Drain=%u, L1_Hit=%u, L1_Miss=%u, LR=%u, SC_OK=%u, SC_Fail=%u, AMO=%u\n",
               c, core->cnt_inst_ret, core->cnt_ooo_exec, core->cnt_sb_enq,
               core->cnt_sb_fwd, core->cnt_sb_drain, core->cnt_l1_hit,
               core->cnt_l1_miss, core->cnt_lr, core->cnt_sc_ok,
               core->cnt_sc_fail, core->cnt_amo);
    }
    printf(" Final L1 Cache & Shared RAM State (0x1000 .. 0x101C):\n");
    for (int i = 0; i < 8; i++) {
        uint32_t addr = 0x1000u + (uint32_t)(i * 4);
        printf("   [0x%04x] RAM=0x%08x | Core0_L1=[%s] 0x%08x | Core1_L1=[%s] 0x%08x\n",
               addr, soc->shm[i],
               mesi_str(soc->cores[0].l1[i].state), soc->cores[0].l1[i].data,
               mesi_str(soc->cores[1].l1[i].state), soc->cores[1].l1[i].data);
    }
    printf("================================================================================\n\n");

    free(soc);
    return 0;
}
