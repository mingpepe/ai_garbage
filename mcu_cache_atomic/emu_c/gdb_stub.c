#include "gdb_stub.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#define MAX_BP 64

typedef struct {
    uint32_t bps[MAX_BP];
    int      bp_count;
    int      dbg_core; /* 0 = Core 0 (Thread 1), 1 = Core 1 (Thread 2) */
    char     hex_path[512];
} gdb_ctx_t;

static inline uint32_t core_arch_pc(const core_t *c) {
    if (c->rob_count > 0 && c->rob[0].valid) {
        return c->rob[0].pc;
    }
    return c->pc;
}

static bool has_bp(const gdb_ctx_t *ctx, uint32_t addr) {
    for (int i = 0; i < ctx->bp_count; i++) {
        if (ctx->bps[i] == addr) return true;
    }
    return false;
}

static void add_bp(gdb_ctx_t *ctx, uint32_t addr) {
    if (has_bp(ctx, addr)) return;
    if (ctx->bp_count < MAX_BP) {
        ctx->bps[ctx->bp_count++] = addr;
    }
}

static void del_bp(gdb_ctx_t *ctx, uint32_t addr) {
    for (int i = 0; i < ctx->bp_count; i++) {
        if (ctx->bps[i] == addr) {
            ctx->bps[i] = ctx->bps[ctx->bp_count - 1];
            ctx->bp_count--;
            return;
        }
    }
}

static int hex_val(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return 0;
}

static void send_packet(int fd, const char *payload) {
    uint8_t csum = 0;
    for (const char *p = payload; *p; p++) {
        csum += (uint8_t)(*p);
    }
    char buf[8192];
    int len = snprintf(buf, sizeof(buf), "$%s#%02x", payload, csum);
    if (len > 0) {
        (void)write(fd, buf, (size_t)len);
    }
}

/* Send console output packet ('O' + hex string) to GDB Debug Console */
static void send_console_str(int fd, const char *str) {
    char payload[4096];
    size_t pos = 0;
    payload[pos++] = 'O';
    for (const char *p = str; *p && pos + 3 < sizeof(payload); p++) {
        snprintf(&payload[pos], 3, "%02x", (uint8_t)(*p));
        pos += 2;
    }
    payload[pos] = '\0';
    send_packet(fd, payload);
}

static uint32_t read_mem_word(const soc_t *soc, int core_id, uint32_t addr) {
    uint32_t aligned = addr & ~3u;
    if (aligned < ROM_WORDS * 4u) {
        return soc->rom[aligned >> 2];
    } else if (aligned >= 0x1000u && aligned < 0x1000u + SHM_WORDS * 4u) {
        const core_t *c = &soc->cores[core_id];
        /* Check local Store Buffer first */
        for (int i = (int)c->sb_count - 1; i >= 0; i--) {
            if (c->sb[i].valid && c->sb[i].addr == aligned) return c->sb[i].data;
        }
        /* Check local L1 Cache next */
        uint32_t idx = (aligned >> 2) & (L1_LINES - 1u);
        uint32_t tag = aligned >> 5;
        if (c->l1[idx].state != MESI_I && c->l1[idx].tag == tag) {
            return c->l1[idx].data;
        }
        /* Check if peer L1 has Modified ('M') copy */
        const core_t *peer = &soc->cores[1 - core_id];
        if (peer->l1[idx].state == MESI_M && peer->l1[idx].tag == tag) {
            return peer->l1[idx].data;
        }
        return soc->shm[(aligned - 0x1000u) >> 2];
    } else if (aligned >= 0x2000u && aligned < 0x2000u + DTCM_WORDS * 4u) {
        return soc->cores[core_id].dtcm[(aligned - 0x2000u) >> 2];
    }
    return 0u;
}

static uint8_t read_mem_byte(const soc_t *soc, int core_id, uint32_t addr) {
    uint32_t w = read_mem_word(soc, core_id, addr);
    uint32_t shift = (addr & 3u) * 8u;
    return (uint8_t)((w >> shift) & 0xFFu);
}

