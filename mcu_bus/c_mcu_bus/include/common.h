#ifndef MCU_COMMON_H
#define MCU_COMMON_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

/* Memory Map Base Addresses */
#define SRAM_BASE        0x20000000U
#define SRAM_SIZE        256U

#define UART0_BASE       0x40000000U
#define I2C0_BASE        0x40001000U
#define DMA1_BASE        0x40020000U
#define NVIC_BASE        0xE000E100U

/* UART Registers */
#define UART_REG_CR      0x00U  /* Control: [0]=UE, [1]=RXNEIE, [2]=DMARXEN */
#define UART_REG_SR      0x04U  /* Status:  [0]=RXNE, [1]=ORE (Overrun) */
#define UART_REG_DR      0x08U  /* Data:    [7:0]=Data */
#define UART_REG_CNT     0x0CU  /* FIFO Count */

#define UART_CR_UE       (1U << 0)
#define UART_CR_RXNEIE   (1U << 1)
#define UART_CR_DMARXEN  (1U << 2)

#define UART_SR_RXNE     (1U << 0)
#define UART_SR_ORE      (1U << 1)

/* I2C Registers */
#define I2C_REG_CR       0x00U  /* Control: [0]=PE, [1]=TXEIE, [2]=DMATXEN */
#define I2C_REG_SR       0x04U  /* Status:  [0]=TXE, [1]=BUSY */
#define I2C_REG_DR       0x08U  /* Data:    [7:0]=Data */
#define I2C_REG_CNT      0x0CU  /* FIFO Count */

#define I2C_CR_PE        (1U << 0)
#define I2C_CR_TXEIE     (1U << 1)
#define I2C_CR_DMATXEN   (1U << 2)

#define I2C_SR_TXE       (1U << 0)
#define I2C_SR_BUSY      (1U << 1)

/* DMA Registers */
#define DMA_REG_ISR      0x00U  /* Interrupt Status: [0]=GIF, [1]=TCIF, [2]=HTIF, [3]=TEIF */
#define DMA_REG_IFCR     0x04U  /* Interrupt Flag Clear */
#define DMA_REG_CCR      0x08U  /* Channel Control */
#define DMA_REG_CNDTR    0x0CU  /* Number of Data */
#define DMA_REG_CPAR     0x10U  /* Peripheral Address (Source in P2M/P2P) */
#define DMA_REG_CMAR     0x14U  /* Memory Address (Dest in P2M, Source in M2P) */

/* DMA CCR Bitfields */
#define DMA_CCR_EN       (1U << 0)  /* Channel Enable */
#define DMA_CCR_TCIE     (1U << 1)  /* Transfer Complete Interrupt Enable */
#define DMA_CCR_HTIE     (1U << 2)  /* Half Transfer Interrupt Enable */
#define DMA_CCR_TEIE     (1U << 3)  /* Transfer Error Interrupt Enable */
#define DMA_CCR_DIR_MASK (3U << 4)  /* Direction: 00=P2M, 01=M2P, 10=P2P */
#define DMA_CCR_DIR_P2M  (0U << 4)
#define DMA_CCR_DIR_M2P  (1U << 4)
#define DMA_CCR_DIR_P2P  (2U << 4)
#define DMA_CCR_CIRC     (1U << 6)  /* Circular mode */
#define DMA_CCR_PINC     (1U << 7)  /* Peripheral Increment */
#define DMA_CCR_MINC     (1U << 8)  /* Memory Increment */
#define DMA_CCR_PL_MASK  (3U << 9)  /* Priority Level: 0=Low, 1=Medium, 2=High, 3=VeryHigh */

/* DMA ISR / IFCR Flags */
#define DMA_FLAG_GIF     (1U << 0)
#define DMA_FLAG_TCIF    (1U << 1)
#define DMA_FLAG_HTIF    (1U << 2)
#define DMA_FLAG_TEIF    (1U << 3)

/* IRQ Numbers in NVIC */
#define IRQ_UART_RXNE    0
#define IRQ_UART_ORE     1
#define IRQ_I2C_TXE      2
#define IRQ_DMA1_CH1     3
#define IRQ_COUNT        4

#endif /* MCU_COMMON_H */
