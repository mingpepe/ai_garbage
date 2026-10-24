#ifndef SOC_MMAP_H
#define SOC_MMAP_H

#include <stdint.h>

// ============================================================================
// Memory Regions
// ============================================================================
#define CORE0_SRAM_BASE     0x00000000UL
#define CORE0_SRAM_SIZE     0x00004000UL   // 16 KB

#define CORE1_SRAM_BASE     0x00010000UL
#define CORE1_SRAM_SIZE     0x00004000UL   // 16 KB

#define SHARED_MEM_BASE     0x10000000UL
#define SHARED_MEM_SIZE     0x00004000UL   // 16 KB

#define CLINT_BASE          0x20000000UL
#define UART_BASE           0x30000000UL
#define REGBANK_BASE        0x40000000UL
#define REPORT_BUF_WIN_BASE 0x40001000UL

// ============================================================================
// CLINT IPI & Boot Control MMIO Registers (0x2000_0000)
// ============================================================================
#define REG_MSIP_CORE0      (*(volatile uint32_t *)(CLINT_BASE + 0x00UL))
#define REG_MSIP_CORE1      (*(volatile uint32_t *)(CLINT_BASE + 0x04UL))
#define REG_IPI_MSG_0_TO_1  (*(volatile uint32_t *)(CLINT_BASE + 0x08UL))
#define REG_IPI_MSG_1_TO_0  (*(volatile uint32_t *)(CLINT_BASE + 0x0CUL))
#define REG_CORE1_BOOT_ADDR (*(volatile uint32_t *)(CLINT_BASE + 0x10UL))
#define REG_CORE1_BOOT_CTRL (*(volatile uint32_t *)(CLINT_BASE + 0x14UL))
#define REG_SIM_DONE_FLAGS  (*(volatile uint32_t *)(CLINT_BASE + 0x18UL))
#define REG_CYCLE_COUNTER   (*(volatile uint32_t *)(CLINT_BASE + 0x1CUL))

// ============================================================================
// UART & Debug Trace MMIO Registers (0x3000_0000)
// ============================================================================
#define REG_UART_TX         (*(volatile uint32_t *)(UART_BASE + 0x00UL))
#define REG_UART_STATUS     (*(volatile uint32_t *)(UART_BASE + 0x04UL))
#define REG_DBG_TRACE       (*(volatile uint32_t *)(UART_BASE + 0x08UL))

// ============================================================================
// Dual Register Bank (Bank 0 & Bank 1, size = 0x7F each) & Report Buffer
//   - Byte offset 0x00 .. 0x7E : Active Bank Registers (127 bytes per bank)
//   - Byte offset 0x7F         : Bank Switch Register (write 0=Bank0, 1=Bank1)
//   - Bank 0 offset 0x0F       : Special Port redirected to Report Buffer!
// ============================================================================
#define REG_BANK_BYTE(off)  (*(volatile uint8_t *)(REGBANK_BASE + (uint32_t)(off)))
#define REPORT_BUF_MEM(off) (*(volatile uint8_t *)(REPORT_BUF_WIN_BASE + (uint32_t)(off)))

#define REG_BANK_SIZE       0x7FU
#define REG_BANK_SEL        0x7FU   // Write 0 -> Bank 0, Write 1 -> Bank 1

// Bank 0 Register Offsets (0x00 .. 0x7E)
#define B0_DEV_ID_LO        0x00U   // 'R' (0x52)
#define B0_DEV_ID_HI        0x01U   // 'V' (0x56)
#define B0_FW_STATUS        0x02U   // Bit0=Core0 Ready, Bit1=Core1 Ready, Bit2=Spinlock Done
#define B0_HOST_CMD         0x03U   // Command written by Host
#define B0_RPT_STATUS       0x04U   // 0=Empty, 1=Report Ready (FW->Host), 2=Host Read ACK (Host->FW)
#define B0_RPT_LEN_LO       0x05U   // Report payload length in bytes (Low)
#define B0_RPT_LEN_HI       0x06U   // Report payload length in bytes (High)
#define B0_RPT_SEQ          0x07U   // Report sequence number
#define B0_RPT_CHECKSUM     0x08U   // 8-bit sum checksum of report buffer bytes
#define B0_RPT_PTR_CTRL     0x0EU   // Write 1 to reset Report Buffer read/write pointers
#define B0_RPT_DATA_PORT    0x0FU   // SPECIAL PORT: Redirected to Report Buffer (NOT a normal reg!)

// Bank 1 Register Offsets (0x00 .. 0x7E)
#define B1_CFG_MODE         0x00U   // Host configuration mode in Bank 1
#define B1_CFG_RPT_SIZE     0x01U   // Host requested report size in Bank 1
#define B1_DIAG_SPIN_CNT    0x02U   // FW diagnostic: Final spinlock shared counter
#define B1_DIAG_IPI_HOPS    0x03U   // FW diagnostic: Total IPI ping-pong hops
#define B1_SIG_BYTE0        0x10U   // 0xB1
#define B1_SIG_BYTE1        0x11U   // 0xCA
#define B1_SIG_BYTE2        0x12U   // 0xFE
#define B1_SIG_BYTE3        0x13U   // 0x01

#define REPORT_PACKET_SIZE  32U     // 32-byte block written by FW to Report Buffer

// Simulation completion flags
#define SIM_CORE0_DONE      (1UL << 0)
#define SIM_CORE1_DONE      (1UL << 1)

// Shared Spinlock test iterations per core
#define SPINLOCK_ITERATIONS_PER_CORE  5UL
#define TOTAL_EXPECTED_COUNTER        (SPINLOCK_ITERATIONS_PER_CORE * 2UL)
#define EXPECTED_IPI_PING_PONG        4UL

// ============================================================================
// Shared Memory Structure (@ 0x1000_0000)
// Note: First 4 words match Verilog debug taps (dbg_word0 .. dbg_word3)
// ============================================================================
typedef struct {
    volatile uint32_t spinlock;           // 0x1000_0000 (dbg_word0): Main spinlock (0=unlocked, 1=locked)
    volatile uint32_t shared_counter;     // 0x1000_0004 (dbg_word1): Protected shared counter
    volatile uint32_t core1_booted;       // 0x1000_0008 (dbg_word2): Core 1 boot handshake flag
    volatile uint32_t ipi_ping_pong;      // 0x1000_000C (dbg_word3): IPI ping-pong counter
    volatile uint32_t uart_lock;          // 0x1000_0010: Spinlock protecting UART console output
    volatile uint32_t core0_ipi_count;    // 0x1000_0014: Number of IPIs received by Core 0 ISR
    volatile uint32_t core1_ipi_count;    // 0x1000_0018: Number of IPIs received by Core 1 ISR
    volatile uint32_t phase_ready;        // 0x1000_001C: Synchronization phase state
    volatile uint32_t log_core_id[16];    // 0x1000_0020: Which core performed each counter update
    volatile uint32_t log_counter[16];    // 0x1000_0060: Counter value recorded at each step
} shared_mem_t;

#define SHM ((shared_mem_t *)SHARED_MEM_BASE)

#endif // SOC_MMAP_H
