OUTPUT_ARCH("riscv")
ENTRY(_start)

MEMORY
{
    SRAM0 (rwx) : ORIGIN = 0x00000000, LENGTH = 16K
}

SECTIONS
{
    . = 0x00000000;

    .text : ALIGN(4)
    {
        KEEP(*(.text.init))
        *(.text*)
        *(.rodata*)
    } > SRAM0

    .data : ALIGN(4)
    {
        *(.data*)
        *(.sdata*)
    } > SRAM0

    .bss : ALIGN(4)
    {
        __bss_start = .;
        *(.bss*)
        *(.sbss*)
        *(COMMON)
        __bss_end = .;
    } > SRAM0

    _stack_top = ORIGIN(SRAM0) + LENGTH(SRAM0);
}
