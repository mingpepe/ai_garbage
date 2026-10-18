export const SRAM_BASE = 0x20000000;
export const SRAM_SIZE = 256;

export const UART0_BASE = 0x40000000;
export const I2C0_BASE = 0x40001000;
export const DMA1_BASE = 0x40020000;
export const NVIC_BASE = 0xE000E100;

export const UART_REG_CR = 0x00;
export const UART_REG_SR = 0x04;
export const UART_REG_DR = 0x08;
export const UART_REG_CNT = 0x0C;

export const UART_CR_UE = 1 << 0;
export const UART_CR_RXNEIE = 1 << 1;
export const UART_CR_DMARXEN = 1 << 2;

export const UART_SR_RXNE = 1 << 0;
export const UART_SR_ORE = 1 << 1;

export const I2C_REG_CR = 0x00;
export const I2C_REG_SR = 0x04;
export const I2C_REG_DR = 0x08;
export const I2C_REG_CNT = 0x0C;

export const I2C_CR_PE = 1 << 0;
export const I2C_CR_TXEIE = 1 << 1;
export const I2C_CR_DMATXEN = 1 << 2;

export const I2C_SR_TXE = 1 << 0;
export const I2C_SR_BUSY = 1 << 1;

export const DMA_REG_ISR = 0x00;
export const DMA_REG_IFCR = 0x04;
export const DMA_REG_CCR = 0x08;
export const DMA_REG_CNDTR = 0x0C;
export const DMA_REG_CPAR = 0x10;
export const DMA_REG_CMAR = 0x14;

export const DMA_CCR_EN = 1 << 0;
export const DMA_CCR_TCIE = 1 << 1;
export const DMA_CCR_HTIE = 1 << 2;
export const DMA_CCR_TEIE = 1 << 3;
export const DMA_CCR_DIR_MASK = 3 << 4;
export const DMA_CCR_DIR_P2M = 0 << 4;
export const DMA_CCR_DIR_M2P = 1 << 4;
export const DMA_CCR_DIR_P2P = 2 << 4;
export const DMA_CCR_CIRC = 1 << 6;
export const DMA_CCR_PINC = 1 << 7;
export const DMA_CCR_MINC = 1 << 8;
export const DMA_CCR_PL_MASK = 3 << 9;

export const DMA_FLAG_GIF = 1 << 0;
export const DMA_FLAG_TCIF = 1 << 1;
export const DMA_FLAG_HTIF = 1 << 2;
export const DMA_FLAG_TEIF = 1 << 3;

export const IRQ_UART_RXNE = 0;
export const IRQ_UART_ORE = 1;
export const IRQ_I2C_TXE = 2;
export const IRQ_DMA1_CH1 = 3;
export const IRQ_COUNT = 4;

export enum DmaState {
  IDLE = "IDLE",
  WAIT_REQ = "WAIT_REQ",
  REQ_SRC = "REQ_SRC",
  READ_LATCH = "READ_LATCH",
  REQ_DST = "REQ_DST",
  WRITE_COMMIT = "WRITE_COMMIT",
  UPDATE = "UPDATE",
  COMPLETE = "COMPLETE"
}

export enum BusMaster {
  NONE = "NONE",
  CPU = "CPU",
  DMA = "DMA"
}
