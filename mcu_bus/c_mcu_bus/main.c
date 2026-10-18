#include <stdio.h>
#include <stdlib.h>
#include "include/mcu_system.h"

int main(void) {
    printf("====================================================================\n");
    printf("     MCU Bus & DMA Hardware-Level Cycle Simulator (C99)\n");
    printf("====================================================================\n");
    
    mcu_system_t sys;
    mcu_system_init(&sys);
    mcu_system_open_vcd(&sys, "mcu_bus_c.vcd");
    
    printf("\n[SETUP] Configuring DMA Channel 1 for Peripheral-to-Peripheral (UART RX -> I2C TX)...\n");
    printf("        Source Address:      0x%08X (UART0_DR)\n", UART0_BASE + UART_REG_DR);
    printf("        Destination Address: 0x%08X (I2C0_DR)\n", I2C0_BASE + I2C_REG_DR);
    printf("        Transfer Count:      5 bytes\n");
    printf("        Direction:           P2P (Requires UART_RXNE_REQ & I2C_TXE_REQ)\n");
    
    dma_configure(&sys.dma, 
                  UART0_BASE + UART_REG_DR, 
                  I2C0_BASE + I2C_REG_DR, 
                  5, 
                  DMA_CCR_DIR_P2P, 
                  false, /* circular = false */
                  false, /* pinc = false */
                  false, /* minc = false */
                  3      /* Priority = Very High */);
    
    /* Schedule test UART input bytes */
    uart_schedule_receive(&sys.uart, 2, 0x11);
    uart_schedule_receive(&sys.uart, 3, 0x22);
    uart_schedule_receive(&sys.uart, 4, 0x33);
    uart_schedule_receive(&sys.uart, 5, 0x44);
    uart_schedule_receive(&sys.uart, 6, 0x55);
    
    /* Start DMA */
    dma_start(&sys.dma);
    
    printf("\n--- Starting Simulation Execution ---\n\n");
    
    for (int cycle = 1; cycle <= 60; cycle++) {
        mcu_system_step(&sys);
        
        /* Stop condition: DMA complete and all peripheral FIFOs flushed and I2C finished wire transmission */
        if (sys.dma.state == DMA_STATE_COMPLETE &&
            sys.uart.fifo_count == 0 &&
            sys.i2c.fifo_count == 0 &&
            !sys.i2c.is_transmitting &&
            sys.cpu.state == CPU_STATE_RUNNING) {
            printf("\n[SIM] All transfers, transmissions, and ISRs completed at Cycle %d!\n", cycle);
            break;
        }
    }

    mcu_system_close_vcd(&sys);
    
    printf("\n====================================================================\n");
    printf("                     SIMULATION STATISTICS\n");
    printf("====================================================================\n");
    printf("Total Simulation Cycles:    %u\n", sys.bus.total_cycles);
    printf("DMA Bus Grants:             %u\n", sys.bus.dma_grants);
    printf("CPU Bus Grants:             %u\n", sys.bus.cpu_grants);
    printf("Bus Contentions Resolved:   %u\n", sys.bus.bus_contentions);
    printf("DMA Stalls (Lost Arb):      %u\n", sys.dma.bus_stalls);
    printf("CPU Stalls (Lost Arb):      %u\n", sys.cpu.bus_stalls);
    printf("Idle Bus Cycles:            %u\n", sys.bus.idle_cycles);
    printf("Total Bytes Transferred:    %u\n", sys.dma.total_transferred);
    printf("I2C Wire Transmitted:       %u\n", sys.i2c.total_transmitted);
    printf("Final DMA State:            %s (CNDTR=%u)\n", 
           dma_state_to_string(sys.dma.state), sys.dma.cndtr);
    printf("Final UART RX FIFO Count:   %u\n", sys.uart.fifo_count);
    printf("Final I2C TX FIFO Count:    %u\n", sys.i2c.fifo_count);
    printf("VCD Waveform Saved To:      mcu_bus_c.vcd\n");
    printf("====================================================================\n");
    
    return 0;
}
