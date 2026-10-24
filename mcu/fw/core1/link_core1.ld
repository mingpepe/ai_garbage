OUTPUT_ARCH("riscv")
ENTRY(_start)

MEMORY
{
    SRAM1 (rwx) : ORIGIN = 0x00010000, LENGTH = 16K
}

SECTIONS
{
    . = 0x00010000;

    .text : ALIGN(4)
    {
        KEEP(*(.text.init))
        *(.text*)
        *(.rodata*)
    } > SRAM1

    .data : ALIGN(4)
    {
        *(.data*)
        *(.sdata*)
    } > SRAM1

    .bss : ALIGN(4)
    {
        __bss_start = .;
        *(.bss*)
        *(.sbss*)
        *(COMMON)
        __bss_end = .;
    } > SRAM1

    _stack_top = ORIGIN(SRAM1) + LENGTH(SRAM1);
}
