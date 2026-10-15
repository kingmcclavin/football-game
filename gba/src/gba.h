/* Minimal Game Boy Advance hardware definitions (no external library). */
#ifndef GBA_H
#define GBA_H

#include "types.h"

#define REG8(a) (*(volatile u8 *)(a))
#define REG16(a) (*(volatile u16 *)(a))
#define REG32(a) (*(volatile u32 *)(a))

/* Display */
#define REG_DISPCNT REG16(0x04000000)
#define REG_DISPSTAT REG16(0x04000004)
#define REG_VCOUNT REG16(0x04000006)
#define REG_BG0CNT REG16(0x04000008)
#define REG_BG1CNT REG16(0x0400000A)
#define REG_BG2CNT REG16(0x0400000C)
#define REG_BG3CNT REG16(0x0400000E)
#define REG_BG0HOFS REG16(0x04000010)
#define REG_BG0VOFS REG16(0x04000012)
#define REG_BG1HOFS REG16(0x04000014)
#define REG_BG1VOFS REG16(0x04000016)
#define REG_BG2HOFS REG16(0x04000018)
#define REG_BG2VOFS REG16(0x0400001A)
#define REG_BG3HOFS REG16(0x0400001C)
#define REG_BG3VOFS REG16(0x0400001E)
#define REG_WIN0H REG16(0x04000040)
#define REG_WIN0V REG16(0x04000044)
#define REG_WININ REG16(0x04000048)
#define REG_WINOUT REG16(0x0400004A)
#define REG_BLDCNT REG16(0x04000050)
#define REG_BLDALPHA REG16(0x04000052)
#define REG_BLDY REG16(0x04000054)

#define DCNT_MODE0 0x0000
#define DCNT_OBJ_1D 0x0040
#define DCNT_BLANK 0x0080
#define DCNT_BG0 0x0100
#define DCNT_BG1 0x0200
#define DCNT_BG2 0x0400
#define DCNT_BG3 0x0800
#define DCNT_OBJ 0x1000

#define DSTAT_VBL_IRQ 0x0008

#define BG_PRIO(n) (n)
#define BG_CBB(n) ((n) << 2)
#define BG_4BPP 0
#define BG_SBB(n) ((n) << 8)
#define BG_SIZE_32x32 0x0000
#define BG_SIZE_64x32 0x4000

/* Sound */
#define REG_SOUND1CNT_L REG16(0x04000060)
#define REG_SOUND1CNT_H REG16(0x04000062)
#define REG_SOUND1CNT_X REG16(0x04000064)
#define REG_SOUND2CNT_L REG16(0x04000068)
#define REG_SOUND2CNT_H REG16(0x0400006C)
#define REG_SOUND3CNT_L REG16(0x04000070)
#define REG_SOUND3CNT_H REG16(0x04000072)
#define REG_SOUND3CNT_X REG16(0x04000074)
#define REG_SOUND4CNT_L REG16(0x04000078)
#define REG_SOUND4CNT_H REG16(0x0400007C)
#define REG_SOUNDCNT_L REG16(0x04000080)
#define REG_SOUNDCNT_H REG16(0x04000082)
#define REG_SOUNDCNT_X REG16(0x04000084)
#define REG_SOUNDBIAS REG16(0x04000088)
#define REG_WAVE_RAM ((volatile u32 *)0x04000090)

/* Keys */
#define REG_KEYINPUT REG16(0x04000130)
#define KEY_A 0x0001
#define KEY_B 0x0002
#define KEY_SELECT 0x0004
#define KEY_START 0x0008
#define KEY_RIGHT 0x0010
#define KEY_LEFT 0x0020
#define KEY_UP 0x0040
#define KEY_DOWN 0x0080
#define KEY_R 0x0100
#define KEY_L 0x0200
#define KEY_MASK 0x03FF

/* Interrupts / system */
#define REG_IE REG16(0x04000200)
#define REG_IF REG16(0x04000202)
#define REG_WAITCNT REG16(0x04000204)
#define REG_IME REG16(0x04000208)
#define IRQ_VBLANK 0x0001

/* Timers */
#define REG_TM0CNT_L REG16(0x04000100)
#define REG_TM0CNT_H REG16(0x04000102)

/* Memory */
#define MEM_PAL_BG ((volatile u16 *)0x05000000)
#define MEM_PAL_OBJ ((volatile u16 *)0x05000200)
#define MEM_VRAM ((volatile u16 *)0x06000000)
#define MEM_OBJ_TILES ((volatile u32 *)0x06010000)
#define MEM_OAM ((volatile u16 *)0x07000000)
#define MEM_SRAM ((volatile u8 *)0x0E000000)

#define CHARBLOCK(n) ((volatile u32 *)(0x06000000 + (n) * 0x4000))
#define SCREENBLOCK(n) ((volatile u16 *)(0x06000000 + (n) * 0x800))

#define RGB15(r, g, b) ((u16)((r) | ((g) << 5) | ((b) << 10)))

/* OAM attribute bits */
#define ATTR0_Y(y) ((y) & 0xFF)
#define ATTR0_HIDE 0x0200
#define ATTR0_BLEND 0x0400
#define ATTR0_SQUARE 0x0000
#define ATTR0_WIDE 0x4000
#define ATTR0_TALL 0x8000
#define ATTR1_X(x) ((x) & 0x1FF)
#define ATTR1_HFLIP 0x1000
#define ATTR1_VFLIP 0x2000
#define ATTR1_SIZE(n) ((n) << 14)
#define ATTR2_TILE(n) ((n) & 0x3FF)
#define ATTR2_PRIO(n) ((n) << 10)
#define ATTR2_PAL(n) ((n) << 12)

static inline void vblank_intr_wait(void)
{
#ifndef HOST_BUILD
    __asm__ volatile("swi 0x05" ::: "r0", "r1", "r2", "r3", "memory");
#endif
}

#endif