static void dump_hw_status_to_gdb(int fd, const soc_t *soc) {
    char line[512];
    snprintf(line, sizeof(line),
             "\n=== [Cycle %u] Dual-Core Hardware Status (Bus: %s %s @ 0x%04x) ===\n",
             soc->cycle, soc->bus.busy ? "BUSY" : "IDLE",
             bus_cmd_str(soc->bus.cmd), soc->bus.addr);
    send_console_str(fd, line);

    for (int c = 0; c < NUM_CORES; c++) {
        const core_t *core = &soc->cores[c];
        snprintf(line, sizeof(line),
                 "Core %d (Hart %d) | ArchPC=0x%04x FetchPC=0x%04x | Phase=%u | LR_Res=%s(0x%04x) | SB_Count=%u | ROB_Count=%u\n",
                 c, c, core_arch_pc(core), core->pc, core->phase_tag,
                 core->res_valid ? "VALID" : "NONE", core->res_addr,
                 core->sb_count, core->rob_count);
        send_console_str(fd, line);

        /* ROB entries */
        for (uint32_t r = 0; r < core->rob_count; r++) {
            const rob_entry_t *re = &core->rob[r];
            snprintf(line, sizeof(line),
                     "  ROB[%u]: PC=0x%04x Inst=0x%08x State=%-8s %s\n",
                     r, re->pc, re->inst,
                     (r == 0 && re->state == ROB_DONE) ? "DONE" : rob_state_str(re->state),
                     re->executed_ooo ? "[Executed Out-of-Order!]" : "");
            send_console_str(fd, line);
        }

        /* Store Buffer entries */
        for (uint32_t s = 0; s < core->sb_count; s++) {
            snprintf(line, sizeof(line),
                     "  SB[%u] : [0x%04x] <= 0x%08x (from PC 0x%04x)\n",
                     s, core->sb[s].addr, core->sb[s].data, core->sb[s].pc);
            send_console_str(fd, line);
        }
    }

    send_console_str(fd, "L1 MESI Cache & Shared RAM (0x1000..0x101C):\n");
    for (int i = 0; i < L1_LINES; i++) {
        snprintf(line, sizeof(line),
                 "  Line %d [0x%04x]: RAM=0x%08x | Core0_L1=[%s] 0x%08x | Core1_L1=[%s] 0x%08x\n",
                 i, 0x1000 + i * 4, soc->shm[i],
                 mesi_str(soc->cores[0].l1[i].state), soc->cores[0].l1[i].data,
                 mesi_str(soc->cores[1].l1[i].state), soc->cores[1].l1[i].data);
        send_console_str(fd, line);
    }
}

static void step_one_cycle_with_logs(int fd, soc_t *soc) {
    soc_step_cycle(soc);
    for (int e = 0; e < soc->event_count; e++) {
        char msg[256];
        snprintf(msg, sizeof(msg), "[Cycle %3u] %s\n", soc->cycle, soc->events[e]);
        send_console_str(fd, msg);
        printf("  %s", msg);
    }
}

static void handle_step_core(int fd, soc_t *soc, int core_id) {
    uint32_t start_pc = core_arch_pc(&soc->cores[core_id]);
    /* Step cycles until selected core retires 1 instruction or its arch PC changes (up to 32 cycles) */
    for (int k = 0; k < 32; k++) {
        step_one_cycle_with_logs(fd, soc);
        uint32_t now_pc = core_arch_pc(&soc->cores[core_id]);
        if (soc->cores[core_id].last_commit_valid || now_pc != start_pc || soc->cores[core_id].halted) {
            /* If ROB is temporarily empty after a branch/jump, step 1 more cycle so Fetch populates ROB[0] */
            if (soc->cores[core_id].rob_count == 0 && !soc->cores[core_id].halted) {
                step_one_cycle_with_logs(fd, soc);
            }
            break;
        }
    }
}

static int handle_continue(int fd, soc_t *soc, gdb_ctx_t *ctx) {
    for (int k = 0; k < 2000; k++) {
        step_one_cycle_with_logs(fd, soc);
        /* Check if any core hit a breakpoint on a newly arrived instruction */
        for (int c = 0; c < NUM_CORES; c++) {
            uint32_t pc = core_arch_pc(&soc->cores[c]);
            if (has_bp(ctx, pc)) {
                ctx->dbg_core = c;
                return c;
            }
        }
        if (soc->cores[0].halted && soc->cores[1].halted &&
            soc->cores[0].sb_count == 0 && soc->cores[1].sb_count == 0 && !soc->bus.busy) {
            break;
        }
    }
    return ctx->dbg_core;
}

