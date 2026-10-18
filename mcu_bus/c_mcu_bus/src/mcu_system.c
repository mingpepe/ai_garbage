#include "../include/mcu_system.h"
#include <stdio.h>
#include <string.h>

void mcu_system_init(mcu_system_t *sys) {
    if (!sys) return;
    memset(sys, 0, sizeof(mcu_system_t));
    sys->cycle = 1;
    sys->verbose = true;
    
    bus_init(&sys->bus);
    sram_init(&sys->sram);
    uart_init(&sys->uart, 4);       /* 4-byte RX FIFO */
    i2c_init(&sys->i2c, 2, 4);      /* 2-byte TX FIFO, 4 cycles per byte */
    nvic_init(&sys->nvic);
    dma_init(&sys->dma);
    cpu_init(&sys->cpu, 3);         /* CPU polls every 3 cycles */
}

uint32_t mcu_bus_read(mcu_system_t *sys, uint32_t addr) {
    if (!sys) return 0;
    
    if (addr >= SRAM_BASE && addr < (SRAM_BASE + SRAM_SIZE)) {
        return sram_read(&sys->sram, addr);
    }
    if (addr >= UART0_BASE && addr < (UART0_BASE + 0x100)) {
        return uart_read_reg(&sys->uart, addr - UART0_BASE);
    }
    if (addr >= I2C0_BASE && addr < (I2C0_BASE + 0x100)) {
        return i2c_read_reg(&sys->i2c, addr - I2C0_BASE);
    }
    if (addr >= DMA1_BASE && addr < (DMA1_BASE + 0x100)) {
        return dma_read_reg(&sys->dma, addr - DMA1_BASE);
    }
    if (addr >= NVIC_BASE && addr < (NVIC_BASE + 0x100)) {
        return nvic_read_reg(&sys->nvic, addr - NVIC_BASE);
    }
    return 0;
}

void mcu_bus_write(mcu_system_t *sys, uint32_t addr, uint32_t data) {
    if (!sys) return;
    
    if (addr >= SRAM_BASE && addr < (SRAM_BASE + SRAM_SIZE)) {
        sram_write(&sys->sram, addr, data);
        return;
    }
    if (addr >= UART0_BASE && addr < (UART0_BASE + 0x100)) {
        uart_write_reg(&sys->uart, addr - UART0_BASE, data);
        return;
    }
    if (addr >= I2C0_BASE && addr < (I2C0_BASE + 0x100)) {
        i2c_write_reg(&sys->i2c, addr - I2C0_BASE, data);
        return;
    }
    if (addr >= DMA1_BASE && addr < (DMA1_BASE + 0x100)) {
        dma_write_reg(&sys->dma, addr - DMA1_BASE, data);
        return;
    }
    if (addr >= NVIC_BASE && addr < (NVIC_BASE + 0x100)) {
        nvic_write_reg(&sys->nvic, addr - NVIC_BASE, data);
        return;
    }
}

static void write_vcd_bin(FILE *fp, uint32_t val, int bits, const char *id) {
    if (bits == 1) {
        fprintf(fp, "%d%s\n", val & 1, id);
    } else {
        fprintf(fp, "b");
        for (int i = bits - 1; i >= 0; i--) {
            fprintf(fp, "%d", (val >> i) & 1);
        }
        fprintf(fp, " %s\n", id);
    }
}

bool mcu_system_open_vcd(mcu_system_t *sys, const char *filename) {
    if (!sys || !filename) return false;
    sys->vcd_fp = fopen(filename, "w");
    if (!sys->vcd_fp) return false;

    FILE *fp = sys->vcd_fp;
    fprintf(fp, "$date\n  Today\n$end\n");
    fprintf(fp, "$version\n  MCU Bus & DMA C99 Simulator\n$end\n");
    fprintf(fp, "$timescale 1ns $end\n");
    fprintf(fp, "$scope module tb_mcu_top $end\n");
    fprintf(fp, "$var wire 1 ! clk $end\n");
    fprintf(fp, "$var wire 2 \" bus_master [1:0] $end\n");
    fprintf(fp, "$var wire 32 # haddr [31:0] $end\n");
    fprintf(fp, "$var wire 1 $ hwrite $end\n");
    fprintf(fp, "$var wire 8 %% hdata [7:0] $end\n");
    fprintf(fp, "$var wire 3 & dma_state [2:0] $end\n");
    fprintf(fp, "$var wire 16 ' dma_cndtr [15:0] $end\n");
    fprintf(fp, "$var wire 8 ( dma_data_latch [7:0] $end\n");
    fprintf(fp, "$var wire 1 ) dreq_uart_rx $end\n");
    fprintf(fp, "$var wire 1 * dreq_i2c_tx $end\n");
    fprintf(fp, "$var wire 1 + irq_dma_tc $end\n");
    fprintf(fp, "$var wire 3 , uart_fifo_count [2:0] $end\n");
    fprintf(fp, "$var wire 2 - i2c_fifo_count [1:0] $end\n");
    fprintf(fp, "$var wire 1 . i2c_is_transmitting $end\n");
    fprintf(fp, "$var wire 8 / i2c_shift_byte [7:0] $end\n");
    fprintf(fp, "$var wire 2 0 cpu_state [1:0] $end\n");
    fprintf(fp, "$upscope $end\n");
    fprintf(fp, "$enddefinitions $end\n");
    fprintf(fp, "#0\n$dumpvars\n");
    write_vcd_bin(fp, 0, 1, "!");
    write_vcd_bin(fp, 0, 2, "\"");
    write_vcd_bin(fp, 0, 32, "#");
    write_vcd_bin(fp, 0, 1, "$");
    write_vcd_bin(fp, 0, 8, "%");
    write_vcd_bin(fp, 0, 3, "&");
    write_vcd_bin(fp, 0, 16, "'");
    write_vcd_bin(fp, 0, 8, "(");
    write_vcd_bin(fp, 0, 1, ")");
    write_vcd_bin(fp, 1, 1, "*");
    write_vcd_bin(fp, 0, 1, "+");
    write_vcd_bin(fp, 0, 3, ",");
    write_vcd_bin(fp, 0, 2, "-");
    write_vcd_bin(fp, 0, 1, ".");
    write_vcd_bin(fp, 0, 8, "/");
    write_vcd_bin(fp, 0, 2, "0");
    fprintf(fp, "$end\n");
    return true;
}

