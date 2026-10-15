/* Stack-smashing protection and fatal error screen. If memory corruption
 * is ever detected the game stops with a message instead of misbehaving. */
#include "gba.h"
#include "gfx.h"

u32 __stack_chk_guard = 0x5E7A61C3u;

static void panic_print(int x, int y, const char *s)
{
    volatile u16 *m = SCREENBLOCK(27);
    while (*s && x < 30)
        m[y * 32 + x++] = (u16)(*s++ | (PAL_RED << 12));
}

__attribute__((noreturn)) void game_panic(const char *msg)
{
    REG_IME = 0;
    REG_DISPCNT = DCNT_MODE0 | DCNT_BG0;
    REG_BG0HOFS = 0;
    REG_BG0VOFS = 0;
    REG_BLDCNT = 0;
    MEM_PAL_BG[0] = RGB15(4, 0, 0);
    volatile u16 *m = SCREENBLOCK(27);
    for (int i = 0; i < 32 * 20; i++)
        m[i] = 0;
    panic_print(1, 6, "PIXEL PIGSKIN STOPPED");
    panic_print(1, 8, msg);
    panic_print(1, 10, "PLEASE RESET THE GAME.");
    panic_print(1, 11, "YOUR LAST SAVE IS SAFE.");
    for (;;)
        ;
}

__attribute__((noreturn)) void __stack_chk_fail(void)
{
    game_panic("ERROR: STACK CORRUPTION");
}
