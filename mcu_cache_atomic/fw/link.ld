OUTPUT_ARCH("riscv")
ENTRY(_start)

MEMORY
{
    ROM (rx)  : ORIGIN = 0x00000000, LENGTH = 4K
    SHM (rw)  : ORIGIN = 0x00001000, LENGTH = 4K
}

SECTIONS
{
    .text 0x00000000 : {
        KEEP(*(.text.init))
        *(.text*)
        *(.rodata*)
    } > ROM

    .data 0x00001000 : {
        *(.data*)
        *(.sdata*)
        *(.bss*)
        *(.sbss*)
        *(COMMON)
    } > SHM
}
