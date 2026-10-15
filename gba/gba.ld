/* Linker script for Pixel Pigskin (Game Boy Advance, cartridge boot). */
OUTPUT_FORMAT("elf32-littlearm", "elf32-bigarm", "elf32-littlearm")
OUTPUT_ARCH(arm)
ENTRY(_start)

MEMORY {
    rom   : ORIGIN = 0x08000000, LENGTH = 32M
    iwram : ORIGIN = 0x03000000, LENGTH = 32K
    ewram : ORIGIN = 0x02000000, LENGTH = 256K
}

__sp_irq = 0x03007FA0;
__sp_usr = 0x03007F00;

SECTIONS
{
    .text : {
        KEEP(*(.crt0))
        *(.text .text.* .gnu.linkonce.t.*)
        *(.glue_7 .glue_7t)
        . = ALIGN(4);
    } > rom

    .rodata : {
        *(.rodata .rodata.* .gnu.linkonce.r.*)
        . = ALIGN(4);
    } > rom

    .ARM.exidx : {
        *(.ARM.exidx* .gnu.linkonce.armexidx.*)
        . = ALIGN(4);
    } > rom

    /* Fast code (ISR) and initialised data live in IWRAM, copied by crt0. */
    .iwram : {
        __iwram_start = .;
        *(.iwram .iwram.*)
        *(.data .data.* .gnu.linkonce.d.*)
        . = ALIGN(4);
        __iwram_end = .;
    } > iwram AT > rom
    __iwram_lma = LOADADDR(.iwram);

    .bss (NOLOAD) : {
        __bss_start = .;
        *(.bss .bss.* .gnu.linkonce.b.*)
        *(COMMON)
        . = ALIGN(4);
        __bss_end = .;
    } > iwram

    /* Large, rarely-touched data (career, maps) lives in EWRAM. */
    .ewram : {
        __ewram_start = .;
        *(.ewram .ewram.*)
        . = ALIGN(4);
        __ewram_end = .;
    } > ewram AT > rom
    __ewram_lma = LOADADDR(.ewram);

    .ewram_bss (NOLOAD) : {
        __ewbss_start = .;
        *(.ewram_bss .ewram_bss.*)
        . = ALIGN(4);
        __ewbss_end = .;
    } > ewram

    __rom_end = __ewram_lma + SIZEOF(.ewram);
    end = __ewbss_end;

    /DISCARD/ : { *(.note.*) *(.comment) }
}