void mcu_system_close_vcd(mcu_system_t *sys) {
    if (sys && sys->vcd_fp) {
        fprintf(sys->vcd_fp, "#%d\n", sys->cycle * 10);
        fclose(sys->vcd_fp);
        sys->vcd_fp = NULL;
    }
}

void mcu_system_step(mcu_system_t *sys) {
    if (!sys) return;
    int cycle = sys->cycle;
    
    /* 1. Begin bus cycle */
    bus_begin_cycle(&sys->bus, cycle);
    
    /* 2. Clock peripherals */
    uart_tick(&sys->uart, cycle);
    i2c_tick(&sys->i2c);
    
    /* 3. Propagate hardware interrupt lines to NVIC (edge-triggered) */
    static bool prev_ore = false;
    static bool prev_dma_irq = false;
    
    if (sys->uart.irq_ore && !prev_ore) {
        nvic_set_pending(&sys->nvic, IRQ_UART_ORE);
    }
    prev_ore = sys->uart.irq_ore;
    
    if (sys->dma.irq_line && !prev_dma_irq) {
        nvic_set_pending(&sys->nvic, IRQ_DMA1_CH1);
    }
    prev_dma_irq = sys->dma.irq_line;
    
    /* 4. Propagate hardware handshakes to DMA */
    dma_tick_handshake(&sys->dma, sys->uart.dma_req_rx, sys->i2c.dma_req_tx);
    
    /* 5. Masters assert bus requests */
    cpu_prepare_bus_request(&sys->cpu, &sys->bus, &sys->nvic, cycle);
    dma_prepare_bus_request(&sys->dma, &sys->bus);
    
    /* 6. Bus arbiter commits and executes transaction */
    bus_transaction_t trans = bus_commit(&sys->bus, sys);
    
    /* 7. CPU executes and handles ISRs */
    cpu_tick(&sys->cpu, &sys->nvic, cycle);

    /* 8. Dump VCD sample if open */
    if (sys->vcd_fp) {
        FILE *fp = sys->vcd_fp;
        int t_rise = (cycle - 1) * 10 + 5;
        int t_fall = cycle * 10;
        fprintf(fp, "#%d\n", t_rise);
        write_vcd_bin(fp, 1, 1, "!");
        write_vcd_bin(fp, (uint32_t)trans.granted_master, 2, "\"");
        write_vcd_bin(fp, trans.active ? trans.addr : 0, 32, "#");
        write_vcd_bin(fp, trans.active && trans.is_write ? 1 : 0, 1, "$");
        write_vcd_bin(fp, trans.active ? (trans.is_write ? trans.wdata : trans.rdata) : 0, 8, "%");
        write_vcd_bin(fp, (uint32_t)sys->dma.state, 3, "&");
        write_vcd_bin(fp, sys->dma.cndtr, 16, "'");
        write_vcd_bin(fp, sys->dma.data_latch, 8, "(");
        write_vcd_bin(fp, sys->uart.dma_req_rx ? 1 : 0, 1, ")");
        write_vcd_bin(fp, sys->i2c.dma_req_tx ? 1 : 0, 1, "*");
        write_vcd_bin(fp, sys->dma.irq_line ? 1 : 0, 1, "+");
        write_vcd_bin(fp, sys->uart.fifo_count, 3, ",");
        write_vcd_bin(fp, sys->i2c.fifo_count, 2, "-");
        write_vcd_bin(fp, sys->i2c.is_transmitting ? 1 : 0, 1, ".");
        write_vcd_bin(fp, sys->i2c.shift_byte, 8, "/");
        write_vcd_bin(fp, (uint32_t)sys->cpu.state, 2, "0");

        fprintf(fp, "#%d\n", t_fall);
        write_vcd_bin(fp, 0, 1, "!");
    }
    
    if (sys->verbose) {
        const char *m_name = (trans.granted_master == BUS_MASTER_DMA) ? "\033[1;32mDMA \033[0m" :
                             (trans.granted_master == BUS_MASTER_CPU) ? "\033[1;36mCPU \033[0m" :
                             "\033[90mIDLE\033[0m";
        printf("[Cyc %3d] Bus: %s | DMA:%-12s | CNDTR:%2u | UART_RX:%u/4 (DREQ:%d) | I2C_TX:%u/2 (DREQ:%d) | %s\n",
               cycle,
               m_name,
               dma_state_to_string(sys->dma.state),
               sys->dma.cndtr,
               sys->uart.fifo_count, sys->uart.dma_req_rx,
               sys->i2c.fifo_count, sys->i2c.dma_req_tx,
               trans.active ? trans.description : "No Bus Op");
    }
    
    sys->cycle++;
}
