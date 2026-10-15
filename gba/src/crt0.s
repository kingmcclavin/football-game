@ Pixel Pigskin - cartridge header, startup code and interrupt handler.
@ The header bytes (logo, title, checksum) are filled in by tools/gbafix.py.

    .section .crt0, "ax"
    .arm
    .align 2
    .global _start
_start:
    b       start_vector

    @ 0x04: Nintendo logo (156 bytes), patched by gbafix
    .fill   156, 1, 0
    @ 0xA0: title (12), 0xAC: game code (4), 0xB0: maker (2)
    .ascii  "PIXELPIGSKIN"
    .ascii  "PXPE"
    .ascii  "01"
    .byte   0x96            @ 0xB2 fixed value
    .byte   0x00            @ 0xB3 main unit code
    .byte   0x00            @ 0xB4 device type
    .fill   7, 1, 0         @ 0xB5 reserved
    .byte   0x00            @ 0xBC software version
    .byte   0x00            @ 0xBD header checksum (gbafix)
    .fill   2, 1, 0         @ 0xBE reserved

start_vector:
    @ IRQ mode stack
    mov     r0, #0x12
    msr     cpsr_c, r0
    ldr     sp, =__sp_irq
    @ System mode stack
    mov     r0, #0x1F
    msr     cpsr_c, r0
    ldr     sp, =__sp_usr

    @ Copy IWRAM code + data
    ldr     r0, =__iwram_lma
    ldr     r1, =__iwram_start
    ldr     r2, =__iwram_end
1:  cmp     r1, r2
    ldrlt   r3, [r0], #4
    strlt   r3, [r1], #4
    blt     1b

    @ Clear IWRAM bss
    ldr     r1, =__bss_start
    ldr     r2, =__bss_end
    mov     r3, #0
2:  cmp     r1, r2
    strlt   r3, [r1], #4
    blt     2b

    @ Copy EWRAM data
    ldr     r0, =__ewram_lma
    ldr     r1, =__ewram_start
    ldr     r2, =__ewram_end
3:  cmp     r1, r2
    ldrlt   r3, [r0], #4
    strlt   r3, [r1], #4
    blt     3b

    @ Clear EWRAM bss
    ldr     r1, =__ewbss_start
    ldr     r2, =__ewbss_end
    mov     r3, #0
4:  cmp     r1, r2
    strlt   r3, [r1], #4
    blt     4b

    @ Install the interrupt handler
    ldr     r0, =0x03007FFC
    ldr     r1, =irq_handler
    str     r1, [r0]

    ldr     r0, =main
    mov     lr, pc
    bx      r0
5:  b       5b

    .pool

@ Minimal IRQ handler (ARM, in IWRAM): acknowledge interrupts and
@ set the BIOS flags so VBlankIntrWait returns.
    .section .iwram, "ax", %progbits
    .arm
    .align 2
    .global irq_handler
irq_handler:
    mov     r0, #0x04000000
    ldr     r1, [r0, #0x200]        @ IE | (IF << 16)
    and     r1, r1, r1, lsr #16     @ IE & IF
    add     r2, r0, #0x200
    strh    r1, [r2, #2]            @ acknowledge IF
    ldrh    r3, [r0, #-8]           @ BIOS IF at 0x03007FF8 (mirror)
    orr     r3, r3, r1
    strh    r3, [r0, #-8]
    bx      lr