int gdb_server_run(soc_t *soc, const char *hex_path, int port) {
    gdb_ctx_t ctx;
    memset(&ctx, 0, sizeof(ctx));
    snprintf(ctx.hex_path, sizeof(ctx.hex_path), "%s", hex_path);

    /* Step 1 initial cycle so ROB[0] is fetched at PC=0x0000 for both cores */
    soc_step_cycle(soc);

    int srv_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (srv_fd < 0) {
        perror("socket");
        return 1;
    }
    int opt = 1;
    setsockopt(srv_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family      = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port        = htons((uint16_t)port);

    if (bind(srv_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(srv_fd);
        return 1;
    }
    if (listen(srv_fd, 1) < 0) {
        perror("listen");
        close(srv_fd);
        return 1;
    }

    printf("================================================================================\n");
    printf(" [GDB Server] Dual-Core RV32IA Emulator listening on 127.0.0.1:%d\n", port);
    printf("   Firmware : %s\n", hex_path);
    printf("   Thread 1 : Core 0 (Hart 0)\n");
    printf("   Thread 2 : Core 1 (Hart 1)\n");
    printf("   Waiting for VS Code / riscv32-unknown-elf-gdb connection...\n");
    printf("================================================================================\n");
    fflush(stdout);

    int cli_fd = accept(srv_fd, NULL, NULL);
    if (cli_fd < 0) {
        perror("accept");
        close(srv_fd);
        return 1;
    }
    printf(" [GDB Server] Debugger connected!\n");

    char rx_buf[4096];
    char pkt[4096];
    int  pkt_len = 0;
    bool in_pkt  = false;
    int  csum_chars = 0;

    bool running = true;
    while (running) {
        ssize_t n = read(cli_fd, rx_buf, sizeof(rx_buf));
        if (n <= 0) break;

        for (ssize_t i = 0; i < n; i++) {
            char ch = rx_buf[i];
            if (!in_pkt) {
                if (ch == '$') {
                    in_pkt = true;
                    pkt_len = 0;
                    csum_chars = 0;
                } else if (ch == 0x03) {
                    /* Ctrl+C interrupt */
                    char stop_reply[64];
                    snprintf(stop_reply, sizeof(stop_reply), "T05thread:0%d;", ctx.dbg_core + 1);
                    send_packet(cli_fd, stop_reply);
                }
            } else {
                if (ch == '#') {
                    csum_chars = 1;
                } else if (csum_chars > 0) {
                    csum_chars++;
                    if (csum_chars == 3) {
                        in_pkt = false;
                        pkt[pkt_len] = '\0';
                        /* Acknowledge packet */
                        (void)write(cli_fd, "+", 1);

                        /* Process GDB RSP packet */
                        if (strncmp(pkt, "qSupported", 10) == 0) {
                            send_packet(cli_fd, "PacketSize=4096;swbreak+;hwbreak+;vContSupported+");
                        } else if (strcmp(pkt, "?") == 0) {
                            char rep[64];
                            snprintf(rep, sizeof(rep), "T05thread:0%d;", ctx.dbg_core + 1);
                            send_packet(cli_fd, rep);
                        } else if (pkt[0] == 'H') {
                            /* Hg<tid> or Hc<tid> */
                            int tid = atoi(&pkt[2]);
                            if (tid == 1 || tid == 2) ctx.dbg_core = tid - 1;
                            send_packet(cli_fd, "OK");
                        } else if (strcmp(pkt, "qfThreadInfo") == 0) {
                            send_packet(cli_fd, "m1,2");
                        } else if (strcmp(pkt, "qsThreadInfo") == 0) {
                            send_packet(cli_fd, "l");
                        } else if (strncmp(pkt, "qThreadExtraInfo,", 17) == 0) {
                            int tid = atoi(&pkt[17]);
                            int c_id = (tid == 2) ? 1 : 0;
                            const core_t *core = &soc->cores[c_id];
                            char info[128];
                            snprintf(info, sizeof(info), "Core %d (Hart %d | Phase %u | SB=%u | Res=%s)",
                                     c_id, c_id, core->phase_tag, core->sb_count,
                                     core->res_valid ? "VALID" : "NONE");
                            char hex_info[256];
                            for (size_t k = 0; k < strlen(info); k++) {
                                snprintf(&hex_info[k * 2], 3, "%02x", (uint8_t)info[k]);
                            }
                            send_packet(cli_fd, hex_info);
                        } else if (strcmp(pkt, "qC") == 0) {
                            char rep[32];
                            snprintf(rep, sizeof(rep), "QC0%d", ctx.dbg_core + 1);
                            send_packet(cli_fd, rep);
                        } else if (pkt[0] == 'T') {
                            send_packet(cli_fd, "OK");
                        } else if (strcmp(pkt, "g") == 0) {
                            const core_t *core = &soc->cores[ctx.dbg_core];
                            char reg_hex[33 * 8 + 1];
                            for (int r = 0; r < 32; r++) {
                                uint32_t v = core->regs[r];
                                snprintf(&reg_hex[r * 8], 9, "%02x%02x%02x%02x",
                                         v & 0xFFu, (v >> 8) & 0xFFu, (v >> 16) & 0xFFu, (v >> 24) & 0xFFu);
                            }
                            uint32_t pc = core_arch_pc(core);
                            snprintf(&reg_hex[32 * 8], 9, "%02x%02x%02x%02x",
                                     pc & 0xFFu, (pc >> 8) & 0xFFu, (pc >> 16) & 0xFFu, (pc >> 24) & 0xFFu);
                            send_packet(cli_fd, reg_hex);
                        } else if (pkt[0] == 'p') {
                            uint32_t reg_num = (uint32_t)strtoul(&pkt[1], NULL, 16);
                            const core_t *core = &soc->cores[ctx.dbg_core];
                            uint32_t v = 0;
                            if (reg_num < 32) v = core->regs[reg_num];
                            else if (reg_num == 32) v = core_arch_pc(core);
                            else if (reg_num == 0xF14 + 65) v = core->hartid;
                            char rhex[16];
                            snprintf(rhex, sizeof(rhex), "%02x%02x%02x%02x",
                                     v & 0xFFu, (v >> 8) & 0xFFu, (v >> 16) & 0xFFu, (v >> 24) & 0xFFu);
                            send_packet(cli_fd, rhex);
                        } else if (pkt[0] == 'm') {
                            uint32_t m_addr = 0, m_len = 0;
                            if (sscanf(&pkt[1], "%x,%x", &m_addr, &m_len) == 2) {
                                if (m_len > 1024) m_len = 1024;
                                char mhex[2050];
                                for (uint32_t b = 0; b < m_len; b++) {
                                    uint8_t byte_val = read_mem_byte(soc, ctx.dbg_core, m_addr + b);
                                    snprintf(&mhex[b * 2], 3, "%02x", byte_val);
                                }
                                mhex[m_len * 2] = '\0';
                                send_packet(cli_fd, mhex);
                            } else {
                                send_packet(cli_fd, "E01");
                            }
                        } else if (pkt[0] == 'Z' || pkt[0] == 'z') {
                            uint32_t type = 0, b_addr = 0, kind = 0;
                            if (sscanf(&pkt[1], "%x,%x,%x", &type, &b_addr, &kind) >= 2 && (type == 0 || type == 1)) {
                                if (pkt[0] == 'Z') add_bp(&ctx, b_addr);
                                else del_bp(&ctx, b_addr);
                                send_packet(cli_fd, "OK");
                            } else {
                                send_packet(cli_fd, "");
                            }
                        } else if (strcmp(pkt, "vCont?") == 0) {
                            send_packet(cli_fd, "vCont;c;C;s;S");
                        } else if (strncmp(pkt, "vCont;", 6) == 0 || pkt[0] == 's' || pkt[0] == 'c') {
                            bool is_step = (pkt[0] == 's') || (strncmp(pkt, "vCont;s", 7) == 0) || (strncmp(pkt, "vCont;S", 7) == 0);
                            if (strncmp(pkt, "vCont;s:", 8) == 0 || strncmp(pkt, "vCont;S:", 8) == 0) {
                                int tid = atoi(&pkt[8]);
                                if (tid == 1 || tid == 2) ctx.dbg_core = tid - 1;
                            }
                            if (is_step) {
                                handle_step_core(cli_fd, soc, ctx.dbg_core);
                                char rep[64];
                                snprintf(rep, sizeof(rep), "T05thread:0%d;", ctx.dbg_core + 1);
                                send_packet(cli_fd, rep);
                            } else {
                                int hit_c = handle_continue(cli_fd, soc, &ctx);
                                char rep[64];
                                snprintf(rep, sizeof(rep), "T05thread:0%d;", hit_c + 1);
                                send_packet(cli_fd, rep);
                            }
                        } else if (strncmp(pkt, "qRcmd,", 6) == 0) {
                            /* Decode monitor command */
                            char cmd[256];
                            size_t clen = 0;
                            for (size_t k = 6; pkt[k] && pkt[k + 1] && clen + 1 < sizeof(cmd); k += 2) {
                                cmd[clen++] = (char)((hex_val(pkt[k]) << 4) | hex_val(pkt[k + 1]));
                            }
                            cmd[clen] = '\0';

                            if (strncmp(cmd, "cycle", 5) == 0) {
                                step_one_cycle_with_logs(cli_fd, soc);
                                dump_hw_status_to_gdb(cli_fd, soc);
                            } else if (strncmp(cmd, "reset", 5) == 0) {
                                soc_init(soc);
                                soc_load_hex(soc, ctx.hex_path);
                                soc_step_cycle(soc);
                                send_console_str(cli_fd, "SoC Reset to Cycle 1 (PC=0x0000).\n");
                            } else {
                                /* monitor status / monitor hw / monitor sb / monitor l1 */
                                dump_hw_status_to_gdb(cli_fd, soc);
                            }
                            send_packet(cli_fd, "OK");
                        } else if (pkt[0] == 'k' || pkt[0] == 'D') {
                            send_packet(cli_fd, "OK");
                            running = false;
                            break;
                        } else {
                            send_packet(cli_fd, "");
                        }
                    }
                } else {
                    if (pkt_len + 1 < (int)sizeof(pkt)) {
                        pkt[pkt_len++] = ch;
                    }
                }
            }
        }
    }

    close(cli_fd);
    close(srv_fd);
    return 0;
}
